/**
 * NEXUS views — "Board" (the curated NEXUS dashboard, unchanged), "0DTE"
 * (the 0DTE desk) and "History" (setups by day with outcomes + data health,
 * client/src/components/integrity/setups-by-day.tsx). A thin segment above the
 * board, deep-linkable with ?tab=oracle&nx=0dte|history (or /t?nx=…). The board
 * keeps its fit-to-viewport height: the host subtracts the 34px segment from
 * --qe-main-h, so this adds views without touching the NEXUS layout itself.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useSearch } from 'wouter';
import { RouteFallback } from '@/components/ui/qe-loading';
import { skeletonTiles } from '@/components/dashboard/pages';
import './zero-dte-desk.css';

const Dashboard = lazy(() => import('@/components/dashboard/dashboard').then((m) => ({ default: m.Dashboard })));
const ZeroDteView = lazy(() => import('./zero-dte-desk'));
const SetupsByDay = lazy(() => import('@/components/integrity/setups-by-day'));

type View = 'board' | '0dte' | 'history';
const readView = (): View => {
  try {
    const v = new URLSearchParams(window.location.search).get('nx');
    return v === '0dte' ? '0dte' : v === 'history' ? 'history' : 'board';
  } catch { return 'board'; }
};

export function NexusViews() {
  const [view, setViewState] = useState<View>(readView);
  // Follow in-app navigations within /t (e.g. a 0DTE idea link → /t?idea=… opens the board).
  const search = useSearch();
  useEffect(() => { setViewState(readView()); }, [search]);
  const setView = useCallback((v: View) => {
    setViewState(v);
    try {
      const u = new URL(window.location.href);
      if (v !== 'board') u.searchParams.set('nx', v); else u.searchParams.delete('nx');
      window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
    } catch { /* URL sync is a convenience */ }
  }, []);
  return (
    <>
      <div className="nx-views" role="tablist" aria-label="NEXUS views" data-tour="nexus-views">
        <button type="button" role="tab" aria-selected={view === 'board'} onClick={() => setView('board')}>BOARD</button>
        <button type="button" role="tab" aria-selected={view === '0dte'} onClick={() => setView('0dte')} data-tour="nexus-0dte">0DTE</button>
        <button type="button" role="tab" aria-selected={view === 'history'} onClick={() => setView('history')} title="Setups by day with outcomes + data health">HISTORY</button>
      </div>
      {view === 'board' ? (
        <div className="nx-board-host">
          <Suspense fallback={<RouteFallback tiles={skeletonTiles('nexus')} />}>
            <Dashboard page="nexus" />
          </Suspense>
        </div>
      ) : view === 'history' ? (
        <Suspense fallback={<RouteFallback tiles={[[0, 0, 12, 12]]} />}>
          <SetupsByDay />
        </Suspense>
      ) : (
        <Suspense fallback={<RouteFallback tiles={[[0, 0, 12, 12]]} />}>
          <ZeroDteView />
        </Suspense>
      )}
    </>
  );
}

export default NexusViews;
