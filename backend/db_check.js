
const mysql = require('mysql2');
const connection = mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'password',
    database: 'tally_sync',
    port: 3307
});

const query = `
    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_KEY, EXTRA 
    FROM information_schema.columns 
    WHERE table_schema = 'tally_sync' 
    AND table_name IN ('stock_item', 'order_detail')
    ORDER BY table_name, ordinal_position;
`;

connection.query(query, (err, result) => {
    if (err) {
        console.error(err);
    } else {
        console.log(JSON.stringify(result, null, 2));
    }
    connection.end();
});
