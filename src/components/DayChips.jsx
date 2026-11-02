import React from 'react';
import { Chip } from './ui.jsx';
import { DAY_ORDER } from '../lib/dates.js';

export default function DayChips({ value = [], onChange }) {
  const toggle = (d) => {
    const set = new Set(value);
    set.has(d) ? set.delete(d) : set.add(d);
    onChange(DAY_ORDER.filter((x) => set.has(x)));
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {DAY_ORDER.map((d) => (
        <Chip key={d} active={value.includes(d)} onClick={() => toggle(d)}>
          {d}
        </Chip>
      ))}
    </div>
  );
}
