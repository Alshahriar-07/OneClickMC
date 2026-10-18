import { icon } from '../icons.js';
import { esc, shortPath } from '../format.js';
import {
  badge,
  button,
  card,
  emptyState,
  loadingInline,
  notice,
  pageHead,
  stepBar,
} from '../parts.js';

const COMPATIBILITY_BADGE = {
  compatible: { label: 'Compatible', tone: 'ok', iconName: 'check-circle' },
  needsLoader: { label: 'Needs Fabric', tone: 'warn', iconName: 'alert' },
  unsupported: { label: 'Unsupported', tone: 'error', iconName: 'x-circle' },
  unknown: { label: 'Unknown version', tone: 'warn', iconName: 'alert' },
};

function compatibilityOf(entry) {
  const compatibility = entry.compatibility || {};
  if (!entry.actualVersion) return COMPATIBILITY_BADGE.unknown;
  if (!compatibility.supported) return COMPATIBILITY_BADGE.unsupported;
  if (!compatibility.loaderReady) return COMPATIBILITY_BADGE.needsLoader;
  return COMPATIBILITY_BADGE.compatible;
}

function profileRows(state) {
  const profiles = state.inspection?.profiles || [];
  if (profiles.length === 0) return '';
  const activeProfile = state.selectedInstallation?.profileId;
  return `<div class="section-title" style="margin-top:18px">Launcher profiles</div>
    <div class="list">${profiles
      .map((profile) => {
        const selected = activeProfile === profile.id;
        const badgeMeta = profile.compatibility?.supported
          ? (profile.compatibility.loaderReady ? COMPATIBILITY_BADGE.compatible : COMPATIBILITY_BADGE.needsLoader)
          : (profile.evidenceVersion ? COMPATIBILITY_BADGE.unsupported : COMPATIBILITY_BADGE.unknown);
        return `<button type="button" class="list-row${selected ? ' selected' : ''}" data-action="use-profile" data-id="${esc(profile.id)}">
          <span class="list-icon">${icon('user', 'icon-sm')}</span>
          <span class="list-main">
            <span class="list-title">${esc(profile.name)}
              ${profile.evidenceVersion ? badge(`Minecraft ${profile.evidenceVersion}`, 'info', 'grid') : ''}
              ${profile.loader ? badge(profile.loader, 'neutral', 'package') : ''}
            </span>
            <span class="list-sub">${esc(profile.type || 'custom')} · ${
              profile.evidenceSource ? esc(profile.evidenceSource) : 'no verified version evidence'
            }</span>
            <span class="list-path">${esc(shortPath(profile.gameDir, 84))}</span>
          </span>
          <span class="list-side">
            ${badge(badgeMeta.label, badgeMeta.tone, badgeMeta.iconName)}
            ${selected ? icon('check-circle', 'icon-sm') : ''}
          </span>
        </button>`;
      })
      .join('')}</div>`;
}

function versionRows(state) {
  const inspection = state.inspection;
  const entries = inspection?.versionEntries || [];

  if (!inspection) return emptyState({ title: 'No folder selected yet', body: 'Choose your Minecraft folder to scan its versions.' });
  if (inspection.versionScan?.missing) {
    return notice({
      tone: 'info',
      title: 'No versions folder here.',
      body: esc(
        `${inspection.versionScan.versionsDir} does not exist. This looks like a launcher instance or game directory. OneClickMC will treat this folder itself as the effective game directory.`,
      ),
    });
  }
  if (!inspection.versionScan?.readable) {
    return notice({
      tone: 'error',
      title: 'The versions folder could not be read.',
      body: esc((inspection.versionProblems[0] || {}).message || 'Permission was denied.'),
    });
  }
  if (entries.length === 0) {
    return emptyState({
      title: 'No entries in the versions folder',
      body: `${inspection.versionScan?.versionsDir || 'versions'} exists but is empty.`,
      iconName: 'folder',
    });
  }

  const selectedFolder = state.selectedVersionEntry?.folderName;
  return `<div class="section-title" style="margin-top:16px">Version folders — ${entries.length} found</div>
    <div class="list list-scroll">${entries
      .map((entry) => {
        const badgeMeta = compatibilityOf(entry);
        const selected = selectedFolder === entry.folderName;
        const loader = entry.loader && entry.loader !== 'unknown' ? entry.loader : null;
        return `<button type="button" class="list-row${selected ? ' selected' : ''}" data-action="use-version-entry" data-folder="${esc(entry.folderName)}">
          <span class="list-icon">${icon(loader === 'fabric' ? 'package' : 'grid', 'icon-sm')}</span>
          <span class="list-main">
            <span class="list-title">${esc(entry.folderName)}
              ${entry.actualVersion ? badge(`Minecraft ${entry.actualVersion}`, 'info', 'grid') : ''}
              ${loader ? badge(loader, 'neutral', 'package') : ''}
            </span>
            <span class="list-sub">${
              entry.problems.length > 0
                ? esc(entry.problems[0].message)
                : `Verified from ${esc(entry.jsonPath ? entry.jsonPath.split(/[\\/]/).pop() : 'metadata')}${
                  entry.hasJar ? ' · client jar present' : ''
                }`
            }</span>
          </span>
          <span class="list-side">${badge(badgeMeta.label, badgeMeta.tone, badgeMeta.iconName)}</span>
        </button>`;
      })
      .join('')}</div>
    <p class="small faint" style="margin-top:10px">A folder in <span class="mono">versions</span> is a launcher entry, not necessarily the folder your mods load from. OneClickMC installs into the effective game directory.</p>`;
}

function versionStrip(state) {
  const targets = state.appInfo?.targets || ['1.21.11', '26.1', '26.2'];
  const inspection = state.inspection;

  const options = targets
    .map((version) => {
      const selected = state.mcVersion === version;
      const entries = (inspection?.versions || []).filter((entry) => entry.actualVersion === version);
      const fabric = (inspection?.fabricVersions || []).find((entry) => entry.minecraftVersion === version);
      const javaMajor = inspection?.javaByVersion?.[version];
      const note = entries.length > 0
        ? `${entries.length} local entr${entries.length === 1 ? 'y' : 'ies'}`
        : 'Not installed here';
      return `<button type="button" class="version-option${selected ? ' selected' : ''}" data-action="select-version" data-version="${esc(version)}" aria-pressed="${selected}">
        <span class="version-mark" aria-hidden="true">${selected ? icon('check', 'icon-sm') : ''}</span>
        <span class="version-body">
          <span class="version-name">Minecraft ${esc(version)}</span>
          <span class="version-meta">
            <span class="version-note">${esc(note)}</span>
            ${fabric ? badge(`Fabric ${fabric.loaderVersion || ''}`.trim(), 'ok', 'check') : badge('Fabric not detected', 'warn', 'alert')}
            ${javaMajor ? badge(`Java ${javaMajor}`, 'neutral', 'cpu') : ''}
          </span>
        </span>
      </button>`;
    })
    .join('');

  return card({
    title: 'Actual Minecraft version',
    subtitle: 'Chosen independently from any folder name. Only verified version metadata counts.',
    content: `<div class="version-strip" role="group" aria-label="Minecraft version">${options}</div>`,
  });
}

function loaderLine(state) {
  const fabric = (state.inspection?.fabricVersions || []).find((entry) => entry.minecraftVersion === state.mcVersion);
  const foreign = (state.inspection?.versions || []).find(
    (version) => version.actualVersion === state.mcVersion && !['fabric', 'vanilla'].includes(version.loader),
  );

  if (foreign) {
    return `<div class="loader-line tone-error">
      ${icon('x-circle', 'icon-sm')}
      <div class="loader-copy"><strong>A ${esc(foreign.loader)} entry exists for ${esc(state.mcVersion)}.</strong>
        <span>OneClickMC ships Fabric components and will not modify a non-Fabric installation.</span></div>
    </div>`;
  }
  if (fabric) {
    return `<div class="loader-line tone-ok">
      ${icon('check-circle', 'icon-sm')}
      <div class="loader-copy"><strong>Fabric ${esc(fabric.loaderVersion || '')} detected for ${esc(state.mcVersion)}.</strong>
        <span>Mods can load after you restart Minecraft.</span></div>
    </div>`;
  }
  return `<div class="loader-line tone-warn">
    ${icon('alert', 'icon-sm')}
    <div class="loader-copy"><strong>Fabric was not detected for ${esc(state.mcVersion || 'this version')}.</strong>
      <span>Files install safely, but Minecraft needs Fabric to load them.</span></div>
    <button type="button" class="link" data-action="open-external" data-url="https://fabricmc.net/use/installer/">Fabric installer ${icon('external', 'icon-sm')}</button>
  </div>`;
}

export function renderSetup(state) {
  const inspection = state.inspection;
  const pending = state.inspectLoading || state.detectionLoading;
  const canContinue = Boolean(state.gameDir) && Boolean(inspection?.valid) && Boolean(state.mcVersion)
    && (!state.requiresGameDirConfirmation || state.confirmGameDir);

  const scanLine = inspection
    ? `Scanned ${shortPath(inspection.versionScan?.versionsDir || '', 62)}`
    : 'No folder scanned yet';

  return `<div class="screen" data-screen="setup">
    ${stepBar(0)}
    ${pageHead({
      title: 'Choose your Minecraft installation',
      subtitle:
        'OneClickMC scans the versions folder and launcher profiles, verifies the real game version from metadata, and installs only into the effective game directory.',
      actions: `${button({ label: 'Browse…', action: 'browse-directory', variant: 'secondary', iconName: 'folder' })}
        ${button({ label: 'Rescan', action: 'rescan', variant: 'ghost', iconName: 'refresh', disabled: pending })}
        ${button({
          label: 'Continue to edition',
          action: 'goto-editions',
          variant: 'primary',
          iconName: 'arrow-right',
          disabled: !canContinue,
        })}`,
    })}

    ${versionStrip(state)}

    <div class="columns split">
      <div class="stack">
        ${card({
          title: 'Minecraft folder',
          subtitle: scanLine,
          content: `
            <div class="path-box${state.selectedInstallation?.root ? '' : ' empty'}">
              ${esc(state.selectedInstallation?.root || 'No Minecraft folder selected yet')}
            </div>
            ${pending ? `<div style="margin-top:12px">${loadingInline('Scanning installations and version metadata…')}</div>` : ''}
            ${inspection && !inspection.valid && inspection.problems.length > 0
              ? `<div style="margin-top:12px">${inspection.problems
                .map((problem) => notice({ tone: 'error', body: esc(problem) }))
                .join('')}</div>`
              : ''}
            ${profileRows(state)}
            <div>${versionRows(state)}</div>`,
        })}
      </div>

      <div class="stack">
        ${card({
          title: 'Effective game directory',
          subtitle: 'Mods, shaders and packs are written here — nothing else is touched',
          content: `
            ${
              state.gameDir
                ? `<div class="path-box">${esc(state.gameDir)}</div>`
                : emptyState({ title: 'Nothing selected yet', body: 'Pick a folder or a launcher profile to continue.', iconName: 'map-pin' })
            }
            ${
              state.requiresGameDirConfirmation
                ? `<label class="notice notice-warn" style="margin-top:12px;cursor:pointer">
                    <input class="check" type="checkbox" data-action="confirm-game-dir" ${state.confirmGameDir ? 'checked' : ''} />
                    <span><strong>Please confirm this folder.</strong> The launcher did not give a separate game directory, so OneClickMC would install into the folder above. Untick to choose another folder instead.</span>
                  </label>`
                : ''
            }
            <div class="row" style="margin-top:12px">
              ${button({
                label: 'Open folder',
                action: 'open-path',
                attrs: state.gameDir ? `data-path="${esc(state.gameDir)}"` : 'disabled',
                variant: 'ghost',
                size: 'sm',
                iconName: 'folder',
              })}
              ${button({ label: 'Choose another folder', action: 'browse-directory', variant: 'ghost', size: 'sm', iconName: 'scan' })}
            </div>`,
        })}

        ${loaderLine(state)}

        ${inspection?.warnings?.length
          ? card({
            title: 'Notes from this folder',
            content: inspection.warnings.map((warning) => notice({ tone: 'warn', body: esc(warning) })).join(''),
          })
          : ''}

        <p class="small faint">${canContinue
          ? 'Your selected version and game directory are used for every compatibility check.'
          : 'Select a valid folder and a verified Minecraft version to continue.'}</p>
      </div>
    </div>
  </div>`;
}
