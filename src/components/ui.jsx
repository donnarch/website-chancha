import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n.jsx';
import { Icon, hasIcon } from './icons.jsx';

export const cx = (...a) => a.filter(Boolean).join(' ');

// ---------- Button ----------
const BTN = {
  primary: 'bg-sky-700 text-white hover:bg-sky-800 disabled:bg-sky-300 dark:disabled:bg-sky-900',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300 dark:disabled:bg-emerald-900',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300 dark:disabled:bg-red-900',
  ghost:
    'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 disabled:opacity-50 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800',
  soft: 'bg-sky-50 text-sky-800 hover:bg-sky-100 disabled:opacity-50 dark:bg-sky-950 dark:text-sky-200 dark:hover:bg-sky-900',
  plain: 'text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800',
};
const SIZE = { sm: 'px-2.5 py-1 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-5 py-3 text-base' };

export function Button({ variant = 'ghost', size = 'md', className, children, ...p }) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed whitespace-nowrap',
        BTN[variant],
        SIZE[size],
        className
      )}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }) {
  return (
    <span
      className={cx(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600',
        className
      )}
    />
  );
}

export function Card({ title, right, children, className, pad = true }) {
  return (
    <section
      className={cx(
        'rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
        className
      )}
    >
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          {right}
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

const TONE = {
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
};
export function Badge({ tone = 'slate', children, className }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', TONE[tone], className)}>
      {children}
    </span>
  );
}

export function Progress({ value, tone = 'green', className }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  const bar = tone === 'green' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-sky-600';
  return (
    <div className={cx('h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800', className)}>
      <div className={cx('h-full rounded-full transition-all duration-500', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:ring-sky-900';

export function Field({ label, hint, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-500">{hint}</span>}
    </label>
  );
}

export function Select({ className, children, ...p }) {
  return (
    <select {...p} className={cx(inputCls, 'pr-8', className)}>
      {children}
    </select>
  );
}

export function Chip({ active, onClick, children, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-sky-700 bg-sky-700 text-white'
          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
        className
      )}
    >
      {children}
    </button>
  );
}

export function Empty({ icon = 'inbox', title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800">{hasIcon(icon) ? <Icon name={icon} className="h-7 w-7" strokeWidth={1.75} /> : icon}</div>
      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</div>
      {hint && <div className="max-w-sm text-xs text-slate-500">{hint}</div>}
      {action}
    </div>
  );
}

// ---------- Modal / drawer ----------
export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg', side = false }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={cx('fixed inset-0 z-50 flex', side ? 'justify-end' : 'items-center justify-center p-4')}>
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'relative flex max-h-full w-full flex-col bg-white shadow-2xl dark:bg-slate-900',
          side ? 'slidein h-full max-w-md' : cx('pop rounded-2xl', width)
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">{footer}</footer>}
      </div>
    </div>
  );
}

// ---------- Toasts + confirm ----------
const UiCtx = createContext({ toast: () => {}, confirm: async () => true });
export const useUi = () => useContext(UiCtx);

export function UiProvider({ children }) {
  const t = useT();
  const [toasts, setToasts] = useState([]);
  const [dlg, setDlg] = useState(null);
  const idRef = useRef(0);

  const toast = useCallback((msg, kind = 'info') => {
    const id = ++idRef.current;
    setToasts((l) => [...l, { id, msg, kind }]);
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setDlg({ ...(typeof opts === 'string' ? { message: opts } : opts), resolve });
      }),
    []
  );

  const close = (v) => {
    dlg?.resolve(v);
    setDlg(null);
  };

  return (
    <UiCtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2 px-4">
        {toasts.map((x) => (
          <div
            key={x.id}
            className={cx(
              'pop pointer-events-auto max-w-md rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg',
              x.kind === 'error' ? 'bg-red-600 text-white' : x.kind === 'success' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-white'
            )}
          >
            {x.msg}
          </div>
        ))}
      </div>
      <Modal
        open={!!dlg}
        onClose={() => close(false)}
        title={dlg?.title || t('confirm')}
        width="max-w-sm"
        footer={
          <>
            <Button onClick={() => close(false)}>{dlg?.cancelText || t('cancel')}</Button>
            <Button variant={dlg?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {dlg?.okText || t('ok')}
            </Button>
          </>
        }
      >
        <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{dlg?.message}</p>
      </Modal>
    </UiCtx.Provider>
  );
}

export function useCopy() {
  const { toast } = useUi();
  const t = useT();
  return async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(t('copied'), 'success');
    } catch (e) {
      toast(text);
    }
  };
}
