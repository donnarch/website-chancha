import React, { useEffect, useMemo, useState } from 'react';
import { useDash } from '../state.jsx';
import { useT, useI18n } from '../lib/i18n.jsx';
import { Badge, Button, Card, Progress, Spinner, useUi } from '../components/ui.jsx';
import { loadJobs } from '../lib/data.js';
import { addDays, getWeekStart, weekLabel, fmtDateTime } from '../lib/dates.js';
import { downloadCsv } from '../lib/csv.js';
import { Icon } from '../components/icons.jsx';

export default function Report() {
  const t = useT();
  const { lang } = useI18n();
  const d = useDash();
  const { toast } = useUi();
  const [ws, setWs] = useState(d.weekStart);
  const [jobs, setJobs] = useState(null);
  const isCurrent = ws === getWeekStart();

  useEffect(() => {
    let alive = true;
    setJobs(null);
    (isCurrent ? Promise.resolve(d.jobs) : loadJobs(d.boss.id, ws))
      .then((j) => alive && setJobs(j))
      .catch(() => {
        if (alive) {
          setJobs([]);
          toast(t('err_load'), 'error');
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, isCurrent ? d.jobs : null]);

  const m = useMemo(() => {
    if (!jobs) return null;
    const rows = jobs
      .filter((j) => d.carById[j.car_id] && (d.apt === 'all' || d.carById[j.car_id].apartment_id === d.apt))
      .map((j) => ({ job: j, car: d.carById[j.car_id] }))
      .filter((r) => !r.job.skip);
    const done = rows.filter((r) => r.job.status === 'done');
    const todo = rows.filter((r) => r.job.status !== 'done');
    const byWorker = {};
    rows.forEach((r) => {
      const wid = r.job.status === 'done' ? r.job.done_by_worker_id || r.job.assigned_worker_id || '' : r.job.assigned_worker_id || r.car.assigned_worker_id || '';
      (byWorker[wid] ||= { total: 0, done: 0 });
      byWorker[wid].total++;
      if (r.job.status === 'done') byWorker[wid].done++;
    });
    const byApt = {};
    rows.forEach((r) => {
      const k = r.car.apartment_id || '';
      (byApt[k] ||= { total: 0, done: 0 });
      byApt[k].total++;
      if (r.job.status === 'done') byApt[k].done++;
    });
    return { rows, done, todo, byWorker, byApt };
  }, [jobs, d.carById, d.apt]);

  const nameOf = (id) => (!id ? t('unassigned') : id === d.boss.id ? t('you') : d.workerById[id]?.name || t('worker'));

  const exportCsv = () => {
    if (!m) return;
    const head = [t('col_plate'), t('col_model'), t('col_block'), t('col_location'), t('col_worker'), t('col_status'), t('done_at'), t('done_by')];
    const body = m.rows.map(({ job, car }) => [
      car.plate_number,
      car.car_model,
      car.block_name,
      car.location_desc,
      nameOf(job.assigned_worker_id || car.assigned_worker_id),
      job.status === 'done' ? t('st_done') : t('st_pending'),
      job.done_at ? fmtDateTime(job.done_at) : '',
      job.status === 'done' ? nameOf(job.done_by_worker_id) : '',
    ]);
    downloadCsv(`chancha-report-${ws}.csv`, [head, ...body]);
  };

  const pct = m && m.rows.length ? Math.round((m.done.length / m.rows.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('nav_report')}</h1>
          <p className="text-sm text-slate-500">{weekLabel(ws, lang)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setWs(addDays(ws, -7))}><Icon name="left" /> {t('prev_week')}</Button>
          <Button disabled={isCurrent} onClick={() => setWs(addDays(ws, 7))}>{t('next_week')} <Icon name="right" /></Button>
          <Button onClick={exportCsv} disabled={!m}><Icon name="download" /> {t('export_csv')}</Button>
          <Button onClick={() => window.print()}><Icon name="print" /> {t('print')}</Button>
        </div>
      </div>
      <div className="print-only text-xl font-bold">찾차 Chancha — {t('nav_report')} · {weekLabel(ws, lang)}</div>

      {!m ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <div className="text-4xl font-bold tabular-nums">{m.done.length}<span className="text-xl text-slate-400">/{m.rows.length}</span></div>
                <div className="text-xs text-slate-500">{t('washed_this_week')}</div>
              </div>
              <div className="min-w-[200px] flex-1"><Progress value={pct} className="h-4" /></div>
              <div className="text-3xl font-bold text-emerald-600">{pct}%</div>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title={t('by_worker')} pad={false}>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {Object.entries(m.byWorker).map(([wid, v]) => (
                  <li key={wid || 'none'} className="px-4 py-3">
                    <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{nameOf(wid)}</span><span className="tabular-nums text-slate-500">{v.done}/{v.total}</span></div>
                    <Progress value={(v.done / v.total) * 100} />
                  </li>
                ))}
                {Object.keys(m.byWorker).length === 0 && <li className="px-4 py-6 text-center text-xs text-slate-500">—</li>}
              </ul>
            </Card>
            <Card title={t('by_apartment')} pad={false}>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {Object.entries(m.byApt).map(([aid, v]) => (
                  <li key={aid || 'none'} className="px-4 py-3">
                    <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{d.aptById[aid]?.name || '—'}</span><span className="tabular-nums text-slate-500">{v.done}/{v.total}</span></div>
                    <Progress tone="blue" value={(v.done / v.total) * 100} />
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card title={t('not_done_n', { n: m.todo.length })} pad={false}>
            {m.todo.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-emerald-600"><Icon name="party" /> {t('all_done')}</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {m.todo.map(({ job, car }) => (
                    <tr key={job.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2 font-mono font-semibold">{car.plate_number}</td>
                      <td className="px-2 text-slate-500">{[car.car_model, car.block_name, car.location_desc].filter(Boolean).join(' · ')}</td>
                      <td className="px-4 text-right text-xs text-slate-500">{nameOf(job.assigned_worker_id || car.assigned_worker_id)} {job.missing && <Badge tone="red">{t('not_found')}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
