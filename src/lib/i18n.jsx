import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { D } from './dict.js';

const Ctx = createContext({ lang: 'en', t: (k) => k, setLang: () => {}, dark: false, setDark: () => {} });

const read = (k, fb) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? fb : v;
  } catch (e) {
    return fb;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch (e) {
    /* ignore */
  }
};

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => read('chancha_lang', (navigator.language || '').startsWith('ko') ? 'ko' : 'en'));
  const [dark, setDarkState] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l) => {
    setLangState(l);
    write('chancha_lang', l);
  };
  const setDark = (v) => {
    setDarkState(v);
    document.documentElement.classList.toggle('dark', v);
    write('chancha_dark', v ? '1' : '0');
  };

  const t = useCallback(
    (key, vars) => {
      const e = D[key];
      let s = e ? (lang === 'ko' ? e[1] : e[0]) : key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, t, setLang, dark, setDark }), [lang, t, dark]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;
