/**
 * Swings & LEAPS — offline-safe sample for a few names (default QCOM APP STX WDC).
 *   npx tsx scripts/swings-sample.ts [SYM ...] [--replay]
 *
 * LIVE mode reads ONLY public Yahoo endpoints (bars, fundamentals, earnings,
 * news, and the Yahoo options chain with delta computed from its IV via
 * shared/iv-fill.ts — a SAMPLE-ONLY chain; production uses Alpaca). It never
 * touches the database: flow (options_flow_history), GEX (gex_snapshots) and
 * the weekly sector-rotation read (worker shared state) are n/a here; the
 * sector ETF mapping is used for RS vs sector.
 * The inputs are saved to scripts/fixtures/swings-sample.json; --replay
 * re-scores that file without network. The drawdown band is widened to 0–100
 * so every requested name prints (the real screen keeps 40–85%).
 */
import fs from 'node:fs';
import path from 'node:path';
import { liveDeps, screenOne, type SwingsDeps } from '../server/swings-screener';
import { bsDelta } from '../shared/iv-fill';
import { calendarDte } from '../server/lib/publish-gates';
import type { BudgetChainRow } from '../shared/budget-contract';

const FIX = path.join(process.cwd(), 'scripts', 'fixtures', 'swings-sample.json');
const args = process.argv.slice(2);
const replay = args.includes('--replay');
const syms = args.filter((a) => !a.startsWith('--')).map((s) => s.toUpperCase());
const SYMS = syms.length ? syms : ['QCOM', 'APP', 'STX', 'WDC'];

type Rec = Record<string, Record<string, unknown>>;
const rec: Rec = replay ? JSON.parse(fs.readFileSync(FIX, 'utf8')).inputs : {};
const nowMs = replay ? Date.parse(JSON.parse(fs.readFileSync(FIX, 'utf8')).capturedAt) : Date.now();

async function yahooChain(sym: string, minDays: number, maxDays: number): Promise<{ rows: BudgetChainRow[]; source: string; asOf: string } | null> {
  const { getYahooFinance } = await import('../server/yahoo-finance-service');
  const y = await getYahooFinance();
  const head: any = await y.options(sym, {}, { validateResult: false });
  const spot = head?.quote?.regularMarketPrice;
  const exps: Date[] = (head?.expirationDates ?? []).map((d: any) => new Date(d));
  const want = exps.filter((d) => { const dte = calendarDte(d.toISOString().slice(0, 10), nowMs) ?? -1; return dte >= minDays && dte <= maxDays; });
  const rows: BudgetChainRow[] = [];
  for (const d of want.slice(0, 6)) {
    const r: any = await y.options(sym, { date: d }, { validateResult: false });
    for (const c of r?.options?.[0]?.calls ?? []) {
      const expiry = new Date(c.expiration).toISOString().slice(0, 10);
      const dte = calendarDte(expiry, nowMs) ?? 0;
      const iv = Number(c.impliedVolatility);
      const delta = spot > 0 && iv > 0.01 ? bsDelta(spot, c.strike, Math.max(1, dte) / 365, iv, true) : null;
      rows.push({ type: 'call', strike: c.strike, expiry, bid: c.bid ?? null, ask: c.ask ?? null, delta, gamma: null, iv: iv > 0.01 ? iv : null, openInterest: c.openInterest ?? null, volume: c.volume ?? null, dte, occ: c.contractSymbol ?? null });
    }
  }
  return rows.length ? { rows, source: 'yahoo options (sample only; delta from IV)', asOf: new Date(nowMs).toISOString() } : null;
}

/** Record live answers per (fn, sym, args) so --replay can re-run offline. */
function recorded<K extends keyof SwingsDeps>(name: K, live: (...a: any[]) => Promise<any>) {
  return async (...a: any[]) => {
    const key = `${String(name)}|${a.slice(0, 3).join('|')}`;
    if (replay) return (rec[key] as any)?.v ?? null;
    let v: any = null;
    try { v = await live(...a); } catch (e: any) { v = null; console.warn(`  ${key}: ${e?.message ?? e}`); }
    rec[key] = { v };
    return v;
  };
}

const deps: SwingsDeps = {
  universe: async () => ({ symbols: SYMS, sources: ['sample'] }),
  monthly: recorded('monthly', liveDeps.monthly),
  daily: recorded('daily', liveDeps.daily),
  fundamentals: recorded('fundamentals', liveDeps.fundamentals),
  earnings: recorded('earnings', liveDeps.earnings),
  // Sector mapping only (shared/sector-peers.ts) — the weekly rotation read lives in worker state, not read here.
  rotation: async (s: string) => {
    const { getPeerSet } = await import('../shared/sector-peers');
    const ps = getPeerSet(s);
    return ps?.group.etf ? { groupId: ps.group.id, label: ps.group.label, etf: ps.group.etf, quadrant: null, stage: null, side: null, asOf: null } : null;
  },
  flow: async () => null,
  gex: async () => null,
  news: recorded('news', liveDeps.news),
  chain: recorded('chain', (s: string, lo: number, hi: number) => yahooChain(s, lo, hi)),
  nowMs: () => nowMs,
};

async function main() {
  console.log(`${replay ? 'REPLAY of fixture' : 'LIVE Yahoo'} sample · ${new Date(nowMs).toISOString()} · Research screen — not financial advice`);
  const spy = await deps.daily('SPY', 200);
  const out = [];
  for (const s of SYMS) {
    const row = await screenOne(s, deps, { spy, etfBars: new Map(), force: true });
    if (!row) { console.log(`\n${s}: no bars`); continue; }
    out.push(row);
  }
  out.sort((a, b) => b.score - a.score);
  for (const r of out) {
    console.log(`\n${r.symbol} ${r.name ?? ''} — ${r.letter} ${r.score}/100 (coverage ${Math.round(r.coverage * 100)}%) · $${r.price} · −${r.drawdownPct}% from ${r.athBasis} $${r.ath} · ${r.drawdownPct >= 40 && r.drawdownPct <= 85 ? 'IN' : 'OUTSIDE'} the 40–85% band`);
    for (const g of r.groups) console.log(`   ${g.label.padEnd(16)} ${g.points}/${g.available} (of ${g.max})`);
    for (const f of r.factors) console.log(`     ${f.label.padEnd(24)} ${f.points == null ? 'n/a' : `${f.points}/${f.max}`}  ${f.value}  — ${f.note}`);
    for (const [k, s] of [['Monthly', r.swing], ['LEAPS', r.leaps]] as const) {
      const p = s?.pick;
      console.log(`   ${k}: ${s?.status}${s?.overBudget ? ` · in-band ${s.overBudget.label} $${s.overBudget.debitOne} OVER $1,000` : ''}${p ? ` · ${p.label} Δ${p.delta} ${p.dte}DTE mid $${p.mid} → $${p.debitOne}/contract · qty $500:${p.qtyAt['500']} $1000:${p.qtyAt['1000']} · B/E $${p.breakeven}${p.scenario ? ` · ${p.scenario.label}: ${p.scenario.pnlOne >= 0 ? '+' : ''}$${p.scenario.pnlOne}` : ''}${p.expiryPnlOne != null ? ` (at expiry ${p.expiryPnlOne >= 0 ? '+' : ''}$${p.expiryPnlOne})` : ''}` : ` · ${s?.reason}`}`);
    }
    if (r.news[0]) console.log(`   news: ${r.news.slice(0, 2).map((n) => n.title).join(' | ')}`);
  }
  if (!replay) {
    fs.mkdirSync(path.dirname(FIX), { recursive: true });
    fs.writeFileSync(FIX, JSON.stringify({ note: 'LIVE Yahoo capture for scripts/swings-sample.ts --replay (sample only; flow/GEX/rotation not captured)', capturedAt: new Date(nowMs).toISOString(), symbols: SYMS, inputs: rec }));
    console.log(`\nsaved inputs → ${path.relative(process.cwd(), FIX)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
