/**
 * Ask Quantinum — the global host: the floating button on every signed-in page
 * (bottom-right; on phones above the dock) and the lazily loaded sheet. Renders
 * nothing unless /api/quantinum/ai/status says this account may use it
 * (flag QUANTINUM_AI: admin by default → super-admins + desk admins).
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Sparkles } from 'lucide-react';
import { onAskQuantinum, useAskQuantinumStatus, defaultPrompt } from '@/lib/ask-quantinum';
import type { AskTarget } from '@shared/quantinum-ai';
import './ask-quantinum.css';

const AskQuantinumSheet = lazy(() => import('./ask-quantinum-sheet'));

/** The ticker a page is about, when the URL says so (/r/:symbol). */
function pageTarget(location: string): AskTarget {
  const m = /^\/r\/([A-Za-z0-9.^-]{1,10})/.exec(location);
  const page = (location + window.location.search).slice(0, 120);
  return m ? { kind: 'ticker', symbol: decodeURIComponent(m[1]).toUpperCase(), page, label: `${decodeURIComponent(m[1]).toUpperCase()} · ticker page` } : { kind: 'page', page };
}

export function AskQuantinumHost() {
  const status = useAskQuantinumStatus();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [target, setTarget] = useState<AskTarget | null>(null);
  const [seed, setSeed] = useState<{ text: string; nonce: number } | null>(null);

  useEffect(() => onAskQuantinum(({ target: t, prompt }) => {
    setTarget(t);
    setSeed({ text: prompt ?? defaultPrompt(t), nonce: Date.now() });
    setLoaded(true);
    setOpen(true);
  }), []);

  if (!status.data?.enabled) return null;

  const openFromFab = () => {
    const t = pageTarget(location.split('?')[0]);
    if (!target || target.kind === 'page' || (t.kind === 'ticker' && t.symbol !== target.symbol)) setTarget(t);
    setLoaded(true);
    setOpen(true);
  };

  return (
    <>
      {!open && (
        <button type="button" className="aq-fab" onClick={openFromFab} aria-haspopup="dialog" data-testid="ask-quantinum-fab">
          <Sparkles aria-hidden />
          <span className="aq-fab-label">Ask Quantinum</span>
          <span className="lx-sr-only">— AI analyst on QuantEdge data</span>
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
            onClearTarget={() => setTarget(pageTarget(location.split('?')[0]).kind === 'ticker' ? pageTarget(location.split('?')[0]) : { kind: 'page', page: location.slice(0, 120) })}
          />
        </Suspense>
      )}
    </>
  );
}
