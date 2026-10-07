/**
 * OPTION PEAK (MFE) — the best premium a contract printed after entry, as its
 * own recorded fact beside the exit.
 *
 * WHY (operator, 2026-10-07): zero_dte_flow TSLA 380P 0DTE published 09:58 ET at
 * $3.05 resolved hit_target at T1 ~10:00 with exit $4.22 (intrinsic; quote 3.53),
 * but the contract kept running to ~$5.00–5.45. The record kept only the exit, so
 * winners were under-recorded and nobody could measure how much a runner leaves.
 *
 * WHAT IS RECORDED (one tag per idea, outcome_notes; one entry-signal per bot row)
 *   premium   the max favourable contract price after entry, through the window
 *   at        when it printed (bar start / quote time)
 *   basis     'bar'       a contract trade bar's HIGH (Massive / Alpaca / Yahoo prints)
 *             'quote'     a live mid the tracker / bot observed
 *             'intrinsic' intrinsic at the underlying's best print (a floor, used when
 *                         no contract print exists — never higher than a real print)
 *   source    the feed ("alpaca:1Min", "massive:1m", "quote:tradier", …)
 *   window    'to_exit' (entry → resolution) or 'to_eod' (entry → 16:00 ET of the
 *             exit session — what a held contract could still have been sold for)
 *   underlying the underlying's most favourable print in the same window, and when
 *
 * Integrity: a later pass may only REPLACE a peak with a higher premium, or the same
 * premium on a better basis (bar > quote > intrinsic). The peak is hindsight beside
 * the outcome; outcome_status / exit_premium / option_percent_gain are never touched.
 *
 * Pure: no I/O. server/option-peak-job.ts fetches bars and writes the tag.
 */

export type PeakBasis = 'bar' | 'quote' | 'intrinsic';
export type PeakWindow = 'to_exit' | 'to_eod';

export interface OptionPeak {
  premium: number;
  atMs: number;
  basis: PeakBasis;
  source: string;
  window: PeakWindow;
  underlying?: number | null;
  underlyingAtMs?: number | null;
}

export interface PeakBar { t: number; o: number; h: number; l: number; c: number }

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r2 = (x: number) => Math.round(x * 100) / 100;
const BASIS_RANK: Record<PeakBasis, number> = { bar: 3, quote: 2, intrinsic: 1 };

/**
 * Highest contract HIGH over bars that START at/after `fromMs` (the entry bar's
 * pre-entry part is not attributable) and before `toMs`. Earliest bar wins a tie.
 */
export function premiumPeakFromBars(bars: PeakBar[], fromMs: number, toMs: number, barMs = 60_000): { premium: number; atMs: number } | null {
  let best: { premium: number; atMs: number } | null = null;
  const start = Math.floor(fromMs / barMs) * barMs + (fromMs % barMs === 0 ? 0 : barMs);
  for (const b of bars) {
    if (!fin(b.t) || b.t < start || b.t >= toMs || !fin(b.h) || !(b.h > 0)) continue;
    if (!best || b.h > best.premium) best = { premium: b.h, atMs: b.t };
  }
  return best ? { premium: r2(best.premium), atMs: best.atMs } : null;
}

/** The underlying's most favourable print (long: max high, short: min low) in [fromMs, toMs). */
export function underlyingPeakFromBars(bars: PeakBar[], dir: 'long' | 'short', fromMs: number, toMs: number): { price: number; atMs: number } | null {
  let best: { price: number; atMs: number } | null = null;
  for (const b of bars) {
    if (!fin(b.t) || b.t < fromMs || b.t >= toMs) continue;
    const px = dir === 'long' ? b.h : b.l;
    if (!fin(px) || !(px > 0)) continue;
    if (!best || (dir === 'long' ? px > best.price : px < best.price)) best = { price: px, atMs: b.t };
  }
  return best;
}

/** Intrinsic at an underlying print (call: S−K, put: K−S, ≥ 0). */
export function intrinsicAt(optionType: string | null | undefined, strike: number, underlying: number): number | null {
  if (!(strike > 0) || !(underlying > 0)) return null;
  const put = String(optionType ?? '').toLowerCase().startsWith('p');
  return r2(Math.max(0, put ? strike - underlying : underlying - strike));
}

/** Keep the better of two peaks: higher premium; same premium → better basis; else the existing one. */
export function mergePeak(prev: OptionPeak | null, next: OptionPeak | null): OptionPeak | null {
  if (!next || !(next.premium > 0)) return prev;
  if (!prev) return next;
  if (next.premium > prev.premium + 1e-9) return next;
  if (Math.abs(next.premium - prev.premium) <= 1e-9 && BASIS_RANK[next.basis] > BASIS_RANK[prev.basis]) return next;
  // A to_eod window supersedes a to_exit one at the same premium (wider, same fact).
  if (Math.abs(next.premium - prev.premium) <= 1e-9 && next.window === 'to_eod' && prev.window === 'to_exit') return { ...prev, window: 'to_eod' };
  return prev;
}

// ── tag (outcome_notes) ─────────────────────────────────────────────────────
// [peak:5.45@2026-10-07T14:12Z|bar|alpaca:1Min|to_eod|u=374.10@2026-10-07T14:14Z]

export const PEAK_TAG_RE = /\[peak:(\d+(?:\.\d+)?)@(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z)\|(bar|quote|intrinsic)\|([^|\]]*)\|(to_exit|to_eod)(?:\|u=(\d+(?:\.\d+)?)@(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z))?\]/;
const isoMin = (ms: number) => new Date(ms).toISOString().slice(0, 16) + 'Z';

export function peakTag(p: OptionPeak): string {
  const u = p.underlying != null && p.underlying > 0 && p.underlyingAtMs != null && fin(p.underlyingAtMs)
    ? `|u=${p.underlying}@${isoMin(p.underlyingAtMs)}` : '';
  return `[peak:${r2(p.premium)}@${isoMin(p.atMs)}|${p.basis}|${p.source.replace(/[|\]]/g, '/')}|${p.window}${u}]`;
}

export function parsePeak(notes: string | null | undefined): OptionPeak | null {
  const m = PEAK_TAG_RE.exec(String(notes ?? ''));
  if (!m) return null;
  const atMs = Date.parse(m[2].replace('Z', ':00Z'));
  if (!fin(atMs)) return null;
  const uAt = m[7] ? Date.parse(m[7].replace('Z', ':00Z')) : NaN;
  return {
    premium: Number(m[1]), atMs, basis: m[3] as PeakBasis, source: m[4], window: m[5] as PeakWindow,
    underlying: m[6] ? Number(m[6]) : null, underlyingAtMs: fin(uAt) ? uAt : null,
  };
}

/** Notes with the peak tag set to the better of the stored and the new one. Unchanged string when nothing improves. */
export function withPeakTag(notes: string | null | undefined, next: OptionPeak): string {
  const base = String(notes ?? '');
  const prev = parsePeak(base);
  const best = mergePeak(prev, next)!;
  if (prev && best === prev) return base;
  const tag = peakTag(best);
  if (prev) return base.replace(PEAK_TAG_RE, tag);
  return base ? `${base}\n${tag}` : tag;
}

// ── display ─────────────────────────────────────────────────────────────────

const ET_HM = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: false });
export const etHmOf = (ms: number) => ET_HM.format(new Date(ms)).replace(/^24:/, '00:');
const money = (v: number) => `$${v.toFixed(2)}`;

/** "peak $5.45 at 10:12 · exit $4.22" (times ET). */
export function peakLine(p: OptionPeak | null, exitPremium?: number | null): string | null {
  if (!p) return null;
  const exit = exitPremium != null && fin(exitPremium) ? ` · exit ${money(exitPremium)}` : '';
  const how = p.basis === 'bar' ? '' : p.basis === 'quote' ? ' (quote)' : ' (intrinsic)';
  return `peak ${money(p.premium)}${how} at ${etHmOf(p.atMs)}${exit}`;
}

/**
 * Share of the available move the exit kept: (exit − entry) ÷ (peak − entry).
 * Null when the contract never traded above entry or inputs are missing; ≤ 1; can be < 0.
 */
export function peakCapture(entryPremium: number | null | undefined, exitPremium: number | null | undefined, peakPremium: number | null | undefined): number | null {
  if (!fin(entryPremium) || !fin(exitPremium) || !fin(peakPremium) || !(entryPremium > 0)) return null;
  const avail = peakPremium - entryPremium;
  if (!(avail > 0)) return null;
  return Math.min(1, (exitPremium - entryPremium) / avail);
}

// ── bot rows: the peak rides in paper_positions.entry_signals (JSON string array) ──

const SIG_PREFIX = 'peak:';

/** entry_signals with one `peak:{json}` entry set to the better peak; null when the column is not a JSON array. */
export function withPeakSignal(entrySignals: string | null | undefined, next: OptionPeak): string | null {
  let arr: unknown;
  try { arr = entrySignals ? JSON.parse(entrySignals) : []; } catch { return null; }
  if (!Array.isArray(arr)) return null;
  const prev = readPeakSignal(entrySignals);
  const best = mergePeak(prev, next)!;
  if (prev && best === prev) return entrySignals ?? '[]';
  const rest = arr.filter((s) => !(typeof s === 'string' && s.startsWith(SIG_PREFIX)));
  rest.push(SIG_PREFIX + JSON.stringify({ p: best.premium, t: best.atMs, b: best.basis, s: best.source, w: best.window, u: best.underlying ?? null, ut: best.underlyingAtMs ?? null }));
  return JSON.stringify(rest);
}

export function readPeakSignal(entrySignals: string | null | undefined): OptionPeak | null {
  try {
    const arr = entrySignals ? JSON.parse(entrySignals) : null;
    if (!Array.isArray(arr)) return null;
    const s = arr.find((x) => typeof x === 'string' && x.startsWith(SIG_PREFIX));
    if (!s) return null;
    const j = JSON.parse(String(s).slice(SIG_PREFIX.length));
    if (!fin(j?.p) || !fin(j?.t)) return null;
    return { premium: j.p, atMs: j.t, basis: j.b ?? 'quote', source: j.s ?? 'unknown', window: j.w ?? 'to_exit', underlying: fin(j.u) ? j.u : null, underlyingAtMs: fin(j.ut) ? j.ut : null };
  } catch { return null; }
}
