require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    console.log('Connecting to database...');
    console.log(`Host: ${process.env.DB_HOST}`);
    console.log(`User: ${process.env.DB_USERNAME}`);
    console.log(`DB:   ${process.env.DB_NAME}`);

    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 3306,
            user: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });
        
        console.log('Connected!');

        // Check if admin exists
        const [rows] = await conn.execute("SELECT * FROM user WHERE username = 'admin'");
        
        if (rows.length === 0) {
            console.log('Admin user not found. Creating...');
            // Insert plain text 'password'. The app will hash it on first login.
            await conn.execute(
                "INSERT INTO user (username, password, role, name, `number`, permissions) VALUES (?, ?, ?, ?, ?, ?)",
                ['admin', 'password', 'admin', 'System Admin', '9999999999', '{}']
            );
            console.log('SUCCESS: Admin user created. Login with: admin / password');
        } else {
            console.log('Admin user exists. Resetting password...');
            await conn.execute("UPDATE user SET password = 'password' WHERE username = 'admin'");
            console.log('SUCCESS: Admin password reset to: password');
        }

        await conn.end();
    } catch (err) {
        console.error('ERROR:', err.message);
    }
})();
