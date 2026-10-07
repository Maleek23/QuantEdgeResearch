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
import { gradeOfLoosePick, formatNexusGrade } from '@/components/canon/nexus-grade';
import { useMemo, useRef, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useColResize } from '@/lib/use-col-resize';
import { openWorkup } from '@/lib/workup-bus';
import { QEChart } from '@/components/charting/qe-chart';
import { Heartbeat } from '@/components/viz';
import { PhoneNote } from '@/components/ui/qe-phone';
import { useBotLedger, useQuantBotStatus, type BotPositionView } from '@/lib/bot/use-bot-status';
import { fmtMoney, runRecords, toTrade, type RunRecord } from '@/lib/journal/metrics';
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
interface OutcomePayload {
  model?: string;
  totalPublished?: number;
  outcomes?: { win: number; loss: number; unresolved: number; decided: number; winRate: number | null };
  coverage?: { measured: number; unresolved: number; pctMeasured: number };
  expectancy?: { averageR: number | null; sampleSize: number; definition?: string };
  dataQuality?: { excludedFromTraining?: number; measuredTimeouts?: number; unmeasuredTimeouts?: number };
  diagnostics?: {
    byDirection?: OutcomeSlice[]; byHorizon?: OutcomeSlice[]; bySource?: OutcomeSlice[]; warning?: string;
  };
  asOf?: string;
}
interface OutcomeSlice { name: string; decided: number; win: number; loss: number; unresolved: number; coverage: number; winRate: number | null; averageR: number | null; sampleSize: number }
/** One labelled, run-aware shape for the bot's positions (lib/bot/use-bot-status.ts). */
type PaperPosition = BotPositionView;

/**
 * Where the position sits between its barriers, as a fraction 0..1
 * (0 = at the stop, 1 = at the target). Null when the geometry is unusable.
 * For option positions every input is CONTRACT PREMIUM — consistent space.
 */
function barrierProgress(p: PaperPosition): number | null {
  const stop = Number(p.stopLoss), tgt = Number(p.targetPrice), now = Number(p.currentPrice ?? p.entryPrice);
  if (!(Number.isFinite(stop) && Number.isFinite(tgt) && Number.isFinite(now)) || tgt === stop) return null;
  return Math.max(0, Math.min(1, (now - stop) / (tgt - stop)));
}
interface LedgerEntry { symbol: string; blockedAt: string; entryPrice: number; stopLoss: number; targetPrice: number; reason: string; outcome?: string; wouldBePercent?: number | null; lastPrice?: number }
interface LedgerPayload { totalBlocked?: number; decided?: number; blockedWinners?: number; blockedLosers?: number; netWouldBePercent?: number; entries?: LedgerEntry[] }
interface CryptoPulse { asOf?: string }
interface RealtimePayload { coinbase?: { connected?: boolean }; futures?: { connected?: boolean } }

const MIN_N = 30; // shared/constants MIN_REPORTABLE_SAMPLE

const fetchJson = (url: string) => async () => {
  const r = await fetch(url, { credentials: 'include' });
  // user-facing: say what happened, not which endpoint (the path is plumbing)
  if (!r.ok) throw new Error(`The server answered HTTP ${r.status}.`);
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

/**
 * One section of the board, rendered alone (dashboard tools — see
 * components/dashboard/tools/bot). Omit for the full classic board.
 */
export type BotSection =
  | 'stats' | 'jobs' | 'book' | 'history' | 'ledger' | 'rules' | 'log'
  | 'queue' | 'outcomes' | 'status';

type BotFeed = 'conv' | 'flow' | 'leaps' | 'econ' | 'cats' | 'outcomes' | 'pulse' | 'realtime' | 'ledger' | 'book' | 'record';
const JOB_FEEDS: BotFeed[] = ['conv', 'flow', 'leaps', 'econ', 'cats', 'pulse', 'realtime'];
/** Which feeds each section reads — a lone section only polls what it shows. */
const SECTION_FEEDS: Record<BotSection, BotFeed[]> = {
  stats: [...JOB_FEEDS, 'outcomes'],
  jobs: JOB_FEEDS,
  book: ['book'],
  // The record reads the journal's Bot-book rows (every run) through metrics.ts.
  history: ['record'],
  ledger: ['ledger'],
  rules: [],
  log: ['conv', 'cats'],
  queue: ['econ'],
  outcomes: ['outcomes'],
  status: [...JOB_FEEDS, 'outcomes'],
};

/**
 * Every feed the board reads, with the board's own query keys — so N section
 * tools on one dashboard share one request per feed. `only` disables the feeds
 * a lone section never shows; no argument = the full board (all feeds on).
 */
export function useBotFeeds(only?: BotSection) {
  const on = (f: BotFeed) => !only || SECTION_FEEDS[only].includes(f);
  const conv = useQuery<ConvictionsPayload>({ queryKey: ['/api/convictions', 'bot'], queryFn: fetchJson('/api/convictions?limit=12'), refetchInterval: 120_000, staleTime: 60_000, retry: 1, enabled: on('conv') });
  const flow = useQuery<FlowPayload>({ queryKey: ['/api/options-flow', 'bot'], queryFn: fetchJson('/api/options-flow?limit=50'), refetchInterval: 180_000, staleTime: 120_000, retry: 1, enabled: on('flow') });
  const leaps = useQuery<LeapsPayload>({ queryKey: ['/api/leap-tracker', 'bot'], queryFn: fetchJson('/api/leap-tracker'), refetchInterval: 600_000, staleTime: 300_000, retry: 1, enabled: on('leaps') });
  const econ = useQuery<EconPayload>({ queryKey: ['/api/economic-calendar', 'bot'], queryFn: fetchJson('/api/economic-calendar'), refetchInterval: 600_000, staleTime: 300_000, retry: 1, enabled: on('econ') });
  const cats = useQuery<CatalystsRecent>({ queryKey: ['/api/catalysts/recent', 'bot'], queryFn: fetchJson('/api/catalysts/recent'), refetchInterval: 300_000, staleTime: 120_000, retry: 1, enabled: on('cats') });
  // Outcome model v2 is the only ledger that carries unresolved coverage next
  // to the result. The legacy /performance/stats mixes incompatible outcome
  // definitions and must not power a user-facing win-rate claim (SR 11-7 P0-1/2).
  const outcomes = useQuery<OutcomePayload>({ queryKey: ['/api/performance/outcome-model', 'bot'], queryFn: fetchJson('/api/performance/outcome-model'), refetchInterval: 600_000, staleTime: 300_000, retry: 1, enabled: on('outcomes') });
  const pulse = useQuery<CryptoPulse>({ queryKey: ['/api/crypto/pulse', 'bot'], queryFn: fetchJson('/api/crypto/pulse'), refetchInterval: 300_000, staleTime: 120_000, retry: 1, enabled: on('pulse') });
  const realtime = useQuery<RealtimePayload>({ queryKey: ['/api/realtime-status', 'bot'], queryFn: fetchJson('/api/realtime-status'), refetchInterval: 30_000, staleTime: 20_000, retry: 1, enabled: on('realtime') });
  const ledger = useQuery<LedgerPayload>({ queryKey: ['/api/discipline/ledger', 'bot'], queryFn: fetchJson('/api/discipline/ledger'), refetchInterval: 600_000, staleTime: 300_000, retry: 1, enabled: on('ledger') });
  // One shared status query for every surface (no per-component key/interval).
  const book = useQuantBotStatus(on('book'));
  const record = useBotLedger(on('record'));
  return { conv, flow, leaps, econ, cats, outcomes, pulse, realtime, ledger, book, record };
}
export type BotFeeds = ReturnType<typeof useBotFeeds>;

export function BotNexus({ only }: { only?: BotSection } = {}) {
  const rail = useColResize('nx-bot-side', 320, { sign: -1, min: 240, max: 520 });
  const [ruleTab, setRuleTab] = useState<'all' | 'gates' | 'signals' | 'disclosure'>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const [replay, setReplay] = useState<LedgerEntry | null>(null);
  // The ⤢ expand for a LIVE position: underlying chart + the position's
  // premium-space barriers. Distinct from the row click, which opens the workup.
  const [expandPos, setExpandPos] = useState<PaperPosition | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const feeds = useBotFeeds(only);
  const conv = feeds.conv.data;
  const flow = feeds.flow.data;
  const leaps = feeds.leaps.data;
  const econ = feeds.econ.data;
  const cats = feeds.cats.data;
  const outcomes = feeds.outcomes.data;
  const pulse = feeds.pulse.data;
  const realtime = feeds.realtime.data;
  const ledger = feeds.ledger.data;
  const book = feeds.book.data;
  const ledgerRows = feeds.record.data?.trades;
  const botRuns = feeds.record.data?.journal?.runs ?? [];
  const [runPick, setRunPick] = useState<string>('');
  const record = useMemo(() => {
    const trades = (ledgerRows ?? []).map(toTrade);
    const all = runRecords(trades);
    const inView = runPick ? trades.filter((t) => t.row.runId === runPick) : trades;
    const closedInView = inView
      .filter((t) => t.status !== 'open')
      .sort((a, b) => Date.parse(b.closedAt ?? '') - Date.parse(a.closedAt ?? ''));
    const measured = closedInView.filter((t) => t.assetType === 'option' && t.row.measurementStatus === 'verified');
    const verifiedWins = measured.filter((t) => t.netPnl > 0).length;
    const verifiedLosses = measured.filter((t) => t.netPnl < 0).length;
    const unverifiedOptions = closedInView.filter((t) => t.assetType === 'option' && t.row.measurementStatus !== 'verified').length;
    const sel: RunRecord = runPick ? all.runs.find((r) => r.runId === runPick) ?? all.combined : all.combined;
    return { all, sel, closedInView, measurement: { measured: measured.length, wins: verifiedWins, losses: verifiedLosses, decided: verifiedWins + verifiedLosses, winRate: verifiedWins + verifiedLosses ? verifiedWins / (verifiedWins + verifiedLosses) : null, unverified: unverifiedOptions } };
  }, [ledgerRows, runPick]);

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
      const g = gradeOfLoosePick(p as any);
      rows.push({
        time: t ?? '', job: 'Conviction', sym: p.symbol,
        action: <><b>idea published</b> · {g ? `NEXUS ${formatNexusGrade(g)}` : 'ungraded'} · {(p.direction ?? 'long').toUpperCase()}{p.tradeType ? ` · ${p.tradeType}` : ''}</>,
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
  const observed = outcomes?.outcomes;
  const coverage = outcomes?.coverage?.pctMeasured ?? 0;
  // Sample size alone is not enough. Until outcome coverage is substantially
  // complete and point-in-time replay is rebuilt, the percentage is diagnostic,
  // not a validated performance claim.
  const reportable = (observed?.decided ?? 0) >= MIN_N && coverage >= 80;
  const diagnosticSlices = [
    ...(outcomes?.diagnostics?.byDirection ?? []).map((row) => ({ ...row, dimension: 'side' })),
    ...(outcomes?.diagnostics?.byHorizon ?? []).map((row) => ({ ...row, dimension: 'horizon' })),
    ...(outcomes?.diagnostics?.bySource ?? []).map((row) => ({ ...row, dimension: 'source' })),
  ].filter((row) => row.decided >= 20 && row.averageR != null)
    .sort((a, b) => (b.averageR ?? -99) - (a.averageR ?? -99));
  const strongestSlice = diagnosticSlices[0];
  const weakestSlice = diagnosticSlices[diagnosticSlices.length - 1];

  /* ── ⌘K over jobs / rules / log symbols ── */
  useEffect(() => {
    // A lone section (dashboard tool) never claims the global ⌘K — the classic
    // board tool keeps it.
    if (only) return;
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
  }, [only]);

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

  /* ── sections — one const each, so a dashboard tool can render just one ── */
  const statsEl = (
    <>
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
          <div className="stat-label">Observed outcomes</div>
          {reportable ? (
            <>
              <div className="stat-val green">{observed!.winRate?.toFixed(0)}%</div>
              <div className="stat-sub">{observed!.win}W–{observed!.loss}L · {coverage.toFixed(0)}% coverage</div>
            </>
          ) : (
            <>
              <div className="stat-val amber">VALIDATION HOLD</div>
              <div className="stat-sub">{observed?.win ?? 0}W–{observed?.loss ?? 0}L observed · {coverage.toFixed(0)}% coverage</div>
            </>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-label">Next macro release</div>
          <div className="stat-val amber">{nextRelease?.name ?? '—'}</div>
          <div className="stat-sub">{nextRelease ? `${nextRelease.date === today ? 'today' : nextRelease.date}${nextRelease.time ? ` · ${nextRelease.time}` : ''}` : 'calendar empty'}</div>
        </div>
      </div>
    </>
  );
  const jobsEl = (
    <>
      {/* ACTIVE BOTS = the real jobs */}
      <div className="bots-section">
        <div className="bots-head">
          <div className="bots-label">Background jobs · status from output freshness</div>
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
              {/* what the job does: one line on desktop (full text on hover), one tap on phones */}
              <PhoneNote label="What it does" className="bot-desc-note"><span className="bot-desc-text" title={j.desc}>{j.desc}</span></PhoneNote>
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
    </>
  );
  const runsStatus = book?.runs ?? [];
  const activeRun = runsStatus.find((r) => r.active);
  const openByRun = runsStatus
    .map((r) => ({ r, pos: (book?.openPositions ?? []).filter((p) => p.runId === r.id) }))
    .filter((x) => x.pos.length || x.r.active);
  const bookEl = (
    <>
      {/* PAPER BOOK — what the bot is actually holding, in every run */}
      <div className="book-section">
        <div className="book-head">
          {/* the section title already says "Quantinum Bot Paper Book" */}
          <div className="book-label">{activeRun ? `Trading ${activeRun.label}` : 'No run trading'}</div>
          <div className="book-meta">
            {activeRun ? (
              <>
                <span title="cash + open positions at their last marks, computed at read">Value <b>{fmtMoney(activeRun.totalValue, { signed: false })}</b></span>
                <span>Cash <b>{fmtMoney(activeRun.cashBalance, { signed: false })}</b></span>
                <span>P&L <b style={{ color: activeRun.totalValue - activeRun.startingCapital >= 0 ? `var(--green)` : `var(--red)` }}>{fmtMoney(activeRun.totalValue - activeRun.startingCapital)} ({(((activeRun.totalValue - activeRun.startingCapital) / activeRun.startingCapital) * 100).toFixed(2)}%)</b></span>
              </>
            ) : <span>—</span>}
            {book?.sleeves
              ? <span title="Two sleeves, separate capacity: 0DTE/1DTE index + mega-cap (09:35–11:30 ET, −40% / +50% breakeven / +100%, flat 15:45) and swing (top NEXUS grade)">0DTE {book.sleeves['0dte']?.held ?? 0}/{book.sleeves['0dte']?.max ?? '—'} · swing {book.sleeves.swing?.held ?? 0}/{book.sleeves.swing?.max ?? '—'} · swing min grade {String(book.sleeves.swing?.minGrade ?? '—')}</span>
              : <span>max {book?.config?.maxOpen ?? `—`} · {book?.config?.riskPerTradePct ?? `—`}%/trade</span>}
            <span title={book?.lastCycle?.error ?? ''}>last cycle {book?.lastCycle ? `${fmtAge(ageMin(book.lastCycle.at))} (${book.lastCycle.origin}${book.lastCycle.role ? ` · ROLE=${book.lastCycle.role}` : ''}) · ${book.lastCycle.opened} opened · ${book.lastCycle.skipped ?? 0} skipped${book.lastCycle.error ? ` · ${book.lastCycle.error}` : ''}` : 'none seen'}</span>
          </div>
          {book?.lastCycle?.skipSummary && book.lastCycle.skipSummary.total > 0 && (
            <div className="book-meta" style={{ padding: '4px 0 0', flexWrap: 'wrap' }} aria-label="Why the last cycle skipped candidates">
              <span style={{ color: 'var(--text-mute)' }}>skips by reason:</span>
              {Object.entries(book.lastCycle.skipSummary.byReason).sort((a, b) => b[1] - a[1]).map(([code, n]) => (
                <span key={code} title={Object.entries(book.lastCycle!.skipSummary!.bySleeve).map(([s, m]) => m[code] ? `${s} ${m[code]}` : '').filter(Boolean).join(' · ')}>{code.replaceAll('_', ' ')} <b>{n}</b></span>
              ))}
              {book.lastCycle.skipSummary.top.length > 0 && (
                <span style={{ width: '100%', color: 'var(--text-dim)' }}>best refused: {book.lastCycle.skipSummary.top.map((t) => `${t.symbol} (${t.sleeve}) ${t.code.replaceAll('_', ' ')} — ${t.reason}`).join(' | ')}</span>
              )}
            </div>
          )}
        </div>
        {openByRun.map(({ r, pos }) => (
          <div key={r.id}>
            <div className="book-meta" style={{ padding: '6px 12px 2px', opacity: 0.9 }} title={`portfolio "${r.displayName}" · ${r.id}`}>
              {/* the trading run is named in the book head — only a retired run needs its label here */}
              {!r.active && <span><b>{r.label}</b> · retired, not managed</span>}
              {/* the trading run's value / cash are in the book head right above — print only its open count */}
              <span>{r.active ? `${r.open} open at marks` : <>value {fmtMoney(r.totalValue, { signed: false })} = cash {fmtMoney(r.cashBalance, { signed: false })} + {r.open} open at marks</>}</span>
              {r.oldestMarkAt && <span>oldest mark {fmtAge(ageMin(r.oldestMarkAt))}</span>}
              {r.unmarked > 0 && <span style={{ color: 'var(--amber)' }}>{r.unmarked} never marked (at cost)</span>}
            </div>
            {pos.map((p) => {
              const marked = !p.unmarked && p.unrealizedPnLPercent != null;
              const pnl = p.unrealizedPnLPercent ?? 0;
              const up = pnl >= 0;
              const stale = (p.markAgeMin ?? 0) > 24 * 60;
              const contract = p.assetType === `option` && p.strikePrice != null
                ? `$` + p.strikePrice + (p.optionType ?? `c`).charAt(0).toUpperCase() + ` ` + (p.expiryDate ? new Date(p.expiryDate + 'T12:00:00Z').toLocaleDateString([], { month: `short`, day: `numeric` }) : ``) + ` · ` + (p.quantity ?? 1) + `x @ $` + p.entryPrice
                : (p.quantity ?? 1) + `x @ $` + p.entryPrice;
              const prog = barrierProgress(p);
              const entryFrac = (() => {
                const s0 = Number(p.stopLoss), t = Number(p.targetPrice);
                if (!(Number.isFinite(s0) && Number.isFinite(t)) || t === s0) return null;
                return Math.max(0, Math.min(1, (Number(p.entryPrice) - s0) / (t - s0)));
              })();
              return (
                <div className="book-pos" key={p.id} style={{ [`--pos-accent` as string]: !marked ? `var(--text-mute)` : up ? `var(--green)` : `var(--red)`, flexWrap: 'wrap' }} onClick={() => openWorkup(p.symbol)} title="Open the ticker workup">
                  <div>
                    <div className="bp-sym">{p.symbol}</div>
                    <div className="bp-contract">{contract}</div>
                  </div>
                  <div className="bp-brackets">
                    {p.targetPrice != null && <span className="t">T ${p.targetPrice}</span>}
                    {p.stopLoss != null && <span className="s">S ${p.stopLoss}</span>}
                    {p.useTrailingStop && <span className="tr">trail {p.trailingStopPercent ?? `—`}%</span>}
                  </div>
                  <div className="bp-kv" title={p.lastPriceUpdate ? `marked ${new Date(p.lastPriceUpdate).toLocaleString()}` : 'never marked'}>mark<b>{marked && p.currentPrice != null ? `$` + p.currentPrice : `—`}</b><small style={{ color: stale ? 'var(--amber)' : 'var(--text-mute)' }}>{p.markAgeMin != null ? fmtAge(p.markAgeMin) : 'no mark'}</small></div>
                  <div className="bp-kv">held<b>{p.entryTime ? Math.max(0, Math.round((Date.now() - Date.parse(p.entryTime)) / 86_400_000)) + `d` : `—`}</b></div>
                  <div className={!marked ? `bp-pnl` : up ? `bp-pnl up` : `bp-pnl down`}>{marked ? `${up ? `+` : ``}${pnl.toFixed(1)}%` : `—`}</div>
                  <div className="bp-kv">unreal. $<b style={{ color: !marked ? 'var(--text-mute)' : up ? `var(--green)` : `var(--red)` }}>{marked && p.unrealizedPnL != null ? `${p.unrealizedPnL >= 0 ? `+` : ``}${Math.round(p.unrealizedPnL)}` : `—`}</b></div>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); setExpandPos(p); }}
                    title="Expand — chart + where price sits between the barriers"
                    style={{ padding: '3px 8px', borderRadius: 3, background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.25)', color: 'var(--bot-bright)', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-10, 10px)', fontWeight: 700 }}
                  >⤢</button>
                  {prog != null && marked && (
                    <div style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }} title={`stop $${p.stopLoss} ── entry $${p.entryPrice} ── target $${p.targetPrice} · mark $${p.currentPrice ?? '—'}${p.assetType === 'option' ? ' (contract premium)' : ''}`}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-9, 8px)', color: 'var(--red)' }}>S</span>
                      <div style={{ position: 'relative', flex: 1, height: 5, borderRadius: 3, background: 'linear-gradient(90deg, rgba(255,107,61,0.35), rgba(148,163,184,0.12) 40%, rgba(110,231,183,0.35))' }}>
                        {entryFrac != null && <div style={{ position: 'absolute', left: `${entryFrac * 100}%`, top: -2, width: 1.5, height: 9, background: 'var(--text-dim)' }} title="entry" />}
                        <div style={{ position: 'absolute', left: `calc(${prog * 100}% - 4px)`, top: -1.5, width: 8, height: 8, borderRadius: '50%', background: up ? 'var(--green)' : 'var(--red)', boxShadow: `0 0 6px ${up ? 'var(--green)' : 'var(--red)'}` }} title={`mark $${p.currentPrice ?? '—'}`} />
                      </div>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-9, 8px)', color: 'var(--green)' }}>T</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, color: 'var(--text-mute)', minWidth: 58, textAlign: 'right' }}>{(prog * 100).toFixed(0)}% to T</span>
                    </div>
                  )}
                </div>
              );
            })}
            {pos.length === 0 && r.active && (
              <div className="book-empty">Flat — {r.label} holds nothing. 0DTE sleeve: index/mega-cap 0–2 DTE ideas 09:35–11:30 ET; swing sleeve: top NEXUS grade (≥ {String(book?.sleeves?.swing?.minGrade ?? '—')}). See "skips by reason" above for why nothing filled.</div>
            )}
          </div>
        ))}
        {!runsStatus.length && <div className="book-empty">No bot portfolio yet.</div>}
      </div>
    </>
  );
  const recRow = (r: RunRecord, label: string, title?: string) => {
    const reportable = r.closed >= MIN_N;
    return (
      <tr key={label} title={title}>
        <td style={{ padding: '3px 8px 3px 0' }}>{label}</td>
        <td style={{ textAlign: 'right', padding: '3px 8px' }}>{r.closed}</td>
        <td style={{ textAlign: 'right', padding: '3px 8px' }}><b style={{ color: 'var(--green)' }}>{r.wins}W</b>–<b style={{ color: 'var(--red)' }}>{r.closed - r.wins}L</b></td>
        <td style={{ textAlign: 'right', padding: '3px 8px' }} title={reportable ? '' : `withheld: n=${r.closed} < ${MIN_N}`}>{r.winRate == null ? '—' : reportable ? `${(r.winRate * 100).toFixed(0)}%` : <span style={{ color: 'var(--text-mute)' }}>n&lt;{MIN_N}</span>}</td>
        <td style={{ textAlign: 'right', padding: '3px 8px', color: r.netPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtMoney(r.netPnl)}</td>
        <td style={{ textAlign: 'right', padding: '3px 0 3px 8px', color: 'var(--text-mute)' }}>{r.open ? `${r.open} open${r.unrealized != null ? ` · ${fmtMoney(r.unrealized)} unreal.` : ''}` : '—'}</td>
      </tr>
    );
  };
  const historyEl = (
    <>
      {/* TRACK RECORD — every run, the journal's Bot-book rows through metrics.ts */}
      <div className="book-section">
        <div className="book-head">
          <div className="book-label">Track record · closed positions · every run</div>
          <div className="book-meta">
            <select value={runPick} onChange={(e) => setRunPick(e.target.value)} aria-label="Bot run"
              style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--nx-border)', borderRadius: 3, fontFamily: 'inherit', fontSize: 'inherit', padding: '1px 4px' }}>
              <option value="">All {botRuns.length} runs · combined</option>
              {botRuns.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <span>
              n={record.sel.closed} closed · {runPick ? (botRuns.find((r) => r.id === runPick)?.short ?? 'run') : `all ${botRuns.length} runs`}
            </span>
            <span>realized <b style={{ color: record.sel.netPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtMoney(record.sel.netPnl)}</b></span>
            <span title="Only option outcomes with saved fresh entry ask and exit bid (or exact intrinsic expiry settlement), timestamps, and P&L reconciliation count here.">quote-audited <b>{record.measurement.wins}W–{record.measurement.losses}L</b> · n={record.measurement.decided} · {record.measurement.winRate == null ? 'rate unavailable' : `${(record.measurement.winRate * 100).toFixed(1)}%`}</span>
          </div>
        </div>
        <div style={{ padding: '6px 12px 10px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-10, 10px)' }}>
            <thead>
              <tr style={{ color: 'var(--text-mute)', textAlign: 'right' }}>
                <th style={{ textAlign: 'left', fontWeight: 500 }}>Run</th><th style={{ fontWeight: 500 }}>n closed</th><th style={{ fontWeight: 500 }}>Ledger W–L</th><th style={{ fontWeight: 500 }}>Ledger rate</th><th style={{ fontWeight: 500 }}>Realized</th><th style={{ fontWeight: 500 }}>Open</th>
              </tr>
            </thead>
            <tbody>
              {record.all.runs.map((r) => {
                const info = botRuns.find((x) => x.id === r.runId);
                return recRow(r, `${r.key}${info?.active ? ' · trading' : ''}`, info ? `portfolio "${info.displayName}"` : undefined);
              })}
              {record.all.runs.length > 1 && recRow(record.all.combined, `Combined · all ${record.all.runs.length} runs`)}
            </tbody>
          </table>
          <div style={{ marginTop: 5, color: 'var(--text-dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-9, 9px)' }}>
            Ledger W–L uses every realized paper result. Quote-audited W–L requires a reconciled fresh entry ask and exit bid, or exact intrinsic settlement; {record.measurement.unverified} closed option outcomes are unverified and excluded from that rate. Open P&L is unrealized at the last mark, never counted as realized.
          </div>
        </div>
        {record.closedInView.slice(0, 40).map((t) => {
          const c = t.row;
          const pnl = t.netPnl;
          const won = pnl > 0;
          const flat = Math.abs(pnl) < 0.005;
          const pct = c.realizedPnLPercent ?? null;
          const contract = c.assetType === 'option' && c.strikePrice != null
            ? `$${c.strikePrice}${(c.optionType ?? 'c').charAt(0).toUpperCase()} ${c.expiryDate ? new Date(String(c.expiryDate).slice(0, 10) + 'T12:00:00Z').toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''} · ${c.quantity ?? 1}x`
            : `${c.quantity ?? 1}x`;
          const reason = (/Exit: (.*)/.exec(c.notes ?? '')?.[1] ?? '').replace(/_/g, ' ') || '—';
          return (
            <div className="book-pos" key={c.id} style={{ ['--pos-accent' as string]: flat ? 'var(--text-mute)' : won ? 'var(--green)' : 'var(--red)' }} onClick={() => openWorkup(c.symbol)} title={`${c.runLabel ?? ''} · open the ticker workup`}>
              <div>
                <div className="bp-sym">{c.symbol}</div>
                <div className="bp-contract">{contract}{c.runLabel ? ` · ${c.runLabel.split(' · ')[0]}` : ''}</div>
              </div>
              <div className="bp-kv">in<b>${c.entryPrice}</b></div>
              <div className="bp-kv">out<b>{c.exitPrice != null ? `$${c.exitPrice}` : '—'}</b></div>
              <div className="bp-kv" style={{ minWidth: 110 }} title={`exit reason: ${reason}${c.measurementNote ? ` · measurement: ${c.measurementNote}` : ''}`}>why<b style={{ textTransform: 'lowercase' }}>{reason.slice(0, 22)}</b></div>
              {c.assetType === 'option' && <div className="bp-kv" title={c.measurementNote ?? undefined}>measurement<b style={{ color: c.measurementStatus === 'verified' ? 'var(--green)' : 'var(--amber)' }}>{c.measurementStatus ?? 'unverified'}</b></div>}
              <div className={won ? 'bp-pnl up' : flat ? 'bp-pnl' : 'bp-pnl down'}>
                {pnl >= 0 ? '+' : ''}${Math.round(pnl)}{pct != null ? ` · ${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%` : ''}
              </div>
              <div className="bp-kv">closed<b>{t.closedAt ? new Date(t.closedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'}</b></div>
            </div>
          );
        })}
        {record.closedInView.length > 40 && <div className="book-empty">Newest 40 of {record.closedInView.length} shown — the journal's Bot book lists all.</div>}
        {record.closedInView.length === 0 && (
          <div className="book-empty">No closed trades {runPick ? 'in this run' : 'yet'} — history fills as barriers and expiries decide positions.</div>
        )}
      </div>
    </>
  );
  const ledgerEl = (
    <>
      {/* SHADOW LEDGER — what the short gate blocked, replayed on real bars */}
      <div className="book-section">
        <div className="book-head">
          {/* as a dashboard tool the section title already names it */}
          {!only && <div className="book-label" style={{ color: 'var(--amber)' }}>Shadow ledger · what the gate blocked</div>}
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
                <button onClick={() => setReplay(e2)} style={{ padding: '3px 9px', borderRadius: 3, background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.25)', color: 'var(--bot-bright)', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-9, 9px)', fontWeight: 700, letterSpacing: 0.5 }}>REPLAY</button>
              </div>
              <div className="bp-kv" />
            </div>
          );
        })}
        {(ledger?.entries ?? []).length === 0 && <div className="book-empty">No blocks recorded yet — entries appear the first time the gate refuses a short.</div>}
      </div>
    </>
  );
  const rulesEl = (
    <>
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
                <td><div className="rule-size"><span className="pct" style={{ fontSize: 'var(--fs-10, 10px)' }}>{r.file}</span></div></td>
                <td><div className="rule-toggle on locked" title="Enforced in code — not a switch. Change it in the file, ship it through review." /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
  const logEl = (
    <>
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
    </>
  );
  const queueEl = (
    <>
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
    </>
  );
  const outcomesEl = (
    <>
      {/* PERFORMANCE — observed outcomes with the unresolved population visible */}
      <div className="perf">
        {!only && (
          <div className="perf-head">
            <div className="perf-label">Outcome integrity · SR 11-7 control</div>
          </div>
        )}
        <div className="perf-chart" style={{ display: 'grid', placeItems: 'center' }}>
          {/* No daily P&L series is tracked — a curve here would be a random walk. */}
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-9, 9px)', fontStyle: 'italic', color: 'var(--text-mute)', textAlign: 'center', padding: '0 10px' }}>
            {reportable ? 'OBSERVED LEDGER — coverage gate passed' : 'VALIDATION HOLD — not a performance claim'}<br />
            {coverage.toFixed(0)}% measured · {outcomes?.coverage?.unresolved ?? '—'} unresolved
          </div>
        </div>
        <div className="perf-stats">
          <div className="perf-stat">
            <div className="perf-stat-k">Win rate</div>
            <div className={`perf-stat-v ${reportable ? 'green' : ''}`} style={reportable ? undefined : { color: 'var(--amber)' }}>{reportable ? `${observed!.winRate?.toFixed(0)}%` : 'withheld'}</div>
          </div>
          <div className="perf-stat">
            <div className="perf-stat-k">Observed W – L</div>
            <div className="perf-stat-v bot">{observed ? `${observed.win}–${observed.loss}` : '—'}</div>
          </div>
          <div className="perf-stat">
            <div className="perf-stat-k">Coverage</div>
            <div className="perf-stat-v">{coverage.toFixed(0)}%</div>
          </div>
        </div>
        {(strongestSlice || weakestSlice) && (
          <div style={{ borderTop: '1px solid var(--nx-border)', padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-9, 9px)' }}>
            {strongestSlice && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--text-mute)' }}><span>best observed · {strongestSlice.dimension}/{strongestSlice.name}</span><b style={{ color: (strongestSlice.averageR ?? 0) >= 0 ? 'var(--green)' : 'var(--amber)' }}>{strongestSlice.averageR! >= 0 ? '+' : ''}{strongestSlice.averageR!.toFixed(3)}R · n={strongestSlice.decided}</b></div>}
            {weakestSlice && weakestSlice !== strongestSlice && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 5, color: 'var(--text-mute)' }}><span>largest drag · {weakestSlice.dimension}/{weakestSlice.name}</span><b style={{ color: 'var(--red)' }}>{weakestSlice.averageR!.toFixed(3)}R · n={weakestSlice.decided}</b></div>}
            <div style={{ marginTop: 6, lineHeight: 1.45, color: 'var(--text-dim)' }}>Descriptive only · use a later out-of-sample window before changing gates.</div>
          </div>
        )}
      </div>
    </>
  );
  const statusEl = (
    <>
      {/* SAFEGUARDS — the honest list */}
      <div className="safeguards">
        <div className="safeguards-head">
          <div className="safeguards-label">Standing safeguards</div>
        </div>
        <div className="safeguard-list">
          <div className="safeguard-item"><span className="safeguard-name">Short gate · event required</span><span className="safeguard-val" style={{ color: 'var(--green)' }}>enforced <span className="check">✓</span></span></div>
          <div className="safeguard-item"><span className="safeguard-name">Catalyst bar · impact high</span><span className="safeguard-val" style={{ color: 'var(--green)' }}>enforced <span className="check">✓</span></span></div>
          <div className="safeguard-item"><span className="safeguard-name">Sample floor · n ≥ {MIN_N}</span><span className="safeguard-val" style={{ color: 'var(--green)' }}>enforced <span className="check">✓</span></span></div>
          <div className="safeguard-item"><span className="safeguard-name">Outcome coverage · ≥ 80%</span><span className="safeguard-val" style={{ color: reportable ? 'var(--green)' : 'var(--amber)' }}>{reportable ? 'passed' : `${coverage.toFixed(0)}% · hold`}</span></div>
          <div className="safeguard-item"><span className="safeguard-name">Legacy win-rate claims</span><span className="safeguard-val" style={{ color: 'var(--amber)' }}>withheld pending validation</span></div>
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
        <span className="qp-phone-only">Educational only · not investment advice.<br /></span>{/* ≥768px: the frame bottom bar says it */}
        Paper trading — simulated fills, no real money. Simulated results have limits and past performance does not guarantee future results.<br />
        Automation does not remove risk — it enforces discipline.
      </div>
    </>
  );
  const replayEl = (
    <>
      {/* BARRIER REPLAY — the blocked short drawn on the real chart */}
      {replay && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 88, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center' }} onClick={() => setReplay(null)}>
          <div style={{ width: 'min(860px, 92vw)', background: 'linear-gradient(135deg, var(--panel-solid), var(--panel-2))', border: '1px solid var(--nx-border-hi)', borderRadius: 12, padding: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }} onClick={(ev) => ev.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 16 }}>
                {replay.symbol} · blocked short, replayed
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-10, 10px)', color: 'var(--text-dim)' }}>
                blocked {new Date(replay.blockedAt).toLocaleString()} · {replay.reason}
              </div>
            </div>
            <QEChart key={`replay-${replay.symbol}`} symbol={replay.symbol} initialTf="1D" height={380} live={false}
              levels={[
                { price: replay.entryPrice, color: 'accent', label: 'blocked entry' },
                { price: replay.stopLoss, color: 'loss', label: 'would-be stop' },
                { price: replay.targetPrice, color: 'gain', label: 'would-be target' },
              ]} />
            <div style={{ marginTop: 10, fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-10, 10px)', color: 'var(--text-dim)' }}>
              Replay verdict: <b style={{ color: replay.outcome === 'hit_target' ? 'var(--red)' : replay.outcome === 'hit_stop' ? 'var(--green)' : 'var(--amber)' }}>
                {replay.outcome === 'hit_target' ? `target touched first — the gate COST ${replay.wouldBePercent?.toFixed(1)}%` : replay.outcome === 'hit_stop' ? `stop touched first — the gate SAVED ${Math.abs(replay.wouldBePercent ?? 0).toFixed(1)}%` : 'neither barrier touched yet — still open'}
              </b> · daily-bar granularity; both-touched ties go to the stop, same rule as live validation.
            </div>
          </div>
        </div>
      )}
    </>
  );
  const expandEl = (
    <>
      {/* POSITION EXPAND — the underlying's chart plus the position's own barriers */}
      {expandPos && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 88, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center' }} onClick={() => setExpandPos(null)}>
          <div style={{ width: 'min(860px, 92vw)', background: 'linear-gradient(135deg, var(--panel-solid), var(--panel-2))', border: '1px solid var(--nx-border-hi)', borderRadius: 12, padding: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }} onClick={(ev) => ev.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 16 }}>
                {expandPos.symbol} · live position
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-10, 10px)', color: 'var(--text-dim)' }}>
                {expandPos.assetType === 'option' && expandPos.strikePrice != null
                  ? `$${expandPos.strikePrice}${(expandPos.optionType ?? 'c').charAt(0).toUpperCase()} · ${expandPos.quantity ?? 1}x · opened ${expandPos.entryTime ? new Date(expandPos.entryTime).toLocaleDateString() : '—'}`
                  : `${expandPos.quantity ?? 1}x · opened ${expandPos.entryTime ? new Date(expandPos.entryTime).toLocaleDateString() : '—'}`}
              </div>
            </div>
            {/* Chart shows the UNDERLYING. Option barriers are premium-space and
                cannot honestly be drawn on a share chart — so the chart carries
                the strike (a real underlying level) and the barrier rail below
                stays in the contract's own units. */}
            <QEChart key={`expand-${expandPos.id}`} symbol={expandPos.symbol} initialTf="1D" height={380}
              levels={expandPos.assetType === 'option' && expandPos.strikePrice != null
                ? [{ price: expandPos.strikePrice, color: 'caution', label: `strike $${expandPos.strikePrice}` }]
                : [
                    { price: Number(expandPos.entryPrice), color: 'accent', label: 'entry' },
                    ...(expandPos.stopLoss != null ? [{ price: Number(expandPos.stopLoss), color: 'loss', label: 'stop' }] : []),
                    ...(expandPos.targetPrice != null ? [{ price: Number(expandPos.targetPrice), color: 'gain', label: 'target' }] : []),
                  ]} />
            <div style={{ marginTop: 12 }}>
              {(() => {
                const prog = barrierProgress(expandPos);
                const pnl = expandPos.unrealizedPnLPercent ?? 0;
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-10, 10px)', marginBottom: 6 }}>
                      <span style={{ color: 'var(--red)' }}>stop ${expandPos.stopLoss ?? '—'}</span>
                      <span style={{ color: 'var(--text-dim)' }}>entry ${expandPos.entryPrice} → mark ${expandPos.currentPrice ?? '—'}{expandPos.assetType === 'option' ? ' (premium)' : ''} · {expandPos.unrealizedPnL == null ? <b>P&L unknown — no mark</b> : <b style={{ color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}% · {expandPos.unrealizedPnL >= 0 ? '+' : ''}${Math.round(expandPos.unrealizedPnL)}</b>}{expandPos.markAgeMin != null ? ` · mark ${fmtAge(expandPos.markAgeMin)}` : ''}</span>
                      <span style={{ color: 'var(--green)' }}>target ${expandPos.targetPrice ?? '—'}</span>
                    </div>
                    {prog != null && (
                      <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'linear-gradient(90deg, rgba(255,107,61,0.35), rgba(148,163,184,0.12) 40%, rgba(110,231,183,0.35))' }}>
                        <div style={{ position: 'absolute', left: `calc(${prog * 100}% - 5px)`, top: -2, width: 12, height: 12, borderRadius: '50%', background: pnl >= 0 ? 'var(--green)' : 'var(--red)', boxShadow: `0 0 8px ${pnl >= 0 ? 'var(--green)' : 'var(--red)'}` }} />
                      </div>
                    )}
                    <div style={{ marginTop: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 'var(--fs-9, 9px)', color: 'var(--text-mute)' }}>
                      {prog != null ? `${(prog * 100).toFixed(0)}% of the way from stop to target` : 'barrier geometry unavailable'} · barriers checked every bot cycle{expandPos.useTrailingStop ? ` · trailing ${expandPos.trailingStopPercent ?? '—'}%` : ''} · click-out to close
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
  const searchEl = (
    <>
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
    </>
  );

  if (only) {
    const el = { stats: statsEl, jobs: jobsEl, book: bookEl, history: historyEl, ledger: ledgerEl, rules: rulesEl, log: logEl, queue: queueEl, outcomes: outcomesEl, status: statusEl }[only];
    return (
      <div className={`botlab bot-only bot-only-${only}`}>
        {el}
        {replayEl}
        {expandEl}
      </div>
    );
  }

  return (
    <div className="botlab">
      <div className={`nx-resize${rail.dragging ? ' active' : ''}`} style={{ right: rail.width - 4 }} title="Drag to resize · double-click to expand" {...rail.handleProps} />

      {/* ══════════ BOT AREA ══════════ */}
      <div className="col bot-area" style={{ ['--nx-side' as string]: `${rail.width}px` }}>
        <div className="bot-header">
          <div className="bot-eyebrow">Automation</div>
          <div className="bot-title-row"><div className="bot-title">QUANTINUM BOT</div></div>
          <div className="bot-desc">
            Quantinum Bot trades NEXUS's published ideas on paper — with the platform's real automation layer: <b>scanner jobs</b>, <b>hard gates</b> and <b>ingest crons</b>, reported from their own output.
            No broker is connected — nothing here places orders. Discipline is enforced in code, not clicked on.
          </div>
          <div className="bot-meta">
            <span className="tag bot">{runningCount}/{jobs.length} jobs running</span>
            <span className="tag live"><span className="dot" />{RULES.length} rules enforced</span>
            <span className="tag mute">no broker · signals only</span>
          </div>
        </div>

        {statsEl}

        {jobsEl}

        {bookEl}

        {historyEl}

        {ledgerEl}

        {rulesEl}

        {logEl}
      </div>

      {/* ══════════ RIGHT SIDEBAR ══════════ */}
      <div className="col col-right" style={{ width: rail.width, minWidth: rail.width }}>
        <div className="sec-head">
          <div className="sec-num" style={{ color: 'var(--bot-bright)', textShadow: '0 0 8px rgba(56,189,248,0.4)' }}>Automation</div>
          <div className="sec-title" style={{ background: 'linear-gradient(135deg,#fff,var(--bot-bright))', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Discipline, running.</div>
          <div className="sec-sub">The jobs and gates that keep the terminal honest — reported from their own output, not a claimed status.</div>
          <div className="sec-meta">
            <span className="tag bot">QUANTINUM BOT</span>
            <span className="tag live"><span className="dot" />engaged</span>
          </div>
        </div>

        {queueEl}

        {outcomesEl}

        {statusEl}
      </div>

      {replayEl}

      {expandEl}

      {searchEl}
    </div>
  );
}

export default BotNexus;
