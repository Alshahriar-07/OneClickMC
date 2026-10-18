'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  backupFile,
  buildInstallPlan,
  installStagedFile,
  listInstallations,
  rollbackInstallation,
  writeInstallationRecord,
} = require('../electron/lib/installer');

async function makeDir(prefix) {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

function makeItem({ key, name, category, filename, sha512, size = 100, required = true }) {
  return {
    key,
    name,
    category,
    required,
    file: {
      filename,
      url: `https://cdn.modrinth.com/data/x/versions/y/${encodeURIComponent(filename)}`,
      size,
      sha512,
      sha1: 'a'.repeat(40),
      host: 'cdn.modrinth.com',
    },
    requiredBy: [],
  };
}

function hash(content) {
  return crypto.createHash('sha512').update(content).digest('hex');
}

test('buildInstallPlan validates destinations and reports conflicts', async (t) => {
  const gameDir = await makeDir('oneclickmc-game-');
  t.after(() => fsp.rm(gameDir, { recursive: true, force: true }));

  await fsp.mkdir(path.join(gameDir, 'mods'), { recursive: true });
  await fsp.writeFile(path.join(gameDir, 'mods', 'existing.jar'), 'old mod');

  const items = [
    makeItem({ key: 'new', name: 'New', category: 'mod', filename: 'new.jar', sha512: 'a'.repeat(128) }),
    makeItem({ key: 'existing', name: 'Existing', category: 'mod', filename: 'existing.jar', sha512: 'b'.repeat(128) }),
  ];

  const plan = await buildInstallPlan({ gameDir, items, minecraftVersion: '26.2', loader: 'fabric', edition: 'balanced' });
  assert.equal(plan.items.length, 2);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].filename, 'existing.jar');
  assert.equal(plan.items.find((item) => item.key === 'existing').existsBefore, true);
  assert.equal(plan.items.find((item) => item.key === 'new').existsBefore, false);
  assert.ok(plan.requiredBytes > plan.totalSize);
});

test('buildInstallPlan refuses unsafe file names and path escapes', async (t) => {
  const gameDir = await makeDir('oneclickmc-game-');
  t.after(() => fsp.rm(gameDir, { recursive: true, force: true }));

  await assert.rejects(
    () =>
      buildInstallPlan({
        gameDir,
        items: [makeItem({ key: 'bad', name: 'Bad', category: 'mod', filename: '../escape.jar', sha512: 'a'.repeat(128) })],
        minecraftVersion: '26.2',
        loader: 'fabric',
        edition: 'balanced',
      }),
    /unsafe file name/i,
  );

  await assert.rejects(
    () =>
      buildInstallPlan({
        gameDir,
        items: [makeItem({ key: 'exe', name: 'Exe', category: 'mod', filename: 'malware.exe', sha512: 'a'.repeat(128) })],
        minecraftVersion: '26.2',
        loader: 'fabric',
        edition: 'balanced',
      }),
    /unsafe file name/i,
  );
});

test('buildInstallPlan rejects two different files targeting the same name', async (t) => {
  const gameDir = await makeDir('oneclickmc-game-');
  t.after(() => fsp.rm(gameDir, { recursive: true, force: true }));

  await assert.rejects(
    () =>
      buildInstallPlan({
        gameDir,
        items: [
          makeItem({ key: 'a', name: 'A', category: 'mod', filename: 'same.jar', sha512: 'a'.repeat(128) }),
          makeItem({ key: 'b', name: 'B', category: 'mod', filename: 'same.jar', sha512: 'b'.repeat(128) }),
        ],
        minecraftVersion: '26.2',
        loader: 'fabric',
        edition: 'balanced',
      }),
    /both provide/i,
  );
});

test('buildInstallPlan fails when the game directory is missing', async () => {
  await assert.rejects(
    () =>
      buildInstallPlan({
        gameDir: path.join(os.tmpdir(), 'oneclickmc-does-not-exist'),
        items: [makeItem({ key: 'a', name: 'A', category: 'mod', filename: 'a.jar', sha512: 'a'.repeat(128) })],
        minecraftVersion: '26.2',
        loader: 'fabric',
        edition: 'balanced',
      }),
    /does not exist/i,
  );
});

test('installation backs up, installs, verifies and rolls back cleanly', async (t) => {
  const gameDir = await makeDir('oneclickmc-game-');
  const appData = await makeDir('oneclickmc-appdata-');
  const staging = await makeDir('oneclickmc-staging-');
  t.after(() => Promise.all([
    fsp.rm(gameDir, { recursive: true, force: true }),
    fsp.rm(appData, { recursive: true, force: true }),
    fsp.rm(staging, { recursive: true, force: true }),
  ]));

  const newContent = Buffer.from('new mod bytes');
  const replacementContent = Buffer.from('replacement mod bytes');
  const oldContent = Buffer.from('old mod bytes');

  await fsp.mkdir(path.join(gameDir, 'mods'), { recursive: true });
  await fsp.writeFile(path.join(gameDir, 'mods', 'replace.jar'), oldContent);
  await fsp.mkdir(path.join(gameDir, 'shaderpacks'), { recursive: true });

  const items = [
    makeItem({ key: 'new', name: 'New mod', category: 'mod', filename: 'new.jar', sha512: hash(newContent), size: newContent.length }),
    makeItem({
      key: 'replace',
      name: 'Replacement',
      category: 'mod',
      filename: 'replace.jar',
      sha512: hash(replacementContent),
      size: replacementContent.length,
    }),
    makeItem({
      key: 'shader',
      name: 'Shader',
      category: 'shader',
      filename: 'shader.zip',
      sha512: hash(Buffer.from('shader bytes')),
      size: 12,
    }),
  ];

  const plan = await buildInstallPlan({
    gameDir,
    items,
    minecraftVersion: '26.2',
    loader: 'fabric',
    edition: 'balanced',
    createDirectories: true,
    stagingDir: staging,
  });

  const installationId = 'test-installation';
  const record = {
    id: installationId,
    status: 'installing',
    startedAt: new Date().toISOString(),
    minecraftVersion: '26.2',
    loader: 'fabric',
    edition: 'balanced',
    gameDir,
    items: plan.items.map((item) => ({
      key: item.key,
      name: item.name,
      filename: item.filename,
      folder: item.folder,
      destination: item.destination,
      sha512: item.sha512,
      backupPath: null,
      installed: false,
      verified: false,
    })),
  };
  await writeInstallationRecord(path.join(appData, 'installations'), record);

  const staged = {
    new: path.join(staging, 'new.jar'),
    replace: path.join(staging, 'replace.jar'),
    shader: path.join(staging, 'shader.zip'),
  };
  await fsp.writeFile(staged.new, newContent);
  await fsp.writeFile(staged.replace, replacementContent);
  await fsp.writeFile(staged.shader, Buffer.from('shader bytes'));

  for (const item of plan.items) {
    if (item.existsBefore) {
      item.backupPath = await backupFile({
        source: item.destination,
        backupRoot: path.join(appData, 'backups'),
        installationId,
        folder: item.folder,
        filename: item.filename,
      });
    }
    await installStagedFile({
      stagedPath: staged[item.key],
      destination: item.destination,
      expectedSha512: item.sha512,
    });
    item.installed = true;
    item.verified = true;
  }

  assert.equal(await fsp.readFile(path.join(gameDir, 'mods', 'new.jar'), 'utf8'), 'new mod bytes');
  assert.equal(await fsp.readFile(path.join(gameDir, 'mods', 'replace.jar'), 'utf8'), 'replacement mod bytes');
  assert.equal(await fsp.readFile(path.join(gameDir, 'shaderpacks', 'shader.zip'), 'utf8'), 'shader bytes');
  const backupPath = plan.items.find((item) => item.key === 'replace').backupPath;
  assert.equal(await fsp.readFile(backupPath, 'utf8'), 'old mod bytes');

  // A rollback restores the previous file and removes the newly installed ones.
  const finalRecord = {
    ...record,
    status: 'success',
    items: record.items.map((item) => {
      const planned = plan.items.find((entry) => entry.key === item.key);
      return { ...item, backupPath: planned.backupPath, installed: true, verified: true };
    }),
  };
  await writeInstallationRecord(path.join(appData, 'installations'), finalRecord);

  const rolledBack = await rollbackInstallation({
    record: finalRecord,
    installationsDirectory: path.join(appData, 'installations'),
  });
  assert.equal(rolledBack.status, 'rolled_back');
  assert.equal(await fsp.readFile(path.join(gameDir, 'mods', 'replace.jar'), 'utf8'), 'old mod bytes');
  await assert.rejects(() => fsp.readFile(path.join(gameDir, 'mods', 'new.jar'), 'utf8'), /ENOENT/);
  await assert.rejects(() => fsp.readFile(path.join(gameDir, 'shaderpacks', 'shader.zip'), 'utf8'), /ENOENT/);
});

test('installStagedFile rejects a file whose hash does not match', async (t) => {
  const dir = await makeDir('oneclickmc-install-');
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));

  const staged = path.join(dir, 'staged.jar');
  await fsp.writeFile(staged, 'tampered');
  await assert.rejects(
    () =>
      installStagedFile({
        stagedPath: staged,
        destination: path.join(dir, 'mods', 'staged.jar'),
        expectedSha512: 'f'.repeat(128),
      }),
    /checksum/i,
  );
  await assert.rejects(() => fsp.readFile(path.join(dir, 'mods', 'staged.jar'), 'utf8'), /ENOENT/);
});

test('listInstallations summarises journals and rollback options', async (t) => {
  const dir = await makeDir('oneclickmc-journals-');
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));

  await writeInstallationRecord(dir, {
    id: 'a',
    status: 'success',
    startedAt: '2026-10-01T10:00:00.000Z',
    minecraftVersion: '26.2',
    edition: 'balanced',
    gameDir: 'C:/mc',
    items: [{ installed: true, error: null }],
  });
  await writeInstallationRecord(dir, {
    id: 'b',
    status: 'failed',
    startedAt: '2026-10-02T10:00:00.000Z',
    minecraftVersion: '26.1',
    edition: 'potato',
    gameDir: 'C:/mc2',
    items: [{ installed: false, error: 'download failed' }],
  });

  const history = await listInstallations(dir);
  assert.equal(history.length, 2);
  assert.equal(history[0].id, 'b');
  assert.equal(history[1].canRollback, true);
  assert.equal(history[0].canRollback, false);
});
