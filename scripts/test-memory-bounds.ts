/**
 * test-memory-bounds — the worker's caches stay bounded (no DB, no network).
 *
 *   npx tsx scripts/test-memory-bounds.ts
 *
 * 1. BoundedCache honours maxEntries / maxBytes / TTL and the memory guard's trimTo.
 * 2. capDedupe drops stale keys first, then the oldest, and never goes past max.
 * 3. cboe-loader keeps ONE payload per file: horizons 0 / 60 / 120 for _SPX are one
 *    download, narrower horizons are filtered views (fetch is stubbed).
 * 4. Every cache registered by the worker-path modules declares a maxEntries.
 * 5. sampleMemory() tracks the window peak and collects above the line, with a cooldown.
 */
process.env.DATABASE_URL = '';
import { BoundedCache, capDedupe, listCaches } from '../server/lib/bounded-cache';

let failed = 0;
const ok = (cond: unknown, msg: string) => { if (cond) console.log(`  ✓ ${msg}`); else { failed++; console.log(`  ✗ ${msg}`); } };

async function main() {
  console.log('1. BoundedCache');
  const c = new BoundedCache<string, { n: number }>({ name: 'test.entries', maxEntries: 50, maxBytes: 10_000, sizeOf: () => 400 });
  for (let i = 0; i < 10_000; i++) c.set(`k${i}`, { n: i });
  ok(c.size <= 25, `10,000 sets → ${c.size} entries (maxBytes 10 KB / 400 B each caps it at 25)`);
  ok(c.get('k9999')?.n === 9999, 'newest entry kept');
  const t = new BoundedCache<string, number>({ name: 'test.ttl', maxEntries: 10, ttlMs: 1 });
  t.set('a', 1);
  await new Promise((r) => setTimeout(r, 5));
  ok(t.get('a') === undefined, 'TTL expires an entry on read');
  const big = new BoundedCache<number, number>({ name: 'test.trim', maxEntries: 1000, noSizing: true });
  for (let i = 0; i < 1000; i++) big.set(i, i);
  big.trimTo(0.5);
  ok(big.size === 500, `trimTo(0.5) → ${big.size}`);

  console.log('2. capDedupe');
  const m = new Map<string, number>();
  const now = Date.now();
  for (let i = 0; i < 2000; i++) { m.set(`old${i}`, now - 30 * 3600_000); }
  for (let i = 0; i < 100; i++) { m.set(`new${i}`, now); capDedupe(m, 500, (k) => now - (m.get(k) ?? 0) > 20 * 3600_000); }
  ok(m.size <= 500, `2,100 keys → ${m.size} (≤ 500)`);
  ok(m.has('new99') && m.has('new0'), 'live keys survive (stale ones went first)');
  const s = new Set<string>();
  for (let i = 0; i < 9000; i++) { s.add(`2026-10-${10 + (i % 20)}|open|S${i}`); capDedupe(s, 4000, (k) => !k.startsWith('2026-10-29|')); }
  ok(s.size <= 4000, `dedupe Set capped at ${s.size}`);

  console.log('3. cboe-loader: one payload per file');
  const today = new Date();
  const occ = (days: number, k: number) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) + days * 86_400_000);
    const yy = String(d.getUTCFullYear() % 100).padStart(2, '0'); const mm = String(d.getUTCMonth() + 1).padStart(2, '0'); const dd = String(d.getUTCDate()).padStart(2, '0');
    return `SPXW${yy}${mm}${dd}C${String(5000000 + k * 5000).padStart(8, '0')}`;
  };
  const options = [0, 1, 30, 60, 90, 120, 200, 400].flatMap((d) => Array.from({ length: 10 }, (_, k) => ({ option: occ(d, k), bid: 1, ask: 2 })));
  let fetches = 0;
  const realFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: string) => {
    fetches++;
    if (!String(url).includes('/options/')) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ data: { current_price: 6000, options } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const L = await import('../server/lib/cboe-loader');
    L.__resetCboeLoader();
    const [a, b, d] = await Promise.all([
      L.loadCboeChain('SPX', { maxDays: 0 }),
      L.loadCboeChain('SPX'),
      L.loadCboeChain('SPX', { maxDays: 120 }),
    ]);
    const e = await L.loadCboeChain('SPXW', { maxDays: 60 });
    ok(L.__cboeLoaderDownloads() === 1, `_SPX at horizons 0/60/120 (+ SPXW alias) = ${L.__cboeLoaderDownloads()} download(s)`);
    ok(a.payload.data.options.length === 10, `maxDays 0 → ${a.payload.data.options.length} rows (0DTE only)`);
    ok(b.payload.data.options.length === 40, `default (60 d) → ${b.payload.data.options.length} rows`);
    ok(d.payload.data.options.length === 60, `120 d → ${d.payload.data.options.length} rows`);
    ok(e.payload.data.options.length === 40, 'cache hit serves a narrower view');
    ok(a.payload.data.current_price === 6000, 'payload shape kept');
    await L.loadCboeChain('SPX', { maxDays: 400 });
    ok(L.__cboeLoaderDownloads() === 2, 'a wider horizon than stored refetches once');
    const f = await L.loadCboeChain('SPX', { maxDays: 0 });
    ok(L.__cboeLoaderDownloads() === 2 && f.payload.data.options.length === 10, 'then the wide payload serves every narrower horizon');
    const loaderStats = listCaches().find((x) => x.cacheName === 'cboe.loader')!.stats();
    ok(loaderStats.entries === 1, `cboe.loader holds ${loaderStats.entries} entry for one file`);
  } finally {
    (globalThis as any).fetch = realFetch;
  }

  console.log('4. registered worker caches all declare a bound');
  await import('../server/zero-dte-desk');
  await import('../server/journal-expiry-settle');
  await import('../server/contract-analyzer/cboe-chain');
  const names = listCaches().map((x) => x.stats());
  for (const want of ['0dte.realizedVol', 'expiry.dailyPrints', '0dte.deskChains', 'cboe.contractChains', 'cboe.loader']) {
    ok(names.some((n) => n.name === want), `${want} is registered`);
  }
  const unbounded = names.filter((n) => !(n.maxEntries != null && n.maxEntries > 0) && !n.name.startsWith('test.'));
  ok(unbounded.length === 0, `every registered cache has maxEntries${unbounded.length ? ` (missing: ${unbounded.map((u) => u.name).join(', ')})` : ''}`);

  console.log('5. memory guard sampler');
  const g = await import('../server/lib/memory-guard');
  let gcs = 0;
  const gc = () => { gcs++; };
  const t0 = Date.now();
  const r1 = g.sampleMemory({ nowMs: t0, gcLineMb: 1, gc });
  const r2 = g.sampleMemory({ nowMs: t0 + 5_000, gcLineMb: 1, gc });
  const r3 = g.sampleMemory({ nowMs: t0 + 20_000, gcLineMb: 1, gc });
  ok(r1.collected && !r2.collected && r3.collected && gcs === 2, `collects above the line with a 15 s cooldown (${gcs} collects)`);
  const r4 = g.sampleMemory({ nowMs: t0 + 60_000, gcLineMb: 1e6, gc });
  ok(!r4.collected, 'no collect below the line');
  const snap = g.memorySnapshot();
  ok(snap.windowPeak.rssMb > 0 && Array.isArray(snap.windowPeak.jobs), `window peak tracked (${snap.windowPeak.rssMb} MB)`);
  ok(snap.forcedGc.forced === 2, 'forced collects counted in the snapshot');

  console.log(failed ? `\n✗ ${failed} failed` : '\n✓ all memory-bound checks passed');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
