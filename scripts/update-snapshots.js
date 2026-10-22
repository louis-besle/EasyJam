'use strict';

/**
 * Regenerate the visual regression baselines.
 *
 * Runs the visual test file with UPDATE_SNAPSHOTS=1 so every capture is
 * written to `test/e2e/snapshots/<platform>/` instead of being compared.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

const result = spawnSync(
  process.execPath,
  ['--test', 'test/e2e/visual.test.js'],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, UPDATE_SNAPSHOTS: '1' }
  }
);

process.exit(result.status === null ? 1 : result.status);
