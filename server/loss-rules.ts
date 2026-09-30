/**
 * LOSS RULES — server wiring (I/O) for shared/loss-rules.ts.
 *
 *   applyLossRulesToNewIdea   rule 3 + 5 for EVERY new idea — called from the
 *                             single write point (DatabaseStorage.createTradeIdea):
 *                             caps T1 at the horizon's expected move, plans the
 *                             time stop, stamps convergenceSignalsJson.lossRules.
 *                             Never touches an existing row.
 *   botConfluenceGate         rule 1 for a bot candidate (DB peers + live tape).
 *   botEntryWindowGate        rule 2 for a bot candidate (5-minute bars on demand).
 *   noteBotSkip               every bot refusal → the blocked-trade ledger.
 *
 * Flags: shared/loss-rules.ts readLossRulesConfig (env, default ON).
 */
import { logger } from './logger';
import {
  LOSS_RULES_VERSION, assessConfluence, aggregateFlowRead, capTargetToExpectedMove, checkEntryWindow,
  etParts, horizonTradingDays, planTimeStop, readLossRulesConfig, realizedVolDaily,
  type ConfluenceResult, type EntryWindowResult, type EvidenceLayer, type LossRulesConfig, type LossRulesStamp,
} from '@shared/loss-rules';

let cached: { at: number; cfg: LossRulesConfig } | null = null;
/** Current flags (re-read from the environment at most once a minute). */
export function lossRulesConfig(): LossRulesConfig {
  if (!cached || Date.now() - cached.at > 60_000) cached = { at: Date.now(), cfg: readLossRulesConfig(process.env) };
  return cached.cfg;
}

/** Sources whose plans are the operator's own — never rewritten. */
const EXEMPT_SOURCES = new Set(['manual', 'user']);

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let t: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([p, new Promise<null>((res) => { t = setTimeout(() => res(null), ms); })]);
  } finally { if (t) clearTimeout(t); }
}

/**
 * Rule 3 (target cap + time stop) and rule 5 (version stamp) on a NEW idea,
 * before validation and insert. Returns the idea to write. Any failure leaves
 * the producer's plan untouched and records why in the stamp — a missing
 * candle read must never block publication or invent a level.
 */
export async function applyLossRulesToNewIdea<T extends Record<string, any>>(idea: T): Promise<T> {
  const cfg = lossRulesConfig();
  if (!cfg.targetCap && !cfg.timeStop) return idea;
  const source = String(idea.source ?? '').toLowerCase();
  if (EXEMPT_SOURCES.has(source)) return idea;
  // Crypto trades 24/7: the crypto engine (server/crypto-ideas-engine.ts) applies
  // the same cap on the CALENDAR clock (σ from Coinbase daily bars, calendar-day
  // horizon, wall-clock time stop) and stamps it. The stock path below would read
  // the equity ticker's candles (BTC is also an ETF symbol) and the RTH clock.
  if (String(idea.assetType ?? '').toLowerCase() === 'crypto' && (idea as any).convergenceSignalsJson?.lossRules?.version) return idea;

  const stamp: LossRulesStamp = { version: LOSS_RULES_VERSION, appliedAt: new Date().toISOString() };
  const out: Record<string, any> = { ...idea };
  const direction: 'long' | 'short' = String(idea.direction).toLowerCase() === 'short' ? 'short' : 'long';
  const entry = Number(idea.entryPrice); const target = Number(idea.targetPrice); const stop = Number(idea.stopLoss);
  const publishedMs = Date.parse(String(idea.timestamp ?? '')) || Date.now();
  const horizonDays = horizonTradingDays({ holdingPeriod: idea.holdingPeriod, expiryDate: idea.expiryDate, publishedMs });

  const finish = () => {
    const base = out.convergenceSignalsJson && typeof out.convergenceSignalsJson === 'object' ? out.convergenceSignalsJson : {};
    out.convergenceSignalsJson = { ...base, lossRules: stamp };
    return out as T;
  };

  if (!(entry > 0 && target > 0 && stop > 0)) { stamp.skipped = 'plan has no positive entry/target/stop'; return finish(); }

  let closes: number[] = []; let lastClose: number | null = null;
  try {
    const { fetchCandles } = await import('./historical-candles');
    const bars = (await withTimeout(fetchCandles(String(idea.symbol), '3mo', '1d'), 4000)) ?? [];
    // Completed sessions only: today's forming bar is not a realized return yet.
    const today = etParts(Date.now()).dateKey;
    const done = bars.filter((b) => etParts(b.time * 1000).dateKey < today);
    closes = done.map((b) => b.close);
    lastClose = closes.length ? closes[closes.length - 1] : null;
  } catch { /* handled below */ }

  // Levels priced as option premium (not the underlying) cannot be compared with
  // the stock's realized vol — leave them, and say so.
  if (!(lastClose && lastClose > 0)) { stamp.skipped = 'no daily bars for realized vol — plan unchanged'; return finish(); }
  if (Math.abs(entry / lastClose - 1) > 0.25) { stamp.skipped = `entry $${entry} is not on the underlying's scale (last close $${lastClose.toFixed(2)}) — premium-priced plan unchanged`; return finish(); }

  const sigma = realizedVolDaily(closes, 20);
  if (cfg.targetCap) {
    const cap = capTargetToExpectedMove({ direction, entry, target, stop, sigmaDaily: sigma, horizonDays, multiple: cfg.targetCapMultiple });
    stamp.targetCap = {
      applied: cap.capped, originalTarget: target, cappedTarget: cap.capped ? cap.target : null,
      expectedMove: cap.expectedMove, sigmaDaily: sigma, horizonDays, multiple: cfg.targetCapMultiple, note: cap.note,
    };
    if (cap.capped) {
      out.targetPrice = cap.target;
      out.riskRewardRatio = Math.round(cap.riskReward * 100) / 100;
      out.analysis = `${out.analysis ? `${out.analysis} ` : ''}${cap.note}.`;
      logger.info(`[LOSS-RULES] ${idea.symbol} ${idea.source}: ${cap.note}`);
    }
  }
  if (cfg.timeStop) {
    stamp.timeStop = planTimeStop(publishedMs, horizonDays, cfg.timeStopFraction, cfg.timeStopMinR);
    out.analysis = `${out.analysis ? `${out.analysis} ` : ''}Time stop: exit at ${stamp.timeStop.atIso} (${Math.round(cfg.timeStopFraction * 100)}% of a ${horizonDays}-trading-day horizon) unless ≥${cfg.timeStopMinR}R in profit.`;
  }
  return finish();
}

// ─── Bot gates ─────────────────────────────────────────────────────────────

/**
 * Rule 1 for one bot candidate. Peer ideas: every other non-archived idea on
 * the symbol that is still open or was published in the last 48h. Live tape:
 * today's flow prints for the symbol (scanner + Bullflow).
 */
export async function botConfluenceGate(pick: { symbol: string; direction: 'long' | 'short'; layers?: EvidenceLayer[]; source?: string }, idea: any): Promise<ConfluenceResult> {
  const cfg = lossRulesConfig();
  let peerIdeas: Array<{ source: string; direction: 'long' | 'short'; id: string }> = [];
  try {
    const { db } = await import('./db');
    const { sql } = await import('drizzle-orm');
    const since = new Date(Date.now() - 48 * 3_600_000).toISOString();
    const r: any = await db.execute(sql`
      select id, source, direction from trade_ideas
      where upper(symbol) = ${pick.symbol.toUpperCase()}
        and id <> ${String(idea?.id ?? pick.symbol)}
        and coalesce(archived, false) = false
        and (outcome_status = 'open' or timestamp >= ${since})`);
    peerIdeas = ((r.rows ?? r) as any[]).map((x) => ({ id: String(x.id), source: String(x.source), direction: String(x.direction).toLowerCase() === 'short' ? 'short' as const : 'long' as const }));
  } catch (err) {
    logger.debug(`[LOSS-RULES] peer lookup failed for ${pick.symbol}: ${(err as Error).message}`);
  }
  let flow = null;
  try {
    const { getTodayFlows } = await import('./options-flow-scanner');
    flow = aggregateFlowRead((getTodayFlows() as any[]).filter((f) => String(f.symbol).toUpperCase() === pick.symbol.toUpperCase()));
  } catch { /* tape cold — the other evidence still counts */ }
  const conv = idea?.convergenceSignalsJson?.signals;
  return assessConfluence({
    primarySource: idea?.source ?? pick.source,
    direction: pick.direction,
    layers: pick.layers ?? (Array.isArray(idea?.genScoringLayers) ? idea.genScoringLayers : null),
    convergenceSources: Array.isArray(conv) ? conv.map((s: any) => ({ source: String(s?.source ?? ''), direction: s?.direction ?? null })) : null,
    peerIdeas,
    flow,
    minIndependentSources: cfg.minIndependentSources,
  });
}

/** Rule 2 for one bot candidate. Intraday bars are fetched only when a next-session trigger must be proven. */
/**
 * Flow-led ideas (direction read from ask-vs-bid fills, source options_flow /
 * flow / bullflow_tape) — loss-rules-v1.1, operator 2026-09-30. On the bot's
 * own fills the single-source group (mostly flow) was PF 1.67 / +$4,235 (n=23)
 * while the ≥2-family group the confluence rule KEPT was PF 0.51 / −$4,132
 * (n=17); on desk ideas RTH-after-11:30 was PF 1.08 vs 0.85 inside. So flow-led
 * picks skip the confluence rule and may enter until 15:00 ET. Measuring —
 * LOSS_RULE_FLOW_EXEMPT=false restores v1.
 */
export function isFlowLed(source: unknown): boolean {
  return /flow|bullflow/i.test(String(source ?? ''));
}
export function flowExemptEnabled(): boolean {
  return process.env.LOSS_RULE_FLOW_EXEMPT !== 'false';
}
const FLOW_WINDOW_END_ET = 15 * 60;

export async function botEntryWindowGate(pick: { symbol: string; direction: 'long' | 'short'; entryPrice: number; currentPrice?: number | null; source?: string }, idea: any, nowMs = Date.now()): Promise<EntryWindowResult> {
  const base0 = lossRulesConfig();
  const cfg = flowExemptEnabled() && isFlowLed(idea?.source ?? pick.source)
    ? { ...base0, entryWindowEndEt: Math.max(base0.entryWindowEndEt, FLOW_WINDOW_END_ET) }
    : base0;
  const publishedAt = idea?.timestamp ?? idea?.generationTimestamp ?? null;
  const base = { nowMs, publishedAt, direction: pick.direction, entry: Number(pick.entryPrice), live: pick.currentPrice ?? null, cfg };
  const first = checkEntryWindow(base);
  if (first.ok || first.code !== 'no_session_bars') return first;
  try {
    const { fetchCandles } = await import('./historical-candles');
    const bars = (await withTimeout(fetchCandles(pick.symbol, '1d', '5m'), 5000)) ?? [];
    return checkEntryWindow({ ...base, bars });
  } catch {
    return first;
  }
}

/** Record a bot refusal in the blocked-trade ledger (Missed · Bot). Never throws. */
export function noteBotSkip(pick: any, code: string, reason: string): void {
  try {
    if (pick?.levelBasis === 'contract') return; // premium levels cannot be replayed on the underlying
    void import('./discipline-ledger').then(({ recordBotSkip }) => recordBotSkip({
      symbol: String(pick.symbol),
      direction: pick.direction === 'short' ? 'short' : 'long',
      entryPrice: Number(pick.entryPrice),
      stopLoss: Number(pick.stopLoss),
      targetPrice: Number(pick.targetPrice),
      reason,
      source: String(pick.source ?? 'unknown'),
      code,
      rulesVersion: LOSS_RULES_VERSION,
    })).catch(() => {});
  } catch { /* the ledger is evidence, never a reason to fail a cycle */ }
}
