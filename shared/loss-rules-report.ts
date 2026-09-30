/**
 * LOSS RULES REPORT — pure core (no I/O).
 *
 * Two questions, kept apart and labelled:
 *   1. BEFORE vs AFTER (measured): closed trades grouped by the rule-set version
 *      stamped on them at creation (null = produced before the rules shipped).
 *   2. COUNTERFACTUAL (hypothetical): for every historical trade, would each rule
 *      have filtered or changed it — and what did the trades in each group
 *      actually do (n, win %, profit factor, net)? This reports the realised
 *      outcome of the group, never a simulated outcome for a trade the rules
 *      would have changed (a capped target or a different contract cannot be
 *      replayed from these rows).
 *
 * Inputs are plain rows so the server helper (DB) and the research script (a
 * JSON export) feed the same function. Consumed by GET /api/journal/loss-rules
 * and research/loss-rules-report.ts.
 */
import {
  DEFAULT_LOSS_RULES_CONFIG, LOSS_RULES_TAG, LOSS_RULES_VERSION, assessConfluence, etParts, expectedMove,
  horizonTradingDays, isRegularSession, realizedVolDaily,
  type EvidenceLayer, type LossRulesConfig,
} from './loss-rules';

export interface ReportTrade {
  id: string;
  symbol: string;
  /** Publishing engine of the idea behind the trade. */
  source: string | null;
  /** Thesis side on the underlying. */
  thesis: 'long' | 'short';
  assetType: string;
  /** Fill time (bot) or publish time (desk), ISO. */
  entryTime: string;
  /** When the idea was published, ISO. */
  publishedAt: string | null;
  pnl: number;
  holdingPeriod: string | null;
  expiryDate: string | null;
  /** Underlying plan at publish (for the target-cap check). */
  entry: number | null;
  target: number | null;
  stop: number | null;
  layers: EvidenceLayer[] | null;
  convergenceSources: Array<{ source: string; direction?: string | null }> | null;
  /** Rule-set version stamped at creation (null = before the rules). */
  rulesVersion: string | null;
  ideaId: string | null;
}

export interface PeerIdeaRow { id: string; symbol: string; source: string | null; direction: 'long' | 'short'; publishedMs: number; closedMs: number | null }

export interface GroupStats {
  n: number; wins: number; losses: number;
  winRate: number | null; profitFactor: number | null; net: number; avg: number | null;
  lowSample: boolean;
}

export function groupStats(pnls: number[]): GroupStats {
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const gw = wins.reduce((a, b) => a + b, 0);
  const gl = Math.abs(losses.reduce((a, b) => a + b, 0));
  const net = pnls.reduce((a, b) => a + b, 0);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    n: pnls.length,
    wins: wins.length,
    losses: losses.length,
    winRate: pnls.length ? r2((wins.length / pnls.length) * 100) : null,
    profitFactor: gl > 0 ? r2(gw / gl) : null,
    net: r2(net),
    avg: pnls.length ? r2(net / pnls.length) : null,
    lowSample: pnls.length < 20,
  };
}

export type ConfluenceClass = 'pass' | 'fail';
export type WindowClass = 'in_window' | 'outside_window' | 'outside_rth';
export type DteClass = 'fit' | 'misfit' | 'n/a';
export type CapClass = 'within' | 'would_cap' | 'unknown';

export interface TradeClassification {
  id: string;
  confluence: ConfluenceClass;
  families: string[];
  window: WindowClass;
  dte: DteClass;
  dteAtEntry: number | null;
  cap: CapClass;
  /** Filtered by the bot entry rules (confluence fail OR outside the window / stale close). */
  botFiltered: boolean;
}

const dayNum = (iso: string) => Math.round(Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) / 864e5);

export function classifyTrade(
  t: ReportTrade,
  peers: PeerIdeaRow[],
  closesBySymbol: Map<string, Array<{ time: number; close: number }>> | null,
  cfg: LossRulesConfig = DEFAULT_LOSS_RULES_CONFIG,
): TradeClassification {
  const entryMs = Date.parse(t.entryTime);
  // Peers: other ideas on the symbol, same side, published ≤48h before entry or still open at entry.
  const peerRefs = peers
    .filter((p) => p.symbol === t.symbol && p.id !== t.ideaId && p.direction === t.thesis && p.publishedMs <= entryMs &&
      (entryMs - p.publishedMs <= 48 * 3_600_000 || (p.closedMs == null || p.closedMs > entryMs)))
    .map((p) => ({ source: p.source, direction: p.direction }));
  const conf = assessConfluence({
    primarySource: t.source, direction: t.thesis, layers: t.layers, convergenceSources: t.convergenceSources,
    peerIdeas: peerRefs, flow: null, minIndependentSources: cfg.minIndependentSources,
  });

  const et = etParts(entryMs);
  const window: WindowClass = !isRegularSession(entryMs) ? 'outside_rth'
    : et.minutes >= cfg.entryWindowStartEt && et.minutes < cfg.entryWindowEndEt ? 'in_window' : 'outside_window';

  let dte: DteClass = 'n/a'; let dteAtEntry: number | null = null;
  if (/option/i.test(t.assetType) && t.expiryDate && /^\d{4}-\d{2}-\d{2}/.test(t.expiryDate)) {
    dteAtEntry = dayNum(t.expiryDate) - dayNum(et.dateKey);
    const hold = horizonTradingDays({ holdingPeriod: t.holdingPeriod });
    dte = hold >= cfg.multiDayHoldDays
      ? (dteAtEntry >= cfg.multiDayDteMin && dteAtEntry <= cfg.multiDayDteMax ? 'fit' : 'misfit')
      : 'fit';
  }

  let cap: CapClass = 'unknown';
  const bars = closesBySymbol?.get(t.symbol);
  const pubMs = Date.parse(String(t.publishedAt ?? t.entryTime));
  if (bars && bars.length && t.entry && t.target && t.entry > 0) {
    const pubDay = etParts(pubMs).dateKey;
    const before = bars.filter((b) => etParts(b.time * 1000).dateKey < pubDay).map((b) => b.close);
    const last = before[before.length - 1];
    const sigma = realizedVolDaily(before, 20);
    if (sigma && last && Math.abs(t.entry / last - 1) <= 0.25) {
      const days = horizonTradingDays({ holdingPeriod: t.holdingPeriod, expiryDate: t.expiryDate, publishedMs: pubMs });
      const em = expectedMove(t.entry, sigma, days) * cfg.targetCapMultiple;
      cap = Math.abs(t.target - t.entry) > em ? 'would_cap' : 'within';
    }
  }

  return {
    id: t.id, confluence: conf.passed ? 'pass' : 'fail', families: conf.families,
    window, dte, dteAtEntry, cap,
    botFiltered: !conf.passed || window !== 'in_window',
  };
}

export interface LossRulesReport {
  journal: 'desk' | 'bot';
  asOf: string;
  rulesVersion: string;
  config: LossRulesConfig;
  basis: string;
  measured: {
    label: string;
    before: GroupStats;
    after: GroupStats;
    byVersion: Record<string, GroupStats>;
  };
  counterfactual: {
    hypothetical: true;
    label: string;
    all: GroupStats;
    rules: Array<{
      rule: string;
      flag: string;
      scope: string;
      groups: Array<{ key: string; label: string; stats: GroupStats }>;
      note: string;
    }>;
    combinedBotEntryRules: { kept: GroupStats; filtered: GroupStats; note: string };
  };
  caveats: string[];
  trades?: Array<ReportTrade & { classification: TradeClassification }>;
}

export function buildLossRulesReport(args: {
  journal: 'desk' | 'bot';
  trades: ReportTrade[];
  peers: PeerIdeaRow[];
  closesBySymbol?: Map<string, Array<{ time: number; close: number }>> | null;
  cfg?: LossRulesConfig;
  basis: string;
  includeTrades?: boolean;
  now?: number;
}): LossRulesReport {
  const cfg = args.cfg ?? DEFAULT_LOSS_RULES_CONFIG;
  const trades = args.trades.filter((t) => Number.isFinite(t.pnl));
  const cls = trades.map((t) => classifyTrade(t, args.peers, args.closesBySymbol ?? null, cfg));
  const byId = new Map(cls.map((c) => [c.id, c]));
  const pick = (pred: (t: ReportTrade, c: TradeClassification) => boolean) =>
    groupStats(trades.filter((t) => pred(t, byId.get(t.id)!)).map((t) => t.pnl));

  const versions = new Map<string, number[]>();
  for (const t of trades) {
    const k = t.rulesVersion ?? 'before';
    versions.set(k, [...(versions.get(k) ?? []), t.pnl]);
  }
  const byVersion: Record<string, GroupStats> = {};
  for (const [k, v] of versions) byVersion[k] = groupStats(v);

  const isBot = args.journal === 'bot';
  const capKnown = cls.some((c) => c.cap !== 'unknown');
  const report: LossRulesReport = {
    journal: args.journal,
    asOf: new Date(args.now ?? Date.now()).toISOString(),
    rulesVersion: LOSS_RULES_VERSION,
    config: cfg,
    basis: args.basis,
    measured: {
      label: `Measured: closed trades grouped by the rule-set version stamped at creation (${LOSS_RULES_TAG}); 'before' = produced before the rules shipped.`,
      before: groupStats(trades.filter((t) => !t.rulesVersion).map((t) => t.pnl)),
      after: groupStats(trades.filter((t) => !!t.rulesVersion).map((t) => t.pnl)),
      byVersion,
    },
    counterfactual: {
      hypothetical: true,
      label: 'HYPOTHETICAL — which historical trades each rule would have filtered or changed, and what those trades actually did. Not a simulation: a capped target, a time stop or a different contract is not replayed.',
      all: groupStats(trades.map((t) => t.pnl)),
      rules: [
        {
          rule: '1 · Bot confluence (≥2 independent evidence families)',
          flag: 'LOSS_RULE_BOT_CONFLUENCE',
          scope: isBot ? 'bot entries' : 'bot-only rule, shown as if the desk were traded under it',
          groups: [
            { key: 'pass', label: `≥${cfg.minIndependentSources} families — kept`, stats: pick((_, c) => c.confluence === 'pass') },
            { key: 'fail', label: 'single-source — filtered', stats: pick((_, c) => c.confluence === 'fail') },
          ],
          note: 'Evidence reconstructed from stored rows: publishing engine, other engines\' ideas on the same side (≤48h or still open), stored GEX/aggressor-tape layers and convergence signals. The live options-tape read is not stored historically, so flow confirmation is under-counted here — the filtered group is an UPPER bound.',
        },
        {
          rule: '2 · Bot entry window (09:30–11:30 ET; next-session trigger for out-of-RTH publishes)',
          flag: 'LOSS_RULE_BOT_ENTRY_WINDOW',
          scope: isBot ? 'bot fills (fill time)' : 'desk ideas (publish time) — bot-only rule, shown as if the desk were traded under it',
          groups: [
            { key: 'in_window', label: 'inside the window — kept', stats: pick((_, c) => c.window === 'in_window') },
            { key: 'outside_window', label: 'RTH but outside the window — filtered', stats: pick((_, c) => c.window === 'outside_window') },
            { key: 'outside_rth', label: 'outside RTH (priced off a close) — deferred to a next-session trigger', stats: pick((_, c) => c.window === 'outside_rth') },
          ],
          note: 'An out-of-RTH idea is not dropped by the rule — it waits for price to trade at the entry after 09:30. Whether it would have triggered needs intraday bars these rows do not carry, so that group reports the stale-close fills as they actually happened.',
        },
        {
          rule: '3 · Target cap (T1 ≤ 1× horizon expected move) + time stop',
          flag: 'LOSS_RULE_TARGET_CAP / LOSS_RULE_TIME_STOP',
          scope: 'new ideas from every source',
          groups: [
            { key: 'within', label: 'T1 already inside the expected move — unchanged', stats: pick((_, c) => c.cap === 'within') },
            { key: 'would_cap', label: 'T1 beyond the expected move — would be capped', stats: pick((_, c) => c.cap === 'would_cap') },
            { key: 'unknown', label: 'not measurable (no bars / premium-priced plan)', stats: pick((_, c) => c.cap === 'unknown') },
          ],
          note: capKnown
            ? 'σ = 20-day realized vol from daily closes BEFORE the publish date; horizon from the holding period (day 1 · swing 5 · position 10 trading days, capped at expiry). The capped group shows how the far-target trades did; their capped outcome is not replayed. The time stop is measured going forward only (auto_time_stop).'
            : 'Daily bars were not loaded for this run (pass vol=1), so no trade could be classified.',
        },
        {
          rule: '4 · DTE fit (multi-day holds → 30–60 DTE)',
          flag: 'LOSS_RULE_DTE_FIT',
          scope: 'option vehicles',
          groups: [
            { key: 'fit', label: 'vehicle fits the hold — unchanged', stats: pick((_, c) => c.dte === 'fit') },
            { key: 'misfit', label: 'multi-day hold on <30 or >60 DTE — would take a different contract', stats: pick((_, c) => c.dte === 'misfit') },
            { key: 'n/a', label: 'not an option', stats: pick((_, c) => c.dte === 'n/a') },
          ],
          note: 'The misfit group is what the old vehicles did; the 30–60 DTE replacement contract is not priced here.',
        },
      ],
      combinedBotEntryRules: {
        kept: pick((_, c) => !c.botFiltered),
        filtered: pick((_, c) => c.botFiltered),
        note: 'Rules 1 + 2 together (a trade outside RTH counts as filtered — the conservative reading, since its next-session trigger is unknowable here).',
      },
    },
    caveats: [
      `Small samples: every group under 20 trades is flagged lowSample — treat as a hypothesis, not a result.`,
      isBot
        ? 'Bot P&L is the paper ledger at the bot\'s own size (fees and slippage not modelled), all runs.'
        : 'Desk P&L is unit-sized (1 contract per option idea at recorded premiums; $1,000 notional per stock idea), same basis as the journal\'s NEXUS ideas book.',
      'Never invents data: a trade with no recorded P&L is excluded upstream, and an unclassifiable trade is counted as unknown, not guessed.',
    ],
  };
  if (args.includeTrades) report.trades = trades.map((t) => ({ ...t, classification: byId.get(t.id)! }));
  return report;
}
