/**
 * THESIS RADAR — Autonomous Setup Discovery
 *
 * 4 tabs:
 *   FORMING       Pre-breakout setups firing now (live cron output)
 *   PICKS         Recent fired picks with letter-grade conviction
 *   PATTERNS      The 6 pattern signatures we scan with
 *   TRACK RECORD  Every pick logged with hit/miss/expired status
 *
 * The Radar is QuantEdge's autonomous discovery engine — it runs every 09:35,
 * 12:00, 15:55 ET on weekdays and pushes A+ picks straight to Trade Desk.
 */
import { useEffect, useState } from 'react';
import { QETabs, type QETabItem } from '@/components/ui/qe';
import { useTabState } from '@/hooks/use-tab-state';
import { PageErrorBoundary } from '@/components/page-error-boundary';
import { Loader2, RefreshCw, Zap, Target, History, Eye } from 'lucide-react';

type Tab = 'forming' | 'picks' | 'patterns' | 'track';

const TABS: readonly QETabItem<Tab>[] = [
  { id: 'forming',  label: 'Forming',     hint: 'Pre-breakout setups detected this scan cycle' },
  { id: 'picks',    label: 'Picks',       hint: 'Fired picks with letter-grade conviction' },
  { id: 'patterns', label: 'Patterns',    hint: 'The 6 pattern signatures the engine scans for' },
  { id: 'track',    label: 'Track Record', hint: 'Every pick logged with outcome (hit / invalidated / expired)' },
];

const VALID_TABS = TABS.map(t => t.id);

export default function RadarPage() {
  const [tab, setTab] = useTabState<Tab>('picks', VALID_TABS);

  return (
    <div className="space-y-3 px-4 py-3">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-mono font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
            <Target className="h-4 w-4" />
            Thesis Radar
          </h1>
          <p className="text-[11px] font-mono text-muted-foreground/70">
            Autonomous setup discovery — 6 patterns, ~120 tickers, 5 scans/day.
          </p>
        </div>
        <RescanButton />
      </header>

      <QETabs items={TABS} active={tab} onChange={setTab} prefixLabel="VIEW" />

      <div className="text-[9px] font-mono text-muted-foreground/60">
        {TABS.find(t => t.id === tab)?.hint}
      </div>

      <PageErrorBoundary label={`Radar · ${tab}`}>
        {tab === 'forming'  && <FormingTab />}
        {tab === 'picks'    && <PicksTab />}
        {tab === 'patterns' && <PatternsTab />}
        {tab === 'track'    && <TrackTab />}
      </PageErrorBoundary>
    </div>
  );
}

// ─── Picks tab — recent fired picks ────────────────────────────────

interface RadarPick {
  id: string;
  firedAt: string;
  patternId: string;
  symbol: string;
  spotAtFire: number;
  finalGrade: string;
  finalScore: number;
  synthesis: string;
  status: string;
  direction: string;
  signals: { label: string; grade: string; score: number; source: string }[];
  invalidation?: number;
  targets?: { t1?: number; t2?: number; t3?: number };
}

function PicksTab() {
  const [picks, setPicks] = useState<RadarPick[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/radar/picks?limit=50', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (!cancelled) { setPicks(d.picks ?? []); setLoading(false); } })
      .catch(() => { if (!cancelled) { setPicks([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <LoadingState label="Loading picks…" />;
  if (!picks || picks.length === 0) {
    return (
      <EmptyState
        icon={<Eye className="h-8 w-8 text-muted-foreground/60" />}
        title="No picks fired yet"
        message="Cron runs at 09:35, 12:00, 15:55 ET on weekdays. Check back after the next scan, or trigger one manually with the Re-scan button."
      />
    );
  }

  return (
    <div className="space-y-2">
      {picks.map(p => <PickCard key={p.id} pick={p} />)}
    </div>
  );
}

function PickCard({ pick }: { pick: RadarPick }) {
  const isLong = pick.direction === 'long' || pick.direction === 'long_vol';
  return (
    <div className="qe-card border border-border/40 rounded-md p-3 space-y-2 hover:border-primary/30 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="font-mono font-bold text-sm">{pick.symbol}</div>
          <GradePill grade={pick.finalGrade} />
          <div className="text-[10px] font-mono text-muted-foreground/60">
            ${pick.spotAtFire.toFixed(2)} · {pick.patternId.replace(/_/g, ' ')}
          </div>
        </div>
        <div className="text-[10px] font-mono text-muted-foreground/60">
          {new Date(pick.firedAt).toLocaleString()}
        </div>
      </div>

      <p className="text-[11px] font-mono text-muted-foreground/80 leading-relaxed">
        {pick.synthesis}
      </p>

      {pick.signals.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {pick.signals.map((s, i) => (
            <div
              key={i}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/30 border border-border/30"
              title={s.source}
            >
              {s.label} <span className="text-muted-foreground/60">{s.grade}</span>
            </div>
          ))}
        </div>
      )}

      {(pick.targets?.t1 || pick.invalidation) && (
        <div className="flex items-center gap-3 text-[10px] font-mono">
          {pick.targets?.t1 && <span className="text-emerald-500">T1: ${pick.targets.t1.toFixed(2)}</span>}
          {pick.targets?.t2 && <span className="text-emerald-500">T2: ${pick.targets.t2.toFixed(2)}</span>}
          {pick.invalidation && <span className="text-rose-500">Stop: ${pick.invalidation.toFixed(2)}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Forming tab ────────────────────────────────────────────────────

function FormingTab() {
  // Forming is just the most recent fired-but-unconfirmed picks
  const [picks, setPicks] = useState<RadarPick[] | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/api/radar/picks?limit=20', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const forming = (d.picks ?? []).filter((p: RadarPick) => p.status === 'forming');
        setPicks(forming);
        setLoading(false);
      })
      .catch(() => { setPicks([]); setLoading(false); });
  }, []);
  if (loading) return <LoadingState label="Loading forming setups…" />;
  if (!picks || picks.length === 0) {
    return (
      <EmptyState
        icon={<Zap className="h-8 w-8 text-amber-500/40" />}
        title="No forming setups right now"
        message="Forming alerts fire when a pattern matches but hasn't yet confirmed entry trigger."
      />
    );
  }
  return <div className="space-y-2">{picks.map(p => <PickCard key={p.id} pick={p} />)}</div>;
}

// ─── Patterns tab ───────────────────────────────────────────────────

interface Pattern {
  id: string;
  name: string;
  thesis: string;
  horizon: string;
  targetHitRate: number;
  filters: { domain: string; predicate: string; explain: string }[];
  gradedSignals: string[];
}

function PatternsTab() {
  const [patterns, setPatterns] = useState<Pattern[] | null>(null);
  useEffect(() => {
    fetch('/api/radar/patterns', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setPatterns(d.patterns ?? []))
      .catch(() => setPatterns([]));
  }, []);
  if (!patterns) return <LoadingState label="Loading patterns…" />;
  return (
    <div className="space-y-3">
      {patterns.map(p => (
        <div key={p.id} className="qe-card border border-border/40 rounded-md p-4 space-y-3">
          <div>
            <h3 className="font-mono font-bold text-sm uppercase">{p.name}</h3>
            <p className="text-[11px] font-mono text-muted-foreground/70 mt-1">{p.thesis}</p>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <div className="text-muted-foreground/60">
              Horizon: <span className="text-foreground">{p.horizon}</span>
            </div>
            <div className="text-muted-foreground/60">
              Target hit rate: <span className="text-foreground">{(p.targetHitRate * 100).toFixed(0)}%</span>
            </div>
            <div className="text-muted-foreground/60">
              Filters: <span className="text-foreground">{p.filters.length}</span>
            </div>
          </div>
          <details className="text-[10px] font-mono">
            <summary className="cursor-pointer text-primary/80 hover:text-primary">View filters</summary>
            <ul className="mt-2 space-y-1.5 pl-4">
              {p.filters.map((f, i) => (
                <li key={i} className="text-muted-foreground/80">
                  <span className="text-primary/60">[{f.domain}]</span> {f.explain}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ))}
    </div>
  );
}

// ─── Track Record tab ───────────────────────────────────────────────

interface PatternStats {
  patternId: string;
  totalPicks: number;
  resolved: number;
  hits: number;
  hitRate: number;
  avgOutcomePct: number;
  avgDaysToResolve: number;
}

function TrackTab() {
  const [stats, setStats] = useState<PatternStats[] | null>(null);
  useEffect(() => {
    fetch('/api/radar/stats', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setStats(d.stats ?? []))
      .catch(() => setStats([]));
  }, []);
  if (!stats) return <LoadingState label="Loading track record…" />;
  if (stats.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-8 w-8 text-muted-foreground/60" />}
        title="No resolved picks yet"
        message="Track record builds as picks fire and the daily resolve cron marks outcomes. Check back after a few weeks of operation."
      />
    );
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 px-3 py-2 border-b border-border/30">
        <div className="col-span-2">Pattern</div>
        <div>Picks</div>
        <div>Resolved</div>
        <div>Hit Rate</div>
        <div>Avg Pct</div>
        <div>Avg Days</div>
      </div>
      {stats.map(s => (
        <div key={s.patternId} className="grid grid-cols-7 gap-3 text-[11px] font-mono px-3 py-2 hover:bg-muted/20">
          <div className="col-span-2 text-foreground">{s.patternId.replace(/_/g, ' ')}</div>
          <div>{s.totalPicks}</div>
          <div>{s.resolved}</div>
          <div className={s.hitRate >= 0.5 ? 'text-emerald-500' : 'text-rose-500'}>
            {(s.hitRate * 100).toFixed(0)}%
          </div>
          <div className={s.avgOutcomePct >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
            {s.avgOutcomePct >= 0 ? '+' : ''}{s.avgOutcomePct.toFixed(1)}%
          </div>
          <div>{s.avgDaysToResolve.toFixed(1)}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function GradePill({ grade }: { grade: string }) {
  const color =
    grade.startsWith('A') ? 'bg-emerald-500/15 text-emerald-500' :
    grade.startsWith('B') ? 'bg-blue-500/15 text-blue-500' :
    grade.startsWith('C') ? 'bg-amber-500/15 text-amber-500' :
    'bg-rose-500/15 text-rose-500';
  return (
    <div className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${color}`}>
      {grade}
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-[11px] font-mono text-muted-foreground/60">
      <Loader2 className="h-4 w-4 animate-spin mr-2" />
      {label}
    </div>
  );
}

function EmptyState({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
      {icon}
      <div className="font-mono text-sm text-foreground">{title}</div>
      <div className="font-mono text-[10px] text-muted-foreground/60 max-w-md">{message}</div>
    </div>
  );
}

function RescanButton() {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const handleRescan = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/radar/scan', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      const total = (data.picks ?? []).length;
      setLastResult(`Fired ${total} picks across ${data.summaries?.length ?? 0} patterns`);
      // Reload page-level data after a moment
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setLastResult('Scan failed');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      {lastResult && <div className="text-[10px] font-mono text-muted-foreground/60">{lastResult}</div>}
      <button
        onClick={handleRescan}
        disabled={loading}
        className="text-[10px] font-mono px-3 py-1.5 rounded border border-border/40 hover:border-primary/40 hover:bg-muted/30 flex items-center gap-2 disabled:opacity-50"
      >
        <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        Re-scan
      </button>
    </div>
  );
}
