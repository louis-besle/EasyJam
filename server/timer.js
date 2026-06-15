let timeoutId = null;

function startTimer(room, onSkip) {
  stopTimer();
  if (!room.current || !room.current.track) return;
  const position = room.isPlaying
    ? (Date.now() - room.current.startedAt) / 1000 + room.current.position
    : room.current.position;
  const remaining = (room.current.track.duration - position) * 1000;
  if (remaining <= 0) {
    if (typeof onSkip === 'function') onSkip(room);
    return;
  }
  timeoutId = setTimeout(() => {
    timeoutId = null;
    if (typeof onSkip === 'function') onSkip(room);
  }, remaining + 1000);
}

function stopTimer() {
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}

module.exports = { startTimer, stopTimer };
