const mysql = require('mysql2/promise');
require('dotenv').config({ path: './.env' });

async function cleanup() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT || 3307,
        user: process.env.DB_USERNAME || 'root',
        password: process.env.DB_PASSWORD || 'password',
        database: process.env.DB_NAME || 'tally_sync'
    });

    console.log("🛠️ Starting Data Cleanup...");
    try {
        // Attribute null created_by to admin2 (We'll look up admin2 ID first to be safe, but it's likely 3)
        const [users] = await connection.execute('SELECT id FROM user WHERE username = "admin2" LIMIT 1');
        if (users.length > 0) {
            const adminId = users[0].id;
            const [result] = await connection.execute('UPDATE `order` SET created_by = ? WHERE created_by IS NULL', [adminId]);
            console.log(`✅ Attributed ${result.affectedRows} orphaned orders to user ID ${adminId}`);
        } else {
            console.log("❌ User 'admin2' not found");
        }
    } catch (e) {
        console.error("❌ Cleanup failed", e);
    } finally {
        await connection.end();
    }
}

cleanup();
