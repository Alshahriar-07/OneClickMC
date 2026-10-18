'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  detectLoader,
  evaluateCompatibility,
  expandGameDirectory,
  inspectRoot,
  scanVersionEntries,
  VERSION_ID_PATTERN,
} = require('../electron/lib/minecraft');

async function makeTempRoot() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'oneclickmc-test-'));
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

test('detectLoader identifies Fabric from libraries and version ids', () => {
  const fabric = detectLoader(
    [{ name: 'net.fabricmc:fabric-loader:0.16.14' }, { name: 'net.fabricmc:intermediary:1.21.11' }],
    'fabric-loader-0.16.14-1.21.11',
  );
  assert.equal(fabric.loader, 'fabric');
  assert.equal(fabric.loaderVersion, '0.16.14');

  assert.equal(detectLoader([{ name: 'net.minecraftforge:forge:1.20.1' }], 'forge-1.20.1').loader, 'forge');
  assert.equal(detectLoader([{ name: 'net.neoforged:neoforge:21.1.0' }], 'neoforge-21.1.0').loader, 'neoforge');
  assert.equal(detectLoader([], '1.21.11').loader, 'vanilla');
});

test('expandGameDirectory resolves relative and variable paths', () => {
  const root = path.resolve('C:/minecraft');
  assert.equal(expandGameDirectory(root, null), root);
  assert.equal(expandGameDirectory(root, 'instances/My World'), path.join(root, 'instances', 'My World'));
  assert.equal(expandGameDirectory(root, 'D:/games/profile'), path.resolve('D:/games/profile'));
});

test('inspectRoot ignores custom version folder names', async (t) => {
  const root = await makeTempRoot();
  t.after(() => fsp.rm(root, { recursive: true, force: true }));

  // A folder named "My World" whose JSON metadata says the game version is 26.2.
  await writeJson(path.join(root, 'versions', 'My World', 'My World.json'), {
    id: 'fabric-loader-0.16.14-26.2',
    inheritsFrom: '26.2',
    libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.14' }],
    javaVersion: { majorVersion: 21 },
  });
  // A vanilla version directory with a matching id.
  await writeJson(path.join(root, 'versions', '1.21.11', '1.21.11.json'), {
    id: '1.21.11',
    javaVersion: { majorVersion: 21 },
  });
  await writeJson(path.join(root, 'launcher_profiles.json'), {
    profiles: {
      abc123: {
        name: 'Fabric 26.2',
        type: 'custom',
        lastVersionId: 'fabric-loader-0.16.14-26.2',
      },
      def456: {
        name: 'My World profile',
        type: 'custom',
        gameDir: 'instances/My World',
        lastVersionId: 'Not A Real Version',
      },
      ghi789: {
        name: 'Custom folder profile',
        type: 'custom',
        lastVersionId: 'My World',
      },
    },
  });

  const inspection = await inspectRoot(root);
  assert.equal(inspection.valid, true);

  const custom = inspection.versions.find((version) => version.dirName === 'My World');
  assert.equal(custom.actualVersion, '26.2');
  assert.equal(custom.loader, 'fabric');
  assert.equal(custom.customFolderName, true);

  const vanilla = inspection.versions.find((version) => version.dirName === '1.21.11');
  assert.equal(vanilla.actualVersion, '1.21.11');
  assert.equal(vanilla.loader, 'vanilla');

  const fabricVersion = inspection.fabricVersions.find((entry) => entry.minecraftVersion === '26.2');
  assert.equal(fabricVersion.loaderVersion, '0.16.14');

  const fabricProfile = inspection.profiles.find((profile) => profile.id === 'abc123');
  assert.equal(fabricProfile.evidenceVersion, '26.2');
  assert.match(fabricProfile.evidenceSource, /inheritsFrom/);
  assert.equal(fabricProfile.gameDir, root);

  const customDirProfile = inspection.profiles.find((profile) => profile.id === 'def456');
  assert.equal(customDirProfile.gameDir, path.join(root, 'instances', 'My World'));
  assert.equal(customDirProfile.gameDirExists, false);
  assert.equal(customDirProfile.evidenceVersion, null);

  // A launcher lastVersionId that matches a custom folder still resolves through
  // the version JSON metadata, never through the folder name itself.
  const folderNamedProfile = inspection.profiles.find((profile) => profile.id === 'ghi789');
  assert.equal(folderNamedProfile.evidenceVersion, '26.2');
  assert.match(folderNamedProfile.evidenceSource, /inheritsFrom/);
  assert.equal(inspection.warnings.some((warning) => /custom version folder name/i.test(warning)), true);
  assert.equal(inspection.warnings.some((warning) => /missing game directory/i.test(warning)), true);
});

test('inspectRoot reports unusable folders honestly', async (t) => {
  const root = await makeTempRoot();
  t.after(() => fsp.rm(root, { recursive: true, force: true }));

  const empty = await inspectRoot(root);
  assert.equal(empty.valid, false);
  assert.equal(empty.exists, true);
  assert.ok(empty.problems.length > 0);

  const missing = await inspectRoot(path.join(root, 'does-not-exist'));
  assert.equal(missing.exists, false);
  assert.match(missing.problems[0], /does not exist/i);

  await fsp.mkdir(path.join(root, 'mods'), { recursive: true });
  const instance = await inspectRoot(root);
  assert.equal(instance.valid, true);
  assert.equal(instance.looksLikeGameDirectory, true);
});

test('a version folder without JSON metadata is reported, never guessed', async (t) => {
  const root = await makeTempRoot();
  t.after(() => fsp.rm(root, { recursive: true, force: true }));

  await fsp.mkdir(path.join(root, 'versions', 'Mr Earth'), { recursive: true });
  await writeJson(path.join(root, 'launcher_profiles.json'), { profiles: {} });

  const inspection = await inspectRoot(root);
  // The folder still appears in the scan, but with no guessed version.
  assert.equal(inspection.versions.length, 1);
  const entry = inspection.versionEntries[0];
  assert.equal(entry.folderName, 'Mr Earth');
  assert.equal(entry.actualVersion, null);
  assert.equal(entry.valid, false);
  assert.equal(entry.compatibility.supported, false);
  assert.match(entry.problems[0].message, /no version json metadata/i);
  assert.ok(inspection.versionProblems.length >= 1);
});

test('scanVersionEntries classifies entries against the supported targets', async (t) => {
  const root = await makeTempRoot();
  t.after(() => fsp.rm(root, { recursive: true, force: true }));

  await writeJson(path.join(root, 'versions', 'fabric-loader-0.16.14-26.2', 'fabric-loader-0.16.14-26.2.json'), {
    id: 'fabric-loader-0.16.14-26.2',
    inheritsFrom: '26.2',
    libraries: [{ name: 'net.fabricmc:fabric-loader:0.16.14' }],
  });
  await writeJson(path.join(root, 'versions', '1.26-future', '1.26-future.json'), {
    id: '1.20.1',
    libraries: [],
  });
  await writeJson(path.join(root, 'versions', '26.1', '26.1.json'), {
    id: '26.1',
    libraries: [],
  });

  const scan = await scanVersionEntries(root);
  assert.equal(scan.missing, false);
  assert.equal(scan.entries.length, 3);

  const fabric = scan.entries.find((entry) => entry.folderName === 'fabric-loader-0.16.14-26.2');
  assert.equal(fabric.actualVersion, '26.2');
  assert.equal(fabric.loader, 'fabric');
  assert.equal(fabric.compatibility.supported, true);
  assert.equal(fabric.compatibility.loaderReady, true);

  const unsupported = scan.entries.find((entry) => entry.folderName === '1.26-future');
  assert.equal(unsupported.actualVersion, '1.20.1');
  assert.equal(unsupported.customFolderName, true);
  assert.equal(unsupported.compatibility.supported, false);
  assert.match(unsupported.compatibility.reason, /not one of the supported target versions/i);

  const vanilla = scan.entries.find((entry) => entry.folderName === '26.1');
  assert.equal(vanilla.compatibility.supported, true);
  assert.equal(vanilla.compatibility.loaderReady, false);
  assert.match(vanilla.compatibility.reason, /Fabric loader/i);
});

test('scanVersionEntries reports a missing versions folder and stays idempotent', async (t) => {
  const root = await makeTempRoot();
  t.after(() => fsp.rm(root, { recursive: true, force: true }));

  const missing = await scanVersionEntries(root);
  assert.equal(missing.missing, true);
  assert.deepEqual(missing.entries, []);

  await writeJson(path.join(root, 'versions', 'My World', 'My World.json'), {
    id: '26.2',
    libraries: [],
  });
  const first = await scanVersionEntries(root);
  const second = await scanVersionEntries(root);
  assert.equal(first.entries.length, 1);
  assert.equal(second.entries.length, 1, 'rescans must not duplicate entries');
});

test('evaluateCompatibility explains every unsupported case', () => {
  assert.equal(evaluateCompatibility('26.2', 'fabric').supported, true);
  assert.equal(evaluateCompatibility('26.2', 'fabric').loaderReady, true);
  assert.equal(evaluateCompatibility('26.1', 'vanilla').supported, true);
  assert.equal(evaluateCompatibility('26.1', 'vanilla').loaderReady, false);
  assert.equal(evaluateCompatibility('1.20.1', 'fabric').supported, false);
  assert.equal(evaluateCompatibility(null, 'unknown').supported, false);
  assert.match(evaluateCompatibility('26.2', 'forge').reason, /only ships Fabric components/i);
});

test('VERSION_ID_PATTERN only matches real version ids', () => {
  assert.equal(VERSION_ID_PATTERN.test('1.21.11'), true);
  assert.equal(VERSION_ID_PATTERN.test('26.2'), true);
  assert.equal(VERSION_ID_PATTERN.test('My World'), false);
  assert.equal(VERSION_ID_PATTERN.test('fabric-loader-0.16.14-1.21.11'), false);
});

test('the bundled background asset is present and readable', () => {
  const background = path.join(__dirname, '..', 'assets', 'appbg.png');
  assert.equal(fs.existsSync(background), true);
  assert.ok(fs.statSync(background).size > 10000);
});
