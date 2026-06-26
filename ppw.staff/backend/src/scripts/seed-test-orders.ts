import { DataSource } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderDetail } from '../entities/order-detail.entity';
import { StockItem } from '../entities/stock-item.entity';
import { Ledger } from '../entities/ledger.entity';
import { User } from '../entities/user.entity';
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
  entities: [Order, OrderDetail, StockItem, Ledger, User],
  synchronize: false,
});

async function seedOrders() {
  try {
    console.log('--- Starting Advanced Test Order Seeding ---');
    await dataSource.initialize();
    console.log('Database connection established.');

    const orderRepo = dataSource.getRepository(Order);
    const detailRepo = dataSource.getRepository(OrderDetail);
    const itemRepo = dataSource.getRepository(StockItem);
    const ledgerRepo = dataSource.getRepository(Ledger);
    const userRepo = dataSource.getRepository(User);

    // 0. Cleanup existing test data
    console.log('Cleaning up existing test data...');
    await detailRepo.query('SET FOREIGN_KEY_CHECKS = 0');
    await detailRepo.query('TRUNCATE TABLE order_detail');
    await orderRepo.query('TRUNCATE TABLE `order`');
    await detailRepo.query('SET FOREIGN_KEY_CHECKS = 1');

    // 1. Ensure test users exist
    const testUsers = [
        { username: 'admin', name: 'System Admin', role: 'admin' },
        { username: 'sales1', name: 'Sales Force 1', role: 'employee' },
        { username: 'sales2', name: 'Sales Force 2', role: 'employee' }
    ];

    const users: User[] = [];
    for (const u of testUsers) {
        let user = await userRepo.findOne({ where: { username: u.username } });
        if (!user) {
            user = new User();
            user.username = u.username;
            user.name = u.name;
            user.role = u.role as any;
            user.password = '$2b$10$K7L1W8mXyX7zX9zX9zX9zO'; // Dummy hash
            user = await userRepo.save(user);
            console.log(`Created user: ${u.username}`);
        }
        users.push(user);
    }

    // 2. Get reference data
    const stockItems = await itemRepo.find({ take: 50, where: { is_active: true } });
    const ledgers = await ledgerRepo.find({ take: 10 });

    if (stockItems.length === 0 || ledgers.length === 0) {
      console.error('Missing StockItems or Ledgers. Please run hard-sync first.');
      return;
    }

    const statuses: ('inedit' | 'pending' | 'fetched')[] = ['inedit', 'pending', 'fetched'];
    const today = new Date();
    // Also seed some from yesterday to test "Today Only" logic
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    for (const user of users) {
      console.log(`Seeding orders for user: ${user.username}...`);
      
      for (const status of statuses) {
        // Create 3 orders per status per user
        for (let i = 0; i < 3; i++) {
          const ledger = ledgers[Math.floor(Math.random() * ledgers.length)];
          const order = new Order();
          order.status = status;
          order.ledger = ledger;
          order.customer_name = ledger.name || 'Test Customer';
          // Half orders from today, half from yesterday
          order.date = (i % 2 === 0) ? today : yesterday;
          order.order_type = Math.random() > 0.3 ? 'Tax Invoice' : 'Quotation';
          order.total_amount = 0;
          order.created_by = user.id;
          order.remark = `Advanced Seed: ${user.username} - ${status} #${i+1}`;
          order.amount_given = 0;
          
          order.bill_number = `SEED-${user.username.substring(0, 1).toUpperCase()}${status.substring(0, 1).toUpperCase()}${Math.floor(Math.random() * 100000)}`;

          const savedOrder = await orderRepo.save(order);

          // Add 1-5 items to each order
          let orderTotal = 0;
          const itemCount = Math.floor(Math.random() * 5) + 1;
          
          for (let j = 0; j < itemCount; j++) {
              const item = stockItems[Math.floor(Math.random() * stockItems.length)];
              const detail = new OrderDetail();
              detail.order = savedOrder;
              detail.stock_item_id = item.masterid;
              detail.item_name = item.name || '';
              detail.barcode = item.ats_barcode || '';
              detail.quantity = Math.floor(Math.random() * 5) + 1;
              detail.unit = item.base_units || 'Nos';
              
              const rate = parseFloat(item.default_mrp || '100');
              detail.rate = rate;
              detail.gst = 18;
              detail.discount_percentage = 0;
              
              const itemAmount = detail.quantity * rate;
              detail.amount = itemAmount;
              orderTotal += itemAmount;

              await detailRepo.save(detail);
          }

          savedOrder.total_amount = orderTotal;
          if (status !== 'inedit') {
              savedOrder.amount_given = Math.ceil(orderTotal / 10) * 10;
          }
          
          await orderRepo.save(savedOrder);
        }
      }
    }

    console.log('--- Advanced Seeding Complete! ---');
  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    await dataSource.destroy();
  }
}

seedOrders();
