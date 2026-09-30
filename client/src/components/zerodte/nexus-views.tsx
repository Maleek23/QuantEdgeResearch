/**
 * NEXUS views — "Board" (the curated NEXUS dashboard, unchanged) and "0DTE"
 * (the 0DTE desk). A thin segment above the board, deep-linkable with
 * ?tab=oracle&nx=0dte (or /t?nx=0dte). The board keeps its fit-to-viewport
 * height: the host subtracts the 34px segment from --qe-main-h, so this adds a
 * view without touching the NEXUS layout itself.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useSearch } from 'wouter';
import { RouteFallback } from '@/components/ui/qe-loading';
import { skeletonTiles } from '@/components/dashboard/pages';
import './zero-dte-desk.css';

const Dashboard = lazy(() => import('@/components/dashboard/dashboard').then((m) => ({ default: m.Dashboard })));
const ZeroDteView = lazy(() => import('./zero-dte-desk'));

type View = 'board' | '0dte';
const readView = (): View => {
  try { return new URLSearchParams(window.location.search).get('nx') === '0dte' ? '0dte' : 'board'; } catch { return 'board'; }
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
      if (v === '0dte') u.searchParams.set('nx', '0dte'); else u.searchParams.delete('nx');
      window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
    } catch { /* URL sync is a convenience */ }
  }, []);
  return (
    <>
      <div className="nx-views" role="tablist" aria-label="NEXUS views">
        <button type="button" role="tab" aria-selected={view === 'board'} onClick={() => setView('board')}>BOARD</button>
        <button type="button" role="tab" aria-selected={view === '0dte'} onClick={() => setView('0dte')}>0DTE</button>
      </div>
      {view === 'board' ? (
        <div className="nx-board-host">
          <Suspense fallback={<RouteFallback tiles={skeletonTiles('nexus')} />}>
            <Dashboard page="nexus" />
          </Suspense>
        </div>
      ) : (
        <Suspense fallback={<RouteFallback tiles={[[0, 0, 12, 12]]} />}>
          <ZeroDteView />
        </Suspense>
      )}
    </>
  );
}

export default NexusViews;
