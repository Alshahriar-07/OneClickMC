const PATHS = {
  check:
    '<path d="M20 6 9 17l-5-5"/>',
  'check-circle':
    '<circle cx="12" cy="12" r="9"/><path d="m8.4 12.2 2.4 2.4 4.8-5.2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  'x-circle':
    '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  alert:
    '<path d="M12 3 2.6 20h18.8L12 3Z"/><path d="M12 9v4.5M12 17.2v.1"/>',
  info:
    '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.1"/>',
  download:
    '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/>',
  folder:
    '<path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>',
  'arrow-right': '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  'arrow-left': '<path d="M20 12H5"/><path d="m11 6-6 6 6 6"/>',
  shield:
    '<path d="M12 3 5 6v5c0 4.4 2.9 8.1 7 9.5 4.1-1.4 7-5.1 7-9.5V6l-7-3Z"/><path d="m9 12 2 2 4-4.5"/>',
  cpu:
    '<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9.5 2.8v3.2M14.5 2.8v3.2M9.5 18v3.2M14.5 18v3.2M2.8 9.5h3.2M2.8 14.5h3.2M18 9.5h3.2M18 14.5h3.2"/>',
  sparkles:
    '<path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z"/><path d="M19 3v3M20.5 4.5h-3M5 18v3M6.5 19.5h-3"/>',
  package:
    '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  refresh:
    '<path d="M20 11a8 8 0 0 0-14-4.6L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14 4.6L21 15"/><path d="M21 20v-5h-5"/>',
  logs:
    '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 2.1a7 7 0 0 0-1.7 1l-2.3-1-2 3.4L5 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.4 2.1h5l.4-2.1a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.6.1-1Z"/>',
  lock:
    '<rect x="5" y="10" width="14" height="10" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  external:
    '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  rotate:
    '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  play:
    '<path d="m8 5 11 7-11 7V5Z"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.4 2.4 3.6 5.4 3.6 9s-1.2 6.6-3.6 9c-2.4-2.4-3.6-5.4-3.6-9S9.6 5.4 12 3Z"/>',
  'hard-drive':
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 13h18"/><path d="M7 16.5h.1M11 16.5h.1"/>',
  zap:
    '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  layers:
    '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  search:
    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  clock:
    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  copy:
    '<rect x="9" y="9" width="11" height="11" rx="1"/><path d="M15 5H5a1 1 0 0 0-1 1v10"/>',
  list:
    '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.1M3.5 12h.1M3.5 18h.1"/>',
  trash:
    '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/>',
  'map-pin':
    '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  terminal:
    '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  file:
    '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v4h4"/>',
  circle:
    '<circle cx="12" cy="12" r="8.5"/>',
  grid:
    '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  rocket:
    '<path d="M12 3c3.2 2 5 5.4 5 9l-2.6 2.6H9.6L7 12c0-3.6 1.8-7 5-9Z"/><circle cx="12" cy="10" r="1.6"/><path d="M9.6 14.6 7 17.2M14.4 14.6 17 17.2M12 17v4"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  sliders:
    '<path d="M5 6h14M5 12h14M5 18h14"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M4 12h16"/>',
  monitor:
    '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  gamepad:
    '<rect x="2.5" y="7" width="19" height="10" rx="4"/><path d="M7 10.5v3M5.5 12h3M15.5 11h.1M18 13.5h.1"/>',
  heart:
    '<path d="M12 20s-7-4.3-7-9.2A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.8C19 15.7 12 20 12 20Z"/>',
  'arrow-up-right': '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
};

export function icon(name, className = '') {
  const path = PATHS[name] || PATHS.info;
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
}
