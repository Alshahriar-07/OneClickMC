import { icon } from './icons.js';
import { esc } from './format.js';

export function button({
  label,
  action = null,
  screen = null,
  variant = 'ghost',
  iconName = null,
  disabled = false,
  size = '',
  block = false,
  id = null,
  attrs = '',
  ariaLabel = null,
}) {
  const classes = ['btn', `btn-${variant}`];
  if (size) classes.push(`btn-${size}`);
  if (block) classes.push('btn-block');
  const attributes = [
    'type="button"',
    `class="${classes.join(' ')}"`,
    action ? `data-action="${esc(action)}"` : '',
    screen ? `data-screen="${esc(screen)}"` : '',
    id ? `id="${esc(id)}"` : '',
    disabled ? 'disabled aria-disabled="true"' : '',
    ariaLabel ? `aria-label="${esc(ariaLabel)}"` : '',
    attrs,
  ]
    .filter(Boolean)
    .join(' ');
  return `<button ${attributes}>${iconName ? icon(iconName, 'icon-sm') : ''}<span>${esc(label)}</span></button>`;
}

export function badge(label, tone = 'neutral', iconName = null) {
  const toneClass = tone === 'neutral' ? '' : ` badge-${tone}`;
  return `<span class="badge${toneClass}">${iconName ? icon(iconName, 'icon-sm') : ''}<span>${esc(label)}</span></span>`;
}

export function chip(label, iconName = null) {
  return `<span class="chip">${iconName ? icon(iconName, 'icon-sm') : ''}${esc(label)}</span>`;
}

export function notice({ tone = 'info', title = null, body, iconName = null }) {
  const iconMap = { info: 'info', ok: 'check-circle', warn: 'alert', error: 'x-circle' };
  const toneClass = tone === 'info' ? '' : ` notice-${tone}`;
  return `<div class="notice${toneClass}">${icon(iconName || iconMap[tone] || 'info')}<div>${
    title ? `<strong>${esc(title)}</strong> ` : ''
  }${body}</div></div>`;
}

export function card({ title = null, subtitle = null, content, actions = '', id = null, className = '' }) {
  return `<section class="card ${className}" ${id ? `id="${esc(id)}"` : ''}>
    ${
      title || actions
        ? `<div class="card-head"><div>${
          title ? `<h2 class="card-title">${esc(title)}</h2>` : ''
        }${subtitle ? `<p class="card-sub">${esc(subtitle)}</p>` : ''}</div>${
          actions ? `<div class="card-actions">${actions}</div>` : ''
        }</div>`
        : ''
    }
    ${content}
  </section>`;
}

export function pageHead({ title, subtitle = null, actions = '' }) {
  return `<div class="page-head">
    <div>
      <h1 class="page-title">${esc(title)}</h1>
      ${subtitle ? `<p class="page-sub">${esc(subtitle)}</p>` : ''}
    </div>
    ${actions ? `<div class="card-actions">${actions}</div>` : ''}
  </div>`;
}

export const STEPS = ['Installation', 'Edition', 'Review & install'];

export function stepBar(activeIndex) {
  return `<nav class="stepbar" aria-label="Installation steps">${STEPS.map((label, index) => {
    const state = index === activeIndex ? ' active' : index < activeIndex ? ' done' : '';
    const marker = index < activeIndex ? icon('check', 'icon-sm') : index + 1;
    return `<span class="stepbar-item${state}"${index === activeIndex ? ' aria-current="step"' : ''}>
      <span class="stepbar-num">${marker}</span><span>${esc(label)}</span>
    </span>`;
  }).join('')}</nav>`;
}

export function summaryRow(label, value, { mono = false } = {}) {
  return `<div class="summary-row"><span class="summary-label">${esc(label)}</span>
    <span class="summary-value${mono ? ' mono' : ''}">${esc(value ?? '—')}</span></div>`;
}

export function emptyState({ title, body = null, iconName = 'search', action = '' }) {
  return `<div class="empty">${icon(iconName)}<div><strong>${esc(title)}</strong>${
    body ? `<div class="small muted" style="margin-top:4px">${esc(body)}</div>` : ''
  }</div>${action ? `<div class="row">${action}</div>` : ''}</div>`;
}

export function loadingInline(message) {
  return `<div class="loading-inline"><span class="spinner" aria-hidden="true"></span><span>${esc(message)}</span></div>`;
}

export function sectionTitle(text) {
  return `<div class="section-title">${esc(text)}</div>`;
}

export function disclosure({ id, title, hint = null, content, open = false }) {
  return `<details class="disclosure" id="${esc(id)}"${open ? ' open' : ''}>
    <summary>${icon('sliders', 'icon-sm')}<span class="spacer">${esc(title)}</span>${
      hint ? `<span class="small faint">${esc(hint)}</span>` : ''
    }${icon('chevron-down', 'icon-sm chevron')}</summary>
    <div class="disclosure-body">${content}</div>
  </details>`;
}

export function progressBar(percent, { active = false, id = 'progress-fill' } = {}) {
  return `<div class="bar${active ? ' active' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(
    percent,
  )}"><div class="bar-fill" id="${esc(id)}" style="width:${percent}%"></div></div>`;
}
