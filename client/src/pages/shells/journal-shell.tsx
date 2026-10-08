/**
 * JOURNAL — "How do I get better"
 *
 * Built on LuxAlgo Trade Journal's information architecture
 * (https://github.com/LuxAlgo/trade-journal, MIT): global filters, trades that
 * open in a drawer, and its pages — since feat/jnav (2026-09-29) as a grouped
 * tab row in the journal's top bar, so the app rail is the ONLY side nav:
 *
 *   [Book ▾]  OVERVIEW Dashboard Calendar Daily │ TRADES Trades Missed │
 *             INSIGHTS Insights Reports Loss analysis │ IMPROVE Playbooks Progress Notebook │
 *             SETUP Import Accounts Settings │ PLATFORM Track record · Trader ranking        (overflow → More ▾)
 *
 * Fit to screen: the journal is exactly the shell's measured main area
 * (--qe-main-h); the tab bar, title row, basis and filters stay put and only
 * the page body (#jr-scroll) scrolls. Pages are plain sections at natural
 * height — no fixed-height tiles, no scroll areas inside sections. Phones get
 * the book select and a horizontally scrollable tab strip (components/journal/journal-nav.tsx).
 * Every old ?jtab= value still resolves — see lib/journal/legacy-jtab.ts.
 *
 * One journal UI, several books: the book picker (left of the tab row) picks what every
 * page is computed on — Mine · Bot · Trade desk · a trader (Femi, Malik, Uzo,
 * Bean…) — kept in ?journal=, and the basis line names that book, its sizing
 * rule and anything it could not score. Bot and Trade desk are read-only
 * mappings of their ledgers, so every write action is hidden on them.
 *
 * A trade opens in the drawer (quick view) or as a full page (?jtrade=<id>,
 * pages/journal/trade-view.tsx) inside the same shell; Back returns to the page
 * it was opened from.
 */
import { reasonOf } from '@/lib/optimistic';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { PageErrorBoundary } from '@/components/page-error-boundary';
import { JournalContext, type JournalCtx, type JournalView } from '@/components/journal/journal-context';
import { JournalFilterBar } from '@/components/journal/filter-bar';
import { JournalBasis } from '@/components/journal/journal-switcher';
import { JournalNav } from '@/components/journal/journal-nav';
import { TradeDrawer } from '@/components/journal/trade-drawer';
import { TradeEditor } from '@/components/journal/trade-editor';
import type { JournalTradeRow } from '@/lib/journal/types';
import { JournalLockedError, useJournalData, useJournalFilterState, useJournalKey, useJournalPrefs, useJournalSources } from '@/lib/journal/use-journal';
import { JournalUnlock } from '@/components/journal/journal-unlock';
import { DeskControls } from '@/components/journal/desk-controls';
import { queryClient } from '@/lib/queryClient';
import type { JournalKey } from '@shared/journal-sources';
import { FILTERED_PAGES, JOURNAL_PAGES, TRADE_PAGES, resolveJournalPage } from '@/lib/journal/legacy-jtab';
import '@/styles/journal.css';
import { ToolSkeleton } from '@/components/ui/qe-loading';

const DashboardView = lazy(() => import('@/pages/journal/dashboard-view'));
const CalendarView = lazy(() => import('@/pages/journal/calendar-view'));
const DailyView = lazy(() => import('@/pages/journal/daily-view'));
const TradesView = lazy(() => import('@/pages/journal/trades-view'));
const InsightsView = lazy(() => import('@/pages/journal/insights-view'));
const ReportsView = lazy(() => import('@/pages/journal/reports-view'));
const LossView = lazy(() => import('@/pages/journal/loss-view'));
const NotebookView = lazy(() => import('@/pages/journal/notebook-view'));
const PlaybooksView = lazy(() => import('@/pages/journal/playbooks-view'));
const ProgressView = lazy(() => import('@/pages/journal/progress-view'));
const MissedView = lazy(() => import('@/pages/journal/missed-view'));
const ImportView = lazy(() => import('@/pages/journal/import-view'));
const AccountsView = lazy(() => import('@/pages/journal/accounts-view'));
const SettingsView = lazy(() => import('@/pages/journal/settings-view'));
const RecordView = lazy(() => import('@/pages/journal/record-view'));
const TradersView = lazy(() => import('@/pages/journal/traders-view'));
const TradeView = lazy(() => import('@/pages/journal/trade-view'));

const TRADE_PARAM = 'jtrade';
/** The journal's only scroll container (fit-to-screen: tab bar + header stay put). */
const SCROLL_ID = 'jr-scroll';

/** Header copy per book — the question each journal answers. */
function headCopy(key: JournalKey, label: string) {
  if (key === 'bot') return { eyebrow: 'Quantinum Bot · paper ledger', title: 'How is Quantinum Bot actually trading?' };
  if (key === 'desk') return { eyebrow: 'NEXUS ideas, as trades', title: 'How did NEXUS\'s ideas trade?' };
  if (key.startsWith('trader:')) return { eyebrow: `${label}'s trades`, title: `How is ${label} trading?` };
  return { eyebrow: 'your trades', title: 'How am I actually trading?' };
}

const PAGE_LABEL = new Map(JOURNAL_PAGES.map((p) => [p.id, p.label]));

export default function JournalShell() {
  const initial = useMemo(() => resolveJournalPage(typeof window === 'undefined' ? null : window.location.search), []);
  const [view, setView] = useState<JournalView>(initial.view);
  const [anchor, setAnchor] = useState<string | null>(
    initial.intent?.kind === 'anchor' ? initial.intent.id
      : initial.intent?.kind === 'import' ? `jr-imp-sec-${initial.intent.section}` : null,
  );
  const [backtestOpen, setBacktestOpen] = useState(initial.intent?.kind === 'backtest');
  const [simSymbol, setSimSymbol] = useState<string | null>(null);
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const [prefs, setPrefs] = useJournalPrefs();

  const filters = useJournalFilterState();
  const [journalKey, setJournalKey] = useJournalKey();
  const sourcesQ = useJournalSources();
  const deskOpts = useMemo(() => ({ view: prefs.deskView, sizing: prefs.deskSizing }), [prefs.deskView, prefs.deskSizing]);
  const data = useJournalData(filters.resolved, journalKey, deskOpts);
  const source = sourcesQ.data?.sources.find((x) => x.key === journalKey);
  const bookLabel = data.meta?.label ?? source?.label ?? (journalKey === 'mine' ? 'My journal' : journalKey);
  const canWrite = data.meta?.canWrite ?? source?.canWrite ?? false;

  const [drawer, setDrawer] = useState<{ id: string; order: string[] } | null>(null);
  const [tradePage, setTradePage] = useState<{ id: string; order: string[] } | null>(() => {
    const id = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(TRADE_PARAM);
    return id ? { id, order: [] } : null;
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    if (tradePage) url.searchParams.set(TRADE_PARAM, tradePage.id);
    else url.searchParams.delete(TRADE_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
  }, [tradePage]);
  const [editor, setEditor] = useState<{ open: boolean; row: JournalTradeRow | null }>({ open: initial.intent?.kind === 'add', row: null });

  // Canonical ?jtab= (old values and ?jpage= are rewritten once resolved; dashboard → no param).
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('jpage');
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

  const goTo = useCallback((v: JournalView, a?: string) => {
    setView(v);
    setTradePage(null);
    if (v === 'record') setBacktestOpen(false);
    if (a) setAnchor(a);
    else document.getElementById(SCROLL_ID)?.scrollTo({ top: 0 });
  }, []);
  const rowsById = useMemo(() => new Map(data.allRows.map((r) => [r.id, r])), [data.allRows]);

  const ctx: JournalCtx = useMemo(() => ({
    filters,
    data,
    view,
    bookLabel,
    canWrite,
    openTrade: (id, order) => setDrawer({ id, order: order ?? [id] }),
    openTradePage: (id, order) => { setDrawer(null); setTradePage({ id, order: order ?? [] }); document.getElementById(SCROLL_ID)?.scrollTo({ top: 0 }); },
    openEditor: (row) => { if (canWrite) setEditor({ open: true, row: row ?? null }); },
    openImport: (section) => goTo('import', section ? `jr-imp-sec-${section}` : undefined),
    goTo,
    openDay: (day) => { setFocusDay(day); goTo('daily'); },
    focusDay,
    simSymbol,
    simulate: (symbol) => { setSimSymbol(symbol); setDrawer(null); goTo('trades', 'jr-sim'); },
    setJournal: (key) => { setDrawer(null); setTradePage(null); setEditor({ open: false, row: null }); setJournalKey(key); if (view === 'record') setView('dashboard'); },
    sources: sourcesQ.data,
    prefs,
    setPrefs,
  }), [filters, data, view, bookLabel, canWrite, goTo, focusDay, simSymbol, setJournalKey, sourcesQ.data, prefs, setPrefs]);

  const current = drawer ? rowsById.get(drawer.id) ?? null : null;
  const idx = drawer ? drawer.order.indexOf(drawer.id) : -1;
  const neighbours = { prev: idx > 0 ? drawer!.order[idx - 1] : undefined, next: idx >= 0 && idx < (drawer?.order.length ?? 0) - 1 ? drawer!.order[idx + 1] : undefined };

  const { tradesQ } = data;
  const total = data.allRows.length;
  const personal = view !== 'record';
  const tradePageView = TRADE_PAGES.has(view);

  let body: React.ReactNode;
  if (!personal) {
    body = <RecordView backtestOpen={backtestOpen} />;
  } else if (tradesQ.error instanceof JournalLockedError && journalKey.startsWith('trader:')) {
    body = <JournalUnlock slug={journalKey.slice('trader:'.length)} label={bookLabel} onUnlocked={() => { void tradesQ.refetch(); void queryClient.invalidateQueries({ queryKey: ['/api/journal/sources'] }); }} />;
  } else if (tradesQ.isError && view !== 'settings') {
    body = (
      <QEError
        title={journalKey === 'mine' ? "Your journal didn't load" : `The ${bookLabel} journal didn't load`}
        message={journalKey === 'mine'
          ? "The journal service didn't respond. Your trades are safe — this is a connection failure, not an empty journal. Retry in a minute."
          : `${reasonOf(tradesQ.error)} This is a failure, not an empty book.`}
        onRetry={() => tradesQ.refetch()}
        retrying={tradesQ.isFetching}
      />
    );
  } else if (tradesQ.isLoading && view !== 'settings') {
    body = <QELoading rows={4} label={`loading ${journalKey === 'mine' ? 'your' : `the ${bookLabel}`} trades…`} />;
  } else if (tradePage) {
    body = (
      <TradeView id={tradePage.id} order={tradePage.order}
        onNavigate={(id) => setTradePage((p) => (p ? { ...p, id } : p))}
        onClose={() => setTradePage(null)} />
    );
  } else if (tradePageView && total === 0) {
    const excluded = (data.meta?.excluded ?? []).reduce((n, e) => n + e.count, 0);
    body = (
      <QEEmpty
        message={
          journalKey === 'mine' ? <>Your journal is empty. Import a broker CSV, connect Alpaca, or log a trade and the dashboard, calendar and reports fill in from your real fills.</>
          : journalKey === 'bot' ? <>Quantinum Bot's paper ledger has no positions yet{data.meta?.basis ? <> — {data.meta.basis}</> : null}.</>
          : journalKey === 'desk' ? <>No desk ideas to show yet. Ideas appear here once they have a recorded entry and exit{excluded ? ` — ${excluded} are still waiting for one` : ''}.</>
          : <>{bookLabel}'s journal is empty.{canWrite ? ' Log a trade for them, or import a broker CSV.' : ` Only an admin or ${bookLabel} can add to it.`}</>
        }
        action={canWrite ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" className="jr-btn jr-btn-primary" onClick={() => goTo('import')}><Upload className="h-4 w-4" /> Import trades</button>
            <button type="button" className="jr-btn" onClick={() => setEditor({ open: true, row: null })}><Plus className="h-4 w-4" /> Log a trade</button>
          </div>
        ) : undefined}
      />
    );
  } else if (tradePageView && data.rows.length === 0) {
    body = (
      <QEEmpty
        message={`None of the ${total} trades in ${journalKey === 'mine' ? 'your journal' : `the ${bookLabel} journal`} match these filters.`}
        action={<button type="button" className="jr-btn" onClick={filters.clear}>Clear filters</button>}
      />
    );
  } else {
    body = (
      <>
        {view === 'dashboard' && <DashboardView />}
        {view === 'calendar' && <CalendarView />}
        {view === 'daily' && <DailyView />}
        {view === 'trades' && <TradesView />}
        {view === 'insights' && <InsightsView />}
        {view === 'reports' && <ReportsView />}
        {view === 'loss' && <LossView />}
        {view === 'notebook' && <NotebookView />}
        {view === 'playbooks' && <PlaybooksView />}
        {view === 'progress' && <ProgressView />}
        {view === 'missed' && <MissedView />}
        {view === 'import' && <ImportView focus={initial.intent?.kind === 'import' ? initial.intent.section : undefined} onLogTrade={() => setEditor({ open: true, row: null })} />}
        {view === 'accounts' && <AccountsView />}
        {view === 'settings' && <SettingsView />}
        {view === 'traders' && <TradersView />}
      </>
    );
  }

  const m = data.metrics;
  const copy = headCopy(journalKey, bookLabel);
  const pageLabel = tradePage ? 'Trade' : PAGE_LABEL.get(view) ?? view;
  return (
    <JournalContext.Provider value={ctx}>
      <div className="jr" data-view={tradePage ? 'trade' : view}>
        <header className="jr-bar">
          <JournalNav view={view} onSelect={(v) => goTo(v)}
            book={journalKey} onBook={ctx.setJournal} sources={sourcesQ.data} sourcesLoading={sourcesQ.isLoading} />
        </header>
        <main className="jr-main" id="jr-main" aria-labelledby="jr-page-title">
          <div className="jr-top">
            <div className="jr-top-t">
              <h1 className="jr-top-h" id="jr-page-title" title={personal ? copy.title : 'How did the ideas do?'}>{pageLabel}</h1>
              <span className="jr-n jr-top-n">
                {personal
                  ? tradesQ.isSuccess
                    ? total
                      ? <>{bookLabel} · {data.rows.length === total ? `${total} trades` : `${data.rows.length} of ${total} in view`} · {m.closedTrades} closed · {m.openTrades} open{canWrite ? '' : ' · read-only'}</>
                      : `${bookLabel} · no trades yet`
                    : ''
                  : 'published ideas · hit rate, expectancy and n of every one'}
              </span>
            </div>
            {personal && canWrite && (
              <div className="jr-head-actions">
                {view !== 'import' && <button type="button" className="jr-btn jr-btn-sm" onClick={() => goTo('import')}><Upload className="h-4 w-4" /> Import trades</button>}
                <button type="button" className="jr-btn jr-btn-sm jr-btn-primary" onClick={() => setEditor({ open: true, row: null })}><Plus className="h-4 w-4" /> Add trade</button>
              </div>
            )}
          </div>

          {personal && tradesQ.isSuccess && view !== 'settings' && (
            <JournalBasis compact meta={data.meta} shown={data.rows.length} total={total} sizing={prefs.sizing} rows={data.rows} />
          )}
          {journalKey === 'desk' && tradesQ.isSuccess && view !== 'settings' && !tradePage && (
            <DeskControls prefs={prefs} setPrefs={setPrefs} data={data} />
          )}

          {personal && tradesQ.isSuccess && total > 0 && FILTERED_PAGES.has(view) && !tradePage && (
            <JournalFilterBar api={filters} options={data.options} shown={data.rows.length} total={total} />
          )}

          <div className="jr-body" id={SCROLL_ID}>
            <PageErrorBoundary label={`Journal · ${view}`}>
              <Suspense fallback={<ToolSkeleton rows={4} />}>
                {body}
              </Suspense>
            </PageErrorBoundary>
          </div>
        </main>

        <TradeDrawer
          trade={current}
          open={!!drawer && !!current}
          onOpenChange={(o) => { if (!o) setDrawer(null); }}
          onEdit={(row) => { if (canWrite) setEditor({ open: true, row }); }}
          onNavigate={(id) => setDrawer((d) => (d ? { ...d, id } : d))}
          neighbours={neighbours}
          onSimulate={ctx.simulate}
          onOpenPage={(id) => ctx.openTradePage(id, drawer?.order)}
        />
        {canWrite && (
          <TradeEditor
            open={editor.open}
            trade={editor.row}
            onOpenChange={(o) => setEditor((e) => ({ ...e, open: o }))}
          />
        )}
      </div>
    </JournalContext.Provider>
  );
}
