/**
 * BOT — the seventh reference mock, wired to the automation that actually runs.
 *
 * The mock imagined broker bots placing orders. QuantEdge has no broker and
 * executes nothing — what it DOES run is a real automation layer: scanner
 * crons, ingest jobs, and hard gates in code. That is what this surface
 * reports, measured:
 *
 *   bots        the platform's real background jobs. Status is derived from
 *               each job's own observable output freshness — not a claimed
 *               state. running = fresh within cadence, stale = overdue.
 *   rules       the real gates enforced in code, with the file that enforces
 *               them. Toggles show enforcement state and are LOCKED — these
 *               rules are code, not switches; hover says so.
 *   queue       forward-looking, real: the FRED economic calendar's upcoming
 *               releases (the cash gate reads the same feed).
 *   log         real recent events — ideas published by the conviction engine
 *               and catalysts ingested by the news sentry, merged by time.
 *   perf        /api/performance/stats DECIDED outcomes only, with sample
 *               size disclosed. No daily P&L series exists, so the equity
 *               curve renders NOT MEASURED instead of a random walk.
 *   safeguards  the honest list — including "Broker: none · signals only".
 *
 * The mock's fabricated fills, jittering SPY, fake latency and looping
 * uptime counter do not ship.
 */
import { useMemo, useRef, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useColResize } from '@/lib/use-col-resize';
import { openWorkup } from '@/lib/workup-bus';
import { NexusPriceChart } from '@/components/charting/nexus-price-chart';
import { Heartbeat } from '@/components/viz';
import '@/styles/nexus.css';

/* ── payloads ── */
interface ConvictionsPayload {
  generatedAt?: string; totalCandidatesScanned?: number;
  picks?: { symbol: string; direction?: string | null; publishedConvictionBand?: string | null; convictionBand?: string | null; entryPrice?: number | null; tradeType?: string | null }[];
}
interface FlowPayload { trades?: { symbol: string; detectedAt?: string }[]; stats?: any }
interface LeapsPayload { asOf?: string; picks?: unknown[] }
interface EconPayload { upcoming?: { name: string; date: string; time?: string; importance?: string; description?: string }[]; coverage?: { source?: string; current?: boolean } }
interface CatalystsRecent { asOf?: string; count?: number; catalysts?: { symbol?: string; timestamp?: string; eventType?: string; impact?: string; description?: string }[] }
interface PerfPayload {
  overall?: { openIdeas?: number; closedIdeas?: number };
  segmentedWinRates?: Record<string, { winRate: number | null; wins: number; losses: number; decided: number }>;
}
interface PaperPosition {
  id: string; symbol: string; assetType?: string; optionType?: string | null;
  strikePrice?: number | null; expiryDate?: string | null;
  entryPrice: number; currentPrice?: number | null; quantity?: number;
  targetPrice?: number | null; stopLoss?: number | null;
  useTrailingStop?: boolean; trailingStopPercent?: number | null;
  unrealizedPnL?: number | null; unrealizedPnLPercent?: number | null;
  entryTime?: string;
}
interface QuantBotStatus {
  name?: string; startingCapital?: number; cashBalance?: number; totalValue?: number;
  totalPnL?: number; totalPnLPercent?: number; closedCount?: number;
  openPositions?: PaperPosition[];
  config?: { minConviction?: number; maxOpen?: number; riskPerTradePct?: number };
}
interface LedgerEntry { symbol: string; blockedAt: string; entryPrice: number; stopLoss: number; targetPrice: number; reason: string; outcome?: string; wouldBePercent?: number | null; lastPrice?: number }
interface LedgerPayload { totalBlocked?: number; decided?: number; blockedWinners?: number; blockedLosers?: number; netWouldBePercent?: number; entries?: LedgerEntry[] }
interface CryptoPulse { asOf?: string }
interface RealtimePayload { coinbase?: { connected?: boolean }; futures?: { connected?: boolean } }

const MIN_N = 30; // shared/constants MIN_REPORTABLE_SAMPLE

const fetchJson = (url: string) => async () => {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`${url} failed`);
  return r.json();
};

function ageMin(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (Date.now() - t) / 60_000 : null;
}
function fmtAge(min: number | null): string {
  if (min == null) return 'no output';
  if (min < 1) return 'just now';
  if (min < 60) return `${Math.round(min)}m ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)}h ago`;
  return `${Math.round(min / 1440)}d ago`;
}
/** running = fresh within cadence, paused(styled) = stale, stopped = no output */
function jobStatus(min: number | null, cadenceMin: number): 'running' | 'stale' | 'idle' {
  if (min == null) return 'idle';
  return min <= cadenceMin * 2.5 ? 'running' : 'stale';
}
const STATUS_CLASS = { running: 'running', stale: 'paused', idle: 'stopped' } as const;
const STATUS_COLOR = { running: 'var(--bot)', stale: 'var(--amber)', idle: 'var(--text-dim)' } as const;

const ICONS = {
  bolt: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>,
  shield: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
  cal: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
  news: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0V6" /><path d="M12 6h6M12 10h6M12 14h6" /></svg>,
  wave: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M2 12h4l3-9 4 18 3-9h6" /></svg>,
  coin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9 9.5h4.5a1.75 1.75 0 0 1 0 3.5H9.75a1.75 1.75 0 0 0 0 3.5H15" /></svg>,
};

/* The real gates, with the code that enforces them. cat drives the filter tabs. */
const RULES = [
  { name: 'Short discipline', tag: 'Gate', cat: 'gates', file: 'server/short-discipline.ts', trigger: <>if <code>direction == SHORT</code> require a dated event catalyst — no pattern-only shorts. Missing catalyst feed <b>fails closed</b>.</> },
  { name: 'Mention ≠ event', tag: 'Gate', cat: 'gates', file: 'server/short-discipline.ts', trigger: <>a short's catalyst must be <code>impact == high</code> — earnings/FDA/M&A/guidance on the name itself, not a roundup mention.</> },
  { name: 'BTC-proxy long bias', tag: 'Gate', cat: 'gates', file: 'server/short-discipline.ts', trigger: <>MARA-type miners and <code>IBIT/MSTR/COIN/RIOT</code> are BTC proxies — structurally long-biased, never systematically shorted.</> },
  { name: 'Pre-market gap signal', tag: 'Signal', cat: 'signals', file: 'server/quant-ideas-generator.ts', trigger: <>the pre-market gap is a <b>leading direction input</b> — convictions and freshness read it before the open.</> },
  { name: 'Macro cash gate', tag: 'Gate', cat: 'gates', file: 'server/index.ts', trigger: <>high-importance releases from the <code>FRED</code> calendar gate risk-on ideas — the calendar refreshes twice daily, never hand-typed.</> },
  { name: 'Sample-size floor', tag: 'Disclosure', cat: 'disclosure', file: 'shared/constants.ts', trigger: <>no win rate reported under <code>n &lt; {MIN_N}</code> decided outcomes — small samples show the count, not a percentage.</> },
  { name: 'Direction unclaimed', tag: 'Disclosure', cat: 'disclosure', file: 'flow-board', trigger: <>buyer-vs-seller is <b>not measurable</b> on the snapshot feed — FLOW says "n/a" instead of guessing aggressor side.</> },
  { name: 'Wick clamp + disclose', tag: 'Disclosure', cat: 'disclosure', file: 'chart-engine.ts', trigger: <>provider bad ticks are clamped out of the y-scale, drawn off-edge, and <b>disclosed</b> — never silently deleted.</> },
  { name: 'GEX dust rule', tag: 'Disclosure', cat: 'disclosure', file: 'gex-hub-nexus.tsx', trigger: <>matrix cells under <code>$1K</code> gamma render empty with a hover note — dust is not signal.</> },
  { name: 'Stale tape pause', tag: 'Disclosure', cat: 'disclosure', file: 'terminal-shell.tsx', trigger: <>the marquee freezes and labels itself when quotes go stale — a moving tape claims freshness.</> },
  { name: 'No fabrication', tag: 'Gate', cat: 'gates', file: 'everywhere', trigger: <>unmeasured values render <code>NOT MEASURED</code> — no random walks, no jitter, no placeholder percentages.</> },
];

export function BotNexus() {
  const rail = useColResize('nx-bot-side', 320, { sign: -1, min: 240, max: 520 });
  const [ruleTab, setRuleTab] = useState<'all' | 'gates' | 'signals' | 'disclosure'>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const [replay, setReplay] = useState<LedgerEntry | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: conv } = useQuery<ConvictionsPayload>({ queryKey: ['/api/convictions', 'bot'], queryFn: fetchJson('/api/convictions?limit=12'), refetchInterval: 120_000, staleTime: 60_000, retry: 1 });
  const { data: flow } = useQuery<FlowPayload>({ queryKey: ['/api/options-flow', 'bot'], queryFn: fetchJson('/api/options-flow?limit=50'), refetchInterval: 180_000, staleTime: 120_000, retry: 1 });
  const { data: leaps } = useQuery<LeapsPayload>({ queryKey: ['/api/leap-tracker', 'bot'], queryFn: fetchJson('/api/leap-tracker'), refetchInterval: 600_000, staleTime: 300_000, retry: 1 });
  const { data: econ } = useQuery<EconPayload>({ queryKey: ['/api/economic-calendar', 'bot'], queryFn: fetchJson('/api/economic-calendar'), refetchInterval: 600_000, staleTime: 300_000, retry: 1 });
  const { data: cats } = useQuery<CatalystsRecent>({ queryKey: ['/api/catalysts/recent', 'bot'], queryFn: fetchJson('/api/catalysts/recent'), refetchInterval: 300_000, staleTime: 120_000, retry: 1 });
  const { data: perf } = useQuery<PerfPayload>({ queryKey: ['/api/performance/stats', 'bot'], queryFn: fetchJson('/api/performance/stats'), refetchInterval: 600_000, staleTime: 300_000, retry: 1 });
  const { data: pulse } = useQuery<CryptoPulse>({ queryKey: ['/api/crypto/pulse', 'bot'], queryFn: fetchJson('/api/crypto/pulse'), refetchInterval: 300_000, staleTime: 120_000, retry: 1 });
  const { data: realtime } = useQuery<RealtimePayload>({ queryKey: ['/api/realtime-status', 'bot'], queryFn: fetchJson('/api/realtime-status'), refetchInterval: 30_000, staleTime: 20_000, retry: 1 });
  const { data: ledger } = useQuery<LedgerPayload>({ queryKey: ['/api/discipline/ledger', 'bot'], queryFn: fetchJson('/api/discipline/ledger'), refetchInterval: 600_000, staleTime: 300_000, retry: 1 });
  const { data: book } = useQuery<QuantBotStatus>({ queryKey: ['/api/quant-bot/status', 'bot'], queryFn: fetchJson('/api/quant-bot/status'), refetchInterval: 60_000, staleTime: 30_000, retry: 1 });

  /* ── the real jobs, status from their own output freshness ── */
  const lastFlow = flow?.trades?.length ? flow.trades.reduce<string | undefined>((m, t) => (!m || (t.detectedAt && t.detectedAt > m) ? t.detectedAt : m), undefined) : undefined;
  const lastCat = cats?.catalysts?.length ? cats.catalysts[0]?.timestamp : undefined;
  const highImpact = (cats?.catalysts ?? []).filter((c) => c.impact === 'high').length;

  const jobs = useMemo(() => {
    const mk = (id: string, name: string, icon: JSX.Element, cadenceMin: number, cadenceLabel: string, last: string | undefined, desc: string, stats: { k: string; v: string; cls?: string }[]) => {
      const a = ageMin(last);
      const st = jobStatus(a, cadenceMin);
      return { id, name, icon, cadenceLabel, last, desc, stats, age: a, st };
    };
    return [
      mk('conviction', 'Conviction Engine', ICONS.bolt, 10, '4 min warm', conv?.generatedAt,
        '14-layer scoring over the scan universe. Publishes graded ideas; shorts pass the discipline gate or die.',
        [{ k: 'Picks', v: String(conv?.picks?.length ?? '—'), cls: 'bot' }, { k: 'Scanned', v: String(conv?.totalCandidatesScanned ?? '—') }, { k: 'Output', v: fmtAge(ageMin(conv?.generatedAt)), cls: 'green' }]),
      mk('news', 'News Sentry', ICONS.news, 30, '30 min · weekdays', lastCat,
        'Rotating watchlist slice through the news feed. Writes catalysts with eventType + impact — the short gate reads these.',
        [{ k: 'Rows 72h', v: String(cats?.count ?? '—'), cls: 'bot' }, { k: 'High impact', v: String(cats?.catalysts ? highImpact : '—') }, { k: 'Output', v: fmtAge(ageMin(lastCat)), cls: 'green' }]),
      mk('flow', 'Flow Scanner', ICONS.wave, 20, 'market hours', lastFlow,
        'Sweeps the options tape for whale prints, sweeps and blocks. Direction stays unclaimed without the trade tape.',
        [{ k: 'Prints', v: String(flow?.trades?.length ?? '—'), cls: 'bot' }, { k: 'Symbols', v: String(flow?.trades ? new Set(flow.trades.map((t) => t.symbol)).size : '—') }, { k: 'Output', v: fmtAge(ageMin(lastFlow)), cls: 'green' }]),
      mk('leaps', 'LEAPS Tracker', ICONS.shield, 24 * 60, 'daily', leaps?.asOf,
        'Grades long-dated calls on trend, value and momentum (30/30/40). Budget and grade filters read its output.',
        [{ k: 'Picks', v: String(leaps?.picks?.length ?? '—'), cls: 'bot' }, { k: 'Cadence', v: 'daily' }, { k: 'Output', v: fmtAge(ageMin(leaps?.asOf)), cls: 'green' }]),
      mk('macro', 'Macro Calendar', ICONS.cal, 12 * 60, '2×/day · FRED', econ?.coverage?.current ? new Date().toISOString() : undefined,
        'FRED release schedule — CPI, payrolls, PCE, GDP and friends. Feeds the cash gate and the queue on the right.',
        [{ k: 'Upcoming', v: String(econ?.upcoming?.length ?? '—'), cls: 'bot' }, { k: 'Source', v: econ?.coverage?.source ?? '—' }, { k: 'Current', v: econ?.coverage?.current ? 'yes' : 'no', cls: 'green' }]),
      mk('crypto', 'Crypto Pulse', ICONS.coin, 30, 'continuous', pulse?.asOf,
        'BTC/ETH spot, RSI, realized vol and 60d closes. The CRYPTO tab and proxy correlations read this.',
        [{ k: 'Assets', v: '2', cls: 'bot' }, { k: 'Feeds', v: `${(realtime?.coinbase?.connected ? 1 : 0) + (realtime?.futures?.connected ? 1 : 0)}/2` }, { k: 'Output', v: fmtAge(ageMin(pulse?.asOf)), cls: 'green' }]),
    ];
  }, [conv, cats, flow, leaps, econ, pulse, realtime, lastCat, lastFlow, highImpact]);

  const runningCount = jobs.filter((j) => j.st === 'running').length;

  /* ── the log: real events merged by time ── */
  const log = useMemo(() => {
    const rows: { time: string; job: string; sym: string; action: JSX.Element; price: string; chip: string; cls: string }[] = [];
    const t = conv?.generatedAt;
    (conv?.picks ?? []).forEach((p) => {
      const band = p.publishedConvictionBand ?? p.convictionBand;
      rows.push({
        time: t ?? '', job: 'Conviction', sym: p.symbol,
        action: <><b>idea published</b> · {band ?? 'ungraded'} · {(p.direction ?? 'long').toUpperCase()}{p.tradeType ? ` · ${p.tradeType}` : ''}</>,
        price: p.entryPrice != null ? `$${Number(p.entryPrice).toFixed(2)}` : '—',
        chip: 'published', cls: 'filled',
      });
    });
    (cats?.catalysts ?? []).slice(0, 14).forEach((c) => {
      rows.push({
        time: c.timestamp ?? '', job: 'News', sym: c.symbol ?? '—',
        action: <><b>catalyst ingested</b> · {c.eventType ?? 'news'}{c.impact ? ` · ${c.impact} impact` : ''}</>,
        price: '—',
        chip: c.impact === 'high' ? 'high' : c.impact ?? 'row', cls: c.impact === 'high' ? 'alert' : 'pending',
      });
    });
    return rows.filter((r) => r.time).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 14);
  }, [conv, cats]);

  /* ── perf: DECIDED outcomes only, sample disclosed ── */
  const opt = perf?.segmentedWinRates?.options;
  const reportable = (opt?.decided ?? 0) >= MIN_N;

  /* ── ⌘K over jobs / rules / log symbols ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); e.stopPropagation();
        setSearchOpen((o) => !o); setQ('');
        setTimeout(() => searchRef.current?.focus(), 60);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as any);
  }, []);

  const flash = (id: string) => {
    setSearchOpen(false);
    const el = document.querySelector(`[data-bot-id="${id}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.transition = 'box-shadow 0.3s';
      el.style.boxShadow = '0 0 0 2px var(--bot), 0 0 24px rgba(56,189,248,0.4)';
      setTimeout(() => { el.style.boxShadow = ''; }, 1600);
    }
  };
  const searchItems = useMemo(() => {
    const items = [
      ...jobs.map((j) => ({ id: `job-${j.id}`, sym: j.name, name: j.desc.slice(0, 60), meta: j.st, group: 'Jobs' })),
      ...RULES.map((r, i) => ({ id: `rule-${i}`, sym: r.tag, name: r.name, meta: 'enforced', group: 'Rules' })),
      ...log.slice(0, 8).map((l, i) => ({ id: `log-${i}`, sym: l.sym, name: l.chip, meta: l.job, group: 'Recent' })),
    ];
    const qq = q.trim().toUpperCase();
    return qq ? items.filter((i) => i.sym.toUpperCase().includes(qq) || i.name.toUpperCase().includes(qq)) : items.slice(0, 12);
  }, [jobs, log, q]);

  const filteredRules = ruleTab === 'all' ? RULES : RULES.filter((r) => r.cat === ruleTab);
  const catRows = cats?.count ?? null;
  const nextRelease = econ?.upcoming?.[0];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="botlab">
      <div className={`nx-resize${rail.dragging ? ' active' : ''}`} style={{ right: rail.width - 4 }} title="Drag to resize · double-click to expand" {...rail.handleProps} />

      {/* ══════════ BOT AREA ══════════ */}
      <div className="col bot-area" style={{ ['--nx-side' as string]: `${rail.width}px` }}>
        <div className="bot-header">
          <div className="bot-eyebrow">Automation</div>
          <div className="bot-title-row"><div className="bot-title">BOT</div></div>
          <div className="bot-desc">
            The platform's real automation layer: <b>scanner jobs</b>, <b>hard gates</b> and <b>ingest crons</b>, reported from their own output.
            No broker is connected — nothing here places orders. Discipline is enforced in code, not clicked on.
          </div>
          <div className="bot-meta">
            <span className="tag bot">{runningCount}/{jobs.length} jobs running</span>
            <span className="tag live"><span className="dot" />{RULES.length} rules enforced</span>
            <span className="tag mute">no broker · signals only</span>
          </div>
        </div>

        {/* STATS BAR */}
        <div className="stats-bar">
          <div className="stat-card">
            <div className="stat-label">Jobs live</div>
            <div className="stat-val bot">{runningCount}</div>
            <div className="stat-sub">of {jobs.length} · by output freshness</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Rules enforced</div>
            <div className="stat-val">{RULES.length}</div>
            <div className="stat-sub">in code · not toggleable</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Latest scan</div>
            <div className="stat-val green">{conv?.picks?.length ?? '—'}</div>
            <div className="stat-sub">{conv?.totalCandidatesScanned ?? '—'} candidates scanned</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Win rate · options</div>
            {reportable ? (
              <>
                <div className="stat-val green">{opt!.winRate?.toFixed(0)}%</div>
                <div className="stat-sub">{opt!.wins}W–{opt!.losses}L · n={opt!.decided} decided</div>
              </>
            ) : (
              <>
                <div className="stat-val amber">n={opt?.decided ?? 0}</div>
                <div className="stat-sub">under sample floor ({MIN_N}) — no % shown</div>
              </>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-label">Next macro release</div>
            <div className="stat-val amber">{nextRelease?.name ?? '—'}</div>
            <div className="stat-sub">{nextRelease ? `${nextRelease.date === today ? 'today' : nextRelease.date}${nextRelease.time ? ` · ${nextRelease.time}` : ''}` : 'calendar empty'}</div>
          </div>
        </div>

        {/* ACTIVE BOTS = the real jobs */}
        <div className="bots-section">
          <div className="bots-head">
            <div className="bots-label">Background jobs · status from output freshness</div>
            <div className="log-count">running · stale · idle</div>
          </div>
          <div className="bots-grid">
            {jobs.map((j) => (
              <div key={j.id} className="bot-card" data-bot-id={`job-${j.id}`} style={{ ['--bot-status-color' as string]: STATUS_COLOR[j.st] }}
                title={`Last output ${fmtAge(j.age)} · cadence ${j.cadenceLabel}`}>
                <div className="bot-card-head">
                  <div className={`bot-icon ${STATUS_CLASS[j.st]}`}>{j.icon}</div>
                  <div className="bot-name">{j.name}</div>
                  <div className={`bot-status ${STATUS_CLASS[j.st]}`}><span className="dot" />{j.st}</div>
                </div>
                <div className="bot-desc-text">{j.desc}</div>
                <div className="bot-stats">
                  {j.stats.map((s) => (
                    <div className="bot-stat" key={s.k}>
                      <div className="bot-stat-k">{s.k}</div>
                      <div className={`bot-stat-v${s.cls ? ` ${s.cls}` : ''}`}>{s.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PAPER BOOK — what the bot is actually holding */}
        <div className="book-section">
          <div className="book-head">
            <div className="book-label">Paper book · what the bot holds</div>
            <div className="book-meta">
              <span>Value <b>{book?.totalValue != null ? `$` + book.totalValue.toLocaleString() : `—`}</b></span>
              <span>Cash <b>{book?.cashBalance != null ? `$` + book.cashBalance.toLocaleString() : `—`}</b></span>
              <span>P&L <b style={{ color: (book?.totalPnL ?? 0) >= 0 ? `var(--green)` : `var(--red)` }}>{(book?.totalPnL ?? 0) >= 0 ? `+` : ``}{`$` + String(book?.totalPnL ?? 0)} ({(book?.totalPnLPercent ?? 0).toFixed(2)}%)</b></span>
              <span>{book?.closedCount ?? 0} closed · floor {book?.config?.minConviction ?? `—`} · max {book?.config?.maxOpen ?? `—`} · {book?.config?.riskPerTradePct ?? `—`}%/trade</span>
            </div>
          </div>
          {(book?.openPositions ?? []).map((p) => {
            const pnl = p.unrealizedPnLPercent ?? 0;
            const up = pnl >= 0;
            const contract = p.assetType === `option` && p.strikePrice != null
              ? `$` + p.strikePrice + (p.optionType ?? `c`).charAt(0).toUpperCase() + ` ` + (p.expiryDate ? new Date(p.expiryDate).toLocaleDateString([], { month: `short`, day: `numeric` }) : ``) + ` · ` + (p.quantity ?? 1) + `x @ $` + p.entryPrice
              : (p.quantity ?? 1) + `x @ $` + p.entryPrice;
            return (
              <div className="book-pos" key={p.id} style={{ [`--pos-accent` as string]: up ? `var(--green)` : `var(--red)` }} onClick={() => openWorkup(p.symbol)} title="Open the ticker workup">
                <div>
                  <div className="bp-sym">{p.symbol}</div>
                  <div className="bp-contract">{contract}</div>
                </div>
                <div className="bp-brackets">
                  {p.targetPrice != null && <span className="t">T ${p.targetPrice}</span>}
                  {p.stopLoss != null && <span className="s">S ${p.stopLoss}</span>}
                  {p.useTrailingStop && <span className="tr">trail {p.trailingStopPercent ?? `—`}%</span>}
                </div>
                <div className="bp-kv">now<b>{p.currentPrice != null ? `$` + p.currentPrice : `—`}</b></div>
                <div className="bp-kv">held<b>{p.entryTime ? Math.max(0, Math.round((Date.now() - Date.parse(p.entryTime)) / 86_400_000)) + `d` : `—`}</b></div>
                <div className={up ? `bp-pnl up` : `bp-pnl down`}>{up ? `+` : ``}{pnl.toFixed(1)}%</div>
                <div className="bp-kv">P&L $<b style={{ color: up ? `var(--green)` : `var(--red)` }}>{(p.unrealizedPnL ?? 0) >= 0 ? `+` : ``}{p.unrealizedPnL ?? 0}</b></div>
              </div>
            );
          })}
          {(book?.openPositions ?? []).length === 0 && (
            <div className="book-empty">Flat — the bot holds nothing. Entries require conviction ≥ {book?.config?.minConviction ?? `—`} and pass the same gates as the board.</div>
          )}
        </div>

        {/* SHADOW LEDGER — what the short gate blocked, replayed on real bars */}
        <div className="book-section">
          <div className="book-head">
            <div className="book-label" style={{ color: 'var(--amber)' }}>Shadow ledger · what the gate blocked</div>
            <div className="book-meta">
              <span>{ledger?.totalBlocked ?? 0} blocked</span>
              <span>{ledger?.decided ?? 0} decided</span>
              <span>saved <b style={{ color: 'var(--green)' }}>{ledger?.blockedLosers ?? 0}</b> · cost <b style={{ color: 'var(--red)' }}>{ledger?.blockedWinners ?? 0}</b></span>
              <span>net wouldBe <b style={{ color: (ledger?.netWouldBePercent ?? 0) > 0 ? 'var(--red)' : 'var(--green)' }}>{(ledger?.netWouldBePercent ?? 0) >= 0 ? '+' : ''}{(ledger?.netWouldBePercent ?? 0).toFixed(2)}%</b></span>
            </div>
          </div>
          {(ledger?.entries ?? []).slice(0, 8).map((e2) => {
            const oc = e2.outcome ?? 'open';
            const up = (e2.wouldBePercent ?? 0) >= 0;
            return (
              <div className="book-pos" key={`${e2.symbol}-${e2.blockedAt}`} style={{ ['--pos-accent' as string]: oc === 'hit_target' ? 'var(--red)' : oc === 'hit_stop' ? 'var(--green)' : 'var(--amber)' }}>
                <div>
                  <div className="bp-sym">{e2.symbol}</div>
                  <div className="bp-contract">short blocked {new Date(e2.blockedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} @ ${e2.entryPrice}</div>
                </div>
                <div className="bp-brackets">
                  <span className="t">T ${e2.targetPrice}</span>
                  <span className="s">S ${e2.stopLoss}</span>
                </div>
                <div className="bp-kv">outcome<b>{oc === 'hit_target' ? 'won (cost us)' : oc === 'hit_stop' ? 'lost (saved us)' : 'open'}</b></div>
                <div className={`bp-pnl ${up ? 'up' : 'down'}`}>{e2.wouldBePercent != null ? `${up ? '+' : ''}${e2.wouldBePercent.toFixed(1)}%` : '—'}</div>
                <div className="bp-kv">
                  <button onClick={() => setReplay(e2)} style={{ padding: '3px 9px', borderRadius: 3, background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.25)', color: 'var(--bot-bright)', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>REPLAY</button>
                </div>
                <div className="bp-kv" />
              </div>
            );
          })}
          {(ledger?.entries ?? []).length === 0 && <div className="book-empty">No blocks recorded yet — entries appear the first time the gate refuses a short.</div>}
        </div>

        {/* RULES = the real gates */}
        <div className="rules-section">
          <div className="rules-head">
            <div className="rules-label">Rules · enforced in code, with the file that holds them</div>
            <div className="rules-tabs">
              {([['all', `All · ${RULES.length}`], ['gates', `Gates · ${RULES.filter((r) => r.cat === 'gates').length}`], ['signals', `Signals · ${RULES.filter((r) => r.cat === 'signals').length}`], ['disclosure', `Disclosure · ${RULES.filter((r) => r.cat === 'disclosure').length}`]] as const).map(([k, label]) => (
                <div key={k} className={`rules-tab${ruleTab === k ? ' active' : ''}`} onClick={() => setRuleTab(k)}>{label}</div>
              ))}
            </div>
          </div>
          <table className="rules-table">
            <thead>
              <tr><th>Rule</th><th>What it enforces</th><th>Where</th><th>Active</th></tr>
            </thead>
            <tbody>
              {filteredRules.map((r) => (
                <tr key={r.name} data-bot-id={`rule-${RULES.indexOf(r)}`}>
                  <td><div className="rule-name">{r.name} <span className="bot-tag">{r.tag}</span></div></td>
                  <td><div className="rule-trigger">{r.trigger}</div></td>
                  <td><div className="rule-size"><span className="pct" style={{ fontSize: 10 }}>{r.file}</span></div></td>
                  <td><div className="rule-toggle on locked" title="Enforced in code — not a switch. Change it in the file, ship it through review." /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* EXECUTION LOG = real recent events */}
        <div className="log-section">
          <div className="log-head">
            <div className="log-label">Activity log · real events</div>
            <div className="log-count">{log.length} shown · ideas + catalysts, merged by time</div>
          </div>
          <div className="log-list">
            {log.length === 0 && <div className="disclaimer" style={{ padding: '18px 0' }}>No recent events from the engines — outputs will appear as jobs run.</div>}
            {log.map((l, i) => (
              <div className="log-item" key={i} data-bot-id={`log-${i}`}>
                <div className="log-time">{l.time ? new Date(l.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</div>
                <div className="log-bot">{l.job}</div>
                <div className="log-ticker">{l.sym}</div>
                <div className="log-action">{l.action}</div>
                <div className="log-price">{l.price}</div>
                <div className={`log-status ${l.cls}`}>{l.chip}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════ RIGHT SIDEBAR ══════════ */}
      <div className="col col-right" style={{ width: rail.width, minWidth: rail.width }}>
        <div className="sec-head">
          <div className="sec-num" style={{ color: 'var(--bot-bright)', textShadow: '0 0 8px rgba(56,189,248,0.4)' }}>Automation</div>
          <div className="sec-title" style={{ background: 'linear-gradient(135deg,#fff,var(--bot-bright))', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Discipline, running.</div>
          <div className="sec-sub">The jobs and gates that keep the terminal honest — reported from their own output, not a claimed status.</div>
          <div className="sec-meta">
            <span className="tag bot">BOT</span>
            <span className="tag live"><span className="dot" />engaged</span>
          </div>
        </div>

        {/* QUEUE = FRED upcoming releases */}
        <div className="queue">
          <div className="queue-head">
            <div className="queue-label">Macro queue · FRED</div>
            <div className="queue-count">{econ?.upcoming?.length ?? 0} scheduled</div>
          </div>
          <div className="queue-list">
            {(econ?.upcoming ?? []).slice(0, 6).map((e) => (
              <div className="queue-item" key={`${e.name}-${e.date}`} title={e.description ?? ''}>
                <div className="queue-icon">{ICONS.cal}</div>
                <div>
                  <div className="queue-name">{e.name}</div>
                  <div className="queue-meta">{e.date}{e.time ? ` · ${e.time}` : ''}{e.importance ? ` · ${e.importance}` : ''}</div>
                </div>
                <div className="queue-eta">{e.date === today ? 'today' : `${Math.max(0, Math.round((Date.parse(e.date) - Date.now()) / 86_400_000))}d`}</div>
              </div>
            ))}
            {(econ?.upcoming ?? []).length === 0 && <div className="disclaimer" style={{ padding: '10px 0' }}>No releases in the calendar window.</div>}
          </div>
        </div>

        {/* PERF — decided outcomes only */}
        <div className="perf">
          <div className="perf-head">
            <div className="perf-label">Outcomes · decided only</div>
          </div>
          <div className="perf-chart" style={{ display: 'grid', placeItems: 'center' }}>
            {/* No daily P&L series is tracked — a curve here would be a random walk. */}
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontStyle: 'italic', color: 'var(--text-mute)', textAlign: 'center', padding: '0 10px' }}>
              NOT MEASURED — no daily P&L series;<br />outcomes are tracked per idea
            </div>
          </div>
          <div className="perf-stats">
            <div className="perf-stat">
              <div className="perf-stat-k">Win rate</div>
              <div className={`perf-stat-v ${reportable ? 'green' : ''}`} style={reportable ? undefined : { color: 'var(--amber)' }}>{reportable ? `${opt!.winRate?.toFixed(0)}%` : `n<${MIN_N}`}</div>
            </div>
            <div className="perf-stat">
              <div className="perf-stat-k">W – L</div>
              <div className="perf-stat-v bot">{opt ? `${opt.wins}–${opt.losses}` : '—'}</div>
            </div>
            <div className="perf-stat">
              <div className="perf-stat-k">Open</div>
              <div className="perf-stat-v">{perf?.overall?.openIdeas ?? '—'}</div>
            </div>
          </div>
        </div>

        {/* SAFEGUARDS — the honest list */}
        <div className="safeguards">
          <div className="safeguards-head">
            <div className="safeguards-label">Standing safeguards</div>
          </div>
          <div className="safeguard-list">
            <div className="safeguard-item"><span className="safeguard-name">Short gate · event required</span><span className="safeguard-val" style={{ color: 'var(--green)' }}>enforced <span className="check">✓</span></span></div>
            <div className="safeguard-item"><span className="safeguard-name">Catalyst bar · impact high</span><span className="safeguard-val" style={{ color: 'var(--green)' }}>enforced <span className="check">✓</span></span></div>
            <div className="safeguard-item"><span className="safeguard-name">Sample floor · n ≥ {MIN_N}</span><span className="safeguard-val" style={{ color: 'var(--green)' }}>enforced <span className="check">✓</span></span></div>
            <div className="safeguard-item"><span className="safeguard-name">Fabricated data</span><span className="safeguard-val" style={{ color: 'var(--green)' }}>banned <span className="check">✓</span></span></div>
            <div className="safeguard-item"><span className="safeguard-name">Broker</span><span className="safeguard-val" style={{ color: 'var(--amber)' }}>none · signals only</span></div>
          </div>
        </div>

        {/* SYS STATUS */}
        <div className="sys-status">
          <div className="sys-row"><span className="k">Jobs</span><span className="v" style={{ color: 'var(--bot-bright)' }}>{runningCount} running</span></div>
          <div className="sys-row"><span className="k">Catalysts 72h</span><span className="v">{catRows ?? '—'}</span></div>
          <div className="sys-row"><span className="k">High impact</span><span className="v ok">{cats?.catalysts ? highImpact : '—'}</span></div>
          <div className="sys-row"><span className="k">Calendar</span><span className={`v ${econ?.coverage?.current ? 'ok' : 'warn'}`}>{econ?.coverage?.current ? '● current' : 'stale'}</span></div>
          <div className="sys-row"><span className="k">Last scan</span><span className="v" style={{ display: 'inline-flex', gap: 6 }}><Heartbeat since={conv?.generatedAt ?? null} staleAfterSec={900} /></span></div>
        </div>

        <div className="disclaimer">
          Educational only · not investment advice.<br />
          Automation does not remove risk — it enforces discipline.
        </div>
      </div>

      {/* BARRIER REPLAY — the blocked short drawn on the real chart */}
      {replay && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 88, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center' }} onClick={() => setReplay(null)}>
          <div style={{ width: 'min(860px, 92vw)', background: 'linear-gradient(135deg, var(--panel-solid), var(--panel-2))', border: '1px solid var(--nx-border-hi)', borderRadius: 12, padding: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }} onClick={(ev) => ev.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 16 }}>
                {replay.symbol} · blocked short, replayed
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--text-dim)' }}>
                blocked {new Date(replay.blockedAt).toLocaleString()} · {replay.reason}
              </div>
            </div>
            <NexusPriceChart key={`replay-${replay.symbol}`} symbol={replay.symbol} initialTf="1D" height={340} expandable={false}
              levels={[
                { price: replay.entryPrice, color: '#4fd1c5', label: 'blocked entry' },
                { price: replay.stopLoss, color: '#ff5470', label: 'would-be stop' },
                { price: replay.targetPrice, color: '#3ddc97', label: 'would-be target' },
              ]} />
            <div style={{ marginTop: 10, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--text-dim)' }}>
              Replay verdict: <b style={{ color: replay.outcome === 'hit_target' ? 'var(--red)' : replay.outcome === 'hit_stop' ? 'var(--green)' : 'var(--amber)' }}>
                {replay.outcome === 'hit_target' ? `target touched first — the gate COST ${replay.wouldBePercent?.toFixed(1)}%` : replay.outcome === 'hit_stop' ? `stop touched first — the gate SAVED ${Math.abs(replay.wouldBePercent ?? 0).toFixed(1)}%` : 'neither barrier touched yet — still open'}
              </b> · daily-bar granularity; both-touched ties go to the stop, same rule as live validation.
            </div>
          </div>
        </div>
      )}

      {/* ⌘K */}
      {searchOpen && (
        <div className="search-modal open" onClick={(e) => { if (e.target === e.currentTarget) setSearchOpen(false); }}>
          <div className="search-box">
            <div className="search-input-wrap">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input ref={searchRef} className="search-input" placeholder="Search job, rule, or event…" value={q} onChange={(e) => setQ(e.target.value)} />
              <span className="search-kbd">ESC</span>
            </div>
            <div className="search-results">
              {(['Jobs', 'Rules', 'Recent'] as const).map((g) => {
                const items = searchItems.filter((i) => i.group === g);
                if (!items.length) return null;
                return (
                  <div key={g}>
                    <div className="search-group">{g} · {items.length}</div>
                    {items.map((i) => (
                      <div className="search-item" key={i.id} onClick={() => flash(i.id)}>
                        <div className="search-sym" style={{ fontSize: 11 }}>{i.sym}</div>
                        <div className="search-name">{i.name}</div>
                        <div className="search-price" />
                        <div className={`search-chg ${i.meta === 'running' || i.meta === 'enforced' ? 'up' : ''}`}>{i.meta}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {searchItems.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-mute)', fontSize: 12 }}>No results for "{q}"</div>}
            </div>
            <div className="search-footer">
              <span><kbd>↵</kbd> jump</span>
              <span><kbd>esc</kbd> close</span>
              <span style={{ marginLeft: 'auto', color: 'var(--bot-bright)' }}>{jobs.length} jobs · {RULES.length} rules · {log.length} events</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BotNexus;
