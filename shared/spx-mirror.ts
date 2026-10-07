/**
 * SPX MIRROR — the SPX/SPXW expression of an SPY 0DTE/1DTE idea.
 *
 * Why (operator, 2026-10-01: "still don't see SPX"): every index engine scans
 * SPY/QQQ/IWM, so an "SPX play" is published as an SPY option. The mirror
 * translates that SPY idea into SPX units for display only:
 *   SPXW strike = round-to-5(SPY strike × live SPX/SPY ratio)
 *   SPX levels  = SPY underlying levels × the same ratio
 *
 * Rules:
 *   - The outcome record stays on the SPY idea. A mirror is never written as
 *     a trade_ideas row and never graded (no double counting).
 *   - The ratio carries its own asOf; the SPXW premium carries the CBOE
 *     delayed chain's asOf + delay. Nothing here is presented as live.
 *
 * Pure: no I/O. The server attaches it (server/spx-mirror.ts); the client
 * renders the wire shape below.
 */

export const SPX_MIRROR_NOTE = 'tracked as the SPY idea; SPX is a mirror';
/** CBOE's delayed options CDN is ~15 minutes behind. */
export const CBOE_DELAY_SEC = 15 * 60;
/** Plausible SPX/SPY cash ratio band (it has sat near 10.0 for years). */
export const RATIO_MIN = 5;
export const RATIO_MAX = 15;

export interface SpyToSpxInput {
  spyStrike: number;
  spySpot: number;
  spxSpot: number;
  side: 'call' | 'put';
  /** SPY underlying levels to convert (entry / stop / targets). */
  entry?: number | null;
  stop?: number | null;
  targets?: Array<number | null | undefined>;
}

export interface SpyToSpxResult {
  ratio: number;
  spxStrike: number;
  side: 'call' | 'put';
  entry: number | null;
  stop: number | null;
  targets: number[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;
export const roundTo5 = (v: number) => Math.round(v / 5) * 5;

/** Valid only when both spots are positive and the ratio is plausible; otherwise null (never guess). */
export function spxRatio(spySpot: number, spxSpot: number): number | null {
  if (!(Number.isFinite(spySpot) && spySpot > 0 && Number.isFinite(spxSpot) && spxSpot > 0)) return null;
  const k = spxSpot / spySpot;
  return k > RATIO_MIN && k < RATIO_MAX ? k : null;
}

export function spyToSpx(input: SpyToSpxInput): SpyToSpxResult | null {
  const ratio = spxRatio(input.spySpot, input.spxSpot);
  if (ratio == null || !(Number.isFinite(input.spyStrike) && input.spyStrike > 0)) return null;
  const conv = (v: number | null | undefined) => (v != null && Number.isFinite(v) && v > 0 ? round2(v * ratio) : null);
  return {
    ratio,
    spxStrike: roundTo5(input.spyStrike * ratio),
    side: input.side,
    entry: conv(input.entry),
    stop: conv(input.stop),
    targets: (input.targets ?? []).map(conv).filter((v): v is number => v != null),
  };
}

/** OCC symbol for an SPXW contract, e.g. SPXW261001C07650000. */
export function spxwOcc(expiry: string, side: 'call' | 'put', strike: number): string {
  const [y, m, d] = expiry.split('-');
  return `SPXW${y.slice(2)}${m}${d}${side === 'call' ? 'C' : 'P'}${String(Math.round(strike * 1000)).padStart(8, '0')}`;
}

/** Underlying levels look like SPY prices (not option premiums) — within ±25% of spot. */
export function looksLikeUnderlying(level: number | null | undefined, spySpot: number): boolean {
  return level != null && Number.isFinite(level) && level > 0 && Math.abs(level / spySpot - 1) < 0.25;
}

// ── wire shape ──────────────────────────────────────────────────────────

export interface SpxMirrorPremium {
  mid: number | null;
  bid: number | null;
  ask: number | null;
  /** When the CBOE chain was fetched (ISO). The quote itself is ~delayedSec older. */
  asOf: string;
  delayedSec: number;
  source: 'CBOE delayed';
}

export interface SpxMirror {
  /** ok = contract + premium; no_premium = contract/levels only; omitted = nothing computed. */
  status: 'ok' | 'no_premium' | 'omitted';
  reason: string | null;
  contract: { root: 'SPXW'; occ: string; strike: number; expiry: string; optionType: 'call' | 'put'; dte: number | null } | null;
  premium: SpxMirrorPremium | null;
  levels: { entry: number | null; stop: number | null; targets: number[] } | null;
  ratio: { value: number; spx: number; spy: number; asOf: string; source: string } | null;
  note: string;
}

export const omittedMirror = (reason: string): SpxMirror => ({
  status: 'omitted', reason, contract: null, premium: null, levels: null, ratio: null, note: SPX_MIRROR_NOTE,
});

/** Is an idea a candidate for a mirror? SPY option, expiry 0–2 calendar days out. */
export function isMirrorCandidate(p: { symbol: string; optionType?: string | null; strikePrice?: number | null; expiryDate?: string | null }, dte: number | null): boolean {
  return String(p.symbol).toUpperCase() === 'SPY'
    && (p.optionType === 'call' || p.optionType === 'put')
    && !!p.strikePrice && p.strikePrice > 0
    && !!p.expiryDate
    && dte != null && dte >= 0 && dte <= 2;
}

// ── pure assembly (server I/O supplies ratio + chain) ───────────────────

export interface MirrorInput {
  key: string;
  optionType: 'call' | 'put';
  /** SPY strike. */
  strike: number;
  /** YYYY-MM-DD — SPXW lists the same daily expiries as SPY. */
  expiry: string;
  dte: number | null;
  /** SPY underlying levels. */
  entry: number | null;
  stop: number | null;
  targets: Array<number | null | undefined>;
}

export interface MirrorRatio { value: number; spx: number; spy: number; asOf: string; source: string }
export interface MirrorChainRow { symbol?: string; option_type: string; strike: number; expiration_date: string; bid?: number | null; ask?: number | null }
export interface MirrorChain { rows: MirrorChainRow[]; fetchedAt: number }

export function buildSpxMirror(input: MirrorInput, ratio: MirrorRatio | null, chain: MirrorChain | null, chainReason: string | null): SpxMirror {
  if (!ratio) return omittedMirror('no live SPX/SPY ratio — nothing translated');
  const conv = spyToSpx({
    spyStrike: input.strike, spySpot: ratio.spy, spxSpot: ratio.spx, side: input.optionType,
    entry: looksLikeUnderlying(input.entry, ratio.spy) ? input.entry : null,
    stop: looksLikeUnderlying(input.stop, ratio.spy) ? input.stop : null,
    targets: input.targets.filter((t) => looksLikeUnderlying(t, ratio.spy)),
  });
  if (!conv) return omittedMirror('SPX/SPY ratio out of range — nothing translated');
  const contract = { root: 'SPXW' as const, occ: spxwOcc(input.expiry, input.optionType, conv.spxStrike), strike: conv.spxStrike, expiry: input.expiry, optionType: input.optionType, dte: input.dte };
  const base: SpxMirror = {
    status: 'no_premium', reason: null, contract, premium: null,
    levels: { entry: conv.entry, stop: conv.stop, targets: conv.targets },
    ratio, note: SPX_MIRROR_NOTE,
  };
  if (!chain) return { ...base, reason: chainReason ?? 'SPXW chain unavailable (CBOE delayed)' };
  const matches = chain.rows.filter((r) => r.expiration_date === input.expiry && r.option_type === input.optionType && Math.abs(r.strike - conv.spxStrike) < 0.01);
  // The monthly SPX (AM-settled) shares the date on 3rd Fridays — the mirror is the PM-settled SPXW.
  const row = matches.find((r) => String(r.symbol ?? '').startsWith('SPXW')) ?? matches.find((r) => !r.symbol);
  if (!row) return { ...base, reason: `SPXW ${conv.spxStrike}${input.optionType === 'call' ? 'C' : 'P'} ${input.expiry} not in the CBOE delayed chain` };
  const b = Number(row.bid); const a = Number(row.ask);
  const bid = b > 0 ? b : null; const ask = a > 0 ? a : null;
  const mid = bid != null && ask != null && ask >= bid ? round2((bid + ask) / 2) : null;
  const premium: SpxMirrorPremium = { mid, bid, ask, asOf: new Date(chain.fetchedAt).toISOString(), delayedSec: CBOE_DELAY_SEC, source: 'CBOE delayed' };
  return mid != null
    ? { ...base, status: 'ok', premium }
    : { ...base, premium, reason: 'SPXW listed but no two-sided quote in the delayed chain' };
}
