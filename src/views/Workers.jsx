import React, { useMemo, useState } from 'react';
import { useDash, carStatus, dueTonight } from '../state.jsx';
import { useT } from '../lib/i18n.jsx';
import { Badge, Button, Card, Empty, Modal, Progress, Select, useCopy, useUi } from '../components/ui.jsx';
import { regenerateInviteCode, removeWorkerAccount } from '../lib/data.js';
import { go } from '../lib/router.js';
import { Icon } from '../components/icons.jsx';

export default function Workers() {
  const t = useT();
  const d = useDash();
  const { toast, confirm } = useUi();
  const copy = useCopy();
  const [moveFrom, setMoveFrom] = useState(null);
  const [moveTo, setMoveTo] = useState('');

  const stats = useMemo(() => {
    const now = new Date();
    return d.workers.map((w) => {
      const mine = d.cars.filter((c) => c.is_active !== false && (d.jobByCar[c.id]?.assigned_worker_id || c.assigned_worker_id) === w.id);
      const tonight = mine.filter((c) => dueTonight(c, d.jobByCar[c.id], now));
      const doneT = tonight.filter((c) => carStatus(c, d.jobByCar[c.id]) === 'done').length;
      const weekJobs = mine.filter((c) => d.jobByCar[c.id] && !d.jobByCar[c.id].skip);
      const doneW = weekJobs.filter((c) => d.jobByCar[c.id].status === 'done').length;
      return { w, cars: mine.length, tonight: tonight.length, doneT, week: weekJobs.length, doneW };
    });
  }, [d.workers, d.cars, d.jobByCar]);

  const remove = async (w) => {
    if (!(await confirm({ message: t('remove_worker_confirm', { name: w.name }), danger: true, okText: t('remove') }))) return;
    try {
      await removeWorkerAccount(w.id);
      toast(t('worker_removed'), 'success');
      await d.reload({ silent: true });
    } catch (e) {
      toast(t('err_save'), 'error');
    }
  };

  const regen = async () => {
    if (!(await confirm({ message: t('regen_confirm') }))) return;
    try {
      await regenerateInviteCode(d.boss.id);
      await d.refreshBoss();
      toast(t('saved'), 'success');
    } catch (e) {
      toast(t('err_save'), 'error');
    }
  };

  const doMove = async () => {
    const ids = d.cars.filter((c) => (d.jobByCar[c.id]?.assigned_worker_id || c.assigned_worker_id) === moveFrom.id).map((c) => c.id);
    await d.assign(ids, moveTo || null);
    toast(t('assigned_n', { n: ids.length }), 'success');
    setMoveFrom(null);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-bold">{t('nav_workers')}</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t('worker_invite')}>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-100 px-4 py-2 font-mono text-2xl font-bold tracking-widest dark:bg-slate-800">{d.boss.invite_code || '—'}</div>
            <Button onClick={() => copy(d.boss.invite_code || '')}>{t('copy')}</Button>
            <Button onClick={regen}><Icon name="refresh" /> {t('new_code')}</Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {d.boss.invite_code_used ? <Badge tone="amber">{t('code_used')}</Badge> : <Badge tone="green">{t('code_ready')}</Badge>} {t('invite_hint')}
          </p>
        </Card>
        <Card title={t('customer_code')}>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-100 px-4 py-2 font-mono text-2xl font-bold tracking-widest dark:bg-slate-800">{d.boss.customer_code || '—'}</div>
            <Button onClick={() => copy(d.boss.customer_code || '')}>{t('copy')}</Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">{t('customer_code_hint')}</p>
        </Card>
      </div>

      <Card title={t('team_n', { n: d.workers.length })} pad={false}>
        {d.workers.length === 0 ? (
          <Empty icon="hardhat" title={t('no_workers')} hint={t('no_workers_hint')} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {stats.map(({ w, cars, tonight, doneT, week, doneW }) => (
              <li key={w.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                <div className="min-w-[140px] flex-1">
                  <div className="font-semibold">{w.name}</div>
                  <div className="text-xs text-slate-500">{t('cars_assigned', { n: cars })}</div>
                </div>
                <div className="w-44">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>{t('tonight')}</span>
                    <span className="tabular-nums">{doneT}/{tonight}</span>
                  </div>
                  <Progress value={tonight ? (doneT / tonight) * 100 : 0} />
                </div>
                <div className="w-44">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>{t('this_week')}</span>
                    <span className="tabular-nums">{doneW}/{week}</span>
                  </div>
                  <Progress tone="blue" value={week ? (doneW / week) * 100 : 0} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => go('cars', { worker: w.id })}>{t('view_cars')}</Button>
                  <Button size="sm" disabled={!cars} onClick={() => { setMoveFrom(w); setMoveTo(''); }}>{t('move_cars')}</Button>
                  <Button size="sm" variant="danger" onClick={() => remove(w)}>{t('remove')}</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={!!moveFrom}
        onClose={() => setMoveFrom(null)}
        title={t('move_cars')}
        width="max-w-sm"
        footer={<><Button onClick={() => setMoveFrom(null)}>{t('cancel')}</Button><Button variant="primary" onClick={doMove}>{t('move')}</Button></>}
      >
        <p className="mb-3 text-sm">{t('move_cars_hint', { name: moveFrom?.name })}</p>
        <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
          <option value="">{t('unassigned')}</option>
          {d.workers.filter((w) => w.id !== moveFrom?.id).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
      </Modal>
    </div>
  );
}
