import { supabase } from './supabase.js';
import { getWeekStart } from './dates.js';
import { normPlate } from './plates.js';
export { autoDistribute } from './distribute.js';

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
export { chunk };

// Reads every row of a query (PostgREST returns max 1000 per request).
export async function fetchAll(build, pageSize = 1000) {
  let all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export const generateCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

// ---------- loading ----------
export async function loadApartments(bossId) {
  const { data, error } = await supabase
    .from('apartments')
    .select('*')
    .eq('boss_id', bossId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function loadWorkers(bossId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, boss_id, created_at')
    .eq('boss_id', bossId)
    .eq('role', 'worker')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function loadCars(bossId) {
  return fetchAll(() =>
    supabase
      .from('cars')
      .select('*')
      .eq('boss_id', bossId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
  );
}

export async function loadJobs(bossId, weekStart) {
  const rows = await fetchAll(() =>
    supabase
      .from('wash_jobs')
      .select('*, cars!inner(boss_id)')
      .eq('cars.boss_id', bossId)
      .eq('week_start_date', weekStart)
      .order('id', { ascending: true })
  );
  return rows.map(({ cars, ...j }) => j);
}

// One job per active car per week (unique constraint makes this safe to repeat).
export async function ensureWeeklyJobs(cars, jobs, weekStart) {
  const have = new Set(jobs.map((j) => j.car_id));
  const missing = cars.filter((c) => c.is_active !== false && !have.has(c.id));
  if (!missing.length) return [];
  let created = [];
  for (const part of chunk(missing, 200)) {
    const { data, error } = await supabase
      .from('wash_jobs')
      .upsert(
        part.map((c) => ({
          car_id: c.id,
          week_start_date: weekStart,
          status: 'pending',
          assigned_worker_id: c.assigned_worker_id || null,
        })),
        { onConflict: 'car_id,week_start_date', ignoreDuplicates: true }
      )
      .select();
    if (error) throw error;
    created = created.concat(data || []);
  }
  return created;
}

export async function loadAll(bossId, weekStart = getWeekStart()) {
  const [apartments, workers, cars] = await Promise.all([
    loadApartments(bossId),
    loadWorkers(bossId),
    loadCars(bossId),
  ]);
  let jobs = await loadJobs(bossId, weekStart);
  const created = await ensureWeeklyJobs(cars, jobs, weekStart);
  if (created.length) jobs = jobs.concat(created);
  // keep one job per car (defensive)
  const seen = new Set();
  jobs = jobs.filter((j) => (seen.has(j.car_id) ? false : (seen.add(j.car_id), true)));
  return { apartments, workers, cars, jobs };
}

// ---------- marking done ----------
export async function setJobDone(job, byId) {
  const patch = { status: 'done', done_by_worker_id: byId || null, done_at: new Date().toISOString() };
  const { error } = await supabase.from('wash_jobs').update(patch).eq('id', job.id);
  if (error) throw error;
  return patch;
}

export async function setJobUndone(job) {
  const patch = { status: 'pending', done_by_worker_id: null, done_at: null };
  const { error } = await supabase.from('wash_jobs').update(patch).eq('id', job.id);
  if (error) throw error;
  return patch;
}

export async function updateJob(id, patch) {
  const { error } = await supabase.from('wash_jobs').update(patch).eq('id', id);
  if (error) throw error;
}

export async function setJobsDone(jobs, byIdFor) {
  const now = new Date().toISOString();
  const results = [];
  for (const j of jobs) {
    const patch = { status: 'done', done_by_worker_id: byIdFor(j) || null, done_at: now };
    const { error } = await supabase.from('wash_jobs').update(patch).eq('id', j.id);
    if (error) throw error;
    results.push({ id: j.id, patch });
  }
  return results;
}

// ---------- cars ----------
export async function updateCar(id, patch) {
  const { error } = await supabase.from('cars').update(patch).eq('id', id);
  if (error) throw error;
}

export async function assignWorker(carIds, workerId, weekStart) {
  const wid = workerId || null;
  for (const part of chunk(carIds, 100)) {
    const a = await supabase.from('cars').update({ assigned_worker_id: wid }).in('id', part);
    if (a.error) throw a.error;
    const b = await supabase
      .from('wash_jobs')
      .update({ assigned_worker_id: wid })
      .in('car_id', part)
      .eq('week_start_date', weekStart)
      .neq('status', 'done');
    if (b.error) throw b.error;
  }
}

export async function setActive(carIds, active) {
  for (const part of chunk(carIds, 100)) {
    const { error } = await supabase.from('cars').update({ is_active: active }).in('id', part);
    if (error) throw error;
  }
}

// Same order as the mobile app so nothing is left pointing at a deleted car.
export async function deleteCars(carIds) {
  for (const part of chunk(carIds, 100)) {
    let r = await supabase.from('users').delete().in('customer_car_id', part).eq('role', 'customer');
    if (r.error) throw r.error;
    r = await supabase.from('wash_jobs').delete().in('car_id', part);
    if (r.error) throw r.error;
    r = await supabase.from('parking_history').delete().in('car_id', part);
    if (r.error) throw r.error;
    r = await supabase.from('complaints').delete().in('car_id', part);
    if (r.error) throw r.error;
    r = await supabase.from('cars').delete().in('id', part);
    if (r.error) throw r.error;
  }
}

export async function countLinkedResidents(carIds) {
  let n = 0;
  for (const part of chunk(carIds, 100)) {
    const { count, error } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .in('customer_car_id', part)
      .eq('role', 'customer');
    if (error) throw error;
    n += count || 0;
  }
  return n;
}

export async function applyDistribution(map, weekStart) {
  const byWorker = {};
  for (const [carId, w] of Object.entries(map)) (byWorker[w] ||= []).push(carId);
  for (const [w, ids] of Object.entries(byWorker)) await assignWorker(ids, w, weekStart);
}

// ---------- import ----------
export function buildPlateIndex(cars) {
  const idx = new Map();
  for (const c of cars) {
    const key = `${c.apartment_id || ''}|${normPlate(c.plate_number)}`;
    if (!idx.has(key)) idx.set(key, c);
  }
  return idx;
}

export async function createApartment(bossId, name) {
  const { data, error } = await supabase
    .from('apartments')
    .insert({ name: name.trim(), boss_id: bossId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// rows: [{ plate, model, color, block, location, phone, remarks, days, workerId, reactivateId? }]
export async function importCars({ bossId, apartmentId, rows, defaults, weekStart, onProgress }) {
  const result = { added: 0, reactivated: 0, failed: 0, errors: [], newCars: [], reactivatedIds: [] };
  const toAdd = rows.filter((r) => !r.reactivateId);
  const toReact = rows.filter((r) => r.reactivateId);
  let done = 0;
  const total = rows.length;

  if (toReact.length) {
    for (const part of chunk(toReact, 100)) {
      const ids = part.map((r) => r.reactivateId);
      const { error } = await supabase.from('cars').update({ is_active: true }).in('id', ids);
      if (error) {
        result.failed += part.length;
        result.errors.push(error.message);
      } else {
        result.reactivated += part.length;
        result.reactivatedIds.push(...ids);
      }
      done += part.length;
      onProgress?.(done, total);
    }
  }

  for (const part of chunk(toAdd, 50)) {
    const payload = part.map((r) => ({
      plate_number: r.plate.trim(),
      car_model: r.model || '',
      car_color: r.color || null,
      block_name: r.block || null,
      location_desc: r.location || null,
      owner_phone: r.phone || null,
      remarks: r.remarks || null,
      entry_time: r.entryTime || null,
      apartment_id: apartmentId,
      boss_id: bossId,
      assigned_worker_id: r.workerId || null,
      wash_days: JSON.stringify(r.days && r.days.length ? r.days : defaults.days),
      week_pattern: defaults.weekPattern || 'every',
      is_active: true,
      schedule: 'weekly',
    }));
    const { data, error } = await supabase.from('cars').insert(payload).select();
    if (error || !data) {
      // fall back to one by one so one bad row doesn't sink the batch
      for (let i = 0; i < payload.length; i++) {
        const one = await supabase.from('cars').insert(payload[i]).select().single();
        if (one.error || !one.data) {
          result.failed++;
          result.errors.push(`${payload[i].plate_number}: ${one.error?.message || 'failed'}`);
        } else {
          result.added++;
          result.newCars.push(one.data);
        }
      }
    } else {
      result.added += data.length;
      result.newCars.push(...data);
    }
    done += part.length;
    onProgress?.(done, total);
  }

  // this week's jobs for the new + reactivated cars
  try {
    const jobsFor = result.newCars.map((c) => c);
    for (const part of chunk(jobsFor, 200)) {
      await supabase.from('wash_jobs').upsert(
        part.map((c) => ({
          car_id: c.id,
          week_start_date: weekStart,
          status: 'pending',
          assigned_worker_id: c.assigned_worker_id || null,
        })),
        { onConflict: 'car_id,week_start_date', ignoreDuplicates: true }
      );
    }
  } catch (e) {
    result.errors.push(e.message || String(e));
  }
  return result;
}

// ---------- workers ----------
export async function removeWorkerAccount(workerId) {
  const steps = [
    supabase.from('cars').update({ assigned_worker_id: null }).eq('assigned_worker_id', workerId),
    supabase.from('wash_jobs').update({ assigned_worker_id: null }).eq('assigned_worker_id', workerId),
    supabase.from('wash_jobs').update({ done_by_worker_id: null }).eq('done_by_worker_id', workerId),
    supabase.from('blocks').update({ assigned_worker_id: null }).eq('assigned_worker_id', workerId),
    supabase.from('parking_history').update({ worker_id: null }).eq('worker_id', workerId),
    supabase.from('worker_shifts').delete().eq('worker_id', workerId),
  ];
  for (const s of steps) {
    const { error } = await s;
    if (error) console.warn('removeWorker step:', error.message);
  }
  const { error } = await supabase.from('users').delete().eq('id', workerId);
  if (error) throw error;
}

export async function regenerateInviteCode(bossId) {
  const code = generateCode();
  const { error } = await supabase
    .from('users')
    .update({ invite_code: code, invite_code_used: false })
    .eq('id', bossId);
  if (error) throw error;
  return code;
}

// ---------- complaints ----------
export async function loadComplaints(bossId) {
  const { data, error } = await supabase
    .from('complaints')
    .select('*')
    .eq('boss_id', bossId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

export async function setComplaintStatus(id, status) {
  const { error } = await supabase.from('complaints').update({ status }).eq('id', id);
  if (error) throw error;
}

// ---------- parking info ----------
export async function loadParkingInfo(carIds) {
  const out = {};
  for (const part of chunk(carIds, 100)) {
    const { data } = await supabase
      .from('parking_history')
      .select('car_id, floor, zone, spot_number, photo_url, created_at')
      .in('car_id', part)
      .order('created_at', { ascending: false })
      .limit(1000);
    for (const r of data || []) if (!out[r.car_id]) out[r.car_id] = r;
  }
  return out;
}

export async function loadCarHistory(carId) {
  const { data } = await supabase
    .from('parking_history')
    .select('*')
    .eq('car_id', carId)
    .order('created_at', { ascending: false })
    .limit(12);
  return data || [];
}

export async function loadWeekJobs(bossId, weekStart) {
  return loadJobs(bossId, weekStart);
}

// ---------- worker session ----------
// Workers sign in anonymously (no email) and join through database functions that check the code.
async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) return data.session;
  const { data: res, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return res.session;
}

export async function findInviteBoss(code) {
  await ensureSession();
  const { data, error } = await supabase.rpc('find_invite_boss', { p_code: code.trim() });
  if (error) throw error;
  return data || null;
}

export async function joinAsWorker(boss, name, code) {
  await ensureSession();
  const { data, error } = await supabase.rpc('join_as_worker', { p_code: code.trim(), p_name: name });
  if (error) throw error;
  return data;
}

export async function loadWorkerData(worker, weekStart, all = false) {
  let q = (b) =>
    supabase
      .from('cars')
      .select('*')
      .eq('boss_id', worker.boss_id)
      .eq('is_active', true)
      .order('block_name', { ascending: true })
      .order('plate_number', { ascending: true });
  const cars = await fetchAll(() => (all ? q() : q().eq('assigned_worker_id', worker.id)));
  let jobs = await loadJobs(worker.boss_id, weekStart);
  // if the boss has not opened the app yet this week, create this week's jobs (safe to repeat)
  try {
    const created = await ensureWeeklyJobs(cars, jobs, weekStart);
    if (created.length) jobs = jobs.concat(created);
  } catch (e) {
    console.warn('ensure jobs (worker):', e.message);
  }
  const ids = new Set(cars.map((c) => c.id));
  return { cars, jobs: jobs.filter((j) => ids.has(j.car_id)) };
}

export async function workerStillExists(workerId) {
  const { data } = await supabase.from('users').select('id').eq('id', workerId).maybeSingle();
  return !!data;
}
