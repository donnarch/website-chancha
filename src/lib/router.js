import { useEffect, useState } from 'react';

function parse() {
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const params = {};
  new URLSearchParams(qs || '').forEach((v, k) => (params[k] = v));
  return { path: path || 'overview', params, raw };
}

export function useRoute() {
  const [r, setR] = useState(parse());
  useEffect(() => {
    const h = () => setR(parse());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return r;
}

export function go(path, params) {
  const qs = params && Object.keys(params).length ? `?${new URLSearchParams(params).toString()}` : '';
  window.location.hash = `/${path}${qs}`;
}
