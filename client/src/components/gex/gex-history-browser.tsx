/**
 * GEX History Browser — scroll through historical gamma exposure
 * snapshots for any date the archiver has captured.
 *
 * Shows a date picker + timeline of hourly snapshots, with the
 * full GEX profile (levels, heatmap, regime) for each snapshot.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Activity,
  Loader2,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

interface GexHistorySnapshot {
  id: number;
  spotPrice: number;
  flipPoint: number | null;
  callWall: number | null;
  putWall: number | null;
  flipDistancePct: number | null;
  regime: string | null;
  vexRegime: string | null;
  netGexSign: string | null;
  totalGex: number | null;
  maxGammaStrike: number | null;
  topLevels: Array<{
    strike: number;
    gex: number;
    gammaPct: number;
    role: string;
  }> | null;
  heatmapData: Array<{
    strike: number;
    intensity: number;
    gex: number;
    side: string;
  }> | null;
  snapshotAt: string;
  marketSession: string | null;
  dataGrade: string | null;
}

interface HistoryResponse {
  symbol: string;
  date: string;
  snapshots: GexHistorySnapshot[];
  count: number;
  message?: string;
}

interface DatesResponse {
  symbol: string;
  dates: string[];
  count: number;
}

export function GexHistoryBrowser({ symbol }: { symbol: string }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSnapshotIdx, setSelectedSnapshotIdx] = useState(0);

  // Fetch available dates
  const datesQuery = useQuery<DatesResponse>({
    queryKey: ['/api/gex-history', symbol, 'dates'],
    queryFn: async () => {
      const res = await fetch(`/api/gex-history/${symbol}/dates`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch dates');
      return res.json();
    },
    staleTime: 300_000, // 5 min
  });

  // Fetch snapshots for selected date
  const snapshotsQuery = useQuery<HistoryResponse>({
    queryKey: ['/api/gex-history', symbol, selectedDate],
    queryFn: async () => {
      const res = await fetch(`/api/gex-history/${symbol}/${selectedDate}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch snapshots');
      return res.json();
    },
    enabled: !!selectedDate,
    staleTime: 300_000,
  });

  const dates = datesQuery.data?.dates || [];
  const snapshots = snapshotsQuery.data?.snapshots || [];
  const activeSnapshot = snapshots[selectedSnapshotIdx] || null;
  const hasDates = dates.length > 0;

  // Navigate dates
  const currentDateIdx = selectedDate ? dates.indexOf(selectedDate) : -1;
  const goToPrevDate = () => {
    if (currentDateIdx < dates.length - 1) {
      setSelectedDate(dates[currentDateIdx + 1]);
      setSelectedSnapshotIdx(0);
    }
  };
  const goToNextDate = () => {
    if (currentDateIdx > 0) {
      setSelectedDate(dates[currentDateIdx - 1]);
      setSelectedSnapshotIdx(0);
    }
  };

  const formatDate = (d: string) => {
    const date = new Date(d + 'T12:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
    });
  };

  const regimeColor = (regime: string | null) => {
    if (regime === 'positive_gamma') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    if (regime === 'negative_gamma') return 'text-red-400 bg-red-500/10 border-red-500/30';
    if (regime === 'transitioning') return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return 'text-muted-foreground bg-muted/10 border-border';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-400">
            GEX TIME MACHINE
          </h3>
          <p className="text-[9px] text-muted-foreground font-mono mt-0.5">
            Browse historical gamma exposure by date
          </p>
        </div>
        {hasDates && (
          <span className="text-[9px] font-mono text-muted-foreground">
            {dates.length} date{dates.length !== 1 ? 's' : ''} archived
          </span>
        )}
      </div>

      {!hasDates && !datesQuery.isLoading ? (
        /* Empty state — no history yet */
        <div className="rounded-lg border border-dashed border-cyan-500/30 bg-cyan-500/5 p-6 text-center space-y-2">
          <Activity className="w-8 h-8 text-cyan-400 mx-auto opacity-50" />
          <div className="text-sm font-medium text-foreground/80">
            No GEX history yet for {symbol}
          </div>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Historical GEX archiving is now active. Hourly snapshots are being saved during market hours.
            Check back after the next trading session to browse {symbol}'s gamma exposure over time.
          </p>
          <div className="flex items-center justify-center gap-4 pt-2 text-[9px] font-mono text-muted-foreground">
            <span>Archiving: Every hour</span>
            <span>·</span>
            <span>Coverage: 30+ tickers</span>
            <span>·</span>
            <span>Data: Levels, walls, regime, heatmap</span>
          </div>
        </div>
      ) : datesQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading history...
        </div>
      ) : (
        <>
          {/* Date Navigator */}
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevDate}
              disabled={currentDateIdx >= dates.length - 1}
              className="p-1.5 rounded-md border border-border hover:bg-muted/50 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Date pills — scrollable row */}
            <div className="flex-1 overflow-x-auto no-scrollbar">
              <div className="flex gap-1.5 min-w-max">
                {dates.slice(0, 30).map((d) => (
                  <button
                    key={d}
                    onClick={() => { setSelectedDate(d); setSelectedSnapshotIdx(0); }}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-[10px] font-mono transition-all whitespace-nowrap',
                      selectedDate === d
                        ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 font-bold'
                        : 'bg-muted/20 text-muted-foreground hover:bg-muted/40 border border-transparent'
                    )}
                  >
                    <Calendar className="w-3 h-3 inline mr-1" />
                    {formatDate(d)}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={goToNextDate}
              disabled={currentDateIdx <= 0}
              className="p-1.5 rounded-md border border-border hover:bg-muted/50 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Hourly Timeline */}
          {selectedDate && snapshots.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
              {snapshots.map((snap, idx) => (
                <button
                  key={snap.id}
                  onClick={() => setSelectedSnapshotIdx(idx)}
                  className={cn(
                    'flex flex-col items-center px-2 py-1 rounded-md text-[9px] font-mono transition-all min-w-[60px]',
                    selectedSnapshotIdx === idx
                      ? 'bg-cyan-500/15 border border-cyan-500/40'
                      : 'hover:bg-muted/30 border border-transparent'
                  )}
                >
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className={cn(
                    'font-bold',
                    selectedSnapshotIdx === idx ? 'text-cyan-400' : 'text-foreground/70'
                  )}>
                    {formatTime(snap.snapshotAt)}
                  </span>
                  <span className={cn(
                    'text-[8px] px-1 rounded',
                    regimeColor(snap.regime)
                  )}>
                    {snap.regime === 'positive_gamma' ? '+γ' : snap.regime === 'negative_gamma' ? '-γ' : 'N'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Snapshot Detail */}
          {activeSnapshot && (
            <div className="space-y-4">
              {/* Regime + Spot + Levels Bar */}
              <div className="rounded-lg bg-[var(--surface-raised)] border border-cyan-500/20 overflow-hidden">
                <div className="px-4 py-2 border-b border-cyan-500/15 bg-[var(--surface-base)]/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-400">
                      GEX PROFILE
                    </span>
                    <span className={cn(
                      'text-[9px] font-mono font-bold px-2 py-0.5 rounded border',
                      regimeColor(activeSnapshot.regime)
                    )}>
                      {activeSnapshot.regime?.replace('_', ' ').toUpperCase() || 'UNKNOWN'}
                    </span>
                    {activeSnapshot.vexRegime && (
                      <span className={cn(
                        'text-[9px] font-mono px-2 py-0.5 rounded border',
                        activeSnapshot.vexRegime === 'vol_tailwind' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
                        activeSnapshot.vexRegime === 'vol_headwind' ? 'text-red-400 bg-red-500/10 border-red-500/30' :
                        'text-muted-foreground bg-muted/10 border-border'
                      )}>
                        {activeSnapshot.vexRegime.replace('vol_', '').toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground">
                    {formatTime(activeSnapshot.snapshotAt)} ET · Grade {activeSnapshot.dataGrade || '—'}
                  </span>
                </div>

                {/* Key Levels Grid */}
                <div className="grid grid-cols-5 divide-x divide-border/30">
                  <LevelCell label="SPOT" value={`$${activeSnapshot.spotPrice.toFixed(2)}`} />
                  <LevelCell
                    label="FLIP"
                    value={activeSnapshot.flipPoint ? `$${activeSnapshot.flipPoint.toFixed(2)}` : '—'}
                    sub={activeSnapshot.flipDistancePct ? `${activeSnapshot.flipDistancePct > 0 ? '+' : ''}${activeSnapshot.flipDistancePct.toFixed(1)}%` : undefined}
                    tone={activeSnapshot.flipDistancePct && activeSnapshot.flipDistancePct < 0 ? 'pos' : 'neg'}
                  />
                  <LevelCell
                    label="CALL WALL"
                    value={activeSnapshot.callWall ? `$${activeSnapshot.callWall.toFixed(2)}` : '—'}
                    tone="pos"
                  />
                  <LevelCell
                    label="PUT WALL"
                    value={activeSnapshot.putWall ? `$${activeSnapshot.putWall.toFixed(2)}` : '—'}
                    tone="neg"
                  />
                  <LevelCell
                    label="MAX γ"
                    value={activeSnapshot.maxGammaStrike ? `$${activeSnapshot.maxGammaStrike.toFixed(0)}` : '—'}
                    tone="star"
                  />
                </div>
              </div>

              {/* Top Levels + Heatmap */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Top Levels */}
                <div className="rounded-lg bg-[var(--surface-raised)] border border-cyan-500/15 overflow-hidden">
                  <div className="px-3 py-2 border-b border-cyan-500/15 bg-[var(--surface-base)]/50">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-400">
                      TOP STRIKES BY GAMMA
                    </span>
                  </div>
                  <div className="p-3 space-y-1">
                    {(activeSnapshot.topLevels || []).map((lvl) => {
                      const maxAbs = Math.max(
                        ...(activeSnapshot.topLevels || []).map(l => Math.abs(l.gex)),
                        0.001
                      );
                      const pct = (Math.abs(lvl.gex) / maxAbs) * 100;
                      const isCall = lvl.gex > 0;

                      return (
                        <div key={lvl.strike} className="flex items-center gap-2 text-[10px] font-mono">
                          <span className="w-16 font-bold tabular-nums text-foreground">
                            ${lvl.strike.toFixed(0)}
                          </span>
                          <span className={cn(
                            'px-1 py-0.5 rounded text-[8px] font-bold w-6 text-center',
                            lvl.role === 'call_wall' ? 'text-emerald-400 bg-emerald-500/10' :
                            lvl.role === 'put_wall' ? 'text-red-400 bg-red-500/10' :
                            lvl.role === 'max_gamma' ? 'text-amber-400 bg-amber-500/10' :
                            lvl.role === 'flip' ? 'text-cyan-400 bg-cyan-500/10' :
                            'text-muted-foreground bg-muted/10'
                          )}>
                            {lvl.role === 'call_wall' ? 'CW' :
                             lvl.role === 'put_wall' ? 'PW' :
                             lvl.role === 'max_gamma' ? 'MX' :
                             lvl.role === 'flip' ? 'FL' : '—'}
                          </span>
                          <div className="flex-1 h-3 bg-muted/20 rounded overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded',
                                isCall ? 'bg-emerald-500/40' : 'bg-red-500/40'
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={cn(
                            'tabular-nums font-semibold w-16 text-right',
                            isCall ? 'text-emerald-400' : 'text-red-400'
                          )}>
                            {lvl.gex > 0 ? '+' : ''}{lvl.gex.toFixed(2)}B
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Heatmap Bars */}
                <div className="rounded-lg bg-[var(--surface-raised)] border border-cyan-500/15 overflow-hidden">
                  <div className="px-3 py-2 border-b border-cyan-500/15 bg-[var(--surface-base)]/50">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-400">
                      GAMMA HEATMAP
                    </span>
                  </div>
                  <div className="p-3 space-y-1">
                    {(activeSnapshot.heatmapData || [])
                      .sort((a, b) => b.strike - a.strike)
                      .map((cell) => {
                        const isSpot = Math.abs(cell.strike - activeSnapshot.spotPrice) / activeSnapshot.spotPrice < 0.005;
                        return (
                          <div
                            key={cell.strike}
                            className={cn(
                              'flex items-center gap-2 text-[10px] font-mono py-0.5 px-1 rounded',
                              isSpot && 'ring-1 ring-cyan-500/40 bg-cyan-500/5'
                            )}
                          >
                            <span className="w-14 tabular-nums font-bold text-foreground/80">
                              ${cell.strike.toFixed(0)}
                            </span>
                            <div className="flex-1 h-4 bg-muted/10 rounded overflow-hidden relative">
                              <div
                                className={cn(
                                  'absolute inset-y-0 left-0 rounded',
                                  cell.side === 'call'
                                    ? 'bg-gradient-to-r from-emerald-500/60 to-emerald-500/20'
                                    : 'bg-gradient-to-r from-red-500/60 to-red-500/20'
                                )}
                                style={{ width: `${cell.intensity * 100}%` }}
                              />
                            </div>
                            {isSpot && (
                              <span className="text-[8px] text-cyan-400 font-bold">SPOT</span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading state for snapshots */}
          {snapshotsQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading GEX profile...
            </div>
          )}

          {/* No snapshots for selected date */}
          {selectedDate && !snapshotsQuery.isLoading && snapshots.length === 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground">
              No snapshots recorded for {formatDate(selectedDate)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LevelCell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'pos' | 'neg' | 'star';
}) {
  const color =
    tone === 'pos' ? 'text-emerald-400'
    : tone === 'neg' ? 'text-red-400'
    : tone === 'star' ? 'text-amber-400'
    : 'text-foreground';

  return (
    <div className="px-3 py-2.5 text-center">
      <div className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className={cn('text-sm font-mono font-bold tabular-nums', color)}>
        {value}
      </div>
      {sub && (
        <div className={cn('text-[9px] font-mono tabular-nums', color)}>
          {sub}
        </div>
      )}
    </div>
  );
}
