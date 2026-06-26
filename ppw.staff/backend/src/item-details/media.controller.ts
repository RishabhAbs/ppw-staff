import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ItemDetailsService } from './item-details.service';

const SAFE_NAME = /^[\w.\-]+$/;

@Controller('media/items')
export class MediaController {
  constructor(private readonly service: ItemDetailsService) {}

  @Get('videos/:filename')
  async streamVideo(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    if (!SAFE_NAME.test(filename)) {
      res.status(400).send('Invalid filename');
      return;
    }
    return this.service.streamMedia(
      `uploads/items/videos/${filename}`,
      res,
      filename.endsWith('.mp4') ? 'video/mp4' : 'video/webm',
    );
  }

  @Get(':filename')
  async streamImage(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    if (!SAFE_NAME.test(filename)) {
      res.status(400).send('Invalid filename');
      return;
    }
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentType =
      ext === 'png'
        ? 'image/png'
        : ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'gif'
            ? 'image/gif'
            : 'image/webp';
    return this.service.streamMedia(
      `uploads/items/${filename}`,
      res,
      contentType,
    );
  }
}
