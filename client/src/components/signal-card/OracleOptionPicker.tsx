/**
 * OracleOptionPicker — 3-tier contract selector
 * ===============================================
 * On-demand surface over the canonical option-selection engine
 * (POST /api/options/select). Given a signal's price-action thesis, fetches up
 * to three risk-tiered contract picks — conservative / balanced / aggressive —
 * and lets the user choose. Premiums are live (never fabricated); empty/illiquid
 * results render an honest note instead of a fake strike.
 */
import { parseMarketDate } from '@/lib/market-date';
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

type Tier = 'conservative' | 'balanced' | 'aggressive';

interface EnginePick {
  tier: Tier;
  optionType: 'call' | 'put';
  strike: number;
  expiry: string;
  dte: number;
  // greeks + liquidity (engine returns the full chain row)
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
  bid: number;
  ask: number;
  mid: number;
  spreadPct: number;
  openInterest: number;
  volume: number;
  entryPremium: number;
  projectedAtT1: number;
  projectedAtT2?: number;
  roiAtT1Pct: number;
  roiAtT2Pct?: number;
  riskRewardRatio: number;
  breakeven: number;
  scaleReachable: boolean;
  score: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  rationale: string;
  flags: string[];
}

interface EngineSelection {
  symbol: string;
  optionType: 'call' | 'put';
  spot: number;
  recommendedTier: Tier | null;
  dteWindow: { min: number; max: number };
  picks: EnginePick[];
  status: 'ok' | 'unavailable' | 'no_candidates';
  note?: string;
}

interface Props {
  symbol: string;
  direction: 'BULL' | 'BEAR' | 'NEUTRAL';
  entry: number;
  stop: number;
  t1: number;
  t2?: number;
  holdPeriodLabel?: string;
  conviction?: number;
  /** Fetch contracts on mount instead of waiting for a button click. */
  autoLoad?: boolean;
  onSelect?: (pick: EnginePick) => void;
}

function labelToSetup(label?: string): 'scalp' | 'swing' | 'lotto' | 'position' {
  const l = (label ?? '').toUpperCase();
  if (l.includes('OVERNIGHT')) return 'scalp';
  if (l.includes('WEEK') || l.includes('MONTH') || l.includes('YEAR')) return 'position';
  const dayMatch = l.match(/(\d+)\s*DAY/);
  if (dayMatch) {
    const d = parseInt(dayMatch[1], 10);
    if (d <= 1) return 'scalp';
    if (d <= 5) return 'swing';
    return 'position';
  }
  return 'swing';
}

// Tier accent colors — drawn from the same QE design tokens the cockpit uses
// (bullish green / brand cyan / amber) so the contract engine matches every
// other panel instead of introducing a second palette.
const AMBER = '#f59e0b';
const TIER_STYLE: Record<Tier, { color: string; label: string }> = {
  conservative: { color: 'var(--trade-bullish)', label: 'CONSERVATIVE' },
  balanced: { color: 'var(--brand-cyan)', label: 'BALANCED' },
  aggressive: { color: AMBER, label: 'AGGRESSIVE' },
};

function gradeColor(grade: string): string {
  if (grade === 'S' || grade === 'A') return 'var(--trade-bullish)';
  if (grade === 'B') return 'var(--brand-cyan)';
  if (grade === 'C') return AMBER;
  return 'var(--trade-bearish)';
}

function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60">{label}</div>
      <div className="font-mono font-bold tabular-nums" style={{ color: accent ?? 'var(--foreground)' }}>{value}</div>
    </div>
  );
}

function fmtExpiry(expiry: string): string {
  try {
    const d = parseMarketDate(expiry) ?? new Date(expiry);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {}
  return expiry;
}

export function OracleOptionPicker({
  symbol, direction, entry, stop, t1, t2, holdPeriodLabel, conviction, autoLoad, onSelect,
}: Props) {
  const [selection, setSelection] = useState<EngineSelection | null>(null);
  const [chosen, setChosen] = useState<Tier | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/options/select', {
        symbol,
        direction: direction === 'BEAR' ? 'bearish' : 'bullish',
        setup: labelToSetup(holdPeriodLabel),
        entry,
        stop,
        t1,
        t2,
        conviction,
      });
      return (await res.json()) as EngineSelection;
    },
    onSuccess: (data) => {
      setSelection(data);
      setChosen(data.recommendedTier);
    },
  });

  const { mutate } = mutation;
  // Auto-fetch contracts on mount / when the thesis changes (per-ticker reload).
  useEffect(() => {
    if (autoLoad && direction !== 'NEUTRAL') mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, symbol, direction, entry, stop, t1, t2]);

  // No options thesis for neutral signals.
  if (direction === 'NEUTRAL') return null;

  if (!selection && !mutation.isPending && !autoLoad) {
    return (
      <button
        onClick={() => mutation.mutate()}
        className="w-full text-xs font-mono px-3 py-2.5 rounded-lg bg-card border border-[var(--brand-cyan)]/25 text-[var(--brand-cyan)] hover:bg-[var(--brand-cyan)]/10 hover:border-[var(--brand-cyan)]/40 transition-colors font-bold tracking-wide cursor-pointer"
        data-testid="button-find-contracts"
      >
        FIND BEST CONTRACTS · 3 TIERS
      </button>
    );
  }

  if ((!selection && !mutation.isPending) || mutation.isPending) {
    // autoLoad pending OR live scan in flight — same calm skeleton chrome.
    return (
      <div className="text-xs font-mono text-muted-foreground px-4 py-3 rounded-lg bg-card border border-card-border animate-pulse">
        {mutation.isPending
          ? `Scanning live chain for ${symbol} ${direction === 'BEAR' ? 'puts' : 'calls'}…`
          : `Loading contracts for ${symbol}…`}
      </div>
    );
  }

  if (mutation.isError) {
    return (
      <div className="text-xs font-mono text-[var(--trade-bearish)] px-4 py-3 rounded-lg bg-card border border-[var(--trade-bearish)]/25">
        Contract selection failed. <button onClick={() => mutation.mutate()} className="underline cursor-pointer">Retry</button>
      </div>
    );
  }

  if (!selection) return null;

  if (selection.status !== 'ok' || selection.picks.length === 0) {
    return (
      <div className="text-xs font-mono text-muted-foreground px-4 py-3 rounded-lg bg-card border border-card-border" data-testid="picker-empty">
        <span className="text-muted-foreground/60 uppercase tracking-wider text-[10px]">Contract Engine · </span>
        {selection.note ?? 'No liquid contract available for this thesis.'}
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-card-border bg-card overflow-hidden" data-testid="oracle-option-picker">
      <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border/30">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
          Contract Engine · Pick Tier
        </span>
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">
          Spot ${selection.spot.toFixed(2)} · {selection.dteWindow.min}-{selection.dteWindow.max}DTE
        </span>
      </header>

      <div className="p-4 grid grid-cols-1 gap-2">
        {selection.picks.map((p) => {
          const st = TIER_STYLE[p.tier];
          const isChosen = chosen === p.tier;
          const isRecommended = selection.recommendedTier === p.tier;
          const gc = gradeColor(p.grade);
          return (
            <button
              key={p.tier}
              onClick={() => { setChosen(p.tier); onSelect?.(p); }}
              data-testid={`tier-${p.tier}`}
              className="text-left rounded-md border p-2.5 transition-colors cursor-pointer bg-foreground/[0.02] hover:bg-foreground/[0.05]"
              style={{
                borderColor: isChosen ? st.color : 'var(--card-border)',
                boxShadow: isChosen ? `inset 3px 0 14px -8px ${st.color}` : undefined,
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold tracking-widest" style={{ color: st.color }}>{st.label}</span>
                  {isRecommended && (
                    <span
                      className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                      style={{ color: 'var(--brand-cyan)', background: 'color-mix(in srgb, var(--brand-cyan) 14%, transparent)' }}
                    >
                      Rec
                    </span>
                  )}
                </div>
                <span
                  className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded tabular-nums"
                  style={{ color: gc, background: `color-mix(in srgb, ${gc} 14%, transparent)` }}
                >
                  {p.grade} · {p.score}
                </span>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-base font-mono font-bold text-foreground tabular-nums">
                  ${p.strike}{p.optionType === 'call' ? 'C' : 'P'}
                  <span className="text-[11px] font-normal text-muted-foreground/60 ml-1.5">
                    {fmtExpiry(p.expiry)} · {p.dte}DTE
                  </span>
                </span>
                <span className="text-base font-mono font-bold tabular-nums" style={{ color: AMBER }}>${p.entryPremium.toFixed(2)}</span>
              </div>

              {/* Liquidity row — premium / OI / volume / IV */}
              <div className="grid grid-cols-4 gap-1 mt-2 text-[11px]">
                <Stat label="Bid×Ask" value={`${p.bid.toFixed(2)}×${p.ask.toFixed(2)}`} />
                <Stat label="OI" value={fmtCompact(p.openInterest)} />
                <Stat label="Vol" value={fmtCompact(p.volume)} />
                <Stat label="IV" value={`${(p.iv * 100).toFixed(0)}%`} />
              </div>

              {/* Greeks row */}
              <div className="grid grid-cols-4 gap-1 mt-1.5 text-[11px]">
                <Stat label="Δ" value={p.delta.toFixed(2)} accent="var(--brand-cyan)" />
                <Stat label="Γ" value={p.gamma.toFixed(3)} />
                <Stat label="Θ" value={p.theta.toFixed(2)} />
                <Stat label="V" value={p.vega.toFixed(2)} />
              </div>

              {/* Trade math row — ROI / R:R / BE */}
              <div className="grid grid-cols-3 gap-1 mt-1.5 text-[11px]">
                <Stat
                  label="ROI @T1"
                  value={`${p.roiAtT1Pct >= 0 ? '+' : ''}${p.roiAtT1Pct.toFixed(0)}%`}
                  accent={p.roiAtT1Pct >= 0 ? 'var(--trade-bullish)' : 'var(--trade-bearish)'}
                />
                <Stat label="R:R" value={`${p.riskRewardRatio.toFixed(1)}:1`} />
                <Stat label="BE" value={`$${p.breakeven.toFixed(2)}`} />
              </div>

              {isChosen && (
                <p className="text-[10px] font-mono text-muted-foreground/80 mt-2 leading-snug border-t border-border/30 pt-2">
                  {p.rationale}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
