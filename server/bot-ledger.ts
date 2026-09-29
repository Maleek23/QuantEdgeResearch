/**
 * The bot's ledger — every portfolio the Quant Bot owns and every position in
 * them, with each portfolio labelled as a run (shared/bot-runs.ts).
 *
 * ONE loader for every bot surface: the journal's Bot book, /api/journal/bot and
 * /api/quant-bot/status all read this, so no surface can quietly show a subset.
 */
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { paperPortfolios, paperPositions, type PaperPortfolio, type PaperPosition } from '@shared/schema';
import { labelBotRuns, type BotRunInfo } from '@shared/bot-runs';

export interface BotLedger {
  portfolios: PaperPortfolio[];
  positions: PaperPosition[];
  runs: BotRunInfo[];
  activeId: string | null;
}

export async function loadBotLedger(): Promise<BotLedger> {
  const { BOT_USER_ID, BOT_PORTFOLIO_NAME } = await import('./quant-bot');
  const portfolios = await db.select().from(paperPortfolios)
    .where(eq(paperPortfolios.userId, BOT_USER_ID)).orderBy(asc(paperPortfolios.createdAt));
  const ids = portfolios.map((p) => p.id);
  const positions = ids.length
    ? await db.select().from(paperPositions).where(inArray(paperPositions.portfolioId, ids))
    : [];
  const runs = labelBotRuns(
    portfolios.map((p) => ({ id: p.id, name: p.name, startingCapital: p.startingCapital, createdAt: p.createdAt })),
    positions.map((x) => ({ portfolioId: x.portfolioId, status: x.status, entryTime: x.entryTime, exitTime: x.exitTime })),
    BOT_PORTFOLIO_NAME,
  );
  return { portfolios, positions, runs, activeId: runs.find((r) => r.active)?.id ?? null };
}
