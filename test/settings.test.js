'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { DEFAULT_SETTINGS, SettingsStore, sanitize } = require('../electron/lib/settings');

test('sanitize keeps valid values and rejects invalid ones', () => {
  const settings = sanitize({
    lastRoot: 'C:/minecraft',
    lastMinecraftVersion: '26.2',
    lastEdition: 'ultimate',
    reduceMotion: true,
    backgroundMode: 'solid',
    logLevel: 'debug',
  });
  assert.equal(settings.lastRoot, 'C:/minecraft');
  assert.equal(settings.lastMinecraftVersion, '26.2');
  assert.equal(settings.lastEdition, 'ultimate');
  assert.equal(settings.reduceMotion, true);
  assert.equal(settings.backgroundMode, 'solid');
  assert.equal(settings.logLevel, 'debug');

  const fallback = sanitize({
    lastMinecraftVersion: '99.9',
    lastEdition: 'turbo',
    backgroundMode: 'neon',
    logLevel: 'verbose',
    lastRoot: 42,
  });
  assert.equal(fallback.lastMinecraftVersion, DEFAULT_SETTINGS.lastMinecraftVersion);
  assert.equal(fallback.lastEdition, DEFAULT_SETTINGS.lastEdition);
  assert.equal(fallback.backgroundMode, DEFAULT_SETTINGS.backgroundMode);
  assert.equal(fallback.logLevel, DEFAULT_SETTINGS.logLevel);
  assert.equal(fallback.lastRoot, null);
});

test('SettingsStore persists, reloads and resets values', async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'oneclickmc-settings-'));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));

  const store = new SettingsStore(directory);
  assert.equal(store.get().lastEdition, DEFAULT_SETTINGS.lastEdition);

  store.update({ lastEdition: 'potato', lastRoot: 'C:/mc', backgroundMode: 'solid' });
  const reloaded = new SettingsStore(directory);
  assert.equal(reloaded.get().lastEdition, 'potato');
  assert.equal(reloaded.get().lastRoot, 'C:/mc');
  assert.equal(reloaded.get().backgroundMode, 'solid');

  reloaded.reset();
  assert.equal(reloaded.get().lastEdition, DEFAULT_SETTINGS.lastEdition);
  assert.equal(reloaded.get().lastRoot, null);
});

test('SettingsStore survives a corrupted settings file', async (t) => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'oneclickmc-settings-'));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));

  await fsp.writeFile(path.join(directory, 'settings.json'), '{ not json', 'utf8');
  const store = new SettingsStore(directory);
  assert.equal(store.get().lastEdition, DEFAULT_SETTINGS.lastEdition);
  assert.ok(store.loadError);
});
