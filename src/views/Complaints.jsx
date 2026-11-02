import React, { useEffect, useState } from 'react';
import { useDash } from '../state.jsx';
import { useT } from '../lib/i18n.jsx';
import { Badge, Button, Card, Empty, Spinner, useUi } from '../components/ui.jsx';
import { loadComplaints, setComplaintStatus } from '../lib/data.js';
import { fmtDateTime } from '../lib/dates.js';
import { Icon } from '../components/icons.jsx';

export default function Complaints({ onChange }) {
  const t = useT();
  const d = useDash();
  const { toast } = useUi();
  const [rows, setRows] = useState(null);

  const load = async () => {
    try {
      const r = await loadComplaints(d.boss.id);
      setRows(r);
      onChange?.(r.filter((x) => x.status !== 'resolved').length);
    } catch (e) {
      setRows([]);
      toast(t('err_load'), 'error');
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (c) => {
    const next = c.status === 'resolved' ? 'open' : 'resolved';
    try {
      await setComplaintStatus(c.id, next);
      const upd = rows.map((r) => (r.id === c.id ? { ...r, status: next } : r));
      setRows(upd);
      onChange?.(upd.filter((x) => x.status !== 'resolved').length);
    } catch (e) {
      toast(t('err_save'), 'error');
    }
  };

  if (!rows) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('nav_complaints')}</h1>
        <p className="text-sm text-slate-500">{t('complaints_note')}</p>
      </div>
      {rows.length === 0 ? (
        <Card><Empty icon="party" title={t('no_complaints')} /></Card>
      ) : (
        rows.map((c) => (
          <Card key={c.id}>
            <div className="flex gap-4">
              {c.photo_url && (
                <a href={c.photo_url} target="_blank" rel="noreferrer">
                  <img src={c.photo_url} alt="" className="h-24 w-24 rounded-lg object-cover" loading="lazy" />
                </a>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{d.carById[c.car_id]?.plate_number || '—'}</span>
                  <Badge tone={c.status === 'resolved' ? 'green' : 'red'}>{c.status === 'resolved' ? t('resolved') : t('open')}</Badge>
                  <span className="text-xs text-slate-500">{fmtDateTime(c.created_at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{c.description || '—'}</p>
              </div>
              <Button size="sm" onClick={() => toggle(c)}>{c.status === 'resolved' ? t('reopen') : <><Icon name="check" /> {t('resolve')}</>}</Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
