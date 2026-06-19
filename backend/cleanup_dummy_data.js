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
        
        console.log('Cleaning up dummy orders...');
        // Delete details first due to foreign key
        await db.execute('DELETE FROM order_detail WHERE orderId IN (SELECT id FROM `order` WHERE customer_name LIKE "%Jai Jha%" OR customer_name LIKE "%Test%")');
        const [res] = await db.execute('DELETE FROM `order` WHERE customer_name LIKE "%Jai Jha%" OR customer_name LIKE "%Test%"');
        console.log(`Deleted ${res.affectedRows} dummy orders.`);

        console.log('Cleaning up dummy stock (if any)...');
        const [res2] = await db.execute('DELETE FROM stock_item WHERE name LIKE "%Product A%" OR name LIKE "%Test Item%"');
        console.log(`Deleted ${res2.affectedRows} dummy stock items.`);
        
        await db.end();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
