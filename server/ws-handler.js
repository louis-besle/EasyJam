const { v4: uuidv4 } = require('uuid');
const { WebSocketServer } = require('ws');
const {
  addToQueue, removeFromQueue, playTrack, pauseTrack, skipTrack,
  addUser, removeUser, voteSkip, getCurrentPosition, getFullState, addChat,
  addToHistory
} = require('./state');
const ytdlp = require('./ytdlp');
const { startTimer, stopTimer } = require('./timer');

let syncInterval = null;

const STREAM_TTL_MS = (() => {
  const override = parseInt(process.env.EASYJAM_STREAM_TTL_MS, 10);
  return Number.isFinite(override) && override > 0 ? override : 5 * 60 * 60 * 1000;
})();
const REFRESH_COOLDOWN_MS = 60 * 1000;
const refreshingTracks = new Set();

function isStreamStale(track) {
  if (!track) return true;
  if (!track.streamUrl || !track.resolvedAt) return true;
  return Date.now() - track.resolvedAt > STREAM_TTL_MS;
}

async function refreshTrack(track, resolveFn) {
  if (!track || !track.youtubeId) return false;
  if (refreshingTracks.has(track.id)) return false;
  refreshingTracks.add(track.id);
  try {
    const resolved = await resolveFn('https://www.youtube.com/watch?v=' + track.youtubeId);
    if (!resolved) return false;
    if (resolved.title) track.title = resolved.title;
    if (resolved.artist) track.artist = resolved.artist;
    if (typeof resolved.duration === 'number') track.duration = resolved.duration;
    if (resolved.thumbnail) track.thumbnail = resolved.thumbnail;
    if (resolved.streamUrl) track.streamUrl = resolved.streamUrl;
    track.resolvedAt = Date.now();
    track.lastRefreshAt = Date.now();
    return true;
  } catch (err) {
    console.error('[refresh] failed for "' + (track.title || track.youtubeId) + '": ' + ((err && err.message) || err));
    return false;
  } finally {
    refreshingTracks.delete(track.id);
  }
}

function createWSServer(server) {
  return new WebSocketServer({ server });
}

function setupWebSocket(wss, room, deps = {}) {
  let nextId = 1;
  const resolveFn = deps.resolveYoutubeUrl || ytdlp.resolveYoutubeUrl;
  const searchFn = deps.searchYoutube || ytdlp.searchYoutube;

  wss.on('connection', (ws) => {
    const socketId = 'u' + (nextId++);
    ws.socketId = socketId;

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.type) {
        case 'join': {
          const user = addUser(room, socketId, msg.name || 'Anonymous');
          console.log('[join] ' + user.name + ' connected (total: ' + Object.keys(room.users).length + ')');
          send(ws, { type: 'welcome', socketId, isAdmin: user.isAdmin });
          if (!room.current && room.queue.length > 0) {
            try {
              await playAndBroadcast(room, wss, 0, resolveFn);
            } catch (err) {
              console.error('[join] autoplay failed: ' + ((err && err.message) || err));
            }
          }
          sendFullState(ws, room);
          broadcast(wss, { type: 'user_joined', socketId, name: user.name, users: getUsersArray(room) });
          broadcast(wss, { type: 'user_count', count: Object.keys(room.users).length });
          break;
        }
        case 'add_to_queue': {
          try {
            const resolved = await resolveFn(msg.url);
            const user = room.users[socketId];
            const track = addToQueue(room, {
              ...resolved, addedBy: user ? user.name : 'Unknown'
            });
            console.log('[queue] ' + (user ? user.name : '?') + ' added "' + track.title + '" (' + room.queue.length + ' in queue)');
            send(ws, { type: 'added', track: toClientTrack(track) });
            broadcast(wss, { type: 'queue_updated', queue: room.queue.map(toClientTrack) });
            broadcast(wss, { type: 'toast', message: (user ? user.name : 'Someone') + ' added ' + track.title });
            if (!room.current && room.queue.length > 0) await playAndBroadcast(room, wss, 0, resolveFn);
          } catch (err) {
            send(ws, { type: 'error', message: err.message || 'Failed to resolve URL' });
          }
          break;
        }
        case 'remove_from_queue': {
          if (!isAdmin(room, socketId)) {
            send(ws, { type: 'error', message: 'Only admins can remove tracks' });
            break;
          }
          removeFromQueue(room, msg.trackId);
          broadcast(wss, { type: 'queue_updated', queue: room.queue.map(toClientTrack) });
          break;
        }
        case 'vote_skip': {
          if (isAdmin(room, socketId)) {
            send(ws, { type: 'error', message: 'Admins skip directly' }); break;
          }
          if (!room.current) {
            send(ws, { type: 'error', message: 'Nothing playing' }); break;
          }
          const result = voteSkip(room, socketId);
          if (!result.voted) {
            send(ws, { type: 'error', message: 'Already voted' }); break;
          }
          broadcastVotes(wss, room);
          if (result.reachedThreshold) { stopTimer(); await performSkip(room, wss, resolveFn); }
          break;
        }
        case 'search': {
          try {
            const query = (msg.query || '').toLowerCase().trim();
            var historyResults = [];
            if (query && room.history.length > 0) {
              historyResults = room.history.filter(function (t) {
                return (t.title && t.title.toLowerCase().indexOf(query) !== -1) ||
                       (t.artist && t.artist.toLowerCase().indexOf(query) !== -1);
              }).slice(0, 5).map(function (t) {
                return { youtubeId: t.youtubeId, title: t.title, artist: t.artist, duration: t.duration, thumbnail: t.thumbnail, fromHistory: true };
              });
            }
            var results = await searchFn(msg.query);
            var merged = historyResults.concat(results.slice(0, 10));
            send(ws, { type: 'search_results', results: merged });
          } catch (err) {
            send(ws, { type: 'error', message: err.message });
          }
          break;
        }

        case 'refresh_stream': {
          if (!room.current || !msg.trackId || room.current.track.id !== msg.trackId) break;
          const track = room.current.track;
          if (track.lastRefreshAt && Date.now() - track.lastRefreshAt < REFRESH_COOLDOWN_MS) break;
          const refreshed = await refreshTrack(track, resolveFn);
          if (!refreshed) break;
          broadcast(wss, {
            type: 'track_refreshed',
            track: toClientTrack(track),
            position: getCurrentPosition(room)
          });
          break;
        }

        case 'control': {
          if (!isAdmin(room, socketId)) {
            send(ws, { type: 'error', message: 'Only admins can control' }); break;
          }
          switch (msg.action) {
            case 'play': {
              if (!room.current && room.queue.length > 0) {
                await playAndBroadcast(room, wss, 0, resolveFn);
              } else if (room.current && !room.isPlaying) {
                room.isPlaying = true;
                room.current.startedAt = Date.now();
                startTimer(room, () => autoSkip(room, wss, resolveFn));
                broadcast(wss, { type: 'play', position: room.current.position });
              }
              break;
            }
            case 'pause': {
              if (room.isPlaying && room.current) {
                pauseTrack(room);
                stopTimer();
                broadcast(wss, { type: 'pause', position: room.current.position });
              }
              break;
            }
            case 'skip': {
              if (room.current) { stopTimer(); await performSkip(room, wss, resolveFn); }
              break;
            }
            case 'seek': {
              if (room.current && typeof msg.position === 'number') {
                stopTimer();
                room.current.position = Math.max(0, Math.min(msg.position, room.current.track.duration || Infinity));
                if (room.isPlaying) {
                  room.current.startedAt = Date.now();
                  startTimer(room, () => autoSkip(room, wss, resolveFn));
                  broadcast(wss, { type: 'play', position: room.current.position });
                } else {
                  broadcast(wss, { type: 'pause', position: room.current.position });
                }
              }
              break;
            }
          }
          break;
        }

        case 'chat': {
          const user = room.users[socketId];
          if (!user) break;
          const text = (msg.text || '').trim();
          if (!text || text.length > 500) break;
          addChat(room, socketId, user.name, text);
          broadcast(wss, { type: 'chat', socketId, name: user.name, text, timestamp: Date.now() });
          break;
        }

        case 'rename': {
          const user = room.users[socketId];
          if (!user) break;
          const newName = (msg.name || '').trim();
          if (!newName || newName.length > 20) break;
          user.name = newName;
          broadcast(wss, { type: 'users_updated', users: getUsersArray(room) });
          send(ws, { type: 'rename_ok', name: newName });
          break;
        }

        case 'react': {
          const user = room.users[socketId];
          if (!user) break;
          const emoji = (msg.emoji || '').trim();
          if (!emoji) break;
          broadcast(wss, { type: 'reaction', name: user.name, emoji, timestamp: Date.now() });
          break;
        }

      }
    });

    ws.on('close', () => {
      if (!room.users[ws.socketId]) return;
      const name = room.users[ws.socketId].name;
      const newAdminId = removeUser(room, ws.socketId);
      console.log('[leave] ' + name + ' disconnected (' + Object.keys(room.users).length + ' remaining)');
      broadcast(wss, { type: 'user_left', socketId: ws.socketId, name, users: getUsersArray(room) });
      broadcast(wss, { type: 'user_count', count: Object.keys(room.users).length });
      if (newAdminId) broadcast(wss, { type: 'admin_changed', socketId: newAdminId, isAdmin: true });
    });
  });

  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(() => {
    if (room.isPlaying && room.current) {
      broadcast(wss, { type: 'sync', position: getCurrentPosition(room) });
    }
  }, 3000);
  syncInterval.unref?.();
}

async function performSkip(room, wss, resolveFn) {
  const skipped = skipTrack(room);
  if (skipped) {
    console.log('[skip] skipped "' + skipped.title + '" -> "' + (room.current?.track?.title || 'nothing') + '"');
    addToHistory(room, skipped);
  }
  if (room.current && isStreamStale(room.current.track)) {
    const nextTrack = room.current.track;
    await refreshTrack(nextTrack, resolveFn);
    if (room.current && room.current.track === nextTrack) room.current.startedAt = Date.now();
  }
  broadcast(wss, {
    type: 'skip',
    prevTrack: skipped ? toClientTrack(skipped) : null,
    nextTrack: room.current ? toClientTrack(room.current.track) : null,
    queue: room.queue.map(toClientTrack)
  });
  if (room.current) {
    startTimer(room, () => autoSkip(room, wss, resolveFn));
    broadcast(wss, { type: 'play', position: 0 });
    broadcast(wss, { type: 'queue_updated', queue: room.queue.map(toClientTrack) });
  } else {
    broadcast(wss, { type: 'queue_updated', queue: [] });
  }
  broadcastVotes(wss, room);
}

async function playAndBroadcast(room, wss, position, resolveFn) {
  const track = playTrack(room, position);
  if (!track) return;
  console.log('[play] now playing "' + track.title + '" by ' + track.artist);
  addToHistory(room, track);
  if (isStreamStale(track)) await refreshTrack(track, resolveFn);
  if (room.current && room.current.track === track) room.current.startedAt = Date.now();
  startTimer(room, () => autoSkip(room, wss, resolveFn));
  broadcast(wss, { type: 'play', track: toClientTrack(track), position });
  broadcast(wss, { type: 'queue_updated', queue: room.queue.map(toClientTrack) });
  broadcastVotes(wss, room);
}

function autoSkip(room, wss, resolveFn) {
  performSkip(room, wss, resolveFn).catch((err) => {
    console.error('[skip] auto-skip failed: ' + ((err && err.message) || err));
  });
}

function sendFullState(ws, room) {
  const state = getFullState(room);
  const pos = state.isPlaying ? getCurrentPosition(room) : (state.current ? state.current.position : 0);
  const msg = {
    type: 'state',
    currentTrack: state.current ? toClientTrack(state.current.track) : null,
    isPlaying: state.isPlaying,
    position: pos,
    queue: state.queue.map(toClientTrack),
    users: getUsersArray(room),
    chatHistory: state.chatHistory.map(m => ({ ...m })),
    history: state.history.map(t => ({ ...t })),
    votes: {
      count: Object.keys(state.votesSkip).length,
      threshold: Math.ceil(
        Object.values(state.users).filter(u => !u.isAdmin).length * state.skipThreshold
      )
    }
  };
  send(ws, msg);
}

function getUsersArray(room) {
  return Object.entries(room.users).map(([id, u]) => ({
    socketId: id, name: u.name, isAdmin: u.isAdmin, joinedAt: u.joinedAt
  }));
}

function broadcastVotes(wss, room) {
  const nonAdminCount = Object.values(room.users).filter(u => !u.isAdmin).length;
  broadcast(wss, {
    type: 'votes_updated',
    count: Object.keys(room.votesSkip).length,
    threshold: Math.ceil(nonAdminCount * room.skipThreshold),
    totalUsers: Object.keys(room.users).length
  });
}

function toClientTrack(track) {
  if (!track) return null;
  return {
    id: track.id, title: track.title, artist: track.artist,
    duration: track.duration, thumbnail: track.thumbnail,
    youtubeId: track.youtubeId, url: track.streamUrl, streamUrl: track.streamUrl,
    addedBy: track.addedBy, addedAt: track.addedAt, resolvedAt: track.resolvedAt
  };
}

function isAdmin(room, socketId) { const u = room.users[socketId]; return u && u.isAdmin; }
function broadcast(wss, msg) { const d = JSON.stringify(msg); wss.clients.forEach(c => { if (c.readyState === 1) c.send(d); }); }
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }

module.exports = { setupWebSocket, createWSServer };
