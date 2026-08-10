const mysql = require('mysql2');

const pool = mysql.createPool({
    host: '160.153.172.237',
    user: 'clickorbtits',
    password: 'Clickorbits@123',
    database: 'crmclickorbits',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});


// Export the promise-based pool
const db = pool.promise();

module.exports = db;

