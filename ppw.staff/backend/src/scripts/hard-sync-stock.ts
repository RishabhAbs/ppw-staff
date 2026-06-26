import { DataSource } from 'typeorm';
import { StockItem } from '../entities/stock-item.entity';
import * as path from 'path';
import * as dotenv from 'dotenv';
import axios from 'axios';

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

const TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000';
const COMPANY_NAME = process.env.TALLY_COMPANY || '';

async function hardSync() {
  try {
    console.log('--- Starting Emergency Hard Sync ---');
    await dataSource.initialize();
    console.log('Database connection established.');

    const stockItemRepository = dataSource.getRepository(StockItem);

    // 1. Clear current data (TRUNCATE for fresh start)
    console.log('Emptying stock_item table...');
    await stockItemRepository.query('SET FOREIGN_KEY_CHECKS = 0');
    // Using TRUNCATE instead of clear for a complete reset of IDs if desired, 
    // but clear() is safer with TypeORM if we don't want to mess with DB permissions too much.
    // However, user specifically said "empty whole stock_item table".
    await stockItemRepository.query('TRUNCATE TABLE stock_item');
    await stockItemRepository.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('Table emptied successfully.');

    // 2. Fetch from Tally
    console.log(`Fetching comprehensive data from Tally (${COMPANY_NAME})...`);
    
    // Comprehensive fetch list to match all columns in StockItem entity
    const fetchList = [
      'Name',
      'MasterId',
      'Parent',
      'Category',
      'Group',
      'Closing Balance',
      'Base units',
      'Opening Balance',
      'GSTRegistrationDetails',
      'GSTDetails',
      'AdvanceDetails',
      'LastPurcCostUDF',
      'rate1',
      'rate2',
      'rate3',
      'rate3a',
      'rate4',
      'ItemDefaultMRP',
      'MRP',
      'Standard Cost',
      'Standard Price',
      'GUID',
      'ATSBarcodeItemCode',
      'ABSDisReorderExp',
      'HSNCode'
    ];

    const payload = {
      static_variables: [
        { name: 'svExportFormat', value: 'jsonex' },
        { name: 'svCurrentCompany', value: COMPANY_NAME },
      ],
      fetch_List: fetchList,
    };

    const response = await axios({
      method: 'POST',
      url: TALLY_URL,
      headers: {
        'Content-Type': 'application/json',
        version: '1',
        tallyrequest: 'export',
        type: 'collection',
        id: 'ABSitemCollTest', // Standard collection ID for items
      },
      data: payload,
    });

    // Sanitization & Extraction (Copied robust logic)
    const extractCollection = (data: any): any[] => {
      let rawData = data;
      if (typeof data === 'string') {
        const sanitized = data.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        let fixCounter = 0;
        const fixedJson = sanitized.replace(/,\s*\{\s*"desc"/g, () => {
          fixCounter++;
          return `, "fix_${fixCounter}": { "desc"`;
        });
        try {
          rawData = JSON.parse(fixedJson);
        } catch (e) {
          console.error('JSON parsing failed');
          return [];
        }
      }

      if (rawData?.data?.collection && Array.isArray(rawData.data.collection)) return rawData.data.collection;
      if (rawData?.collection && Array.isArray(rawData.collection)) return rawData.collection;
      if (Array.isArray(rawData)) return rawData;
      return [];
    };

    const collection = extractCollection(response.data);
    console.log(`Found ${collection.length} items in Tally response.`);

    // Helper functions
    const getValue = (obj: any): string => {
      if (!obj) return '';
      if (typeof obj === 'string') return obj.trim();
      if (obj.value !== undefined) return String(obj.value).trim();
      return '';
    };

    const findCustomField = (item: any, fieldName: string, depth = 0): string => {
      if (!item || depth > 5) return '';
      const lowerField = fieldName.toLowerCase();
      if (item[lowerField]) return getValue(item[lowerField]);
      if (item[fieldName]) return getValue(item[fieldName]);
      const keys = Object.keys(item);
      for (const key of keys) {
        const val = item[key];
        if (val && typeof val === 'object' && val.desc === `\`${fieldName}\``) return getValue(val);
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
        const masterId = getValue(item.masterid) || findCustomField(item, 'MasterId') || findCustomField(item, 'GUID') || item.metadata?.guid;

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

        // Deactivation / Deletion (Same as TallyService)
        if (expiryDate && today >= expiryDate) {
          continue;
        }

        const stock = new StockItem();
        stock.masterid = masterId;
        stock.name = name;
        stock.parent = getValue(item.parent);
        stock.group = getValue(item.parent) || getValue(item.group);
        stock.category = getValue(item.category);
        stock.base_units = getValue(item.baseunits) || getValue(item['base units']);
        stock.hsn = getValue(item.hsn) || findCustomField(item, 'HSNCode');
        stock.closing_balance = getValue(item.closingbalance) || getValue(item['closing balance']);
        stock.opening_balance = getValue(item.openingbalance) || getValue(item['opening balance']);
        stock.gst = getValue(item.gst) || findCustomField(item, 'GSTRegistrationDetails');

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
        stock.rate_one_4a = findCustomField(item, 'rate3a');
        stock.rate_one_5 = findCustomField(item, 'rate4');

        stockItems.push(stock);
    }

    console.log(`Parsed ${stockItems.length} valid items (including Rates, Category, and Group). Starting bulk insertion...`);

    const batchSize = 250;
    for (let i = 0; i < stockItems.length; i += batchSize) {
      const batch = stockItems.slice(i, i + batchSize);
      await stockItemRepository.save(batch);
      console.log(`Inserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} items)`);
    }

    console.log(`--- Hard Sync Complete! Refilled ${stockItems.length} items ---`);
  } catch (error) {
    console.error('Hard Sync failed:', error);
  } finally {
    await dataSource.destroy();
  }
}

hardSync();
