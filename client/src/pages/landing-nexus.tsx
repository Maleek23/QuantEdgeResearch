/**
 * LANDING — the tenth reference mock, wired to the live platform.
 *
 * A marketing page that shows the actual product instead of a fabricated
 * one. Everything in the hero terminal, tape, stats, signal cards and
 * rotation map is the same live data the terminal itself renders:
 *
 *   hero pulse    SPY's real intraday series — INTERACTIVE (hover crosshair
 *                 + value tip), not the mock's Math.random ramp
 *   signal cards  the board's top two live picks with their REAL levels;
 *                 the mock's hardcoded TSLA bear card is gone — the short
 *                 gate killed that class of signal and the landing page
 *                 does not advertise trades the platform will not take
 *   rotation map  every sector at its real rsRatio × rsMomentum coordinate
 *   flow rows     the strongest real in/outflows from the same feed
 *   stats         real counts (no "42ms latency" theater)
 *   FAQ           honest answers: delayed options data is disclosed, the
 *                 bot is a paper measurement ledger, no broker custody
 *
 * The mock's price jitter, fake stats and lorem-tier claims do not ship.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  Bitcoin as BitcoinIcon, BookOpen as BookOpenIcon, Bot as BotIcon, BrainCircuit as BrainIcon, CalendarClock as CalendarClockIcon,
  ChartCandlestick as ChartCandlestickIcon, Crosshair as CrosshairIcon, Hourglass as HourglassIcon, Magnet as MagnetIcon,
  Sunrise as SunriseIcon, Timer as TimerIcon, Waves as WavesIcon, type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { convictionDisplayPercent } from '@shared/conviction-display';
import { CONVICTION_LAYER_COUNT } from '@shared/conviction-layers';
import {
  Spark, RotQuad, SigCard, CHECK, fetchJson, useDaily,
  type RotationPayload, type ConvictionsPayload, type CryptoPulse,
} from '@/components/landing/live-widgets';
import '@/styles/nexus.css';

export default function LandingNexus() {
  const { data: rotation, isLoading: rotationLoading } = useQuery<RotationPayload>({ queryKey: ['/api/sector-rotation', 'landing'], queryFn: fetchJson('/api/sector-rotation'), refetchInterval: 300_000, staleTime: 120_000, retry: 1 });
  const { data: conv, isLoading: convLoading } = useQuery<ConvictionsPayload>({ queryKey: ['/api/convictions', 'landing'], queryFn: fetchJson('/api/convictions?limit=40&minScore=10'), refetchInterval: 300_000, staleTime: 120_000, retry: 1 });
  const { data: pulse } = useQuery<CryptoPulse>({ queryKey: ['/api/crypto/pulse', 'landing'], queryFn: fetchJson('/api/crypto/pulse'), staleTime: 300_000, retry: 1 });
  const { data: patterns, isLoading: patternsLoading } = useQuery<{ hits?: unknown[]; scanned?: number; scanning?: boolean }>({ queryKey: ['/api/patterns/scan', 'landing'], queryFn: fetchJson('/api/patterns/scan'), staleTime: 600_000, retry: 1 });
  const { data: ideasMeta, isLoading: ideasLoading } = useQuery<{ total?: number; last24h?: number }>({ queryKey: ['/api/trade-ideas/debug/raw', 'landing'], queryFn: fetchJson('/api/trade-ideas/debug/raw'), staleTime: 600_000, retry: 1 });
  const spyIntra = useDaily('SPY', '1d', '5m');
  const spyDaily = useDaily('SPY', '5d', '1d');
  const [tapePaused, setTapePaused] = useState(false);

  const spyBars = spyIntra.data?.data ?? [];
  const spyLast = spyBars[spyBars.length - 1]?.close ?? null;
  const spyPrev = (spyDaily.data?.data ?? []).slice(-2)[0]?.close ?? null;
  const spyChg = spyLast && spyPrev ? ((spyLast - spyPrev) / spyPrev) * 100 : null;

  const picks = conv?.picks ?? [];
  // Only scored ideas carry an evidence score (bot-held positions don't) —
  // an unscored pick must never read as "0/100".
  const scored = picks.filter((p) => typeof p.convictionScore === 'number');
  const top2 = [...scored].sort((a, b) => (b.convictionScore ?? 0) - (a.convictionScore ?? 0)).slice(0, 2);
  const longs = picks.filter((p) => (p.direction ?? 'long') !== 'short').length;
  const shorts = picks.length - longs;
  // Raw confluence points are NOT percentages — the shared display transform
  // maps them onto the 0-100 confidence index every product surface uses.
  // "17/100" was raw points wearing a percent sign; that class of units lie
  // is exactly what this platform exists to kill.
  const topScore: number | string = top2[0] ? convictionDisplayPercent(top2[0].convictionScore as number) : '—';
  const avgScore: number | string = scored.length ? Math.round(scored.reduce((a, p) => a + convictionDisplayPercent(p.convictionScore as number), 0) / scored.length) : '—';

  const sectors = rotation?.sectors ?? [];
  const flows = useMemo(() => {
    const sorted = [...sectors].filter((s) => Number.isFinite(s.relChange)).sort((a, b) => (b.relChange ?? 0) - (a.relChange ?? 0));
    const maxAbs = Math.max(0.1, ...sorted.map((s) => Math.abs(s.relChange ?? 0)));
    return { top: sorted.slice(0, 2), bottom: sorted.slice(-2).reverse(), maxAbs };
  }, [sectors]);

  const tape = useMemo(() => {
    const rows: { sym: string; price: string; chg: number }[] = [];
    sectors.forEach((s) => rows.push({ sym: s.etf, price: '', chg: s.change }));
    (pulse?.assets ?? []).forEach((a) => rows.push({ sym: a.symbol, price: `$${Math.round(a.price).toLocaleString()}`, chg: a.change24h ?? 0 }));
    return rows;
  }, [sectors, pulse]);

  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
    }, { threshold: 0.1 });
    document.querySelectorAll('.landing .reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const fresh = !rotation?.isStale;
  // Overnight / weekends the map correctly shows the last close — that is the
  // market being shut, not the data failing. Say which one it is.
  const closed = !fresh && /close/i.test(rotation?.sessionLabel ?? '');

  // Product names and one-liners: docs/POSITIONING.md. Tags say what a module
  // is, never "Live" — freshness is on every tile inside the product.
  const MODULES: { name: string; desc: string; tag: string; color: string; href: string; Icon: LucideIcon }[] = [
    { name: 'Today', desc: 'The morning page: the week\'s dealer map, the best idea, the ranked book, the index desk and the model\'s record.', tag: 'Start here', color: '#60a5fa', href: '/today', Icon: SunriseIcon },
    { name: 'NEXUS', desc: 'The trading desk. Every setup ranked by its evidence, with entry, stop and target printed and an audit trail behind it.', tag: 'Trading desk', color: '#3b8cff', href: '/t', Icon: CrosshairIcon },
    { name: 'Quantinum', desc: `QuantEdge's intelligence: it weighs every engine's evidence for a ticker across ${CONVICTION_LAYER_COUNT} layers and shows each layer's argument for or against.`, tag: 'The read', color: '#93c5fd', href: '/r/SPY', Icon: BrainIcon },
    { name: 'GEX', desc: 'Dealer positioning by strike and expiry — call and put walls, zero-γ, VEX, regime and the squeeze radar.', tag: 'Dealer positioning', color: '#f472b6', href: '/t?tab=gex', Icon: MagnetIcon },
    { name: 'Flow', desc: 'Options flow — sweeps, blocks, top tickers, market tide, flow by strike and expiry, and dark-pool levels.', tag: 'Options · dark pool', color: '#6ee7b7', href: '/t?tab=flow', Icon: WavesIcon },
    { name: '0DTE desk', desc: 'Same-day index context on NEXUS: levels, the single-expiry dealer map and flow for the session, with the data\'s age on screen.', tag: 'Index · same day', color: '#fbbf24', href: '/t?nx=0dte', Icon: TimerIcon },
    { name: 'Chart', desc: 'Multi-timeframe price action with walls, zero-γ and published levels drawn on the real bars. One ticker page per symbol.', tag: 'Price · levels', color: '#60a5fa', href: '/t?tab=chart', Icon: ChartCandlestickIcon },
    { name: 'Quantinum Bot', desc: 'The paper-trading bot. It trades NEXUS\'s published ideas with real contract marks and keeps a public record of every fill.', tag: 'Paper · public record', color: '#3b8cff', href: '/t?tab=bot', Icon: BotIcon },
    { name: 'Journal', desc: 'Your trades: broker and Discord import, calendar, insights, loss analysis and playbooks — plus trader journals, measured the same way.', tag: 'Your record', color: '#2dd4bf', href: '/t?tab=journal', Icon: BookOpenIcon },
    { name: 'LEAPS', desc: 'Long-dated calls graded on trend, value and momentum, with budget and grade filters over real premiums.', tag: 'Options · long-dated', color: '#a78bfa', href: '/t?tab=leaps', Icon: HourglassIcon },
    { name: 'Crypto', desc: 'BTC and ETH reads with measured equity-proxy correlations — the route chosen from evidence, not vibes.', tag: 'Crypto · 24/7', color: '#fbbf24', href: '/t?tab=crypto', Icon: BitcoinIcon },
    { name: 'Catalysts', desc: 'Earnings, macro releases and graded news joined to the book. Binary events are risk, never tilt.', tag: 'Events', color: '#fb7185', href: '/t?tab=catalyst', Icon: CalendarClockIcon },
  ];

  return (
    <div className="landing nexus-vars">
      {/* NAV */}
      <nav className="lnav">
        <div className="lnav-inner">
          <div className="brand">
            <div className="brand-mark" />
            <span className="brand-name">QUANTEDGE</span>
            <span className="brand-slash">//</span>
            <span className="brand-sub">TERMINAL</span>
          </div>
          <div className="lnav-links">
            {['Product', 'Modules', 'Workflow', 'Pricing', 'FAQ'].map((l) => (
              <div key={l} className="lnav-link" onClick={() => document.getElementById(`sec-${l.toLowerCase()}`)?.scrollIntoView({ behavior: 'smooth' })}>{l}</div>
            ))}
          </div>
          <div className="lnav-spacer" />
          <div className={`lnav-status${fresh ? '' : closed ? ' closed' : ' stale'}`}><span className="dot" />{fresh ? 'Live' : closed ? 'Market closed' : 'Data stale'}</div>
          <Link href="/login" className="btn btn-ghost">Sign in</Link>
          <Link href="/t" className="btn btn-primary">Get access</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="container">
          <div className="hero-grid">
            <div>
              <div className="hero-eyebrow"><span className="pill">TERMINAL</span>Trading research for stocks, options &amp; crypto</div>
              <h1 className="hero-title">
                See the positioning.<br />
                <span className="grad">Rank the setup.</span><br />
                <span className="accent">Prove the record.</span>
              </h1>
              {/* docs/POSITIONING.md — the definition and the 25-word description. */}
              <p className="hero-sub">
                QuantEdge is a trading research terminal: dealer positioning, options flow, <b>NEXUS</b> — the trading desk of evidence-ranked setups — a 0DTE desk, charts, <b>Quantinum Bot</b> on paper and your trading journal. Every number carries its evidence and its record.
              </p>
              <div className="hero-actions">
                <Link href="/t" className="btn btn-primary btn-lg">
                  Open the terminal
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                </Link>
                <a href="#sec-product" className="btn btn-ghost btn-lg" onClick={(e) => { e.preventDefault(); document.getElementById('sec-product')?.scrollIntoView({ behavior: 'smooth' }); }}>See the product</a>
              </div>
              <div className="hero-meta">
                <div className="hero-meta-item">{CHECK}Every number carries its evidence</div>
                <div className="hero-meta-item">{CHECK}Delayed data says delayed</div>
                <div className="hero-meta-item">{CHECK}Win rates travel with their n</div>
              </div>
            </div>

            {/* Hero terminal — everything real */}
            <div className="lterminal">
              <div className="lterminal-head">
                <div className="lterminal-dots"><span /><span /><span /></div>
                <div className="lterminal-title">nexus · ranked book · live</div>
                <div className="lterminal-status"><span className="dot" />engaged</div>
              </div>
              <div className="lterminal-body">
                <div className="t-panel">
                  <div className="t-panel-head"><span>Market Pulse · SPY</span><span className="live">LIVE</span></div>
                  <div className="t-price">{spyLast != null ? `SPY ${spyLast.toFixed(2)}` : 'SPY —'}</div>
                  <div className={`t-change${(spyChg ?? 0) >= 0 ? ' up' : ''}`}>{spyChg != null ? `${spyChg >= 0 ? '+' : ''}${spyChg.toFixed(2)}% · ${rotation?.sessionLabel ?? 'session'}` : '—'}</div>
                  <div className="t-chart"><Spark bars={spyBars} color={(spyChg ?? 0) >= 0 ? '#6ee7b7' : '#ff6b3d'} height={60} /></div>
                </div>
                <div className="t-panel">
                  <div className="t-panel-head"><span>Rotation Map</span><span>{rotation?.sessionLabel ?? ''}</span></div>
                  <div className="t-quadrant"><RotQuad sectors={sectors} height={120} /></div>
                </div>
                <div className="t-panel" style={{ gridColumn: '1/-1' }}>
                  <div className="t-panel-head"><span>Active Signals · {picks.length} in play</span><span className="live">LIVE</span></div>
                  {top2.map((p) => {
                    const dir = (p.direction ?? 'long').toLowerCase();
                    const pnl = p.currentPrice != null && p.entryPrice ? ((p.currentPrice - p.entryPrice) / p.entryPrice) * (dir === 'short' ? -100 : 100) : null;
                    return (
                      <div className="t-signal" key={p.symbol}>
                        <span className="ticker">{p.symbol}</span>
                        <span className="band">{(p.publishedConvictionBand ?? p.convictionBand ?? 'C').charAt(0)}</span>
                        <span style={{ fontSize: 'var(--fs-10, 10px)', color: 'var(--text-dim)' }}>{dir === 'short' ? '▼ BEAR' : '▲ BULL'} · {p.tradeType ?? 'swing'}</span>
                        <span className={`dir${(pnl ?? 0) < 0 ? ' down' : ''}`}>{pnl != null ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%` : '—'}</span>
                      </div>
                    );
                  })}
                  <div className="t-row"><span className="k">Avg evidence</span><span className="v">{avgScore}/100</span></div>
                  <div className="t-row"><span className="k">Top evidence</span><span className="v up">{topScore}/100</span></div>
                  <div className="t-row"><span className="k">Long / Short</span><span className="v"><span style={{ color: 'var(--green)' }}>{longs}</span> / <span style={{ color: 'var(--red)' }}>{shorts}</span></span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRODUCT — real UI captures (desktop + phone) of the built app rendered
          with the device-audit harness's illustrative fixtures. Nothing in them is
          market data, and the frame says so. Explicit width/height = no layout
          shift; lazy + async decode keep them off the hero's critical path. */}
      <section id="sec-product" className="lshot" aria-labelledby="lshot-title">
        <div className="container">
          <div className="reveal lshot-head">
            <div className="sec-eyebrow">The product</div>
            <h2 className="lsec-title" id="lshot-title">This is the terminal. <span className="grad">Not a render of one.</span></h2>
            <p className="lsec-sub">GEX dealer positioning on the desktop, NEXUS — the trading desk — on the phone. Every tile carries its source and its data age.</p>
          </div>
          <div className="lshot-stage reveal">
            <figure className="lshot-desktop">
              <div className="lshot-bar" aria-hidden="true">
                <span className="lshot-dots"><i /><i /><i /></span>
                <span className="lshot-url">quantedgelabs.net/t?tab=gex</span>
              </div>
              <img
                src="/screenshots/qe-desktop-gex.webp"
                width={1440}
                height={900}
                loading="lazy"
                decoding="async"
                alt="The QuantEdge GEX workspace on a desktop: a strike-by-expiry gamma exposure matrix, key levels with call wall, put wall and zero-gamma, and the dealer regime — shown with sample data."
              />
            </figure>
            <figure className="lshot-phone">
              <img
                src="/screenshots/qe-phone-nexus.webp"
                width={393}
                height={852}
                loading="lazy"
                decoding="async"
                alt="NEXUS, the QuantEdge trading desk, on a phone: ranked setups with evidence scores, entry, stop and target — shown with sample data."
              />
            </figure>
            <p className="lshot-note">Sample data · illustrative, not live market data</p>
          </div>
        </div>
      </section>

      {/* TAPE — real sector + crypto reads; pauses on hover like a tape should */}
      <div className="ltape" onMouseEnter={() => setTapePaused(true)} onMouseLeave={() => setTapePaused(false)}>
        <div className={`ltape-track${tapePaused ? ' paused' : ''}`}>
          {[...tape, ...tape].map((t, i) => (
            <div className="ltape-item" key={i}>
              <span className="ltape-sym">{t.sym}</span>
              {t.price && <span className="ltape-price">{t.price}</span>}
              <span className={`ltape-chg ${t.chg >= 0 ? 'up' : 'down'}`}>{t.chg >= 0 ? '+' : ''}{t.chg.toFixed(2)}%</span>
              <span className="ltape-sep">·</span>
            </div>
          ))}
        </div>
      </div>

      {/* STATS — real */}
      <section className="stats-bar-l">
        <div className="container">
          <div className="stats-grid">
            <div className="stat-item reveal">
              <div className="lstat-val">{ideasLoading ? '—' : (ideasMeta?.total ?? 0).toLocaleString()}</div>
              <div className="lstat-label">Signals generated & outcome-tracked</div>
              <div className="lstat-sub">{ideasLoading ? 'loading…' : `${ideasMeta?.last24h ?? 0} in the last 24h${conv ? ` · ${picks.length} in play now` : ''}`}</div>
            </div>
            <div className="stat-item reveal">
              <div className="lstat-val">{rotationLoading ? '—' : sectors.length}</div>
              <div className="lstat-label">Sectors mapped in rotation</div>
              <div className="lstat-sub">{rotationLoading ? 'loading…' : (rotation?.sessionLabel ?? 'live session')}</div>
            </div>
            <div className="stat-item reveal">
              <div className="lstat-val">{patternsLoading || (!patterns?.scanned && patterns?.scanning) ? '—' : (patterns?.hits?.length ?? 0)}</div>
              <div className="lstat-label">Chart patterns detected today</div>
              <div className="lstat-sub">{patternsLoading ? 'loading…' : patterns?.scanned ? `${patterns.scanned} names swept on real bars` : 'sweep in progress'}</div>
            </div>
            <div className="stat-item reveal">
              <div className="lstat-val">{convLoading ? '—' : (<>{topScore}<span style={{ fontSize: 20, color: 'var(--text-mute)' }}>/100</span></>)}</div>
              <div className="lstat-label">Top evidence score today</div>
              <div className="lstat-sub">{CONVICTION_LAYER_COUNT}-layer Quantinum scoring</div>
            </div>
          </div>
        </div>
      </section>

      {/* MODULES */}
      <section id="sec-modules">
        <div className="container">
          <div className="reveal">
            <div className="sec-eyebrow">01 · Modules</div>
            <h2 className="lsec-title">One terminal. <span className="grad">Every module connected.</span></h2>
            <p className="lsec-sub">Positioning feeds the setups. Setups feed NEXUS. NEXUS feeds Quantinum Bot and your journal — and the record keeps score on everything, including the rules.</p>
          </div>
          <div className="modules-grid">
            {MODULES.map((m) => (
              <Link href={m.href} key={m.name} className="lmodule reveal" style={{ ['--mod-color' as string]: m.color }}>
                <div className="lmodule-icon">
                  <m.Icon size={20} strokeWidth={2} aria-hidden />
                </div>
                <div className="lmodule-name">{m.name}</div>
                <div className="lmodule-desc">{m.desc}</div>
                <span className="lmodule-tag">{m.tag}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section>
        <div className="container">
          <div className="feature">
            <div className="reveal">
              <div className="feature-num">FEATURE · 01</div>
              <h3 className="feature-title">Setups ranked by evidence, not hype.</h3>
              <p className="feature-desc">These two cards are NEXUS's top picks right now — real levels, real evidence scores, real P&L. Hover the charts: they're the platform's actual price series, and clicking any card opens the terminal on the real thing.</p>
              <div className="feature-list">
                <div className="feature-list-item">{CHECK}<div><b>{CONVICTION_LAYER_COUNT}-layer Quantinum scoring</b> <span>— technical, regime, GEX, catalyst, flow, pre-market and more.</span></div></div>
                <div className="feature-list-item">{CHECK}<div><b>Band grading S → C</b> <span>— conviction tiers, strongest to weakest; filter the book in one click.</span></div></div>
                <div className="feature-list-item">{CHECK}<div><b>Entry, stop, T1 and R:R</b> <span>— first target and risk/reward, pre-computed on every signal. No guesswork.</span></div></div>
              </div>
            </div>
            <div className="feature-visual reveal">
              {convLoading && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-mute)', fontStyle: 'italic', fontSize: 12 }}>Loading live signals…</div>}
              {!convLoading && top2.map((p) => <SigCard key={p.symbol} p={p} />)}
              {!convLoading && top2.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-mute)', fontStyle: 'italic', fontSize: 12 }}>The board is between publishes — signals appear here the moment they exist.</div>}
            </div>
          </div>

          <div className="feature reverse">
            <div className="reveal">
              <div className="feature-num">FEATURE · 02</div>
              <h3 className="feature-title">See rotation before it becomes consensus.</h3>
              <p className="feature-desc">Every dot is a real sector at its measured relative-strength × momentum coordinate, from the same feed the terminal trades against. The flows below are today's strongest measured in/outflows.</p>
              <div className="feature-list">
                <div className="feature-list-item">{CHECK}<div><b>{sectors.length || 15} sectors mapped live</b> <span>— rsRatio and rsMomentum, computed not drawn.</span></div></div>
                <div className="feature-list-item">{CHECK}<div><b>Inflow / outflow states</b> <span>— cash rotation direction, quantified per sector.</span></div></div>
                <div className="feature-list-item">{CHECK}<div><b>Stale data says so</b> <span>— the map is labeled with its session, never passed off as live.</span></div></div>
              </div>
            </div>
            <div className="feature-visual reveal">
              <div className="rot-map">
                <RotQuad sectors={sectors} />
                <div className="rot-label tl">Leading</div>
                <div className="rot-label tr">Improving</div>
                <div className="rot-label bl">Weakening</div>
                <div className="rot-label br">Lagging</div>
                <div className="rot-axis x">x · rel strength →</div>
                <div className="rot-axis y">y · momentum →</div>
              </div>
              <div className="flow-viz">
                {[...flows.top.map((s) => ({ s, cls: 'in' as const })), ...flows.bottom.map((s) => ({ s, cls: 'out' as const }))].map(({ s, cls }) => (
                  <div className="lflow-row" key={s.etf}>
                    <div className="lflow-sym" style={{ color: cls === 'in' ? 'var(--green)' : 'var(--red)' }}>{s.etf}</div>
                    <div className="lflow-bar"><div className={`lflow-fill ${cls}`} style={{ width: `${Math.min(95, Math.abs(s.relChange ?? 0) / flows.maxAbs * 95)}%` }} /></div>
                    <div className={`lflow-val ${cls}`}>{(s.relChange ?? 0) >= 0 ? '+' : ''}{(s.relChange ?? 0).toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WORKFLOW */}
      <section id="sec-workflow">
        <div className="container">
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 56 }}>
            <div className="sec-eyebrow" style={{ margin: '0 auto 16px' }}>02 · Workflow</div>
            <h2 className="lsec-title" style={{ margin: '0 auto 16px' }}>From tape to trade <span className="grad">in four moves.</span></h2>
            <p className="lsec-sub" style={{ margin: '0 auto' }}>A repeatable process that removes emotion and surfaces only the setups worth your capital.</p>
          </div>
          <div className="workflow-grid">
            {[
              ['01', 'Read the tape', 'Open the terminal. Check the pulse, rotation map and pattern radar. Know what the market is doing before you look at any ticker.'],
              ['02', 'Rank the book', 'Filter by band, side, state. Sort by conviction, risk/reward or time-to-target. The top of the book is where your attention belongs.'],
              ['03', 'Audit the evidence', 'Open any ticker page. The Quantinum read shows every layer that argues for it and against it. If the evidence doesn\'t clear your bar, skip it.'],
              ['04', 'Let the record judge', 'Entry, stop and T1 are pre-set. Quantinum Bot trades every published idea on paper, your journal keeps your own — win rates carry their sample size, always.'],
            ].map(([n, t, d]) => (
              <div className="workflow-step reveal" key={n}>
                <div className="workflow-num">{n}</div>
                <div className="workflow-title">{t}</div>
                <div className="workflow-desc">{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

            {/* PRICING — the canonical plans live on /pricing; this section links there
          instead of duplicating a stale tier grid that contradicted it. */}
      <section id="sec-pricing">
        <div className="container">
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 8 }}>
            <div className="sec-eyebrow" style={{ margin: '0 auto 16px' }}>03 · Pricing</div>
            <h2 className="lsec-title" style={{ margin: '0 auto 16px' }}>Start free. <span className="grad">Scale when the book does.</span></h2>
            <p className="lsec-sub" style={{ margin: '0 auto 24px' }}>Explore the platform free, then upgrade to Advanced for unlimited access and real-time data. Beta pricing locks in before launch.</p>
            <Link href="/pricing" className="btn btn-primary btn-lg">
              See plans and pricing
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ — honest answers */}
      <section id="sec-faq">
        <div className="container">
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 48 }}>
            <div className="sec-eyebrow" style={{ margin: '0 auto 16px' }}>04 · FAQ</div>
            <h2 className="lsec-title" style={{ margin: '0 auto' }}>Questions, answered honestly.</h2>
          </div>
          <div className="faq-list">
            {[
              ['What is QuantEdge?', 'A trading research terminal for stocks, options and crypto. It shows dealer positioning (GEX/VEX, walls, zero-γ, the squeeze radar), options flow and dark-pool levels, NEXUS — the trading desk of evidence-ranked setups — a 0DTE desk and charts; Quantinum reads every ticker\'s evidence; Quantinum Bot trades the published ideas on paper; and a journal holds your own trades. Every number carries its evidence and its record.'],
              ['Is this investment advice?', 'No. QUANTEDGE is an educational and analytical tool. Every signal is a hypothesis ranked by evidence — not a recommendation. You remain fully responsible for your own execution and risk.'],
              ['What data powers the terminal?', 'Live equity, futures and crypto quotes; real daily and intraday bars for every chart; options chains from multiple sources with freshness disclosed on every surface — delayed data is labeled delayed, and anything unmeasured says NOT MEASURED instead of showing a made-up number.'],
              ['How is "evidence" actually calculated?', `Quantinum scores each setup across up to ${CONVICTION_LAYER_COUNT} independent layers`+' — technicals, market regime, GEX positioning, catalysts, flow, pre-market context and more. Layers argue for (+) or against (−) the setup, every layer shows its reasoning, and the sum is the evidence score. Win rates are only reported once a signal family has 30+ decided outcomes.'],
              ['Can I journal my own trades?', 'Yes. Import a broker CSV (or a Discord trading-journals forum), or enter trades by hand. The journal gives you a calendar, insights on what to stop doing in dollars with sample size, loss analysis from the bars, playbooks and progress — and the same analysis runs on imported trader journals.'],
              ['Does Quantinum Bot trade my money?', 'No. Quantinum Bot is a paper-trading bot: it takes NEXUS\'s own published ideas into a simulated book with real contract marks (source and delay disclosed on every fill), so the track record is earned in public. No broker custody, no execution of client funds.'],
              ['Can I cancel anytime?', 'Yes. Monthly plans cancel anytime. Annual plans can be refunded pro-rata within the first 30 days. No retention calls, no friction.'],
            ].map(([q, a], i) => (
              <div className={`faq-item reveal${openFaq === i ? ' open' : ''}`} key={q}>
                <div className="faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  {q}
                  <span className="icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg></span>
                </div>
                <div className="faq-a"><div className="faq-a-inner">{a}</div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="container">
          <div className="cta-box reveal">
            <h2 className="cta-title">Stop trading the headline.<br /><span className="grad">Start trading the evidence.</span></h2>
            <p className="cta-sub">Read the positioning, rank the setup on NEXUS and keep the record — on one terminal.</p>
            <div className="cta-actions">
              <Link href="/t" className="btn btn-primary btn-lg">
                Open the terminal
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </Link>
              <Link href="/t?tab=gex" className="btn btn-ghost btn-lg">See the GEX surface</Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lfooter">
        <div className="container">
          {/* Footer links: /about, /w, /academy, /pricing and the legal pages had
              no door anywhere in the product (nav-architecture test N4, 2026-09-24). */}
          <nav className="lfooter-links" aria-label="Site" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', marginBottom: 16 }}>
            {[['/about', 'About'], ['/pricing', 'Pricing'], ['/academy', 'Academy'], ['/blog', 'Blog'], ['/w', 'Public watchlist'], ['/privacy', 'Privacy'], ['/terms', 'Terms']].map(([href, label]) => (
              <Link key={href} href={href} style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: 13, minHeight: 32, display: 'inline-flex', alignItems: 'center' }}>{label}</Link>
            ))}
          </nav>
          <p className="lfooter-def">QuantEdge is a trading research terminal for stocks, options and crypto — every number carries its evidence and its record.</p>
          <div className="lfooter-bottom">
            <div>© 2026 QuantEdge Labs · All rights reserved.</div>
            <div className="disclaimer">Educational and analytical tool only. Not investment advice. Trading involves risk of loss. Past performance of signals does not guarantee future results — and every performance figure shown carries its sample size.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
