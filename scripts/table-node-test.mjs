import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import fs from 'fs';
import { ocrTable } from '../src/lib/tableOcr.js';
const file = process.argv[2];
const langs = process.argv[3] || 'kor';
const gt = JSON.parse(fs.readFileSync(new URL('./gt-real.json', import.meta.url)));
const img = await loadImage(file);
const long = Math.max(img.width, img.height);
const scale = long < 2400 ? Math.min(3, 2400 / long) : 1;
const src = createCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
const sx = src.getContext('2d'); sx.fillStyle = '#fff'; sx.fillRect(0, 0, src.width, src.height);
sx.drawImage(img, 0, 0, src.width, src.height);
const lp = new URL('../public/tessdata', import.meta.url).pathname;
const w = await createWorker('kor', 1, { langPath: lp, gzip: true, cachePath: '/tmp/tess-cache' });
let w2 = null;
if (langs.includes('eng')) w2 = await createWorker('kor+eng', 1, { langPath: lp, gzip: true, cachePath: '/tmp/tess-cache' });
await w.setParameters({ tessedit_pageseg_mode: '7', preserve_interword_spaces: '1' });
if (w2) await w2.setParameters({ tessedit_pageseg_mode: '7' });
const env = {
  makeCanvas: (a, b) => createCanvas(a, b),
  recognize: async (cv, o = {}) => {
    const buf = cv.toBuffer('image/png');
    await w.setParameters({ tessedit_char_whitelist: o.digits ? '0123456789' : '' });
    let t = (await w.recognize(buf)).data.text;
    if (o.mixed && w2) t = (await w2.recognize(buf)).data.text;
    return t;
  },
  progress: (d, t) => { if (d % 50 === 0) process.stderr.write(`${d}/${t} `); },
};
const t0 = Date.now();
const res = await ocrTable(src, env);
console.log('\ntime', ((Date.now() - t0) / 1000).toFixed(1), 's');
if (!res) { console.log('NO GRID'); process.exit(); }
console.log('columns', JSON.stringify(res.columns), 'header', res.headerFound, 'rows', res.rows.length);
const norm = (s) => String(s || '').replace(/\s/g, '').toLowerCase();
const stats = { apt: 0, plate: 0, model: 0, color: 0, block: 0, loc: 0, days: 0 };
res.rows.forEach((r, i) => {
  const g = gt[i]; if (!g) return;
  const ok = {
    apt: norm(r.apartment) === norm(g[0]), plate: r.plate === g[1], model: norm(r.model) === norm(g[2]),
    color: r.color === g[3], block: r.block === g[4], loc: r.location === g[5],
    days: JSON.stringify((r.days || ['일'])) === JSON.stringify(g[6].split(',')),
  };
  for (const k in ok) if (ok[k]) stats[k]++;
  const bad = Object.entries(ok).filter(([, v]) => !v).map(([k]) => k);
  if (bad.length) console.log(i + 1, bad.join(','), '|', r.apartment, r.plate, r.model, r.color, r.block, r.location, JSON.stringify(r.days));
});
console.log(stats, 'of', gt.length);
await w.terminate(); if (w2) await w2.terminate();
