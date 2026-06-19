const mysql = require('mysql2/promise');
async function main() {
    try {
        const db = await mysql.createConnection({
            host: 'localhost',
            port: 3307,
            user: 'user',
            password: 'password',
            database: 'tally_sync'
        });
        
        console.log('Dumping ORDERS:');
        const [orders] = await db.execute('SELECT * FROM `order`');
        console.log(JSON.stringify(orders, null, 2));

        console.log('Dumping STOCK:');
        const [stock] = await db.execute('SELECT * FROM stock_item');
        console.log(JSON.stringify(stock, null, 2));

        await db.end();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
