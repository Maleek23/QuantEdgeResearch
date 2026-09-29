/**
 * JOURNAL — "How do I get better"
 *
 * Built on LuxAlgo Trade Journal's information architecture
 * (https://github.com/LuxAlgo/trade-journal, MIT): global filters, trades that
 * open in a drawer, and — since 2026-09-29 — its left sidebar of pages:
 *
 *   Journal   Dashboard · Calendar · Daily journal · Trades · Reports ·
 *             Notebook · Playbooks · Progress · Missed
 *   Setup     Import · Accounts · Settings
 *   Platform  Track record
 *
 * (LuxAlgo's Prop firms page is not carried over.) The sidebar collapses to
 * icons (remembered on this device) and becomes a scroll strip on phones.
 * Every old ?jtab= value still resolves — see lib/journal/legacy-jtab.ts.
 *
 * One journal UI, several books: the switcher above the header picks what every
 * page is computed on — Mine · Bot · Trade desk · a trader (Femi, Malik, Uzo,
 * Bean…) — kept in ?journal=, and the basis line names that book, its sizing
 * rule and anything it could not score. Bot and Trade desk are read-only
 * mappings of their ledgers, so every write action is hidden on them.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Upload } from 'lucide-react';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { PageErrorBoundary } from '@/components/page-error-boundary';
import { JournalContext, type JournalCtx, type JournalView } from '@/components/journal/journal-context';
import { JournalFilterBar } from '@/components/journal/filter-bar';
import { JournalBasis, JournalSwitcher } from '@/components/journal/journal-switcher';
import { JournalSidebar } from '@/components/journal/journal-sidebar';
import { TradeDrawer } from '@/components/journal/trade-drawer';
import { TradeEditor } from '@/components/journal/trade-editor';
import type { JournalTradeRow } from '@/lib/journal/types';
import { useJournalData, useJournalFilterState, useJournalKey, useJournalPrefs, useJournalSources } from '@/lib/journal/use-journal';
import type { JournalKey } from '@shared/journal-sources';
import { FILTERED_PAGES, JOURNAL_PAGES, TRADE_PAGES, resolveJournalPage } from '@/lib/journal/legacy-jtab';
import '@/styles/journal.css';

const DashboardView = lazy(() => import('@/pages/journal/dashboard-view'));
const CalendarView = lazy(() => import('@/pages/journal/calendar-view'));
const DailyView = lazy(() => import('@/pages/journal/daily-view'));
const TradesView = lazy(() => import('@/pages/journal/trades-view'));
const ReportsView = lazy(() => import('@/pages/journal/reports-view'));
const NotebookView = lazy(() => import('@/pages/journal/notebook-view'));
const PlaybooksView = lazy(() => import('@/pages/journal/playbooks-view'));
const ProgressView = lazy(() => import('@/pages/journal/progress-view'));
const MissedView = lazy(() => import('@/pages/journal/missed-view'));
const ImportView = lazy(() => import('@/pages/journal/import-view'));
const AccountsView = lazy(() => import('@/pages/journal/accounts-view'));
const SettingsView = lazy(() => import('@/pages/journal/settings-view'));
const RecordView = lazy(() => import('@/pages/journal/record-view'));

/** Header copy per book — the question each journal answers. */
function headCopy(key: JournalKey, label: string) {
  if (key === 'bot') return { eyebrow: 'bot paper ledger', title: 'How is the bot actually trading?' };
  if (key === 'desk') return { eyebrow: 'published ideas, as trades', title: 'How did the trade desk trade?' };
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
  const data = useJournalData(filters.resolved, journalKey);
  const source = sourcesQ.data?.sources.find((x) => x.key === journalKey);
  const bookLabel = data.meta?.label ?? source?.label ?? (journalKey === 'mine' ? 'Mine' : journalKey);
  const canWrite = data.meta?.canWrite ?? source?.canWrite ?? false;

  const [drawer, setDrawer] = useState<{ id: string; order: string[] } | null>(null);
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
    if (v === 'record') setBacktestOpen(false);
    if (a) setAnchor(a);
    else document.getElementById('jr-main')?.scrollIntoView({ block: 'start' });
  }, []);
  const rowsById = useMemo(() => new Map(data.allRows.map((r) => [r.id, r])), [data.allRows]);

  const ctx: JournalCtx = useMemo(() => ({
    filters,
    data,
    view,
    bookLabel,
    canWrite,
    openTrade: (id, order) => setDrawer({ id, order: order ?? [id] }),
    openEditor: (row) => { if (canWrite) setEditor({ open: true, row: row ?? null }); },
    openImport: (section) => goTo('import', section ? `jr-imp-sec-${section}` : undefined),
    goTo,
    openDay: (day) => { setFocusDay(day); goTo('daily'); },
    focusDay,
    simSymbol,
    simulate: (symbol) => { setSimSymbol(symbol); setDrawer(null); goTo('trades', 'jr-sim'); },
    setJournal: (key) => { setDrawer(null); setEditor({ open: false, row: null }); setJournalKey(key); if (view === 'record') setView('dashboard'); },
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
  const tradePage = TRADE_PAGES.has(view);

  let body: React.ReactNode;
  if (!personal) {
    body = <RecordView backtestOpen={backtestOpen} />;
  } else if (tradesQ.isError && view !== 'settings') {
    body = (
      <QEError
        title={journalKey === 'mine' ? "Couldn't load your journal" : `Couldn't load the ${bookLabel} journal`}
        message={journalKey === 'mine'
          ? "The journal service didn't respond. Your trades are safe — this is a connection failure, not an empty journal."
          : `The ${bookLabel} journal request failed (${tradesQ.error instanceof Error ? tradesQ.error.message : 'no response'}). This is a failure, not an empty book.`}
        onRetry={() => tradesQ.refetch()}
        retrying={tradesQ.isFetching}
      />
    );
  } else if (tradesQ.isLoading && view !== 'settings') {
    body = <QELoading rows={4} label={`loading ${journalKey === 'mine' ? 'your' : `the ${bookLabel}`} trades…`} />;
  } else if (tradePage && total === 0) {
    const excluded = (data.meta?.excluded ?? []).reduce((n, e) => n + e.count, 0);
    body = (
      <QEEmpty
        message={
          journalKey === 'mine' ? <>Your journal is empty. Import a broker CSV, connect Alpaca, or log a trade and the dashboard, calendar and reports fill in from your real fills.</>
          : journalKey === 'bot' ? <>The bot's paper ledger has no positions yet{data.meta?.basis ? <> — {data.meta.basis}</> : null}.</>
          : journalKey === 'desk' ? <>No published idea since the clean-era baseline could be scored as a trade{excluded ? ` (${excluded} held but not scorable — see the basis line)` : ''}.</>
          : <>{bookLabel}'s journal is empty.{canWrite ? ' Log a trade for them, or import a broker CSV.' : ` Only an admin or ${bookLabel} can add to it.`}</>
        }
        action={canWrite ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button type="button" className="jr-btn jr-btn-primary" onClick={() => goTo('import')}><Upload className="h-4 w-4" /> Import</button>
            <button type="button" className="jr-btn" onClick={() => setEditor({ open: true, row: null })}><Plus className="h-4 w-4" /> Log a trade</button>
          </div>
        ) : undefined}
      />
    );
  } else if (tradePage && data.rows.length === 0) {
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
        {view === 'reports' && <ReportsView />}
        {view === 'notebook' && <NotebookView />}
        {view === 'playbooks' && <PlaybooksView />}
        {view === 'progress' && <ProgressView />}
        {view === 'missed' && <MissedView />}
        {view === 'import' && <ImportView focus={initial.intent?.kind === 'import' ? initial.intent.section : undefined} onLogTrade={() => setEditor({ open: true, row: null })} />}
        {view === 'accounts' && <AccountsView />}
        {view === 'settings' && <SettingsView />}
      </>
    );
  }

  const m = data.metrics;
  const copy = headCopy(journalKey, bookLabel);
  const pageLabel = PAGE_LABEL.get(view) ?? view;
  return (
    <JournalContext.Provider value={ctx}>
      <div className="jr">
        <div className="jr-page">
          <JournalSwitcher value={journalKey} onChange={ctx.setJournal} sources={sourcesQ.data} loading={sourcesQ.isLoading} />
          <div className="jr-layout" data-collapsed={prefs.sidebarCollapsed}>
            <JournalSidebar
              view={view}
              onSelect={(v) => goTo(v)}
              collapsed={prefs.sidebarCollapsed}
              onToggle={() => setPrefs({ sidebarCollapsed: !prefs.sidebarCollapsed })}
            />
            <main className="jr-main" id="jr-main" aria-labelledby="jr-page-title">
              <header className="jr-head">
                <div style={{ minWidth: 0 }}>
                  <div className="jr-eyebrow"><span className="pill">JOURNAL</span>{personal ? copy.eyebrow : 'published ideas'}</div>
                  <h1 className="jr-title">{personal ? copy.title : 'How did the ideas do?'}</h1>
                  <p className="jr-sub">
                    {personal
                      ? tradesQ.isSuccess
                        ? total
                          ? <>{data.rows.length === total ? `${total} trades` : `${data.rows.length} of ${total} trades in view`} · {m.closedTrades} closed · {m.openTrades} open</>
                          : 'No trades yet'
                        : ' '
                      : 'Hit rate, expectancy and sample size of every published idea'}
                  </p>
                </div>
                {personal && canWrite && (
                  <div className="jr-head-actions">
                    {view !== 'import' && <button type="button" className="jr-btn" onClick={() => goTo('import')}><Upload className="h-4 w-4" /> Import</button>}
                    <button type="button" className="jr-btn jr-btn-primary" onClick={() => setEditor({ open: true, row: null })}><Plus className="h-4 w-4" /> Add trade</button>
                  </div>
                )}
              </header>

              {personal && tradesQ.isSuccess && view !== 'settings' && (
                <JournalBasis meta={data.meta} shown={data.rows.length} total={total} sizing={prefs.sizing} rows={data.rows} />
              )}

              <div className="jr-pagebar">
                <h2 className="jr-pagebar-t" id="jr-page-title">{pageLabel}</h2>
                {personal && (
                  <span className="jr-n">
                    {bookLabel}{tradesQ.isSuccess ? ` · n=${data.rows.length}${data.rows.length !== total ? ` of ${total}` : ''} trades` : ''}{canWrite ? '' : ' · read-only'}
                  </span>
                )}
              </div>

              {personal && tradesQ.isSuccess && total > 0 && FILTERED_PAGES.has(view) && (
                <JournalFilterBar api={filters} options={data.options} shown={data.rows.length} total={total} />
              )}

              <div className="jr-body">
                <PageErrorBoundary label={`Journal · ${view}`}>
                  <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', height: 200 }}><Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--jr-accent)' }} /></div>}>
                    {body}
                  </Suspense>
                </PageErrorBoundary>
              </div>
            </main>
          </div>
        </div>

        <TradeDrawer
          trade={current}
          open={!!drawer && !!current}
          onOpenChange={(o) => { if (!o) setDrawer(null); }}
          onEdit={(row) => { if (canWrite) setEditor({ open: true, row }); }}
          onNavigate={(id) => setDrawer((d) => (d ? { ...d, id } : d))}
          neighbours={neighbours}
          onSimulate={ctx.simulate}
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
