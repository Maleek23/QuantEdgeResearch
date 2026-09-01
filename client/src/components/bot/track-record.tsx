/** Oracle signal-validation ledger. It is deliberately distinct from bot executions. */
import { useQuery } from '@tanstack/react-query';
import { TC } from '@/lib/oracle/trading-colors';
import { StackedBar } from '@/components/viz';

interface OutcomeModel {
  model: string;
  totalPublished: number;
  outcomes: { win: number; loss: number; unresolved: number; decided: number; winRate: number | null };
  coverage: { measured: number; unresolved: number; pctMeasured: number };
  expectancy: { averageR: number | null; sampleSize: number; definition: string };
  bySource: Array<{
    source: string; total: number; win: number; loss: number; unresolved: number;
    decided: number; winRate: number | null; averageR: number | null; rSampleSize: number;
  }>;
  dataQuality: { excludedFromTraining: number; measuredTimeouts: number; unmeasuredTimeouts: number };
}

export function TrackRecord({ className }: { className?: string }) {
  const { data, isLoading, isError } = useQuery<OutcomeModel>({
    queryKey: ['/api/performance/outcome-model'],
    queryFn: async () => {
      const r = await fetch('/api/performance/outcome-model', { credentials: 'include' });
      // The shared preview's SPA fallback returns index.html with HTTP 200 before
      // its Express process has reloaded. Check the media type so that does not
      // masquerade as a successful performance response.
      if (r.ok && r.headers.get('content-type')?.includes('application/json')) return r.json();

      // The terminal hot-reloads in this session while Express belongs to the
      // shared preview process. Keep the new ledger inspectable against the
      // existing V2 endpoint until that process receives the new route.
      const legacy = await fetch('/api/performance/win-rate-compare', { credentials: 'include' });
      if (!legacy.ok) throw new Error('performance failed');
      const previous = await legacy.json();
      return {
        model: 'Outcome model v2',
        totalPublished: previous.totalIdeas,
        outcomes: {
          win: previous.v2.win,
          loss: previous.v2.loss,
          unresolved: previous.v2.unresolved,
          decided: previous.v2.decided,
          winRate: previous.v2.winRate,
        },
        coverage: previous.coverage,
        expectancy: {
          averageR: previous.expectancyR,
          sampleSize: previous.rSampleSize,
          definition: 'Realised P&L divided by the 50% premium-risk convention.',
        },
        bySource: [],
        dataQuality: { excludedFromTraining: 0, measuredTimeouts: 0, unmeasuredTimeouts: 0 },
      } satisfies OutcomeModel;
    },
    staleTime: 600_000, retry: 1,
  });

  if (isLoading) {
    return (
      <div className={`rounded-xl border border-card-border bg-card px-4 py-8 text-center text-label font-mono uppercase tracking-widest text-muted-foreground ${className ?? ''}`}>
        reading track record…
      </div>
    );
  }
  if (isError || !data || !data.totalPublished) {
    return (
      <div className={`rounded-xl border border-card-border bg-card px-4 py-8 text-center ${className ?? ''}`}>
        <div className="text-meta font-mono uppercase tracking-widest text-muted-foreground">No closed trades yet</div>
        <div className="mt-1 text-label font-mono text-muted-foreground">
          A win rate before trades close would be invented.
        </div>
      </div>
    );
  }

  const { outcomes, coverage, expectancy, dataQuality } = data;
  const rPositive = expectancy.averageR !== null && expectancy.averageR >= 0;
  const rColor = expectancy.averageR === null ? TC.muted : rPositive ? TC.bull : TC.bear;
  const coverageWeak = coverage.pctMeasured < 60;

  return (
    <div className={`rounded-xl border border-card-border bg-card overflow-hidden ${className ?? ''}`}>
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
        <div>
          <span className="text-meta font-mono font-bold uppercase tracking-widest text-foreground/80">Oracle signal outcomes</span>
          <p className="mt-0.5 text-label font-mono uppercase tracking-wider text-muted-foreground">
            validation engine · not bot execution
          </p>
        </div>
        <span className="text-label font-mono text-muted-foreground">{data.totalPublished} signals</span>
      </div>

      <div className="grid grid-cols-2 border-b border-border/30">
        <Readout label="Resolved" value={`${coverage.pctMeasured}%`} note={`${coverage.measured} / ${data.totalPublished} outcomes written`} color={coverageWeak ? TC.warn : TC.bull} />
        <Readout
          label="Realised R"
          value={expectancy.averageR === null ? '—' : `${rPositive ? '+' : ''}${expectancy.averageR.toFixed(2)}R`}
          note={`${expectancy.sampleSize} P&L observations`}
          color={rColor}
          edge
        />
      </div>

      <div className="px-4 py-3">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-label font-mono uppercase tracking-wider text-muted-foreground">Outcome of published Oracle signals</span>
          <span className="text-label font-mono tabular-nums text-muted-foreground">
            {outcomes.winRate === null ? '—' : `${outcomes.winRate}%`} of {outcomes.decided} measured
          </span>
        </div>
        <StackedBar
          segments={[
            { value: outcomes.win, color: TC.bull, label: 'wins' },
            { value: outcomes.loss, color: TC.bear, label: 'losses' },
            { value: outcomes.unresolved, color: TC.muted, label: 'unresolved' },
          ]}
        />
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          <Legend color={TC.bull} label="wins" value={outcomes.win} />
          <Legend color={TC.bear} label="losses" value={outcomes.loss} />
          <Legend color={TC.muted} label="unresolved" value={outcomes.unresolved} />
        </div>
        <p className="mt-2 ui-prose text-label leading-snug text-muted-foreground">
          Win means the target was reached or realised P&L was positive. Loss means a stop
          or negative realised P&L. Unresolved is missing evidence — not neutral and not a loss.
        </p>
      </div>

      {data.bySource.length > 0 && (
        <div className="px-4 py-3">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-label font-mono uppercase tracking-wider text-muted-foreground">By publishing engine</span>
            <span className="text-label font-mono text-muted-foreground">same outcome model</span>
          </div>
          <div className="space-y-2">
            {data.bySource.slice(0, 5).map((source) => {
              return (
                <div key={source.source}>
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <span className="text-meta font-mono uppercase tracking-wider text-foreground/85">{source.source}</span>
                    <span className="text-label font-mono tabular-nums text-muted-foreground">
                      {source.winRate === null ? '—' : `${source.winRate}%`} · {source.decided}/{source.total} resolved
                    </span>
                  </div>
                  <div className="mt-1">
                    <StackedBar
                      segments={[
                        { value: source.win, color: TC.bull },
                        { value: source.loss, color: TC.bear },
                        { value: source.unresolved, color: TC.muted },
                      ]}
                      height={6}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {dataQuality.unmeasuredTimeouts > 0 && (
            <p className="mt-3 border-t border-border/30 pt-2 ui-prose text-label leading-snug" style={{ color: TC.warn }}>
              {dataQuality.unmeasuredTimeouts} timed-out signals have no realised P&L. They stay visible
              as unresolved until the collector writes an outcome; they cannot be used to claim an edge.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Readout({ label, value, note, color, edge = false }: { label: string; value: string; note: string; color: string; edge?: boolean }) {
  return (
    <div className={`px-4 py-3 ${edge ? 'border-l border-border/30' : ''}`}>
      <div className="text-label font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lead font-mono font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="mt-0.5 text-label font-mono tabular-nums text-muted-foreground">{note}</div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-label font-mono text-muted-foreground">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label} <span className="tabular-nums text-foreground/80">{value}</span>
    </span>
  );
}
