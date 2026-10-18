'use strict';

/**
 * Verifies that every asset the packaged app needs is present in the repository.
 * Runs automatically before `npm start` and can be run on its own for releases.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const REQUIRED = [
  'assets/appbg.png',
  'assets/logo.png',
  'assets/text.png',
  'assets/icon.png',
  'assets/icon.ico',
  'assets/fonts/press-start-2p-latin.woff2',
  'assets/fonts/OFL.txt',
  'app/index.html',
  'app/styles/app.css',
  'app/js/app.js',
  'data/catalog.json',
  'data/manifests/1.21.11.json',
  'data/manifests/26.1.json',
  'data/manifests/26.2.json',
];

const missing = REQUIRED.filter((relative) => !fs.existsSync(path.join(ROOT, relative)));

if (missing.length > 0) {
  process.stderr.write(`Missing required assets:\n${missing.map((file) => ` - ${file}`).join('\n')}\n`);
  process.exit(1);
}

const background = fs.statSync(path.join(ROOT, 'assets/appbg.png'));
process.stdout.write(
  `Assets OK (${REQUIRED.length} files checked, appbg.png is ${(background.size / 1024 / 1024).toFixed(2)} MB)\n`,
);
