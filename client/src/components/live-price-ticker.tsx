import { useState, useEffect, useRef } from 'react';
import { useRealtimePrices } from '@/hooks/useRealtimePrices';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, Radio } from 'lucide-react';

interface LivePriceTickerProps {
  symbol: string;
  className?: string;
  showDirection?: boolean;
  showLiveIndicator?: boolean;
  formatPrice?: (price: number) => string;
}

export function LivePriceTicker({
  symbol,
  className,
  showDirection = true,
  showLiveIndicator = false,
  formatPrice = (p) => p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}: LivePriceTickerProps) {
  const { getPrice, isConnected } = useRealtimePrices();
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevPriceRef = useRef<number | null>(null);
  
  const priceData = getPrice(symbol);
  const currentPrice = priceData?.price;
  const previousPrice = priceData?.previousPrice;

  useEffect(() => {
    if (currentPrice === undefined) return;
    
    if (prevPriceRef.current !== null && prevPriceRef.current !== currentPrice) {
      const direction = currentPrice > prevPriceRef.current ? 'up' : 'down';
      setFlash(direction);
      
      const timeout = setTimeout(() => setFlash(null), 600);
      return () => clearTimeout(timeout);
    }
    
    prevPriceRef.current = currentPrice;
  }, [currentPrice]);

  if (currentPrice === undefined) {
    return (
      <span className={cn('font-mono text-muted-foreground', className)} data-testid={`price-ticker-${symbol}`}>
        --
      </span>
    );
  }

  const direction = previousPrice !== undefined && currentPrice !== previousPrice
    ? currentPrice > previousPrice ? 'up' : 'down'
    : null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono tabular-nums transition-colors duration-300',
        flash === 'up' && 'animate-pulse text-green-400',
        flash === 'down' && 'animate-pulse text-red-400',
        !flash && direction === 'up' && 'text-green-400',
        !flash && direction === 'down' && 'text-red-400',
        !flash && !direction && 'text-foreground',
        className
      )}
      data-testid={`price-ticker-${symbol}`}
    >
      {showLiveIndicator && isConnected && (
        <Radio className="h-3 w-3 text-green-400 animate-pulse" />
      )}
      <span className={cn(
        'transition-all duration-300',
        flash && 'scale-105'
      )}>
        ${formatPrice(currentPrice)}
      </span>
      {showDirection && direction && (
        <>
          {direction === 'up' ? (
            <TrendingUp className="h-3 w-3 text-green-400" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-400" />
          )}
        </>
      )}
    </span>
  );
}
