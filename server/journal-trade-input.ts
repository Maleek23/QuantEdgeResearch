/**
 * Journal trade input — validation and derived fields for manual add / edit.
 *
 * Before this, POST /api/journal/trade stored req.body verbatim (P&L, outcome and
 * status were whatever the browser computed), and there was no edit path at all.
 * Now both create and update go through one schema, and P&L / outcome / status /
 * holding time are derived here from the prices so a row can never claim a P&L
 * its own entry and exit contradict.
 */
import { z } from 'zod';
import type { JournalTrade } from '@shared/schema';

const isoDate = z.string().trim().min(1).max(40).refine((s) => !Number.isNaN(Date.parse(s)), 'must be a valid date/time')
  .transform((s) => new Date(s).toISOString());

/** A screenshot is an https URL or a compact inline image (client downscales before upload). */
export const MAX_SCREENSHOT_CHARS = 2_500_000;
const screenshot = z.string().max(MAX_SCREENSHOT_CHARS, 'screenshot is too large (max ~1.8MB)')
  .refine(
    (s) => /^https:\/\/\S+$/i.test(s) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s),
    'screenshot must be an https URL or a PNG/JPEG/WebP image',
  );

const EMOTIONS = ['confident', 'fearful', 'greedy', 'fomo', 'revenge', 'disciplined', 'neutral'] as const;

const tag = z.string().trim().max(80).transform((s) => s || null);

export const journalTradeInputSchema = z.object({
  symbol: z.string().trim().min(1).max(24).transform((s) => s.toUpperCase()),
  direction: z.enum(['long', 'short']),
  assetType: z.enum(['stock', 'option', 'future', 'crypto']).default('stock'),
  optionType: z.enum(['call', 'put']).nullish(),
  strikePrice: z.number().positive().nullish(),
  expiryDate: z.string().trim().max(32).nullish(),
  quantity: z.number().positive().max(1e9),
  entryPrice: z.number().nonnegative().max(1e9),
  exitPrice: z.number().nonnegative().max(1e9).nullish(),
  fees: z.number().min(0).max(1e9).default(0),
  entryTime: isoDate,
  exitTime: isoDate.nullish(),
  notes: z.string().max(20_000).nullish(),
  emotion: z.enum(EMOTIONS).nullish(),
  setupType: tag.nullish(),
  mistakeTag: tag.nullish(),
  rating: z.number().int().min(1).max(5).nullish(),
  screenshot: screenshot.nullish(),
}).strict();

export type JournalTradeInput = z.infer<typeof journalTradeInputSchema>;

export const journalTradePatchSchema = journalTradeInputSchema.partial().strict();
export type JournalTradePatch = z.infer<typeof journalTradePatchSchema>;

/** Fields that change the trade's economics — editing any of them re-derives P&L. */
export const PRICING_FIELDS = ['direction', 'assetType', 'quantity', 'entryPrice', 'exitPrice', 'fees', 'entryTime', 'exitTime'] as const;

type PricingInput = Pick<JournalTradeInput, 'direction' | 'assetType' | 'quantity' | 'entryPrice' | 'fees' | 'entryTime'> & {
  exitPrice?: number | null;
  exitTime?: string | null;
};

export function deriveJournalTradeFields(t: PricingInput) {
  const multiplier = t.assetType === 'option' ? 100 : 1;
  const fees = t.fees ?? 0;
  const closed = t.exitPrice != null;
  let realizedPnL: number | null = null;
  let grossPnL: number | null = null;
  let realizedPnLPercent: number | null = null;
  if (closed) {
    const diff = t.direction === 'long' ? t.exitPrice! - t.entryPrice : t.entryPrice - t.exitPrice!;
    grossPnL = +(diff * t.quantity * multiplier).toFixed(2);
    realizedPnL = +(grossPnL - fees).toFixed(2);
    const cost = t.entryPrice * t.quantity * multiplier;
    realizedPnLPercent = cost > 0 ? +((realizedPnL / cost) * 100).toFixed(2) : null;
  }
  const holdingMinutes = t.exitTime
    ? Math.max(0, Math.round((Date.parse(t.exitTime) - Date.parse(t.entryTime)) / 60_000))
    : null;
  return {
    realizedPnL,
    grossPnL,
    realizedPnLPercent,
    holdingMinutes,
    status: (closed ? 'closed' : 'open') as 'closed' | 'open',
    outcome: (realizedPnL == null ? 'open' : Math.abs(realizedPnL) < 0.005 ? 'breakeven' : realizedPnL > 0 ? 'win' : 'loss') as
      'win' | 'loss' | 'breakeven' | 'open',
  };
}

/**
 * Merge a patch onto an existing row. Pricing is re-derived only when a pricing
 * field is in the patch — an imported trade whose P&L came from the broker
 * statement keeps that P&L when you only edit its notes or tags.
 */
export function buildJournalTradeUpdate(existing: JournalTrade, patch: JournalTradePatch): Partial<JournalTrade> {
  const update: Partial<JournalTrade> = { ...(patch as Partial<JournalTrade>) };
  const touchesPricing = PRICING_FIELDS.some((k) => k in patch);
  if (touchesPricing) {
    const merged: PricingInput = {
      direction: patch.direction ?? existing.direction,
      assetType: patch.assetType ?? existing.assetType,
      quantity: patch.quantity ?? existing.quantity,
      entryPrice: patch.entryPrice ?? existing.entryPrice,
      exitPrice: 'exitPrice' in patch ? patch.exitPrice ?? null : existing.exitPrice,
      fees: patch.fees ?? existing.fees ?? 0,
      entryTime: patch.entryTime ?? existing.entryTime,
      exitTime: 'exitTime' in patch ? patch.exitTime ?? null : existing.exitTime,
    };
    Object.assign(update, deriveJournalTradeFields(merged));
  }
  return update;
}
