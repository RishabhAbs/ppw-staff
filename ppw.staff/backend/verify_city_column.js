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
    const [rows] = await conn.execute('SHOW COLUMNS FROM `order` LIKE "customer_city"');
    if (rows.length > 0) {
        console.log('Verification Success: column `customer_city` is present.');
    } else {
        console.log('Verification Failed: column `customer_city` is still missing.');
    }
    await conn.end();
  } catch (e) {
    console.error('Error:', e.message);
  }
  process.exit(0);
})();
