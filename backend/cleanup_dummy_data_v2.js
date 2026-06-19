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
        
        console.log('Cleaning up remaining dummy Stock Items...');
        const [res] = await db.execute('DELETE FROM stock_item WHERE name IN ("Apple", "Banana", "Orange", "Item 1", "Item 2", "Item 3") OR name LIKE "Product %" OR name LIKE "Test %"');
        console.log(`Deleted ${res.affectedRows} dummy stock items.`);

        console.log('Cleaning up dummy Ledgers...');
        const [res2] = await db.execute('DELETE FROM ledger WHERE name LIKE "Test %" OR name LIKE "Dummy %"');
        console.log(`Deleted ${res2.affectedRows} dummy ledgers.`);
        
        await db.end();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
