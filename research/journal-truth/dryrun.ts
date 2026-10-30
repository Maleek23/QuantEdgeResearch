/**
 * DRY-RUN re-verification of the NEXUS ideas book and the NEXUS "Today" strip under the
 * ledger-audit 2026-10-15 fixes (research/ledger-audit-2026-10-15/REPORT.md).
 *
 * READ-ONLY. One `BEGIN TRANSACTION READ ONLY` SELECT, then ROLLBACK. Writes only its
 * --out JSON / --md summary. Inputs:
 *   --ledger <file>      the FIXED verifier's output (research/verify-nexus-book.ts --out …),
 *                        never the prod ledger
 *   --retro <file>       optional: a retro-options-convert --report (dry run) — the rule-picked
 *                        options view of legacy shares ideas, reported SEPARATELY
 *   --old-nexus-pnl <f>  optional: the pre-fix shared/nexus-pnl.ts, to recompute Today the old way
 *   --today YYYY-MM-DD   ET day for the Today strip (default: now)
 *
 *   set -a && . ./.env && set +a && npx tsx research/journal-truth/dryrun.ts --ledger /tmp/journal-truth/reverify.json \
 *     --retro /tmp/journal-truth/retro-dryrun2.json --old-nexus-pnl /tmp/journal-truth/old/nexus-pnl.ts \
 *     --out /tmp/journal-truth/reverify-dryrun.json --md /tmp/journal-truth/SUMMARY.md
 */
import fs from 'node:fs';
import pg from 'pg';
import { OUTCOME_BASELINE_DATE } from '../../shared/constants';
import { mapDeskIdea, verifyDeskRows, type DeskIdea, type DeskLedger, type DeskMapContext, type JournalWireRow } from '../../server/journal-row-maps';
import { ledgerEntryOf } from '../../server/desk-verify-ledger';
import { applyDeskView, type DeskViewRow } from '../../shared/desk-view';
import { HEADLINE_CLASSES, readRetroLedger, summarizeTruth, type RetroRecord } from '../../shared/journal-pnl-truth';
import { splitLegacySharesRows } from '../../shared/options-only';
import { resolvedToday, triggeredFromState } from '../../shared/nexus-resolved';
import { readBudgetContract } from '../../shared/budget-contract';
import { parsePeak } from '../../shared/option-peak';
import { summarizeDay, verificationOf } from '../../shared/nexus-pnl';
import { pickPnl } from '../../client/src/lib/nexus-pnl';
import { isLegacySharesIdea } from '../../shared/options-only';

const argv = process.argv.slice(2);
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const LEDGER = arg('--ledger');
const RETRO = arg('--retro') ?? null;
const OLD = arg('--old-nexus-pnl') ?? null;
const OUT = arg('--out') ?? '/tmp/journal-truth/reverify-dryrun.json';
const MD = arg('--md') ?? null;
const NOW = Date.now();
const etDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms));
const TODAY = arg('--today') ?? etDay(NOW);
const r2 = (x: number) => Math.round(x * 100) / 100;
const usd = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

async function loadIdeas(): Promise<any[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? '') ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '120s'");
    // The journal loader's columns (server/journal-sources.ts loadDesk) + what the Today route reads.
    const { rows } = await client.query(`
      SELECT id, symbol, asset_type, direction, entry_price, target_price, stop_loss, risk_reward_ratio, option_type, strike_price, expiry_date,
             entry_premium, exit_premium, option_percent_gain, exit_price, percent_gain, outcome_status, outcome_notes, resolution_reason, exit_date,
             timestamp, source, catalyst, gen_conviction_band, gen_conviction_score, gen_scoring_layers, generation_timestamp, holding_period, exit_by,
             json_build_object('planSnapshot', convergence_signals_json::jsonb -> 'planSnapshot', 'budgetContract', convergence_signals_json::jsonb -> 'budgetContract',
                               'executionAudit', convergence_signals_json::jsonb -> 'executionAudit') AS cs,
             convergence_signals_json::jsonb -> 'nexusGradeAtPublish' AS nexus_grade,
             substring(outcome_notes from '\\[exit-premium:(touch_bar|pass|withheld)\\]') AS exit_premium_basis,
             substring(outcome_notes from '\\[exit-time:([a-z_]+)\\]') AS exit_time_source,
             highest_price_reached, lowest_price_reached,
             convergence_signals_json->'executionAudit'->>'state' AS execution_state,
             data_source_used, session_context, quality_signals,
             CASE WHEN analysis ILIKE '%Underlying-only idea%' THEN 'Underlying-only idea' ELSE NULL END AS analysis
      FROM trade_ideas
      WHERE timestamp >= $1 AND status <> 'draft' AND (exclude_from_training = false OR exclude_from_training IS NULL)`, [OUTCOME_BASELINE_DATE]);
    return rows;
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}

const num = (x: unknown) => (x == null || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
const isoOf = (x: unknown) => (x == null ? null : x instanceof Date ? x.toISOString() : String(x));
function toIdea(x: any): DeskIdea {
  return {
    id: x.id, symbol: x.symbol, assetType: x.asset_type, direction: x.direction, entryPrice: Number(x.entry_price), targetPrice: num(x.target_price),
    stopLoss: num(x.stop_loss), riskRewardRatio: num(x.risk_reward_ratio), optionType: x.option_type, strikePrice: num(x.strike_price), expiryDate: isoOf(x.expiry_date),
    entryPremium: num(x.entry_premium), exitPremium: num(x.exit_premium), optionPercentGain: num(x.option_percent_gain), exitPrice: num(x.exit_price),
    percentGain: num(x.percent_gain), outcomeStatus: x.outcome_status, outcomeNotes: x.outcome_notes, resolutionReason: x.resolution_reason, exitDate: isoOf(x.exit_date),
    timestamp: isoOf(x.timestamp)!, source: x.source, catalyst: x.catalyst, genConvictionBand: x.gen_conviction_band, genConvictionScore: num(x.gen_conviction_score),
    genScoringLayers: x.gen_scoring_layers, generationTimestamp: isoOf(x.generation_timestamp), holdingPeriod: x.holding_period, exitBy: isoOf(x.exit_by),
    convergenceSignalsJson: x.cs, nexusGradeAtPublish: x.nexus_grade, exitPremiumBasis: x.exit_premium_basis, exitTimeSource: x.exit_time_source,
    highestPriceReached: num(x.highest_price_reached), lowestPriceReached: num(x.lowest_price_reached), executionState: x.execution_state,
    dataSourceUsed: x.data_source_used, sessionContext: x.session_context, qualitySignals: x.quality_signals, analysis: x.analysis,
  };
}

interface Agg { n: number; pnl: number; wins: number; losses: number }
const agg = (rows: { realizedPnL?: number | null }[]): Agg => {
  const a = { n: 0, pnl: 0, wins: 0, losses: 0 };
  for (const r of rows) { const v = r.realizedPnL ?? 0; a.n++; a.pnl = r2(a.pnl + v); if (v > 0.005) a.wins++; else if (v < -0.005) a.losses++; }
  return a;
};
const counted = (rows: JournalWireRow[]) => rows.filter((r) => r.status === 'closed' && r.verification?.status !== 'unverified' && HEADLINE_CLASSES.has(r.verification?.truth as any));
function groupBy(rows: JournalWireRow[], key: (r: JournalWireRow) => string) {
  const m = new Map<string, JournalWireRow[]>();
  for (const r of rows) { const k = key(r); m.set(k, [...(m.get(k) ?? []), r]); }
  return Object.fromEntries([...m.entries()].map(([k, v]) => [k, agg(v)]).sort((a, b) => Math.abs((b[1] as Agg).pnl) - Math.abs((a[1] as Agg).pnl)));
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  if (!LEDGER) throw new Error('--ledger <fixed verifier output> is required');
  const L = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  const byId = new Map<string, any>();
  for (const t of L.trades ?? []) { const e = ledgerEntryOf(t); if (e) byId.set(t.id, e); }
  const ledger: DeskLedger = { asOf: L.generatedAt, path: LEDGER, byId };
  const prints = new Map<string, any>(Object.entries(L.summary?.expiryPrints ?? {}));
  const ctx: DeskMapContext = { expiryPrint: (s, d) => prints.get(`${s}|${d}`) ?? null };
  const raw = await loadIdeas();
  const ideas = raw.map(toIdea);

  // ── the book, exactly as the fixed journal loader builds it ──
  const pairs: { idea: DeskIdea; row: JournalWireRow }[] = [];
  const excluded = new Map<string, number>();
  for (const i of ideas) {
    const m = mapDeskIdea(i, ctx);
    if ('row' in m) pairs.push({ idea: i, row: m.row }); else excluded.set(m.excluded.replace(/ — .*$/, ''), (excluded.get(m.excluded.replace(/ — .*$/, '')) ?? 0) + 1);
  }
  const retroAll: RetroRecord[] = RETRO ? (JSON.parse(fs.readFileSync(RETRO, 'utf8')).records ?? []) : [];
  const split = verifyDeskRows(pairs, ledger, null);
  const legacy = splitLegacySharesRows([...split.counted, ...split.unverified]);
  const rows = legacy.kept;
  for (const { reason } of legacy.excluded) excluded.set(reason, (excluded.get(reason) ?? 0) + 1);
  const unit = applyDeskView(rows as unknown as DeskViewRow[], { view: 'recorded', sizing: { mode: 'unit', riskDollars: 0 } });
  const b500 = applyDeskView(rows as unknown as DeskViewRow[], { view: 'recorded', sizing: { mode: 'risk', riskDollars: 500 } });
  const unitRows = unit.rows as unknown as JournalWireRow[];
  const b500Rows = b500.rows as unknown as JournalWireRow[];
  const head = (rs: JournalWireRow[]) => agg(counted(rs));
  const closed = rows.filter((r) => r.status === 'closed');
  // ── the last 10 sessions (ET exit days, weekdays up to TODAY) ──
  const exitDay = (r: JournalWireRow) => (r.exitTime ? etDay(Date.parse(r.exitTime)) : null);
  const weekday = (d: string) => { const w = new Date(`${d}T12:00:00Z`).getUTCDay(); return w !== 0 && w !== 6; };
  const sessions = [...new Set(closed.map(exitDay).filter((d): d is string => !!d && d <= TODAY && weekday(d)))].sort().slice(-10);
  const inLast10 = (rs: JournalWireRow[]) => counted(rs).filter((r) => { const d = exitDay(r); return d != null && sessions.includes(d); });
  const truthUnit = summarizeTruth(unitRows);
  const truth500 = summarizeTruth(b500Rows);

  // ── retro (shares → options) — reported separately, not in the "as published" headline ──
  const retroMap = new Map(retroAll.map((r) => [r.id, r]));
  const retroSplit = RETRO ? verifyDeskRows(pairs, ledger, readRetroLedger({ records: retroAll.map((r) => ({ ...r, v: r.v })) })) : null;
  const retroRows = retroSplit ? splitLegacySharesRows([...retroSplit.counted, ...retroSplit.unverified]).kept : [];
  const retro500 = retroSplit ? applyDeskView(retroRows as unknown as DeskViewRow[], { view: 'recorded', sizing: { mode: 'risk', riskDollars: 500 } }) : null;
  const retroOnly = (rs: JournalWireRow[]) => counted(rs).filter((r) => r.verification?.truth === 'retro');

  // ── verifier verdicts (options) ──
  const opt = (L.trades ?? []).filter((t: any) => t.assetType === 'option');
  const verdicts: Record<string, number> = {};
  for (const t of opt) { const k = t.verdict === 'MISMATCH' ? `MISMATCH:${t.bugClass}` : t.verdict; verdicts[k] = (verdicts[k] ?? 0) + 1; }

  // ── Today strip, old rule vs fixed rule ──
  const todayRaw = raw.filter((x) => x.exit_date && x.outcome_status && x.outcome_status !== 'open' && !['manual', 'user'].includes(String(x.source ?? '').toLowerCase()));
  const resolved = resolvedToday(todayRaw.map((x) => ({
    ideaId: x.id, symbol: x.symbol, direction: x.direction, assetType: x.asset_type, source: x.source, optionType: x.option_type, strikePrice: num(x.strike_price),
    expiryDate: isoOf(x.expiry_date), entryPrice: Number(x.entry_price), targetPrice: num(x.target_price), stopLoss: num(x.stop_loss), exitPrice: num(x.exit_price),
    entryPremium: num(x.entry_premium), exitPremium: num(x.exit_premium), percentGain: num(x.percent_gain), optionPercentGain: num(x.option_percent_gain),
    outcomeStatus: x.outcome_status, resolutionReason: x.resolution_reason, timestamp: isoOf(x.timestamp)!, exitDate: isoOf(x.exit_date)!,
    budgetContract: readBudgetContract(x.cs), peak: (() => { const p = parsePeak(x.outcome_notes); return p ? { premium: p.premium, atMs: p.atMs } : null; })(),
    executionState: x.execution_state,
  })) as any[], Date.parse(`${TODAY}T20:00:00Z`)).filter((r: any) => !isLegacySharesIdea(r));
  const pickOf = (r: any) => ({ ideaId: r.ideaId, symbol: r.symbol, assetType: r.assetType, optionType: r.optionType, strikePrice: r.strikePrice, expiryDate: r.expiryDate, entryPremium: r.entryPremium, budgetContract: r.budgetContract ?? null });
  const recOf = (r: any) => ({ outcomeStatus: r.outcomeStatus, resolutionReason: r.resolutionReason, exitPremium: r.exitPremium, exitDate: r.exitDate, optionPercentGain: r.optionPercentGain, peak: r.peak ?? null });
  const today: any = { day: TODAY, resolvedRows: resolved.length };
  for (const budget of [500, 1000]) {
    const fresh = resolved.map((r: any) => ({ id: r.ideaId, symbol: r.symbol, pnl: pickPnl(pickOf(r), budget, null, {
      ...recOf(r), verification: verificationOf(byId.get(r.ideaId) ?? null, ledger.asOf), triggered: triggeredFromState(r.executionState),
    }, NOW) }));
    const s = summarizeDay(fresh);
    today[`new${budget}`] = { realized: s.realized, wins: s.wins, losses: s.losses, checking: s.checking, checkingRecordedPnl: s.checkingRecordedPnl, neverTriggered: s.neverTriggered, overBudget: s.overBudget, corrected: s.corrected, unpriced: s.unpriced, best: s.best, worst: s.worst };
    if (budget === 500) today.rows = fresh.map((x) => ({ id: x.id, symbol: x.symbol, pnl: x.pnl.pnl, checking: x.pnl.checking, recorded: x.pnl.recordedPnl, neverTriggered: x.pnl.neverTriggered, qty: x.pnl.tradable?.qty ?? null, overBudget: !!x.pnl.tradable?.overBudget, reason: x.pnl.reason, verdict: byId.get(x.id)?.verdict ?? 'not in ledger', bug: byId.get(x.id)?.bugClass ?? null }));
    if (OLD) {
      // The pre-fix rule (client/src/lib/nexus-pnl.ts pickPnl before 2026-10-15): recorded exit on the tradable
      // contract (primary if it fits, else the budget contract's tracked exit), no verification, no trigger check.
      const old = await import(OLD);
      const oldRows = resolved.map((r: any) => {
        const tr = old.tradableContract({ ...pickOf(r), zeroDte: String(r.expiryDate ?? '').slice(0, 10) === TODAY }, budget);
        const reason = String(r.resolutionReason ?? '');
        const state = reason.startsWith('missed_entry') || reason.startsWith('superseded') ? 'waiting' : 'resolved';
        let exit: any = null;
        if (tr.ok && tr.basis === 'budget') { const bx = old.budgetExitPremium(r.budgetContract); if (bx) exit = { premium: bx.premium, atMs: bx.atMs }; }
        else if (tr.ok) { const ep = r.exitPremium ?? (r.optionPercentGain != null && tr.entryPremium > 0 ? Math.round(tr.entryPremium * (1 + r.optionPercentGain / 100) * 100) / 100 : null); if (ep != null) exit = { premium: ep, atMs: null }; }
        return { id: r.ideaId, symbol: r.symbol, pnl: old.nexusPnl({ state, tradable: tr, exit, nowMs: NOW }) };
      });
      const so = old.summarizeDay(oldRows);
      today[`old${budget}`] = { realized: so.realized, wins: so.wins, losses: so.losses, unpriced: so.unpriced, best: so.best, worst: so.worst };
    }
  }

  const out = {
    generatedAt: new Date(NOW).toISOString(),
    readOnly: 'one READ ONLY transaction (rolled back); market data from the fixed verifier output; nothing written to the database or prod ledger files',
    inputs: { ledger: LEDGER, ledgerGeneratedAt: L.generatedAt, retro: RETRO, since: OUTCOME_BASELINE_DATE, ideas: ideas.length },
    verifier: { optionTrades: opt.length, verdicts, summaryCounts: L.summary?.counts, mismatchByBugClass: L.summary?.mismatchByBugClass },
    book: {
      scoredRows: pairs.length, closedRows: closed.length,
      headline: { unit: head(unitRows), budget500: head(b500Rows) },
      truthUnit, truth500,
      b500View: { overBudget: b500.overBudget, subDime: b500.subDime, review: b500.review, skipped: b500.skipped },
      byCategory: { unit: truthUnit.byClass, budget500: truth500.byClass },
      zeroDteVsSwing: {
        unit: groupBy(counted(unitRows), (r) => (r.zeroDte ? '0DTE' : 'swing')),
        budget500: groupBy(counted(b500Rows), (r) => (r.zeroDte ? '0DTE' : 'swing')),
      },
      last10Sessions: {
        sessions,
        unit: agg(inLast10(unitRows)), budget500: agg(inLast10(b500Rows)),
        zeroDteVsSwing: { unit: groupBy(inLast10(unitRows), (r) => (r.zeroDte ? '0DTE' : 'swing')), budget500: groupBy(inLast10(b500Rows), (r) => (r.zeroDte ? '0DTE' : 'swing')) },
        byDay: { budget500: groupBy(inLast10(b500Rows), (r) => exitDay(r) ?? '?') },
      },
      byEngine: { unit: groupBy(counted(unitRows), (r) => r.setupType ?? 'unknown'), budget500: groupBy(counted(b500Rows), (r) => r.setupType ?? 'unknown') },
      excluded: Object.fromEntries([...excluded.entries()].sort((a, b) => b[1] - a[1])),
    },
    retroOptionsView: retroSplit ? {
      records: retroAll.length, verified: retroAll.filter((r) => r.status === 'verified').length,
      inBook: { unit: agg(retroOnly(applyDeskView(retroRows as unknown as DeskViewRow[], { view: 'recorded', sizing: { mode: 'unit', riskDollars: 0 } }).rows as unknown as JournalWireRow[])), budget500: agg(retroOnly(retro500!.rows as unknown as JournalWireRow[])) },
      note: 'rule-picked options view of legacy shares ideas (dry run, not written) — NOT in the as-published headline above',
    } : null,
    today,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`wrote ${OUT}`);
  console.log(`headline unit n=${out.book.headline.unit.n} ${usd(out.book.headline.unit.pnl)} · $500 n=${out.book.headline.budget500.n} ${usd(out.book.headline.budget500.pnl)}`);
  console.log(`today ${TODAY}: new $500 realized ${usd(today.new500.realized)} (${today.new500.wins}W/${today.new500.losses}L, ${today.new500.checking} checking ${usd(today.new500.checkingRecordedPnl)})${today.old500 ? ` · old rule ${usd(today.old500.realized)} (${today.old500.wins}W/${today.old500.losses}L)` : ''}`);
  if (MD) fs.writeFileSync(MD, `generated ${out.generatedAt}\n\n\`\`\`json\n${JSON.stringify({ headline: out.book.headline, today: { old500: today.old500, new500: today.new500 } }, null, 1)}\n\`\`\`\n`);
  void retroMap;
}

main().catch((e) => { console.error(e); process.exit(1); });
