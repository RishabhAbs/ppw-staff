import { DataSource } from 'typeorm';
import { StockItem } from '../entities/stock-item.entity';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tally_sync',
  entities: [StockItem],
  synchronize: false,
});

async function seed() {
  try {
    await dataSource.initialize();
    console.log('Database connection established.');

    const stockItemRepository = dataSource.getRepository(StockItem);

    // 1. Clear current data
    console.log('Clearing existing stock items...');
    await stockItemRepository.query('SET FOREIGN_KEY_CHECKS = 0');
    await stockItemRepository.clear();
    await stockItemRepository.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Cleared stock_item table.');

    // 2. Read response.json
    const jsonPath = path.join(__dirname, '../../../response.json');
    console.log(`Reading data from ${jsonPath}...`);
    const rawData = fs.readFileSync(jsonPath, 'utf8');

    // Extract collection using robust logic from TallyService
    const extractCollection = (data: string): any[] => {
      // Step 1: Remove bad control characters
      const sanitized = data.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

      // Step 2: Fix invalid JSON structure where objects are unnamed in the array/bag
      let fixCounter = 0;
      const fixedJson = sanitized.replace(/,\s*\{\s*"desc"/g, () => {
        fixCounter++;
        return `, "fix_${fixCounter}": { "desc"`;
      });

      try {
        const parsedData = JSON.parse(fixedJson);
        if (parsedData?.data?.collection && Array.isArray(parsedData.data.collection)) {
          return parsedData.data.collection;
        }
        if (parsedData?.collection && Array.isArray(parsedData.collection)) {
          return parsedData.collection;
        }
        if (Array.isArray(parsedData)) {
          return parsedData;
        }
        return [];
      } catch (e) {
        console.error('JSON parsing failed even after sanitization:', (e as Error).message);
        return [];
      }
    };

    const collection = extractCollection(rawData);

    console.log(`Found ${collection.length} items in JSON.`);

    // Helper functions similar to TallyService logic
    const getValue = (obj: any): string => {
      if (!obj) return '';
      if (typeof obj === 'string') return obj.trim();
      if (obj.value !== undefined) return String(obj.value).trim();
      return '';
    };

    const findCustomField = (
      item: any,
      fieldName: string,
      depth = 0,
    ): string => {
      if (!item || depth > 5) return '';
      const lowerField = fieldName.toLowerCase();
      if (item[lowerField]) return getValue(item[lowerField]);
      if (item[fieldName]) return getValue(item[fieldName]);

      const keys = Object.keys(item);
      for (const key of keys) {
        const val = item[key];
        if (val && typeof val === 'object' && val.desc === `\`${fieldName}\``) {
          return getValue(val);
        }
        if (Array.isArray(val)) {
          for (const subItem of val) {
            const found = findCustomField(subItem, fieldName, depth + 1);
            if (found) return found;
          }
        }
      }
      return '';
    };

    const stockItems: StockItem[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const item of collection) {
      const name = item.metadata?.name;
      const masterId =
        getValue(item.masterid) ||
        findCustomField(item, 'MasterId') ||
        findCustomField(item, 'GUID') ||
        item.metadata?.guid;

      if (!name || !masterId) continue;

      // Expiry Date Logic
      const expiryStr = findCustomField(item, 'ABSDisReorderExp');
      let expiryDate: Date | null = null;
      if (expiryStr) {
        const parts = expiryStr.split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            expiryDate = new Date(year, month, day);
            expiryDate.setHours(0, 0, 0, 0);
          }
        }
      }

      // Skip expired items as per TallyService logic
      if (expiryDate && today >= expiryDate) {
        continue;
      }

      const stock = new StockItem();
      stock.masterid = masterId;
      stock.name = name;
      stock.parent = getValue(item.parent);
      stock.group = getValue(item.parent) || getValue(item.group);
      stock.category = getValue(item.category);
      stock.base_units = getValue(item.baseunits);
      stock.hsn = getValue(item.hsn);
      stock.closing_balance = getValue(item.closingbalance);
      stock.opening_balance = getValue(item.openingbalance);
      stock.gst = getValue(item.gst);

      stock.default_mrp =
        findCustomField(item, 'ItemDefaultMRP') ||
        findCustomField(item, 'MRP') ||
        findCustomField(item, 'Standard Cost') ||
        findCustomField(item, 'Standard Price');
      stock.ats_barcode = findCustomField(item, 'ATSBarcodeItemCode');
      stock.last_purchase_cost = findCustomField(item, 'LastPurcCostUDF');
      stock.expiry_date = expiryDate;
      stock.is_active = true;

      stock.rate_one_2 = findCustomField(item, 'rate1');
      stock.rate_one_3 = findCustomField(item, 'rate2');
      stock.rate_one_4 = findCustomField(item, 'rate3');
      stock.rate_one_5 = findCustomField(item, 'rate4');

      stockItems.push(stock);
    }

    console.log(
      `Parsed ${stockItems.length} valid items. Starting bulk insertion...`,
    );

    // Bulk insertion in batches
    const batchSize = 500;
    for (let i = 0; i < stockItems.length; i += batchSize) {
      const batch = stockItems.slice(i, i + batchSize);
      await stockItemRepository.save(batch);
      console.log(
        `Inserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} items)`,
      );
    }

    console.log(`Successfully seeded ${stockItems.length} items.`);
  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    await dataSource.destroy();
  }
}

seed();
