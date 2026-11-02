import React, { useState } from 'react';
import { useT } from '../lib/i18n.jsx';
import { Button, Field, inputCls, cx, useUi } from '../components/ui.jsx';
import { LangToggle, DarkToggle, Logo } from '../components/Controls.jsx';
import {
  isValidEmail,
  mapAuthError,
  signIn,
  signUp,
  sendResetCode,
  resetWithCode,
} from '../lib/auth.js';
import { findInviteBoss, joinAsWorker } from '../lib/data.js';
import { Icon } from '../components/icons.jsx';

export default function Login({ onWorker }) {
  const t = useT();
  const [tab, setTab] = useState('boss');

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* left: pitch */}
      <div className="hidden flex-1 flex-col justify-between bg-sky-800 p-10 text-white lg:flex">
        <Logo className="[&_div]:text-white" />
        <div className="max-w-lg">
          <h1 className="text-4xl font-bold leading-tight">{t('pitch_title')}</h1>
          <p className="mt-4 text-sky-100">{t('pitch_sub')}</p>
          <ul className="mt-8 space-y-3 text-sm text-sky-50">
            {['pitch_1', 'pitch_2', 'pitch_3', 'pitch_4'].map((k) => (
              <li key={k} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white/20 text-xs"><Icon name="check" className="h-3 w-3" strokeWidth={3} /></span>
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
        <div className="text-xs text-sky-200">© 찾차 Chancha</div>
      </div>

      {/* right: form */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between p-4">
          <Logo className="lg:invisible" />
          <div className="flex items-center gap-2">
            <LangToggle />
            <DarkToggle />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center p-4 pb-12">
          <div className="w-full max-w-sm">
            <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-200 p-1 text-sm font-semibold dark:bg-slate-800">
              {['boss', 'worker'].map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={cx(
                    'rounded-lg py-2',
                    tab === k ? 'bg-white shadow dark:bg-slate-950' : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {k === 'boss' ? t('role_boss') : t('role_worker')}
                </button>
              ))}
            </div>
            {tab === 'boss' ? <BossForm /> : <WorkerForm onWorker={onWorker} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function BossForm() {
  const t = useT();
  const { toast } = useUi();
  const [mode, setMode] = useState('signin'); // signin | signup | forgot | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const fail = (e) => {
    const k = e?.message === 'confirm' ? 'err_confirm' : mapAuthError(e);
    setErr(t(k));
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setErr('');
    if (!isValidEmail(email)) return setErr(t('err_email'));
    setBusy(true);
    try {
      if (mode === 'signin') {
        if (!password) return setErr(t('err_password'));
        await signIn(email, password);
      } else if (mode === 'signup') {
        if (password.length < 6) return setErr(t('err_weak'));
        await signUp(email, password, name);
      } else if (mode === 'forgot') {
        await sendResetCode(email);
        toast(t('code_sent'), 'success');
        setMode('reset');
      } else if (mode === 'reset') {
        if (password.length < 6) return setErr(t('err_weak'));
        if (!/^\d{6,8}$/.test(code.trim())) return setErr(t('err_code'));
        await resetWithCode(email, code, password);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const title = { signin: t('login_title'), signup: t('signup_title'), forgot: t('forgot_title'), reset: t('reset_title') }[mode];

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{mode === 'signin' ? t('login_sub') : mode === 'signup' ? t('signup_sub') : t('forgot_sub')}</p>
      </div>

      {mode === 'signup' && (
        <Field label={t('your_name')}>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
      )}
      <Field label={t('email')}>
        <input
          className={inputCls}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
          required
        />
      </Field>
      {mode === 'reset' && (
        <Field label={t('reset_code')} hint={t('reset_code_hint')}>
          <input className={inputCls} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} />
        </Field>
      )}
      {mode !== 'forgot' && (
        <Field label={mode === 'reset' ? t('new_password') : t('password')} hint={mode !== 'signin' ? t('password_hint') : null}>
          <input
            className={inputCls}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
          />
        </Field>
      )}

      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{err}</div>}

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
        {busy ? '…' : { signin: t('login'), signup: t('signup'), forgot: t('send_code'), reset: t('reset_password') }[mode]}
      </Button>

      <div className="flex flex-wrap justify-between gap-2 text-sm">
        {mode === 'signin' ? (
          <>
            <button type="button" className="text-sky-700 hover:underline dark:text-sky-400" onClick={() => { setErr(''); setMode('forgot'); }}>
              {t('forgot')}
            </button>
            <button type="button" className="text-sky-700 hover:underline dark:text-sky-400" onClick={() => { setErr(''); setMode('signup'); }}>
              {t('no_account')}
            </button>
          </>
        ) : (
          <button type="button" className="text-sky-700 hover:underline dark:text-sky-400" onClick={() => { setErr(''); setMode('signin'); }}>
            <Icon name="back" /> {t('back_to_login')}
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400">{t('same_account')}</p>
    </form>
  );
}

function WorkerForm({ onWorker }) {
  const t = useT();
  const [step, setStep] = useState(1);
  const [code, setCode] = useState('');
  const [boss, setBoss] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const check = async (ev) => {
    ev.preventDefault();
    setErr('');
    if (code.trim().length < 4) return setErr(t('err_invite'));
    setBusy(true);
    try {
      const b = await findInviteBoss(code);
      if (!b) setErr(t('err_invite'));
      else if (b.invite_code_used) setErr(t('err_invite_used'));
      else {
        setBoss(b);
        setStep(2);
      }
    } catch (e) {
      setErr(/anonymous/i.test(String(e?.message)) ? t('err_anon_off') : t('err_network'));
    } finally {
      setBusy(false);
    }
  };

  const join = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const row = await joinAsWorker(boss, name, code);
      onWorker({ id: row.id, name: row.name, boss_id: row.boss_id, boss_name: row.boss_name || boss.name || '' });
    } catch (e) {
      const m = String(e?.message || '');
      setErr(m.includes('code_used') ? t('err_invite_used') : m.includes('invalid_code') ? t('err_invite') : t('err_join') + (m ? ` (${m})` : ''));
    } finally {
      setBusy(false);
    }
  };

  if (step === 2) {
    return (
      <form onSubmit={join} className="space-y-4">
        <h2 className="text-2xl font-bold">{t('worker_join_title')}</h2>
        <div className="rounded-xl bg-sky-50 p-4 text-sm dark:bg-sky-950">
          <div className="text-xs text-slate-500">{t('your_boss')}</div>
          <div className="font-semibold">{boss.name || '—'}</div>
          {boss.apartment_name && <div className="text-slate-500">{boss.apartment_name}</div>}
        </div>
        <Field label={t('your_name')}>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{err}</div>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? '…' : t('join')}
        </Button>
        <button type="button" className="text-sm text-sky-700 hover:underline" onClick={() => setStep(1)}>
          <Icon name="back" /> {t('back')}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={check} className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">{t('worker_title')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('worker_sub')}</p>
      </div>
      <Field label={t('invite_code')}>
        <input
          className={cx(inputCls, 'text-center font-mono text-xl uppercase tracking-widest')}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={8}
          autoFocus
        />
      </Field>
      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{err}</div>}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
        {busy ? '…' : t('continue')}
      </Button>
      <p className="text-xs text-slate-400">{t('worker_app_note')}</p>
    </form>
  );
}
