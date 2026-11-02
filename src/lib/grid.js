// Finds the cell grid (table borders) of a spreadsheet screenshot / printed table.
// gray: Uint8 array (W*H). Returns { xs, ys } border positions or null when no table is found.

function findLines(gray, W, H, vertical, T) {
  const len = vertical ? W : H;
  const span = vertical ? H : W;
  const best = new Uint16Array(len);
  for (let i = 0; i < len; i++) {
    let run = 0, gap = 0, b = 0;
    for (let j = 0; j < span; j++) {
      const v = vertical ? gray[j * W + i] : gray[i * W + j];
      if (v < T) { run += 1 + gap; gap = 0; if (run > b) b = run; }
      else if (gap < 1 && run > 0) gap++;
      else { run = 0; gap = 0; }
    }
    best[i] = b;
  }
  let max = 0;
  for (let i = 0; i < len; i++) if (best[i] > max) max = best[i];
  const thr = Math.max(span * 0.2, max * 0.6);
  const hits = [];
  for (let i = 0; i < len; i++) if (best[i] >= thr) hits.push(i);
  const out = [];
  let start = null, prev = null;
  for (const h of hits) {
    if (start === null) { start = h; prev = h; continue; }
    if (h - prev <= 3) prev = h;
    else { out.push((start + prev) / 2); start = h; prev = h; }
  }
  if (start !== null) out.push((start + prev) / 2);
  return out;
}

export function detectGrid(gray, W, H) {
  let best = null;
  for (const T of [150, 185, 215, 235]) {
    const xs = findLines(gray, W, H, true, T);
    const ys = findLines(gray, W, H, false, T);
    if (xs.length < 4 || ys.length < 4) continue;
    const score = xs.length * ys.length;
    if (!best || score > best.score * 1.05) best = { xs, ys, T, score };
  }
  return best;
}
