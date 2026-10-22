'use strict';

const fs = require('fs');

function exists(file) {
  try {
    return !!file && fs.existsSync(file);
  } catch {
    return false;
  }
}

/**
 * Locate an already-installed Chrome/Edge. We intentionally use
 * `puppeteer-core` (no downloaded Chromium) and reuse the system browser.
 *
 * Order: CHROME_PATH → Windows → Linux → macOS.
 *
 * @returns {string|null} executable path, or null when nothing was found.
 */
function findBrowserPath() {
  if (exists(process.env.CHROME_PATH)) return process.env.CHROME_PATH;

  const candidates = [];

  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  }

  // Also probe the standard Linux locations on every platform (harmless).
  candidates.push(
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium'
  );

  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }

  return null;
}

function browserSkipReason() {
  return 'No Chrome/Edge executable found; install Google Chrome, ' +
    'or set CHROME_PATH to its executable, to run the browser E2E suite.';
}

module.exports = { findBrowserPath, browserSkipReason };
