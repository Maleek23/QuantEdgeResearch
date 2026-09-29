/**
 * JOURNAL — "How do I get better"
 *
 * Rebuilt 2026-09-29 on LuxAlgo Trade Journal's information architecture
 * (https://github.com/LuxAlgo/trade-journal, MIT): a few destinations, global
 * filters, and trades that open in a drawer instead of new pages.
 *
 * Before: 3 journal tabs (Trade Log · Track record · Backtest) + an Import-flow
 * toggle, with Trade Log carrying 6 more tabs of its own (Overview · Insights ·
 * Timing · Trades · P&L Sim · Import) and Track record 6 more behind an
 * "Advanced" switch — up to three stacked tab bars.
 *
 * Now: four destinations, one level —
 *   Dashboard · Trades · Analytics · Track record
 * with Add trade / Import as header actions (editor dialog, import drawer).
 * Every old ?jtab= value still resolves — see lib/journal/legacy-jtab.ts.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, BookOpenCheck, LayoutDashboard, ListOrdered, Loader2, Plus, Upload } from 'lucide-react';
import { QETabs, type QETabItem } from '@/components/ui/qe-tabs';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { PageErrorBoundary } from '@/components/page-error-boundary';
import { JournalContext, type JournalCtx, type JournalView } from '@/components/journal/journal-context';
import { JournalFilterBar } from '@/components/journal/filter-bar';
import { ImportDrawer, type ImportSection } from '@/components/journal/import-drawer';
import { TradeDrawer } from '@/components/journal/trade-drawer';
import { TradeEditor } from '@/components/journal/trade-editor';
import type { JournalTradeRow } from '@/lib/journal/types';
import { useJournalData, useJournalFilterState } from '@/lib/journal/use-journal';
import { resolveJournalTab } from '@/lib/journal/legacy-jtab';
import '@/styles/journal.css';

const DashboardView = lazy(() => import('@/pages/journal/dashboard-view'));
const TradesView = lazy(() => import('@/pages/journal/trades-view'));
const AnalyticsView = lazy(() => import('@/pages/journal/analytics-view'));
const RecordView = lazy(() => import('@/pages/journal/record-view'));

const TABS: readonly QETabItem<JournalView>[] = [
  { id: 'dashboard', label: 'Dashboard', hint: 'P&L, calendar, recent trades', icon: <LayoutDashboard className="h-3 w-3" /> },
  { id: 'trades', label: 'Trades', hint: 'Every trade you took — review, edit, export', icon: <ListOrdered className="h-3 w-3" /> },
  { id: 'analytics', label: 'Analytics', hint: 'By setup, symbol, time, risk; behaviour insights', icon: <BarChart3 className="h-3 w-3" /> },
  { id: 'record', label: 'Track record', hint: "How the platform's published ideas did, plus the backtester", icon: <BookOpenCheck className="h-3 w-3" /> },
];

const PANEL_PREFIX = 'journal-views';

export default function JournalShell() {
  const initial = useMemo(() => resolveJournalTab(typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('jtab')), []);
  const [view, setView] = useState<JournalView>(initial.view);
  const [anchor, setAnchor] = useState<string | null>(initial.intent?.kind === 'anchor' ? initial.intent.id : null);
  const [backtestOpen, setBacktestOpen] = useState(initial.intent?.kind === 'backtest');
  const [simSymbol, setSimSymbol] = useState<string | null>(null);

  const filters = useJournalFilterState();
  const data = useJournalData(filters.resolved);

  const [drawer, setDrawer] = useState<{ id: string; order: string[] } | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; row: JournalTradeRow | null }>({ open: initial.intent?.kind === 'add', row: null });
  const [imp, setImp] = useState<{ open: boolean; section?: ImportSection }>(
    initial.intent?.kind === 'import' ? { open: true, section: initial.intent.section } : { open: false },
  );

  // Canonical ?jtab= (old values are rewritten once resolved; dashboard is the default → no param).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (view === 'dashboard') url.searchParams.delete('jtab');
    else url.searchParams.set('jtab', view);
    url.searchParams.delete('jsim');
    window.history.replaceState(window.history.state, '', url.toString());
  }, [view]);

  // Scroll to a section after the destination renders.
  useEffect(() => {
    if (!anchor) return;
    let tries = 0;
    const tick = window.setInterval(() => {
      const el = document.getElementById(anchor);
      if (el || ++tries > 20) {
        window.clearInterval(tick);
        el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        setAnchor(null);
      }
    }, 100);
    return () => window.clearInterval(tick);
  }, [anchor, view]);

  const goTo = useCallback((v: JournalView, a?: string) => { setView(v); if (a) setAnchor(a); }, []);
  const rowsById = useMemo(() => new Map(data.allRows.map((r) => [r.id, r])), [data.allRows]);

  const ctx: JournalCtx = useMemo(() => ({
    filters,
    data,
    openTrade: (id, order) => setDrawer({ id, order: order ?? [id] }),
    openEditor: (row) => setEditor({ open: true, row: row ?? null }),
    openImport: (section) => setImp({ open: true, section }),
    goTo,
    simSymbol,
    simulate: (symbol) => { setSimSymbol(symbol); setDrawer(null); goTo('trades', 'jr-sim'); },
  }), [filters, data, goTo, simSymbol]);

  const current = drawer ? rowsById.get(drawer.id) ?? null : null;
  const idx = drawer ? drawer.order.indexOf(drawer.id) : -1;
  const neighbours = { prev: idx > 0 ? drawer!.order[idx - 1] : undefined, next: idx >= 0 && idx < (drawer?.order.length ?? 0) - 1 ? drawer!.order[idx + 1] : undefined };

  const { tradesQ } = data;
  const total = data.allRows.length;
  const personal = view !== 'record';

  let body: React.ReactNode;
  if (!personal) {
    body = <RecordView backtestOpen={backtestOpen} />;
  } else if (tradesQ.isError) {
    body = (
      <QEError
        title="Couldn't load your journal"
        message="The journal service didn't respond. Your trades are safe — this is a connection failure, not an empty journal."
        onRetry={() => tradesQ.refetch()}
        retrying={tradesQ.isFetching}
      />
    );
  } else if (tradesQ.isLoading) {
    body = <QELoading rows={4} label="loading your trades…" />;
  } else if (total === 0) {
    body = (
      <QEEmpty
        message={<>Your journal is empty. Import a broker CSV or log a trade and the dashboard, calendar and analytics fill in from your real fills.</>}
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" className="jr-btn jr-btn-primary" onClick={() => setImp({ open: true, section: 'csv' })}><Upload className="h-4 w-4" /> Import CSV</button>
            <button type="button" className="jr-btn" onClick={() => setEditor({ open: true, row: null })}><Plus className="h-4 w-4" /> Log a trade</button>
          </div>
        }
      />
    );
  } else if (data.rows.length === 0) {
    body = (
      <QEEmpty
        message={`None of your ${total} trades match these filters.`}
        action={<button type="button" className="jr-btn" onClick={filters.clear}>Clear filters</button>}
      />
    );
  } else {
    body = (
      <>
        {view === 'dashboard' && <DashboardView />}
        {view === 'trades' && <TradesView />}
        {view === 'analytics' && <AnalyticsView />}
      </>
    );
  }

  const m = data.metrics;
  return (
    <JournalContext.Provider value={ctx}>
      <div className="jr">
        <div className="jr-page">
          <header className="jr-head">
            <div style={{ minWidth: 0 }}>
              <div className="jr-eyebrow"><span className="pill">JOURNAL</span>{personal ? 'your trades' : 'published ideas'}</div>
              <h1 className="jr-title">{personal ? 'How am I actually trading?' : 'How did the ideas do?'}</h1>
              <p className="jr-sub">
                {personal
                  ? tradesQ.isSuccess
                    ? total
                      ? <>{data.rows.length === total ? `${total} trades` : `${data.rows.length} of ${total} trades in view`} · {m.closedTrades} closed · {m.openTrades} open</>
                      : 'No trades yet'
                    : ' '
                  : 'Hit rate, expectancy and sample size of every published idea'}
              </p>
            </div>
            <div className="jr-head-actions">
              <button type="button" className="jr-btn" onClick={() => setImp({ open: true, section: 'csv' })}><Upload className="h-4 w-4" /> Import</button>
              <button type="button" className="jr-btn jr-btn-primary" onClick={() => setEditor({ open: true, row: null })}><Plus className="h-4 w-4" /> Add trade</button>
            </div>
          </header>

          <QETabs
            items={TABS}
            active={view}
            onChange={(v) => { setView(v); if (v === 'record') setBacktestOpen(false); }}
            ariaLabel="Journal"
            panelIdPrefix={PANEL_PREFIX}
          />

          {personal && tradesQ.isSuccess && total > 0 && (
            <JournalFilterBar api={filters} options={data.options} shown={data.rows.length} total={total} />
          )}

          <div role="tabpanel" id={`${PANEL_PREFIX}-panel-${view}`} aria-labelledby={`${PANEL_PREFIX}-tab-${view}`} tabIndex={-1}>
            <PageErrorBoundary label={`Journal · ${view}`}>
              <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', height: 200 }}><Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--jr-accent)' }} /></div>}>
                {body}
              </Suspense>
            </PageErrorBoundary>
          </div>
        </div>

        <TradeDrawer
          trade={current}
          open={!!drawer && !!current}
          onOpenChange={(o) => { if (!o) setDrawer(null); }}
          onEdit={(row) => setEditor({ open: true, row })}
          onNavigate={(id) => setDrawer((d) => (d ? { ...d, id } : d))}
          neighbours={neighbours}
          onSimulate={ctx.simulate}
        />
        <TradeEditor
          open={editor.open}
          trade={editor.row}
          onOpenChange={(o) => setEditor((e) => ({ ...e, open: o }))}
        />
        <ImportDrawer
          open={imp.open}
          focus={imp.section}
          onOpenChange={(o) => setImp((s) => ({ ...s, open: o }))}
          tradeCount={total}
          onLogTrade={() => { setImp({ open: false }); setEditor({ open: true, row: null }); }}
        />
      </div>
    </JournalContext.Provider>
  );
}
