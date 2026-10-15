/**
 * LAYERS — the one place to turn anything on the chart on or off.
 *
 * Layers = WHAT is shown (this file; the toolbar "Layers" panel, the legend
 * chips). Settings = HOW it looks (style, horizons, bands, colours, density).
 * Each row maps to one chart pref (or chart-local state) by id; the client
 * supplies the live on/off + setter. Pure — scripts/test-chart-v3.ts.
 */
import type { StyleLayer } from './chart-templates';

export type LayerId =
  | 'volume' | 'vwap' | 'ma' | 'ema' | 'keyLevels'
  | 'walls' | 'gravity' | 'gex' | 'gexLabels' | 'gexProject'
  | 'path' | 'pathFrozen' | 'expMove'
  | 'flow' | 'dp'
  | 'drawings' | 'ownLevels';

export interface LayerRow {
  id: LayerId;
  label: string;
  /** One short line: what it is. */
  hint: string;
  /** Short chip name on the legend. */
  chip: string;
  /** Per-layer opacity (Settings → Appearance store). */
  opacity?: StyleLayer;
  /** Extra search words. */
  keywords?: string;
}
export interface LayerGroup { id: string; label: string; rows: LayerRow[] }

export const LAYER_GROUPS: LayerGroup[] = [
  { id: 'price', label: 'Price', rows: [
    { id: 'volume', label: 'Volume', chip: 'Vol', hint: 'Volume bars at the foot of the chart' },
    { id: 'vwap', label: 'VWAP', chip: 'VWAP', hint: 'Session VWAP, resets each ET session (intraday)' },
    { id: 'ma', label: 'MA 20 / 50', chip: 'MA', hint: 'Simple moving averages', keywords: 'sma moving average' },
    { id: 'ema', label: 'EMA 9 / 21', chip: 'EMA', hint: 'Exponential moving averages', keywords: 'moving average' },
    { id: 'keyLevels', label: 'Key levels', chip: 'Key lv', hint: 'Prior day H/L/C, 15m opening range, pre-market H/L', keywords: 'pdh pdl pdc orb overnight' },
  ] },
  { id: 'dealer', label: 'Dealer levels · Gravity', rows: [
    { id: 'walls', label: 'Walls & flip', chip: 'Walls', hint: 'Call wall, put wall, zero-γ flip', opacity: 'walls', keywords: 'gamma zero flip cw pw' },
    { id: 'gravity', label: 'Gravity tags', chip: 'Gravity', hint: 'Gatekeeper, Rug and Trampoline strike lines', opacity: 'walls', keywords: 'gatekeeper rug trampoline' },
    { id: 'gex', label: 'GEX orbs', chip: 'Orbs', hint: 'Net gamma by strike through time', opacity: 'gex', keywords: 'bubbles nodes vex' },
    { id: 'gexLabels', label: 'Apex labels', chip: 'Apex', hint: 'Strike and size of the strongest node', keywords: 'apex node' },
    { id: 'gexProject', label: 'Projected nodes', chip: 'Proj nodes', hint: 'Latest nodes carried past the last candle, not a forecast' },
  ] },
  { id: 'proj', label: 'Projections · Trajectory', rows: [
    { id: 'path', label: 'Path', chip: 'Path', hint: 'Modelled scenario fan (2,000 simulated paths)', opacity: 'path', keywords: 'trajectory fan monte carlo' },
    { id: 'pathFrozen', label: 'Frozen paths', chip: 'Frozen', hint: 'The 09:40 and close snapshots of the Path', keywords: 'snapshot 0940' },
    { id: 'expMove', label: 'Expected move · Envelope', chip: 'EM cone', hint: 'Priced day / week range and the 1σ / 2σ cone', opacity: 'em', keywords: 'envelope cone straddle em' },
  ] },
  { id: 'flow', label: 'Flow · Current', rows: [
    { id: 'flow', label: 'Flow prints', chip: 'Flow', hint: 'Options flow: calls above, puts below the candle', opacity: 'flow', keywords: 'options sweeps current' },
    { id: 'dp', label: 'Dark pool', chip: 'DP', hint: 'Dark-pool print levels, multi-day', opacity: 'dp', keywords: 'darkpool prints' },
  ] },
  { id: 'mine', label: 'Your stuff', rows: [
    { id: 'drawings', label: 'Drawings & alert lines', chip: 'Drawings', hint: 'Everything you drew, including lines with alerts', keywords: 'alerts lines annotations' },
    { id: 'ownLevels', label: 'Ideas & positions', chip: 'Ideas', hint: 'Entry, stop and target lines from your ideas and positions', keywords: 'trade setup entry stop target' },
  ] },
];

export const ALL_LAYER_ROWS: LayerRow[] = LAYER_GROUPS.flatMap((g) => g.rows);

/** Groups with only the rows matching `q` (label, hint, group, keywords); empty groups dropped. */
export function filterLayerGroups(q: string, groups: LayerGroup[] = LAYER_GROUPS): LayerGroup[] {
  const s = q.trim().toLowerCase();
  if (!s) return groups;
  const words = s.split(/\s+/);
  return groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => { const hay = `${r.label} ${r.hint} ${g.label} ${r.keywords ?? ''}`.toLowerCase(); return words.every((w) => hay.includes(w)); }) }))
    .filter((g) => g.rows.length);
}

/** "3 of 5 on" + the master switch state (on when any row is on). */
export function groupSummary(g: LayerGroup, isOn: (id: LayerId) => boolean, isAvailable: (id: LayerId) => boolean = () => true) {
  const rows = g.rows.filter((r) => isAvailable(r.id));
  const on = rows.filter((r) => isOn(r.id)).length;
  return { on, total: rows.length, text: `${on} of ${rows.length} on`, master: on > 0 };
}
