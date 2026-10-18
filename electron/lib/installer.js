'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {
  assertWritableDirectory,
  destinationFolder,
  ensureDirectory,
  freeBytes,
  hashFile,
  isSafeFileName,
  pathExists,
  resolveInside,
  writeJsonAtomic,
} = require('./paths');

class InstallError extends Error {
  constructor(message, { code = 'INSTALL_FAILED', cause = null } = {}) {
    super(message);
    this.name = 'InstallError';
    this.code = code;
    this.cause = cause;
  }
}

const BACKUP_SLACK_BYTES = 20 * 1024 * 1024;

function createInstallationId() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${timestamp}-${crypto.randomBytes(3).toString('hex')}`;
}

function installationRecordPath(directory, id) {
  return path.join(directory, `${id}.json`);
}

async function writeInstallationRecord(directory, record) {
  await ensureDirectory(directory);
  await writeJsonAtomic(installationRecordPath(directory, record.id), record);
  return installationRecordPath(directory, record.id);
}

async function readInstallationRecord(directory, id) {
  const filePath = installationRecordPath(directory, id);
  const raw = await fsp.readFile(filePath, 'utf8');
  const record = JSON.parse(raw);
  if (!record || record.id !== id) throw new InstallError('Installation record is invalid.', { code: 'BAD_RECORD' });
  return record;
}

async function listInstallations(directory, limit = 20) {
  try {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    const records = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const raw = await fsp.readFile(path.join(directory, entry.name), 'utf8');
        const record = JSON.parse(raw);
        if (!record?.id) continue;
        records.push({
          id: record.id,
          status: record.status,
          startedAt: record.startedAt,
          finishedAt: record.finishedAt,
          minecraftVersion: record.minecraftVersion,
          edition: record.edition,
          gameDir: record.gameDir,
          installedCount: (record.items || []).filter((item) => item.installed).length,
          failedCount: (record.items || []).filter((item) => item.error).length,
          canRollback: record.status !== 'rolled_back' && (record.items || []).some((item) => item.installed),
        });
      } catch {
        /* ignore unreadable journals */
      }
    }
    return records
      .sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)))
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Builds a dry-run installation plan. With createDirectories=false it performs
 * no writes at all, so it is safe to call for the review screen.
 */
async function buildInstallPlan({
  gameDir,
  items,
  minecraftVersion,
  loader,
  edition,
  createDirectories = false,
  stagingDir = null,
  logger = null,
}) {
  if (!gameDir) throw new InstallError('No game directory was selected.', { code: 'NO_GAME_DIR' });
  let stat;
  try {
    stat = await fsp.stat(gameDir);
  } catch {
    throw new InstallError('The selected game directory does not exist.', { code: 'MISSING_GAME_DIR' });
  }
  if (!stat.isDirectory()) {
    throw new InstallError('The selected game directory is not a folder.', { code: 'BAD_GAME_DIR' });
  }
  if (createDirectories) {
    try {
      await assertWritableDirectory(gameDir);
    } catch (error) {
      throw new InstallError(
        'OneClickMC does not have permission to write to this game directory.',
        { code: 'NOT_WRITABLE', cause: error },
      );
    }
  }

  const planItems = [];
  const warnings = [];
  const targetKeys = new Map();
  const folders = new Set();

  for (const item of items) {
    if (!item?.file?.filename) continue;
    const folder = destinationFolder(item.category);
    const filename = item.file.filename;
    if (!isSafeFileName(filename, item.category)) {
      throw new InstallError(`Refusing an unsafe file name: ${filename}`, { code: 'UNSAFE_FILENAME' });
    }
    const destination = resolveInside(gameDir, folder, filename);
    if (!destination) {
      throw new InstallError(`Refusing a path that escapes the game directory: ${folder}/${filename}`, {
        code: 'PATH_ESCAPE',
      });
    }
    const key = `${folder}/${filename}`.toLowerCase();
    if (targetKeys.has(key)) {
      const previous = targetKeys.get(key);
      if (previous.sha512 && item.file.sha512 && previous.sha512 === item.file.sha512) {
        warnings.push(`${filename} is provided by more than one selected component; it will be installed once.`);
        continue;
      }
      throw new InstallError(
        `Two selected components both provide ${folder}/${filename} with different contents. Deselect one of them.`,
        { code: 'TARGET_COLLISION' },
      );
    }

    const exists = await pathExists(destination);
    const entry = {
      key: item.key,
      name: item.name,
      category: item.category,
      required: Boolean(item.required),
      folder,
      filename,
      destination,
      size: Number(item.file.size) || 0,
      sha512: item.file.sha512 || null,
      sha1: item.file.sha1 || null,
      url: item.file.url,
      host: item.file.host,
      edition,
      requiredBy: item.requiredBy || [],
      existsBefore: exists,
      backupPath: null,
      installed: false,
      verified: false,
      error: null,
    };
    targetKeys.set(key, entry);
    folders.add(folder);
    planItems.push(entry);
  }

  if (planItems.length === 0) {
    throw new InstallError('No verified files were selected for installation.', { code: 'EMPTY_PLAN' });
  }

  if (createDirectories) {
    for (const folder of folders) {
      const target = resolveInside(gameDir, folder);
      if (!target) throw new InstallError('Refusing to create a folder outside the game directory.', { code: 'PATH_ESCAPE' });
      await ensureDirectory(target);
    }
  }

  const conflicts = planItems.filter((item) => item.existsBefore);
  const existingBytes = conflicts.reduce((sum, item) => sum + item.size, 0);
  const totalSize = planItems.reduce((sum, item) => sum + item.size, 0);
  const requiredBytes = totalSize + existingBytes + BACKUP_SLACK_BYTES;
  const disk = await freeBytes(gameDir);
  const stagingDisk = await freeBytes(stagingDir || path.dirname(gameDir));

  if (conflicts.length > 0) {
    warnings.push(
      `${conflicts.length} existing file(s) will be backed up before being replaced.`,
    );
  }
  if (disk && disk.free < requiredBytes) {
    throw new InstallError(
      `Not enough free disk space in the game directory. Need ${requiredBytes} bytes, ${disk.free} available.`,
      { code: 'LOW_DISK_SPACE' },
    );
  }
  if (stagingDisk && stagingDisk.free < totalSize + BACKUP_SLACK_BYTES) {
    throw new InstallError(
      'Not enough free disk space for downloads and backups on the system drive.',
      { code: 'LOW_STAGING_SPACE' },
    );
  }

  logger?.info('Installation plan built', {
    gameDir,
    items: planItems.length,
    conflicts: conflicts.length,
    totalSize,
  });

  return {
    gameDir,
    minecraftVersion,
    loader,
    edition,
    items: planItems,
    conflicts: conflicts.map((item) => ({
      key: item.key,
      name: item.name,
      folder: item.folder,
      filename: item.filename,
      destination: item.destination,
      size: item.size,
    })),
    folders: [...folders],
    totalSize,
    existingBytes,
    requiredBytes,
    freeBytes: disk?.free ?? null,
    warnings,
    createdAt: new Date().toISOString(),
  };
}

/** Copies an existing destination file into the backup root before it is replaced. */
async function backupFile({ source, backupRoot, installationId, folder, filename, logger = null }) {
  const target = resolveInside(backupRoot, installationId, folder, filename);
  if (!target) throw new InstallError('Refusing to write a backup outside the backup directory.', { code: 'PATH_ESCAPE' });
  await ensureDirectory(path.dirname(target));
  await fsp.copyFile(source, target);
  const [sourceStat, targetStat] = await Promise.all([fsp.stat(source), fsp.stat(target)]);
  if (sourceStat.size !== targetStat.size) {
    throw new InstallError(`Backup verification failed for ${filename}.`, { code: 'BACKUP_MISMATCH' });
  }
  logger?.info('Backed up existing file', { source, target });
  return target;
}

/** Copies a staged download into place, verifying the hash after writing. */
async function installStagedFile({ stagedPath, destination, expectedSha512, signal, logger = null }) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  await ensureDirectory(path.dirname(destination));
  const temporary = `${destination}.oneclickmc-${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(stagedPath);
      const writeStream = fs.createWriteStream(temporary, { flags: 'wx' });
      const onAbort = () => {
        readStream.destroy(new DOMException('Aborted', 'AbortError'));
        writeStream.destroy(new DOMException('Aborted', 'AbortError'));
      };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      readStream.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', () => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve();
      });
      readStream.pipe(writeStream);
    });
    if (expectedSha512) {
      const actual = await hashFile(temporary, 'sha512');
      if (actual.toLowerCase() !== String(expectedSha512).toLowerCase()) {
        throw new InstallError(`Installed copy of ${path.basename(destination)} failed its checksum.`, {
          code: 'INSTALL_CHECKSUM_MISMATCH',
        });
      }
    }
    if (await pathExists(destination)) {
      await fsp.rm(destination, { force: true });
    }
    await fsp.rename(temporary, destination);
    logger?.info('Installed file', { destination });
    return true;
  } catch (error) {
    await fsp.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

/**
 * Restores backups and removes files created by an installation. Files that
 * changed after installation are left untouched and reported instead.
 */
async function rollbackInstallation({ record, installationsDirectory, logger = null }) {
  if (!record || !Array.isArray(record.items)) {
    throw new InstallError('No installation record is available for rollback.', { code: 'BAD_RECORD' });
  }
  const results = [];
  for (const item of [...record.items].reverse()) {
    if (!item.installed || !item.destination) continue;
    try {
      const currentExists = await pathExists(item.destination);
      if (item.backupPath && await pathExists(item.backupPath)) {
        await fsp.copyFile(item.backupPath, item.destination);
        results.push({ filename: item.filename, action: 'restored-backup' });
        logger?.info('Restored backup', { destination: item.destination });
      } else if (currentExists) {
        if (item.sha512) {
          const currentHash = await hashFile(item.destination, 'sha512').catch(() => null);
          if (currentHash && currentHash !== item.sha512) {
            results.push({ filename: item.filename, action: 'skipped-modified' });
            continue;
          }
        }
        await fsp.rm(item.destination, { force: true });
        results.push({ filename: item.filename, action: 'removed-installed-file' });
      }
    } catch (error) {
      results.push({ filename: item.filename, action: 'error', message: error.message });
      logger?.error('Rollback step failed', { filename: item.filename, message: error.message });
    }
  }

  const updated = {
    ...record,
    status: 'rolled_back',
    rolledBackAt: new Date().toISOString(),
    rollbackResults: results,
  };
  await writeInstallationRecord(installationsDirectory, updated);
  return updated;
}

module.exports = {
  InstallError,
  backupFile,
  buildInstallPlan,
  createInstallationId,
  installStagedFile,
  installationRecordPath,
  listInstallations,
  readInstallationRecord,
  rollbackInstallation,
  writeInstallationRecord,
};
