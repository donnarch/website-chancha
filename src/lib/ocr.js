import { createWorker } from 'tesseract.js';
import { ocrTable } from './tableOcr.js';

// ---------- image preparation ----------
export async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    return await createImageBitmap(file);
  }
}

// mode: 'raw' (as photographed) | 'gray' (grayscale + contrast stretch) | 'bw' (adaptive black & white, for shadows / creased paper)
export function renderForOcr(bitmap, { rotate = 0, mode = 'raw' } = {}) {
  const long = Math.max(bitmap.width, bitmap.height);
  let scale = 1;
  if (long > 3200) scale = 3200 / long;
  else if (long < 2400) scale = Math.min(3, 2400 / long);

  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const swap = rotate % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (mode === 'raw') return canvas; // plain photo: the Korean model reads best without filters

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const n = canvas.width * canvas.height;
  const gray = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const g = (d[p] * 299 + d[p + 1] * 587 + d[p + 2] * 114) / 1000;
    gray[i] = g;
    hist[g | 0]++;
  }
  // contrast stretch between the 2nd and 98th percentile
  let acc = 0, lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * 0.02) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= n * 0.02) { hi = i; break; } }
  if (hi - lo < 30) { lo = 0; hi = 255; }
  const range = hi - lo;
  for (let i = 0; i < n; i++) gray[i] = Math.max(0, Math.min(255, ((gray[i] - lo) * 255) / range));

  let out = gray;
  if (mode === 'bw') {
    const W = canvas.width, H = canvas.height;
    const integral = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        row += gray[y * W + x];
        integral[(y + 1) * (W + 1) + (x + 1)] = integral[y * (W + 1) + (x + 1)] + row;
      }
    }
    const r = Math.max(15, Math.round(W / 24));
    out = new Uint8ClampedArray(n);
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
        const area = (x1 - x0) * (y1 - y0);
        const sum =
          integral[y1 * (W + 1) + x1] - integral[y0 * (W + 1) + x1] -
          integral[y1 * (W + 1) + x0] + integral[y0 * (W + 1) + x0];
        out[y * W + x] = gray[y * W + x] < (sum / area) * 0.86 ? 0 : 255;
      }
    }
  }
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    d[p] = d[p + 1] = d[p + 2] = out[i];
    d[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const toBlob = (canvas) => new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));

// ---------- OCR engine (one shared worker; Korean model served from /tessdata. Korean-only is far more accurate on plates than kor+eng) ----------
let workerPromise = null;
let onProgress = () => {};

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const base = import.meta.env.BASE_URL || '/';
      const worker = await createWorker('kor', 1, {
        langPath: `${base}tessdata`,
        workerPath: `${base}tess/worker.min.js`,
        corePath: `${base}tess`,
        gzip: true,
        logger: (m) => onProgress(m),
      });
      await worker.setParameters({
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
      });
      return worker;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

export async function runOcr(bitmap, { rotate = 0, mode = 'gray', progress } = {}) {
  onProgress = (m) => {
    if (!progress) return;
    if (m.status === 'recognizing text') progress({ phase: 'read', value: m.progress || 0 });
    else if (/loading|initializ/i.test(m.status || '')) progress({ phase: 'load', value: m.progress || 0 });
  };
  progress?.({ phase: 'prepare', value: 0 });
  const canvas = renderForOcr(bitmap, { rotate, mode });
  const blob = await toBlob(canvas);
  const worker = await getWorker();
  const { data } = await worker.recognize(blob);
  return { text: data.text || '', confidence: data.confidence || 0 };
}

export async function stopOcr() {
  if (workerPromise) {
    try {
      const w = await workerPromise;
      await w.terminate();
    } catch (e) {
      /* ignore */
    }
    workerPromise = null;
  }
}

// ---------- table photos: every cell is read on its own ----------
let mixedPromise = null;
async function getMixedWorker() {
  if (!mixedPromise) {
    mixedPromise = (async () => {
      const base = import.meta.env.BASE_URL || '/';
      const worker = await createWorker('kor+eng', 1, {
        langPath: `${base}tessdata`,
        workerPath: `${base}tess/worker.min.js`,
        corePath: `${base}tess`,
        gzip: true,
      });
      await worker.setParameters({ tessedit_pageseg_mode: '7', preserve_interword_spaces: '1' });
      return worker;
    })().catch((e) => {
      mixedPromise = null;
      throw e;
    });
  }
  return mixedPromise;
}

// Returns { rows, ... } when the image contains a table with visible cell borders, otherwise null.
export async function runTableOcr(bitmap, { rotate = 0, progress } = {}) {
  progress?.({ phase: 'prepare', value: 0 });
  const canvas = renderForOcr(bitmap, { rotate, mode: 'raw' });
  const worker = await getWorker();
  await worker.setParameters({ tessedit_pageseg_mode: '7', preserve_interword_spaces: '1' });
  let mixed = null;
  const env = {
    makeCanvas: (w, h) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    },
    recognize: async (cv, o = {}) => {
      if (o.mixed) {
        mixed = mixed || (await getMixedWorker());
        return (await mixed.recognize(cv)).data.text;
      }
      await worker.setParameters({ tessedit_char_whitelist: o.digits ? '0123456789' : '' });
      return (await worker.recognize(cv)).data.text;
    },
    progress: (done, total) => progress?.({ phase: 'read', value: done / total }),
  };
  const res = await ocrTable(canvas, env);
  await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '6' });
  return res;
}
