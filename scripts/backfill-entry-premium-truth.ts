/**
 * BACKFILL (DRY-RUN) — option ideas whose recorded entry premium the contract
 * never traded at in the 5 minutes after publish (shared/entry-premium-truth.ts,
 * class entry_premium_not_traded). 2026-10-14: flow SPY 777C/778C published at
 * the prior session's closing marks ($2.72/$2.13 vs ~$0.60 live) and were booked
 * hit_stop −78% a minute later.
 *
 * DRY-RUN ONLY. Reads rows exported with psql (no DB import) and the contracts'
 * Alpaca 1-minute bars (ALPACA_API_KEY / ALPACA_SECRET_KEY), and prints old vs
 * corrected entry / exit / outcome / P&L per contract. Writes nothing to the DB.
 *
 *   tsx scripts/backfill-entry-premium-truth.ts --rows rows.json [--since 2026-10-01] [--ids a,b] [--cache bars.json] [--out report.json] [--env-file alpaca.env]
 *
 * rows.json: json_agg of trade_ideas rows (snake_case) — see the commit message.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { guardEntryAgainstBars, ENTRY_PREMIUM_NOT_TRADED, type MinuteBar } from '../shared/entry-premium-truth';
import { judgePremiumOutcome, premiumPlanFor } from '../shared/premium-outcome';
import { optionExpiryCloseMs } from '../shared/option-expiry';

const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
if (args.includes('--apply')) { console.error('This script is dry-run only (no --apply).'); process.exit(2); }
const ROWS = arg('--rows');
const SINCE = arg('--since') ?? '2026-10-01';
const IDS = (arg('--ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const CACHE = arg('--cache');
const OUT = arg('--out');
const ENV_FILE = arg('--env-file');
if (ENV_FILE) for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const NOW = Date.now();
const LAG = 16 * 60_000;
if (!ROWS) { console.error('--rows rows.json required'); process.exit(2); }

const num = (x: unknown): number | null => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const jsonOf = (x: unknown) => { if (typeof x === 'string') { try { return JSON.parse(x); } catch { return null; } } return x ?? null; };
const r2 = (x: number) => Math.round(x * 100) / 100;
const et = (ms: number | null | undefined) => (ms == null ? '—' : new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }));

function occ(root: string, expiry: string, type: string, strike: number): string {
  const [y, m, d] = expiry.slice(0, 10).split('-');
  return `${root}${y.slice(2)}${m}${d}${type.toLowerCase().startsWith('p') ? 'P' : 'C'}${String(Math.round(strike * 1000)).padStart(8, '0')}`;
}

const cache: Record<string, MinuteBar[]> = CACHE && existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
async function bars(sym: string, fromMs: number, toMs: number): Promise<MinuteBar[]> {
  const key = `${sym}|${fromMs}|${toMs}`;
  if (cache[key]) return cache[key];
  const k = process.env.ALPACA_API_KEY, s = process.env.ALPACA_SECRET_KEY;
  if (!k || !s) throw new Error('ALPACA_API_KEY / ALPACA_SECRET_KEY not set');
  const out: MinuteBar[] = [];
  let token: string | null = null;
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({ symbols: sym, timeframe: '1Min', start: new Date(fromMs).toISOString(), end: new Date(toMs).toISOString(), limit: '10000' });
    if (token) qs.set('page_token', token);
    const res = await fetch(`https://data.alpaca.markets/v1beta1/options/bars?${qs}`, { headers: { 'APCA-API-KEY-ID': k, 'APCA-API-SECRET-KEY': s } });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 1500)); page--; continue; }
    if (!res.ok) break;
    const j: any = await res.json();
    for (const b of j?.bars?.[sym] ?? []) out.push({ t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c });
    token = j?.next_page_token ?? null;
    if (!token) break;
  }
  cache[key] = out;
  return out;
}

async function contractBars(r: any, fromMs: number, toMs: number): Promise<{ occ: string; bars: MinuteBar[] }> {
  const sym = String(r.symbol).toUpperCase();
  const roots = sym === 'SPX' ? ['SPXW', 'SPX'] : sym === 'NDX' ? ['NDXP', 'NDX'] : [sym];
  for (const root of roots) {
    const o = occ(root, String(r.expiry_date), String(r.option_type), Number(r.strike_price));
    const b = await bars(o, fromMs, toMs);
    if (b.length) return { occ: o, bars: b };
  }
  return { occ: occ(roots[0], String(r.expiry_date), String(r.option_type), Number(r.strike_price)), bars: [] };
}

function windowEnd(r: any, cs: any): number {
  const ts = Date.parse(String(cs?.lossRules?.timeStop?.atIso ?? ''));
  const xb = Date.parse(String(r.exit_by ?? ''));
  const close = optionExpiryCloseMs(r.expiry_date);
  const cands = [ts, xb, close].filter((x) => Number.isFinite(x)) as number[];
  return Math.min(cands.length ? Math.min(...cands) : close, NOW - LAG);
}

async function main() {
  const all: any[] = JSON.parse(readFileSync(ROWS!, 'utf8'));
  const rows = all.filter((r) => String(r.timestamp) >= SINCE && (!IDS.length || IDS.some((p) => String(r.id).startsWith(p))));
  const report: any[] = [];
  let judged = 0, noBars = 0;
  for (const r of rows) {
    const pubMs = Date.parse(String(r.timestamp));
    const E = num(r.entry_premium)!;
    const head = await contractBars(r, pubMs - 2 * 60_000, Math.min(pubMs + 7 * 60_000, NOW - LAG));
    if (!head.bars.length) { noBars++; continue; }
    judged++;
    const g = guardEntryAgainstBars(E, head.bars, pubMs);
    if (!g.repriced) continue;
    const cs = jsonOf(r.convergence_signals_json) ?? {};
    const cs2 = { ...cs }; delete cs2.premiumPlan; delete cs2.budgetContract;
    const idea = {
      assetType: 'option', direction: r.direction, entryPrice: num(r.entry_price), targetPrice: num(r.target_price), stopLoss: num(r.stop_loss),
      entryPremium: g.entry, optionDelta: num(r.option_delta), optionType: r.option_type, strikePrice: num(r.strike_price), expiryDate: r.expiry_date,
      source: r.source, qualitySignals: jsonOf(r.quality_signals), convergenceSignalsJson: cs2,
    };
    const zeroDte = String(r.expiry_date).slice(0, 10) === new Date(pubMs).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const plan = premiumPlanFor(idea, { zeroDte, nowMs: pubMs });
    const trig = Date.parse(String(cs?.executionAudit?.triggerObservedAt ?? ''));
    const entryMs = Number.isFinite(trig) && trig >= pubMs ? trig : pubMs;
    const from = Math.max(entryMs, (g.barAtMs ?? pubMs) + 60_000);
    const toMs = windowEnd(r, cs);
    let v: any = null;
    if (plan && toMs > from) {
      const full = await contractBars(r, pubMs - 2 * 60_000, toMs);
      v = judgePremiumOutcome(full.bars, plan, from, toMs, { final: toMs < NOW - LAG, source: 'alpaca:1Min' });
    }
    const oldX = num(r.exit_premium);
    const oldPnl = oldX != null ? r2((oldX - E) * 100) : null;
    const newPnl = v?.exitPremium != null ? r2((v.exitPremium - g.entry) * 100) : null;
    report.push({
      id: r.id, source: r.source, contract: head.occ, publishedET: et(pubMs), class: ENTRY_PREMIUM_NOT_TRADED,
      range5m: g.range, old: { entry: E, exit: oldX, outcome: r.outcome_status, pct: num(r.option_percent_gain), pnl: oldPnl },
      corrected: { entry: g.entry, entryBarET: et(g.barAtMs), plan: plan && { t1: plan.t1, stop: plan.stop, source: plan.source }, exit: v?.exitPremium ?? null, exitET: et(v?.exitAtMs), outcome: v?.status ?? 'unjudged', pct: v?.optionPercentGain ?? null, pnl: newPnl },
    });
  }
  if (CACHE) writeFileSync(CACHE, JSON.stringify(cache));
  if (OUT) writeFileSync(OUT, JSON.stringify({ generatedAt: new Date(NOW).toISOString(), since: SINCE, rows: rows.length, judged, noBars, affected: report }, null, 2));

  console.log(`[entry-premium-truth] DRY RUN · since ${SINCE} · ${rows.length} option rows · ${judged} with bars in the 5 min after publish · ${noBars} without bars`);
  console.log(`[entry-premium-truth] ${report.length} rows classed ${ENTRY_PREMIUM_NOT_TRADED} (recorded entry outside the 5-min traded range ±25%)`);
  const bySrc: Record<string, number> = {};
  for (const x of report) bySrc[x.source] = (bySrc[x.source] ?? 0) + 1;
  console.log(`  by source: ${Object.entries(bySrc).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
  const flips: Record<string, number> = {};
  let dOld = 0, dNew = 0;
  for (const x of report) {
    const k = `${x.old.outcome}→${x.corrected.outcome}`; flips[k] = (flips[k] ?? 0) + 1;
    if (x.old.pnl != null && x.corrected.pnl != null) { dOld += x.old.pnl; dNew += x.corrected.pnl; }
  }
  console.log(`  outcome changes: ${Object.entries(flips).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
  console.log(`  P&L per 1 contract (rows judged both ways): recorded $${r2(dOld)} → corrected $${r2(dNew)}`);
  console.log('');
  console.log('id        source          contract              published    5m range     old entry→exit  outcome   P&L     | new entry→exit  outcome   P&L');
  for (const x of report) {
    console.log(`${x.id.slice(0, 8)}  ${String(x.source).padEnd(15)} ${x.contract.padEnd(21)} ${x.publishedET.padEnd(12)} ${`${x.range5m?.lo}–${x.range5m?.hi}`.padEnd(12)} `
      + `${`${x.old.entry}→${x.old.exit ?? '—'}`.padEnd(15)} ${String(x.old.outcome).padEnd(9)} ${String(x.old.pnl ?? '—').padEnd(7)} | `
      + `${`${x.corrected.entry}→${x.corrected.exit ?? '—'}`.padEnd(15)} ${String(x.corrected.outcome).padEnd(9)} ${x.corrected.pnl ?? '—'}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
