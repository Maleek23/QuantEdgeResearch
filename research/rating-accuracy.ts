/**
 * RATING ACCURACY — do the S/A/B/C conviction bands mean anything?
 *
 * Question the operator asked (2026-09-29): "are the ratings accurate?"
 * A band is only a rating if a higher band does better on the outcomes that
 * followed. This measures that directly, per band and per source, with the
 * sample size and a confidence interval on every number.
 *
 * Two outcome sources, reported side by side:
 *
 *   1. REPLAY (primary). Every resolved idea is re-adjudicated from real
 *      5-minute bars starting at the first bar after it was published — the
 *      same rules as research/path-replay.ts (regular session only, gap fills
 *      at the open, a bar touching both barriers counts as the stop, horizon
 *      day = 1 session / swing = 10 / position = 20, else timeout marked at
 *      the horizon close). The 2026-09-24 validation found the live tracker
 *      recorded 50 stops that never happened after publication, so the stored
 *      outcome is not ground truth for the older book.
 *   2. TRACKER (secondary). outcome_status as stored — shown so the two can be
 *      compared, never mixed.
 *
 * The band is the one the platform actually published: gen_conviction_score is
 * written once, when an idea first surfaces on the board (see the telemetry
 * write at the end of buildConvictions), so it is point-in-time. It is mapped
 * through the CURRENT cutoffs in shared/conviction-bands.ts so the numbers line
 * up with what the legend says today; the stored letter is kept alongside.
 *
 * Statistics:
 *   - hit rate = targets / (targets + stops), Wilson 95% interval
 *   - break-even hit rate = mean of 1/(1+R:R) over the decided ideas
 *   - expectancy = mean realized R over every replayed idea (timeouts included),
 *     95% interval from a seeded bootstrap (2,000 resamples)
 *   - monotonicity: Spearman rank correlation between the published score and
 *     realized R (bootstrap CI), plus a one-sided permutation test that S+A beat
 *     B+C on expectancy.
 *
 * Read-only against the database. Run:
 *   npx tsx research/rating-accuracy.ts   → research/rating-accuracy-2026-09-29.json
 */
import fs from 'fs';
import pg from 'pg';
import { convictionBandForScore, CONVICTION_BAND_CUTOFFS } from '../shared/conviction-bands';

type Bar = { t: number; o: number; h: number; l: number; c: number };
const YSYM: Record<string, string> = { SPX: '^GSPC', NDX: '^NDX', RUT: '^RUT', VIX: '^VIX', XSP: '^XSP', DJX: '^DJI' };
const CRYPTO = new Set(['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'AVAX']);
const OUT = process.argv[2] ?? 'research/rating-accuracy-2026-09-29.json';

// ── bars ──────────────────────────────────────────────────────────────────
const barCache = new Map<string, Promise<Bar[]>>();
function bars5m(symbol: string): Promise<Bar[]> {
  const ys = YSYM[symbol] ?? (CRYPTO.has(symbol) ? `${symbol}-USD` : symbol);
  if (!barCache.has(ys)) barCache.set(ys, (async () => {
    const p2 = Math.floor(Date.now() / 1000), p1 = p2 - 59 * 86400;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ys)}?period1=${p1}&period2=${p2}&interval=5m&includePrePost=false`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (r.status === 429) { await new Promise((s) => setTimeout(s, 2500 * (attempt + 1))); continue; }
        const j: any = await r.json(); const res = j?.chart?.result?.[0]; if (!res) return [];
        const q = res.indicators.quote[0];
        return (res.timestamp as number[]).map((t, i) => ({ t, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] }))
          .filter((b) => b.o != null && b.h != null && b.l != null && b.c != null);
      } catch { await new Promise((s) => setTimeout(s, 1000)); }
    }
    return [];
  })());
  return barCache.get(ys)!;
}
const etParts = (t: number) => {
  const s = new Date(t * 1000).toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const [d, hm] = s.split(', '); const [h, m] = hm.split(':').map(Number);
  return { day: d, min: (h % 24) * 60 + m };
};
const rth = (b: Bar) => { const { min } = etParts(b.t); return min >= 570 && min < 960; };

// ── ideas ─────────────────────────────────────────────────────────────────
interface Idea {
  id: string; src: string; sym: string; dir: 'long' | 'short'; hp: string;
  entry: number; stop: number; target: number; ts: Date; exitBy: Date | null;
  outcome: 'hit_target' | 'hit_stop' | 'expired'; exit: number | null;
  score: number | null; storedBand: string | null; conf: number | null;
}
type Replay = 'target' | 'stop' | 'timeout' | 'nodata';

function adjudicate(i: Idea, all: Bar[]): { replay: Replay; r: number | null } {
  const start = i.ts.getTime() / 1000;
  const path = all.filter((b) => b.t >= start && (CRYPTO.has(i.sym) || rth(b)));
  if (!path.length) return { replay: 'nodata', r: null };
  const sessions: string[] = [];
  for (const b of path) { const d = etParts(b.t).day; if (sessions[sessions.length - 1] !== d) sessions.push(d); }
  const nSess = i.hp === 'day' ? 1 : i.hp === 'position' ? 20 : 10;
  const lastDay = sessions[Math.min(nSess, sessions.length) - 1];
  let horizon = path.filter((b) => sessions.indexOf(etParts(b.t).day) <= sessions.indexOf(lastDay));
  if (i.exitBy) { const eb = i.exitBy.getTime() / 1000; const h2 = path.filter((b) => b.t <= eb); if (h2.length) horizon = h2; }
  const risk = Math.abs(i.entry - i.stop), L = i.dir === 'long';
  const R = (px: number) => ((L ? 1 : -1) * (px - i.entry)) / risk;
  for (const b of horizon) {
    const stopHit = L ? b.l <= i.stop : b.h >= i.stop;
    const tgtHit = L ? b.h >= i.target : b.l <= i.target;
    if (stopHit) { const gap = L ? b.o <= i.stop : b.o >= i.stop; return { replay: 'stop', r: Math.max(-3, R(gap ? b.o : i.stop)) }; }
    if (tgtHit) { const gap = L ? b.o >= i.target : b.o <= i.target; return { replay: 'target', r: Math.min(6, R(gap ? b.o : i.target)) }; }
  }
  const last = horizon[horizon.length - 1];
  return { replay: 'timeout', r: Math.max(-3, Math.min(6, R(last.c))) };
}

// ── stats ─────────────────────────────────────────────────────────────────
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
let seed = 20260929; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
function wilson(k: number, n: number): [number, number] | null {
  if (n === 0) return null;
  const z = 1.96, p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
function bootMeanCI(a: number[], B = 2000): [number, number] | null {
  if (a.length < 2) return null;
  const out: number[] = [];
  for (let b = 0; b < B; b++) { let s = 0; for (let k = 0; k < a.length; k++) s += a[Math.floor(rnd() * a.length)]; out.push(s / a.length); }
  out.sort((x, y) => x - y);
  return [out[Math.floor(0.025 * B)], out[Math.floor(0.975 * B)]];
}
function ranks(a: number[]) {
  const idx = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; }
  return r as number[];
}
function pearson(x: number[], y: number[]) {
  const mx = mean(x), my = mean(y); let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  return dx > 0 && dy > 0 ? n / Math.sqrt(dx * dy) : 0;
}
const spearman = (x: number[], y: number[]) => pearson(ranks(x), ranks(y));
const r3 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);

interface Scored extends Idea { replay: Replay; r: number | null; band: string }

function summarize(rows: Scored[]) {
  const ok = rows.filter((x) => x.replay !== 'nodata' && x.r != null);
  const dec = ok.filter((x) => x.replay === 'target' || x.replay === 'stop');
  const wins = dec.filter((x) => x.replay === 'target').length;
  const be = dec.length ? mean(dec.map((x) => 1 / (1 + Math.abs(x.target - x.entry) / Math.abs(x.entry - x.stop)))) : null;
  const rs = ok.map((x) => x.r!);
  // Tracker view of the same rows, for comparison only.
  const tDec = rows.filter((x) => x.outcome === 'hit_target' || x.outcome === 'hit_stop');
  const tWins = tDec.filter((x) => x.outcome === 'hit_target').length;
  const hr = wilson(wins, dec.length), thr = wilson(tWins, tDec.length), ci = bootMeanCI(rs);
  return {
    n: rows.length,
    replayed: ok.length,
    replay: {
      decided: dec.length, targets: wins, stops: dec.length - wins, timeouts: ok.length - dec.length,
      hitRate: dec.length ? r3(wins / dec.length) : null,
      hitRateCI95: hr ? [r3(hr[0]), r3(hr[1])] : null,
      breakEvenHitRate: r3(be),
      expectancyR: rs.length ? r3(mean(rs)) : null,
      expectancyCI95: ci ? [r3(ci[0]), r3(ci[1])] : null,
    },
    tracker: {
      decided: tDec.length, targets: tWins, stops: tDec.length - tWins,
      expired: rows.filter((x) => x.outcome === 'expired').length,
      hitRate: tDec.length ? r3(tWins / tDec.length) : null,
      hitRateCI95: thr ? [r3(thr[0]), r3(thr[1])] : null,
    },
  };
}

(async () => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  const { rows } = await c.query(`SELECT id, source, symbol, direction, holding_period, entry_price, stop_loss, target_price,
      timestamp, exit_by, outcome_status, exit_price, resolution_reason, outcome_notes,
      gen_conviction_score, gen_conviction_band, confidence_score
    FROM trade_ideas
    WHERE outcome_status IN ('hit_target','hit_stop','expired') AND entry_price > 0 AND stop_loss > 0 AND target_price > 0
    ORDER BY timestamp`);
  await c.end();
  const num = (v: any) => (v == null || v === '' ? null : Number(v));
  const ideas: Idea[] = rows.map((r: any) => ({
    id: r.id, src: r.source ?? 'unknown', sym: String(r.symbol).toUpperCase(),
    dir: /short|bear/i.test(r.direction) ? 'short' : 'long', hp: r.holding_period ?? 'swing',
    entry: +r.entry_price, stop: +r.stop_loss, target: +r.target_price, ts: new Date(r.timestamp),
    exitBy: r.exit_by && /^\d{4}-/.test(r.exit_by) ? new Date(r.exit_by) : null,
    outcome: r.outcome_status, exit: num(r.exit_price),
    score: num(r.gen_conviction_score), storedBand: r.gen_conviction_band ?? null, conf: num(r.confidence_score),
    _reason: r.resolution_reason ?? '', _notes: r.outcome_notes ?? '',
  } as any)).filter((i: any) => {
    // Same validity screen as path-replay.ts: coherent geometry, underlying units, no collapsed duplicates.
    const rk = Math.abs(i.entry - i.stop) / i.entry;
    const sides = i.dir === 'long' ? i.stop < i.entry && i.target > i.entry : i.stop > i.entry && i.target < i.entry;
    return rk > 0 && rk < 0.5 && Math.abs(i.target - i.entry) / i.entry < 1 && sides &&
      i._reason !== 'duplicate_collapsed' && !/unit mismatch/i.test(i._notes);
  });

  const syms = Array.from(new Set(ideas.map((i) => i.sym)));
  console.log(`replaying ${ideas.length} resolved ideas across ${syms.length} symbols`);
  let k = 0;
  await Promise.all(Array.from({ length: 4 }, async () => { while (k < syms.length) { const s = syms[k++]; await bars5m(s); } }));

  const scored: Scored[] = [];
  let unitSkipped = 0;
  for (const i of ideas) {
    const b = await bars5m(i.sym);
    const ref = b.find((x) => x.t >= i.ts.getTime() / 1000);
    if (ref && Math.abs(ref.o / i.entry - 1) > 0.15) { unitSkipped++; continue; } // levels not in the underlying's units
    const v = adjudicate(i, b);
    const band = i.score == null ? 'unscored' : convictionBandForScore(i.score);
    scored.push({ ...i, ...v, band });
  }

  const bands = ['S', 'A', 'B', 'C', 'unscored'];
  const byBand: Record<string, any> = {};
  for (const b of bands) byBand[b] = summarize(scored.filter((x) => x.band === b));
  const bySource: Record<string, any> = {};
  for (const s of Array.from(new Set(scored.map((x) => x.src))).sort()) bySource[s] = summarize(scored.filter((x) => x.src === s));
  const bySourceBand: Record<string, any> = {};
  for (const s of Object.keys(bySource)) {
    const sub = scored.filter((x) => x.src === s && x.band !== 'unscored');
    if (sub.length < 10) continue;
    bySourceBand[s] = Object.fromEntries(['S', 'A', 'B', 'C'].map((b) => [b, summarize(sub.filter((x) => x.band === b))]));
  }

  // Monotonicity: published score vs realized R, scored + replayed ideas only.
  const withScore = scored.filter((x) => x.score != null && x.r != null && x.replay !== 'nodata');
  const xs = withScore.map((x) => x.score!), ys = withScore.map((x) => x.r!);
  const rho = spearman(xs, ys);
  const rhoBoot: number[] = [];
  for (let b = 0; b < 2000; b++) {
    const idx = Array.from({ length: withScore.length }, () => Math.floor(rnd() * withScore.length));
    rhoBoot.push(spearman(idx.map((i) => xs[i]), idx.map((i) => ys[i])));
  }
  rhoBoot.sort((a, b) => a - b);
  // Permutation: is mean R(S+A) − mean R(B+C) larger than chance?
  const high = withScore.filter((x) => x.band === 'S' || x.band === 'A').map((x) => x.r!);
  const low = withScore.filter((x) => x.band === 'B' || x.band === 'C').map((x) => x.r!);
  const obs = mean(high) - mean(low);
  const pool = [...high, ...low];
  let ge = 0; const P = 5000;
  for (let p = 0; p < P; p++) {
    const sh = [...pool];
    for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
    if (mean(sh.slice(0, high.length)) - mean(sh.slice(high.length)) >= obs) ge++;
  }
  const order = ['S', 'A', 'B', 'C'].map((b) => byBand[b].replay.expectancyR);
  const strictlyOrdered = order.every((v, i) => i === 0 || (v != null && order[i - 1] != null && order[i - 1]! > v));

  // Regime concentration: a band whose ideas all landed in one bad week is a
  // statement about that week, not about the band. Disclose the spread.
  const weekOf = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x.toISOString().slice(0, 10);
  };
  const byWeekBand: Record<string, Record<string, { n: number; expectancyR: number | null; hitRate: number | null }>> = {};
  for (const x of scored) {
    if (x.replay === 'nodata' || x.r == null) continue;
    const w = weekOf(x.ts);
    byWeekBand[w] ??= {};
    byWeekBand[w][x.band] ??= { n: 0, expectancyR: 0, hitRate: null };
    byWeekBand[w][x.band].n++;
  }
  for (const w of Object.keys(byWeekBand)) {
    for (const b of Object.keys(byWeekBand[w])) {
      const sub = scored.filter((x) => x.band === b && x.replay !== 'nodata' && x.r != null && weekOf(x.ts) === w);
      const dec = sub.filter((x) => x.replay === 'target' || x.replay === 'stop');
      byWeekBand[w][b].expectancyR = r3(mean(sub.map((x) => x.r!)));
      byWeekBand[w][b].hitRate = dec.length ? r3(dec.filter((x) => x.replay === 'target').length / dec.length) : null;
    }
  }

  const agreeBand = scored.filter((x) => x.storedBand && x.score != null && x.storedBand === x.band).length;
  const storedN = scored.filter((x) => x.storedBand && x.score != null).length;

  const res = {
    generatedAt: new Date().toISOString(),
    cutoffs: CONVICTION_BAND_CUTOFFS,
    sample: {
      resolvedValid: ideas.length, unitSkipped, replayed: scored.filter((x) => x.replay !== 'nodata').length,
      noData: scored.filter((x) => x.replay === 'nodata').length,
      scored: scored.filter((x) => x.band !== 'unscored').length,
      firstIdea: ideas[0]?.ts.toISOString() ?? null, lastIdea: ideas[ideas.length - 1]?.ts.toISOString() ?? null,
      storedBandMatchesCurrentCutoffs: storedN ? r3(agreeBand / storedN) : null,
    },
    overall: summarize(scored),
    byBand,
    monotonicity: {
      n: withScore.length,
      spearmanScoreVsR: r3(rho),
      spearmanCI95: [r3(rhoBoot[Math.floor(0.025 * rhoBoot.length)]), r3(rhoBoot[Math.floor(0.975 * rhoBoot.length)])],
      highMinusLowExpectancyR: r3(obs),
      highN: high.length, lowN: low.length,
      permutationP_oneSided: r3(ge / P),
      bandsStrictlyOrderedByExpectancy: strictlyOrdered,
    },
    bySource,
    bySourceBand,
    byWeekBand,
  };
  fs.writeFileSync(OUT, JSON.stringify(res, null, 2));
  console.log(JSON.stringify({ sample: res.sample, overall: res.overall, byBand: res.byBand, monotonicity: res.monotonicity }, null, 1));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
