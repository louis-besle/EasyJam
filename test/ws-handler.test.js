const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Isolate the queue persistence side effect: never write the real queue.json.
const TEST_QUEUE_FILE = path.join(os.tmpdir(), 'easyjam-ws-test-queue-' + process.pid + '.json');
process.env.EASYJAM_QUEUE_FILE = TEST_QUEUE_FILE;

const { WebSocketServer, WebSocket } = require('ws');
const { createRoom, addToQueue } = require('../server/state');
const { setupWebSocket } = require('../server/ws-handler');
const { stopTimer } = require('../server/timer');

const YOUTUBE_ID = 'dQw4w9WgXcQ';

function makeTrack(overrides) {
  return Object.assign({
    id: 'track-' + Math.random().toString(36).slice(2),
    title: 'Old Title',
    artist: 'Old Artist',
    duration: 120,
    thumbnail: 'https://stub/old.jpg',
    youtubeId: YOUTUBE_ID,
    streamUrl: 'https://stub/old-stream',
    addedBy: 'Alice',
    addedAt: Date.now() - 60000,
    resolvedAt: Date.now()
  }, overrides || {});
}

function makeDeps(overrides) {
  const deps = {
    resolveYoutubeUrl: async (url) => ({
      title: 'Fresh Title',
      artist: 'Fresh Artist',
      duration: 120,
      thumbnail: 'https://stub/fresh.jpg',
      streamUrl: 'https://stub/fresh-stream',
      youtubeId: YOUTUBE_ID
    }),
    searchYoutube: async () => []
  };
  return Object.assign(deps, overrides || {});
}

function createClient(port) {
  const ws = new WebSocket('ws://127.0.0.1:' + port);
  const messages = [];
  const waiters = [];

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    messages.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].match(msg)) {
        const waiter = waiters.splice(i, 1)[0];
        waiter.resolve(msg);
      }
    }
  });

  return {
    ws,
    messages,
    open: new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    }),
    send(obj) { ws.send(JSON.stringify(obj)); },
    waitFor(match, timeout = 3000) {
      const found = messages.find(match);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex(w => w.match === match);
          if (index !== -1) waiters.splice(index, 1);
          reject(new Error('Timed out waiting for a WebSocket message'));
        }, timeout);
        waiters.push({
          match,
          resolve(msg) { clearTimeout(timer); resolve(msg); }
        });
      });
    }
  };
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('ws-handler', () => {
  let wss;
  let room;
  let clients;
  let port;

  async function startServer(deps, seedRoom) {
    room = seedRoom || createRoom();
    wss = new WebSocketServer({ port: 0 });
    await new Promise(resolve => wss.once('listening', resolve));
    port = wss.address().port;
    setupWebSocket(wss, room, deps || makeDeps());
  }

  async function connect(name) {
    const client = createClient(port);
    clients.push(client);
    await client.open;
    client.send({ type: 'join', name: name || 'Alice' });
    return client;
  }

  beforeEach(() => {
    clients = [];
  });

  afterEach(async () => {
    stopTimer();
    for (const client of clients) {
      try { client.ws.terminate(); } catch {}
    }
    if (wss) {
      await new Promise(resolve => wss.close(() => resolve()));
      wss = null;
    }
  });

  it('should send welcome and state when joining an empty room', async () => {
    await startServer();
    const client = await connect('Alice');

    const welcome = await client.waitFor(m => m.type === 'welcome');
    const state = await client.waitFor(m => m.type === 'state');

    assert.strictEqual(welcome.isAdmin, true);
    assert.strictEqual(state.currentTrack, null);
    assert.deepStrictEqual(state.queue, []);
    assert.strictEqual(Object.keys(room.users).length, 1);
  });

  it('should resolve a URL and broadcast the queue with resolvedAt', async () => {
    await startServer();
    const client = await connect('Alice');
    await client.waitFor(m => m.type === 'state');

    client.send({ type: 'add_to_queue', url: 'https://www.youtube.com/watch?v=' + YOUTUBE_ID });

    const added = await client.waitFor(m => m.type === 'added');
    const queueUpdate = await client.waitFor(m => m.type === 'queue_updated');

    assert.strictEqual(added.track.title, 'Fresh Title');
    assert.strictEqual(queueUpdate.queue.length, 1);
    assert.strictEqual(queueUpdate.queue[0].title, 'Fresh Title');
    assert.strictEqual(typeof queueUpdate.queue[0].resolvedAt, 'number');
    assert.strictEqual(room.current.track.title, 'Fresh Title');
  });

  it('should refresh a stale track before auto-playing on join', async () => {
    const staleTrack = makeTrack({ resolvedAt: 0, streamUrl: '' });
    const seedRoom = createRoom();
    seedRoom.queue.push(staleTrack);

    const calls = [];
    const deps = makeDeps({
      resolveYoutubeUrl: async (url) => {
        calls.push(url);
        return {
          title: 'Fresh Title',
          artist: 'Fresh Artist',
          duration: 120,
          thumbnail: 'https://stub/fresh.jpg',
          streamUrl: 'https://stub/fresh-stream',
          youtubeId: YOUTUBE_ID
        };
      }
    });

    await startServer(deps, seedRoom);
    const client = await connect('Alice');

    const play = await client.waitFor(m => m.type === 'play' && !!m.track);

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0], 'https://www.youtube.com/watch?v=' + YOUTUBE_ID);
    assert.strictEqual(play.track.url, 'https://stub/fresh-stream');
    assert.strictEqual(room.current.track.streamUrl, 'https://stub/fresh-stream');
    assert.strictEqual(room.current.track.id, staleTrack.id);
    assert.ok(room.current.track.resolvedAt > 0);
  });

  it('should restart the playback clock after refreshing a stale track', async () => {
    const staleTrack = makeTrack({ resolvedAt: 0, streamUrl: '' });
    const seedRoom = createRoom();
    seedRoom.queue.push(staleTrack);

    let resolvedAt = 0;
    const deps = makeDeps({
      resolveYoutubeUrl: async () => {
        await wait(40);
        resolvedAt = Date.now();
        return {
          title: 'Fresh Title',
          artist: 'Fresh Artist',
          duration: 120,
          thumbnail: 'https://stub/fresh.jpg',
          streamUrl: 'https://stub/fresh-stream',
          youtubeId: YOUTUBE_ID
        };
      }
    });

    await startServer(deps, seedRoom);
    const client = await connect('Alice');
    await client.waitFor(m => m.type === 'play' && !!m.track);

    assert.ok(resolvedAt > 0);
    assert.ok(
      room.current.startedAt >= resolvedAt,
      'playback clock must start after the refresh completes'
    );
  });

  it('should refresh the current track and broadcast track_refreshed with position', async () => {
    const currentTrack = makeTrack();
    const seedRoom = createRoom();
    seedRoom.current = {
      track: currentTrack,
      startedAt: Date.now() - 5000,
      position: 0
    };
    seedRoom.isPlaying = true;

    await startServer(makeDeps(), seedRoom);
    const client = await connect('Alice');
    await client.waitFor(m => m.type === 'state');

    client.send({ type: 'refresh_stream', trackId: currentTrack.id });
    const refreshed = await client.waitFor(m => m.type === 'track_refreshed');

    assert.strictEqual(refreshed.track.id, currentTrack.id);
    assert.strictEqual(refreshed.track.url, 'https://stub/fresh-stream');
    assert.ok(refreshed.position >= 4, 'position should reflect the elapsed time');
    assert.strictEqual(room.current.track.streamUrl, 'https://stub/fresh-stream');
    assert.strictEqual(room.current.track.title, 'Fresh Title');
  });

  it('should ignore refresh_stream requests for the same track within 60s', async () => {
    const currentTrack = makeTrack();
    const seedRoom = createRoom();
    seedRoom.current = {
      track: currentTrack,
      startedAt: Date.now() - 1000,
      position: 0
    };
    seedRoom.isPlaying = true;

    let calls = 0;
    const deps = makeDeps({
      resolveYoutubeUrl: async () => {
        calls++;
        return {
          title: 'Fresh Title',
          artist: 'Fresh Artist',
          duration: 120,
          thumbnail: 'https://stub/fresh.jpg',
          streamUrl: 'https://stub/fresh-stream',
          youtubeId: YOUTUBE_ID
        };
      }
    });

    await startServer(deps, seedRoom);
    const client = await connect('Alice');
    await client.waitFor(m => m.type === 'state');

    client.send({ type: 'refresh_stream', trackId: currentTrack.id });
    await client.waitFor(m => m.type === 'track_refreshed');

    client.send({ type: 'refresh_stream', trackId: currentTrack.id });
    await wait(200);

    assert.strictEqual(calls, 1, 'a second refresh within 60s must be ignored');
  });

  it('should expose resolvedAt in queue_updated after adding to an existing session', async () => {
    const seedRoom = createRoom();
    const currentTrack = makeTrack({ id: 'current-track' });
    seedRoom.current = {
      track: currentTrack,
      startedAt: Date.now(),
      position: 0
    };
    seedRoom.isPlaying = true;
    addToQueue(seedRoom, makeTrack({ id: 'queued-track', title: 'Queued Song' }));

    await startServer(makeDeps(), seedRoom);
    const client = await connect('Alice');
    await client.waitFor(m => m.type === 'state');

    client.send({ type: 'add_to_queue', url: 'https://www.youtube.com/watch?v=' + YOUTUBE_ID });
    const queueUpdate = await client.waitFor(m => m.type === 'queue_updated');

    assert.strictEqual(queueUpdate.queue.length, 2);
    assert.ok(queueUpdate.queue.every(t => typeof t.resolvedAt === 'number'));
  });
});

process.on('exit', () => {
  try { fs.unlinkSync(TEST_QUEUE_FILE); } catch {}
});
