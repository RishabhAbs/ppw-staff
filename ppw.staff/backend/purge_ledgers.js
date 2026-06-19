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
        
        console.log('Checking for dummy ledgers...');
        const [ledgers] = await db.execute('SELECT id, name FROM ledger WHERE name LIKE "%Test%" OR name LIKE "%Dummy%"');
        console.log(JSON.stringify(ledgers, null, 2));

        if (ledgers.length > 0) {
            console.log('Purging dummy ledgers...');
            const ids = ledgers.map(l => l.id);
            // Before deleting ledger, we must check if it is referenced in order table
            const [orders] = await db.execute(`SELECT id FROM \`order\` WHERE ledgerId IN (${ids.join(',')})`);
            if (orders.length > 0) {
                const orderIds = orders.map(o => o.id);
                await db.execute(`DELETE FROM order_detail WHERE orderId IN (${orderIds.join(',')})`);
                await db.execute(`DELETE FROM \`order\` WHERE id IN (${orderIds.join(',')})`);
            }
            await db.execute(`DELETE FROM ledger WHERE id IN (${ids.join(',')})`);
            console.log(`Deleted ${ledgers.length} dummy ledgers.`);
        }
        
        await db.end();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
main();
