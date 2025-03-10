const socket = io({
  withCredentials: true
});

socket.on('connect', () => {
  console.log('✅ Socket.io に接続しました:', socket.id);
  socket.emit('requestUserInfo');
});

document.querySelectorAll('.cancel-btn').forEach(button => {
  button.addEventListener('click', (e) => {
    const date = e.target.dataset.date;
    const time = e.target.dataset.time;

    if (confirm('予約を取り消しますか？')) {
      socket.emit('reserve', { date, time, status: 'available', userId: null }, (response) => {
        if (response.success) {
          e.target.closest('tr').remove(); // 予約リストから削除
          socket.emit('updateReservation', { date, time, status: 'available' });
        } else {
          alert(response.message);
        }
      });
    }
  });
});

socket.on('updateReservation', (data) => {
  const cell = document.querySelector(`[data-date="${data.date}"][data-time="${data.time}"]`);
  if (!cell) return;

  cell.className = data.status === 'available' ? 'available' : 'reserved';
  cell.textContent = data.status === 'available' ? '〇' : '×';
});
