/**
 * Cockpit modes — the Trade Desk "mode" tabs, ported onto the unified cockpit.
 *
 * The standalone Trade Desk filtered /api/trade-ideas/best-setups by engine
 * source / asset type / premium. We now drive the SAME modes off the richer
 * convictions feed (which carries `source`), so the cockpit is one surface with
 * Trade Desk's power. Filters are intentionally lenient (the convictions feed is
 * already quality-gated) — empty modes show an honest empty state, never fakes.
 */
import type { ConvictionPick } from '@/lib/convictions';

export type CockpitMode = 'all' | 'ai-picks' | 'flow' | 'lotto' | 'news' | 'manual';

export interface CockpitModeMeta {
  id: CockpitMode;
  label: string;
  hint: string;
}

export const COCKPIT_MODES: readonly CockpitModeMeta[] = [
  { id: 'all',      label: 'All',     hint: 'Every ranked conviction signal, highest confluence first' },
  { id: 'ai-picks', label: 'AI Picks', hint: 'Quant / AI / Hybrid engine setups' },
  { id: 'flow',     label: 'Flow',    hint: 'Institutional options-flow driven ideas' },
  { id: 'lotto',    label: 'Lotto',   hint: 'High-risk cheap options ($0.20–0.70 premium, 20x potential)' },
  { id: 'news',     label: 'News',    hint: 'Breaking-news catalyst plays' },
  { id: 'manual',   label: 'Manual',  hint: 'Your own briefs and manual entries' },
];

/** Does a conviction pick belong to the given mode? */
export function matchesMode(pick: ConvictionPick, mode: CockpitMode): boolean {
  const source = (pick.source ?? '').toLowerCase();
  switch (mode) {
    case 'all':
      return true;
    case 'ai-picks':
      return ['quant', 'ai', 'hybrid'].includes(source);
    case 'flow':
      return source === 'flow';
    case 'news':
      return source === 'news';
    case 'manual':
      return source === 'manual';
    case 'lotto': {
      // Cheap directional option premium — same band the Trade Desk used.
      if (pick.assetType !== 'option' || !pick.optionType) return false;
      const premium = pick.entryPrice;
      return typeof premium === 'number' && premium >= 0.2 && premium <= 0.7;
    }
    default:
      return true;
  }
}
