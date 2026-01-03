import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useRealtimePrices } from '@/hooks/useRealtimePrices';
import { TrendingUp, TrendingDown, Radio, Activity, Wallet, Loader2 } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { useEffect, useState, useRef, useMemo } from 'react';

interface Position {
  id: number;
  symbol: string;
  assetType: string;
  direction: string;
  quantity: number;
  entryPrice: number;
  currentPrice?: number;
  portfolioType: string;
}

interface RealtimePnLData {
  positions: Position[];
  totalUnrealizedPnL: number;
  timestamp: string;
}

const FUTURES_MULTIPLIERS: Record<string, number> = {
  NQ: 20,
  ES: 50,
  GC: 100,
  CL: 1000,
  SI: 5000,
  ZB: 1000,
  ZN: 1000,
  RTY: 50,
  YM: 5,
};

export function LivePnLCard() {
  const { isConnected, getPrice } = useRealtimePrices();
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevPnLRef = useRef<number | null>(null);
  
  const { data: positionData, isLoading, isError } = useQuery<RealtimePnLData>({
    queryKey: ['/api/auto-lotto-bot/realtime-pnl'],
    refetchInterval: 10000,
  });

  const livePnL = useMemo(() => {
    if (!positionData?.positions) return 0;
    
    let totalPnL = 0;
    for (const pos of positionData.positions) {
      const livePrice = getPrice(pos.symbol);
      const currentPrice = livePrice?.price || pos.currentPrice || pos.entryPrice;
      const pnl = (currentPrice - pos.entryPrice) * pos.quantity * (pos.direction === 'short' ? -1 : 1);
      
      if (pos.assetType === 'futures') {
        const multiplier = FUTURES_MULTIPLIERS[pos.symbol] || 50;
        totalPnL += pnl * multiplier;
      } else if (pos.assetType === 'option') {
        totalPnL += pnl * 100;
      } else {
        totalPnL += pnl;
      }
    }
    return totalPnL;
  }, [positionData?.positions, getPrice]);

  const openPositions = positionData?.positions?.length || 0;

  useEffect(() => {
    if (prevPnLRef.current !== null && Math.abs(prevPnLRef.current - livePnL) > 0.01) {
      setFlash(livePnL > prevPnLRef.current ? 'up' : 'down');
      const timeout = setTimeout(() => setFlash(null), 500);
      prevPnLRef.current = livePnL;
      return () => clearTimeout(timeout);
    }
    prevPnLRef.current = livePnL;
  }, [livePnL]);

  if (isLoading) {
    return (
      <Card className="overflow-hidden bg-gradient-to-br from-slate-900/50 to-slate-800/50 border-slate-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />
            Loading P&L...
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Skeleton className="h-10 w-32 mb-2" />
          <Skeleton className="h-4 w-24" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden bg-gradient-to-br from-slate-900/50 to-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            Live Unrealized P&L
          </CardTitle>
          {isConnected && (
            <Badge variant="outline" className="text-xs gap-1 border-green-500/50 text-green-400">
              <Radio className="h-3 w-3 animate-pulse" />
              LIVE
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isError ? (
          <div className="text-muted-foreground text-sm">Unable to load positions</div>
        ) : (
          <>
            <div className="flex items-end justify-between">
              <div>
                <div className={cn(
                  'text-3xl font-bold tabular-nums font-mono transition-all duration-300',
                  flash === 'up' && 'animate-pulse scale-105',
                  flash === 'down' && 'animate-pulse scale-105',
                  livePnL >= 0 ? 'text-green-400' : 'text-red-400'
                )}>
                  <span className="flex items-center gap-2">
                    {livePnL >= 0 ? (
                      <TrendingUp className="h-5 w-5" />
                    ) : (
                      <TrendingDown className="h-5 w-5" />
                    )}
                    {livePnL >= 0 ? '+' : ''}{formatCurrency(livePnL)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2 text-muted-foreground text-sm">
                  <Wallet className="h-3 w-3" />
                  <span>{openPositions} open position{openPositions !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
        
            {openPositions > 0 && positionData?.positions && (
              <div className="mt-4 space-y-2">
                <div className="text-xs text-muted-foreground mb-2">Top Positions</div>
                {positionData.positions.slice(0, 3).map((pos) => {
                  const livePrice = getPrice(pos.symbol);
                  const currentPrice = livePrice?.price || pos.currentPrice || pos.entryPrice;
                  let pnl = (currentPrice - pos.entryPrice) * pos.quantity * (pos.direction === 'short' ? -1 : 1);
                  
                  if (pos.assetType === 'futures') {
                    const multiplier = FUTURES_MULTIPLIERS[pos.symbol] || 50;
                    pnl = pnl * multiplier;
                  } else if (pos.assetType === 'option') {
                    pnl = pnl * 100;
                  }

                  return (
                    <div key={pos.id} className="flex items-center justify-between text-sm bg-slate-800/50 rounded px-2 py-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{pos.symbol}</span>
                        <Badge variant="outline" className="text-xs py-0">
                          {pos.assetType}
                        </Badge>
                      </div>
                      <span className={cn(
                        'font-mono text-xs',
                        pnl >= 0 ? 'text-green-400' : 'text-red-400'
                      )}>
                        {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
