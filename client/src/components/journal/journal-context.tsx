/**
 * Journal context — the shell owns filters, data, the selected page and the two
 * overlays (trade drawer, editor); every page reads them from here so a trade
 * opened on the Dashboard, the Calendar, the Trades list or a Reports bucket is
 * the same drawer with the same actions.
 */
import { createContext, useContext } from 'react';
import type { JournalTradeRow } from '@/lib/journal/types';
import type { JournalData, JournalPrefs, JournalSourcesResponse, useJournalFilterState } from '@/lib/journal/use-journal';
import type { JournalKey } from '@shared/journal-sources';
import type { JournalView } from '@/lib/journal/legacy-jtab';
import type { ImportSection } from './import-drawer';

export type { JournalView };

export interface JournalCtx {
  filters: ReturnType<typeof useJournalFilterState>;
  data: JournalData;
  /** The page on screen. */
  view: JournalView;
  /** Name of the selected book ("Mine", "Bot", "Femi"…). */
  bookLabel: string;
  /** The caller may write to this book (add/edit/delete/import/notes). */
  canWrite: boolean;
  /** Open the detail drawer; `order` is the list it was opened from (for ← / →). */
  openTrade: (id: string, order?: string[]) => void;
  openEditor: (row?: JournalTradeRow | null) => void;
  /** Go to the Import page (optionally at a section). */
  openImport: (section?: ImportSection) => void;
  goTo: (view: JournalView, anchor?: string) => void;
  /** Open the Daily journal at a trading day (YYYY-MM-DD). */
  openDay: (day: string) => void;
  /** Day the Daily journal should open at, if another page sent one. */
  focusDay: string | null;
  /** Symbol preselected in the options P&L simulator (Trades). */
  simSymbol: string | null;
  simulate: (symbol: string) => void;
  /** Switch the book the journal is computed on (Mine · Bot · Trade desk · a trader). */
  setJournal: (key: JournalKey) => void;
  sources: JournalSourcesResponse | undefined;
  prefs: JournalPrefs;
  setPrefs: (patch: Partial<JournalPrefs>) => void;
}

export const JournalContext = createContext<JournalCtx | null>(null);

export function useJournal(): JournalCtx {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error('useJournal must be used inside the journal shell');
  return ctx;
}
