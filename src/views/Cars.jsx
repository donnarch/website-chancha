import React, { memo, useCallback, useMemo, useState } from 'react';
import { useDash, carStatus, dueTonight } from '../state.jsx';
import { useT } from '../lib/i18n.jsx';
import { go } from '../lib/router.js';
import { Badge, Button, Empty, Select, cx, inputCls, useUi } from '../components/ui.jsx';
import EditCell from '../components/EditCell.jsx';
import CarDrawer from '../components/CarDrawer.jsx';
import AddCarModal from '../components/AddCarModal.jsx';
import DistributeModal from '../components/DistributeModal.jsx';
import { normPlate } from '../lib/plates.js';
import { parseWashDays } from '../lib/schedule.js';
import { fmtTime, DAY_ORDER } from '../lib/dates.js';
import { countLinkedResidents } from '../lib/data.js';
import { downloadCsv } from '../lib/csv.js';
import { Icon } from '../components/icons.jsx';

const PAGE = 100;

const Row = memo(function Row({ car, job, status, due, workers, workerName, selected, onSel, onPlate, onField, onAssign, onDone, onUndo, onOpen, t }) {
  const days = parseWashDays(car.wash_days);
  return (
    <tr className={cx('group border-b border-slate-100 dark:border-slate-800', selected ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-900/60', car.is_active === false && 'opacity-60')}>
      <td className="w-10 px-3">
        <input type="checkbox" checked={selected} onChange={() => onSel(car.id)} aria-label="select" />
      </td>
      <td className="w-36 px-1 py-1">
        <EditCell mono className="font-semibold" value={car.plate_number} onSave={(v) => onPlate(car, v)} />
      </td>
      <td className="w-36 px-1">
        <EditCell value={car.car_model} onSave={(v) => onField(car.id, { car_model: v })} />
      </td>
      <td className="w-24 px-1">
        <EditCell value={car.car_color} onSave={(v) => onField(car.id, { car_color: v || null })} />
      </td>
      <td className="w-24 px-1">
        <EditCell value={car.block_name} list="blocks-list-main" onSave={(v) => onField(car.id, { block_name: v || null })} />
      </td>
      <td className="w-28 px-1">
        <EditCell value={car.location_desc} onSave={(v) => onField(car.id, { location_desc: v || null })} />
      </td>
      <td className="w-36 px-1">
        <select
          value={job?.assigned_worker_id || car.assigned_worker_id || ''}
          onChange={(e) => onAssign([car.id], e.target.value)}
          className={cx(
            'w-full rounded border bg-transparent px-1.5 py-1 text-sm outline-none focus:border-sky-500',
            (job?.assigned_worker_id || car.assigned_worker_id) ? 'border-transparent hover:border-slate-300 dark:hover:border-slate-600' : 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400'
          )}
        >
          <option value="">{t('unassigned')}</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </td>
      <td className="w-28 px-2 text-xs text-slate-500">
        <button onClick={() => onOpen(car.id)} className="hover:underline" title={t('edit')}>
          {days.length ? (days.length === 7 ? t('every_day') : days.join('·')) : t('any_day')}
          {car.week_pattern && car.week_pattern !== 'every' ? ` (${car.week_pattern})` : ''}
        </button>
        {job?.override_day && <Badge tone="blue" className="ml-1">→{job.override_day}</Badge>}
      </td>
      <td className="w-44 px-2">
        {status === 'done' ? (
          <div className="flex items-center gap-1.5">
            <Badge tone="green"><Icon name="check" className="h-3 w-3" /> {fmtTime(job?.done_at)}</Badge>
            <button onClick={() => onUndo(car.id)} className="rounded px-1 text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700" title={t('undo')}>
              <Icon name="undo" className="h-4 w-4" />
            </button>
          </div>
        ) : status === 'paused' ? (
          <Badge>{t('st_paused')}</Badge>
        ) : status === 'skipped' ? (
          <Badge>{t('st_skipped')}</Badge>
        ) : (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant={due ? 'success' : 'ghost'} onClick={() => onDone(car.id)}>
              <Icon name="check" /> {t('done')}
            </Button>
            {status === 'missing' && <Badge tone="red">{t('not_found')}</Badge>}
            {due && status !== 'missing' && <span className="text-[10px] font-semibold text-sky-700 dark:text-sky-400">{t('tonight_short')}</span>}
          </div>
        )}
        {job?.today_note && <div className="mt-0.5 truncate text-[11px] text-amber-700 dark:text-amber-400" title={job.today_note}><Icon name="note" className="inline h-3 w-3" /> {job.today_note}</div>}
      </td>
      <td className="w-10 px-2 text-right">
        <button onClick={() => onOpen(car.id)} className="rounded px-1.5 py-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700" aria-label={t('edit')}>
          ⋯
        </button>
      </td>
    </tr>
  );
});

export default function Cars({ params }) {
  const t = useT();
  const d = useDash();
  const { toast, confirm } = useUi();

  const [q, setQ] = useState(params.q || '');
  const [blockF, setBlockF] = useState(params.block || 'all');
  const [workerF, setWorkerF] = useState(params.worker || 'all');
  const [statusF, setStatusF] = useState(params.status || 'all');
  const [sort, setSort] = useState({ key: 'block', dir: 1 });
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState(() => new Set());
  const [openId, setOpenId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [distOpen, setDistOpen] = useState(false);

  const now = useMemo(() => new Date(), [d.jobs]);

  const decorated = useMemo(
    () =>
      d.visibleCars.map((c) => {
        const job = d.jobByCar[c.id];
        return { car: c, job, status: carStatus(c, job), due: dueTonight(c, job, now), wid: job?.assigned_worker_id || c.assigned_worker_id || '' };
      }),
    [d.visibleCars, d.jobByCar, now]
  );

  const filtered = useMemo(() => {
    const nq = normPlate(q);
    const lq = q.trim().toLowerCase();
    let rows = decorated.filter(({ car, status, due, wid }) => {
      if (statusF === 'paused') {
        if (status !== 'paused') return false;
      } else if (status === 'paused') return false;
      if (statusF === 'due' && !due) return false;
      if (statusF === 'pending' && !(due && status !== 'done' && status !== 'skipped')) return false;
      if (statusF === 'done' && status !== 'done') return false;
      if (statusF === 'skipped' && status !== 'skipped') return false;
      if (statusF === 'missing' && status !== 'missing') return false;
      if (blockF !== 'all' && (car.block_name || '') !== blockF) return false;
      if (workerF === 'none' && wid) return false;
      if (workerF !== 'all' && workerF !== 'none' && wid !== workerF) return false;
      if (lq) {
        const hay = `${normPlate(car.plate_number)} ${car.car_model || ''} ${car.car_color || ''} ${car.block_name || ''} ${car.location_desc || ''} ${car.remarks || ''} ${car.owner_phone || ''}`.toLowerCase();
        if (!(nq && normPlate(car.plate_number).toLowerCase().includes(nq.toLowerCase())) && !hay.includes(lq)) return false;
      }
      return true;
    });
    const dir = sort.dir;
    const val = (r) => {
      switch (sort.key) {
        case 'plate':
          return r.car.plate_number || '';
        case 'model':
          return r.car.car_model || '';
        case 'worker':
          return d.workerById[r.wid]?.name || '￿';
        case 'status':
          return `${r.status === 'done' ? 1 : 0}${r.due ? 0 : 1}`;
        default:
          return `${r.car.block_name || '￿'}`;
      }
    };
    rows = rows.slice().sort((a, b) => {
      const c = String(val(a)).localeCompare(String(val(b)), 'ko', { numeric: true });
      return c ? c * dir : String(a.car.plate_number).localeCompare(String(b.car.plate_number), 'ko');
    });
    return rows;
  }, [decorated, q, blockF, workerF, statusF, sort, d.workerById]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pg = Math.min(page, pages - 1);
  const pageRows = filtered.slice(pg * PAGE, pg * PAGE + PAGE);

  // stable handlers for memoised rows
  const toggleSel = useCallback((id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
  const { patchCar, assign, markDone, undoDone } = d;
  const onField = useCallback((id, patch) => patchCar(id, patch), [patchCar]);
  const onAssign = useCallback((ids, w) => assign(ids, w || null), [assign]);
  const onPlate = useCallback(
    async (car, v) => {
      if (!v) {
        toast(t('plate_required'), 'error');
        return false;
      }
      const dup = d.cars.find((c) => c.id !== car.id && c.apartment_id === car.apartment_id && normPlate(c.plate_number) === normPlate(v));
      if (dup && !(await confirm({ message: t('dup_plate_save', { plate: dup.plate_number }) }))) return false;
      await patchCar(car.id, { plate_number: v });
      return true;
    },
    [d.cars, patchCar, confirm, toast, t]
  );

  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => sel.has(r.car.id));
  const togglePage = () =>
    setSel((s) => {
      const n = new Set(s);
      if (allPageSelected) pageRows.forEach((r) => n.delete(r.car.id));
      else pageRows.forEach((r) => n.add(r.car.id));
      return n;
    });
  const selIds = [...sel].filter((id) => d.carById[id]);
  const clearSel = () => setSel(new Set());

  const sortBy = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }));
  const Th = ({ k, children, className }) => (
    <th className={cx('px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500', className)}>
      {k ? (
        <button onClick={() => sortBy(k)} className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-slate-800 dark:hover:text-slate-200">
          {children}
          {sort.key === k && <span>{sort.dir > 0 ? '▲' : '▼'}</span>}
        </button>
      ) : (
        children
      )}
    </th>
  );

  // ----- bulk actions -----
  const bulkAssign = async (w) => {
    if (w === '__') return;
    await assign(selIds, w || null);
    toast(t('assigned_n', { n: selIds.length }), 'success');
  };
  const bulkDone = async () => {
    const n = await d.markManyDone(selIds);
    toast(t('marked_done_n', { n }), 'success');
    clearSel();
  };
  const allPaused = selIds.length > 0 && selIds.every((id) => d.carById[id].is_active === false);
  const bulkPause = async () => {
    await d.setCarsActive(selIds, allPaused);
    toast(allPaused ? t('resumed_n', { n: selIds.length }) : t('paused_n', { n: selIds.length }), 'success');
    clearSel();
  };
  const bulkDelete = async () => {
    let linked = 0;
    try {
      linked = await countLinkedResidents(selIds);
    } catch (e) {
      /* ignore */
    }
    const msg = t('delete_n_confirm', { n: selIds.length }) + (linked ? `\n\n⚠ ${t('delete_linked_warn', { n: linked })}` : '');
    if (!(await confirm({ message: msg, danger: true, okText: t('delete') }))) return;
    if (await d.removeCars(selIds)) {
      toast(t('deleted_n', { n: selIds.length }), 'success');
      clearSel();
    }
  };

  const exportCsv = () => {
    const head = [t('col_plate'), t('col_model'), t('col_color'), t('col_block'), t('col_location'), t('phone'), t('col_worker'), t('wash_days'), t('remarks'), t('col_status')];
    const body = filtered.map(({ car, status, job }) => [
      car.plate_number,
      car.car_model,
      car.car_color,
      car.block_name,
      car.location_desc,
      car.owner_phone,
      d.workerById[job?.assigned_worker_id || car.assigned_worker_id]?.name || '',
      parseWashDays(car.wash_days).join(''),
      car.remarks,
      t('st_' + status),
    ]);
    downloadCsv(`chancha-cars-${new Date().toISOString().slice(0, 10)}.csv`, [head, ...body]);
  };

  const filtersActive = q || blockF !== 'all' || workerF !== 'all' || statusF !== 'all';

  return (
    <div className="mx-auto max-w-[1400px] space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('nav_cars')}</h1>
          <p className="text-sm text-slate-500">{t('showing_n', { n: filtered.length, total: d.visibleCars.length })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportCsv}><Icon name="download" /> {t('export_csv')}</Button>
          <Button onClick={() => go('import')}><Icon name="camera" /> {t('nav_import')}</Button>
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <Icon name="plus" /> {t('add_car')}
          </Button>
        </div>
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <input
          className={cx(inputCls, 'max-w-xs flex-1')}
          placeholder={t('search_ph')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
        />
        <Select className="!w-auto" value={statusF} onChange={(e) => { setStatusF(e.target.value); setPage(0); }}>
          <option value="all">{t('f_active')}</option>
          <option value="due">{t('f_due')}</option>
          <option value="pending">{t('f_pending')}</option>
          <option value="done">{t('st_done')}</option>
          <option value="missing">{t('not_found')}</option>
          <option value="skipped">{t('st_skipped')}</option>
          <option value="paused">{t('st_paused')}</option>
        </Select>
        <Select className="!w-auto" value={blockF} onChange={(e) => { setBlockF(e.target.value); setPage(0); }}>
          <option value="all">{t('all_blocks')}</option>
          {d.blocks.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
        <Select className="!w-auto" value={workerF} onChange={(e) => { setWorkerF(e.target.value); setPage(0); }}>
          <option value="all">{t('all_workers')}</option>
          <option value="none">{t('unassigned')}</option>
          {d.workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        {filtersActive && (
          <Button
            variant="plain"
            onClick={() => {
              setQ('');
              setBlockF('all');
              setWorkerF('all');
              setStatusF('all');
              setPage(0);
            }}
          >
            <Icon name="x" /> {t('clear_filters')}
          </Button>
        )}
      </div>

      {/* bulk bar */}
      {selIds.length > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 p-3 shadow dark:border-sky-800 dark:bg-sky-950">
          <span className="text-sm font-semibold">{t('selected_n', { n: selIds.length })}</span>
          {selIds.length < filtered.length && (
            <button className="text-xs text-sky-700 underline dark:text-sky-300" onClick={() => setSel(new Set(filtered.map((r) => r.car.id)))}>
              {t('select_all_n', { n: filtered.length })}
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select className="!w-auto" value="__" onChange={(e) => bulkAssign(e.target.value)}>
              <option value="__">{t('assign_to')}…</option>
              <option value="">{t('unassigned')}</option>
              {d.workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
            <Button onClick={() => setDistOpen(true)}><Icon name="scale" /> {t('auto_distribute')}</Button>
            <Button variant="success" onClick={bulkDone}>
              <Icon name="check" /> {t('mark_done')}
            </Button>
            <Button onClick={bulkPause}>{allPaused ? <><Icon name="play" /> {t('resume')}</> : <><Icon name="pause" /> {t('pause')}</>}</Button>
            <Button variant="danger" onClick={bulkDelete}>
              <Icon name="trash" /> {t('delete')}
            </Button>
            <Button variant="plain" onClick={clearSel}><Icon name="x" /></Button>
          </div>
        </div>
      )}

      {/* table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {filtered.length === 0 ? (
          <Empty
            icon={filtersActive ? 'search' : 'car'}
            title={filtersActive ? t('no_match') : t('no_cars_yet')}
            hint={filtersActive ? null : t('no_cars_hint')}
            action={
              !filtersActive && (
                <Button variant="primary" onClick={() => go('import')}>
                  <Icon name="camera" /> {t('nav_import')}
                </Button>
              )
            }
          />
        ) : (
          <div className="thin-scroll max-h-[calc(100vh-290px)] min-h-[300px] overflow-auto">
            <table className="w-full min-w-[1080px] border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th className="w-10 px-3">
                    <input type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="select page" />
                  </th>
                  <Th k="plate">{t('col_plate')}</Th>
                  <Th k="model">{t('col_model')}</Th>
                  <Th>{t('col_color')}</Th>
                  <Th k="block">{t('col_block')}</Th>
                  <Th>{t('col_location')}</Th>
                  <Th k="worker">{t('col_worker')}</Th>
                  <Th>{t('wash_days')}</Th>
                  <Th k="status">{t('col_status')}</Th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ car, job, status, due }) => (
                  <Row
                    key={car.id}
                    car={car}
                    job={job}
                    status={status}
                    due={due}
                    workers={d.workers}
                    selected={sel.has(car.id)}
                    onSel={toggleSel}
                    onPlate={onPlate}
                    onField={onField}
                    onAssign={onAssign}
                    onDone={markDone}
                    onUndo={undoDone}
                    onOpen={setOpenId}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm dark:border-slate-800">
            <span className="text-slate-500">
              {pg * PAGE + 1}–{Math.min(filtered.length, pg * PAGE + PAGE)} / {filtered.length}
            </span>
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
      </div>

      <datalist id="blocks-list-main">
        {d.blocks.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      {openId && <CarDrawer carId={openId} onClose={() => setOpenId(null)} />}
      {addOpen && <AddCarModal onClose={() => setAddOpen(false)} />}
      {distOpen && <DistributeModal carIds={selIds} onClose={() => { setDistOpen(false); clearSel(); }} />}
      <p className="text-xs text-slate-400">{t('table_tip')}</p>
    </div>
  );
}
