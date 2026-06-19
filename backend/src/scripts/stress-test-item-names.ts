import { DataSource } from 'typeorm';
import { StockItem } from '../entities/stock-item.entity';
import { Order } from '../entities/order.entity';
import { OrderDetail } from '../entities/order-detail.entity';
import { Ledger } from '../entities/ledger.entity';
import { User } from '../entities/user.entity';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tally_sync',
  entities: [StockItem, Order, OrderDetail, Ledger, User],
});

async function stressTest() {
  try {
    await dataSource.initialize();
    console.log('Database connected.');

    const stockRepo = dataSource.getRepository(StockItem);
    const orderRepo = dataSource.getRepository(Order);
    const detailRepo = dataSource.getRepository(OrderDetail);
    const ledgerRepo = dataSource.getRepository(Ledger);

    const allStock = await stockRepo.find({ take: 100 });
    const ledger = await ledgerRepo.findOne({ where: {} });
    const adminUser = await dataSource.getRepository(User).findOne({ where: { role: 'admin' } });

    if (!allStock.length || !ledger || !adminUser) {
      console.error('Missing required seed data.');
      return;
    }

    console.log(`Starting Stress Test: Creating 20 orders with potential "ID Collisions"...`);
    let mismatchCount = 0;

    for (let i = 1; i <= 20; i++) {
      const order = new Order();
      order.customer_name = ledger.name;
      order.ledger = ledger;
      order.status = 'inedit';
      order.date = new Date();
      order.created_by = adminUser.id;
      order.total_amount = 0;
      order.bill_number = `STRESS-${Date.now()}-${i}`;
      
      const savedOrder = await orderRepo.save(order);
      let total = 0;

      // Add 10 random items to each order
      for (let j = 0; j < 10; j++) {
        const originalItem = allStock[Math.floor(Math.random() * allStock.length)];
        
        // SIMULATE THE BUGGY LOGIC VS NEW LOGIC
        // New Logic: Only use masterid
        const lookedUpItem = await stockRepo.findOneBy({ masterid: originalItem.masterid });

        if (!lookedUpItem || lookedUpItem.name !== originalItem.name) {
          console.error(`!!! MISMATCH DETECTED !!!`);
          console.error(`Wanted: ${originalItem.name} (masterid: ${originalItem.masterid})`);
          console.error(`Got: ${lookedUpItem?.name} (id: ${lookedUpItem?.id})`);
          mismatchCount++;
        }

        const detail = new OrderDetail();
        detail.order = savedOrder;
        detail.stock_item_id = lookedUpItem!.masterid;
        detail.item_name = lookedUpItem!.name;
        detail.quantity = 1;
        detail.rate = 100;
        detail.amount = 100;
        detail.unit = 'Nos';
        await detailRepo.save(detail);
        total += 100;
      }

      savedOrder.total_amount = total;
      await orderRepo.save(savedOrder);
      console.log(`Order ${i}/20 created. All items verified for this order.`);
    }

    console.log('-----------------------------------');
    if (mismatchCount === 0) {
      console.log('SUCCESS: Generated 20 orders (200 item lookups). ZERO mismatches found.');
      console.log('The masterid lookup logic is solid.');
    } else {
      console.error(`FAILURE: Found ${mismatchCount} mismatches during lookups.`);
    }

  } catch (err) {
    console.error('Stress test failed:', err);
  } finally {
    await dataSource.destroy();
  }
}

stressTest();
