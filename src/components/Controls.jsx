import React from 'react';
import { useI18n } from '../lib/i18n.jsx';
import { cx } from './ui.jsx';
import { Icon } from './icons.jsx';

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-xs font-semibold dark:border-slate-700">
      {[
        ['en', 'EN'],
        ['ko', '한'],
      ].map(([k, label]) => (
        <button
          key={k}
          onClick={() => setLang(k)}
          className={cx(
            'px-2.5 py-1.5',
            lang === k ? 'bg-sky-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function DarkToggle() {
  const { dark, setDark } = useI18n();
  return (
    <button
      onClick={() => setDark(!dark)}
      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
      title="Dark mode"
      aria-label="Dark mode"
    >
      <Icon name={dark ? 'sun' : 'moon'} className="h-4 w-4" />
    </button>
  );
}

export function Logo({ className }) {
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-700 text-lg font-bold text-white">찾</div>
      <div className="leading-tight">
        <div className="text-base font-bold">찾차 Chancha</div>
      </div>
    </div>
  );
}
