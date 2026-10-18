'use strict';

const { app, BrowserWindow, clipboard, dialog, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const { Logger } = require('./lib/logger');
const { SettingsStore } = require('./lib/settings');
const { ModrinthClient, API_BASE } = require('./lib/modrinth');
const { JobManager } = require('./lib/jobs');
const {
  TARGET_VERSIONS,
  detectInstallations,
  detectJavaRuntimes,
  inspectGameDirectory,
  inspectRoot,
} = require('./lib/minecraft');
const { resolveInside } = require('./lib/paths');

app.setName('OneClickMC');
if (process.platform === 'win32') app.setAppUserModelId('com.oneclickmc.app');

const APP_ROOT = app.getAppPath();
const IS_SMOKE_TEST = process.argv.includes('--smoke-test');
const SMOKE_REPORT_ARGUMENT = process.argv.find((argument) => argument.startsWith('--smoke-report='));
const SMOKE_REPORT_PATH = SMOKE_REPORT_ARGUMENT ? SMOKE_REPORT_ARGUMENT.split('=').slice(1).join('=') : null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'modrinth.com',
  'www.modrinth.com',
  'curseforge.com',
  'www.curseforge.com',
  'faithfulpack.net',
  'www.faithfulpack.net',
  'vanillatweaks.net',
  'www.vanillatweaks.net',
  'fabricmc.net',
  'www.fabricmc.net',
  'github.com',
  'oneclickmc.vercel.app',
  'api.modrinth.com',
]);

let mainWindow = null;
let logger = null;
let settings = null;
let jobs = null;
let smokeFinished = false;

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      let pathname = decodeURIComponent(url.pathname);
      if (!pathname || pathname === '/') pathname = '/app/index.html';
      const relative = pathname.replace(/^[/\\]+/, '');
      const filePath = resolveInside(APP_ROOT, relative);
      if (!filePath) return new Response('Forbidden', { status: 403 });
      const extension = path.extname(filePath).toLowerCase();
      const data = await fsp.readFile(filePath);
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function applySecurityHeaders() {
  const { session } = require('electron');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' app:; img-src 'self' app: data:; style-src 'self' app: 'unsafe-inline'; "
            + "font-src 'self' app: data:; script-src 'self' app:; connect-src 'self' app:; "
            + "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        ],
      },
    });
  });
}

function knownPathRoots() {
  const roots = [app.getPath('userData'), APP_ROOT];
  if (settings) {
    const values = settings.get();
    if (values.lastGameDir) roots.push(values.lastGameDir);
    if (values.lastRoot) roots.push(values.lastRoot);
  }
  return roots.filter(Boolean).map((entry) => path.resolve(entry));
}

function isAllowedLocalPath(target) {
  if (typeof target !== 'string' || !target) return false;
  const resolved = path.resolve(target);
  return knownPathRoots().some((root) => {
    const relative = path.relative(root, resolved);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
}

async function openLocalPath(target, { reveal = false } = {}) {
  if (!isAllowedLocalPath(target)) {
    throw new Error('That location is outside the folders OneClickMC manages.');
  }
  const stat = await fsp.stat(target).catch(() => null);
  if (!stat) throw new Error('That location does not exist.');
  if (reveal) {
    shell.showItemInFolder(path.resolve(target));
    return { ok: true };
  }
  if (stat.isFile()) {
    const extension = path.extname(target).toLowerCase();
    if (!['.log', '.txt', '.json'].includes(extension)) {
      throw new Error('Only logs and reports can be opened directly. Use the folder button instead.');
    }
  }
  const error = await shell.openPath(path.resolve(target));
  if (error) throw new Error(error);
  return { ok: true };
}

function isAllowedExternalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return ALLOWED_EXTERNAL_HOSTS.has(url.hostname)
      || url.hostname.endsWith('.modrinth.com')
      || url.hostname.endsWith('.githubusercontent.com');
  } catch {
    return false;
  }
}

async function openExternalUrl(value) {
  if (!isAllowedExternalUrl(value)) throw new Error('That link is not on the approved project list.');
  await shell.openExternal(value);
  return { ok: true };
}

function handle(channel, handler) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const data = await handler(...args);
      return { ok: true, data };
    } catch (error) {
      logger?.error(`IPC ${channel} failed`, { message: error.message, code: error.code || null });
      return {
        ok: false,
        error: {
          message: error.message || 'Unexpected error',
          code: error.code || 'ERROR',
        },
      };
    }
  });
}

async function catalogSummary() {
  try {
    const catalog = await jobs.ensureData();
    return {
      catalogVersion: catalog.catalog_version || null,
      editions: catalog.editions || {},
      componentCount: (catalog.components || []).length,
    };
  } catch (error) {
    logger?.warn('Could not read the component catalog', { message: error.message });
    return { catalogVersion: null, editions: {}, componentCount: 0 };
  }
}

function assetStatus() {
  const files = {
    background: 'appbg.png',
    logo: 'logo.png',
    wordmark: 'text.png',
    icon: 'icon.png',
    executableIcon: 'icon.ico',
  };
  const result = {};
  for (const [key, filename] of Object.entries(files)) {
    result[key] = {
      filename,
      present: fs.existsSync(path.join(APP_ROOT, 'assets', filename)),
    };
  }
  return result;
}

function registerIpc() {
  handle('app:info', async () => ({
    name: 'OneClickMC',
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
    userDataDir: app.getPath('userData'),
    logPath: logger?.describe().filePath || null,
    appRoot: APP_ROOT,
    apiBase: API_BASE,
    targets: TARGET_VERSIONS,
    catalog: await catalogSummary(),
    paths: {
      userDataDir: app.getPath('userData'),
      stagingDir: path.join(app.getPath('userData'), 'staging'),
      backupsDir: path.join(app.getPath('userData'), 'backups'),
      installationsDir: path.join(app.getPath('userData'), 'installations'),
      cacheDir: jobs?.cache?.describe().directory || null,
      cacheTtlHours: jobs?.cache?.describe().ttlHours ?? 6,
    },
    assets: assetStatus(),
    settings: settings.get(),
    smokeTest: IS_SMOKE_TEST,
  }));

  handle('settings:get', async () => settings.get());
  handle('settings:update', async (patch) => {
    const updated = settings.update(patch);
    logger?.setLevel(updated.logLevel);
    return updated;
  });
  handle('settings:reset', async () => settings.reset());

  handle('mc:detect', async () => detectInstallations());
  handle('mc:inspect', async (root) => inspectRoot(root));
  handle('mc:gameDir', async (gameDir) => {
    if (typeof gameDir === 'string' && gameDir) {
      settings.update({ lastGameDir: gameDir });
    }
    return inspectGameDirectory(gameDir);
  });
  handle('mc:java', async (root) => detectJavaRuntimes(root));

  handle('dialog:pickDirectory', async (defaultPath) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select your Minecraft folder',
      buttonLabel: 'Use this folder',
      defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
      properties: ['openDirectory', 'dontAddToRecent'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true, path: null };
    return { canceled: false, path: result.filePaths[0] };
  });

  handle('compat:status', async () => {
    const statuses = [];
    for (const version of TARGET_VERSIONS) {
      statuses.push({ version, ...(await jobs.compatibilityStatus(version)) });
    }
    return statuses;
  });

  handle('compat:resolve', async (payload) => {
    if (!payload || typeof payload !== 'object') throw new Error('Missing compatibility request.');
    return jobs.getSelectionView({
      minecraftVersion: payload.minecraftVersion,
      edition: payload.edition,
      selectedIds: payload.selectedIds ?? null,
      refresh: Boolean(payload.refresh),
    });
  });

  handle('install:preview', async (payload) => {
    if (payload?.gameDir) settings.update({ lastGameDir: payload.gameDir });
    return jobs.previewPlan(payload || {});
  });

  handle('install:start', async (payload) => {
    if (payload?.gameDir) settings.update({ lastGameDir: payload.gameDir });
    if (payload?.profileId) settings.update({ lastProfileId: payload.profileId });
    const { jobId } = jobs.startInstall(payload);
    return { jobId };
  });

  handle('install:cancel', async (jobId) => jobs.cancel(jobId));
  handle('install:job', async (jobId) => jobs.getJob(jobId));
  handle('install:rollback', async (installationId) => jobs.rollback(installationId));
  handle('install:history', async () => jobs.history());

  handle('logs:recent', async (limit) => ({
    path: logger?.describe().filePath || null,
    directory: logger?.describe().directory || null,
    lines: logger?.recent(Number(limit) > 0 ? Number(limit) : 200) || [],
  }));
  handle('logs:openFolder', async () => {
    const directory = logger?.describe().directory;
    if (!directory) throw new Error('Logging is not available.');
    await fsp.mkdir(directory, { recursive: true });
    const error = await shell.openPath(directory);
    if (error) throw new Error(error);
    return { ok: true };
  });

  handle('diagnostics:copy', async () => {
    const report = {
      generatedAt: new Date().toISOString(),
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: `${process.platform} ${process.arch}`,
      packaged: app.isPackaged,
      userDataDir: app.getPath('userData'),
      logPath: logger?.describe().filePath || null,
      assets: assetStatus(),
      settings: settings.get(),
      cache: jobs.cache.describe(),
      compatibility: await Promise.all(
        TARGET_VERSIONS.map(async (version) => ({ version, ...(await jobs.compatibilityStatus(version)) })),
      ),
      recentLog: logger?.recent(60) || [],
    };
    clipboard.writeText(JSON.stringify(report, null, 2));
    return { ok: true };
  });

  handle('system:openPath', async (target) => openLocalPath(target));
  handle('system:showItemInFolder', async (target) => openLocalPath(target, { reveal: true }));
  handle('system:openExternal', async (url) => openExternalUrl(url));
}

function createWindow() {
  const iconPath = path.join(APP_ROOT, 'assets', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#0b100c',
    title: 'OneClickMC',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    if (!IS_SMOKE_TEST) mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://oneclickmc/')) {
      event.preventDefault();
      if (isAllowedExternalUrl(url)) shell.openExternal(url).catch(() => {});
    }
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!app.isPackaged && input.type === 'keyDown' && input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger?.error('Renderer process gone', details);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL('app://oneclickmc/app/index.html');
  return mainWindow;
}

function writeSmokeReport(reportPath, report) {
  return fsp.mkdir(path.dirname(reportPath), { recursive: true })
    .then(() => fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'));
}

async function runSmokeTest() {
  const reportPath = SMOKE_REPORT_PATH
    ? path.resolve(SMOKE_REPORT_PATH)
    : path.join(app.getPath('userData'), 'smoke-report.json');
  const consoleErrors = [];
  const report = {
    startedAt: new Date().toISOString(),
    version: app.getVersion(),
    packaged: app.isPackaged,
    checks: [],
    consoleErrors,
    capturePath: null,
    reportPath,
    ok: false,
  };

  const addCheck = (name, ok, detail = null) => {
    report.checks.push({ name, ok: Boolean(ok), detail });
  };

  try {
    mainWindow.show();
    mainWindow.webContents.on('console-message', (_event, level, message) => {
      if (level >= 3) consoleErrors.push(message);
    });
    mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
      consoleErrors.push(`did-fail-load ${code} ${description} ${url}`);
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Renderer did not finish loading within 30 seconds.')), 30000);
      mainWindow.webContents.once('did-finish-load', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 800));

    const selfTest = await mainWindow.webContents.executeJavaScript(
      'window.__oneclickmcSelfTest ? window.__oneclickmcSelfTest() : Promise.resolve(null)',
      true,
    );
    if (!selfTest) {
      addCheck('renderer-self-test-present', false, 'window.__oneclickmcSelfTest was not defined');
    } else {
      addCheck('renderer-self-test-present', true);
      for (const check of selfTest.checks || []) {
        addCheck(check.name, check.ok, check.detail || null);
      }
    }

    addCheck('no-console-errors', consoleErrors.length === 0, consoleErrors.join(' | ') || null);

    const capture = await mainWindow.webContents.capturePage();
    const capturePath = path.join(path.dirname(reportPath), 'smoke-capture.png');
    await fsp.writeFile(capturePath, capture.toPNG());
    report.capturePath = capturePath;
    const size = capture.getSize();
    addCheck('window-capture-non-empty', size.width > 800 && size.height > 500, `${size.width}x${size.height}`);

    const captureDir = process.env.OCMC_CAPTURE_DIR ? path.resolve(process.env.OCMC_CAPTURE_DIR) : null;
    if (captureDir) {
      await fsp.mkdir(captureDir, { recursive: true });
      for (const screen of ['home', 'setup', 'edition', 'install', 'settings', 'diagnostics']) {
        await mainWindow.webContents.executeJavaScript(
          `window.__oneclickmcTest.navigate(${JSON.stringify(screen)})`,
          true,
        );
        await new Promise((resolve) => setTimeout(resolve, 450));
        const shot = await mainWindow.webContents.capturePage();
        await fsp.writeFile(path.join(captureDir, `${screen}.png`), shot.toPNG());
        if (process.env.OCMC_LAYOUT_DUMP) {
          const layout = await mainWindow.webContents.executeJavaScript(`(() => {
            const rect = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
            return {
              scrollHeight: document.documentElement.scrollHeight,
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              choices: [...document.querySelectorAll('.choice')].map(rect),
              grids: [...document.querySelectorAll('.choice-grid')].map((el) => ({ cls: el.className, cols: getComputedStyle(el).gridTemplateColumns, r: rect(el) })),
              cards: [...document.querySelectorAll('.card')].map((el) => ({ title: el.querySelector('.card-title')?.textContent?.slice(0, 22), r: rect(el) })),
              listRows: document.querySelectorAll('.list-row').length,
            };
          })()`, true);
          process.stdout.write(`LAYOUT ${screen} ${JSON.stringify(layout)}\n`);
        }
      }
      addCheck('screens-captured', true, captureDir);
    }

    const sample = await mainWindow.webContents.executeJavaScript(
      `(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        return { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio };
      })()`,
    );
    addCheck('window-size', sample.width >= 1100 && sample.height >= 700, `${sample.width}x${sample.height}`);

    report.ok = report.checks.every((check) => check.ok);
  } catch (error) {
    report.error = error.message;
    report.ok = false;
  }

  await writeSmokeReport(reportPath, report).catch(() => {});
  process.stdout.write(`${JSON.stringify(report)}\n`);
  smokeFinished = true;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  app.exit(report.ok ? 0 : 1);
}

const singleInstance = IS_SMOKE_TEST ? true : app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const userDataDir = app.getPath('userData');
    await fsp.mkdir(userDataDir, { recursive: true });

    logger = new Logger({ directory: path.join(userDataDir, 'logs') });
    settings = new SettingsStore(userDataDir);
    settings.update({});
    logger.setLevel(settings.get().logLevel);
    logger.info('OneClickMC starting', {
      version: app.getVersion(),
      electron: process.versions.electron,
      packaged: app.isPackaged,
    });

    const client = new ModrinthClient({ logger });
    jobs = new JobManager({
      appRoot: APP_ROOT,
      userDataDir,
      stagingDir: path.join(userDataDir, 'staging'),
      backupsDir: path.join(userDataDir, 'backups'),
      installationsDir: path.join(userDataDir, 'installations'),
      logger,
      client,
      emit: (jobId, event) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('job:event', { jobId, event });
        }
      },
    });

    registerAppProtocol();
    applySecurityHeaders();
    registerIpc();

    jobs.recoverInterrupted().catch((error) => {
      logger.warn('Interrupted installation recovery failed', { message: error.message });
    });

    createWindow();
    if (IS_SMOKE_TEST) {
      runSmokeTest().catch((error) => {
        logger.error('Smoke test crashed', { message: error.message });
        app.exit(1);
      });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (IS_SMOKE_TEST || smokeFinished) app.exit(0);
    else app.quit();
  });

  app.on('before-quit', () => {
    logger?.info('OneClickMC shutting down');
    logger?.close();
  });
}
