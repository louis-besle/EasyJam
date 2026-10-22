'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const puppeteer = require('puppeteer-core');
const { startTestServer } = require('../helpers/test-server');
const { findBrowserPath, browserSkipReason } = require('../helpers/browser');

const BROWSER_PATH = findBrowserPath();
const SKIP_REASON = BROWSER_PATH ? false : browserSkipReason();

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844, isMobile: true, hasTouch: true };
const WAIT_TIMEOUT = 10000;
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const YOUTUBE_URL_2 = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';

describe('E2E browser UI', { skip: SKIP_REASON }, () => {
  let server;
  let browser;
  let contexts;
  let pages;

  before(async () => {
    server = await startTestServer();
    browser = await puppeteer.launch({
      executablePath: BROWSER_PATH,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--autoplay-policy=no-user-gesture-required',
        '--mute-audio'
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

  /**
   * Open an isolated page: its own browser context (fresh localStorage),
   * desktop viewport, and external network requests blocked for hermetic runs.
   */
  async function newPage(viewport = DESKTOP_VIEWPORT) {
    let context;
    if (typeof browser.createBrowserContext === 'function') {
      context = await browser.createBrowserContext();
    } else {
      context = browser.defaultBrowserContext();
    }
    contexts.push(context);

    const page = await context.newPage();
    pages.push(page);
    await page.setViewport(viewport);

    // Make sure a name left by a previous test can never leak into this one.
    await page.evaluateOnNewDocument(() => {
      try { localStorage.clear(); } catch {}
    });

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith(server.url) || url.startsWith('data:')) {
        request.continue();
      } else {
        request.abort();
      }
    });

    return page;
  }

  async function openRoom(viewport) {
    const page = await newPage(viewport);
    await page.goto(server.url + '/', { waitUntil: 'domcontentloaded' });
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

  async function waitForUserCount(page, count) {
    await page.waitForFunction(
      (expected) => document.getElementById('userCount').textContent === String(expected),
      { timeout: WAIT_TIMEOUT },
      count
    );
  }

  async function addUrl(page, url) {
    await page.click('#headerSearchInput');
    await page.type('#headerSearchInput', url);
    await page.keyboard.press('Enter');
  }

  it('a. joins the room from the name overlay', async () => {
    const page = await openRoom();

    await page.waitForSelector('#nameOverlay', { visible: true, timeout: WAIT_TIMEOUT });
    assert.strictEqual(await page.$eval('#nameInput', (el) => el.value), '');

    await page.type('#nameInput', 'Alice');
    await page.click('#nameJoinBtn');

    await page.waitForFunction(
      () => document.getElementById('nameOverlay').classList.contains('hidden'),
      { timeout: WAIT_TIMEOUT }
    );
    await waitForUserCount(page, 1);

    assert.strictEqual(await page.$eval('#meName', (el) => el.textContent), 'Alice');
    assert.strictEqual(
      await page.$eval('#nameOverlay', (el) => el.classList.contains('hidden')),
      true
    );
    assert.strictEqual(await page.$eval('#userCount', (el) => el.textContent), '1');
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('easyjam_name')), 'Alice');
  });

  it('b. shows two clients and broadcasts chat between them', async () => {
    const pageA = await openRoom();
    await join(pageA, 'Host');

    const pageB = await openRoom();
    await join(pageB, 'Guest');

    await Promise.all([
      waitForUserCount(pageA, 2),
      waitForUserCount(pageB, 2)
    ]);

    // The first user to connect is the admin.
    await pageA.waitForFunction(
      () => !!document.querySelector('.user-badge.is-self .badge-admin'),
      { timeout: WAIT_TIMEOUT }
    );

    await pageA.click('#chatInput');
    await pageA.type('#chatInput', 'Hello from the host');
    await pageA.keyboard.press('Enter');

    await pageB.waitForFunction(
      () => document.getElementById('chatMessages').textContent.includes('Hello from the host'),
      { timeout: WAIT_TIMEOUT }
    );

    const messages = await pageB.$eval('#chatMessages', (el) => el.textContent);
    assert.ok(messages.includes('Hello from the host'));
    assert.ok(messages.includes('Host'));

    // The sender also sees their own message (server echoes the broadcast).
    await pageA.waitForFunction(
      () => document.getElementById('chatMessages').textContent.includes('Hello from the host'),
      { timeout: WAIT_TIMEOUT }
    );
  });

  it('c. adds a YouTube URL, resolves it and updates player, queue and votes', async () => {
    const pageA = await openRoom();
    await join(pageA, 'Host');

    const pageB = await openRoom();
    await join(pageB, 'Guest');

    await Promise.all([
      waitForUserCount(pageA, 2),
      waitForUserCount(pageB, 2)
    ]);

    // First add auto-plays on the stub stream.
    await addUrl(pageA, YOUTUBE_URL);

    await pageA.waitForFunction(
      () => document.getElementById('playerTitle').textContent === 'Test Track',
      { timeout: WAIT_TIMEOUT }
    );
    await pageB.waitForFunction(
      () => document.getElementById('playerTitle').textContent === 'Test Track',
      { timeout: WAIT_TIMEOUT }
    );

    assert.strictEqual(await pageB.$eval('#playerArtist', (el) => el.textContent), 'Test Artist');
    assert.strictEqual(
      await pageB.$eval('#playerArea', (el) => !el.classList.contains('hidden')),
      true
    );

    // Second add queues behind the current track: "Up next" must show it.
    await addUrl(pageA, YOUTUBE_URL_2);

    await pageB.waitForFunction(
      () => document.getElementById('nextCard').textContent.includes('Test Track'),
      { timeout: WAIT_TIMEOUT }
    );
    await pageB.waitForFunction(
      () => document.getElementById('queueCount').textContent === '1',
      { timeout: WAIT_TIMEOUT }
    );

    // Non-admin guest gets a usable skip vote button (2 users => threshold 1).
    await pageB.waitForFunction(
      () => !document.getElementById('voteSection').classList.contains('hidden'),
      { timeout: WAIT_TIMEOUT }
    );
    assert.strictEqual(await pageB.$eval('#voteThreshold', (el) => el.textContent), '1');
    assert.strictEqual(await pageB.$eval('#voteBtn', (el) => el.disabled), false);
    assert.strictEqual(await pageB.$eval('#queueMeta', (el) => el.textContent), '1 track · 1 min');
  });

  it('d. opens and closes the mobile queue drawer', async () => {
    const page = await openRoom(MOBILE_VIEWPORT);
    await join(page, 'MobileUser');
    await waitForUserCount(page, 1);

    await page.waitForSelector('#queueToggle', { visible: true, timeout: WAIT_TIMEOUT });
    assert.strictEqual(
      await page.$eval('#queueSection', (el) => el.classList.contains('is-open')),
      false
    );

    await page.click('#queueToggle');
    await page.waitForFunction(
      () => document.getElementById('queueSection').classList.contains('is-open') &&
        document.getElementById('drawerBackdrop').classList.contains('visible'),
      { timeout: WAIT_TIMEOUT }
    );
    assert.strictEqual(
      await page.$eval('#queueToggle', (el) => el.getAttribute('aria-expanded')),
      'true'
    );

    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => !document.getElementById('queueSection').classList.contains('is-open') &&
        !document.getElementById('drawerBackdrop').classList.contains('visible'),
      { timeout: WAIT_TIMEOUT }
    );
    assert.strictEqual(
      await page.$eval('#queueToggle', (el) => el.getAttribute('aria-expanded')),
      'false'
    );
  });
});
