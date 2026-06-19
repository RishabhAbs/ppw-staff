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
    const [rows] = await conn.execute('DESCRIBE `order`');
    console.log(JSON.stringify(rows, null, 2));
    await conn.end();
  } catch (e) {
    console.error(e.message);
  }
})();
