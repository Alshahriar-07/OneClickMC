'use strict';

const path = require('node:path');
const { ALLOWED_EXTENSIONS, isHttpsUrl } = require('./paths');

const LOADERS_BY_CATEGORY = Object.freeze({
  mod: ['fabric'],
  shader: ['iris', 'minecraft', 'optifine'],
  resourcepack: ['minecraft'],
});

const CHANNEL_SCORE = { release: 3, beta: 2, alpha: 1 };
const MAX_DEPENDENCIES = 64;

class ResolverError extends Error {
  constructor(message, code = 'RESOLVER_ERROR') {
    super(message);
    this.name = 'ResolverError';
    this.code = code;
  }
}

function loadersForCategory(category) {
  return LOADERS_BY_CATEGORY[category] || ['fabric'];
}

function categoryForProjectType(projectType) {
  if (projectType === 'shader') return 'shader';
  if (projectType === 'resourcepack') return 'resourcepack';
  return 'mod';
}

function pickFile(version, category) {
  const allowed = ALLOWED_EXTENSIONS[category] || ['.jar'];
  const files = Array.isArray(version?.files) ? version.files : [];
  const candidates = files.filter((file) => {
    if (!file || typeof file.url !== 'string' || !isHttpsUrl(file.url)) return false;
    if (!allowed.includes(path.extname(String(file.filename || '')).toLowerCase())) return false;
    if (!Number.isFinite(file.size) || file.size <= 0) return false;
    return Boolean(file.hashes?.sha512 || file.hashes?.sha1);
  });
  return candidates.find((file) => file.primary) || candidates[0] || null;
}

/** Choose the newest compatible file for an exact game version and component type. */
function selectVersionFile(versions, { minecraftVersion, category }) {
  const loaders = loadersForCategory(category);
  const compatible = (Array.isArray(versions) ? versions : []).filter((version) => {
    if (!Array.isArray(version?.game_versions) || !version.game_versions.includes(minecraftVersion)) {
      return false;
    }
    if (!Array.isArray(version.loaders) || !version.loaders.some((loader) => loaders.includes(loader))) {
      return false;
    }
    return Boolean(pickFile(version, category));
  });
  if (compatible.length === 0) return null;

  compatible.sort((left, right) => {
    const channelDelta = (CHANNEL_SCORE[right.version_type] || 0) - (CHANNEL_SCORE[left.version_type] || 0);
    if (channelDelta !== 0) return channelDelta;
    return Date.parse(right.date_published || 0) - Date.parse(left.date_published || 0);
  });

  const version = compatible[0];
  const file = pickFile(version, category);
  return {
    version,
    file,
    warnings: version.version_type && version.version_type !== 'release'
      ? [`The newest verified file is a ${version.version_type} build; a stable release is not published for this version.`]
      : [],
  };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function projectLicense(project) {
  if (!project?.license) return null;
  return {
    id: project.license.id || null,
    name: project.license.name || project.license.id || null,
    licenseUrl: project.license.url || null,
  };
}

function externalOverride(catalogComponent, overrides) {
  const override = overrides[catalogComponent.id];
  return {
    status: override?.status || 'UNVERIFIED',
    reason: override?.reason || 'This component is not available through the verified resolver.',
  };
}

function makeRecord({
  key,
  catalogComponent = null,
  slug,
  name,
  category,
  role = 'catalog',
  projectUrl = null,
  license = null,
  status,
  reason = null,
  version = null,
  file = null,
  dependencies = [],
  summary = null,
  caveats = [],
  warnings = [],
  projectId = null,
}) {
  return {
    key,
    catalogId: catalogComponent?.id || null,
    slug,
    projectId,
    name,
    category,
    role,
    projectUrl,
    license,
    status,
    reason,
    version: version
      ? {
        id: version.id,
        number: version.version_number,
        type: version.version_type,
        publishedAt: version.date_published,
        gameVersions: version.game_versions,
        loaders: version.loaders,
      }
      : null,
    file: file
      ? {
        filename: file.filename,
        url: file.url,
        size: file.size,
        sha512: file.hashes?.sha512 || null,
        sha1: file.hashes?.sha1 || null,
        host: new URL(file.url).host,
      }
      : null,
    dependencies,
    summary,
    caveats,
    warnings,
  };
}

/**
 * Resolves the complete catalog (plus required dependencies) for one
 * Minecraft version and loader using the official Modrinth API.
 */
async function resolveBase({ manifest, catalog, client, signal, logger = null, concurrency = 4 }) {
  if (!manifest || !catalog) throw new ResolverError('Missing manifest or catalog.', 'BAD_INPUT');
  const minecraftVersion = manifest.minecraft_version;
  const overrides = manifest.overrides || {};
  const records = {};
  const aliasToKey = new Map();
  const apiErrors = [];
  const warnings = [];

  const components = (catalog.components || []).filter((component) => component && component.id);
  const slugComponents = components.filter((component) => component.slug);
  const catalogKeyBySlug = new Map(
    components.filter((component) => component.slug).map((component) => [component.slug, component.id]),
  );

  const projectIndex = new Map();
  if (slugComponents.length > 0) {
    try {
      const projects = await client.getProjects(slugComponents.map((component) => component.slug));
      for (const project of projects) {
        projectIndex.set(project.slug, project);
        if (project.id) projectIndex.set(project.id, project);
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      logger?.warn('Could not load Modrinth project metadata in bulk', { message: error.message });
    }
  }

  await mapLimit(components, concurrency, async (component) => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const key = component.id;
    const override = overrides[key];

    if (!component.slug) {
      const external = externalOverride(component, overrides);
      records[key] = makeRecord({
        key,
        catalogComponent: component,
        slug: null,
        name: component.name,
        category: component.category,
        projectUrl: component.project_url || null,
        status: external.status,
        reason: external.reason,
        summary: component.summary,
        caveats: component.caveats || [],
      });
      return;
    }

    try {
      const versions = await client.getVersions(component.slug, {
        gameVersions: [minecraftVersion],
        loaders: loadersForCategory(component.category),
        signal,
      });
      const project = projectIndex.get(component.slug) || projectIndex.get(component.id) || null;
      if (project?.id) aliasToKey.set(project.id, key);
      if (project?.slug) aliasToKey.set(`slug:${project.slug}`, key);

      if (versions.length === 0) {
        records[key] = makeRecord({
          key,
          catalogComponent: component,
          slug: component.slug,
          projectId: project?.id || null,
          name: component.name,
          category: component.category,
          projectUrl: component.project_url,
          license: projectLicense(project),
          status: override?.status || 'UNAVAILABLE',
          reason: override?.reason
            || `No ${manifest.loader_label || manifest.loader} file for Minecraft ${minecraftVersion} was published by the project.`,
          summary: component.summary,
          caveats: component.caveats || [],
        });
        return;
      }

      const selected = selectVersionFile(versions, {
        minecraftVersion,
        category: component.category,
      });

      if (!selected) {
        records[key] = makeRecord({
          key,
          catalogComponent: component,
          slug: component.slug,
          projectId: project?.id || null,
          name: component.name,
          category: component.category,
          projectUrl: component.project_url,
          license: projectLicense(project),
          status: 'UNAVAILABLE',
          reason: `Files exist for Minecraft ${minecraftVersion}, but none has a verified download URL, supported file type, and integrity hash.`,
          summary: component.summary,
          caveats: component.caveats || [],
        });
        return;
      }

      if (override?.status === 'INCOMPATIBLE') {
        records[key] = makeRecord({
          key,
          catalogComponent: component,
          slug: component.slug,
          projectId: project?.id || null,
          name: component.name,
          category: component.category,
          projectUrl: component.project_url,
          license: projectLicense(project),
          status: 'INCOMPATIBLE',
          reason: override.reason || 'Marked incompatible by the version manifest.',
          summary: component.summary,
          caveats: component.caveats || [],
        });
        return;
      }

      const dependencies = (Array.isArray(selected.version.dependencies) ? selected.version.dependencies : [])
        .filter((dependency) => dependency && dependency.dependency_type === 'required')
        .map((dependency) => ({
          projectId: dependency.project_id || null,
          versionId: dependency.version_id || null,
          fileProvided: Boolean(dependency.file_name),
        }));

      records[key] = makeRecord({
        key,
        catalogComponent: component,
        slug: component.slug,
        projectId: project?.id || null,
        name: component.name,
        category: component.category,
        projectUrl: component.project_url,
        license: projectLicense(project),
        status: 'VERIFIED',
        version: selected.version,
        file: selected.file,
        dependencies,
        summary: component.summary,
        caveats: component.caveats || [],
        warnings: selected.warnings,
      });
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      const notFound = error?.status === 404;
      records[key] = makeRecord({
        key,
        catalogComponent: component,
        slug: component.slug,
        name: component.name,
        category: component.category,
        projectUrl: component.project_url,
        status: notFound ? (override?.status || 'UNAVAILABLE') : 'UNVERIFIED',
        reason: notFound
          ? (override?.reason || 'The project could not be found on Modrinth.')
          : `Compatibility could not be verified: ${error.message}`,
        summary: component.summary,
        caveats: component.caveats || [],
      });
      if (!notFound) apiErrors.push({ component: component.id, message: error.message });
      logger?.warn('Component resolution failed', { component: component.id, message: error.message });
    }
  });

  // Resolve required dependencies recursively, including dependencies that are
  // not part of the curated catalog.
  const queue = Object.values(records).filter((record) => record.status === 'VERIFIED');
  const processed = new Set();
  let dependencyCount = 0;

  while (queue.length > 0 && dependencyCount < MAX_DEPENDENCIES) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const record = queue.shift();
    if (!record || processed.has(record.key)) continue;
    processed.add(record.key);
    const resolvedDependencies = [];

    for (const dependency of record.dependencies) {
      if (!dependency.projectId) continue;
      let dependencyKey = aliasToKey.get(dependency.projectId) || null;
      let dependencyRecord = dependencyKey ? records[dependencyKey] : null;

      if (!dependencyRecord) {
        try {
          const project = await client.getProject(dependency.projectId, { signal });
          const existingKey = catalogKeyBySlug.get(project.slug)
            || aliasToKey.get(`slug:${project.slug}`)
            || (project.id ? aliasToKey.get(project.id) : null);
          if (existingKey && records[existingKey]) {
            dependencyKey = existingKey;
          } else {
            const category = categoryForProjectType(project.project_type);
            const versions = await client.getVersions(project.slug || project.id, {
              gameVersions: [minecraftVersion],
              loaders: loadersForCategory(category),
              signal,
            });
            const selected = selectVersionFile(versions, {
              minecraftVersion,
              category,
            });
            dependencyKey = `dep:${project.id}`;
            dependencyCount += 1;
            if (selected) {
              dependencyRecord = makeRecord({
                key: dependencyKey,
                slug: project.slug,
                projectId: project.id,
                name: project.title || project.slug,
                category,
                role: 'dependency',
                projectUrl: project.slug ? `https://modrinth.com/${project.project_type}/${project.slug}` : null,
                license: projectLicense(project),
                status: 'VERIFIED',
                version: selected.version,
                file: selected.file,
                dependencies: (Array.isArray(selected.version.dependencies) ? selected.version.dependencies : [])
                  .filter((entry) => entry?.dependency_type === 'required')
                  .map((entry) => ({
                    projectId: entry.project_id || null,
                    versionId: entry.version_id || null,
                    fileProvided: Boolean(entry.file_name),
                  })),
                warnings: selected.warnings,
              });
              queue.push(dependencyRecord);
            } else {
              dependencyRecord = makeRecord({
                key: dependencyKey,
                slug: project.slug,
                projectId: project.id,
                name: project.title || project.slug,
                category,
                role: 'dependency',
                projectUrl: project.slug ? `https://modrinth.com/${project.project_type}/${project.slug}` : null,
                license: projectLicense(project),
                status: 'UNAVAILABLE',
                reason: `Required dependency has no ${manifest.loader_label || manifest.loader} file for Minecraft ${minecraftVersion}.`,
              });
            }
            records[dependencyKey] = dependencyRecord;
            aliasToKey.set(project.id, dependencyKey);
            if (project.slug) aliasToKey.set(`slug:${project.slug}`, dependencyKey);
          }
        } catch (error) {
          if (error?.name === 'AbortError' || signal?.aborted) throw error;
          dependencyKey = `dep:${dependency.projectId}`;
          if (!records[dependencyKey]) {
            records[dependencyKey] = makeRecord({
              key: dependencyKey,
              slug: null,
              projectId: dependency.projectId,
              name: 'Unknown dependency',
              category: 'mod',
              role: 'dependency',
              status: 'UNAVAILABLE',
              reason: `The required dependency could not be resolved: ${error.message}`,
            });
          }
          logger?.warn('Dependency resolution failed', { projectId: dependency.projectId, message: error.message });
        }
      }

      resolvedDependencies.push({
        key: dependencyKey,
        name: records[dependencyKey]?.name || 'Unknown dependency',
        status: records[dependencyKey]?.status || 'UNAVAILABLE',
        type: 'required',
      });
    }

    record.dependencies = resolvedDependencies;
  }

  for (const record of Object.values(records)) {
    if (record.role === 'catalog' && record.status === 'VERIFIED') {
      for (const warning of record.warnings || []) warnings.push(`${record.name}: ${warning}`);
    }
  }

  if (apiErrors.length > 0) {
    const verified = Object.values(records).filter((record) => record.status === 'VERIFIED').length;
    if (verified === 0) {
      throw new ResolverError(
        'The Modrinth API could not be reached, so compatibility cannot be verified right now. Check your connection and retry.',
        'NETWORK',
      );
    }
    warnings.push(
      `${apiErrors.length} component(s) could not be checked online. Their status is shown as unverified.`,
    );
  }

  return {
    minecraftVersion,
    loader: manifest.loader,
    resolvedAt: new Date().toISOString(),
    catalogVersion: catalog.catalog_version || null,
    records,
    warnings,
    apiErrors,
    aliasToKey: Object.fromEntries(aliasToKey),
  };
}

function collectDependencies(records, rootKeys) {
  const selected = new Set(rootKeys);
  const dependencyOf = new Map();
  const blocked = new Set();
  const queue = [...rootKeys];

  while (queue.length > 0) {
    const key = queue.shift();
    const record = records[key];
    if (!record || record.status !== 'VERIFIED') continue;
    for (const dependency of record.dependencies || []) {
      const dependencyRecord = records[dependency.key];
      if (!dependencyRecord || dependencyRecord.status !== 'VERIFIED') {
        blocked.add(key);
        continue;
      }
      if (!selected.has(dependency.key)) selected.add(dependency.key);
      if (!dependencyOf.has(dependency.key)) dependencyOf.set(dependency.key, new Set());
      dependencyOf.get(dependency.key).add(key);
      queue.push(dependency.key);
    }
  }

  // Propagate dependency failures up to everything that needs the failed item.
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of [...selected]) {
      const record = records[key];
      if (!record || record.status !== 'VERIFIED') continue;
      for (const dependency of record.dependencies || []) {
        if (blocked.has(dependency.key) && !blocked.has(key)) {
          blocked.add(key);
          changed = true;
        }
      }
    }
  }

  return { selected, dependencyOf, blocked };
}

function publicRecord(record) {
  if (!record) return null;
  return {
    id: record.catalogId || record.key,
    key: record.key,
    catalogId: record.catalogId,
    slug: record.slug,
    name: record.name,
    category: record.category,
    role: record.role,
    projectUrl: record.projectUrl,
    license: record.license,
    status: record.status,
    reason: record.reason,
    version: record.version,
    file: record.file
      ? {
        filename: record.file.filename,
        size: record.file.size,
        sha512: record.file.sha512,
        host: record.file.host,
      }
      : null,
    summary: record.summary,
    caveats: record.caveats || [],
    warnings: record.warnings || [],
    dependencies: (record.dependencies || []).map((dependency) => ({
      key: dependency.key,
      name: dependency.name,
      status: dependency.status,
    })),
  };
}

/**
 * Produces the UI/installation view: which catalog components are available,
 * what is selected by default, dependency closure, blockers and warnings.
 */
function buildSelection({ manifest, catalog, base, edition, selectedIds = null }) {
  if (!catalog.editions?.[edition]) {
    return { error: { code: 'BAD_EDITION', message: `Unknown edition: ${edition}` } };
  }
  if (base?.minecraftVersion !== manifest.minecraft_version) {
    return { error: { code: 'STALE_RESOLUTION', message: 'Compatibility data is for a different Minecraft version.' } };
  }

  const records = base.records;
  const components = catalog.components || [];
  const editionComponents = components.filter((component) => {
    const level = component.editions?.[edition];
    return level === 'required' || level === 'optional';
  });
  const requiredIds = editionComponents
    .filter((component) => component.editions[edition] === 'required')
    .map((component) => component.id);
  const optionalIds = new Set(
    editionComponents
      .filter((component) => component.editions[edition] === 'optional')
      .map((component) => component.id),
  );

  const defaults = catalog.selection_defaults?.[edition] || {};
  const defaultSelection = new Set(requiredIds);
  const applyDefault = (id) => {
    if (!id || !optionalIds.has(id)) return;
    if (records[id]?.status === 'VERIFIED') defaultSelection.add(id);
  };
  applyDefault(defaults.shader);
  applyDefault(defaults.base_texture);

  const requested = selectedIds === null || selectedIds === undefined ? [...defaultSelection] : selectedIds;
  const selection = new Set(requiredIds);
  const rejected = [];
  for (const id of Array.isArray(requested) ? requested : []) {
    if (requiredIds.includes(id)) continue;
    if (!optionalIds.has(id)) continue;
    if (records[id]?.status === 'VERIFIED') selection.add(id);
    else rejected.push(id);
  }

  const shaderIds = [...selection].filter((id) => records[id]?.category === 'shader');
  if (shaderIds.length > 1) {
    return {
      error: {
        code: 'MULTIPLE_SHADERS',
        message: 'Only one shader can be active at a time. Deselect the other shader before continuing.',
      },
    };
  }

  const closure = collectDependencies(records, [...selection]);
  const selectedShader = shaderIds[0] || null;

  const items = [];
  const itemKeys = new Set();

  for (const component of editionComponents) {
    const record = records[component.id];
    const selected = selection.has(component.id);
    const required = component.editions[edition] === 'required';
    const dependencyBlocked = closure.blocked.has(component.id);
    let status = record?.status || 'UNAVAILABLE';
    if (status === 'VERIFIED' && dependencyBlocked) status = 'BLOCKED_DEPENDENCY';
    if (status === 'VERIFIED') status = selected ? 'VERIFIED' : 'OPTIONAL_VERIFIED';

    const dependents = closure.dependencyOf.get(component.id);
    const requiredBy = dependents
      ? [...dependents].map((key) => records[key]?.name || key)
      : [];

    items.push({
      ...publicRecord(record),
      id: component.id,
      key: component.id,
      category: component.category,
      packRole: component.pack_role || null,
      editions: component.editions,
      selectionLevel: component.editions[edition],
      required,
      locked: required,
      selected,
      status,
      reason: status === 'BLOCKED_DEPENDENCY'
        ? 'A required dependency could not be verified for this Minecraft version.'
        : (record?.reason || null),
      requiredBy,
      shaderActive: selectedShader === component.id,
    });
    itemKeys.add(component.id);
  }

  for (const key of closure.selected) {
    if (itemKeys.has(key)) continue;
    const record = records[key];
    if (!record) continue;
    const dependents = closure.dependencyOf.get(key);
    const blocked = closure.blocked.has(key);
    items.push({
      ...publicRecord(record),
      required: true,
      locked: true,
      selected: true,
      packRole: null,
      status: blocked ? 'BLOCKED_DEPENDENCY' : 'VERIFIED',
      reason: blocked ? 'A required dependency of this item could not be verified.' : record.reason,
      requiredBy: dependents ? [...dependents].map((itemKey) => records[itemKey]?.name || itemKey) : [],
      shaderActive: false,
    });
    itemKeys.add(key);
  }

  const selectedItems = items.filter((item) => item.selected && item.status === 'VERIFIED');
  const blockers = [];
  for (const item of items) {
    if (!item.selected) continue;
    if (item.required && item.status !== 'VERIFIED') {
      blockers.push({
        id: item.id,
        name: item.name,
        status: item.status,
        reason: item.reason || 'This required component is not available for the selected version.',
      });
    }
    if (item.status === 'BLOCKED_DEPENDENCY') {
      blockers.push({
        id: item.id,
        name: item.name,
        status: item.status,
        reason: item.reason || 'A required dependency is missing.',
      });
    }
  }

  const warnings = [...(base.warnings || [])];
  for (const item of selectedItems) {
    for (const warning of item.warnings || []) warnings.push(`${item.name}: ${warning}`);
    for (const caveat of item.caveats || []) warnings.push(`${item.name}: ${caveat}`);
    if (item.file && item.file.host && !/modrinth\.com$/i.test(item.file.host)) {
      warnings.push(`${item.name}: file is served from ${item.file.host} (official API-provided link).`);
    }
  }
  for (const item of rejected) {
    const name = components.find((component) => component.id === item)?.name || item;
    warnings.push(`${name} was requested but has no verified file for this Minecraft version and was left out.`);
  }
  const selectedNames = new Set(selectedItems.map((item) => item.id));
  for (const conflict of manifest.known_conflicts || []) {
    const componentsInConflict = conflict.components || [];
    if (componentsInConflict.every((id) => selectedNames.has(id))) {
      warnings.push(conflict.message);
    }
  }

  const deduped = new Map();
  for (const item of selectedItems) {
    if (!item.file) continue;
    const key = `${item.category}:${item.file.filename}`;
    if (!deduped.has(key)) deduped.set(key, item);
  }
  const totalSize = [...deduped.values()].reduce((sum, item) => sum + (item.file?.size || 0), 0);

  return {
    edition,
    editionMeta: catalog.editions[edition],
    minecraftVersion: manifest.minecraft_version,
    loader: manifest.loader,
    loaderLabel: manifest.loader_label || manifest.loader,
    resolvedAt: base.resolvedAt,
    components: items,
    selectedItems: selectedItems.map((item) => item.key),
    selectedNames: [...selectedNames],
    shaderId: selectedShader,
    defaultSelectedIds: [...defaultSelection],
    rejectedIds: rejected,
    blockers,
    warnings: [...new Set(warnings)],
    totalSize,
    counts: {
      selected: selectedItems.length,
      required: items.filter((item) => item.required).length,
      optional: items.filter((item) => !item.required && item.selected).length,
      blocked: items.filter((item) => item.status === 'BLOCKED_DEPENDENCY').length,
    },
  };
}

module.exports = {
  CHANNEL_SCORE,
  LOADERS_BY_CATEGORY,
  ResolverError,
  buildSelection,
  categoryForProjectType,
  collectDependencies,
  loadersForCategory,
  pickFile,
  resolveBase,
  selectVersionFile,
};
