/**
 * TODAY — shared data + drawing pieces, moved out of pages/today.tsx when the
 * page became a dashboard (2026-09-29). Every TODAY tool reads these hooks, so
 * the week map, best idea and ranked book on one screen share one request per
 * endpoint (same query keys the old page used).
 *
 * Integrity (unchanged from the page): only MEASURED dealer levels are drawn;
 * the weekly path is a MODEL projection labelled "not a forecast"; nothing
 * publish-time is shown as current (live quotes carry their own timestamp).
 */
import { pickWalls } from '@shared/gex-wall-basis';
import { CONVICTIONS_QUERY_KEY, isLiveBookPick, type ConvictionPick } from '@/lib/convictions';
import { boardOrder, useSetupLifecycles } from '@/lib/setup-lifecycle';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { fetchJson, useDaily, type CryptoPulse, type RotationPayload } from '@/components/landing/live-widgets';
import { terminalAsOf, useGexTerminal } from '@/components/gex/gex-model';

// ── data shapes (subset) ────────────────────────────────────────────────────
export interface WPLevel { price: number; label: string; type: string; side: string }
export interface WPPoint { dayOffset: number; price: number; lo?: number; hi?: number; confidence: number }
export interface WPPhase { label: string; description: string; startDay: number; endDay: number; type: string }
export interface WeeklyPath { cached?: boolean; cachedAt?: string; symbol: string; spotPrice: number; weekStart: string; weekEnd: string; levels: WPLevel[]; path: WPPoint[]; phases: WPPhase[]; regime: string; confidence: number; expectedMove?: number; annualVol?: number; volSource?: string; impliedVol?: number }
export interface GexLevel { strike: number; gammaPct: number; role?: string; gex?: number }
export interface GexSnap { spotPrice: number; callWall?: number; putWall?: number; maxGammaStrike?: number; gammaFlipPrice?: number; zeroGammaLevel?: number | null; regime?: string; regimeRead?: { regime?: 'positive' | 'negative' | 'neutral'; nearFlip?: boolean }; totalGEX?: number; levels?: GexLevel[]; byDte?: unknown;
  /** Which book callWall/putWall/gammaFlipPrice are from (shared/gex-wall-basis.ts) — printed with them. */
  wallBasis?: import('@shared/gex-wall-basis').PickedWalls }
export interface Layer { kind: string; why: string; points: number }
export interface Pick {
  ideaId: string; symbol: string; direction: 'long' | 'short'; sector?: string; thesis?: string;
  entryPrice?: number; targetPrice?: number; stopLoss?: number; riskRewardRatio?: number; currentPrice?: number;
  convictionScore?: number | null; convictionBand?: string | null; layers?: Layer[]; optionType?: string; strikePrice?: number; expiryDate?: string;
  lifecycleState?: string; isBotHeld?: boolean; generatedAt?: string;
}
/** /api/performance/model-record — shared/model-record.ts (outcome v2, since OUTCOME_BASELINE_DATE). */
export interface Perf { since?: string; asOf?: string; winRate?: number | null; wins?: number; losses?: number; decided?: number; unresolved?: number; total?: number; expectancyR?: number | null; rSampleSize?: number; coveragePct?: number; sampleFloor?: number; runUp?: RunUpRead | null }
/** model-record.runUp — shared/run-up.ts. Run-up after trigger, NOT the win rate. */
export interface RunUpRead { label: string; since: string; triggered: number; reached3: number; reached5BeforeStop: number; reached10: number; rate: number | null; pending: number; medianMinutesTo5: number | null }
export interface Quote {
  price?: number; lastPrice?: number; changePercent?: number; asOf?: string; session?: 'pre' | 'regular' | 'post' | 'overnight' | 'closed' | null; source?: string | null;
  /** Freshness (docs/DATA_LATENCY.md) — rendered by <QuoteFreshChip>. */
  delayed?: boolean; delayedSec?: number; proxy?: boolean; stale?: boolean;
}
export interface IndexScalp {
  id: string; symbol: string; direction: 'long' | 'short'; bias: string;
  setup?: string; strike?: number | null; expiry?: string | null;
  spot?: number | null; target?: number | null; stop?: number | null;
  riskRewardRatio?: number | null; confidence?: number | null;
  thesis?: string | null; regime?: string | null; isPowerHour?: boolean; timestamp?: string;
}
export type Pulse = CryptoPulse & { asOf?: string };

const get = <T,>(url: string) => async (): Promise<T> => {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
};
export const fmt = (n?: number | null, d = 2) => (n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
/** newest of several ISO stamps (null when none parse) */
export const newest = (...isos: (string | null | undefined)[]) => {
  const ts = isos.map((s) => (s ? Date.parse(s) : NaN)).filter(Number.isFinite);
  return ts.length ? new Date(Math.max(...ts)).toISOString() : null;
};
const iso = (ms: number) => (ms ? new Date(ms).toISOString() : null);

// ── shared queries (keys identical to the pre-dashboard page) ─────────────
const retryWhileDown = { refetchInterval: (qq: { state: { status: string } }) => (qq.state.status === 'error' ? 30_000 : false) };

export const useWeeklyPath = () =>
  useQuery<WeeklyPath>({ queryKey: ['/api/weekly-path/SPY'], queryFn: get('/api/weekly-path/SPY'), staleTime: 300_000, ...retryWhileDown });

/** SPY dealer snapshot — the GEX tools' own query, so it dedupes with them. */
export function useSpyGex() {
  const q = useGexTerminal('SPY');
  const raw = q.data?.snapshot as unknown as GexSnap | undefined;
  // Walls on the platform's one basis (≤7d book, else labelled all-expiry) — the
  // same numbers the ticker page and the NEXUS wall-touch badge show (audit #11).
  const snap = useMemo<GexSnap | undefined>(() => {
    if (!raw) return raw;
    const w = pickWalls({ callWall: raw.callWall, putWall: raw.putWall, flip: raw.gammaFlipPrice ?? raw.zeroGammaLevel, byDte: raw.byDte });
    return { ...raw, callWall: w.callWall ?? undefined, putWall: w.putWall ?? undefined, gammaFlipPrice: w.flip ?? undefined, wallBasis: w };
  }, [raw]);
  return { q, snap, asOf: terminalAsOf(q.data) };
}

/** Wall clock that ticks every 30s — enough for lifecycle windows that end at a session close. */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  return now;
}

/** "board order" wording for the BOARD_SORT the server reports. */
export const BOARD_ORDER_LABEL: Record<'score' | 'recency' | 'engine_record' | 'grade', string> = {
  score: 'NEXUS board order · by evidence',
  recency: 'NEXUS board order · newest first',
  engine_record: 'NEXUS board order · by engine record',
  grade: 'NEXUS board order · by NEXUS grade (unvalidated)',
};

export function useBook() {
  // Same query key + cadence as NEXUS (one fetch, one snapshot) and the same
  // membership rule (isLiveBookPick) so "N live" and the scores match NEXUS exactly.
  const conv = useQuery<{ picks?: Pick[]; generatedAt?: string; boardSort?: 'score' | 'recency' | 'engine_record' | 'grade' }>({ queryKey: [...CONVICTIONS_QUERY_KEY], queryFn: get('/api/convictions'), staleTime: 30_000, refetchInterval: 60_000 });
  // ORDER = the NEXUS board's order (lib/setup-lifecycle.ts boardOrder): the server's
  // BOARD_SORT rank when it stamped one, else evidence score; stale + resolved setups
  // sink. This used to sort by evidence score alone while NEXUS used BOARD_SORT=recency,
  // so a two-day-old idea could top Today's book and sit near the bottom of NEXUS.
  const now = useMinuteClock();
  const book = conv.data?.picks as unknown as ConvictionPick[] | undefined;
  const { map: life } = useSetupLifecycles(book, conv.data?.generatedAt, now);
  const ideas = useMemo(() => boardOrder((book ?? []).filter((p) => isLiveBookPick(p)), life, now) as unknown as Pick[], [book, life, now]);
  const boardSort = conv.data?.boardSort ?? 'score';
  const syms = ideas.slice(0, 12).map((p) => p.symbol).concat('SPY').join(',');
  const quotes = useQuery<{ quotes: Record<string, Quote> }>({
    queryKey: [`/api/quotes/batch/${syms}`], queryFn: get(`/api/quotes/batch/${syms}`),
    enabled: !conv.isLoading, refetchInterval: 60_000,
  });
  const quote = (s: string) => quotes.data?.quotes?.[s];
  const px = (s: string) => { const qq = quote(s); return qq?.price ?? qq?.lastPrice; };
  const longs = ideas.filter((p) => p.direction !== 'short').length;
  const asOf = conv.data ? (conv.data.generatedAt ?? newest(...ideas.map((p) => p.generatedAt)) ?? iso(conv.dataUpdatedAt)) : undefined;
  return { conv, ideas, quotes, quote, px, longs, asOf, life, boardSort };
}

export const usePerf = () =>
  useQuery<Perf>({ queryKey: ['/api/performance/model-record', 'today'], queryFn: get('/api/performance/model-record'), staleTime: 600_000 });

export const useRotation = () =>
  useQuery<RotationPayload>({ queryKey: ['/api/sector-rotation', 'landing'], queryFn: fetchJson('/api/sector-rotation'), refetchInterval: 300_000, staleTime: 120_000, retry: 1 });

export const usePulse = () =>
  useQuery<Pulse>({ queryKey: ['/api/crypto/pulse', 'landing'], queryFn: fetchJson('/api/crypto/pulse'), staleTime: 300_000, retry: 1 });

export const useIndexDesk = () =>
  useQuery<{ session?: { name?: string; isOpen?: boolean }; scalps?: IndexScalp[] }>({
    queryKey: ['/api/index-scalps', 'today'], queryFn: get('/api/index-scalps'), staleTime: 30_000, refetchInterval: 60_000, retry: 1,
  });

export const useSpyIntraday = () => useDaily('SPY', '1d', '5m');

/** width of an element (tiles resize, so the map's label density follows the tile, not the viewport) */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// ── Skylit-style weekly dealer map ─────────────────────────────────────────
export function WeekMap({ wp, snap, narrow }: { wp: WeeklyPath; snap?: GexSnap; narrow?: boolean }) {
  const reduce = useReducedMotion();
  // Narrow tiles draw in a smaller coordinate space so labels stay readable
  // instead of shrinking with the viewBox.
  const W = narrow ? 380 : 760, H = narrow ? 320 : 380, padL = 8, padR = narrow ? 92 : 118, padT = 18, padB = 46;
  // Only measured dealer levels — the model's extrapolated ones stay off the map.
  // Narrow: the wall basis ("all exp") is in the keys above the map; in the 92px label
  // gutter it was clipped (device pass 2026-10-06).
  const measured = [
    snap?.callWall && { price: snap.callWall, label: `Call wall${snap.wallBasis && !narrow ? ` ${snap.wallBasis.basisShort}` : ''}`, tone: 'bull' },
    snap?.maxGammaStrike && { price: snap.maxGammaStrike, label: 'King node', tone: 'magnet' },
    snap?.putWall && { price: snap.putWall, label: `Put wall${snap.wallBasis && !narrow ? ` ${snap.wallBasis.basisShort}` : ''}`, tone: 'bear' },
  ].filter(Boolean) as { price: number; label: string; tone: string }[];
  const pctAt = (k: number) => snap?.levels?.find((l) => Math.abs(l.strike - k) < 0.01)?.gammaPct;
  // Scale to the week SPY can realistically travel (±2σ of the implied move),
  // not to walls 5% away — those get an edge marker instead of flattening the path.
  const sig = wp.expectedMove ?? wp.spotPrice * 0.02;
  const lo = wp.spotPrice - 2.2 * sig, hi = wp.spotPrice + 2.2 * sig;
  const y = (p: number) => padT + (1 - (p - lo) / (hi - lo)) * (H - padT - padB);
  const clampY = (p: number) => Math.max(padT, Math.min(H - padB, y(p)));
  const x = (d: number) => padL + (d / 5) * (W - padL - padR);
  const line = wp.path.map((p, i) => `${i ? 'L' : 'M'}${x(p.dayOffset).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  const upper = wp.path.map((p) => `${x(p.dayOffset).toFixed(1)},${y(p.hi ?? p.price).toFixed(1)}`);
  const lower = [...wp.path].reverse().map((p) => `${x(p.dayOffset).toFixed(1)},${y(p.lo ?? p.price).toFixed(1)}`);
  const end = wp.path[wp.path.length - 1];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`td-map${narrow ? ' narrow' : ''}`} role="img" aria-label={`${wp.symbol} weekly dealer map and model-projected path (not a forecast)`}>
      <defs>
        <linearGradient id="td-path" x1="0" x2="1"><stop offset="0" stopColor="#7fb2ff" /><stop offset="1" stopColor="#3b8cff" /></linearGradient>
        <linearGradient id="td-cone" x1="0" x2="1"><stop offset="0" stopColor="#3b8cff" stopOpacity="0.02" /><stop offset="1" stopColor="#3b8cff" stopOpacity="0.16" /></linearGradient>
        <filter id="td-glow"><feGaussianBlur stdDeviation="3.2" /></filter>
      </defs>
      {days.map((d, i) => (
        <g key={d}>
          <line x1={x(i)} x2={x(i)} y1={padT} y2={H - padB} className="td-grid" />
          <text x={x(i + 0.5)} y={H - padB + 16} className="td-axis" textAnchor="middle">{d}</text>
        </g>
      ))}
      {wp.phases.map((ph) => (
        <g key={ph.label}>
          <rect x={x(ph.startDay) + 2} y={H - 22} width={Math.max(0, x(ph.endDay) - x(ph.startDay) - 4)} height={16} rx={3} className={`td-phase ${ph.type}`} />
          <text x={x((ph.startDay + ph.endDay) / 2)} y={H - 11} className="td-phase-t" textAnchor="middle">{narrow ? ph.label.replace('PHASE ', 'P').split(' ')[0] : `${ph.label.replace('PHASE ', 'P')} — ${ph.description}`}</text>
        </g>
      ))}
      {measured.map((m) => {
        const pct = pctAt(m.price);
        const off = m.price > hi ? 'up' : m.price < lo ? 'dn' : null;
        return (
          <g key={m.label} className={`td-lvl ${m.tone}`}>
            {!off && m.tone === 'magnet' && <rect x={padL} y={y(m.price) - 7} width={W - padL - padR} height={14} className="td-magnet" />}
            {!off && <line x1={padL} x2={W - padR} y1={y(m.price)} y2={y(m.price)} />}
            <text x={W - padR + 10} y={clampY(m.price) + (off === 'up' ? 10 : off === 'dn' ? -14 : -3)} className="td-lvl-name">{off === 'up' ? '↑ ' : off === 'dn' ? '↓ ' : ''}{m.label}</text>
            <text x={W - padR + 10} y={clampY(m.price) + (off === 'up' ? 24 : off === 'dn' ? 0 : 11)} className="td-lvl-px">{fmt(m.price, 0)}{pct != null ? `${narrow ? ' ' : '  ·  '}${(pct * 100).toFixed(0)}% γ` : ''}</text>
          </g>
        );
      })}
      <polygon points={[...upper, ...lower].join(' ')} fill="url(#td-cone)" />
      <path d={line} className="td-path-glow" filter="url(#td-glow)" />
      <motion.path d={line} className="td-path" stroke="url(#td-path)"
        initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: [0.2, 0.8, 0.2, 1] }} />
      <circle cx={x(0)} cy={y(wp.spotPrice)} r={5} className="td-spot" />
      <text x={x(0) + 10} y={y(wp.spotPrice) - 10} className="td-spot-t">model start {fmt(wp.spotPrice)}</text>
      {end?.hi != null && <text x={x(end.dayOffset) - 6} y={y(end.hi) - 6} className="td-band-t" textAnchor="end">+1σ {fmt(end.hi, 0)}</text>}
      {end?.lo != null && <text x={x(end.dayOffset) - 6} y={y(end.lo) + 14} className="td-band-t" textAnchor="end">−1σ {fmt(end.lo, 0)}</text>}
    </svg>
  );
}

// ── level ladder: where price sits between stop and target ────────────────
export function Ladder({ p, live }: { p: Pick; live?: number }) {
  const s = p.stopLoss ?? 0, e = p.entryPrice ?? 0, t = p.targetPrice ?? 0;
  const lo = Math.min(s, t), hi = Math.max(s, t);
  const at = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo || 1)) * 100))}%`;
  const long = p.direction === 'long';
  return (
    <div className="td-ladder">
      <div className="td-ladder-track">
        <div className="td-ladder-risk" style={{ left: long ? at(s) : at(e), width: `calc(${at(long ? e : s)} - ${at(long ? s : e)})` }} />
        <div className="td-ladder-reward" style={{ left: long ? at(e) : at(t), width: `calc(${at(long ? t : e)} - ${at(long ? e : t)})` }} />
        {live != null && <div className="td-ladder-now" style={{ left: at(live) }} title={`now ${fmt(live)}`} />}
      </div>
      <div className="td-ladder-labels">
        {long ? <span className="bear">Stop <b>{fmt(s)}</b></span> : <span className="bull">Target <b>{fmt(t)}</b></span>}
        <span>Entry <b>{fmt(e)}</b></span>
        {long ? <span className="bull">Target <b>{fmt(t)}</b></span> : <span className="bear">Stop <b>{fmt(s)}</b></span>}
      </div>
    </div>
  );
}

/**
 * Evidence, in plain English. The layers carry precise measurements in
 * machine phrasing ("Aggressor tape: +$18.5M net bullish … calls bought
 * +$14.0M"); a person needs one sentence and a few reasons.
 */
export function explain(p: Pick): { headline: string; reasons: string[]; against?: string } {
  const L = p.layers ?? [];
  const txt = (l?: Layer) => (l?.why ?? '').replace(/^[^\w$+-]+/u, '').trim();
  const all = L.map(txt);
  const PATTERN = /Higher-Lows Base|V-Recovery|Bull flag|Bear flag|Breakout|Breakdown|Pullback|Reclaim/i;
  const flow = all.find((w) => /net premium|Aggressor tape/i.test(w));
  const pattern = all.find((w) => PATTERN.test(w) && / off the /i.test(w)) ?? all.find((w) => PATTERN.test(w));
  let headline = '';
  const m = flow?.match(/([+-])\$([\d.]+)M net (?:premium )?(bullish|bearish)/i);
  if (m && flow) {
    const bull = m[3].toLowerCase() === 'bullish';
    const lead = flow.match(bull ? /calls (bought|sold) \+\$([\d.]+)M/i : /puts (bought|sold) \+\$([\d.]+)M/i);
    // $X is NET premium; the lead leg is GROSS and can exceed it (offset by the other side),
    // so never phrase the leg as "of it". The day comes from the flow line, not "yesterday".
    const d = flow.match(/on (\d{4}-\d{2}-\d{2})/)?.[1];
    const todayEt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    const when = !d ? 'in the last session' : d === todayEt ? 'today' : `on ${new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
    headline = `Options flow ${when}: $${m[2]}M net ${bull ? 'bullish' : 'bearish'}` +
      (lead && Number(lead[2]) > 0 ? ` — $${lead[2]}M in ${bull ? 'calls' : 'puts'} ${lead[1]} at the ${lead[1] === 'bought' ? 'ask' : 'bid'}.` : '.');
  } else if (pattern) {
    const lvl = pattern.match(/\$([\d.,]+) bottom/)?.[1] ?? pattern.match(/bottomed \$([\d.,]+)/)?.[1];
    if (/Higher-Lows/i.test(pattern)) headline = `Building higher lows off the $${lvl} bottom.`;
    else if (/V-Recovery/i.test(pattern)) headline = `Sharp V-shaped recovery off the $${lvl} bottom.`;
    else headline = pattern.split(/[:;(]/)[0].trim() + '.';
  } else headline = (p.thesis ?? '').split('.')[0] + '.';

  const sectorLine = (w: string) => {
    const s = w.replace(/[🩸]/gu, '').trim().match(/^([A-Za-z &]+?) ([+-][\d.]+)% \(([+-][\d.]+)% vs SPY\)/);
    if (!s) return '';
    const down = s[2].startsWith('-');
    return `${s[1]} ${down ? 'down' : 'up'} ${s[2].slice(1)}% today`;
  };
  const reasons: string[] = [];
  for (const l of [...L].sort((a, b) => b.points - a.points)) {
    if (l.points <= 0 || reasons.length >= 3) continue;
    const w = txt(l);
    if (/net premium|Aggressor tape|context only|Regime ranging/i.test(w) || PATTERN.test(w)) continue;
    let r = '';
    const run = w.match(/clean runway to .+? at \$([\d.,]+) \(([\d.]+)R, (\d+)% reach odds\)/i);
    if (run) r = `Open road to $${run[1]} · ${run[3]}% reach odds`;
    else if (/^TA confirms/i.test(w)) r = 'Trend on the chart agrees';
    else if (/Coiled/i.test(w)) r = 'Coiled tight, pressing the ceiling';
    else if (/Dealers support/i.test(w)) r = 'Dealer hedging leans its way';
    else if (/benchmark complex/i.test(w)) r = 'Deep, liquid options market';
    else if (/Earnings beat/i.test(w)) r = 'Beat on earnings';
    else if (/Earnings miss/i.test(w)) r = 'Missed on earnings';
    else if (/vs SPY/i.test(w)) r = sectorLine(w) + (/confirms/i.test(w) ? ', confirming it' : '');
    else r = w.split(/[—(;]/)[0].trim();
    if (r && !reasons.includes(r)) reasons.push(r);
  }
  const neg = L.filter((l) => l.points < 0).sort((a, b) => a.points - b.points)[0];
  let against: string | undefined;
  if (neg) {
    const w = txt(neg);
    const cap = w.match(/at \$([\d.,]+) caps the move at ([\d.]+)R/i);
    if (cap) against = `Resistance at $${cap[1]} caps the move at ${cap[2]}× the risk.`;
    else if (/vs SPY/i.test(w)) against = `${sectorLine(w)}, money rotating out of the sector.`;
    else against = w.replace(/[🩸]/gu, '').split('—')[0].trim() + '.';
  }
  return { headline, reasons, against };
}
