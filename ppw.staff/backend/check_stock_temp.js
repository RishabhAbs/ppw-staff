const mysql = require('mysql2/promise');

async function checkStock() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: 'password',
    database: 'tally_sync'
  });

  try {
    const [rows] = await connection.execute('SELECT COUNT(*) as count FROM stock_item');
    console.log(`Total stock items in DB: ${rows[0].count}`);

    const [samples] = await connection.execute('SELECT id, masterid, name, parent FROM stock_item LIMIT 5');
    console.log('Sample records:', JSON.stringify(samples, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await connection.end();
  }
}

checkStock();
