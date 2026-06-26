
const axios = require('axios');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function runStressTest() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        console.log('Fetching stock items...');
        const [items] = await connection.query(`
            SELECT 
                name, 
                ats_barcode as barcode, 
                masterid as stock_item_id, 
                base_units as unit, 
                CAST(default_mrp AS DECIMAL(10,2)) as rate, 
                \`group\`, 
                parent, 
                category 
            FROM stock_item 
            WHERE ats_barcode IS NOT NULL AND ats_barcode != ''
            LIMIT 500
        `);

        console.log(`Found ${items.length} items.`);

        const [ledgers] = await connection.query("SELECT id FROM ledger WHERE name = 'CASH' LIMIT 1");
        const ledgerId = ledgers[0]?.id || 13370;
        console.log(`Using Ledger ID: ${ledgerId}`);

        const API_URL = `http://localhost:${process.env.PORT || 3000}/api/orders`;

        for (let o = 1; o <= 10; o++) {
            console.log(`Creating Order #${o}...`);
            const shuffled = [...items].sort(() => 0.5 - Math.random());
            const selectedItems = shuffled.slice(0, 50).map(it => {
                const quantity = Math.floor(Math.random() * 5) + 1;
                const rate = parseFloat(it.rate) || 10.0;
                return {
                    name: it.name,
                    barcode: it.barcode,
                    stock_item_id: it.stock_item_id,
                    unit: it.unit || 'Pcs',
                    rate: rate,
                    quantity: quantity,
                    amount: rate * quantity,
                    gst: 18.0,
                    selected_scheme: 'Rate 1',
                    selected_discount: 0,
                    livestock_type: 'Shop',
                    parent: it.parent || '',
                    group: it.group || '',
                    category: it.category || ''
                };
            });

            const totalAmount = selectedItems.reduce((sum, i) => sum + i.amount, 0);

            const payload = {
                ledger_id: ledgerId,
                date: new Date().toISOString().split('T')[0],
                total_amount: totalAmount.toFixed(2),
                items: selectedItems,
                created_by: 1,
                order_type: 'Tax Invoice',
                remark: `Stress Test Order #${o}`,
                amount_given: totalAmount.toFixed(2)
            };

            try {
                const response = await axios.post(API_URL, payload);
                console.log(`Order #${o} saved. ID: ${response.data.orderId}`);
            } catch (err) {
                console.error(`Order #${o} failed. Details:`, JSON.stringify(err.response?.data || err.message, null, 2));
            }
        }
    } catch (error) {
        console.error('Stress test crashed:', error);
    } finally {
        await connection.end();
    }
}

runStressTest();
