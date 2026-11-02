import React, { useMemo } from 'react';
import { useDash, carStatus, dueTonight } from '../state.jsx';
import { useT, useI18n } from '../lib/i18n.jsx';
import { go } from '../lib/router.js';
import { Badge, Button, Card, Empty, Progress, cx } from '../components/ui.jsx';
import { fmtTime, DAYS_KO, DAYS_EN } from '../lib/dates.js';
import { Icon } from '../components/icons.jsx';

function Kpi({ label, value, sub, tone = 'slate', onClick }) {
  const colors = {
    slate: 'text-slate-900 dark:text-slate-100',
    green: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    blue: 'text-sky-700 dark:text-sky-400',
  };
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={cx('mt-1 text-3xl font-bold tabular-nums', colors[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </button>
  );
}

export default function Overview() {
  const t = useT();
  const { lang } = useI18n();
  const d = useDash();

  const m = useMemo(() => {
    const now = new Date();
    const active = d.visibleCars.filter((c) => c.is_active !== false);
    const tonight = active.filter((c) => dueTonight(c, d.jobByCar[c.id], now));
    const tonightDone = tonight.filter((c) => carStatus(c, d.jobByCar[c.id]) === 'done');
    const tonightLeft = tonight.filter((c) => carStatus(c, d.jobByCar[c.id]) !== 'done');
    const weekCars = active.filter((c) => d.jobByCar[c.id] && !d.jobByCar[c.id].skip);
    const weekDone = weekCars.filter((c) => d.jobByCar[c.id].status === 'done');
    const missing = active.filter((c) => d.jobByCar[c.id]?.missing && d.jobByCar[c.id].status !== 'done');
    const unassignedTonight = tonightLeft.filter((c) => !(d.jobByCar[c.id]?.assigned_worker_id || c.assigned_worker_id));

    const rows = d.workers.map((w) => {
      const mine = tonight.filter((c) => (d.jobByCar[c.id]?.assigned_worker_id || c.assigned_worker_id) === w.id);
      const done = mine.filter((c) => carStatus(c, d.jobByCar[c.id]) === 'done').length;
      return { w, total: mine.length, done };
    });

    const recent = d.jobs
      .filter((j) => j.status === 'done' && j.done_at && d.carById[j.car_id] && d.visibleCars.includes(d.carById[j.car_id]))
      .sort((a, b) => String(b.done_at).localeCompare(String(a.done_at)))
      .slice(0, 8);

    const queue = [...tonightLeft].sort(
      (a, b) =>
        String(a.block_name || '').localeCompare(String(b.block_name || ''), 'ko', { numeric: true }) ||
        String(a.plate_number).localeCompare(String(b.plate_number), 'ko')
    );
    return { now, active, tonight, tonightDone, tonightLeft, weekCars, weekDone, missing, unassignedTonight, rows, recent, queue };
  }, [d.visibleCars, d.jobByCar, d.workers, d.jobs, d.carById]);

  if (!d.cars.length) {
    return (
      <Empty
        icon="car"
        title={t('no_cars_yet')}
        hint={t('no_cars_hint')}
        action={
          <div className="mt-2 flex gap-2">
            <Button variant="primary" onClick={() => go('import')}>
              <Icon name="camera" /> {t('nav_import')}
            </Button>
            <Button onClick={() => go('cars')}>{t('nav_cars')}</Button>
          </div>
        }
      />
    );
  }

  const pct = m.tonight.length ? Math.round((m.tonightDone.length / m.tonight.length) * 100) : 0;
  const weekPct = m.weekCars.length ? Math.round((m.weekDone.length / m.weekCars.length) * 100) : 0;
  const dayName = (lang === 'ko' ? DAYS_KO : DAYS_EN)[m.now.getDay()];
  const nameOf = (id) => (id === d.boss.id ? t('you') : d.workerById[id]?.name || t('worker'));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t('tonight')}</h1>
        <p className="text-sm text-slate-500">
          {m.now.getMonth() + 1}/{m.now.getDate()} ({dayName}) · {t('cars_count', { n: m.active.length })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('done_tonight')} value={`${m.tonightDone.length}/${m.tonight.length}`} sub={`${pct}%`} tone="green" onClick={() => go('cars', { status: 'due' })} />
        <Kpi label={t('remaining')} value={m.tonightLeft.length} sub={t('tonight_left_sub')} tone="blue" onClick={() => go('cars', { status: 'pending' })} />
        <Kpi label={t('this_week')} value={`${m.weekDone.length}/${m.weekCars.length}`} sub={`${weekPct}%`} onClick={() => go('cars')} />
        <Kpi
          label={t('not_found')}
          value={m.missing.length}
          sub={m.unassignedTonight.length ? t('unassigned_n', { n: m.unassignedTonight.length }) : t('all_assigned')}
          tone={m.missing.length ? 'red' : 'slate'}
          onClick={() => go('cars', { status: 'missing' })}
        />
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold">{t('tonight_progress')}</span>
          <span className="tabular-nums text-slate-500">{pct}%</span>
        </div>
        <Progress value={pct} className="h-4" />
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card
          className="lg:col-span-3"
          title={t('queue_title', { n: m.queue.length })}
          right={
            <Button size="sm" onClick={() => go('cars', { status: 'pending' })}>
              {t('open_in_cars')}
            </Button>
          }
          pad={false}
        >
          {m.queue.length === 0 ? (
            <Empty icon="party" title={m.tonight.length ? t('all_done') : t('nothing_due')} />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {m.queue.slice(0, 12).map((c) => {
                const j = d.jobByCar[c.id];
                const wid = j?.assigned_worker_id || c.assigned_worker_id;
                return (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{c.plate_number}</span>
                        {j?.missing && <Badge tone="red">{t('not_found')}</Badge>}
                        {j?.today_note && <Badge tone="amber"><Icon name="note" className="h-3 w-3" /> {j.today_note}</Badge>}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {[c.car_model, c.car_color, c.block_name, c.location_desc].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    <div className="hidden text-xs text-slate-500 sm:block">{wid ? nameOf(wid) : <Badge tone="amber">{t('unassigned')}</Badge>}</div>
                    <Button size="sm" variant="success" onClick={() => d.markDone(c.id)}>
                      <Icon name="check" /> {t('done')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {m.queue.length > 12 && (
            <div className="border-t border-slate-100 px-4 py-2 text-center text-xs text-slate-500 dark:border-slate-800">
              {t('and_more', { n: m.queue.length - 12 })}
            </div>
          )}
        </Card>

        <div className="space-y-5 lg:col-span-2">
          <Card title={t('by_worker')} pad={false}>
            {d.workers.length === 0 ? (
              <Empty icon="hardhat" title={t('no_workers')} hint={t('no_workers_hint')} action={<Button onClick={() => go('workers')}>{t('nav_workers')}</Button>} />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {m.rows.map(({ w, total, done }) => (
                  <li key={w.id} className="px-4 py-3">
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium">{w.name}</span>
                      <span className="tabular-nums text-slate-500">
                        {done}/{total}
                      </span>
                    </div>
                    <Progress value={total ? (done / total) * 100 : 0} />
                  </li>
                ))}
                {m.unassignedTonight.length > 0 && (
                  <li className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-amber-700 dark:text-amber-400">
                      <Icon name="alert" /> {t('unassigned_n', { n: m.unassignedTonight.length })}
                    </span>
                    <Button size="sm" onClick={() => go('cars', { worker: 'none', status: 'pending' })}>
                      {t('assign')}
                    </Button>
                  </li>
                )}
              </ul>
            )}
          </Card>

          {m.missing.length > 0 && (
            <Card title={<span className="flex items-center gap-1.5"><Icon name="search" /> {t('not_found')} ({m.missing.length})</span>} pad={false}>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {m.missing.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm font-semibold">{c.plate_number}</div>
                      <div className="truncate text-xs text-slate-500">{[c.block_name, c.location_desc].filter(Boolean).join(' · ')}</div>
                    </div>
                    <Button size="sm" onClick={() => d.patchJob(c.id, { missing: false, missing_at: null, missing_by: null })}>
                      {t('dismiss')}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title={t('recent_done')} pad={false}>
            {m.recent.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500">{t('nothing_yet')}</div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {m.recent.map((j) => (
                  <li key={j.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="font-mono">{d.carById[j.car_id]?.plate_number}</span>
                    <span className="text-xs text-slate-500">
                      {nameOf(j.done_by_worker_id)} · {fmtTime(j.done_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
