const mysql = require('mysql2/promise');

(async () => {
    try {
        const conn = await mysql.createConnection({
            host: '127.0.0.1',
            port: 3307,
            user: 'root',
            password: 'password', // Assumed from previous
            database: 'tally_sync'
        });

        // 1. Create Test User
        // Check if exists first
        const [users] = await conn.execute("SELECT id FROM user WHERE username = 'test_creator'");
        let userId;
        
        if (users.length > 0) {
            userId = users[0].id;
            console.log(`User 'test_creator' exists with ID: ${userId}`);
        } else {
            const [result] = await conn.execute("INSERT INTO user (username, password, name, role) VALUES ('test_creator', 'pass', 'Mr. Test Creator', 'admin')");
            userId = result.insertId;
            console.log(`Created User 'test_creator' with ID: ${userId}`);
        }

        // 2. Create Order linked to this user
        // We'll just update Order 1 to be owned by this user
        await conn.execute("UPDATE `order` SET created_by = ? WHERE id = 1", [userId]);
        console.log(`Updated Order 1 to be created by User ID: ${userId}`);
        
        // Ensure Order 1 is pending
        await conn.execute("UPDATE `order` SET status = 'pending' WHERE id = 1");
        console.log(`Ensured Order 1 is pending`);

        await conn.end();
    } catch (err) {
        console.error("Error:", err.message);
    }
})();
