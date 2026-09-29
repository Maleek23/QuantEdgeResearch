/**
 * ?jtab= → journal page. The journal went from 3 tabs (+6 nested under Trade
 * Log, +6 under Track record's Advanced switch) to 4 destinations, then
 * (2026-09-29) to a LuxAlgo-style sidebar of pages, and (same day, feat/jnav) to
 * a grouped tab row in the journal's top bar — the app rail is the only side
 * nav. Every id any link, bookmark
 * or redirect has ever used resolves here. ?jpage= is accepted as an alias of
 * ?jtab= (jpage wins when both are present); the shell writes ?jtab=.
 */
import type { ImportSection } from '@/components/journal/import-drawer';

export type JournalView =
  | 'dashboard' | 'calendar' | 'daily' | 'trades' | 'insights' | 'reports' | 'loss' | 'notebook' | 'playbooks' | 'progress' | 'missed'
  | 'import' | 'accounts' | 'settings'
  | 'record' | 'traders';

export type JournalIntent =
  | { kind: 'anchor'; id: string }
  | { kind: 'import'; section: ImportSection }
  | { kind: 'add' }
  | { kind: 'sim' }
  | { kind: 'backtest' };

export type JournalPageGroup = 'overview' | 'trades' | 'insights' | 'improve' | 'setup' | 'platform';

/** Tab-row groups, in order (feat/jnav: Overview · Trades · Insights · Improve · Setup · Platform). */
export const JOURNAL_GROUPS: readonly { id: JournalPageGroup; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'trades', label: 'Trades' },
  { id: 'insights', label: 'Insights' },
  { id: 'improve', label: 'Improve' },
  { id: 'setup', label: 'Setup' },
  { id: 'platform', label: 'Platform' },
];

/** Tab order and grouping. */
export const JOURNAL_PAGES: readonly { id: JournalView; label: string; group: JournalPageGroup; hint: string }[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'overview', hint: 'P&L, equity, calendar, recent trades' },
  { id: 'calendar', label: 'Calendar', group: 'overview', hint: 'Month and week P&L, day drill-down' },
  { id: 'daily', label: 'Daily', group: 'overview', hint: 'Each trading day: its trades, notes and a day note' },
  { id: 'trades', label: 'Trades', group: 'trades', hint: 'Every trade — review, edit, export' },
  { id: 'missed', label: 'Missed', group: 'trades', hint: 'Trades not taken — and what they did' },
  { id: 'insights', label: 'Insights', group: 'insights', hint: 'What to stop doing, in $ with n: time of day, weekday × hour, DTE, size, holding time, tilt, ticker concentration' },
  { id: 'reports', label: 'Reports', group: 'insights', hint: 'Break the book down by any dimension; compare two sets' },
  { id: 'loss', label: 'Loss analysis', group: 'insights', hint: 'Why each loss happened — MFE/MAE from bars, loss classes, drivers, what would have helped' },
  { id: 'playbooks', label: 'Playbooks', group: 'improve', hint: 'Each setup: its definition and live stats' },
  { id: 'progress', label: 'Progress', group: 'improve', hint: 'Streaks, goals vs actual, rolling win rate' },
  { id: 'notebook', label: 'Notebook', group: 'improve', hint: 'All notes, searchable, tagged by ticker and day' },
  { id: 'import', label: 'Import', group: 'setup', hint: 'Broker CSV, Discord forum, manual entry, flow alerts' },
  { id: 'accounts', label: 'Accounts', group: 'setup', hint: 'Broker connections and balances' },
  { id: 'settings', label: 'Settings', group: 'setup', hint: 'Default book, display, timezone' },
  { id: 'record', label: 'Track record', group: 'platform', hint: "How the platform's published ideas did, plus the backtester" },
  { id: 'traders', label: 'Trader ranking', group: 'platform', hint: 'Imported trader journals analysed and ranked — stated P&L and calls measured on the underlying' },
];

/** Pages whose content is the selected book's trades (filters apply; empty book → empty state). */
export const TRADE_PAGES: ReadonlySet<JournalView> = new Set(['dashboard', 'calendar', 'trades', 'insights', 'reports', 'loss', 'progress']);
/** Pages that read the filtered rows or notes, so the filter bar is shown. */
export const FILTERED_PAGES: ReadonlySet<JournalView> = new Set(['dashboard', 'calendar', 'daily', 'trades', 'insights', 'reports', 'loss', 'notebook', 'playbooks', 'progress']);

/** Every ?jtab= the journal has ever used → where it lives now. */
export const LEGACY_JTAB: Record<string, { view: JournalView; intent?: JournalIntent }> = {
  // current page ids
  dashboard: { view: 'dashboard' },
  calendar: { view: 'calendar' },
  daily: { view: 'daily' },
  trades: { view: 'trades' },
  insights: { view: 'insights' },
  reports: { view: 'reports' },
  loss: { view: 'loss' },
  notebook: { view: 'notebook' },
  playbooks: { view: 'playbooks' },
  progress: { view: 'progress' },
  missed: { view: 'missed' },
  import: { view: 'import' },
  accounts: { view: 'accounts' },
  settings: { view: 'settings' },
  record: { view: 'record' },
  traders: { view: 'traders' },
  // aliases for the new pages
  leaderboard: { view: 'traders' },
  ranking: { view: 'traders' },
  forum: { view: 'import', intent: { kind: 'import', section: 'forum' } },
  losses: { view: 'loss' },
  'loss-analysis': { view: 'loss' },
  why: { view: 'loss' },
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
  // Trade Log → Insights / Timing: first-class Insights page since feat/jnav.
  timing: { view: 'insights', intent: { kind: 'anchor', id: 'jr-ins-time' } },
  behaviour: { view: 'insights' },
  behavior: { view: 'insights' },
  patterns: { view: 'insights' },
  tilt: { view: 'insights', intent: { kind: 'anchor', id: 'jr-ins-tilt' } },
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
