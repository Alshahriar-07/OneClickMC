import { icon } from '../icons.js';
import {
  bytes,
  categoryLabel,
  clampPercent,
  editionTitle,
  esc,
  folderLabel,
  licenseLabel,
  relativeAge,
  sanitizeExternalUrl,
  shortPath,
} from '../format.js';
import {
  badge,
  button,
  card,
  chip,
  disclosure,
  emptyState,
  loadingInline,
  notice,
  pageHead,
  progressBar,
  stepBar,
  summaryRow,
} from '../parts.js';

const SELECTABLE = new Set(['VERIFIED', 'OPTIONAL_VERIFIED']);

const PHASE_LABELS = {
  validate: 'Validating',
  resolve: 'Checking compatibility',
  plan: 'Planning files',
  download: 'Downloading components',
  verify: 'Verifying files',
  backup: 'Backing up',
  install: 'Installing profile',
  check: 'Final check',
  rollback: 'Rolling back',
};

const PHASE_ORDER = ['validate', 'resolve', 'plan', 'download', 'verify', 'backup', 'install', 'check'];

function statusBadge(item) {
  if (item.status === 'VERIFIED') return badge(item.selected ? 'Verified' : 'Available', item.selected ? 'ok' : 'info', 'check-circle');
  if (item.status === 'OPTIONAL_VERIFIED') return badge('Optional', 'neutral', 'circle');
  if (item.status === 'UNVERIFIED') return badge('Manual only', 'warn', 'alert');
  if (item.status === 'UNAVAILABLE') return badge('Unavailable', 'neutral', 'x-circle');
  if (item.status === 'INCOMPATIBLE') return badge('Incompatible', 'error', 'x-circle');
  if (item.status === 'BLOCKED_DEPENDENCY') return badge('Dependency blocked', 'error', 'alert');
  return badge(item.status || 'Unknown', 'neutral');
}

function componentRow(item) {
  const selectable = SELECTABLE.has(item.status) && !item.locked;
  const checked = item.selected && SELECTABLE.has(item.status);
  const url = sanitizeExternalUrl(item.projectUrl);
  const meta = [
    item.file?.filename ? item.file.filename : null,
    item.file?.size ? bytes(item.file.size) : null,
    item.version?.number ? `v${item.version.number}` : null,
    item.file?.host || null,
    item.license ? licenseLabel(item.license) : null,
  ].filter(Boolean);

  return `<div class="component${checked ? ' selected' : ''}${selectable || item.locked ? '' : ' disabled'}">
    <input class="check" type="checkbox" data-action="toggle-component" data-id="${esc(item.id)}"
      ${checked ? 'checked' : ''} ${selectable ? '' : 'disabled'} aria-label="${esc(`Include ${item.name}`)}" />
    <div class="component-main">
      <div class="component-title">
        <span>${esc(item.name)}</span>
        ${item.locked ? badge('Required', 'info', 'lock') : ''}
        ${item.role === 'dependency' ? badge('Auto dependency', 'neutral', 'package') : ''}
        ${item.shaderActive ? badge('Active shader', 'ok', 'sparkles') : ''}
        ${!selectable && !item.locked ? badge(categoryLabel(item.category), 'neutral') : ''}
      </div>
      ${item.summary ? `<p class="component-sub">${esc(item.summary)}</p>` : ''}
      ${meta.length ? `<div class="component-meta">${meta
        .map((value) => `<span>${icon('dot', 'icon-sm')}${esc(value)}</span>`)
        .join('')}</div>` : ''}
      ${item.reason ? `<p class="component-sub" style="margin-top:6px">${esc(item.reason)}</p>` : ''}
    </div>
    <div class="component-side">
      ${statusBadge(item)}
      ${url
        ? `<button type="button" class="link" data-action="open-external" data-url="${esc(url)}">${icon('external', 'icon-sm')}Official page</button>`
        : ''}
    </div>
  </div>`;
}

function componentGroups(selection) {
  const items = selection.components || [];
  const required = items.filter((item) => item.required && item.category === 'mod' && item.role !== 'dependency');
  const optional = items.filter((item) => !item.required && item.category === 'mod' && item.role !== 'dependency');
  const shaders = items.filter((item) => item.category === 'shader');
  const basePacks = items.filter((item) => item.category === 'resourcepack' && item.packRole === 'base');
  const addonPacks = items.filter((item) => item.category === 'resourcepack' && item.packRole !== 'base');
  const dependencies = items.filter((item) => item.role === 'dependency');

  const shaderNone = `<div class="component${selection.shaderId ? '' : ' selected'}">
    <input class="check" type="checkbox" data-action="clear-shaders" ${selection.shaderId ? '' : 'checked'} aria-label="Use no shader" />
    <div class="component-main">
      <div class="component-title"><span>No shader</span>${badge('Default for Potato', 'neutral')}</div>
      <p class="component-sub">Shaders stay off. Only one shader can be active at a time.</p>
    </div>
  </div>`;

  const basePackClear = basePacks.length
    ? `<div class="row end" style="margin-bottom:8px"><button type="button" class="link" data-action="clear-base-packs">${icon('x', 'icon-sm')}Clear base texture pack</button></div>`
    : '';

  return [
    { title: 'Required mods', hint: 'always installed', rows: required.map(componentRow).join('') },
    { title: 'Optional mods', hint: 'your choice', rows: optional.map(componentRow).join('') },
    { title: 'Shader', hint: 'one active shader', rows: shaderNone + shaders.map(componentRow).join('') },
    {
      title: 'Resource packs',
      hint: 'one base pack, add-ons stack',
      rows: basePackClear + [...basePacks, ...addonPacks].map(componentRow).join(''),
      hidden: basePacks.length + addonPacks.length === 0,
    },
    { title: 'Automatic dependencies', hint: 'required by your selection', rows: dependencies.map(componentRow).join(''), hidden: dependencies.length === 0 },
  ].filter((group) => !group.hidden && group.rows);
}

function customize(selection, state) {
  const groups = componentGroups(selection);
  const rejected = selection.rejectedIds || [];
  const blockerNotes = (selection.blockers || [])
    .map((blocker) => notice({ tone: 'error', title: `${blocker.name} is blocked.`, body: esc(blocker.reason) }))
    .join('');
  const warnings = (selection.warnings || []).slice(0, 6)
    .map((warning) => notice({ tone: 'warn', body: esc(warning) }))
    .join('');

  return disclosure({
    id: 'customize-components',
    open: state.customizeOpen,
    title: 'Customize components',
    hint: `${selection.counts?.selected ?? 0} selected · ${bytes(selection.totalSize || 0)}`,
    content: `
      ${blockerNotes}
      ${warnings}
      ${groups
        .map(
          (group) => `<div style="margin-top:14px">
            <div class="row between" style="margin-bottom:8px">
              <span class="section-title" style="margin:0">${esc(group.title)}</span>
              <span class="small faint">${esc(group.hint)}</span>
            </div>
            ${group.rows}
          </div>`,
        )
        .join('')}
      ${rejected.length > 0 ? `<p class="small faint" style="margin-top:12px">${rejected.length} requested component(s) had no verified file for this version and were left out.</p>` : ''}
      <div class="row" style="margin-top:14px">
        ${button({ label: 'Refresh compatibility', action: 'refresh-components', variant: 'ghost', size: 'sm', iconName: 'refresh', disabled: state.recomputing })}
        <span class="small faint">Statuses come from the official Modrinth API for this exact version and loader.</span>
      </div>`,
  });
}

function reviewLeft(state) {
  const preview = state.preview;
  const selection = state.selectionView?.selection;
  const installation = state.selectedInstallation;

  if (state.previewLoading && !preview) {
    return card({ content: loadingInline('Checking destinations, conflicts and free space…') });
  }
  if (state.previewError) {
    return card({
      content: `${notice({ tone: 'error', title: 'The plan could not be built.', body: esc(state.previewError) })}
        <div class="row" style="margin-top:12px">
          ${button({ label: 'Try again', action: 'goto-install', variant: 'primary', size: 'sm', iconName: 'refresh' })}
          ${button({ label: 'Back to edition', action: 'goto-editions', variant: 'ghost', size: 'sm', iconName: 'arrow-left' })}
        </div>`,
    });
  }
  const plan = preview?.plan;
  if (!plan) return card({ content: emptyState({ title: 'No plan yet', body: 'Choose an edition to build the install plan.' }) });

  const conflicts = plan.conflicts || [];
  return `${card({
    title: 'Profile summary',
    subtitle: 'Exactly what will be written, and where',
    content: `<div class="summary">
      ${summaryRow('Installation', installation?.name || 'Minecraft folder')}
      ${summaryRow('Minecraft root', shortPath(installation?.root || '', 60), { mono: true })}
      ${summaryRow('Effective game directory', shortPath(plan.gameDir, 60), { mono: true })}
      ${summaryRow('Minecraft version', plan.minecraftVersion)}
      ${summaryRow('Loader', (plan.loader || 'fabric').toUpperCase())}
      ${summaryRow('Edition', editionTitle(plan.edition))}
      ${summaryRow('Files to install', `${plan.items.length}`)}
      ${summaryRow('Download size', bytes(plan.totalSize))}
      ${summaryRow('Free space on target', plan.freeBytes === null || plan.freeBytes === undefined ? 'unknown' : bytes(plan.freeBytes))}
      ${summaryRow('Existing files replaced', conflicts.length === 0 ? 'none — all files are new' : `${conflicts.length} (backed up first)`)}
    </div>
    <div class="row" style="margin-top:14px">
      ${button({ label: 'Open game folder', action: 'open-path', attrs: `data-path="${esc(plan.gameDir)}"`, variant: 'ghost', size: 'sm', iconName: 'folder' })}
      ${state.cacheInfo ? chip(`Compatibility checked ${relativeAge(state.cacheInfo.ageMs)}`, 'clock') : ''}
    </div>`,
  })}
  ${selection ? card({ title: 'Components', content: customize(selection, state) }) : ''}
  ${
    (selection?.warnings || []).length > 0
      ? card({ title: 'Warnings', content: (selection.warnings || []).map((warning) => notice({ tone: 'warn', body: esc(warning) })).join('') })
      : ''
  }`;
}

function reviewAction(state) {
  const plan = state.preview?.plan;
  const blockers = state.selectionView?.selection?.blockers || [];
  if (!plan) return card({ content: emptyState({ title: 'Nothing to install yet', iconName: 'download' }) });

  const conflicts = plan.conflicts || [];
  const canInstall = blockers.length === 0 && (conflicts.length === 0 || state.confirmOverwrite);

  return card({
    title: 'Review & install',
    className: 'dense',
    content: `
      ${blockers.length > 0
        ? blockers.map((blocker) => notice({ tone: 'error', title: `${blocker.name} is blocked`, body: esc(blocker.reason) })).join('')
        : notice({ tone: 'ok', title: 'All selected files are verified.', body: 'Hashes, dependencies and destinations were validated for this version.' })}
      ${conflicts.length > 0
        ? `<label class="notice notice-warn" style="margin-top:12px;cursor:pointer">
            <input class="check" type="checkbox" data-action="toggle-overwrite-confirm" ${state.confirmOverwrite ? 'checked' : ''} />
            <span>I understand that ${conflicts.length} existing file(s) will be backed up and replaced.</span>
          </label>`
        : ''}
      <div class="row" style="margin-top:16px">
        ${button({
          label: 'Install Profile',
          action: 'start-install',
          variant: 'primary',
          size: 'lg',
          block: true,
          iconName: 'download',
          disabled: !canInstall,
        })}
      </div>
      <p class="small faint" style="margin-top:10px">Downloads, checksum verification, backups, installation and a final re-check all happen after this click. You can cancel at any time.</p>
      <div class="row" style="margin-top:12px">
        ${button({ label: 'Back to edition', action: 'goto-editions', variant: 'ghost', size: 'sm', iconName: 'arrow-left' })}
      </div>`,
  });
}

function progressPanel(state) {
  const progress = state.progress || {};
  const overall = clampPercent(progress.overall || 0);
  const phases = state.phases || {};
  const detail = [progress.detail, progress.current && progress.total ? `${progress.current} / ${progress.total}` : null,
    progress.bytesReceived && progress.bytesTotal ? `${bytes(progress.bytesReceived)} of ${bytes(progress.bytesTotal)}` : null]
    .filter(Boolean)
    .join(' · ');

  const phaseChips = PHASE_ORDER.map((phase) => {
    const status = phases[phase] || 'pending';
    return `<span class="phase ${status === 'done' ? 'done' : status === 'active' ? 'active' : status === 'failed' ? 'failed' : ''}">
      ${status === 'done' ? icon('check', 'icon-sm') : status === 'active' ? '<span class="spinner icon-sm" aria-hidden="true"></span>' : icon('circle', 'icon-sm')}
      <span>${esc(PHASE_LABELS[phase])}</span>
    </span>`;
  }).join('');

  return card({
    title: 'Installing profile',
    className: 'dense',
    content: `
      <div class="progress-head">
        <div>
          <div class="small faint">${esc(PHASE_LABELS[progress.phase] || 'Starting')}</div>
          <div class="progress-percent">${overall.toFixed(0)}%</div>
        </div>
        ${button({ label: 'Cancel', action: 'cancel-install', variant: 'danger', size: 'sm', iconName: 'x', disabled: !state.jobRunning })}
      </div>
      ${progressBar(overall, { active: state.jobRunning })}
      <div class="progress-meta"><span>${esc(detail || 'Preparing…')}</span></div>
      <div class="phase-list">${phaseChips}</div>
      ${disclosure({
        id: 'install-log',
        title: 'Live log',
        hint: `${(state.jobLogs || []).length} lines`,
        content: `<div class="log" style="margin:0">
          <div class="log-body" id="log-body">${
            (state.jobLogs || []).length === 0
              ? '<div class="log-line">Waiting for the first task…</div>'
              : (state.jobLogs || [])
                .map((entry) => `<div class="log-line level-${esc(entry.level || 'info')}">
                  <span class="log-time">${esc(entry.at ? new Date(entry.at).toLocaleTimeString() : '')}</span>
                  <span>${esc(entry.message)}</span></div>`)
                .join('')
          }</div>
        </div>`,
      })}
      <p class="small faint" style="margin-top:12px">Cancelling removes staged downloads and rolls back anything this run installed.</p>`,
  });
}

function resultPanel(state) {
  const result = state.result || {};
  const success = result.status === 'success';
  const cancelled = result.status === 'cancelled';
  const tone = success ? 'ok' : cancelled ? 'warn' : 'error';
  const installed = result.installed || [];
  const skipped = result.skipped || [];

  return card({
    title: success ? 'Installation complete' : cancelled ? 'Installation cancelled' : 'Installation failed',
    className: 'dense',
    content: `
      ${notice({
        tone,
        title: success
          ? `${installed.length} file(s) installed and verified.`
          : cancelled
            ? 'The run was cancelled.'
            : 'The run did not finish.',
        body: esc(result.message || ''),
      })}
      <div class="summary" style="margin-top:12px">
        ${summaryRow('Installed', `${installed.length} file(s)`)}
        ${summaryRow('Skipped', skipped.length ? `${skipped.length} component(s)` : 'none')}
        ${summaryRow('Rolled back', result.rolledBack ? 'yes' : 'not needed')}
        ${summaryRow('Game directory', shortPath(result.gameDir || state.gameDir || '', 52), { mono: true })}
      </div>
      ${installed.length
        ? `<div class="list" style="margin-top:12px">${installed
          .slice(0, 8)
          .map(
            (entry) => `<div class="list-row"><span class="list-icon">${icon('check', 'icon-sm')}</span>
              <span class="list-main"><span class="list-title">${esc(entry.name)}</span>
              <span class="list-sub">${esc(folderLabel(entry.category === 'mod' || entry.category === 'dependency' ? 'mods' : entry.category === 'shader' ? 'shaderpacks' : 'resourcepacks'))} · ${esc(entry.filename)}</span></span></div>`,
          )
          .join('')}${installed.length > 8 ? `<p class="small faint">+${installed.length - 8} more</p>` : ''}</div>`
        : ''}
      ${skipped.length
        ? `<div style="margin-top:12px">${skipped
          .map((entry) => notice({ tone: 'warn', body: `${esc(entry.name)} — ${esc(entry.reason || 'skipped')}` }))
          .join('')}</div>`
        : ''}
      <div class="row" style="margin-top:16px">
        ${button({ label: 'Open game folder', action: 'open-path', attrs: `data-path="${esc(result.gameDir || state.gameDir || '')}"`, variant: 'secondary', size: 'sm', iconName: 'folder' })}
        ${button({ label: 'Open logs', action: 'open-logs', variant: 'ghost', size: 'sm', iconName: 'logs' })}
        ${result.canRollback ? button({ label: 'Roll back', action: 'rollback-install', variant: 'danger', size: 'sm', iconName: 'rotate' }) : ''}
      </div>
      <div class="row" style="margin-top:12px">
        ${button({ label: 'Install another profile', action: 'start-setup', variant: 'ghost', size: 'sm', iconName: 'rocket' })}
        ${button({ label: 'Diagnostics', action: 'nav', screen: 'diagnostics', variant: 'ghost', size: 'sm', iconName: 'terminal' })}
        ${button({ label: 'Home', action: 'nav', screen: 'home', variant: 'ghost', size: 'sm', iconName: 'arrow-left' })}
      </div>
      <p class="small faint" style="margin-top:12px">OneClickMC does not launch the game or change launcher profiles. Start your Fabric profile from your launcher as usual.</p>`,
  });
}

export function renderInstall(state) {
  const phase = state.installPhase || 'review';
  const title = phase === 'running' ? 'Installing profile' : phase === 'done' ? 'Installation result' : 'Review & install';

  const loadError = state.selectionError;
  const needsPlan = phase === 'review' && !state.previewLoading && !state.previewError && !state.preview?.plan;

  if (needsPlan) {
    return `<div class="screen" data-screen="install">
      ${stepBar(2)}
      ${pageHead({
        title: 'Review & install',
        subtitle: 'Pick an edition first. The file list and verification results appear here before anything is written.',
        actions: button({ label: 'Back to edition', action: 'goto-editions', variant: 'ghost', size: 'sm', iconName: 'arrow-left' }),
      })}
      ${card({
        content: `${emptyState({ title: 'No profile selected yet', body: 'Choose Potato, Medium or I Paid for My Whole PC and OneClickMC will build a verified file list for this installation.', iconName: 'sliders' })}
          <div class="row" style="margin-top:14px">
            ${button({ label: 'Choose an edition', action: 'goto-editions', variant: 'primary', iconName: 'arrow-right' })}
            ${button({ label: 'Change installation', action: 'goto-setup', variant: 'ghost', iconName: 'folder' })}
          </div>`,
      })}
    </div>`;
  }

  return `<div class="screen" data-screen="install">
    ${stepBar(2)}
    ${pageHead({
      title,
      subtitle: phase === 'review'
        ? 'Confirm the installation, actual Minecraft version, edition and components. Nothing is written until you press Install Profile.'
        : phase === 'running'
          ? 'Real tasks only: downloads, verification, backups, installation and a final re-check.'
          : 'A truthful report of what was installed, skipped or rolled back.',
      actions: phase === 'review'
        ? button({ label: 'Back to edition', action: 'goto-editions', variant: 'ghost', size: 'sm', iconName: 'arrow-left' })
        : '',
    })}

    ${
      loadError
        ? `${notice({ tone: 'error', title: 'Compatibility could not be loaded.', body: esc(loadError) })}
           <div class="row" style="margin-top:12px">${button({ label: 'Try again', action: 'load-components', variant: 'primary', iconName: 'refresh' })}${button({ label: 'Diagnostics', action: 'nav', screen: 'diagnostics', variant: 'ghost', iconName: 'terminal' })}</div>`
        : ''
    }

    <div class="columns split">
      <div class="stack">
        ${
          phase === 'done'
            ? resultPanel(state)
            : phase === 'running'
              ? card({
                title: 'What is happening',
                content: `<div class="summary">
                  ${summaryRow('Edition', editionTitle(state.installPayload?.edition || state.edition))}
                  ${summaryRow('Minecraft version', state.installPayload?.minecraftVersion || state.mcVersion)}
                  ${summaryRow('Game directory', shortPath(state.gameDir || '', 56), { mono: true })}
                  ${summaryRow('Selected files', `${state.selectionView?.selection?.counts?.selected ?? 0}`)}
                </div>
                <p class="small faint" style="margin-top:12px">Keep the window open. If OneClickMC stops mid-install, the run is journalled and can be rolled back from Diagnostics.</p>`,
              })
              : reviewLeft(state)
        }
      </div>
      <div class="stack">
        ${
          phase === 'done'
            ? card({
              title: 'Next',
              content: `${notice({ tone: 'info', title: 'Start Minecraft with your Fabric profile.', body: 'Installed files are in the folders shown on the left.' })}
                <div class="row" style="margin-top:12px">${button({ label: 'Install another profile', action: 'start-setup', variant: 'primary', size: 'sm', iconName: 'rocket' })}</div>
                <div class="row" style="margin-top:10px">${button({ label: 'Open diagnostics', action: 'nav', screen: 'diagnostics', variant: 'ghost', size: 'sm', iconName: 'terminal' })}</div>`,
            })
            : phase === 'running'
              ? progressPanel(state)
              : reviewAction(state)
        }
      </div>
    </div>
  </div>`;
}
