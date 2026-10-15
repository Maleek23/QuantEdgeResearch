/**
 * CHART SETTINGS MODEL — grouped settings sheet, quick-toggle chips, per-layer
 * style (opacity + colour) and saved TEMPLATES ("0DTE scalp", "Swing", "Clean"
 * + the user's own). Pure: shared by the client sheet, the server store
 * (server/chart-templates-store.ts) and scripts/test-chart-v3.ts.
 *
 * A template holds only display keys (layers, indicators, candle type, scale),
 * never the timeframe or symbol, so switching template never moves the chart.
 */

/** Pref keys a template may carry. Values are primitives (bool / short string). */
export const TEMPLATE_KEYS = [
  'type', 'scale', 'extended', 'fullVolume', 'ema', 'vwap', 'ma', 'keyLevels',
  'walls', 'gex', 'gexMetric', 'gexLabels', 'gexProject', 'horizon',
  'expMove', 'path', 'pathHorizon', 'dp', 'flow', 'magnet',
] as const;
export type TemplateKey = typeof TEMPLATE_KEYS[number];
export type TemplatePrefs = Partial<Record<TemplateKey, boolean | string>>;

export interface ChartTemplate { id: string; name: string; builtin?: boolean; prefs: TemplatePrefs }

export const BUILTIN_TEMPLATES: ChartTemplate[] = [
  {
    id: 'scalp0dte', name: '0DTE scalp', builtin: true,
    prefs: { walls: true, gex: 'bubbles', gexMetric: 'gex', gexLabels: true, gexProject: true, horizon: 'today', expMove: true, path: true, pathHorizon: 'session', vwap: true, keyLevels: true, ema: false, flow: true, dp: false, extended: true },
  },
  {
    id: 'swing', name: 'Swing', builtin: true,
    prefs: { walls: true, gex: 'bubbles', gexMetric: 'both', gexLabels: true, gexProject: true, horizon: 'opex', expMove: true, path: true, pathHorizon: 'week', vwap: false, keyLevels: false, ema: true, flow: false, dp: true, extended: false },
  },
  {
    id: 'clean', name: 'Clean', builtin: true,
    prefs: { walls: false, gex: 'off', gexLabels: false, gexProject: false, expMove: false, path: false, vwap: false, keyLevels: false, ema: false, ma: false, flow: false, dp: false },
  },
];

export function applyTemplate<P extends object>(prefs: P, tpl: ChartTemplate): P {
  return { ...prefs, ...tpl.prefs } as P;
}

export function templateFromPrefs(name: string, prefs: Record<string, unknown>, id = `u${Date.now().toString(36)}`): ChartTemplate {
  const out: TemplatePrefs = {};
  for (const k of TEMPLATE_KEYS) { const v = prefs[k]; if (typeof v === 'boolean' || (typeof v === 'string' && v.length <= 16)) out[k] = v; }
  return { id, name: name.trim().slice(0, 32) || 'My template', prefs: out };
}

export const MAX_USER_TEMPLATES = 20;
export function sanitizeTemplates(raw: unknown): ChartTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: ChartTemplate[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as { id?: unknown; name?: unknown; prefs?: unknown };
    if (typeof o.id !== 'string' || !/^[\w-]{1,40}$/.test(o.id) || typeof o.name !== 'string' || !o.prefs || typeof o.prefs !== 'object') continue;
    const t = templateFromPrefs(o.name, o.prefs as Record<string, unknown>, o.id);
    out.push(t);
    if (out.length >= MAX_USER_TEMPLATES) break;
  }
  return out;
}

/* ── per-layer appearance ── */
export const STYLE_LAYERS = ['path', 'em', 'gex', 'walls', 'dp', 'flow'] as const;
export type StyleLayer = typeof STYLE_LAYERS[number];
export const STYLE_LAYER_LABEL: Record<StyleLayer, string> = { path: 'Path fan', em: 'Expected move', gex: 'GEX orbs', walls: 'Walls & flip', dp: 'Dark pool', flow: 'Flow prints' };
export type LabelDensity = 'low' | 'normal' | 'high';
/** Chart Path look: 'clean' (dot trail, hairline 80% outline, one glowing target, detail on hover — default)
 *  or 'detailed' (filled 50/80% fans, median line, density, always-on tags). */
export type PathStyle = 'clean' | 'detailed';
export const PATH_STYLES: { id: PathStyle; label: string; hint: string }[] = [
  { id: 'clean', label: 'Clean', hint: 'Dot trail, faint 80% outline, one highlighted target; fans and tags on hover' },
  { id: 'detailed', label: 'Detailed', hint: 'Filled 50 / 80% fans, median line, density and tags always on' },
];
export interface ChartStyle {
  opacity: Record<StyleLayer, number>;
  /** Override colours (#rrggbb). Missing = theme token. */
  color: Partial<Record<StyleLayer, string>>;
  lineWidth: 1 | 2 | 3;
  labelDensity: LabelDensity;
  pathStyle: PathStyle;
  /** Desaturated candles so overlays read first. */
  lowChroma: boolean;
}
export const DEFAULT_CHART_STYLE: ChartStyle = {
  opacity: { path: 1, em: 1, gex: 1, walls: 1, dp: 1, flow: 1 },
  color: {}, lineWidth: 1, labelDensity: 'normal', pathStyle: 'clean', lowChroma: false,
};
export function sanitizeChartStyle(raw: unknown): ChartStyle {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { opacity?: Record<string, unknown>; color?: Record<string, unknown>; lineWidth?: unknown; labelDensity?: unknown; pathStyle?: unknown; lowChroma?: unknown };
  const opacity = { ...DEFAULT_CHART_STYLE.opacity };
  const color: ChartStyle['color'] = {};
  for (const k of STYLE_LAYERS) {
    const v = Number(o.opacity?.[k]);
    if (Number.isFinite(v)) opacity[k] = Math.max(0.1, Math.min(1, v));
    const c = o.color?.[k];
    if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) color[k] = c;
  }
  const lw = Number(o.lineWidth);
  return {
    opacity, color,
    lineWidth: (Number.isFinite(lw) ? Math.max(1, Math.min(3, Math.round(lw))) : 1) as 1 | 2 | 3,
    labelDensity: o.labelDensity === 'low' || o.labelDensity === 'high' ? o.labelDensity : 'normal',
    pathStyle: o.pathStyle === 'detailed' ? 'detailed' : 'clean',
    lowChroma: o.lowChroma === true,
  };
}

/* ── Clean path plan (pure; drawn by client/src/components/charting/tv/path-primitive.ts) ── */
export interface CleanLevel { name: string; price: number; touch: number; weight: number; highlight: boolean }
/** The ONE highlighted level is the highest touch-probability target; every other level gets a
 *  0.15..1 weight from |GEX| at its strike (nearest node within tol; 0.15 when no node is known). */
export function cleanPathLevels(
  levels: { name: string; price: number; touch: number }[],
  nodes: { strike: number; gex: number }[] = [],
  tol = 0,
): CleanLevel[] {
  if (!levels.length) return [];
  let hi = 0;
  levels.forEach((l, i) => { if (l.touch > levels[hi].touch) hi = i; });
  const maxAbs = Math.max(0, ...nodes.map((n) => Math.abs(n.gex)));
  const gexAt = (p: number) => {
    let best: { strike: number; gex: number } | null = null;
    for (const n of nodes) if (Math.abs(n.strike - p) <= tol + 1e-9 && (!best || Math.abs(n.strike - p) < Math.abs(best.strike - p))) best = n;
    return best ? Math.abs(best.gex) : 0;
  };
  return levels.map((l, i) => ({
    name: l.name, price: l.price, touch: l.touch, highlight: i === hi && l.touch > 0,
    weight: maxAbs > 0 ? Math.max(0.15, Math.min(1, gexAt(l.price) / maxAbs)) : 0.15,
  }));
}
/** Indices of output points that get a dot: every `every`-th, always the last. */
export function trailDotIndices(n: number, every = 4): number[] {
  const out: number[] = [];
  const k = Math.max(1, Math.round(every));
  for (let i = 0; i < n; i += k) out.push(i);
  if (n && out[out.length - 1] !== n - 1) out.push(n - 1);
  return out;
}

/* ── settings sheet IA ── */
export interface SettingsGroup { id: string; label: string; hint: string }
export const SETTINGS_GROUPS: SettingsGroup[] = [
  { id: 'price', label: 'Price & candles', hint: 'Candle type, scale, session, volume' },
  { id: 'dealer', label: 'Dealer levels', hint: 'Walls, flip, Apex, orbs, GEX / VEX, expiry horizon' },
  { id: 'projections', label: 'Projections', hint: 'Path fan, expected-move cone, bands' },
  { id: 'flow', label: 'Flow', hint: 'Options prints, dark pool' },
  { id: 'indicators', label: 'Indicators', hint: 'VWAP, EMA, MA, key levels' },
  { id: 'drawings', label: 'Drawings', hint: 'Magnet, snap, visibility' },
  { id: 'appearance', label: 'Appearance', hint: 'Layer opacity & colour, line weight, label density, theme' },
];

/** The six most-used layers — the chips row above the chart. */
export const QUICK_LAYERS: { key: TemplateKey; label: string }[] = [
  { key: 'walls', label: 'Walls' },
  { key: 'gex', label: 'Orbs' },
  { key: 'path', label: 'Path' },
  { key: 'expMove', label: 'EM cone' },
  { key: 'vwap', label: 'VWAP' },
  { key: 'flow', label: 'Flow' },
];
