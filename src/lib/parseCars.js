import { findPlate } from './plates.js';
import { DAY_ORDER } from './dates.js';

// ---------- helpers ----------
const PHONE_RE = /(?:\+?82[-\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/;
const BLOCK_RE = /([0-9]{1,4}|[A-Za-z])\s*동(?:\s*([0-9]{1,4})\s*호)?/;
const FLOOR_RE =
  /(B\s?\d{1,2}|지하\s?\d{1,2}(?:\s?[,~·]\s?\d{1,2})*\s?층?|지상\s?\d{1,2}(?:\s?[,~·]\s?\d{1,2})*\s?층?|\d{1,2}\s?층|\d{1,2}\s?F\b)(\s*[A-Z]?\d{1,3}\s*(?:번|구역|존))?/i;
const COLORS = [
  '흰색', '하얀색', '겸정', '청색', '청록', '백색', '화이트', '검정색', '검은색', '검정', '블랙', '은색', '실버', '회색', '그레이',
  '쥐색', '파란색', '파랑', '블루', '빨간색', '빨강', '레드', '노란색', '노랑', '갈색', '브라운', '주황',
  '오렌지', '금색', '골드', '남색', '네이비', '진주색', '초록', '녹색', '그린', '보라', '베이지',
];
const COLOR_RE = new RegExp(`(${COLORS.join('|')})`);
const DAY_CHARS = DAY_ORDER.join('');

const HEADER_KEYS = {
  plate: /차량\s*번호|차\s*번호|번호판|^번호$|plate|car\s*number|license|^number$/i,
  model: /차종|모델|차량명|^차량$|model|^car$|vehicle/i,
  color: /색상|^색$|color|colour/i,
  block: /^동$|블록|block|building|동\s*번호/i,
  location: /위치|주차|location|spot|parking|층/i,
  phone: /연락처|전화|휴대폰|핸드폰|phone|tel|mobile/i,
  days: /요일|세차\s*일|^days?$|wash\s*days?/i,
  remarks: /비고|메모|특이|remarks?|notes?|memo/i,
  worker: /담당|직원|worker|staff/i,
  apartment: /아파트|단지|apartment|complex/i,
  entry: /입차|entry|arrival/i,
};

export function normFloor(s) {
  let t = String(s).replace(/\s+/g, '').toUpperCase();
  const jb = t.match(/^지하(\d{1,2}(?:[,~·]\d{1,2})*)층?$/);
  if (jb) return `B${jb[1].replace(/[~·]/g, ',')}`;
  const up = t.match(/^지상(\d{1,2}(?:[,~·]\d{1,2})*)층?$/);
  if (up) return `${up[1].replace(/[~·]/g, ',')}F`;
  const fl = t.match(/^(\d{1,2})(층|F)$/);
  if (fl) return `${fl[1]}F`;
  return t;
}

export function parseDaysToken(tok) {
  let t = String(tok).replace(/[(（][^)）]*[)）]/g, '').replace(/요일/g, '').replace(/[\s,/·.]/g, '');
  if (!t || t.length > 7) return null;
  const chars = [...t];
  if (!chars.every((c) => DAY_CHARS.includes(c))) return null;
  if (new Set(chars).size !== chars.length) return null;
  return DAY_ORDER.filter((d) => chars.includes(d));
}

const clean = (s) =>
  String(s || '')
    .replace(/[|_~`“”"'‘’\\。、，．·•■□◆◇○●]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

let seq = 0;
const newRow = (raw) => ({
  rid: `r${Date.now().toString(36)}${seq++}`,
  plate: '',
  model: '',
  color: '',
  block: '',
  location: '',
  phone: '',
  days: null,
  remarks: '',
  worker: '',
  raw: raw || '',
  warn: [],
});

// ---------- heuristic extraction from cells of one line ----------
export function parseCells(cells, raw, { ocr = false } = {}) {
  const row = newRow(raw ?? cells.join(' '));
  const leftovers = [];

  for (const cellRaw of cells) {
    let s = String(cellRaw ?? '');
    if (!s.trim()) continue;

    if (!row.plate) {
      const p = findPlate(s);
      if (p) {
        row.plate = p.plate;
        if (!p.validLetter) row.warn.push('letter');
        if (p.fixed) row.warn.push('fixed');
        // anything before the plate that is only an index number is dropped
        const before = s.slice(0, p.start).replace(/^\s*\d{1,3}\s*[.)\]]?\s*/, ' ');
        s = `${before} ${s.slice(p.end)}`;
      }
    }

    const ph = s.match(PHONE_RE);
    if (ph && !row.phone) {
      row.phone = ph[0].replace(/[^\d+]/g, '').replace(/^\+?82/, '0');
      s = s.replace(ph[0], ' ');
    }

    const bl = s.match(BLOCK_RE);
    if (bl && !row.block) {
      row.block = `${bl[1]}동`;
      if (bl[2]) row.remarks = `${bl[2]}호`;
      s = s.replace(bl[0], ' ');
    }

    const fl = s.match(FLOOR_RE);
    if (fl && !row.location) {
      row.location = normFloor(fl[0]);
      s = s.replace(fl[0], ' ');
    }

    if (ocr && !row.location) {
      // OCR often reads "B2" as "82"; floors only go up to 8 here
      const fx = s.match(/(?:^|\s)[8B]([1-8])(?=\s|$)/);
      if (fx) {
        row.location = `B${fx[1]}`;
        s = s.replace(fx[0], ' ');
      }
    }

    const co = s.match(COLOR_RE);
    if (co && !row.color) {
      row.color = co[0];
      s = s.replace(co[0], ' ');
    }

    // wash days as standalone tokens
    if (!row.days) {
      const kept = [];
      let found = null;
      for (const tok of s.split(/\s+/).filter(Boolean)) {
        const d = !found ? parseDaysToken(tok) : null;
        if (d && (tok.length > 1 || cells.length > 1 || /요일/.test(tok))) found = d;
        else kept.push(tok);
      }
      if (found) {
        row.days = found;
        s = kept.join(' ');
      }
    }

    // drop stray numbers (OCR noise / row indexes), keep real words
    s = clean(s)
      .split(' ')
      .filter((t) => !/^\d{1,3}$/.test(t) && !/^[.\-:,;()]+$/.test(t))
      .join(' ');
    if (s) leftovers.push(s);
  }

  if (leftovers.length) row.model = leftovers[0];
  if (leftovers.length > 1) row.remarks = [row.remarks, ...leftovers.slice(1)].filter(Boolean).join(' · ');
  return row;
}


// ---------- lines where the plate is only the last 4 digits (common in boss spreadsheets) ----------
const PLATE4_CELL = /^[\s\[\(\{|]*(\d{4})[\s\]\)\}|]*$/;
const ENTRY_RE = /오[전후]\s*\d{1,2}\s*시|상시|늦은\s*오[전후]|밤\s*\d{1,2}\s*시|새벽\s*\d{1,2}\s*시|\d{1,2}\s*시\s*(?:이후|전|경)|오[전후]$/;
const REGION_RE = /(?:^|[가-힣])(?:구|군|시)$|^[가-힣]{2,3}동$/;

export function parseShortPlateRow(cells, raw) {
  const cs = cells.map((c) => clean(String(c ?? '')).replace(/^[\s.\[\]]+|[\s.\[\]]+$/g, '')).filter((c) => c);
  if (cs.length < 5) return null;
  const pi = cs.findIndex((c) => PLATE4_CELL.test(c));
  if (pi < 1) return null;
  const row = newRow(raw ?? cs.join(' '));
  row.plate = cs[pi].match(/\d{4}/)[0];
  row.warn.push('short');

  // apartment = the text cell just before the plate
  const before = cs[pi - 1];
  if (before && !/^\d+$/.test(before) && !parseDaysToken(before)) row.apartment = before.replace(/[ㄱ-ㅣ]/g, ' ').replace(/[^가-힣A-Za-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // days = a day-only cell before the plate
  for (let i = 0; i < pi; i++) {
    const d = parseDaysToken(cs[i]);
    if (d && !/^\d/.test(cs[i])) {
      row.days = d;
      if (/격/.test(cs[i])) row.remarks = '격주';
      break;
    }
  }

  const rest = cs.slice(pi + 1);
  const used = new Set();
  rest.forEach((c, i) => {
    if (used.has(i)) return;
    if (!row.block && BLOCK_RE.test(c) && c.length <= 8) {
      const m = c.match(BLOCK_RE);
      row.block = `${m[1]}동`;
      used.add(i);
    } else if (!row.location && FLOOR_RE.test(c) && c.replace(FLOOR_RE, '').trim().length <= 2) {
      row.location = normFloor(c.match(FLOOR_RE)[0]);
      used.add(i);
    } else if (!row.color && COLOR_RE.test(c) && c.length <= 5) {
      row.color = c.match(COLOR_RE)[0].replace('겸정', '검정');
      used.add(i);
    } else if (!row.entryTime && ENTRY_RE.test(c)) {
      row.entryTime = c;
      used.add(i);
    } else if (REGION_RE.test(c) && c.length <= 5) {
      used.add(i); // district / neighbourhood columns are not needed
    }
  });
  // model = first remaining text right after the plate
  // the model column sits before colour / block, never after (those are notes)
  const stop = rest.findIndex((c, i) => used.has(i) && (COLOR_RE.test(c) || BLOCK_RE.test(c)));
  const model = rest.slice(0, stop > 0 ? stop : rest.length).find((c, i) => !used.has(i) && /[가-힣A-Za-z]/.test(c) && c.length <= 20 && !ENTRY_RE.test(c) && !/지하|지상|층|동$|구$/.test(c) && !/^[\s_\p{P}\p{S}]*$/u.test(c));
  if (model) {
    row.model = model.replace(/[^\p{L}\p{N}\s().+\-]/gu, ' ').replace(/\s+/g, ' ').trim();
    used.add(rest.indexOf(model));
  }
  // anything else that is a real sentence → remarks (daily special notes)
  const notes = rest.filter((c, i) => !used.has(i) && /[가-힣]{2,}/.test(c) && c.length >= 4);
  if (notes.length) row.remarks = [row.remarks, ...notes].filter(Boolean).join(' · ');
  return row;
}

// ---------- header-mapped rows ----------
function detectHeader(cells) {
  if (cells.length < 2) return null;
  if (cells.some((c) => findPlate(String(c)))) return null;
  const map = {};
  let hits = 0;
  cells.forEach((c, i) => {
    const t = String(c || '').trim();
    if (!t) return;
    for (const [field, re] of Object.entries(HEADER_KEYS)) {
      if (!(field in map) && re.test(t)) {
        map[field] = i;
        hits++;
        break;
      }
    }
  });
  if (map.plate !== undefined || hits >= 2) return map;
  return null;
}

function isHeaderLine(raw) {
  let hits = 0;
  for (const re of Object.values(HEADER_KEYS)) {
    if (raw.split(/\s+/).some((w) => re.test(w))) hits++;
  }
  return hits >= 2;
}

function rowFromMap(cells, map, raw) {
  const row = newRow(raw);
  const get = (f) => (map[f] === undefined ? '' : String(cells[map[f]] ?? '').trim());
  const plateCell = get('plate');
  const p = findPlate(plateCell);
  if (p) {
    row.plate = p.plate;
    if (!p.validLetter) row.warn.push('letter');
  } else {
    row.plate = plateCell.replace(/\s+/g, '');
    if (row.plate && !/^\d{3,4}$/.test(row.plate)) row.warn.push('format');
  }
  row.model = get('model');
  row.color = get('color');
  row.block = get('block');
  if (row.block && /^\d{1,4}$/.test(row.block)) row.block = `${row.block}동`;
  row.location = get('location') ? normFloor(get('location')) : '';
  row.phone = get('phone').replace(/[^\d+]/g, '');
  row.remarks = get('remarks');
  row.worker = get('worker');
  row.entryTime = get('entry');
  row.apartment = get('apartment');
  const d = get('days');
  if (/격/.test(d)) row.remarks = [row.remarks, '격주'].filter(Boolean).join(' · ');
  if (d) row.days = parseDaysToken(d) || d.split(/[,\s/]+/).map(parseDaysToken).flat().filter(Boolean);
  if (row.days && !row.days.length) row.days = null;
  return row;
}

// ---------- text splitting ----------
export function splitTextToTable(text) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/ /g, ' '))
    .filter((l) => l.trim());
  const hasTab = lines.some((l) => l.includes('\t'));
  return lines.map((l) => {
    if (hasTab) return l.split('\t');
    return l.split(/\s*[,;|]\s*|\s{2,}/);
  });
}

// rows: string[][]   → { rows, unparsed }
export function parseTable(table, { useHeader = true, ocr = false } = {}) {
  const out = [];
  const unparsed = [];
  if (!table.length) return { rows: out, unparsed };

  let start = 0;
  let map = useHeader ? detectHeader(table[0]) : null;
  if (map) start = 1;

  for (let i = start; i < table.length; i++) {
    const cells = table[i].map((c) => String(c ?? ''));
    const raw = cells.join('  ');
    if (!raw.trim()) continue;
    if (map) {
      const r = rowFromMap(cells, map, raw);
      if (r.plate) out.push(r);
      else unparsed.push(raw);
    } else {
      let r = parseCells(cells, raw, { ocr });
      if (!r.plate) {
        const sp = parseShortPlateRow(cells, raw);
        if (sp) r = sp;
      }
      if (r.plate) out.push(r);
      else if (isHeaderLine(raw)) continue;
      else if (raw.trim().length >= 3) unparsed.push(raw.trim());
    }
  }
  return { rows: out, unparsed };
}

export function parseText(text) {
  return parseTable(splitTextToTable(text));
}

// OCR output: one car per line; columns are separated by 2+ spaces or bars.
export function parseOcrText(text) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 3);
  const table = lines.map((l) => l.split(/\s{2,}|[|\[\]ㅣ]/).filter((c) => c.trim()));
  return parseTable(table, { useHeader: false, ocr: true });
}

export { newRow, COLORS, COLOR_RE, ENTRY_RE, FLOOR_RE, BLOCK_RE };
