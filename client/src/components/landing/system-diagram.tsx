/**
 * "How QuantEdge works" — the landing's systems diagram (2026-10-14).
 *
 * Five layers, top to bottom: DATA → ENGINES → DECISION → DELIVERY → PROOF, with
 * one feedback rail from PROOF back to DECISION ("calibrates — only with
 * approval"). Nodes are buttons: hover, focus or tap shows a one-line explainer
 * in the readout below (glossary text where the term exists — shared/glossary.ts).
 *
 * Plain HTML layers + inline SVG connectors in theme tokens (currentColor), so it
 * stays crisp at any width and stacks vertically on a phone without a second
 * drawing. Motion: layers rise in on first view and the connectors carry a slow
 * dash flow; under prefers-reduced-motion everything simply rests visible.
 * Styles: styles/landing-v2.css § system diagram.
 */
import { useEffect, useRef, useState } from 'react';
import { GLOSSARY, type GlossaryKey } from '@shared/glossary';

interface SysNode { id: string; name: string; sub?: string; tip: string; term?: GlossaryKey }
interface SysLayer { id: string; num: string; name: string; role: string; nodes: SysNode[] }

const LAYERS: SysLayer[] = [
  { id: 'data', num: '01', name: 'Data', role: 'What comes in', nodes: [
    { id: 'chains', name: 'Options chains & OI', tip: 'Every strike and expiry with open interest and greeks — the raw material for dealer positioning.' },
    { id: 'flow-in', name: 'Options flow', term: 'flow', tip: '' },
    { id: 'bars', name: 'Price bars', sub: '1m · 5m', tip: 'One- and five-minute bars for the underlying — the clock every trigger, stop and target is checked against.' },
    { id: 'snaps', name: 'GEX/VEX snapshots', sub: 'every 5 min', tip: 'The positioning map is re-computed and stored every five minutes, so a level can be traced back to the moment it was drawn.' },
    { id: 'breadth', name: 'Sector breadth', tip: 'How many names in each sector are moving together — rotation shows here before it shows in an index.' },
    { id: 'news', name: 'News & catalysts', tip: 'Headlines and scheduled events attached to the symbol, so a setup knows what could move it.' },
    { id: 'earnings', name: 'Earnings calendar', tip: 'Report dates, so a plan isn’t built blind into an earnings gap.' },
  ] },
  { id: 'engines', num: '02', name: 'Engines', role: 'What reads it', nodes: [
    { id: 'gex', name: 'GEX/VEX engine', sub: 'walls · flip · Apex node · horizons', term: 'gex', tip: '' },
    { id: 'flow', name: 'Flow engine', tip: 'Groups prints by contract, side and size so a burst of unusual activity stands out from the background.' },
    { id: 'zdte', name: '0DTE desk', sub: 'flow ignition · open drive · wall fade · sniper', term: '0dte', tip: '' },
    { id: 'rotation', name: 'Sector rotation', sub: 'ignition', tip: 'Spots money moving into a sector early, from breadth and relative strength rather than one ticker.' },
    { id: 'scanners', name: 'Pattern & market scanners', tip: 'Breakouts, ranges and structure across the watchlist, each tagged with the rule that found it.' },
    { id: 'path', name: 'Weekly Path model', tip: 'A probability-weighted path for the week built from positioning and volatility — a range of outcomes, not a prediction.' },
    { id: 'leaps', name: 'LEAPS & Swings screener', tip: 'Longer-dated setups for people who don’t trade the open — same evidence rules, slower clock.' },
  ] },
  { id: 'decision', num: '03', name: 'Decision', role: 'What becomes a play', nodes: [
    { id: 'grade', name: 'NEXUS grade', sub: 'evidence · technical · lifecycle · window · session', tip: 'Each idea is graded on five separate checks; the grade shows which ones passed instead of one opaque score.' },
    { id: 'contract', name: 'Contract picker', sub: 'whole contracts · $500–$1,000 risk · liquidity gate', tip: 'Options only. Picks a specific contract, sizes it in whole contracts to a $500–$1,000 risk budget, and drops anything too thin to fill.' },
    { id: 'plan', name: 'The plan', sub: 'trigger · stop · T1 / T2 · time stop', term: 'targets', tip: '' },
  ] },
  { id: 'delivery', num: '04', name: 'Delivery', role: 'Where you see it', nodes: [
    { id: 'nexus', name: 'NEXUS desk', tip: 'Ranked setups with their evidence, plan and age on one screen.' },
    { id: 'zdte-desk', name: '0DTE desk', tip: 'Same-day index and single-name plays with their contract, trigger and time stop.' },
    { id: 'chart', name: 'Chart', sub: 'orbs · levels · drawings', term: 'orb', tip: '' },
    { id: 'trinity', name: 'Trinity', tip: 'SPY, QQQ and IWM positioning side by side, with a read on whether the three agree.' },
    { id: 'ask', name: 'Ask Quantinum', sub: 'sourced answers', tip: 'Ask about a symbol and get an answer built from the engines above, with the source of each number shown.' },
    { id: 'discord', name: 'Discord live cards', sub: 'entry · exit', tip: 'A card when a play triggers and another when it exits, posted with the same levels as the desk.' },
    { id: 'bot', name: 'Quantinum Bot', sub: 'paper', tip: 'Takes the plays on paper with the published rules, so its ledger is a record of the system — not of anyone’s money.' },
  ] },
  { id: 'proof', num: '05', name: 'Proof & learning', role: 'How it’s checked', nodes: [
    { id: 'tracking', name: 'Option-price tracking', sub: 'T1 · stop · peak on the contract’s own bars', tip: 'Outcomes are graded on the option’s own minute bars, not the stock’s — a target only counts if the contract actually traded there.' },
    { id: 'verify', name: 'Nightly bar verification', tip: 'After the close (17:30 ET) each recorded outcome is re-priced from minute bars; rows the bars contradict are corrected or left out of the headline.' },
    { id: 'journal', name: 'Verified journal', tip: 'The headline book counts only plays that actually triggered and passed bar verification — ideas that never filled don’t count.' },
    { id: 'learn', name: 'Learning loop', sub: 'scorecard → walk-forward re-fit → shadow → human approval', tip: 'Results feed a scorecard; changes are re-fit walk-forward, run in shadow beside the live rules, and ship only when a person approves.' },
  ] },
];

const LINKS = ['feeds', 'scores', 'publishes', 'tracks'];

function tipOf(n: SysNode) {
  return n.term ? GLOSSARY[n.term].short : n.tip;
}

/** The connector between two layers: three strands converging on one arrow, plus its verb. */
function Link({ label }: { label: string }) {
  return (
    <div className="sys-link" aria-hidden="true">
      <svg viewBox="0 0 120 44" preserveAspectRatio="xMidYMid meet">
        <path className="flow" d="M20 2 C20 22 60 18 60 34" />
        <path className="flow" d="M60 2 L60 34" />
        <path className="flow" d="M100 2 C100 22 60 18 60 34" />
        <path className="head" d="M54 33 L60 42 L66 33 Z" />
      </svg>
      <span>{label}</span>
    </div>
  );
}

export default function SystemDiagram() {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'rest' | 'armed' | 'on'>('rest');
  const [active, setActive] = useState<SysNode | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    // Only hide-then-reveal when it starts below the fold — never blank something already on screen.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    setState('armed');
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { setState('on'); io.disconnect(); }
    }, { rootMargin: '0px 0px -15% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const shown = active ?? null;
  const layer = (l: SysLayer, i: number) => (
    <div className={`sys-layer l-${l.id}`} style={{ ['--i' as string]: i }} role="group" aria-labelledby={`sys-${l.id}`}>
      <header>
        <span className="sys-num">{l.num}</span>
        <h3 id={`sys-${l.id}`}>{l.name}</h3>
        <span className="sys-role">{l.role}</span>
      </header>
      <ul className="sys-nodes">
        {l.nodes.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className={shown?.id === n.id ? 'on' : ''}
              aria-pressed={shown?.id === n.id}
              aria-describedby="sys-readout"
              onMouseEnter={() => setActive(n)}
              onFocus={() => setActive(n)}
              onClick={() => setActive(n)}
            >
              <b>{n.name}</b>
              {n.sub && <small>{n.sub}</small>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <figure className={`sys ${state}`} ref={ref} aria-label="How QuantEdge works: data feeds the engines, the engines score decisions, decisions are delivered to the desks, and every delivered play is tracked and verified; the proof layer calibrates the decision layer only with human approval.">
      <div className="sys-stack">
        {layer(LAYERS[0], 0)}
        <Link label={LINKS[0]} />
        {layer(LAYERS[1], 1)}
        <Link label={LINKS[1]} />
        <div className="sys-loop">
          {layer(LAYERS[2], 2)}
          <Link label={LINKS[2]} />
          {layer(LAYERS[3], 3)}
          <Link label={LINKS[3]} />
          {layer(LAYERS[4], 4)}
          <div className="sys-rail" aria-hidden="true">
            <svg className="rail-line" viewBox="0 0 40 100" preserveAspectRatio="none">
              <path d="M0 96 H28 V4 H6" vectorEffect="non-scaling-stroke" />
            </svg>
            <svg className="rail-head" viewBox="0 0 10 10"><path d="M10 0 L0 5 L10 10 Z" /></svg>
            <span>calibrates · only with approval</span>
          </div>
        </div>
      </div>
      <figcaption>
        <p id="sys-readout" className="sys-readout" aria-live="polite">
          {shown
            ? <><b>{shown.name}</b> — {tipOf(shown)}</>
            : <>Hover or tap any box for what it does. Arrows are data flow; the rail on the right is the only path back — results can re-tune the decision layer, but only after a person approves the change.</>}
        </p>
      </figcaption>
    </figure>
  );
}
