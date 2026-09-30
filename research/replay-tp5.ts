/**
 * REPLAY TP5 — HYPOTHETICAL exit-rule replay of every triggered idea since
 * OUTCOME_BASELINE_DATE (2026-08-26).
 * ============================================================================
 * Question (operator, 2026-09-30): "any NEXUS play that triggered and then ran
 * 5–10% should count as a win". We do not redefine the win. We ask the honest
 * version instead: had the plan TAKEN profit at +5%, what would the record be?
 *
 * PRE-REGISTERED VARIANTS (fixed before any data was read; see shared/run-up.ts):
 *   actual  plan as published: T1 / stop / horizon close, replayed on the same bars
 *   A       full exit at +5% on the underlying (T1 replaced), stop unchanged
 *   B       full exit at the nearer of +5% or 1R (T1 replaced), stop unchanged
 *   C       half at +5%, stop on the rest to breakeven; rest exits at T1 / BE / horizon
 * Fill rules: stop fills at the stop or a worse gap open; take-profits fill at the
 * level (never a better gap); stop + take-profit in one bar = stop.
 * Horizon: exit_by when stored, else horizonTradingDays(holding period, expiry)
 * sessions counted from the trigger session. Regular-session bars only (crypto 24h).
 * Options ideas are evaluated on the UNDERLYING; option P&L differs (theta, IV, delta).
 * Walk-forward: the period is split at the calendar midpoint of trigger times.
 *
 * Every number this prints is HYPOTHETICAL — a replay of exit rules that were not
 * in force. The strict record (shared/model-record.ts) is unchanged by it.
 *
 * READ-ONLY. The DB session is opened with default_transaction_read_only=on and
 * the one SELECT runs inside BEGIN READ ONLY.
 *
 * Run:
 *   npx tsx research/replay-tp5.ts --db-url "$DATABASE_URL"          # or DATABASE_URL in env
 *       [--out docs/REPLAY_TP5_2026-09-30.md] [--json research/replay-tp5-results.json]
 *   npx tsx research/replay-tp5.ts --fixtures research/fixtures/replay-tp5.fixture.json [--out path]
 *     (fixture mode prints to stdout unless --out is given, so synthetic numbers can
 *      never overwrite the real report by accident)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OUTCOME_BASELINE_DATE, classifyOutcomeV2, realisedR } from '../shared/constants';
import { etParts, horizonTradingDays } from '../shared/loss-rules';
import {
  EXIT_VARIANTS, computeRunUp, exitStats, inRunUpPopulation, resolveTrigger, simulateExit, thresholdHit, underlyingDirection,
  type ExitResult, type ExitStats, type ExitVariant, type RunUpBar, type RunUpIdea,
} from '../shared/run-up';

export interface ReplayIdea extends RunUpIdea {
  targetPrice: number;
  holdingPeriod?: string | null;
  expiryDate?: string | null;
  exitBy?: string | null;
  source?: string | null;
  percentGain?: number | null;
  optionPercentGain?: number | null;
  riskRewardRatio?: number | null;
}

export type BarSource = (symbol: string, crypto: boolean, fromMs: number) => Promise<RunUpBar[]>;

export interface IdeaReplay {
  id: string; symbol: string; assetType: string; source: string; direction: 'long' | 'short';
  triggerMs: number; triggerSource: 'audit' | 'bars';
  mfePct: number | null; reached3: boolean; reached5: boolean; reached10: boolean;
  exits: Record<ExitVariant, ExitResult>;
  recorded: { outcome: string; r: number | null };
}

export interface ReplayReport {
  since: string; generatedAt: string; mode: 'db' | 'fixtures';
  population: number; triggered: number; notTriggered: number; noBars: number; options: number;
  splitMs: number | null;
  rows: IdeaReplay[];
  variants: Record<ExitVariant, { all: ExitStats; first: ExitStats; second: ExitStats }>;
  recorded: { all: RecordedStats; first: RecordedStats; second: RecordedStats };
  runUp: { triggered: number; reached3: number; reached5: number; reached10: number };
}

interface RecordedStats { n: number; wins: number; winRate: number | null; expectancyR: number | null; rN: number }

const VARIANTS: ExitVariant[] = ['actual', 'A', 'B', 'C'];
const ms = (s?: string | null) => (s ? Date.parse(s) : NaN);
const etDay = (t: number) => { const p = etParts(t); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };

/** Horizon end (exclusive) and whether the bars cover it. */
export function horizonFor(i: ReplayIdea, triggerMs: number, bars: RunUpBar[], nowMs: number): { endMs: number; complete: boolean } {
  const exitBy = ms(i.exitBy);
  const lastBar = bars.length ? bars[bars.length - 1].t : -Infinity;
  if (Number.isFinite(exitBy) && exitBy > triggerMs) return { endMs: exitBy, complete: nowMs > exitBy && lastBar > triggerMs };
  const nSess = horizonTradingDays({ holdingPeriod: i.holdingPeriod, expiryDate: i.expiryDate, publishedMs: ms(i.timestamp) });
  const after = bars.filter((b) => b.t >= triggerMs);
  const days: string[] = [];
  for (const b of after) { const d = etDay(b.t); if (days[days.length - 1] !== d) days.push(d); }
  if (days.length > nSess) { const firstOut = after.find((b) => etDay(b.t) === days[nSess]); return { endMs: firstOut!.t, complete: true }; }
  const lastDayDone = days.length === nSess && days[days.length - 1] < etDay(nowMs);
  return { endMs: lastDayDone ? lastBar + 1 : Infinity, complete: lastDayDone };
}

function recordedStats(rows: IdeaReplay[]): RecordedStats {
  const decided = rows.filter((r) => r.recorded.outcome === 'win' || r.recorded.outcome === 'loss');
  const wins = decided.filter((r) => r.recorded.outcome === 'win').length;
  const rs = rows.map((r) => r.recorded.r).filter((x): x is number => x != null);
  return {
    n: decided.length, wins,
    winRate: decided.length ? Math.round((wins / decided.length) * 1000) / 10 : null,
    expectancyR: rs.length ? Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 1000) / 1000 : null,
    rN: rs.length,
  };
}

export async function runReplay(ideas: ReplayIdea[], getBars: BarSource, opts: { mode: 'db' | 'fixtures'; nowMs?: number; since?: string } = { mode: 'db' }): Promise<ReplayReport> {
  const now = opts.nowMs ?? Date.now();
  const since = opts.since ?? OUTCOME_BASELINE_DATE;
  const pop = ideas.filter((i) => inRunUpPopulation(i, since) && i.targetPrice > 0);
  const rows: IdeaReplay[] = [];
  let notTriggered = 0; let noBars = 0;
  for (const i of pop) {
    const crypto = i.assetType === 'crypto';
    const auditTrig = resolveTrigger(i, [], now);
    const bars = (await getBars(i.symbol, crypto, auditTrig?.ms ?? ms(i.timestamp))).slice().sort((a, b) => a.t - b.t);
    if (!bars.length) { noBars++; continue; }
    const closedAt = (i.outcomeStatus ?? 'open') !== 'open' ? ms(i.exitDate) : NaN;
    const trig = auditTrig ?? resolveTrigger(i, bars, Number.isFinite(closedAt) ? closedAt + 1 : now);
    if (!trig) { notTriggered++; continue; }
    const direction = underlyingDirection(i.direction);
    const hz = horizonFor(i, trig.ms, bars, now);
    const ru = computeRunUp({ direction, entry: i.entryPrice, stop: i.stopLoss, triggerMs: trig.ms, endMs: Math.min(hz.endMs, now + 1), bars });
    if (ru.barsUsed === 0) { noBars++; continue; }
    const exits = {} as Record<ExitVariant, ExitResult>;
    for (const v of VARIANTS) {
      exits[v] = simulateExit(v, { direction, entry: i.entryPrice, stop: i.stopLoss, target: i.targetPrice, triggerMs: trig.ms, horizonEndMs: hz.endMs, horizonComplete: hz.complete, bars });
    }
    rows.push({
      id: i.id, symbol: i.symbol, assetType: i.assetType ?? 'stock', source: i.source ?? '?', direction,
      triggerMs: trig.ms, triggerSource: trig.source,
      mfePct: ru.mfePct, reached3: thresholdHit(ru, 3), reached5: thresholdHit(ru, 5), reached10: thresholdHit(ru, 10),
      exits,
      recorded: { outcome: classifyOutcomeV2(i as never), r: realisedR(i as never) },
    });
  }
  rows.sort((a, b) => a.triggerMs - b.triggerMs);
  const splitMs = rows.length ? (rows[0].triggerMs + rows[rows.length - 1].triggerMs) / 2 : null;
  const first = rows.filter((r) => splitMs != null && r.triggerMs <= splitMs);
  const second = rows.filter((r) => splitMs != null && r.triggerMs > splitMs);
  const variants = {} as ReplayReport['variants'];
  for (const v of VARIANTS) {
    variants[v] = { all: exitStats(rows.map((r) => r.exits[v])), first: exitStats(first.map((r) => r.exits[v])), second: exitStats(second.map((r) => r.exits[v])) };
  }
  return {
    since, generatedAt: new Date(now).toISOString(), mode: opts.mode,
    population: pop.length, triggered: rows.length, notTriggered, noBars,
    options: rows.filter((r) => r.assetType === 'option').length,
    splitMs, rows, variants,
    recorded: { all: recordedStats(rows), first: recordedStats(first), second: recordedStats(second) },
    runUp: { triggered: rows.length, reached3: rows.filter((r) => r.reached3).length, reached5: rows.filter((r) => r.reached5).length, reached10: rows.filter((r) => r.reached10).length },
  };
}

// ── report ────────────────────────────────────────────────────────────────
const f = (x: number | null | undefined, d = 2, sign = false) =>
  x == null ? '—' : !Number.isFinite(x) ? '∞' : `${sign && x > 0 ? '+' : ''}${x.toFixed(d)}`;
const pctOf = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');

export function renderReport(r: ReplayReport): string {
  const date = r.generatedAt.slice(0, 10);
  const row = (name: string, s: ExitStats) =>
    `| ${name} | ${s.n} | ${s.open} | ${f(s.winRate, 1)}% | ${f(s.avgR, 3, true)} | ${f(s.avgPct, 2, true)}% | ${f(s.expectancyR, 3, true)} | ${f(s.profitFactor, 2)} |`;
  const head = '| Variant | n closed | open | Win rate | Avg R | Avg % (underlying) | Expectancy R | Profit factor |\n|---|---|---|---|---|---|---|---|';
  const recRow = (name: string, s: RecordedStats) => `| ${name} | ${s.n} | ${f(s.winRate, 1)}% | ${f(s.expectancyR, 3, true)} (n=${s.rN}) |`;
  const split = r.splitMs != null ? new Date(r.splitMs).toISOString().slice(0, 10) : '—';
  const lines = [
    `# Replay TP5 — ${date}`,
    '',
    '> **HYPOTHETICAL.** Every variant below replays exit rules that were NOT in force when these ideas were published. ' +
      'Nothing here changes the strict record (shared/model-record.ts, outcome v2). ' +
      (r.mode === 'fixtures' ? '**FIXTURE RUN — synthetic bars and ideas, not platform data.**' : 'Source: production trade_ideas (read-only) + Yahoo bars.'),
    '',
    `Population: published ideas since ${r.since}, excluded/synthetic/premium-scale/missed-entry rows removed (same rule as the run-up metric). ` +
      `${r.population} in population → **${r.triggered} triggered** with bars · ${r.notTriggered} never traded after publish · ${r.noBars} no bars. ` +
      `${r.options} of the triggered are options ideas, evaluated on the UNDERLYING — option P&L differs (theta, IV, delta), so their R here is not contract R.`,
    '',
    '## Pre-registered variants',
    '',
    ...(Object.keys(EXIT_VARIANTS) as ExitVariant[]).map((k) => `- **${k}** — ${EXIT_VARIANTS[k]}`),
    '',
    'Fills: stop at the stop or a worse gap open; take-profits at the level; stop and take-profit in one bar = stop. ' +
      'R = underlying move ÷ |entry − stop|. Horizon: exit_by when stored, else horizonTradingDays sessions from the trigger session. ' +
      '"open" = horizon not yet complete; excluded from the stats.',
    '',
    '## Run-up after trigger (not a win)',
    '',
    `| Reached before stop | n | share of triggered |\n|---|---|---|\n| +3% | ${r.runUp.reached3} | ${pctOf(r.runUp.reached3, r.triggered)} |\n| +5% | ${r.runUp.reached5} | ${pctOf(r.runUp.reached5, r.triggered)} |\n| +10% | ${r.runUp.reached10} | ${pctOf(r.runUp.reached10, r.triggered)} |`,
    '',
    '## All triggered ideas',
    '',
    head,
    ...VARIANTS.map((v) => row(v === 'actual' ? 'actual (replayed plan)' : v, r.variants[v].all)),
    '',
    'Recorded outcome for the same ideas (classifyOutcomeV2 / realisedR — options on CONTRACT premium, R = P&L ÷ 50% premium):',
    '',
    '| Set | decided | Win rate | Expectancy R |\n|---|---|---|---|',
    recRow('recorded, all', r.recorded.all),
    '',
    `## Walk-forward halves (split at ${split}, calendar midpoint of trigger times)`,
    '',
    '### First half',
    '',
    head,
    ...VARIANTS.map((v) => row(v === 'actual' ? 'actual (replayed plan)' : v, r.variants[v].first)),
    '',
    '### Second half',
    '',
    head,
    ...VARIANTS.map((v) => row(v === 'actual' ? 'actual (replayed plan)' : v, r.variants[v].second)),
    '',
    '| Recorded | decided | Win rate | Expectancy R |\n|---|---|---|---|',
    recRow('first half', r.recorded.first),
    recRow('second half', r.recorded.second),
    '',
    '## Reading it',
    '',
    '- A variant only counts as an improvement if it beats "actual (replayed plan)" on expectancy in BOTH halves; a one-half win is a regime artifact until proven (Signal Lab walk-forward law).',
    '- Win rate alone is not the test: taking profit earlier raises win rate almost mechanically. Expectancy R and profit factor decide.',
    '- Small n: treat any half with n < 30 as descriptive only.',
    '',
  ];
  return lines.join('\n');
}

// ── IO ────────────────────────────────────────────────────────────────────
const YSYM: Record<string, string> = { SPX: '^GSPC', NDX: '^NDX', RUT: '^RUT', VIX: '^VIX', XSP: '^XSP', DJX: '^DJI' };
const yahooCache = new Map<string, Promise<RunUpBar[]>>();
export const yahooBars: BarSource = (symbol, crypto, fromMs) => {
  const ys = YSYM[symbol] ?? (crypto ? `${symbol}-USD` : symbol);
  const fine = Date.now() - fromMs < 57 * 86_400_000;
  const key = `${ys}:${fine ? '5m' : '1h'}`;
  if (!yahooCache.has(key)) yahooCache.set(key, (async () => {
    const p2 = Math.floor(Date.now() / 1000), p1 = p2 - (fine ? 59 : 700) * 86400;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ys)}?period1=${p1}&period2=${p2}&interval=${fine ? '5m' : '1h'}&includePrePost=false`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (r.status === 429) { await new Promise((s) => setTimeout(s, 2000 * (attempt + 1))); continue; }
        const j: any = await r.json(); const res = j?.chart?.result?.[0]; if (!res) return [];
        const q = res.indicators.quote[0];
        return (res.timestamp as number[]).map((t, i) => ({ t: t * 1000, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i] }))
          .filter((b) => b.open != null && b.high != null && b.low != null && b.close != null)
          .filter((b) => crypto || (() => { const m = etParts(b.t).minutes; return m >= 570 && m < 960; })());
      } catch { await new Promise((s) => setTimeout(s, 1000)); }
    }
    return [];
  })());
  return yahooCache.get(key)!;
};

async function loadFromDb(url: string, since: string): Promise<ReplayIdea[]> {
  const pg = (await import('pg')).default;
  const c = new pg.Client({ connectionString: url, options: '-c default_transaction_read_only=on' });
  await c.connect();
  try {
    await c.query('BEGIN READ ONLY');
    const { rows } = await c.query(
      `SELECT id, symbol, asset_type, direction, holding_period, entry_price, target_price, stop_loss, strike_price, expiry_date,
              timestamp, entry_valid_until, exit_by, exit_date, outcome_status, resolution_reason, percent_gain, option_percent_gain,
              risk_reward_ratio, exclude_from_training, data_source_used, source, convergence_signals_json
         FROM trade_ideas
        WHERE timestamp >= $1 AND COALESCE(status, 'published') <> 'draft'`,
      // text column: a day early lexicographically; inRunUpPopulation applies the exact instant
      [new Date(Date.parse(`${since}T00:00:00-04:00`) - 86_400_000).toISOString().slice(0, 10)],
    );
    await c.query('ROLLBACK');
    return rows.map((x: any) => ({
      id: x.id, symbol: x.symbol, assetType: x.asset_type, direction: x.direction, holdingPeriod: x.holding_period,
      entryPrice: Number(x.entry_price), targetPrice: Number(x.target_price), stopLoss: Number(x.stop_loss),
      strikePrice: x.strike_price == null ? null : Number(x.strike_price), expiryDate: x.expiry_date,
      timestamp: x.timestamp, entryValidUntil: x.entry_valid_until, exitBy: x.exit_by, exitDate: x.exit_date,
      outcomeStatus: x.outcome_status, resolutionReason: x.resolution_reason,
      percentGain: x.percent_gain == null ? null : Number(x.percent_gain),
      optionPercentGain: x.option_percent_gain == null ? null : Number(x.option_percent_gain),
      riskRewardRatio: x.risk_reward_ratio == null ? null : Number(x.risk_reward_ratio),
      excludeFromTraining: x.exclude_from_training, dataSourceUsed: x.data_source_used, source: x.source,
      convergenceSignalsJson: x.convergence_signals_json,
    }));
  } finally { await c.end(); }
}

export function loadFixtures(file: string): { ideas: ReplayIdea[]; getBars: BarSource; nowMs?: number } {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const bars: Record<string, RunUpBar[]> = j.bars ?? {};
  return { ideas: j.ideas, getBars: async (s) => bars[s] ?? [], nowMs: j.now ? Date.parse(j.now) : undefined };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const fixtures = arg('--fixtures');
  const out = arg('--out');
  const jsonOut = arg('--json');
  let report: ReplayReport;
  if (fixtures) {
    const fx = loadFixtures(fixtures);
    report = await runReplay(fx.ideas, fx.getBars, { mode: 'fixtures', nowMs: fx.nowMs });
  } else {
    const url = arg('--db-url') ?? process.env.DATABASE_URL;
    if (!url) { console.error('need --db-url <url> (or DATABASE_URL) or --fixtures <file>'); process.exit(2); }
    const ideas = await loadFromDb(url, OUTCOME_BASELINE_DATE);
    console.error(`[replay-tp5] ${ideas.length} ideas since ${OUTCOME_BASELINE_DATE}; fetching bars…`);
    report = await runReplay(ideas, yahooBars, { mode: 'db' });
  }
  const md = renderReport(report);
  const target = out ?? (fixtures ? null : 'docs/REPLAY_TP5_2026-09-30.md');
  if (target) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, md); console.error(`[replay-tp5] wrote ${target}`); }
  else process.stdout.write(md);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
