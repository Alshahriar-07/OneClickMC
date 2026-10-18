'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { JobManager, PHASES, validatePayload } = require('../electron/lib/jobs');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = ['1.21.11', '26.1', '26.2'];
const VALID_STATUSES = new Set([
  'VERIFIED',
  'OPTIONAL_VERIFIED',
  'UNAVAILABLE',
  'UNVERIFIED',
  'INCOMPATIBLE',
  'BLOCKED_DEPENDENCY',
  'BLOCKED_LICENSE',
]);

async function readJson(relative) {
  return JSON.parse(await fsp.readFile(path.join(ROOT, relative), 'utf8'));
}

test('phase weights add up to 100 percent of real work', () => {
  const total = Object.values(PHASES).reduce((sum, phase) => sum + phase.weight, 0);
  assert.equal(total, 100);
});

test('validatePayload rejects unsupported requests', () => {
  assert.throws(() => validatePayload(null), /Missing installation request/);
  assert.throws(() => validatePayload({ gameDir: '', minecraftVersion: '26.2', edition: 'potato' }), /game directory/i);
  assert.throws(
    () => validatePayload({ gameDir: 'C:/mc', minecraftVersion: '1.20.1', edition: 'potato' }),
    /Unsupported Minecraft version/,
  );
  assert.throws(
    () => validatePayload({ gameDir: 'C:/mc', minecraftVersion: '26.2', edition: 'turbo' }),
    /Unknown edition/,
  );
  assert.throws(
    () => validatePayload({ gameDir: 'C:/mc', minecraftVersion: '26.2', edition: 'potato', selectedIds: 'sodium' }),
    /selection is invalid/,
  );

  const payload = validatePayload({
    gameDir: 'C:/mc',
    minecraftVersion: '26.2',
    edition: 'potato',
    selectedIds: ['sodium', 'sodium', 12, 'iris'],
  });
  assert.equal(payload.minecraftVersion, '26.2');
  assert.deepEqual(payload.selectedIds, ['sodium', 'iris']);
});

test('the shipped catalog is well formed', async () => {
  const catalog = await readJson('data/catalog.json');
  assert.equal(catalog.schema_version, 1);
  assert.ok(Array.isArray(catalog.components));
  assert.ok(catalog.components.length >= 30);

  const ids = new Set();
  for (const component of catalog.components) {
    assert.ok(component.id, 'every component needs an id');
    assert.equal(ids.has(component.id), false, `duplicate component id: ${component.id}`);
    ids.add(component.id);
    assert.ok(['mod', 'shader', 'resourcepack'].includes(component.category), `bad category on ${component.id}`);
    assert.ok(component.summary && component.summary.length > 10, `missing summary on ${component.id}`);
    if (component.slug !== null) {
      assert.equal(typeof component.slug, 'string');
      assert.ok(/^[a-z0-9-]+$/.test(component.slug), `unexpected slug on ${component.id}`);
    }
    if (component.project_url) {
      assert.ok(component.project_url.startsWith('https://'), `insecure project url on ${component.id}`);
    }

    const levels = Object.values(component.editions || {});
    assert.equal(levels.length, 3, `edition levels missing on ${component.id}`);
    for (const level of levels) {
      assert.ok(['required', 'optional', 'off'].includes(level), `bad edition level on ${component.id}`);
    }
  }

  for (const edition of ['potato', 'balanced', 'ultimate']) {
    assert.ok(catalog.editions[edition], `missing edition metadata for ${edition}`);
  }

  const requiredShaders = catalog.components.filter(
    (component) => component.category === 'shader' && Object.values(component.editions).includes('required'),
  );
  assert.deepEqual(requiredShaders, [], 'no shader may be required by default');
});

test('every target version ships its own Fabric manifest', async () => {
  for (const version of TARGETS) {
    const manifest = await readJson(`data/manifests/${version}.json`);
    assert.equal(manifest.minecraft_version, version);
    assert.equal(manifest.loader, 'fabric');
    assert.ok(manifest.reviewed_at, `manifest ${version} needs a review date`);
    assert.equal(typeof manifest.overrides, 'object');
  }
});

test('manifest overrides only reference known components with honest reasons', async () => {
  const catalog = await readJson('data/catalog.json');
  const known = new Set(catalog.components.map((component) => component.id));

  for (const version of TARGETS) {
    const manifest = await readJson(`data/manifests/${version}.json`);
    for (const [id, override] of Object.entries(manifest.overrides)) {
      assert.ok(known.has(id), `${version}: override for unknown component ${id}`);
      assert.ok(VALID_STATUSES.has(override.status), `${version}: invalid override status for ${id}`);
      assert.ok(override.reason && override.reason.length > 20, `${version}: override for ${id} needs a reason`);
    }
  }
});

test('external-only components never carry a Modrinth slug', async () => {
  const catalog = await readJson('data/catalog.json');
  const external = catalog.components.filter(
    (component) => component.project_url && !component.project_url.includes('modrinth.com'),
  );
  for (const component of external) {
    assert.equal(component.slug, null, `${component.id} must not pretend to be resolvable on Modrinth`);
    assert.ok((component.caveats || []).length > 0, `${component.id} needs a manual-install caveat`);
  }
});

test('default selections only reference components that exist', async () => {
  const catalog = await readJson('data/catalog.json');
  const ids = new Set(catalog.components.map((component) => component.id));
  for (const [edition, defaults] of Object.entries(catalog.selection_defaults)) {
    for (const key of ['shader', 'base_texture']) {
      const value = defaults[key];
      if (value) {
        assert.ok(ids.has(value), `${edition} default ${key} references unknown id ${value}`);
        const component = catalog.components.find((entry) => entry.id === value);
        assert.ok(
          ['optional', 'required'].includes(component.editions[edition]),
          `${edition} default ${value} is not available in that edition`,
        );
      }
    }
  }
});

test('JobManager loads manifests from disk and rejects unknown versions', async () => {
  const manager = new JobManager({
    appRoot: ROOT,
    userDataDir: path.join(ROOT, 'test-artifacts'),
    stagingDir: path.join(ROOT, 'test-artifacts', 'staging'),
    backupsDir: path.join(ROOT, 'test-artifacts', 'backups'),
    installationsDir: path.join(ROOT, 'test-artifacts', 'installations'),
    logger: null,
    client: {},
  });

  const manifest = await manager.getManifest('26.2');
  assert.equal(manifest.minecraft_version, '26.2');
  assert.equal(manifest.loader, 'fabric');

  await assert.rejects(() => manager.getManifest('1.20.1'), /Unsupported Minecraft version/);

  const catalog = await manager.ensureData();
  assert.ok(catalog.components.length > 30);
});
