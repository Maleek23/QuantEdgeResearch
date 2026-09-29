/**
 * Journal · Dashboard — LuxAlgo's customisable dashboard (apps/web/src/app/
 * page.tsx + dashboard-customizer / saved layouts), built on OUR dashboard
 * framework instead of porting their customiser: every widget is a registry
 * tool in the 'journal' page namespace (components/dashboard/defs/journal.ts),
 * so the operator can add / remove / drag / resize them, keep several named
 * dashboards (saved to the account, per page), and restore the default.
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
