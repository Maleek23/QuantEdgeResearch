/**
 * ConvictionBacktestCard
 * ======================
 * Calls /api/convictions/backtest and renders the band/source breakdown,
 * top-grade recall, and the engine's blindspots/overpromises. Headline bands
 * use the grade stored at first scoring; ideas without one are shown in a
 * separate table labelled "re-graded with today's engine (look-ahead)".
 * Closed-trade metrics and open marks are never blended. Lets the user
 * answer "is the convictions engine actually picking winners?".
 */

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface BandStats {
  band: "S" | "A" | "B" | "C";
  closed: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgRealizedGain: number | null;
  expectancyR: number | null;
  expectancySampleSize: number;
  unknownOutcome: number;
  unmeasured: number;
  open: number;
  avgUnrealizedGain: number | null;
}

interface SourceStats {
  source: string;
  closed: number;
  winRate: number | null;
  avgRealizedGain: number | null;
  expectancyR: number | null;
  expectancySampleSize: number;
}

interface BacktestRow {
  symbol: string;
  score: number;
  band: string;
  actualPercentGain: number;
  direction: string;
  source: string;
  gradeSource: "stored" | "regraded";
}

interface BacktestReport {
  generatedAt: string;
  lookbackDays: number;
  totalIdeas: number;
  scoredIdeas: number;
  closedCount: number;
  openCount: number;
  unknownOutcomeCount: number;
  unmeasuredCount: number;
  grading: {
    pointInTime: number;
    regraded: number;
    pointInTimeLabel: string;
    lookAheadLabel: string;
  };
  bands: BandStats[];
  regradedBands: BandStats[];
  sources: SourceStats[];
  topGradeRecallPct: number | null;
  blindspots: BacktestRow[];
  overpromises: BacktestRow[];
}

const BAND_COLOR: Record<BandStats["band"], string> = {
  S: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  A: "text-[var(--trade-bullish)] border-emerald-500/40 bg-emerald-500/10",
  B: "text-sky-300 border-sky-500/40 bg-sky-500/10",
  C: "text-rose-300 border-rose-500/40 bg-rose-500/10",
};

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${(n >= 0 ? "+" : "")}${n.toFixed(1)}%`;
}

function rate(n: number | null): string {
  return n == null ? "—" : `${(n * 100).toFixed(0)}%`;
}

function rMult(n: number | null): string {
  return n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}R`;
}

function tone(n: number | null): string {
  if (n == null) return "text-muted-foreground";
  return n >= 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]";
}

function BandTable({ bands, testIdPrefix }: { bands: BandStats[]; testIdPrefix: string }) {
  const ordered: BandStats[] = ["S", "A", "B", "C"]
    .map((b) => bands.find((x) => x.band === b))
    .filter(Boolean) as BandStats[];
  return (
    <div className="rounded-lg border border-foreground/10 overflow-hidden">
      <table className="w-full text-[11px]">
        <thead className="bg-foreground/[0.04] text-[9px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left px-2 py-1.5">Band</th>
            <th className="text-right px-2 py-1.5">Closed</th>
            <th className="text-right px-2 py-1.5">Win %</th>
            <th className="text-right px-2 py-1.5">Avg realized</th>
            <th className="text-right px-2 py-1.5">Expectancy</th>
            <th className="text-right px-2 py-1.5">Open (mark)</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((b) => (
            <tr key={b.band} className="border-t border-foreground/5" data-testid={`${testIdPrefix}-${b.band}`}>
              <td className="px-2 py-1.5">
                <Badge variant="outline" className={`px-1.5 py-0 font-mono font-bold ${BAND_COLOR[b.band]}`}>
                  {b.band}
                </Badge>
              </td>
              <td className="text-right tabular-nums px-2 py-1.5 font-mono">{b.closed}</td>
              <td className="text-right tabular-nums px-2 py-1.5 font-mono">{rate(b.winRate)}</td>
              <td className={`text-right tabular-nums px-2 py-1.5 font-mono ${tone(b.avgRealizedGain)}`}>
                {pct(b.avgRealizedGain)}
              </td>
              <td className={`text-right tabular-nums px-2 py-1.5 font-mono ${tone(b.expectancyR)}`}>
                {rMult(b.expectancyR)}
                <span className="text-muted-foreground"> n={b.expectancySampleSize}</span>
              </td>
              <td className={`text-right tabular-nums px-2 py-1.5 font-mono ${tone(b.avgUnrealizedGain)}`}>
                {b.open > 0 ? `${pct(b.avgUnrealizedGain)} · ${b.open}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ConvictionBacktestCard({
  lookbackDays = 90,
}: {
  lookbackDays?: number;
}) {
  const { data, isLoading, isError } = useQuery<BacktestReport>({
    queryKey: ["/api/convictions/backtest", lookbackDays],
    queryFn: async () => {
      const res = await fetch(
        `/api/convictions/backtest?lookbackDays=${lookbackDays}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000, // server caches 1h
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-xs">Grading {lookbackDays} days of ideas against their outcomes…</span>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-6 text-xs text-muted-foreground">
          Backtest unavailable.
        </CardContent>
      </Card>
    );
  }

  const hasRegraded = data.grading.regraded > 0;

  return (
    <Card data-testid="card-conviction-backtest">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Conviction Engine Backtest</span>
          <span className="text-[10px] font-mono text-muted-foreground">
            {data.scoredIdeas} / {data.totalIdeas} ideas · {data.lookbackDays}d
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Headline */}
        <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Top-grade recall · point-in-time grades
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {data.topGradeRecallPct == null ? "—" : `${data.topGradeRecallPct.toFixed(1)}%`}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Of closed winners, the share graded A or S by the score stored when the engine first
            scored them. Closed trades only; open ideas are marked separately.
          </div>
          <div className="text-[10px] font-mono text-muted-foreground mt-1">
            {data.closedCount} closed measured · {data.openCount} open marked ·{" "}
            {data.unmeasuredCount} expired with no measured exit and {data.unknownOutcomeCount} closed
            with no stored P&amp;L excluded
          </div>
        </div>

        {/* Bands table — point-in-time */}
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
            By Conviction Band · point-in-time ({data.grading.pointInTime} ideas)
          </div>
          <BandTable bands={data.bands} testIdPrefix="backtest-band" />
        </div>

        {/* Bands table — look-ahead re-grade, never blended with the above */}
        {hasRegraded && (
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-amber-300 mb-2">
              By Conviction Band · {data.grading.lookAheadLabel} ({data.grading.regraded} ideas)
            </div>
            <BandTable bands={data.regradedBands} testIdPrefix="backtest-regraded-band" />
          </div>
        )}

        {/* Sources */}
        {data.sources.length > 0 && (
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
              By Source Scanner · closed trades
            </div>
            <div className="rounded-lg border border-foreground/10 overflow-hidden">
              <table className="w-full text-[11px]">
                <thead className="bg-foreground/[0.04] text-[9px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-2 py-1.5">Source</th>
                    <th className="text-right px-2 py-1.5">Closed</th>
                    <th className="text-right px-2 py-1.5">Win %</th>
                    <th className="text-right px-2 py-1.5">Avg realized</th>
                    <th className="text-right px-2 py-1.5">Exp</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sources.slice(0, 10).map((s) => (
                    <tr key={s.source} className="border-t border-foreground/5">
                      <td className="px-2 py-1.5 font-mono uppercase tracking-wider">
                        {s.source.replace(/_/g, " ")}
                      </td>
                      <td className="text-right tabular-nums px-2 py-1.5 font-mono">{s.closed}</td>
                      <td className="text-right tabular-nums px-2 py-1.5 font-mono">{rate(s.winRate)}</td>
                      <td className={`text-right tabular-nums px-2 py-1.5 font-mono ${tone(s.avgRealizedGain)}`}>
                        {pct(s.avgRealizedGain)}
                      </td>
                      <td className={`text-right tabular-nums px-2 py-1.5 font-mono ${tone(s.expectancyR)}`}>
                        {rMult(s.expectancyR)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Blindspots + overpromises */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.blindspots.length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Engine Blindspots (winners we under-graded)
              </div>
              <div className="space-y-1">
                {data.blindspots.slice(0, 5).map((b, i) => (
                  <div
                    key={`${b.symbol}-${i}`}
                    className="flex items-center justify-between text-[10px] px-2 py-1 rounded border border-foreground/10"
                  >
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="font-bold">{b.symbol}</span>
                      <Badge
                        variant="outline"
                        className={`px-1 py-0 text-[9px] ${BAND_COLOR[b.band as BandStats["band"]] ?? ""}`}
                      >
                        {b.band}
                      </Badge>
                      {b.gradeSource === "regraded" && (
                        <span className="text-[9px] text-amber-300" title={data.grading.lookAheadLabel}>
                          look-ahead
                        </span>
                      )}
                    </div>
                    <span
                      className={`font-mono tabular-nums ${
                        b.actualPercentGain >= 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
                      }`}
                    >
                      {pct(b.actualPercentGain)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.overpromises.length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                Engine Overpromises (losers we over-graded)
              </div>
              <div className="space-y-1">
                {data.overpromises.slice(0, 5).map((b, i) => (
                  <div
                    key={`${b.symbol}-${i}`}
                    className="flex items-center justify-between text-[10px] px-2 py-1 rounded border border-foreground/10"
                  >
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="font-bold">{b.symbol}</span>
                      <Badge
                        variant="outline"
                        className={`px-1 py-0 text-[9px] ${BAND_COLOR[b.band as BandStats["band"]] ?? ""}`}
                      >
                        {b.band}
                      </Badge>
                      {b.gradeSource === "regraded" && (
                        <span className="text-[9px] text-amber-300" title={data.grading.lookAheadLabel}>
                          look-ahead
                        </span>
                      )}
                    </div>
                    <span
                      className={`font-mono tabular-nums ${
                        b.actualPercentGain >= 0 ? "text-[var(--trade-bullish)]" : "text-[var(--trade-bearish)]"
                      }`}
                    >
                      {pct(b.actualPercentGain)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
