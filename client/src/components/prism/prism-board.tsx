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
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { GEXExpiryMatrix } from '@/components/gex/gex-expiry-matrix';
import { useStockContext } from '@/contexts/stock-context';
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

export function PrismBoard() {
  // SPY is the benchmark read; the shared ticker overrides it.
  const { currentStock } = useStockContext();
  const symbol = (currentStock?.symbol || 'SPY').toUpperCase();

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
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        {/* ── the surface ── */}
        <div className="rounded-xl border border-card-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">
              Prism · <span className="text-[var(--brand-cyan,#22d3ee)]">{symbol}</span>
            </span>
            <span className="text-[10px] font-mono text-muted-foreground/60">strike × expiry · green calls · red puts</span>
          </div>

          {isLoading ? (
            <div className="flex h-72 items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> reading the surface…
            </div>
          ) : isError || !snap || matrix.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="text-[11px] font-mono uppercase tracking-widest text-foreground/70">No surface for {symbol}</div>
              <p className="mx-auto mt-2 max-w-md text-[11px] leading-relaxed text-muted-foreground/60">
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
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">Context</span>
              <span className="text-[10px] font-mono text-muted-foreground/60">what it means</span>
            </div>

            {snap && read ? (
              <div className="space-y-2.5 px-4 py-3">
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Spot" value={`$${snap.spotPrice.toFixed(2)}`} />
                  <Stat label="Net GEX" value={fmtGex(snap.totalGEX ?? 0)} color={read.positive ? BULL : BEAR} />
                  <Stat label="Call wall" value={snap.callWall ? `$${snap.callWall}` : '—'} color={BULL} />
                  <Stat label="Put support" value={snap.putWall ? `$${snap.putWall}` : '—'} color={BEAR} />
                </div>

                {/* call vs put share of the surface */}
                <div>
                  <div className="mb-1 flex items-center justify-between text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60">
                    <span style={{ color: BULL }}>calls {read.callShare.toFixed(0)}%</span>
                    <span style={{ color: BEAR }}>{(100 - read.callShare).toFixed(0)}% puts</span>
                  </div>
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-foreground/8">
                    <div style={{ width: `${read.callShare}%`, background: BULL }} />
                    <div style={{ width: `${100 - read.callShare}%`, background: BEAR }} />
                  </div>
                </div>

                <p className="text-[12px] leading-relaxed text-foreground/85">
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
                    <div className="mb-0.5 text-[9px] font-mono uppercase tracking-widest text-[#e0a458]">Time is your best friend</div>
                    <div className="text-[11px] leading-relaxed text-foreground/80">
                      The strongest node sits only {read.up.dte}d out. Consider the same strike on a later
                      expiry — you pay more premium, but the thesis gets room to play out.
                    </div>
                  </div>
                )}

                <p className="pt-1 text-[10px] leading-relaxed text-muted-foreground/50">
                  Lit-up nodes mark likely support, resistance and magnets — they are levels, not entries.
                  Confirm on the chart before trading.
                </p>
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground/45">
                no reading yet
              </div>
            )}
          </div>

          <div className="rounded-xl border border-card-border bg-card px-4 py-3">
            <div className="mb-1.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/60">How to read</div>
            <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground/70">
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
      <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50">{label}</div>
      <div className="mt-0.5 text-[13px] font-mono font-bold tabular-nums" style={{ color: color ?? 'var(--foreground)' }}>{value}</div>
    </div>
  );
}

function Level({ label, strike, expiry, dte, color }: { label: string; strike: number; expiry: string; dte: number; color: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-t border-border/30 pt-2">
      <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60">{label}</span>
      <span className="text-[11px] font-mono tabular-nums" style={{ color }}>
        ${strike} <span className="text-muted-foreground/50">· {expiry} · {dte}d</span>
      </span>
    </div>
  );
}
