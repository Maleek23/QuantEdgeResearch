/**
 * GRADE v3 STUDY — which publish-time features rank VERIFIED NEXUS outcomes, and does a
 * simple monotone points score fitted on one half rank the other half better than the
 * current grade? READ-ONLY. Pure logic + tests: research/grade-v3-core.ts, scripts/test-grade-v3.ts.
 *
 * Truth = the bar-verification ledger (research/verify-nexus-book.ts → /tmp/nexus-book-verify.json):
 * VERIFIED rows count at their recorded P&L, MISMATCH rows at the recomputed P&L; never-triggered,
 * synthetic/retroactive, premium-scale, duplicate and UNVERIFIABLE rows are excluded.
 *
 * Features at publish (per idea): stop ÷ ATR(14) · chase (publish price past entry ÷ ATR) · trigger
 * fill past entry · direction · engine · time of day · SPY trend (EMA20) and SPY vs session VWAP vs
 * the trade · sector-rotation layer · room to the opposing GEX wall (latest gex_snapshots row before
 * publish) · gap · RS vs the sector ETF · DTE fit · R:R · confluence family count · freshness
 * (publish → trigger). Two halves at the median publish day, each with its top 5 trades removed;
 * then fit-on-A-test-on-B and fit-on-B-test-on-A, compared with the current grade (logged g2
 * stamp, else rebuilt) and the v3 structural prior (shared/nexus-grade.ts).
 *
 * READ-ONLY: one `BEGIN TRANSACTION READ ONLY` SELECT (ideas + lateral gex snapshot), then ROLLBACK.
 * Bars: Yahoo 1d / 5m, cached in the verifier's cache dir (re-runs are free).
 *
 * Run on the droplet (after research/verify-nexus-book.ts has written the ledger):
 *   cd /opt/quantedge && set -a && . ./.env && set +a && NODE_ENV=production \
 *     npx tsx research/grade-v3-study.ts --ledger /tmp/nexus-book-verify.json --out /tmp/grade-v3-study.json
 * Options:
 *   --ledger file.json   verification ledger (default /tmp/nexus-book-verify.json) — REQUIRED to exist
 *   --since YYYY-MM-DD   default OUTCOME_BASELINE_DATE (2026-08-26)
 *   --out file.json      default /tmp/grade-v3-study.json (rows + every table)
 *   --ideas dump.json    use a json_agg dump of IDEAS_SQL instead of DATABASE_URL
 *   --cache DIR          default /tmp/nexus-verify-cache
 *   --throttle MS        default 350
 *   --offline            cache only, no network
 */
import fs from 'node:fs';
import path from 'node:path';
import { OUTCOME_BASELINE_DATE } from '../shared/constants';
import { readPlanSnapshot } from '../shared/plan-snapshot';
import { gradeV3InputsFrom, nexusGradeV3, V3_QUALITY_POINTS } from '../shared/nexus-grade';
import { etDayMinute, relStrength5, completedThrough, type DayBar } from '../shared/setup-features';
import { getPeerSet } from '../shared/sector-peers';
import { todBucket } from './losers-later-core';
import { gradeAtSurfacing, layerSums } from './grade-audit';
import {
  ledgerTruth, rFromPnl, splitHalves, numericAssoc, categoricalAssoc, crossFit, validatedFeatures, validatedEntry,
  sessionVwap, gexRoomAtr, dteFit, plannedHoldDays, NUMERIC_FEATURES, CATEGORICAL_FEATURES, FEATURE_LABEL,
  type LedgerTrade, type StudyRow, type Ranking,
} from './grade-v3-core';

const CONF_FAMILIES = ['technical', 'structure', 'regime', 'ta', 'premarket', 'breadth', 'compression', 'gex'];

export const IDEAS_SQL = (since: string) => `select json_agg(x) from (
  select t.id, t.symbol, t.asset_type, t.direction, t.source, t.option_type, t.strike_price, t.expiry_date, t.entry_price, t.entry_premium,
         t.stop_loss, t.target_price, t.risk_reward_ratio, t.timestamp as ts, t.generation_timestamp, t.exit_by, t.holding_period,
         t.gen_conviction_score, t.gen_scoring_layers, t.outcome_status,
         (t.convergence_signals_json)::jsonb -> 'planSnapshot' as plan_snapshot,
         (t.convergence_signals_json)::jsonb -> 'executionAudit' as execution_audit,
         (t.convergence_signals_json)::jsonb -> 'nexusGradeAtPublish' as logged_grade,
         g.spot_price as gex_spot, g.call_wall as gex_call_wall, g.put_wall as gex_put_wall, g.regime as gex_regime, g.snapshot_at as gex_at
  from trade_ideas t
  left join lateral (
    select spot_price, call_wall, put_wall, regime, snapshot_at from gex_snapshots s
    where s.symbol = upper(t.symbol) and s.snapshot_at <= t.timestamp::timestamp and s.snapshot_at >= t.timestamp::timestamp - interval '1 day'
    order by s.snapshot_at desc limit 1) g on true
  where t.timestamp >= '${since}' and t.status <> 'draft' and coalesce(t.exclude_from_training, false) = false
    and t.outcome_status is not null and t.outcome_status <> 'open'
) x`;

// ─── args ────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const LEDGER = arg('--ledger') ?? '/tmp/nexus-book-verify.json';
const SINCE = arg('--since') ?? OUTCOME_BASELINE_DATE;
const OUT = arg('--out') ?? '/tmp/grade-v3-study.json';
const IDEAS = arg('--ideas');
const CACHE = arg('--cache') ?? '/tmp/nexus-verify-cache';
const THROTTLE = Number(arg('--throttle') ?? 350);
const OFFLINE = argv.includes('--offline');

const num = (x: unknown): number | null => (x == null || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ─── cached HTTP (verifier cache dir) ────────────────────────
let netCalls = 0, cacheHits = 0;
async function cachedJson(key: string, url: string): Promise<any | null> {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, key.replace(/[^A-Za-z0-9._-]/g, '_') + '.json');
  if (fs.existsSync(file)) { cacheHits++; try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* refetch */ } }
  if (OFFLINE) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(THROTTLE * (attempt + 1));
    netCalls++;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 QuantEdge-verify/1.0' } });
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
      const body = res.ok ? await res.json() : { __status: res.status };
      fs.writeFileSync(file, JSON.stringify(body));
      return body;
    } catch { /* retry */ }
  }
  return null;
}
interface VBar { t: number; o: number; h: number; l: number; c: number; v: number }
function parseYahooV(j: any): VBar[] {
  const res = j?.chart?.result?.[0]; const q = res?.indicators?.quote?.[0]; const ts: number[] = res?.timestamp ?? [];
  if (!q) return [];
  const out: VBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = num(q.open?.[i]), h = num(q.high?.[i]), l = num(q.low?.[i]), c = num(q.close?.[i]);
    if (o != null && h != null && l != null && c != null && h > 0) out.push({ t: ts[i] * 1000, o, h, l, c, v: num(q.volume?.[i]) ?? 0 });
  }
  return out.sort((a, b) => a.t - b.t);
}
const YAHOO_INDEX: Record<string, string> = { SPX: '^GSPC', SPXW: '^GSPC', NDX: '^NDX', NDXP: '^NDX', RUT: '^RUT', VIX: '^VIX', XSP: '^XSP', DJX: '^DJI' };
function yahooSymbol(symbol: string, assetType: string): string {
  const s = symbol.toUpperCase().replace(/^\$/, '');
  if (assetType === 'crypto') return `${s.replace(/[-/]?USDT?$/, '')}-USD`;
  if (assetType === 'future' || assetType === 'futures') return s.endsWith('=F') ? s : `${s.replace(/[A-Z]\d{1,2}$/, '')}=F`;
  return YAHOO_INDEX[s] ?? s;
}
const NOW = Date.now();
const WIN_FROM = Date.parse(`${SINCE}T00:00:00Z`) - 3 * 86400_000;
const dailyMemo = new Map<string, DayBar[]>();
async function daily(symbol: string, assetType = 'stock'): Promise<DayBar[]> {
  const ys = yahooSymbol(symbol, assetType === 'option' ? 'stock' : assetType);
  if (dailyMemo.has(ys)) return dailyMemo.get(ys)!;
  const from = WIN_FROM - 120 * 86400_000;
  const j = await cachedJson(`y1dv_${ys}_${dayKey(from)}_${dayKey(NOW)}`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ys)}?period1=${Math.floor(from / 1000)}&period2=${Math.floor(NOW / 1000)}&interval=1d`);
  const out = parseYahooV(j).map((b) => ({ day: etDayMinute(b.t + 6 * 3600_000).day, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
  dailyMemo.set(ys, out);
  return out;
}
const intraMemo = new Map<string, VBar[]>();
async function intraday(symbol: string, assetType = 'stock'): Promise<VBar[]> {
  const ys = yahooSymbol(symbol, assetType === 'option' ? 'stock' : assetType);
  if (intraMemo.has(ys)) return intraMemo.get(ys)!;
  const j = await cachedJson(`y5mv_${ys}_${dayKey(WIN_FROM)}_${dayKey(NOW)}`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ys)}?period1=${Math.floor(WIN_FROM / 1000)}&period2=${Math.floor(NOW / 1000)}&interval=5m&includePrePost=false`);
  const bars = parseYahooV(j);
  intraMemo.set(ys, bars);
  return bars;
}

// ─── load ────────────────────────────────────────────────────
async function loadIdeas(): Promise<any[]> {
  if (IDEAS) return JSON.parse(fs.readFileSync(IDEAS, 'utf8')) ?? [];
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set (set -a && . ./.env && set +a) — or pass --ideas dump.json');
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '') ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '120s'");
    const res = await client.query(IDEAS_SQL(SINCE));
    return (res.rows[0]?.json_agg as any[]) ?? [];
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}
function loadLedger(): Map<string, LedgerTrade> {
  if (!fs.existsSync(LEDGER)) throw new Error(`ledger ${LEDGER} not found — run research/verify-nexus-book.ts first`);
  const j = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  if (!Array.isArray(j?.trades)) throw new Error(`${LEDGER} has no trades[] — not a verify-nexus-book ledger`);
  return new Map((j.trades as LedgerTrade[]).map((t) => [String(t.id), t]));
}

// ─── per idea ────────────────────────────────────────────────
async function buildRow(x: any, t: LedgerTrade, spyDaily: DayBar[], spy5: VBar[]): Promise<StudyRow | { skip: string }> {
  const truth = ledgerTruth(t);
  if (!truth.ok) return { skip: truth.reason };
  const pubMs = Date.parse(String(x.ts));
  if (!Number.isFinite(pubMs)) return { skip: 'no publish time' };
  const snap = readPlanSnapshot({ planSnapshot: x.plan_snapshot });
  const assetType = String(x.asset_type ?? 'stock');
  const option = assetType === 'option';
  const entry = Number(snap?.entryPrice ?? x.entry_price), stop = Number(snap?.stopLoss ?? x.stop_loss), target = Number(snap?.targetPrice ?? x.target_price);
  const optType = String(snap?.optionType ?? x.option_type ?? '').toLowerCase();
  const strike = num(snap?.strikePrice ?? x.strike_price);
  const contractLevels = option && strike != null && entry < strike * 0.5;
  const dir: 'long' | 'short' = option ? (optType === 'put' ? 'short' : 'long') : String(snap?.direction ?? x.direction).toLowerCase() === 'short' ? 'short' : 'long';
  const premium = option ? (contractLevels ? truth.entry ?? entry : truth.entry ?? num(snap?.entryPremium ?? x.entry_premium)) : null;
  const R = rFromPnl({ assetType: option ? 'option' : 'stock', pnl: truth.pnl, entry, stop, premium, contractLevels });
  if (R == null || !Number.isFinite(R)) return { skip: 'no R (levels/premium unreadable)' };

  const sym = String(x.symbol).toUpperCase();
  const [d1, m5] = await Promise.all([daily(sym, assetType), intraday(sym, assetType)]);
  const { day, minute } = etDayMinute(pubMs);
  const sameDay = (b: VBar) => etDayMinute(b.t).day === day;
  const priorBars = m5.filter((b) => b.t <= pubMs && sameDay(b));
  const pubPrice = priorBars.length ? priorBars[priorBars.length - 1].c : null;
  const todayOpen = minute >= 570 ? (m5.find(sameDay)?.o ?? null) : null;
  const inputs = gradeV3InputsFrom({
    direction: dir, entry, stop, price: pubPrice, atMs: pubMs, levelsUnderlying: !contractLevels, daily: d1, spyDaily, crypto: assetType === 'crypto', todayOpen,
  });
  const atr = inputs.atr;
  const side = dir === 'short' ? -1 : 1;
  // SPY vs session VWAP at publish, with the trade.
  const spyDay = spy5.filter((b) => etDayMinute(b.t).day === day);
  const vw = minute >= 570 && minute < 960 ? sessionVwap(spyDay, pubMs) : null;
  const spyLast = spyDay.filter((b) => b.t <= pubMs).pop()?.c ?? null;
  const spyVwap = vw != null && spyLast != null ? Math.sign(side * (spyLast - vw)) : null;
  // Sector rotation layer and RS vs the peer-group ETF.
  const L = layerSums(x.gen_scoring_layers);
  const rotation = L && L.sector != null ? Math.sign(L.sector) : L ? 0 : null;
  const etf = getPeerSet(sym)?.group.etf ?? null;
  let rsSector: number | null = null;
  if (etf && etf !== sym && assetType !== 'crypto') {
    const e1 = await daily(etf);
    const cut = (bs: DayBar[]) => bs.slice(0, completedThrough(bs, pubMs));
    rsSector = relStrength5(cut(d1), cut(e1), dir);
    if (rsSector != null) rsSector = Math.round(rsSector * 1000) / 1000;
  }
  // GEX room to the opposing wall (underlying reference: entry, or the publish price for premium-level plans).
  const ref = contractLevels ? pubPrice : entry;
  const gexRoom = ref != null ? gexRoomAtr(dir, ref, num(x.gex_call_wall), num(x.gex_put_wall), atr) : null;
  // DTE fit.
  const expMs = Date.parse(String(snap?.expiryDate ?? x.expiry_date ?? ''));
  const dteDays = option && Number.isFinite(expMs) ? Math.max(0, (expMs - pubMs) / 86400_000) : null;
  // Trigger.
  const audit = x.execution_audit ?? {};
  const trigAt = Date.parse(String(truth.triggerAt ?? audit.triggerObservedAt ?? ''));
  const trigPx = num(audit.triggerObservedPrice);
  const rr = num(snap?.riskRewardRatio ?? x.risk_reward_ratio) ?? (entry !== stop ? Math.abs(target - entry) / Math.abs(entry - stop) : null);

  const g2 = num(x.logged_grade?.score) != null && String(x.logged_grade?.v ?? '').startsWith('g2') ? num(x.logged_grade.score) : gradeAtSurfacing(x)?.score ?? null;
  const v3 = nexusGradeV3({
    lifecycle: 'fresh', publishMs: pubMs, windowEndsMs: pubMs + 1, publishedDay: day, today: day, nowMs: pubMs,
    gradeInputs: inputs, direction: dir, layers: Array.isArray(x.gen_scoring_layers) ? x.gen_scoring_layers : null, riskRewardRatio: rr,
  });
  return {
    id: String(x.id), day, R: Math.round(R * 1000) / 1000,
    f: {
      stopAtr: inputs.stopAtr, chaseAtr: inputs.chaseAtr,
      trigSlipAtr: atr && trigPx != null && !contractLevels ? Math.round(((side * (trigPx - entry)) / atr) * 1000) / 1000 : null,
      isShort: dir === 'short' ? 1 : 0, regime: inputs.regime, spyVwap, rotation, gexRoomAtr: gexRoom, gapAtr: inputs.gapAtr ?? null,
      rsSector, dteFit: dteFit(dteDays, plannedHoldDays(x.holding_period)), rr: rr != null ? Math.round(rr * 100) / 100 : null,
      confFamilies: L ? CONF_FAMILIES.filter((k) => (L[k] ?? 0) > 0).length : null,
      freshMin: Number.isFinite(trigAt) ? Math.max(0, Math.round((trigAt - pubMs) / 60_000)) : null,
      etMinute: minute,
    },
    c: { engine: String(x.source ?? 'unknown'), tod: todBucket(minute), vehicle: option ? (optType === 'put' ? 'put' : 'call') : assetType },
    s: { grade: g2, v3prior: v3.score },
  };
}

// ─── print ───────────────────────────────────────────────────
const fmt = (v: number | null | undefined, d = 2) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}`);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
function printRanking(name: string, r: Ranking) {
  console.log(`  ${name.padEnd(14)} n=${String(r.n).padStart(4)}  ρ ${fmt(r.rho)}  ρ−top5 ${fmt(r.rhoDrop)}  top−bottom ${fmt(r.topMinusBottomR)}R`);
  console.log(`  ${''.padEnd(14)} ${r.buckets.map((b) => `${b.bucket} ${pct(b.win)}/${fmt(b.avgR, 2)}`).join('  ')}`);
}

async function main() {
  console.log(`[grade-v3-study] since ${SINCE} · ledger ${LEDGER} · cache ${CACHE}${OFFLINE ? ' · OFFLINE' : ''}`);
  const ledger = loadLedger();
  const ideas = await loadIdeas();
  console.log(`  ${ideas.length} resolved ideas read (read-only txn, rolled back) · ledger rows ${ledger.size}`);
  const spyDaily = await daily('SPY');
  const spy5 = await intraday('SPY');
  const rows: StudyRow[] = [];
  const skipped: Record<string, number> = {};
  const basis = { verified: 0, recomputed: 0 };
  let k = 0;
  for (const x of ideas) {
    k++;
    const t = ledger.get(String(x.id));
    const r = t ? await buildRow(x, t, spyDaily, spy5).catch((e) => ({ skip: `error: ${e?.message ?? e}` })) : { skip: 'not in ledger' };
    if ('skip' in r) { skipped[r.skip] = (skipped[r.skip] ?? 0) + 1; continue; }
    rows.push(r);
    const tr = ledgerTruth(t!); if (tr.ok) basis[tr.basis]++;
    if (k % 50 === 0) console.log(`  … ${k}/${ideas.length} (net ${netCalls}, cache ${cacheHits})`);
  }
  const halves = splitHalves(rows);
  const assoc = NUMERIC_FEATURES.map((key) => numericAssoc(halves, key));
  const cats = CATEGORICAL_FEATURES.map((key) => categoricalAssoc(halves, key));
  const fits = crossFit(halves);
  const validated = validatedFeatures(halves, fits, assoc);
  const paste: Record<string, unknown> = {};
  if (validated.includes('stopAtr')) paste.stop = validatedEntry(halves, 'stopAtr', V3_QUALITY_POINTS.stop);
  if (validated.includes('chaseAtr')) paste.chase = validatedEntry(halves, 'chaseAtr', V3_QUALITY_POINTS.chase);
  if (validated.includes('regime')) paste.regime = validatedEntry(halves, 'regime', V3_QUALITY_POINTS.regime);

  const A = halves.filter((r) => r.half === 'A'), B = halves.filter((r) => r.half === 'B');
  console.log(`\nGRADE v3 STUDY — ${halves.length} verified trades (VERIFIED ${basis.verified} · MISMATCH→recomputed ${basis.recomputed}) · half A ${A.length} (< ${B[0]?.day ?? '—'}) / B ${B.length}`);
  console.log(`excluded: ${Object.entries(skipped).map(([k2, v]) => `${k2} ${v}`).join(' · ') || 'none'}`);
  console.log('\nNUMERIC FEATURES (Spearman vs R, clipped [−3,+5]; PASS = same sign |ρ|≥0.05 in both halves, with and without top 5)');
  console.log('feature                                       nA   ρA     ρA−5   nB   ρB     ρB−5   both halves');
  for (const a of assoc) {
    console.log(`${a.label.padEnd(44)} ${String(a.A.n).padStart(4)} ${fmt(a.A.rho).padStart(6)} ${fmt(a.A.rhoDrop).padStart(6)} ${String(a.B.n).padStart(4)} ${fmt(a.B.rho).padStart(6)} ${fmt(a.B.rhoDrop).padStart(6)}   ${a.holdsBoth ? 'PASS' : 'no'}`);
  }
  for (const a of assoc.filter((x) => ['stopAtr', 'chaseAtr', 'regime', 'gapAtr', 'gexRoomAtr'].includes(x.key))) {
    console.log(`\n  ${a.label} tertiles: ${a.tertiles.map((t) => `${t.bucket}: A ${t.A.n}/${pct(t.A.win)}/${fmt(t.A.avgR)} · B ${t.B.n}/${pct(t.B.win)}/${fmt(t.B.avgR)}`).join('  |  ')}`);
  }
  console.log('\nCATEGORICAL (avg R per level, top 5 removed; ✓ = same side of the book in both halves, n ≥ 10 each)');
  for (const c of cats) {
    console.log(`  ${c.label}`);
    for (const l of c.levels) console.log(`    ${l.level.padEnd(28)} A ${String(l.A.n).padStart(3)} ${pct(l.A.win).padStart(4)} ${fmt(l.Adrop.avgR)}   B ${String(l.B.n).padStart(3)} ${pct(l.B.win).padStart(4)} ${fmt(l.Bdrop.avgR)}   ${l.sameSideBoth == null ? '(n<10)' : l.sameSideBoth ? '✓' : '✗'}`);
  }
  console.log('\nFIT ONE HALF, TEST THE OTHER (monotone points per tertile, shrunk; decile/quintile = win rate / avg R)');
  for (const f of fits) {
    console.log(`\n ${f.direction}: features chosen on train — ${f.fit.tables.map((t) => `${t.key}${t.kind === 'numeric' ? `(${t.sign > 0 ? '+' : '−'}) [${t.points.join(',')}]` : ` {${t.levels!.map((l, i) => `${l}:${t.points[i]}`).join(', ')}}`}`).join(' · ') || 'none'}`);
    printRanking('fitted score', f.test.fitted);
    printRanking('current grade', f.test.currentGrade);
    printRanking('v3 prior', f.test.v3prior);
  }
  console.log(`\nVALIDATED (chosen by both fits, same sign, holds both halves w/o top 5, test-half ρ agrees both ways): ${validated.length ? validated.map((k2) => FEATURE_LABEL[k2] ?? k2).join(', ') : 'NONE — v3 stays on the structural prior'}`);
  if (Object.keys(paste).length) {
    console.log('\nPaste into shared/nexus-grade.ts V3_VALIDATED (then re-run tests):');
    console.log(JSON.stringify(paste, null, 2));
  }
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), since: SINCE, ledger: LEDGER, n: halves.length, basis, skipped, assoc, cats, fits, validated, paste, rows: halves }, null, 1));
  console.log(`\nwrote ${OUT} · network ${netCalls} · cache ${cacheHits}`);
}

if (process.argv[1] && /grade-v3-study\.ts$/.test(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
