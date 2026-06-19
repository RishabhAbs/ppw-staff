
import { DataSource } from 'typeorm';
import { Order } from '../entities/order.entity';
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
  entities: [Order, User],
});

async function check() {
  await dataSource.initialize();
  const orders = await dataSource.getRepository(Order).find({ relations: ['creator'] });
  console.log('Total Orders:', orders.length);
  const byUser: any = {};
  orders.forEach(o => {
    const uname = o.creator?.username || 'unknown';
    byUser[uname] = (byUser[uname] || 0) + 1;
  });
  console.log('Orders by User:', byUser);
  await dataSource.destroy();
}
check();
