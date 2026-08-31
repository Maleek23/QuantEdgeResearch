/**
 * BOT-HELD POSITIONS AS COCKPIT PICKS
 * ===================================
 * Anything the bot actually bought appears on the board. Unconditionally.
 *
 * WHY
 * The cockpit reads /api/convictions, which reads `trade_ideas` and then
 * applies the entry gauntlet: holding-period age cap, live revalidation,
 * minScore, short discipline. The bot's real positions live in
 * `paper_positions`. Nothing joined the two.
 *
 * The result, measured 2026-08-31: the bot held 11 open positions and the
 * cockpit displayed 4 of them. Seven were invisible for two different reasons —
 * COPX, DKS and QCOM had no `trade_ideas` row at all, and JNJ, NET, PATH and
 * WDC had rows that the entry filters removed.
 *
 * The second reason is the design error. A position you already OWN is being
 * re-judged by the rules for OPENING one, so it vanishes from the screen the
 * moment it stops looking like a fresh entry — which is often the moment it
 * starts moving. NET was up $1,650, the single best position in the book, and
 * could not be seen.
 *
 * Held is held. These bypass every entry filter by construction: they are not
 * candidates, they are inventory, and the operator needs them on the screen to
 * manage them.
 */
import { db } from './db';
import { sql } from 'drizzle-orm';
import { logger } from './logger';

export interface BotHeldPick {
  ideaId: string;
  symbol: string;
  direction: 'long' | 'short';
  assetType: string;
  optionType: string | null;
  strikePrice: number | null;
  expiryDate: string | null;
  entryPremium: number | null;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  quantity: number;
  unrealizedPnl: number | null;
  unrealizedPnlPercent: number | null;
  /** Marks the row as inventory rather than a candidate. The UI badges on this. */
  isBotHeld: true;
  botOwner: string;
  heldSince: string | null;
  convictionScore: number | null;
  convictionBand: string | null;
  lifecycleState: 'executed';
  layers: { kind: string; why: string; points: number }[];
}

/** Every open bot position, shaped like a conviction pick. */
export async function getBotHeldPicks(): Promise<BotHeldPick[]> {
  try {
    const r: any = await db.execute(sql`
      SELECT pp.id, pp.symbol, pp.asset_type, pp.direction, pp.option_type,
             pp.strike_price, pp.expiry_date, pp.entry_price, pp.quantity,
             pp.target_price, pp.stop_loss, pp.unrealized_pnl,
             pp.unrealized_pnl_percent, pp.entry_time, pp.trade_idea_id,
             po.user_id AS bot_owner
      FROM paper_positions pp
      JOIN paper_portfolios po ON po.id = pp.portfolio_id
      WHERE pp.status = 'open'
      ORDER BY pp.symbol`);

    const rows = (r.rows ?? r) as any[];
    return rows.map((x) => {
      const isOption = !!x.option_type;
      const pnlPct = x.unrealized_pnl_percent != null ? Number(x.unrealized_pnl_percent) : null;
      return {
        // Prefer the originating idea's id so clicking through still resolves
        // to its evidence when one exists.
        ideaId: String(x.trade_idea_id ?? `bot-${x.id}`),
        symbol: String(x.symbol).toUpperCase(),
        direction: /short|bear|put/i.test(String(x.direction ?? '')) ? 'short' : 'long',
        assetType: String(x.asset_type ?? (isOption ? 'option' : 'stock')),
        optionType: x.option_type ?? null,
        strikePrice: x.strike_price != null ? Number(x.strike_price) : null,
        expiryDate: x.expiry_date ? String(x.expiry_date) : null,
        // For an option the entry is a PREMIUM, not an underlying level.
        entryPremium: isOption && x.entry_price != null ? Number(x.entry_price) : null,
        entryPrice: x.entry_price != null ? Number(x.entry_price) : null,
        targetPrice: x.target_price != null ? Number(x.target_price) : null,
        stopLoss: x.stop_loss != null ? Number(x.stop_loss) : null,
        quantity: Number(x.quantity ?? 1),
        unrealizedPnl: x.unrealized_pnl != null ? Number(x.unrealized_pnl) : null,
        unrealizedPnlPercent: pnlPct,
        isBotHeld: true as const,
        botOwner: String(x.bot_owner ?? 'bot'),
        heldSince: x.entry_time ? new Date(x.entry_time).toISOString() : null,
        // Held positions are not scored for entry. Showing a fabricated
        // conviction here would invite comparison against candidates that were
        // scored, so it is left null and the UI shows P&L in that slot instead.
        convictionScore: null,
        convictionBand: null,
        lifecycleState: 'executed' as const,
        layers: [{
          kind: 'position',
          why: `Held by ${String(x.bot_owner ?? 'bot')} — ${x.quantity}x` +
               (pnlPct != null ? ` · ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%` : ''),
          points: 0,
        }],
      };
    });
  } catch (err: any) {
    logger.warn(`[BOT-HELD] could not read positions: ${err?.message ?? err}`);
    return [];
  }
}

/**
 * Merge held positions into a picks list.
 *
 * Held rows go FIRST and win on collision: if a symbol is both a candidate and
 * something the bot owns, the owned view is the truthful one — the operator
 * needs the fill and the P&L, not the entry score it no longer qualifies for.
 */
export function mergeBotHeld<T extends { symbol: string; direction?: string }>(
  picks: T[],
  held: BotHeldPick[],
): (T | BotHeldPick)[] {
  if (held.length === 0) return picks;
  const key = (s: string, d?: string) =>
    `${s.toUpperCase()}:${/short|bear|put/i.test(String(d ?? '')) ? 'short' : 'long'}`;
  const heldKeys = new Set(held.map((h) => key(h.symbol, h.direction)));
  const rest = picks.filter((p) => !heldKeys.has(key(p.symbol, p.direction)));
  return [...held, ...rest];
}
