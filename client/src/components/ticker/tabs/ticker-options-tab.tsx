/**
 * TickerOptionsTab — options chain + unusual flow for a single symbol.
 * Fetches its own data from /api/options-analyzer endpoints.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn, safeToFixed } from '@/lib/utils';
import { Link } from 'wouter';
import { ChevronDown, ExternalLink } from 'lucide-react';

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

interface TickerOptionsTabProps {
  symbol: string;
}

export function TickerOptionsTab({ symbol }: TickerOptionsTabProps) {
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
  const strikes = Array.from(new Set(chain.map(o => o.strike))).sort((a, b) => a - b);
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

        <Link href={`/options-analyzer?symbol=${symbol}`}>
          <span className="text-[10px] font-mono text-[var(--brand-teal)] hover:text-[var(--brand-cyan)] flex items-center gap-1 cursor-pointer">
            Full Analyzer <ExternalLink className="w-3 h-3" />
          </span>
        </Link>
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
