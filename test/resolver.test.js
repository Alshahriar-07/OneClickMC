'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSelection,
  collectDependencies,
  loadersForCategory,
  resolveBase,
  selectVersionFile,
} = require('../electron/lib/resolver');

const MC = '26.2';

function makeFile(name, sha, size = 1000, primary = true) {
  return {
    filename: name,
    url: `https://cdn.modrinth.com/data/xyz/versions/abc/${encodeURIComponent(name)}`,
    primary,
    size,
    hashes: { sha1: 'a'.repeat(40), sha512: sha },
  };
}

function makeVersion({ id, number, type = 'release', loaders = ['fabric'], gameVersions = [MC], file, published, dependencies = [] }) {
  return {
    id,
    project_id: 'proj',
    name: `${id} name`,
    version_number: number,
    version_type: type,
    game_versions: gameVersions,
    loaders,
    date_published: published,
    dependencies,
    files: [file],
  };
}

const catalog = {
  schema_version: 1,
  catalog_version: 'test',
  editions: { potato: {}, balanced: {}, ultimate: {} },
  selection_defaults: {
    potato: { shader: null, base_texture: null },
    balanced: { shader: null, base_texture: null },
    ultimate: { shader: 'bsl-shaders', base_texture: null },
  },
  components: [
    {
      id: 'sodium',
      slug: 'sodium',
      name: 'Sodium',
      category: 'mod',
      project_url: 'https://modrinth.com/mod/sodium',
      editions: { potato: 'required', balanced: 'required', ultimate: 'required' },
    },
    {
      id: 'modernfix',
      slug: 'modernfix',
      name: 'ModernFix',
      category: 'mod',
      project_url: 'https://modrinth.com/mod/modernfix',
      editions: { potato: 'optional', balanced: 'optional', ultimate: 'optional' },
    },
    {
      id: 'bsl-shaders',
      slug: 'bsl-shaders',
      name: 'BSL Shaders',
      category: 'shader',
      project_url: 'https://modrinth.com/shader/bsl-shaders',
      editions: { potato: 'optional', balanced: 'optional', ultimate: 'optional' },
    },
    {
      id: 'complementary-unbound',
      slug: 'complementary-unbound',
      name: 'Complementary',
      category: 'shader',
      project_url: 'https://modrinth.com/shader/complementary-unbound',
      editions: { potato: 'off', balanced: 'optional', ultimate: 'optional' },
    },
    {
      id: 'iteration-t',
      slug: null,
      name: 'Iteration T',
      category: 'shader',
      project_url: null,
      editions: { potato: 'optional', balanced: 'optional', ultimate: 'optional' },
    },
    {
      id: 'optimum-realism',
      slug: 'optimum-realism',
      name: 'Optimum Realism',
      category: 'resourcepack',
      pack_role: 'base',
      project_url: 'https://modrinth.com/resourcepack/optimum-realism',
      editions: { potato: 'off', balanced: 'optional', ultimate: 'optional' },
    },
  ],
};

const manifest = {
  schema_version: 1,
  minecraft_version: MC,
  loader: 'fabric',
  loader_label: 'Fabric',
  overrides: {
    modernfix: {
      status: 'UNAVAILABLE',
      reason: 'No Fabric build for Minecraft 26.2 is published by the project (checked 2026-10-18).',
    },
    'iteration-t': { status: 'UNVERIFIED', reason: 'No confirmed official project page or download.' },
  },
  known_conflicts: [],
};

const versionsBySlug = {
  sodium: [makeVersion({ id: 'v1', number: '1.0', file: makeFile('sodium.jar', 'f'.repeat(128)), published: '2026-01-01T00:00:00Z' })],
  'complementary-unbound': [
    makeVersion({
      id: 'v2',
      number: '5.4',
      loaders: ['iris', 'minecraft'],
      file: makeFile('ComplementaryUnbound_r5.4.zip', 'b'.repeat(128), 2000),
      published: '2026-02-01T00:00:00Z',
    }),
  ],
  'optimum-realism': [
    makeVersion({
      id: 'v3',
      number: 'R22',
      loaders: ['minecraft'],
      file: makeFile('Optimum Realism R22.zip', 'c'.repeat(128), 5_000_000),
      published: '2026-03-01T00:00:00Z',
    }),
  ],
  'bsl-shaders': [
    makeVersion({
      id: 'v4',
      number: '10.1.8',
      loaders: ['iris', 'optifine'],
      file: makeFile('BSL_v10.1.8.zip', 'd'.repeat(128), 1_100_000),
      published: '2026-04-01T00:00:00Z',
    }),
  ],
  modernfix: [],
};

function makeClient(overrides = {}) {
  return {
    async getProjects() {
      return [
        { id: 'AANobbMI', slug: 'sodium', title: 'Sodium', project_type: 'mod', license: { id: 'LGPL-3.0-only', name: 'LGPL-3.0-only' } },
      ];
    },
    async getProject(id) {
      if (id === 'fapi') {
        return { id: 'fapi', slug: 'fabric-api', title: 'Fabric API', project_type: 'mod', license: { id: 'Apache-2.0', name: 'Apache-2.0' } };
      }
      throw Object.assign(new Error('not found'), { status: 404 });
    },
    async getVersions(slug) {
      return versionsBySlug[slug] || [];
    },
    ...overrides,
  };
}

async function resolveTestBase(overrides) {
  return resolveBase({
    manifest,
    catalog,
    client: makeClient(overrides),
    concurrency: 2,
  });
}

test('selectVersionFile prefers the release channel and exact game version', () => {
  const versions = [
    makeVersion({
      id: 'beta',
      number: '1.1',
      type: 'beta',
      file: makeFile('sodium-beta.jar', 'a'.repeat(128)),
      published: '2026-06-01T00:00:00Z',
    }),
    makeVersion({
      id: 'stable',
      number: '1.0',
      file: makeFile('sodium-stable.jar', 'b'.repeat(128)),
      published: '2026-01-01T00:00:00Z',
    }),
    makeVersion({
      id: 'other-version',
      number: '0.9',
      gameVersions: ['26.1'],
      file: makeFile('sodium-old.jar', 'c'.repeat(128)),
      published: '2026-07-01T00:00:00Z',
    }),
    makeVersion({
      id: 'wrong-loader',
      number: '1.2',
      loaders: ['neoforge'],
      file: makeFile('sodium-neo.jar', 'd'.repeat(128)),
      published: '2026-08-01T00:00:00Z',
    }),
  ];

  const selected = selectVersionFile(versions, { minecraftVersion: MC, category: 'mod' });
  assert.equal(selected.version.id, 'stable');
  assert.equal(selected.file.filename, 'sodium-stable.jar');
  assert.deepEqual(selected.warnings, []);

  const none = selectVersionFile(versions, { minecraftVersion: '26.9', category: 'mod' });
  assert.equal(none, null);
});

test('selectVersionFile falls back to a pre-release and reports it', () => {
  const versions = [
    makeVersion({
      id: 'beta',
      number: '1.1',
      type: 'beta',
      file: makeFile('sodium-beta.jar', 'a'.repeat(128)),
      published: '2026-06-01T00:00:00Z',
    }),
  ];
  const selected = selectVersionFile(versions, { minecraftVersion: MC, category: 'mod' });
  assert.equal(selected.version.id, 'beta');
  assert.equal(selected.warnings.length, 1);
  assert.match(selected.warnings[0], /beta/);
});

test('selectVersionFile rejects files without hashes or https urls', () => {
  const versions = [
    makeVersion({
      id: 'no-hash',
      number: '1.0',
      file: { filename: 'x.jar', url: 'https://cdn.modrinth.com/x.jar', size: 10, hashes: {} },
      published: '2026-01-01T00:00:00Z',
    }),
    makeVersion({
      id: 'insecure',
      number: '1.0',
      file: { filename: 'y.jar', url: 'http://cdn.modrinth.com/y.jar', size: 10, hashes: { sha512: 'a'.repeat(128) } },
      published: '2026-01-02T00:00:00Z',
    }),
  ];
  assert.equal(selectVersionFile(versions, { minecraftVersion: MC, category: 'mod' }), null);
});

test('loader sets differ per component category', () => {
  assert.deepEqual(loadersForCategory('mod'), ['fabric']);
  assert.deepEqual(loadersForCategory('shader'), ['iris', 'minecraft', 'optifine']);
  assert.deepEqual(loadersForCategory('resourcepack'), ['minecraft']);
});

test('resolveBase marks unavailable, unverified and verified components correctly', async () => {
  const base = await resolveTestBase();
  assert.equal(base.records.sodium.status, 'VERIFIED');
  assert.equal(base.records.sodium.file.filename, 'sodium.jar');
  assert.equal(base.records.sodium.license.id, 'LGPL-3.0-only');

  assert.equal(base.records.modernfix.status, 'UNAVAILABLE');
  assert.match(base.records.modernfix.reason, /No Fabric build/);

  assert.equal(base.records['iteration-t'].status, 'UNVERIFIED');
  assert.equal(base.records['iteration-t'].file, null);
});

test('resolveBase resolves required dependencies from the official project ids', async () => {
  const dependentVersion = makeVersion({
    id: 'v1',
    number: '1.0',
    file: makeFile('sodium.jar', 'f'.repeat(128)),
    published: '2026-01-01T00:00:00Z',
    dependencies: [{ project_id: 'fapi', version_id: null, dependency_type: 'required', file_name: null }],
  });
  const base = await resolveTestBase({
    async getVersions(slug) {
      if (slug === 'sodium') return [dependentVersion];
      if (slug === 'fabric-api') {
        return [makeVersion({ id: 'fapi1', number: '0.1', file: makeFile('fabric-api.jar', 'e'.repeat(128), 500), published: '2026-01-02T00:00:00Z' })];
      }
      return versionsBySlug[slug] || [];
    },
  });

  const dependency = base.records['dep:fapi'];
  assert.ok(dependency, 'expected a dependency record');
  assert.equal(dependency.status, 'VERIFIED');
  assert.equal(dependency.name, 'Fabric API');
  assert.equal(dependency.role, 'dependency');
  assert.deepEqual(base.records.sodium.dependencies.map((entry) => entry.key), ['dep:fapi']);
});

test('resolveBase reports a missing dependency instead of inventing one', async () => {
  const dependentVersion = makeVersion({
    id: 'v1',
    number: '1.0',
    file: makeFile('sodium.jar', 'f'.repeat(128)),
    published: '2026-01-01T00:00:00Z',
    dependencies: [{ project_id: 'missing-project', version_id: null, dependency_type: 'required', file_name: null }],
  });
  const base = await resolveTestBase({
    async getVersions(slug) {
      if (slug === 'sodium') return [dependentVersion];
      return versionsBySlug[slug] || [];
    },
  });
  const dependencyKey = base.records.sodium.dependencies[0].key;
  assert.equal(base.records[dependencyKey].status, 'UNAVAILABLE');
});

test('resolveBase throws when nothing can be verified (offline)', async () => {
  await assert.rejects(
    () =>
      resolveTestBase({
        async getVersions() {
          throw Object.assign(new Error('network down'), { code: 'ENOTFOUND' });
        },
        async getProjects() {
          throw Object.assign(new Error('network down'), { code: 'ENOTFOUND' });
        },
      }),
    /could not be reached/i,
  );
});

test('buildSelection applies edition defaults, dependency closure and statuses', async () => {
  const base = await resolveTestBase();
  const selection = buildSelection({
    manifest,
    catalog,
    base,
    edition: 'ultimate',
    selectedIds: null,
  });

  assert.equal(selection.error, undefined);
  assert.equal(selection.shaderId, 'bsl-shaders');
  assert.equal(selection.defaultSelectedIds.includes('bsl-shaders'), true);

  const sodium = selection.components.find((item) => item.id === 'sodium');
  assert.equal(sodium.status, 'VERIFIED');
  assert.equal(sodium.required, true);
  assert.equal(sodium.locked, true);

  const modernfix = selection.components.find((item) => item.id === 'modernfix');
  assert.equal(modernfix.status, 'UNAVAILABLE');
  assert.equal(modernfix.selected, false);

  const iterationT = selection.components.find((item) => item.id === 'iteration-t');
  assert.equal(iterationT.status, 'UNVERIFIED');

  const pack = selection.components.find((item) => item.id === 'optimum-realism');
  assert.equal(pack.packRole, 'base');
  assert.equal(pack.selected, false);
  assert.equal(selection.blockers.length, 0);
  assert.equal(selection.totalSize, 1000 + 1_100_000);
});

test('buildSelection refuses two active shaders and tolerates unverified requests', async () => {
  const base = await resolveTestBase();
  const error = buildSelection({
    manifest,
    catalog,
    base,
    edition: 'ultimate',
    selectedIds: ['bsl-shaders', 'complementary-unbound'],
  });
  assert.equal(error.error.code, 'MULTIPLE_SHADERS');

  const tolerant = buildSelection({
    manifest,
    catalog,
    base,
    edition: 'ultimate',
    selectedIds: ['modernfix', 'iteration-t'],
  });
  assert.equal(tolerant.error, undefined);
  assert.equal(tolerant.selectedNames.includes('ModernFix'), false);
  assert.equal(tolerant.rejectedIds.includes('modernfix'), true);
  assert.equal(tolerant.warnings.some((warning) => /ModernFix was requested/.test(warning)), true);
});

test('buildSelection reports blockers for unavailable required components', async () => {
  const base = await resolveTestBase();
  base.records.sodium.status = 'UNAVAILABLE';
  base.records.sodium.reason = 'No Fabric build for this version.';
  const selection = buildSelection({ manifest, catalog, base, edition: 'balanced', selectedIds: [] });
  assert.equal(selection.blockers.length, 1);
  assert.equal(selection.blockers[0].id, 'sodium');
  assert.match(selection.blockers[0].reason, /No Fabric build/);
});

test('collectDependencies propagates a failed dependency up the chain', () => {
  const records = {
    a: {
      key: 'a',
      status: 'VERIFIED',
      dependencies: [{ key: 'b', name: 'B', status: 'VERIFIED', type: 'required' }],
    },
    b: {
      key: 'b',
      status: 'VERIFIED',
      dependencies: [{ key: 'c', name: 'C', status: 'UNAVAILABLE', type: 'required' }],
    },
    c: { key: 'c', status: 'UNAVAILABLE', dependencies: [] },
  };
  const result = collectDependencies(records, ['a']);
  assert.equal(result.selected.has('b'), true);
  assert.equal(result.blocked.has('b'), true);
  assert.equal(result.blocked.has('a'), true);
});

test('buildSelection keeps public records free of download URLs', async () => {
  const base = await resolveTestBase();
  const selection = buildSelection({ manifest, catalog, base, edition: 'potato', selectedIds: [] });
  const serialized = JSON.stringify(selection);
  assert.equal(serialized.includes('"url"'), false);
  assert.equal(
    selection.components.find((item) => item.id === 'sodium').file.url,
    undefined,
    'renderer payload must not carry download URLs',
  );
});
