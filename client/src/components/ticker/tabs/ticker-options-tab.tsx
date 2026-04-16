/**
 * TickerOptionsTab — options chain + OI map for a single symbol.
 * Two views: Chain (bilateral strike table) and OI Map (multi-expiry OI summary).
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn, safeToFixed } from '@/lib/utils';
import { Link } from 'wouter';
import { ChevronDown, ExternalLink, BarChart3, Table2 } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChainOption {
  strike: number;
  optionType: 'call' | 'put';
  expiration: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  iv: number;
  delta: number;
  inTheMoney: boolean;
}

interface ChainResponse {
  symbol: string;
  stockPrice: number;
  chain: ChainOption[];
}

interface ExpResponse {
  symbol: string;
  expirations: Array<{ date: string; dte: number }>;
}

interface OISummaryResponse {
  symbol: string;
  spotPrice: number;
  totalCallOI: number;
  totalPutOI: number;
  expirations: Array<{
    expiration: string;
    dte: number;
    callOI: number;
    putOI: number;
    callVol: number;
    putVol: number;
    pcRatio: number;
    totalOI: number;
    totalVol: number;
    maxOIStrike: number;
    maxOI: number;
  }>;
  strikes: Array<{
    strike: number;
    callOI: number;
    putOI: number;
    totalOI: number;
    callVol: number;
    putVol: number;
    avgIV: number | null;
  }>;
}

type ViewMode = 'chain' | 'oi-map';

interface TickerOptionsTabProps {
  symbol: string;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function TickerOptionsTab({ symbol }: TickerOptionsTabProps) {
  const [view, setView] = useState<ViewMode>('chain');

  return (
    <div className="space-y-4">
      {/* View Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 p-0.5 rounded-md bg-[var(--surface-raised)] border border-border">
          <button
            onClick={() => setView('chain')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-mono uppercase transition-colors',
              view === 'chain'
                ? 'bg-[var(--brand-teal)]/15 text-[var(--brand-teal)] font-bold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Table2 className="w-3 h-3" />
            Chain
          </button>
          <button
            onClick={() => setView('oi-map')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-mono uppercase transition-colors',
              view === 'oi-map'
                ? 'bg-[var(--brand-teal)]/15 text-[var(--brand-teal)] font-bold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <BarChart3 className="w-3 h-3" />
            OI Map
          </button>
        </div>

        <Link href={`/options-analyzer?symbol=${symbol}`}>
          <span className="text-[10px] font-mono text-[var(--brand-teal)] hover:text-[var(--brand-cyan)] flex items-center gap-1 cursor-pointer">
            Full Analyzer <ExternalLink className="w-3 h-3" />
          </span>
        </Link>
      </div>

      {view === 'chain' ? <ChainView symbol={symbol} /> : <OIMapView symbol={symbol} />}
    </div>
  );
}

// ─── Chain View (original) ──────────────────────────────────────────────────

function ChainView({ symbol }: { symbol: string }) {
  const [selectedExp, setSelectedExp] = useState<string>('');

  const { data: expData } = useQuery<ExpResponse>({
    queryKey: ['/api/options-analyzer/expirations', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/options-analyzer/expirations/${symbol}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch expirations');
      return res.json();
    },
    staleTime: 300_000,
  });

  const expirations = expData?.expirations ?? [];
  const activeExp = selectedExp || expirations[0]?.date || '';

  const { data: chainData, isLoading } = useQuery<ChainResponse>({
    queryKey: ['/api/options-analyzer/chain', symbol, activeExp],
    queryFn: async () => {
      const res = await fetch(`/api/options-analyzer/chain/${symbol}?expiration=${activeExp}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch chain');
      return res.json();
    },
    enabled: !!activeExp,
    staleTime: 60_000,
  });

  const chain = chainData?.chain ?? [];
  const spotPrice = chainData?.stockPrice ?? 0;

  // Group by strike
  const strikeSet = new Set(chain.map(o => o.strike));
  const strikes = Array.from(strikeSet).sort((a, b) => a - b);
  const callMap = new Map<number, ChainOption>();
  const putMap = new Map<number, ChainOption>();
  for (const opt of chain) {
    if (opt.optionType === 'call') callMap.set(opt.strike, opt);
    else putMap.set(opt.strike, opt);
  }

  // P/C ratios
  const totalCallOI = chain.filter(o => o.optionType === 'call').reduce((s, o) => s + o.openInterest, 0);
  const totalPutOI = chain.filter(o => o.optionType === 'put').reduce((s, o) => s + o.openInterest, 0);
  const totalCallVol = chain.filter(o => o.optionType === 'call').reduce((s, o) => s + o.volume, 0);
  const totalPutVol = chain.filter(o => o.optionType === 'put').reduce((s, o) => s + o.volume, 0);
  const pcOI = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;
  const pcVol = totalCallVol > 0 ? totalPutVol / totalCallVol : 0;

  // Focus around ATM — show 10 strikes above and below spot
  const atmIdx = strikes.findIndex(s => s >= spotPrice);
  const visibleStrikes = strikes.slice(Math.max(0, atmIdx - 10), atmIdx + 11);

  return (
    <div className="space-y-4">
      {/* Expiration Selector + P/C Ratios */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono uppercase text-muted-foreground">EXPIRATION</span>
          <div className="relative">
            <select
              value={activeExp}
              onChange={(e) => setSelectedExp(e.target.value)}
              className="appearance-none bg-[var(--surface-raised)] border border-border rounded px-3 py-1 pr-7 text-xs font-mono text-foreground cursor-pointer focus:outline-none focus:border-[var(--brand-teal)]"
            >
              {expirations.map((exp) => (
                <option key={exp.date} value={exp.date}>
                  {exp.date} ({exp.dte}d)
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center gap-4 text-[10px] font-mono">
          <span className="text-muted-foreground">P/C OI: <span className="text-foreground font-bold">{safeToFixed(pcOI, 2)}</span></span>
          <span className="text-muted-foreground">P/C Vol: <span className="text-foreground font-bold">{safeToFixed(pcVol, 2)}</span></span>
          <span className="text-muted-foreground">Spot: <span className="text-foreground font-bold">${safeToFixed(spotPrice, 2)}</span></span>
        </div>
      </div>

      {/* Chain Table */}
      {isLoading ? (
        <div className="text-center py-8 text-xs font-mono text-muted-foreground">Loading chain...</div>
      ) : visibleStrikes.length === 0 ? (
        <div className="text-center py-8 text-xs font-mono text-muted-foreground">No options data available</div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="bg-[var(--surface-raised)]">
                <th colSpan={5} className="px-2 py-1 text-center text-[var(--trade-bullish)] text-[9px] uppercase border-b border-border">
                  CALLS
                </th>
                <th className="px-2 py-1 text-center text-[9px] uppercase border-b border-border text-foreground bg-muted/50">
                  STRIKE
                </th>
                <th colSpan={5} className="px-2 py-1 text-center text-[var(--trade-bearish)] text-[9px] uppercase border-b border-border">
                  PUTS
                </th>
              </tr>
              <tr className="bg-[var(--surface-raised)] text-[8px] text-muted-foreground uppercase">
                <th className="px-2 py-1 text-right">OI</th>
                <th className="px-2 py-1 text-right">Vol</th>
                <th className="px-2 py-1 text-right">IV</th>
                <th className="px-2 py-1 text-right">Bid</th>
                <th className="px-2 py-1 text-right">Ask</th>
                <th className="px-2 py-1 text-center bg-muted/50">$</th>
                <th className="px-2 py-1 text-right">Bid</th>
                <th className="px-2 py-1 text-right">Ask</th>
                <th className="px-2 py-1 text-right">IV</th>
                <th className="px-2 py-1 text-right">Vol</th>
                <th className="px-2 py-1 text-right">OI</th>
              </tr>
            </thead>
            <tbody>
              {visibleStrikes.map((strike) => {
                const call = callMap.get(strike);
                const put = putMap.get(strike);
                const isATM = Math.abs(strike - spotPrice) <= (spotPrice * 0.005);
                return (
                  <tr key={strike} className={cn(
                    'border-t border-border/30 hover:bg-muted/20 transition-colors',
                    isATM && 'bg-[var(--brand-teal)]/5 border-[var(--brand-teal)]/20',
                    call?.inTheMoney && 'bg-[var(--trade-bullish)]/[0.03]'
                  )}>
                    <td className="px-2 py-1 text-right text-muted-foreground">{call?.openInterest?.toLocaleString() || '—'}</td>
                    <td className="px-2 py-1 text-right text-muted-foreground">{call?.volume?.toLocaleString() || '—'}</td>
                    <td className="px-2 py-1 text-right text-foreground">{call ? safeToFixed(call.iv * 100, 1) + '%' : '—'}</td>
                    <td className="px-2 py-1 text-right text-foreground">{call ? safeToFixed(call.bid, 2) : '—'}</td>
                    <td className="px-2 py-1 text-right text-foreground">{call ? safeToFixed(call.ask, 2) : '—'}</td>
                    <td className={cn('px-2 py-1 text-center font-bold bg-muted/30', isATM && 'text-[var(--brand-teal)]')}>
                      {safeToFixed(strike, strike >= 100 ? 0 : 1)}
                    </td>
                    <td className="px-2 py-1 text-right text-foreground">{put ? safeToFixed(put.bid, 2) : '—'}</td>
                    <td className="px-2 py-1 text-right text-foreground">{put ? safeToFixed(put.ask, 2) : '—'}</td>
                    <td className="px-2 py-1 text-right text-foreground">{put ? safeToFixed(put.iv * 100, 1) + '%' : '—'}</td>
                    <td className="px-2 py-1 text-right text-muted-foreground">{put?.volume?.toLocaleString() || '—'}</td>
                    <td className="px-2 py-1 text-right text-muted-foreground">{put?.openInterest?.toLocaleString() || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── OI Map View ────────────────────────────────────────────────────────────

function OIMapView({ symbol }: { symbol: string }) {
  const { data, isLoading } = useQuery<OISummaryResponse>({
    queryKey: ['/api/options-analyzer/oi-summary', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/options-analyzer/oi-summary/${symbol}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch OI summary');
      return res.json();
    },
    staleTime: 300_000,
  });

  if (isLoading) {
    return <div className="text-center py-8 text-xs font-mono text-muted-foreground">Loading OI map across expirations...</div>;
  }

  if (!data || data.expirations.length === 0) {
    return <div className="text-center py-8 text-xs font-mono text-muted-foreground">No options data available</div>;
  }

  const totalOI = data.totalCallOI + data.totalPutOI;
  const pcRatio = data.totalCallOI > 0 ? data.totalPutOI / data.totalCallOI : 0;
  const maxStrikeOI = Math.max(...data.strikes.map(s => s.totalOI), 1);

  return (
    <div className="space-y-4">
      {/* Summary Strip */}
      <div className="flex items-center gap-4 text-[10px] font-mono flex-wrap">
        <span className="text-muted-foreground">
          Spot: <span className="text-foreground font-bold">${safeToFixed(data.spotPrice, 2)}</span>
        </span>
        <span className="text-muted-foreground">
          Total OI: <span className="text-foreground font-bold">{totalOI.toLocaleString()}</span>
        </span>
        <span className="text-muted-foreground">
          Call OI: <span className="text-[var(--trade-bullish)] font-bold">{data.totalCallOI.toLocaleString()}</span>
        </span>
        <span className="text-muted-foreground">
          Put OI: <span className="text-[var(--trade-bearish)] font-bold">{data.totalPutOI.toLocaleString()}</span>
        </span>
        <span className="text-muted-foreground">
          P/C: <span className={cn('font-bold', pcRatio < 0.7 ? 'text-[var(--trade-bullish)]' : pcRatio > 1.0 ? 'text-[var(--trade-bearish)]' : 'text-foreground')}>
            {safeToFixed(pcRatio, 2)}
          </span>
        </span>
      </div>

      {/* Per-Expiry Summary Table */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="bg-[var(--surface-raised)] text-[8px] text-muted-foreground uppercase">
              <th className="px-2 py-1.5 text-left">Expiration</th>
              <th className="px-2 py-1.5 text-right">DTE</th>
              <th className="px-2 py-1.5 text-right text-[var(--trade-bullish)]">Call OI</th>
              <th className="px-2 py-1.5 text-right text-[var(--trade-bearish)]">Put OI</th>
              <th className="px-2 py-1.5 text-right">Total OI</th>
              <th className="px-2 py-1.5 text-right">P/C</th>
              <th className="px-2 py-1.5 text-right">Volume</th>
              <th className="px-2 py-1.5 text-right">Max OI Strike</th>
              <th className="px-2 py-1.5 text-left w-[120px]">Bias</th>
            </tr>
          </thead>
          <tbody>
            {data.expirations.map((exp) => {
              const bias = exp.pcRatio < 0.7 ? 'bullish' : exp.pcRatio > 1.0 ? 'bearish' : 'neutral';
              const oiPct = totalOI > 0 ? (exp.totalOI / totalOI * 100) : 0;
              return (
                <tr key={exp.expiration} className="border-t border-border/30 hover:bg-muted/20 transition-colors">
                  <td className="px-2 py-1.5 text-foreground font-semibold">{exp.expiration}</td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">{exp.dte}d</td>
                  <td className="px-2 py-1.5 text-right text-[var(--trade-bullish)]">{exp.callOI.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right text-[var(--trade-bearish)]">{exp.putOI.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right text-foreground font-semibold">
                    {exp.totalOI.toLocaleString()}
                    <span className="text-muted-foreground/60 ml-1 text-[9px]">({safeToFixed(oiPct, 0)}%)</span>
                  </td>
                  <td className={cn(
                    'px-2 py-1.5 text-right font-semibold',
                    bias === 'bullish' ? 'text-[var(--trade-bullish)]' : bias === 'bearish' ? 'text-[var(--trade-bearish)]' : 'text-muted-foreground'
                  )}>
                    {safeToFixed(exp.pcRatio, 2)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">{exp.totalVol.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right text-[var(--brand-teal)] font-bold">${exp.maxOIStrike}</td>
                  <td className="px-2 py-1.5">
                    <span className={cn(
                      'inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase',
                      bias === 'bullish' ? 'bg-[var(--trade-bullish)]/10 text-[var(--trade-bullish)]'
                        : bias === 'bearish' ? 'bg-[var(--trade-bearish)]/10 text-[var(--trade-bearish)]'
                        : 'bg-muted text-muted-foreground'
                    )}>
                      {bias}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Per-Strike OI Heatmap */}
      <div>
        <h4 className="text-[9px] font-mono uppercase text-muted-foreground mb-2 tracking-wider">
          OI by Strike (all expirations)
        </h4>
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="bg-[var(--surface-raised)] text-[8px] text-muted-foreground uppercase">
                <th className="px-2 py-1.5 text-center w-[60px]">Strike</th>
                <th className="px-2 py-1.5 text-right w-[70px]">Call OI</th>
                <th className="px-2 py-1.5 w-[40%]">
                  <div className="flex justify-between"><span>Calls</span><span>Puts</span></div>
                </th>
                <th className="px-2 py-1.5 text-right w-[70px]">Put OI</th>
                <th className="px-2 py-1.5 text-right w-[70px]">Total</th>
                <th className="px-2 py-1.5 text-right w-[50px]">IV</th>
              </tr>
            </thead>
            <tbody>
              {data.strikes.map((s) => {
                const isATM = Math.abs(s.strike - data.spotPrice) <= (data.spotPrice * 0.02);
                const callPct = maxStrikeOI > 0 ? (s.callOI / maxStrikeOI) * 100 : 0;
                const putPct = maxStrikeOI > 0 ? (s.putOI / maxStrikeOI) * 100 : 0;
                const isAboveSpot = s.strike > data.spotPrice;
                return (
                  <tr key={s.strike} className={cn(
                    'border-t border-border/30 hover:bg-muted/20 transition-colors',
                    isATM && 'bg-[var(--brand-teal)]/5'
                  )}>
                    <td className={cn(
                      'px-2 py-1 text-center font-bold',
                      isATM ? 'text-[var(--brand-teal)]' : 'text-foreground'
                    )}>
                      ${s.strike}
                      {isATM && <span className="text-[8px] text-[var(--brand-teal)]/60 ml-0.5">ATM</span>}
                    </td>
                    <td className="px-2 py-1 text-right text-[var(--trade-bullish)]">
                      {s.callOI.toLocaleString()}
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-0.5 h-4">
                        {/* Call bar (grows right from center) */}
                        <div className="flex-1 flex justify-end">
                          <div
                            className="h-3 rounded-l bg-[var(--trade-bullish)]/40"
                            style={{ width: `${Math.min(callPct, 100)}%` }}
                          />
                        </div>
                        <div className="w-px h-4 bg-border/60 flex-shrink-0" />
                        {/* Put bar (grows left from center) */}
                        <div className="flex-1">
                          <div
                            className="h-3 rounded-r bg-[var(--trade-bearish)]/40"
                            style={{ width: `${Math.min(putPct, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1 text-right text-[var(--trade-bearish)]">
                      {s.putOI.toLocaleString()}
                    </td>
                    <td className="px-2 py-1 text-right text-foreground font-semibold">
                      {s.totalOI.toLocaleString()}
                    </td>
                    <td className="px-2 py-1 text-right text-muted-foreground">
                      {s.avgIV != null ? `${s.avgIV}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
