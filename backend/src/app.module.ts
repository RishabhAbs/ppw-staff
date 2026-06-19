import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { UserController } from './user.controller';
import { AppService } from './app.service';
import { Ledger } from './entities/ledger.entity';
import { StockItem } from './entities/stock-item.entity';
import { Order } from './entities/order.entity';
import { OrderDetail } from './entities/order-detail.entity';
import { User } from './entities/user.entity';
import { GodownEntry } from './entities/godown-entry.entity';
import { Meta } from './entities/meta.entity';
import { ItemDetail } from './entities/item-detail.entity';
import { ItemMedia } from './entities/item-media.entity';
import { GodownController } from './godown.controller';
import { TallyService } from './tally.service';
import { AuthModule } from './auth/auth.module';
import { ItemDetailsModule } from './item-details/item-details.module';
import { SchemaSyncService } from './schema-sync.service';
@Module({
  imports: [
    AuthModule,
    ItemDetailsModule,
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/public',
    }),
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST', '127.0.0.1'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get<string>('DB_USERNAME', 'root'),
        password: configService.get<string>('DB_PASSWORD', ''),
        database: configService.get<string>('DB_NAME', 'ppw_db'),
        entities: [Ledger, StockItem, Order, OrderDetail, User, GodownEntry, Meta, ItemDetail, ItemMedia],
        // synchronize is OFF in code path — SchemaSyncService is the sole schema authority
        // and applies ONLY additive changes (CREATE TABLE / ADD COLUMN / CREATE INDEX),
        // protecting any DB shared with admin-customer from destructive ALTERs.
        synchronize: false,
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      Ledger,
      StockItem,
      Order,
      OrderDetail,
      User,
      GodownEntry,
      Meta,
      ItemDetail,
      ItemMedia,
    ]),
  ],
  controllers: [AppController, UserController, GodownController],
  providers: [AppService, TallyService, SchemaSyncService],
})
export class AppModule {}
