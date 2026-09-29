/**
 * ?jtab= → journal page. The journal went from 3 tabs (+6 nested under Trade
 * Log, +6 under Track record's Advanced switch) to 4 destinations, then
 * (2026-09-29) to a LuxAlgo-style sidebar of pages. Every id any link, bookmark
 * or redirect has ever used resolves here. ?jpage= is accepted as an alias of
 * ?jtab= (jpage wins when both are present); the shell writes ?jtab=.
 */
import type { ImportSection } from '@/components/journal/import-drawer';

export type JournalView =
  | 'dashboard' | 'calendar' | 'daily' | 'trades' | 'reports' | 'notebook' | 'playbooks' | 'progress' | 'missed'
  | 'import' | 'accounts' | 'settings'
  | 'record';

export type JournalIntent =
  | { kind: 'anchor'; id: string }
  | { kind: 'import'; section: ImportSection }
  | { kind: 'add' }
  | { kind: 'sim' }
  | { kind: 'backtest' };

export type JournalPageGroup = 'journal' | 'setup' | 'platform';

/** Sidebar order and grouping (LuxAlgo: main pages · setup pages; ours adds Platform). */
export const JOURNAL_PAGES: readonly { id: JournalView; label: string; group: JournalPageGroup; hint: string }[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'journal', hint: 'P&L, calendar, recent trades' },
  { id: 'calendar', label: 'Calendar', group: 'journal', hint: 'Month and week P&L, day drill-down' },
  { id: 'daily', label: 'Daily journal', group: 'journal', hint: "Each trading day: its trades, notes and a day note" },
  { id: 'trades', label: 'Trades', group: 'journal', hint: 'Every trade — review, edit, export' },
  { id: 'reports', label: 'Reports', group: 'journal', hint: 'By symbol, setup, tag, time, weekday, holding time' },
  { id: 'notebook', label: 'Notebook', group: 'journal', hint: 'All notes, searchable, tagged by ticker and day' },
  { id: 'playbooks', label: 'Playbooks', group: 'journal', hint: 'Each setup: its definition and live stats' },
  { id: 'progress', label: 'Progress', group: 'journal', hint: 'Streaks, goals vs actual, rolling win rate' },
  { id: 'missed', label: 'Missed', group: 'journal', hint: 'Trades not taken — and what they did' },
  { id: 'import', label: 'Import', group: 'setup', hint: 'Broker CSV, manual entry, flow alerts' },
  { id: 'accounts', label: 'Accounts', group: 'setup', hint: 'Broker connections and balances' },
  { id: 'settings', label: 'Settings', group: 'setup', hint: 'Default book, display, timezone' },
  { id: 'record', label: 'Track record', group: 'platform', hint: "How the platform's published ideas did, plus the backtester" },
];

/** Pages whose content is the selected book's trades (filters apply; empty book → empty state). */
export const TRADE_PAGES: ReadonlySet<JournalView> = new Set(['dashboard', 'calendar', 'trades', 'reports', 'progress']);
/** Pages that read the filtered rows or notes, so the filter bar is shown. */
export const FILTERED_PAGES: ReadonlySet<JournalView> = new Set(['dashboard', 'calendar', 'daily', 'trades', 'reports', 'notebook', 'playbooks', 'progress']);

/** Every ?jtab= the journal has ever used → where it lives now. */
export const LEGACY_JTAB: Record<string, { view: JournalView; intent?: JournalIntent }> = {
  // current page ids
  dashboard: { view: 'dashboard' },
  calendar: { view: 'calendar' },
  daily: { view: 'daily' },
  trades: { view: 'trades' },
  reports: { view: 'reports' },
  notebook: { view: 'notebook' },
  playbooks: { view: 'playbooks' },
  progress: { view: 'progress' },
  missed: { view: 'missed' },
  import: { view: 'import' },
  accounts: { view: 'accounts' },
  settings: { view: 'settings' },
  record: { view: 'record' },
  // aliases for the new pages
  journal: { view: 'daily' },
  'daily-journal': { view: 'daily' },
  day: { view: 'daily' },
  notes: { view: 'notebook' },
  playbook: { view: 'playbooks' },
  setups: { view: 'playbooks' },
  goals: { view: 'progress' },
  streaks: { view: 'progress' },
  blocked: { view: 'missed' },
  ledger: { view: 'missed' },
  broker: { view: 'accounts' },
  alpaca: { view: 'accounts' },
  preferences: { view: 'settings' },
  // the 4-destination era (2026-09-29 morning)
  analytics: { view: 'reports' },
  // the Trade Log era
  log: { view: 'dashboard' },              // Trade Log (its Overview tab was the landing view)
  overview: { view: 'dashboard' },         // Trade Log → Overview
  simulator: { view: 'trades', intent: { kind: 'sim' } },            // Trade Log → P&L Sim
  sim: { view: 'trades', intent: { kind: 'sim' } },
  insights: { view: 'reports', intent: { kind: 'anchor', id: 'jr-insights' } }, // Trade Log → Insights
  timing: { view: 'reports', intent: { kind: 'anchor', id: 'jr-time' } },       // Trade Log → Timing
  metrics: { view: 'record' },             // Track record (old id)
  performance: { view: 'record' },
  backtest: { view: 'record', intent: { kind: 'backtest' } },        // Backtest tab
  flow: { view: 'import', intent: { kind: 'import', section: 'flow' } },        // "Import flow" toggle
  add: { view: 'dashboard', intent: { kind: 'add' } },
};

/** Resolve a raw ?jtab= / ?jpage= value; unknown or missing → Dashboard. */
export function resolveJournalTab(raw: string | null | undefined): { view: JournalView; intent?: JournalIntent } {
  const key = (raw ?? '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEGACY_JTAB, key) ? LEGACY_JTAB[key] : { view: 'dashboard' };
}

/** Read the page from a query string: ?jpage= wins over ?jtab=. */
export function resolveJournalPage(search: string | URLSearchParams | null | undefined): { view: JournalView; intent?: JournalIntent } {
  const p = search == null ? null : typeof search === 'string' ? new URLSearchParams(search) : search;
  return resolveJournalTab(p?.get('jpage') ?? p?.get('jtab'));
}
