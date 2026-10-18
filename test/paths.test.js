'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  destinationFolder,
  formatBytes,
  isHttpsUrl,
  isSafeFileName,
  resolveInside,
} = require('../electron/lib/paths');

test('isSafeFileName accepts real mod file names', () => {
  assert.equal(isSafeFileName('sodium-fabric-0.8.14+mc1.21.11.jar', 'mod'), true);
  assert.equal(isSafeFileName('ComplementaryUnbound_r5.4.zip', 'shader'), true);
  assert.equal(isSafeFileName('Optimum Realism R22.zip', 'resourcepack'), true);
});

test('isSafeFileName rejects traversal and unsafe names', () => {
  assert.equal(isSafeFileName('../escape.jar', 'mod'), false);
  assert.equal(isSafeFileName('folder/escape.jar', 'mod'), false);
  assert.equal(isSafeFileName('..\\escape.jar', 'mod'), false);
  assert.equal(isSafeFileName('con.jar', 'mod'), false);
  assert.equal(isSafeFileName('mod.exe', 'mod'), false);
  assert.equal(isSafeFileName('shader.jar', 'shader'), false);
  assert.equal(isSafeFileName('trailing .jar ', 'mod'), false);
  assert.equal(isSafeFileName('', 'mod'), false);
});

test('resolveInside refuses to escape the root', () => {
  const root = path.resolve('C:/games/minecraft');
  assert.equal(resolveInside(root, 'mods', 'sodium.jar'), path.join(root, 'mods', 'sodium.jar'));
  assert.equal(resolveInside(root, '..', 'other', 'file.jar'), null);
  assert.equal(resolveInside(root, 'mods', '..', '..', 'x.jar'), null);
  assert.equal(resolveInside(root), root);
});

test('destinationFolder maps categories to game folders', () => {
  assert.equal(destinationFolder('mod'), 'mods');
  assert.equal(destinationFolder('dependency'), 'mods');
  assert.equal(destinationFolder('shader'), 'shaderpacks');
  assert.equal(destinationFolder('resourcepack'), 'resourcepacks');
  assert.throws(() => destinationFolder('unknown'), /Unsupported component category/);
});

test('formatBytes formats download sizes', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1.00 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.00 MB');
});

test('isHttpsUrl only allows https', () => {
  assert.equal(isHttpsUrl('https://cdn.modrinth.com/file.jar'), true);
  assert.equal(isHttpsUrl('http://cdn.modrinth.com/file.jar'), false);
  assert.equal(isHttpsUrl('file:///C:/mods/x.jar'), false);
});
