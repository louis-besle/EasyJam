const { execFileSync, execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const DETECT_TIMEOUT = 15000;

function findYtDlp() {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  const candidates = ['yt-dlp', 'yt-dlp.exe', 'python', 'python3'];
  for (const cmd of candidates) {
    try {
      if (cmd === 'python' || cmd === 'python3') {
        execFileSync(cmd, ['-m', 'yt_dlp', '--version'], { stdio: 'pipe', timeout: DETECT_TIMEOUT });
        return cmd;
      } else {
        execFileSync(cmd, ['--version'], { stdio: 'pipe', timeout: DETECT_TIMEOUT });
        return cmd;
      }
    } catch {}
  }
  return null;
}

function buildYtDlpArgs(url) {
  return ['--dump-json', '--no-playlist', '--format', 'bestaudio', url];
}

function buildYtDlpSpawn(cmd, url, timeout = 30000) {
  if (cmd === 'python' || cmd === 'python3') {
    return execFileAsync(cmd, ['-m', 'yt_dlp', ...buildYtDlpArgs(url).slice(0, -1), url], {
      timeout, maxBuffer: 1024 * 1024
    });
  }
  return execFileAsync(cmd, buildYtDlpArgs(url), { timeout, maxBuffer: 1024 * 1024 });
}

function extractYoutubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/v\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function checkYtDlpExists() {
  return findYtDlp() !== null;
}

async function resolveYoutubeUrl(url) {
  const youtubeId = extractYoutubeId(url);
  if (!youtubeId) throw new Error('Invalid YouTube URL');

  const cmd = findYtDlp();
  if (!cmd) throw new Error('yt-dlp not found. Install: pip install yt-dlp');

  try {
    const { stdout } = await buildYtDlpSpawn(cmd, url);
    const data = JSON.parse(stdout);
    return {
      title: data.title || 'Unknown Title',
      artist: data.uploader || data.channel || data.artist || 'Unknown Artist',
      duration: Math.round(data.duration || 0),
      thumbnail: data.thumbnail || '',
      streamUrl: data.url || data.requested_formats?.[0]?.url || '',
      youtubeId
    };
  } catch (err) {
    if (err.killed) throw new Error('yt-dlp timed out');
    throw new Error('Failed to resolve YouTube URL: ' + (err.message));
  }
}

async function searchYoutube(query) {
  const cmd = findYtDlp();
  if (!cmd) throw new Error('yt-dlp not found');

  const safeQuery = query.replace(/["'`;|&$()]/g, '').trim();
  if (!safeQuery || safeQuery.length < 2) throw new Error('Query too short');

  const searchUrl = 'ytsearch5:' + safeQuery;
  const args = ['-j', '--flat-playlist', searchUrl];
  try {
    const spawnFn = (cmd === 'python' || cmd === 'python3')
      ? execFileAsync(cmd, ['-m', 'yt_dlp', ...args], { timeout: 25000, maxBuffer: 1024 * 1024 })
      : execFileAsync(cmd, args, { timeout: 25000, maxBuffer: 1024 * 1024 });
    const { stdout } = await spawnFn;
    const lines = stdout.trim().split(/\r?\n/);
    const results = [];
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        results.push({
          youtubeId: data.id || data.webpage_url?.match(/v=([a-zA-Z0-9_-]{11})/)?.[1] || '',
          title: data.title || 'Unknown',
          artist: data.uploader || data.channel || 'Unknown',
          duration: Math.round(data.duration || 0),
          thumbnail: data.thumbnail || ''
        });
      } catch {}
    }
    return results;
  } catch (err) {
    if (err.killed) throw new Error('Search timed out');
    throw new Error('Search failed: ' + (err.message));
  }
}

module.exports = { extractYoutubeId, checkYtDlpExists, resolveYoutubeUrl, searchYoutube };
