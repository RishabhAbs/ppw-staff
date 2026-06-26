import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ItemDetailsService } from './item-details.service';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/permissions.decorator';

const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '100', 10);

function originOf(req: any): string {
  const host =
    req.headers['x-forwarded-host']?.split(',')[0]?.trim() ||
    req.get('host') ||
    '';
  let proto =
    req.headers['x-forwarded-proto']?.split(',')[0]?.trim() ||
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
  constructor(private service: ItemDetailsService) {}

  @Get(':masterid')
  async getDetails(@Param('masterid') masterid: string, @Req() req: any) {
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
    @UploadedFiles() files: any[],
    @Req() req: any,
  ) {
    const description = body.description || '';
    const name = body.name || undefined;
    const userId = parseInt(body.user_id) || 0;

    const removedSlots = [
      ...(body.removed_slots ? JSON.parse(body.removed_slots).map((n) => `img${n}`) : []),
      ...(body.removed_video_slots ? JSON.parse(body.removed_video_slots).map((n) => `vid${n}`) : []),
    ];

    const mediaFiles = (files || []).map((file) => {
      const imgMatch = file.fieldname.match(/image_(\d+)/);
      const vidMatch = file.fieldname.match(/video_(\d+)/);
      const slot = imgMatch ? `img${imgMatch[1]}` : vidMatch ? `vid${vidMatch[1]}` : 'img1';
      return { slot, file };
    });

    return this.service.saveDetails(masterid, description, userId, mediaFiles, removedSlots, name, originOf(req));
  }

  @RequirePermission('inventory')
  @Delete(':masterid/media/:slot')
  async deleteMedia(@Param('masterid') masterid: string, @Param('slot') slot: string) {
    return this.service.deleteMedia(masterid, slot);
  }
}