import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './lib/supabase.js';
import * as db from './lib/data.js';
import { getWeekStart } from './lib/dates.js';
import { useUi } from './components/ui.jsx';
import { useT } from './lib/i18n.jsx';
import { isJobDueToday } from './lib/schedule.js';

const DashCtx = createContext(null);
export const useDash = () => useContext(DashCtx);

const read = (k, fb) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? fb : v;
  } catch (e) {
    return fb;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch (e) {
    /* ignore */
  }
};

export function DashProvider({ boss, children }) {
  const { toast } = useUi();
  const t = useT();
  const [data, setData] = useState({ apartments: [], workers: [], cars: [], jobs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [live, setLive] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [apt, setAptState] = useState(() => read(`chancha_web_apt_${boss.id}`, 'all'));
  const [bossRow, setBossRow] = useState(boss);

  const weekStartRef = useRef(weekStart);
  weekStartRef.current = weekStart;
  const dataRef = useRef(data);
  dataRef.current = data;
  const busy = useRef(false);

  const reload = useCallback(
    async ({ silent = false } = {}) => {
      if (busy.current) return;
      busy.current = true;
      if (!silent) setLoading(true);
      try {
        const ws = getWeekStart();
        const d = await db.loadAll(boss.id, ws);
        setData(d);
        setWeekStart(ws);
        setError('');
        setLastSync(new Date());
      } catch (e) {
        console.error(e);
        setError(e.message || String(e));
        if (!silent) toast(t('err_load'), 'error');
      } finally {
        busy.current = false;
        setLoading(false);
      }
    },
    [boss.id, toast, t]
  );

  const refreshBoss = useCallback(async () => {
    const { data: row } = await supabase.from('users').select('*').eq('id', boss.id).maybeSingle();
    if (row) setBossRow(row);
  }, [boss.id]);

  const refreshJobs = useCallback(async () => {
    try {
      const ws = getWeekStart();
      const jobs = await db.loadJobs(boss.id, ws);
      setData((d) => ({ ...d, jobs: jobs.length ? jobs : d.jobs }));
      setLastSync(new Date());
    } catch (e) {
      /* ignore transient errors */
    }
  }, [boss.id]);

  const refreshWorkers = useCallback(async () => {
    try {
      const workers = await db.loadWorkers(boss.id);
      setData((d) => ({ ...d, workers }));
      refreshBoss();
    } catch (e) {
      /* ignore */
    }
  }, [boss.id, refreshBoss]);

  useEffect(() => {
    reload();
  }, [reload]);

  // realtime + fallbacks
  useEffect(() => {
    let timers = {};
    const later = (key, fn, ms = 500) => {
      clearTimeout(timers[key]);
      timers[key] = setTimeout(fn, ms);
    };
    const ch = supabase
      .channel(`dash-${boss.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wash_jobs' }, (p) => {
        const carId = p.new?.car_id || p.old?.car_id;
        if (carId && !dataRef.current.cars.some((c) => c.id === carId)) return;
        later('jobs', refreshJobs);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (p) => {
        const row = p.new || {};
        if (row.boss_id && row.boss_id !== boss.id) return;
        later('workers', refreshWorkers);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cars' }, (p) => {
        const row = p.new || {};
        if (row.boss_id && row.boss_id !== boss.id) return;
        later('cars', () => reload({ silent: true }), 800);
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));

    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') {
        if (getWeekStart() !== weekStartRef.current) reload({ silent: true });
        else refreshJobs();
      }
    }, 30000);
    const onFocus = () => {
      if (getWeekStart() !== weekStartRef.current) reload({ silent: true });
      else refreshJobs();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      Object.values(timers).forEach(clearTimeout);
      clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      supabase.removeChannel(ch);
    };
  }, [boss.id, reload, refreshJobs, refreshWorkers]);

  // ---------- derived ----------
  const derived = useMemo(() => {
    const carById = {};
    data.cars.forEach((c) => (carById[c.id] = c));
    const jobByCar = {};
    data.jobs.forEach((j) => (jobByCar[j.car_id] = j));
    const workerById = {};
    data.workers.forEach((w) => (workerById[w.id] = w));
    const aptById = {};
    data.apartments.forEach((a) => (aptById[a.id] = a));
    const selApt = apt === 'all' || aptById[apt] ? apt : 'all';
    const visibleCars = selApt === 'all' ? data.cars : data.cars.filter((c) => c.apartment_id === selApt);
    const blocks = [...new Set(visibleCars.map((c) => c.block_name).filter(Boolean))].sort((a, b) =>
      String(a).localeCompare(String(b), 'ko', { numeric: true })
    );
    return { carById, jobByCar, workerById, aptById, selApt, visibleCars, blocks };
  }, [data, apt]);

  const setApt = (id) => {
    setAptState(id);
    write(`chancha_web_apt_${boss.id}`, id);
  };

  // ---------- mutations (optimistic, with rollback) ----------
  const patchJobsLocal = (ids, patchFn) =>
    setData((d) => ({ ...d, jobs: d.jobs.map((j) => (ids.has(j.id) ? { ...j, ...patchFn(j) } : j)) }));

  const doneBy = (car, job) => job?.assigned_worker_id || car?.assigned_worker_id || boss.id;

  const markDone = async (carId) => {
    const { carById, jobByCar } = derived;
    let job = jobByCar[carId];
    const car = carById[carId];
    if (!car) return;
    try {
      if (!job) {
        const created = await db.ensureWeeklyJobs([car], [], weekStart);
        job = created[0];
        if (!job) {
          await reload({ silent: true });
          return;
        }
        setData((d) => ({ ...d, jobs: [...d.jobs, job] }));
      }
      const by = doneBy(car, job);
      const prev = { status: job.status, done_by_worker_id: job.done_by_worker_id, done_at: job.done_at };
      patchJobsLocal(new Set([job.id]), () => ({ status: 'done', done_by_worker_id: by, done_at: new Date().toISOString() }));
      try {
        await db.setJobDone(job, by);
      } catch (e) {
        patchJobsLocal(new Set([job.id]), () => prev);
        throw e;
      }
    } catch (e) {
      toast(t('err_save') + (e.message ? `: ${e.message}` : ''), 'error');
    }
  };

  const undoDone = async (carId) => {
    const job = derived.jobByCar[carId];
    if (!job) return;
    const prev = { status: job.status, done_by_worker_id: job.done_by_worker_id, done_at: job.done_at };
    patchJobsLocal(new Set([job.id]), () => ({ status: 'pending', done_by_worker_id: null, done_at: null }));
    try {
      await db.setJobUndone(job);
    } catch (e) {
      patchJobsLocal(new Set([job.id]), () => prev);
      toast(t('err_save'), 'error');
    }
  };

  const markManyDone = async (carIds) => {
    const targets = carIds
      .map((id) => ({ car: derived.carById[id], job: derived.jobByCar[id] }))
      .filter((x) => x.car && x.job && x.job.status !== 'done');
    if (!targets.length) return 0;
    const ids = new Set(targets.map((x) => x.job.id));
    const now = new Date().toISOString();
    const byJob = {};
    targets.forEach((x) => (byJob[x.job.id] = doneBy(x.car, x.job)));
    patchJobsLocal(ids, (j) => ({ status: 'done', done_by_worker_id: byJob[j.id], done_at: now }));
    try {
      await db.setJobsDone(targets.map((x) => x.job), (j) => byJob[j.id]);
      return targets.length;
    } catch (e) {
      toast(t('err_save'), 'error');
      refreshJobs();
      return 0;
    }
  };

  const patchJob = async (carId, patch) => {
    const job = derived.jobByCar[carId];
    if (!job) return;
    const prev = {};
    Object.keys(patch).forEach((k) => (prev[k] = job[k] ?? null));
    patchJobsLocal(new Set([job.id]), () => patch);
    try {
      await db.updateJob(job.id, patch);
    } catch (e) {
      patchJobsLocal(new Set([job.id]), () => prev);
      toast(t('err_save') + (e.message ? `: ${e.message}` : ''), 'error');
      throw e;
    }
  };

  const patchCar = async (id, patch) => {
    const car = derived.carById[id];
    if (!car) return;
    const prev = {};
    Object.keys(patch).forEach((k) => (prev[k] = car[k] ?? null));
    setData((d) => ({ ...d, cars: d.cars.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
    try {
      await db.updateCar(id, patch);
    } catch (e) {
      setData((d) => ({ ...d, cars: d.cars.map((c) => (c.id === id ? { ...c, ...prev } : c)) }));
      toast(t('err_save') + (e.message ? `: ${e.message}` : ''), 'error');
      throw e;
    }
  };

  const assign = async (carIds, workerId) => {
    const set = new Set(carIds);
    const wid = workerId || null;
    setData((d) => ({
      ...d,
      cars: d.cars.map((c) => (set.has(c.id) ? { ...c, assigned_worker_id: wid } : c)),
      jobs: d.jobs.map((j) => (set.has(j.car_id) && j.status !== 'done' ? { ...j, assigned_worker_id: wid } : j)),
    }));
    try {
      await db.assignWorker(carIds, wid, weekStart);
    } catch (e) {
      toast(t('err_save') + (e.message ? `: ${e.message}` : ''), 'error');
      reload({ silent: true });
    }
  };

  const distribute = async (carIds, workerIds) => {
    const cars = carIds.map((id) => derived.carById[id]).filter(Boolean);
    const map = db.autoDistribute(cars, workerIds);
    const setBy = {};
    Object.entries(map).forEach(([cid, w]) => (setBy[cid] = w));
    setData((d) => ({
      ...d,
      cars: d.cars.map((c) => (setBy[c.id] ? { ...c, assigned_worker_id: setBy[c.id] } : c)),
      jobs: d.jobs.map((j) => (setBy[j.car_id] && j.status !== 'done' ? { ...j, assigned_worker_id: setBy[j.car_id] } : j)),
    }));
    try {
      await db.applyDistribution(map, weekStart);
      return Object.keys(map).length;
    } catch (e) {
      toast(t('err_save'), 'error');
      reload({ silent: true });
      return 0;
    }
  };

  const setCarsActive = async (carIds, active) => {
    const set = new Set(carIds);
    setData((d) => ({ ...d, cars: d.cars.map((c) => (set.has(c.id) ? { ...c, is_active: active } : c)) }));
    try {
      await db.setActive(carIds, active);
      if (active) reload({ silent: true });
    } catch (e) {
      toast(t('err_save'), 'error');
      reload({ silent: true });
    }
  };

  const removeCars = async (carIds) => {
    try {
      await db.deleteCars(carIds);
      const set = new Set(carIds);
      setData((d) => ({
        ...d,
        cars: d.cars.filter((c) => !set.has(c.id)),
        jobs: d.jobs.filter((j) => !set.has(j.car_id)),
      }));
      return true;
    } catch (e) {
      toast(t('err_save') + (e.message ? `: ${e.message}` : ''), 'error');
      reload({ silent: true });
      return false;
    }
  };

  const addApartment = async (name) => {
    const a = await db.createApartment(boss.id, name);
    setData((d) => ({ ...d, apartments: [...d.apartments, a] }));
    return a;
  };

  const value = {
    boss: bossRow,
    refreshBoss,
    ...data,
    ...derived,
    weekStart,
    loading,
    error,
    live,
    lastSync,
    reload,
    refreshJobs,
    refreshWorkers,
    apt: derived.selApt,
    setApt,
    markDone,
    undoDone,
    markManyDone,
    patchJob,
    patchCar,
    assign,
    distribute,
    setCarsActive,
    removeCars,
    addApartment,
  };
  return <DashCtx.Provider value={value}>{children}</DashCtx.Provider>;
}

// ---------- status helpers ----------

export function carStatus(car, job, date = new Date()) {
  if (car.is_active === false) return 'paused';
  if (!job) return 'pending';
  if (job.skip) return 'skipped';
  if (job.status === 'done') return 'done';
  if (job.missing) return 'missing';
  return 'pending';
}

export function dueTonight(car, job, date = new Date()) {
  if (car.is_active === false) return false;
  return isJobDueToday(job, car, date);
}
