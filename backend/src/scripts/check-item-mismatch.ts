import { DataSource } from 'typeorm';
import { StockItem } from '../entities/stock-item.entity';
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
  entities: [StockItem],
});

async function check() {
  await dataSource.initialize();

  // Check what masterid 015887 maps to
  const item1 = await dataSource.getRepository(StockItem).findOneBy({ masterid: '015887' });
  console.log('\n--- masterid = "015887" ---');
  console.log(item1 ? `id: ${item1.id}, name: "${item1.name}"` : 'NOT FOUND');

  // Also search by name to find Scholar Sketch Book
  const items = await dataSource.query("SELECT id, masterid, name FROM stock_item WHERE name LIKE '%SCHOLAR%' OR name LIKE '%SKETCH%' LIMIT 5");
  console.log('\n--- Items matching Scholar/Sketch ---');
  console.table(items);

  // Search by name to find JK A4 Copier
  const items2 = await dataSource.query("SELECT id, masterid, name FROM stock_item WHERE name LIKE '%JK A4%' OR name LIKE '%Copier Paper%' LIMIT 5");
  console.log('\n--- Items matching JK A4 Copier ---');
  console.table(items2);

  // Also check what order detail 51 actually has
  const od = await dataSource.query("SELECT od.item_name, od.stock_item_id, si.masterid, si.name FROM order_detail od LEFT JOIN stock_item si ON si.id = od.stock_item_id WHERE od.order_id = 51 LIMIT 5");
  console.log('\n--- Order #51 details ---');
  console.table(od);

  await dataSource.destroy();
}

check().catch(console.error);
