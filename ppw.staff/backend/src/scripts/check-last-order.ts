import { DataSource } from 'typeorm';
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
});

async function checkLastOrder() {
  await dataSource.initialize();

  // Get last 3 orders
  const orders = await dataSource.query(
    "SELECT id, bill_number, customer_name, status, total_amount, created_at FROM `order` ORDER BY id DESC LIMIT 3"
  );
  console.log('\n--- Last 3 orders ---');
  console.table(orders);

  if (orders.length > 0) {
    const lastOrderId = orders[0].id;
    const details = await dataSource.query(
      `SELECT id, item_name, stock_item_id, barcode, quantity, rate, amount, gst FROM order_detail WHERE order_id = ${lastOrderId}`
    );
    console.log(`\n--- Details for order #${lastOrderId} ---`);
    if (details.length === 0) {
      console.log('NO ITEMS in this order!');
    } else {
      console.table(details);
    }
  }

  await dataSource.destroy();
}

checkLastOrder().catch(console.error);
