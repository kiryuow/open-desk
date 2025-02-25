const mysql = require('mysql');

const connection = mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',
  password: 'kinki1412',
  database: 'open-desk',
  port: 3306, // ポート番号を明示的に指定
  timezone: 'Asia/Tokyo',
  multipleStatements: true // 複数のSQLクエリを1回で実行可能
});

connection.connect(err => {
  if (err) {
    console.error('MySQL connection failed:', err.stack);
    return;
  }
  console.log('Connected to MySQL as ID', connection.threadId);
});

module.exports = connection;