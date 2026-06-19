const mysql = require('mysql2/promise');
(async () => {
  try {
    const conn = await mysql.createConnection({
      host: 'localhost',
      port: 3307,
      user: 'user',
      password: 'password',
      database: 'tally_sync'
    });
    console.log('Connecting to database...');
    await conn.execute('ALTER TABLE `order` ADD COLUMN `customer_city` VARCHAR(255) NULL AFTER `customer_pincode`');
    console.log('Column `customer_city` added successfully');
    await conn.end();
  } catch (e) {
    if (e.message.includes('Duplicate column name')) {
        console.log('Column `customer_city` already exists');
    } else {
        console.error('Error:', e.message);
    }
  }
  process.exit(0);
})();
