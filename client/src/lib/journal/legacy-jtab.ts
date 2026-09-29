/**
 * ?jtab= → journal destination. The journal went from 3 tabs (+6 nested under
 * Trade Log, +6 under Track record's Advanced switch) to 4 destinations; every
 * id any link, bookmark or redirect has ever used resolves here.
 */
import type { ImportSection } from '@/components/journal/import-drawer';

export type JournalView = 'dashboard' | 'trades' | 'analytics' | 'record';

export type JournalIntent =
  | { kind: 'anchor'; id: string }
  | { kind: 'import'; section: ImportSection }
  | { kind: 'add' }
  | { kind: 'sim' }
  | { kind: 'backtest' };

/** Every ?jtab= the journal has ever used → where it lives now. */
export const LEGACY_JTAB: Record<string, { view: JournalView; intent?: JournalIntent }> = {
  dashboard: { view: 'dashboard' },
  log: { view: 'dashboard' },              // Trade Log (its Overview tab was the landing view)
  overview: { view: 'dashboard' },         // Trade Log → Overview
  trades: { view: 'trades' },              // Trade Log → Trades
  simulator: { view: 'trades', intent: { kind: 'sim' } },            // Trade Log → P&L Sim
  sim: { view: 'trades', intent: { kind: 'sim' } },
  analytics: { view: 'analytics' },
  insights: { view: 'analytics', intent: { kind: 'anchor', id: 'jr-insights' } }, // Trade Log → Insights
  timing: { view: 'analytics', intent: { kind: 'anchor', id: 'jr-time' } },       // Trade Log → Timing
  record: { view: 'record' },
  metrics: { view: 'record' },             // Track record (old id)
  performance: { view: 'record' },
  backtest: { view: 'record', intent: { kind: 'backtest' } },        // Backtest tab
  import: { view: 'dashboard', intent: { kind: 'import', section: 'csv' } },       // Trade Log → Import
  flow: { view: 'dashboard', intent: { kind: 'import', section: 'flow' } },        // "Import flow" toggle
  add: { view: 'dashboard', intent: { kind: 'add' } },
};

/** Resolve a raw ?jtab= value; unknown or missing → Dashboard. */
export function resolveJournalTab(raw: string | null | undefined): { view: JournalView; intent?: JournalIntent } {
  const key = (raw ?? '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEGACY_JTAB, key) ? LEGACY_JTAB[key] : { view: 'dashboard' };
}
