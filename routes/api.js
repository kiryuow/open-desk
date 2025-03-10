const express = require('express');
const router = express.Router();
const connection = require('../database'); // server.jsからデータベース接続を取得

// 予約データを取得するAPI
router.get('/reservations', (req, res) => {
  const sql = 'SELECT * FROM reservations ORDER BY date, time';
  connection.query(sql, (err, results) => {
    if (err) {
      console.error('データ取得エラー:', err);
      return res.status(500).json({ error: 'データ取得エラー' });
    }
    res.json(results);
  });
});

// 予約データを更新するAPI
router.post('/reservations', (req, res) => {
  const { date, time, status, userId } = req.body;
  const sql = 'UPDATE reservations SET status = ?, user_id = ? WHERE date = ? AND time = ?';
  connection.query(sql, [status, userId, date, time], (err) => {
    if (err) {
      console.error('データ更新エラー:', err);
      return res.status(500).json({ error: 'データ更新エラー' });
    }
    res.json({ message: '予約が更新されました' });
  });
});

// 管理者が予約を変更するAPI
router.post('/admin/reservations', (req, res) => {
  const { date, time, status } = req.body;
  const sql = 'UPDATE reservations SET status = ? WHERE date = ? AND time = ?';
  connection.query(sql, [status, date, time], (err) => {
    if (err) return res.status(500).json({ error: '更新エラー' });
    res.json({ message: '予約可能状態が更新されました' });
  });
});


module.exports = router;
