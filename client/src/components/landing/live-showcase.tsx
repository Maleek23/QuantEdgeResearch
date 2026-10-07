/**
 * LIVE SHOWCASE — the landing's product panels, rendered as real UI on real data.
 *
 * Data: GET /api/public/showcase (no auth, 15 s server cache) polled every 15 s,
 * plus the app's live price bus (/ws/prices, anonymous) for SPY / QQQ / BTC.
 * Nothing is interpolated: a number changes only when a real print or a real
 * poll changes it (and flashes like the app); between prints only the age
 * stamps advance, once a second.
 *
 * Never empty (beta-readiness 2026-10-07): until the live read arrives — or when
 * a live section is empty or the feed is down — that section renders the
 * labelled SAMPLE from showcase-sample.ts (SAMPLE badge, "Sample data" instead
 * of an age, no source, no live dot) and swaps to live the moment it lands.
 *
 * Panels: Today · NEXUS (delayed ≥ 24 h) · GEX · Crypto · Catalysts ·
 * Quantinum Bot · Journal (the bot's paper book). One horizontal scroll-snap
 * track: tabs on desktop, swipe on phone.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { subscribeLivePrice, type LiveTick } from '@/lib/live-price-bus';
import { sampleShowcase } from './showcase-sample';
import type { PublicRecord } from '@shared/landing-record';

type Section<T> = { data: T | null; asOf: string | null; error?: string };
type Quote = { symbol: string; price: number; changePct: number | null; source: string; asOf: string; delayed?: boolean };
type Gex = {
  symbol: string; spot: number; callWall: number | null; putWall: number | null; zeroGamma: number | null;
  /** '≤7d' | 'all exp.' — which book the walls are from (shared/gex-wall-basis.ts). */
  wallBasisLabel?: string;
  maxGammaStrike: number | null; regime: string | null; netGexB: number | null; source: string | null;
  chainAgeMs: number | null; delayedFeed: boolean; profile: Array<{ strike: number; netGex: number }>;
};
type Idea = { symbol: string; side: string; band: string | null; publishedAt: string; outcome: string | null; percentGain: number | null; assetType: string };
type Mover = { symbol: string; name: string; price: number; change24h: number };
type Catalyst = { symbol: string; date: string; estimate: string | null };
export type ShowcaseBot = {
  closed: number; open: number; wins: number; winRate: number | null; minSample: number; netRealizedPnL: number;
  avgWinPct: number | null; avgLossPct: number | null; profitFactor: number | null; since: string | null;
  runLabel: string | null; startingCapital: number | null;
};
export type Showcase = {
  builtAt: string; quotes: Section<Quote[]>; gex: Section<Gex>; ideas: Section<Idea[]>;
  crypto: Section<Mover[]>; catalysts: Section<Catalyst[]>; bot: Section<ShowcaseBot>;
  /** Bar-verified NEXUS record (shared/landing-record.ts). Never sampled — absent on older servers. */
  record?: Section<PublicRecord>;
};

const POLL_MS = 15_000;
const LIVE_SYMBOLS = ['SPY', 'QQQ', 'BTC'] as const;

// ── formatting ───────────────────────────────────────────────────────────
const fmtPx = (n: number, sym?: string) => {
  const d = sym === 'BTC' || n >= 1000 ? 0 : 2;
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
};
const fmtPct = (n: number | null | undefined, digits = 2) =>
  n == null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
const fmtUsd = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
function fmtAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
const fmtDate = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
/** Publish stamp: date + 24-hour New York time ("Sep 29 · 10:42 ET"). */
const fmtStamp = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' });
  return `${date} · ${time} ET`;
};
const REGIME: Record<string, [string, string]> = {
  positive_gamma: ['Positive gamma', 'Dealers are long gamma — they tend to sell rips and buy dips, damping moves.'],
  negative_gamma: ['Negative gamma', 'Dealers are short gamma — their hedging tends to extend moves in either direction.'],
  neutral: ['Neutral gamma', 'Dealer gamma is near balanced — little hedging pressure either way.'],
  transitioning: ['Transitioning', 'Spot is near the zero-gamma line — the hedging regime can flip on a small move.'],
};
const OUTCOME: Record<string, [string, 'up' | 'down' | 'flat']> = {
  hit_target: ['Hit target', 'up'], hit_stop: ['Hit stop', 'down'], manual_exit: ['Closed', 'flat'], expired: ['Expired', 'flat'],
};

// ── hooks ────────────────────────────────────────────────────────────────
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** 'up' | 'down' for ~700 ms after a REAL change of `value`. */
function useFlash(value: number | null | undefined) {
  const prev = useRef<number | null | undefined>(value);
  const [dir, setDir] = useState<'' | 'up' | 'down'>('');
  useEffect(() => {
    const p = prev.current;
    prev.current = value;
    if (p == null || value == null || p === value) return;
    setDir(value > p ? 'up' : 'down');
    const t = setTimeout(() => setDir(''), 700);
    return () => clearTimeout(t);
  }, [value]);
  return dir;
}

/* One shared poll for every consumer on the page (the live panels and the
   landing's record band read the same payload — one request per 15 s, not two). */
type Store = { data: Showcase | null; failed: boolean };
let store: Store = { data: null, failed: false };
const subs = new Set<(s: Store) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
async function loadShowcase() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  try {
    const r = await fetch('/api/public/showcase', { credentials: 'omit' });
    if (!r.ok) throw new Error(String(r.status));
    store = { data: (await r.json()) as Showcase, failed: false };
  } catch { store = { ...store, failed: true }; }
  subs.forEach((f) => f(store));
}

/** The showcase payload, polled every 15 s while at least one consumer is active. */
export function useShowcase(active: boolean) {
  const [s, setS] = useState<Store>(store);
  useEffect(() => {
    if (!active) return;
    subs.add(setS);
    setS(store);
    if (!timer) { loadShowcase(); timer = setInterval(loadShowcase, POLL_MS); }
    return () => {
      subs.delete(setS);
      if (!subs.size && timer) { clearInterval(timer); timer = null; }
    };
  }, [active]);
  return s;
}

/** Ask the live panels to show one tab (e.g. from the landing's record band). */
export function showShowcaseTab(id: string) {
  window.dispatchEvent(new CustomEvent('qe:showcase-tab', { detail: id }));
}

function useLiveTicks(active: boolean) {
  const [ticks, setTicks] = useState<Record<string, LiveTick>>({});
  useEffect(() => {
    if (!active) return;
    const offs = LIVE_SYMBOLS.map((s) => subscribeLivePrice(s, (t) => setTicks((prev) => ({ ...prev, [s]: t }))));
    return () => offs.forEach((off) => off());
  }, [active]);
  return ticks;
}

// ── atoms ────────────────────────────────────────────────────────────────
/** Age stamp — or, for a SAMPLE section, the plain label (a sample has no age and no source). */
function Age({ iso, now, prefix, sample }: { iso: string | null | undefined; now: number; prefix?: string; sample?: string | false }) {
  if (sample) return <span className="sc-age sample">{sample}</span>;
  if (!iso) return <span className="sc-age">Waiting for the first read</span>;
  const ms = now - new Date(iso).getTime();
  return <span className={`sc-age${ms > 15 * 60_000 ? ' old' : ''}`}>{prefix ? `${prefix} · ` : ''}{fmtAge(ms)}</span>;
}

function Px({ value, sym, className = '' }: { value: number | null | undefined; sym?: string; className?: string }) {
  const flash = useFlash(value);
  return <span className={`sc-px ${className}${flash ? ` flash-${flash}` : ''}`}>{value == null ? '—' : fmtPx(value, sym)}</span>;
}

function SampleBadge({ on }: { on: boolean }) {
  return on ? <span className="sc-badge sample" title="Illustrative numbers — replaced by the live read when it arrives">Sample</span> : null;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="sc-empty">{children}</p>;
}

function PanelFoot({ href, label }: { href: string; label: string }) {
  return (
    <div className="sc-foot">
      <Link href={href} className="sc-open">Open {label} in the terminal <span aria-hidden="true">→</span></Link>
    </div>
  );
}

// ── GEX profile in the gamma-mark style ─────────────────────────────────
function GexBars({ g }: { g: Gex }) {
  const rows = useMemo(() => [...g.profile].sort((a, b) => a.strike - b.strike), [g.profile]);
  if (rows.length < 3) return <Empty>Strike profile not available for this read.</Empty>;
  const max = Math.max(...rows.map((r) => Math.abs(r.netGex))) || 1;
  const W = 520, H = 180, mid = H / 2, bw = W / rows.length;
  const xOf = (strike: number) => {
    const lo = rows[0].strike, hi = rows[rows.length - 1].strike;
    return hi === lo ? W / 2 : ((strike - lo) / (hi - lo)) * (W - bw) + bw / 2;
  };
  const marks: Array<[number | null, string, string]> = [
    [g.callWall, 'Call wall', 'var(--cyan-bright)'],
    [g.putWall, 'Put wall', 'var(--red)'],
    [g.zeroGamma, 'Zero γ', 'var(--amber)'],
  ];
  const lo = rows[0].strike, hi = rows[rows.length - 1].strike;
  return (
    <svg className="sc-gex" viewBox={`0 0 ${W} ${H + 18}`} role="img"
      aria-label={`SPY net gamma by strike from ${lo} to ${hi}; spot ${fmtPx(g.spot)}`}>
      <line x1="0" x2={W} y1={mid} y2={mid} stroke="var(--nx-border-hi)" />
      {rows.map((r, i) => {
        const h = Math.max(1.2, (Math.abs(r.netGex) / max) * (mid - 6));
        const pos = r.netGex >= 0;
        return <rect key={r.strike} x={i * bw + bw * 0.14} width={bw * 0.72} y={pos ? mid - h : mid} height={h} rx="1.5"
          fill={pos ? 'var(--cyan)' : 'var(--red)'} fillOpacity={0.78}><title>{`${r.strike}: ${r.netGex.toFixed(2)}B`}</title></rect>;
      })}
      {marks.map(([v, , c]) => (v != null && v >= lo && v <= hi
        ? <line key={String(c)} x1={xOf(v)} x2={xOf(v)} y1="4" y2={H - 4} stroke={c} strokeDasharray="3 3" strokeWidth="1.5" />
        : null))}
      {g.spot >= lo && g.spot <= hi && <line x1={xOf(g.spot)} x2={xOf(g.spot)} y1="0" y2={H} stroke="var(--text)" strokeWidth="1.5" />}
      <text x="2" y={H + 14} className="sc-gex-ax">{lo}</text>
      <text x={W - 2} y={H + 14} textAnchor="end" className="sc-gex-ax">{hi}</text>
      {g.spot >= lo && g.spot <= hi && <text x={xOf(g.spot)} y={H + 14} textAnchor="middle" className="sc-gex-ax spot">spot</text>}
    </svg>
  );
}

// ── panels ──────────────────────────────────────────────────────────────
type SectionKey = 'quotes' | 'gex' | 'ideas' | 'crypto' | 'catalysts' | 'bot';
type LiveQuote = Quote & { live?: boolean; sample?: boolean };
type PanelProps = {
  /** Live where a live section has data; the labelled sample everywhere else. Never null. */
  d: Showcase; now: number; quotes: Record<string, LiveQuote>;
  /** Which sections are showing the sample. */
  sample: Record<SectionKey, boolean>;
  /** What a sample section says in place of its age. */
  sampleNote: string;
};

function TodayPanel({ d, now, quotes, sample, sampleNote }: PanelProps) {
  const g = d.gex.data;
  const reg = g?.regime ? REGIME[g.regime] : null;
  return (
    <>
      <div className="sc-quotes">
        {LIVE_SYMBOLS.map((s) => {
          const q = quotes[s];
          return (
            <div className="sc-quote" key={s}>
              <div className="sc-quote-top"><b>{s}</b>{q?.live && <span className="sc-live-dot" title="Live stream" />}<SampleBadge on={!!q?.sample} /></div>
              <Px value={q?.price} sym={s} className="big" />
              <span className={`sc-chg ${q?.changePct == null ? '' : q.changePct >= 0 ? 'up' : 'down'}`}>{fmtPct(q?.changePct)}</span>
              <Age iso={q?.asOf} now={now} prefix={q?.source} sample={q?.sample ? 'Sample' : false} />
            </div>
          );
        })}
      </div>
      <div className="sc-read">
        <h4>SPY dealer map <SampleBadge on={sample.gex} /></h4>
        {g ? (
          <>
            <p className="sc-read-line"><b>{reg?.[0] ?? 'Regime unknown'}</b>{reg ? ` — ${reg[1]}` : ''}{g.zeroGamma != null ? ` Spot is ${g.spot >= g.zeroGamma ? 'above' : 'below'} zero γ.` : ''}</p>
            <dl className="sc-levels" title={g.wallBasisLabel ? `Walls and zero γ from the ${g.wallBasisLabel} book` : undefined}>
              <div><dt>Call wall</dt><dd className="c">{g.callWall ?? '—'}</dd></div>
              <div><dt>Zero γ</dt><dd className="a">{g.zeroGamma != null ? fmtPx(g.zeroGamma) : '—'}</dd></div>
              <div><dt>Put wall</dt><dd className="r">{g.putWall ?? '—'}</dd></div>
            </dl>
            <Age iso={d.gex.asOf} now={now} sample={sample.gex && sampleNote}
              prefix={`GEX${g.wallBasisLabel ? ` · walls ${g.wallBasisLabel}` : ''}${g.source ? ` · ${g.source}` : ''}${g.delayedFeed ? ' · delayed chain' : ''}`} />
          </>
        ) : <Empty>SPY dealer levels appear here once the options chain is read.</Empty>}
      </div>
      <PanelFoot href="/today" label="Today" />
    </>
  );
}

function NexusPanel({ d, now, sample, sampleNote }: PanelProps) {
  const ideas = d.ideas.data ?? [];
  return (
    <>
      <p className="sc-note"><SampleBadge on={sample.ideas} /><span className="sc-badge">Delayed 24h</span> Members see today’s ideas live. These were published at least a day ago. Outcomes are measured from each idea’s published entry — model results, not trades anyone placed, before fees and slippage.</p>
      <ul className="sc-list">
        {ideas.map((i) => {
          const o = i.outcome ? OUTCOME[i.outcome] : null;
          return (
            <li key={`${i.symbol}-${i.publishedAt}`} className="sc-idea">
              <b className="sym">{i.symbol}</b>
              <span className={`side ${i.side === 'short' ? 'down' : 'up'}`}>{i.side === 'short' ? 'SHORT' : 'LONG'}</span>
              <span className="band" title="Conviction band at publish">{i.band ? `Band ${i.band}` : 'Unbanded'}</span>
              <time className="when" dateTime={i.publishedAt} title="Published">{fmtStamp(i.publishedAt)}</time>
              <span className={`out ${o ? o[1] : 'open'}`}>{o ? `${o[0]}${i.percentGain != null ? ` ${fmtPct(i.percentGain, 1)}` : ''}` : 'Still open'}</span>
            </li>
          );
        })}
      </ul>
      <Age iso={d.ideas.asOf} now={now} prefix="Checked" sample={sample.ideas && sampleNote} />
      <PanelFoot href="/t" label="NEXUS" />
    </>
  );
}

function GexPanel({ d, now, sample, sampleNote }: PanelProps) {
  const g = d.gex.data;
  return (
    <>
      {g ? (
        <>
          <div className="sc-gex-head">
            <div><span className="lbl">SPY spot <SampleBadge on={sample.gex} /></span><Px value={g.spot} className="big" /></div>
            <div><span className="lbl">Net GEX</span><span className="sc-px big">{g.netGexB != null ? `${g.netGexB >= 0 ? '+' : ''}${g.netGexB.toFixed(2)}B` : '—'}</span></div>
            <div><span className="lbl">Regime</span><span className="sc-px">{g.regime ? REGIME[g.regime]?.[0] ?? g.regime : '—'}</span></div>
          </div>
          <GexBars g={g} />
          <div className="sc-legend">
            <span><i className="c" />Call wall {g.callWall ?? '—'}</span>
            <span><i className="a" />Zero γ {g.zeroGamma != null ? fmtPx(g.zeroGamma) : '—'}</span>
            <span><i className="r" />Put wall {g.putWall ?? '—'}</span>
          </div>
          <Age iso={d.gex.asOf} now={now} sample={sample.gex && sampleNote}
            prefix={`${g.wallBasisLabel ? `walls ${g.wallBasisLabel} · ` : ''}${g.source ?? 'chain'}${g.delayedFeed ? ' · delayed chain' : ''}`} />
        </>
      ) : <Empty>The SPY gamma profile appears here once the options chain is read.</Empty>}
      <PanelFoot href="/t?tab=gex" label="GEX" />
    </>
  );
}

function CryptoPanel({ d, now, quotes, sample, sampleNote }: PanelProps) {
  const movers = d.crypto.data ?? [];
  const btc = quotes.BTC;
  return (
    <>
      <p className="sc-note"><SampleBadge on={sample.crypto} />Crypto trades 24/7 — these move on weekends too.</p>
      <ul className="sc-list">
        {movers.map((m) => (
          <li key={m.symbol} className="sc-row">
            <b className="sym">{m.symbol}</b><span className="name">{m.name}</span>
            <Px value={m.symbol === 'BTC' && btc && !btc.sample && !sample.crypto ? btc.price : m.price} sym={m.symbol} />
            <span className={`sc-chg ${m.change24h >= 0 ? 'up' : 'down'}`}>{fmtPct(m.change24h)}</span>
          </li>
        ))}
      </ul>
      <Age iso={d.crypto.asOf} now={now} prefix="24h change" sample={sample.crypto && sampleNote} />
      <PanelFoot href="/t?tab=crypto" label="Crypto" />
    </>
  );
}

function CatalystsPanel({ d, now, sample, sampleNote }: PanelProps) {
  const cats = d.catalysts.data ?? [];
  return (
    <>
      <p className="sc-note"><SampleBadge on={sample.catalysts} />Next scheduled earnings from the watched list.</p>
      <ul className="sc-list">
        {cats.map((c) => (
          <li key={`${c.symbol}-${c.date}`} className="sc-row">
            <span className="sc-date">{fmtDate(c.date)}</span>
            <b className="sym">{c.symbol}</b>
            <span className="name">Earnings</span>
            <span className="est">{c.estimate ? `EPS est. ${c.estimate}` : 'No estimate'}</span>
          </li>
        ))}
      </ul>
      <Age iso={d.catalysts.asOf} now={now} prefix="Calendar" sample={sample.catalysts && sampleNote} />
      <PanelFoot href="/t?tab=catalyst" label="Catalysts" />
    </>
  );
}

function BotPanel({ d, now, sample, sampleNote }: PanelProps) {
  const b = d.bot.data;
  return (
    <>
      <p className="sc-note"><SampleBadge on={sample.bot} />Quantinum Bot trades NEXUS’s published ideas on paper. No real money. Simulated results have limits (fills are modelled) and past performance does not guarantee future results.</p>
      {b && (
        <>
          <dl className="sc-stats">
            <div><dt>Closed trades</dt><dd>{b.closed}</dd></div>
            <div><dt>Win rate</dt><dd>{b.winRate != null ? `${(b.winRate * 100).toFixed(0)}%` : `n<${b.minSample}`}</dd></div>
            <div><dt>Open now</dt><dd>{b.open}</dd></div>
            <div><dt>Since</dt><dd>{b.since ? fmtDate(b.since) : '—'}</dd></div>
          </dl>
          {b.winRate == null && <p className="sc-fine">Win rate is shown once the run has {b.minSample} closed trades (n = {b.closed}) — smaller samples mislead.</p>}
          {b.runLabel && <p className="sc-fine">{b.runLabel}</p>}
        </>
      )}
      <Age iso={d.bot.asOf} now={now} prefix="Ledger" sample={sample.bot && sampleNote} />
      <PanelFoot href="/t?tab=bot" label="Quantinum Bot" />
    </>
  );
}

function JournalPanel({ d, now, sample, sampleNote }: PanelProps) {
  const b = d.bot.data;
  return (
    <>
      <p className="sc-note"><SampleBadge on={sample.bot} /><span className="sc-badge">Demo</span> This is the Quantinum Bot’s paper book — your journal measures your own trades the same way.</p>
      {b && (
        <dl className="sc-stats">
          <div><dt>Paper net P&amp;L</dt><dd className={b.netRealizedPnL >= 0 ? 'up' : 'down'}>{fmtUsd(b.netRealizedPnL)}</dd></div>
          <div><dt>Closed / open</dt><dd>{b.closed} / {b.open}</dd></div>
          <div><dt>Avg win · loss</dt><dd>{b.avgWinPct != null ? `${fmtPct(b.avgWinPct, 1)} · ${fmtPct(b.avgLossPct, 1)}` : `n<${b.minSample}`}</dd></div>
          <div><dt>Profit factor</dt><dd>{b.profitFactor != null ? b.profitFactor.toFixed(2) : `n<${b.minSample}`}</dd></div>
        </dl>
      )}
      {b && b.closed < b.minSample && <p className="sc-fine">Ratios appear at n ≥ {b.minSample} closed trades (n = {b.closed}).</p>}
      <Age iso={d.bot.asOf} now={now} prefix="Paper book" sample={sample.bot && sampleNote} />
      <PanelFoot href="/t?tab=journal" label="Journal" />
    </>
  );
}

const PANELS: Array<{ id: string; label: string; title: string; url: string; C: (p: PanelProps) => React.ReactElement }> = [
  { id: 'today', label: 'Today', title: 'The market read, with SPY’s dealer levels', url: 'quantedgelabs.net/today', C: TodayPanel },
  { id: 'nexus', label: 'NEXUS', title: 'Ideas ranked by evidence — and graded after', url: 'quantedgelabs.net/t', C: NexusPanel },
  { id: 'gex', label: 'GEX', title: 'SPY net gamma by strike', url: 'quantedgelabs.net/t?tab=gex', C: GexPanel },
  { id: 'crypto', label: 'Crypto', title: 'Biggest 24h movers', url: 'quantedgelabs.net/t?tab=crypto', C: CryptoPanel },
  { id: 'catalysts', label: 'Catalysts', title: 'What’s on the calendar', url: 'quantedgelabs.net/t?tab=catalyst', C: CatalystsPanel },
  { id: 'bot', label: 'Quantinum Bot', title: 'The paper record, sample size attached', url: 'quantedgelabs.net/t?tab=bot', C: BotPanel },
  { id: 'journal', label: 'Journal', title: 'A book measured honestly', url: 'quantedgelabs.net/t?tab=journal', C: JournalPanel },
];

/** The section has something to draw (an empty list counts as nothing — show the sample, not a blank). */
function hasData(s: Section<unknown> | undefined): boolean {
  if (!s || s.data == null) return false;
  return !Array.isArray(s.data) || s.data.length > 0;
}

/** True while `ref` is within 200px of the viewport (always true without IntersectionObserver). */
function useNearScreen(ref: React.RefObject<HTMLElement>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return visible;
}

/**
 * The showcase as the panels render it: live where a live section has data, the
 * labelled sample everywhere else (never "—"). Shared by the tabbed showcase and
 * the single-panel windows the landing's feature sections use.
 */
export function useShowcaseView(visible: boolean) {
  const { data, failed } = useShowcase(visible);
  const ticks = useLiveTicks(visible);
  const now = useNow(visible);
  const sampleData = useMemo(() => sampleShowcase(), []);

  // Live where a live section has data, the labelled sample everywhere else.
  const { view, sample } = useMemo(() => {
    const keys: SectionKey[] = ['quotes', 'gex', 'ideas', 'crypto', 'catalysts', 'bot'];
    const s = {} as Record<SectionKey, boolean>;
    const v: Showcase = { ...sampleData, builtAt: data?.builtAt ?? sampleData.builtAt };
    for (const k of keys) {
      const live = data?.[k] as Section<unknown> | undefined;
      s[k] = !hasData(live);
      if (!s[k]) (v as Record<SectionKey, unknown>)[k] = live;
    }
    return { view: v, sample: s };
  }, [data, sampleData]);

  // A live print replaces the polled quote only when it is newer; a symbol with neither shows its sample.
  const quotes = useMemo(() => {
    const out: Record<string, LiveQuote> = {};
    if (!sample.quotes) for (const q of view.quotes.data ?? []) out[q.symbol] = q;
    for (const s of LIVE_SYMBOLS) {
      const t = ticks[s];
      const q = out[s];
      if (t && (!q || t.ts > new Date(q.asOf).getTime())) {
        out[s] = { symbol: s, price: t.price, changePct: q?.changePct ?? null, source: t.source, asOf: new Date(t.ts).toISOString(), live: t.live };
      }
      if (!out[s]) {
        const sq = sampleData.quotes.data?.find((x) => x.symbol === s);
        if (sq) out[s] = { ...sq, sample: true };
      }
    }
    return out;
  }, [view, sample.quotes, ticks, sampleData]);

  const anySample = Object.values(sample).some(Boolean) || LIVE_SYMBOLS.some((s) => quotes[s]?.sample);
  const allSample = !data;
  const sampleNote = failed ? 'Sample data · live feed unavailable' : 'Sample data · live read loading';
  const status = allSample
    ? (failed ? 'Sample data · live feed unavailable' : 'Sample data · loading live…')
    : failed ? 'Refresh failed · showing the last read'
      : anySample ? 'Live · some panels sample' : 'Live data';
  const isLive = !allSample && !failed;
  return { data, failed, view, sample, quotes, now, anySample, allSample, sampleNote, status, isLive };
}

export type ShowcasePanelId = 'today' | 'nexus' | 'gex' | 'crypto' | 'catalysts' | 'bot' | 'journal';

/** One showcase panel in a browser frame — for a feature section's visual. Sample-first, live when it lands. */
export function ShowcaseWindow({ id, className = '' }: { id: ShowcasePanelId; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const visible = useNearScreen(ref);
  const v = useShowcaseView(visible);
  const p = PANELS.find((x) => x.id === id) ?? PANELS[0];
  const C = p.C;
  return (
    <figure className={`lp-frame sc-frame sc-window ${className}`} ref={ref}>
      <div className="lp-frame-bar">
        <span className="lp-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="lp-url">{p.url}</span>
        <span className="sc-status" aria-live="polite">{v.isLive && <span className="sc-live-dot" />}{v.status}</span>
      </div>
      <section className="sc-panel" aria-label={p.title}>
        <h3 className="sc-title">{p.title}</h3>
        <C d={v.view} now={v.now} quotes={v.quotes} sample={v.sample} sampleNote={v.sampleNote} />
      </section>
    </figure>
  );
}

export default function LiveShowcase() {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const visible = useNearScreen(rootRef);
  const { data, failed, view, sample, quotes, now, anySample, allSample, sampleNote } = useShowcaseView(visible);

  const goTo = (i: number) => {
    const track = trackRef.current;
    setActive(i);
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (track) track.scrollTo({ left: i * track.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
  };
  // showShowcaseTab(id) from elsewhere on the page selects a panel and brings it into view.
  useEffect(() => {
    const on = (e: Event) => {
      const i = PANELS.findIndex((p) => p.id === (e as CustomEvent<string>).detail);
      if (i < 0) return;
      goTo(i);
      rootRef.current?.scrollIntoView({ block: 'start' });
    };
    window.addEventListener('qe:showcase-tab', on);
    return () => window.removeEventListener('qe:showcase-tab', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onScroll = () => {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    const i = Math.round(track.scrollLeft / track.clientWidth);
    if (i !== active) setActive(i);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(Math.min(PANELS.length - 1, active + 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(Math.max(0, active - 1)); }
  };

  return (
    <div className="sc" ref={rootRef}>
      <div className="sc-tabs" role="tablist" aria-label="Product panels" onKeyDown={onKey}>
        {PANELS.map((p, i) => (
          <button key={p.id} type="button" role="tab" id={`sc-tab-${p.id}`} aria-controls={`sc-panel-${p.id}`}
            aria-selected={active === i} tabIndex={active === i ? 0 : -1}
            className={`sc-tab${active === i ? ' on' : ''}`} onClick={() => goTo(i)}>{p.label}</button>
        ))}
      </div>
      <figure className="lp-frame sc-frame">
        <div className="lp-frame-bar">
          <span className="lp-dots" aria-hidden="true"><i /><i /><i /></span>
          <span className="lp-url">{PANELS[active].url}</span>
          <span className="sc-status" aria-live="polite">
            {/* "Live" only while the poll is succeeding — a failed refresh never keeps the badge on (audit item 8);
                sample data is always named as such. */}
            {allSample
              ? (failed ? 'Sample data · live feed unavailable' : 'Sample data · loading live…')
              : failed ? 'Refresh failed · showing the last read'
                : <><span className="sc-live-dot" />{anySample ? 'Live · some panels sample' : 'Live data'}</>}
          </span>
        </div>
        <div className="sc-track" ref={trackRef} onScroll={onScroll}>
          {PANELS.map(({ id, title, C }, i) => (
            <section key={id} className="sc-panel" id={`sc-panel-${id}`} role="tabpanel" aria-labelledby={`sc-tab-${id}`}
              aria-hidden={active !== i} {...(active !== i ? { inert: '' as any } : {})}>
              <h3 className="sc-title">{title}</h3>
              <C d={view} now={now} quotes={quotes} sample={sample} sampleNote={sampleNote} />
            </section>
          ))}
        </div>
      </figure>
      <div className="sc-dots" aria-hidden="true">
        {PANELS.map((p, i) => <i key={p.id} className={active === i ? 'on' : ''} />)}
      </div>
      <p className="sc-disclaimer">Real data from the same feeds the terminal uses, with its source and age; anything marked Sample is illustrative and is replaced by the live read when it arrives. Quotes may be delayed outside market hours. Not investment advice.</p>
    </div>
  );
}
