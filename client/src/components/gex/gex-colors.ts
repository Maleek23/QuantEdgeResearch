/**
 * GEX / VEX colour law — one mapping for the whole GEX hub (CVD-safe palette,
 * tokens from nexus.css so the light theme re-grounds them):
 *
 *   +GEX  dealer long gamma, liquidity PROVIDED, stabilising  → accent blue  (--cyan  #3b8cff)
 *   −GEX  dealer short gamma, liquidity TAKEN                  → vermilion    (--red   #ff6b3d)
 *   +VEX  dealers buy as IV rises — liquidity provided         → mint         (--green #6ee7b7)
 *   −VEX  dealers sell as IV rises — crash fuel (the dangerous one) → vermilion + ⚠
 *   GEX+  follows the GEX pair (it is total option-originated liquidity)
 *
 * Colour is never the only carrier: every value prints its sign, and each
 * surface shows the legend "+ provides liquidity / − takes liquidity".
 * Intensity scales with magnitude (sqrt, so one mega node does not flatten
 * everything else to invisible).
 */

export type ExposureKind = 'gex' | 'vex' | 'gexPlus';

export function exposureVar(kind: ExposureKind, v: number): string {
  if (!Number.isFinite(v) || v === 0) return 'var(--text-mute)';
  if (kind === 'vex') return v > 0 ? 'var(--green)' : 'var(--red)';
  return v > 0 ? 'var(--cyan)' : 'var(--red)';
}

/** Text colour: the brighter accent for +GEX so it reads on dark panels. */
export function exposureText(kind: ExposureKind, v: number): string {
  if (!Number.isFinite(v) || v === 0) return 'var(--text-mute)';
  if (kind !== 'vex' && v > 0) return 'var(--cyan-bright)';
  return exposureVar(kind, v);
}

/** Background tint whose strength scales with |v| / max (8% … 48%). */
export function exposureBg(kind: ExposureKind, v: number, maxAbs: number): string {
  if (!Number.isFinite(v) || v === 0 || !(maxAbs > 0)) return 'transparent';
  const t = Math.min(1, Math.sqrt(Math.abs(v) / maxAbs));
  const pct = Math.round(8 + 40 * t);
  return `color-mix(in srgb, ${exposureVar(kind, v)} ${pct}%, transparent)`;
}

/** Signed dollars: +$5.29M / −$24.4M / +$812K. Input in whole dollars. */
export function fmtSignedUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = v > 0 ? '+' : v < 0 ? '−' : '';
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(0)}K`;
  return `${s}$${a.toFixed(0)}`;
}

export function fmtAge(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  if (sec < 172800) return `${(sec / 3600).toFixed(sec < 36000 ? 1 : 0)}h`;
  return `${Math.round(sec / 86400)}d`;
}
