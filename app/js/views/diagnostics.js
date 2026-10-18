import { esc, dateTime, relativeAge, shortPath } from '../format.js';
import { badge, button, card, emptyState, loadingInline, notice, pageHead, summaryRow } from '../parts.js';

function statusTone(status) {
  if (status === 'success') return ['ok', 'check-circle'];
  if (status === 'rolled_back' || status === 'cancelled') return ['warn', 'rotate'];
  if (status === 'installing' || status === 'interrupted') return ['warn', 'alert'];
  return ['error', 'x-circle'];
}

function historyList(history, busy) {
  if (!history || history.length === 0) {
    return emptyState({ title: 'No installation recorded yet', body: 'Completed and cancelled runs appear here.', iconName: 'list' });
  }
  return `<div class="list">${history
    .map((entry) => {
      const [tone, iconName] = statusTone(entry.status);
      return `<div class="list-row">
        <span class="list-icon">${esc((entry.minecraftVersion || '--').slice(0, 2))}</span>
        <span class="list-main">
          <span class="list-title">${esc(entry.edition || 'profile')} · Minecraft ${esc(entry.minecraftVersion || '—')}
            ${badge(entry.status, tone, iconName)}</span>
          <span class="list-sub">${esc(dateTime(entry.startedAt))} · ${entry.installedCount} installed${
            entry.failedCount ? ` · ${entry.failedCount} failed` : ''
          }</span>
          <span class="list-path">${esc(shortPath(entry.gameDir || '', 70))}</span>
        </span>
        <span class="list-side">${
          entry.canRollback
            ? button({ label: 'Roll back', action: 'rollback-install', attrs: `data-installation="${esc(entry.id)}"`, variant: 'danger', size: 'sm', iconName: 'rotate', disabled: busy })
            : ''
        }</span>
      </div>`;
    })
    .join('')}</div>`;
}

export function renderDiagnostics(state) {
  const diagnostics = state.diagnostics || {};
  const info = state.appInfo || {};

  const head = pageHead({
    title: 'Diagnostics',
    subtitle: 'System information, bundled assets, loader availability and recovery. Safe to share — secrets are never logged.',
    actions: `${button({ label: 'Refresh', action: 'load-diagnostics', variant: 'ghost', size: 'sm', iconName: 'refresh', disabled: Boolean(diagnostics.loading) })}
      ${button({ label: 'Copy report', action: 'copy-diagnostics', variant: 'ghost', size: 'sm', iconName: 'copy' })}`,
  });

  if (diagnostics.loading && !diagnostics.loaded) {
    return `<div class="screen" data-screen="diagnostics">${head}${card({ content: loadingInline('Collecting diagnostics…') })}</div>`;
  }

  const java = diagnostics.java || [];
  const cache = diagnostics.cache || [];
  const history = diagnostics.history || [];
  const assets = Object.entries(info.assets || {});

  return `<div class="screen" data-screen="diagnostics">
    ${head}
    ${diagnostics.error ? notice({ tone: 'error', body: esc(diagnostics.error) }) : ''}

    <div class="columns split">
      <div class="stack">
        ${card({
          title: 'Application',
          content: `<table class="table"><tbody>
            ${[
              ['Version', info.version],
              ['Build', info.packaged ? 'Packaged' : 'Development'],
              ['Electron / Chromium', `${info.electron || '—'} / ${info.chrome || '—'}`],
              ['Node', info.node],
              ['Platform', `${info.platform || ''} ${info.arch || ''}`],
              ['Modrinth API', info.apiBase],
            ]
              .map(([label, value]) => `<tr><th>${esc(label)}</th><td class="mono">${esc(value || '—')}</td></tr>`)
              .join('')}
          </tbody></table>`,
        })}

        ${card({
          title: 'Bundled assets',
          subtitle: 'Confirmed inside the packaged application',
          content: `<div class="list">${assets
            .map(
              ([key, asset]) => `<div class="list-row">
                <span class="list-icon">${esc(asset.filename.slice(0, 2).toUpperCase())}</span>
                <span class="list-main">
                  <span class="list-title">${esc(asset.filename)}</span>
                  <span class="list-sub">${esc(key)}</span>
                </span>
                <span class="list-side">${badge(asset.present ? 'Present' : 'Missing', asset.present ? 'ok' : 'error', asset.present ? 'check-circle' : 'x-circle')}</span>
              </div>`,
            )
            .join('')}</div>`,
        })}

        ${card({
          title: 'Java runtimes',
          subtitle: 'Detected locally — used by Minecraft, not by OneClickMC',
          actions: button({ label: 'Re-detect', action: 'load-java', variant: 'ghost', size: 'sm', iconName: 'refresh' }),
          content: java.length
            ? `<table class="table"><tbody>${java
              .map(
                (runtime) => `<tr><th>Java ${esc(runtime.major ?? '?')}</th>
                  <td><span class="mono">${esc(runtime.path)}</span>
                  <div class="small faint">${esc(runtime.version || 'version unknown')} · ${esc(runtime.vendor || 'vendor unknown')}</div></td></tr>`,
              )
              .join('')}</tbody></table>`
            : emptyState({
              title: 'No Java runtime found',
              body: 'Nothing was found in JAVA_HOME, the PATH or the Minecraft runtime folders. Your launcher may still provide its own.',
              iconName: 'cpu',
            }),
        })}

        ${card({
          title: 'Installation history',
          content: historyList(history, state.actionBusy),
        })}
      </div>

      <div class="stack">
        ${card({
          title: 'Compatibility cache',
          content: `<div class="list">${cache
            .map(
              (entry) => `<div class="list-row">
                <span class="list-main">
                  <span class="list-title">Minecraft ${esc(entry.version)}</span>
                  <span class="list-sub">${entry.available ? `Checked ${esc(relativeAge(entry.ageMs))}${entry.stale ? ' · stale' : ''}` : 'Not cached'}</span>
                </span>
                <span class="list-side">${badge(entry.available ? 'Cached' : 'Empty', entry.available ? 'ok' : 'neutral')}</span>
              </div>`,
            )
            .join('')}</div>
          <p class="small faint" style="margin-top:12px">Cache directory: <span class="mono">${esc(diagnostics.cacheInfo?.directory || state.cacheInfo?.directory || '—')}</span></p>
          <div class="row" style="margin-top:12px">
            ${button({ label: 'Verify connection now', action: 'refresh-version', attrs: `data-version="${esc(state.mcVersion || '')}"`, variant: 'secondary', size: 'sm', iconName: 'globe' })}
          </div>`,
        })}

        ${card({
          title: 'Recent log lines',
          actions: button({ label: 'Open logs folder', action: 'open-logs', variant: 'ghost', size: 'sm', iconName: 'logs' }),
          content: `<pre class="code">${esc((diagnostics.logs || []).join('\n') || 'No log lines yet.')}</pre>`,
        })}

        ${card({
          title: 'Storage',
          content: `<div class="summary">
            ${summaryRow('App data', shortPath(info.userDataDir || '', 40), { mono: true })}
            ${summaryRow('Backups', 'one folder per installation')}
            ${state.preview?.plan ? summaryRow('Current plan', `${state.preview.plan.items.length} files · ${(state.preview.plan.totalSize / 1048576).toFixed(1)} MB`) : ''}
          </div>
          <div class="row" style="margin-top:12px">
            ${button({ label: 'Open app data', action: 'open-path', attrs: `data-path="${esc(info.userDataDir || '')}"`, variant: 'ghost', size: 'sm', iconName: 'folder' })}
          </div>`,
        })}
      </div>
    </div>
  </div>`;
}
