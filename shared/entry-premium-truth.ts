/**
 * ENTRY PREMIUM TRUTH — an option idea's entry premium must be a price the
 * contract could actually be bought at when the idea was published.
 *
 * 2026-10-14: flow ideas SPY 777C / 778C 0DTE published 09:34:48 ET with entry
 * premiums $2.72 / $2.13 — the PRIOR SESSION's closing marks — while the
 * contracts traded $0.50–0.87 all morning; SPY 775C at 10:05 published $1.94,
 * the 09:49–09:50 print. Source: universal-idea-generator captured the entry
 * from the CBOE *delayed* chain (15-min delay; before ~09:45 it still shows the
 * prior close). The publish-time liquidity gate had the live Alpaca mid
 * ($0.635 / $0.405 / $0.615) on the same row and never used it. The tracker then
 * judged the plan mapped from $2.72 and booked hit_stop −78% one minute later.
 *
 * Two guards, both pure:
 *   1. decideEntryPremium — at publish: entry = live quote (ask when the spread
 *      is tight, else mid), quote ≤ 60 s old from a live source; a claimed
 *      premium > 25% off the live mid is re-priced and logged; no live quote →
 *      withheld.
 *   2. guardEntryAgainstBars — at outcome time: if the recorded entry is
 *      outside the contract's traded range in the first 5 minutes after
 *      publish, the entry becomes the first real 1-min bar close at/after
 *      publish (entry_repriced). An instant stop is never scored off an
 *      untradeable entry.
 */

export const ENTRY_QUOTE_VERSION = 'entry-quote-v1';
export const ENTRY_PREMIUM_NOT_TRADED = 'entry_premium_not_traded';
export const ENTRY_PREMIUM_WITHHELD_CODE = 'entry_premium_no_live_quote';

/** Quote sources that are live (not delayed / not a prior-session mark). */
export const LIVE_QUOTE_SOURCES: ReadonlySet<string> = new Set([
  'alpaca_indicative', 'alpaca_opra', 'alpaca', 'tradier', 'schwab', 'live',
]);

export const ENTRY_QUOTE_DEFAULTS = {
  /** A quote older than this is stale. */
  maxAgeMs: 60_000,
  /** Claimed premium vs live mid divergence that forces a re-price (fraction). */
  divergence: 0.25,
  /** Pay the ask when (ask − bid)/mid is at most this; else the mid. */
  askSpreadMax: 0.10,
  /** Outcome guard: window after publish whose prints define "tradeable". */
  guardWindowMs: 5 * 60_000,
  /** Outcome guard tolerance around the traded range (fraction). */
  guardTol: 0.25,
};

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r2 = (x: number) => Math.round(x * 100) / 100;

export interface LiveQuote {
  bid: number | null;
  ask: number | null;
  /** Feed / chain the quote came from (alpaca_indicative, cboe_delayed …). */
  source: string;
  /** When the quote was made (quote timestamp, else the chain fetch time), epoch ms. */
  asOfMs: number | null;
}

export interface EntryQuoteStamp {
  v: typeof ENTRY_QUOTE_VERSION;
  action: 'confirmed' | 'repriced' | 'withheld' | 'unverified';
  entry: number | null;
  claimed: number | null;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  basis: 'ask' | 'mid' | null;
  source: string | null;
  quoteAsOf: string | null;
  ageMs: number | null;
  reason: string;
  at: string;
}

/**
 * Decide an option idea's entry premium from a live quote. Pure.
 * `confirmed`: claimed premium within 25% of the live mid — entry is still set
 * to the live fill. `repriced`: claimed missing or > 25% off. `withheld`: no
 * live, fresh, two-sided quote.
 */
export function decideEntryPremium(
  claimed: number | null | undefined,
  quote: LiveQuote | null,
  nowMs: number,
  cfg: Partial<typeof ENTRY_QUOTE_DEFAULTS> = {},
): EntryQuoteStamp {
  const c = { ...ENTRY_QUOTE_DEFAULTS, ...cfg };
  const cl = fin(claimed) && claimed > 0 ? claimed : null;
  const at = new Date(nowMs).toISOString();
  const base = {
    v: ENTRY_QUOTE_VERSION, claimed: cl, bid: quote?.bid ?? null, ask: quote?.ask ?? null,
    source: quote?.source ?? null, quoteAsOf: quote && fin(quote.asOfMs) ? new Date(quote.asOfMs).toISOString() : null,
    ageMs: quote && fin(quote.asOfMs) ? Math.max(0, nowMs - quote.asOfMs) : null, at,
  } as const;
  const withheld = (reason: string): EntryQuoteStamp => ({ ...base, action: 'withheld', entry: null, mid: null, basis: null, reason });
  if (!quote) return withheld('no live quote for the contract');
  if (!LIVE_QUOTE_SOURCES.has(quote.source)) return withheld(`quote source ${quote.source} is not live (delayed / prior-session marks)`);
  const bid = quote.bid, ask = quote.ask;
  if (!(fin(bid) && bid > 0 && fin(ask) && ask > 0 && ask >= bid)) return withheld(`quote not two-sided (bid ${bid ?? '—'} / ask ${ask ?? '—'})`);
  if (base.ageMs == null) return withheld('quote has no timestamp');
  if (base.ageMs > c.maxAgeMs) return withheld(`quote is ${Math.round(base.ageMs / 1000)}s old (> ${Math.round(c.maxAgeMs / 1000)}s)`);
  const mid = (bid + ask) / 2;
  const spread = (ask - bid) / mid;
  const basis: 'ask' | 'mid' = spread <= c.askSpreadMax ? 'ask' : 'mid';
  const entry = r2(basis === 'ask' ? ask : mid);
  if (cl == null) return { ...base, action: 'repriced', entry, mid: r2(mid), basis, reason: `no claimed premium — live ${basis} $${entry.toFixed(2)}` };
  const off = Math.abs(cl - mid) / mid;
  if (off > c.divergence) {
    return { ...base, action: 'repriced', entry, mid: r2(mid), basis, reason: `claimed $${cl.toFixed(2)} is ${Math.round(off * 100)}% off the live mid $${mid.toFixed(2)} — re-priced to the live ${basis} $${entry.toFixed(2)}` };
  }
  return { ...base, action: 'confirmed', entry, mid: r2(mid), basis, reason: `claimed $${cl.toFixed(2)} within ${Math.round(c.divergence * 100)}% of the live mid $${mid.toFixed(2)} — entry is the live ${basis} $${entry.toFixed(2)}` };
}

export interface MinuteBar { t: number; o: number; h: number; l: number; c: number }

export interface EntryGuard {
  /** true = the recorded entry was not tradeable → use `entry` instead. */
  repriced: boolean;
  entry: number;
  recorded: number;
  range: { lo: number; hi: number; bars: number } | null;
  /** Start of the bar whose close became the entry (repriced only). */
  barAtMs: number | null;
  note: string;
}

/**
 * Was the recorded entry premium tradeable in the first `guardWindowMs` after
 * publish? 1-minute bars are keyed by their START; the bar containing the
 * publish instant counts. Not tradeable → entry = the first bar close at/after
 * publish. No bars in the window → unchanged (cannot judge). Pure.
 */
export function guardEntryAgainstBars(
  recorded: number,
  bars: MinuteBar[],
  publishMs: number,
  cfg: Partial<typeof ENTRY_QUOTE_DEFAULTS> & { barMs?: number } = {},
): EntryGuard {
  const c = { ...ENTRY_QUOTE_DEFAULTS, ...cfg };
  const barMs = cfg.barMs ?? 60_000;
  const win = bars
    .filter((b) => fin(b.t) && b.t + barMs > publishMs && b.t < publishMs + c.guardWindowMs && fin(b.l) && fin(b.h) && b.h > 0)
    .sort((a, b) => a.t - b.t);
  if (!win.length || !(recorded > 0)) {
    return { repriced: false, entry: recorded, recorded, range: null, barAtMs: null, note: 'no contract prints in the 5 min after publish — entry not judged' };
  }
  const lo = Math.min(...win.map((b) => b.l));
  const hi = Math.max(...win.map((b) => b.h));
  const range = { lo: r2(lo), hi: r2(hi), bars: win.length };
  if (recorded >= lo * (1 - c.guardTol) && recorded <= hi * (1 + c.guardTol)) {
    return { repriced: false, entry: recorded, recorded, range, barAtMs: null, note: `entry $${recorded.toFixed(2)} traded (5-min range $${range.lo}–$${range.hi})` };
  }
  const first = win[0];
  const entry = r2(first.c);
  return {
    repriced: true, entry, recorded, range, barAtMs: first.t,
    note: `[entry_repriced] ${ENTRY_PREMIUM_NOT_TRADED}: recorded entry $${recorded.toFixed(2)} outside the contract's traded range $${range.lo}–$${range.hi} in the 5 min after publish → entry $${entry.toFixed(2)} (first 1-min bar close at/after publish, ${new Date(first.t).toISOString().slice(11, 16)}Z)`,
  };
}

/** True when an outcome note already records an entry re-price. Pure. */
export function wasEntryRepriced(outcomeNotes: string | null | undefined): boolean {
  return /\[entry_repriced\]/.test(String(outcomeNotes ?? ''));
}
