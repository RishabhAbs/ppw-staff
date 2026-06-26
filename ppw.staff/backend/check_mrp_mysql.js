
const mysql = require('mysql2/promise');

async function checkItem() {
    console.log('Connecting to database with credentials from .env...');
    const connection = await mysql.createConnection({
        host: '127.0.0.1',
        port: 3307,
        user: 'root',
        password: 'password',
        database: 'tally_sync'
    });

    try {
        console.log('Querying for ITEM: 000041 999 CONFERENCE FILE');
        const [rows] = await connection.execute(
            'SELECT id, name, default_mrp, rate_1, rate_2, rate_3, rate_3a FROM stock_item WHERE name LIKE ?',
            ['%CONFERENCE FILE%']
        );

        console.log('Stock Items Found:', JSON.stringify(rows, null, 2));
    } catch (err) {
        console.error('Error querying database:', err);
    } finally {
        await connection.end();
    }
}

checkItem().catch(console.error);
