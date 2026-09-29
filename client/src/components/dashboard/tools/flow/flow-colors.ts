/**
 * FLOW colour law — one mapping for every FLOW tool, following the GEX
 * convention in components/gex/gex-colors.ts (CVD-safe blue / vermilion,
 * tokens from nexus.css so the light theme re-grounds them):
 *
 *   calls              → accent blue   (--cyan / --cyan-bright)
 *   puts               → vermilion     (--red)
 *   + net premium /    → blue, − → vermilion (the sign is always printed too)
 *   long / short
 *   dark-pool levels   → purple (a price level, not a direction)
 *   spot               → the text colour, dashed
 *
 * Never green-vs-red for direction. Colour is never the only carrier: every
 * value prints C/P, a sign, or the word.
 */
export const CALL = 'var(--cyan-bright, #6aa8ff)';
export const CALL_FILL = 'var(--cyan, #3b8cff)';
export const PUT = 'var(--red, #ff6b3d)';
export const DARK_POOL = 'var(--purple, #a78bfa)';
export const MUTE = 'var(--text-mute, #8a93a6)';
export const SPOT = 'var(--text, #e8ecf3)';
export const AMBER = 'var(--amber, #f4b942)';

export const typeColor = (t: 'call' | 'put') => (t === 'call' ? CALL : PUT);
export const typeFill = (t: 'call' | 'put') => (t === 'call' ? CALL_FILL : PUT);
export const signColor = (v: number | null | undefined) => (v == null || !Number.isFinite(v) || v === 0 ? MUTE : v > 0 ? CALL : PUT);
export const sideColor = (d: 'long' | 'short' | string) => (d === 'short' ? PUT : CALL);

/** Cell tint on the √ ramp the GEX grids use (16% … 72%), so a mega strike doesn't blank its neighbours. */
export function cellTint(color: string, v: number, maxAbs: number): string {
  if (!Number.isFinite(v) || v === 0 || !(maxAbs > 0)) return 'transparent';
  const t = Math.min(1, Math.sqrt(Math.abs(v) / maxAbs));
  return `color-mix(in srgb, ${color} ${Math.round(16 + 56 * t)}%, transparent)`;
}
