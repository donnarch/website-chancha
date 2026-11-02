import React, { useEffect, useState } from 'react';
import { DashProvider, useDash } from '../state.jsx';
import { useT, useI18n } from '../lib/i18n.jsx';
import { useRoute, go } from '../lib/router.js';
import { Button, Spinner, Select, Modal, cx, useUi } from '../components/ui.jsx';
import { LangToggle, DarkToggle, Logo } from '../components/Controls.jsx';
import { weekLabel } from '../lib/dates.js';
import { loadComplaints } from '../lib/data.js';
import Overview from './Overview.jsx';
import Cars from './Cars.jsx';
import ImportView from './ImportView.jsx';
import Workers from './Workers.jsx';
import Report from './Report.jsx';
import Complaints from './Complaints.jsx';
import { Icon } from '../components/icons.jsx';

const NAV = [
  ['overview', 'chart', 'nav_overview'],
  ['cars', 'car', 'nav_cars'],
  ['import', 'camera', 'nav_import'],
  ['workers', 'hardhat', 'nav_workers'],
  ['report', 'trend', 'nav_report'],
  ['complaints', 'alert', 'nav_complaints'],
];

export default function BossApp({ boss, onLogout }) {
  return (
    <DashProvider boss={boss}>
      <Shell onLogout={onLogout} />
    </DashProvider>
  );
}

function Shell({ onLogout }) {
  const t = useT();
  const { lang } = useI18n();
  const route = useRoute();
  const d = useDash();
  const { toast } = useUi();
  const [open, setOpen] = useState(false);
  const [complaintCount, setComplaintCount] = useState(0);
  const [account, setAccount] = useState(false);

  const view = NAV.some((n) => n[0] === route.path) ? route.path : 'overview';

  useEffect(() => {
    let alive = true;
    loadComplaints(d.boss.id)
      .then((rows) => alive && setComplaintCount(rows.filter((r) => r.status !== 'resolved').length))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [d.boss.id, view]);

  const Nav = ({ horizontal }) => (
    <nav className={cx(horizontal ? 'flex gap-1 overflow-x-auto' : 'flex flex-col gap-1')}>
      {NAV.map(([k, icon, label]) => (
        <button
          key={k}
          onClick={() => {
            go(k);
            setOpen(false);
          }}
          className={cx(
            'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            view === k
              ? 'bg-sky-700 text-white'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          )}
        >
          <Icon name={icon} className="h-[18px] w-[18px]" />
          {t(label)}
          {k === 'complaints' && complaintCount > 0 && (
            <span className="ml-auto rounded-full bg-red-600 px-1.5 text-xs text-white">{complaintCount}</span>
          )}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="flex h-full">
      {/* sidebar (desktop) */}
      <aside className="no-print hidden w-60 flex-none flex-col border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <Logo className="mb-6 px-1" />
        <Nav />
        <div className="mt-auto space-y-2 pt-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className={cx('h-2 w-2 rounded-full', d.live ? 'bg-emerald-500' : 'bg-amber-400')} />
            {d.live ? t('live') : t('polling')}
          </div>
          <div>{weekLabel(d.weekStart, lang)}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
          <button className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm lg:hidden dark:border-slate-700" onClick={() => setOpen(true)} aria-label="Menu">
            <Icon name="menu" className="h-4 w-4" />
          </button>
          <div className="min-w-[160px] max-w-xs flex-1">
            <Select value={d.apt} onChange={(e) => d.setApt(e.target.value)} aria-label={t('apartment')}>
              <option value="all">{t('all_apartments')}</option>
              {d.apartments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={() => d.reload()} disabled={d.loading} title={t('refresh')}>
            {d.loading ? <Spinner /> : <Icon name="refresh" />} <span className="hidden sm:inline">{t('refresh')}</span>
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <LangToggle />
            <DarkToggle />
            <Button onClick={() => setAccount(true)}>
              <Icon name="user" /> <span className="hidden sm:inline">{d.boss.name || d.boss.email}</span>
            </Button>
          </div>
        </header>

        <main className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          {d.error && !d.cars.length ? (
            <div className="mx-auto mt-16 max-w-md text-center">
              <div className="flex justify-center text-amber-500"><Icon name="alert" className="h-10 w-10" /></div>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{t('err_load')}</p>
              <p className="mt-1 break-all text-xs text-slate-400">{d.error}</p>
              <Button variant="primary" className="mt-4" onClick={() => d.reload()}>
                {t('retry')}
              </Button>
            </div>
          ) : d.loading && !d.cars.length ? (
            <div className="flex items-center justify-center gap-3 py-24 text-slate-500">
              <Spinner /> {t('loading')}
            </div>
          ) : (
            <>
              {view === 'overview' && <Overview />}
              {view === 'cars' && <Cars key={route.raw} params={route.params} />}
              {view === 'import' && <ImportView />}
              {view === 'workers' && <Workers />}
              {view === 'report' && <Report />}
              {view === 'complaints' && <Complaints onChange={setComplaintCount} />}
            </>
          )}
        </main>
      </div>

      {/* mobile nav drawer */}
      <Modal open={open} onClose={() => setOpen(false)} title="찾차 Chancha" side>
        <Nav />
      </Modal>

      <Modal
        open={account}
        onClose={() => setAccount(false)}
        title={t('account')}
        width="max-w-sm"
        footer={
          <>
            <Button onClick={() => setAccount(false)}>{t('close')}</Button>
            <Button variant="danger" onClick={onLogout}>
              {t('logout')}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm">
          <div className="text-lg font-semibold">{d.boss.name}</div>
          <div className="text-slate-500">{d.boss.email || '—'}</div>
          <p className="pt-3 text-xs text-slate-500">{t('account_note')}</p>
        </div>
      </Modal>
    </div>
  );
}
