#!/usr/bin/env node
/**
 * Safe one-time watermark backfill for already-saved product images.
 *
 * Reproduces EXACTLY the watermark the app applies to new uploads
 * (item-details.service.ts: tiled "Purbanchal Papers & Works" / "9864114007"
 * at -30°, fill-opacity 0.15, webp quality 75).
 *
 * ─────────────────────────  SAFETY GUARANTEES  ─────────────────────────
 *  1. DRY-RUN BY DEFAULT. Without `--apply` it only reports what it WOULD do
 *     and writes nothing.
 *  2. BACKUP BEFORE OVERWRITE. Before replacing any image, the untouched
 *     original is copied to  uploads/items/_backup_originals/<key>  in the same
 *     bucket. Nothing is ever lost — you can restore any image from there.
 *  3. IDEMPOTENT. Images already tagged x-amz-meta-watermarked=1 are skipped,
 *     so re-running never double-stamps.
 *  4. OUTPUT VALIDATION. The watermarked buffer is re-decoded and checked to be
 *     a valid non-empty webp before it is uploaded. If processing fails, the
 *     original is left exactly as-is.
 *  5. NO DELETES, EVER. The script only ever copies and puts objects.
 *  6. SCOPED. Only touches uploads/items/*.webp (skips videos, backups, others).
 *
 * Usage (from repo root or anywhere):
 *   node scripts/watermark-backfill.js                 # dry run (safe preview)
 *   node scripts/watermark-backfill.js --apply         # actually stamp images
 *   node scripts/watermark-backfill.js --apply --limit 50   # stamp first 50 only
 *
 * Requires AWS credentials in the environment (same creds the AWS CLI uses) and
 * the bucket name. Reads from backend/.env if present, else from env vars:
 *   S3_BUCKET_NAME (default abs-ppw-media), AWS_REGION (default ap-south-1)
 *
 * sharp + @aws-sdk/client-s3 are resolved from backend/node_modules.
 */

const path = require('path');
const fs = require('fs');

// Resolve deps from the backend's node_modules (where they're installed).
const BACKEND = path.resolve(__dirname, '..', 'backend');
const req = (m) => require(path.join(BACKEND, 'node_modules', m));
const sharp = req('sharp');
const {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
} = req('@aws-sdk/client-s3');

// ── config ──────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(BACKEND, '.env');
  const out = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) out[m[1]] = m[2];
    }
  }
  return out;
}
const fileEnv = loadEnv();
const BUCKET = process.env.S3_BUCKET_NAME || fileEnv.S3_BUCKET_NAME || 'abs-ppw-media';
const REGION = process.env.AWS_REGION || fileEnv.AWS_REGION || 'ap-south-1';

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

const PREFIX = 'uploads/items/';
const BACKUP_PREFIX = 'uploads/items/_backup_originals/';

const WATERMARK_LINE1 = 'Purbanchal Papers & Works';
const WATERMARK_LINE2 = '9864114007';

const s3 = new S3Client({ region: REGION });

// ── watermark (verbatim port of the service) ────────────────────────────────
function escapeXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
function buildWatermarkSvg(width, height) {
  const line1 = escapeXml(WATERMARK_LINE1);
  const line2 = escapeXml(WATERMARK_LINE2);
  const stepX = Math.max(140, Math.round(width / 3));
  const stepY = Math.max(90, Math.round(height / 4));
  const fontSize = Math.max(11, Math.round(width / 38));
  const tiles = [];
  for (let y = -stepY; y < height + stepY; y += stepY) {
    for (let x = -stepX; x < width + stepX; x += stepX) {
      tiles.push(
        `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#000000" fill-opacity="0.15" text-anchor="middle" transform="rotate(-30 ${x} ${y})">` +
          `<tspan x="${x}" dy="0">${line1}</tspan>` +
          `<tspan x="${x}" dy="${fontSize + 3}">${line2}</tspan>` +
          `</text>`,
      );
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    tiles.join('') +
    `</svg>`;
  return Buffer.from(svg);
}
async function applyWatermark(buffer) {
  const img = sharp(buffer);
  const meta = await img.metadata();
  const width = meta.width || 800;
  const height = meta.height || 800;
  const overlay = buildWatermarkSvg(width, height);
  return img
    .composite([{ input: overlay, top: 0, left: 0 }])
    .webp({ quality: 75 })
    .toBuffer();
}

// ── helpers ─────────────────────────────────────────────────────────────────
const isImageKey = (key) =>
  key.endsWith('.webp') &&
  !key.includes('/videos/') &&
  !key.startsWith(BACKUP_PREFIX); // never reprocess our own backups

async function streamToBuffer(body) {
  const chunks = [];
  for await (const c of body) chunks.push(c);
  return Buffer.concat(chunks);
}

// ── main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log('────────────────────────────────────────────────────────');
  console.log(' Watermark backfill');
  console.log('  bucket :', BUCKET, '| region:', REGION);
  console.log('  mode   :', APPLY ? 'APPLY (will write)' : 'DRY RUN (no writes)');
  if (LIMIT !== Infinity) console.log('  limit  :', LIMIT);
  console.log('  backups:', `s3://${BUCKET}/${BACKUP_PREFIX}`);
  console.log('────────────────────────────────────────────────────────');

  let scanned = 0, stamped = 0, skipped = 0, failed = 0, wouldStamp = 0;
  let token;

  outer:
  do {
    const list = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX, ContinuationToken: token }),
    );
    for (const obj of list.Contents || []) {
      const key = obj.Key;
      if (!key || !isImageKey(key)) continue;
      if (stamped + wouldStamp >= LIMIT) break outer;
      scanned++;

      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
        if (head.Metadata && head.Metadata.watermarked === '1') {
          skipped++;
          continue;
        }

        if (!APPLY) {
          wouldStamp++;
          if (wouldStamp <= 10) console.log('  would stamp:', key);
          continue;
        }

        // 1) fetch original
        const got = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
        const original = await streamToBuffer(got.Body);

        // 2) produce watermarked + VALIDATE before any write
        const marked = await applyWatermark(original);
        const check = await sharp(marked).metadata();
        if (!marked.length || !check.width || !check.height) {
          throw new Error('watermarked output failed validation');
        }

        // 3) BACKUP the untouched original first (skip if a backup already exists)
        const backupKey = BACKUP_PREFIX + key.slice(PREFIX.length);
        let backupExists = false;
        try {
          await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: backupKey }));
          backupExists = true;
        } catch (_) { /* not found → we'll create it */ }
        if (!backupExists) {
          await s3.send(
            new CopyObjectCommand({
              Bucket: BUCKET,
              CopySource: `/${BUCKET}/${encodeURIComponent(key)}`,
              Key: backupKey,
              MetadataDirective: 'COPY',
            }),
          );
        }

        // 4) overwrite with the watermarked version, tagged so we never redo it
        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: marked,
            ContentType: 'image/webp',
            Metadata: { watermarked: '1' },
          }),
        );
        stamped++;
        if (stamped % 25 === 0) console.log(`  ...stamped ${stamped} so far`);
      } catch (err) {
        failed++;
        console.warn('  FAILED (left untouched):', key, '->', err.message);
      }
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);

  console.log('────────────────────────────────────────────────────────');
  console.log(' Done.');
  console.log('  scanned        :', scanned);
  console.log('  already stamped:', skipped, '(skipped)');
  if (APPLY) {
    console.log('  newly stamped  :', stamped);
    console.log('  failed         :', failed, failed ? '(originals untouched)' : '');
    console.log(`  originals backed up under s3://${BUCKET}/${BACKUP_PREFIX}`);
  } else {
    console.log('  would stamp    :', wouldStamp, '(DRY RUN — nothing written)');
    console.log('  re-run with  --apply  to perform the update.');
  }
  console.log('────────────────────────────────────────────────────────');
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
