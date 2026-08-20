/**
 * TICKER VIEW — what you get when you search a symbol that isn't a signal.
 *
 * The terminal search set the shared ticker, but every Oracle panel renders the SELECTED
 * SIGNAL, so searching MSFT changed nothing on screen: no chart, no quote, no
 * acknowledgement it happened. A search that silently does nothing is worse than no search.
 *
 * This is the fallback surface — the chart plus a live quote for any ticker, whether or
 * not the engine has an opinion on it, and it says plainly when there's no signal.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { EpochChart } from '@/components/charting/epoch-chart';
import { OracleOptionPicker } from '@/components/signal-card/OracleOptionPicker';
import { EASE, DUR } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { TC, pnlColor } from '@/lib/oracle/trading-colors';
import { ScoreDial, RangeBar, StackedBar, Pill } from '@/components/viz';
import { convictionPercent, bandStrength, type ConvictionPick } from '@/lib/convictions';

interface Ext {
  symbol: string; lastPrice: number; previousClose: number;
  changePct: number; session: string; isExtended: boolean;
}

/**
 * Rendered as an OVERLAY, not inline.
 *
 * Inline it pushed the whole board down and read as though the terminal had navigated
 * somewhere — a lookup is a detour, not a new home. Over a blurred backdrop it's obvious
 * you're inspecting one name and can dismiss back to the board.
 */
export function TickerView({ symbol, hasSignal, onClear }: {
  symbol: string; hasSignal: boolean; onClear?: () => void;
}) {
  const reduce = useReducedMotion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClear?.(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClear]);

  // Search should GRADE the ticker, not just draw it. The convictions endpoint can score
  // any symbol on demand (?symbol=), so a lookup returns the engine's actual opinion —
  // score, band, layers and levels — rather than leaving you to eyeball a chart.
  const { data: graded, isLoading: grading } = useQuery<ConvictionPick | null>({
    queryKey: ['/api/convictions', 'grade', symbol],
    queryFn: async () => {
      const r = await fetch(`/api/convictions?symbol=${encodeURIComponent(symbol)}`, { credentials: 'include' });
      if (!r.ok) return null;
      const b = await r.json();
      return (b?.picks ?? []).find((p: any) => p.symbol?.toUpperCase() === symbol) ?? null;
    },
    staleTime: 120_000, retry: 1,
  });

  const { data: q } = useQuery<Ext | null>({
    queryKey: ['/api/extended-hours/quote', symbol],
    queryFn: async () => {
      const r = await fetch(`/api/extended-hours?limit=1&symbol=${encodeURIComponent(symbol)}`, { credentials: 'include' });
      if (!r.ok) return null;
      const b = await r.json();
      const all = [...(b.gainers ?? []), ...(b.losers ?? []), ...(b.mostActive ?? [])];
      return all.find((x: Ext) => x.symbol === symbol) ?? null;
    },
    staleTime: 60_000, retry: 1,
  });

  const body = (
    <div className="rounded-xl border border-card-border bg-card overflow-hidden shadow-2xl">
      <div className="flex items-center gap-3 border-b border-border/40 px-4 py-2.5">
        <span className="text-[14px] font-mono font-bold tracking-wider text-foreground">{symbol}</span>
        {q && (
          <span className="flex items-baseline gap-2">
            <span className="text-[13px] font-mono font-bold tabular-nums text-foreground">
              ${q.lastPrice.toFixed(2)}
            </span>
            <span className="text-[11px] font-mono tabular-nums" style={{ color: pnlColor(q.changePct) }}>
              {q.changePct >= 0 ? '+' : ''}{q.changePct.toFixed(2)}%
            </span>
            {q.isExtended && (
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: TC.warn }}>
                {q.session === 'pre' ? 'pre-market' : 'after-hours'}
              </span>
            )}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
            {hasSignal ? 'signal below' : 'no active signal'}
          </span>
          {onClear && (
            <button onClick={onClear} aria-label="Clear ticker"
              className="cursor-pointer rounded p-1 text-muted-foreground/70 transition-colors hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>

      <div className="grid gap-2 p-2 lg:grid-cols-[1fr_260px]">
        <EpochChart
          symbol={symbol}
          initialTf="1D"
          height={300}
          levels={graded ? [
            { price: graded.entryPrice, color: TC.info, label: 'ENTRY' },
            { price: graded.stopLoss, color: TC.bear, label: 'STOP', dashed: true },
            { price: graded.targetPrice, color: TC.bull, label: 'T1' },
          ] : []}
        />

        {/* THE GRADE — what the engine thinks of this ticker, on demand */}
        <div className="flex flex-col gap-2 rounded-lg border border-border/40 p-3">
          {grading ? (
            <div className="grid h-full place-items-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
              grading…
            </div>
          ) : graded ? (
            <>
              <div className="flex items-center gap-3">
                <ScoreDial value={convictionPercent(graded.convictionScore)} label="grade" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1">
                    <Pill color={graded.direction === 'long' ? TC.bull : TC.bear}>
                      {graded.direction === 'long' ? 'LONG' : 'SHORT'}
                    </Pill>
                    <Pill color={TC.warn}>{graded.convictionBand}-BAND</Pill>
                  </div>
                  <div className="mt-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                    {bandStrength(graded.convictionBand)} · {graded.layerCount} layers
                  </div>
                </div>
              </div>

              {/* what's supporting vs opposing it */}
              {(() => {
                const plus = (graded.layers ?? []).filter((l) => l.points > 0).reduce((s, l) => s + l.points, 0);
                const minus = Math.abs((graded.layers ?? []).filter((l) => l.points < 0).reduce((s, l) => s + l.points, 0));
                return (
                  <div>
                    <div className="mb-1 flex justify-between text-[10px] font-mono tabular-nums">
                      <span style={{ color: TC.bull }}>+{plus} for</span>
                      <span style={{ color: TC.bear }}>{minus > 0 ? `−${minus} against` : 'nothing against'}</span>
                    </div>
                    <StackedBar segments={[
                      { value: plus, color: TC.bull, label: `+${plus} supporting` },
                      { value: minus, color: TC.bear, label: `−${minus} opposing` },
                    ]} height={6} />
                  </div>
                );
              })()}

              <div className="mt-auto">
                <RangeBar
                  stop={graded.stopLoss}
                  entry={graded.entryPrice}
                  current={q?.lastPrice ?? graded.currentPrice ?? graded.entryPrice}
                  target={graded.targetPrice}
                />
              </div>
              <div className="text-[10px] font-mono tabular-nums text-muted-foreground/70">
                R:R 1:{(graded.riskRewardRatio ?? 0).toFixed(1)} · {graded.holdingPeriod}
              </div>
            </>
          ) : (
            <div className="grid h-full place-items-center px-2 text-center">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-widest text-foreground/80">Not graded</div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground/70">
                  The engine has no setup on {symbol} — it didn't clear the layers. Chart only.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* POSSIBLE TRADES — a grade is an opinion; this is what you could actually put on.
          Only shown when the engine has a directional read, because a contract ladder with
          no thesis behind it is just a chain. */}
      {/* Scaled down: in the lookup the contracts are a supporting answer to "what could I
          put on", not the main event — the chart and the grade are. */}
      {graded && (graded.direction === 'long' || graded.direction === 'short') && (
        <div className="border-t border-border/40 p-2 [&_*]:!leading-tight">
          <div className="origin-top scale-[0.82] -mb-[14%]">
          <OracleOptionPicker
            key={`${symbol}-${graded.direction}`}
            autoLoad
            symbol={symbol}
            direction={graded.direction === 'long' ? 'BULL' : 'BEAR'}
            entry={graded.entryPrice}
            stop={graded.stopLoss}
            t1={graded.targetPrice}
            holdPeriodLabel={graded.holdingPeriod}
            conviction={graded.convictionScore}
          />
          </div>
        </div>
      )}

      {!graded && !grading && (
        <p className="border-t border-border/30 px-4 py-2 text-[11px] leading-relaxed text-muted-foreground/70">
          No setup on {symbol}, so there are no trades to suggest. GEX and PRISM are following
          this ticker if you want to read the structure yourself.
        </p>
      )}
    </div>
  );

  if (typeof document === 'undefined') return body;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[90] overflow-y-auto backdrop-blur-md"
        style={{ background: 'color-mix(in srgb, var(--background,#0a0a0a) 76%, transparent)' }}
        initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: DUR.fast }}
        onClick={() => onClear?.()}
        role="dialog" aria-label={`${symbol} lookup`}
      >
        <motion.div
          className="mx-auto my-6 w-full max-w-[1200px] px-4"
          initial={reduce ? false : { scale: 0.985, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.985, y: 10 }}
          transition={{ duration: DUR.base, ease: EASE }}
          onClick={(e) => e.stopPropagation()}
        >
          {body}
          <p className="mt-2 text-center text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
            Esc or click outside to return to the board
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
