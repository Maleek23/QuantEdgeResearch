/**
 * LOSS RULES REPORT — server helper + route.
 *
 *   GET /api/journal/loss-rules?journal=desk|bot[&vol=1][&trades=1]
 *
 * desk  every idea published since OUTCOME_BASELINE_DATE (the journal's Trade
 *       desk book, same unit sizing and exclusions).
 * bot   every closed Quant Bot paper fill, all runs.
 * vol=1 loads daily bars per symbol so the target-cap counterfactual can be
 *       classified (slower on a cold cache; off by default).
 * trades=1 includes every trade with its classification.
 *
 * Read-only. Result cached 10 minutes per (journal, vol, trades). The pure core
 * is shared/loss-rules-report.ts; the journal Loss analysis page consumes this.
 */
import type { Express, Request, Response, NextFunction } from 'express';
import { and, eq, gte, inArray, isNull, ne, or } from 'drizzle-orm';
import { db } from './db';
import { logger } from './logger';
import { tradeIdeas } from '@shared/schema';
import { OUTCOME_BASELINE_DATE } from '@shared/constants';
import { buildLossRulesReport, type LossRulesReport } from '@shared/loss-rules-report';
import { deskReportTrade, botReportTrade, peerRow, type IdeaRow } from './loss-rules-report-rows';
import { lossRulesConfig } from './loss-rules';

const ideaCols = {
  id: tradeIdeas.id, symbol: tradeIdeas.symbol, assetType: tradeIdeas.assetType, direction: tradeIdeas.direction,
  entryPrice: tradeIdeas.entryPrice, targetPrice: tradeIdeas.targetPrice, stopLoss: tradeIdeas.stopLoss,
  riskRewardRatio: tradeIdeas.riskRewardRatio, optionType: tradeIdeas.optionType, strikePrice: tradeIdeas.strikePrice,
  expiryDate: tradeIdeas.expiryDate, entryPremium: tradeIdeas.entryPremium, exitPremium: tradeIdeas.exitPremium,
  optionPercentGain: tradeIdeas.optionPercentGain, exitPrice: tradeIdeas.exitPrice, percentGain: tradeIdeas.percentGain,
  outcomeStatus: tradeIdeas.outcomeStatus, resolutionReason: tradeIdeas.resolutionReason, exitDate: tradeIdeas.exitDate,
  timestamp: tradeIdeas.timestamp, source: tradeIdeas.source, catalyst: tradeIdeas.catalyst, genConvictionBand: tradeIdeas.genConvictionBand,
  holdingPeriod: tradeIdeas.holdingPeriod, genScoringLayers: tradeIdeas.genScoringLayers, convergenceSignalsJson: tradeIdeas.convergenceSignalsJson,
};

async function loadCloses(symbols: string[]): Promise<Map<string, Array<{ time: number; close: number }>>> {
  const { fetchCandlesBatch } = await import('./historical-candles');
  const m = await fetchCandlesBatch(symbols, '1y', '1d', 4);
  const out = new Map<string, Array<{ time: number; close: number }>>();
  for (const [s, bars] of m) if (bars?.length) out.set(s, bars.map((b) => ({ time: b.time, close: b.close })));
  return out;
}

export async function getLossRulesReport(journal: 'desk' | 'bot', opts: { vol?: boolean; includeTrades?: boolean } = {}): Promise<LossRulesReport> {
  const cfg = lossRulesConfig();
  if (journal === 'desk') {
    const ideas = await db.select(ideaCols).from(tradeIdeas).where(and(
      gte(tradeIdeas.timestamp, OUTCOME_BASELINE_DATE),
      ne(tradeIdeas.status, 'draft'),
      or(eq(tradeIdeas.excludeFromTraining, false), isNull(tradeIdeas.excludeFromTraining)),
    )) as unknown as IdeaRow[];
    const trades = ideas.map(deskReportTrade).filter((t): t is NonNullable<typeof t> => !!t);
    const closes = opts.vol ? await loadCloses([...new Set(trades.map((t) => t.symbol))]) : null;
    return buildLossRulesReport({
      journal, trades, peers: ideas.map(peerRow), closesBySymbol: closes, cfg, includeTrades: opts.includeTrades,
      basis: `Trade desk — ideas published since ${OUTCOME_BASELINE_DATE}, closed with a measured result, unit-sized as in the journal (${trades.length} trades of ${ideas.length} ideas).`,
    });
  }
  const { loadBotLedger } = await import('./bot-ledger');
  const { positions, runs } = await loadBotLedger();
  const ids = [...new Set(positions.map((p) => p.tradeIdeaId).filter((x): x is string => !!x))];
  const own = ids.length ? await db.select(ideaCols).from(tradeIdeas).where(inArray(tradeIdeas.id, ids)) as unknown as IdeaRow[] : [];
  const byId = new Map(own.map((i) => [i.id, i]));
  const trades = positions.map((p) => botReportTrade(p as any, p.tradeIdeaId ? byId.get(p.tradeIdeaId) ?? null : null))
    .filter((t): t is NonNullable<typeof t> => !!t);
  // Peers: every idea published from two days before the first fill.
  const first = trades.map((t) => Date.parse(t.entryTime)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  const since = new Date((first ?? Date.now()) - 2 * 86_400_000).toISOString();
  const peers = await db.select(ideaCols).from(tradeIdeas).where(gte(tradeIdeas.timestamp, since)) as unknown as IdeaRow[];
  const closes = opts.vol ? await loadCloses([...new Set(trades.map((t) => t.symbol))]) : null;
  return buildLossRulesReport({
    journal, trades, peers: peers.map(peerRow), closesBySymbol: closes, cfg, includeTrades: opts.includeTrades,
    basis: `Quant Bot paper ledger — every closed fill across ${runs.length} run(s) (${trades.length} trades).`,
  });
}

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
const cache = new Map<string, { at: number; value: LossRulesReport }>();

export function registerLossRulesRoutes(app: Express, requireBetaAccess: Mw) {
  app.get('/api/journal/loss-rules', requireBetaAccess, async (req, res) => {
    try {
      const j = String(req.query.journal ?? 'desk').toLowerCase();
      if (j !== 'desk' && j !== 'bot') return res.status(400).json({ error: "journal must be 'desk' or 'bot'" });
      const vol = req.query.vol === '1';
      const includeTrades = req.query.trades === '1';
      const key = `${j}:${vol}:${includeTrades}`;
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < 10 * 60_000) return res.json({ ...hit.value, cached: true });
      const value = await getLossRulesReport(j, { vol, includeTrades });
      cache.set(key, { at: Date.now(), value });
      res.json(value);
    } catch (err) {
      logger.error('[LOSS-RULES] report failed', { error: (err as Error)?.message });
      res.status(500).json({ error: 'Loss-rules report failed', message: (err as Error)?.message });
    }
  });
}
