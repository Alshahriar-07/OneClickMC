'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const INVALID_CHARS = /[<>:"/\\|?*]/;
const ALLOWED_EXTENSIONS = {
  mod: ['.jar'],
  shader: ['.zip'],
  resourcepack: ['.zip'],
  dependency: ['.jar'],
};

/** Rejects control characters that Windows treats specially in file names. */
function hasControlCharacters(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function isSafeFileName(name, category) {
  if (typeof name !== 'string' || !name.trim()) return false;
  if (name.length > 180) return false;
  if (name !== path.basename(name)) return false;
  if (name === '.' || name === '..') return false;
  if (INVALID_CHARS.test(name) || hasControlCharacters(name)) return false;
  if (/[. ]$/.test(name)) return false;
  if (WINDOWS_RESERVED.test(name)) return false;
  const extensions = ALLOWED_EXTENSIONS[category] || ['.jar', '.zip'];
  return extensions.includes(path.extname(name).toLowerCase());
}

/**
 * Join segments under a root and refuse anything that escapes it.
 * Returns null when the resulting path is outside of root.
 */
function resolveInside(root, ...segments) {
  if (typeof root !== 'string' || !root) return null;
  const base = path.resolve(root);
  const candidate = path.resolve(base, ...segments);
  const relative = path.relative(base, candidate);
  if (relative === '' ) return candidate;
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return candidate;
}

function destinationFolder(category) {
  switch (category) {
    case 'mod':
    case 'dependency':
      return 'mods';
    case 'shader':
      return 'shaderpacks';
    case 'resourcepack':
      return 'resourcepacks';
    default:
      throw new Error(`Unsupported component category: ${category}`);
  }
}

async function pathExists(target) {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(target) {
  await fsp.mkdir(target, { recursive: true });
  const stat = await fsp.stat(target);
  if (!stat.isDirectory()) throw new Error(`${target} is not a directory`);
  return target;
}

/** Confirms the process can create files in a directory without leaving anything behind. */
async function assertWritableDirectory(target) {
  await ensureDirectory(target);
  const probe = path.join(target, `.oneclickmc-write-test-${crypto.randomBytes(4).toString('hex')}`);
  await fsp.writeFile(probe, 'ok', { flag: 'wx' });
  await fsp.rm(probe, { force: true });
}

async function freeBytes(target) {
  try {
    const stat = await fsp.statfs(target);
    return { free: Number(stat.bavail) * Number(stat.bsize), total: Number(stat.blocks) * Number(stat.bsize) };
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[index]}`;
}

function hashFile(filePath, algorithm = 'sha512') {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fsp.rename(temporary, filePath);
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

module.exports = {
  ALLOWED_EXTENSIONS,
  assertWritableDirectory,
  destinationFolder,
  ensureDirectory,
  formatBytes,
  freeBytes,
  hashFile,
  isHttpsUrl,
  isHttpUrl,
  isSafeFileName,
  pathExists,
  resolveInside,
  writeJsonAtomic,
};
