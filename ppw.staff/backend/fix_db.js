const mysql = require('mysql2/promise');

async function fixSchema() {
    const connection = await mysql.createConnection({
        host: '127.0.0.1',
        port: 3307,
        user: 'user',
        password: 'password',
        database: 'tally_sync'
    });

    try {
        console.log('Applying schema changes...');
        
        // 1. Add status column to order_detail
        try {
            await connection.execute("ALTER TABLE `order_detail` ADD COLUMN `status` VARCHAR(20) DEFAULT 'pending'");
            console.log('Added status column to order_detail');
        } catch (e) {
            console.log('status column already exists or error:', e.message);
        }

        // 2. Add source column to order
        try {
            await connection.execute("ALTER TABLE `order` ADD COLUMN `source` VARCHAR(20) DEFAULT 'admin'");
            console.log('Added source column to order');
        } catch (e) {
            console.log('source column already exists or error:', e.message);
        }

        // 3. Update order status enum
        try {
            // MySql might need a slightly different syntax for enum modification depending on version
            await connection.execute("ALTER TABLE `order` MODIFY COLUMN `status` ENUM('inedit', 'pending', 'completed', 'fetched') DEFAULT 'inedit'");
            console.log('Updated order status enum');
        } catch (e) {
            console.log('Error updating order enum:', e.message);
        }

        console.log('Schema update complete!');
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await connection.end();
    }
}

fixSchema();
