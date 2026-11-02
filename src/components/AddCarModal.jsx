import React, { useMemo, useState } from 'react';
import { useDash } from '../state.jsx';
import { useT } from '../lib/i18n.jsx';
import { Button, Field, Modal, Select, inputCls, useUi } from './ui.jsx';
import DayChips from './DayChips.jsx';
import { buildPlateIndex, importCars } from '../lib/data.js';
import { normPlate } from '../lib/plates.js';
import { DAY_ORDER } from '../lib/dates.js';

export const DEFAULT_DAYS = ['월', '화', '수', '목', '금'];

export default function AddCarModal({ onClose }) {
  const t = useT();
  const d = useDash();
  const { toast, confirm } = useUi();
  const [f, setF] = useState({
    plate: '',
    model: '',
    color: '',
    block: '',
    location: '',
    phone: '',
    remarks: '',
    workerId: '',
    apartmentId: d.apt !== 'all' ? d.apt : d.apartments[0]?.id || '',
    days: DEFAULT_DAYS,
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const index = useMemo(() => buildPlateIndex(d.cars), [d.cars]);

  const submit = async () => {
    if (!f.plate.trim()) return toast(t('plate_required'), 'error');
    if (!f.apartmentId) return toast(t('apartment_required'), 'error');
    const dup = index.get(`${f.apartmentId}|${normPlate(f.plate)}`);
    let reactivateId = null;
    if (dup) {
      if (dup.is_active === false) {
        if (!(await confirm({ message: t('dup_paused_ask', { plate: dup.plate_number }) }))) return;
        reactivateId = dup.id;
      } else {
        toast(t('dup_exists', { plate: dup.plate_number }), 'error');
        return;
      }
    }
    setBusy(true);
    try {
      const res = await db_import(d, f, reactivateId);
      if (res.failed) toast(res.errors[0] || t('err_save'), 'error');
      else {
        toast(t('car_added'), 'success');
        await d.reload({ silent: true });
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('add_car')}
      footer={
        <>
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit}>
            {t('add_car')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('col_plate') + ' *'} className="col-span-2">
          <input className={inputCls + ' font-mono'} value={f.plate} onChange={(e) => set('plate', e.target.value)} autoFocus placeholder="12가3456" />
        </Field>
        <Field label={t('col_model')}>
          <input className={inputCls} value={f.model} onChange={(e) => set('model', e.target.value)} />
        </Field>
        <Field label={t('col_color')}>
          <input className={inputCls} value={f.color} onChange={(e) => set('color', e.target.value)} />
        </Field>
        <Field label={t('col_block')}>
          <input className={inputCls} value={f.block} onChange={(e) => set('block', e.target.value)} list="blocks-list-add" placeholder="101동" />
        </Field>
        <Field label={t('col_location')}>
          <input className={inputCls} value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="B2" />
        </Field>
        <Field label={t('phone')} className="col-span-2">
          <input className={inputCls} value={f.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
        </Field>
        <Field label={t('remarks')} className="col-span-2">
          <input className={inputCls} value={f.remarks} onChange={(e) => set('remarks', e.target.value)} />
        </Field>
        <Field label={t('apartment')}>
          <Select value={f.apartmentId} onChange={(e) => set('apartmentId', e.target.value)}>
            {d.apartments.length === 0 && <option value="">—</option>}
            {d.apartments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('col_worker')}>
          <Select value={f.workerId} onChange={(e) => set('workerId', e.target.value)}>
            <option value="">{t('unassigned')}</option>
            {d.workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="col-span-2">
          <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">{t('wash_days')}</div>
          <DayChips value={f.days} onChange={(v) => set('days', v)} />
        </div>
      </div>
      <datalist id="blocks-list-add">
        {d.blocks.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
    </Modal>
  );
}

async function db_import(d, f, reactivateId) {
  return importCars({
    bossId: d.boss.id,
    apartmentId: f.apartmentId,
    rows: [
      {
        plate: f.plate,
        model: f.model,
        color: f.color,
        block: f.block,
        location: f.location,
        phone: f.phone,
        remarks: f.remarks,
        days: f.days,
        workerId: f.workerId || null,
        reactivateId,
      },
    ],
    defaults: { days: f.days, weekPattern: 'every' },
    weekStart: d.weekStart,
  });
}
