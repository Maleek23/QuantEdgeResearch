/**
 * FEATURE FLAGS — the Skylit-gap features (research/skylit-teardown/REPORT.md).
 * Every flag defaults ON in code. Switch one off without a deploy of new code:
 *
 *   server   env  FLAG_<NAME>=off   (off | 0 | false)   e.g. FLAG_TRIPWIRE_LEVELS=off
 *   client   build env VITE_FLAG_<NAME>=off, or per device
 *            localStorage['qe-flag-<name>'] = 'off'      e.g. qe-flag-envelope_v2
 *
 * Framework-free: callers pass the env/storage they have (tests inject both).
 */
export const FEATURE_FLAGS = {
  /** Envelope: 1σ/2σ cones, intraday shape, skew, frozen 09:40 cone + move vs priced. */
  ENVELOPE_V2: true,
  /** Gravity: Gatekeeper / Rug / Trampoline / delivered-vs-fresh labels + node velocity + Halo. */
  GRAVITY_LABELS: true,
  /** Tripwire: approach/touch alerts on Apex, Gatekeeper, walls, zero-γ for watchlist symbols. */
  TRIPWIRE_LEVELS: true,
  /** Quantinum: ⌘\ side panel on every app page with page context + push-back. */
  QUANTINUM_PANEL: true,
  /** Proof: public /proof page (verified Ledger record + Path calibration). */
  PROOF_PAGE: true,
} as const;
export type FeatureFlag = keyof typeof FEATURE_FLAGS;

const OFF = new Set(['off', '0', 'false', 'no']);
const ON = new Set(['on', '1', 'true', 'yes']);

/** Resolve a flag: explicit override (storage, then env) else the code default. Pure. */
export function flagOn(
  name: FeatureFlag,
  sources: { env?: Record<string, string | undefined>; storage?: { getItem(k: string): string | null } | null } = {},
): boolean {
  let v: string | null | undefined;
  try { v = sources.storage?.getItem(`qe-flag-${name.toLowerCase()}`); } catch { v = null; }
  if (v == null) v = sources.env?.[`FLAG_${name}`] ?? sources.env?.[`VITE_FLAG_${name}`];
  const s = String(v ?? '').trim().toLowerCase();
  if (OFF.has(s)) return false;
  if (ON.has(s)) return true;
  return FEATURE_FLAGS[name];
}

/** Server convenience: process.env. */
export function serverFlag(name: FeatureFlag): boolean {
  return flagOn(name, { env: typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : {} });
}
