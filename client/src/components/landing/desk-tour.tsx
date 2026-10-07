/**
 * DESK TOUR — one tab rail (NEXUS · 0DTE · Flow · GEX · Sectors · Quantinum Bot ·
 * Journal) + ONE framed clip slot. Replaces the landing's 6-card feature grid and
 * the 6-screenshot gallery (docs/TERRA_TRADE_STUDY_2026-10-07.md §3 "Desk tab rail").
 *
 * Clip slot, per desk — files are picked up automatically, no code change:
 *    client/public/videos/<file>.mp4 (+ <file>.webm, + <file>.png poster), where
 *    <file> is nexus · 0dte · flow · gex · sectors · bot · journal (Remotion / screen
 *    captures of the real UI on sample data). The first time a desk is shown on
 *    screen, a HEAD request checks that /videos/<file>.mp4 is really a video (the SPA
 *    fallback answers missing files with HTML, so the content-type decides). If it
 *    is, the slot plays it `muted loop playsinline preload="none"` with the poster,
 *    only while ≥ 50 % of the frame is on screen; under prefers-reduced-motion it
 *    never autoplays (poster + native controls). A video that fails to load falls
 *    back to the mockup.
 *  - Otherwise: a small animated mockup of that desk, drawn in CSS/SVG on invented
 *    numbers and badged SAMPLE DATA. The animation runs only while on screen and
 *    is static under reduced motion. No image bytes, so it costs nothing on 4G.
 *
 * Motion (all off under reduced motion): the stage and copy cross-fade on a tab
 * change, the frame drifts a few px with scroll (parallax), mock rows settle in.
 *
 * Nothing here is market data; every mock is labelled.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';

type DeskId = 'nexus' | 'zerodte' | 'flow' | 'gex' | 'sectors' | 'bot' | 'journal';

/** The file stem in client/public/videos/ for each desk. */
const VIDEO_FILE: Record<DeskId, string> = {
  nexus: 'nexus', zerodte: '0dte', flow: 'flow', gex: 'gex', sectors: 'sectors', bot: 'bot', journal: 'journal',
};
type Clip = { mp4: string; webm: string | null; poster: string | null };
/** Per-desk probe result, shared across mounts: a Clip, null (no video), or a pending promise. */
const probed = new Map<DeskId, Clip | null | Promise<Clip | null>>();
/** HEAD a public file and accept it only if the server says it is that kind of file (the SPA fallback answers HTML). */
const isA = (url: string, kind: 'video/' | 'image/') => fetch(url, { method: 'HEAD', credentials: 'omit' })
  .then((r) => r.ok && (r.headers.get('content-type') ?? '').startsWith(kind)).catch(() => false);
function probeClip(id: DeskId): Promise<Clip | null> {
  const hit = probed.get(id);
  if (hit !== undefined) return Promise.resolve(hit);
  const f = VIDEO_FILE[id];
  const mp4 = `/videos/${f}.mp4`;
  // Posters may arrive as videos/posters/<f>.jpg, posters/<f>.jpg or videos/<f>.png — first one that exists wins.
  const posters = [`/videos/posters/${f}.jpg`, `/posters/${f}.jpg`, `/videos/${f}.jpg`, `/videos/${f}.png`];
  const p = isA(mp4, 'video/').then(async (ok) => {
    if (!ok) return null;
    const [webmOk, ...posterOk] = await Promise.all([isA(`/videos/${f}.webm`, 'video/'), ...posters.map((u) => isA(u, 'image/'))]);
    return { mp4, webm: webmOk ? `/videos/${f}.webm` : null, poster: posters[posterOk.findIndex(Boolean)] ?? null } as Clip;
  }).then((c) => { probed.set(id, c); return c; });
  probed.set(id, p);
  return p;
}

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

// ── mockups (invented numbers, labelled) ────────────────────────────────
function MockNexus() {
  const rows: Array<[string, 'L' | 'S', string, number]> = [['NVDA', 'L', 'A', 88], ['MSFT', 'L', 'A', 81], ['TSLA', 'S', 'B', 74], ['AMD', 'L', 'B', 69], ['COIN', 'S', 'C', 58]];
  return (
    <>
    <div className="dk-mh"><b>NEXUS · 12 setups today</b><span><i>All</i><i>Long</i><i>Short</i><i>Band A+</i></span></div>
    <div className="dk-nexus">
      <ul className="dk-rank">
        {rows.map(([s, side, band, score], i) => (
          <li key={s} style={{ ['--i' as string]: i }}>
            <b>{s}</b><span className={side === 'L' ? 'up' : 'down'}>{side === 'L' ? 'LONG' : 'SHORT'}</span>
            <span className="band">{band}</span><span className="bar"><i style={{ width: `${score}%` }} /></span><span className="num">{score}</span>
          </li>
        ))}
        <li className="dk-sel" aria-hidden="true" />
      </ul>
      <div className="dk-plan">
        <p className="k">NVDA · LONG · Band A</p>
        <dl><div><dt>Entry</dt><dd>124.10</dd></div><div><dt>Stop</dt><dd className="down">121.60</dd></div><div><dt>Target</dt><dd className="up">129.40</dd></div></dl>
        <p className="stamp">Published 10:42 ET · graded after it prints</p>
      </div>
    </div>
    </>
  );
}

function MockZeroDte() {
  const lv: Array<[string, number, string]> = [['Call wall', 12, 'c'], ['VWAP', 40, 'm'], ['Zero γ', 58, 'a'], ['Put wall', 86, 'r']];
  return (
    <div className="dk-ladder">
      {lv.map(([l, top, c]) => <div key={l} className={`lv ${c}`} style={{ top: `${top}%` }}><span>{l}</span></div>)}
      <div className="px" aria-hidden="true"><span>SPX</span></div>
      <svg className="trace" viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 62 L40 55 L80 60 L120 46 L160 50 L200 38 L240 44 L280 30 L320 36 L360 24 L400 30" />
      </svg>
    </div>
  );
}

function MockFlow() {
  const rows: Array<[string, string, string, string, 'up' | 'down']> = [
    ['SPY', '575C', '0DTE', '$1.2M · sweep', 'up'], ['NVDA', '130C', 'Oct 18', '$840K · block', 'up'], ['TSLA', '240P', 'Oct 11', '$610K · sweep', 'down'],
    ['QQQ', '490P', '0DTE', '$530K · sweep', 'down'], ['AAPL', '230C', 'Nov 15', '$420K · block', 'up'], ['AMD', '160C', 'Oct 18', '$380K · sweep', 'up'],
  ];
  const tape = [...rows, ...rows];
  return (
    <div className="dk-flow">
      <div className="tide"><span className="up" style={{ width: '58%' }}>Calls 58%</span><span className="down" style={{ width: '42%' }}>Puts 42%</span></div>
      <div className="tape"><ul>{tape.map(([s, k, e, p, d], i) => <li key={i}><b>{s}</b><span>{k}</span><span>{e}</span><span className={d}>{p}</span></li>)}</ul></div>
    </div>
  );
}

function MockGex() {
  const bars = Array.from({ length: 22 }, (_, i) => { const d = i - 9; return d < 0 ? -0.9 * Math.exp(-((d + 3) ** 2) / 10) : 1.5 * Math.exp(-((d - 7) ** 2) / 16); });
  const max = Math.max(...bars.map(Math.abs));
  return (
    <svg className="dk-gex" viewBox="0 0 440 200" role="img" aria-label="Sample net gamma by strike, call wall and put wall marked">
      <line x1="0" x2="440" y1="100" y2="100" className="axis" />
      {bars.map((v, i) => { const h = (Math.abs(v) / max) * 86; return <rect key={i} style={{ ['--i' as string]: i }} x={i * 20 + 3} width="14" y={v >= 0 ? 100 - h : 100} height={Math.max(1.5, h)} rx="2" className={v >= 0 ? 'pos' : 'neg'} />; })}
      <line x1="333" x2="333" y1="6" y2="194" className="wall c" /><text x="337" y="16">Call wall</text>
      <line x1="113" x2="113" y1="6" y2="194" className="wall r" /><text x="117" y="192">Put wall</text>
      <line x1="193" x2="193" y1="6" y2="194" className="wall a" /><text x="197" y="16">Zero γ</text>
    </svg>
  );
}

function MockSectors() {
  const s: Array<[string, number]> = [['XLK', 1.4], ['XLC', 0.9], ['XLY', 0.6], ['XLI', 0.3], ['XLF', 0.1], ['XLB', -0.2], ['XLV', -0.4], ['XLP', -0.6], ['XLRE', -0.8], ['XLU', -1.0], ['XLE', -1.3], ['SMH', 1.8]];
  return (
    <>
    <div className="dk-mh"><b>Sectors · vs SPY · today</b><span><i>1D</i><i>5D</i><i>20D</i></span></div>
    <div className="dk-sectors">
      {s.map(([n, v], i) => (
        <div key={n} className={v >= 0 ? 'up' : 'down'} style={{ ['--i' as string]: i, ['--a' as string]: Math.min(1, Math.abs(v) / 1.8) }}>
          <b>{n}</b><span>{v > 0 ? '+' : ''}{v.toFixed(1)}% vs SPY</span>
        </div>
      ))}
    </div>
    </>
  );
}

function MockBot() {
  const rows: Array<[string, string, string, string]> = [['10:31', 'BUY', 'NVDA 130C', 'fill 2.14'], ['10:58', 'BUY', 'MSFT 425C', 'fill 3.05'], ['11:20', 'SELL', 'TSLA 240P', 'stop −38%'], ['13:45', 'SELL', 'NVDA 130C', 'target +18%'], ['14:02', 'BUY', 'AMD 160C', 'fill 1.88']];
  return (
    <>
    <div className="dk-mh"><b>Quantinum Bot · paper ledger</b><span><i>Run 3</i><i>Paper</i></span></div>
    <div className="dk-bot">
      <dl className="k4"><div><dt>Closed</dt><dd>14</dd></div><div><dt>Open</dt><dd>3</dd></div><div><dt>Win rate</dt><dd>n&lt;30</dd></div><div><dt>Mode</dt><dd>Paper</dd></div></dl>
      <ul className="ledger">{rows.map(([t, a, c, f], i) => <li key={i} style={{ ['--i' as string]: i }}><time>{t}</time><b className={a === 'BUY' ? 'up' : 'down'}>{a}</b><span>{c}</span><span>{f}</span></li>)}</ul>
    </div>
    </>
  );
}

function MockJournal() {
  return (
    <>
    <div className="dk-mh"><b>Journal · last 30 days</b><span><i>All setups</i><i>Options</i></span></div>
    <div className="dk-journal">
      <dl className="k4"><div><dt>Net P&amp;L</dt><dd className="down">−$215</dd></div><div><dt>Trades</dt><dd>38</dd></div><div><dt>Win rate</dt><dd>45% · n=38</dd></div><div><dt>Profit factor</dt><dd>0.91</dd></div></dl>
      <svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
        <path className="curve" d="M0 60 L30 52 L60 58 L90 46 L120 54 L150 70 L180 66 L210 84 L240 78 L270 90 L300 82 L330 74 L360 80 L400 72" />
      </svg>
    </div>
    </>
  );
}

const MOCKS: Record<DeskId, () => React.ReactElement> = {
  nexus: MockNexus, zerodte: MockZeroDte, flow: MockFlow, gex: MockGex, sectors: MockSectors, bot: MockBot, journal: MockJournal,
};

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



const fmtRuntime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const PLAY = <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>;
const PAUSE = <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>;

/**
 * The stage for one desk: its screen capture when /videos/<file>.mp4 exists
 * (muted, looped, inline, poster, play/pause button), else the animated mockup.
 */
function DeskStage({ desk, onScreen, reduce, onMeta }: {
  desk: Desk; onScreen: boolean; reduce: boolean; onMeta: (m: { video: boolean; runtime: string | null }) => void;
}) {
  const id = desk.id;
  const [clip, setClip] = useState<Clip | null>(() => { const c = probed.get(id); return c && !(c instanceof Promise) ? c : null; });
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const Mock = MOCKS[id];

  // Probe lazily — only once this desk has actually been on screen.
  useEffect(() => {
    if (!onScreen) return;
    let live = true;
    probeClip(id).then((c) => { if (live) setClip(c); });
    return () => { live = false; };
  }, [id, onScreen]);

  const video = !!clip && !failed;
  useEffect(() => { if (!video) onMeta({ video: false, runtime: null }); }, [video, onMeta]);

  // Autoplay muted only while on screen, never under reduced motion, never after the visitor paused it.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (onScreen && !reduce && !userPaused) v.play().catch(() => { /* autoplay refused — the poster + play button stay */ });
    else v.pause();
  }, [onScreen, reduce, clip, userPaused]);

  if (video && clip) {
    const toggle = () => {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) { setUserPaused(false); v.play().catch(() => undefined); } else { setUserPaused(true); v.pause(); }
    };
    return (
      <>
        <video ref={videoRef} muted loop playsInline preload="metadata" poster={clip.poster ?? undefined}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)}
          onLoadedMetadata={(e) => onMeta({ video: true, runtime: Number.isFinite(e.currentTarget.duration) ? fmtRuntime(e.currentTarget.duration) : null })}
          aria-label={`${desk.tab} screen recording on sample data`}>
          {clip.webm && <source src={clip.webm} type="video/webm" />}
          <source src={clip.mp4} type="video/mp4" onError={() => setFailed(true)} />
        </video>
        <button type="button" className={`dk-play${playing ? ' is-playing' : ''}`} onClick={toggle}
          aria-label={playing ? `Pause the ${desk.tab} video` : `Play the ${desk.tab} video`}>
          {playing ? PAUSE : PLAY}
        </button>
      </>
    );
  }
  return <div className="dk-mock" role="img" aria-label={`${desk.tab} mockup on sample data: ${desk.line}`}><Mock /></div>;
}

/** Select a desk from elsewhere on the page (nav Product menu, ⌘K palette). */
export function showDesk(id: string) {
  window.dispatchEvent(new CustomEvent('qe:desk', { detail: id }));
}

export default function DeskTour() {
  const [active, setActive] = useState(0);
  const [onScreen, setOnScreen] = useState(false);
  const [meta, setMeta] = useState<{ video: boolean; runtime: string | null }>({ video: false, runtime: null });
  const frameRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const desk = DESKS[active];
  const onMeta = useCallback((m: { video: boolean; runtime: string | null }) => setMeta(m), []);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOnScreen(true); return; }
    const io = new IntersectionObserver(([e]) => setOnScreen(e.intersectionRatio >= 0.4), { threshold: [0, 0.4, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
        {/* key → re-mount on a tab change, which runs the ~250 ms CSS cross-fade */}
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
        <figure className={`dk-frame${onScreen && !reduce ? ' playing' : ''}`} ref={frameRef}>
          <div className="dk-stage dk-swap" key={desk.id}>
            <DeskStage desk={desk} onScreen={onScreen} reduce={reduce} onMeta={onMeta} />
          </div>
          <span className="dk-badge">Sample data</span>
        </figure>
        <p className="dk-cap">
          <span>{desk.caption}</span>
          <span>{meta.video ? (meta.runtime ?? 'Screen capture') : 'Animated mockup'}</span>
        </p>
      </div>
    </div>
  );
}
