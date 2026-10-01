/**
 * Bot reconciliation — settle the bot's expired option positions, in every run.
 *
 * The arithmetic and the rules live in bot-expiry-plan.ts (pure, tested). This
 * file does the I/O: find open option rows in every portfolio the bot owns,
 * fetch the underlying's close ON expiry day, and — only when asked to apply —
 * close each row at intrinsic and credit the proceeds to that run's cash.
 *
 * Called from the bot cycle (apply) and from research/bot-reconcile.ts (dry run
 * by default). A dry run performs no writes of any kind.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { logger } from './logger';
import { paperPortfolios, paperPositions } from '@shared/schema';
import {
  dueForSettlement, settleAtExpiry, type ExpirySettlement, type ExpirySkip, type OpenBotOptionRow,
} from './bot-expiry-plan';

export interface ReconcileResult {
  asOf: string;
  applied: boolean;
  settlements: ExpirySettlement[];
  skipped: ExpirySkip[];
  /** Realized P&L the settlements add to the record. */
  realizedDelta: number;
  /** Cash the settlements credit back, per portfolio id. */
  cashDelta: Record<string, number>;
}

/** Official close of `symbol` on `day` — Massive (unadjusted) first, then Yahoo's daily bar for that exact day. */
export async function underlyingCloseOn(symbol: string, day: string): Promise<{ close: number; source: string } | null> {
  try {
    const { massiveEnabled, fetchUnadjustedCloseOn } = await import('./massive-market-data');
    if (massiveEnabled()) {
      const c = await fetchUnadjustedCloseOn(symbol, day);
      if (c != null) return { close: c, source: 'massive' };
    }
  } catch { /* fall through to Yahoo */ }
  try {
    const { fetchCandles } = await import('./historical-candles');
    const { nyDay } = await import('@shared/bot-runs');
    const bars = await fetchCandles(symbol, '1y', '1d');
    const bar = bars.find((b) => nyDay(new Date(b.time * 1000)) === day);
    if (bar && bar.close > 0) return { close: Math.round(bar.close * 100) / 100, source: 'yahoo' };
  } catch { /* no source */ }
  return null;
}

/** Keep paper_portfolios.total_value = cash + open positions at their marks. */
export async function syncBotPortfolioValue(portfolioId: string): Promise<void> {
  await db.execute(sql`
    update paper_portfolios p set
      total_value = p.cash_balance + coalesce((
        select sum(coalesce(x.current_price, x.entry_price) * x.quantity * case when x.asset_type = 'option' then 100 else 1 end)
        from paper_positions x where x.portfolio_id = p.id and x.status = 'open'), 0),
      updated_at = now()
    where p.id = ${portfolioId}`);
  await db.execute(sql`
    update paper_portfolios set
      total_pnl = total_value - starting_capital,
      total_pnl_percent = case when starting_capital > 0 then (total_value - starting_capital) / starting_capital * 100 else 0 end
    where id = ${portfolioId}`);
}

export async function reconcileExpiredBotPositions(opts: { apply: boolean; now?: Date; portfolioIds?: string[]; ownerId?: string }): Promise<ReconcileResult> {
  const now = opts.now ?? new Date();
  const { BOT_USER_ID } = await import('./quant-bot');
  // ownerId: a desk bot (docs/DESK_ADMINS.md) settles only its own book. Default = the platform bot.
  const owned = await db.select({ id: paperPortfolios.id }).from(paperPortfolios).where(eq(paperPortfolios.userId, opts.ownerId ?? BOT_USER_ID));
  const ids = owned.map((p) => p.id).filter((id) => !opts.portfolioIds || opts.portfolioIds.includes(id));
  const result: ReconcileResult = { asOf: now.toISOString(), applied: opts.apply, settlements: [], skipped: [], realizedDelta: 0, cashDelta: {} };
  if (!ids.length) return result;

  const open = (await db.select().from(paperPositions)
    .where(and(inArray(paperPositions.portfolioId, ids), eq(paperPositions.status, 'open')))) as unknown as OpenBotOptionRow[];
  const { due, skipped } = dueForSettlement(open, now);
  result.skipped.push(...skipped);

  for (const row of due) {
    const day = String(row.expiryDate).slice(0, 10);
    const px = await underlyingCloseOn(row.symbol, day);
    if (!px) {
      result.skipped.push({ id: row.id, symbol: row.symbol, contract: `${row.symbol} $${row.strikePrice}${String(row.optionType).charAt(0).toUpperCase()} ${day}`, reason: `no ${row.symbol} close found for ${day} — left open, not guessed` });
      continue;
    }
    const s = { ...settleAtExpiry(row, px.close), closeSource: px.source };
    result.settlements.push(s);
    result.realizedDelta += s.realizedPnL;
    result.cashDelta[s.portfolioId] = (result.cashDelta[s.portfolioId] ?? 0) + s.proceeds;

    if (!opts.apply) continue;
    try {
      await db.transaction(async (tx) => {
        const updated = await tx.update(paperPositions).set({
          status: 'closed',
          exitPrice: s.exitPrice,
          exitTime: s.exitTime,
          exitReason: 'expired',
          realizedPnL: s.realizedPnL,
          realizedPnLPercent: s.realizedPnLPercent,
          currentPrice: s.exitPrice,
          lastPriceUpdate: s.exitTime,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
        } as any).where(and(eq(paperPositions.id, s.id), eq(paperPositions.status, 'open'))).returning({ id: paperPositions.id });
        if (!updated.length) return; // closed by someone else meanwhile — never double-credit
        await tx.execute(sql`
          update paper_portfolios set
            cash_balance = cash_balance + ${s.proceeds},
            win_count = win_count + ${s.realizedPnL > 0 ? 1 : 0},
            loss_count = loss_count + ${s.realizedPnL > 0 ? 0 : 1}
          where id = ${s.portfolioId}`);
      });
      logger.info(`[BOT-RECONCILE] ${s.contract} settled at intrinsic $${s.exitPrice} (${s.symbol} closed $${s.underlyingClose} on ${s.expiryDay}) — realized ${s.realizedPnL >= 0 ? '+' : ''}$${s.realizedPnL}`);
    } catch (err) {
      logger.error(`[BOT-RECONCILE] failed to settle ${s.contract}:`, err);
    }
  }
  if (opts.apply) {
    for (const pid of Object.keys(result.cashDelta)) await syncBotPortfolioValue(pid).catch(() => {});
  }
  result.realizedDelta = Math.round(result.realizedDelta * 100) / 100;
  return result;
}
