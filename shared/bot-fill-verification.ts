/** Pure audit classifier for Quant Bot option outcomes. Never treats a mark as a fill. */
export type BotFillMeasurement = 'verified' | 'unverified' | 'not_applicable';
export interface BotOptionFillLike {
  assetType?: string | null;
  entryPrice?: number | null;
  exitPrice?: number | null;
  quantity?: number | null;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | Date | null;
  entryTime?: string | Date | null;
  exitTime?: string | Date | null;
  entryReason?: string | null;
  exitReason?: string | null;
  realizedPnL?: number | null;
}
export interface BotFillAudit { status: BotFillMeasurement; reason: string }

function tag(reason: string | null | undefined, marker: string): string | null {
  if (!reason) return null;
  const start = reason.lastIndexOf('[');
  const end = reason.indexOf(']', start + 1);
  if (start < 0 || end < 0) return null;
  const body = reason.slice(start + 1, end);
  return body.includes(marker) ? body : null;
}
function field(body: string, name: string): string | null {
  const m = body.match(new RegExp(`(?:^|\\s)${name}=([^\\s\\]]+)`));
  return m?.[1] ?? null;
}
function stamp(v: unknown): number {
  if (v == null) return NaN;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  return Date.parse(String(v));
}
function closeEnough(a: number, b: number, tolerance = 0.02): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
}

export function auditBotOptionFill(p: BotOptionFillLike): BotFillAudit {
  if (String(p.assetType ?? '').toLowerCase() !== 'option') return { status: 'not_applicable', reason: 'not an option fill' };
  const entry = tag(p.entryReason, 'entry ask=');
  if (!entry) return { status: 'unverified', reason: 'entry quote audit missing' };
  const entryAsk = Number(field(entry, 'ask'));
  const entryBid = Number(field(entry, 'bid'));
  const entryQuoteAt = stamp(field(entry, 'quoteTime'));
  const entryObservedAt = stamp(field(entry, 'observedAt'));
  const entryTime = stamp(p.entryTime);
  if (!(entryBid > 0 && entryAsk >= entryBid) || field(entry, 'delayed') !== 'false') return { status: 'unverified', reason: 'entry was not a fresh, uncrossed two-sided quote' };
  if (![entryQuoteAt, entryObservedAt, entryTime].every(Number.isFinite)) return { status: 'unverified', reason: 'entry quote timestamps missing or invalid' };
  if (entryObservedAt - entryQuoteAt > 60_000 || entryQuoteAt - entryObservedAt > 5_000 || entryTime - entryObservedAt > 60_000 || entryObservedAt - entryTime > 5_000) return { status: 'unverified', reason: 'entry quote too old at observation or fill' };
  if (!closeEnough(Number(p.entryPrice), entryAsk)) return { status: 'unverified', reason: 'entry price does not match ask' };

  const reason = String(p.exitReason ?? '');
  let exitPx: number;
  let exitObservedAt: number;
  if (/^expired\s+\[expiry-intrinsic\b/i.test(reason)) {
    const settle = tag(reason, 'expiry-intrinsic');
    exitPx = Number(field(settle ?? '', 'exit'));
    const underlyingClose = Number(field(settle ?? '', 'underlyingClose'));
    const source = field(settle ?? '', 'source');
    const day = field(settle ?? '', 'day');
    const strike = Number(p.strikePrice);
    const intrinsic = String(p.optionType).toLowerCase() === 'call'
      ? Math.max(0, underlyingClose - strike)
      : Math.max(0, strike - underlyingClose);
    if (!(exitPx >= 0 && underlyingClose > 0 && strike > 0) || !source || !day || day !== String(p.expiryDate ?? '').slice(0, 10) || !closeEnough(exitPx, intrinsic)) return { status: 'unverified', reason: 'expiry intrinsic settlement does not reconcile to the contract and dated underlying close' };
    exitObservedAt = stamp(p.exitTime);
  } else {
    const exit = tag(reason, 'fill bid=');
    if (!exit) return { status: 'unverified', reason: 'exit quote audit missing' };
    const bid = Number(field(exit, 'bid'));
    const ask = Number(field(exit, 'ask'));
    const ageSeconds = Number(field(exit, 'quoteAgeSeconds'));
    const quoteAt = stamp(field(exit, 'quoteTime'));
    exitObservedAt = stamp(field(exit, 'observedAt'));
    const exitTime = stamp(p.exitTime);
    if (!(bid > 0 && ask >= bid) || field(exit, 'delayed') !== 'false') return { status: 'unverified', reason: 'exit was not a fresh, uncrossed two-sided quote' };
    if (!Number.isFinite(ageSeconds) || ageSeconds > 60 || ageSeconds < -5 || ![quoteAt, exitObservedAt, exitTime].every(Number.isFinite)) return { status: 'unverified', reason: 'exit quote timestamps missing, invalid, or stale' };
    if (Math.abs(exitObservedAt - quoteAt - ageSeconds * 1000) > 2_000 || exitTime - exitObservedAt > 60_000 || exitObservedAt - exitTime > 5_000) return { status: 'unverified', reason: 'exit quote too old at observation or fill' };
    exitPx = bid;
    if (!closeEnough(Number(p.exitPrice), bid)) return { status: 'unverified', reason: 'exit price does not match bid' };
  }
  if (!closeEnough(Number(p.exitPrice), exitPx)) return { status: 'unverified', reason: 'recorded exit premium does not match the audited fill/settlement' };
  const expected = (exitPx - Number(p.entryPrice)) * Number(p.quantity) * 100;
  if (!closeEnough(Number(p.realizedPnL), expected, 0.05)) return { status: 'unverified', reason: 'realized P&L does not reconcile to premium fills' };
  return { status: 'verified', reason: 'entry ask and exit bid/expiry intrinsic reconcile to realized P&L' };
}
