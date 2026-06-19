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
        
        console.log('Purging all Online Orders...');
        // Delete Details (Cascade-like manually)
        await db.execute('DELETE FROM order_detail WHERE orderId IN (SELECT id FROM `order` WHERE source = "online")');
        const [res1] = await db.execute('DELETE FROM `order` WHERE source = "online"');
        console.log(`Deleted ${res1.affectedRows} orders with source="online".`);

        console.log('Purging test records for Jai Jha, vj, aadit...');
        await db.execute('DELETE FROM order_detail WHERE orderId IN (SELECT id FROM `order` WHERE customer_name IN ("Jai Jha", "Jai Jha (Real Test)", "vj", "aadit"))');
        const [res2] = await db.execute('DELETE FROM `order` WHERE customer_name IN ("Jai Jha", "Jai Jha (Real Test)", "vj", "aadit")');
        console.log(`Deleted ${res2.affectedRows} additional test orders.`);

        console.log('Purging explicitly dummy stock (Apple, Banana, etc.)...');
        const [res3] = await db.execute('DELETE FROM stock_item WHERE name IN ("Apple", "Banana", "Orange", "Item 1", "Item 2", "Item 3") OR name LIKE "Product A%" OR name LIKE "Test %"');
        console.log(`Deleted ${res3.affectedRows} dummy stock items.`);

        console.log('Purging test users...');
        const [res4] = await db.execute('DELETE FROM user WHERE username IN ("test", "testuser", "demo", "jaijha")');
        console.log(`Deleted ${res4.affectedRows} test users.`);
        
        await db.end();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
