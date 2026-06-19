import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  Put,
  Query,
  Request,
  HttpException,
  UnauthorizedException,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { AppService } from './app.service';
import { AuthService } from './auth/auth.service';
import { TallyService } from './tally.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Ledger } from './entities/ledger.entity';
import { Repository } from 'typeorm';
import { StockItem } from './entities/stock-item.entity';
import { Order } from './entities/order.entity';
import { OrderDetail } from './entities/order-detail.entity';
import { Meta } from './entities/meta.entity';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard } from './auth/permissions.guard';
import { RequirePermission } from './auth/permissions.decorator';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly authService: AuthService,
    private readonly tallyService: TallyService,
    @InjectRepository(Ledger)
    private ledgerRepo: Repository<Ledger>,
    @InjectRepository(StockItem)
    private stockRepo: Repository<StockItem>,
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    @InjectRepository(OrderDetail)
    private orderDetailRepo: Repository<OrderDetail>,
    @InjectRepository(Meta)
    private metaRepo: Repository<Meta>,
  ) {}

  // Strip non-digits, take last 10. Treats '+91 9999999999', '09999999999',
  // '999-999-9999' and '9999999999' as the same identity. Returns null when
  // the input has fewer than 10 digits.
  static normalizePhone(input: any): string | null {
    if (input == null) return null;
    const digits = String(input).replace(/\D/g, '');
    if (digits.length < 10) return null;
    return digits.slice(-10);
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermission('dashboard')
  @Get('dashboard/stats')
  async getDashboardStats() {
    const today = new Date();
    // Convert to IST offset (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(today.getTime() + istOffset);
    const todayStr = `${istTime.getUTCFullYear()}-${String(istTime.getUTCMonth() + 1).padStart(2, '0')}-${String(istTime.getUTCDate()).padStart(2, '0')}`;

    // Current financial year: April 1 to March 31
    const fyStart = today.getMonth() >= 3
      ? `${today.getFullYear()}-04-01`
      : `${today.getFullYear() - 1}-04-01`;

    // Today's orders count and total sales
    const todayStats = await this.orderRepo
      .createQueryBuilder('order')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(order.total_amount), 0)', 'total')
      .where('order.date = :todayStr', { todayStr })
      .andWhere("order.order_type = 'Tax Invoice'")
      .getRawOne();

    // Staff activity today
    const staffActivity = await this.orderRepo
      .createQueryBuilder('order')
      .leftJoin('order.creator', 'creator')
      .select('creator.id', 'id')
      .addSelect('creator.name', 'name')
      .addSelect('creator.username', 'username')
      .addSelect('COUNT(*)', 'bills')
      .addSelect('COALESCE(SUM(order.total_amount), 0)', 'sales')
      .where('order.date = :todayStr', { todayStr })
      .andWhere("order.order_type = 'Tax Invoice'")
      .groupBy('creator.id')
      .addGroupBy('creator.name')
      .addGroupBy('creator.username')
      .getRawMany();

    // Total ledgers
    const ledgerCount = await this.ledgerRepo.count();

    // Total active stock items
    const stockCount = await this.stockRepo.count({ where: { is_active: true } });

    // Total orders in current FY
    const fyOrders = await this.orderRepo
      .createQueryBuilder('order')
      .select('COUNT(*)', 'count')
      .where('order.date >= :fyStart', { fyStart })
      .getRawOne();

    // Get last sync timestamps
    const lastSyncLedgers = await this.metaRepo.findOne({ where: { key: 'last_sync_ledgers' } });
    const lastSyncStock = await this.metaRepo.findOne({ where: { key: 'last_sync_stock' } });

    return {
      today: {
        orders: parseInt(todayStats.count) || 0,
        sales: parseFloat(todayStats.total) || 0,
      },
      staffActivity: staffActivity
        .map((s: any) => ({
          id: s.id || 0,
          name: s.name || s.username || 'System',
          bills: parseInt(s.bills) || 0,
          sales: parseFloat(s.sales) || 0,
        }))
        .sort((a, b) => b.sales - a.sales), // Sort by sales descending
      ledgerCount,
      stockCount,
      fyOrders: parseInt(fyOrders.count) || 0,
      lastSync: {
        ledgers: lastSyncLedgers?.value || null,
        stock: lastSyncStock?.value || null,
      },
    };
  }

  @Post('auth/login')
  async login(@Body() body: any) {
    const user = await this.authService.validateUser(
      body.username,
      body.password,
    );
    if (!user) {
      throw new UnauthorizedException();
    }
    // Return JWT token
    return this.authService.login(user);
  }

  @Post('auth/register')
  async register(@Body() body: any) {
    return this.authService.register(body);
  }

  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermission('inventory')
  @Post('ledgers')
  async createLedger(@Body() body: any) {
    if (!body.name) throw new Error('Name is required');

    // Advanced Duplicate Check: (Name + Phone) OR (GSTIN)
    let existingLedger: Ledger | null = null;

    if (body.gstin) {
      existingLedger = await this.ledgerRepo.findOne({
        where: { gstin: body.gstin },
      });
    }

    if (!existingLedger && body.name && body.phone_number) {
      existingLedger = await this.ledgerRepo.findOne({
        where: {
          name: body.name,
          phone_number: body.phone_number,
        },
      });
    }

    // Fallback: Check just name if no other unique identifier provided (optional, but requested by user)
    // "name and mobile will be the one by which we can differentiate" -> implies specific combo?
    // User said: "if not in tally and serve".
    // Let's stick to strict: Name+Mobile OR GSTIN.
    // If only Name is provided and duplicates exist, system might create duplicate?
    // User previous request: "check duplicate name". Let's keep name check as last resort backup to prevent simple spam.
    if (!existingLedger) {
      existingLedger = await this.ledgerRepo.findOne({
        where: { name: body.name },
      });
    }

    if (existingLedger) {
      return existingLedger;
    }

    const ledger = new Ledger();
    ledger.name = body.name;
    ledger.address = body.address;
    ledger.person_name = body.person_name;
    ledger.phone_number = body.phone_number;
    ledger.email = body.email;
    ledger.gstin = body.gstin;
    ledger.pincode = body.pincode;
    ledger.state = body.state;
    return this.ledgerRepo.save(ledger);
  }

  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermission('orders')
  @Patch('orders/:id/finalize')
  async finalizeOrder(@Param('id') id: string) {
    const orderId = parseInt(id);
    const order = await this.orderRepo.findOne({
      where: { id: orderId }
    });
    if (!order) throw new Error('Order not found');

    const remainingPending = await this.orderDetailRepo.count({
      where: { order: { id: orderId }, status: 'pending' }
    });

    if (remainingPending > 0) {
        throw new HttpException('Cannot finalize order with pending items.', 400);
    }

    await this.orderRepo.update(orderId, { status: 'completed' });
    return { success: true };
  }

  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermission('orders')
  @Patch('orders/items/bulk-status')
  async updateBulkStatus(@Body() body: { itemIds: number[], status: 'approved' | 'rejected' }) {
    const { itemIds, status } = body;
    if (!itemIds || itemIds.length === 0) return { success: true };
    
    // Update multiple items at once
    await this.orderDetailRepo.update(itemIds, { status });
    return { success: true };
  }

  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermission('orders')
  @Patch('orders/items/:id')
  async updateOrderItem(@Param('id') id: number, @Body() body: any) {
    const item = await this.orderDetailRepo.findOne({
      where: { id },
      relations: ['order']
    });

    if (!item) throw new Error('Item not found');
    
    // STRICT RULE: Block if order is completed or fetched
    if (item.order.status === 'completed' || item.order.status === 'fetched') {
      throw new Error('Cannot edit items in a completed or synced order.');
    }

    const { quantity, rate, discount_percentage } = body;
    item.quantity = quantity ?? item.quantity;
    item.rate = rate ?? item.rate;
    item.discount_percentage = discount_percentage ?? item.discount_percentage;
    item.amount = (item.quantity * item.rate) * (1 - (item.discount_percentage / 100));
    
    await this.orderDetailRepo.save(item);

    // Update order total
    const allItems = await this.orderDetailRepo.find({ where: { order: { id: item.order.id } } });
    const newTotal = allItems.reduce((sum, i) => sum + Number(i.amount), 0);
    await this.orderRepo.save({ ...item.order, total_amount: newTotal });

    return { success: true };
  }

  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermission('orders')
  @Post('orders/online/sync')
  async syncCompletedOrders() {
    // Marks ALL 'completed' online orders as 'fetched'
    await this.orderRepo.update(
      { status: 'completed', source: 'online' },
      { status: 'fetched' }
    );
    return { success: true };
  }

  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermission('orders')
  @Post('orders')
  async createOrder(@Body() body: any) {
    try {
    const {
      bill_number,
      ledger_id,
      date,
      total_amount,
      items,
      created_by,
      order_type,
      remark,
      amount_given,
    } = body;

    const ledger = await this.ledgerRepo.findOneBy({ id: ledger_id });
    if (!ledger) {
      throw new Error('Ledger not found');
    }

    if (bill_number) {
      const existingOrder = await this.orderRepo.findOne({
        where: { bill_number },
      });
      if (existingOrder) {
        throw new Error(
          `Order with Bill Number '${bill_number}' already exists.`,
        );
      }
    }

    const order = new Order();
    // Allow null bill_number, user might enter it later via Tally or manually
    order.bill_number = bill_number || null;
    order.ledger = ledger;
    order.date = date;
    order.total_amount = total_amount;
    order.order_type = order_type || 'Tax Invoice';
    order.remark = remark;
    order.amount_given = amount_given;

    // Snapshot customer details
    if (ledger) {
      order.customer_name = ledger.person_name || ledger.name;
      order.customer_address = ledger.address;
      order.customer_phone = ledger.phone_number;
      order.customer_email = ledger.email;
      order.customer_gstin = ledger.gstin;
      order.customer_pincode = ledger.pincode;
      order.customer_state = ledger.state;
    }

    // Set created_by if provided
    if (created_by) {
      order.created_by = created_by;
    }
    order.source = 'admin';

    const savedOrder = await this.orderRepo.save(order);

    for (const item of items) {
      const orderDetail = new OrderDetail();
      orderDetail.order = savedOrder;

      // Look up by BARCODE — reliable 1:1 mapping vs masterid which can collide
      const stockItem = item.barcode
        ? await this.stockRepo.findOneBy({ ats_barcode: item.barcode })
        : null;

      // item.name (from frontend selection) is the authoritative name — NEVER overwrite it
      orderDetail.item_name = item.name;
      orderDetail.barcode = item.barcode;
      orderDetail.rate = item.rate;
      orderDetail.unit = item.unit;
      orderDetail.quantity = item.quantity;
      orderDetail.amount = item.amount;
      orderDetail.gst = item.gst;
      orderDetail.selected_scheme = item.selected_scheme;
      orderDetail.discount_percentage = item.selected_discount;
      orderDetail.livestock_type = item.livestock_type;
      orderDetail.stock_item_id = stockItem?.masterid ?? null;
      orderDetail.parent = stockItem?.parent || item.parent || null;
      orderDetail.group = stockItem?.group || item.group || null;
      orderDetail.category = stockItem?.category || item.category || null;

      await this.orderDetailRepo.save(orderDetail);
    }

    return savedOrder;
   } catch (error) {
     console.error("Order Creation Error:", error);
     throw new Error(`Order Creation failed: ${error.message} \n ${error.stack}`);
   }
  }

  @Get('stock-items/barcode/:barcode')
  async getItemByBarcode(@Param('barcode') barcode: string) {
    if (!barcode) return null;

    // Use fuzzy search for barcode too, as requested
    const cleanSearch = barcode.replace(/[^a-zA-Z0-9]/g, '');
    const cleanBarcode = this.cleanSql('stock.ats_barcode');

    // Also try exact match first for performance/accuracy preference?
    // Actually, clean logic is safer for "19330" -> "(193) 30"

    const item = await this.stockRepo
      .createQueryBuilder('stock')
      .where(
        `(stock.ats_barcode = :barcode OR ${cleanBarcode} = :cleanSearch) AND stock.is_active = true`,
        { barcode, cleanSearch },
      )
      .getOne();

    return item;
  }

  @Get('stock-items/live-stock')
  async getLiveStock(@Query('masterid') masterid: string) {
    const stockItem = await this.stockRepo.findOneBy({ masterid });
    if (!stockItem) return { shop: '0.00', pb: '0.00' };

    // Quick check: if DB already has an expiry date that has passed, delete immediately
    if (stockItem.expiry_date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiry = new Date(stockItem.expiry_date);
      expiry.setHours(0, 0, 0, 0);
      if (today >= expiry) {
        await this.stockRepo.delete({ masterid });
        throw new HttpException('Sorry, selected item is inactive. Please select an active item.', 410);
      }
    }

    try {
      console.log(`[LiveStock] Fetching for item: "${stockItem.name}" (MasterID: ${masterid})`);
      const collection = await this.tallyService.fetchItemGodownStock(
        stockItem.name,
      );
      console.log(`[LiveStock] Received ${collection.length} entries from Tally.`);
      if (collection.length === 0) {
        // Log the search payload just in case
        console.log(`[LiveStock] Empty collection for "${stockItem.name}".`);
      }

      let shopQty = 0;
      let pbQty = 0;
      let liveUnit = '';
      let isInactive = false;

      for (const entry of collection) {
        const status = this.tallyService.findCustomField(entry, 'ABSStatus').toLowerCase();
        if (status === 'inactive') {
          isInactive = true;
          break;
        }

        const godownName = this.tallyService.findCustomField(entry, 'GodownName') ||
                           this.tallyService.findCustomField(entry, 'Name');

        const closingBalRaw = this.tallyService.findCustomField(entry, 'StkClBalance') ||
                              this.tallyService.findCustomField(entry, 'ClosingBalance') ||
                              '0';

        // Extract value and unit (e.g., " 9042.00 Pcs" -> 9042.0, "Pcs")
        // Tally sometimes returns a string like " 9042.00 Pcs" or just "9042.00"
        const match = closingBalRaw.trim().match(/^([-+]?[0-9]*\.?[0-9]+)\s*(.*)$/);
        const closingBal = match ? parseFloat(match[1]) : parseFloat(closingBalRaw) || 0;
        if (match && match[2] && !liveUnit) {
          liveUnit = match[2].trim();
        }

        const lowerGodown = godownName.toLowerCase();
        if (lowerGodown.includes('shop')) {
          shopQty += closingBal;
        } else if (
          lowerGodown.includes('pb') ||
          lowerGodown.includes('p.b') ||
          lowerGodown.includes('panbazar')
        ) {
          pbQty += closingBal;
        }
      }

      if (isInactive) {
        await this.stockRepo.delete({ masterid });
        throw new HttpException('Sorry, selected item is inactive. Please select an active item.', 410);
      }

      return {
        shop: shopQty.toFixed(2),
        pb: pbQty.toFixed(2),
        unit: liveUnit || stockItem.base_units || 'Pcs',
      };
    } catch (e) {
      // If it's a known HttpException (e.g. 410 inactive), re-throw it
      if (e instanceof HttpException) throw e;
      // Otherwise Tally is unreachable — return 0 stock gracefully without resetting the popup
      console.warn(`Tally unreachable for live stock of ${stockItem.name}: ${e.message}`);
      return { shop: '0.00', pb: '0.00', unit: stockItem.base_units || 'Pcs' };
    }
  }

  // Separate sync endpoints
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermission('inventory')
  @Post('sync/ledgers')
  async syncLedgers() {
    return this.tallyService.fetchAndSaveLedgers();
  }

  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermission('inventory')
  @Post('sync/stock-items')
  async syncStockItems() {
    return this.tallyService.fetchAndSaveStockItems();
  }

  @Get('version')
  getVersion() {
    return {
      version: '1.2.2',
      status: 'Running',
      stripped_chars: [
        ' ',
        '-',
        '.',
        '/',
        '(',
        ')',
        '[',
        ']',
        '_',
        '{',
        '}',
        '&',
        '@',
      ],
      timestamp: new Date().toISOString(),
    };
  }

  // Combined sync (legacy)
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermission('inventory')
  @Post('sync')
  async syncData() {
    try {
      return await this.tallyService.syncAll();
    } catch (error) {
      console.error('Error in syncData:', error);
      throw error;
    }
  }

  // Helper to generate nested REPLACE SQL
  private cleanSql(column: string): string {
    // List of characters to strip: special symbols + whitespace
    // Removed '?' and ':' to avoid TypeORM parameter parsing issues
    const chars = [
      ' ',
      '!',
      '@',
      '#',
      '$',
      '%',
      '^',
      '&',
      '*',
      '(',
      ')',
      '_',
      '+',
      '-',
      '=',
      '{',
      '}',
      '[',
      ']',
      '|',
      '\\\\',
      ';',
      '"',
      "''",
      '<',
      '>',
      ',',
      '.',
      '/',
      '~',
      '`',
    ];

    let sql = column;
    for (const char of chars) {
      sql = `REPLACE(${sql}, '${char}', '')`;
    }
    return sql;
  }

  @Get('reports/ledgers')
  async getLedgers(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
    @Query('search') search: string = '',
  ) {
    try {
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
      const skip = (pageNum - 1) * limitNum;

      const query = this.ledgerRepo.createQueryBuilder('ledger');

      if (search) {
        // Strip everything except alphanumeric from search query
        const cleanSearch = search.replace(/[^a-zA-Z0-9]/g, '');

        // Generate SQL to strip everything except alphanumeric from DB columns (approx)
        const cleanName = this.cleanSql('ledger.name');
        const cleanPhone = this.cleanSql('ledger.phone_number');
        const cleanGst = this.cleanSql('ledger.gstin');

        query.where(
          `(ledger.name LIKE :search 
              OR ledger.phone_number LIKE :search 
              OR ledger.gstin LIKE :search
              OR ${cleanName} LIKE :cleanSearch
              OR ${cleanPhone} LIKE :cleanSearch
              OR ${cleanGst} LIKE :cleanSearch
            )`,
          { search: `%${search}%`, cleanSearch: `%${cleanSearch}%` },
        );
      }

      const [data, total] = await query
        .orderBy('ledger.name', 'ASC')
        .skip(skip)
        .take(limitNum)
        .getManyAndCount();

      return {
        data,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      console.error('Error in getLedgers:', error);
      throw error;
    }
  }

  @Get('reports/stock-items/:id')
  async getStockItemById(@Param('id') id: string) {
    try {
      const item = await this.stockRepo.findOne({ where: { id: parseInt(id) } });
      if (!item) throw new HttpException('Stock item not found', 404);
      return item;
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      console.error('Error in getStockItemById:', error);
      throw new HttpException('Failed to fetch stock item', 500);
    }
  }

  // Stock Items with pagination
  @Get('reports/stock-items')
  async getStockItems(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
    @Query('search') search: string = '',
    @Query('parent') parent: string = '',
    @Query('group') group: string = '',
    @Query('category') category: string = '',
  ) {
    try {
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(10000, Math.max(1, parseInt(limit) || 50));
      const skip = (pageNum - 1) * limitNum;

      const query = this.stockRepo.createQueryBuilder('stock');
      query.where('(stock.is_active = true OR stock.is_active IS NULL)');

      if (parent) {
        const parents = parent.split(',').map(p => p.trim()).filter(Boolean);
        if (parents.length > 0) {
          if (parents.length === 1) {
            query.andWhere('stock.parent LIKE :parent', { parent: `%${parents[0]}%` });
          } else {
            query.andWhere('stock.parent IN (:...parents)', { parents });
          }
        }
      }

      if (group) {
        query.andWhere('stock.group LIKE :group', { group: `%${group}%` });
      }

      if (category) {
        const cats = category.split(',').map(c => c.trim()).filter(Boolean);
        if (cats.length > 0) {
          if (cats.length === 1) {
            query.andWhere('stock.category LIKE :category', { category: `%${cats[0]}%` });
          } else {
            query.andWhere('stock.category IN (:...cats)', { cats });
          }
        }
      }

      if (search) {
        const cleanSearch = search.replace(/[^a-zA-Z0-9]/g, '');
        const cleanName = this.cleanSql('stock.name');
        const cleanBarcode = this.cleanSql('stock.ats_barcode');

        if (parent) {
          // Strict mode: Only search in Name or Barcode when parent is already locked
          query.andWhere(
            `(stock.name LIKE :search 
              OR stock.ats_barcode LIKE :search 
              OR ${cleanName} LIKE :cleanSearch
              OR ${cleanBarcode} LIKE :cleanSearch
             )`,
            {
              search: `%${search}%`,
              cleanSearch: `%${cleanSearch}%`,
            },
          );
        } else {
          // Global mode: Include Parent in search if no parent is selected
          const cleanParent = this.cleanSql('stock.parent');
          query.andWhere(
            `(stock.name LIKE :search 
              OR stock.ats_barcode LIKE :search 
              OR stock.parent LIKE :search
              OR ${cleanName} LIKE :cleanSearch
              OR ${cleanBarcode} LIKE :cleanSearch
              OR ${cleanParent} LIKE :cleanSearch
             )`,
            {
              search: `%${search}%`,
              cleanSearch: `%${cleanSearch}%`,
            },
          );
        }
      }

      const [data, total] = await query
        .orderBy('stock.name', 'ASC')
        .skip(skip)
        .take(limitNum)
        .getManyAndCount();

      // Fetch media counts for these items
      const masterids = data.map(item => item.masterid);
      let mediaCounts: any[] = [];
      if (masterids.length > 0) {
        mediaCounts = await this.stockRepo.manager
          .createQueryBuilder('media', 'm')
          .select('m.masterid', 'masterid')
          .addSelect("COUNT(CASE WHEN m.slot LIKE 'img%' THEN 1 END)", 'photo_count')
          .addSelect("COUNT(CASE WHEN m.slot LIKE 'vid%' THEN 1 END)", 'video_count')
          .where('m.masterid IN (:...masterids)', { masterids })
          .groupBy('m.masterid')
          .getRawMany();
      }

      const mediaMap = new Map(mediaCounts.map(m => [m.masterid, m]));

      const enrichedData = data.map(item => ({
        ...item,
        photo_count: parseInt(mediaMap.get(item.masterid)?.photo_count || '0'),
        video_count: parseInt(mediaMap.get(item.masterid)?.video_count || '0'),
      }));

      return {
        data: enrichedData,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    } catch (error: any) {
      console.error('Error in getStockItems:', error);
      throw new HttpException('Failed to fetch stock items', 500);
    }
  }

  @Get('stock-items/brands')
  async getStockBrands(@Query('search') search: string = '') {
    try {
      const query = this.stockRepo
        .createQueryBuilder('stock')
        .select('DISTINCT stock.parent', 'brand')
        .where("stock.parent IS NOT NULL AND stock.parent != '' AND stock.is_active = true");

      if (search) {
        const cleanSearch = search.replace(/[^a-zA-Z0-9]/g, '');
        const cleanBrand = this.cleanSql('stock.parent');
        query.andWhere(
          `(stock.parent LIKE :search OR ${cleanBrand} LIKE :cleanSearch)`,
          { search: `%${search}%`, cleanSearch: `%${cleanSearch}%` },
        );
      }

      const result = await query.orderBy('stock.parent', 'ASC').getRawMany();
      return result.map((r) => r.brand);
    } catch (error) {
      console.error('Error in getStockBrands:', error);
      throw error;
    }
  }

  @Get('stock-items/parents')
  async getStockParents(@Query('search') search: string = '') {
    return this.getStockBrands(search);
  }

  @Get('stock-items/groups')
  async getStockGroups(
    @Query('search') search: string = '',
    @Query('brand') brand: string = '',
  ) {
    try {
      const query = this.stockRepo
        .createQueryBuilder('stock')
        .select('DISTINCT stock.group', 'group')
        .where("stock.group IS NOT NULL AND stock.group != '' AND stock.is_active = true AND stock.group != stock.parent");

      if (brand) {
        const brands = brand.split(',').map(b => b.trim()).filter(Boolean);
        if (brands.length === 1) {
          query.andWhere('stock.parent = :brand', { brand: brands[0] });
        } else {
          query.andWhere('stock.parent IN (:...brands)', { brands });
        }
      }

      if (search) {
        const cleanSearch = search.replace(/[^a-zA-Z0-9]/g, '');
        const cleanGroup = this.cleanSql('stock.group');
        query.andWhere(
          `(stock.group LIKE :search OR ${cleanGroup} LIKE :cleanSearch)`,
          { search: `%${search}%`, cleanSearch: `%${cleanSearch}%` },
        );
      }

      const result = await query.orderBy('stock.group', 'ASC').getRawMany();
      const groups = result.map((r) => r.group);

      return groups;
    } catch (error) {
      console.error('Error in getStockGroups:', error);
      throw error;
    }
  }

  @Get('stock-items/categories')
  async getStockCategories(
    @Query('search') search: string = '',
    @Query('brand') brand: string = '',
  ) {
    try {
      const query = this.stockRepo
        .createQueryBuilder('stock')
        .select('DISTINCT stock.category', 'category')
        .where("stock.category IS NOT NULL AND stock.category != '' AND stock.is_active = true");

      if (brand) {
        const brands = brand.split(',').map(b => b.trim()).filter(Boolean);
        if (brands.length === 1) {
          query.andWhere('stock.parent = :brand', { brand: brands[0] });
        } else {
          query.andWhere('stock.parent IN (:...brands)', { brands });
        }
      }

      if (search) {
        const cleanSearch = search.replace(/[^a-zA-Z0-9]/g, '');
        const cleanCat = this.cleanSql('stock.category');
        query.andWhere(
          `(stock.category LIKE :search OR ${cleanCat} LIKE :cleanSearch)`,
          { search: `%${search}%`, cleanSearch: `%${cleanSearch}%` },
        );
      }

      const result = await query.orderBy('stock.category', 'ASC').getRawMany();
      let categories = result.map((r) => r.category);

      // Fallback: If no categories found, try getting distinct parents
      if (categories.length === 0) {
        const parentResult = await this.stockRepo
          .createQueryBuilder('stock')
          .select('DISTINCT stock.parent', 'parent')
          .where("stock.parent IS NOT NULL AND stock.parent != ''")
          .orderBy('stock.parent', 'ASC')
          .getRawMany();
        categories = parentResult.map((r) => r.parent);
      }

      return categories;
    } catch (error) {
      console.error('Error in getStockCategories:', error);
      throw error;
    }
  }

  // Orders with pagination
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  // 'orders' OR 'reports' — Order Processing role needs the live order list
  // to actually process orders; pure reporting users can also read it.
  @RequirePermission('orders', 'reports')
  @Get('reports/orders')
  async getOrders(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
    @Query('search') search: string = '',
    @Query('user_id') userId: string = '',
    @Query('role') role: string = '',
    @Query('show_all') showAll: string = 'false',
    @Query('date') date: string = '',
    @Query('drafts_only') draftsOnly: string = 'false', // New param
    @Query('order_type') orderType: string = '',
    @Query('range') range: string = '', // New param: 'fy'
    @Query('status') status: string = '', // New param: 'inedit', 'pending', etc.
    @Query('source') source: string = '', // New param: 'admin' or 'online'
  ) {
    try {
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
      const skip = (pageNum - 1) * limitNum;

      const query = this.orderRepo
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.ledger', 'ledger')
        .leftJoinAndSelect('order.creator', 'creator')
        .orderBy('order.date', 'DESC')
        .addOrderBy('order.created_at', 'DESC');

      // Build dynamic where clause
      let hasWhere = false;

      if (draftsOnly === 'true') {
        query.where("order.status = 'inedit'");
        hasWhere = true;

        if (role && role !== 'admin' && userId) {
          query.andWhere('order.created_by = :userId', {
            userId: parseInt(userId),
          });
        }
      } else if (search) {
        const cleanSearch = search.replace(/[^a-zA-Z0-9]/g, '');
        const cleanBill = this.cleanSql('order.bill_number');
        const cleanLedgerName = this.cleanSql('ledger.name');
        const cleanCreator = this.cleanSql('creator.name');
        const cleanAmount = this.cleanSql('order.total_amount');

        query.where(
          `(${cleanBill} LIKE :cleanSearch 
              OR ${cleanLedgerName} LIKE :cleanSearch 
              OR ${cleanCreator} LIKE :cleanSearch
              OR CAST(order.id AS CHAR) LIKE :search
              OR ${cleanAmount} LIKE :cleanSearch
              OR order.date LIKE :search
              OR order.bill_number LIKE :search
              OR ledger.name LIKE :search
              OR order.customer_name LIKE :search
              OR order.customer_phone LIKE :search
            )`,
          { search: `%${search}%`, cleanSearch: `%${cleanSearch}%` },
        );
        hasWhere = true;
      } else {
        if (showAll !== 'true' && range !== 'fy') {
          query.where("order.status != 'fetched'");
          hasWhere = true;
        }
      }

      // Handle Range Filter (Financial Year)
      if (range === 'fy') {
        const today = new Date();
        const fyStart = today.getMonth() >= 3
          ? `${today.getFullYear()}-04-01`
          : `${today.getFullYear() - 1}-04-01`;
        
        if (hasWhere) query.andWhere('order.date >= :fyStart', { fyStart });
        else { query.where('order.date >= :fyStart', { fyStart }); hasWhere = true; }
        
        // When showing FY orders, we usually want to see everything including fetched
        // unless explicitly told otherwise. For now, just adding it to scope.
      }

      // Final Scoping (Staff filtering or Privacy)
      if (draftsOnly !== 'true') {
        // Role-specific user_id scoping (NOT date — date is hoisted below so
        // it applies uniformly to admin/manager/employee/etc.).
        if (role === 'admin' || role === 'manager') {
          if (userId) {
            // Admin/Manager can filter by staff if userId is provided
            const filterId = parseInt(userId as string);
            const condition = 'order.created_by = :userIdFilter';
            if (hasWhere) query.andWhere(condition, { userIdFilter: filterId });
            else { query.where(condition, { userIdFilter: filterId }); hasWhere = true; }
          }
          // Else: Admin/Manager sees ALL orders (no filter added)
        } else if (role === 'employee' && userId) {
          // Employees see ONLY their own
          const condition = 'order.created_by = :userIdScoped';
          if (hasWhere) query.andWhere(condition, { userIdScoped: parseInt(userId) });
          else { query.where(condition, { userIdScoped: parseInt(userId) }); hasWhere = true; }

          // Without an explicit date or FY range, hide stale 'fetched' orders.
          // (When a date IS provided, the hoisted date filter below already
          // narrows the result set, so we don't need this default.)
          if (!date && range !== 'fy') {
            query.andWhere(
              "(order.status != 'fetched' OR DATE(order.date) = CURDATE())",
            );
          }
        }
      }

      // Date filter — applies to ALL roles uniformly (admin/manager/employee/etc.).
      // Previously the date param was honoured only inside the admin and
      // employee branches, so managers (and any other role) silently ignored
      // ?date=YYYY-MM-DD and got every order back.
      if (date) {
        const condition = 'order.date = :dateFilter';
        if (hasWhere) query.andWhere(condition, { dateFilter: date });
        else { query.where(condition, { dateFilter: date }); hasWhere = true; }
      }

      // Secondary filters
      if (orderType) {
        const condition = 'order.order_type = :orderType';
        if (hasWhere) query.andWhere(condition, { orderType });
        else { query.where(condition, { orderType }); hasWhere = true; }
      }

      if (status) {
        const condition = 'order.status = :status';
        if (hasWhere) query.andWhere(condition, { status });
        else { query.where(condition, { status }); hasWhere = true; }
      }

      if (source) {
        const condition = 'order.source = :sourceFilter';
        if (hasWhere) query.andWhere(condition, { sourceFilter: source });
        else { query.where(condition, { sourceFilter: source }); hasWhere = true; }
      }

      const [data, total] = await query
        .skip(skip)
        .take(limitNum)
        .getManyAndCount();

      return {
        data,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      console.error('Error in getOrders:', error);
      throw error;
    }
  }

  @Get('orders/customer/:phone')
  async getOrdersByCustomerPhone(
    @Param('phone') phone: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    // Match by last-10-digit identity so '+91 999...', '0999...', '999-999-9999'
    // and '9999999999' all resolve to the same customer.
    const normalized = AppController.normalizePhone(phone);
    if (!normalized) {
      throw new HttpException('phone must contain at least 10 digits', 400);
    }

    try {
      const qb = this.orderRepo
        .createQueryBuilder('o')
        .leftJoinAndSelect('o.orderDetails', 'd')
        .where('o.customer_phone = :exact OR o.customer_phone LIKE :like', {
          exact: normalized,
          like: `%${normalized}`,
        })
        .orderBy('o.date', 'DESC')
        .addOrderBy('o.id', 'DESC');

      if (limitStr != null) {
        const limit = Math.max(1, Math.min(1000, parseInt(limitStr, 10) || 0));
        qb.take(limit);
      }
      if (offsetStr != null) {
        const offset = Math.max(0, parseInt(offsetStr, 10) || 0);
        qb.skip(offset);
      }

      return await qb.getMany();
    } catch (error: any) {
      console.error('Error in getOrdersByCustomerPhone:', error);
      throw new HttpException('Failed to fetch customer orders', 500);
    }
  }

  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermission('orders')
  @Get('orders/:id/details')
  async getOrderDetails(@Param('id') id: number) {
    return this.orderDetailRepo.find({
      where: { order: { id } },
    });
  }

  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermission('orders')
  @Get('orders/:id')
  async getOrderById(@Param('id') id: number) {
    return this.orderRepo.findOne({
      where: { id },
      relations: ['ledger'],
    });
  }

  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermission('reports')
  @Delete('orders/:id')
  async deleteOrder(@Param('id') id: string) {
    try {
      const orderId = parseInt(id);
      const order = await this.orderRepo.findOne({ where: { id: orderId } });
      if (!order) throw new Error('Order not found');

      if (order.status !== 'inedit') {
        throw new Error(
          'Cannot delete order that is already Shared or Synced.',
        );
      }

      // Delete details first
      const details = await this.orderDetailRepo.find({
        where: { order: { id: orderId } },
      });
      await this.orderDetailRepo.remove(details);
      await this.orderRepo.remove(order);
      return { success: true };
    } catch (error) {
      console.error('Error deleting order:', error);
      throw error;
    }
  }

  @Put('orders/:id')
  async updateOrder(@Param('id') id: string, @Body() body: any) {
    try {
      const orderId = parseInt(id);
      const { ledger_id, date, total_amount, items, order_type, remark, amount_given } = body;

      const order = await this.orderRepo.findOne({ where: { id: orderId } });
      if (!order) throw new Error('Order not found');

      if (body.bill_number) {
        const existingOrder = await this.orderRepo.findOne({
          where: { bill_number: body.bill_number },
        });
        if (existingOrder && existingOrder.id !== orderId) {
          throw new Error(
            `Order with Bill Number '${body.bill_number}' already exists.`,
          );
        }
        order.bill_number = body.bill_number;
      }

      // Optional: Block update if already 'fetched' (synced to Tally)
      // Lock update if not in 'inedit'
      if (order.status !== 'inedit') {
        throw new Error('Cannot edit order that is already Shared or Synced.');
      }

      // Update Header
      if (ledger_id) {
        const ledger = await this.ledgerRepo.findOneBy({ id: ledger_id });
        if (ledger) {
          order.ledger = ledger;
          // Update Snapshot (User might have changed customer)
          order.customer_name = ledger.person_name || ledger.name;
          order.customer_address = ledger.address;
          order.customer_phone = ledger.phone_number;
          order.customer_email = ledger.email;
          order.customer_gstin = ledger.gstin;
          order.customer_pincode = ledger.pincode;
          order.customer_state = ledger.state;
        }
      }

      order.date = date;
      order.total_amount = total_amount;
      order.order_type = order_type || 'Tax Invoice';
      order.remark = remark;
      order.amount_given = amount_given;
      // Reset status to 'inedit' if it was 'pending' and we edited it?
      // User logic: "they will save... this inedit". Assume edit puts it back to draft.
      order.status = 'inedit';
      order.source = 'admin';

      const savedOrder = await this.orderRepo.save(order);

      // Replace Details: Delete old, Insert new
      const oldDetails = await this.orderDetailRepo.find({
        where: { order: { id: orderId } },
      });
      await this.orderDetailRepo.remove(oldDetails);
      for (const item of items) {
        const orderDetail = new OrderDetail();
        orderDetail.order = savedOrder;

        // Look up by BARCODE — reliable 1:1 mapping vs masterid which can collide
        const stockItem = item.barcode
          ? await this.stockRepo.findOneBy({ ats_barcode: item.barcode })
          : null;

        // item.name (from frontend selection) is the authoritative name — NEVER overwrite it
        orderDetail.item_name = item.name;
        orderDetail.barcode = item.barcode;
        orderDetail.rate = item.rate;
        orderDetail.unit = item.unit;
        orderDetail.quantity = item.quantity;
        orderDetail.amount = item.amount;
        orderDetail.gst = item.gst;
        orderDetail.selected_scheme = item.selected_scheme;
        orderDetail.discount_percentage = item.selected_discount;
        orderDetail.livestock_type = item.livestock_type;
        orderDetail.stock_item_id = stockItem?.masterid ?? null;
        orderDetail.parent = stockItem?.parent || item.parent || null;
        orderDetail.group = stockItem?.group || item.group || null;
        orderDetail.category = stockItem?.category || item.category || null;

        await this.orderDetailRepo.save(orderDetail);
      }
      return savedOrder;
    } catch (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  }

  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequirePermission('orders')
  @Post('orders/:id/sync')
  async syncOrderToTally(@Param('id') id: string) {
    try {
      // New Workflow: Just mark as PENDING
      const orderId = parseInt(id);
      const order = await this.orderRepo.findOne({ where: { id: orderId } });
      if (!order) return { success: false, message: 'Order not found' };

      // Prevent Double Queueing
      if (order.status === 'pending') {
        return {
          success: true,
          message: 'Order already queued for sync',
          data: order,
        };
      }
      if (order.status === 'fetched') {
        return { success: true, message: 'Order already synced', data: order };
      }

      order.status = 'pending';
      await this.orderRepo.save(order);

      // Reload with relations to return full object for frontend update
      const updatedOrder = await this.orderRepo.findOne({
        where: { id: orderId },
        relations: ['ledger'],
      });

      return {
        success: true,
        message: 'Order marked for Tally Sync',
        data: updatedOrder,
      };
    } catch (error) {
      console.error('Error in syncOrderToTally:', error);
      throw error;
    }
  }

  // Tally Pull Endpoint - Protected by API Key
  @Get('tally/pending-orders')
  async getPendingOrders(@Headers('x-api-key') apiKey: string) {
    const expectedKey = process.env.TALLY_API_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    const limit = 10; // Reduced to 10 to ensure minimal load per request
    console.time('fetchPendingOrders');
    const pendingOrders = await this.orderRepo.find({
      where: { status: 'pending' },
      relations: ['ledger', 'orderDetails', 'creator'], // Fetch all relations needed for XML
      order: { date: 'ASC', id: 'ASC' }, // Process oldest first
      take: limit,
    });
    console.timeEnd('fetchPendingOrders');
    console.log(`[Tally Sync] Fetching ${pendingOrders.length} pending orders`);

    const data = pendingOrders.map((order) => {
      // Safe Customer Logic: Prefer Ledger Config, Fallback to Snapshot
      const customerName =
        order.ledger?.name || order.customer_name || 'Unknown Customer';
      const creatorName = order.creator ? order.creator.username : 'Unknown';

      return {
        id: order.id,
        created_by: creatorName,
        bill_number: order.bill_number,
        date: order.date,
        total_amount: order.total_amount,
        order_type: order.order_type || 'Tax Invoice',
        remark: order.remark,
        amount_given: order.amount_given,

        customer: {
          name: customerName,
          // GUID is crucial. If present, Tally identifies existing ledger.
          // If missing, Tally should look up by Name or Create New.
          guid: order.ledger?.tally_guid || '',

          // Contact Details for Creation
          address: order.ledger?.address || order.customer_address || '',
          phone: order.ledger?.phone_number || order.customer_phone || '',
          email: order.ledger?.email || order.customer_email || '',
          gstin: order.ledger?.gstin || order.customer_gstin || '',
          pincode: order.ledger?.pincode || '',
          state: order.ledger?.state || '',
          contact_person: order.ledger?.person_name || customerName,
        },

        items: order.orderDetails
          ? order.orderDetails.map((item) => ({
              stock_item_name: item.item_name, // This MUST match Tally Stock Item Name
              quantity: item.quantity,
              rate: item.rate,
              unit: item.unit,
              amount: item.amount,
              discount_percentage: item.discount_percentage,
              gst: item.gst,
              godown: item.livestock_type || 'Shop',
              parent: item.parent,
              group: item.group,
            }))
          : [],
      };
    });

    return { data };
  }

  @Get('tally/confirm-orders')
  confirmOrdersDiag() {
    return {
      message: 'Method Not Allowed. Please use POST to confirm orders.',
      example_payload: {
        id: 1,
        bill_number: 'INV/001',
        tally_master_id: '12345',
        ledger_guid: 'optional-guid',
      },
    };
  }

  @Post('tally/confirm-orders')
  async confirmOrders(
    @Headers('x-api-key') apiKey: string,
    @Body()
    check: {
      id: number;
      bill_number: string;
      tally_master_id: string;
      ledger_guid?: string;
    },
  ) {
    const expectedKey = process.env.TALLY_API_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    try {
      const order = await this.orderRepo.findOne({
        where: { id: check.id },
        relations: ['ledger'],
      });

      if (!order) {
        return { id: check.id, status: 'failed', message: 'Order not found' };
      }

      // 0. Duplicate Bill Number Check
      if (check.bill_number) {
        const existingOrder = await this.orderRepo.findOne({
          where: { bill_number: check.bill_number },
        });
        if (existingOrder && existingOrder.id !== check.id) {
          console.warn(
            `[Tally Sync] Rejected confirmation for Order ${check.id} due to duplicate Bill No: ${check.bill_number}`,
          );
          return {
            id: check.id,
            status: 'failed',
            message: `Bill Number ${check.bill_number} already exists on Order ${existingOrder.id}`,
          };
        }
      }

      // 1. Update Order Details
      order.bill_number = check.bill_number;
      order.tally_master_id = check.tally_master_id;
      order.status = 'fetched'; // Mark as Completed/Synced

      // 2. Handle Customer creation/linking
      if (check.ledger_guid) {
        const ledger = order.ledger;

        if (!ledger || !ledger.tally_guid) {
          let existingLedger = await this.ledgerRepo.findOne({
            where: { tally_guid: check.ledger_guid },
          });

          if (!existingLedger) {
            const customerName =
              order.customer_name || (ledger ? ledger.name : '');
            if (customerName) {
              existingLedger = await this.ledgerRepo.findOne({
                where: { name: customerName },
              });
            }
          }

          if (existingLedger) {
            existingLedger.tally_guid = check.ledger_guid;
            await this.ledgerRepo.save(existingLedger);
            order.ledger = existingLedger;
          } else {
            const newLedger = new Ledger();
            newLedger.name = order.customer_name || 'Unknown';
            newLedger.tally_guid = check.ledger_guid;
            newLedger.address = order.customer_address;
            newLedger.phone_number = order.customer_phone;
            newLedger.email = order.customer_email;
            newLedger.gstin = order.customer_gstin;
            newLedger.person_name = order.customer_name;

            const savedLedger = await this.ledgerRepo.save(newLedger);
            order.ledger = savedLedger;
          }
        }
      }

      await this.orderRepo.save(order);
      return { id: check.id, status: 'success' };
    } catch (e) {
      console.error(`Failed to confirm order ${check.id}`, e);
      return { id: check.id, status: 'error', message: e.message };
    }
  }
}
