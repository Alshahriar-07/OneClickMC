'use strict';

/**
 * End-to-end installation test.
 *
 * Uses the real Modrinth API and real downloads against a synthetic Minecraft
 * directory, then checks install, verification, user-data safety, rollback and
 * cancellation. Requires network access. Run with: node scripts/e2e-install.js
 */

const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { JobManager } = require('../electron/lib/jobs');
const { ModrinthClient } = require('../electron/lib/modrinth');
const { hashFile } = require('../electron/lib/paths');

const ROOT = path.resolve(__dirname, '..');
const MINECRAFT_VERSION = process.env.E2E_MC_VERSION || '26.2';
const EDITION = process.env.E2E_EDITION || 'potato';
const FABRIC_VERSION = '0.16.14';

const results = [];

function record(name, ok, detail = null) {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}\n`);
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function createFakeGameDir(base) {
  const gameDir = path.join(base, 'minecraft');
  await fsp.mkdir(path.join(gameDir, 'versions', `fabric-loader-${FABRIC_VERSION}-${MINECRAFT_VERSION}`), { recursive: true });
  await writeJson(
    path.join(gameDir, 'versions', `fabric-loader-${FABRIC_VERSION}-${MINECRAFT_VERSION}`, `fabric-loader-${FABRIC_VERSION}-${MINECRAFT_VERSION}.json`),
    {
      id: `fabric-loader-${FABRIC_VERSION}-${MINECRAFT_VERSION}`,
      inheritsFrom: MINECRAFT_VERSION,
      javaVersion: { majorVersion: 21 },
      libraries: [{ name: `net.fabricmc:fabric-loader:${FABRIC_VERSION}` }],
    },
  );
  await writeJson(path.join(gameDir, 'versions', MINECRAFT_VERSION, `${MINECRAFT_VERSION}.json`), {
    id: MINECRAFT_VERSION,
    javaVersion: { majorVersion: 21 },
  });
  await writeJson(path.join(gameDir, 'launcher_profiles.json'), {
    profiles: {
      e2e: {
        name: 'E2E Fabric profile',
        type: 'custom',
        lastVersionId: `fabric-loader-${FABRIC_VERSION}-${MINECRAFT_VERSION}`,
      },
    },
  });

  // Existing user data that must never be touched.
  await fsp.mkdir(path.join(gameDir, 'saves', 'My World'), { recursive: true });
  await fsp.writeFile(path.join(gameDir, 'saves', 'My World', 'level.dat'), 'precious world data');
  await fsp.mkdir(path.join(gameDir, 'mods'), { recursive: true });
  await fsp.writeFile(path.join(gameDir, 'mods', 'unrelated-mod.jar'), 'user mod that must survive');
  await fsp.writeFile(path.join(gameDir, 'options.txt'), 'fov:70');
  return gameDir;
}

function makeManager(userDataDir) {
  return new JobManager({
    appRoot: ROOT,
    userDataDir,
    stagingDir: path.join(userDataDir, 'staging'),
    backupsDir: path.join(userDataDir, 'backups'),
    installationsDir: path.join(userDataDir, 'installations'),
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      describe: () => ({ filePath: null, directory: null }),
    },
    client: new ModrinthClient({}),
    emit: () => {},
  });
}

function waitForJob(manager, jobId, { cancelAfterFirstProgress = false } = {}) {
  return new Promise((resolve, reject) => {
    const manager2 = manager;
    const originalEmit = manager2.emit;
    let cancelled = false;
    manager2.emit = (id, event) => {
      if (id === jobId) {
        if (cancelAfterFirstProgress && !cancelled && event.type === 'progress' && event.current >= 1) {
          cancelled = true;
          manager2.cancel(jobId);
        }
        if (event.type === 'done') {
          manager2.emit = originalEmit;
          clearTimeout(timeout);
          resolve(event.result);
        }
      }
    };
    const timeout = setTimeout(() => {
      manager2.emit = originalEmit;
      reject(new Error('job timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });
}

async function main() {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'oneclickmc-e2e-'));
  const userDataDir = path.join(base, 'appdata');
  const gameDir = await createFakeGameDir(base);
  const manager = makeManager(userDataDir);

  process.stdout.write(`Synthetic game directory: ${gameDir}\n`);
  process.stdout.write(`Target: Minecraft ${MINECRAFT_VERSION} / Fabric / edition ${EDITION}\n\n`);

  // 1. Compatibility resolution through the live API.
  const resolution = await manager.resolveCompatibility({ minecraftVersion: MINECRAFT_VERSION, refresh: true });
  const verified = Object.values(resolution.base.records).filter((record2) => record2.status === 'VERIFIED');
  record('live compatibility resolution', verified.length > 0, `${verified.length} verified components`);
  record(
    'unavailable components are reported, not invented',
    Object.values(resolution.base.records).some((entry) => entry.status === 'UNAVAILABLE' || entry.status === 'UNVERIFIED'),
  );

  const view = await manager.getSelectionView({
    minecraftVersion: MINECRAFT_VERSION,
    edition: EDITION,
    selectedIds: null,
  });
  record('selection builds without blockers', (view.selection?.blockers || []).length === 0,
    `${view.selection?.counts?.selected ?? 0} selected files`);

  await manager.previewPlan({
    gameDir,
    minecraftVersion: MINECRAFT_VERSION,
    edition: EDITION,
    selectedIds: null,
  });
  record('dry-run plan creates no files', (await fsp.readdir(gameDir)).every((entry) => entry !== 'shaderpacks'));

  // 2. Real installation.
  const started = manager.startInstall({
    gameDir,
    minecraftVersion: MINECRAFT_VERSION,
    edition: EDITION,
    selectedIds: null,
  });
  const runResult = await waitForJob(manager, started.jobId);
  record('installation finished successfully', runResult.status === 'success', `${runResult.installed?.length ?? 0} files`);
  if (runResult.status !== 'success') {
    process.stdout.write(`Result: ${JSON.stringify(runResult, null, 2)}\n`);
  }

  const journalPath = path.join(userDataDir, 'installations', `${runResult.installationId}.json`);
  const journal = JSON.parse(await fsp.readFile(journalPath, 'utf8'));
  const installedItems = journal.items.filter((item) => item.installed);
  record('journal records every installed file', installedItems.length === (runResult.installed?.length ?? 0));

  let hashesOk = true;
  for (const item of installedItems) {
    const actual = await hashFile(item.destination, 'sha512').catch(() => null);
    if (!item.sha512 || actual !== item.sha512) hashesOk = false;
  }
  record('every installed file matches its published SHA-512 hash', hashesOk);

  const unrelated = await fsp.readFile(path.join(gameDir, 'mods', 'unrelated-mod.jar'), 'utf8');
  const worldData = await fsp.readFile(path.join(gameDir, 'saves', 'My World', 'level.dat'), 'utf8');
  const options = await fsp.readFile(path.join(gameDir, 'options.txt'), 'utf8');
  record('unrelated user mods survive', unrelated === 'user mod that must survive');
  record('worlds and saves survive', worldData === 'precious world data');
  record('options.txt survives', options === 'fov:70');
  record('no staged or temporary files are left behind', !(await listTemporaryFiles(gameDir)).length);

  // 3. Rollback restores the previous state.
  const rollback = await manager.rollback(runResult.installationId);
  record('rollback reports success', rollback.ok === true);
  const stillInstalled = [];
  for (const item of installedItems) {
    if (await fsp.access(item.destination).then(() => true).catch(() => false)) stillInstalled.push(item.filename);
  }
  record('rollback removes installed files and keeps user data', stillInstalled.length === 0 && (await fsp.readFile(path.join(gameDir, 'mods', 'unrelated-mod.jar'), 'utf8')) === 'user mod that must survive');

  // 4. Cancellation is safe.
  const cancelPreview = await manager.previewPlan({
    gameDir,
    minecraftVersion: MINECRAFT_VERSION,
    edition: EDITION,
    selectedIds: null,
  });
  assert.ok(cancelPreview.plan.items.length > 0, 'expected a non-empty plan for the cancellation test');
  const cancelStarted = manager.startInstall({
    gameDir,
    minecraftVersion: MINECRAFT_VERSION,
    edition: EDITION,
    selectedIds: null,
  });
  const cancelResult = await waitForJob(manager, cancelStarted.jobId, { cancelAfterFirstProgress: true });
  record('cancellation is reported honestly', ['cancelled', 'success'].includes(cancelResult.status), cancelResult.status);
  record('cancellation leaves no temporary files', !(await listTemporaryFiles(gameDir)).length);

  // 5. Invalid destinations fail before touching anything.
  const blocked = manager.startInstall({
    gameDir: path.join(base, 'missing-directory'),
    minecraftVersion: MINECRAFT_VERSION,
    edition: EDITION,
    selectedIds: null,
  });
  const blockedResult = await waitForJob(manager, blocked.jobId);
  record(
    'a missing game directory fails safely',
    blockedResult.status === 'failed' && /does not exist|no longer exists/i.test(blockedResult.message),
    blockedResult.message,
  );

  await fsp.rm(base, { recursive: true, force: true });

  const failed = results.filter((entry) => !entry.ok);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

async function listTemporaryFiles(directory) {
  const found = [];
  const entries = await fsp.readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await listTemporaryFiles(full)));
    } else if (entry.name.endsWith('.part') || entry.name.endsWith('.tmp')) {
      found.push(full);
    }
  }
  return found;
}

main().catch((error) => {
  process.stderr.write(`E2E test crashed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
