import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { Ledger } from './entities/ledger.entity';
import { StockItem } from './entities/stock-item.entity';

import { Order } from './entities/order.entity';
import { Meta } from './entities/meta.entity';

@Injectable()
export class TallyService {
  private readonly logger = new Logger(TallyService.name);
  private readonly tallyUrl: string;
  private readonly companyName: string;
  private readonly isTallyConfigured: boolean;

  constructor(
    @InjectRepository(Ledger)
    private ledgerRepository: Repository<Ledger>,
    @InjectRepository(StockItem)
    private stockItemRepository: Repository<StockItem>,

    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Meta)
    private metaRepository: Repository<Meta>,
    private configService: ConfigService,
  ) {
    const rawUrl = this.configService.get<string>('TALLY_URL', '').trim();
    const normalized =
      rawUrl && !/^https?:\/\//i.test(rawUrl) ? `http://${rawUrl}` : rawUrl;

    let validUrl = '';
    if (normalized) {
      try {
        new URL(normalized);
        validUrl = normalized;
      } catch {
        this.logger.warn(
          `Invalid TALLY_URL "${rawUrl}" — Tally sync disabled.`,
        );
      }
    }

    this.tallyUrl = validUrl;
    this.isTallyConfigured = Boolean(validUrl);
    this.companyName = this.configService.get<string>(
      'TALLY_COMPANY',
      '6 PPW [25-26]',
    );

    if (!this.isTallyConfigured) {
      this.logger.warn(
        'TALLY_URL is not set or invalid — scheduled Tally sync will be skipped. ' +
          'Set TALLY_URL (e.g. http://localhost:9000) to enable sync.',
      );
    }
  }

  @Cron('0 * * * *')
  async handleScheduledSync() {
    if (!this.isTallyConfigured) {
      return;
    }
    this.logger.log('Executing scheduled Tally Sync (Hourly)...');
    await this.syncAll();
  }

  async syncAll() {
    if (!this.isTallyConfigured) {
      this.logger.warn('Tally sync skipped — TALLY_URL not configured.');
      return { message: 'Tally sync disabled', ledgers: 0, stockItems: 0 };
    }
    try {
      const ledgerCount = await this.fetchAndSaveLedgers();
      const stockCount = await this.fetchAndSaveStockItems();
      return {
        message: 'Sync completed successfully',
        ledgers: ledgerCount,
        stockItems: stockCount,
      };
    } catch (error) {
      this.logger.error('Error in syncAll:', error.stack);
      throw error;
    }
  }

  private extractCollection(data: any): any[] {
    let parsedData = data;

    // If data is a string (which it should be with responseType: 'text'), sanitize and parse it
    if (typeof data === 'string') {
      try {
        // Step 1: Remove bad control characters (keeping \t\n\r is usually safer for debug, but identifying \u0004 specifically is key)
        // We'll remove all control chars except whitespace ones to be safe
        const sanitized = data.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

        // Step 2: Fix invalid JSON structure where objects are unnamed in the array/bag
        // Pattern: , { "desc" -> , "fix_X": { "desc"
        let fixCounter = 0;
        const fixedJson = sanitized.replace(/,\s*\{\s*"desc"/g, () => {
          fixCounter++;
          return `, "fix_${fixCounter}": { "desc"`;
        });

        if (fixCounter > 0) {
          this.logger.log(`Fixed ${fixCounter} invalid JSON objects`);
        }

        parsedData = JSON.parse(fixedJson);
        // this.logger.log('Successfully parsed sanitized response');
      } catch (e) {
        this.logger.error(
          'JSON parsing failed even after sanitization',
          (e as Error).message,
        );
        // Attempt to log a snippet of where it failed if possible?
        // For now, return empty to avoid crashing
        return [];
      }
    }

    // Debug: log what we have
    // this.logger.log(`parsedData type: ${typeof parsedData}`);

    if (
      parsedData?.data?.collection &&
      Array.isArray(parsedData.data.collection)
    ) {
      // this.logger.log(`Found collection with ${parsedData.data.collection.length} items`);
      return parsedData.data.collection;
    }
    if (parsedData?.collection && Array.isArray(parsedData.collection)) {
      return parsedData.collection;
    }
    if (Array.isArray(parsedData)) {
      return parsedData;
    }
    return [];
  }

  public getValue(obj: any): string {
    if (!obj) return '';
    if (typeof obj === 'string') return obj.trim();
    if (obj.value !== undefined) return String(obj.value).trim();
    return '';
  }

  public findCustomField(item: any, fieldName: string, depth = 0): string {
    if (!item) return '';
    if (depth > 5) return ''; // Prevent deep recursion/stack overflow

    // 1. Direct match (lowercase check)
    const lowerField = fieldName.toLowerCase();
    if (item[lowerField]) return this.getValue(item[lowerField]);
    if (item[fieldName]) return this.getValue(item[fieldName]);

    // 2. Iterate keys to find Tally "desc" match OR recurse into collections
    const keys = Object.keys(item);
    for (const key of keys) {
      const val = item[key];

      // Check for Tally Object with 'desc'
      if (val && typeof val === 'object' && val.desc === `\`${fieldName}\``) {
        return this.getValue(val);
      }

      // Check inside Collections (specifically AdvanceDetails or others)
      // Limit recursion depth
      if (Array.isArray(val)) {
        for (const subItem of val) {
          const found = this.findCustomField(subItem, fieldName, depth + 1);
          if (found) return found;
        }
      }
    }

    return '';
  }

  async fetchAndSaveLedgers(): Promise<number> {
    this.logger.log('Fetching Ledgers from Tally...');

    const payload = {
      static_variables: [
        { name: 'svExportFormat', value: 'jsonex' },
        // { name: 'svCurrentCompany', value: this.companyName }, // Commented out to use Active Company
      ],
      fetch_List: [
        'Name',
        'Parent',
        'Closing Balance',
        'ledgermobile',
        'LedgerMobile',
        'MobileNumber',
        'Email',
        'EmailID',
        'Pincode',
        'State',
        'STATENAME',
        'GUID',
        'gstin',
        'GSTRegistrationDetails',
      ],
    };

    try {
      // Using GET with body like Postman does
      const response = await axios({
        method: 'POST',
        url: this.tallyUrl,
        headers: {
          'Content-Type': 'application/json',
          version: '1',
          tallyrequest: 'export',
          type: 'collection',
          id: 'ABSDebLedColl',
        },
        data: payload,
      });

      // Debug Raw Response
      // this.logger.log(`Tally Ledger Response Status: ${response.status}`);

      const collection = this.extractCollection(response.data);
      this.logger.log(`Found ${collection.length} ledgers.`);

      let savedCount = 0;
      for (const item of collection) {
        const name = item.metadata?.name;
        if (!name) continue;

        const ledger = new Ledger();
        ledger.name = name;
        // Mapping Data
        // Use recursive search for all fields since structure is dynamic (Analysis of ABSDebLedColl)
        ledger.tally_guid =
          this.findCustomField(item, 'GUID') || item.metadata?.guid;

        // Address: Check standard Tally address or custom field
        const address = this.findCustomField(item, 'Address');
        if (!address && item.address) {
          // Fallback to standard array handling if findCustomField missed it (though it handles arrays)
          // Re-using findCustom logic is safer.
        }
        ledger.address = address;

        // Contact Details - Deep Search
        ledger.phone_number =
          this.findCustomField(item, 'ledgermobile') ||
          this.findCustomField(item, 'LedgerMobile') ||
          this.findCustomField(item, 'MobileNumber');
        ledger.person_name =
          this.findCustomField(item, 'LedgerContact') || ledger.name;
        ledger.email =
          this.findCustomField(item, 'Email') ||
          this.findCustomField(item, 'EmailID');
        ledger.pincode = this.findCustomField(item, 'Pincode');
        ledger.state =
          this.findCustomField(item, 'State') ||
          this.findCustomField(item, 'STATENAME');

        // GSTIN Logic: Deep Search
        ledger.gstin =
          this.findCustomField(item, 'Gstin') ||
          this.findCustomField(item, 'GSTRegistrationDetails');

        try {
          const existing = await this.ledgerRepository.findOne({
            where: { name: ledger.name },
          });
          if (existing) {
            ledger.id = existing.id;
          }
          await this.ledgerRepository.save(ledger);
          savedCount++;
        } catch (saveError) {
          // Skip individual save errors
        }
      }

      this.logger.log(`Saved ${savedCount} ledgers.`);
      
      // Update sync timestamp
      await this.metaRepository.save({ 
        key: 'last_sync_ledgers', 
        value: new Date().toISOString() 
      });

      return savedCount;
    } catch (error) {
      this.logger.error('Error fetching ledgers', error.stack);
      if (axios.isAxiosError(error)) {
        this.logger.error(
          'Axios Error Details:',
          JSON.stringify(error.toJSON()),
        );
        if (error.response) {
          // this.logger.error('Tally Response Data:', JSON.stringify(error.response.data));
        }
      }
      return 0;
    }
  }

  async fetchAndSaveStockItems(): Promise<number> {
    this.logger.log('Fetching Stock Items from Tally...');

    const fetchList = [
      'Name',
      'MasterId',
      'Parent',
      'Category',
      'Group',
      'Closing Balance',
      'Base units',
      'AdvanceDetails',
      'LastPurcCostUDF',
      'rate3a',
      'rate4',
      'ItemDefaultMRP',
      'MRP',
      'Standard Cost',
      'Standard Price',
      'GUID',
      'ABSDisReorderExp',
    ];

    const payload = {
      static_variables: [
        { name: 'svExportFormat', value: 'jsonex' },
        { name: 'svCurrentCompany', value: this.companyName },
      ],
      fetch_List: fetchList,
    };

    try {
      const response = await axios({
        method: 'POST',
        url: this.tallyUrl,
        headers: {
          'Content-Type': 'application/json',
          version: '1',
          tallyrequest: 'export',
          type: 'collection',
          id: 'ABSitemColl',
        },
        data: payload,
        responseType: 'text',
      });

      const collection = this.extractCollection(response.data);
      this.logger.log(`Found ${collection.length} stock items in Tally response.`);

      let savedCount = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const processedItemNames: string[] = [];

      for (const item of collection) {
        const name = item.metadata?.name;
        if (!name) continue;

        const masterId =
          this.getValue(item.masterid) ||
          this.findCustomField(item, 'MasterId') ||
          this.findCustomField(item, 'GUID') ||
          item.metadata?.guid;
        if (!masterId) continue;

        // 1. Expiry Date Logic
        const expiryStr = this.findCustomField(item, 'ABSDisReorderExp');
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

        // 2. Deactivation / Deletion
        if (expiryDate && today >= expiryDate) {
          this.logger.log(`Item ${name} (${masterId}) is expired. Deleting.`);
          await this.stockItemRepository.delete({ masterid: masterId });
          processedItemNames.push(name);
          continue;
        }

        // 3. Upsert Logic
        let stock = await this.stockItemRepository.findOne({
          where: { masterid: masterId },
        });

        if (!stock) {
          stock = new StockItem();
          stock.masterid = masterId;
        }

        if (stock) {
          stock.name = name;
          stock.parent = this.getValue(item.parent);
          stock.group = this.getValue(item.parent) || this.getValue(item.group);
          stock.category = this.getValue(item.category);
          stock.base_units = this.getValue(item.baseunits);
          stock.hsn = this.getValue(item.hsn);
          stock.closing_balance = this.getValue(item.closingbalance);
          stock.opening_balance = this.getValue(item.openingbalance);
          stock.gst = this.getValue(item.gst);

          stock.default_mrp =
            this.findCustomField(item, 'ItemDefaultMRP') ||
            this.findCustomField(item, 'MRP') ||
            this.findCustomField(item, 'Standard Cost') ||
            this.findCustomField(item, 'Standard Price');
          stock.ats_barcode = this.findCustomField(item, 'ATSBarcodeItemCode');
          stock.last_purchase_cost = this.findCustomField(item, 'LastPurcCostUDF');
          stock.expiry_date = expiryDate;
          stock.is_active = true;

          stock.rate_one_2 = this.findCustomField(item, 'rate1');
          stock.rate_one_3 = this.findCustomField(item, 'rate2');
          stock.rate_one_4 = this.findCustomField(item, 'rate3');
          stock.rate_one_5 = this.findCustomField(item, 'rate4');

          await this.stockItemRepository.save(stock);
          savedCount++;
          processedItemNames.push(name);
        }
      }

      // 4. Bulk Acknowledge to Tally in Batches of 500
      const batchSize = 500;
      for (let i = 0; i < processedItemNames.length; i += batchSize) {
        const batch = processedItemNames.slice(i, i + batchSize);
        await this.acknowledgeStockItemsBulkToTally(batch);
      }

      this.logger.log(`Processed ${collection.length} items. Saved/Updated: ${savedCount}`);
      
      // Update sync timestamp
      await this.metaRepository.save({ 
        key: 'last_sync_stock', 
        value: new Date().toISOString() 
      });

      return savedCount;
    } catch (error) {
      this.logger.error('Error fetching stock items', error.stack);
      return 0;
    }
  }

  private async acknowledgeStockItemsBulkToTally(itemNames: string[]) {
    if (!itemNames.length) return;

    const payload = {
      static_variables: [
        { name: 'svMstImportFormat', value: 'jsonex' },
        { name: 'svCurrentCompany', value: this.companyName },
      ],
      tallymessage: itemNames.map((name) => ({
        metadata: {
          type: 'Stock Item',
          name: name,
          reservedname: '',
        },
        IsAlterItem: 'No',
      })),
    };

    try {
      await axios({
        method: 'POST',
        url: this.tallyUrl,
        headers: {
          'Content-Type': 'application/json',
          version: '1',
          tallyrequest: 'Import',
          type: 'Data',
          id: 'All Masters',
        },
        data: payload,
      });
      this.logger.log(`Acknowledged batch of ${itemNames.length} items to Tally.`);
    } catch (error) {
      this.logger.warn(`Failed to acknowledge batch to Tally: ${error.message}`);
    }
  }

  async pushOrder(
    orderId: number,
  ): Promise<{ bill_number: string; tally_master_id: string }> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });
    if (!order) {
      throw new Error('Order not found');
    }

    // Tally XML Generation Logic (Placeholder)
    // In a real scenario, we would construct the Voucher XML here using order details
    // const xml = this.generateOrderXml(order);
    // const response = await axios.post(this.tallyUrl, xml, ...);

    // Simulation/Mock Response
    // Generating IDs that look like Tally responses
    const mockBillNumber = `ABS/25-26/${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
    const mockTallyId = `M${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    order.bill_number = mockBillNumber;
    order.tally_master_id = mockTallyId;

    await this.orderRepository.save(order);

    this.logger.log(
      `Pushed Order #${orderId} to Tally. Bill: ${mockBillNumber}, MasterID: ${mockTallyId}`,
    );

    return {
      bill_number: mockBillNumber,
      tally_master_id: mockTallyId,
    };
  }

  async fetchItemGodownStock(itemName: string): Promise<any[]> {
    this.logger.log(`Fetching live godown stock for item: ${itemName}...`);

    const payload = {
      static_variables: [
        { name: 'svExportFormat', value: 'jsonex' },
        { name: 'svCurrentCompany', value: this.companyName },
        { name: 'absitemname', value: itemName },
      ],
      fetch_List: [
        'Name',
        'Parent',
        'Closing Balance',
        'GodownName',
        'StkClBalance',
        'ABSStatus',
      ],
    };

    try {
      const response = await axios({
        method: 'POST',
        url: this.tallyUrl,
        headers: {
          'Content-Type': 'application/json',
          version: '1',
          tallyrequest: 'export',
          type: 'collection',
          id: 'PPWGdBatchColl',
        },
        data: payload,
        responseType: 'text',
      });

      const collection = this.extractCollection(response.data);
      this.logger.log(
        `Found ${collection.length} godown batch entries for ${itemName}.`,
      );
      return collection;
    } catch (error) {
      this.logger.error(
        `Error fetching godown stock for ${itemName}`,
        error.stack,
      );
      return [];
    }
  }
}
