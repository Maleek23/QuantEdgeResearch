/**
 * Journal · Import — LuxAlgo's Import page (apps/web/src/app/import): broker
 * CSV, Alpaca, manual entry, flow alerts and the reset, promoted from the old
 * header drawer (components/journal/import-drawer.tsx) to a page. Read-only
 * books have nothing to import into and say so. Discord import is not here: a
 * trader's Discord calls land on their watchlist.
 *
 * 2026-09-29: a CSV import now reports its reconciliation (rows → fills →
 * round trips → imported / duplicates / rejected with reasons), and the page
 * lists the book's import history batch by batch (import-reconciliation.tsx).
 */
import { QEEmpty } from '@/components/ui/qe-states';
import { useJournal } from '@/components/journal/journal-context';
import { ImportSections, type ImportSection } from '@/components/journal/import-drawer';
import { ImportHistory } from '@/components/journal/import-reconciliation';
import { ExpiryResettle } from '@/components/journal/expiry-resettle';

export default function ImportView({ focus, onLogTrade }: { focus?: ImportSection; onLogTrade: () => void }) {
  const { data, canWrite, bookLabel, goTo } = useJournal();
  if (!canWrite) {
    const why = data.key === 'bot'
      ? "The Quantinum Bot book is the bot's own paper ledger — it fills itself, so nothing can be imported into it."
      : data.key === 'desk'
        ? 'The NEXUS ideas book is computed from published ideas — nothing can be imported into it.'
        : `${bookLabel}'s journal is read-only for you — only an admin or ${bookLabel} can import into it. Their Discord calls go to their watchlist.`;
    return (
      <QEEmpty
        message={why}
        action={<button type="button" className="jr-btn" onClick={() => goTo('accounts')}>See where its data comes from</button>}
      />
    );
  }
  return (
    <>
      <ImportSections focus={focus} tradeCount={data.allRows.length} onLogTrade={onLogTrade} />
      <div className="jr-grid" style={{ marginTop: 14 }}><ExpiryResettle /></div>
      <div className="jr-grid" style={{ marginTop: 14 }}><ImportHistory /></div>
    </>
  );
}
