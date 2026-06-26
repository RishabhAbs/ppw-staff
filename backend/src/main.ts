import { NestFactory } from '@nestjs/core';
import * as crypto from 'crypto';
import { json, urlencoded } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import * as express from 'express';
import { SpaFilter } from './spa.filter';

if (!global.crypto) {
  (global as any).crypto = crypto;
}

import { AppModule } from './app.module';
import { DataSource } from 'typeorm';
import { SchemaSyncService } from './schema-sync.service';
import { AuthService } from './auth/auth.service';
import { ItemDetailsService } from './item-details/item-details.service';

async function ensureSchemaColumns(app) {
  const ds = app.get(DataSource);
  const adds = [
    { table: 'stock_item', col: 'ats_barcode', def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'group', def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'category', def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'last_purchase_cost', def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'is_active', def: 'TINYINT(1) NOT NULL DEFAULT 1' },
    { table: 'stock_item', col: 'expiry_date', def: 'DATETIME NULL' },
    { table: 'stock_item', col: 'rate_one_2', def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'rate_one_3', def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'rate_one_4', def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'rate_one_4a', def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'rate_one_5', def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'hsn', def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'gst', def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'default_mrp', def: 'VARCHAR(255) NULL' },
    { table: 'order', col: 'customer_email', def: 'VARCHAR(255) NULL' },
    { table: 'order', col: 'customer_gstin', def: 'VARCHAR(255) NULL' },
    { table: 'order', col: 'customer_pincode', def: 'VARCHAR(255) NULL' },
    { table: 'order', col: 'customer_city', def: 'VARCHAR(255) NULL' },
    { table: 'order', col: 'customer_state', def: 'VARCHAR(255) NULL' },
    { table: 'order', col: 'amount_given', def: 'DECIMAL(10,2) NULL' },
    { table: 'order', col: 'processed_at', def: 'TIMESTAMP NULL' },
    { table: 'order', col: 'processed_by', def: 'INT NULL' },
    { table: 'ledger', col: 'address', def: 'VARCHAR(255) NULL' },
    { table: 'ledger', col: 'person_name', def: 'VARCHAR(255) NULL' },
    { table: 'ledger', col: 'phone_number', def: 'VARCHAR(255) NULL' },
    { table: 'ledger', col: 'email', def: 'VARCHAR(255) NULL' },
    { table: 'ledger', col: 'gstin', def: 'VARCHAR(255) NULL' },
    { table: 'ledger', col: 'pincode', def: 'VARCHAR(255) NULL' },
    { table: 'ledger', col: 'state', def: 'VARCHAR(255) NULL' },
    { table: 'ledger', col: 'tally_guid', def: 'VARCHAR(255) NULL' },
    { table: 'order_detail', col: 'selected_scheme', def: 'VARCHAR(255) NULL' },
    { table: 'order_detail', col: 'livestock_type', def: 'VARCHAR(255) NULL' },
    { table: 'order_detail', col: 'parent', def: 'VARCHAR(255) NULL' },
    { table: 'order_detail', col: 'group', def: 'VARCHAR(255) NULL' },
    { table: 'order_detail', col: 'category', def: 'VARCHAR(255) NULL' },
  ];

  for (const { table, col, def } of adds) {
    try {
      await ds.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`);
      console.log(`Migration: added column ${table}.${col}`);
    } catch (e: any) {
      if (e?.errno !== 1060) {
        console.error(`Migration error for ${table}.${col}:`, e?.sqlMessage);
      }
    }
  }
}

async function backfillUserPermissions(app) {
  const ds = app.get(DataSource);
  const roleDefaults = {
    manager: ['inventory'],
    employee: ['orders', 'reports'],
  };

  for (const [role, perms] of Object.entries(roleDefaults)) {
    try {
      const json = JSON.stringify(perms);
      const r = await ds.query(
        `UPDATE \`user\` SET permissions = ?
         WHERE role = ? AND permissions IS NULL`,
        [json, role],
      );
      const affected = r?.affectedRows ?? r?.[1]?.affectedRows ?? 0;
      if (affected > 0) {
        console.log(`Migration: backfilled ${affected} ${role}(s) with default permissions ${json}`);
      }
    } catch (e: any) {
      console.error(`Migration: ${role} permissions backfill failed:`, e?.sqlMessage || e?.message);
    }
  }

  // Repair rows where `permissions` was stored as a genuinely broken scalar
  // (number, bad string, etc.). Two shapes are VALID and must be left alone:
  //   - a flat string[] of page permissions
  //   - a structured object { system: string[], orderTypes, godowns, ... }
  // saved by the admin UI. NULL rows are handled by the backfill above.
  try {
    const rows = await ds.query(
      `SELECT id, permissions FROM \`user\` WHERE permissions IS NOT NULL`,
    );
    let repaired = 0;
    for (const row of rows) {
      const raw = row.permissions;
      // simple-json columns may come back already-parsed or as a string.
      let value: any = raw;
      if (typeof raw === 'string') {
        try {
          value = JSON.parse(raw);
        } catch {
          value = raw;
        }
      }
      const isCleanArray =
        Array.isArray(value) && value.every((p) => typeof p === 'string');
      const isStructuredObject =
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (value.system === undefined || Array.isArray(value.system));
      if (isCleanArray || isStructuredObject) {
        continue; // already a valid shape — don't touch saved permissions
      }
      const fixed = AuthService.normalizePermissions(value);
      await ds.query(`UPDATE \`user\` SET permissions = ? WHERE id = ?`, [
        JSON.stringify(fixed),
        row.id,
      ]);
      repaired++;
      console.log(
        `Migration: repaired permissions for user id=${row.id} -> ${JSON.stringify(fixed)}`,
      );
    }
    if (repaired > 0) {
      console.log(`Migration: repaired ${repaired} user(s) with non-array permissions`);
    }
  } catch (e: any) {
    console.error('Migration: permissions repair failed:', e?.sqlMessage || e?.message);
  }
}

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    await app.get(SchemaSyncService).syncSchema();
    await ensureSchemaColumns(app);
    await backfillUserPermissions(app);

    const expressInstance = app.getHttpAdapter().getInstance();
    expressInstance.set('trust proxy', 1);

    app.use(json({ limit: '50mb' }));
    app.use(urlencoded({ extended: true, limit: '50mb' }));

    app.setGlobalPrefix('api');

    app.enableCors({
      origin: [
        'https://onlineppw.com',
        'https://www.onlineppw.com',
        'http://abspw.ap-south-1.elasticbeanstalk.com',
        'https://abspw.ap-south-1.elasticbeanstalk.com',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5180',
        'http://localhost:5181',
        'http://localhost:5182',
      ],
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      credentials: true,
    });

    const clientDir = join(process.cwd(), 'client');
    if (existsSync(clientDir)) {
      app.use(express.static(clientDir));
    }

    app.useGlobalFilters(new SpaFilter());

    const port = process.env.PORT ?? 3000;
    await app.listen(port, '0.0.0.0');
    console.log(`Application is running on: http://localhost:${port}`);
    console.log(`Global Prefix: api`);

    // One-time watermark backfill for images saved before watermarking existed.
    // Runs in the background AFTER the server is listening so it never blocks
    // or crashes startup; it's idempotent, so re-running on each deploy is safe.
    void app
      .get(ItemDetailsService)
      .backfillWatermarks()
      .catch((err) =>
        console.error('Watermark backfill error:', err?.message || err),
      );
  } catch (err) {
    console.error('SERVER FAILED TO START:', err);
    process.exit(1);
  }
}

bootstrap();