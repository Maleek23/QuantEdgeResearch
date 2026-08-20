/**
 * PRISM — "what does the whole options surface say?"
 *
 * The strike × expiry gamma matrix plus the interpretation that makes it usable:
 *   • green = call side, red = put side; positive = more call flow at that strike.
 *   • the brightest (lit-up) nodes are the levels with the best chance of acting as
 *     support / resistance / magnets.
 *   • SPY is the default because the desk reads the market benchmark before committing
 *     to any single name.
 *   • "Time is your best friend" — when the strongest node is on a near-dated expiry we
 *     say so explicitly rather than letting the matrix imply you should buy the weekly.
 *
 * Ticker comes from the shared terminal context, so searching once in the chrome (or
 * clicking a flow card) brings you here on the same name.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { GEXExpiryMatrix } from '@/components/gex/gex-expiry-matrix';
import { StructuralRange, GravitySplit } from '@/components/viz';
import { useStockContext } from '@/contexts/stock-context';
import { cn as cnx } from '@/lib/utils';
import type { StrikeExpiryCell, GEXSnapshot } from '@shared/gex-types';

const BULL = 'var(--trade-bullish,#22c55e)';
const BEAR = 'var(--trade-bearish,#ef4444)';
const CYAN = 'var(--brand-cyan,#22d3ee)';

interface TerminalData {
  symbol: string;
  snapshot: GEXSnapshot;
  strikeExpiryMatrix: StrikeExpiryCell[];
}

const fmtGex = (v: number) => `${v >= 0 ? '+' : '−'}$${Math.abs(v).toFixed(1)}B`;

/** One ranked name from the GEX hub scan. */
interface TopPlay {
  symbol: string; sector?: string; spotPrice?: number; playScore?: number;
  conviction?: string; regime?: string; bias?: string; callWall?: number; putWall?: number;
  isNegativeGamma?: boolean; insight?: string;
}

export function PrismBoard() {
  const { currentStock, setCurrentStock } = useStockContext();

  // The ranked board from the GEX scan — this is the "top 50 ... then it'll transition
  // over here" hand-off: pick a ranked name and PRISM loads its surface.
  const { data: hub } = useQuery<{ hub: { topPlays?: TopPlay[]; marketRegime?: string; totalTickers?: number } }>({
    queryKey: ['/api/gex-vex/hub', 'prism-rail'],
    queryFn: async () => {
      const r = await fetch('/api/gex-vex/hub', { credentials: 'include' });
      if (!r.ok) throw new Error('hub failed');
      return r.json();
    },
    staleTime: 120_000,
    retry: 1,
  });
  const plays = hub?.hub?.topPlays ?? [];

  // Default to the highest-ranked name, not a hardcoded ticker. SPY is one click away as
  // the market-benchmark read, which is how the desk uses it — a destination, not a default.
  const symbol = (currentStock?.symbol || plays[0]?.symbol || 'SPY').toUpperCase();
  const select = (s: string) => setCurrentStock({ symbol: s.toUpperCase() });

  const { data, isLoading, isError } = useQuery<TerminalData>({
    queryKey: ['/api/gex-vex/terminal', symbol, 'prism'],
    queryFn: async () => {
      const r = await fetch(`/api/gex-vex/terminal/${symbol}?interval=15m&lookback=5`, { credentials: 'include' });
      if (!r.ok) throw new Error('prism failed');
      return r.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });

  const snap = data?.snapshot;
  const matrix = data?.strikeExpiryMatrix ?? [];

  /** The strongest node above and below spot — the levels worth trading around. */
  const read = useMemo(() => {
    if (!snap || matrix.length === 0) return null;
    const spot = snap.spotPrice;
    let up: StrikeExpiryCell | null = null, down: StrikeExpiryCell | null = null;
    let callMass = 0, putMass = 0;
    for (const c of matrix) {
      const g = c.netGEX ?? 0;
      if (g >= 0) callMass += g; else putMass += Math.abs(g);
      if (c.strike >= spot && (!up || Math.abs(g) > Math.abs(up.netGEX ?? 0))) up = c;
      if (c.strike < spot && (!down || Math.abs(g) > Math.abs(down.netGEX ?? 0))) down = c;
    }
    const total = callMass + putMass;
    const callShare = total > 0 ? (callMass / total) * 100 : 50;
    const positive = (snap.totalGEX ?? 0) >= 0;
    return { up, down, callShare, positive, spot };
  }, [snap, matrix]);

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="grid gap-3 xl:grid-cols-[220px_1fr_320px] lg:grid-cols-[1fr_320px]">
        {/* ── ranked board: GEX hub rankings, hand off into the surface ── */}
        <aside className="hidden xl:block rounded-xl border border-card-border bg-card overflow-hidden self-start">
          <div className="flex items-center justify-between border-b border-border/40 px-3 py-2.5">
            <span className="text-meta font-mono font-bold uppercase tracking-widest text-foreground/80">Ranked</span>
            <span className="text-label font-mono text-muted-foreground/70">
              {hub?.hub?.totalTickers ? `${hub.hub.totalTickers} scanned` : 'dealer positioning'}
            </span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            <button
              onClick={() => select('SPY')}
              className="flex w-full cursor-pointer items-center justify-between border-b border-border/30 px-3 py-2 text-left transition-colors hover:bg-foreground/5"
            >
              <span className="text-meta font-mono font-bold tracking-wider" style={{ color: CYAN }}>SPY</span>
              <span className="text-label font-mono uppercase tracking-wider text-muted-foreground/70">benchmark</span>
            </button>
            {plays.map((p, i) => {
              const active = p.symbol.toUpperCase() === symbol;
              const neg = p.isNegativeGamma;
              return (
                <button
                  key={p.symbol}
                  onClick={() => select(p.symbol)}
                  title={p.insight}
                  className={cnx(
                    'flex w-full cursor-pointer items-center gap-2 border-b border-border/20 px-3 py-1.5 text-left transition-colors hover:bg-foreground/5',
                    active && 'bg-foreground/[0.06]',
                  )}
                >
                  <span className="w-4 shrink-0 text-label font-mono tabular-nums text-muted-foreground/70">{i + 1}</span>
                  <span className={cnx('text-meta font-mono font-bold tracking-wider', active ? 'text-[var(--brand-cyan,#22d3ee)]' : 'text-foreground/85')}>
                    {p.symbol}
                  </span>
                  <span className="ml-auto text-label font-mono uppercase tracking-wider" style={{ color: neg ? BEAR : BULL }}>
                    {neg ? '−γ' : '+γ'}
                  </span>
                  <span className="w-6 text-right text-meta font-mono font-bold tabular-nums" style={{ color: (p.playScore ?? 0) >= 80 ? '#e0a458' : 'var(--foreground)' }}>
                    {p.playScore ?? '—'}
                  </span>
                </button>
              );
            })}
            {plays.length === 0 && (
              <div className="px-3 py-6 text-center text-label font-mono uppercase tracking-widest text-muted-foreground/70">
                scanning…
              </div>
            )}
          </div>
        </aside>

        {/* ── the surface ── */}
        <div className="rounded-xl border border-card-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
            <span className="text-meta font-mono font-bold uppercase tracking-widest text-foreground/80">
              Prism · <span className="text-[var(--brand-cyan,#22d3ee)]">{symbol}</span>
            </span>
            <span className="text-label font-mono text-muted-foreground/60">strike × expiry · green calls · red puts</span>
          </div>

          {isLoading ? (
            <div className="flex h-72 items-center justify-center gap-2 text-label font-mono uppercase tracking-widest text-muted-foreground/70">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> reading the surface…
            </div>
          ) : isError || !snap || matrix.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="text-meta font-mono uppercase tracking-widest text-foreground/70">No surface for {symbol}</div>
              <p className="mx-auto mt-2 max-w-md text-meta leading-relaxed text-muted-foreground/60">
                No options exposure came back for this ticker. Try a more liquid name, or search another
                ticker in the terminal bar.
              </p>
            </div>
          ) : (
            <div className="p-2">
              <GEXExpiryMatrix matrix={matrix} snapshot={snap} />
            </div>
          )}
        </div>

        {/* ── the interpretation ── */}
        <aside className="space-y-3">
          <div className="rounded-xl border border-card-border bg-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
              <span className="text-meta font-mono font-bold uppercase tracking-widest text-foreground/80">Context</span>
              <span className="text-label font-mono text-muted-foreground/60">what it means</span>
            </div>

            {snap && read ? (
              <div className="space-y-2.5 px-4 py-3">
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Spot" value={`$${snap.spotPrice.toFixed(2)}`} />
                  <Stat label="Net GEX" value={fmtGex(snap.totalGEX ?? 0)} color={read.positive ? BULL : BEAR} />
                  <Stat label="Call wall" value={snap.callWall ? `$${snap.callWall}` : '—'} color={BULL} />
                  <Stat label="Put support" value={snap.putWall ? `$${snap.putWall}` : '—'} color={BEAR} />
                </div>

                {/* THE CAGE — put support / flip / magnet / call wall with spot inside it.
                    Four prices in a list is four things to compare; one axis is a glance. */}
                <div>
                  <div className="mb-1 text-label font-mono uppercase tracking-wider text-muted-foreground/70">
                    Structural range
                  </div>
                  <StructuralRange
                    putWall={snap.putWall}
                    callWall={snap.callWall}
                    spot={snap.spotPrice}
                    flip={(snap as any).gammaFlipPrice ?? (snap as any).gammaFlip ?? null}
                    magnet={(snap as any).maxGammaStrike ?? null}
                  />
                </div>

                {/* which side the exposure is stacked on */}
                <div>
                  <div className="mb-1 text-label font-mono uppercase tracking-wider text-muted-foreground/70">
                    Gravity · call vs put exposure
                  </div>
                  <GravitySplit upPct={read.callShare} />
                </div>

                <p className="text-body leading-relaxed text-foreground/85">
                  {read.positive
                    ? 'Positive gamma — dealer hedging dampens moves. Expect price to drift and pin between levels rather than trend hard.'
                    : 'Negative gamma — dealer hedging amplifies moves. Expect bigger swings and follow-through once a level breaks.'}
                </p>

                {read.up && (
                  <Level label="Strongest node above" strike={read.up.strike} expiry={read.up.expiryLabel} dte={read.up.dte} color={BULL} />
                )}
                {read.down && (
                  <Level label="Strongest node below" strike={read.down.strike} expiry={read.down.expiryLabel} dte={read.down.dte} color={BEAR} />
                )}

                {/* buy-time nudge — the desk's most repeated rule */}
                {read.up && read.up.dte <= 7 && (
                  <div className="rounded-lg border border-border/40 bg-foreground/[0.03] px-3 py-2">
                    <div className="mb-0.5 text-label font-mono uppercase tracking-widest text-[#e0a458]">Time is your best friend</div>
                    <div className="text-meta leading-relaxed text-foreground/80">
                      The strongest node sits only {read.up.dte}d out. Consider the same strike on a later
                      expiry — you pay more premium, but the thesis gets room to play out.
                    </div>
                  </div>
                )}

                <p className="pt-1 text-label leading-relaxed text-muted-foreground/70">
                  Lit-up nodes mark likely support, resistance and magnets — they are levels, not entries.
                  Confirm on the chart before trading.
                </p>
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-label font-mono uppercase tracking-widest text-muted-foreground/70">
                no reading yet
              </div>
            )}
          </div>

          <div className="rounded-xl border border-card-border bg-card px-4 py-3">
            <div className="mb-1.5 text-label font-mono uppercase tracking-widest text-muted-foreground/60">How to read</div>
            <ul className="space-y-1 text-meta leading-relaxed text-muted-foreground/70">
              <li><b style={{ color: BULL }}>Green</b> = call side · <b style={{ color: BEAR }}>red</b> = put side.</li>
              <li>Brighter cell = more exposure at that strike.</li>
              <li>Pick the strongest node in your direction, then buy enough time.</li>
              <li>Check <b style={{ color: CYAN }}>SPY</b> first for market direction.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border/40 px-2.5 py-1.5">
      <div className="text-label font-mono uppercase tracking-wider text-muted-foreground/70">{label}</div>
      <div className="mt-0.5 text-value font-mono font-bold tabular-nums" style={{ color: color ?? 'var(--foreground)' }}>{value}</div>
    </div>
  );
}

function Level({ label, strike, expiry, dte, color }: { label: string; strike: number; expiry: string; dte: number; color: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-t border-border/30 pt-2">
      <span className="text-label font-mono uppercase tracking-wider text-muted-foreground/60">{label}</span>
      <span className="text-meta font-mono tabular-nums" style={{ color }}>
        ${strike} <span className="text-muted-foreground/70">· {expiry} · {dte}d</span>
      </span>
    </div>
  );
}
