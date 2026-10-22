'use strict';

/**
 * Visual regression snapshots for the EasyJam UI.
 *
 * Baselines live in `test/e2e/snapshots/<platform>/<name>.png` and are
 * generated with `npm run snapshots` (UPDATE_SNAPSHOTS=1).
 *
 * Every run writes the current capture to
 * `test/e2e/snapshots/__actual__/<name>.actual.png` so CI can expose it as an
 * artifact even when the comparison fails. A `<name>.diff.png` is added next
 * to it whenever pixels differ.
 *
 * Determinism rules:
 *  - all browser requests except the test server are blocked (no Google Fonts)
 *  - animations / transitions / carets are disabled
 *  - live values (progress, remaining time, chat clock, sync label) are frozen
 *    with fixed values before the capture
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');

const { startTestServer } = require('../helpers/test-server');
const { findBrowserPath, browserSkipReason } = require('../helpers/browser');

const BROWSER_PATH = findBrowserPath();
const BROWSER_SKIP = BROWSER_PATH ? false : browserSkipReason();
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

const PLATFORM = process.platform;
const SNAPSHOTS_ROOT = path.join(__dirname, 'snapshots');
const BASELINE_DIR = path.join(SNAPSHOTS_ROOT, PLATFORM);
const ACTUAL_DIR = path.join(SNAPSHOTS_ROOT, '__actual__');

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844, isMobile: true, hasTouch: true };

const WAIT_TIMEOUT = 15000;
const DIFF_THRESHOLD = 0.1; // pixelmatch per-pixel colour tolerance
const MAX_DIFF_RATIO = 0.002; // 0.2 % of the whole image

// Freeze CSS-driven motion and the text caret.
const STABLE_CSS = `
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
  html { scroll-behavior: auto !important; }
`;

function baselinePath(name) {
  return path.join(BASELINE_DIR, name + '.png');
}

function skipUnlessBaseline(name) {
  if (UPDATE) return false;
  if (fs.existsSync(baselinePath(name))) return false;
  return 'No ' + PLATFORM + ' baseline for "' + name + '". ' +
    'Run `npm run snapshots` to generate it.';
}

describe('E2E visual regression', { skip: BROWSER_SKIP }, () => {
  let server;
  let browser;
  let contexts;
  let pages;

  before(async () => {
    fs.mkdirSync(ACTUAL_DIR, { recursive: true });
    server = await startTestServer();
    browser = await puppeteer.launch({
      executablePath: BROWSER_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--autoplay-policy=no-user-gesture-required',
        '--mute-audio',
        '--force-device-scale-factor=1',
        '--font-render-hinting=none',
        '--disable-lcd-text',
        '--hide-scrollbars'
      ]
    });
  });

  after(async () => {
    if (browser) await browser.close();
    if (server) await server.close();
  });

  beforeEach(() => {
    contexts = [];
    pages = [];
    if (server) server.resetRoom();
  });

  afterEach(async () => {
    for (const page of pages) {
      try { await page.close(); } catch {}
    }
    for (const context of contexts) {
      try { await context.close(); } catch {}
    }
    pages = [];
    contexts = [];
  });

  /* ── Page plumbing ───────────────────────────────────────── */

  async function newPage(viewport) {
    const context = typeof browser.createBrowserContext === 'function'
      ? await browser.createBrowserContext()
      : browser.defaultBrowserContext();
    contexts.push(context);

    const page = await context.newPage();
    pages.push(page);
    await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
    await page.setCacheEnabled(false);

    // A name stored by a previous run must never leak into a snapshot.
    await page.evaluateOnNewDocument(() => {
      try { localStorage.clear(); } catch {}
    });

    // Keep the run hermetic: only the local test server is reachable.
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith(server.url) || url.startsWith('data:') || url.startsWith('blob:')) {
        request.continue();
      } else {
        request.abort();
      }
    });

    return page;
  }

  async function openApp(viewport = DESKTOP_VIEWPORT) {
    const page = await newPage(viewport);
    await page.goto(server.url + '/', { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: STABLE_CSS });
    return page;
  }

  async function join(page, name) {
    await page.waitForSelector('#nameOverlay', { visible: true, timeout: WAIT_TIMEOUT });
    await page.type('#nameInput', name);
    await page.click('#nameJoinBtn');
    await page.waitForFunction(
      () => document.getElementById('nameOverlay').classList.contains('hidden'),
      { timeout: WAIT_TIMEOUT }
    );
    await page.waitForFunction(
      (expected) => document.getElementById('meName').textContent === expected,
      { timeout: WAIT_TIMEOUT },
      name
    );
  }

  /* ── Room seeding ────────────────────────────────────────── */

  /**
   * Push tracks straight into the server room before a client joins, so the
   * auto-play on join gives us distinct titles instead of the repeated stub
   * title. The first track starts playing, the rest stay in "Up next".
   */
  function seedTracks(tracks) {
    const now = Date.now();
    for (const track of tracks) {
      server.room.queue.push({
        id: 'seed-' + track.youtubeId,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        thumbnail: '',
        youtubeId: track.youtubeId,
        streamUrl: server.url + '/fixture.wav',
        addedBy: 'Louis',
        addedAt: now - 2 * 60 * 1000,
        resolvedAt: now
      });
    }
  }

  function seedChat() {
    const now = Date.now();
    server.room.chatHistory.push(
      { socketId: 'seed-1', name: 'Louis', text: 'This bassline is unreal.', timestamp: now - 4 * 60 * 1000 },
      { socketId: 'seed-2', name: 'Louis', text: 'One more track before the drop.', timestamp: now - 60 * 1000 }
    );
  }

  /* ── Determinism helpers ─────────────────────────────────── */

  /**
   * Freeze every value that depends on elapsed time. Called right before the
   * capture; the server keeps ticking in the background but nothing it sends
   * reaches these DOM nodes any more (the progress interval is stopped).
   */
  async function freezeRoomValues(page) {
    await page.evaluate(() => {
      UI.stopProgressUpdates();
      // Fixed 1:36 / 3:34 with a 44.86 % progress bar.
      UI.updateProgress(96, 214);

      document.getElementById('syncState').textContent = 'Playing · synced';
      document.getElementById('syncStatus').textContent = 'Synced';

      const nextLabel = document.querySelector('.next-label');
      if (nextLabel) nextLabel.textContent = 'Up next · in 1:58';

      const addedBy = document.getElementById('playerAddedBy');
      if (addedBy) addedBy.textContent = 'Added by Louis · 2 min ago';

      document.querySelectorAll('.chat-msg-time').forEach((el, index) => {
        el.textContent = index === 0 ? '21:04' : '21:05';
      });
    });
  }

  async function waitForStableRender(page) {
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForFunction(
      () => document.readyState === 'complete' &&
        Array.from(document.images).every((img) => img.complete),
      { timeout: WAIT_TIMEOUT }
    );
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
  }

  /* ── Capture + compare ───────────────────────────────────── */

  async function capture(page, name) {
    await waitForStableRender(page);

    fs.mkdirSync(ACTUAL_DIR, { recursive: true });
    const buffer = await page.screenshot({ type: 'png' });
    fs.writeFileSync(path.join(ACTUAL_DIR, name + '.actual.png'), buffer);

    if (UPDATE) {
      fs.mkdirSync(BASELINE_DIR, { recursive: true });
      fs.writeFileSync(baselinePath(name), buffer);
      return;
    }

    const baseline = PNG.sync.read(fs.readFileSync(baselinePath(name)));
    const actual = PNG.sync.read(buffer);

    if (baseline.width !== actual.width || baseline.height !== actual.height) {
      assert.fail(
        name + ': screenshot dimensions changed — baseline is ' +
        baseline.width + '×' + baseline.height + ', capture is ' +
        actual.width + '×' + actual.height + '. ' +
        'If the layout change is intended, run `npm run snapshots`.'
      );
    }

    const diff = new PNG({ width: baseline.width, height: baseline.height });
    const diffPixels = pixelmatch(
      baseline.data,
      actual.data,
      diff.data,
      baseline.width,
      baseline.height,
      { threshold: DIFF_THRESHOLD, includeAA: false }
    );

    const totalPixels = baseline.width * baseline.height;
    const ratio = diffPixels / totalPixels;

    if (ratio > MAX_DIFF_RATIO) {
      const diffPath = path.join(ACTUAL_DIR, name + '.diff.png');
      fs.writeFileSync(diffPath, PNG.sync.write(diff));
      assert.fail(
        name + ': visual diff ' + diffPixels + ' / ' + totalPixels +
        ' px (' + (ratio * 100).toFixed(3) + '%) exceeds the ' +
        (MAX_DIFF_RATIO * 100) + '% budget.\n' +
        '  actual: ' + path.join(ACTUAL_DIR, name + '.actual.png') + '\n' +
        '  diff:   ' + diffPath + '\n' +
        'If the change is intended, run `npm run snapshots`.'
      );
    }
  }

  /* ── Scenes ──────────────────────────────────────────────── */

  it('join desktop screen', { skip: skipUnlessBaseline('join') }, async () => {
    const page = await openApp(DESKTOP_VIEWPORT);
    await page.waitForSelector('#nameOverlay', { visible: true, timeout: WAIT_TIMEOUT });

    // The placeholder defaults to a random generated name; the empty input is
    // part of the scene, so pin it and drop the focus ring/caret.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 150)));
    await page.evaluate(() => {
      const input = document.getElementById('nameInput');
      input.value = '';
      input.placeholder = 'Your name...';
      document.getElementById('joinPresence').textContent =
        'No account needed — jump straight in.';
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    });

    await capture(page, 'join');
  });

  it('room with track, queue and chat', { skip: skipUnlessBaseline('room') }, async () => {
    seedTracks([
      { title: 'Midnight Drive', artist: 'The Neon Collective', duration: 214, youtubeId: 'neon0000001' },
      { title: 'Velvet Static', artist: 'Aurora Lane', duration: 132, youtubeId: 'aurora00002' }
    ]);
    seedChat();

    const page = await openApp(DESKTOP_VIEWPORT);
    await join(page, 'Louis');

    // The seeded first track auto-plays on join, the second becomes "Up next".
    await page.waitForFunction(
      () => document.getElementById('playerTitle').textContent === 'Midnight Drive',
      { timeout: WAIT_TIMEOUT }
    );
    await page.waitForFunction(
      () => document.getElementById('nextCard').textContent.includes('Velvet Static'),
      { timeout: WAIT_TIMEOUT }
    );
    await page.waitForFunction(
      () => document.querySelectorAll('#chatMessages .chat-msg').length === 2,
      { timeout: WAIT_TIMEOUT }
    );

    await freezeRoomValues(page);
    await capture(page, 'room');
  });

  it('mobile queue drawer', { skip: skipUnlessBaseline('mobile-queue') }, async () => {
    seedTracks([
      { title: 'Midnight Drive', artist: 'The Neon Collective', duration: 214, youtubeId: 'neon0000001' },
      { title: 'Velvet Static', artist: 'Aurora Lane', duration: 132, youtubeId: 'aurora00002' },
      { title: 'Paper Satellites', artist: 'Slow Harbor', duration: 165, youtubeId: 'slow0000003' }
    ]);

    const page = await openApp(MOBILE_VIEWPORT);
    await join(page, 'Louis');
    await page.waitForFunction(
      () => document.getElementById('playerTitle').textContent === 'Midnight Drive',
      { timeout: WAIT_TIMEOUT }
    );

    await page.waitForSelector('#queueToggle', { visible: true, timeout: WAIT_TIMEOUT });
    await page.click('#queueToggle');
    await page.waitForFunction(
      () => document.getElementById('queueSection').classList.contains('is-open') &&
        document.getElementById('drawerBackdrop').classList.contains('visible'),
      { timeout: WAIT_TIMEOUT }
    );

    await freezeRoomValues(page);
    await capture(page, 'mobile-queue');
  });
});
