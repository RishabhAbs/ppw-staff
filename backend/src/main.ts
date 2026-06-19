import { NestFactory } from '@nestjs/core';
import * as crypto from 'crypto';
import { json, urlencoded } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import * as express from 'express';
import { SpaFilter } from './spa.filter';

// Polyfill for Node.js 18/20 where 'crypto' is not globally available for TypeORM
if (!global.crypto) {
  (global as any).crypto = crypto;
}

import { AppModule } from './app.module';
import { DataSource } from 'typeorm';
import { SchemaSyncService } from './schema-sync.service';

// One-time role-defaults backfill for users whose `permissions` is NULL
// (never been set). Idempotent: only NULL rows are touched, so re-running
// on every boot is a no-op once admins have curated their staff. Admin
// users are NEVER touched (they bypass PermissionsGuard anyway). Rows
// admin explicitly set to '[]' are also left alone — that's a deliberate
// "no permissions" choice we must respect.
// Ensure all entity-defined columns exist in DB before the app starts serving.
// SchemaSyncService is supposed to do this on bootstrap, but it runs AFTER
// app.listen() so requests can race ahead. These explicit ALTERs guarantee
// the columns are there by the time we listen. errno 1060 = "duplicate column"
// (already exists) — silently skipped.
async function ensureSchemaColumns(app: any) {
  const ds = app.get(DataSource);
  const adds: { table: string; col: string; def: string }[] = [
    // PPW StockItem-only column (admin-customer dropped it from entity in
    // commit 32b2a87 — keep adding it here so PPW's SELECT * never fails).
    // PPW StockItem columns
    { table: 'stock_item', col: 'ats_barcode',     def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'group',           def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'category',        def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'last_purchase_cost', def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'is_active',       def: 'TINYINT(1) NOT NULL DEFAULT 1' },
    { table: 'stock_item', col: 'expiry_date',     def: 'DATETIME NULL' },
    { table: 'stock_item', col: 'rate_one_2',      def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'rate_one_3',      def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'rate_one_4',      def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'rate_one_4a',     def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'rate_one_5',      def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'hsn',             def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'gst',             def: 'VARCHAR(255) NULL' },
    { table: 'stock_item', col: 'default_mrp',     def: 'VARCHAR(255) NULL' },

    // Order columns
    { table: 'order', col: 'customer_email',   def: 'VARCHAR(255) NULL' },
    { table: 'order', col: 'customer_gstin',   def: 'VARCHAR(255) NULL' },
    { table: 'order', col: 'customer_pincode', def: 'VARCHAR(255) NULL' },
    { table: 'order', col: 'customer_city',    def: 'VARCHAR(255) NULL' },
    { table: 'order', col: 'customer_state',   def: 'VARCHAR(255) NULL' },
    { table: 'order', col: 'amount_given',     def: 'DECIMAL(10,2) NULL' },
    { table: 'order', col: 'processed_at',     def: 'TIMESTAMP NULL' },
    { table: 'order', col: 'processed_by',     def: 'INT NULL' },

    // Ledger columns
    { table: 'ledger', col: 'address',         def: 'VARCHAR(255) NULL' },
    { table: 'ledger', col: 'person_name',     def: 'VARCHAR(255) NULL' },
    { table: 'ledger', col: 'phone_number',    def: 'VARCHAR(255) NULL' },
    { table: 'ledger', col: 'email',           def: 'VARCHAR(255) NULL' },
    { table: 'ledger', col: 'gstin',           def: 'VARCHAR(255) NULL' },
    { table: 'ledger', col: 'pincode',         def: 'VARCHAR(255) NULL' },
    { table: 'ledger', col: 'state',           def: 'VARCHAR(255) NULL' },
    { table: 'ledger', col: 'tally_guid',      def: 'VARCHAR(255) NULL' },

    // Order Detail columns
    { table: 'order_detail', col: 'selected_scheme', def: 'VARCHAR(255) NULL' },
    { table: 'order_detail', col: 'livestock_type',  def: 'VARCHAR(255) NULL' },
    { table: 'order_detail', col: 'parent',          def: 'VARCHAR(255) NULL' },
    { table: 'order_detail', col: 'group',           def: 'VARCHAR(255) NULL' },
    { table: 'order_detail', col: 'category',        def: 'VARCHAR(255) NULL' },
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

// One-time role-defaults backfill for users whose `permissions` is NULL
// (never been set). Idempotent: only NULL rows are touched, so re-running
// on every boot is a no-op once admins have curated their staff. Admin
// users are NEVER touched (they bypass PermissionsGuard anyway). Rows
// admin explicitly set to '[]' are also left alone — that's a deliberate
// "no permissions" choice we must respect.
async function backfillUserPermissions(app: any) {
  const ds = app.get(DataSource);
  const roleDefaults: Record<string, string[]> = {
    manager: ['inventory'],
    employee: ['orders', 'reports'],
  };
  for (const [role, perms] of Object.entries(roleDefaults)) {
    try {
      const json = JSON.stringify(perms);
      const r: any = await ds.query(
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
}

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);
    // Entity-driven: creates ANY missing table / column / index from the
    // entity definitions automatically — no hardcoded list to maintain.
    // Runs BEFORE app.listen() so the schema is in place before serving.
    await app.get(SchemaSyncService).syncSchema();
    // Safety net for columns whose PPW type intentionally differs from the
    // shared admin-customer entity (kept additive, errno 1060 = already exists).
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

    // Serve frontend static files (JS, CSS, images) with correct MIME types
    const clientDir = join(process.cwd(), 'client');
    if (existsSync(clientDir)) {
      app.use(express.static(clientDir));
    }

    // SPA fallback: catches 404s for non-API routes and serves index.html
    app.useGlobalFilters(new SpaFilter());

    const port = process.env.PORT ?? 3000;
    await app.listen(port, '0.0.0.0');
    console.log(`Application is running on: http://localhost:${port}`);
    console.log(`Global Prefix: api`);
  } catch (err) {
    console.error('SERVER FAILED TO START:', err);
    process.exit(1);
  }
}
bootstrap();
