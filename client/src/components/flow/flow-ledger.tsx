import { useState } from 'react';
import { ChevronDown, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlowPrint, FlowScore } from '@/lib/flow/flow-score';

const money = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`;
const expiry = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function FlowLedger({
  rows, watched, onWatch, onSelect,
}: {
  rows: Array<{ print: FlowPrint; score: FlowScore }>;
  watched: Set<string>;
  onWatch: (symbol: string) => void;
  onSelect?: (symbol: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-lg border border-card-border bg-card shadow-[0_18px_60px_rgba(0,0,0,0.14)]">
      <div className="h-px bg-gradient-to-r from-[var(--trade-bearish)] via-[var(--brand-gold)] to-[var(--trade-bullish)] opacity-75" />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse font-mono tabular-nums">
          <thead className="sticky top-0 z-10 bg-card/95 text-[9px] uppercase tracking-[0.13em] text-muted-foreground/70 backdrop-blur-xl">
            <tr className="border-b border-border/60">
              <th className="w-10 px-3 py-2 text-right">#</th>
              <th className="px-3 py-2 text-left">Symbol</th>
              <th className="px-3 py-2 text-left">Contract</th>
              <th className="px-3 py-2 text-left">Inferred bias</th>
              <th className="px-3 py-2 text-left">Pattern</th>
              <th className="px-3 py-2 text-left">Flow score ↓</th>
              <th className="px-3 py-2 text-right">Premium</th>
              <th className="px-3 py-2 text-right">Vol / OI</th>
              <th className="px-3 py-2 text-right">OTM</th>
              <th className="px-3 py-2 text-right">DTE</th>
              <th className="px-3 py-2 text-right">Observed</th>
              <th className="w-12 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ print, score }, index) => {
              const key = `${print.symbol}-${print.optionType}-${print.strikePrice}-${print.expirationDate}-${index}`;
              const open = expanded === key;
              const bull = print.sentiment === 'bullish';
              const measured = print.sentiment === 'bullish' || print.sentiment === 'bearish';
              const tone = !measured ? 'var(--brand-cyan)' : bull ? 'var(--trade-bullish)' : 'var(--trade-bearish)';
              const volOi = print.volumeOIRatio ?? (print.openInterest ? print.volume / Math.max(1, print.openInterest) : null);
              const observed = print.detectedAt ? new Date(print.detectedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—';
              return (
                <FragmentRow key={key}>
                  <tr
                    onClick={() => setExpanded(open ? null : key)}
                    className="cursor-pointer border-b border-border/30 text-[10px] text-foreground/85 transition-colors odd:bg-foreground/[0.008] hover:bg-foreground/[0.04]"
                  >
                    <td className="px-3 py-2 text-right text-muted-foreground/50">{index + 1}</td>
                    <td className="px-3 py-2"><button type="button" onClick={(event) => { event.stopPropagation(); onSelect?.(print.symbol); }} className="text-[12px] font-bold tracking-wide text-foreground hover:text-[var(--brand-cyan)]">{print.symbol}</button></td>
                    <td className="px-3 py-2"><span className="font-semibold" style={{ color: tone }}>${print.strikePrice}{print.optionType === 'call' ? 'C' : 'P'}</span><span className="ml-2 text-muted-foreground">{expiry(print.expirationDate)}</span></td>
                    <td className="px-3 py-2 font-semibold" style={{ color: tone }}>{print.sentiment === 'bullish' ? '▲ BULL' : print.sentiment === 'bearish' ? '▼ BEAR' : print.sentiment === 'unknown' ? '· UNVERIFIED' : '◆ NEUTRAL'}</td>
                    <td className="px-3 py-2"><div className="flex items-center gap-1.5">{score.isWhale && <Tag tone="gold">WHALE</Tag>}{score.isSweep && <Tag tone="cyan">SWEEP</Tag>}{score.isRepeat && <Tag tone="bull">REPEAT</Tag>}{!score.isWhale && !score.isSweep && !score.isRepeat && <span className="uppercase text-muted-foreground">{print.flowType.replace('_', ' ')}</span>}</div></td>
                    <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-foreground/[0.08]"><div className="h-full rounded-full bg-gradient-to-r from-[var(--brand-cyan)] to-[var(--trade-bullish)]" style={{ width: `${score.score}%` }} /></div><b className="text-[12px] text-foreground">{score.score}</b><span className="text-muted-foreground">{score.score >= 80 ? 'STRONG' : score.score >= 65 ? 'MODERATE' : score.score >= 50 ? 'LIGHT' : 'WEAK'}</span></div></td>
                    <td className="px-3 py-2 text-right font-semibold text-foreground">{money(score.totalPremium)}</td>
                    <td className="px-3 py-2 text-right">{print.volume.toLocaleString()} / {print.openInterest?.toLocaleString() ?? '—'}{volOi != null && <span className="ml-1.5 text-muted-foreground">{volOi.toFixed(1)}×</span>}</td>
                    <td className="px-3 py-2 text-right">{score.pctOtm == null ? '—' : `${score.pctOtm >= 0 ? '+' : ''}${score.pctOtm.toFixed(1)}%`}</td>
                    <td className={cn('px-3 py-2 text-right', (score.dte ?? 99) <= 7 && 'text-[var(--brand-gold)]')}>{score.dte ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{observed}</td>
                    <td className="px-3 py-2"><div className="flex items-center justify-end gap-2"><button type="button" aria-label={`${watched.has(print.symbol) ? 'Remove' : 'Add'} ${print.symbol} watchlist`} onClick={(event) => { event.stopPropagation(); onWatch(print.symbol); }} className={watched.has(print.symbol) ? 'text-[var(--brand-gold)]' : 'text-muted-foreground/45 hover:text-foreground'}><Star className={cn('h-3.5 w-3.5', watched.has(print.symbol) && 'fill-current')} /></button><ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} /></div></td>
                  </tr>
                  {open && (
                    <tr className="border-b border-border/40 bg-muted/20">
                      <td colSpan={12} className="px-12 py-3">
                        <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
                          {score.components.map((component) => (
                            <div key={component.label} className="grid grid-cols-[94px_28px_minmax(0,1fr)] items-baseline gap-2 text-[9px]">
                              <span className="uppercase tracking-wider text-muted-foreground">{component.label}</span>
                              <b className={component.points >= 0 ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]'}>{component.points >= 0 ? '+' : ''}{component.points}</b>
                              <span className="text-muted-foreground">{component.why}</span>
                            </div>
                          ))}
                        </div>
                        <p className="mt-3 text-[9px] text-muted-foreground">Aggregate chain activity ranks attention. Execution side and opening/closing intent are not observed; confirm on the chart.</p>
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between border-t border-border/50 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60"><span>{rows.length} contract observations</span><span>click row for evidence · ticker opens research</span></div>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) { return <>{children}</>; }

function Tag({ tone, children }: { tone: 'gold' | 'cyan' | 'bull'; children: React.ReactNode }) {
  const cls = tone === 'gold' ? 'border-[var(--brand-gold)]/25 bg-[var(--brand-gold)]/8 text-[var(--brand-gold)]' : tone === 'bull' ? 'border-[var(--trade-bullish)]/25 bg-[var(--trade-bullish)]/8 text-[var(--trade-bullish)]' : 'border-[var(--brand-cyan)]/25 bg-[var(--brand-cyan)]/8 text-[var(--brand-cyan)]';
  return <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-bold ${cls}`}>{children}</span>;
}
