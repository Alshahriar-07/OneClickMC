'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const TARGET_VERSIONS = Object.freeze(['1.21.11', '26.1', '26.2']);
const VERSION_ID_PATTERN = /^\d+\.\d+(?:\.\d+)?$/;

function launcherDataDirectory() {
  return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
}

function defaultMinecraftRoots() {
  const roots = [
    path.join(launcherDataDirectory(), '.minecraft'),
    path.join(os.homedir(), '.minecraft'),
    path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft'),
  ];
  return [...new Set(roots.map((entry) => path.resolve(entry)))];
}

async function readJsonFile(filePath) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return { data: JSON.parse(raw), error: null };
  } catch (error) {
    return { data: null, error: error.code === 'ENOENT' ? null : error.message };
  }
}

async function directoryEntries(directory) {
  try {
    return await fsp.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

function expandGameDirectory(root, gameDir) {
  if (!gameDir || typeof gameDir !== 'string') return path.resolve(root);
  const expanded = gameDir.replace(/%([^%]+)%/g, (_match, name) => process.env[name] || `%${name}%`);
  return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(root, expanded);
}

function detectLoader(libraries, versionId) {
  const ids = Array.isArray(libraries)
    ? libraries.map((library) => String(library?.name || '')).join(' ')
    : '';
  if (/net\.fabricmc:fabric-loader/i.test(ids) || /^fabric-loader-/i.test(versionId || '')) {
    return { loader: 'fabric', loaderVersion: extractFabricVersion(ids, versionId) };
  }
  if (/org\.quiltmc:quilt-loader/i.test(ids) || /^quilt-loader-/i.test(versionId || '')) {
    return { loader: 'quilt', loaderVersion: null };
  }
  if (/net\.neoforged/i.test(ids) || /neoforge/i.test(versionId || '')) {
    return { loader: 'neoforge', loaderVersion: null };
  }
  if (/net\.minecraftforge/i.test(ids) || /^forge-/i.test(versionId || '')) {
    return { loader: 'forge', loaderVersion: null };
  }
  return { loader: 'vanilla', loaderVersion: null };
}

function extractFabricVersion(libraries, versionId) {
  const match = /net\.fabricmc:fabric-loader:([^:\s"]+)/i.exec(libraries || '');
  if (match) return match[1];
  const idMatch = /^fabric-loader-([^-]+)-/i.exec(versionId || '');
  return idMatch ? idMatch[1] : null;
}

function readVersionSummary(dirName, data, jsonPath) {
  const id = typeof data?.id === 'string' ? data.id : null;
  const inheritsFrom = typeof data?.inheritsFrom === 'string' ? data.inheritsFrom : null;
  const loaderInfo = detectLoader(data?.libraries, id || dirName);
  const actualVersion = inheritsFrom
    || (id && VERSION_ID_PATTERN.test(id) ? id : null);
  const javaMajor = Number.isFinite(data?.javaVersion?.majorVersion)
    ? data.javaVersion.majorVersion
    : null;
  return {
    dirName,
    id,
    inheritsFrom,
    actualVersion,
    versionSource: inheritsFrom ? 'inheritsFrom' : id && VERSION_ID_PATTERN.test(id) ? 'version id' : null,
    loader: loaderInfo.loader,
    loaderVersion: loaderInfo.loaderVersion,
    javaMajor,
    type: typeof data?.type === 'string' ? data.type : null,
    jsonPath,
    releaseTime: typeof data?.releaseTime === 'string' ? data.releaseTime : null,
  };
}

function evaluateCompatibility(actualVersion, loader) {
  if (!actualVersion) {
    return {
      supported: false,
      loaderReady: false,
      reason: 'The Minecraft version could not be verified from this entry\u2019s metadata.',
    };
  }
  if (!TARGET_VERSIONS.includes(actualVersion)) {
    return {
      supported: false,
      loaderReady: false,
      reason: `Minecraft ${actualVersion} is not one of the supported target versions (${TARGET_VERSIONS.join(', ')}).`,
    };
  }
  if (loader === 'fabric') {
    return { supported: true, loaderReady: true, reason: null };
  }
  if (loader === 'vanilla') {
    return {
      supported: true,
      loaderReady: false,
      reason: 'No Fabric loader in this entry, so Fabric components would not load until Fabric is installed.',
    };
  }
  return {
    supported: false,
    loaderReady: false,
    reason: `This entry uses ${loader}. OneClickMC only ships Fabric components.`,
  };
}

/**
 * Scans `<root>/versions` and reports every entry it can actually see, including
 * entries whose version cannot be verified. Never guesses a version from a folder name.
 */
async function scanVersionEntries(root) {
  const versionsDir = path.join(root, 'versions');
  const result = {
    versionsDir,
    readable: true,
    missing: false,
    entries: [],
    problems: [],
  };

  let directoryEntriesList;
  try {
    directoryEntriesList = await fsp.readdir(versionsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      result.missing = true;
      return result;
    }
    result.readable = false;
    result.problems.push({
      folder: null,
      message: error.code === 'EACCES' || error.code === 'EPERM'
        ? 'Permission was denied while reading the versions folder.'
        : `The versions folder could not be read: ${error.message}`,
    });
    return result;
  }

  const seen = new Set();
  for (const entry of directoryEntriesList) {
    if (!entry.isDirectory()) continue;
    const folderName = entry.name;
    const folder = path.join(versionsDir, folderName);

    let realPath = folder;
    try {
      realPath = await fsp.realpath(folder);
    } catch {
      /* fall back to the folder path when it cannot be resolved */
    }
    if (seen.has(realPath)) {
      result.problems.push({ folder: folderName, message: 'Duplicate of another version entry; skipped.' });
      continue;
    }
    seen.add(realPath);

    const files = await directoryEntries(folder);
    const problems = [];
    const base = {
      folderName,
      path: folder,
      jsonPath: null,
      jarPath: null,
      id: null,
      inheritsFrom: null,
      actualVersion: null,
      versionSource: null,
      loader: 'unknown',
      loaderVersion: null,
      javaMajor: null,
      type: null,
      releaseTime: null,
      hasJar: false,
      customFolderName: false,
      valid: false,
      problems,
      compatibility: { supported: false, loaderReady: false, reason: 'This entry could not be inspected.' },
    };

    const jsonFiles = files.filter((file) => file.isFile() && file.name.toLowerCase().endsWith('.json'));
    const preferred = jsonFiles.find((file) => file.name === `${folderName}.json`) || jsonFiles[0];
    const jarFile = files.find((file) => file.isFile() && file.name.toLowerCase().endsWith('.jar'))
      || (fs.existsSync(path.join(folder, `${folderName}.jar`)) ? { name: `${folderName}.jar` } : null);
    base.hasJar = Boolean(jarFile);
    base.jarPath = jarFile ? path.join(folder, jarFile.name) : null;

    if (!preferred) {
      problems.push({
        folder: folderName,
        message: 'No version JSON metadata was found, so the game version cannot be verified.',
      });
      base.compatibility = evaluateCompatibility(null, 'unknown');
      result.entries.push(base);
      continue;
    }

    const jsonPath = path.join(folder, preferred.name);
    base.jsonPath = jsonPath;
    const { data, error } = await readJsonFile(jsonPath);
    if (error || !data || typeof data !== 'object') {
      problems.push({
        folder: folderName,
        message: error ? `Version JSON could not be read: ${error}` : 'Version JSON is empty or invalid.',
      });
      base.compatibility = evaluateCompatibility(null, 'unknown');
      result.entries.push(base);
      continue;
    }

    const summary = readVersionSummary(folderName, data, jsonPath);
    Object.assign(base, {
      id: summary.id,
      inheritsFrom: summary.inheritsFrom,
      actualVersion: summary.actualVersion,
      versionSource: summary.versionSource,
      loader: summary.loader,
      loaderVersion: summary.loaderVersion,
      javaMajor: summary.javaMajor,
      type: summary.type,
      releaseTime: summary.releaseTime,
    });
    base.customFolderName = Boolean(base.actualVersion && base.actualVersion !== folderName);

    if (!base.id) problems.push({ folder: folderName, message: 'The version JSON has no id field.' });
    if (!Array.isArray(data.libraries)) {
      problems.push({ folder: folderName, message: 'The version JSON has no library list; the entry may be incomplete.' });
    }
    if (!base.actualVersion) {
      problems.push({
        folder: folderName,
        message: 'The game version is unknown; this entry has no vanilla id and no inheritsFrom field.',
      });
    }
    if (!base.hasJar && !base.inheritsFrom) {
      problems.push({ folder: folderName, message: 'No client jar was found in this version folder.' });
    }

    base.valid = problems.length === 0;
    base.compatibility = evaluateCompatibility(base.actualVersion, base.loader);
    result.entries.push(base);
  }

  return result;
}

/**
 * Backwards-compatible summary list used by the rest of the app and tests.
 */
async function scanVersions(root) {
  const scan = await scanVersionEntries(root);
  const summaries = scan.entries.map((entry) => ({
    dirName: entry.folderName,
    id: entry.id,
    inheritsFrom: entry.inheritsFrom,
    actualVersion: entry.actualVersion,
    versionSource: entry.versionSource,
    loader: entry.loader,
    loaderVersion: entry.loaderVersion,
    javaMajor: entry.javaMajor,
    type: entry.type,
    jsonPath: entry.jsonPath,
    releaseTime: entry.releaseTime,
    customFolderName: entry.customFolderName,
    valid: entry.valid,
  }));
  return { summaries, problems: scan.problems, scan };
}

function findVersionSummary(versions, versionId) {
  if (!versionId) return null;
  return versions.find((version) => version.id === versionId)
    || versions.find((version) => version.dirName === versionId)
    || null;
}

async function inspectRoot(rootInput) {
  const root = typeof rootInput === 'string' && rootInput.trim()
    ? path.resolve(rootInput.trim())
    : null;
  if (!root) {
    return { root: null, valid: false, problems: ['No Minecraft directory was selected.'] };
  }

  const result = {
    root,
    valid: false,
    exists: false,
    hasLauncherProfiles: false,
    launcherProfilesError: null,
    profiles: [],
    versions: [],
    versionProblems: [],
    fabricVersions: [],
    javaByVersion: {},
    targetVersions: TARGET_VERSIONS,
    warnings: [],
    problems: [],
  };

  try {
    const stat = await fsp.stat(root);
    if (!stat.isDirectory()) {
      result.problems.push('The selected path is a file, not a Minecraft directory.');
      return result;
    }
    result.exists = true;
  } catch {
    result.problems.push('The selected directory does not exist or cannot be accessed.');
    return result;
  }

  const profilesPath = path.join(root, 'launcher_profiles.json');
  const profilesFile = await readJsonFile(profilesPath);
  result.hasLauncherProfiles = Boolean(profilesFile.data);
  result.launcherProfilesError = profilesFile.error;

  const { summaries, problems, scan } = await scanVersions(root);
  result.versions = summaries;
  result.versionEntries = scan.entries;
  result.versionScan = {
    versionsDir: scan.versionsDir,
    readable: scan.readable,
    missing: scan.missing,
  };
  result.versionProblems = [
    ...problems,
    ...scan.entries.flatMap((entry) => entry.problems),
  ];

  for (const version of summaries) {
    if (version.loader === 'fabric' && TARGET_VERSIONS.includes(version.actualVersion)) {
      const existing = result.fabricVersions.find(
        (entry) => entry.minecraftVersion === version.actualVersion,
      );
      const candidate = {
        minecraftVersion: version.actualVersion,
        loaderVersion: version.loaderVersion,
        versionId: version.id,
        jsonPath: version.jsonPath,
      };
      if (!existing) {
        result.fabricVersions.push(candidate);
      } else if (String(candidate.loaderVersion) > String(existing.loaderVersion)) {
        Object.assign(existing, candidate);
      }
    }
    if (version.actualVersion && version.javaMajor && !result.javaByVersion[version.actualVersion]) {
      result.javaByVersion[version.actualVersion] = version.javaMajor;
    }
  }

  const profileEntries = profilesFile.data?.profiles;
  if (profileEntries && typeof profileEntries === 'object') {
    for (const [profileId, profile] of Object.entries(profileEntries)) {
      if (!profile || typeof profile !== 'object') continue;
      const gameDir = expandGameDirectory(root, profile.gameDir);
      const gameDirExists = await fsp.stat(gameDir).then((stat) => stat.isDirectory()).catch(() => false);
      const versionEntry = findVersionSummary(summaries, profile.lastVersionId);
      const evidenceVersion = versionEntry?.actualVersion
        || (profile.lastVersionId && VERSION_ID_PATTERN.test(profile.lastVersionId)
          ? profile.lastVersionId
          : null);
      result.profiles.push({
        id: profileId,
        name: typeof profile.name === 'string' && profile.name.trim() ? profile.name : profileId,
        type: typeof profile.type === 'string' ? profile.type : 'custom',
        lastVersionId: profile.lastVersionId || null,
        gameDir,
        gameDirSource: profile.gameDir ? 'launcher profile gameDir' : 'Minecraft root (profile has no gameDir)',
        gameDirExists,
        evidenceVersion,
        evidenceSource: versionEntry
          ? (versionEntry.versionSource === 'inheritsFrom'
            ? `version JSON inheritsFrom (${versionEntry.dirName})`
            : `version JSON id (${versionEntry.dirName})`)
          : (evidenceVersion ? 'launcher lastVersionId' : null),
        loader: versionEntry?.loader || (String(profile.lastVersionId || '').includes('fabric') ? 'fabric' : null),
        icon: typeof profile.icon === 'string' ? profile.icon : null,
        versionFolderName: versionEntry?.dirName || null,
        compatibility: evaluateCompatibility(
          evidenceVersion,
          versionEntry?.loader || (String(profile.lastVersionId || '').includes('fabric') ? 'fabric' : 'unknown'),
        ),
      });
      if (profile.gameDir && !gameDirExists) {
        result.warnings.push(`Profile "${profile.name || profileId}" points to a missing game directory.`);
      }
    }
  }

  if (!result.hasLauncherProfiles && summaries.length === 0) {
    const gameDirMarkers = ['mods', 'config', 'saves', 'shaderpacks', 'resourcepacks'];
    let markerFound = false;
    for (const marker of gameDirMarkers) {
      const markerStat = await fsp.stat(path.join(root, marker)).catch(() => null);
      if (markerStat?.isDirectory()) {
        markerFound = true;
        break;
      }
    }
    if (markerFound) {
      result.valid = true;
      result.looksLikeGameDirectory = true;
      result.warnings.push(
        'This folder contains Minecraft game data but no launcher file or versions folder. OneClickMC will treat it as the effective game directory; launcher/version detection is unavailable here.',
      );
    } else {
      result.problems.push(
        'This folder has no launcher_profiles.json, versions folder or Minecraft game data. Select the Minecraft root or a launcher instance folder.',
      );
    }
  } else {
    result.valid = true;
  }

  const customFolders = summaries.filter((version) => version.customFolderName);
  if (customFolders.length > 0) {
    result.warnings.push(
      `Ignored ${customFolders.length} custom version folder name(s) when identifying game versions; only version JSON metadata is trusted.`,
    );
  }

  const loaders = new Set(summaries.map((version) => version.loader).filter((loader) => loader !== 'vanilla'));
  for (const loader of loaders) {
    if (loader !== 'fabric') {
      result.warnings.push(
        `A ${loader} installation was detected. OneClickMC currently only ships Fabric components and will not install into a ${loader} profile.`,
      );
    }
  }

  return result;
}

async function detectInstallations() {
  const installations = [];
  const seen = new Set();
  const roots = defaultMinecraftRoots();

  for (const root of roots) {
    let stat;
    try {
      stat = await fsp.stat(root);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const inspection = await inspectRoot(root);
    if (!inspection.exists) continue;

    if (!seen.has(root)) {
      installations.push({
        id: `root:${root}`,
        kind: 'minecraft-root',
        name: path.basename(root) || root,
        detail: 'Minecraft root',
        root,
        gameDir: root,
        profileId: null,
        lastVersionId: null,
        suggestedVersion: null,
        loader: null,
      });
      seen.add(root);
    }

    for (const profile of inspection.profiles) {
      const key = `${root}::${profile.id}`;
      if (seen.has(key)) continue;
      installations.push({
        id: `profile:${profile.id}`,
        kind: 'launcher-profile',
        name: profile.name,
        detail: profile.type === 'latest-release' ? 'Official launcher profile' : 'Launcher profile',
        root,
        gameDir: profile.gameDir,
        profileId: profile.id,
        lastVersionId: profile.lastVersionId,
        suggestedVersion: profile.evidenceVersion,
        suggestedSource: profile.evidenceSource,
        loader: profile.loader,
      });
      seen.add(key);
    }
  }

  const instanceRoots = [
    path.join(os.homedir(), 'curseforge', 'minecraft', 'Instances'),
    path.join(os.homedir(), 'Documents', 'curseforge', 'minecraft', 'Instances'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'ModrinthApp', 'profiles'),
  ];
  for (const instanceRoot of instanceRoots) {
    const entries = await directoryEntries(instanceRoot);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folder = path.join(instanceRoot, entry.name);
      const metadata = await readJsonFile(path.join(folder, 'minecraftinstance.json'));
      const isLikelyInstance = metadata.data
        || await fsp.stat(path.join(folder, 'mods')).then((stat) => stat.isDirectory()).catch(() => false);
      if (!isLikelyInstance) continue;
      const gameVersion = typeof metadata.data?.gameVersion === 'string'
        ? metadata.data.gameVersion
        : null;
      const loaderName = typeof metadata.data?.baseModLoader?.name === 'string'
        ? metadata.data.baseModLoader.name
        : null;
      installations.push({
        id: `instance:${folder}`,
        kind: instanceRoot.includes('ModrinthApp') ? 'modrinth-instance' : 'curseforge-instance',
        name: entry.name,
        detail: instanceRoot.includes('ModrinthApp') ? 'Modrinth App profile folder' : 'CurseForge instance',
        root: folder,
        gameDir: folder,
        profileId: null,
        lastVersionId: null,
        suggestedVersion: gameVersion && VERSION_ID_PATTERN.test(gameVersion) ? gameVersion : null,
        suggestedSource: gameVersion ? 'minecraftinstance.json' : null,
        loader: loaderName ? (loaderName.toLowerCase().includes('fabric') ? 'fabric' : loaderName) : null,
      });
    }
  }

  return {
    searched: roots.concat(instanceRoots),
    installations,
    targets: TARGET_VERSIONS,
  };
}

async function inspectGameDirectory(gameDir) {
  if (!gameDir) return { gameDir: null, exists: false, contents: {} };
  const folderChecks = ['mods', 'shaderpacks', 'resourcepacks', 'saves', 'versions', 'config'];
  const contents = {};
  for (const folder of folderChecks) {
    const target = path.join(gameDir, folder);
    contents[folder] = await fsp.stat(target).then((stat) => stat.isDirectory()).catch(() => false);
  }
  const exists = await fsp.stat(gameDir).then((stat) => stat.isDirectory()).catch(() => false);
  return { gameDir, exists, contents };
}

function javaCandidatesFromMinecraft(root) {
  const runtimes = path.join(root, 'runtime');
  const candidates = [];
  try {
    for (const entry of fs.readdirSync(runtimes, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const executable = path.join(runtimes, entry.name, 'windows-x64', 'java.exe');
      if (fs.existsSync(executable)) candidates.push(executable);
    }
  } catch {
    /* no managed runtime */
  }
  return candidates;
}

function inspectJavaExecutable(executable) {
  return new Promise((resolve) => {
    execFile(executable, ['-version'], { timeout: 5000, windowsHide: true }, (error, stdout, stderr) => {
      const text = `${stderr || ''}\n${stdout || ''}`.trim();
      const match = /version "([^"]+)"/i.exec(text);
      if (error && !match) {
        resolve(null);
        return;
      }
      const version = match ? match[1] : null;
      let major = null;
      if (version) {
        const parts = version.split(/[._-]/);
        major = parts[0] === '1' ? Number(parts[1]) : Number(parts[0]);
        if (!Number.isFinite(major)) major = null;
      }
      resolve({
        path: executable,
        version,
        major,
        vendor: /(temurin|adoptium)/i.test(text) ? 'Eclipse Temurin'
          : /microsoft/i.test(text) ? 'Microsoft'
            : /openjdk/i.test(text) ? 'OpenJDK'
              : /java\(tm\)/i.test(text) ? 'Oracle'
                : 'Java',
      });
    });
  });
}

async function detectJavaRuntimes(minecraftRoot) {
  const paths = new Set();
  if (process.env.JAVA_HOME) paths.add(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'));
  paths.add('java');

  for (const base of [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Java'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Eclipse Adoptium'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Eclipse Adoptium'),
  ]) {
    try {
      for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const executable = path.join(base, entry.name, 'bin', 'java.exe');
        if (fs.existsSync(executable)) paths.add(executable);
      }
    } catch {
      /* not installed here */
    }
  }

  if (minecraftRoot) {
    for (const executable of javaCandidatesFromMinecraft(minecraftRoot)) paths.add(executable);
  }

  const runtimes = [];
  const seen = new Set();
  for (const candidate of paths) {
    const info = await inspectJavaExecutable(candidate);
    if (!info) continue;
    const key = `${info.path}|${info.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    runtimes.push(info);
  }
  runtimes.sort((a, b) => (b.major || 0) - (a.major || 0));
  return runtimes;
}

module.exports = {
  TARGET_VERSIONS,
  VERSION_ID_PATTERN,
  defaultMinecraftRoots,
  detectInstallations,
  detectJavaRuntimes,
  detectLoader,
  evaluateCompatibility,
  expandGameDirectory,
  inspectGameDirectory,
  inspectRoot,
  launcherDataDirectory,
  scanVersionEntries,
};
