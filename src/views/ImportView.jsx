import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDash } from '../state.jsx';
import { useT } from '../lib/i18n.jsx';
import { go } from '../lib/router.js';
import { Badge, Button, Card, Chip, Field, Modal, Progress, Select, Spinner, cx, inputCls, useUi } from '../components/ui.jsx';
import DayChips from '../components/DayChips.jsx';
import { DEFAULT_DAYS } from '../components/AddCarModal.jsx';
import { parseOcrText, parseTable, parseText, parseDaysToken, newRow } from '../lib/parseCars.js';
import { loadBitmap, runOcr, runTableOcr } from '../lib/ocr.js';
import { similarity } from '../lib/tableOcr.js';
import { Icon } from '../components/icons.jsx';
import { normPlate } from '../lib/plates.js';
import { applyDistribution, autoDistribute, buildPlateIndex, importCars } from '../lib/data.js';

const IMG_RE = /^image\//;
const SHEET_RE = /\.(xlsx|xls|xlsm|ods)$/i;
const TEXT_RE = /\.(csv|tsv|txt)$/i;
const MAX_MB = 25;
const PAGE = 100;

let sid = 0;

export default function ImportView() {
  const t = useT();
  const d = useDash();
  const { toast, confirm } = useUi();

  const [tab, setTab] = useState('upload');
  const [aptId, setAptId] = useState(d.apt !== 'all' ? d.apt : d.apartments[0]?.id || '__new');
  const [newApt, setNewApt] = useState('');
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [pattern, setPattern] = useState('every');
  const [defWorker, setDefWorker] = useState('none'); // none | auto | workerId
  const [reactivate, setReactivate] = useState(true);

  const [sources, setSources] = useState([]);
  const [rows, setRows] = useState([]);
  const [unparsed, setUnparsed] = useState([]);
  const [paste, setPaste] = useState('');
  const [page, setPage] = useState(0);
  const [lightbox, setLightbox] = useState(null);
  const [drag, setDrag] = useState(false);

  const [importing, setImporting] = useState(false);
  const [prog, setProg] = useState([0, 0]);
  const [result, setResult] = useState(null);

  const bitmaps = useRef({});
  const chain = useRef(Promise.resolve());
  const fileInput = useRef(null);
  const camInput = useRef(null);
  const reviewRef = useRef(null);

  useEffect(
    () => () => {
      sources.forEach((s) => s.url && URL.revokeObjectURL(s.url));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ---------- adding rows ----------
  const addParsed = useCallback((parsed, srcId) => {
    const withSrc = parsed.rows.map((r) => ({ ...r, src: srcId }));
    setRows((cur) => [...cur, ...withSrc]);
    setUnparsed((cur) => [...cur, ...parsed.unparsed.map((line) => ({ id: `u${sid++}`, line, src: srcId }))]);
    return withSrc.length;
  }, []);

  const setSrc = (id, patch) => setSources((l) => l.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const runImageOcr = useCallback(
    (id, opts) => {
      chain.current = chain.current.then(async () => {
        const bmp = bitmaps.current[id];
        if (!bmp) return;
        setSrc(id, { status: 'loading', progress: 0, error: '' });
        try {
          const progress = ({ phase, value }) => setSrc(id, { status: phase === 'read' ? 'reading' : 'loading', progress: value });
          // a table with visible cell borders is read cell by cell (far more exact); otherwise read as plain text
          let table = null;
          if (!opts.forceText) {
            try {
              table = await runTableOcr(bmp, { rotate: opts.rotate, progress });
            } catch (e) {
              console.warn('table reader failed, using text reader', e);
            }
          }
          let parsed, text = '', confidence = 0;
          if (table && table.rows.length >= 1) {
            parsed = { rows: table.rows, unparsed: [] };
            confidence = 100;
          } else {
            const r = await runOcr(bmp, { ...opts, progress });
            parsed = parseOcrText(r.text);
            text = r.text;
            confidence = r.confidence;
          }
          setRows((cur) => cur.filter((r) => r.src !== id));
          setUnparsed((cur) => cur.filter((u) => u.src !== id));
          const n = addParsed(parsed, id);
          setSrc(id, { status: 'done', progress: 1, count: n, conf: confidence, text, table: !!(table && table.rows.length) });
        } catch (e) {
          console.error(e);
          setSrc(id, { status: 'error', error: String(e.message || e) });
        }
      });
    },
    [addParsed]
  );

  const handleFiles = useCallback(
    async (fileList) => {
      const files = [...fileList];
      for (const f of files) {
        if (f.size > MAX_MB * 1024 * 1024) {
          toast(t('file_too_big', { name: f.name, mb: MAX_MB }), 'error');
          continue;
        }
        const id = `s${sid++}`;
        if (IMG_RE.test(f.type) || /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i.test(f.name)) {
          let bmp;
          try {
            bmp = await loadBitmap(f);
          } catch (e) {
            toast(t('image_unreadable', { name: f.name }), 'error');
            continue;
          }
          bitmaps.current[id] = bmp;
          setSources((l) => [...l, { id, kind: 'image', name: f.name || 'photo', url: URL.createObjectURL(f), rotate: 0, mode: 'raw', status: 'queued', progress: 0, count: 0 }]);
          runImageOcr(id, { rotate: 0, mode: 'raw' });
        } else if (SHEET_RE.test(f.name)) {
          setSources((l) => [...l, { id, kind: 'sheet', name: f.name, status: 'reading', progress: 0.5, count: 0 }]);
          try {
            const XLSX = await import('xlsx');
            const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
            let total = 0;
            for (const name of wb.SheetNames) {
              const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
              total += addParsed(parseTable(aoa), id);
            }
            setSrc(id, { status: 'done', progress: 1, count: total });
          } catch (e) {
            console.error(e);
            setSrc(id, { status: 'error', error: String(e.message || e) });
          }
        } else if (TEXT_RE.test(f.name) || f.type.startsWith('text/')) {
          setSources((l) => [...l, { id, kind: 'text', name: f.name, status: 'reading', progress: 0.5, count: 0 }]);
          try {
            let text = await f.text();
            if (text.includes('�')) {
              // probably an Excel-exported Korean CSV (CP949)
              text = new TextDecoder('euc-kr').decode(await f.arrayBuffer());
            }
            const n = addParsed(parseText(text.replace(/^﻿/, '')), id);
            setSrc(id, { status: 'done', progress: 1, count: n });
          } catch (e) {
            setSrc(id, { status: 'error', error: String(e.message || e) });
          }
        } else {
          toast(t('unsupported_file', { name: f.name }), 'error');
        }
      }
    },
    [addParsed, runImageOcr, t, toast]
  );

  // Ctrl+V of an image (screenshot / photo) anywhere on this page
  useEffect(() => {
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.files || [])].filter((f) => IMG_RE.test(f.type));
      if (files.length) {
        e.preventDefault();
        handleFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleFiles]);

  const parsePasted = (text = paste) => {
    if (!text.trim()) return;
    const id = `s${sid++}`;
    const n = (() => {
      const parsed = parseText(text);
      setSources((l) => [...l, { id, kind: 'text', name: t('pasted_text'), status: 'done', progress: 1, count: parsed.rows.length }]);
      return addParsed(parsed, id);
    })();
    if (!n) toast(t('nothing_found'), 'error');
    setPaste('');
  };

  const rerun = (s, patch) => {
    const next = { rotate: s.rotate, mode: s.mode, ...patch };
    next.forceText = next.mode === 'bw';
    setSrc(s.id, { ...patch, status: 'queued', progress: 0 });
    runImageOcr(s.id, next);
  };

  const removeSource = (s) => {
    setSources((l) => l.filter((x) => x.id !== s.id));
    setRows((cur) => cur.filter((r) => r.src !== s.id));
    setUnparsed((cur) => cur.filter((u) => u.src !== s.id));
    if (s.url) URL.revokeObjectURL(s.url);
    delete bitmaps.current[s.id];
  };

  // ---------- evaluation of rows ----------
  const matchApt = useMemo(() => {
    return (name) => {
      let best = null, bestScore = 0, tie = false;
      for (const a of d.apartments) {
        const sc = similarity(name, a.name);
        if (sc > bestScore) { best = a; bestScore = sc; tie = false; }
        else if (sc === bestScore && sc > 0) tie = true;
      }
      return best && bestScore >= 0.5 && !tie ? best : null;
    };
  }, [d.apartments]);

  const index = useMemo(() => buildPlateIndex(d.cars), [d.cars]);
  const hasAptCol = rows.some((r) => r.apartment);

  // Every car is matched to its own apartment from the name in the list:
  //  1) similar to one you already have  → that apartment
  //  2) otherwise a NEW apartment (similar spellings are merged into one)
  //  3) no name read → same as the row above (flagged), else the default
  const aptPlan = useMemo(() => {
    const names = [];
    let prev = '';
    let prevSrc = null;
    rows.forEach((r) => {
      let nm = (r.apartment || '').trim();
      let guess = false;
      if (!nm && hasAptCol && prev && prevSrc === r.src) { nm = prev; guess = true; }
      if (nm && !guess) { prev = nm; prevSrc = r.src; }
      names.push({ nm, guess });
    });
    // canonical spellings for names that don't match an existing apartment: most frequent first
    const freq = new Map();
    names.forEach(({ nm }) => { if (nm && !matchApt(nm)) freq.set(nm, (freq.get(nm) || 0) + 1); });
    const canon = [];
    [...freq.entries()].sort((x, y) => y[1] - x[1]).forEach(([nm]) => {
      if (!canon.some((c) => similarity(c, nm) >= 0.6)) canon.push(nm);
    });
    return names.map(({ nm, guess }) => {
      if (!nm) return { key: null, label: '', isNew: false, guess };
      const m = matchApt(nm);
      if (m) return { key: m.id, label: m.name, isNew: false, guess };
      const c = canon.find((x) => similarity(x, nm) >= 0.6) || nm;
      return { key: 'new:' + normPlate(c), label: c, isNew: true, guess };
    });
  }, [rows, matchApt, hasAptCol]);

  const evaluated = useMemo(() => {
    const seen = new Set();
    return rows.map((r, i) => {
      const plan = aptPlan[i];
      const rowApt = plan.key || (aptId === '__new' ? null : aptId);
      const aptWarn = hasAptCol && (!r.apartment || plan.guess);
      const key = `${rowApt || ''}|${normPlate(r.plate)}`;
      const existing = rowApt && !String(rowApt).startsWith('new:') ? index.get(key.replace(/^new:/, '')) : null;
      let status = 'new';
      if (!r.plate.trim()) status = 'empty';
      else if (seen.has(key)) status = 'repeat';
      else if (existing) status = existing.is_active === false ? 'paused' : 'dup';
      if (r.plate.trim()) seen.add(key);
      const defInclude = status === 'new' || (status === 'paused' && reactivate);
      return { ...r, status, existing, rowApt, aptLabel: plan.label, aptIsNew: plan.isNew, aptWarn, include: r.include ?? defInclude };
    });
  }, [rows, aptPlan, aptId, index, reactivate, hasAptCol]);

  // apartments found in the list, with how many cars each has
  const groups = useMemo(() => {
    const m = new Map();
    evaluated.forEach((r, i) => {
      const plan = aptPlan[i];
      const key = plan.key || '__none';
      if (!m.has(key)) m.set(key, { key, label: plan.label, isNew: plan.isNew, count: 0, rids: [] });
      const g = m.get(key);
      g.count++;
      g.rids.push(r.rid);
    });
    return [...m.values()];
  }, [evaluated, aptPlan]);

  const assignRids = (rids, workerId) => {
    const set = new Set(rids);
    setRows((cur) => cur.map((r) => (set.has(r.rid) ? { ...r, workerOverride: workerId } : r)));
  };
  const renameGroup = (rids, name) => {
    const set = new Set(rids);
    setRows((cur) => cur.map((r) => (set.has(r.rid) ? { ...r, apartment: name } : r)));
  };
  const assignAll = (v) => {
    if (v === '__keep') return;
    if (v === 'auto') {
      setDefWorker('auto');
      setRows((cur) => cur.map((r) => ({ ...r, workerOverride: undefined })));
      return;
    }
    setDefWorker('none');
    setRows((cur) => cur.map((r) => (r.include === false ? r : { ...r, workerOverride: v })));
  };

  const counts = useMemo(() => {
    const c = { add: 0, react: 0, dup: 0, skip: 0 };
    evaluated.forEach((r) => {
      if (!r.include || r.status === 'empty') c.skip++;
      else if (r.status === 'paused' && r.existing) c.react++;
      else c.add++;
      if (r.status === 'dup' || r.status === 'repeat') c.dup++;
    });
    return c;
  }, [evaluated]);

  const upd = (rid, patch) => setRows((cur) => cur.map((r) => (r.rid === rid ? { ...r, ...patch } : r)));
  const del = (rid) => setRows((cur) => cur.filter((r) => r.rid !== rid));

  const pages = Math.max(1, Math.ceil(evaluated.length / PAGE));
  const pg = Math.min(page, pages - 1);
  const pageRows = evaluated.slice(pg * PAGE, pg * PAGE + PAGE);

  const setAllInclude = (v) => setRows((cur) => cur.map((r, i) => ({ ...r, include: v ? (evaluated[i].status === 'empty' ? false : true) : false })));

  // ---------- import ----------
  const doImport = async () => {
    const picked = evaluated.filter((r) => r.include && r.plate.trim());
    if (!picked.length) return toast(t('nothing_selected'), 'error');
    if (aptId === '__new' && !newApt.trim() && picked.some((r) => !r.rowApt)) return toast(t('apartment_required'), 'error');
    if (picked.some((r) => r.status === 'dup' || r.status === 'repeat')) {
      if (!(await confirm({ message: t('import_dups_confirm') }))) return;
    }
    setImporting(true);
    setProg([0, picked.length]);
    try {
      let targetApt = aptId;
      if (aptId === '__new' && picked.some((r) => !r.rowApt)) {
        const a = await d.addApartment(newApt);
        targetApt = a.id;
      }
      // create the apartments that were read from the list and don't exist yet
      const created = {};
      for (const r of picked) {
        if (r.rowApt && String(r.rowApt).startsWith('new:') && !created[r.rowApt]) {
          const a = await d.addApartment(r.aptLabel);
          created[r.rowApt] = a.id;
        }
      }
      const nameToWorker = {};
      d.workers.forEach((w) => (nameToWorker[w.name.trim().toLowerCase()] = w.id));

      // group by apartment (a column in the file can name the apartment)
      const groups = new Map();
      for (const r of picked) {
        const a = created[r.rowApt] || r.rowApt || targetApt;
        if (!groups.has(a)) groups.set(a, []);
        groups.get(a).push(r);
      }
      const total = { added: 0, reactivated: 0, failed: 0, errors: [], newCars: [], reactivatedIds: [] };
      let doneSoFar = 0;
      for (const [a, list] of groups) {
        const res = await importCars({
          bossId: d.boss.id,
          apartmentId: a,
          rows: list.map((r) => ({
            plate: r.plate,
            model: r.model,
            color: r.color,
            block: r.block,
            location: r.location,
            phone: r.phone,
            remarks: r.remarks,
            entryTime: r.entryTime,
            days: r.days,
            workerId:
              r.workerOverride !== undefined
                ? r.workerOverride || null
                : nameToWorker[(r.worker || '').trim().toLowerCase()] || (defWorker !== 'none' && defWorker !== 'auto' ? defWorker : null),
            reactivateId: r.status === 'paused' && r.existing ? r.existing.id : null,
          })),
          defaults: { days, weekPattern: pattern },
          weekStart: d.weekStart,
          onProgress: (x) => setProg([doneSoFar + x, picked.length]),
        });
        doneSoFar += list.length;
        total.added += res.added;
        total.reactivated += res.reactivated;
        total.failed += res.failed;
        total.errors.push(...res.errors);
        total.newCars.push(...res.newCars);
        total.reactivatedIds.push(...res.reactivatedIds);
      }

      let distributed = 0;
      if (defWorker === 'auto' && d.workers.length) {
        const targets = total.newCars.filter((c) => !c.assigned_worker_id);
        if (targets.length) {
          const map = autoDistribute(targets, d.workers.map((w) => w.id));
          await applyDistribution(map, d.weekStart);
          distributed = Object.keys(map).length;
        }
      }
      await d.reload({ silent: true });
      setResult({ ...total, distributed });
      setRows([]);
      setUnparsed([]);
      setSources((l) => {
        l.forEach((s) => s.url && URL.revokeObjectURL(s.url));
        return [];
      });
      bitmaps.current = {};
    } catch (e) {
      console.error(e);
      toast(t('err_save') + (e.message ? `: ${e.message}` : ''), 'error');
    } finally {
      setImporting(false);
    }
  };

  const justFinished = sources.filter((x) => x.status === 'done' && x.count > 0).length;
  useEffect(() => {
    if (justFinished && reviewRef.current) reviewRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [justFinished]);

  const busyOcr = sources.some((s) => ['queued', 'loading', 'reading'].includes(s.status));

  // ---------- result screen ----------
  if (result) {
    return (
      <div className="mx-auto max-w-xl pt-6">
        <Card>
          <div className="py-4 text-center">
            <div className="flex justify-center text-emerald-500"><Icon name="done" className="h-14 w-14" strokeWidth={1.5} /></div>
            <h2 className="mt-3 text-xl font-bold">{t('import_done')}</h2>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <Stat label={t('imp_added')} value={result.added} tone="text-emerald-600" />
              <Stat label={t('imp_reactivated')} value={result.reactivated} tone="text-sky-700" />
              <Stat label={t('imp_failed')} value={result.failed} tone={result.failed ? 'text-red-600' : 'text-slate-400'} />
            </div>
            {result.distributed > 0 && <p className="mt-3 text-sm text-slate-500">{t('distributed', { n: result.distributed })}</p>}
            {result.errors.length > 0 && (
              <div className="mt-4 max-h-32 overflow-auto rounded-lg bg-red-50 p-3 text-left text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                {result.errors.slice(0, 8).map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
            <div className="mt-6 flex justify-center gap-2">
              <Button onClick={() => setResult(null)}>{t('import_more')}</Button>
              <Button variant="primary" onClick={() => go('cars')}>
                {t('view_cars')}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 pb-24">
      <div>
        <h1 className="text-2xl font-bold">{t('import_title')}</h1>
        <p className="text-sm text-slate-500">{t('import_sub')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* source */}
        <Card className="lg:col-span-2" title={t('step1')}>
          <div className="mb-3 flex gap-2">
            <Chip active={tab === 'upload'} onClick={() => setTab('upload')}>
              <Icon name="camera" /> {t('tab_upload')}
            </Chip>
            <Chip active={tab === 'paste'} onClick={() => setTab('paste')}>
              <Icon name="clipboard" /> {t('tab_paste')}
            </Chip>
          </div>

          {tab === 'upload' ? (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  handleFiles(e.dataTransfer.files);
                }}
                onClick={() => fileInput.current?.click()}
                className={cx(
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors',
                  drag ? 'border-sky-500 bg-sky-50 dark:bg-sky-950' : 'border-slate-300 hover:border-sky-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50'
                )}
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-950"><Icon name="camera" className="h-8 w-8" strokeWidth={1.75} /></div>
                <div className="text-base font-semibold">{t('drop_title')}</div>
                <div className="max-w-md text-xs text-slate-500">{t('drop_hint')}</div>
                <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button variant="primary" onClick={() => fileInput.current?.click()}>
                    {t('choose_files')}
                  </Button>
                  <Button className="sm:hidden" onClick={() => camInput.current?.click()}>
                    <Icon name="camera" /> {t('take_photo')}
                  </Button>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept="image/*,.xlsx,.xls,.xlsm,.csv,.tsv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={camInput}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>
            </>
          ) : (
            <div>
              <textarea
                className={cx(inputCls, 'h-44 font-mono text-xs')}
                placeholder={t('paste_ph')}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                onPaste={(e) => {
                  const txt = e.clipboardData?.getData('text');
                  if (txt && txt.includes('\n')) {
                    e.preventDefault();
                    parsePasted(txt);
                  }
                }}
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-slate-500">{t('paste_hint')}</p>
                <Button variant="primary" onClick={() => parsePasted()} disabled={!paste.trim()}>
                  {t('read_text')}
                </Button>
              </div>
            </div>
          )}

          {sources.length > 0 && (
            <ul className="mt-4 space-y-2">
              {sources.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                  {s.url ? (
                    <button onClick={() => setLightbox(s)} title={t('view_photo')}>
                      <img src={s.url} alt="" className="h-14 w-14 rounded object-cover" />
                    </button>
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded bg-slate-100 text-2xl dark:bg-slate-800"><Icon name={s.kind === 'sheet' ? 'sheet' : 'file'} className="h-7 w-7" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.name}</div>
                    {s.status === 'done' ? (
                      <div className="text-xs text-slate-500">
                        <span className={s.count ? 'font-semibold text-emerald-600' : 'font-semibold text-amber-600'}>{t('found_n', { n: s.count })}</span>
                        {s.kind === 'image' && s.conf !== undefined && s.conf < 55 && <span className="ml-2 text-amber-600">· {t('blurry_hint')}</span>}
                        {s.kind === 'image' && s.count === 0 && <span className="ml-2 text-amber-600">· {t('zero_hint')}</span>}
                      </div>
                    ) : s.status === 'error' ? (
                      <div className="truncate text-xs text-red-600">{t('read_failed')}: {s.error}</div>
                    ) : (
                      <div className="mt-1">
                        <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                          <Spinner className="h-3 w-3" />
                          {s.status === 'queued' ? t('queued') : s.status === 'loading' ? t('loading_engine') : t('reading_photo')}
                        </div>
                        <Progress tone="blue" value={(s.progress || 0) * 100} className="h-1.5" />
                      </div>
                    )}
                  </div>
                  {s.kind === 'image' && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" disabled={['queued', 'loading', 'reading'].includes(s.status)} onClick={() => rerun(s, { rotate: (s.rotate + 90) % 360 })} title={t('rotate')}>
                        <Icon name="refresh" className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant={s.mode === 'bw' ? 'soft' : 'ghost'} disabled={['queued', 'loading', 'reading'].includes(s.status)} onClick={() => rerun(s, { mode: s.mode === 'bw' ? 'raw' : 'bw' })} title={t('bw_mode_hint')}>
                        {t('bw_mode')}
                      </Button>
                    </div>
                  )}
                  <Button size="sm" variant="plain" onClick={() => removeSource(s)} aria-label="remove">
                    <Icon name="x" className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {sources.some((s) => s.kind === 'image') && <p className="mt-3 text-xs text-slate-500"><Icon name="bulb" className="h-3.5 w-3.5 text-amber-500" /> {t('ocr_tip')}</p>}
        </Card>

        {/* settings */}
        <Card title={t('step2')}>
          <div className="space-y-4">
            <Field label={t('apartment')}>
              <Select value={aptId} onChange={(e) => setAptId(e.target.value)}>
                {d.apartments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                <option value="__new">+ {t('new_apartment')}</option>
              </Select>
              {aptId === '__new' && <input className={cx(inputCls, 'mt-2')} placeholder={t('apartment_name')} value={newApt} onChange={(e) => setNewApt(e.target.value)} />}
              <p className="mt-1 text-xs text-slate-500">{t('apt_auto_hint')}</p>
            </Field>
            <div>
              <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">{t('wash_days')}</div>
              <DayChips value={days} onChange={setDays} />
              <p className="mt-1 text-xs text-slate-500">{t('days_hint')}</p>
              <Select className="mt-2" value={pattern} onChange={(e) => setPattern(e.target.value)}>
                <option value="every">{t('pat_every')}</option>
                <option value="1/3">{t('pat_13')}</option>
                <option value="2/4">{t('pat_24')}</option>
              </Select>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={reactivate} onChange={(e) => setReactivate(e.target.checked)} />
              <span>
                {t('reactivate_paused')}
                <span className="block text-xs text-slate-500">{t('reactivate_hint')}</span>
              </span>
            </label>
          </div>
        </Card>
      </div>

      {/* review */}
      {(rows.length > 0 || unparsed.length > 0 || busyOcr) && (
        <div ref={reviewRef} className="scroll-mt-4">
        <Card
          title={
            <span className="flex flex-wrap items-center gap-2">
              {t('step3')}
              <Badge tone="green">{t('c_new', { n: counts.add })}</Badge>
              {counts.react > 0 && <Badge tone="blue">{t('c_react', { n: counts.react })}</Badge>}
              {counts.dup > 0 && <Badge tone="amber">{t('c_dup', { n: counts.dup })}</Badge>}
            </span>
          }
          right={
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setAllInclude(true)}>
                {t('select_all')}
              </Button>
              <Button size="sm" onClick={() => setAllInclude(false)}>
                {t('select_none')}
              </Button>
              <Button size="sm" variant="plain" onClick={() => setRows([])}>
                {t('clear')}
              </Button>
            </div>
          }
          pad={false}
        >
          {rows.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">{busyOcr ? <><Spinner /> {t('reading_photo')}</> : t('nothing_found')}</div>
          ) : (
            <>
            <div className="space-y-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold"><Icon name="users" className="h-4 w-4 text-sky-600" /> {t('who_washes')}</span>
                <Select className="!w-auto min-w-[200px]" value="__keep" onChange={(e) => assignAll(e.target.value)}>
                  <option value="__keep">{t('assign_all_to')}</option>
                  {d.workers.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                  {d.workers.length > 1 && <option value="auto">{t('auto_distribute_all')}</option>}
                  <option value="">{t('unassigned')}</option>
                </Select>
                {defWorker === 'auto' && <Badge tone="blue">{t('auto_distribute_all')}</Badge>}
                {d.workers.length === 0 && <span className="text-xs text-slate-500">{t('no_workers_yet')}</span>}
              </div>
              {hasAptCol && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><Icon name="building" className="h-4 w-4 text-sky-600" /> {t('apts_found', { n: groups.length })}</div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {groups.map((g) => (
                      <GroupCard key={g.key} g={g} t={t} workers={d.workers} onRename={(name) => renameGroup(g.rids, name)} onAssign={(w) => assignRids(g.rids, w)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="thin-scroll max-h-[60vh] overflow-auto">
              <datalist id="apt-names">{d.apartments.map((a) => <option key={a.id} value={a.name} />)}</datalist>
              <table className="w-full min-w-[1000px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800">
                  <tr>
                    <th className="w-10 px-3 py-2" />
                    <th className="w-10 px-1 text-left">#</th>
                    <th className="px-1 text-left">{t('col_plate')}</th>
                    <th className="px-1 text-left">{t('col_model')}</th>
                    <th className="px-1 text-left">{t('col_color')}</th>
                    <th className="px-1 text-left">{t('col_block')}</th>
                    <th className="px-1 text-left">{t('col_location')}</th>
                    <th className="px-1 text-left">{t('wash_days')}</th>
                    <th className="px-1 text-left">{t('phone')}</th>
                    {hasAptCol && <th className="px-1 text-left">{t('apartment')}</th>}
                    <th className="px-1 text-left">{t('col_worker')}</th>
                    <th className="px-2 text-left">{t('col_status')}</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => (
                    <tr key={r.rid} className={cx('border-b border-slate-100 dark:border-slate-800', !r.include && 'opacity-50')}>
                      <td className="px-3">
                        <input type="checkbox" checked={r.include && r.status !== 'empty'} disabled={r.status === 'empty'} onChange={(e) => upd(r.rid, { include: e.target.checked })} />
                      </td>
                      <td className="px-1 text-xs text-slate-400">{pg * PAGE + i + 1}</td>
                      <td className="px-1 py-1">
                        <input className={cx('w-32 rounded border bg-transparent px-1.5 py-1 font-mono text-sm outline-none focus:border-sky-500', r.warn.includes('format') || r.warn.includes('letter') ? 'border-amber-400' : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600')} value={r.plate} onChange={(e) => upd(r.rid, { plate: e.target.value, warn: [], include: undefined })} />
                      </td>
                      {['model', 'color', 'block', 'location'].map((k) => (
                        <td key={k} className="px-1 py-1">
                          <input className={cx('rounded border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none hover:border-slate-300 focus:border-sky-500 dark:hover:border-slate-600', k === 'model' ? 'w-32' : k === 'phone' ? 'w-28' : 'w-20', r.warn.includes(k) && 'border-amber-400')} value={r[k] || ''} onChange={(e) => upd(r.rid, { [k]: e.target.value })} />
                        </td>
                      ))}
                      <td className="px-1 py-1">
                        <input
                          key={r.rid + (r.days || []).join('')}
                          className={cx('w-24 rounded border bg-transparent px-1.5 py-1 text-sm outline-none focus:border-sky-500', r.warn.includes('days') ? 'border-amber-400' : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600')}
                          defaultValue={(r.days || []).join(',')}
                          placeholder={t('default')}
                          onBlur={(e) => {
                            const v = e.target.value.replace(/\(.*?\)/g, '').trim();
                            upd(r.rid, { days: v ? parseDaysToken(v) || r.days : null, warn: r.warn.filter((x) => x !== 'days') });
                          }}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input className="w-28 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none hover:border-slate-300 focus:border-sky-500 dark:hover:border-slate-600" value={r.phone || ''} onChange={(e) => upd(r.rid, { phone: e.target.value })} />
                      </td>
                      {hasAptCol && (
                        <td className="px-1 text-xs">
                          <input
                            list="apt-names"
                            className={cx('w-32 rounded border bg-transparent px-1.5 py-1 text-sm outline-none focus:border-sky-500', r.aptWarn ? 'border-amber-400' : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600')}
                            value={r.apartment || ''}
                            placeholder={r.aptLabel || ''}
                            onChange={(e) => upd(r.rid, { apartment: e.target.value })}
                          />
                          {r.aptIsNew && <div className="px-1 text-[10px] text-sky-600"><Icon name="plus" className="h-3 w-3" /> {t('new_apartment')}</div>}
                        </td>
                      )}
                      <td className="px-1">
                        <select
                          className="w-28 rounded border border-transparent bg-transparent px-1 py-1 text-sm outline-none hover:border-slate-300 dark:hover:border-slate-600"
                          value={r.workerOverride === undefined ? '__def' : r.workerOverride}
                          onChange={(e) => upd(r.rid, { workerOverride: e.target.value === '__def' ? undefined : e.target.value })}
                        >
                          <option value="__def">{t('default')}</option>
                          <option value="">{t('unassigned')}</option>
                          {d.workers.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2">
                        <StatusBadge r={r} t={t} />
                      </td>
                      <td className="px-1">
                        <button className="rounded px-1.5 py-1 text-slate-400 hover:bg-slate-200 hover:text-red-600 dark:hover:bg-slate-700" onClick={() => del(r.rid)} aria-label="remove row">
                          <Icon name="x" className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm dark:border-slate-800">
              <span className="text-slate-500">{evaluated.length}</span>
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={pg === 0} onClick={() => setPage(pg - 1)}>
                  <Icon name="left" className="h-4 w-4" />
                </Button>
                <span className="tabular-nums">
                  {pg + 1} / {pages}
                </span>
                <Button size="sm" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>
                  <Icon name="right" className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          {unparsed.length > 0 && (
            <details className="border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
              <summary className="cursor-pointer font-medium text-amber-700 dark:text-amber-400">{t('unparsed_n', { n: unparsed.length })}</summary>
              <p className="my-2 text-xs text-slate-500">{t('unparsed_hint')}</p>
              <ul className="space-y-1">
                {unparsed.map((u) => (
                  <li key={u.id} className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1 dark:bg-slate-800">
                    <span className="flex-1 truncate font-mono text-xs">{u.line}</span>
                    <Button
                      size="sm"
                      onClick={() => {
                        setRows((cur) => [...cur, { ...newRow(u.line), plate: u.line.replace(/\s+/g, '').slice(0, 20), warn: ['format'], src: u.src }]);
                        setUnparsed((cur) => cur.filter((x) => x.id !== u.id));
                      }}
                    >
                      <Icon name="plus" /> {t('add_as_row')}
                    </Button>
                    <Button size="sm" variant="plain" onClick={() => setUnparsed((cur) => cur.filter((x) => x.id !== u.id))}>
                      <Icon name="x" className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
        </div>
      )}

      {/* sticky import bar */}
      {rows.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:left-60">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              {importing ? (
                <div className="flex items-center gap-3">
                  <Spinner /> {t('importing')} {prog[0]}/{prog[1]}
                  <Progress tone="blue" className="w-40" value={prog[1] ? (prog[0] / prog[1]) * 100 : 0} />
                </div>
              ) : (
                <span>
                  <b>{counts.add}</b> {t('will_add')}
                  {counts.react > 0 && <>, <b>{counts.react}</b> {t('will_reactivate')}</>}
                  {counts.skip > 0 && <span className="text-slate-500">, {counts.skip} {t('will_skip')}</span>}
                </span>
              )}
            </div>
            <Button variant="primary" size="lg" disabled={importing || busyOcr || counts.add + counts.react === 0} onClick={doImport}>
              {t('import_btn', { n: counts.add + counts.react })}
            </Button>
          </div>
        </div>
      )}

      <Modal open={!!lightbox} onClose={() => setLightbox(null)} title={lightbox?.name || ''} width="max-w-4xl">
        {lightbox && <img src={lightbox.url} alt="" className="mx-auto max-h-[75vh] w-auto rounded" style={{ transform: `rotate(${lightbox.rotate || 0}deg)` }} />}
      </Modal>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
      <div className={cx('text-3xl font-bold tabular-nums', tone)}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function StatusBadge({ r, t }) {
  if (r.status === 'empty') return <Badge tone="red">{t('st_no_plate')}</Badge>;
  if (r.status === 'dup') return <Badge tone="amber">{t('st_dup')}</Badge>;
  if (r.status === 'repeat') return <Badge tone="amber">{t('st_repeat')}</Badge>;
  if (r.status === 'paused') return <Badge tone="blue">{t('st_react')}</Badge>;
  if (['format', 'color', 'location', 'block', 'days'].some((w) => r.warn.includes(w))) return <Badge tone="amber">{t('st_check')}</Badge>;
  if (r.warn.includes('letter') || r.warn.includes('fixed')) return <Badge tone="amber">{t('st_check')}</Badge>;
  return <Badge tone="green">{t('st_new')}</Badge>;
}

function GroupCard({ g, t, workers, onRename, onAssign }) {
  const [name, setName] = useState(g.label);
  useEffect(() => setName(g.label), [g.label]);
  const none = g.key === '__none';
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        {none ? (
          <span className="flex-1 truncate text-sm text-slate-500">{t('default')}</span>
        ) : (
          <input
            list="apt-names"
            className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:border-slate-300 focus:border-sky-500 dark:hover:border-slate-600"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== g.label && onRename(name.trim())}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        )}
        <span className="whitespace-nowrap text-xs tabular-nums text-slate-500">{g.count} {t('cars_unit')}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {g.isNew && <Badge tone="blue">{t('new_apartment')}</Badge>}
        <select
          className="ml-auto w-32 rounded border border-slate-200 bg-transparent px-1 py-1 text-xs outline-none dark:border-slate-700"
          defaultValue="__keep"
          key={g.rids.length + g.key}
          onChange={(e) => onAssign(e.target.value)}
        >
          <option value="__keep">{t('assign_to')}</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
          <option value="">{t('unassigned')}</option>
        </select>
      </div>
    </div>
  );
}
