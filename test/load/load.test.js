'use strict';

// Reproducible WebSocket load tests: 10 concurrent clients against a real
// Express + WebSocketServer instance (no browser involved).
//
// Run with: npm run test:load

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');

const { startTestServer } = require('../helpers/test-server');

const CLIENT_COUNT = 10;
const NON_ADMIN_COUNT = CLIENT_COUNT - 1;
const SKIP_VOTES = Math.ceil(NON_ADMIN_COUNT * 0.5); // 5 with 9 non-admins
const WAIT_TIMEOUT_MS = 5000;

/**
 * Minimal WebSocket test client: buffers every JSON message with its arrival
 * timestamp and lets tests await a message type (optionally filtered).
 */
function createClient(url) {
  const ws = new WebSocket(url);
  const entries = []; // { msg, at }
  const waiters = new Set();

  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  // Swallow late errors (e.g. terminate during teardown) so they never crash
  // the test process after `opened` settled.
  ws.on('error', () => {});

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    entries.push({ msg, at: Date.now() });
    for (const waiter of [...waiters]) {
      if (waiter.match(msg)) {
        waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      }
    }
  });

  function find(type, predicate) {
    return entries.find((e) => e.msg.type === type && (!predicate || predicate(e.msg))) || null;
  }

  function waitFor(type, predicate, timeout = WAIT_TIMEOUT_MS) {
    const found = find(type, predicate);
    if (found) return Promise.resolve(found.msg);

    return new Promise((resolve, reject) => {
      const waiter = {
        match: (msg) => msg.type === type && (!predicate || predicate(msg)),
        resolve
      };
      waiter.timer = setTimeout(() => {
        waiters.delete(waiter);
        const seen = [...new Set(entries.map((e) => e.msg.type))].join(', ') || 'nothing';
        reject(new Error(
          'Timed out after ' + timeout + ' ms waiting for "' + type + '"' +
          (predicate ? ' (with predicate)' : '') + '. Messages seen: ' + seen
        ));
      }, timeout);
      waiters.add(waiter);
    });
  }

  function send(obj) {
    if (ws.readyState !== WebSocket.OPEN) throw new Error('socket is not open');
    ws.send(JSON.stringify(obj));
  }

  function join(name) {
    return opened.then(() => send({ type: 'join', name }));
  }

  function close() {
    return new Promise((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) return resolve();
      const timer = setTimeout(() => {
        try { ws.terminate(); } catch {}
      }, 1000);
      timer.unref?.();
      ws.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        ws.close();
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  return {
    ws,
    entries,
    opened,
    waitFor,
    send,
    join,
    close,
    get messages() { return entries.map((e) => e.msg); }
  };
}

describe('WebSocket load: 10 concurrent clients', () => {
  let server = null;
  let clients = [];

  afterEach(async () => {
    const current = clients;
    clients = [];
    await Promise.allSettled(current.map((c) => c.close()));
    if (server) {
      // Stops the playback timer so no residual timeout keeps the process alive.
      server.resetRoom();
      await server.close();
      server = null;
    }
  });

  async function connectClients() {
    server = await startTestServer();
    const list = [];
    for (let i = 0; i < CLIENT_COUNT; i++) list.push(createClient(server.url));
    clients = list;
    await Promise.all(list.map((c) => c.opened));
    return list;
  }

  /**
   * Join every client in parallel and wait until all of them observed the
   * final user count. Returns `{ welcomes, elapsedMs }`.
   */
  async function joinAll(list) {
    const startedAt = Date.now();
    await Promise.all(list.map((c, i) => c.join('Load' + (i + 1))));

    const welcomes = await Promise.all(list.map((c) => c.waitFor('welcome')));
    await Promise.all(list.map((c) => c.waitFor('state')));
    await Promise.all(list.map((c) =>
      c.waitFor('user_count', (m) => m.count === CLIENT_COUNT)
    ));

    return { welcomes, elapsedMs: Date.now() - startedAt };
  }

  it('handles 10 simultaneous joins with exactly one admin', { timeout: 15000 }, async () => {
    const list = await connectClients();
    const { welcomes, elapsedMs } = await joinAll(list);

    console.log('[load] 10 joins completed in ' + elapsedMs + ' ms');

    // Every client got a distinct identity.
    const socketIds = new Set(welcomes.map((w) => w.socketId));
    assert.strictEqual(socketIds.size, CLIENT_COUNT, 'each client must have a unique socketId');

    // Exactly one admin (the first to join).
    const admins = welcomes.filter((w) => w.isAdmin);
    assert.strictEqual(admins.length, 1, 'exactly one admin expected, got ' + admins.length);

    // Server-side view agrees.
    assert.strictEqual(Object.keys(server.room.users).length, CLIENT_COUNT);

    // Every client received a state snapshot with the user list.
    for (const c of list) {
      const state = c.messages.find((m) => m.type === 'state');
      assert.ok(Array.isArray(state.users), 'state must embed the users array');
      assert.ok(Array.isArray(state.queue), 'state must embed the queue');
    }

    assert.ok(elapsedMs < 5000, 'simultaneous joins took ' + elapsedMs + ' ms (budget 5000 ms)');
  });

  it('fans out 10 simultaneous chat messages to every client', { timeout: 15000 }, async () => {
    const list = await connectClients();
    await joinAll(list);

    const unique = 'load-' + Date.now();
    const texts = list.map((_, i) => unique + '-msg-' + i);
    const sentAt = new Map();

    const startedAt = Date.now();
    // Sending in a tight loop is effectively simultaneous at network level.
    list.forEach((c, i) => {
      sentAt.set(texts[i], Date.now());
      c.send({ type: 'chat', text: texts[i] });
    });

    await Promise.all(list.map(async (c) => {
      for (const text of texts) {
        await c.waitFor('chat', (m) => m.text === text);
      }
    }));
    const fanoutMs = Date.now() - startedAt;

    // No client saw more copies than expected, and all 10 texts arrived.
    let maxLatencyMs = 0;
    for (const c of list) {
      const received = c.entries
        .filter((e) => e.msg.type === 'chat' && sentAt.has(e.msg.text))
        .map((e) => e.msg.text);
      const distinct = new Set(received);
      assert.strictEqual(distinct.size, CLIENT_COUNT, 'client missed some chat messages');
      assert.strictEqual(received.length, CLIENT_COUNT, 'client received duplicate chat messages');

      for (const e of c.entries) {
        if (e.msg.type !== 'chat' || !sentAt.has(e.msg.text)) continue;
        maxLatencyMs = Math.max(maxLatencyMs, e.at - sentAt.get(e.msg.text));
      }
    }

    console.log(
      '[load] 10 chat messages fanned out in ' + fanoutMs +
      ' ms (max per-message latency: ' + maxLatencyMs + ' ms)'
    );

    assert.ok(fanoutMs < 5000, 'chat fan-out took ' + fanoutMs + ' ms (budget 5000 ms)');
  });

  it('queues tracks then skips on 5 non-admin votes', { timeout: 15000 }, async () => {
    const list = await connectClients();
    const { welcomes } = await joinAll(list);

    const adminIndex = welcomes.findIndex((w) => w.isAdmin);
    assert.notStrictEqual(adminIndex, -1, 'an admin must exist');
    const admin = list[adminIndex];
    const voters = list.filter((_, i) => i !== adminIndex);
    assert.strictEqual(voters.length, NON_ADMIN_COUNT);

    // Admin queues two tracks, one after the other.
    const startedAt = Date.now();
    admin.send({ type: 'add_to_queue', url: 'https://www.youtube.com/watch?v=loadtrack1' });
    const added1 = await admin.waitFor('added');
    const firstId = added1.track.id;

    await Promise.all(list.map((c) => c.waitFor('play', (m) => m.track && m.track.id === firstId)));

    admin.send({ type: 'add_to_queue', url: 'https://www.youtube.com/watch?v=loadtrack2' });
    const added2 = await admin.waitFor('added', (m) => m.track.id !== firstId);
    const secondId = added2.track.id;

    // Every client must end up with the second track queued behind the first.
    await Promise.all(list.map((c) => c.waitFor('queue_updated', (m) =>
      m.queue.length === 1 && m.queue[0].id === secondId
    )));

    for (const c of list) {
      const updates = c.messages.filter((m) => m.type === 'queue_updated');
      assert.ok(updates.length >= 3, 'expected at least 3 queue_updated, got ' + updates.length);
      // First update carries the first track before it starts playing.
      assert.strictEqual(updates[0].queue.length, 1);
      assert.strictEqual(updates[0].queue[0].id, firstId);
      // Last update carries only the second track (first one is now playing).
      const last = updates[updates.length - 1];
      assert.strictEqual(last.queue.length, 1);
      assert.strictEqual(last.queue[0].id, secondId);
    }

    // Exactly SKIP_VOTES non-admin votes must trigger the skip.
    const voteStartedAt = Date.now();
    assert.strictEqual(SKIP_VOTES, 5, 'expected 5 votes to reach the threshold');
    voters.slice(0, SKIP_VOTES).forEach((c) => c.send({ type: 'vote_skip' }));

    const skips = await Promise.all(list.map((c) => c.waitFor('skip')));
    const skipMs = Date.now() - voteStartedAt;

    for (const skip of skips) {
      assert.ok(skip.nextTrack, 'second queued track should become current');
      assert.strictEqual(skip.nextTrack.id, secondId);
      assert.strictEqual(skip.queue.length, 0, 'queue should be drained');
    }

    const elapsedMs = Date.now() - startedAt;
    console.log(
      '[load] 2 queue additions + vote skip in ' + elapsedMs +
      ' ms (skip reaction: ' + skipMs + ' ms)'
    );

    assert.ok(skipMs < 5000, 'vote skip took ' + skipMs + ' ms (budget 5000 ms)');
  });
});
