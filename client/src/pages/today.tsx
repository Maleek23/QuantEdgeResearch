/**
 * TODAY — the prototype for the overhaul (2026-09-24).
 *
 * The operator: "too much and boring… not grade A". Twelve equal-weight tabs
 * and collapse chrome gave the platform no hero. This screen has exactly one
 * job per band, in reading order:
 *
 *   1. The week, in one sentence and one chart — the Skylit-style dealer map
 *      (measured GEX levels with gamma concentration + the model's projected
 *      path). The weekly-path model was built server-side and never shown
 *      anywhere; it is the platform's differentiator, so it leads.
 *   2. The single best idea right now, big.
 *   3. The rest of the book as clean ranked rows.
 *   4. The honest track record.
 *
 * Built from docs/DESIGN_SYSTEM.md: cinematic dark, Space Grotesk display,
 * Inter UI, JetBrains Mono numbers, luminous accents, motion only on real data.
 * Integrity: only MEASURED dealer levels are drawn; the path is labelled a
 * model projection with its confidence, never a forecast.
 */
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Search, TrendingUp, Radar as RadarIcon, LineChart } from 'lucide-react';
import qeMark from '@assets/qe-mark.svg';
import '@/styles/nexus.css';
import '@/styles/today.css';

// ── data shapes (subset) ────────────────────────────────────────────────────
interface WPLevel { price: number; label: string; type: string; side: string }
interface WPPoint { dayOffset: number; price: number; confidence: number }
interface WPPhase { label: string; description: string; startDay: number; endDay: number; type: string }
interface WeeklyPath { cached?: boolean; cachedAt?: string; symbol: string; spotPrice: number; weekStart: string; weekEnd: string; levels: WPLevel[]; path: WPPoint[]; phases: WPPhase[]; regime: string; confidence: number }
interface GexLevel { strike: number; gammaPct: number; role?: string }
interface GexTerminal { snapshot?: { spotPrice: number; callWall?: number; putWall?: number; maxGammaStrike?: number; gammaFlipPrice?: number; levels?: GexLevel[] } }
interface Layer { kind: string; why: string; points: number }
interface Pick {
  ideaId: string; symbol: string; direction: 'long' | 'short'; sector?: string; thesis?: string;
  entryPrice?: number; targetPrice?: number; stopLoss?: number; riskRewardRatio?: number; currentPrice?: number;
  convictionScore?: number | null; convictionBand?: string | null; layers?: Layer[]; optionType?: string; strikePrice?: number; expiryDate?: string;
  lifecycleState?: string; isBotHeld?: boolean;
}
interface Perf { overall?: { winRate?: number; winRateDecided?: number; expectancy?: number; profitFactor?: number; totalIdeas?: number } }
interface Quote { price?: number; lastPrice?: number; changePercent?: number }

const get = <T,>(url: string) => async (): Promise<T> => {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
};
const fmt = (n?: number | null, d = 2) => (n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));

// ── the week, in one sentence ──────────────────────────────────────────────
function weekSentence(wp?: WeeklyPath, magnet?: number) {
  if (!wp) return { title: 'Reading the dealer map…', sub: '' };
  const short = wp.regime?.includes('negative');
  const title = short
    ? `Dealers are short gamma. Moves get amplified${magnet ? ` — ${fmt(magnet, 0)} is the magnet.` : '.'}`
    : `Dealers are long gamma. Moves get dampened${magnet ? ` — price pins toward ${fmt(magnet, 0)}.` : '.'}`;
  const sub = short
    ? 'When dealers are short gamma they sell into drops and buy into rips, so ranges widen. Fade the walls, respect the breaks.'
    : 'When dealers are long gamma they buy dips and sell rips, so ranges tighten around the biggest strike.';
  return { title, sub };
}

// ── Skylit-style weekly dealer map ─────────────────────────────────────────
function WeekMap({ wp, gex }: { wp: WeeklyPath; gex?: GexTerminal }) {
  const reduce = useReducedMotion();
  const W = 760, H = 380, padL = 14, padR = 118, padT = 18, padB = 46;
  const snap = gex?.snapshot;
  // Only measured dealer levels — the model's extrapolated ones stay off the map.
  const measured = [
    snap?.callWall && { price: snap.callWall, label: 'Call wall', tone: 'bull' },
    snap?.maxGammaStrike && { price: snap.maxGammaStrike, label: 'Max gamma', tone: 'magnet' },
    snap?.putWall && { price: snap.putWall, label: 'Put wall', tone: 'bear' },
  ].filter(Boolean) as { price: number; label: string; tone: string }[];
  const pctAt = (k: number) => snap?.levels?.find((l) => Math.abs(l.strike - k) < 0.01)?.gammaPct;
  const prices = [...wp.path.map((p) => p.price), ...measured.map((m) => m.price), wp.spotPrice];
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const pad = (hi - lo) * 0.12 || 2;
  const y = (p: number) => padT + (1 - (p - (lo - pad)) / (hi - lo + 2 * pad)) * (H - padT - padB);
  const x = (d: number) => padL + (d / 5) * (W - padL - padR);
  const line = wp.path.map((p, i) => `${i ? 'L' : 'M'}${x(p.dayOffset).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ');
  // Confidence cone: widen as confidence falls.
  const band = (hi - lo + 2 * pad) * 0.18;
  const upper = wp.path.map((p) => `${x(p.dayOffset).toFixed(1)},${y(p.price + band * (1 - p.confidence)).toFixed(1)}`);
  const lower = [...wp.path].reverse().map((p) => `${x(p.dayOffset).toFixed(1)},${y(p.price - band * (1 - p.confidence)).toFixed(1)}`);
  const end = wp.path[wp.path.length - 1];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="td-map" role="img" aria-label={`${wp.symbol} weekly dealer map and projected path`}>
      <defs>
        <linearGradient id="td-path" x1="0" x2="1"><stop offset="0" stopColor="#7fb2ff" /><stop offset="1" stopColor="#3b8cff" /></linearGradient>
        <linearGradient id="td-cone" x1="0" x2="1"><stop offset="0" stopColor="#3b8cff" stopOpacity="0.02" /><stop offset="1" stopColor="#3b8cff" stopOpacity="0.16" /></linearGradient>
        <filter id="td-glow"><feGaussianBlur stdDeviation="3.2" /></filter>
      </defs>
      {/* day grid */}
      {days.map((d, i) => (
        <g key={d}>
          <line x1={x(i)} x2={x(i)} y1={padT} y2={H - padB} className="td-grid" />
          <text x={x(i + 0.5)} y={H - padB + 16} className="td-axis" textAnchor="middle">{d}</text>
        </g>
      ))}
      {/* phases */}
      {wp.phases.map((ph) => (
        <g key={ph.label}>
          <rect x={x(ph.startDay) + 2} y={H - 22} width={Math.max(0, x(ph.endDay) - x(ph.startDay) - 4)} height={16} rx={3} className={`td-phase ${ph.type}`} />
          <text x={x((ph.startDay + ph.endDay) / 2)} y={H - 11} className="td-phase-t" textAnchor="middle">{ph.label.replace('PHASE ', 'P').replace(' · ', ' · ')} — {ph.description}</text>
        </g>
      ))}
      {/* measured dealer levels */}
      {measured.map((m) => {
        const pct = pctAt(m.price);
        return (
          <g key={m.label} className={`td-lvl ${m.tone}`}>
            {m.tone === 'magnet' && <rect x={padL} y={y(m.price) - 7} width={W - padL - padR} height={14} className="td-magnet" />}
            <line x1={padL} x2={W - padR} y1={y(m.price)} y2={y(m.price)} />
            <text x={W - padR + 10} y={y(m.price) - 3} className="td-lvl-name">{m.label}</text>
            <text x={W - padR + 10} y={y(m.price) + 11} className="td-lvl-px">{fmt(m.price, 0)}{pct != null ? `  ·  ${(pct * 100).toFixed(0)}% γ` : ''}</text>
          </g>
        );
      })}
      {/* confidence cone + projected path */}
      <polygon points={[...upper, ...lower].join(' ')} fill="url(#td-cone)" />
      <path d={line} className="td-path-glow" filter="url(#td-glow)" />
      <motion.path d={line} className="td-path" stroke="url(#td-path)"
        initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: [0.2, 0.8, 0.2, 1] }} />
      {/* spot + end */}
      <circle cx={x(0)} cy={y(wp.spotPrice)} r={5} className="td-spot" />
      <text x={x(0) + 10} y={y(wp.spotPrice) - 10} className="td-spot-t">now {fmt(wp.spotPrice)}</text>
      {end && <text x={x(end.dayOffset) - 6} y={y(end.price) - 12} className="td-end-t" textAnchor="end">model {fmt(end.price, 0)}</text>}
    </svg>
  );
}

// ── level ladder: where price sits between stop and target ────────────────
function Ladder({ p, live }: { p: Pick; live?: number }) {
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
function explain(p: Pick): { headline: string; reasons: string[]; against?: string } {
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
    headline = `Options traders put $${m[2]}M ${bull ? 'behind' : 'against'} it yesterday` +
      (lead && Number(lead[2]) > 0 ? `, $${lead[2]}M of it in ${bull ? 'calls' : 'puts'} ${lead[1]}.` : '.');
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
const sectorName = (s?: string) => (!s || s === 'other' ? '' : s.replace(/_/g, ' '));

export default function TodayPage() {
  const [, setLocation] = useLocation();
  const [q, setQ] = useState('');
  const reduce = useReducedMotion();
  const wp = useQuery<WeeklyPath>({ queryKey: ['/api/weekly-path/SPY'], queryFn: get('/api/weekly-path/SPY'), staleTime: 300_000 });
  const gex = useQuery<GexTerminal>({ queryKey: ['/api/gex-vex/terminal/SPY', 'today'], queryFn: get('/api/gex-vex/terminal/SPY'), staleTime: 300_000 });
  const conv = useQuery<{ picks?: Pick[] }>({ queryKey: ['/api/convictions', 'today'], queryFn: get('/api/convictions'), staleTime: 60_000, refetchInterval: 90_000 });
  const perf = useQuery<Perf>({ queryKey: ['/api/performance/stats/', 'today'], queryFn: get('/api/performance/stats/'), staleTime: 600_000 });

  const ideas = useMemo(() => (conv.data?.picks ?? [])
    .filter((p) => typeof p.convictionScore === 'number' && !p.isBotHeld && p.lifecycleState !== 'executed')
    .sort((a, b) => (b.convictionScore ?? 0) - (a.convictionScore ?? 0)), [conv.data]);
  const syms = ideas.slice(0, 12).map((p) => p.symbol).concat('SPY').join(',');
  const quotes = useQuery<{ quotes: Record<string, Quote> }>({ queryKey: [`/api/quotes/batch/${syms}`], queryFn: get(`/api/quotes/batch/${syms}`), enabled: ideas.length > 0, refetchInterval: 60_000 });
  const px = (s: string) => { const qq = quotes.data?.quotes?.[s]; return qq?.price ?? qq?.lastPrice; };

  const magnet = gex.data?.snapshot?.maxGammaStrike;
  const head = wp.isError && !wp.data
    ? { title: 'The options feed is down, so no dealer map right now.', sub: 'We only draw the map from measured positioning. It comes back as soon as the feed does.' }
    : weekSentence(wp.data, magnet);
  const spy = quotes.data?.quotes?.SPY;
  const best = ideas[0];
  const rest = ideas.slice(1, 9);
  const o = perf.data?.overall;

  const go = (e: React.FormEvent) => { e.preventDefault(); const s = q.trim().toUpperCase(); if (s) setLocation(`/r/${s}`); };

  return (
    <div className="today nexus-vars">
      <div className="td-atmos" aria-hidden />
      <header className="td-top">
        <Link href="/today" className="td-brand"><img src={qeMark} alt="" width={26} height={26} /><span>Quant Edge</span></Link>
        <nav className="td-nav" aria-label="Primary">
          <Link href="/today" className="on">Today</Link>
          <Link href="/t?tab=gex">Markets</Link>
          <Link href="/t?tab=journal&jtab=metrics">Track record</Link>
        </nav>
        <form className="td-search" onSubmit={go} role="search">
          <Search size={15} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Any ticker" aria-label="Search a ticker" autoCapitalize="characters" />
        </form>
        <Link href="/t" className="td-classic" title="The full terminal">Terminal <ArrowUpRight size={13} /></Link>
      </header>

      <main className="td-main">
        {/* 1 · THE WEEK */}
        <section className="td-hero">
          <div className="td-hero-copy">
            <div className="td-eyebrow">SPY · week of {wp.data ? new Date(wp.data.weekStart + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</div>
            <h1>{head.title}</h1>
            <p className="td-lede">{head.sub}</p>
            <div className="td-spot-big">
              <span className="td-px">{fmt(spy?.price ?? spy?.lastPrice ?? wp.data?.spotPrice)}</span>
              {spy?.changePercent != null && (
                <span className={`td-chg ${spy.changePercent >= 0 ? 'up' : 'dn'}`}>{spy.changePercent >= 0 ? '▲' : '▼'} {Math.abs(spy.changePercent).toFixed(2)}%</span>
              )}
            </div>
            <div className="td-keys">
              {[['Magnet', magnet, 'max gamma'], ['Ceiling', gex.data?.snapshot?.callWall, 'call wall'], ['Floor', gex.data?.snapshot?.putWall, 'put wall']].map(([k, v, s]) => (
                <div key={String(k)}><span>{k as string}</span><b>{fmt(v as number, 0)}</b><small>{s as string}</small></div>
              ))}
            </div>
          </div>
          <div className="td-map-card">
            {wp.data && !gex.isLoading ? <WeekMap wp={wp.data} gex={gex.data} /> : <div className="td-map-empty">{wp.isError ? 'Dealer map unavailable right now.' : 'Reading dealer positioning…'}</div>}
            <div className="td-map-foot">
              Model projection from dealer positioning{wp.data ? ` · ${(wp.data.confidence * 100).toFixed(0)}% confidence` : ''}{wp.data?.cachedAt ? ` · from ${Math.max(1, Math.round((Date.now() - Date.parse(wp.data.cachedAt)) / 60000))} min ago` : ''} · not a forecast · only measured levels shown
            </div>
          </div>
        </section>

        {/* 2 · THE BEST IDEA */}
        {best && (
          <section className="td-best" aria-label="Best idea right now">
            <div className="td-section-t"><TrendingUp size={15} /> Best idea right now</div>
            <motion.div className="td-best-card" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <div className="td-best-id">
                <div className="td-sym">{best.symbol}</div>
                <div className={`td-dir ${best.direction}`}>{best.direction === 'long' ? 'Long' : 'Short'}{best.optionType ? ` · ${best.optionType.toUpperCase()} ${best.strikePrice ?? ''}` : ''}</div>
                <div className="td-sector">{sectorName(best.sector)}</div>
              </div>
              <div className="td-best-body">
                {(() => { const x = explain(best); return (<>
                  <p className="td-why">{x.headline}</p>
                  {x.reasons.length > 0 && <ul className="td-reasons">{x.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                  {x.against && <p className="td-against"><b>Against it:</b> {x.against}</p>}
                </>); })()}
                <Ladder p={best} live={px(best.symbol)} />
              </div>
              <div className="td-best-stats">
                <div><span>Evidence</span><b>{best.convictionScore}</b><small>/100</small></div>
                <div><span>Reward : risk</span><b>{best.riskRewardRatio ? best.riskRewardRatio.toFixed(1) : '—'}</b><small>: 1</small></div>
                <Link href={`/r/${best.symbol}`} className="td-cta">Full analysis <ArrowUpRight size={15} /></Link>
              </div>
            </motion.div>
          </section>
        )}

        {/* 3 · THE BOOK */}
        <section className="td-book" aria-label="Ranked ideas">
          <div className="td-section-t"><RadarIcon size={15} /> Next best · {ideas.length} live ideas</div>
          <ol className="td-rows">
            {rest.map((p, i) => (
              <motion.li key={p.ideaId} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i, duration: 0.3 }}>
                <Link href={`/r/${p.symbol}`} className="td-row">
                  <span className="td-rank">{i + 2}</span>
                  <span className="td-row-sym">{p.symbol}{sectorName(p.sector) && <small>{sectorName(p.sector)}</small>}</span>
                  <span className={`td-dir sm ${p.direction}`}>{p.direction === 'long' ? 'Long' : 'Short'}</span>
                  <span className="td-row-why">{explain(p).headline}</span>
                  <span className="td-row-ev" title="Evidence score out of 100"><span className="td-ev-track"><i style={{ width: `${Math.min(100, p.convictionScore ?? 0)}%` }} /></span><b>{p.convictionScore}</b></span>
                  <span className="td-row-rr">{p.riskRewardRatio ? `${p.riskRewardRatio.toFixed(1)}R` : '—'}</span>
                </Link>
              </motion.li>
            ))}
            {!rest.length && <li className="td-empty">{conv.isLoading ? 'Loading the book…' : 'No other live ideas right now.'}</li>}
          </ol>
          <Link href="/t" className="td-more">Open the full board <ArrowUpRight size={14} /></Link>
        </section>

        {/* 4 · THE RECORD */}
        <section className="td-record" aria-label="Track record">
          <div className="td-section-t"><LineChart size={15} /> Track record — measured, not marketed</div>
          <div className="td-record-grid">
            <div><b>{o?.winRateDecided ?? '—'}</b><span>ideas decided</span></div>
            <div><b>{o?.winRate != null ? `${o.winRate}%` : '—'}</b><span>hit their target</span></div>
            <div><b>{o?.expectancy != null ? `${o.expectancy >= 0 ? '+' : ''}${o.expectancy.toFixed(2)}%` : '—'}</b><span>average per idea</span></div>
            <div><b>{o?.profitFactor != null ? o.profitFactor.toFixed(2) : '—'}</b><span>profit factor</span></div>
          </div>
          <p className="td-record-note">Every idea is published with its levels and scored against real prices — losses included. The volatility stop floor validated on Sep 24 is live for new ideas; its effect shows here as they resolve.</p>
          <Link href="/t?tab=journal&jtab=metrics" className="td-more">See every outcome <ArrowUpRight size={14} /></Link>
        </section>
      </main>
      <footer className="td-foot">Quant Edge Labs · educational research, not investment advice</footer>
    </div>
  );
}
