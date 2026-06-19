import { DataSource } from 'typeorm';
import { User } from '../entities/user.entity';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3307', 10), // Noted 3307 is active in .env
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'tally_sync',
  entities: [User],
  synchronize: false,
});

async function restoreAdmin() {
  try {
    console.log('--- Restoring Admin User ---');
    await dataSource.initialize();
    const userRepository = dataSource.getRepository(User);

    const username = 'admin';
    const password = 'password';

    let admin = await userRepository.findOne({ 
      where: { username: 'admin' } 
    });

    if (!admin) {
      console.log('Admin user missing. Creating...');
      admin = new User();
      admin.username = username;
      admin.name = 'Administrator';
      admin.role = 'admin';
    } else {
      console.log('Admin user exists. Updating password...');
    }

    const salt = await bcrypt.genSalt();
    admin.password = await bcrypt.hash(password, salt);

    await userRepository.save(admin);
    console.log(`Successfully restored user "${username}" with password "${password}"`);

  } catch (error) {
    console.error('Failed to restore admin:', error);
  } finally {
    await dataSource.destroy();
  }
}

restoreAdmin();
