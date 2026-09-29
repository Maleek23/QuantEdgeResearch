/**
 * Journal context — the shell owns filters, data and the three overlays (trade
 * drawer, editor, import drawer); every destination reads them from here so a
 * trade opened on the Dashboard, the Trades list or an Analytics bucket is the
 * same drawer with the same actions.
 */
import { createContext, useContext } from 'react';
import type { JournalTradeRow } from '@/lib/journal/types';
import type { JournalData, useJournalFilterState } from '@/lib/journal/use-journal';
import type { JournalView } from '@/lib/journal/legacy-jtab';
import type { ImportSection } from './import-drawer';

export type { JournalView };

export interface JournalCtx {
  filters: ReturnType<typeof useJournalFilterState>;
  data: JournalData;
  /** Open the detail drawer; `order` is the list it was opened from (for ← / →). */
  openTrade: (id: string, order?: string[]) => void;
  openEditor: (row?: JournalTradeRow | null) => void;
  openImport: (section?: ImportSection) => void;
  goTo: (view: JournalView, anchor?: string) => void;
  /** Symbol preselected in the options P&L simulator (Trades). */
  simSymbol: string | null;
  simulate: (symbol: string) => void;
}

export const JournalContext = createContext<JournalCtx | null>(null);

export function useJournal(): JournalCtx {
  const ctx = useContext(JournalContext);
  if (!ctx) throw new Error('useJournal must be used inside the journal shell');
  return ctx;
}
