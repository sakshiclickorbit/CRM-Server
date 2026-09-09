const mysql = require('mysql2');

const chatPool = mysql.createPool({
  host:             process.env.CHAT_DB_HOST     || process.env.DB_HOST || 'localhost',
  port:             parseInt(process.env.CHAT_DB_PORT || process.env.DB_PORT || '3306'),
  user:             process.env.CHAT_DB_USER     || process.env.DB_USER || 'root',
  password:         process.env.CHAT_DB_PASSWORD || process.env.DB_PASSWORD || '',
  database:         process.env.CHAT_DB_NAME     || 'crm_chat',
  waitForConnections: true,
  connectionLimit:  5,   
  queueLimit:       20,
});

const chatDb = chatPool.promise();

chatPool.getConnection((err, conn) => {
  if (err) {
    console.warn(
      '⚠️  [ChatDB] Could not connect to chat database — password sync will be skipped:',
      err.message
    );
  } else {
    console.log('✅ [ChatDB] Chat DB connected (for password sync)');
    conn.release();
  }
});

module.exports = chatDb;
