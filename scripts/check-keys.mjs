import fs from 'node:fs';
import path from 'node:path';
import { D } from '../src/lib/dict.js';
const files = [];
(function walk(d){ for (const f of fs.readdirSync(d)) { const p = path.join(d,f); fs.statSync(p).isDirectory() ? walk(p) : /\.(jsx?|)$/.test(f) && files.push(p); } })('src');
const used = new Set();
for (const f of files) {
  const s = fs.readFileSync(f,'utf8');
  for (const m of s.matchAll(/\bt\(\s*'([a-zA-Z0-9_]+)'/g)) used.add(m[1]);
  for (const m of s.matchAll(/'((?:nav|pitch|err)_[a-z0-9_]+|[a-z_]+_(?:title|sub))'/g)) used.add(m[1]);
}
['st_done','st_pending','st_paused','st_skipped','st_missing'].forEach(k=>used.add(k));
const missing = [...used].filter(k => !(k in D) && k !== 'st_');
console.log('missing keys:', missing);
const bad = Object.entries(D).filter(([k,v]) => !Array.isArray(v) || v.length !== 2 || !v[0] || !v[1]);
console.log('bad entries:', bad.map(b=>b[0]));
for (const [k,v] of Object.entries(D)) { const a=(v[0].match(/\{\w+\}/g)||[]).sort().join(); const b=(v[1].match(/\{\w+\}/g)||[]).sort().join(); if(a!==b) console.log('placeholder mismatch', k); }
