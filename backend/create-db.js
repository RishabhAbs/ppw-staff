const mysql = require('mysql2/promise');

async function createDb() {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            port: 3307,
            user: 'root',
            password: 'password',
        });

        await connection.query('CREATE DATABASE IF NOT EXISTS tally_sync');
        console.log('Database `tally_sync` created successfully (or already exists).');
        await connection.end();
    } catch (error) {
        console.error('Error creating database:', error.message);
        process.exit(1);
    }
}

createDb();
