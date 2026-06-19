const mysql = require('mysql2/promise');

(async () => {
    try {
        const conn = await mysql.createConnection({
            host: '127.0.0.1',
            port: 3307,
            user: 'root',
            password: 'password',
            database: 'tally_sync'
        });
        
        // Use backticks for table name order
        await conn.execute("UPDATE `order` SET status = 'pending' WHERE id = 1");
        console.log('Reset Order 1 to pending');
        await conn.end();
    } catch (err) {
        console.error(err);
    }
})();
