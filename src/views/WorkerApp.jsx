import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../lib/i18n.jsx';
import { Badge, Button, Progress, Spinner, cx, useUi } from '../components/ui.jsx';
import { LangToggle, DarkToggle, Logo } from '../components/Controls.jsx';
import { supabase } from '../lib/supabase.js';
import { loadWorkerData, loadParkingInfo, setJobDone, setJobUndone, updateJob, workerStillExists } from '../lib/data.js';
import { getWeekStart, fmtTime } from '../lib/dates.js';
import { isJobDueToday } from '../lib/schedule.js';
import { Icon } from '../components/icons.jsx';

export default function WorkerApp({ worker, onLogout }) {
  const t = useT();
  const { toast, confirm } = useUi();
  const [data, setData] = useState(null);
  const [parking, setParking] = useState({});
  const [all, setAll] = useState(false);
  const [tab, setTab] = useState('todo');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(
    async (silent) => {
      try {
        if (!(await workerStillExists(worker.id))) {
          toast(t('worker_removed_by_boss'), 'error');
          onLogout();
          return;
        }
        const d = await loadWorkerData(worker, getWeekStart(), all);
        setData(d);
        setErr('');
        loadParkingInfo(d.cars.map((c) => c.id)).then(setParking).catch(() => {});
      } catch (e) {
        if (!silent) setErr(t('err_load'));
      }
    },
    [worker, all, onLogout, t, toast]
  );

  useEffect(() => {
    load();
    const i = setInterval(() => document.visibilityState === 'visible' && load(true), 15000);
    const f = () => load(true);
    window.addEventListener('focus', f);
    return () => {
      clearInterval(i);
      window.removeEventListener('focus', f);
    };
  }, [load]);

  const items = useMemo(() => {
    if (!data) return [];
    const jobBy = {};
    data.jobs.forEach((j) => (jobBy[j.car_id] = j));
    const now = new Date();
    return data.cars
      .map((c) => ({ car: c, job: jobBy[c.id] }))
      .filter((x) => x.job && !x.job.skip && isJobDueToday(x.job, x.car, now))
      .filter((x) => !q.trim() || `${x.car.plate_number} ${x.car.car_model || ''} ${x.car.block_name || ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  }, [data, q]);

  const todo = items.filter((x) => x.job.status !== 'done');
  const done = items.filter((x) => x.job.status === 'done');
  const pct = items.length ? Math.round((done.length / items.length) * 100) : 0;

  const patchLocal = (jobId, patch) => setData((d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === jobId ? { ...j, ...patch } : j)) }));

  const mark = async (x) => {
    const prev = { status: x.job.status, done_by_worker_id: x.job.done_by_worker_id, done_at: x.job.done_at };
    patchLocal(x.job.id, { status: 'done', done_by_worker_id: worker.id, done_at: new Date().toISOString() });
    try {
      await setJobDone(x.job, worker.id);
    } catch (e) {
      patchLocal(x.job.id, prev);
      toast(t('err_save'), 'error');
    }
  };
  const undo = async (x) => {
    const prev = { status: x.job.status, done_by_worker_id: x.job.done_by_worker_id, done_at: x.job.done_at };
    patchLocal(x.job.id, { status: 'pending', done_by_worker_id: null, done_at: null });
    try {
      await setJobUndone(x.job);
    } catch (e) {
      patchLocal(x.job.id, prev);
      toast(t('err_save'), 'error');
    }
  };
  const notFound = async (x) => {
    const on = !x.job.missing;
    const patch = on ? { missing: true, missing_at: new Date().toISOString(), missing_by: worker.id } : { missing: false, missing_at: null, missing_by: null };
    patchLocal(x.job.id, patch);
    try {
      await updateJob(x.job.id, patch);
      toast(on ? t('flagged_not_found') : t('saved'), 'success');
    } catch (e) {
      patchLocal(x.job.id, { missing: !on });
      toast(t('err_save'), 'error');
    }
  };

  const logout = async () => {
    if (!(await confirm({ message: t('worker_logout_confirm') }))) return;
    try {
      await supabase.from('users').delete().eq('id', worker.id);
    } catch (e) {
      /* ignore */
    }
    onLogout();
  };

  const list = tab === 'todo' ? todo : done;

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <LangToggle />
            <DarkToggle />
            <Button size="sm" onClick={logout}>{t('logout')}</Button>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 font-semibold"><Icon name="hardhat" className="h-5 w-5" /> {worker.name}</span>
          <span className="tabular-nums text-slate-500">{done.length}/{items.length}</span>
        </div>
        <Progress value={pct} className="mt-1.5" />
        <div className="mt-3 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search_ph_short')}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <Button variant={all ? 'soft' : 'ghost'} onClick={() => { setData(null); setAll(!all); }}>{all ? t('team_cars') : t('my_cars')}</Button>
        </div>
        <div className="mt-3 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-semibold dark:bg-slate-800">
          {[['todo', t('w_todo', { n: todo.length })], ['done', t('w_done', { n: done.length })]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cx('rounded-md py-1.5', tab === k ? 'bg-white shadow dark:bg-slate-950' : 'text-slate-500')}>{l}</button>
          ))}
        </div>
      </header>

      <main className="flex-1 space-y-3 p-4">
        {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        {!data ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <div className="flex justify-center text-sky-600"><Icon name={tab === 'todo' ? 'party' : 'sparkles'} className="h-12 w-12" strokeWidth={1.5} /></div>
            <p className="mt-3 text-sm">{tab === 'todo' ? (items.length ? t('all_done') : t('worker_nothing')) : t('nothing_yet')}</p>
          </div>
        ) : (
          list.map((x) => {
            const p = parking[x.car.id];
            const photo = x.job.photo_url || p?.photo_url;
            return (
              <div key={x.car.id} className={cx('rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-900', x.job.missing ? 'border-red-300 dark:border-red-800' : 'border-slate-200 dark:border-slate-800')}>
                <div className="flex gap-3">
                  {photo && (
                    <a href={photo} target="_blank" rel="noreferrer" className="flex-none">
                      <img src={photo} alt="" className="h-20 w-20 rounded-lg object-cover" loading="lazy" />
                    </a>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xl font-bold">{x.car.plate_number}</span>
                      {x.job.missing && <Badge tone="red">{t('not_found')}</Badge>}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">{[x.car.car_model, x.car.car_color].filter(Boolean).join(' · ')}</div>
                    <div className="mt-1 text-sm font-medium text-sky-800 dark:text-sky-300">
                      <Icon name="pin" className="h-3.5 w-3.5" /> {[x.car.block_name, x.car.location_desc].filter(Boolean).join(' · ') || '—'}
                    </div>
                    {(p?.floor || p?.zone || p?.spot_number) && (
                      <div className="text-xs text-slate-500"><Icon name="parking" className="h-3.5 w-3.5" /> {t('last_parked')}: {[p.floor, p.zone, p.spot_number].filter(Boolean).join(' · ')}</div>
                    )}
                    {x.job.today_note && <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400"><Icon name="note" className="h-3.5 w-3.5" /> {x.job.today_note}</div>}
                    {x.car.remarks && <div className="mt-0.5 text-xs text-slate-500">{x.car.remarks}</div>}
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  {x.job.status === 'done' ? (
                    <>
                      <div className="flex-1 rounded-lg bg-emerald-50 px-3 py-2.5 text-center text-sm font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><Icon name="check" /> {t('st_done')} {fmtTime(x.job.done_at)}</div>
                      <Button onClick={() => undo(x)}><Icon name="undo" /> {t('undo')}</Button>
                    </>
                  ) : (
                    <>
                      <Button variant="success" size="lg" className="flex-1" onClick={() => mark(x)}><Icon name="check" /> {t('mark_done')}</Button>
                      <Button onClick={() => notFound(x)} className={x.job.missing ? 'border-red-300 text-red-600' : ''}><Icon name="search" /> {x.job.missing ? t('undo') : t('not_found')}</Button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
