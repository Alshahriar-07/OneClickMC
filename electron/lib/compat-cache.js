'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { writeJsonAtomic } = require('./paths');

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

function cacheFileName(minecraftVersion, loader) {
  return `compat-${String(minecraftVersion).replace(/[^\w.-]/g, '_')}-${loader}.json`;
}

class CompatibilityCache {
  constructor(directory, { ttlMs = DEFAULT_TTL_MS } = {}) {
    this.directory = path.join(directory, 'cache');
    this.ttlMs = ttlMs;
  }

  filePath(minecraftVersion, loader = 'fabric') {
    return path.join(this.directory, cacheFileName(minecraftVersion, loader));
  }

  async read(minecraftVersion, loader = 'fabric') {
    try {
      const raw = await fsp.readFile(this.filePath(minecraftVersion, loader), 'utf8');
      const data = JSON.parse(raw);
      if (!data || data.minecraftVersion !== minecraftVersion) return null;
      const resolvedAt = Date.parse(data.resolvedAt || 0);
      const ageMs = Number.isFinite(resolvedAt) ? Date.now() - resolvedAt : Number.POSITIVE_INFINITY;
      return {
        data,
        ageMs,
        stale: ageMs > this.ttlMs,
        resolvedAt: data.resolvedAt || null,
      };
    } catch {
      return null;
    }
  }

  async write(data) {
    try {
      const filePath = this.filePath(data.minecraftVersion, data.loader || 'fabric');
      await writeJsonAtomic(filePath, data);
      return filePath;
    } catch {
      return null;
    }
  }

  async clear(minecraftVersion, loader = 'fabric') {
    try {
      await fsp.rm(this.filePath(minecraftVersion, loader), { force: true });
    } catch {
      /* cache removal is best effort */
    }
  }

  async status(minecraftVersion, loader = 'fabric') {
    const cached = await this.read(minecraftVersion, loader);
    if (!cached) return { available: false, resolvedAt: null, ageMs: null, stale: null };
    return {
      available: true,
      resolvedAt: cached.resolvedAt,
      ageMs: cached.ageMs,
      stale: cached.stale,
    };
  }

  describe() {
    return {
      directory: this.directory,
      ttlHours: this.ttlMs / (60 * 60 * 1000),
      exists: fs.existsSync(this.directory),
    };
  }
}

module.exports = { CompatibilityCache, DEFAULT_TTL_MS, cacheFileName };
