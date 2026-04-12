/**
 * Conviction Backtest — replays past trade ideas through the current
 * convictions engine and shows whether higher bands actually win more.
 *
 * The headline question this page answers:
 *   "If the engine I'm running today had been the one grading my past
 *    ideas, would the bands actually correlate with realized P&L?"
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Target,
  AlertTriangle,
  Award,
} from "lucide-react";
import { cn, safeToFixed } from "@/lib/utils";

interface BandStats {
  band: "S" | "A" | "B" | "C";
  count: number;
  closed: number;
  open: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPercentGain: number;
  avgRealizedGain: number;
  avgUnrealizedGain: number;
  expectancyR: number;
}

interface SourceStats {
  source: string;
  count: number;
  winRate: number;
  avgPercentGain: number;
  expectancyR: number;
}

interface BacktestReport {
  generatedAt: string;
  lookbackDays: number;
  totalIdeas: number;
  scoredIdeas: number;
  closedCount: number;
  openCount: number;
  bands: BandStats[];
  sources: SourceStats[];
  topGradeRecallPct: number;
  blindspots: Array<{
    symbol: string;
    score: number;
    band: string;
    actualPercentGain: number;
    direction: string;
    source: string;
  }>;
  overpromises: Array<{
    symbol: string;
    score: number;
    band: string;
    actualPercentGain: number;
    direction: string;
    source: string;
  }>;
}

const BAND_COLORS: Record<string, string> = {
  S: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  A: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  B: "bg-sky-500/20 text-sky-400 border-sky-500/40",
  C: "bg-amber-500/20 text-amber-400 border-amber-500/40",
};

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return (
    <div className="w-full bg-muted/30 rounded h-2 overflow-hidden">
      <div className={cn("h-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function ConvictionBacktestPage() {
  const [lookbackDays, setLookbackDays] = useState(90);

  const { data, isLoading, refetch, isFetching } = useQuery<BacktestReport>({
    queryKey: ["/api/convictions/backtest", lookbackDays],
    queryFn: async () => {
      const r = await fetch(`/api/convictions/backtest?lookbackDays=${lookbackDays}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to load backtest");
      return r.json();
    },
    staleTime: 60 * 60 * 1000,
  });

  const maxBandWinRate = data ? Math.max(...data.bands.map((b) => b.winRate)) : 1;
  const maxSourceExpectancy = data
    ? Math.max(0.01, ...data.sources.map((s) => Math.abs(s.expectancyR)))
    : 1;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <Activity className="w-6 h-6 text-purple-400" />
            <h1 className="text-3xl font-bold text-foreground">Conviction Engine Backtest</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Replays past trade ideas through today's scoring engine to validate that
            higher bands actually correlate with realized P&L.
          </p>
        </motion.div>

        {/* Controls */}
        <Card className="bg-card/60 border-border p-4 mb-6">
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Lookback window</label>
              <Select value={String(lookbackDays)} onValueChange={(v) => setLookbackDays(Number(v))}>
                <SelectTrigger className="w-44 bg-muted/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="60">Last 60 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 180 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => refetch()}
              disabled={isFetching}
              variant="outline"
              className="border-border"
            >
              <RefreshCw className={cn("w-4 h-4 mr-1", isFetching && "animate-spin")} />
              {isFetching ? "Replaying..." : "Re-run"}
            </Button>
          </div>
        </Card>

        {isLoading && (
          <Card className="bg-card/60 border-border p-12 text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-purple-400 mb-4" />
            <p className="text-muted-foreground">Replaying ideas through the current engine...</p>
            <p className="text-xs text-muted-foreground mt-2">First run can take 30-60 seconds.</p>
          </Card>
        )}

        {data && (
          <>
            {/* Headline summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card className="bg-card/60 border-border p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase mb-1">
                  <Target className="w-3 h-3" />
                  Top-grade recall
                </div>
                <div className="text-3xl font-bold text-purple-400">
                  {safeToFixed(data.topGradeRecallPct, 0)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  of actual winners would have been graded A or S
                </p>
              </Card>
              <Card className="bg-card/60 border-border p-4">
                <div className="text-xs text-muted-foreground uppercase mb-1">Total ideas</div>
                <div className="text-3xl font-bold text-foreground">{data.totalIdeas}</div>
                <p className="text-xs text-muted-foreground mt-1">over {data.lookbackDays} days</p>
              </Card>
              <Card className="bg-card/60 border-border p-4">
                <div className="text-xs text-muted-foreground uppercase mb-1">Scored</div>
                <div className="text-3xl font-bold text-foreground">{data.scoredIdeas}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  closed: {data.closedCount} · open: {data.openCount}
                </p>
              </Card>
              <Card className="bg-card/60 border-border p-4">
                <div className="text-xs text-muted-foreground uppercase mb-1">As of</div>
                <div className="text-sm font-mono text-foreground">
                  {new Date(data.generatedAt).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Cached for 1 hour</p>
              </Card>
            </div>

            {/* Per-band table */}
            <Card className="bg-card/60 border-border overflow-hidden mb-6">
              <div className="p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">Per-Band Outcomes</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  If the engine is calibrated, S &gt; A &gt; B &gt; C in win rate AND expectancy.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-xs uppercase">Band</TableHead>
                    <TableHead className="text-xs uppercase text-right">Count</TableHead>
                    <TableHead className="text-xs uppercase text-right">Closed</TableHead>
                    <TableHead className="text-xs uppercase text-right">Open</TableHead>
                    <TableHead className="text-xs uppercase text-right">Wins</TableHead>
                    <TableHead className="text-xs uppercase text-right">Losses</TableHead>
                    <TableHead className="text-xs uppercase text-right">Win Rate</TableHead>
                    <TableHead className="text-xs uppercase text-right">Avg %</TableHead>
                    <TableHead className="text-xs uppercase text-right">Expectancy R</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.bands.map((b) => (
                    <TableRow key={b.band} className="border-border">
                      <TableCell>
                        <Badge variant="outline" className={cn("border", BAND_COLORS[b.band])}>
                          {b.band}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{b.count}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {b.closed}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {b.open}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-400">
                        {b.wins}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-rose-400">
                        {b.losses}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="w-12">{safeToFixed(b.winRate * 100, 0)}%</span>
                          <div className="w-16">
                            <Bar
                              value={b.winRate}
                              max={maxBandWinRate}
                              color="bg-purple-500"
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          b.avgPercentGain >= 0 ? "text-emerald-400" : "text-rose-400",
                        )}
                      >
                        {b.avgPercentGain >= 0 ? "+" : ""}
                        {safeToFixed(b.avgPercentGain, 1)}%
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums font-bold",
                          b.expectancyR >= 0 ? "text-emerald-400" : "text-rose-400",
                        )}
                      >
                        {b.expectancyR >= 0 ? "+" : ""}
                        {safeToFixed(b.expectancyR, 2)}R
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {/* Per-source */}
            <Card className="bg-card/60 border-border overflow-hidden mb-6">
              <div className="p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">Per-Scanner Source</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Which idea engines actually generate winners.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-xs uppercase">Source</TableHead>
                    <TableHead className="text-xs uppercase text-right">Count</TableHead>
                    <TableHead className="text-xs uppercase text-right">Win Rate</TableHead>
                    <TableHead className="text-xs uppercase text-right">Avg %</TableHead>
                    <TableHead className="text-xs uppercase text-right">Expectancy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sources.map((s) => (
                    <TableRow key={s.source} className="border-border">
                      <TableCell className="font-mono text-sm">{s.source}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {safeToFixed(s.winRate * 100, 0)}%
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          s.avgPercentGain >= 0 ? "text-emerald-400" : "text-rose-400",
                        )}
                      >
                        {s.avgPercentGain >= 0 ? "+" : ""}
                        {safeToFixed(s.avgPercentGain, 1)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div className="flex items-center gap-2 justify-end">
                          <span
                            className={cn(
                              "w-14 font-bold",
                              s.expectancyR >= 0 ? "text-emerald-400" : "text-rose-400",
                            )}
                          >
                            {s.expectancyR >= 0 ? "+" : ""}
                            {safeToFixed(s.expectancyR, 2)}R
                          </span>
                          <div className="w-20">
                            <Bar
                              value={s.expectancyR}
                              max={maxSourceExpectancy}
                              color={s.expectancyR >= 0 ? "bg-emerald-500" : "bg-rose-500"}
                            />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {/* Blind spots + overpromises */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-card/60 border-border overflow-hidden">
                <div className="p-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-400" />
                    <h2 className="text-lg font-semibold text-foreground">Blind Spots</h2>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Actual winners the engine graded too low.
                  </p>
                </div>
                <Table>
                  <TableBody>
                    {data.blindspots.length === 0 ? (
                      <TableRow>
                        <TableCell className="text-center text-muted-foreground p-6">
                          No blind spots — engine is catching the winners.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.blindspots.map((b, i) => (
                        <TableRow key={i} className="border-border">
                          <TableCell className="font-bold">{b.symbol}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("border", BAND_COLORS[b.band])}>
                              {b.band}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-emerald-400 tabular-nums text-right">
                            +{safeToFixed(b.actualPercentGain, 1)}%
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{b.source}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>

              <Card className="bg-card/60 border-border overflow-hidden">
                <div className="p-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-400" />
                    <h2 className="text-lg font-semibold text-foreground">Overpromises</h2>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Actual losers the engine graded as A or S.
                  </p>
                </div>
                <Table>
                  <TableBody>
                    {data.overpromises.length === 0 ? (
                      <TableRow>
                        <TableCell className="text-center text-muted-foreground p-6">
                          No overpromises — high-band picks are winning.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.overpromises.map((b, i) => (
                        <TableRow key={i} className="border-border">
                          <TableCell className="font-bold">{b.symbol}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("border", BAND_COLORS[b.band])}>
                              {b.band}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-rose-400 tabular-nums text-right">
                            {safeToFixed(b.actualPercentGain, 1)}%
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{b.source}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
