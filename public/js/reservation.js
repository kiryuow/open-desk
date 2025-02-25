const socket = io({
  withCredentials: true
});

socket.on('connect', () => {
  console.log('✅ Socket.io に接続しました:', socket.id);
  socket.emit('requestUserInfo');
});

let currentUserId = null;

socket.on('receiveUserInfo', (data) => {
  console.log('📩 `receiveUserInfo` を受信:', data);
  currentUserId = data.userId;
});

document.querySelector('table').addEventListener('click', (e) => {
  const cell = e.target;
  if (!cell.dataset.date || !cell.dataset.time) return;

  const date = cell.dataset.date;
  const time = cell.dataset.time;

  if (currentUserId === null) {
    alert('ログイン情報を取得中です。もう一度試してください。');
    return;
  }

  const isReserved = cell.classList.contains('reserved');
  const confirmMessage = isReserved ? '予約を取り消しますか？' : '予約しますか？';

  if (confirm(confirmMessage)) {
    socket.emit('reserve', { date, time, status: isReserved ? 'available' : 'reserved', userId: currentUserId }, (response) => {
      if (response.success) {
        alert(isReserved ? '予約を取り消しました' : '予約が完了しました');
        window.location.href = '/reserved';
      } else {
        alert(response.message);
      }
    });
  }
});

socket.on('updateReservation', (data) => {
  const cell = document.querySelector(`[data-date="${data.date}"][data-time="${data.time}"]`);
  if (!cell) return;

  if (data.status === 'reserved') {
    // 「〇」を押して予約したら、誰も押せない「×」状態にする
    cell.className = 'unavailable';
    cell.textContent = '×';
  } else if (data.status === 'available') {
    cell.className = 'available';
    cell.textContent = '〇';
  }
});
