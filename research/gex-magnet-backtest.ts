/**
 * GEX MAGNET BACKTEST — replay what is archived, report honestly what exists.
 * ===========================================================================
 * The magnet detector (server/gex-magnet.ts) needs PER-STRIKE VOLUME and OPEN
 * INTEREST on the near expiries. This script inventories every archive that
 * could supply that and replays whatever can be replayed:
 *
 *   .cache/gex-chains/<SYM>/<iso>.json   raw CBOE chains saved by research/gex-audit.ts
 *                                        → full replay: detector re-run on the chain
 *   .cache/gex-magnet/setups-*.jsonl     live detections archived by the rankings job
 *                                        → outcome check only (the detection is already made)
 *   gex_snapshots (Postgres, if DATABASE_URL is set)
 *                                        → INVENTORY ONLY: rows carry netGEX/netVEX per
 *                                          strike×expiry but no volume or OI, so the
 *                                          detector's C3/C4 criteria cannot be evaluated.
 *                                          Rows before 2026-09-29 are units v1 (DTE-weighted).
 *
 * OUTCOME (per detection): did the underlying TRADE THROUGH the strike before the
 * option's expiry? (call: max daily high ≥ strike; put: min daily low ≤ strike),
 * from Yahoo daily bars fetched once per symbol, ≥2 s apart. Also max favourable
 * excursion as % of the distance to the strike.
 *
 * No edge is claimed unless n ≥ 30 resolved detections; below that the script
 * prints the sample and says it is anecdote.
 *
 *   npx tsx research/gex-magnet-backtest.ts
 */
import fs from 'fs';
import path from 'path';
import { computeRankRowFromCboe } from '../server/gex-rankings';
import type { MagnetSetup } from '../server/gex-magnet';

const ROOT = process.cwd();
const CHAIN_DIR = path.join(ROOT, '.cache', 'gex-chains');
const SETUP_DIR = path.join(ROOT, '.cache', 'gex-magnet');
const MIN_N = 30;

interface Detection { symbol: string; at: number; spot: number; setup: MagnetSetup; origin: 'chain-replay' | 'live-archive' }

function inventoryChains(): Detection[] {
  const out: Detection[] = [];
  if (!fs.existsSync(CHAIN_DIR)) { console.log(`chains: ${CHAIN_DIR} does not exist — 0 archived chains`); return out; }
  let files = 0;
  for (const sym of fs.readdirSync(CHAIN_DIR)) {
    for (const f of fs.readdirSync(path.join(CHAIN_DIR, sym)).filter((x) => x.endsWith('.json'))) {
      files++;
      const payload = JSON.parse(fs.readFileSync(path.join(CHAIN_DIR, sym, f), 'utf8'));
      const ts = typeof payload?.timestamp === 'string' ? Date.parse(payload.timestamp.replace(' ', 'T') + 'Z') : Date.parse(f.replace('.json', '').replace(/_/g, ':'));
      const row = computeRankRowFromCboe(sym, payload, ts, ts);
      for (const s of row?.setups ?? []) out.push({ symbol: sym, at: ts, spot: row!.spot, setup: s, origin: 'chain-replay' });
    }
  }
  console.log(`chains: ${files} archived chain file(s) across ${fs.readdirSync(CHAIN_DIR).length} symbol(s) → ${out.length} detection(s) on replay`);
  return out;
}

function inventoryLive(): Detection[] {
  const out: Detection[] = [];
  if (!fs.existsSync(SETUP_DIR)) { console.log(`live archive: ${SETUP_DIR} does not exist — 0 archived detections (the rankings job writes it in cash hours)`); return out; }
  const seen = new Set<string>();
  const files = fs.readdirSync(SETUP_DIR).filter((f) => f.startsWith('setups-') && f.endsWith('.jsonl'));
  let lines = 0;
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(SETUP_DIR, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      lines++;
      const j = JSON.parse(line);
      // First detection per ticker/side/strike/day — later cycles are the same setup re-observed.
      const k = `${j.symbol}|${j.setup.side}|${j.setup.strike}|${f}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ symbol: j.symbol, at: Date.parse(j.at), spot: j.spot, setup: j.setup, origin: 'live-archive' });
    }
  }
  console.log(`live archive: ${files.length} day file(s), ${lines} line(s) → ${out.length} unique detection(s)`);
  return out;
}

async function inventoryDb(): Promise<void> {
  if (!process.env.DATABASE_URL) { console.log('gex_snapshots: DATABASE_URL not set here — not inventoried (run on the droplet to count rows)'); return; }
  try {
    const { db } = await import('../server/db');
    const { sql } = await import('drizzle-orm');
    const r: any = await db.execute(sql`select count(*)::int n, count(distinct symbol)::int syms, min(snapshot_at) first, max(snapshot_at) last from gex_snapshots`);
    const row = r.rows?.[0] ?? r[0];
    console.log(`gex_snapshots: ${row?.n ?? 0} rows, ${row?.syms ?? 0} symbols, ${row?.first ?? '—'} → ${row?.last ?? '—'} — no per-strike volume/OI, so the detector cannot be replayed from it`);
  } catch (e: any) {
    console.log(`gex_snapshots: query failed — ${e?.message}`);
  }
}

const bars = new Map<string, Array<{ t: number; h: number; l: number }>>();
async function dailyBars(sym: string): Promise<Array<{ t: number; h: number; l: number }>> {
  if (bars.has(sym)) return bars.get(sym)!;
  await new Promise((r) => setTimeout(r, 2000));
  try {
    const r = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=3mo`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) { console.log(`  ${sym}: Yahoo HTTP ${r.status} — outcome unresolved`); bars.set(sym, []); return []; }
    const j: any = await r.json();
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const q = res?.indicators?.quote?.[0] ?? {};
    const out = ts.map((t, i) => ({ t: t * 1000, h: q.high?.[i], l: q.low?.[i] })).filter((b) => Number.isFinite(b.h) && Number.isFinite(b.l));
    bars.set(sym, out);
    return out;
  } catch { bars.set(sym, []); return []; }
}

(async () => {
  console.log(`GEX magnet backtest — ${new Date().toISOString()}\n`);
  const dets = [...inventoryChains(), ...inventoryLive()];
  await inventoryDb();
  if (!dets.length) {
    console.log('\nNo detections to evaluate. Nothing can be said about the detector\'s edge yet.');
    process.exit(0);
  }
  console.log('\nOutcomes (trade-through of the strike before expiry):');
  let resolved = 0; let hits = 0;
  for (const d of dets) {
    const s = d.setup;
    const expMs = s.expiry ? Date.parse(`${s.expiry}T20:00:00Z`) : NaN;
    const b = await dailyBars(d.symbol);
    const dayStart = new Date(new Date(d.at).toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
    // Sessions AFTER the detection day only: a daily bar cannot say whether the
    // detection-day high came before or after the detection (look-ahead).
    const window = b.filter((x) => x.t >= dayStart + 864e5 && x.t <= expMs);
    const same = b.find((x) => x.t >= dayStart && x.t < dayStart + 864e5);
    const sameDayThrough = same ? (s.side === 'call' ? same.h >= s.strike : same.l <= s.strike) : null;
    const done = Number.isFinite(expMs) && Date.now() > expMs + 6 * 3600_000;
    const hi = Math.max(...window.map((x) => x.h)); const lo = Math.min(...window.map((x) => x.l));
    const touched = window.length ? (s.side === 'call' ? hi >= s.strike : lo <= s.strike) : null;
    const dist = Math.abs(s.strike - d.spot);
    const mfe = window.length ? (s.side === 'call' ? (hi - d.spot) / dist : (d.spot - lo) / dist) : null;
    const status = touched === true ? 'HIT' : !done ? 'open' : touched === false ? 'miss' : 'no bars';
    if (done && touched != null) { resolved++; if (touched) hits++; }
    else if (touched === true) { resolved++; hits++; }
    console.log(`  ${d.origin.padEnd(12)} ${new Date(d.at).toISOString().slice(0, 16)} ${d.symbol.padEnd(5)} ${s.side} ${s.strike} exp ${s.expiry} score ${s.score}  spot ${d.spot.toFixed(2)}  → ${status}${mfe != null ? `  MFE ${(mfe * 100).toFixed(0)}% of distance` : ''}${sameDayThrough ? '  (detection-day bar also traded through — ordering unknown, not counted)' : ''}`);
  }
  console.log(`\nResolved ${resolved} of ${dets.length}; trade-through ${hits}/${resolved}${resolved ? ` (${((hits / resolved) * 100).toFixed(0)}%)` : ''}.`);
  if (resolved < MIN_N) {
    console.log(`n = ${resolved} < ${MIN_N}: this is anecdote, not evidence. No hit rate or edge is claimed. ` +
      'A base rate (how often ANY strike 0.5–5% away trades through within the same tenor) is also required before a hit rate means anything.');
  }
  process.exit(0);
})();
