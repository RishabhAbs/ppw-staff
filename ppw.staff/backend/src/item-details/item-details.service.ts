import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { Readable } from 'stream';
import { ItemDetail } from '../entities/item-detail.entity';
import { ItemMedia } from '../entities/item-media.entity';
import { StockItem } from '../entities/stock-item.entity';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import sharp from 'sharp';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
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
    const explicit = (process.env.BACKEND_PUBLIC_URL || '').replace(/\/$/, '');
    const base = (baseUrl || explicit || '').replace(/\/$/, '');
    return base ? `${base}${proxyPath}` : proxyPath;
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
  ): Promise<void> {
    if (this.bucket) {
      try {
        const obj = await this.s3.send(
          new GetObjectCommand({ Bucket: this.bucket, Key: s3Key }),
        );
        res.setHeader('Content-Type', obj.ContentType || contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        if (obj.ContentLength) {
          res.setHeader('Content-Length', String(obj.ContentLength));
        }
        if (obj.ETag) res.setHeader('ETag', obj.ETag);
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
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
      res.setHeader('Content-Length', String(fs.statSync(localPath).size));
      fs.createReadStream(localPath).pipe(res);
      return;
    }

    res.status(404).send('Media not found');
  }

  private async compressImage(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
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

  private async deleteFromS3(urlName: string, slot: string): Promise<void> {
    try {
      await this.s3.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.s3Key(urlName, slot),
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
    const rawCode = stockItem?.ats_barcode || nameCode || masterid;
    // Sanitize to a URL/file-safe slug. media.controller rejects anything not matching
    // /^[\w.\-]+$/, so items whose barcode/name contain spaces or symbols (e.g. "10/-")
    // would otherwise produce an unservable key and silently fail to display.
    const code = String(rawCode).replace(/[^\w.-]/g, '') || masterid;

    // Process each file independently so one bad image/video (e.g. a failed video
    // encode) can't abort the whole batch — the other images/videos still save.
    const failedSlots: string[] = [];
    for (const { slot, file } of mediaFiles) {
      try {
      const existing = await this.mediaRepo.findOne({ where: { masterid, slot } });
      if (existing) {
        await this.deleteFromS3(existing.url_name, slot);
        await this.mediaRepo.remove(existing);
      }

      // Unique per upload (cache-bust). The same slot used to reuse one URL, but media is
      // served as immutable (max-age 24h), so a delete+re-upload kept serving the OLD
      // cached/deleted image and showed black on the customer portal. A fresh name each
      // upload gives every version its own immutable URL — no stale cache, no 404.
      const urlName = `${code}${slot}-${Date.now().toString(36)}`;
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
          const { size } = fs.statSync(tempOut);
          await this.s3.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: fs.createReadStream(tempOut),
            ContentLength: size,
            ContentType: 'video/webm',
          })).catch((err) => {
            console.error(`S3 video upload failed for key=${key}:`, err?.message || err);
            throw err;
          });
        } finally {
          // Always remove scratch files, even on error. The boot sweep + hourly
          // cron above are the backstop for hard kills where this can't run.
          try { if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn); } catch { /* ignore */ }
          try { if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut); } catch { /* ignore */ }
        }
      } else {
        const compressed = await this.compressImage(file.buffer);
        await this.s3.send(new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: compressed,
          ContentType: 'image/webp',
        })).catch((err) => {
          console.error(`S3 image upload failed for key=${key}:`, err?.message || err);
          throw err;
        });
      }

      const type = slot.startsWith('vid') ? 'video' : 'image';
      await this.mediaRepo.save(
        this.mediaRepo.create({ masterid, slot, type, url_name: urlName, uploaded_by: userId }),
      );
      } catch (err: any) {
        this.logger.error(`Media save failed for ${masterid} slot=${slot}: ${err?.message || err}`);
        failedSlots.push(slot);
      }
    }

    const result = await this.getDetails(masterid, baseUrl);
    return { ...result, failedSlots };
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
