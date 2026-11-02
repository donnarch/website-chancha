import React, { useMemo, useState } from 'react';
import { useDash } from '../state.jsx';
import { useT } from '../lib/i18n.jsx';
import { Button, Modal, useUi } from './ui.jsx';
import { autoDistribute } from '../lib/distribute.js';

export default function DistributeModal({ carIds, onClose }) {
  const t = useT();
  const d = useDash();
  const { toast } = useUi();
  const [picked, setPicked] = useState(() => new Set(d.workers.map((w) => w.id)));
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => {
    const cars = carIds.map((id) => d.carById[id]).filter(Boolean);
    const map = autoDistribute(cars, [...picked]);
    const load = {};
    Object.values(map).forEach((w) => (load[w] = (load[w] || 0) + 1));
    return load;
  }, [carIds, picked, d.carById]);

  const toggle = (id) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const run = async () => {
    setBusy(true);
    const n = await d.distribute(carIds, [...picked]);
    setBusy(false);
    if (n) toast(t('distributed', { n }), 'success');
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('auto_distribute')}
      footer={
        <>
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" onClick={run} disabled={busy || picked.size === 0}>
            {t('distribute_btn', { n: carIds.length })}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{t('distribute_hint')}</p>
      {d.workers.length === 0 ? (
        <p className="text-sm text-amber-700">{t('no_workers_hint')}</p>
      ) : (
        <ul className="space-y-2">
          {d.workers.map((w) => (
            <li key={w.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
                <input type="checkbox" checked={picked.has(w.id)} onChange={() => toggle(w.id)} />
                <span className="flex-1 text-sm font-medium">{w.name}</span>
                <span className="text-sm tabular-nums text-slate-500">{picked.has(w.id) ? preview[w.id] || 0 : '—'}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
