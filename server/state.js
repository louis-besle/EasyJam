const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const QUEUE_FILE = process.env.EASYJAM_QUEUE_FILE || path.join(__dirname, '..', 'queue.json');

function createRoom() {
  return {
    queue: [],
    current: null,
    isPlaying: false,
    votesSkip: {},
    users: {},
    skipThreshold: 0.5,
    chatHistory: [],
    MAX_CHAT: 25,
    history: [],
    MAX_HISTORY: 50
  };
}

function addToQueue(room, { title, artist, duration, thumbnail, youtubeId, streamUrl, addedBy }) {
  const track = {
    id: uuidv4(),
    title,
    artist,
    duration,
    thumbnail,
    youtubeId,
    streamUrl,
    addedBy,
    addedAt: Date.now()
  };
  room.queue.push(track);
  saveQueue(room);
  return track;
}

function removeFromQueue(room, trackId) {
  const index = room.queue.findIndex(t => t.id === trackId);
  if (index === -1) return null;
  const removed = room.queue.splice(index, 1);
  saveQueue(room);
  return removed[0];
}

function playTrack(room, position = 0) {
  if (room.queue.length === 0) return null;
  const track = room.queue.shift();
  saveQueue(room);
  room.current = {
    track,
    startedAt: Date.now(),
    position
  };
  room.isPlaying = true;
  return track;
}

function pauseTrack(room) {
  if (!room.isPlaying || !room.current) return;
  const pos = getCurrentPosition(room);
  room.current.position = pos;
  room.isPlaying = false;
}

function skipTrack(room) {
  resetVotes(room);
  const skipped = room.current ? room.current.track : null;
  if (room.queue.length > 0) {
    playTrack(room, 0);
  } else {
    room.current = null;
    room.isPlaying = false;
  }
  return skipped;
}

function addUser(room, socketId, name) {
  const isFirst = Object.keys(room.users).length === 0;
  room.users[socketId] = {
    name,
    isAdmin: isFirst,
    joinedAt: Date.now()
  };
  return room.users[socketId];
}

function removeUser(room, socketId) {
  const user = room.users[socketId];
  if (!user) return null;
  const wasAdmin = user.isAdmin;
  delete room.users[socketId];
  if (wasAdmin && Object.keys(room.users).length > 0) {
    const remaining = Object.entries(room.users).sort(
      (a, b) => a[1].joinedAt - b[1].joinedAt
    );
    remaining[0][1].isAdmin = true;
    return remaining[0][0];
  }
  return null;
}

function voteSkip(room, socketId) {
  if (room.votesSkip[socketId]) return { voted: false };
  room.votesSkip[socketId] = true;
  const nonAdminCount = Object.values(room.users).filter(u => !u.isAdmin).length;
  const threshold = Math.ceil(nonAdminCount * room.skipThreshold);
  const votesCount = Object.keys(room.votesSkip).length;
  const reachedThreshold = votesCount >= threshold && threshold > 0;
  return { voted: true, votesCount, reachedThreshold };
}

function resetVotes(room) {
  room.votesSkip = {};
}

function getCurrentPosition(room) {
  if (!room.current) return 0;
  if (room.isPlaying) {
    return (Date.now() - room.current.startedAt) / 1000 + room.current.position;
  }
  return room.current.position;
}

function getFullState(room) {
  return {
    queue: room.queue.map(t => ({ ...t })),
    current: room.current ? {
      track: { ...room.current.track },
      startedAt: room.current.startedAt,
      position: room.current.position
    } : null,
    isPlaying: room.isPlaying,
    users: Object.fromEntries(
      Object.entries(room.users).map(([id, u]) => [id, { ...u }])
    ),
    votesSkip: { ...room.votesSkip },
    skipThreshold: room.skipThreshold,
    chatHistory: room.chatHistory.map(m => ({ ...m })),
    history: room.history.map(t => ({ ...t }))
  };
}

function addChat(room, socketId, name, text) {
  const msg = { socketId, name, text, timestamp: Date.now() };
  room.chatHistory.push(msg);
  while (room.chatHistory.length > room.MAX_CHAT) {
    room.chatHistory.shift();
  }
  return msg;
}

function saveQueue(room) {
  try {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(room.queue, null, 2), 'utf8');
  } catch {}
}

function loadQueue(room) {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      const data = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
      if (Array.isArray(data)) room.queue = data;
      fs.unlinkSync(QUEUE_FILE);
    }
  } catch {}
}

function addToHistory(room, track) {
  if (!track || !track.id) return;
  var idx = room.history.findIndex(function (t) { return t.youtubeId === track.youtubeId; });
  if (idx !== -1) room.history.splice(idx, 1);
  room.history.unshift({ id: track.id, title: track.title, artist: track.artist, duration: track.duration, thumbnail: track.thumbnail, youtubeId: track.youtubeId, addedBy: track.addedBy, playedAt: Date.now() });
  while (room.history.length > room.MAX_HISTORY) room.history.pop();
}

module.exports = {
  createRoom,
  addToQueue,
  removeFromQueue,
  playTrack,
  pauseTrack,
  skipTrack,
  addUser,
  removeUser,
  voteSkip,
  resetVotes,
  getCurrentPosition,
  getFullState,
  addChat,
  saveQueue,
  loadQueue,
  addToHistory
};
