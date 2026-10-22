const express = require('express');
const http = require('http');
const path = require('path');
const https = require('https');
const { createRoom, loadQueue, saveQueue } = require('./state');
const { checkYtDlpExists } = require('./ytdlp');
const { createWSServer, setupWebSocket } = require('./ws-handler');

const PORT = process.env.PORT || 3215;

async function main() {
  const ok = await checkYtDlpExists();
  if (!ok) {
    console.error('ERROR: yt-dlp is not installed or not in PATH.');
    console.error('Install: pip install yt-dlp');
    process.exit(1);
  }

  const room = createRoom();
  loadQueue(room);

  if (room.queue.length > 0) {
    console.log('Restored ' + room.queue.length + ' tracks in queue');
  }
  if (room.current) {
    console.log('Restored current track "' + room.current.track.title + '" at ' + (room.current.position || 0).toFixed(1) + 's (paused)');
  }

  function shutdown(signal) {
    console.log('[shutdown] ' + signal + ' received, saving playback state');
    saveQueue(room);
    process.exit(0);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      users: Object.keys(room.users).length,
      queue: room.queue.length
    });
  });

  app.get('/api/lyrics', async (req, res) => {
    var artist = encodeURIComponent((req.query.artist || '').trim());
    var title = encodeURIComponent((req.query.title || '').trim());
    if (!title) return res.json({ lyrics: null });

    function fetchJson(url) {
      return new Promise(function (resolve, reject) {
        https.get(url, { headers: { 'User-Agent': 'EasyJam/1.0' }, timeout: 8000 }, function (r) {
          var body = '';
          r.on('data', function (c) { body += c; });
          r.on('end', function () {
            if (r.statusCode < 200 || r.statusCode >= 300) return reject(new Error('HTTP ' + r.statusCode));
            try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
          });
        }).on('error', reject).on('timeout', function () { reject(new Error('timeout')); });
      });
    }

    try {
      var data = await fetchJson('https://lrclib.net/api/get?artist_name=' + artist + '&track_name=' + title);
      var text = data.syncedLyrics || data.plainLyrics;
      if (text) return res.json({ lyrics: text, synced: !!data.syncedLyrics });
    } catch (e) {}

    try {
      var searchData = await fetchJson('https://lrclib.net/api/search?q=' + encodeURIComponent(req.query.artist + ' ' + req.query.title));
      if (Array.isArray(searchData) && searchData.length > 0) {
        var item = searchData[0];
        var text2 = item.syncedLyrics || item.plainLyrics;
        if (text2) return res.json({ lyrics: text2, synced: !!item.syncedLyrics });
      }
    } catch (e) {}

    try {
      var ovhData = await fetchJson('https://api.lyrics.ovh/v1/' + artist + '/' + title);
      if (ovhData.lyrics) return res.json({ lyrics: ovhData.lyrics, synced: false });
    } catch (e) {}

    res.json({ lyrics: null });
  });

  const server = http.createServer(app);
  const wss = createWSServer(server);
  setupWebSocket(wss, room);

  server.listen(PORT, () => {
    console.log(`EasyJam running on http://10.145.128.184:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
