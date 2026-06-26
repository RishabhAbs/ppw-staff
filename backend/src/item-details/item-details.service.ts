import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request, Response } from 'express';
import { Readable } from 'stream';
import { ItemDetail } from '../entities/item-detail.entity';
import { ItemMedia } from '../entities/item-media.entity';
import { StockItem } from '../entities/stock-item.entity';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
// Use require-style import: `sharp` is CommonJS and esModuleInterop is OFF in
// tsconfig, so `import sharp from 'sharp'` compiles to sharp_1.default which is
// undefined at runtime (TypeError: sharp_1.default is not a function).
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sharp = require('sharp');
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpeg = require('fluent-ffmpeg');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

@Injectable()
export class ItemDetailsService {
  private readonly logger = new Logger(ItemDetailsService.name);
  private s3: S3Client;
  private bucket: string;
  private region: string;
  private tmpDir: string;
  private localMediaRoot: string;

  constructor(
    @InjectRepository(ItemDetail)
    private detailRepo: Repository<ItemDetail>,
    @InjectRepository(ItemMedia)
    private mediaRepo: Repository<ItemMedia>,
    @InjectRepository(StockItem)
    private stockItemRepo: Repository<StockItem>,
  ) {
    this.region = process.env.AWS_REGION || 'ap-south-1';
    this.bucket = process.env.S3_BUCKET_NAME || '';
    if (!this.bucket) {
      this.logger.error(
        'S3_BUCKET_NAME is not set — uploads will fail. Set the env var on Elastic Beanstalk.',
      );
    }
    this.s3 = new S3Client({ region: this.region });
    // Transcode scratch dir lives on the OS temp path, NOT the app/deploy
    // volume root — writing 500MB videos to process.cwd() filled the 8GB disk.
    this.tmpDir = path.join(os.tmpdir(), 'ppw-video-tmp');
    if (!fs.existsSync(this.tmpDir)) fs.mkdirSync(this.tmpDir, { recursive: true });
    // Recover disk from any scratch files stranded by a previous crash/OOM.
    this.cleanupTmpDir(0);
    this.localMediaRoot = path.join(process.cwd(), 'public');
  }

  /**
   * Removes ffmpeg transcode scratch files (names starting "in_" or "out_")
   * from tmpDir older than maxAgeMs. SAFETY: only ever touches this.tmpDir
   * scratch files — NEVER the uploaded images/videos, which live in S3 and are
   * never written to this path.
   */
  private cleanupTmpDir(maxAgeMs: number): void {
    try {
      const now = Date.now();
      for (const f of fs.readdirSync(this.tmpDir)) {
        if (!/^(in|out)_/.test(f)) continue; // only our own scratch files
        const fp = path.join(this.tmpDir, f);
        try {
          const st = fs.statSync(fp);
          if (st.isFile() && now - st.mtimeMs >= maxAgeMs) fs.unlinkSync(fp);
        } catch {
          /* ignore individual file errors */
        }
      }
    } catch (err: any) {
      this.logger.warn(`Video temp cleanup failed: ${err?.message || err}`);
    }
  }

  // Hourly safety net: purge transcode scratch left by killed/aborted requests.
  @Cron(CronExpression.EVERY_HOUR)
  purgeStaleVideoTemp(): void {
    this.cleanupTmpDir(60 * 60 * 1000);
  }

  private s3Key(urlName: string, slot: string): string {
    return slot.startsWith('vid')
      ? `uploads/items/videos/${urlName}.webm`
      : `uploads/items/${urlName}.webp`;
  }

  private mediaProxyPath(urlName: string, slot: string): string {
    return slot.startsWith('vid')
      ? `/api/media/items/videos/${urlName}.webm`
      : `/api/media/items/${urlName}.webp`;
  }

  private buildMediaUrl(baseUrl: string | undefined, urlName: string, slot: string): string {
    const proxyPath = this.mediaProxyPath(urlName, slot);
    // Prefer an explicitly configured public origin (needed by the Capacitor
    // mobile app, which has no same-origin proxy). The request-derived host is
    // unreliable behind nginx — `proxy_set_header Host $host` drops the port,
    // producing e.g. http://localhost/... (port 80) which refuses the
    // connection. For the web app a RELATIVE path is correct: the browser
    // resolves it against the page origin and nginx proxies /api to the backend.
    const explicit = (process.env.BACKEND_PUBLIC_URL || '').replace(/\/$/, '');
    return explicit ? `${explicit}${proxyPath}` : proxyPath;
  }

  async getDetails(masterid: string, baseUrl?: string) {
    const detail = await this.detailRepo.findOne({ where: { masterid } });
    const rawMedia = await this.mediaRepo.find({
      where: { masterid },
      order: { slot: 'ASC' },
    });
    const media = rawMedia.map((m) => ({
      ...m,
      url: this.buildMediaUrl(baseUrl, m.url_name, m.slot),
    }));
    return { detail, media };
  }

  async streamMedia(
    s3Key: string,
    res: Response,
    contentType: string,
    req?: Request,
  ): Promise<void> {
    if (this.bucket) {
      try {
        const obj = await this.s3.send(
          new GetObjectCommand({ Bucket: this.bucket, Key: s3Key }),
        );
        res.setHeader('Content-Type', obj.ContentType || contentType);
        // Filenames are reused across re-uploads, so the URL alone can't be
        // trusted as immutable. Require the browser to revalidate via ETag so a
        // replaced image is fetched fresh instead of served stale from cache.
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        if (obj.ContentLength) {
          res.setHeader('Content-Length', String(obj.ContentLength));
        }
        if (obj.ETag) res.setHeader('ETag', obj.ETag);
        if (obj.LastModified) {
          res.setHeader('Last-Modified', obj.LastModified.toUTCString());
        }
        if (obj.Body instanceof Readable) {
          obj.Body.pipe(res);
          return;
        }
      } catch (err: any) {
        const code = err?.name || err?.Code;
        if (code !== 'NoSuchKey' && code !== 'NotFound' && code !== 'AccessDenied') {
          this.logger.warn(`S3 stream failed for ${s3Key}: ${err?.message || err}`);
        }
      }
    }

    const localPath = path.join(this.localMediaRoot, s3Key);
    if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
      const stat = fs.statSync(localPath);
      // Reused filenames → must revalidate. The ETag is derived from the file's
      // size + mtime, so re-uploading a new image (different bytes/time) yields
      // a new ETag and the browser fetches the fresh image instead of a stale
      // cached copy. Honour conditional requests with a 304 when unchanged.
      const etag = `"${stat.size}-${stat.mtimeMs}"`;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', stat.mtime.toUTCString());
      if (req?.headers['if-none-match'] === etag) {
        res.status(304).end();
        return;
      }
      res.setHeader('Content-Length', String(stat.size));
      fs.createReadStream(localPath).pipe(res);
      return;
    }

    res.status(404).send('Media not found');
  }

  // Watermark text shown tiled/diagonally across every product image.
  private static readonly WATERMARK_LINE1 = 'Purbanchal Papers & Works';
  private static readonly WATERMARK_LINE2 = '9864114007';

  /**
   * Build an SVG of the given size filled with the watermark text repeated on a
   * diagonal grid (subtle, ~15% opacity) — mirrors the look in the reference
   * screenshot. Returned as a Buffer ready for sharp.composite().
   */
  // Escape text for safe embedding inside the SVG markup. Without this, an
  // ampersand in the shop name (e.g. "Papers & Works") is an invalid XML
  // entity and sharp/librsvg rejects the whole overlay — breaking uploads.
  private escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private buildWatermarkSvg(width: number, height: number): Buffer {
    const line1 = this.escapeXml(ItemDetailsService.WATERMARK_LINE1);
    const line2 = this.escapeXml(ItemDetailsService.WATERMARK_LINE2);
    // Tile spacing scales with image size so density looks consistent.
    const stepX = Math.max(140, Math.round(width / 3));
    const stepY = Math.max(90, Math.round(height / 4));
    const fontSize = Math.max(11, Math.round(width / 38));
    const tiles: string[] = [];
    // Over-scan the grid (start negative, end past edges) so the rotated text
    // still covers the corners after the -30° rotation.
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

  /**
   * Composite the tiled text watermark onto an already-decoded image buffer.
   * Reads the image's real dimensions so the tile grid matches the output.
   */
  async applyWatermark(buffer: Buffer): Promise<Buffer> {
    const img = sharp(buffer);
    const meta = await img.metadata();
    const width = meta.width || 800;
    const height = meta.height || 800;
    const overlay = this.buildWatermarkSvg(width, height);
    return img
      .composite([{ input: overlay, top: 0, left: 0 }])
      .webp({ quality: 75 })
      .toBuffer();
  }

  private async compressImage(buffer: Buffer): Promise<Buffer> {
    const resized = await sharp(buffer)
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    // Stamp every newly-saved product image with the tiled watermark.
    return this.applyWatermark(resized);
  }

  /**
   * One-time backfill: watermark every product image already in storage that
   * hasn't been stamped yet. Idempotent — each object is tagged with
   * `x-amz-meta-watermarked=1` (S3) or a sidecar marker (local), so re-running
   * never double-stamps. Called once at boot from main.ts.
   *
   * Only touches image keys under uploads/items/ ending in .webp; videos and
   * everything else are skipped.
   */
  async backfillWatermarks(): Promise<{ scanned: number; stamped: number; skipped: number }> {
    const prefix = 'uploads/items/';
    let scanned = 0;
    let stamped = 0;
    let skipped = 0;

    const isImageKey = (key: string) =>
      key.endsWith('.webp') && !key.includes('/videos/');

    if (this.bucket) {
      let continuationToken: string | undefined;
      do {
        const list = await this.s3.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        for (const obj of list.Contents || []) {
          const key = obj.Key;
          if (!key || !isImageKey(key)) continue;
          scanned++;
          try {
            // Already stamped? skip.
            const head = await this.s3.send(
              new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
            );
            if (head.Metadata?.watermarked === '1') {
              skipped++;
              continue;
            }
            const got = await this.s3.send(
              new GetObjectCommand({ Bucket: this.bucket, Key: key }),
            );
            const body = got.Body as Readable;
            const chunks: Buffer[] = [];
            for await (const c of body) chunks.push(c as Buffer);
            const original = Buffer.concat(chunks);
            const marked = await this.applyWatermark(original);
            await this.s3.send(
              new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: marked,
                ContentType: 'image/webp',
                Metadata: { watermarked: '1' },
              }),
            );
            stamped++;
          } catch (err: any) {
            this.logger.warn(
              `Watermark backfill failed for ${key}: ${err?.message || err}`,
            );
          }
        }
        continuationToken = list.IsTruncated
          ? list.NextContinuationToken
          : undefined;
      } while (continuationToken);
    } else {
      // Local (no-S3) fallback: walk public/uploads/items, use a sidecar
      // ".wm" marker file alongside each image to record that it's been stamped.
      const dir = path.join(this.localMediaRoot, prefix);
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
          if (!isImageKey(`${prefix}${f}`)) continue;
          scanned++;
          const filePath = path.join(dir, f);
          const marker = `${filePath}.wm`;
          try {
            if (fs.existsSync(marker)) {
              skipped++;
              continue;
            }
            const original = fs.readFileSync(filePath);
            const marked = await this.applyWatermark(original);
            fs.writeFileSync(filePath, marked);
            fs.writeFileSync(marker, '1');
            stamped++;
          } catch (err: any) {
            this.logger.warn(
              `Watermark backfill failed for ${filePath}: ${err?.message || err}`,
            );
          }
        }
      }
    }

    this.logger.log(
      `Watermark backfill complete: scanned=${scanned} stamped=${stamped} skipped=${skipped}`,
    );
    return { scanned, stamped, skipped };
  }

  private compressVideo(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libvpx-vp9')
        .audioCodec('libopus')
        .audioBitrate('64k')
        .outputOptions(['-crf 33', '-b:v 0', '-vf scale=480:-2', '-deadline realtime', '-cpu-used 4'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });
  }

  // Writes media either to S3 (when a bucket is configured) or to the local
  // public/ folder (local dev / no-S3 deployments). streamMedia already reads
  // from the same local path, so both paths stay consistent.
  private async putMedia(key: string, body: Buffer | fs.ReadStream, contentType: string): Promise<void> {
    if (this.bucket) {
      await this.s3.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })).catch((err) => {
        console.error(`S3 upload failed for key=${key}:`, err?.message || err);
        throw err;
      });
      return;
    }
    const localPath = path.join(this.localMediaRoot, key);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    if (Buffer.isBuffer(body)) {
      fs.writeFileSync(localPath, body);
    } else {
      await new Promise<void>((resolve, reject) => {
        const out = fs.createWriteStream(localPath);
        body.pipe(out);
        out.on('finish', () => resolve());
        out.on('error', reject);
      });
    }
  }

  private async deleteFromS3(urlName: string, slot: string): Promise<void> {
    const key = this.s3Key(urlName, slot);
    if (!this.bucket) {
      try {
        const localPath = path.join(this.localMediaRoot, key);
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      } catch { /* ignore missing */ }
      return;
    }
    try {
      await this.s3.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
    } catch { /* ignore missing */ }
  }

  async saveDetails(
    masterid: string,
    description: string,
    userId: number,
    mediaFiles: { slot: string; file: Express.Multer.File }[],
    removedSlots: string[],
    name?: string,
    baseUrl?: string,
  ) {
    if (name) {
      await this.stockItemRepo.update({ masterid }, { name });
    }

    let detail = await this.detailRepo.findOne({ where: { masterid } });
    if (detail) {
      detail.description = description;
      detail.updated_by = userId;
    } else {
      detail = this.detailRepo.create({ masterid, description, updated_by: userId });
    }
    await this.detailRepo.save(detail);

    for (const slot of removedSlots) {
      await this.deleteMedia(masterid, slot);
    }

    const stockItem = await this.stockItemRepo.findOne({ where: { masterid } });
    const nameCode = stockItem?.name?.match(/^(\S+)/)?.[1];
    const code = stockItem?.ats_barcode || nameCode || masterid;

    // Process each media file in isolation. One bad file (e.g. a HEIC photo
    // sharp can't decode, or a corrupt frame) must NOT abort the whole save —
    // previously a single failure threw out of the loop, so the images that
    // came after it were silently dropped and the client only saw a generic
    // "Failed to save". Now we collect per-slot failures and report them.
    const failedSlots: { slot: string; reason: string }[] = [];

    for (const { slot, file } of mediaFiles) {
      try {
        const existing = await this.mediaRepo.findOne({ where: { masterid, slot } });

        const urlName = `${code}${slot}`;
        const key = this.s3Key(urlName, slot);

        if (slot.startsWith('vid')) {
          // Unique names so concurrent uploads can never collide (two Date.now()
          // calls in the same millisecond previously could clobber each other).
          const id = randomUUID();
          const tempIn = path.join(this.tmpDir, `in_${id}.webm`);
          const tempOut = path.join(this.tmpDir, `out_${id}.webm`);
          try {
            fs.writeFileSync(tempIn, file.buffer);
            await this.compressVideo(tempIn, tempOut);
            // Stream the compressed file straight to S3 instead of reading it back
            // into a Buffer — avoids the extra memory that triggered OOM kills
            // (which skipped cleanup and left scratch files filling the disk).
            await this.putMedia(key, fs.createReadStream(tempOut), 'video/webm');
          } finally {
            // Always remove scratch files, even on error. The boot sweep + hourly
            // cron above are the backstop for hard kills where this can't run.
            try { if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn); } catch { /* ignore */ }
            try { if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); } catch { /* ignore */ }
          }
        } else {
          const compressed = await this.compressImage(file.buffer);
          await this.putMedia(key, compressed, 'image/webp');
        }

        // Only after the new file is safely stored do we drop the old one and
        // record the new row — so a mid-process failure never deletes the
        // previously-saved media or leaves a dangling DB row.
        if (existing) {
          await this.deleteFromS3(existing.url_name, slot);
          await this.mediaRepo.remove(existing);
        }

        const type = slot.startsWith('vid') ? 'video' : 'image';
        await this.mediaRepo.save(
          this.mediaRepo.create({ masterid, slot, type, url_name: urlName, uploaded_by: userId }),
        );
      } catch (err: any) {
        const reason = err?.message || String(err);
        this.logger.error(`Failed to save media for slot ${slot} (item ${masterid}): ${reason}`);
        failedSlots.push({ slot, reason });
      }
    }

    const details = await this.getDetails(masterid, baseUrl);
    if (failedSlots.length > 0) {
      // Surface a precise, actionable error naming the slot(s) that failed while
      // still having persisted everything that succeeded.
      const labels = failedSlots
        .map((f) => f.slot.replace(/^img/, 'image ').replace(/^vid/, 'video '))
        .join(', ');
      throw new UnprocessableEntityException({
        message: `Some files could not be processed (${labels}). They are likely in an unsupported format (e.g. HEIC) — please re-save them as JPEG and upload again. Other changes were saved.`,
        failedSlots,
        details,
      });
    }
    return details;
  }

  async deleteMedia(masterid: string, slot: string) {
    const existing = await this.mediaRepo.findOne({ where: { masterid, slot } });
    if (existing) {
      await this.deleteFromS3(existing.url_name, slot);
      await this.mediaRepo.remove(existing);
    }
    return { success: true };
  }
}
