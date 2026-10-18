import { icon } from '../icons.js';
import { esc, shortPath } from '../format.js';
import { button, card, chip, notice } from '../parts.js';

function detectionSummary(state) {
  if (state.detectionLoading) {
    return `<div class="loading-inline"><span class="spinner" aria-hidden="true"></span><span>Scanning your Minecraft folders…</span></div>`;
  }
  if (state.detectionError) {
    return notice({ tone: 'warn', title: 'Automatic scan failed.', body: esc(state.detectionError) });
  }
  const installations = state.installations || [];
  const first = installations[0];
  if (!first) {
    return notice({
      tone: 'info',
      title: 'No Minecraft folder found automatically.',
      body: 'You can pick your .minecraft folder manually on the next screen.',
    });
  }
  return `<div class="list-row selected">
    <span class="list-icon">${icon('folder', 'icon-sm')}</span>
    <span class="list-main">
      <span class="list-title">${esc(first.name)} ${first.suggestedVersion ? `<span class="badge badge-info">${esc(first.suggestedVersion)}</span>` : ''}</span>
      <span class="list-sub">${esc(first.detail || 'Minecraft installation')}${
        installations.length > 1 ? ` · +${installations.length - 1} more found` : ''
      }</span>
      <span class="list-path">${esc(shortPath(first.gameDir || first.root, 72))}</span>
    </span>
    <span class="list-side">${icon('check-circle', 'icon-sm')}</span>
  </div>`;
}

export function renderHome(state) {
  const editions = state.appInfo?.catalog?.editions || {};
  const editionNames = ['potato', 'balanced', 'ultimate']
    .map((id) => editions[id]?.name)
    .filter(Boolean)
    .join(' · ');

  return `<div class="screen" data-screen="home">
    <section class="hero">
      <div>
        <img class="hero-wordmark" src="/assets/text.png" alt="OneClickMC" />
        <h1 class="hero-title">A verified Minecraft profile in <span class="accent">three steps</span>.</h1>
        <p class="hero-lede">
          OneClickMC scans your real <span class="mono">.minecraft</span> folders, checks every file against the
          exact Minecraft version and Fabric, then installs with backups and honest progress.
        </p>
        <div class="hero-actions">
          ${button({ label: 'Get started', action: 'start-setup', variant: 'primary', size: 'lg', iconName: 'scan' })}
          ${button({ label: 'Open settings', action: 'nav', screen: 'settings', variant: 'ghost', size: 'lg', iconName: 'settings' })}
        </div>
        <div class="hero-chips">
          ${chip('Minecraft 1.21.11 · 26.1 · 26.2', 'grid')}
          ${chip('Fabric', 'package')}
          ${chip('Backups before changes', 'shield')}
          ${chip('No FPS promises', 'info')}
        </div>
        ${editionNames ? `<p class="small faint" style="margin-top:14px">Presets: ${esc(editionNames)}</p>` : ''}
      </div>

      <div class="stack">
        ${card({
          title: 'Detected installation',
          className: 'dense',
          actions: button({ label: 'Rescan', action: 'rescan', variant: 'ghost', size: 'sm', iconName: 'refresh' }),
          content: detectionSummary(state),
        })}
        <div class="step-cards">
          <div class="step-card">${icon('scan', 'icon-sm')}<div><h3>1 · Find your installation</h3>
            <p>Scans <span class="mono">.minecraft/versions</span> and launcher profiles, and shows the real folder names it finds.</p></div></div>
          <div class="step-card">${icon('sliders', 'icon-sm')}<div><h3>2 · Choose a preset</h3>
            <p>Potato, Medium or I Paid for My Whole PC — components stay verified and customisable.</p></div></div>
          <div class="step-card">${icon('download', 'icon-sm')}<div><h3>3 · Review and install</h3>
            <p>One button downloads, verifies, backs up and installs into the correct game directory.</p></div></div>
        </div>
      </div>
    </section>

    <div class="card plain">
      <div class="row between">
        <div>
          <div class="card-title">Ready when you are</div>
          <p class="card-sub">Nothing is written to your Minecraft folder until you press <strong>Install Profile</strong> on the review step.</p>
        </div>
        <div class="card-actions">
          ${button({ label: 'Install a profile', action: 'start-setup', variant: 'primary', iconName: 'arrow-right' })}
        </div>
      </div>
    </div>
  </div>`;
}
