import React, { useEffect, useState } from 'react';
import { useDash } from '../state.jsx';
import { useT } from '../lib/i18n.jsx';
import { Badge, Button, Field, Modal, Select, inputCls, useUi } from './ui.jsx';
import DayChips from './DayChips.jsx';
import { loadCarHistory } from '../lib/data.js';
import { parseWashDays } from '../lib/schedule.js';
import { DAY_ORDER, fmtDateTime } from '../lib/dates.js';
import { normPlate } from '../lib/plates.js';
import { Icon } from './icons.jsx';

export default function CarDrawer({ carId, onClose }) {
  const t = useT();
  const d = useDash();
  const { toast, confirm } = useUi();
  const car = d.carById[carId];
  const job = d.jobByCar[carId];
  const [f, setF] = useState(null);
  const [hist, setHist] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!car) return;
    setF({
      plate_number: car.plate_number || '',
      car_model: car.car_model || '',
      car_color: car.car_color || '',
      block_name: car.block_name || '',
      location_desc: car.location_desc || '',
      owner_phone: car.owner_phone || '',
      remarks: car.remarks || '',
      assigned_worker_id: car.assigned_worker_id || '',
      wash_days: parseWashDays(car.wash_days),
      week_pattern: car.week_pattern || 'every',
      today_note: job?.today_note || '',
      skip: !!job?.skip,
      override_day: job?.override_day || '',
      missing: !!job?.missing,
    });
    loadCarHistory(carId).then(setHist).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carId]);

  if (!car || !f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    if (!f.plate_number.trim()) return toast(t('plate_required'), 'error');
    setSaving(true);
    try {
      const plateChanged = normPlate(f.plate_number) !== normPlate(car.plate_number);
      if (plateChanged) {
        const dup = d.cars.find(
          (c) => c.id !== car.id && c.apartment_id === car.apartment_id && normPlate(c.plate_number) === normPlate(f.plate_number)
        );
        if (dup && !(await confirm({ message: t('dup_plate_save', { plate: dup.plate_number }) }))) {
          setSaving(false);
          return;
        }
      }
      await d.patchCar(car.id, {
        plate_number: f.plate_number.trim(),
        car_model: f.car_model.trim(),
        car_color: f.car_color.trim() || null,
        block_name: f.block_name.trim() || null,
        location_desc: f.location_desc.trim() || null,
        owner_phone: f.owner_phone.trim() || null,
        remarks: f.remarks.trim() || null,
        wash_days: JSON.stringify(f.wash_days),
        week_pattern: f.week_pattern,
      });
      if (f.assigned_worker_id !== (car.assigned_worker_id || '')) await d.assign([car.id], f.assigned_worker_id || null);
      if (job) {
        const jp = {};
        if ((f.today_note.trim() || null) !== (job.today_note || null)) jp.today_note = f.today_note.trim() || null;
        if (f.skip !== !!job.skip) jp.skip = f.skip;
        if ((f.override_day || null) !== (job.override_day || null)) jp.override_day = f.override_day || null;
        if (f.missing !== !!job.missing) Object.assign(jp, f.missing ? { missing: true, missing_at: new Date().toISOString(), missing_by: d.boss.id } : { missing: false, missing_at: null, missing_by: null });
        if (Object.keys(jp).length) await d.patchJob(car.id, jp);
      }
      toast(t('saved'), 'success');
      onClose();
    } catch (e) {
      /* errors are toasted by the store */
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!(await confirm({ message: t('delete_one_confirm', { plate: car.plate_number }), danger: true, okText: t('delete') }))) return;
    if (await d.removeCars([car.id])) {
      toast(t('deleted'), 'success');
      onClose();
    }
  };

  return (
    <Modal
      open
      side
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono">{car.plate_number}</span>
          {car.is_active === false && <Badge tone="slate">{t('st_paused')}</Badge>}
        </span>
      }
      footer={
        <>
          <Button variant="danger" className="mr-auto" onClick={del}>
            {t('delete')}
          </Button>
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('col_plate')} className="col-span-2">
            <input className={inputCls + ' font-mono'} value={f.plate_number} onChange={(e) => set('plate_number', e.target.value)} />
          </Field>
          <Field label={t('col_model')}>
            <input className={inputCls} value={f.car_model} onChange={(e) => set('car_model', e.target.value)} />
          </Field>
          <Field label={t('col_color')}>
            <input className={inputCls} value={f.car_color} onChange={(e) => set('car_color', e.target.value)} />
          </Field>
          <Field label={t('col_block')}>
            <input className={inputCls} value={f.block_name} onChange={(e) => set('block_name', e.target.value)} list="blocks-list" />
          </Field>
          <Field label={t('col_location')}>
            <input className={inputCls} value={f.location_desc} onChange={(e) => set('location_desc', e.target.value)} />
          </Field>
          <Field label={t('phone')} className="col-span-2">
            <input className={inputCls} value={f.owner_phone} onChange={(e) => set('owner_phone', e.target.value)} inputMode="tel" />
          </Field>
          <Field label={t('remarks')} className="col-span-2">
            <input className={inputCls} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </Field>
          <Field label={t('col_worker')} className="col-span-2">
            <Select value={f.assigned_worker_id} onChange={(e) => set('assigned_worker_id', e.target.value)}>
              <option value="">{t('unassigned')}</option>
              {d.workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">{t('wash_days')}</div>
          <DayChips value={f.wash_days} onChange={(v) => set('wash_days', v)} />
          <div className="mt-2">
            <Select value={f.week_pattern} onChange={(e) => set('week_pattern', e.target.value)}>
              <option value="every">{t('pat_every')}</option>
              <option value="1/3">{t('pat_13')}</option>
              <option value="2/4">{t('pat_24')}</option>
            </Select>
          </div>
        </div>

        {job ? (
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="mb-2 text-sm font-semibold">{t('this_week_only')}</div>
            <div className="space-y-3">
              <Field label={t('note_for_worker')}>
                <input className={inputCls} value={f.today_note} onChange={(e) => set('today_note', e.target.value)} placeholder={t('note_ph')} />
              </Field>
              <Field label={t('move_to_day')}>
                <Select value={f.override_day} onChange={(e) => set('override_day', e.target.value)}>
                  <option value="">{t('no_change')}</option>
                  {DAY_ORDER.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.skip} onChange={(e) => set('skip', e.target.checked)} />
                {t('skip_this_week')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.missing} onChange={(e) => set('missing', e.target.checked)} />
                {t('flag_not_found')}
              </label>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">{t('no_job_hint')}</p>
        )}

        <div>
          <div className="mb-2 text-sm font-semibold">{t('parking_history')}</div>
          {hist.length === 0 ? (
            <p className="text-xs text-slate-500">{t('no_history')}</p>
          ) : (
            <ul className="space-y-2">
              {hist.map((h) => (
                <li key={h.id} className="flex items-center gap-3 rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800">
                  {h.photo_url ? (
                    <a href={h.photo_url} target="_blank" rel="noreferrer">
                      <img src={h.photo_url} alt="" className="h-12 w-12 rounded object-cover" loading="lazy" />
                    </a>
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded bg-slate-200 text-slate-500 dark:bg-slate-700"><Icon name="parking" className="h-6 w-6" /></div>
                  )}
                  <div>
                    <div className="font-medium">{[h.floor, h.zone, h.spot_number].filter(Boolean).join(' · ') || '—'}</div>
                    <div className="text-xs text-slate-500">
                      {fmtDateTime(h.created_at)} · {h.source === 'customer' ? t('src_resident') : t('src_worker')}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <datalist id="blocks-list">
        {d.blocks.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
    </Modal>
  );
}
