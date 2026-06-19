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
        const [rows] = await db.execute('SELECT id, customer_name, total_amount, source FROM `order`');
        console.log(JSON.stringify(rows, null, 2));
        await db.end();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
