// In-memory stand-in for Supabase, used ONLY when built with VITE_MOCK=1 (local UI tests).
const uid = () => crypto.randomUUID();
const db = { users: [], apartments: [], cars: [], wash_jobs: [], complaints: [], parking_history: [], worker_shifts: [], blocks: [] };
export const __db = db;

function seed() {
  const boss = 'boss-1';
  db.users.push({ id: boss, auth_id: boss, email: 'boss@test.com', name: 'Kim Sajang', role: 'boss', invite_code: 'ABCD2345', invite_code_used: false, customer_code: 'CUST9988', created_at: '2026-01-01' });
  db.users.push({ id: 'worker_1', name: 'Minho', role: 'worker', boss_id: boss, created_at: '2026-01-02' });
  db.users.push({ id: 'worker_2', name: 'Jisoo', role: 'worker', boss_id: boss, created_at: '2026-01-03' });
  db.apartments.push({ id: 'apt-1', name: '해운대 아이파크', boss_id: boss, created_at: '2026-01-01' });
  db.apartments.push({ id: 'apt-2', name: '광안리 더샵', boss_id: boss, created_at: '2026-01-02' });
  const models = ['그랜저', '소나타', '아반떼', '카니발', '쏘렌토', '싼타페', 'K5', '스포티지'];
  const colors = ['흰색', '검정', '은색', '회색', '파랑'];
  const letters = ['가', '나', '다', '라', '마', '거', '너', '더'];
  const days = [['월', '목'], ['화', '금'], ['수', '토'], ['월', '화', '수', '목', '금']];
  const jsDay = ['일', '월', '화', '수', '목', '금', '토'][new Date().getDay()];
  for (let i = 0; i < 60; i++) {
    db.cars.push({
      id: `car-${i}`,
      plate_number: `${10 + (i % 80)}${letters[i % 8]}${String(1000 + i * 37).slice(-4)}`,
      car_model: models[i % 8], car_color: colors[i % 5], block_name: `${101 + (i % 5)}동`, location_desc: i % 3 ? `B${1 + (i % 3)}` : null,
      apartment_id: i < 45 ? 'apt-1' : 'apt-2', boss_id: boss, assigned_worker_id: i % 4 === 3 ? null : i % 2 ? 'worker_1' : 'worker_2',
      wash_days: JSON.stringify(i < 20 ? [jsDay] : days[i % 4]), week_pattern: 'every', is_active: i !== 59, schedule: 'weekly', created_at: `2026-02-${String(1 + (i % 28)).padStart(2, '0')}T00:00:${String(i % 60).padStart(2, '0')}Z`,
    });
  }
  db.complaints.push({ id: 'cmp-1', car_id: 'car-1', boss_id: boss, description: '문 옆에 스크래치가 생겼어요', status: 'open', created_at: new Date().toISOString() });
}
seed();

const getPath = (row, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), row);

class Q {
  constructor(table) { this.table = table; this.filters = []; this.ord = []; this.op = 'select'; this.countMode = null; this.head = false; this.cols = '*'; this._single = null; this._range = null; this._lim = null; this.wantRows = false; }
  select(cols = '*', opts = {}) { if (this.op === 'select') this.cols = cols; else this.wantRows = true; this.countMode = opts.count || null; this.head = !!opts.head; return this; }
  insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
  update(p) { this.op = 'update'; this.payload = p; return this; }
  upsert(rows, o = {}) { this.op = 'upsert'; this.payload = rows; this.opts = o; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filters.push((r) => getPath(r, c) === v); this.joinNeed(c); return this; }
  neq(c, v) { this.filters.push((r) => getPath(r, c) !== v); return this; }
  in(c, vs) { this.filters.push((r) => vs.includes(getPath(r, c))); return this; }
  order(c, o = {}) { this.ord.push([c, o.ascending !== false]); return this; }
  range(a, b) { this._range = [a, b]; return this; }
  limit(n) { this._lim = n; return this; }
  single() { this._single = 'single'; return this; }
  maybeSingle() { this._single = 'maybe'; return this; }
  joinNeed() {}
  then(res, rej) { return this.exec().then(res, rej); }
  async exec() {
    await new Promise((r) => setTimeout(r, 15));
    const T = db[this.table];
    if (!T) return { data: null, error: { message: `no table ${this.table}` } };
    const withJoin = (r) => (this.table === 'wash_jobs' && this.cols.includes('cars!inner') ? { ...r, cars: db.cars.find((c) => c.id === r.car_id) } : r);
    const match = (r) => this.filters.every((f) => f(withJoin(r)));
    let data;
    if (this.op === 'insert' || (this.op === 'upsert')) {
      const arr = Array.isArray(this.payload) ? this.payload : [this.payload];
      const out = [];
      for (const p of arr) {
        if (this.op === 'upsert' && this.opts?.onConflict) {
          const keys = this.opts.onConflict.split(',');
          if (T.some((r) => keys.every((k) => r[k] === p[k]))) continue;
        }
        if (this.table === 'cars' && p.plate_number === 'FAIL!') return { data: null, error: { message: 'mock failure' } };
        const row = { id: p.id || uid(), created_at: new Date().toISOString(), ...p };
        T.push(row);
        out.push(row);
      }
      data = out;
      if (!this.wantRows) return { data: null, error: null };
    } else if (this.op === 'update') {
      data = T.filter(match);
      data.forEach((r) => Object.assign(r, this.payload));
      if (!this.wantRows) return { data: null, error: null };
    } else if (this.op === 'delete') {
      const del = T.filter(match);
      db[this.table] = T.filter((r) => !del.includes(r));
      return { data: null, error: null };
    } else {
      data = T.filter(match);
    }
    for (const [c, asc] of [...this.ord].reverse()) data = data.slice().sort((a, b) => (String(a[c] ?? '') < String(b[c] ?? '') ? -1 : String(a[c] ?? '') > String(b[c] ?? '') ? 1 : 0) * (asc ? 1 : -1));
    const total = data.length;
    if (this._range) data = data.slice(this._range[0], this._range[1] + 1);
    if (this._lim != null) data = data.slice(0, this._lim);
    data = data.map((r) => ({ ...r }));
    if (this.countMode && this.head) return { data: null, count: total, error: null };
    if (this._single) {
      if (data.length === 1) return { data: data[0], error: null };
      if (this._single === 'maybe' && data.length === 0) return { data: null, error: null };
      return { data: null, error: { message: 'row count ' + data.length } };
    }
    return { data, error: null, count: total };
  }
}

export function createMockClient() {
  let session = null;
  const listeners = new Set();
  const emit = (ev) => listeners.forEach((l) => l(ev, session));
  try { if (localStorage.getItem('mock_session') === '1') session = { user: { id: 'boss-1', email: 'boss@test.com', user_metadata: {} } }; } catch (e) {}
  return {
    from: (t) => new Q(t),
    rpc: async (fn, args) => {
      if (!session) return { data: null, error: { message: 'not_signed_in' } };
      if (fn === 'find_invite_boss') {
        const b = db.users.find((u) => u.role === 'boss' && u.invite_code === args.p_code.toUpperCase());
        return { data: b ? { id: b.id, name: b.name, apartment_name: b.apartment_name, invite_code_used: !!b.invite_code_used } : null, error: null };
      }
      if (fn === 'join_as_worker') {
        const b = db.users.find((u) => u.role === 'boss' && u.invite_code === args.p_code.toUpperCase());
        if (!b) return { data: null, error: { message: 'invalid_code' } };
        if (b.invite_code_used) return { data: null, error: { message: 'code_used' } };
        const row = { id: session.user.id, name: args.p_name || 'Worker', role: 'worker', boss_id: b.id };
        db.users.push(row); b.invite_code_used = true;
        return { data: { ...row, boss_name: b.name }, error: null };
      }
      return { data: null, error: { message: 'unknown rpc' } };
    },
    channel: () => ({ on() { return this; }, subscribe(cb) { setTimeout(() => cb?.('SUBSCRIBED'), 50); return this; } }),
    removeChannel: () => {},
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (cb) => { listeners.add(cb); return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }; },
      signInWithPassword: async ({ email, password }) => {
        if (email === 'boss@test.com' && password === 'secret1') {
          session = { user: { id: 'boss-1', email, user_metadata: {} } };
          try { localStorage.setItem('mock_session', '1'); } catch (e) {}
          setTimeout(() => emit('SIGNED_IN'), 10);
          return { data: { session }, error: null };
        }
        return { data: null, error: { message: 'Invalid login credentials' } };
      },
      signUp: async ({ email, options }) => {
        const id = uid();
        session = { user: { id, email, user_metadata: options?.data || {} } };
        setTimeout(() => emit('SIGNED_IN'), 10);
        return { data: { session }, error: null };
      },
      signInAnonymously: async () => { session = { user: { id: 'anon-' + uid(), is_anonymous: true, user_metadata: {} } }; setTimeout(() => emit('SIGNED_IN'), 10); return { data: { session }, error: null }; },
      signOut: async () => { session = null; try { localStorage.removeItem('mock_session'); } catch (e) {} setTimeout(() => emit('SIGNED_OUT'), 5); return { error: null }; },
      resetPasswordForEmail: async () => ({ error: null }),
      verifyOtp: async () => ({ error: null }),
      updateUser: async () => ({ error: null }),
    },
  };
}
