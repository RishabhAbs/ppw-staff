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
        
        console.log('Checking recent orders...');
        const [orders] = await db.execute('SELECT * FROM `order` ORDER BY id DESC LIMIT 5');
        console.log(JSON.stringify(orders, null, 2));

        const [details] = await db.execute('SELECT * FROM order_detail ORDER BY id DESC LIMIT 5');
        console.log('Recent order details:');
        console.log(JSON.stringify(details, null, 2));
        
        await db.end();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
