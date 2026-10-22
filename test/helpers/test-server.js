'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

// Isolate queue persistence before loading any server module, so the real
// queue.json is never touched by the E2E suite.
const QUEUE_FILE = path.join(
  os.tmpdir(),
  'easyjam-e2e-queue-' + process.pid + '-' + Date.now() + '.json'
);
process.env.EASYJAM_QUEUE_FILE = QUEUE_FILE;

const express = require('express');
const { createRoom } = require('../../server/state');
const { createWSServer, setupWebSocket } = require('../../server/ws-handler');
const { stopTimer } = require('../../server/timer');

/**
 * Build a tiny but valid silent WAV file (RIFF/WAVE, 16-bit mono PCM).
 * 0.2 s is enough for <audio> to load, emit events and play, without any
 * network dependency.
 */
function createSilentWav(durationSeconds = 0.2, sampleRate = 8000) {
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // audio format: PCM
  buffer.writeUInt16LE(1, 22); // channels: mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  // Samples are already zero-filled: silence.

  return buffer;
}

const FIXTURE_WAV = createSilentWav();

/**
 * Start an isolated EasyJam server for browser tests.
 *
 * - serves `public/`
 * - runs a WebSocketServer on the same HTTP server (ephemeral port)
 * - injects deterministic `resolveYoutubeUrl` / `searchYoutube` stubs
 * - serves a local silent WAV so <audio> never needs the network
 *
 * @returns {Promise<{url: string, room: object, resetRoom: () => void, close: () => Promise<void>}>}
 */
async function startTestServer() {
  const room = createRoom();
  let baseUrl = '';

  const resolveYoutubeUrl = async () => ({
    title: 'Test Track',
    artist: 'Test Artist',
    duration: 30,
    thumbnail: '',
    streamUrl: baseUrl + '/fixture.wav',
    youtubeId: 'dQw4w9WgXcQ'
  });

  const searchYoutube = async () => [
    {
      youtubeId: 'aaaaaaaaaaa',
      title: 'Stub Result One',
      artist: 'Stub Artist',
      duration: 42,
      thumbnail: ''
    },
    {
      youtubeId: 'bbbbbbbbbbb',
      title: 'Stub Result Two',
      artist: 'Stub Artist',
      duration: 61,
      thumbnail: ''
    }
  ];

  const app = express();

  app.get('/fixture.wav', (req, res) => {
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-store');

    const range = req.headers.range;
    if (!range) {
      res.setHeader('Content-Length', FIXTURE_WAV.length);
      res.end(FIXTURE_WAV);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.statusCode = 416;
      res.setHeader('Content-Range', 'bytes */' + FIXTURE_WAV.length);
      res.end();
      return;
    }

    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? parseInt(match[2], 10) : FIXTURE_WAV.length - 1;

    if (start >= FIXTURE_WAV.length || end < start) {
      res.statusCode = 416;
      res.setHeader('Content-Range', 'bytes */' + FIXTURE_WAV.length);
      res.end();
      return;
    }

    const clampedEnd = Math.min(end, FIXTURE_WAV.length - 1);
    const slice = FIXTURE_WAV.subarray(start, clampedEnd + 1);
    res.statusCode = 206;
    res.setHeader('Content-Range', 'bytes ' + start + '-' + clampedEnd + '/' + FIXTURE_WAV.length);
    res.setHeader('Content-Length', slice.length);
    res.end(slice);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', users: Object.keys(room.users).length, queue: room.queue.length });
  });

  app.use(express.static(path.join(__dirname, '..', '..', 'public')));

  const server = http.createServer(app);
  const wss = createWSServer(server);
  setupWebSocket(wss, room, { resolveYoutubeUrl, searchYoutube });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  baseUrl = 'http://127.0.0.1:' + address.port;

  function resetRoom() {
    stopTimer();
    room.queue.length = 0;
    room.current = null;
    room.isPlaying = false;
    room.votesSkip = {};
    room.users = {};
    room.chatHistory.length = 0;
    room.history.length = 0;
  }

  async function close() {
    for (const client of wss.clients) {
      try { client.terminate(); } catch {}
    }
    await new Promise((resolve) => {
      wss.close(() => resolve());
    });
    // Drop keep-alive sockets so server.close() cannot hang.
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
    try { fs.unlinkSync(QUEUE_FILE); } catch {}
  }

  return { url: baseUrl, room, resetRoom, close };
}

module.exports = { startTestServer, createSilentWav };
