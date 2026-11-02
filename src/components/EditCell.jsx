import React, { useEffect, useRef, useState } from 'react';
import { cx } from './ui.jsx';

// Click to edit, Enter/blur to save, Esc to cancel.
export default function EditCell({ value, onSave, className, placeholder = '—', list, mono }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value || '');
  const ref = useRef(null);

  useEffect(() => {
    if (!editing) setV(value || '');
  }, [value, editing]);
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [editing]);

  const commit = async () => {
    setEditing(false);
    const next = v.trim();
    if (next === (value || '')) return;
    try {
      const ok = await onSave(next);
      if (ok === false) setV(value || '');
    } catch (e) {
      setV(value || '');
    }
  };

  if (editing) {
    return (
      <>
        <input
          ref={ref}
          value={v}
          list={list}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setV(value || '');
              setEditing(false);
            }
          }}
          className={cx(
            'w-full rounded border border-sky-500 bg-white px-1.5 py-1 text-sm outline-none ring-2 ring-sky-200 dark:bg-slate-900 dark:ring-sky-900',
            mono && 'font-mono',
            className
          )}
        />
      </>
    );
  }
  return (
    <div
      onClick={() => setEditing(true)}
      title="Click to edit"
      className={cx(
        'min-h-[28px] cursor-text truncate rounded px-1.5 py-1 text-sm hover:bg-sky-50 dark:hover:bg-slate-800',
        mono && 'font-mono',
        !value && 'text-slate-400',
        className
      )}
    >
      {value || placeholder}
    </div>
  );
}
