/**
 * EarningsHub — the platform's auto-running version of the manual top-10 lotto scan.
 *
 * Sections:
 *   1. Stats strip (lotto count, S-tier count, scanned count, window)
 *   2. TOP LOTTOS — filtered to "ATM<$4, ≥1 beat, +1.5σ ROI ≥ 60%"
 *      Each row shows: symbol, day/time, contract, cost, IV, iMove, ROIs, beat history
 *   3. ALL UPCOMING — full ranked list, expandable
 *
 * Click any row → drawer with full contract specs + ROI scenarios + thesis.
 *
 * Sole live dependency: GET /api/earnings/week
 */
import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, Flame, TrendingUp, Filter, Plus, Check, AlertCircle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QECard, QEStatStrip, QEPill, QEBar, QEDrawer, type QEPillVariant } from '@/components/ui/qe';

type Tier = 'S' | 'A' | 'B' | 'C' | 'AVOID';
type EarningsTime = 'BMO' | 'AMC' | 'TBD' | 'unknown';

interface ContractPick {
  type: 'CALL' | 'PUT';
  strike: number;
  expiry: string;
  dte: number;
  mid: number;
  bid: number;
  ask: number;
  iv: number;
  oi: number;
  vol: number;
}

interface BeatHistory {
  beats: number;
  total: number;
  avgSurprisePct: number;
  recentSurprises: number[];
}

interface EarningsRow {
  symbol: string;
  name?: string;
  date: string;
  time: EarningsTime;
  epsEstimate: string | null;
  spot: number;
  beats: BeatHistory | null;
  ivPct: number;
  impliedMovePct: number;
  impliedMoveDollars: number;
  costToMoveRatio: number;
  roiAt1Sigma: number;
  roiAt1_5Sigma: number;
  roiAt2Sigma: number;
  atmCall: ContractPick | null;
  otmCall: ContractPick | null;
  otmPut: ContractPick | null;
  lottoScore: number;
  thesis: string;
  tier: Tier;
}

interface HubResponse {
  asOf: string;
  windowStart: string;
  windowEnd: string;
  scannedTickers: number;
  upcoming: EarningsRow[];
  lottos: EarningsRow[];
}

const TIER_VARIANT: Record<Tier, QEPillVariant> = {
  S: 'gold',
  A: 'bull',
  B: 'cyan',
  C: 'default',
  AVOID: 'bear',
};

type PushState = 'idle' | 'sending' | 'sent' | 'error';

export function EarningsHub() {
  const [, setLocation] = useLocation();
  const [drilled, setDrilled] = useState<EarningsRow | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [tierFilter, setTierFilter] = useState<Tier | 'all'>('all');
  const [pushState, setPushState] = useState<Record<string, PushState>>({});
  const [bulkState, setBulkState] = useState<PushState>('idle');

  const pushOne = async (symbol: string, style: 'atm' | 'otm' | 'put' = 'atm') => {
    const key = `${symbol}-${style}`;
    if (pushState[key] === 'sending' || pushState[key] === 'sent') return;
    setPushState(p => ({ ...p, [key]: 'sending' }));
    try {
      const res = await fetch('/api/trade-desk/ideas/from-earnings', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, contractStyle: style }),
      });
      const body = await res.json().catch(() => ({}));
      setPushState(p => ({ ...p, [key]: res.ok && body.ok ? 'sent' : 'error' }));
      setTimeout(() => setPushState(p => ({ ...p, [key]: 'idle' })), 2400);
    } catch {
      setPushState(p => ({ ...p, [key]: 'error' }));
      setTimeout(() => setPushState(p => ({ ...p, [key]: 'idle' })), 2400);
    }
  };

  const pushBulk = async () => {
    if (bulkState === 'sending') return;
    setBulkState('sending');
    try {
      const res = await fetch('/api/trade-desk/ideas/from-earnings/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiers: ['S', 'A'], minScore: 70 }),
      });
      const body = await res.json().catch(() => ({}));
      setBulkState(res.ok && body.ok ? 'sent' : 'error');
      setTimeout(() => setBulkState('idle'), 4000);
    } catch {
      setBulkState('error');
      setTimeout(() => setBulkState('idle'), 4000);
    }
  };

  const { data, isLoading, isFetching, error, refetch } = useQuery<HubResponse>({
    queryKey: ['/api/earnings/week'],
    queryFn: async () => {
      const res = await fetch('/api/earnings/week', { credentials: 'include' });
      if (!res.ok) throw new Error(`fetch failed (${res.status})`);
      return res.json();
    },
    staleTime: 30 * 60_000,
    refetchInterval: false,
  });

  const lottos = data?.lottos ?? [];
  const upcoming = data?.upcoming ?? [];
  const tierCounts = useMemo(() => {
    const c: Record<Tier, number> = { S: 0, A: 0, B: 0, C: 0, AVOID: 0 };
    for (const r of upcoming) c[r.tier]++;
    return c;
  }, [upcoming]);

  const filtered = useMemo(() => {
    if (tierFilter === 'all') return upcoming;
    return upcoming.filter(r => r.tier === tierFilter);
  }, [upcoming, tierFilter]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-mono font-bold uppercase tracking-widest text-foreground">
            <Flame className="w-4 h-4 inline text-[var(--brand-gold)] mr-1" />
            Earnings Hub
          </h2>
          <p className="text-[10px] font-mono text-muted-foreground/70">
            Auto-scanned ATM/OTM lottos for next-week earnings · scored by cost-to-move × beat history × ROI
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Bulk push S+A tier to Trade Desk */}
          <button
            type="button"
            onClick={pushBulk}
            disabled={bulkState === 'sending' || lottos.length === 0}
            title="Push all S/A-tier lottos to Trade Desk as trade ideas"
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors',
              bulkState === 'idle'    && 'border-[var(--brand-gold)]/40 text-[var(--brand-gold)] hover:bg-[var(--brand-gold)]/10',
              bulkState === 'sending' && 'border-border text-muted-foreground cursor-wait',
              bulkState === 'sent'    && 'border-[var(--trade-bullish)]/40 text-[var(--trade-bullish)] bg-[var(--trade-bullish)]/10',
              bulkState === 'error'   && 'border-[var(--trade-bearish)]/40 text-[var(--trade-bearish)]',
            )}
          >
            {bulkState === 'sending' && <Loader2 className="w-3 h-3 animate-spin" />}
            {bulkState === 'sent'    && <Check className="w-3 h-3" />}
            {bulkState === 'error'   && <AlertCircle className="w-3 h-3" />}
            {bulkState === 'idle'    && <Zap className="w-3 h-3" />}
            <span className="text-[10px] font-mono uppercase tracking-widest">
              {bulkState === 'sent' ? 'PUSHED' : bulkState === 'error' ? 'RETRY' : bulkState === 'sending' ? 'PUSHING…' : 'PUSH ALL S/A'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-border hover:border-[var(--brand-cyan)]/50 transition-colors"
            title="Re-scan calendar + chains (~60-90s)"
          >
            <RefreshCw className={cn('w-3 h-3', isFetching && 'animate-spin text-[var(--brand-cyan)]')} />
            <span className="text-[10px] font-mono uppercase tracking-widest">
              {isFetching ? 'Scanning…' : 'Re-scan'}
            </span>
          </button>
        </div>
      </header>

      {/* Stats */}
      <QECard variant="default" padding="md">
        <QEStatStrip stats={[
          { label: 'LOTTOS',  value: lottos.length, tone: 'gold' },
          { label: 'S-TIER',  value: tierCounts.S, tone: 'gold' },
          { label: 'A-TIER',  value: tierCounts.A, tone: 'bull' },
          { label: 'B-TIER',  value: tierCounts.B, tone: 'cyan' },
          { label: 'AVOID',   value: tierCounts.AVOID, tone: 'bear' },
          { label: 'SCANNED', value: data?.scannedTickers ?? '—' },
          { label: 'WINDOW',  value: data ? `${data.windowStart.slice(5)} → ${data.windowEnd.slice(5)}` : '—' },
        ]} />
      </QECard>

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/60 mr-1">
          <Filter className="w-3 h-3 inline mr-0.5" /> TIER
        </span>
        {(['all', 'S', 'A', 'B', 'C', 'AVOID'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTierFilter(t)}
            className={cn(
              'px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded border transition-colors',
              tierFilter === t
                ? 'border-[var(--brand-cyan)]/50 text-[var(--brand-cyan)] bg-[var(--brand-cyan)]/10'
                : 'border-border/40 text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            {t === 'all' ? 'All' : t}
          </button>
        ))}
      </div>

      {/* Loading / error */}
      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-cyan)]" />
          <span className="ml-2 text-xs font-mono text-muted-foreground">Scanning earnings universe…</span>
        </div>
      )}
      {error && (
        <QECard variant="accent-bear" padding="md" className="text-center text-[10px] font-mono text-[var(--trade-bearish)]">
          SCAN FAILED — {(error as Error).message}
        </QECard>
      )}

      {/* TOP LOTTOS */}
      {!isLoading && lottos.length > 0 && (
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--brand-gold)] mb-1.5 px-1 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" />
            Top {lottos.length} Lottos · ATM &lt; $4 · ≥1 beat · +1.5σ ROI ≥ 60% · Click <Plus className="w-3 h-3 inline" /> to push to Trade Desk
          </div>
          <QECard variant="accent-gold" padding="none" className="overflow-hidden">
            <LottoTable rows={lottos} onDrillIn={setDrilled} pushOne={pushOne} pushState={pushState} />
          </QECard>
        </div>
      )}

      {/* ALL UPCOMING */}
      {!isLoading && filtered.length > 0 && (
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 mb-1.5 px-1 flex items-center justify-between">
            <span>All Upcoming · {filtered.length}{tierFilter !== 'all' ? ` · ${tierFilter}-tier` : ''}</span>
            {!showAll && filtered.length > 15 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-[var(--brand-cyan)] hover:underline"
              >
                Show all {filtered.length} →
              </button>
            )}
          </div>
          <QECard variant="default" padding="none" className="overflow-hidden">
            <UpcomingTable rows={showAll ? filtered : filtered.slice(0, 15)} onDrillIn={setDrilled} />
          </QECard>
        </div>
      )}

      {/* Empty state — no scored plays (quiet window or option data unavailable) */}
      {!isLoading && !error && lottos.length === 0 && filtered.length === 0 && (
        <QECard variant="default" padding="md" className="text-center">
          <div className="flex flex-col items-center gap-2 py-6">
            <AlertCircle className="w-5 h-5 text-muted-foreground/60" />
            <div className="text-xs font-mono text-muted-foreground">
              No scored earnings plays right now.
            </div>
            <div className="text-[10px] font-mono text-muted-foreground/60 max-w-md leading-relaxed">
              The lotto scanner only scores curated names that report in the next {data ? `${Math.max(1, Math.round((new Date(data.windowEnd).getTime() - new Date(data.windowStart).getTime()) / 86_400_000))}` : '7'} days
              <span className="block mt-1">
                and need live option chains. Early-June is a quiet window between Q1 and Q2 prints, and option-chain data (Tradier) is currently unavailable — so there's nothing to score yet.
              </span>
              <span className="block mt-1">
                The <span className="text-[var(--brand-cyan)]">Calendar</span> tab still shows every reporter from the free earnings feed.
              </span>
            </div>
          </div>
        </QECard>
      )}

      {/* Drill-in drawer */}
      <QEDrawer
        open={!!drilled}
        onClose={() => setDrilled(null)}
        title={drilled?.symbol ?? ''}
        subtitle={drilled ? `${drilled.date} · ${drilled.time} · ${drilled.name ?? ''}` : ''}
        size="md"
      >
        {drilled && <DrillIn row={drilled} onJumpToResearch={(s) => { setDrilled(null); setLocation(`/r/${s}`); }} />}
      </QEDrawer>
    </div>
  );
}

// ─── Lotto table (simplified, gold-accented) ─────────────────────────

function LottoTable({
  rows, onDrillIn, pushOne, pushState,
}: {
  rows: EarningsRow[];
  onDrillIn: (r: EarningsRow) => void;
  pushOne: (sym: string, style?: 'atm' | 'otm' | 'put') => Promise<void>;
  pushState: Record<string, PushState>;
}) {
  return (
    <table className="w-full text-[10px] font-mono">
      <thead className="bg-[var(--brand-gold)]/10 border-b border-border/40">
        <tr className="text-[9px] uppercase tracking-widest text-muted-foreground/80">
          <Th>#</Th>
          <Th>Sym</Th>
          <Th>When</Th>
          <Th align="right">Spot</Th>
          <Th align="right">Strike</Th>
          <Th align="right">Cost</Th>
          <Th align="right">IV%</Th>
          <Th align="right">iMove</Th>
          <Th align="right">+1σ</Th>
          <Th align="right">+1.5σ</Th>
          <Th align="right">+2σ</Th>
          <Th align="right">Beats</Th>
          <Th align="right">Score</Th>
          <Th align="right">Push</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={r.symbol}
            onClick={() => onDrillIn(r)}
            className="border-b border-border/20 hover:bg-[var(--brand-gold)]/5 cursor-pointer transition-colors"
          >
            <Td className="text-muted-foreground/60 tabular-nums">{(i + 1).toString().padStart(2, '0')}</Td>
            <Td className="font-bold text-foreground">{r.symbol}</Td>
            <Td className="text-muted-foreground">
              {r.date.slice(5)} <span className="text-[var(--brand-cyan)] font-bold">{r.time}</span>
            </Td>
            <Td align="right" className="tabular-nums">${r.spot.toFixed(2)}</Td>
            <Td align="right" className="tabular-nums text-foreground">${r.atmCall?.strike}C</Td>
            <Td align="right" className="tabular-nums text-[var(--brand-gold)] font-bold">${r.atmCall?.mid.toFixed(2)}</Td>
            <Td align="right" className="tabular-nums text-muted-foreground">{r.ivPct.toFixed(0)}</Td>
            <Td align="right" className="tabular-nums text-[var(--brand-cyan)]">±{r.impliedMovePct.toFixed(1)}%</Td>
            <Td align="right" className={cn('tabular-nums', r.roiAt1Sigma > 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]')}>
              {r.roiAt1Sigma >= 0 ? '+' : ''}{r.roiAt1Sigma.toFixed(0)}%
            </Td>
            <Td align="right" className="tabular-nums text-[var(--trade-bullish)] font-bold">
              +{r.roiAt1_5Sigma.toFixed(0)}%
            </Td>
            <Td align="right" className="tabular-nums text-[var(--trade-bullish)]">
              +{r.roiAt2Sigma.toFixed(0)}%
            </Td>
            <Td align="right" className="text-[9px] text-muted-foreground">
              {r.beats ? `${r.beats.beats}/${r.beats.total} ${r.beats.avgSurprisePct >= 0 ? '+' : ''}${r.beats.avgSurprisePct.toFixed(0)}%` : '—'}
            </Td>
            <Td align="right">
              <QEPill variant="gold">{r.lottoScore}</QEPill>
            </Td>
            <Td align="right">
              <PushButton
                state={pushState[`${r.symbol}-atm`] || 'idle'}
                onClick={(e) => { e.stopPropagation(); pushOne(r.symbol, 'atm'); }}
              />
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PushButton({
  state, onClick,
}: {
  state: PushState;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === 'sending' || state === 'sent'}
      title={state === 'sent' ? 'Pushed to Trade Desk' : state === 'error' ? 'Failed — retry' : 'Push to Trade Desk'}
      className={cn(
        'inline-flex items-center justify-center px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold uppercase transition-colors',
        state === 'idle'    && 'border-[var(--brand-gold)]/30 text-[var(--brand-gold)] hover:bg-[var(--brand-gold)]/10',
        state === 'sending' && 'border-border text-muted-foreground cursor-wait',
        state === 'sent'    && 'border-[var(--trade-bullish)]/50 text-[var(--trade-bullish)] bg-[var(--trade-bullish)]/10',
        state === 'error'   && 'border-[var(--trade-bearish)]/50 text-[var(--trade-bearish)] bg-[var(--trade-bearish)]/10',
      )}
    >
      {state === 'sending' && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
      {state === 'sent'    && <Check className="w-2.5 h-2.5" />}
      {state === 'error'   && <AlertCircle className="w-2.5 h-2.5" />}
      {state === 'idle'    && <Plus className="w-2.5 h-2.5" />}
    </button>
  );
}

// ─── Upcoming table (full list) ──────────────────────────────────────

function UpcomingTable({ rows, onDrillIn }: { rows: EarningsRow[]; onDrillIn: (r: EarningsRow) => void }) {
  return (
    <table className="w-full text-[10px] font-mono">
      <thead className="bg-muted/30 border-b border-border/40">
        <tr className="text-[9px] uppercase tracking-widest text-muted-foreground/70">
          <Th>Sym</Th>
          <Th>When</Th>
          <Th>Tier</Th>
          <Th align="right">Spot</Th>
          <Th align="right">EPS Est</Th>
          <Th align="right">IV%</Th>
          <Th align="right">iMove</Th>
          <Th>Thesis</Th>
          <Th align="right">Score</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr
            key={r.symbol}
            onClick={() => onDrillIn(r)}
            className="border-b border-border/20 hover:bg-muted/20 cursor-pointer"
          >
            <Td className="font-bold text-foreground">{r.symbol}</Td>
            <Td className="text-muted-foreground">
              {r.date.slice(5)} <span className="text-[var(--brand-cyan)]">{r.time}</span>
            </Td>
            <Td><QEPill variant={TIER_VARIANT[r.tier]}>{r.tier}</QEPill></Td>
            <Td align="right" className="tabular-nums">${r.spot.toFixed(2)}</Td>
            <Td align="right" className="text-muted-foreground">{r.epsEstimate ?? '—'}</Td>
            <Td align="right" className="tabular-nums text-muted-foreground">{r.ivPct.toFixed(0)}</Td>
            <Td align="right" className="tabular-nums text-[var(--brand-cyan)]">±{r.impliedMovePct.toFixed(1)}%</Td>
            <Td className="text-[9px] text-muted-foreground/80 truncate max-w-[280px]">{r.thesis}</Td>
            <Td align="right">
              <QEPill variant={TIER_VARIANT[r.tier]}>{r.lottoScore}</QEPill>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Drill-in drawer ─────────────────────────────────────────────────

function DrillIn({ row, onJumpToResearch }: { row: EarningsRow; onJumpToResearch: (s: string) => void }) {
  return (
    <div className="p-3 space-y-3">
      <QECard variant="default" padding="md">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <div className="text-2xl font-mono font-bold text-foreground">{row.symbol}</div>
            <div className="text-[10px] font-mono text-muted-foreground">{row.name}</div>
          </div>
          <div className="text-right">
            <QEPill variant={TIER_VARIANT[row.tier]}>{row.tier}-TIER</QEPill>
            <div className="text-[9px] font-mono text-muted-foreground mt-1">Score {row.lottoScore}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-[10px] font-mono">
          <div>
            <div className="text-muted-foreground/70 uppercase tracking-widest">Spot</div>
            <div className="text-base font-bold tabular-nums">${row.spot.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-muted-foreground/70 uppercase tracking-widest">When</div>
            <div className="text-base font-bold">{row.date.slice(5)} {row.time}</div>
          </div>
          <div>
            <div className="text-muted-foreground/70 uppercase tracking-widest">EPS Est</div>
            <div className="text-base font-bold tabular-nums">{row.epsEstimate ?? '—'}</div>
          </div>
        </div>
      </QECard>

      {/* Beat history */}
      {row.beats && (
        <QECard variant="default" padding="md">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 mb-2">
            Beat History (last {row.beats.total}Q)
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <QEPill variant={row.beats.beats === row.beats.total ? 'gold' : row.beats.beats >= row.beats.total / 2 ? 'bull' : 'warn'}>
              {row.beats.beats}/{row.beats.total} BEATS
            </QEPill>
            <span className={cn(
              'font-bold tabular-nums',
              row.beats.avgSurprisePct >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]',
            )}>
              avg {row.beats.avgSurprisePct >= 0 ? '+' : ''}{row.beats.avgSurprisePct.toFixed(0)}% surprise
            </span>
          </div>
          {row.beats.recentSurprises.length > 0 && (
            <div className="text-[9px] font-mono text-muted-foreground mt-2">
              Recent: {row.beats.recentSurprises.map(s => `${s >= 0 ? '+' : ''}${s.toFixed(0)}%`).join(' · ')}
            </div>
          )}
        </QECard>
      )}

      {/* Implied move + ROI */}
      <QECard variant="default" padding="md">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 mb-2">
          Implied Move & ROI Scenarios
        </div>
        <div className="grid grid-cols-2 gap-3 text-[11px] font-mono mb-2">
          <div>
            <div className="text-muted-foreground/70 text-[9px] uppercase">IV (front-month ATM)</div>
            <div className="font-bold text-foreground">{row.ivPct.toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-muted-foreground/70 text-[9px] uppercase">Implied Move</div>
            <div className="font-bold text-[var(--brand-cyan)]">±{row.impliedMovePct.toFixed(1)}% (${row.impliedMoveDollars.toFixed(2)})</div>
          </div>
        </div>
        <div className="space-y-1.5 mt-3">
          <ScenBar label="+1σ"   roi={row.roiAt1Sigma}   />
          <ScenBar label="+1.5σ" roi={row.roiAt1_5Sigma} />
          <ScenBar label="+2σ"   roi={row.roiAt2Sigma}   />
        </div>
      </QECard>

      {/* Contract picks */}
      <QECard variant="default" padding="md">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 mb-2">
          Suggested Contracts
        </div>
        <div className="space-y-2">
          {row.atmCall && <ContractRow label="ATM CALL (directional)" c={row.atmCall} accent="bull" />}
          {row.otmCall && <ContractRow label="OTM CALL (lottery)" c={row.otmCall} accent="gold" />}
          {row.otmPut && <ContractRow label="OTM PUT (downside hedge)" c={row.otmPut} accent="bear" />}
        </div>
      </QECard>

      {/* Thesis */}
      <QECard variant="default" padding="md">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 mb-1">
          Auto-Thesis
        </div>
        <div className="text-[11px] font-mono text-foreground">
          {row.thesis}
        </div>
      </QECard>

      {/* Jump to Research */}
      <button
        type="button"
        onClick={() => onJumpToResearch(row.symbol)}
        className="w-full py-2 rounded border border-[var(--brand-cyan)]/40 text-[var(--brand-cyan)] text-[10px] font-mono font-bold uppercase tracking-widest hover:bg-[var(--brand-cyan)]/10 transition-colors"
      >
        Open {row.symbol} in Research →
      </button>
    </div>
  );
}

function ScenBar({ label, roi }: { label: string; roi: number }) {
  const pct = Math.min(100, Math.max(0, (roi + 100) / 5)); // map -100..400 → 0..100
  const tone = roi > 100 ? 'bull' : roi > 0 ? 'cyan' : 'bear';
  return (
    <div className="flex items-center gap-2 text-[10px] font-mono">
      <span className="text-muted-foreground w-12">{label}</span>
      <div className="flex-1">
        <QEBar value={pct} max={100} tone={tone} size="xs" />
      </div>
      <span className={cn(
        'font-bold tabular-nums w-12 text-right',
        roi > 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]',
      )}>
        {roi >= 0 ? '+' : ''}{roi.toFixed(0)}%
      </span>
    </div>
  );
}

function ContractRow({ label, c, accent }: { label: string; c: ContractPick; accent: 'bull' | 'gold' | 'bear' }) {
  const accentCls =
    accent === 'bull' ? 'text-[var(--trade-bullish)]' :
    accent === 'gold' ? 'text-[var(--brand-gold)]' :
    'text-[var(--trade-bearish)]';
  return (
    <div className="flex items-center gap-3 p-2 rounded bg-muted/20">
      <div className="flex-1 min-w-0">
        <div className={cn('text-[9px] font-mono uppercase tracking-widest', accentCls)}>{label}</div>
        <div className="text-[11px] font-mono text-foreground">
          ${c.strike} {c.type} · {c.expiry} ({c.dte}d)
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={cn('text-base font-mono font-bold', accentCls)}>${c.mid.toFixed(2)}</div>
        <div className="text-[9px] font-mono text-muted-foreground">
          IV {(c.iv * 100).toFixed(0)}% · OI {c.oi.toLocaleString()}
        </div>
      </div>
    </div>
  );
}

// ─── th/td helpers ───────────────────────────────────────────────────

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={cn('px-2 py-1.5 font-medium', align === 'right' ? 'text-right' : 'text-left')}>
      {children}
    </th>
  );
}

function Td({
  children, align = 'left', className,
}: {
  children: React.ReactNode; align?: 'left' | 'right'; className?: string;
}) {
  return (
    <td className={cn('px-2 py-1.5 whitespace-nowrap', align === 'right' && 'text-right', className)}>
      {children}
    </td>
  );
}
