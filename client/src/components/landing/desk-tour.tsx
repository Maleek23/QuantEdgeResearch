/**
 * DESK TOUR — "Seven desks, one terminal.": one tab row (NEXUS · 0DTE · Flow · GEX ·
 * Sectors · Quantinum Bot · Journal) above ONE large framed slot.
 *
 * The slot shows the REAL app (components/landing/real-frame.tsx): a screen capture
 * of the real UI when client/public/videos/<file>.mp4 exists (play/pause, runtime in
 * the caption), else the actual terminal route rendered live on sample fixtures and
 * scaled into the frame. Never a hand-drawn recreation (operator rule 2026-10-07).
 *
 * Motion (none under reduced motion): the copy and the slot cross-fade on a tab
 * change; the frame drifts a few px with scroll.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { RealFrame, type RealDesk } from './real-frame';

type DeskId = Exclude<RealDesk, 'today'>;
type Desk = { id: DeskId; tab: string; caption: string; title: string; line: string; specs: [string, string, string]; href: string; url: string };

export const DESKS: Desk[] = [
  { id: 'nexus', tab: 'NEXUS', caption: 'NEXUS · ranked setups', title: 'Setups ranked by their evidence', href: '/t', url: 'quantedgelabs.net/t',
    line: 'Every idea arrives with entry, stop and target printed, and is graded automatically after it plays out.',
    specs: ['Entry, stop, target stamped ET', 'Graded after it prints', 'Evidence layers shown, not hidden'] },
  { id: 'zerodte', tab: '0DTE', caption: '0DTE · index session', title: 'The index session desk', href: '/t?nx=0dte', url: 'quantedgelabs.net/t?nx=0dte',
    line: 'SPX and SPY levels, the dealer map and same-day flow in one view through the session.',
    specs: ['Walls, zero γ and VWAP on one ladder', 'Data age on every number', 'Context, not an exchange-speed feed'] },
  { id: 'flow', tab: 'Flow', caption: 'Flow · options tape', title: 'Options flow, filtered', href: '/t?tab=flow', url: 'quantedgelabs.net/t?tab=flow',
    line: 'Prints, sweeps and blocks by ticker, strike and expiry, with the premium tide for the day.',
    specs: ['Sweep and block filters', 'Flow by strike and expiry', 'Source and age on every tile'] },
  { id: 'gex', tab: 'GEX', caption: 'GEX · dealer positioning', title: 'Where dealers are positioned', href: '/t?tab=gex', url: 'quantedgelabs.net/t?tab=gex',
    line: 'Gamma and vanna by strike and expiry, with the call wall, put wall and zero-γ marked.',
    specs: ['Raw vs Δ-adjusted gamma', 'Regime: long or short gamma', 'Wall basis labelled (≤7d / all)'] },
  { id: 'sectors', tab: 'Sectors', caption: 'Sectors · rotation', title: 'Rotation at a glance', href: '/t?tab=sectors', url: 'quantedgelabs.net/t?tab=sectors',
    line: 'Which sectors are igniting and which are fading, relative to SPY, on one board.',
    specs: ['Relative strength vs SPY', 'Ignition flags with their age', 'Blue leads · vermilion lags'] },
  { id: 'bot', tab: 'Quantinum Bot', caption: 'Quantinum Bot · paper ledger', title: 'A paper bot with a public ledger', href: '/t?tab=bot', url: 'quantedgelabs.net/t?tab=bot',
    line: 'Trades NEXUS’s published ideas on paper with real contract marks. No real money.',
    specs: ['Every simulated fill logged', 'Win rate only at n ≥ 30', 'Rule-set version on each fill'] },
  { id: 'journal', tab: 'Journal', caption: 'Journal · your book', title: 'Your book, measured honestly', href: '/t?tab=journal', url: 'quantedgelabs.net/t?tab=journal',
    line: 'Import a broker CSV or log by hand, then see which setups work for you and which don’t.',
    specs: ['Four numbers, one curve', 'Edge by setup and time of day', 'Scored like Quantinum Bot'] },
];

const CHECK = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>;

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!m) return;
    setR(m.matches);
    const on = () => setR(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return r;
}

/** Select a desk from elsewhere on the page (nav Product menu, ⌘K palette). */
export function showDesk(id: string) {
  window.dispatchEvent(new CustomEvent('qe:desk', { detail: id }));
}

export default function DeskTour() {
  const [active, setActive] = useState(0);
  const [meta, setMeta] = useState<{ kind: 'video' | 'live'; runtime: string | null }>({ kind: 'live', runtime: null });
  const frameRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const desk = DESKS[active];
  const onMeta = useCallback((m: { kind: 'video' | 'live'; runtime: string | null }) => setMeta(m), []);

  useEffect(() => {
    const on = (e: Event) => {
      const i = DESKS.findIndex((d) => d.id === (e as CustomEvent<string>).detail);
      if (i < 0) return;
      setActive(i);
      rootRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    };
    window.addEventListener('qe:desk', on);
    return () => window.removeEventListener('qe:desk', on);
  }, [reduce]);

  // Subtle parallax: the frame drifts ≤ 12 px against the scroll while it is in view.
  useEffect(() => {
    const el = frameRef.current;
    if (!el || reduce) { el?.style.removeProperty('--dk-par'); return; }
    let raf = 0;
    const tick = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      if (r.bottom < 0 || r.top > vh) return;
      const t = (r.top + r.height / 2 - vh / 2) / vh;
      el.style.setProperty('--dk-par', `${(Math.max(-1, Math.min(1, t)) * -12).toFixed(1)}px`);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(tick); };
    tick();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, [reduce]);

  const onKey = (e: React.KeyboardEvent) => {
    const n = DESKS.length;
    let i = active;
    if (e.key === 'ArrowRight') i = (active + 1) % n;
    else if (e.key === 'ArrowLeft') i = (active - 1 + n) % n;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = n - 1;
    else return;
    e.preventDefault();
    setActive(i);
    document.getElementById(`dk-tab-${DESKS[i].id}`)?.focus();
  };

  return (
    <div className="dk" ref={rootRef}>
      <div className="dk-tabs" role="tablist" aria-label="Desks" onKeyDown={onKey}>
        {DESKS.map((d, i) => (
          <button key={d.id} id={`dk-tab-${d.id}`} type="button" role="tab" aria-selected={active === i} aria-controls="dk-panel"
            tabIndex={active === i ? 0 : -1} className={`dk-tab${active === i ? ' on' : ''}`} onClick={() => setActive(i)}>{d.tab}</button>
        ))}
      </div>
      <div className="dk-panel" id="dk-panel" role="tabpanel" aria-labelledby={`dk-tab-${desk.id}`}>
        <div className="dk-head dk-swap" key={`head-${desk.id}`}>
          <div className="dk-head-l">
            <p className="dk-eyebrow">{desk.tab}</p>
            <h3>{desk.title}</h3>
            <p>{desk.line}</p>
          </div>
          <div className="dk-head-r">
            <ul>{desk.specs.map((s) => <li key={s}>{CHECK}<span>{s}</span></li>)}</ul>
            <Link href={desk.href} className="dk-explore">Explore {desk.tab} <span aria-hidden="true">→</span></Link>
          </div>
        </div>
        <figure className="dk-frame" ref={frameRef}>
          <div className="lp-frame-bar dk-bar" aria-hidden="true">
            <span className="lp-dots"><i /><i /><i /></span>
            <span className="lp-url">{desk.url}</span>
          </div>
          <div className="dk-stage dk-swap" key={desk.id}>
            <RealFrame desk={desk.id} onMeta={onMeta} />
          </div>
          <span className="dk-badge">Sample data</span>
        </figure>
        <p className="dk-cap">
          <span>{desk.caption}</span>
          <span>{meta.kind === 'video' ? (meta.runtime ?? 'Screen capture') : 'Live app · sample data'}</span>
        </p>
      </div>
    </div>
  );
}
