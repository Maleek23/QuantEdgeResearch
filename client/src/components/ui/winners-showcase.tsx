import { cn, safeToFixed } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Calendar, ChevronRight } from "lucide-react";

interface WinnerItem {
  symbol: string;
  companyName: string;
  logoUrl?: string;
  dateAdded: string;
  dateClosed: string;
  totalReturn: number;
  strategySource?: string;
}

interface WinnerCardProps extends WinnerItem {
  onClick?: () => void;
  className?: string;
}

function WinnerCard({
  symbol,
  companyName,
  logoUrl,
  dateAdded,
  dateClosed,
  totalReturn,
  strategySource,
  onClick,
  className,
}: WinnerCardProps) {
  const isPositive = totalReturn >= 0;
  
  return (
    <Card
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden p-4 transition-all hover-elevate cursor-pointer",
        "border-border/50 hover:border-primary/30",
        className
      )}
      data-testid={`winner-card-${symbol}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt={symbol} className="w-full h-full object-cover" />
          ) : (
            <span className="text-lg font-bold text-muted-foreground">
              {symbol.charAt(0)}
            </span>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-base">{symbol}</span>
            {strategySource && (
              <Badge variant="outline" className="text-xs px-1.5 py-0">
                <TrendingUp className="w-3 h-3 mr-1" />
                {strategySource}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">{companyName}</p>
        </div>
        
        <div className="text-right flex-shrink-0">
          <div className={cn(
            "text-lg font-bold",
            isPositive ? "text-emerald-500" : "text-red-500"
          )}>
            {isPositive ? "+" : ""}{safeToFixed(totalReturn, 2)}%
          </div>
          <span className="text-xs text-muted-foreground">Total Return</span>
        </div>
      </div>
      
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <span>Added: {dateAdded}</span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <span>Closed: {dateClosed}</span>
        </div>
      </div>
    </Card>
  );
}

interface WinnersShowcaseProps {
  title?: string;
  subtitle?: string;
  winners: WinnerItem[];
  onWinnerClick?: (symbol: string) => void;
  onSeeAllClick?: () => void;
  className?: string;
}

export function WinnersShowcase({
  title = "QuantAI Alpha Pick",
  subtitle = "AI-powered stock selection with proven track record",
  winners,
  onWinnerClick,
  onSeeAllClick,
  className,
}: WinnersShowcaseProps) {
  return (
    <div className={cn("", className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">{title}</h2>
          <span className="text-muted-foreground">&gt;</span>
        </div>
        {onSeeAllClick && (
          <button
            onClick={onSeeAllClick}
            className="text-sm text-primary hover:underline flex items-center gap-1"
            data-testid="winners-see-all"
          >
            See all winners
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
      
      {subtitle && (
        <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {winners.slice(0, 3).map((winner, index) => (
          <WinnerCard
            key={`${winner.symbol}-${index}`}
            {...winner}
            onClick={() => onWinnerClick?.(winner.symbol)}
          />
        ))}
      </div>
    </div>
  );
}

export type { WinnerItem };
