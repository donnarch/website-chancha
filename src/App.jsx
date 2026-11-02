import React, { useCallback, useEffect, useRef, useState } from 'react';
import { I18nProvider, useT } from './lib/i18n.jsx';
import { UiProvider, Button, Spinner } from './components/ui.jsx';
import { supabase } from './lib/supabase.js';
import { findBossRow, createBossRow, signOut } from './lib/auth.js';
import Login from './views/Login.jsx';
import BossApp from './views/BossApp.jsx';
import WorkerApp from './views/WorkerApp.jsx';
import { Icon } from './components/icons.jsx';

const WKEY = 'chancha_web_worker';
const readWorker = () => {
  try {
    const v = localStorage.getItem(WKEY);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    return null;
  }
};

function Root() {
  const t = useT();
  const [state, setState] = useState({ status: 'loading' });
  const [worker, setWorkerState] = useState(readWorker);
  const uidRef = useRef(null);
  const creating = useRef(false);

  const setWorker = (w) => {
    try {
      if (w) localStorage.setItem(WKEY, JSON.stringify(w));
      else localStorage.removeItem(WKEY);
    } catch (e) {
      /* ignore */
    }
    setWorkerState(w);
  };

  const resolve = useCallback(async (session) => {
    if (!session || session.user?.is_anonymous) {
      uidRef.current = null;
      setState({ status: 'out' });
      return;
    }
    const uid = session.user.id;
    if (uidRef.current === uid) return; // same user (tab refocus etc.)
    uidRef.current = uid;
    setState({ status: 'loading' });
    try {
      let row = await findBossRow(uid);
      if (!row) {
        if (creating.current) return;
        creating.current = true;
        const r = await createBossRow({
          uid,
          email: session.user.email || '',
          name: session.user.user_metadata?.name,
        });
        creating.current = false;
        row = r.row || (await findBossRow(uid));
        if (!row) throw new Error(r.error || 'profile');
      }
      setState({ status: 'ready', boss: row });
    } catch (e) {
      uidRef.current = null;
      setState({ status: 'error', message: e.message });
    }
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => alive && resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
      setTimeout(() => alive && resolve(session), 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [resolve]);

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-slate-500">
        <Spinner /> {t('loading')}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex justify-center text-amber-500"><Icon name="alert" className="h-10 w-10" /></div>
        <p className="max-w-md text-sm text-slate-600 dark:text-slate-300">{t('err_profile')}</p>
        <p className="max-w-md break-all text-xs text-slate-400">{state.message}</p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => supabase.auth.getSession().then(({ data }) => resolve(data.session))}>
            {t('retry')}
          </Button>
          <Button onClick={() => signOut()}>{t('logout')}</Button>
        </div>
      </div>
    );
  }

  if (state.status === 'ready') return <BossApp boss={state.boss} onLogout={signOut} />;
  if (worker) return <WorkerApp worker={worker} onLogout={() => { setWorker(null); supabase.auth.signOut(); }} />;
  return <Login onWorker={setWorker} />;
}

export default function App() {
  return (
    <I18nProvider>
      <UiProvider>
        <Root />
      </UiProvider>
    </I18nProvider>
  );
}
