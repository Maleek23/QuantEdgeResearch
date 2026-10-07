/**
 * Track record summary — every number on this card set comes from ONE payload,
 * /api/performance/track-record (shared/track-record.ts computeTrackRecord), so
 * Total Ideas, Hit Rate, expectancy, the engine table, the asset split, the
 * options disclosure and the run-up line all describe the same filtered,
 * post-baseline population. The legacy v1 /api/performance/stats and the
 * engine-health 'flow/quant/ai/lotto' buckets are no longer read here: they used
 * different populations and printed contradictory counts side by side.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, AlertTriangle, Info } from "lucide-react";
import { cn, safeToFixed } from "@/lib/utils";
import { CanonRate } from "@/components/canon";
import type { TrackRecord, TrackRow } from "@shared/track-record";
import type { RunUpSummary } from "@shared/run-up";

export type TrackRecordPayload = TrackRecord & {
  runUp: (RunUpSummary & { reportableRate: number | null; sampleFloor: number; observerSince: string }) | null;
  asOf: string;
};

interface AutoLottoBotPerformance {
  mode?: 'paper';
  range?: { firstClosedAt: string | null; lastClosedAt: string | null };
  overall: { totalTrades: number; wins: number; losses: number; winRate: number; totalPnL: number };
}

export function trackRecordUrl(q: string) {
  return `/api/performance/track-record${q}`;
}

export function useTrackRecord(q: string) {
  return useQuery<TrackRecordPayload>({
    queryKey: ['/api/performance/track-record', q],
    queryFn: async () => {
      const r = await fetch(trackRecordUrl(q), { credentials: 'include' });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    staleTime: 60_000,
  });
}

const signed = (v: number | null | undefined, digits = 1, unit = '') =>
  v == null ? '—' : `${v >= 0 ? '+' : ''}${safeToFixed(v, digits)}${unit}`;
const tone = (v: number | null | undefined) =>
  v == null ? 'text-muted-foreground' : v < 0 ? 'text-[var(--trade-bearish)]' : 'text-[var(--trade-bullish)]';
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '—');

function SampleBadge({ row, floor }: { row: TrackRow; floor: number }) {
  if (row.sample === 'ok') return null;
  return (
    <span className="ml-1 text-[10px] font-mono uppercase text-[var(--trade-neutral)]" title={`Fewer than ${floor} decided — rate not reported`}>
      {row.sample === 'none' ? 'no decided' : `thin n<${floor}`}
    </span>
  );
}

function BreakdownTable({ title, rows, floor, testId }: { title: string; rows: TrackRow[]; floor: number; testId: string }) {
  return (
    <div data-testid={testId}>
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No ideas in this view.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border/40">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-1.5 px-2 font-medium">Source</th>
                <th className="text-right py-1.5 px-2 font-medium">Ideas</th>
                <th className="text-right py-1.5 px-2 font-medium">Decided</th>
                <th className="text-right py-1.5 px-2 font-medium">W / L</th>
                <th className="text-right py-1.5 px-2 font-medium">Win %</th>
                <th className="text-right py-1.5 px-2 font-medium">Avg P&amp;L %</th>
                <th className="text-right py-1.5 px-2 font-medium">Avg R</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border/30 last:border-0">
                  <td className="py-1.5 px-2">{r.label}<SampleBadge row={r} floor={floor} /></td>
                  <td className="py-1.5 px-2 text-right font-mono tabular-nums">{r.total}</td>
                  <td className="py-1.5 px-2 text-right font-mono tabular-nums">{r.decided}</td>
                  <td className="py-1.5 px-2 text-right font-mono tabular-nums">{r.wins}/{r.losses}</td>
                  <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                    {r.winRate != null ? `${safeToFixed(r.winRate, 0)}%` : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className={cn("py-1.5 px-2 text-right font-mono tabular-nums", tone(r.avgPnlPct))}>
                    {signed(r.avgPnlPct, 1, '%')}{r.pnlN ? <span className="text-muted-foreground"> n={r.pnlN}</span> : null}
                  </td>
                  <td className={cn("py-1.5 px-2 text-right font-mono tabular-nums", tone(r.avgR))}>{signed(r.avgR, 2, 'R')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function UserPerformanceSummary({ query = "" }: { query?: string }) {
  const { data: tr, isLoading } = useTrackRecord(query);
  const { data: botData } = useQuery<AutoLottoBotPerformance>({
    queryKey: ["/api/performance/auto-lotto-bot"],
    staleTime: 30000,
  });

  if (isLoading || !tr) {
    // Viewport-tall placeholder (CLS 0.54 measured 2026-09-24 with a short one).
    return (
      <div className="min-h-[100dvh] space-y-6" aria-busy="true">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const h = tr.headline;
  const ru = tr.runUp;
  const floor = tr.sampleFloor;

  return (
    <div className="space-y-6" data-testid="track-record-summary">
      {/* Hero — expectancy first, then the strict hit rate; one population, n beside each. */}
      <Card className="relative overflow-hidden">
        <CardContent className="relative p-6 space-y-4">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <p className="text-xs text-muted-foreground font-mono">
              Published ideas since {tr.since}
              {tr.since !== tr.baseline ? ` (baseline ${tr.baseline})` : ' (honest baseline — earlier outcomes are invalid)'}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono">as of {tr.asOf.slice(11, 16)} UTC</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div data-testid="tr-expectancy">
              <p className="text-xs text-muted-foreground uppercase flex items-center gap-1">
                Expectancy
                <span className="group relative inline-block">
                  <Info className="h-3 w-3 cursor-help" />
                  <span className="invisible group-hover:visible absolute left-1/2 -translate-x-1/2 bottom-full mb-1 w-60 p-2 text-[10px] normal-case bg-popover text-popover-foreground border rounded shadow-lg z-50">
                    Average realised P&amp;L per decided idea — contract % for options, underlying % for stocks.
                    R uses the platform convention: 1R = a 50% premium loss.
                  </span>
                </span>
              </p>
              <p className={cn("text-3xl font-bold font-mono", tone(h.avgPnlPct))}>{signed(h.avgPnlPct, 1, '%')}</p>
              <p className="text-[11px] text-muted-foreground font-mono">
                per idea · n={h.pnlN} · {signed(h.expectancyR, 2, 'R')} avg R (n={h.rSampleSize})
              </p>
            </div>
            <div data-testid="tr-hit-rate">
              <p className="text-xs text-muted-foreground uppercase">Strict hit rate</p>
              <p className="text-3xl font-bold font-mono">{h.winRate != null ? `${safeToFixed(h.winRate, 0)}%` : '—'}</p>
              <p className="text-[11px] text-muted-foreground font-mono">
                {h.wins} of {h.decided} decided{h.winRate == null ? ` · needs ${floor}` : ''}
              </p>
            </div>
            <div data-testid="tr-total">
              <p className="text-xs text-muted-foreground uppercase">Total ideas</p>
              <p className="text-3xl font-bold font-mono text-sky-400">{h.total}</p>
              <p className="text-[11px] text-muted-foreground font-mono">{h.decided} decided · {h.unresolved} open/unresolved</p>
            </div>
            <div data-testid="tr-win-loss-size">
              <p className="text-xs text-muted-foreground uppercase">Avg win / avg loss</p>
              <p className="text-xl font-bold font-mono">
                <span className={tone(h.avgWinPct)}>{signed(h.avgWinPct, 1, '%')}</span>
                <span className="text-muted-foreground"> / </span>
                <span className={tone(h.avgLossPct)}>{signed(h.avgLossPct, 1, '%')}</span>
              </p>
              <p className="text-[11px] text-muted-foreground font-mono">{h.wins}W · {h.losses}L</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Run-up — measured separately, never a win. */}
      <Card data-testid="tr-run-up">
        <CardContent className="p-4 text-xs space-y-1">
          <p className="text-sm font-medium">Run-up after trigger <span className="text-muted-foreground font-normal">— not the win rate</span></p>
          {ru ? (
            <>
              <p className="font-mono">
                {ru.reportableRate != null
                  ? `${safeToFixed(ru.reportableRate, 0)}% reached +5% before stop`
                  : `Not enough triggered ideas yet (${ru.triggered} measured, needs ${ru.sampleFloor})`}
                {' · '}{ru.reached5BeforeStop} of {ru.triggered} triggered · +3%: {ru.reached3} · +10%: {ru.reached10}
                {ru.pending ? ` · ${ru.pending} still being evaluated` : ''}
              </p>
              <p className="text-muted-foreground">
                Trigger observation started {ru.observerSince}; ideas published before then are being back-filled from bars in small batches, so this count grows over the next sessions.
                A +5% touch that wasn't exited there can still lose, so run-up never changes the strict record.
              </p>
            </>
          ) : <p className="text-muted-foreground">Run-up measurement unavailable right now.</p>}
        </CardContent>
      </Card>

      {/* Missed winners — stopped, then T1 inside the hold window. Hindsight beside the record, never in it. */}
      {tr.missedWinners && (
        <Card data-testid="tr-missed-winners">
          <CardContent className="p-4 text-xs space-y-1">
            <p className="text-sm font-medium">Missed winners <span className="text-muted-foreground font-normal">— stopped out, then reached T1 · still counted as losses</span></p>
            <p className="font-mono">
              {tr.missedWinners.laterT1} of {tr.missedWinners.checked} checked stop-outs later reached T1 inside their hold window
              {' · '}{tr.missedWinners.backToEntry} more traded back at entry
              {tr.missedWinners.pending ? ` · ${tr.missedWinners.pending} awaiting their window` : ''}
            </p>
            <p className="text-muted-foreground">
              Measured after the close on the underlying from each idea's own entry, stop and T1. This is what a wider stop would have recovered; the strict hit rate above does not change.
            </p>
          </CardContent>
        </Card>
      )}

      <BreakdownTable title="By engine" rows={tr.engines} floor={floor} testId="tr-engines" />
      <BreakdownTable title="By asset" rows={tr.assets} floor={floor} testId="tr-assets" />
      <p className="text-[11px] text-muted-foreground -mt-3">
        Win % is shown only at {floor}+ decided ideas. Avg R: 1R = a 50% premium loss (stock ideas use the same ÷50 scale, so their R reads small — compare stocks on Avg P&amp;L %).
        Rows add up to the headline.
      </p>

      {/* Options disclosure — counted, with the dates that matter. */}
      <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-500/5 border border-amber-500/20 text-xs text-muted-foreground" data-testid="tr-options-note">
        <AlertTriangle className="h-3.5 w-3.5 text-[var(--trade-neutral)] mt-0.5 shrink-0" />
        <span>
          <strong>Option ideas are included</strong> — {tr.options.total} in this view, {tr.options.decided} decided, {tr.options.unresolved} open or unmeasurable.
          {' '}{tr.options.note}
          {tr.options.pricedAtPass || tr.options.pricedAtTouchBar || tr.options.withheld
            ? ` ${tr.options.pricedAtPass} decided option exits were priced at the tracker pass, ${tr.options.pricedAtTouchBar} at the touch bar, and ${tr.options.withheld} stops had their premium withheld (counted as losses, no P&L).`
            : ''}
        </span>
      </div>

      {/* Auto-Lotto paper bot — separate book, separate population. */}
      {botData && (
        <Card data-testid="tr-paper-bot">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-[var(--trade-neutral)]" />
                <CardTitle className="text-base">Auto-Lotto Bot</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs">Paper trading</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono">
              Simulated fills, not broker orders · closed {day(botData.range?.firstClosedAt)} → {day(botData.range?.lastClosedAt)} · not part of the idea record above
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Closed trades</p>
                <p className="text-xl font-bold font-mono tabular-nums">{botData.overall.totalTrades}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Hit Rate</p>
                <CanonRate className="text-xl" wins={botData.overall.wins} decided={botData.overall.wins + botData.overall.losses} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">W/L</p>
                <p className="font-mono text-lg">
                  <span className="text-[var(--trade-bullish)]">{botData.overall.wins}</span>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-[var(--trade-bearish)]">{botData.overall.losses}</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Paper P&amp;L</p>
                <p className={cn("text-xl font-bold font-mono", tone(botData.overall.totalPnL))}>
                  {botData.overall.totalPnL >= 0 ? '+' : '−'}${safeToFixed(Math.abs(botData.overall.totalPnL), 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-muted/20 border-dashed">
        <CardContent className="p-4 text-sm">
          <p className="font-medium mb-1">How to read this</p>
          <p className="text-muted-foreground">
            Start with expectancy: the average realised result per decided idea. It is the number that says whether following the ideas made or lost money —
            a high hit rate with small wins and large losses still loses, and a modest hit rate with larger wins can be profitable.
            The strict hit rate counts a target, a stop, or a measured close at the end of the idea's window; open ideas and anything that could not be measured stay out and are counted as unresolved.
            Any rate built on fewer than {floor} decided ideas is hidden and flagged as thin — read those rows as counts, not as a verdict.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default UserPerformanceSummary;
