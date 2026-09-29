/**
 * Journal · Dashboard — LuxAlgo's dashboard (apps/web/src/app/page.tsx),
 * built on OUR dashboard framework instead of porting their customiser: every
 * widget is a registry tool in the 'journal' page namespace
 * (components/dashboard/defs/journal.ts).
 *
 * Since 2026-09-29 JOURNAL is a FIXED page (pages.ts `mode`): the curated
 * default layout, no add / move / resize — only GEX and FLOW are editable
 * workspaces. A layout saved here earlier is ignored, not deleted.
 *
 * The tools read the journal context — the selected book and the filter bar
 * above — so every number moves with the filters, and each tool's frame names
 * the book and n it was computed on.
 */
import { Dashboard } from '@/components/dashboard/dashboard';

export { TradeMiniList } from '@/components/journal/trade-mini-list';

export default function DashboardView() {
  return (
    <div className="jr-dash">
      <Dashboard page="journal" />
    </div>
  );
}
