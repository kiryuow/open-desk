const express = require('express');
const app = require('./app');
const http = require('http').Server(app);
const io = require('socket.io')(http);
const { error } = require('console');
const mongoose = require('mongoose');
const nodemon = require('nodemon');
const connection = require('./database');
const path = require('path');
const bcrypt = require('bcrypt');
const apiRoutes = require('./routes/api');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

app.use('/api', apiRoutes);

app.set('view engine', 'ejs');

const sessionStore = new MySQLStore({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'kinki1412',
  database: 'open-desk',
  debug: true // デバッグを有効化
});

const sessionMiddleware = session({
  secret: '470eaaa52588ab5b04a6b91b37eb9a8473a25fb44ba1465ca079430b6e90b10d',
  resave: false,
  saveUninitialized: true,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: 'strict'
  }
});

app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));
// ExpressとSocket.IOで同一設定を共有
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});




const reservations = {}; // サーバー側で予約状況を管理

io.on('connection', async (socket) => {
  console.log('✅ ユーザーが接続しました');

  // `socket.request.session` の存在を確認
  if (!socket.request.session) {
    console.error('❌ `socket.request.session` が未定義です！');
    socket.emit('receiveUserInfo', { userId: null, username: 'ゲスト' });
    return;
  }

  const session = socket.request.session;

  if (!session.id) {
    console.error('❌ `sessionID` が未定義です！');
    socket.emit('receiveUserInfo', { userId: null, username: 'ゲスト' });
    return;
  }

  const sessionID = session.id;
  console.log('📂 `socket.request.sessionID`:', sessionID);

  try {
    sessionStore.get(sessionID, (err, sessionData) => {
      if (err) {
        console.error('❌ `sessionStore.get` エラー:', err);
        return;
      }

      console.log('📂 取得したセッションデータ:', sessionData);

      if (sessionData && sessionData.userId) {
        socket.emit('receiveUserInfo', {
          userId: sessionData.userId,
          username: sessionData.username,
        });
      } else {
        socket.emit('receiveUserInfo', { userId: null, username: 'ゲスト' });
      }
    });
  } catch (error) {
    console.error('❌ セッション取得エラー:', error);
  }

  // クライアントに現在の予約状況を送信
  socket.emit('currentReservations', reservations);

  // クライアントから予約変更を受け取る
  socket.on('reserve', async (data, callback) => {
    if (!socket.request.session || !socket.request.session.userId) {
      callback({ success: false, message: 'ログインが必要です。' });
      return;
    }

    const userId = socket.request.session.userId;
    const checkSql = 'SELECT id FROM reservations WHERE date = ? AND time = ?';

    connection.query(checkSql, [data.date, data.time], (err, results) => {
      if (err || results.length === 0) {
        callback({ success: false, message: '予約枠が存在しません。' });
        return;
      }

      const reservationId = results[0].id;

      const bookingSql = 'SELECT user_id FROM bookings WHERE reservation_id = ?';
      connection.query(bookingSql, [reservationId], (err, results) => {
        if (err) {
          callback({ success: false, message: '予約情報の取得に失敗しました。' });
          return;
        }

        // **bookResults が取得できるか確認**
        console.log("📌 取得した results:", results);

        let bookingUserId = results.length > 0 ? results[0].user_id : null;
        let updateSql, params;
        let newStatus = 'available'; // 初期値は available（後で更新）

        if (data.status === 'reserved') {
          updateSql = 'INSERT INTO bookings (reservation_id, user_id) VALUES (?, ?)';
          params = [reservationId, userId];
          newStatus = 'reserved'; // 予約成功 → 'reserved' に変更
        } else if (bookingUserId === userId) {
          updateSql = 'DELETE FROM bookings WHERE reservation_id = ? AND user_id = ?';
          params = [reservationId, userId];
          newStatus = 'available';
        } else {
          callback({ success: false, message: '他のユーザーの予約の取り消しはできません。' });
          return;
        }

        connection.query(updateSql, params, (err, result) => {
          if (err) {
            callback({ success: false, message: '予約の更新に失敗しました。' });
            return;
          }

          // **reservationsテーブルのstatusを更新**
          const statusUpdateSql = 'UPDATE reservations SET status = ? WHERE id = ?';
          connection.query(statusUpdateSql,
            [newStatus, reservationId],
            (err, result) => {
              if (err) {
                console.error('❌ reservationsテーブルの更新エラー:', err);
                callback({ success: false, message: '予約の状態更新に失敗しました。' });
                return;
              }

              io.emit('updateReservation', {
                date: data.date,
                time: data.time,
                status: newStatus === 'reserved' ? 'unavailable' : 'available',
                userId: data.status === 'reserved' ? userId : null,
              });

              callback({ success: true });
            });
        });
      });
    });
  });
});

// ログイン状況をクライアント側に表示
app.use((req, res, next) => {
  if (req.session.userId === undefined) {
    res.locals.username = 'ゲスト';
    res.locals.isLoggedIn = false;
  } else {
    res.locals.username = req.session.username;
    res.locals.isLoggedIn = true;
  }
  next();
});

app.use((req, res, next) => {
  console.log('🌍 HTTPリクエスト時のセッションID:', req.sessionID);
  next();
});

app.get('/', (req, res) => {
  res.render('index.ejs');
});

app.get('/individual', (req, res) => {
  res.render('individual.ejs');
});

app.get('/facility', (req, res) => {
  res.render('facility.ejs');
});

app.get('/price', (req, res) => {
  res.render('price.ejs');
});

app.get('/contact', (req, res) => {
  res.render('contact.ejs', { successMessage: null, errorMessage: null });
});

require('dotenv').config(); // 環境変数を読み込む
const nodemailer = require('nodemailer');

// メール送信用のトランスポーターを作成
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// お問い合わせフォーム送信処理
app.post('/contact', (req, res) => {
  const { email, message } = req.body;
  const userId = req.session.userId || null; // ログインしている場合はuserIdを取得

  let errorMessage = null;

  // バリデーションチェック
  if (!email || !message) {
    errorMessage = 'メールアドレスとお問い合わせ内容は必須です。';
  } else if (!email.includes('@')) {
    errorMessage = '正しいメールアドレスを入力してください。';
  }

  if (errorMessage) {
    return res.render('contact.ejs', { successMessage: null, errorMessage });
  }

  // **1. データベースに保存**
  const sql = 'INSERT INTO contacts (user_id, mail_address, content) VALUES (?, ?, ?)';
  connection.query(sql, [userId, email, message], (err, result) => {
    if (err) {
      console.error('データベース保存エラー:', err);
      return res.status(500).send('エラーが発生しました');
    }

    console.log('✅ お問い合わせ内容が保存されました');

    // **2. メール通知を送信**
    const mailOptions = {
      from: process.env.MAIL_USER,
      to: 'inuifantasista@gmail.com', // 管理者のメールアドレス
      subject: '新しいお問い合わせが届きました',
      text: `新しいお問い合わせが届きました。\n\n【メールアドレス】\n${email}\n\n【内容】\n${message}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('メール送信エラー:', error);
        return res.render('contact.ejs', { successMessage: null, errorMessage: 'お問い合わせは保存されましたが、メール送信に失敗しました。' });
      }

      console.log('✅ メールが送信されました:', info.response);
      res.render('contact.ejs', { successMessage: 'お問い合わせが送信されました。', errorMessage: null });
    });
  });
});

app.get('/signup', (req, res) => {
  const errors = [];
  res.render('signup.ejs', {errors: errors});
});

app.post('/signup',
  // いずれかの項目に空がないかチェック
  (req, res, next) => {
    const username = req.body.username;
    const mail = req.body.mail;
    const password = req.body.password;
    const errors = [];

    if (username === '') {
      errors.push('ユーザー名が空です');
    }
    if (mail === '') {
      errors.push('メールアドレスが空です');
    } else if (!mail.includes('@')) {
      errors.push('メールアドレスの形式が正しくありません');
    }
    if (password === '') {
      errors.push('パスワードが空です');
    } else if (password.length < 5) {
      errors.push('パスワードが短すぎます');
    }

    if (errors.length > 0) {
      return res.render('signup.ejs', { title: '枚方の個人塾', errors: errors });
    } else {
      next();
    }
  },

  // メールアドレスに重複がないかチェック
  (req, res, next) => {
    const mail = req.body.mail;
    const errors = [];
    connection.query(
      'SELECT * FROM users WHERE mail_address = ?',
      [mail],
      (error, results) => {
        if (results.length > 0) {
          errors.push('このメールアドレスは既に登録されています');
          res.render('signup.ejs', { errors: errors });
        } else {
          next();
        }
      }
    );
  },

  // 各項目を登録＆パスワードをハッシュ化
  (req, res) => {
    const username = req.body.username;
    const mail = req.body.mail;
    const password = req.body.password;
    bcrypt.hash(password, 10, (error, hash) => {
      connection.query(
        'INSERT INTO users (username, mail_address, password) VALUE (?, ?, ?)',
        [username, mail, hash],
        (error, results) => {
          req.session.userId = results.insertId;
          req.session.username = username;
          res.redirect('/reservation');
        }
      );
    });
  });

app.get('/login', (req, res) => {
  if (req.session.userId) {
    // すでにログイン済みなら予約ページへリダイレクト
    return res.redirect('/reservation');
  }
  res.render('login.ejs');
});


app.post('/login', (req, res) => {
  const mail = req.body.mail;
  const password = req.body.password;
  connection.query(
    'SELECT * FROM users WHERE mail_address = ?',
    [mail],
    (error, results) => {
      if (results.length > 0) {
        const plain = req.body.password;
        const hash = results[0].password;
        bcrypt.compare(plain, hash, (error, isEqual) => {
          if (isEqual) {
            req.session.userId = results[0].id;
            req.session.username = results[0].username;

            req.session.save((err) => { // 明示的にセッションを保存
              if (err) console.error('セッション保存エラー:', err);
              console.log('✅ セッションが正常に保存されました:', req.session);
              res.redirect('/reservation');

            });
          } else {
            res.redirect('/login');
          }
        });
      } else {
        res.redirect('/login');
      }
    }
  );
});

app.get('/logout', (req, res) => {
  req.session.destroy((error) => {
    res.redirect('/');
  });
});

app.get('/reservation', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  // フォーマット作成
  // 曜日フォーマット
  const week = ['日', '月', '火', '水', '木', '金', '土'];
  // 時間フォーマット
  const timeSlots = Array.from({ length: 14 }, (_, i) => {
    const hour = 9 + i;
    return `${hour.toString().padStart(2, '0')}:00:00`; // HH:MM:SS フォーマット
  });

  // 日にちフォーマット
  const weekOffset = parseInt(req.query.weekOffset || '0', 10);
  const currentDate = new Date();
  const startDate = new Date(currentDate.setDate(currentDate.getDate() + weekOffset * 7));
  const startOfWeek = formatDate(startDate);
  const endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000); // 6日後
  const endOfWeek = formatDate(endDate);

  const sql = `
    SELECT r.date, r.time, r.status, b.user_id
    FROM reservations r
    LEFT JOIN bookings b ON r.id = b.reservation_id
    WHERE r.date BETWEEN ? AND ?
  `;

  connection.query(
    sql,
    [startOfWeek, endOfWeek],
    (err, results) => {
      if (err) {
        console.error('データベースクエリエラー:', err);
        res.status(500).send('データベースエラー');
        return;
      }

      console.log('📌 取得した予約データ:', results); // **デバッグ用**

      // 予約状況を表示する
      const reservations = {};
      for (let i = 0; i < 7; i++) {
        const dateObj = addDays(startDate, i);
        const dayKey = formatDate(dateObj)
        reservations[dayKey] = {};

        // **時間ごとのデフォルト値をセット**
        timeSlots.forEach((time) => {
          const timeKey = time.slice(0, 5);
          reservations[dayKey][timeKey] = {
            class: 'unavailable',
            symbol: '×',
            dateValue: dayKey
          };
        });
      }

      // **取得した予約データで上書き**
      results.forEach((row) => {
        const reservationDate = formatDate(new Date(row.date));
        const timeKey = row.time.slice(0, 5);

        if (reservations[reservationDate] && reservations[reservationDate][timeKey]) {
          if (row.status === 'available') {
            reservations[reservationDate][timeKey] = {
              class: 'available',
              symbol: '〇',
              dateValue: reservationDate,
            };
          } else if (row.status === 'reserved') {
            reservations[reservationDate][timeKey] = {
              class: 'reserved',
              symbol: row.user_id === req.session.userId ? '予' : '×',
              dateValue: reservationDate,
            };
          }
        }
      });

      console.log('📌 取得した予約データ:', results); // **デバッグ用**

      res.render('reservation', {
        title: '予約ページ',
        month: startDate.getMonth() + 1,
        week,
        timeSlots: timeSlots.map((t) => t.slice(0, -3)), // HH:MM に変換
        reservations,
        weekOffset,
        userId: req.session.userId || null // ログインユーザーのIDを渡す
      });
    });
});


// ユーティリティ関数: 日付を指定形式に変換
function formatDate(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ユーティリティ関数: 指定日数を加算
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

app.post('/reservation', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: 'ログインしてください' });
  }

  const { date, time } = req.body; // フロントエンドから送信された日付と時間
  const userId = req.session.userId; // ログイン中のユーザーのID

  // 指定された日時の予約情報を取得
  const checkSql = 'SELECT status, user_id FROM reservations WHERE date = ? AND time = ?';
  connection.query(checkSql, [date, time], (err, results) => {
    if (err) {
      console.error('予約確認エラー:', err);
      return res.status(500).json({ success: false, message: '予約の確認に失敗しました' });
    }

    if (results.length === 0) {
      // 予約枠が存在しない場合は何もしない（INSERT しない）
      return res.status(400).json({ success: false, message: '予約枠が存在しません' });
    }

    const { status, user_id } = results[0];

    let sql, params;

    if (status === 'available') {
      // 「〇」を押した場合：「予（reserved）」に変更
      sql = 'UPDATE reservations SET status = ?, user_id = ? WHERE date = ? AND time = ?';
      params = ['reserved', userId, date, time];
    } else if (status === 'reserved' && user_id === userId) {
      // 「予」を押した場合（同じユーザーが押した場合）：「〇（available）」に戻す
      sql = 'UPDATE reservations SET status = ?, user_id = NULL WHERE date = ? AND time = ?';
      params = ['available', date, time];
    } else if (status === 'reserved' && user_id !== userId) {
      // 他のユーザーが予約済みの場合は「×（unavailable）」に変更
      sql = 'UPDATE reservations SET status = ? WHERE date = ? AND time = ?';
      params = ['unavailable', date, time];
    } else {
      return res.status(403).json({ success: false, message: '操作が許可されていません' });
    }

    // 予約ステータスを更新
    connection.query(sql, params, (err, result) => {
      if (err) {
        console.error('予約更新エラー:', err);
        return res.status(500).json({ success: false, message: '予約の更新に失敗しました' });
      }

      // 変更後のステータスをクライアントに送信
      res.json({ success: true, newStatus: params[0] });
    });
  });
});

app.get('/reserved', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login'); // ログインしていない場合はログインページへ
  }

  const userId = req.session.userId;

  const sql = `
      SELECT r.date, r.time, b.updated_at 
      FROM bookings b
      JOIN reservations r ON b.reservation_id = r.id
      WHERE b.user_id = ?;
  `;

  connection.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("❌ データ取得エラー:", err);
      return res.status(500).send("データ取得に失敗しました");
    }

    console.log("📌 取得した予約データ:", results);

    const reservations = results.map(row => ({
      date: row.date,
      time: row.time,
      dateFormatted: new Date(row.date).toLocaleDateString('ja-JP'), // 日本語形式の日付
    }));

    res.render('reserved', { reservations });
  });
});

const PORT = process.env.PORT || 5000;

http.listen(PORT, () => {
  console.log('サーバーがポート ${PORT} で起動しました');
});