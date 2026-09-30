/**
 * THE formatting helpers for numbers, units and time in the signed-in app.
 * Rules live in docs/UX_COPY_GUIDE.md ("Numbers, units and time"); in short:
 *
 *   missing / NaN / ±Infinity  → "—"  (never "NaN", "undefined", "$0.00" or "0%")
 *   minus sign                 → "−" (U+2212), plus sign only when `signed`
 *   money                      → "$1,234.56"  · compact "$1.2M" / "$812K" / "$2.35B"
 *   percent                    → "4.2%" (1 dp default) · signed "+4.2%"
 *   R multiple                 → "+1.3R" / "−1.0R" (1 dp, always signed)
 *   win rate                   → "42% · n=88" — never a rate without its n
 *   GEX / VEX                  → "$1.2B per 1% move" (GEX) · "$640M per vol pt" (VEX)
 *   age                        → "just now" · "45s ago" · "2m ago" · "3h ago" · "2d ago"
 *   clock                      → "09:45 ET" (24h, New York time, always labelled)
 *
 * Pure (no React, no DOM) so scripts can test it. New code imports from here.
 * Older per-file helpers still differ in edge cases (e.g. ticker-data fmtPct
 * prints "+0.00%" at zero) — see docs/SIMPLIFY_TODO.md before repointing them.
 */

export const MISSING = '—';
const MINUS = '−';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const toNum = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const sign = (n: number, signed: boolean) => (n < 0 ? MINUS : signed && n > 0 ? '+' : '');

/** Plain number with fixed decimals: 1234.5 → "1,234.5". */
export function fmtNum(v: unknown, decimals = 0): string {
  const n = toNum(v);
  if (n == null) return MISSING;
  return `${n < 0 ? MINUS : ''}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** Dollars. `compact` → $1.2M; `signed` → +$40.00. Sub-dollar prices keep 2 dp; crypto dust keeps significant digits. */
export function fmtUsd(v: unknown, opts: { compact?: boolean; signed?: boolean; decimals?: number } = {}): string {
  const n = toNum(v);
  if (n == null) return MISSING;
  const a = Math.abs(n);
  const s = sign(n, !!opts.signed);
  if (opts.compact) {
    if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
    return `${s}$${a.toFixed(0)}`;
  }
  let d = opts.decimals ?? 2;
  if (opts.decimals == null && a > 0 && a < 0.01) {
    const lead = Math.floor(-Math.log10(a)); // 0.000123 → 3
    d = Math.min(lead + 3, 8);
  }
  return `${s}$${a.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

/** Percent from a value already in percent units (4.2 → "4.2%"). */
export function fmtPct(v: unknown, opts: { decimals?: number; signed?: boolean } = {}): string {
  const n = toNum(v);
  if (n == null) return MISSING;
  const d = opts.decimals ?? 1;
  return `${sign(n, !!opts.signed)}${Math.abs(n).toFixed(d)}%`;
}

/** Percent from a ratio (0.42 → "42%"). */
export function fmtRatioPct(v: unknown, opts: { decimals?: number; signed?: boolean } = {}): string {
  const n = toNum(v);
  return n == null ? MISSING : fmtPct(n * 100, { decimals: opts.decimals ?? 0, signed: opts.signed });
}

/** R multiple, always signed, 1 dp: 1.25 → "+1.3R". */
export function fmtR(v: unknown, decimals = 1): string {
  const n = toNum(v);
  if (n == null) return MISSING;
  return `${sign(n, true)}${Math.abs(n).toFixed(decimals)}R`;
}

/**
 * Win rate with its sample size — the only way a rate may be shown.
 * `rate` is in percent (0–100) or a ratio (0–1, pass `ratio: true`).
 * n = 0 → "— · n=0".
 */
export function fmtWinRate(rate: unknown, n: unknown, opts: { ratio?: boolean; decimals?: number } = {}): string {
  const count = toNum(n);
  const r = toNum(rate);
  const nPart = `n=${count == null ? 0 : Math.round(count)}`;
  if (r == null || !count) return `${MISSING} · ${nPart}`;
  const pct = opts.ratio ? r * 100 : r;
  return `${pct.toFixed(opts.decimals ?? 0)}% · ${nPart}`;
}

/** GEX in dollars per 1% move of the underlying: "+$1.2B per 1% move" (`short` → "+$1.2B/1%"). */
export function fmtGex(dollars: unknown, short = false): string {
  const n = toNum(dollars);
  if (n == null) return MISSING;
  return `${fmtUsd(n, { compact: true, signed: true })}${short ? '/1%' : ' per 1% move'}`;
}

/** VEX in dollars per 1 vol point: "−$640M per vol pt" (`short` → "−$640M/vol pt"). */
export function fmtVex(dollars: unknown, short = false): string {
  const n = toNum(dollars);
  if (n == null) return MISSING;
  return `${fmtUsd(n, { compact: true, signed: true })}${short ? '/vol pt' : ' per vol pt'}`;
}

/** Seconds → "45s" / "2m" / "3.4h" / "2d" (chips and table cells, no "ago"). */
export function fmtDuration(sec: unknown): string {
  const s = toNum(sec);
  if (s == null || s < 0) return MISSING;
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  if (s < 172800) return `${(s / 3600).toFixed(s < 36000 ? 1 : 0).replace(/\.0$/, "")}h`;
  return `${Math.round(s / 86400)}d`;
}

/** A timestamp (ms, ISO or Date) → "just now" / "45s ago" / "2m ago" / "3h ago" / "2d ago". */
export function fmtAgo(when: unknown, now: number = Date.now()): string {
  const t = when instanceof Date ? when.getTime() : typeof when === 'string' ? Date.parse(when) : toNum(when);
  if (t == null || !finite(t) || t <= 0) return 'age unknown';
  const s = Math.max(0, (now - t) / 1000);
  if (s < 10) return 'just now';
  return `${fmtDuration(s)} ago`;
}

/** Clock time in New York: "09:45 ET". */
export function fmtTimeET(when: unknown): string {
  const t = when instanceof Date ? when.getTime() : typeof when === 'string' ? Date.parse(when) : toNum(when);
  if (t == null || !finite(t)) return MISSING;
  const hm = new Date(t).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
  return `${hm} ET`;
}
