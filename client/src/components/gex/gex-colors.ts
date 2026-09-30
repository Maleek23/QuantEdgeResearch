/**
 * GEX / VEX colour law — one mapping for the whole GEX hub (CVD-safe palette).
 * Every colour here is a CSS custom property, never a literal: the values come
 * from the ACTIVE visual mode — nexus.css (dark, light) and styles/modes.css
 * (midnight, dim, high contrast re-value --cyan/--red/--green/--amber and the
 * --gx-* ramp on `html[data-mode] .nexus-vars`) — so switching mode re-grounds
 * every GEX surface with no JS. The hex after each var() is only the fallback:
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

import type { GammaRegime } from '@shared/gex-regime';
import { fmtUsd } from '@/lib/format';

export type ExposureKind = 'gex' | 'vex' | 'gexPlus';

// Hex fallbacks so surfaces outside nexus.css (the research chart) get the same law.
const CYAN = 'var(--cyan, #3b8cff)';
const CYAN_BRIGHT = 'var(--cyan-bright, #6aa8ff)';
const RED = 'var(--red, #ff6b3d)';
const GREEN = 'var(--green, #6ee7b7)';
const AMBER = 'var(--amber, #f4b942)';
const MUTE = 'var(--text-mute, #8a93a6)';

export function exposureVar(kind: ExposureKind, v: number): string {
  if (!Number.isFinite(v) || v === 0) return MUTE;
  if (kind === 'vex') return v > 0 ? GREEN : RED;
  return v > 0 ? CYAN : RED;
}

/** Text colour: the brighter accent for +GEX so it reads on dark panels. */
export function exposureText(kind: ExposureKind, v: number): string {
  if (!Number.isFinite(v) || v === 0) return MUTE;
  if (kind !== 'vex' && v > 0) return CYAN_BRIGHT;
  return exposureVar(kind, v);
}

/**
 * Gamma REGIME colour — follows the GEX pair: positive = blue (dealers long
 * gamma, stabilising), negative = vermilion (dealers short gamma, amplifying),
 * neutral / near the flip = amber. Words come from shared/gex-regime.ts.
 */
export function regimeColor(regime: GammaRegime | null | undefined, nearFlip = false): string {
  if (nearFlip || regime === 'neutral' || !regime) return AMBER;
  return regime === 'positive' ? CYAN_BRIGHT : RED;
}

/** Background tint whose strength scales with |v| / max (8% … 48%). */
export function exposureBg(kind: ExposureKind, v: number, maxAbs: number): string {
  if (!Number.isFinite(v) || v === 0 || !(maxAbs > 0)) return 'transparent';
  const t = Math.min(1, Math.sqrt(Math.abs(v) / maxAbs));
  const pct = Math.round(8 + 40 * t);
  return `color-mix(in srgb, ${exposureVar(kind, v)} ${pct}%, transparent)`;
}

/** GEX from a snapshot field ($B per 1%) → "−$1.40B". */
export const fmtGexB = (billions: number | null | undefined) => (billions == null ? '—' : fmtSignedUsd(billions * 1e9));
/** VEX from a snapshot field ($M per IV point) → "−$6.4B". */
export const fmtVexM = (millions: number | null | undefined) => (millions == null ? '—' : fmtSignedUsd(millions * 1e6));

/** Signed dollars: +$5.29M / −$24.4M / +$812K. Input in whole dollars. */
export const fmtSignedUsd = (v: number | null | undefined): string => fmtUsd(v, { compact: true, signed: true });

export function fmtAge(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  if (sec < 172800) return `${(sec / 3600).toFixed(sec < 36000 ? 1 : 0)}h`;
  return `${Math.round(sec / 86400)}d`;
}

/* ─────────────────────────────────────────────────────────────────────────
 * DIVERGING EXPOSURE RAMP (2026-09-29) — the strike × expiry matrix and the
 * ladder. Operator: "on later dates you can't even tell what's going on or
 * which is what based on colour". Two causes, two fixes:
 *
 *  1. ONE colour scale was shared by every expiry, so near-term gamma (0–2
 *     DTE nodes are routinely 10–100× the monthly ones) set the max and every
 *     later column washed out → the matrix normalises PER EXPIRY by default
 *     (each column 0 → its own max), with an "absolute" toggle.
 *  2. The tint was the sign hue mixed into transparent (16–72%), so lightness
 *     AND hue drifted together and small cells of either sign became the same
 *     dark smudge → a perceptually uniform DIVERGING ramp built in OKLab:
 *     lightness rises monotonically with |value| (magnitude reads the same on
 *     both sides), hue is FIXED per side — blue (+, dealers long gamma,
 *     provides liquidity) ↔ orange/vermilion (−, dealers short gamma, takes
 *     liquidity). Blue↔orange sits on the b* (yellow–blue) axis that protan
 *     and deutan vision keep, and tritan still separates it by hue; OKLab ΔE
 *     (×100) between the sides at mid ramp: normal 32 · protan 26 · deutan 30
 *     · tritan 32 (Machado 2009 simulation). Same family as the +GEX blue /
 *     −GEX vermilion law, so the meaning never flips. (Cividis/vik/berlin
 *     class — dark-centred like berlin because the panels are dark.)
 *
 * Stops are CSS tokens (styles/nexus.css `--gx-pos-*` / `--gx-neg-*`, re-valued
 * per visual mode in styles/modes.css — the zero stop is each mode's own panel,
 * and in light the ramp runs light → dark); the hex values below are the
 * fallbacks = the dark-mode ramp (OKLCH → sRGB):
 *
 *            t=0 (≈0)    t=½ (¼ of max)   t=1 (max)
 *   + side   #1d3559     #3680dd          #a4d8fe     L .33 → .60 → .86, h≈255
 *   − side   #532718     #de6129          #ffc898     L .33 → .64 → .87, h 40→62
 *
 * VEX uses the same ramp inside the grids (+ provides / − takes liquidity).
 * t = √(|v| / scale max): square-root keeps small real nodes visible next to
 * one giant node. The value is always printed too — colour is never alone.
 * ───────────────────────────────────────────────────────────────────────── */
const RAMP = {
  pos: ['var(--gx-pos-0, #1d3559)', 'var(--gx-pos-1, #3680dd)', 'var(--gx-pos-2, #a4d8fe)'],
  neg: ['var(--gx-neg-0, #532718)', 'var(--gx-neg-1, #de6129)', 'var(--gx-neg-2, #ffc898)'],
} as const;

/** Colour of a signed value at ramp position t ∈ [0,1] (t = √(|v|/max)). */
export function rampColor(sign: number, t: number): string {
  if (!Number.isFinite(t) || !sign) return 'transparent';
  const s = RAMP[sign > 0 ? 'pos' : 'neg'];
  const u = Math.max(0, Math.min(1, t));
  if (u <= 0.5) return `color-mix(in oklab, ${s[1]} ${Math.round(u * 200)}%, ${s[0]})`;
  return `color-mix(in oklab, ${s[2]} ${Math.round((u - 0.5) * 200)}%, ${s[1]})`;
}

/** Ink that stays readable on a ramp cell (dark ink on the light end; the light theme flips it). */
export function rampInk(t: number): string {
  return t >= 0.62 ? 'var(--gx-ink-hi, #07121f)' : 'var(--gx-ink-lo, #e8ecf3)';
}

/** The whole diverging ramp, −max … 0 … +max, as a CSS gradient (legends). */
export function rampGradient(steps = 8): string {
  const stops: string[] = [];
  for (let i = steps; i >= 1; i--) stops.push(rampColor(-1, i / steps));
  stops.push('var(--gx-zero, #0b0f16)');
  for (let i = 1; i <= steps; i++) stops.push(rampColor(1, i / steps));
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
/** 0..1 magnitude on the same √ scale — drives in-cell bars and legend stops. */
export function exposureStrength(v: number, maxAbs: number): number {
  if (!Number.isFinite(v) || !(maxAbs > 0)) return 0;
  return Math.min(1, Math.sqrt(Math.abs(v) / maxAbs));
}

/** Structural level colours — one law for every strike grid and ladder. */
export const LEVEL_COLORS = {
  callWall: CYAN_BRIGHT,              // largest call γ above spot — same hue as +GEX
  putWall: RED,                       // largest put γ below spot — same hue as −GEX
  magnet: 'var(--purple, #a78bfa)',   // max |γ| strike — distinct from both signs
  zeroGamma: AMBER,                   // regime boundary — caution
  spot: 'var(--text, #e8ecf3)',
} as const;
