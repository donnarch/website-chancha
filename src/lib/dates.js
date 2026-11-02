export const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
export const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Display order Monday first (the work week starts on Monday)
export const DAY_ORDER = ['월', '화', '수', '목', '금', '토', '일'];

const pad = (n) => String(n).padStart(2, '0');

export function formatLocalDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseLocalDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Monday of the week, in LOCAL time (same rule as the mobile app)
export function getWeekStart(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return formatLocalDate(d);
}

export function addDays(dateStr, n) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return formatLocalDate(d);
}

export function getWeekOfMonth(date = new Date()) {
  return Math.ceil(date.getDate() / 7);
}

export function todayKo(date = new Date()) {
  return DAYS_KO[date.getDay()];
}

export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function weekLabel(weekStart, lang = 'en') {
  const a = parseLocalDate(weekStart);
  const b = parseLocalDate(addDays(weekStart, 6));
  const f = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  return lang === 'ko' ? `${a.getFullYear()}년 ${f(a)} ~ ${f(b)}` : `${f(a)} – ${f(b)}, ${a.getFullYear()}`;
}
