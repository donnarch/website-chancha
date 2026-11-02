import { DAYS_KO, getWeekOfMonth } from './dates.js';

export function parseWashDays(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  try {
    const a = JSON.parse(v);
    if (Array.isArray(a)) return a;
  } catch (e) {
    /* fall through */
  }
  return String(v)
    .split(/[,\s/]+/)
    .filter(Boolean);
}

export function patternMatches(pattern, date = new Date()) {
  if (!pattern || pattern === 'every') return true;
  const w = getWeekOfMonth(date);
  if (pattern === '1/3') return w === 1 || w === 3;
  if (pattern === '2/4') return w === 2 || w === 4;
  return true;
}

// A car with no wash days set counts as "any day".
export function isDueToday(car, date = new Date()) {
  if (!patternMatches(car.week_pattern, date)) return false;
  const days = parseWashDays(car.wash_days);
  if (!days.length) return true;
  return days.includes(DAYS_KO[date.getDay()]);
}

export function isJobDueToday(job, car, date = new Date()) {
  if (job?.skip) return false;
  if (job?.override_day) return job.override_day === DAYS_KO[date.getDay()];
  return isDueToday(car, date);
}
