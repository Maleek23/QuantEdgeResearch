/**
 * SpectrumScanner — one ticker, the WHOLE option chain, every price tier.
 *
 * Enter a ticker → it pulls the entire chain across all expiries (this-week
 * weeklies → 2027/2028/2029 LEAPS) and buckets every tradeable contract by what
 * it COSTS: cent lottos → cheap swings → bread-and-butter → mid → high → deep-ITM
 * stock-replacement LEAPS. Each contract is graded on RISK-ADJUSTED merit
 * (probability of profit × payoff × liquidity) with a plain-English thesis.
 *
 * Backed by /api/scanner/premium-spectrum (CBOE delayed chain + Yahoo fallback,
 * Black-Scholes greeks/ROI). ~15min delayed — a near-close read, not a live print.
 */
import { Fragment, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, TrendingUp, TrendingDown, ChevronDown, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QECard, QEStatStrip, QEPill, QEBar } from '@/components/ui/qe';

type Tier = 'lotto' | 'cheap' | 'low' | 'mid' | 'high' | 'deep';
type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

interface SpectrumContract {
  symbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  dte: number;
  tier: Tier;
  mid: number;
  bid: number;
  ask: number;
  premiumDollars: number;
  spreadPct: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  openInterest: number;
  volume: number;
  spot: number;
  moneyness: number;
  intrinsic: number;
  extrinsic: number;
  extrinsicPct: number;
  breakeven: number;
  breakevenMovePct: number;
  leverage: number;
  thetaDecayPctPerDay: number;
  pop: number;
  roi10: number;
  roi20: number;
  roi30: number;
  score: number;
  grade: Grade;
  thesis: string;
}

interface TierGroup {
  tier: Tier;
  label: string;
  blurb: string;
  contracts: SpectrumContract[];
}

interface SpectrumResponse {
  symbol: string;
  spot: number;
  side: 'call' | 'put';
  asOf: string;
  source: 'cboe' | 'yahoo' | 'none';
  scannedContracts: number;
  expiries: string[];
  tiers: TierGroup[];
  best: SpectrumContract[];
  notes: string[];
}

const GRADE_TONE: Record<Grade, 'gold' | 'bull' | 'cyan' | 'warn' | 'default'> = {
  S: 'gold', A: 'bull', B: 'cyan', C: 'warn', D: 'default',
};

export function SpectrumScanner() {
  const [, setLocation] = useLocation();
  const [input, setInput] = useState('');
  const [symbol, setSymbol] = useState('');
  const [side, setSide] = useState<'call' | 'put'>('call');

  const { data, isLoading, isFetching, error } = useQuery<SpectrumResponse>({
    queryKey: ['/api/scanner/premium-spectrum', symbol, side],
    queryFn: async () => {
      const res = await fetch(`/api/scanner/premium-spectrum?symbol=${encodeURIComponent(symbol)}&side=${side}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`spectrum scan failed (${res.status})`);
      return res.json();
    },
    enabled: symbol.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: false,
  });

  const run = () => {
    const s = input.trim().toUpperCase();
    if (s) setSymbol(s);
  };

  const best = data?.best ?? [];

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <QECard variant="default" padding="md">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-muted-foreground/60 shrink-0" />
            <input
              type="text"
              value={input}
              placeholder="Enter a ticker (NVDA, QUBT, SOFI…) — full chain, every price tier"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run()}
              className="flex-1 px-2 py-1.5 bg-card border border-border rounded text-foreground text-[13px] font-mono focus:border-[var(--brand-cyan)]/50 outline-none uppercase placeholder:normal-case placeholder:text-muted-foreground/60"
            />
          </div>
          <div className="flex items-center gap-1">
            {(['call', 'put'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={cn(
                  'inline-flex items-center gap-1 px-3 py-1.5 rounded text-[11px] font-mono uppercase tracking-wider transition-colors border',
                  side === s
                    ? s === 'call'
                      ? 'bg-[var(--trade-bullish)]/15 text-[var(--trade-bullish)] border-[var(--trade-bullish)]/40'
                      : 'bg-[var(--trade-bearish)]/15 text-[var(--trade-bearish)] border-[var(--trade-bearish)]/40'
                    : 'text-muted-foreground/60 border-border hover:text-foreground',
                )}
              >
                {s === 'call' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {s === 'call' ? 'Calls' : 'Puts'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={run}
            disabled={isFetching || !input.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[var(--brand-cyan)]/40 bg-[var(--brand-cyan)]/10 text-[var(--brand-cyan)] hover:bg-[var(--brand-cyan)]/20 transition-colors disabled:opacity-40 text-[11px] font-mono uppercase tracking-wider"
          >
            {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            {isFetching ? 'Scanning…' : 'Scan'}
          </button>
        </div>
      </QECard>

      {/* Help text */}
      <div className="text-[10px] font-mono text-muted-foreground/60 leading-relaxed">
        Pulls the <span className="text-muted-foreground/80">entire chain</span> across every expiry — this-week weeklies to 2027/2028/2029 LEAPS —
        and buckets each contract by <span className="text-muted-foreground/80">premium</span>: cent lottos → cheap swings → mid → deep-ITM stock-replacement.
        Grade blends <span className="text-muted-foreground/80">probability of profit × payoff × liquidity</span>. CBOE ~15min delayed. Not advice.
      </div>

      {!symbol && (
        <QECard variant="default" padding="lg" className="text-center text-[11px] font-mono text-muted-foreground space-y-2">
          <Search className="w-6 h-6 mx-auto text-muted-foreground/60" />
          <div>Enter a ticker above to scan its full option spectrum.</div>
          <div className="text-muted-foreground/60">From cent lottery tickets to $1-2k deep-ITM LEAPS — ranked by risk-adjusted edge.</div>
        </QECard>
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-cyan)]" />
        </div>
      )}

      {error && (
        <QECard variant="accent-bear" padding="md" className="text-center text-[10px] font-mono text-[var(--trade-bearish)]">
          SCAN FAILED — {(error as Error).message}
        </QECard>
      )}

      {data && data.source === 'none' && (
        <QECard variant="default" padding="lg" className="text-center text-[10px] font-mono text-muted-foreground space-y-1">
          {data.notes.map((n, i) => <div key={i} className="text-muted-foreground/70">{n}</div>)}
        </QECard>
      )}

      {data && data.source !== 'none' && (
        <>
          {/* Stats */}
          <QECard variant="default" padding="md">
            <QEStatStrip
              stats={[
                { label: data.symbol, value: `$${data.spot.toFixed(2)}`, tone: 'cyan' },
                { label: 'SIDE', value: data.side.toUpperCase(), tone: data.side === 'call' ? 'bull' : 'bear' },
                { label: 'CONTRACTS', value: data.scannedContracts },
                { label: 'EXPIRIES', value: data.expiries.length },
                { label: 'TIERS', value: data.tiers.length, tone: 'gold' },
                { label: 'SOURCE', value: data.source.toUpperCase() },
              ]}
            />
          </QECard>

          {/* Best across spectrum */}
          {best.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--brand-gold)]/80 mb-1.5 px-1">
                ★ Best risk-adjusted across the spectrum
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {best.slice(0, 4).map((c) => (
                  <BestCard key={`${c.strike}-${c.expiry}-${c.tier}`} c={c} onClick={() => setLocation(`/r/${c.symbol}`)} />
                ))}
              </div>
            </div>
          )}

          {/* Tier sections */}
          {data.tiers.map((g) => (
            <TierSection key={g.tier} group={g} onRowClick={(sym) => setLocation(`/r/${sym}`)} />
          ))}

          <div className="text-[9px] font-mono text-muted-foreground/60 pt-1 space-y-0.5">
            {data.notes.map((n, i) => <div key={i}>{n}</div>)}
          </div>
        </>
      )}
    </div>
  );
}

function BestCard({ c, onClick }: { c: SpectrumContract; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={c.thesis}
      className="text-left rounded-lg border border-border bg-card p-2.5 hover:border-[var(--brand-gold)]/40 transition-colors cursor-pointer"
    >
      <div className="flex items-center justify-between mb-1">
        <span className={cn('text-[12px] font-mono font-bold', c.optionType === 'call' ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]')}>
          ${c.strike} {c.optionType.toUpperCase()}
        </span>
        <QEPill variant={GRADE_TONE[c.grade]}>{c.grade}</QEPill>
      </div>
      <div className="text-[9px] font-mono text-muted-foreground/70 mb-1.5">{c.expiry} · {c.dte}d</div>
      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
        <span className="text-foreground">${c.mid.toFixed(2)}</span>
        <span className="text-muted-foreground/70">{(c.pop * 100).toFixed(0)}% PoP</span>
        <span className="text-[var(--brand-cyan)]">{c.leverage.toFixed(1)}x</span>
      </div>
    </button>
  );
}

function TierSection({ group, onRowClick }: { group: TierGroup; onRowClick: (sym: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <QECard variant="default" padding="none" className="overflow-hidden">
      <div className="flex items-baseline justify-between px-3 py-2 border-b border-border bg-muted/20">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground">{group.label}</span>
          <span className="text-[9px] font-mono text-muted-foreground/60">{group.blurb}</span>
        </div>
        <span className="text-[9px] font-mono text-muted-foreground/60">{group.contracts.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] font-mono border-collapse min-w-max">
          <thead className="bg-muted/10 border-b border-border/50">
            <tr className="text-[9px] uppercase tracking-widest text-muted-foreground/60">
              <Th>Contract</Th>
              <Th align="right">Exp / DTE</Th>
              <Th align="right">Cost</Th>
              <Th align="right">PoP</Th>
              <Th align="right">Lev</Th>
              <Th align="right">B/E</Th>
              <Th align="right">+20%</Th>
              <Th align="right">Δ</Th>
              <Th align="right">OI</Th>
              <Th align="right">Grade</Th>
              <Th align="right" />
            </tr>
          </thead>
          <tbody>
            {group.contracts.map((c) => {
              const key = `${c.strike}-${c.expiry}`;
              const isOpen = expanded === key;
              const gradeTone = GRADE_TONE[c.grade];
              const barTone = gradeTone === 'default' ? 'cyan' : gradeTone;
              return (
                <Fragment key={key}>
                  <tr
                    onClick={() => setExpanded(isOpen ? null : key)}
                    className="border-b border-border/30 hover:bg-muted/20 cursor-pointer transition-colors"
                  >
                    <Td className={cn('font-bold', c.optionType === 'call' ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]')}>
                      ${c.strike} {c.optionType.toUpperCase()}
                    </Td>
                    <Td align="right" className="text-muted-foreground">{c.expiry.slice(2)} · {c.dte}d</Td>
                    <Td align="right" className="text-foreground tabular-nums">${c.mid.toFixed(2)} <span className="text-muted-foreground/60">(${c.premiumDollars})</span></Td>
                    <Td align="right" className={cn('tabular-nums', c.pop >= 0.4 ? 'text-[var(--trade-bullish)]' : c.pop >= 0.15 ? 'text-foreground' : 'text-muted-foreground/60')}>{(c.pop * 100).toFixed(0)}%</Td>
                    <Td align="right" className="tabular-nums text-[var(--brand-cyan)]">{c.leverage.toFixed(1)}x</Td>
                    <Td align="right" className="tabular-nums text-muted-foreground">{(c.breakevenMovePct * 100).toFixed(1)}%</Td>
                    <Td align="right" className="tabular-nums text-[var(--trade-bullish)]">+{(c.roi20 * 100).toFixed(0)}%</Td>
                    <Td align="right" className="tabular-nums text-muted-foreground">{c.delta.toFixed(2)}</Td>
                    <Td align="right" className="tabular-nums text-muted-foreground">{c.openInterest.toLocaleString()}</Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-1.5">
                        <QEBar value={c.score} max={100} tone={barTone} size="xs" className="w-10" />
                        <QEPill variant={GRADE_TONE[c.grade]}>{c.grade}</QEPill>
                      </div>
                    </Td>
                    <Td align="right"><ChevronDown className={cn('w-3 h-3 text-muted-foreground/60 transition-transform', isOpen && 'rotate-180')} /></Td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-border/30 bg-muted/10">
                      <td colSpan={11} className="px-3 py-2">
                        <div className="text-[10px] font-mono text-muted-foreground/90 leading-relaxed mb-2">{c.thesis}</div>
                        <div className="flex flex-wrap gap-3 text-[9px] font-mono text-muted-foreground/70">
                          <Stat label="Bid/Ask" value={`$${c.bid.toFixed(2)} / $${c.ask.toFixed(2)}`} />
                          <Stat label="Spread" value={`${(c.spreadPct * 100).toFixed(0)}%`} />
                          <Stat label="IV" value={`${(c.iv * 100).toFixed(0)}%`} />
                          <Stat label="Breakeven" value={`$${c.breakeven.toFixed(2)}`} />
                          <Stat label="Intrinsic" value={`$${c.intrinsic.toFixed(2)}`} />
                          <Stat label="Extrinsic" value={`$${c.extrinsic.toFixed(2)} (${(c.extrinsicPct * 100).toFixed(0)}%)`} />
                          <Stat label="Theta/day" value={`${(c.thetaDecayPctPerDay * 100).toFixed(1)}%`} />
                          <Stat label="+10% / +30%" value={`+${(c.roi10 * 100).toFixed(0)}% / +${(c.roi30 * 100).toFixed(0)}%`} />
                          <Stat label="Vol" value={c.volume.toLocaleString()} />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onRowClick(c.symbol); }}
                          className="mt-2 inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-widest text-[var(--brand-cyan)] hover:underline"
                        >
                          Open Research →
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </QECard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-muted-foreground/60 uppercase tracking-wider">{label}</span>
      <span className="text-muted-foreground/90 tabular-nums">{value}</span>
    </span>
  );
}

function Th({ children, align = 'left' }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
  return <th className={cn('px-2 py-1.5 font-medium', align === 'right' ? 'text-right' : 'text-left')}>{children}</th>;
}

function Td({ children, align = 'left', className }: { children: React.ReactNode; align?: 'left' | 'right'; className?: string }) {
  return <td className={cn('px-2 py-1.5 whitespace-nowrap', align === 'right' && 'text-right', className)}>{children}</td>;
}

export default SpectrumScanner;
