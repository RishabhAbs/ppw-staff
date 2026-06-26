import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UploadedFiles,
  UseInterceptors,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ItemDetailsService } from './item-details.service';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';

// Per-file upload cap (MB). Default 100 — override with the MAX_UPLOAD_MB env
// var. A 500MB cap on the ~8GB instance disk was the disk-full crash trigger.
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '100', 10);

function originOf(req: Request): string {
  const host =
    (req.headers['x-forwarded-host'] as string)?.split(',')[0]?.trim() ||
    req.get('host') ||
    '';
  let proto =
    (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() ||
    req.protocol;
  const isPrivate =
    /^localhost(:|$)/i.test(host) ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (proto === 'http' && !isPrivate) proto = 'https';
  return `${proto}://${host}`;
}

@Controller('item-details')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class ItemDetailsController {
  constructor(private readonly service: ItemDetailsService) {}

  @Get(':masterid')
  async getDetails(@Param('masterid') masterid: string, @Req() req: Request) {
    return this.service.getDetails(masterid, originOf(req));
  }

  @RequirePermission('inventory')
  @Post(':masterid')
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 12 },
    }),
  )
  async saveDetails(
    @Param('masterid') masterid: string,
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
  ) {
    const description = body.description || '';
    const name = body.name || undefined;
    const userId = parseInt(body.user_id) || 0;

    // Combine removed slots from both images and videos into one array of slot strings
    const removedSlots: string[] = [
      ...(body.removed_slots ? JSON.parse(body.removed_slots).map((n: number) => `img${n}`) : []),
      ...(body.removed_video_slots ? JSON.parse(body.removed_video_slots).map((n: number) => `vid${n}`) : []),
    ];

    const mediaFiles = (files || []).map((file) => {
      const imgMatch = file.fieldname.match(/image_(\d+)/);
      const vidMatch = file.fieldname.match(/video_(\d+)/);
      const slot = imgMatch ? `img${imgMatch[1]}` : vidMatch ? `vid${vidMatch[1]}` : 'img1';
      return { slot, file };
    });

    return this.service.saveDetails(
      masterid,
      description,
      userId,
      mediaFiles,
      removedSlots,
      name,
      originOf(req),
    );
  }

  @RequirePermission('inventory')
  @Delete(':masterid/media/:slot')
  async deleteMedia(
    @Param('masterid') masterid: string,
    @Param('slot') slot: string,
  ) {
    return this.service.deleteMedia(masterid, slot);
  }
}
