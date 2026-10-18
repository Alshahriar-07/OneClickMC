export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function bytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return '—';
  if (number < 1024) return `${number} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = number / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[index]}`;
}

export function shortPath(value, max = 74) {
  if (!value) return '—';
  const text = String(value);
  if (text.length <= max) return text;
  const head = text.slice(0, Math.max(12, Math.floor(max * 0.42)));
  const tail = text.slice(-Math.floor(max * 0.48));
  return `${head}…${tail}`;
}

export function dateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeAge(ageMs) {
  if (ageMs === null || ageMs === undefined) return 'unknown';
  if (!Number.isFinite(ageMs)) return 'unknown';
  const minutes = Math.max(0, Math.round(ageMs / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

const STATUS = {
  VERIFIED: { label: 'Verified', tone: 'verified', icon: 'check-circle' },
  OPTIONAL_VERIFIED: { label: 'Optional', tone: 'optional', icon: 'circle' },
  UNAVAILABLE: { label: 'Unavailable', tone: 'unavailable', icon: 'x-circle' },
  UNVERIFIED: { label: 'Manual only', tone: 'warning', icon: 'alert' },
  INCOMPATIBLE: { label: 'Incompatible', tone: 'error', icon: 'x-circle' },
  BLOCKED_DEPENDENCY: { label: 'Dependency blocked', tone: 'blocked', icon: 'alert' },
  BLOCKED_LICENSE: { label: 'License blocked', tone: 'error', icon: 'x-circle' },
  SUCCESS: { label: 'Success', tone: 'success', icon: 'check-circle' },
  SUCCESS_WITH_SKIPS: { label: 'Installed with skips', tone: 'warning', icon: 'alert' },
  FAILED: { label: 'Failed', tone: 'error', icon: 'x-circle' },
  CANCELLED: { label: 'Cancelled', tone: 'warning', icon: 'x-circle' },
};

export function statusMeta(status) {
  return STATUS[status] || { label: String(status || 'Unknown'), tone: 'muted', icon: 'info' };
}

export function toneForStatus(status) {
  return statusMeta(status).tone;
}

export function categoryLabel(category) {
  switch (category) {
    case 'mod':
      return 'Mod';
    case 'dependency':
      return 'Dependency';
    case 'shader':
      return 'Shader';
    case 'resourcepack':
      return 'Resource pack';
    default:
      return 'File';
  }
}

export function folderLabel(folder) {
  switch (folder) {
    case 'mods':
      return 'mods';
    case 'shaderpacks':
      return 'shaderpacks';
    case 'resourcepacks':
      return 'resourcepacks';
    default:
      return folder || 'files';
  }
}

export function editionTitle(edition) {
  const map = { potato: 'Potato', balanced: 'Balanced', ultimate: 'Ultimate' };
  return map[edition] || edition;
}

export function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

export function licenseLabel(license) {
  if (!license) return 'License not listed';
  return license.name || license.id || 'License not listed';
}

export function versionTypeLabel(type) {
  if (!type || type === 'release') return 'release';
  return type;
}

export function sanitizeExternalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}
