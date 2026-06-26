const mysql = require('mysql2/promise');

async function checkStructure() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1',
        port: 3307,
        user: 'user',
        password: 'password',
        database: 'tally_sync'
    });

    try {
        const [orderCols] = await connection.execute("DESCRIBE `order`");
        console.log('Order Columns:', orderCols.map(c => c.Field));

        const [detailCols] = await connection.execute("DESCRIBE `order_detail`");
        console.log('OrderDetail Columns:', detailCols.map(c => c.Field));
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await connection.end();
    }
}

checkStructure();
