import { esc, relativeAge, shortPath } from '../format.js';
import { badge, button, card, notice, pageHead, summaryRow } from '../parts.js';

function toggleRow({ label, help, checked, setting }) {
  return `<div class="toggle-row">
    <div class="toggle-copy">
      <div class="toggle-name">${esc(label)}</div>
      <div class="toggle-help">${esc(help)}</div>
    </div>
    <label class="switch">
      <input type="checkbox" data-action="setting-toggle" data-setting="${esc(setting)}" ${checked ? 'checked' : ''} aria-label="${esc(label)}" />
      <span class="switch-track"></span>
    </label>
  </div>`;
}

export function renderSettings(state) {
  const settings = state.settings || {};
  const info = state.appInfo || {};
  const cache = state.compatStatus || [];

  return `<div class="screen" data-screen="settings">
    ${pageHead({
      title: 'Settings',
      subtitle: 'Appearance, logging and compatibility data. Changes are saved immediately.',
      actions: button({ label: 'Back home', action: 'nav', screen: 'home', variant: 'ghost', size: 'sm', iconName: 'arrow-left' }),
    })}

    <div class="columns split">
      <div class="stack">
        ${card({
          title: 'Appearance',
          content: `
            <div class="toggle-row">
              <div class="toggle-copy">
                <div class="toggle-name">Interface background</div>
                <div class="toggle-help">The project background stays visible by default. Switch to a solid colour if you prefer maximum contrast.</div>
              </div>
              <div class="segmented">
                <label class="${settings.backgroundMode === 'auto' ? 'selected' : ''}">
                  <input type="radio" name="backgroundMode" value="auto" data-action="setting-radio" data-setting="backgroundMode"
                    ${settings.backgroundMode === 'auto' ? 'checked' : ''} /> Background image
                </label>
                <label class="${settings.backgroundMode === 'solid' ? 'selected' : ''}">
                  <input type="radio" name="backgroundMode" value="solid" data-action="setting-radio" data-setting="backgroundMode"
                    ${settings.backgroundMode === 'solid' ? 'checked' : ''} /> Solid colour
                </label>
              </div>
            </div>
            ${toggleRow({
              label: 'Reduce motion',
              help: 'Disable the background drift, screen transitions and progress animation.',
              checked: Boolean(settings.reduceMotion),
              setting: 'reduceMotion',
            })}`,
        })}

        ${card({
          title: 'Logging',
          content: `<div class="toggle-row">
            <div class="toggle-copy">
              <div class="toggle-name">Log level</div>
              <div class="toggle-help">Debug logging helps when reporting a problem. Credentials and secrets are never written to logs.</div>
            </div>
            <select class="select" data-action="setting-select" data-setting="logLevel" aria-label="Log level">
              ${['debug', 'info', 'warn', 'error']
                .map((level) => `<option value="${level}" ${settings.logLevel === level ? 'selected' : ''}>${level.toUpperCase()}</option>`)
                .join('')}
            </select>
          </div>
          <div class="row" style="margin-top:14px">
            ${button({ label: 'Open logs folder', action: 'open-logs', variant: 'ghost', size: 'sm', iconName: 'logs' })}
            ${button({ label: 'Copy diagnostics report', action: 'copy-diagnostics', variant: 'ghost', size: 'sm', iconName: 'copy' })}
          </div>`,
        })}

        ${card({
          title: 'Compatibility data',
          subtitle: 'Resolved from the official Modrinth API and cached for six hours',
          content: `<div class="list">
            ${cache
              .map(
                (entry) => `<div class="list-row">
                  <span class="list-icon">${esc(entry.version.slice(0, 2))}</span>
                  <span class="list-main">
                    <span class="list-title">Minecraft ${esc(entry.version)}</span>
                    <span class="list-sub">${
                      entry.available ? `Checked ${esc(relativeAge(entry.ageMs))}${entry.stale ? ' · stale, refresh recommended' : ''}` : 'Not cached yet'
                    }</span>
                  </span>
                  <span class="list-side">
                    ${badge(entry.available ? 'Cached' : 'Empty', entry.available ? 'ok' : 'neutral', entry.available ? 'check' : 'info')}
                    ${button({ label: 'Refresh', action: 'refresh-version', attrs: `data-version="${esc(entry.version)}"`, variant: 'ghost', size: 'sm', iconName: 'refresh' })}
                  </span>
                </div>`,
              )
              .join('')}
          </div>
          <p class="small faint" style="margin-top:12px">Cache folder: <span class="mono">${esc(state.cacheInfo?.directory || 'not available')}</span></p>`,
        })}
      </div>

      <div class="stack">
        ${card({
          title: 'About',
          content: `<div class="summary">
            ${summaryRow('Application', `OneClickMC ${info.version || ''}`)}
            ${summaryRow('Build', info.packaged ? 'Packaged' : 'Development')}
            ${summaryRow('Electron', info.electron || '—')}
            ${summaryRow('Chromium', info.chrome || '—')}
            ${summaryRow('Targets', (info.targets || []).join(' · '))}
            ${summaryRow('Catalog', info.catalog?.catalogVersion || '—')}
          </div>
          <div class="row" style="margin-top:14px">
            ${button({ label: 'Project website', action: 'open-external', attrs: 'data-url="https://oneclickmc.vercel.app"', variant: 'ghost', size: 'sm', iconName: 'globe' })}
            ${button({ label: 'Repository', action: 'open-external', attrs: 'data-url="https://github.com/Alshahriar-07/OneClickMC"', variant: 'ghost', size: 'sm', iconName: 'external' })}
          </div>`,
        })}

        ${card({
          title: 'Data and recovery',
          content: `<div class="summary">
            ${summaryRow('App data', shortPath(info.userDataDir || '', 44), { mono: true })}
            ${summaryRow('Log file', shortPath(info.logPath || '', 44), { mono: true })}
          </div>
          <p class="small faint" style="margin-top:12px">Backups, installation journals and the compatibility cache live in the app data folder. Removing OneClickMC never touches your Minecraft folder.</p>
          <div class="row" style="margin-top:14px">
            ${button({ label: 'Open app data', action: 'open-path', attrs: `data-path="${esc(info.userDataDir || '')}"`, variant: 'ghost', size: 'sm', iconName: 'folder' })}
            ${button({ label: 'Reset settings', action: 'reset-settings', variant: 'danger', size: 'sm', iconName: 'trash' })}
          </div>`,
        })}

        ${card({
          title: 'Safety reminders',
          content: `${notice({ tone: 'ok', body: 'Worlds, saves and screenshots are never deleted or modified.' })}
            ${notice({ tone: 'ok', body: 'Existing files are backed up before they are replaced.' })}
            ${notice({ tone: 'ok', body: 'Downloaded files are never executed as scripts.' })}
            ${notice({ tone: 'ok', body: 'Unverified components are never installed automatically.' })}`,
        })}
      </div>
    </div>
  </div>`;
}
