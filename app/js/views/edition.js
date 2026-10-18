import { icon } from '../icons.js';
import { esc, shortPath } from '../format.js';
import { badge, button, card, pageHead, stepBar } from '../parts.js';

const FALLBACK = {
  potato: {
    name: 'Potato',
    tagline: 'For lower-end PCs',
    description: 'Performance comes first: optimization mods and lightweight visual touches.',
    bullets: ['Prioritises performance', 'Lightweight visual enhancements', 'No shader by default', 'Lower resource demand'],
    demand: 'Lower resource demand',
  },
  balanced: {
    name: 'Medium',
    tagline: 'Balanced performance and visual quality',
    description: 'The recommended default for typical PCs.',
    bullets: ['Balanced performance and quality', 'Recommended default', 'Moderate shaders where verified', 'Optional packs'],
    demand: 'Moderate resource demand',
    recommended: true,
  },
  ultimate: {
    name: 'I Paid for My Whole PC',
    tagline: 'Maximum visual quality',
    description: 'For powerful PCs that want the highest visual quality.',
    bullets: ['High-quality shader preset', 'High-resolution packs', 'Optional advanced features', 'Higher resource demand'],
    demand: 'Higher resource demand',
  },
};

export function renderEdition(state) {
  const editions = state.appInfo?.catalog?.editions || FALLBACK;
  const order = ['potato', 'balanced', 'ultimate'];

  const cards = order
    .map((id) => {
      const edition = { ...(FALLBACK[id] || {}), ...(editions[id] || {}) };
      const selected = state.edition === id;
      const bullets = edition.bullets || FALLBACK[id]?.bullets || [];
      return `<button type="button" class="choice${selected ? ' selected' : ''}" data-action="select-edition" data-edition="${esc(id)}" aria-pressed="${selected}">
        ${selected ? `<span class="choice-check">${icon('check-circle', 'icon-sm')}</span>` : ''}
        <span class="choice-title">${esc(edition.name || id)}</span>
        <span class="choice-tagline">${esc(edition.tagline || '')}</span>
        <span class="choice-desc">${esc(edition.description || '')}</span>
        <ul class="choice-list">
          ${bullets.map((bullet) => `<li>${icon('check', 'icon-sm')}<span>${esc(bullet)}</span></li>`).join('')}
        </ul>
        <span class="choice-foot">
          <span>${esc(edition.demand || '')}</span>
          ${edition.recommended ? badge('Recommended', 'info', 'sparkles') : selected ? badge('Selected', 'selected', 'check') : ''}
        </span>
      </button>`;
    })
    .join('');

  return `<div class="screen" data-screen="edition">
    ${stepBar(1)}
    ${pageHead({
      title: 'Choose an edition',
      subtitle:
        'Every file is verified against your exact Minecraft version and loader. You can customise the list on the next step.',
      actions: button({ label: 'Back to installation', action: 'goto-setup', variant: 'ghost', size: 'sm', iconName: 'arrow-left' }),
    })}

    <div class="row" style="margin-bottom:16px">
      ${badge(`Minecraft ${state.mcVersion || '—'}`, 'info', 'grid')}
      ${badge('Fabric', 'info', 'package')}
      ${state.gameDir ? badge(shortPath(state.gameDir, 48), 'neutral', 'map-pin') : ''}
    </div>

    <div class="choice-grid cols-3">${cards}</div>

    <p class="small faint" style="margin:12px 2px 0">
      Presets are component sets, not hardware requirements. OneClickMC does not benchmark your PC and never claims a fixed performance gain.
    </p>

    ${card({
      className: 'plain action-bar',
      content: `<div class="row between">
        <div>
          <div class="card-title">Selected: ${esc(editions[state.edition]?.name || 'None')}</div>
          <p class="card-sub">Review the verified file list, then install.</p>
        </div>
        <div class="card-actions">
          ${button({ label: 'Back', action: 'goto-setup', variant: 'ghost', iconName: 'arrow-left' })}
          ${button({
            label: 'Review & customise',
            action: 'goto-install',
            variant: 'primary',
            size: 'lg',
            iconName: 'arrow-right',
            disabled: !state.edition,
          })}
        </div>
      </div>`,
    })}
  </div>`;
}
