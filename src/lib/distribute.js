// Splits cars across workers: same block stays with the same worker, loads stay even.
export function autoDistribute(cars, workerIds) {
  if (!workerIds.length) return {};
  const groups = new Map();
  for (const c of cars) {
    const key = `${c.apartment_id || ''}|${c.block_name || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length);
  const load = Object.fromEntries(workerIds.map((w) => [w, 0]));
  const out = {};
  for (const g of ordered) {
    // a giant block is split over several workers
    const cap = Math.ceil(cars.length / workerIds.length);
    let rest = g.slice();
    while (rest.length) {
      const w = workerIds.reduce((a, b) => (load[a] <= load[b] ? a : b));
      const room = Math.max(1, cap - load[w]);
      const take = rest.splice(0, g.length <= cap ? rest.length : room);
      take.forEach((c) => (out[c.id] = w));
      load[w] += take.length;
    }
  }
  return out;
}

