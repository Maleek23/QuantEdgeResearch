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
 * 12:00, 15:55 ET on weekdays; picks ≥ B+ feed the Slate (/slate). (Trade
 * Desk, the old destination, was retired 2026-09-24.)
 *
 * Phase 4: one hero metric (actionable forming setups first), compact
 * pick cards capped at 30 with show-more, a single legend for the jargon,
 * and error states that are distinct from empty states.
 *
 * 2026-09-29: drawn in the page template (components/lux/lux-page.tsx) —
 * header, panels, tags and the track-record table match the Journal.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { QETabs, type QETabItem } from '@/components/ui/qe-tabs';
import { QELegendButton, type LegendSection } from '@/components/ui/qe-legend';
import { useTabState } from '@/hooks/use-tab-state';
import { PageErrorBoundary } from '@/components/page-error-boundary';
import { RefreshCw, Zap, History, Eye } from 'lucide-react';
import { LuxButton, LuxPage, LuxPageHeader, LuxPanel, LuxTableWrap, LuxTag, type LuxTone } from '@/components/lux';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';

type Tab = 'forming' | 'picks' | 'patterns' | 'track';

const TABS: readonly QETabItem<Tab>[] = [
  { id: 'forming',  label: 'Forming',     hint: 'Pre-breakout setups detected this scan cycle' },
  { id: 'picks',    label: 'Picks',       hint: 'Fired picks with letter-grade conviction' },
  { id: 'patterns', label: 'Patterns',    hint: 'The 6 pattern signatures the engine scans for' },
  { id: 'track',    label: 'Track Record', hint: 'Every pick logged with outcome (hit / invalidated / expired)' },
];

const VALID_TABS = TABS.map(t => t.id);

/** Compact cards cap — summary before detail. */
const PICKS_CAP = 30;

export default function RadarPage() {
  const [tab, setTab] = useTabState<Tab>('picks', VALID_TABS);

  // Single page-level fetch for /api/radar/picks — shared by the Picks tab,
  // the Forming tab (filter), and the hero metric. One request, one source
  // of truth, and fetch failure is tracked separately from "empty".
  const [picks, setPicks] = useState<RadarPick[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadPicks = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch('/api/radar/picks?limit=50', { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error(`radar picks ${r.status}`);
        return r.json();
      })
      .then(d => { setPicks(d.picks ?? []); setLoading(false); })
      .catch(() => { setPicks([]); setError(true); setLoading(false); });
  }, []);

  useEffect(() => { loadPicks(); }, [loadPicks]);

  const query: PicksQuery = { picks, loading, error };

  // HERO METRIC — the single most decision-relevant number on a thesis radar
  // is "is there anything actionable right now?". Forming setups are
  // pre-breakout (pattern matched, entry trigger not yet confirmed): the only
  // thing a trader can still act on. Fired picks are history. So the hero is
  // the forming count plus the highest-conviction forming pick; when nothing
  // is forming we fall back to the latest fired pick.
  const hero = useMemo(() => {
    if (loading || !picks) return null;
    const forming = picks.filter(p => p.status === 'forming');
    if (forming.length > 0) {
      const top = [...forming].sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))[0];
      return { kind: 'forming' as const, count: forming.length, symbol: top.symbol, grade: top.finalGrade };
    }
    if (picks.length > 0) {
      const latest = [...picks].sort((a, b) => +new Date(b.firedAt) - +new Date(a.firedAt))[0];
      return { kind: 'latest' as const, count: picks.length, symbol: latest.symbol, grade: latest.finalGrade };
    }
    return { kind: 'empty' as const };
  }, [picks, loading]);

  return (
    <LuxPage>
      <LuxPageHeader
        section="Radar"
        context="6 patterns · ~120 tickers · 5 scans/day"
        title="Thesis Radar"
        purpose={<HeroLine hero={hero} loading={loading} error={error} />}
        actions={<RescanButton onScan={loadPicks} />}
      >
        <QETabs
          items={TABS}
          active={tab}
          onChange={setTab}
          prefixLabel="VIEW"
          rightSlot={
            <QELegendButton
              title="Radar legend"
              description="Radar picks carry a letter grade from the thesis-radar engine. The S/A/B/C conviction bands are what Slate and NEXUS show for the same names."
              sections={RADAR_LEGEND}
              showBands
            />
          }
        />
      </LuxPageHeader>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="lx-panel-sub" style={{ margin: 0 }}>{TABS.find(t => t.id === tab)?.hint}</p>
        <Legend />
      </div>

      <PageErrorBoundary label={`Radar · ${tab}`}>
        {tab === 'forming'  && <FormingTab query={query} />}
        {tab === 'picks'    && <PicksTab query={query} />}
        {tab === 'patterns' && <PatternsTab />}
        {tab === 'track'    && <TrackTab />}
      </PageErrorBoundary>
    </LuxPage>
  );
}

type Hero =
  | { kind: 'forming'; count: number; symbol: string; grade: string }
  | { kind: 'latest'; count: number; symbol: string; grade: string }
  | { kind: 'empty' }
  | null;

function HeroLine({ hero, loading, error }: { hero: Hero; loading: boolean; error: boolean }) {
  if (loading) {
    return <span className="animate-pulse">Reading radar…</span>;
  }
  if (error || !hero) {
    return <span>Couldn't reach the radar API.</span>;
  }
  if (hero.kind === 'forming') {
    return (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <b className="lx-tone-caution">{hero.count} forming</b>
        <span>· top</span>
        <b className="text-foreground" style={{ fontFamily: 'var(--lx-font-data)' }}>{hero.symbol}</b>
        <GradePill grade={hero.grade} />
      </span>
    );
  }
  if (hero.kind === 'latest') {
    return (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <span>Latest pick</span>
        <b className="text-foreground" style={{ fontFamily: 'var(--lx-font-data)' }}>{hero.symbol}</b>
        <GradePill grade={hero.grade} />
        <span>· {hero.count} fired</span>
      </span>
    );
  }
  return <span>No picks on record yet — the next scan will appear here.</span>;
}

// ─── Legend — the one place jargon gets explained ────────────────────

const RADAR_LEGEND: LegendSection[] = [
  {
    heading: 'Radar terms',
    entries: [
      { term: 'Grade', def: 'Letter-grade conviction from the radar engine, A+ highest through D — the coloured chip on every pick.' },
      { term: 'Forming', def: "Pattern matched but the entry trigger hasn't confirmed yet — the actionable watchlist." },
      { term: 'Fired pick', def: 'A setup the engine acted on: entry spot, targets T1/T2, and invalidation (stop).' },
      { term: 'Signals', def: 'The graded inputs behind a pick — each chip shows label + grade, hover for the source.' },
      { term: 'Hit rate', def: 'Share of resolved picks that hit; Avg pct / Avg days are the mean outcome and mean days to resolve.' },
    ],
  },
];

function Legend() {
  return (
    <details className="lx-disclose text-xs text-muted-foreground">
      <summary>Legend — grades, statuses, terms</summary>
      <div className="mt-2 space-y-1.5 max-w-2xl">
        <div>
          <span className="font-bold text-foreground/80">Grade&nbsp;</span>
          letter-grade conviction from the engine, A+ highest through D — the colored chip on every pick.
        </div>
        <div>
          <span className="font-bold text-foreground/80">Forming&nbsp;</span>
          pattern matched but the entry trigger hasn't confirmed yet — the actionable watchlist.
        </div>
        <div>
          <span className="font-bold text-foreground/80">Fired pick&nbsp;</span>
          a setup the engine acted on: entry spot, targets T1/T2, and invalidation (stop).
        </div>
        <div>
          <span className="font-bold text-foreground/80">Signals&nbsp;</span>
          the graded inputs behind a pick — each chip shows label + grade, hover for the source.
        </div>
        <div>
          <span className="font-bold text-foreground/80">Hit rate / Avg pct / Avg days&nbsp;</span>
          track-record columns: share of resolved picks that hit, mean outcome, mean days to resolve.
        </div>
      </div>
    </details>
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

interface PicksQuery {
  picks: RadarPick[] | null;
  loading: boolean;
  error: boolean;
}

function PicksTab({ query }: { query: PicksQuery }) {
  const [showAll, setShowAll] = useState(false);
  const { picks, loading, error } = query;

  if (loading) return <LoadingState label="Loading picks…" />;
  if (error) {
    return (
      <ErrorState
        title="Couldn't load picks"
        message="The radar API didn't respond. This doesn't mean the radar is empty — try the Re-scan button or reload the page."
      />
    );
  }
  if (!picks || picks.length === 0) {
    return (
      <EmptyState
        icon={<Eye aria-hidden />}
        title="No picks fired yet"
        message="Scans run at 09:35, 12:00, 15:55 ET on weekdays. Check back after the next scan, or trigger one manually with the Re-scan button."
      />
    );
  }

  const visible = showAll ? picks : picks.slice(0, PICKS_CAP);
  return (
    <div className="space-y-3">
      {visible.map(p => <PickCard key={p.id} pick={p} />)}
      {picks.length > PICKS_CAP && (
        <LuxButton onClick={() => setShowAll(v => !v)} className="w-full">
          {showAll ? 'Show less' : `Show all ${picks.length} picks`}
        </LuxButton>
      )}
    </div>
  );
}

function PickCard({ pick }: { pick: RadarPick }) {
  const isLong = pick.direction === 'long' || pick.direction === 'long_vol';
  const hasDetail = pick.signals.length > 0 || pick.targets?.t1 || pick.invalidation;
  return (
    <LuxPanel
      as="article"
      headingLevel={3}
      title={<span style={{ fontFamily: 'var(--lx-font-data)' }}>{pick.symbol}</span>}
      sub={<span style={{ fontFamily: 'var(--lx-font-data)' }}>${pick.spotAtFire.toFixed(2)} at fire · {pick.patternId.replace(/_/g, ' ')}</span>}
      meta={
        <>
          <LuxTag tone={isLong ? 'gain' : 'loss'}>{isLong ? '▲ LONG' : '▼ SHORT'}</LuxTag>
          <GradePill grade={pick.finalGrade} />
          {pick.status === 'forming' && <LuxTag tone="caution">FORMING</LuxTag>}
          <span className="lx-panel-sub" style={{ margin: 0, fontFamily: 'var(--lx-font-data)' }}>{new Date(pick.firedAt).toLocaleString()}</span>
        </>
      }
    >
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2" style={{ margin: 0 }}>
        {pick.synthesis}
      </p>

      {hasDetail && (
        <details className="lx-disclose mt-2">
          <summary>
            {pick.signals.length > 0 ? `${pick.signals.length} signals` : 'Details'}
            {(pick.targets?.t1 || pick.invalidation) ? ' · levels' : ''}
          </summary>
          <div className="mt-2 space-y-2">
            {pick.signals.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {pick.signals.map((s, i) => (
                  <LuxTag key={i} title={s.source}>
                    {s.label} <span className="text-muted-foreground">{s.grade}</span>
                  </LuxTag>
                ))}
              </div>
            )}
            {(pick.targets?.t1 || pick.invalidation) && (
              <div className="flex flex-wrap items-center gap-3 text-xs" style={{ fontFamily: 'var(--lx-font-data)' }}>
                {pick.targets?.t1 && <span>T1 <b>${pick.targets.t1.toFixed(2)}</b></span>}
                {pick.targets?.t2 && <span>T2 <b>${pick.targets.t2.toFixed(2)}</b></span>}
                {pick.invalidation && <span className="lx-tone-loss">Stop <b>${pick.invalidation.toFixed(2)}</b></span>}
              </div>
            )}
          </div>
        </details>
      )}
    </LuxPanel>
  );
}

// ─── Forming tab ────────────────────────────────────────────────────

function FormingTab({ query }: { query: PicksQuery }) {
  const { picks, loading, error } = query;
  // Forming is the fired-but-unconfirmed subset of the same picks payload —
  // no second fetch, no divergent state.
  const forming = useMemo(() => (picks ?? []).filter(p => p.status === 'forming'), [picks]);

  if (loading) return <LoadingState label="Loading forming setups…" />;
  if (error) {
    return (
      <ErrorState
        title="Couldn't load forming setups"
        message="The radar API didn't respond. This doesn't mean nothing is forming — try the Re-scan button or reload the page."
      />
    );
  }
  if (forming.length === 0) {
    return (
      <EmptyState
        icon={<Zap aria-hidden />}
        title="No forming setups right now"
        message="This tab watches for patterns that matched but haven't confirmed an entry trigger yet. When one fires, it appears here first — ahead of the Picks tab."
      />
    );
  }
  return <div className="space-y-3">{forming.map(p => <PickCard key={p.id} pick={p} />)}</div>;
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
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch('/api/radar/patterns', { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error(`radar patterns ${r.status}`);
        return r.json();
      })
      .then(d => setPatterns(d.patterns ?? []))
      .catch(() => { setPatterns([]); setError(true); });
  }, []);
  if (!patterns) return <LoadingState label="Loading patterns…" />;
  if (error) {
    return (
      <ErrorState
        title="Couldn't load patterns"
        message="The radar API didn't respond. The 6 pattern signatures are configured server-side — try reloading the page."
      />
    );
  }
  if (patterns.length === 0) {
    return (
      <EmptyState
        icon={<Eye aria-hidden />}
        title="No patterns configured"
        message="The engine didn't return any pattern signatures. If this persists, the scan configuration may need attention."
      />
    );
  }
  return (
    <div className="space-y-3">
      {patterns.map(p => (
        <LuxPanel key={p.id} as="article" headingLevel={3} title={p.name} sub={p.thesis}
          meta={
            <>
              <LuxTag title="Holding horizon">{p.horizon}</LuxTag>
              <LuxTag tone="accent" title="Target hit rate (design goal, not realised)">target {(p.targetHitRate * 100).toFixed(0)}%</LuxTag>
              <LuxTag title="Filters in this signature">{p.filters.length} filters</LuxTag>
            </>
          }
        >
          <details className="lx-disclose">
            <summary>View filters</summary>
            <ul className="mt-2 space-y-1.5 pl-4 text-xs">
              {p.filters.map((f, i) => (
                <li key={i} className="text-muted-foreground">
                  <span className="lx-tone-accent" style={{ fontFamily: 'var(--lx-font-data)' }}>[{f.domain}]</span> {f.explain}
                </li>
              ))}
            </ul>
          </details>
        </LuxPanel>
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
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch('/api/radar/stats', { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error(`radar stats ${r.status}`);
        return r.json();
      })
      .then(d => setStats(d.stats ?? []))
      .catch(() => { setStats([]); setError(true); });
  }, []);
  if (!stats) return <LoadingState label="Loading track record…" />;
  if (error) {
    return (
      <ErrorState
        title="Couldn't load track record"
        message="The radar API didn't respond. Resolved-pick history is stored server-side — try reloading the page."
      />
    );
  }
  if (stats.length === 0) {
    return (
      <EmptyState
        icon={<History aria-hidden />}
        title="No resolved picks yet"
        message="Track record builds as picks fire and the daily resolve cron marks outcomes. Check back after a few weeks of operation."
      />
    );
  }
  return (
    <LuxPanel flush title="Track record by pattern" sub="Resolved picks only — hit rate is hits ÷ resolved; averages are per resolved pick."
      meta={<LuxTag>n={stats.reduce((m, s) => m + s.resolved, 0)} resolved</LuxTag>}>
      <LuxTableWrap label="Radar track record">
        <table>
          <thead>
            <tr>
              <th>Pattern</th>
              <th className="text-right">Picks</th>
              <th className="text-right">Resolved</th>
              <th className="text-right">Hit rate</th>
              <th className="text-right">Avg outcome</th>
              <th className="text-right">Avg days</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(s => (
              <tr key={s.patternId}>
                <td>{s.patternId.replace(/_/g, ' ')}</td>
                <td data-num>{s.totalPicks}</td>
                <td data-num>{s.resolved}</td>
                <td data-num>{(s.hitRate * 100).toFixed(0)}%</td>
                <td data-num className={s.avgOutcomePct > 0 ? 'lx-tone-gain' : s.avgOutcomePct < 0 ? 'lx-tone-loss' : undefined}>
                  {s.avgOutcomePct > 0 ? '+' : s.avgOutcomePct < 0 ? '−' : ''}{Math.abs(s.avgOutcomePct).toFixed(1)}%
                </td>
                <td data-num>{s.avgDaysToResolve.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </LuxTableWrap>
    </LuxPanel>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Letter grade as a tag. Tint by band (A accent · B neutral · C caution ·
 *  D/F loss) — the letter itself is the information. */
function GradePill({ grade }: { grade: string }) {
  const tone: LuxTone =
    grade.startsWith('A') ? 'accent' :
    grade.startsWith('B') ? undefined :
    grade.startsWith('C') ? 'caution' :
    'loss';
  return (
    <LuxTag tone={tone} title={`Conviction grade ${grade} — engine letter grade, A+ highest`}>
      {grade}
    </LuxTag>
  );
}

function LoadingState({ label }: { label: string }) {
  return <QELoading rows={3} label={label} />;
}

function EmptyState({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return <QEEmpty title={title} icon={icon} message={message} />;
}

function ErrorState({ title, message }: { title: string; message?: string }) {
  return (
    <QEError
      title={title}
      message={message ?? "The radar API didn't respond. This doesn't mean the radar is empty — try the Re-scan button or reload the page."}
    />
  );
}

function RescanButton({ onScan }: { onScan?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const handleRescan = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/radar/scan', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      const total = (data.picks ?? []).length;
      setLastResult(`Fired ${total} picks across ${data.summaries?.length ?? 0} patterns`);
      // Refresh page-level data without a full reload
      setTimeout(() => onScan?.(), 1500);
    } catch (e) {
      setLastResult('Scan failed');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      {lastResult && <span className="lx-panel-sub" role="status" style={{ margin: 0 }}>{lastResult}</span>}
      <LuxButton onClick={handleRescan} disabled={loading}>
        <RefreshCw aria-hidden className={loading ? 'animate-spin' : undefined} />
        {loading ? 'Scanning…' : 'Re-scan'}
      </LuxButton>
    </div>
  );
}
