/**
 * SIGNAL TRAJECTORY CHECKPOINTS
 *
 * The cockpit can only draw a price history it actually recorded. This writer
 * turns the already-live conviction book into a sparse, auditable timeline:
 * one checkpoint per idea every fifteen minutes (plus the validator's own
 * target/stop/expiry events). It deliberately does not write on every page
 * refresh and it never back-fills a curve from today's quote.
 */
import { storage } from './storage';
import type { InsertTradePriceSnapshot } from '@shared/schema';

type SignalLike = {
  ideaId: string;
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  currentPrice?: number | null;
  convictionScore: number;
  convictionBand: string;
  layerCount: number;
};

const CHECKPOINT_EVERY_MS = 15 * 60 * 1000;
const lastCheckpoint = new Map<string, number>();

function percentFromEntry(pick: SignalLike, price: number) {
  const raw = ((price - pick.entryPrice) / Math.max(Math.abs(pick.entryPrice), 0.01)) * 100;
  return pick.direction === 'long' ? raw : -raw;
}

/** Fire-and-forget from the convictions route. A failure must never make the
 * signal board fail; the next cached refresh simply tries again. */
export async function recordSignalTrajectory(picks: SignalLike[]) {
  const now = Date.now();
  const due = picks.filter((pick) => {
    const last = lastCheckpoint.get(pick.ideaId) ?? 0;
    return Number.isFinite(pick.currentPrice) && (pick.currentPrice ?? 0) > 0 && now - last >= CHECKPOINT_EVERY_MS;
  });

  await Promise.all(due.map(async (pick) => {
    const price = Number(pick.currentPrice);
    const targetDistance = Math.abs(((pick.targetPrice - price) / Math.max(Math.abs(price), 0.01)) * 100);
    const stopDistance = Math.abs(((pick.stopLoss - price) / Math.max(Math.abs(price), 0.01)) * 100);
    const snapshot: InsertTradePriceSnapshot = {
      tradeIdeaId: pick.ideaId,
      eventType: 'validation_check',
      eventTimestamp: new Date(now).toISOString(),
      currentPrice: price,
      lastPrice: price,
      distanceToTargetPercent: targetDistance,
      distanceToStopPercent: stopDistance,
      pnlAtSnapshot: percentFromEntry(pick, price),
      dataSource: 'convictions_engine',
      validatorVersion: 'trajectory-v1',
      rawQuoteData: {
        source: 'convictions_checkpoint',
        symbol: pick.symbol,
        direction: pick.direction,
        convictionScore: pick.convictionScore,
        convictionBand: pick.convictionBand,
        layerCount: pick.layerCount,
      },
    };
    await storage.savePriceSnapshot(snapshot);
    lastCheckpoint.set(pick.ideaId, now);
  }));
}
