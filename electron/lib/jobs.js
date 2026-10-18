'use strict';

const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { CompatibilityCache } = require('./compat-cache');
const { downloadToFile } = require('./downloader');
const {
  InstallError,
  backupFile,
  buildInstallPlan,
  createInstallationId,
  installStagedFile,
  listInstallations,
  readInstallationRecord,
  rollbackInstallation,
  writeInstallationRecord,
} = require('./installer');
const { inspectRoot, TARGET_VERSIONS } = require('./minecraft');
const { hashFile, isSafeFileName, pathExists } = require('./paths');
const { ResolverError, buildSelection, resolveBase } = require('./resolver');

const PHASES = {
  validate: { label: 'Validating selection', weight: 3 },
  resolve: { label: 'Loading compatibility data', weight: 5 },
  plan: { label: 'Planning files and backups', weight: 2 },
  download: { label: 'Downloading files', weight: 55 },
  verify: { label: 'Verifying downloads', weight: 10 },
  backup: { label: 'Backing up existing files', weight: 5 },
  install: { label: 'Installing files', weight: 15 },
  check: { label: 'Checking installation', weight: 5 },
  rollback: { label: 'Rolling back changes', weight: 0 },
};

class JobError extends Error {
  constructor(message, { code = 'JOB_FAILED', phase = null, cause = null } = {}) {
    super(message);
    this.name = 'JobError';
    this.code = code;
    this.phase = phase;
    this.cause = cause;
  }
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') throw new JobError('Missing installation request.', { code: 'BAD_REQUEST' });
  const { gameDir, minecraftVersion, edition, selectedIds } = payload;
  if (typeof gameDir !== 'string' || !gameDir.trim()) {
    throw new JobError('Select a Minecraft game directory first.', { code: 'NO_GAME_DIR' });
  }
  if (!TARGET_VERSIONS.includes(minecraftVersion)) {
    throw new JobError(`Unsupported Minecraft version: ${minecraftVersion}`, { code: 'BAD_VERSION' });
  }
  if (!['potato', 'balanced', 'ultimate'].includes(edition)) {
    throw new JobError(`Unknown edition: ${edition}`, { code: 'BAD_EDITION' });
  }
  if (selectedIds !== null && selectedIds !== undefined && !Array.isArray(selectedIds)) {
    throw new JobError('The component selection is invalid.', { code: 'BAD_SELECTION' });
  }
  return {
    gameDir: path.resolve(gameDir),
    minecraftVersion,
    edition,
    selectedIds: Array.isArray(selectedIds)
      ? [...new Set(selectedIds.filter((id) => typeof id === 'string').slice(0, 200))]
      : null,
    profileId: typeof payload.profileId === 'string' ? payload.profileId : null,
  };
}

class JobManager {
  constructor({
    appRoot,
    userDataDir,
    stagingDir,
    backupsDir,
    installationsDir,
    logger,
    client,
    emit = () => {},
    ttlMs = undefined,
  }) {
    this.appRoot = appRoot;
    this.userDataDir = userDataDir;
    this.stagingDir = stagingDir;
    this.backupsDir = backupsDir;
    this.installationsDir = installationsDir;
    this.logger = logger;
    this.client = client;
    this.emit = emit;
    this.cache = new CompatibilityCache(userDataDir, ttlMs ? { ttlMs } : undefined);
    this.jobs = new Map();
    this.catalog = null;
    this.manifests = new Map();
  }

  async ensureData() {
    if (!this.catalog) {
      const raw = await fsp.readFile(path.join(this.appRoot, 'data', 'catalog.json'), 'utf8');
      const catalog = JSON.parse(raw);
      if (!Array.isArray(catalog.components)) throw new JobError('Component catalog is invalid.', { code: 'BAD_CATALOG' });
      this.catalog = catalog;
    }
    return this.catalog;
  }

  async getManifest(minecraftVersion) {
    if (this.manifests.has(minecraftVersion)) return this.manifests.get(minecraftVersion);
    if (!TARGET_VERSIONS.includes(minecraftVersion)) {
      throw new JobError(`Unsupported Minecraft version: ${minecraftVersion}`, { code: 'BAD_VERSION' });
    }
    const raw = await fsp.readFile(
      path.join(this.appRoot, 'data', 'manifests', `${minecraftVersion}.json`),
      'utf8',
    );
    const manifest = JSON.parse(raw);
    if (manifest.minecraft_version !== minecraftVersion) {
      throw new JobError('Compatibility manifest version mismatch.', { code: 'BAD_MANIFEST' });
    }
    if (manifest.loader !== 'fabric') {
      throw new JobError('Only the Fabric manifest is supported in this release.', { code: 'BAD_LOADER' });
    }
    this.manifests.set(minecraftVersion, manifest);
    return manifest;
  }

  async resolveCompatibility({ minecraftVersion, refresh = false, signal = null } = {}) {
    const manifest = await this.getManifest(minecraftVersion);
    const catalog = await this.ensureData();
    const cached = await this.cache.read(minecraftVersion, manifest.loader);

    if (!refresh && cached && !cached.stale) {
      return { base: cached.data, cacheInfo: { fromCache: true, stale: false, ageMs: cached.ageMs } };
    }

    try {
      const records = await resolveBase({
        manifest,
        catalog,
        client: this.client,
        signal,
        logger: this.logger,
      });
      const base = {
        ...records,
        aliasToKey: records.aliasToKey,
      };
      await this.cache.write(base);
      return { base, cacheInfo: { fromCache: false, stale: false, ageMs: 0 } };
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      if (cached) {
        this.logger?.warn('Using cached compatibility data after a failed refresh', { message: error.message });
        return {
          base: cached.data,
          cacheInfo: { fromCache: true, stale: true, ageMs: cached.ageMs },
          warning: `Could not refresh compatibility data (${error.message}). Showing the last cached result.`,
        };
      }
      throw new JobError(
        error instanceof ResolverError
          ? error.message
          : `Compatibility data could not be loaded: ${error.message}`,
        { code: 'COMPAT_UNAVAILABLE', cause: error },
      );
    }
  }

  async getSelectionView({ minecraftVersion, edition, selectedIds = null, refresh = false, signal = null } = {}) {
    const manifest = await this.getManifest(minecraftVersion);
    const catalog = await this.ensureData();
    const resolution = await this.resolveCompatibility({ minecraftVersion, refresh, signal });
    const selection = buildSelection({
      manifest,
      catalog,
      base: resolution.base,
      edition,
      selectedIds,
    });
    if (selection.error) {
      return { error: selection.error };
    }
    return {
      manifest: {
        minecraftVersion: manifest.minecraft_version,
        loader: manifest.loader,
        loaderLabel: manifest.loader_label,
        reviewedAt: manifest.reviewed_at,
        notes: manifest.review_notes,
      },
      cacheInfo: resolution.cacheInfo,
      warning: resolution.warning || null,
      selection,
      catalogVersion: catalog.catalog_version,
      editions: catalog.editions,
    };
  }

  materializeItems(selection, base) {
    const items = [];
    for (const key of selection.selectedItems || []) {
      const record = base.records[key];
      if (!record || record.status !== 'VERIFIED' || !record.file) continue;
      items.push({
        key: record.key,
        name: record.name,
        category: record.category,
        required: (selection.components || []).find((component) => component.key === key)?.required ?? true,
        file: record.file,
        requiredBy: (selection.components || []).find((component) => component.key === key)?.requiredBy || [],
      });
    }
    return items;
  }

  async previewPlan({ gameDir, minecraftVersion, edition, selectedIds = null } = {}) {
    const view = await this.getSelectionView({ minecraftVersion, edition, selectedIds });
    if (view.error) return { error: view.error };
    const resolution = await this.resolveCompatibility({ minecraftVersion });
    const items = this.materializeItems(view.selection, resolution.base);
    const plan = await buildInstallPlan({
      gameDir,
      items,
      minecraftVersion,
      loader: 'fabric',
      edition,
      createDirectories: false,
      stagingDir: this.stagingDir,
      logger: this.logger,
    });
    return {
      plan: {
        gameDir: plan.gameDir,
        minecraftVersion: plan.minecraftVersion,
        loader: plan.loader,
        edition: plan.edition,
        totalSize: plan.totalSize,
        existingBytes: plan.existingBytes,
        requiredBytes: plan.requiredBytes,
        freeBytes: plan.freeBytes,
        conflicts: plan.conflicts,
        warnings: plan.warnings,
        items: plan.items.map((item) => ({
          key: item.key,
          name: item.name,
          category: item.category,
          filename: item.filename,
          folder: item.folder,
          size: item.size,
          host: item.host,
          required: item.required,
          existsBefore: item.existsBefore,
        })),
      },
      selection: view.selection,
      cacheInfo: view.cacheInfo,
      warning: view.warning,
    };
  }

  createJobId() {
    return crypto.randomUUID();
  }

  startInstall(payload) {
    const jobId = this.createJobId();
    const controller = new AbortController();
    const job = {
      id: jobId,
      status: 'running',
      startedAt: new Date().toISOString(),
      logs: [],
      controller,
      result: null,
      cancelRequested: false,
    };
    this.jobs.set(jobId, job);
    this.runJob(job, payload).catch((error) => {
      this.logger?.error('Unhandled job error', { jobId, message: error.message });
    });
    return { jobId, startedAt: job.startedAt };
  }

  cancel(jobId) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'running') return { ok: false, reason: 'not-running' };
    job.cancelRequested = true;
    job.controller.abort();
    this.emitEvent(job, { type: 'log', level: 'warn', message: 'Cancellation requested by the user.' });
    return { ok: true };
  }

  getJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    return {
      id: job.id,
      status: job.status,
      startedAt: job.startedAt,
      result: job.result,
      logs: job.logs.slice(-300),
    };
  }

  emitEvent(job, event) {
    if (event.type === 'log') {
      job.logs.push({ level: event.level || 'info', message: event.message, at: new Date().toISOString() });
      if (event.level === 'error') this.logger?.error(event.message);
      else if (event.level === 'warn') this.logger?.warn(event.message);
      else this.logger?.info(event.message);
    }
    try {
      this.emit(job.id, event);
    } catch {
      /* renderer may be gone */
    }
  }

  progress(job, phase, fraction, detail = {}) {
    const weight = PHASES[phase]?.weight || 0;
    let completedWeight = 0;
    for (const [key, value] of Object.entries(PHASES)) {
      if (key === phase) break;
      completedWeight += value.weight;
    }
    const overall = Math.max(0, Math.min(100, completedWeight + weight * Math.max(0, Math.min(1, fraction))));
    this.emitEvent(job, {
      type: 'progress',
      phase,
      phaseLabel: PHASES[phase]?.label || phase,
      phaseFraction: fraction,
      overall,
      ...detail,
    });
  }

  async runJob(job, rawPayload) {
    const { signal } = job.controller;
    let record = null;
    let plan = null;
    let stagingJobDir = null;
    let installedAnything = false;

    try {
      const payload = validatePayload(rawPayload);
      const requiredPhase = async (phase, fn) => {
        this.emitEvent(job, { type: 'phase', phase, label: PHASES[phase].label, status: 'start' });
        const value = await fn();
        this.emitEvent(job, { type: 'phase', phase, label: PHASES[phase].label, status: 'done' });
        return value;
      };

      await requiredPhase('validate', async () => {
        this.progress(job, 'validate', 0.2, { detail: 'Checking the Minecraft version and game directory' });
        const manifest = await this.getManifest(payload.minecraftVersion);
        if (manifest.loader !== 'fabric') throw new JobError('This manifest is not Fabric.', { code: 'BAD_LOADER' });
        const inspection = await inspectRoot(payload.gameDir);
        if (!inspection.exists) {
          throw new JobError('The game directory no longer exists.', { code: 'MISSING_GAME_DIR' });
        }
        const gameDirStat = await fsp.stat(payload.gameDir).catch(() => null);
        if (!gameDirStat?.isDirectory()) {
          throw new JobError('The game directory is not a folder.', { code: 'BAD_GAME_DIR' });
        }
        const fabric = inspection.fabricVersions?.find(
          (entry) => entry.minecraftVersion === payload.minecraftVersion,
        );
        if (fabric) {
          this.emitEvent(job, {
            type: 'log',
            level: 'info',
            message: `Fabric ${fabric.loaderVersion || ''} detected for Minecraft ${payload.minecraftVersion}.`,
          });
        } else {
          this.emitEvent(job, {
            type: 'log',
            level: 'warn',
            message: `Fabric was not detected for Minecraft ${payload.minecraftVersion} in this directory. Files can still be installed, but the profile must use Fabric to load them.`,
          });
        }
        const foreignLoader = inspection.versions?.find(
          (version) => version.actualVersion === payload.minecraftVersion
            && !['fabric', 'vanilla'].includes(version.loader),
        );
        if (foreignLoader) {
          throw new JobError(
            `A ${foreignLoader.loader} installation was detected for Minecraft ${payload.minecraftVersion}. OneClickMC ships Fabric components only and will not modify a ${foreignLoader.loader} profile.`,
            { code: 'WRONG_LOADER', phase: 'validate' },
          );
        }
        this.progress(job, 'validate', 1);
        return inspection;
      });

      const resolution = await requiredPhase('resolve', async () => {
        this.progress(job, 'resolve', 0.15, { detail: 'Loading the version manifest' });
        const result = await this.resolveCompatibility({
          minecraftVersion: payload.minecraftVersion,
          signal,
        });
        this.progress(job, 'resolve', 1, {
          detail: result.cacheInfo?.fromCache ? 'Using cached compatibility data' : 'Compatibility data refreshed',
        });
        return result;
      });
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      const manifest = await this.getManifest(payload.minecraftVersion);
      const catalog = await this.ensureData();
      const selection = buildSelection({
        manifest,
        catalog,
        base: resolution.base,
        edition: payload.edition,
        selectedIds: payload.selectedIds,
      });
      if (selection.error) {
        throw new JobError(selection.error.message, { code: selection.error.code, phase: 'resolve' });
      }
      if ((selection.blockers || []).length > 0) {
        throw new JobError(
          `Cannot install because a required component failed verification: ${selection.blockers[0].name}.`,
          { code: 'BLOCKED_COMPONENT', phase: 'resolve' },
        );
      }

      plan = await requiredPhase('plan', async () => {
        this.progress(job, 'plan', 0.3, { detail: 'Checking destination folders and free space' });
        const built = await buildInstallPlan({
          gameDir: payload.gameDir,
          items: this.materializeItems(selection, resolution.base),
          minecraftVersion: payload.minecraftVersion,
          loader: manifest.loader,
          edition: payload.edition,
          createDirectories: true,
          stagingDir: this.stagingDir,
          logger: this.logger,
        });
        record = {
          id: createInstallationId(),
          appVersion: process.env.npm_package_version || '1.0.0',
          startedAt: new Date().toISOString(),
          finishedAt: null,
          status: 'installing',
          minecraftVersion: payload.minecraftVersion,
          loader: manifest.loader,
          edition: payload.edition,
          gameDir: payload.gameDir,
          resolvedAt: resolution.base.resolvedAt,
          requiredItems: built.items.filter((item) => item.required).length,
          items: built.items.map((item) => ({
            key: item.key,
            name: item.name,
            category: item.category,
            required: item.required,
            folder: item.folder,
            filename: item.filename,
            destination: item.destination,
            size: item.size,
            sha512: item.sha512,
            host: item.host,
            existsBefore: item.existsBefore,
            backupPath: null,
            installed: false,
            verified: false,
            error: null,
            skipped: false,
          })),
          warnings: built.warnings,
          errors: [],
          rollback: null,
        };
        await writeInstallationRecord(this.installationsDir, record);
        this.progress(job, 'plan', 1, { detail: `${built.items.length} file(s), ${built.conflicts.length} backup(s)` });
        return built;
      });

      if (plan.conflicts.length > 0) {
        for (const conflict of plan.conflicts) {
          this.emitEvent(job, {
            type: 'log',
            level: 'warn',
            message: `Existing file will be backed up and replaced: ${conflict.folder}/${conflict.filename}`,
          });
        }
      }

      stagingJobDir = path.join(this.stagingDir, job.id);
      await fsp.mkdir(stagingJobDir, { recursive: true });

      const staged = new Map();
      const skipped = new Set();
      let downloadedBytes = 0;
      const totalBytes = plan.items.reduce((sum, item) => sum + item.size, 0);
      const totalFiles = plan.items.length;

      this.emitEvent(job, { type: 'phase', phase: 'download', label: PHASES.download.label, status: 'start' });
      for (let index = 0; index < plan.items.length; index += 1) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const item = plan.items[index];
        const stagingPath = path.join(stagingJobDir, String(index), item.filename);
        if (!isSafeFileName(item.filename, item.category)) {
          throw new JobError(`Unsafe file name in plan: ${item.filename}`, { code: 'UNSAFE_FILENAME', phase: 'download' });
        }
        await fsp.mkdir(path.dirname(stagingPath), { recursive: true });
        try {
          this.emitEvent(job, {
            type: 'progress',
            phase: 'download',
            phaseLabel: PHASES.download.label,
            detail: `Downloading ${item.filename}`,
            current: index + 1,
            total: totalFiles,
            file: item.name,
          });
          const result = await downloadToFile({
            url: item.url,
            destination: stagingPath,
            expectedSha512: item.sha512,
            expectedSha1: item.sha1,
            expectedSize: item.size,
            signal,
            logger: this.logger,
            onProgress: ({ received, total }) => {
              const fraction = totalBytes > 0
                ? Math.min(1, (downloadedBytes + received) / totalBytes)
                : (index + (total ? received / total : 0)) / Math.max(1, totalFiles);
              this.progress(job, 'download', fraction, {
                detail: `Downloading ${item.filename}`,
                current: index + 1,
                total: totalFiles,
                bytesReceived: downloadedBytes + received,
                bytesTotal: totalBytes,
                fileProgress: total ? received / total : null,
              });
            },
          });
          staged.set(item.key, { path: stagingPath, result, item });
          downloadedBytes += result.bytes || item.size;
        } catch (error) {
          if (error?.name === 'AbortError' || signal.aborted) throw new DOMException('Aborted', 'AbortError');
          if (item.required) {
            throw new JobError(`Required download failed: ${item.filename} — ${error.message}`, {
              code: 'DOWNLOAD_FAILED',
              phase: 'download',
            });
          }
          skipped.add(item.key);
          const recordItem = record.items.find((entry) => entry.key === item.key && entry.filename === item.filename);
          if (recordItem) {
            recordItem.skipped = true;
            recordItem.error = error.message;
          }
          this.emitEvent(job, {
            type: 'log',
            level: 'warn',
            message: `Optional component skipped after a failed download: ${item.name} (${error.message})`,
          });
        }
      }
      this.progress(job, 'download', 1, { current: totalFiles, total: totalFiles });
      this.emitEvent(job, { type: 'phase', phase: 'download', label: PHASES.download.label, status: 'done' });

      // Re-read every staged file to confirm the bytes on disk match the manifest.
      this.emitEvent(job, { type: 'phase', phase: 'verify', label: PHASES.verify.label, status: 'start' });
      const verifiedPaths = [];
      let verifyIndex = 0;
      for (const item of plan.items) {
        if (skipped.has(item.key)) continue;
        verifyIndex += 1;
        const staging = staged.get(item.key);
        if (!staging) {
          if (item.required) throw new JobError(`Missing staged file for ${item.filename}.`, { code: 'MISSING_STAGED' });
          skipped.add(item.key);
          continue;
        }
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const actual = await hashFile(staging.path, 'sha512');
        if (item.sha512 && actual.toLowerCase() !== item.sha512.toLowerCase()) {
          if (item.required) {
            throw new JobError(`Checksum verification failed for ${item.filename}.`, {
              code: 'CHECKSUM_MISMATCH',
              phase: 'verify',
            });
          }
          skipped.add(item.key);
          this.emitEvent(job, {
            type: 'log',
            level: 'warn',
            message: `Optional component failed verification and was skipped: ${item.name}`,
          });
          continue;
        }
        verifiedPaths.push(item.key);
        this.progress(job, 'verify', verifyIndex / Math.max(1, staged.size), {
          detail: `Verified ${item.filename}`,
          current: verifyIndex,
          total: staged.size,
        });
      }
      this.progress(job, 'verify', 1);
      this.emitEvent(job, { type: 'phase', phase: 'verify', label: PHASES.verify.label, status: 'done' });

      const activeItems = plan.items.filter((item) => !skipped.has(item.key));

      // Back up existing files that will be replaced.
      this.emitEvent(job, { type: 'phase', phase: 'backup', label: PHASES.backup.label, status: 'start' });
      const backupTargets = activeItems.filter((item) => item.existsBefore);
      let backupIndex = 0;
      for (const item of backupTargets) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const backupPath = await backupFile({
          source: item.destination,
          backupRoot: this.backupsDir,
          installationId: record.id,
          folder: item.folder,
          filename: item.filename,
          logger: this.logger,
        });
        item.backupPath = backupPath;
        const recordItem = record.items.find((entry) => entry.key === item.key && entry.filename === item.filename);
        if (recordItem) recordItem.backupPath = backupPath;
        backupIndex += 1;
        this.progress(job, 'backup', backupIndex / Math.max(1, backupTargets.length), {
          detail: `Backed up ${item.filename}`,
          current: backupIndex,
          total: backupTargets.length,
        });
      }
      await writeInstallationRecord(this.installationsDir, record);
      this.progress(job, 'backup', 1);
      this.emitEvent(job, { type: 'phase', phase: 'backup', label: PHASES.backup.label, status: 'done' });

      // Install staged files.
      this.emitEvent(job, { type: 'phase', phase: 'install', label: PHASES.install.label, status: 'start' });
      let installIndex = 0;
      for (const item of activeItems) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const staging = staged.get(item.key);
        try {
          await installStagedFile({
            stagedPath: staging.path,
            destination: item.destination,
            expectedSha512: item.sha512,
            signal,
            logger: this.logger,
          });
          item.installed = true;
          installedAnything = true;
          const recordItem = record.items.find((entry) => entry.key === item.key && entry.filename === item.filename);
          if (recordItem) recordItem.installed = true;
          await writeInstallationRecord(this.installationsDir, record);
        } catch (error) {
          if (error?.name === 'AbortError' || signal.aborted) throw new DOMException('Aborted', 'AbortError');
          if (item.required) {
            throw new JobError(`Required file failed to install: ${item.filename} — ${error.message}`, {
              code: 'INSTALL_FAILED',
              phase: 'install',
            });
          }
          const recordItem = record.items.find((entry) => entry.key === item.key && entry.filename === item.filename);
          if (recordItem) {
            recordItem.error = error.message;
            recordItem.skipped = true;
          }
          this.emitEvent(job, {
            type: 'log',
            level: 'warn',
            message: `Optional component could not be installed: ${item.name} (${error.message})`,
          });
        }
        installIndex += 1;
        this.progress(job, 'install', installIndex / Math.max(1, activeItems.length), {
          detail: `Installed ${item.filename}`,
          current: installIndex,
          total: activeItems.length,
        });
      }
      await writeInstallationRecord(this.installationsDir, record);
      this.progress(job, 'install', 1);
      this.emitEvent(job, { type: 'phase', phase: 'install', label: PHASES.install.label, status: 'done' });

      // Final verification of the files now in the game directory.
      this.emitEvent(job, { type: 'phase', phase: 'check', label: PHASES.check.label, status: 'start' });
      let checkIndex = 0;
      const failures = [];
      for (const item of activeItems) {
        if (!item.installed) continue;
        checkIndex += 1;
        const exists = await pathExists(item.destination);
        const actual = exists ? await hashFile(item.destination, 'sha512').catch(() => null) : null;
        const ok = Boolean(item.sha512 && actual && actual.toLowerCase() === item.sha512.toLowerCase());
        const recordItem = record.items.find((entry) => entry.key === item.key && entry.filename === item.filename);
        if (recordItem) recordItem.verified = ok;
        item.verified = ok;
        if (!ok) failures.push(item.filename);
        this.progress(job, 'check', checkIndex / Math.max(1, activeItems.length), {
          detail: ok ? `Checked ${item.filename}` : `Verification failed: ${item.filename}`,
          current: checkIndex,
          total: activeItems.length,
        });
      }
      this.progress(job, 'check', 1);
      this.emitEvent(job, { type: 'phase', phase: 'check', label: PHASES.check.label, status: 'done' });

      if (failures.length > 0) {
        throw new JobError(
          `Final verification failed for ${failures.length} file(s): ${failures.join(', ')}`,
          { code: 'FINAL_VERIFICATION_FAILED', phase: 'check' },
        );
      }

      const skippedItems = record.items.filter((item) => item.skipped);
      const installedItems = record.items.filter((item) => item.installed && item.verified);
      record.status = 'success';
      record.finishedAt = new Date().toISOString();
      record.errors = [];
      record.summary = {
        installed: installedItems.length,
        skipped: skippedItems.map((item) => ({ name: item.name, reason: item.error })),
        requiredInstalled: installedItems.filter((item) => item.required).length,
      };
      await writeInstallationRecord(this.installationsDir, record);
      this.finishJob(job, {
        status: 'success',
        finishedAt: record.finishedAt,
        installationId: record.id,
        gameDir: payload.gameDir,
        minecraftVersion: payload.minecraftVersion,
        edition: payload.edition,
        installed: installedItems.map((item) => ({ name: item.name, filename: item.filename, category: item.category })),
        skipped: record.summary.skipped,
        warnings: [...new Set([...(plan.warnings || []), ...(selection.warnings || [])])],
        totalSize: plan.totalSize,
        canRollback: installedItems.length > 0,
        logPath: this.logger?.describe().filePath || null,
        recordPath: path.join(this.installationsDir, `${record.id}.json`),
      });
    } catch (error) {
      const cancelled = error?.name === 'AbortError' || signal.aborted;
      let rollbackResult = null;

      if (record) {
        const rollbackNeeded = installedAnything || record.items.some((item) => item.installed);
        if (rollbackNeeded) {
          this.emitEvent(job, {
            type: 'phase',
            phase: 'rollback',
            label: PHASES.rollback.label,
            status: 'start',
          });
          try {
            const updated = await rollbackInstallation({
              record,
              installationsDirectory: this.installationsDir,
              logger: this.logger,
            });
            record = updated;
            rollbackResult = updated.rollbackResults;
            this.emitEvent(job, {
              type: 'phase',
              phase: 'rollback',
              label: PHASES.rollback.label,
              status: 'done',
            });
            this.emitEvent(job, {
              type: 'log',
              level: 'warn',
              message: 'Changes made by this run were rolled back.',
            });
          } catch (rollbackError) {
            this.emitEvent(job, {
              type: 'log',
              level: 'error',
              message: `Rollback failed: ${rollbackError.message}. Backups are kept in ${this.backupsDir}.`,
            });
            this.emitEvent(job, {
              type: 'phase',
              phase: 'rollback',
              label: PHASES.rollback.label,
              status: 'failed',
            });
          }
        } else if (record.status === 'installing') {
          record.status = cancelled ? 'cancelled' : 'failed';
          record.finishedAt = new Date().toISOString();
          record.errors = [cancelled ? 'Cancelled before any files were changed.' : error.message];
          try {
            await writeInstallationRecord(this.installationsDir, record);
          } catch {
            /* journal is best effort */
          }
        }
      }

      if (cancelled) {
        this.logger?.info('Installation cancelled', { jobId: job.id });
        this.finishJob(job, {
          status: 'cancelled',
          message: 'Installation cancelled. No unfinished files were left in the game directory.',
          gameDir: plan?.gameDir || null,
          installationId: record?.id || null,
          rolledBack: Boolean(rollbackResult),
          rollback: rollbackResult,
          logPath: this.logger?.describe().filePath || null,
        });
      } else {
        this.logger?.error('Installation failed', { jobId: job.id, message: error.message, phase: error.phase || null });
        this.finishJob(job, {
          status: 'failed',
          message: error.message,
          code: error.code || 'JOB_FAILED',
          phase: error.phase || null,
          gameDir: plan?.gameDir || null,
          installationId: record?.id || null,
          rolledBack: Boolean(rollbackResult),
          rollback: rollbackResult,
          logPath: this.logger?.describe().filePath || null,
        });
      }
    } finally {
      if (stagingJobDir) {
        await fsp.rm(stagingJobDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  finishJob(job, result) {
    job.status = result.status === 'success' ? 'success' : result.status;
    job.result = { ...result, logs: job.logs.slice(-300) };
    job.finishedAt = new Date().toISOString();
    this.emitEvent(job, { type: 'done', result: job.result });
    // Keep the job in memory long enough for the renderer to read it, then clean up.
    setTimeout(() => this.jobs.delete(job.id), 10 * 60 * 1000).unref?.();
  }

  async rollback(installationId) {
    const record = await readInstallationRecord(this.installationsDir, installationId);
    if (!record.items?.some((item) => item.installed)) {
      return { ok: false, message: 'This installation has no installed files to roll back.' };
    }
    const updated = await rollbackInstallation({
      record,
      installationsDirectory: this.installationsDir,
      logger: this.logger,
    });
    return { ok: true, record: updated };
  }

  async history() {
    return listInstallations(this.installationsDir);
  }

  async compatibilityStatus(minecraftVersion) {
    const manifest = await this.getManifest(minecraftVersion);
    return this.cache.status(minecraftVersion, manifest.loader);
  }

  /** Marks runs interrupted by a crash so the UI can offer a rollback. */
  async recoverInterrupted() {
    const records = await listInstallations(this.installationsDir, 50);
    for (const summary of records) {
      if (summary.status !== 'installing') continue;
      try {
        const record = await readInstallationRecord(this.installationsDir, summary.id);
        record.status = 'interrupted';
        record.finishedAt = new Date().toISOString();
        record.errors = ['OneClickMC stopped before this installation finished. Review and roll back if needed.'];
        await writeInstallationRecord(this.installationsDir, record);
        this.logger?.warn('Marked interrupted installation', { id: summary.id });
      } catch (error) {
        this.logger?.warn('Could not mark interrupted installation', { id: summary.id, message: error.message });
      }
    }
  }
}

module.exports = {
  JobError,
  JobManager,
  PHASES,
  validatePayload,
  InstallError,
};
