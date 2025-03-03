require('dotenv').config();
const mysql = require('mysql');

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  timezone: 'Asia/Tokyo',
  multipleStatements: true,
  ssl: {
    rejectUnauthorized: false // Render内部の場合はfalseで大丈夫です
  }
});

connection.connect(err => {
  if (err) {
    console.error('❌ MySQL connection failed:', err.stack);
    return;
  }
  console.log('✅ Connected to Render MySQL as ID', connection.threadId);
});

module.exports = connection;
