import { icon } from './icons.js';
import { esc, relativeAge, sanitizeExternalUrl, shortPath } from './format.js';
import { renderHome } from './views/home.js';
import { renderSetup } from './views/setup.js';
import { renderEdition } from './views/edition.js';
import { renderInstall } from './views/install.js';
import { renderSettings } from './views/settings.js';
import { renderDiagnostics } from './views/diagnostics.js';

const api = window.oneclickmc;

const SCREENS = {
  home: renderHome,
  setup: renderSetup,
  edition: renderEdition,
  install: renderInstall,
  settings: renderSettings,
  diagnostics: renderDiagnostics,
};

const state = {
  screen: 'home',
  appInfo: null,
  settings: {},
  installations: [],
  detectionLoading: false,
  detectionError: null,
  selectedInstallation: null,
  inspection: null,
  inspectLoading: false,
  inspectError: null,
  gameDir: null,
  gameDirSource: null,
  requiresGameDirConfirmation: false,
  confirmGameDir: false,
  selectedVersionEntry: null,
  mcVersion: null,
  edition: null,
  selectionView: null,
  selectionLoading: false,
  recomputing: false,
  selectionError: null,
  selectedIds: [],
  preview: null,
  previewLoading: false,
  previewError: null,
  confirmOverwrite: false,
  customizeOpen: false,
  installPhase: 'review',
  jobId: null,
  jobRunning: false,
  installPayload: null,
  progress: null,
  phases: {},
  jobLogs: [],
  result: null,
  compatStatus: [],
  cacheInfo: null,
  catalogVersion: null,
  diagnostics: { loading: false, loaded: false, java: [], cache: [], history: [], logs: [], error: null },
  actionBusy: false,
};

const view = document.getElementById('view');
const footerBar = document.getElementById('footer-bar');
const toastsRoot = document.getElementById('toasts');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingMessage = document.getElementById('loading-message');
const confirmDialog = document.getElementById('confirm-dialog');
const confirmTitle = document.getElementById('confirm-title');
const confirmBody = document.getElementById('confirm-body');
const confirmYes = document.getElementById('confirm-yes');

const eventBuffer = new Map();
let renderQueued = false;
let recomputeToken = 0;

/* ------------------------------- rendering ------------------------------- */

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function render() {
  const renderer = SCREENS[state.screen] || renderHome;
  const scrollY = window.scrollY;
  view.innerHTML = renderer(state);
  updateChrome();
  if (state.screen === 'setup' || state.screen === 'install' || state.screen === 'diagnostics') {
    window.scrollTo(0, scrollY);
  }
  const logBody = document.getElementById('log-body');
  if (logBody) logBody.scrollTop = logBody.scrollHeight;
}

function updateChrome() {
  document.querySelectorAll('.topnav-btn').forEach((button) => {
    const target = button.dataset.screen;
    const active = target === state.screen
      || (target === 'setup' && ['edition', 'install'].includes(state.screen));
    button.classList.toggle('active', active);
    if (state.jobRunning && target !== 'diagnostics') button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
  });

  if (footerBar) {
    const settings = state.settings || {};
    const items = [];
    items.push(
      `<span class="footer-item"><span class="footer-dot" aria-hidden="true"></span><strong>${esc(
        state.gameDir ? shortPath(state.gameDir, 52) : 'No Minecraft folder selected',
      )}</strong></span>`,
    );
    items.push('<span class="footer-sep" aria-hidden="true"></span>');
    items.push(`<span class="footer-item">Minecraft <strong>${esc(state.mcVersion || '—')}</strong></span>`);
    items.push(`<span class="footer-item">Preset <strong>${
      esc(state.edition ? (state.appInfo?.catalog?.editions?.[state.edition]?.name || state.edition) : '—')
    }</strong></span>`);
    if (state.cacheInfo) {
      items.push('<span class="footer-sep" aria-hidden="true"></span>');
      items.push(
        `<span class="footer-item">Compatibility <strong>${
          state.cacheInfo.fromCache ? `cached ${esc(relativeAge(state.cacheInfo.ageMs))}` : 'fresh'
        }</strong></span>`,
      );
    }
    items.push('<span class="footer-sep" aria-hidden="true"></span>');
    items.push(`<span class="footer-item" style="margin-left:auto">${
      esc(state.appInfo?.packaged ? 'Packaged build' : 'Development build')
    }${settings.backgroundMode === 'solid' ? ' · solid background' : ''}</span>`);
    footerBar.innerHTML = items.join('');
  }
}

function setBusy(busy, message = 'Working…') {
  if (!loadingOverlay) return;
  loadingOverlay.hidden = !busy;
  if (message && loadingMessage) loadingMessage.textContent = message;
}

function toast(message, tone = 'info', { timeout = 7000 } = {}) {
  if (!toastsRoot) return;
  const element = document.createElement('div');
  element.className = `toast tone-${tone}`;
  const iconName = tone === 'error' ? 'x-circle' : tone === 'warning' ? 'alert' : tone === 'success' ? 'check-circle' : 'info';
  element.innerHTML = `${icon(iconName, 'icon-sm')}<span>${esc(message)}</span>`;
  toastsRoot.appendChild(element);
  while (toastsRoot.children.length > 5) toastsRoot.removeChild(toastsRoot.firstChild);
  setTimeout(() => element.remove(), timeout);
}

function confirmAction({ title, body, confirmLabel = 'Confirm', tone = 'primary' }) {
  return new Promise((resolve) => {
    if (!confirmDialog) {
      resolve(window.confirm(`${title}\n\n${body}`));
      return;
    }
    confirmTitle.textContent = title;
    confirmBody.textContent = body;
    confirmYes.textContent = confirmLabel;
    confirmYes.className = `btn btn-${tone}`;
    const onClose = () => {
      confirmDialog.removeEventListener('close', onClose);
      resolve(confirmDialog.returnValue === 'confirm');
    };
    confirmDialog.addEventListener('close', onClose);
    confirmDialog.returnValue = '';
    confirmDialog.showModal();
    confirmYes.focus();
  });
}

function navigate(screen, { force = false } = {}) {
  if (!SCREENS[screen]) return;
  if (state.jobRunning && !force && !['install', 'diagnostics'].includes(screen)) {
    toast('An installation is running. Cancel it before leaving this screen.', 'warning');
    return;
  }
  state.screen = screen;
  render();
  window.scrollTo({ top: 0, behavior: 'auto' });
  view.focus({ preventScroll: true });
}

/* ------------------------------- bootstrap ------------------------------- */

function applySettings() {
  const settings = state.settings || {};
  document.body.dataset.motion = settings.reduceMotion ? 'reduced' : 'normal';
  document.body.dataset.background = settings.backgroundMode === 'solid' ? 'solid' : 'auto';
}

async function loadAppInfo() {
  state.appInfo = await api.appInfo();
  state.settings = state.appInfo.settings || {};
  state.catalogVersion = state.appInfo.catalog?.catalogVersion || null;
  state.cacheInfo = {
    directory: state.appInfo.paths?.cacheDir || null,
    ttlHours: state.appInfo.paths?.cacheTtlHours ?? 6,
    fromCache: false,
    ageMs: 0,
    stale: false,
  };
  applySettings();
}

async function refreshCompatStatus() {
  try {
    state.compatStatus = await api.compatibility.status();
  } catch {
    state.compatStatus = [];
  }
}

async function ensureDetection({ force = false } = {}) {
  if (state.detectionLoading) return;
  if (!force && state.inspection) return;
  state.detectionLoading = true;
  render();
  try {
    const detection = await api.minecraft.detect();
    state.installations = detection.installations || [];
    state.detectionError = null;
    if (state.installations.length > 0 && !state.selectedInstallation) {
      const savedRoot = state.settings.lastRoot;
      const preferred = state.installations.find((entry) => entry.root === savedRoot) || state.installations[0];
      state.detectionLoading = false;
      await loadInstallation(preferred);
      return;
    }
  } catch (error) {
    state.detectionError = error.message;
  } finally {
    state.detectionLoading = false;
    render();
  }
}

function resetSelection() {
  state.selectionView = null;
  state.selectedIds = [];
  state.preview = null;
  state.selectionError = null;
}

async function loadInstallation(installation) {
  state.selectedInstallation = {
    root: installation.root,
    profileId: installation.profileId || null,
    gameDir: installation.gameDir || installation.root,
    name: installation.name,
    kind: installation.kind,
    lastVersionId: installation.lastVersionId || null,
    suggestedVersion: installation.suggestedVersion || null,
    icon: installation.icon || null,
  };
  state.selectedVersionEntry = null;
  state.inspectLoading = true;
  render();

  try {
    const inspection = await api.minecraft.inspect(installation.root);
    state.inspection = inspection;
    const profile = state.selectedInstallation.profileId
      ? (inspection.profiles || []).find((entry) => entry.id === state.selectedInstallation.profileId)
      : null;

    state.gameDir = profile?.gameDir || installation.gameDir || installation.root;
    state.gameDirSource = profile
      ? profile.gameDirSource
      : inspection.looksLikeGameDirectory
        ? 'the selected folder (Minecraft game data found)'
        : 'the Minecraft root you selected';
    state.requiresGameDirConfirmation = !profile && !inspection.hasLauncherProfiles;
    state.confirmGameDir = false;
    state.inspectError = null;

    const targets = state.appInfo?.targets || ['1.21.11', '26.1', '26.2'];
    if (!state.mcVersion) {
      const candidates = [
        installation.suggestedVersion,
        profile?.evidenceVersion,
        state.settings.lastMinecraftVersion,
        targets[0],
      ];
      state.mcVersion = candidates.find((value) => targets.includes(value)) || targets[0];
    }
    if (!state.edition) state.edition = state.settings.lastEdition || 'balanced';

    state.settings = await api.settings.update({
      lastRoot: installation.root,
      lastProfileId: state.selectedInstallation.profileId,
      lastGameDir: state.gameDir,
      lastMinecraftVersion: state.mcVersion,
      lastEdition: state.edition,
    });
  } catch (error) {
    state.inspectError = error.message;
    state.inspection = null;
    state.gameDir = installation.gameDir || installation.root;
    state.gameDirSource = 'the selected folder (not verified)';
  } finally {
    state.inspectLoading = false;
    render();
  }
}

async function browseDirectory() {
  try {
    const result = await api.dialog.pickDirectory(state.selectedInstallation?.root || state.settings.lastRoot || undefined);
    if (result.canceled || !result.path) return;
    state.mcVersion = null;
    resetSelection();
    await loadInstallation({
      root: result.path,
      gameDir: result.path,
      name: 'Selected folder',
      kind: 'minecraft-root',
      profileId: null,
      suggestedVersion: null,
    });
    if (state.inspection && !state.inspection.valid) {
      toast('That folder does not look like a Minecraft folder. See the notes for details.', 'warning');
    }
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function useVersionEntry(folderName) {
  const entries = state.inspection?.versionEntries || [];
  const entry = entries.find((candidate) => candidate.folderName === folderName);
  if (!entry) return;
  state.selectedVersionEntry = entry;
  const targets = state.appInfo?.targets || ['1.21.11', '26.1', '26.2'];
  if (entry.actualVersion && targets.includes(entry.actualVersion)) {
    state.mcVersion = entry.actualVersion;
    resetSelection();
    state.settings = await api.settings.update({ lastMinecraftVersion: entry.actualVersion });
    toast(`Selected version entry "${entry.folderName}" — verified as Minecraft ${entry.actualVersion}.`, 'success');
  } else {
    toast(
      entry.actualVersion
        ? `"${entry.folderName}" is Minecraft ${entry.actualVersion}, which is not a supported target version.`
        : `"${entry.folderName}" has no verifiable version metadata, so no version was selected.`,
      'warning',
    );
  }
  render();
}

async function selectVersion(version) {
  if (state.mcVersion === version) return;
  state.mcVersion = version;
  resetSelection();
  state.settings = await api.settings.update({ lastMinecraftVersion: version });
  render();
}

async function selectEdition(edition) {
  if (state.edition === edition) return;
  state.edition = edition;
  resetSelection();
  state.settings = await api.settings.update({ lastEdition: edition });
  render();
}

async function loadSelection({ refresh = false } = {}) {
  if (!state.edition || !state.mcVersion) {
    navigate('edition');
    return null;
  }
  state.selectionLoading = true;
  state.selectionError = null;
  render();
  try {
    const payload = {
      minecraftVersion: state.mcVersion,
      edition: state.edition,
      selectedIds: refresh ? state.selectedIds : null,
      refresh,
    };
    const result = refresh ? await api.compatibility.refresh(payload) : await api.compatibility.resolve(payload);
    if (result?.error) {
      state.selectionError = result.error.message;
      state.selectionView = null;
    } else {
      state.selectionView = result;
      state.selectedIds = result.selection.selectedItems || [];
      state.cacheInfo = {
        ...(state.cacheInfo || {}),
        ...(result.cacheInfo || {}),
        directory: state.appInfo?.paths?.cacheDir || state.cacheInfo?.directory || null,
        ttlHours: state.appInfo?.paths?.cacheTtlHours ?? 6,
      };
      state.catalogVersion = result.catalogVersion || state.catalogVersion;
      await refreshCompatStatus();
      if (refresh) toast('Compatibility data refreshed from the official Modrinth API.', 'success');
    }
    return result;
  } catch (error) {
    state.selectionError = error.message;
    state.selectionView = null;
    return null;
  } finally {
    state.selectionLoading = false;
    render();
  }
}

async function recomputeSelection() {
  const token = (recomputeToken += 1);
  state.recomputing = true;
  render();
  try {
    const result = await api.compatibility.resolve({
      minecraftVersion: state.mcVersion,
      edition: state.edition,
      selectedIds: state.selectedIds,
    });
    if (token !== recomputeToken) return;
    if (result?.error) {
      state.selectionError = result.error.message;
      toast(result.error.message, 'warning');
    } else {
      state.selectionView = result;
      state.selectedIds = result.selection.selectedItems || [];
      state.cacheInfo = { ...(state.cacheInfo || {}), ...(result.cacheInfo || {}) };
      state.selectionError = null;
    }
  } catch (error) {
    if (token === recomputeToken) toast(error.message, 'error');
  } finally {
    if (token === recomputeToken) {
      state.recomputing = false;
      render();
    }
  }
}

async function toggleComponent(id, checked) {
  const selection = state.selectionView?.selection;
  if (!selection) return;
  const item = (selection.components || []).find((component) => component.id === id);
  if (!item) return;
  const next = new Set(state.selectedIds || []);
  if (checked) {
    if (item.category === 'shader') {
      for (const shader of selection.components.filter((component) => component.category === 'shader')) next.delete(shader.id);
    }
    if (item.packRole === 'base') {
      for (const pack of selection.components.filter((component) => component.packRole === 'base')) next.delete(pack.id);
    }
    next.add(id);
  } else {
    next.delete(id);
  }
  state.selectedIds = [...next];
  await recomputeSelection();
  await loadPreview({ silent: true });
}

async function setActiveShader(id) {
  const selection = state.selectionView?.selection;
  if (!selection) return;
  const next = new Set(state.selectedIds || []);
  for (const shader of (selection.components || []).filter((component) => component.category === 'shader')) next.delete(shader.id);
  if (id) next.add(id);
  state.selectedIds = [...next];
  await recomputeSelection();
  await loadPreview({ silent: true });
}

async function clearBasePacks() {
  const selection = state.selectionView?.selection;
  if (!selection) return;
  const next = new Set(state.selectedIds || []);
  for (const pack of (selection.components || []).filter((component) => component.packRole === 'base')) next.delete(pack.id);
  state.selectedIds = [...next];
  await recomputeSelection();
  await loadPreview({ silent: true });
}

async function loadPreview({ silent = false } = {}) {
  if (!state.gameDir) {
    if (!silent) {
      toast('Select a Minecraft folder first.', 'warning');
      navigate('setup');
    }
    return;
  }
  if (!silent) {
    state.previewLoading = true;
    state.previewError = null;
    state.confirmOverwrite = false;
    render();
  }
  try {
    const result = await api.install.preview({
      gameDir: state.gameDir,
      minecraftVersion: state.mcVersion,
      edition: state.edition,
      selectedIds: state.selectedIds,
    });
    if (result?.error) {
      state.previewError = result.error.message;
      state.preview = null;
    } else {
      state.preview = result;
      state.cacheInfo = { ...(state.cacheInfo || {}), ...(result.cacheInfo || {}) };
      state.previewError = null;
    }
  } catch (error) {
    state.previewError = error.message;
    state.preview = null;
  } finally {
    state.previewLoading = false;
    if (!silent) render();
  }
}

async function openInstallStep() {
  state.installPhase = 'review';
  state.customizeOpen = false;
  navigate('install');
  if (!state.selectionView) await loadSelection();
  await loadPreview();
}

function handleJobEvent(event) {
  switch (event.type) {
    case 'progress':
      state.progress = event;
      break;
    case 'phase':
      state.phases = { ...state.phases, [event.phase]: event.status === 'start' ? 'active' : event.status };
      break;
    case 'log':
      state.jobLogs = [...state.jobLogs, { level: event.level, message: event.message, at: new Date().toISOString() }].slice(-400);
      break;
    case 'done':
      state.jobRunning = false;
      state.result = { ...event.result, finishedAt: new Date().toISOString() };
      state.progress = { ...(state.progress || {}), overall: 100 };
      state.installPhase = 'done';
      refreshCompatStatus().catch(() => {});
      render();
      return;
    default:
      break;
  }
  scheduleRender();
}

async function startInstall() {
  if (!state.gameDir) return;
  const payload = {
    gameDir: state.gameDir,
    profileId: state.selectedInstallation?.profileId || null,
    minecraftVersion: state.mcVersion,
    edition: state.edition,
    selectedIds: state.selectedIds,
  };
  state.installPayload = payload;
  state.phases = {};
  state.jobLogs = [];
  state.progress = null;
  state.result = null;
  state.jobRunning = true;
  state.jobId = null;
  state.installPhase = 'running';
  render();
  try {
    const started = await api.install.start(payload);
    state.jobId = started.jobId;
    const buffered = eventBuffer.get(state.jobId) || [];
    eventBuffer.delete(state.jobId);
    for (const event of buffered) handleJobEvent(event);
    render();
  } catch (error) {
    state.jobRunning = false;
    state.installPhase = 'review';
    toast(error.message, 'error');
    render();
  }
}

async function cancelInstall() {
  if (!state.jobId) return;
  const confirmed = await confirmAction({
    title: 'Cancel installation?',
    body: 'Downloads stop, staged files are removed and any files this run installed are rolled back.',
    confirmLabel: 'Cancel installation',
    tone: 'danger',
  });
  if (!confirmed) return;
  try {
    await api.install.cancel(state.jobId);
    toast('Cancellation requested. Finishing the current task…', 'warning');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function rollbackInstallation(installationId) {
  const id = installationId || state.result?.installationId;
  if (!id) {
    toast('No installation is available to roll back.', 'warning');
    return;
  }
  const confirmed = await confirmAction({
    title: 'Roll back this installation?',
    body: 'Files installed by this run are removed and backed-up files are restored. Files changed afterwards are left alone.',
    confirmLabel: 'Roll back',
    tone: 'danger',
  });
  if (!confirmed) return;
  state.actionBusy = true;
  try {
    const result = await api.install.rollback(id);
    if (result?.ok) {
      toast('Rollback finished. Backups were restored.', 'success');
      if (state.result?.installationId === id) {
        state.result = { ...state.result, rolledBack: true, canRollback: false };
      }
      if (state.screen === 'diagnostics') await loadDiagnostics({ silent: true });
    } else {
      toast(result?.message || 'Nothing needed to be rolled back.', 'warning');
    }
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.actionBusy = false;
    render();
  }
}

async function openExternal(url) {
  const safe = sanitizeExternalUrl(url);
  if (!safe) {
    toast('That link is not allowed.', 'warning');
    return;
  }
  try {
    await api.system.openExternal(safe);
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function openPath(target, { reveal = false } = {}) {
  if (!target) {
    toast('Nothing to open yet.', 'warning');
    return;
  }
  try {
    if (reveal) await api.system.showItemInFolder(target);
    else await api.system.openPath(target);
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function openLogsFolder() {
  try {
    await api.logs.openFolder();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function copyDiagnostics() {
  try {
    await api.diagnostics.copy();
    toast('Diagnostics report copied to the clipboard. It contains no secrets.', 'success');
    if (state.screen === 'diagnostics') await loadDiagnostics({ silent: true });
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function loadDiagnostics({ silent = false } = {}) {
  if (!silent) state.diagnostics.loading = true;
  render();
  try {
    const [info, cache, history, logs] = await Promise.all([
      api.appInfo(),
      api.compatibility.status(),
      api.install.history(),
      api.logs.recent(120),
    ]);
    state.appInfo = info;
    state.settings = info.settings || state.settings;
    state.compatStatus = cache;
    state.diagnostics = {
      ...state.diagnostics,
      loaded: true,
      error: null,
      cache,
      history,
      logs: logs.lines || [],
      cacheInfo: { directory: state.cacheInfo?.directory, ttlHours: state.cacheInfo?.ttlHours ?? 6 },
    };
    const root = state.selectedInstallation?.root || state.settings.lastRoot || null;
    state.diagnostics.java = await api.minecraft.java(root);
  } catch (error) {
    state.diagnostics = { ...state.diagnostics, error: error.message, loaded: true };
  } finally {
    state.diagnostics.loading = false;
    render();
  }
}

async function refreshVersion(version) {
  const target = version || state.mcVersion;
  if (!target) return;
  setBusy(true, `Refreshing compatibility data for Minecraft ${target}…`);
  try {
    const result = await api.compatibility.refresh({
      minecraftVersion: target,
      edition: state.edition || 'balanced',
      selectedIds: state.mcVersion === target ? state.selectedIds : null,
    });
    if (result?.error) {
      toast(result.error.message, 'error');
    } else {
      toast(`Compatibility data for Minecraft ${target} refreshed.`, 'success');
      if (state.mcVersion === target) {
        state.selectionView = result;
        state.selectedIds = result.selection.selectedItems || [];
        state.cacheInfo = { ...(state.cacheInfo || {}), ...(result.cacheInfo || {}) };
        if (state.screen === 'install') await loadPreview({ silent: true });
      }
      await refreshCompatStatus();
      if (state.screen === 'diagnostics') await loadDiagnostics({ silent: true });
    }
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(false);
    render();
  }
}

async function updateSetting(key, value) {
  state.settings = { ...state.settings, [key]: value };
  applySettings();
  render();
  try {
    state.settings = await api.settings.update({ [key]: value });
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function resetSettings() {
  const confirmed = await confirmAction({
    title: 'Reset all settings?',
    body: 'Only application preferences are reset. Your Minecraft folder, backups and cache are untouched.',
    confirmLabel: 'Reset settings',
    tone: 'danger',
  });
  if (!confirmed) return;
  try {
    state.settings = await api.settings.reset();
    state.mcVersion = state.settings.lastMinecraftVersion;
    state.edition = state.settings.lastEdition;
    applySettings();
    toast('Settings were reset to their defaults.', 'success');
    render();
  } catch (error) {
    toast(error.message, 'error');
  }
}

/* --------------------------------- actions -------------------------------- */

const CLICK_ACTIONS = {
  nav: (element) => navigate(element.dataset.screen),
  'start-setup': async () => {
    state.installPhase = 'review';
    navigate('setup');
    await ensureDetection();
  },
  rescan: async () => {
    state.inspection = null;
    state.selectedInstallation = null;
    state.selectedVersionEntry = null;
    await ensureDetection({ force: true });
    toast('Rescanned Minecraft folders and version metadata.', 'info');
  },
  'browse-directory': () => browseDirectory(),
  'use-installation': async (element) => {
    const installation = state.installations[Number(element.dataset.index)];
    if (installation) await loadInstallation(installation);
  },
  'use-profile': async (element) => {
    const profile = (state.inspection?.profiles || []).find((entry) => entry.id === element.dataset.id);
    if (!profile || !state.selectedInstallation) return;
    await loadInstallation({
      ...state.selectedInstallation,
      profileId: profile.id,
      gameDir: profile.gameDir,
      name: profile.name,
      suggestedVersion: profile.evidenceVersion,
    });
  },
  'use-version-entry': (element) => useVersionEntry(element.dataset.folder),
  'select-version': (element) => selectVersion(element.dataset.version),
  'select-edition': (element) => selectEdition(element.dataset.edition),
  'goto-setup': () => navigate('setup'),
  'goto-editions': () => {
    if (!state.gameDir || !state.inspection?.valid) {
      toast('Select a valid Minecraft folder first.', 'warning');
      navigate('setup');
      return;
    }
    if (state.requiresGameDirConfirmation && !state.confirmGameDir) {
      toast('Please confirm the game directory before continuing.', 'warning');
      return;
    }
    navigate('edition');
    ensureDetection();
  },
  'goto-install': () => openInstallStep(),
  'load-components': async () => {
    await loadSelection();
    await loadPreview({ silent: true });
    render();
  },
  'refresh-components': async () => {
    await loadSelection({ refresh: true });
    await loadPreview({ silent: true });
    render();
  },
  'start-install': () => startInstall(),
  'cancel-install': () => cancelInstall(),
  'rollback-install': (element) => rollbackInstallation(element.dataset.installation),
  'clear-base-packs': () => clearBasePacks(),
  'open-external': (element) => openExternal(element.dataset.url),
  'open-path': (element) => openPath(element.dataset.path),
  'open-logs': () => openLogsFolder(),
  'copy-diagnostics': () => copyDiagnostics(),
  'load-diagnostics': () => loadDiagnostics(),
  'load-java': async () => {
    try {
      const root = state.selectedInstallation?.root || state.settings.lastRoot || null;
      state.diagnostics.java = await api.minecraft.java(root);
      render();
    } catch (error) {
      toast(error.message, 'error');
    }
  },
  'refresh-version': (element) => refreshVersion(element.dataset.version),
  'reset-settings': () => resetSettings(),
};

const CHANGE_ACTIONS = {
  'toggle-component': (element) => toggleComponent(element.dataset.id, element.checked),
  'clear-shaders': (element) => (element.checked ? setActiveShader(null) : render()),
  'toggle-overwrite-confirm': (element) => {
    state.confirmOverwrite = element.checked;
    render();
  },
  'confirm-game-dir': (element) => {
    state.confirmGameDir = element.checked;
    render();
  },
  'setting-toggle': (element) => updateSetting(element.dataset.setting, element.checked),
  'setting-radio': (element) => updateSetting(element.dataset.setting, element.value),
  'setting-select': (element) => updateSetting(element.dataset.setting, element.value),
};

function bindEvents() {
  document.addEventListener('click', async (event) => {
    const element = event.target.closest('[data-action]');
    if (!element) return;
    if (element.tagName === 'INPUT') return;
    if (element.closest('.switch')) return;
    const handler = CLICK_ACTIONS[element.dataset.action];
    if (!handler) return;
    event.preventDefault();
    try {
      await handler(element);
    } catch (error) {
      toast(error.message || 'The action failed.', 'error');
    }
  });

  document.addEventListener('change', async (event) => {
    const element = event.target.closest('[data-action]');
    if (!element) return;
    const handler = CHANGE_ACTIONS[element.dataset.action];
    if (!handler) return;
    try {
      await handler(element);
    } catch (error) {
      toast(error.message || 'The change could not be saved.', 'error');
    }
  });

  document.addEventListener('toggle', (event) => {
    if (event.target instanceof HTMLDetailsElement && event.target.id === 'customize-components') {
      state.customizeOpen = event.target.open;
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && confirmDialog?.open) confirmDialog.close('cancel');
  });

  api.install.onEvent(({ jobId, event }) => {
    if (!state.jobId || state.jobId !== jobId) {
      const buffered = eventBuffer.get(jobId) || [];
      buffered.push(event);
      eventBuffer.set(jobId, buffered.slice(-250));
      return;
    }
    handleJobEvent(event);
  });
}

/* -------------------------------- self test ------------------------------- */

async function imageLoaded(source) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth > 0);
    image.onerror = () => resolve(false);
    image.src = source;
  });
}

function maxScrimAlpha(element) {
  const value = getComputedStyle(element).backgroundImage + getComputedStyle(element).backgroundColor;
  const alphas = [...value.matchAll(/rgba?\(([^)]+)\)/g)].map((match) => {
    const parts = match[1].split(',').map((part) => Number(part.trim()));
    return parts.length === 4 ? parts[3] : 1;
  });
  return alphas.length === 0 ? 0 : Math.max(...alphas);
}

async function runSelfTest() {
  const checks = [];
  const add = (name, ok, detail = null) => checks.push({ name, ok: Boolean(ok), detail });

  add('bridge-available', Boolean(window.oneclickmc));
  add('screens-registered', Object.keys(SCREENS).length === 6, Object.keys(SCREENS).join(','));
  add('background-image', await imageLoaded('/assets/appbg.png'));
  add('logo-image', await imageLoaded('/assets/logo.png'));
  add('wordmark-image', await imageLoaded('/assets/text.png'));

  let fontReady = false;
  if (document.fonts) {
    try {
      await document.fonts.load('16px "Press Start 2P"', 'ONECLICKMC');
    } catch {
      /* reported below */
    }
    fontReady = document.fonts.check('16px "Press Start 2P"');
  }
  add('brand-font', fontReady);

  const bodyFont = getComputedStyle(document.body).fontFamily.toLowerCase();
  add('readable-body-font-matches', bodyFont.includes('segoe') || bodyFont.includes('system') || bodyFont.includes('sans-serif'), bodyFont.slice(0, 60));
  add('pixel-font-not-global', !getComputedStyle(document.querySelector('.page-title') || document.body).fontFamily.includes('Press Start'), null);

  const info = await api.appInfo();
  add('app-info', Boolean(info?.version), info?.version || null);
  add('assets-present', Object.values(info?.assets || {}).every((asset) => asset.present));
  add('catalog-editions', Object.keys(info?.catalog?.editions || {}).length === 3, Object.keys(info?.catalog?.editions || {}).join(','));

  add('home-rendered', Boolean(document.querySelector('[data-screen="home"]')));
  add('home-wordmark', Boolean(document.querySelector('.hero-wordmark')));
  add('home-step-cards', document.querySelectorAll('.step-card').length === 3);

  const backgroundStyle = getComputedStyle(document.querySelector('.bg-image')).backgroundImage;
  add('background-asset-applied', backgroundStyle.includes('appbg.png'), backgroundStyle.slice(0, 48));
  const scrimAlpha = maxScrimAlpha(document.querySelector('.bg-scrim'));
  add('background-not-obscured', scrimAlpha <= 0.6, `max overlay alpha ${scrimAlpha}`);

  navigate('setup');
  add('setup-rendered', Boolean(document.querySelector('[data-screen="setup"]')));
  add('setup-version-choices', document.querySelectorAll('[data-action="select-version"]').length === 3);
  add('setup-browse', Boolean(document.querySelector('[data-action="browse-directory"]')));
  add('setup-stepbar', document.querySelectorAll('.stepbar-item').length === 3);

  navigate('edition');
  const editionTitles = [...document.querySelectorAll('.choice-title')].map((node) => node.textContent.trim());
  add('edition-cards', editionTitles.length === 3, editionTitles.join(' | '));
  add('edition-labels', ['Potato', 'Medium', 'I Paid for My Whole PC'].every((label) => editionTitles.includes(label)), editionTitles.join(' | '));

  navigate('install');
  add('install-rendered', Boolean(document.querySelector('[data-screen="install"]')));
  add('install-has-primary-action', Boolean(document.querySelector('[data-action="goto-editions"]')));

  navigate('settings');
  add('settings-rendered', Boolean(document.querySelector('[data-screen="settings"]')));
  add('settings-controls', document.querySelectorAll('[data-setting]').length >= 3);

  navigate('diagnostics');
  add('diagnostics-rendered', Boolean(document.querySelector('[data-screen="diagnostics"]')));
  navigate('home');

  const buttons = [...document.querySelectorAll('button')];
  const unlabeled = buttons.filter((button) => !(button.textContent || '').trim() && !button.getAttribute('aria-label'));
  add('buttons-labelled', unlabeled.length === 0, unlabeled.map((button) => button.dataset.action).join(',') || null);

  const smallTargets = buttons.filter((button) => {
    const rect = button.getBoundingClientRect();
    return rect.height > 0 && rect.height < 34;
  });
  add('touch-target-size', smallTargets.length === 0, `${smallTargets.length} button(s) below 34px`);

  add('no-horizontal-scroll', document.documentElement.scrollWidth <= window.innerWidth + 1, `${document.documentElement.scrollWidth} / ${window.innerWidth}`);

  return { ok: checks.every((check) => check.ok), checks, appVersion: info?.version || null, packaged: Boolean(info?.packaged) };
}

/* ---------------------------------- boot ---------------------------------- */

async function boot() {
  try {
    await loadAppInfo();
    await refreshCompatStatus();
    bindEvents();
    render();
    ensureDetection();
  } catch (error) {
    view.innerHTML = `<div class="screen"><section class="card"><h1 class="card-title">OneClickMC could not start</h1>
      <p class="card-sub">${esc(error.message)}</p></section></div>`;
  }
}

window.__oneclickmcTest = {
  navigate: (screen) => navigate(screen, { force: true }),
  state,
};

window.__oneclickmcSelfTest = async () => {
  await window.__oneclickmcReady;
  return runSelfTest();
};

window.__oneclickmcReady = boot();
