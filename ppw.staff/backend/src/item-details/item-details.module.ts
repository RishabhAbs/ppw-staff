import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemDetail } from '../entities/item-detail.entity';
import { ItemMedia } from '../entities/item-media.entity';
import { StockItem } from '../entities/stock-item.entity';
import { ItemDetailsController } from './item-details.controller';
import { ItemDetailsService } from './item-details.service';
import { MediaController } from './media.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ItemDetail, ItemMedia, StockItem])],
  controllers: [ItemDetailsController, MediaController],
  providers: [ItemDetailsService],
  exports: [ItemDetailsService],
})
export class ItemDetailsModule {}
