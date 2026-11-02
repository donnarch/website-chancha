// Reads a photographed / screenshotted TABLE cell by cell.
// Every cell is cropped, enlarged and read on its own, so columns can never bleed into each other,
// then each value is corrected against what that column can contain (colours, floors, days, plates...).
import { detectGrid } from './grid.js';
import { findPlate, fixDigits } from './plates.js';
import { COLORS, ENTRY_RE, normFloor, parseDaysToken, newRow } from './parseCars.js';

const TARGET_H = 64;
const strip = (s) => String(s || '').replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase();

export function similarity(a, b) {
  a = strip(a); b = strip(b);
  if (!a || !b) return 0;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - dp[a.length][b.length] / Math.max(a.length, b.length);
}

// header words (what a boss calls each column)
const HEADERS = {
  worker: ['작업자', '담당자', '담당'],
  no: ['번호', 'no'],
  days: ['요일'],
  apartment: ['아파트명', '아파트', '단지'],
  plate: ['차번호', '차량번호', '차량번호판', '번호판'],
  model: ['차종', '차량', '모델'],
  color: ['색상', '색'],
  block: ['동'],
  notes: ['당일특이사항', '특이사항', '당일'],
  location: ['위치', '주차위치', '주차'],
  remarks: ['비고', '메모'],
  gu: ['구'],
  entry: ['입차시간', '입차', '시간'],
};

function headerKey(text) {
  const t = strip(text);
  if (!t) return null;
  let best = null, score = 0;
  for (const [k, words] of Object.entries(HEADERS)) {
    for (const w of words) {
      const sc = w.length === 1 ? (t === w ? 1 : 0) : similarity(t, w);
      if (sc > score) { score = sc; best = k; }
    }
  }
  return score >= 0.5 ? best : null;
}

// ---------- value correction ----------
export function fixColor(t) {
  const s = strip(t);
  if (!s) return { v: '', ok: true };
  let best = null, sc = 0;
  for (const c of COLORS) {
    const x = similarity(s, c);
    if (x > sc) { sc = x; best = c; }
  }
  if (sc >= 0.5) return { v: best === '겸정' ? '검정' : best, ok: true };
  return { v: t.trim(), ok: false };
}

export function fixBlock(t) {
  const s = String(t || '').replace(/\s/g, '');
  if (!s) return { v: '', ok: true };
  const m = s.match(/([0-9]{1,4}|[A-Za-z])동/) || s.match(/^([0-9]{2,4})$/) || s.match(/^([A-Za-z가-힣]?)([0-9]{2,4})/);
  if (m) return { v: `${m[1] || ''}동`.replace(/^동$/, ''), ok: true };
  return { v: '', ok: false };
}

export function fixLocation(t) {
  const s = String(t || '').replace(/\s/g, '');
  if (!s) return { v: '', ok: true };
  // 지하 / 지상 followed by digits; the 층 character is often misread, so it is ignored
  const m = s.match(/(지하|지상|지|B|b)\s*([0-9]{1,2}(?:[,.~·][0-9]{1,2})*)?/);
  if (m) {
    const digits = (m[2] || '').replace(/[.~·]/g, ',');
    if (/지상/.test(m[1])) return { v: digits ? `${digits.split(',').join(',')}F` : '', ok: !!digits };
    if (/지|B|b/.test(m[1])) return { v: digits ? `B${digits}` : '지하', ok: true };
  }
  const f = normFloor(s);
  return { v: f || s, ok: !!f };
}

export function fixEntry(t) {
  let s = String(t || '').replace(/\s+/g, '').replace(/[|_ㅣ]/g, '');
  if (!s) return { v: '', ok: true };
  s = s.replace(/오추|오호|오루|오후?/g, '오후').replace(/이루|이후?$/, '이후');
  return { v: s, ok: ENTRY_RE.test(s) };
}

// words that apartment names are built from (a misread letter snaps to the right word)
const APT_WORDS = ['센텀','자이','푸르지오','래미안','힐스테이트','아이파크','롯데캐슬','더샵','편한세상','위브','제니스','포세이돈','마린','월드마크','메트로시티','엘시티','아펠바움','누리','스타','화목','우성','삼성','현대','대우','쌍용','금호','두산','동백','해운대','해성','경남','한화','꿈에그린','데시앙','아델리움','엘지','LG','SK','lg메트로시티','센텀스타','센텀누리','센텀월드마크'];
export function fixAptName(t) {
  let s = String(t || '').replace(/[ㄱ-ㅣ|_]/g, '').replace(/[^0-9A-Za-z가-힣\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  s = s.replace(/^19(?=[가-힣])/, 'lg').replace(/^1g(?=[가-힣])/i, 'lg');
  for (const w of APT_WORDS) {
    if (w.length < 2) continue;
    for (const len of [w.length]) {
      const head = s.slice(0, len);
      if (head === w || head.length !== len) continue;
      let diff = 0;
      for (let i = 0; i < len; i++) if (head[i] !== w[i]) diff++;
      if (diff === 1 && len >= 2 && /[가-힣]/.test(w)) { s = w + s.slice(len); break; }
    }
  }
  return s;
}

// popular Korean-market models: a misread name snaps to the closest real one
const MODELS = ['그랜저','쏘나타','아반떼','소나타','투싼','싼타페','팰리세이드','캐스퍼','코나','넥쏘','아이오닉','제네시스','스타리아','카니발','쏘렌토','스포티지','모닝','레이','K3','K5','K7','K8','K9','셀토스','니로','EV6','EV9','테슬라','벤츠','비엠더블유','아우디','폴스타','미니','볼보','렉서스','토요타','혼다','포르쉐','지프','랜드로버','벤틀리','마이바흐','르노','QM6','QM3','SM6','XM3','트레일블레이저','트랙스','말리부','티볼리','렉스턴','코란도','토레스','쏠라티','포터','봉고','마세라티','페라리','람보르기니','푸조','시트로엥','캐딜락','링컨','포드','머스탱','체어맨','올뉴','더뉴','미니클럽맨','클럽맨','주니퍼','씨라이언','씨라이언7','캐스퍼'];
const LATIN_MODELS = ['qm6','qm3','sm6','xm3','gv60','gv70','gv80','g70','g80','g90','k3','k5','k7','k8','k9','gle','glc','gla','glb','gls','glk','x1','x2','x3','x4','x5','x6','x7','ev6','ev9','a4','a6','a7','a8','q5','q7','q8','bmw','byd','amg','suv','cls','cla','eqe','eqs','xc60','xc90','s90','v60','ix','m3','m4','m5'];
const conf = (x) => String(x).toLowerCase().replace(/[gq9]/g, 'q').replace(/[6be]/g, '6').replace(/[0o]/g, '0').replace(/[1li|]/g, '1').replace(/[5s]/g, '5').replace(/[8]/g, '8');
function snapLatin(tok) {
  const c = conf(tok);
  const hits = LATIN_MODELS.filter((m) => conf(m) === c);
  return hits.length === 1 ? hits[0] : tok;
}
export function fixModel(t) {
  let s = String(t || '').replace(/[^\p{L}\p{N}\s().+\-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  // Mercedes: the class letter after 벤츠 is tiny and often read as a digit
  s = s.replace(/^(벤츠)\s*([0-9])\b/, (m, a, d) => a + ({ 6: 'e', 0: 'c', 5: 's', 8: 'b', 4: 'a' }[d] || d));
  s = s.replace(/^(벤츠)\s*(?=[A-Za-z])/, '$1');
  if (!/[가-힣]/.test(s)) s = s.split(' ').map((w) => (w.length >= 2 && w.length <= 5 ? snapLatin(w) : w)).join(' ');
  const bm = s.match(/^6[0Oo]{1,4}\s?([0-9])?$/);
  if (bm) return 'bmw' + (bm[1] || '');
  const m = s.match(/^([가-힣]{2,})(.*)$/);
  if (m) {
    let best = null, sc = 0;
    for (const w of MODELS) {
      const x = similarity(m[1], w);
      if (x > sc) { sc = x; best = w; }
    }
    if (best && sc >= 0.67 && m[1] !== best) return best + m[2];
  }
  return s;
}

// ---------- the reader ----------
// env = { makeCanvas(w,h), recognize(canvas, {psm, whitelist}) -> text, progress?(done,total) }
export async function ocrTable(source, env) {
  const W = source.width, H = source.height;
  const sctx = source.getContext('2d', { willReadFrequently: true });
  const id = sctx.getImageData(0, 0, W, H).data;
  const gray = new Uint8ClampedArray(W * H);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = (id[p] * 299 + id[p + 1] * 587 + id[p + 2] * 114) / 1000;

  const grid = detectGrid(gray, W, H);
  if (!grid) return null;
  const xs = grid.xs, ys = grid.ys;
  const cols = [];
  for (let i = 0; i + 1 < xs.length; i++) if (xs[i + 1] - xs[i] >= 10) cols.push([xs[i], xs[i + 1]]);
  const rowsY = [];
  for (let i = 0; i + 1 < ys.length; i++) if (ys[i + 1] - ys[i] >= 12) rowsY.push([ys[i], ys[i + 1]]);
  if (cols.length < 4 || rowsY.length < 2) return null;

  const crop = (c, r) => {
    const x0 = Math.round(cols[c][0]) + 3, x1 = Math.round(cols[c][1]) - 3;
    const y0 = Math.round(rowsY[r][0]) + 3, y1 = Math.round(rowsY[r][1]) - 3;
    const cw = x1 - x0, ch = y1 - y0;
    if (cw < 6 || ch < 6) return null;
    // ink check: empty cells are skipped
    let ink = 0;
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) if (gray[y * W + x] < 140) ink++;
    if (ink / (cw * ch) < 0.012) return null;
    const s = Math.max(1, Math.min(4, TARGET_H / ch));
    const pad = 12;
    const cv = env.makeCanvas(Math.round(cw * s) + pad * 2, Math.round(ch * s) + pad * 2);
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff';
    cx.fillRect(0, 0, cv.width, cv.height);
    cx.drawImage(source, x0, y0, cw, ch, pad, pad, Math.round(cw * s), Math.round(ch * s));
    return cv;
  };

  // 1) headers (first row that looks like one; the table may start with a title row)
  const read = async (c, r, opts) => {
    const cv = crop(c, r);
    if (!cv) return '';
    return ((await env.recognize(cv, opts)) || '').replace(/\n/g, ' ').trim();
  };

  let headerRow = 0;
  let headers = [];
  for (let r = 0; r < Math.min(5, rowsY.length); r++) {
    const hs = [];
    for (let c = 0; c < cols.length; c++) hs.push(headerKey(await read(c, r, { psm: '7' })));
    if (hs.filter(Boolean).length >= 3) { headers = hs; headerRow = r; break; }
  }
  const hasHeader = headers.length > 0;
  const dataRows = [];
  for (let r = hasHeader ? headerRow + 1 : 0; r < rowsY.length; r++) dataRows.push(r);

  // 2) column roles from headers ('동' appears twice: first = building block, second = neighbourhood)
  const role = Array(cols.length).fill(null);
  let blockSeen = false;
  headers.forEach((k, c) => {
    if (!k) return;
    if (k === 'block') { if (blockSeen) role[c] = 'skip'; else { role[c] = 'block'; blockSeen = true; } }
    else if (k === 'worker' || k === 'no' || k === 'gu') role[c] = 'skip';
    else role[c] = k;
  });

  // 3) read every needed cell
  const total = dataRows.length * cols.length;
  let done = 0;
  const grid2 = [];
  for (const r of dataRows) {
    const line = [];
    for (let c = 0; c < cols.length; c++) {
      done++;
      env.progress?.(done, total);
      if (role[c] === 'skip') { line.push(''); continue; }
      let opts = { psm: '7' };
      if (role[c] === 'model') {
        // read twice: Korean-only is exact on Hangul, Korean+English is better on tails like "gv80"
        const a = await read(c, r, opts);
        const b = await read(c, r, { psm: '7', mixed: true });
        const ha = (a.match(/[가-힣]+/) || [''])[0], hb = (b.match(/[가-힣]+/) || [''])[0];
        line.push(ha && hb && similarity(ha, hb) >= 0.67 ? b : ha ? a : b);
        continue;
      }
      line.push(await read(c, r, opts));
    }
    grid2.push(line);
  }

  // 4) if the header could not be read, infer roles from the content of each column
  const votes = (c, test) => grid2.filter((l) => test(l[c] || '')).length / Math.max(1, grid2.length);
  const free = (k) => !role.includes(k);
  const inferred = (k, test, min = 0.4) => {
    if (!free(k)) return;
    let best = -1, sc = 0;
    for (let c = 0; c < cols.length; c++) if (!role[c]) { const v = votes(c, test); if (v > sc) { sc = v; best = c; } }
    if (best >= 0 && sc >= min) role[best] = k;
  };
  inferred('plate', (t) => /\d{4}/.test(fixDigits(t.replace(/\s/g, ''))) && t.replace(/\D/g, '').length >= 4, 0.5);
  inferred('color', (t) => fixColor(t).ok && t.trim().length > 0 && COLORS.some((c) => similarity(t, c) >= 0.5));
  inferred('block', (t) => /동/.test(t) && /\d/.test(t));
  inferred('location', (t) => /지하|지상|B\d/.test(t));
  inferred('entry', (t) => /시|오후|오전|상시/.test(t));
  inferred('days', (t) => t.trim() && !!parseDaysToken(t.replace(/\(.*?\)/g, '').trim()), 0.6);
  const pc = role.indexOf('plate');
  if (pc >= 0) {
    if (free('apartment') && pc >= 1 && !role[pc - 1]) role[pc - 1] = 'apartment';
    if (free('model') && !role[pc + 1]) role[pc + 1] = 'model';
  }

  // 5) build rows
  const out = [];
  for (let i = 0; i < grid2.length; i++) {
    const line = grid2[i];
    const get = (k) => {
      const c = role.indexOf(k);
      return c >= 0 ? (line[c] || '').trim() : '';
    };
    // plate
    let plateTxt = get('plate').replace(/\s/g, '');
    let plate = '';
    const full = findPlate(plateTxt);
    if (full) plate = full.plate;
    else {
      const d = fixDigits(plateTxt).replace(/\D/g, '');
      if (d.length >= 4) plate = d.slice(-4);
    }
    if (!plate) {
      // retry on this cell with digits only
      const pcI = role.indexOf('plate');
      if (pcI >= 0) {
        const t = await read(pcI, dataRows[i], { psm: '7', digits: true });
        const d = t.replace(/\D/g, '');
        if (d.length >= 4) plate = d.slice(-4);
      }
    }
    const row = newRow(line.join(' | '));
    row.plate = plate;
    if (!plate) { if (line.some((x) => x)) { row.warn.push('format'); out.push(row); } continue; }
    if (/^\d{4}$/.test(plate)) row.warn.push('short');

    row.apartment = fixAptName(get('apartment'));
    row.model = fixModel(get('model'));
    const col = fixColor(get('color'));
    row.color = col.v;
    if (!col.ok) row.warn.push('color');
    const bl = fixBlock(get('block'));
    row.block = bl.v;
    if (!bl.ok) row.warn.push('block');
    const lo = fixLocation(get('location'));
    row.location = lo.v;
    if (!lo.ok) row.warn.push('location');
    row.entryTime = fixEntry(get('entry')).v;

    const dTxt = get('days');
    if (dTxt) {
      const d = parseDaysToken(dTxt.replace(/\s/g, ''));
      if (d && d.length) row.days = d;
      if (/격/.test(dTxt)) row.remarks = '격주';
      if (!d) row.warn.push('days');
    }
    const notes = [get('notes'), get('remarks')].map((x) => x.replace(/[|_ㅣ]/g, '').trim()).filter((x) => x.length >= 2);
    if (notes.length) row.remarks = [row.remarks, ...notes].filter(Boolean).join(' · ');
    out.push(row);
  }
  return { rows: out, columns: role, headerFound: hasHeader, cells: total };
}
