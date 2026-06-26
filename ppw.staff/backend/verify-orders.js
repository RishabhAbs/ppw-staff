
const mysql = require('mysql2/promise');
require('dotenv').config({ path: 'd:/abs/abs/ppw/backend/.env' });

async function main() {
    console.log('Connecting to DB on port:', process.env.DB_PORT);
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        const [orders] = await connection.query('SELECT id, bill_number, remark, created_at, status, total_amount FROM `order` ORDER BY id DESC LIMIT 15');
        console.log('--- Last 15 Orders ---');
        console.table(orders);

        for (const order of orders) {
            const [details] = await connection.query('SELECT count(*) as itemCount FROM order_detail WHERE orderId = ?', [order.id]);
            console.log(`Order #${order.id} (${order.remark}) has ${details[0].itemCount} items. Amount: ${order.total_amount}`);
        }
    } catch (err) {
        console.error('Query failed:', err);
    } finally {
        await connection.end();
    }
}

main();
