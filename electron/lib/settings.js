'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: 1,
  lastRoot: null,
  lastProfileId: null,
  lastGameDir: null,
  lastMinecraftVersion: '1.21.11',
  lastEdition: 'balanced',
  reduceMotion: false,
  backgroundMode: 'auto',
  logLevel: 'info',
});

const ALLOWED_BACKGROUNDS = new Set(['auto', 'solid']);
const ALLOWED_LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

function sanitize(input, base = DEFAULT_SETTINGS) {
  const source = input && typeof input === 'object' ? input : {};
  const settings = { ...base };
  const stringOrNull = (value) => (typeof value === 'string' && value.trim() ? value : null);

  settings.lastRoot = stringOrNull(source.lastRoot);
  settings.lastProfileId = stringOrNull(source.lastProfileId);
  settings.lastGameDir = stringOrNull(source.lastGameDir);
  settings.lastMinecraftVersion = ['1.21.11', '26.1', '26.2'].includes(source.lastMinecraftVersion)
    ? source.lastMinecraftVersion
    : base.lastMinecraftVersion;
  settings.lastEdition = ['potato', 'balanced', 'ultimate'].includes(source.lastEdition)
    ? source.lastEdition
    : base.lastEdition;
  settings.reduceMotion = Boolean(source.reduceMotion);
  settings.backgroundMode = ALLOWED_BACKGROUNDS.has(source.backgroundMode)
    ? source.backgroundMode
    : base.backgroundMode;
  settings.logLevel = ALLOWED_LOG_LEVELS.has(source.logLevel) ? source.logLevel : base.logLevel;
  settings.schemaVersion = DEFAULT_SETTINGS.schemaVersion;
  return settings;
}

class SettingsStore {
  constructor(directory) {
    this.directory = directory;
    this.filePath = path.join(directory, 'settings.json');
    this.values = { ...DEFAULT_SETTINGS };
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      this.values = sanitize(JSON.parse(raw));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.loadError = error.message;
      }
      this.values = { ...DEFAULT_SETTINGS };
    }
    return this.values;
  }

  get() {
    return { ...this.values };
  }

  update(patch) {
    this.values = sanitize({ ...this.values, ...(patch || {}) }, this.values);
    this.save();
    return this.get();
  }

  reset() {
    this.values = { ...DEFAULT_SETTINGS };
    this.save();
    return this.get();
  }

  save() {
    try {
      fs.mkdirSync(this.directory, { recursive: true });
      const temporary = `${this.filePath}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(this.values, null, 2)}\n`, 'utf8');
      fs.renameSync(temporary, this.filePath);
    } catch {
      /* settings persistence is non-critical */
    }
  }
}

module.exports = { SettingsStore, DEFAULT_SETTINGS, sanitize };
