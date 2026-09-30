/**
 * CONSISTENCY CHECK — does one number read the same on every surface?
 *
 *   npx tsx research/consistency-check.ts [baseUrl] [TICKERS]
 *   npx tsx research/consistency-check.ts https://quantedgelabs.net SPY,QQQ,NVDA,TSLA,AMD,BE
 *
 * Read-only, public GET endpoints only, paced (1.2 s between requests; ~11 requests
 * per ticker + 6 global, well inside the 500 req / 15 min anonymous limit).
 * Exit code 1 when any FAIL. WARN = a disagreement explained by timing/caching
 * (live reads seconds apart, a 5-minute cache) that should still be looked at.
 *
 * What is asserted (consistency audit 2026-09-29):
 *   quote      /api/quotes/batch vs /api/quantinum price + % vs /api/market-pulse index %
 *   GEX        /api/gex/buckets spot vs quote; zero-gamma and every bucket flip inside
 *              0.8–1.2x spot (the old cumulative flip returned the lowest strike);
 *              bucket walls on the right side of spot; /api/gex-heatmap levels == buckets
 *              headline levels; /api/quantinum gex walls == buckets walls
 *   VIX        /api/market-pulse vs /api/market-context vs /api/market-regime
 *   record     /api/performance/model-record == /api/dashboard/stats == /api/performance/stats
 *              .modelRecord == /api/performance/outcome-model (same baseline, same wins)
 *   providers  /api/data-quality/price-crosscheck verdict (price-check port)
 */
type Status = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
interface Row { ticker: string; metric: string; status: Status; detail: string }

const base = (process.argv[2] || 'http://localhost:5000').replace(/\/$/, '');
const tickers = (process.argv[3] || 'SPY,QQQ,NVDA,TSLA,AMD,BE').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const PACE_MS = Number(process.env.CONSISTENCY_PACE_MS ?? 1200);
const rows: Row[] = [];
let requests = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(path: string): Promise<any | null> {
  await sleep(requests++ ? PACE_MS : 0);
  try {
    const r = await fetch(base + path, { signal: AbortSignal.timeout(90_000) });
    if (!r.ok) return { __status: r.status };
    const txt = await r.text();
    // The SPA answers unknown /api paths with index.html — that is "endpoint absent".
    try { return JSON.parse(txt); } catch { return { __error: 'not JSON (endpoint absent on this build?)' }; }
  } catch (e: any) {
    return { __error: e?.message ?? String(e) };
  }
}
const bad = (j: any) => !j || j.__status || j.__error;
const why = (j: any) => (j?.__status ? `HTTP ${j.__status}` : j?.__error ?? 'no data');
const add = (ticker: string, metric: string, status: Status, detail: string) => rows.push({ ticker, metric, status, detail });
const pctDiff = (a: number, b: number) => Math.abs(a / b - 1) * 100;
const f = (x: any, d = 2) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : String(x));

async function checkTicker(t: string) {
  const qb = await get(`/api/quotes/batch/${t}`);
  const q = bad(qb) ? null : qb.quotes?.[t];
  if (!q) add(t, 'quote', 'FAIL', `quotes/batch: ${bad(qb) ? why(qb) : 'no quote'}`);
  else add(t, 'quote provenance', q.source ? 'PASS' : 'WARN', `source=${q.source ?? 'missing'} session=${q.session ?? 'n/a'} asOf=${q.asOf} stale=${q.stale ?? 'n/a'}`);

  const qn = await get(`/api/quantinum/${t}`);
  if (bad(qn)) add(t, 'quantinum', 'SKIP', why(qn));
  else if (q) {
    const dp = pctDiff(qn.price?.last, q.price);
    add(t, 'price: batch vs quantinum', dp <= 0.2 ? 'PASS' : dp <= 1 ? 'WARN' : 'FAIL', `${f(q.price)} vs ${f(qn.price?.last)} (${f(dp, 3)}%)`);
    const dc = Math.abs((qn.price?.changePercent ?? NaN) - (q.changePercent ?? NaN));
    add(t, '%chg: batch vs quantinum', dc <= 0.2 ? 'PASS' : Number.isFinite(dc) ? 'WARN' : 'SKIP', `${f(q.changePercent)} vs ${f(qn.price?.changePercent)} pp`);
  }

  const gb = await get(`/api/gex/buckets/${t}`);
  if (bad(gb)) add(t, 'gex buckets', 'SKIP', why(gb));
  else {
    const spot = gb.spotPrice;
    if (q) {
      const d = pctDiff(spot, q.price);
      add(t, 'GEX spot vs quote', d <= 0.5 ? 'PASS' : d <= 2 ? 'WARN' : 'FAIL', `${f(spot)} vs ${f(q.price)} (${f(d, 3)}%) source=${gb.source}`);
    }
    const inBand = (x: any) => x == null || (x >= spot * 0.8 && x <= spot * 1.2);
    add(t, 'zero-gamma in 0.8–1.2x spot', inBand(gb.zeroGammaLevel) ? 'PASS' : 'FAIL', `zeroGamma=${f(gb.zeroGammaLevel)} spot=${f(spot)}`);
    for (const [k, b] of Object.entries<any>(gb.byDte ?? {})) {
      const ok = inBand(b.gammaFlipPrice) && (b.callWall == null || b.callWall > spot) && (b.putWall == null || b.putWall < spot);
      add(t, `bucket ${k} levels`, ok ? 'PASS' : 'FAIL', `flip=${f(b.gammaFlipPrice)} cw=${b.callWall} pw=${b.putWall} tot=${f(b.totalGEX, 3)}B`);
    }
    const hm = await get(`/api/gex-heatmap/${t}`);
    if (bad(hm)) add(t, 'heatmap vs buckets', 'SKIP', why(hm));
    else {
      const same = (a: any, b: any) => (a == null && b == null) || (a != null && b != null && pctDiff(a, b) <= 1);
      const ok = same(hm.flipPoint, gb.zeroGammaLevel) && same(hm.maxGammaStrike, gb.maxGammaStrike);
      add(t, 'heatmap vs buckets levels', ok ? 'PASS' : 'WARN', `flip ${f(hm.flipPoint)} vs ${f(gb.zeroGammaLevel)} · maxγ ${hm.maxGammaStrike} vs ${gb.maxGammaStrike}`);
    }
    if (!bad(qn) && qn.gex) {
      const ok = qn.gex.callWall === gb.callWall && qn.gex.putWall === gb.putWall;
      add(t, 'dossier vs buckets walls', ok ? 'PASS' : 'WARN', `cw ${qn.gex.callWall}/${gb.callWall} pw ${qn.gex.putWall}/${gb.putWall} (dossier cache ≤5 min)`);
    }
  }

  const xc = await get(`/api/data-quality/price-crosscheck/${t}`);
  if (bad(xc)) add(t, 'provider cross-check', 'SKIP', why(xc));
  else {
    const pairs = (xc.daily?.pairs ?? []).map((p: any) => `${p.a}~${p.b}: ${p.mismatchedDates}/${p.commonDates} dates differ, max ${f(p.maxAbsDiff, 3)}`).join('; ');
    add(t, 'provider cross-check', xc.verdict === 'disagree' ? 'WARN' : 'PASS',
      `${xc.verdict} · platform=${xc.platformProvider} · last ${(xc.last?.reads ?? []).map((r: any) => `${r.provider} ${f(r.price)}`).join(', ')} · maxDev ${f(xc.last?.maxDevPct, 3)}% · ${pairs || 'bars: one provider'} · issues ${xc.daily?.issues?.length ?? 0}`);
  }
}

async function checkGlobal(batch: Record<string, any>) {
  const mp = await get('/api/market-pulse');
  const mc = await get('/api/market-context');
  const mr = await get('/api/market-regime');
  if (!bad(mp)) {
    for (const idx of mp.indices ?? []) {
      const q = batch[idx.symbol];
      if (!q) continue;
      const d = Math.abs(idx.change - q.changePercent);
      add(idx.symbol, '%chg: market-pulse vs batch', d <= 0.15 ? 'PASS' : d <= 0.4 ? 'WARN' : 'FAIL', `${f(idx.change)} vs ${f(q.changePercent)} pp`);
    }
    const v = mp.macro?.vix;
    add('*', 'VIX present (pulse)', v == null ? 'WARN' : v > 5 ? 'PASS' : 'FAIL', `pulse VIX=${v}`);
    if (!bad(mc)) add('*', 'VIX pulse vs market-context', mc.vixLevel == null ? 'FAIL' : Math.abs(mc.vixLevel - v) <= 0.5 ? 'PASS' : 'WARN', `${v} vs ${mc.vixLevel} (context cache ≤5 min)`);
    if (!bad(mr)) add('*', 'VIX pulse vs market-regime', Math.abs((mr.indicators?.vix ?? NaN) - v) <= 1 ? 'PASS' : 'WARN', `${v} vs ${f(mr.indicators?.vix)} (regime uses the daily close)`);
  } else add('*', 'market-pulse', 'SKIP', why(mp));

  const rec = await get('/api/performance/model-record');
  const ds = await get('/api/dashboard/stats');
  const ps = await get('/api/performance/stats');
  const om = await get('/api/performance/outcome-model');
  if (bad(rec)) {
    add('*', 'model record', 'FAIL', `model-record: ${why(rec)}`);
    // Older build: show how far apart the legacy record surfaces are.
    const legacy = [
      ['dashboard/stats', bad(ds) ? null : ds.winRate],
      ['performance/stats', bad(ps) ? null : ps.overall?.winRate],
      ['outcome-model', bad(om) ? null : om.outcomes?.winRate],
    ] as const;
    const vals = legacy.map(([, v]) => v).filter((v): v is number => typeof v === 'number');
    const spread = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
    add('*', 'record: legacy surfaces agree', spread <= 0.5 ? 'PASS' : 'FAIL', legacy.map(([k, v]) => `${k} ${f(v, 1)}%`).join(' · '));
    return;
  }
  add('*', 'model record', 'PASS', `since ${rec.since}: ${rec.wins}W/${rec.losses}L of ${rec.decided} decided, ${rec.unresolved} unresolved, rate ${rec.winRate ?? 'n<floor'}, E=${rec.expectancyR}R`);
  if (!bad(ds)) add('*', 'record: dashboard/stats', ds.winRate === rec.winRate && ds.totalTrades === rec.decided ? 'PASS' : 'FAIL', `${ds.winRate}% n=${ds.totalTrades} vs ${rec.winRate}% n=${rec.decided}`);
  if (!bad(ps)) add('*', 'record: performance/stats', ps.modelRecord?.winRate === rec.winRate ? 'PASS' : 'FAIL', `${ps.modelRecord?.winRate} vs ${rec.winRate}`);
  if (!bad(om)) add('*', 'record: outcome-model', om.outcomes?.win === rec.wins && om.outcomes?.loss === rec.losses ? 'PASS' : 'FAIL', `${om.outcomes?.win}W/${om.outcomes?.loss}L vs ${rec.wins}W/${rec.losses}L`);
}

(async () => {
  const batchJ = await get(`/api/quotes/batch/${tickers.join(',')}`);
  const batch = bad(batchJ) ? {} : batchJ.quotes ?? {};
  for (const t of tickers) await checkTicker(t);
  await checkGlobal(batch);
  const w = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
  console.log(`\nConsistency check · ${base} · ${new Date().toISOString()} · ${requests} requests\n`);
  for (const r of rows) console.log(`${r.status.padEnd(5)} ${w(r.ticker, 5)} ${w(r.metric, 32)} ${r.detail}`);
  const fails = rows.filter((r) => r.status === 'FAIL').length;
  const warns = rows.filter((r) => r.status === 'WARN').length;
  console.log(`\n${rows.length} checks · ${fails} FAIL · ${warns} WARN`);
  if (process.env.CONSISTENCY_JSON) console.log(JSON.stringify(rows));
  process.exit(fails ? 1 : 0);
})();
