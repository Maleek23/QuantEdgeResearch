/**
 * Ask Quantinum — the global host: the floating button on every signed-in page
 * (bottom-right; on phones above the dock), the lazily loaded sheet, and the
 * ⌘\ / Ctrl+\ toggle. Renders nothing unless /api/quantinum/ai/status says
 * this account may use it (flag QUANTINUM_AI: admin by default → super-admins
 * + desk admins). On /ask the page itself is the panel, so no FAB/sheet there.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Sparkles } from 'lucide-react';
import { onAskQuantinum, useAskQuantinumStatus, defaultPrompt } from '@/lib/ask-quantinum';
import { TOGGLE_EVENT } from '@/lib/quantinum-analyst';
import { isToggleShortcut } from '@shared/quantinum-analyst';
import type { AskTarget } from '@shared/quantinum-ai';
import { clientFlag } from '@/lib/feature-flags';
import { pageAskTarget } from '@shared/quantinum-panel';
import './ask-quantinum.css';

const AskQuantinumSheet = lazy(() => import('./ask-quantinum-sheet'));

/** The ticker a page is about, when the URL says so (/r/:symbol). With QUANTINUM_PANEL on,
 *  every app page gives context: ?sym= / ?tab= (shared/quantinum-panel.ts pageAskTarget). */
function pageTarget(location: string): AskTarget | null {
  if (clientFlag('QUANTINUM_PANEL')) return pageAskTarget(location, window.location.search);
  const m = /^\/r\/([A-Za-z0-9.^-]{1,10})/.exec(location);
  if (!m) return null;
  const sym = decodeURIComponent(m[1]).toUpperCase();
  return { kind: 'ticker', symbol: sym, page: (location + window.location.search).slice(0, 120), label: `${sym} · ticker page` };
}

export function AskQuantinumHost() {
  const status = useAskQuantinumStatus();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [target, setTarget] = useState<AskTarget | null>(null);
  const [seed, setSeed] = useState<{ text: string; nonce: number } | null>(null);
  const onAskPage = location.split('?')[0] === '/ask';
  const enabled = !!status.data?.enabled;

  useEffect(() => onAskQuantinum(({ target: t, prompt }) => {
    setTarget(t);
    setSeed({ text: prompt ?? defaultPrompt(t), nonce: Date.now() });
    setLoaded(true);
    setOpen(true);
  }), []);

  useEffect(() => {
    if (!enabled || onAskPage) return;
    const toggle = () => { setLoaded(true); setOpen((o) => !o); };
    const onKey = (e: KeyboardEvent) => { if (isToggleShortcut(e)) { e.preventDefault(); toggle(); } };
    window.addEventListener('keydown', onKey);
    window.addEventListener(TOGGLE_EVENT, toggle);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(TOGGLE_EVENT, toggle); };
  }, [enabled, onAskPage]);

  if (!enabled || onAskPage) return null;

  // No explicit object → the panel reads page context (focused ticker / selected setup) itself.
  const openFromFab = () => {
    if (!target || target.kind === 'page' || target.kind === 'ticker') setTarget(pageTarget(location.split('?')[0]));
    setLoaded(true);
    setOpen(true);
  };

  return (
    <>
      {!open && (
        <button type="button" className="aq-fab" onClick={openFromFab} aria-haspopup="dialog" aria-keyshortcuts="Meta+Backslash Control+Backslash" data-testid="ask-quantinum-fab">
          <Sparkles aria-hidden />
          <span className="aq-fab-label">Ask Quantinum</span>
          <span className="lx-sr-only">— AI analyst on QuantEdge data (⌘\ or Ctrl+\)</span>
        </button>
      )}
      {loaded && (
        <Suspense fallback={null}>
          <AskQuantinumSheet
            open={open}
            onClose={() => setOpen(false)}
            target={target}
            seedPrompt={seed}
            status={status.data}
            onClearTarget={() => setTarget(null)}
          />
        </Suspense>
      )}
    </>
  );
}
