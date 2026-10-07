/**
 * BOT DIAGNOSE — why is the Quantinum Bot not opening trades? READ-ONLY.
 *
 * Runs every SELECT inside a READ ONLY transaction (never writes, never trades,
 * never calls a quote vendor). Answers, from the database + the worker's last
 * cycle stamp (.cache/shared/quant-bot-cycle.json):
 *   1. capacity — open positions per sleeve in the active run vs BOT_0DTE_MAX /
 *      BOT_SWING_MAX, and which of them are past their hold window (the time stop
 *      that frees capacity) or marked > 30 min ago (stale marks block stops);
 *   2. 0DTE candidates published today and what classifyZeroDteIdea says about each;
 *   3. swing candidates: today's open published ideas graded with the ONE grade,
 *      vs the swing sleeve's grade floor;
 *   4. stop-outs today (no same-day re-entry) and opposite-side holdings;
 *   5. the last cycle's skip reasons, ROLE and pid (worker/web double-run check);
 *   6. entries per day for the last 10 sessions.
 *
 *   DATABASE_URL=… npx tsx research/bot-diagnose.ts [--json]
 * Prod (operator session):  cd /opt/quantedge && set -a && . ./.env && set +a && npx tsx research/bot-diagnose.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  readBotSleeveConfig, classifyZeroDteIdea, sleeveOfPosition, stoppedOutToday, underlyingSide, timeStopDue,
} from '../shared/bot-sleeves';
import { gradeIdeaRow, formatNexusGrade } from '../shared/nexus-grade';
import { etDay } from '../shared/setup-lifecycle';

const BOT_USER = 'system-quant-bot';
const BOT_PORTFOLIO_NAME = 'Quant Bot · 100K';

export interface Diagnosis {
  at: string;
  activeRun: { id: string; name: string; createdAt: string | null } | null;
  capacity: Record<string, { held: number; max: number }>;
  openPositions: Array<{ symbol: string; sleeve: string; contract: string; entryTime: string; markAgeMin: number | null; timeStopDue: boolean; why: string }>;
  stoppedToday: string[];
  oppositeSides: string[];
  zeroDte: { candidates: number; verdicts: Record<string, number>; examples: string[] };
  swing: { candidates: number; minGrade: number; atOrAbove: number; examples: string[] };
  lastCycle: unknown;
  entriesByDay: Record<string, number>;
  findings: string[];
}

const camel = (r: Record<string, any>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));

/** Pure: build the diagnosis from rows (tested without a database). */
export function diagnose(input: {
  nowMs: number;
  portfolios: any[];
  positions: any[];
  ideas: any[];
  lastCycle: unknown;
  env?: Record<string, string | undefined>;
}): Diagnosis {
  const { nowMs } = input;
  const cfg = readBotSleeveConfig(input.env ?? {});
  const mine = input.portfolios.filter((p) => p.userId === BOT_USER && p.name === BOT_PORTFOLIO_NAME)
    .sort((a, b) => Date.parse(b.createdAt ?? 0) - Date.parse(a.createdAt ?? 0));
  const active = mine[0] ?? null;
  const open = input.positions.filter((p) => p.status === 'open');
  const activeOpen = active ? open.filter((p) => p.portfolioId === active.id) : [];
  const held: Record<string, number> = { '0dte': 0, swing: 0 };
  const openPositions: Diagnosis['openPositions'] = [];
  const ideaById = new Map(input.ideas.map((i) => [i.id, i]));
  for (const p of activeOpen) {
    const sleeve = sleeveOfPosition(p);
    held[sleeve]++;
    const idea = p.tradeIdeaId ? ideaById.get(p.tradeIdeaId) : null;
    const ts = timeStopDue({
      nowMs, entryTime: p.entryTime ?? null, direction: p.direction === 'short' ? 'short' : 'long', expiryDate: p.expiryDate ?? null,
      liveUnderlying: null, policy: 'plan',
      idea: idea ? { direction: idea.direction, entryPrice: Number(idea.entryPrice), stopLoss: Number(idea.stopLoss), targetPrice: Number(idea.targetPrice), assetType: idea.assetType, holdingPeriod: idea.holdingPeriod, source: idea.source, expiryDate: idea.expiryDate ?? p.expiryDate, generatedAt: idea.timestamp ?? null, exitBy: idea.exitBy ?? null } : null,
    });
    const markMs = Date.parse(String(p.lastPriceUpdate ?? ''));
    openPositions.push({
      symbol: p.symbol, sleeve, contract: p.optionType ? `${p.strikePrice}${String(p.optionType)[0].toUpperCase()} ${String(p.expiryDate ?? '').slice(0, 10)}` : 'shares',
      entryTime: p.entryTime, markAgeMin: Number.isFinite(markMs) ? Math.round((nowMs - markMs) / 60_000) : null,
      timeStopDue: sleeve === 'swing' && ts.due, why: ts.why,
    });
  }
  const stopped = [...stoppedOutToday(input.positions as any[], nowMs)];
  const sides = new Map<string, Set<string>>();
  for (const p of open) { const k = String(p.symbol).toUpperCase(); if (!sides.has(k)) sides.set(k, new Set()); sides.get(k)!.add(underlyingSide(p)); }
  const oppositeSides = [...sides].filter(([, s]) => s.size > 1).map(([k]) => k);

  const today = etDay(nowMs);
  const todays = input.ideas.filter((i) => i.timestamp && etDay(Date.parse(i.timestamp)) === today && (i.outcomeStatus ?? 'open') === 'open');
  const zVerdicts: Record<string, number> = {}; const zEx: string[] = []; let zc = 0;
  const swingRows: Array<{ s: string; score: number }> = [];
  for (const i of todays) {
    const v = classifyZeroDteIdea(i, nowMs, cfg);
    if (v.kind) {
      zc++;
      zVerdicts[v.code] = (zVerdicts[v.code] ?? 0) + 1;
      if (zEx.length < 8) zEx.push(`${i.symbol} ${i.source} ${i.optionType ?? ''}${i.strikePrice ?? ''} ${String(i.expiryDate ?? '').slice(0, 10)} → ${v.code}: ${v.reason}`);
      continue;
    }
    const g = gradeIdeaRow(i, nowMs);
    swingRows.push({ s: `${i.symbol} ${i.direction} ${i.source} NEXUS ${formatNexusGrade(g)}`, score: g.score });
  }
  swingRows.sort((a, b) => b.score - a.score);
  const atOrAbove = swingRows.filter((r) => r.score >= cfg.swingMinGrade).length;

  const entriesByDay: Record<string, number> = {};
  for (const p of input.positions) {
    if (!active || p.portfolioId !== active.id) continue;
    const d = etDay(Date.parse(p.entryTime));
    if (Date.parse(p.entryTime) >= nowMs - 14 * 86_400_000) entriesByDay[d] = (entriesByDay[d] ?? 0) + 1;
  }

  const findings: string[] = [];
  if (!active) findings.push('no active "Quant Bot · 100K" portfolio — the bot has nothing to trade into');
  if (held.swing >= cfg.swingMax) findings.push(`swing sleeve FULL (${held.swing}/${cfg.swingMax}); ${openPositions.filter((p) => p.timeStopDue).length} of those are past their hold window and will be time-stopped at the live mid`);
  if (held['0dte'] >= cfg.zeroDteMax) findings.push(`0DTE sleeve FULL (${held['0dte']}/${cfg.zeroDteMax})`);
  const stale = openPositions.filter((p) => p.markAgeMin == null || p.markAgeMin > 30);
  if (stale.length) findings.push(`${stale.length} open position(s) have no mark in the last 30 min — stop/target checks skip them (quote feed?)`);
  if (zc === 0) findings.push('no 0DTE-engine idea (index scalp / zero_dte_desk / zero_dte_flow / gex_magnet) published today — the 0DTE sleeve has nothing to take');
  else if (!zVerdicts.ok) findings.push(`0DTE candidates today: ${zc}, none qualify (${Object.entries(zVerdicts).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  if (swingRows.length && atOrAbove === 0) findings.push(`no swing candidate reaches the grade floor ${cfg.swingMinGrade} (best: ${swingRows[0].s})`);
  if (oppositeSides.length) findings.push(`both sides held on: ${oppositeSides.join(', ')}`);
  if (stopped.length) findings.push(`stopped out today (no re-entry): ${stopped.join(', ')}`);
  const lc: any = input.lastCycle;
  if (!lc) findings.push('no worker cycle stamp found (.cache/shared/quant-bot-cycle.json) — is the worker (ROLE=worker) running the bot?');
  else {
    const age = (nowMs - Date.parse(lc.at)) / 60_000;
    if (age > 30) findings.push(`last cycle ${Math.round(age)} min ago (${lc.origin}, ROLE=${lc.role ?? '?'}) — the scheduler may not be running`);
    if (lc.role === 'web') findings.push('last cycle ran in ROLE=web — bot cycles belong to the worker');
    if (lc.error) findings.push(`last cycle error: ${lc.error}`);
    if (lc.skipSummary?.byReason) findings.push(`last cycle skips: ${Object.entries(lc.skipSummary.byReason).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  }
  return {
    at: new Date(nowMs).toISOString(),
    activeRun: active ? { id: active.id, name: active.name, createdAt: active.createdAt ?? null } : null,
    capacity: { '0dte': { held: held['0dte'], max: cfg.zeroDteMax }, swing: { held: held.swing, max: cfg.swingMax } },
    openPositions, stoppedToday: stopped, oppositeSides,
    zeroDte: { candidates: zc, verdicts: zVerdicts, examples: zEx },
    swing: { candidates: swingRows.length, minGrade: cfg.swingMinGrade, atOrAbove, examples: swingRows.slice(0, 8).map((r) => r.s) },
    lastCycle: input.lastCycle ?? null,
    entriesByDay, findings,
  };
}

async function loadDb(): Promise<{ portfolios: any[]; positions: any[]; ideas: any[] }> {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin transaction read only');
    const portfolios = (await client.query(`select id, user_id, name, created_at from paper_portfolios where user_id = $1`, [BOT_USER])).rows.map(camel);
    const ids = portfolios.map((p) => p.id);
    const positions = ids.length ? (await client.query(
      `select id, portfolio_id, trade_idea_id, symbol, asset_type, direction, option_type, strike_price, expiry_date, entry_price, entry_time,
              entry_signals, status, exit_time, exit_reason, current_price, last_price_update
         from paper_positions where portfolio_id = any($1) and (status = 'open' or exit_time >= (now() - interval '14 days')::text or entry_time >= (now() - interval '14 days')::text)`, [ids])).rows.map(camel) : [];
    const ideas = (await client.query(
      `select id, symbol, direction, source, data_source_used, asset_type, option_type, strike_price, expiry_date, entry_price, stop_loss, target_price,
              holding_period, timestamp, generation_timestamp, exit_by, entry_valid_until, outcome_status, gen_conviction_score, gen_scoring_layers
         from trade_ideas where timestamp >= (now() - interval '45 days')::text and coalesce(archived,false) = false`)).rows.map(camel);
    await client.query('rollback');
    return { portfolios, positions, ideas };
  } finally {
    await client.end();
  }
}

function readCycleStamp(): unknown {
  const dir = process.env.SHARED_STATE_DIR || path.join(process.cwd(), '.cache', 'shared');
  for (const f of ['quant-bot-cycle.json', 'quant-bot-cycle']) {
    const p = path.join(dir, f);
    if (existsSync(p)) { try { const j = JSON.parse(readFileSync(p, 'utf8')); return j?.data ?? j; } catch { /* unreadable */ } }
  }
  return null;
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is required (read-only SELECTs)'); process.exit(2); }
  const db = await loadDb();
  const d = diagnose({ nowMs: Date.now(), ...db, lastCycle: readCycleStamp(), env: process.env });
  if (process.argv.includes('--json')) { console.log(JSON.stringify(d, null, 2)); return; }
  console.log(`BOT DIAGNOSE — ${d.at}`);
  console.log(`active run: ${d.activeRun ? `${d.activeRun.name} (${d.activeRun.id}, since ${d.activeRun.createdAt})` : 'NONE'}`);
  console.log(`capacity: 0DTE ${d.capacity['0dte'].held}/${d.capacity['0dte'].max} · swing ${d.capacity.swing.held}/${d.capacity.swing.max}`);
  for (const p of d.openPositions) console.log(`  ${p.symbol.padEnd(6)} ${p.sleeve.padEnd(5)} ${p.contract.padEnd(18)} entered ${p.entryTime} · mark ${p.markAgeMin ?? '—'} min · ${p.timeStopDue ? 'TIME STOP DUE' : 'in window'} (${p.why})`);
  console.log(`0DTE candidates today: ${d.zeroDte.candidates} ${JSON.stringify(d.zeroDte.verdicts)}`);
  for (const e of d.zeroDte.examples) console.log(`  ${e}`);
  console.log(`swing candidates today: ${d.swing.candidates} · ≥ grade ${d.swing.minGrade}: ${d.swing.atOrAbove}`);
  for (const e of d.swing.examples) console.log(`  ${e}`);
  console.log(`entries by day: ${JSON.stringify(d.entriesByDay)}`);
  console.log('\nFINDINGS');
  for (const f of d.findings) console.log(`  • ${f}`);
}

if (process.argv[1] && /bot-diagnose\.ts$/.test(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
