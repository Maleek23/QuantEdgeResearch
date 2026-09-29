/**
 * IDEA HORIZON — one classification for 0DTE / weekly / swing / monthly / LEAPS.
 * ==============================================================================
 * Pure, no imports: server (/api/convictions stamps it at read time, so every
 * existing row is backfilled without a migration) and client (filter chips,
 * table) share it.
 *
 * WHY: the stored fields disagree with each other. On 2026-09-29 an SPX 0DTE
 * power-hour call was stored holding_period 'day' / trade_type 'swing'; an IWM
 * 2026-09-30 contract was labelled "0DTE" in its catalyst; 173 option rows
 * carry expiry_tier 'WEEKLY' whatever their real expiry. Filtering on any one
 * of those columns sorts ideas into the wrong bucket.
 *
 * RULE
 *   Options (an expiry date is present): calendar days to expiry in New York,
 *   counted from NOW (what is tradeable today). An expired contract keeps the
 *   class it had at publish and is flagged expired.
 *       0 → 0DTE · 1–7 → Weekly · 8–30 → Swing · 31–60 → Monthly
 *       61–180 → Position · >180 → LEAPS
 *   Stock / crypto / futures (no expiry): the stated holding period.
 *       day → Day · week-ending → Weekly · swing → Swing · position → Position
 */

export type IdeaHorizon = '0dte' | 'day' | 'weekly' | 'swing' | 'monthly' | 'position' | 'leaps';

export const HORIZON_ORDER: IdeaHorizon[] = ['0dte', 'day', 'weekly', 'swing', 'monthly', 'position', 'leaps'];

export const HORIZON_META: Record<IdeaHorizon, { label: string; rule: string }> = {
  '0dte':   { label: '0DTE',     rule: 'Option expiring today (New York date)' },
  day:      { label: 'Day',      rule: 'Stock/crypto idea held intraday (holding period "day")' },
  weekly:   { label: 'Weekly',   rule: 'Option 1–7 days to expiry, or a stock idea exiting by the week\'s close' },
  swing:    { label: 'Swing',    rule: 'Option 8–30 days to expiry, or a stock swing (days to weeks)' },
  monthly:  { label: 'Monthly',  rule: 'Option 31–60 days to expiry' },
  position: { label: 'Position', rule: 'Option 61–180 days to expiry, or a stock position idea' },
  leaps:    { label: 'LEAPS',    rule: 'Option more than 180 days to expiry' },
};

export interface HorizonInput {
  assetType?: string | null;
  expiryDate?: string | null;
  holdingPeriod?: string | null;
  /** Publish time (ISO) — used for an expired contract's class. */
  generatedAt?: string | null;
  timestamp?: string | null;
}

export interface HorizonRead {
  horizon: IdeaHorizon;
  label: string;
  /** Calendar days to expiry from today (NY), options only; negative once expired. */
  dte: number | null;
  /** Calendar days to expiry at publish, options only. */
  dteAtPublish: number | null;
  expired: boolean;
  basis: 'expiry' | 'holding-period';
}

const nyDate = (ms: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T12:00:00Z`) / 864e5);

export function horizonFromDte(dte: number): IdeaHorizon {
  if (dte <= 0) return '0dte';
  if (dte <= 7) return 'weekly';
  if (dte <= 30) return 'swing';
  if (dte <= 60) return 'monthly';
  if (dte <= 180) return 'position';
  return 'leaps';
}

export function classifyIdeaHorizon(idea: HorizonInput, now = Date.now()): HorizonRead {
  const exp = typeof idea.expiryDate === 'string' ? idea.expiryDate.slice(0, 10) : '';
  const isOptionish = /^\d{4}-\d{2}-\d{2}$/.test(exp) && (idea.assetType == null || /option/i.test(String(idea.assetType)));
  if (isOptionish && Number.isFinite(dayNum(exp))) {
    const dte = dayNum(exp) - dayNum(nyDate(now));
    const pub = Date.parse(String(idea.generatedAt ?? idea.timestamp ?? ''));
    const dteAtPublish = Number.isFinite(pub) ? dayNum(exp) - dayNum(nyDate(pub)) : null;
    const expired = dte < 0;
    const horizon = horizonFromDte(expired ? (dteAtPublish ?? 0) : dte);
    return { horizon, label: HORIZON_META[horizon].label, dte, dteAtPublish, expired, basis: 'expiry' };
  }
  const hp = String(idea.holdingPeriod ?? '').toLowerCase();
  const horizon: IdeaHorizon =
    hp.includes('week') ? 'weekly'
    : hp.includes('position') || hp.includes('long') ? 'position'
    : hp.includes('swing') ? 'swing'
    : 'day';
  return { horizon, label: HORIZON_META[horizon].label, dte: null, dteAtPublish: null, expired: false, basis: 'holding-period' };
}
