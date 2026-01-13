import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface MarketStrengthGaugeProps {
  value: number;
  label?: string;
  className?: string;
}

export function MarketStrengthGauge({ 
  value, 
  label = "Market Strength",
  className 
}: MarketStrengthGaugeProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  
  const sentiment = useMemo(() => {
    if (clampedValue <= 25) return { text: "Bearish", color: "text-red-500" };
    if (clampedValue <= 45) return { text: "Weak", color: "text-orange-500" };
    if (clampedValue <= 55) return { text: "Neutral", color: "text-muted-foreground" };
    if (clampedValue <= 75) return { text: "Bullish", color: "text-emerald-500" };
    return { text: "Strong", color: "text-emerald-400" };
  }, [clampedValue]);

  const rotation = useMemo(() => {
    return -90 + (clampedValue / 100) * 180;
  }, [clampedValue]);

  return (
    <div className={cn("flex flex-col items-center p-4", className)}>
      <span className="text-sm text-muted-foreground mb-2">{label}</span>
      
      <div className="relative w-40 h-20 overflow-hidden">
        <svg viewBox="0 0 100 50" className="w-full h-full">
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="25%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="75%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>
          
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          
          <circle
            cx="50"
            cy="50"
            r="4"
            fill="currentColor"
            className="text-foreground"
          />
          
          <line
            x1="50"
            y1="50"
            x2="50"
            y2="18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-foreground origin-center transition-transform duration-500"
            style={{ 
              transform: `rotate(${rotation}deg)`,
              transformOrigin: '50px 50px'
            }}
          />
          
          <circle
            cx="50"
            cy="50"
            r="3"
            fill="hsl(var(--primary))"
            className="drop-shadow-lg"
          />
        </svg>
      </div>
      
      <div className="flex flex-col items-center -mt-2">
        <span className="text-3xl font-bold">{clampedValue}</span>
        <span className={cn("text-sm font-medium", sentiment.color)}>
          {sentiment.text}
        </span>
      </div>
    </div>
  );
}

interface AltcoinSeasonIndexProps {
  value: number;
  className?: string;
}

export function AltcoinSeasonIndex({ value, className }: AltcoinSeasonIndexProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  
  return (
    <div className={cn("flex flex-col p-4", className)}>
      <span className="text-sm text-muted-foreground mb-3">Altcoin Season Index</span>
      
      <div className="flex flex-col items-center">
        <span className="text-3xl font-bold mb-3">{clampedValue}</span>
        
        <div className="relative w-full h-3 rounded-full overflow-hidden bg-muted">
          <div 
            className="absolute inset-0 bg-gradient-to-r from-amber-500 via-yellow-400 to-blue-500"
          />
          
          <div 
            className="absolute top-1/2 -translate-y-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-l-transparent border-r-transparent border-b-foreground transition-all duration-500"
            style={{ left: `calc(${clampedValue}% - 6px)`, top: '-4px' }}
          />
        </div>
        
        <div className="flex justify-between w-full mt-2 text-sm">
          <span className="text-amber-500 font-medium">Bitcoin</span>
          <span className="text-blue-500 font-medium">Altcoin</span>
        </div>
      </div>
    </div>
  );
}

interface CryptoMarketSectionProps {
  marketStrength: number;
  altcoinIndex: number;
  className?: string;
}

export function CryptoMarketSection({ 
  marketStrength, 
  altcoinIndex,
  className 
}: CryptoMarketSectionProps) {
  return (
    <div className={cn("", className)}>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-lg font-semibold">Crypto Market</h3>
        <span className="text-muted-foreground">&gt;</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border rounded-xl">
          <MarketStrengthGauge value={marketStrength} />
        </div>
        <div className="bg-card border rounded-xl">
          <AltcoinSeasonIndex value={altcoinIndex} />
        </div>
      </div>
    </div>
  );
}
