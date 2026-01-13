import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  TrendingUp, 
  Zap, 
  Target, 
  BarChart3, 
  Coins, 
  LineChart,
  ArrowRight,
  type LucideIcon 
} from "lucide-react";

interface StrategyCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  iconColor?: string;
  performance?: {
    winRate?: number;
    annualizedReturn?: number;
    sharpeRatio?: number;
  };
  badge?: string;
  badgeVariant?: "default" | "secondary" | "outline" | "destructive";
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function StrategyCard({
  title,
  description,
  icon: Icon,
  iconColor = "text-primary",
  performance,
  badge,
  badgeVariant = "secondary",
  href,
  onClick,
  className,
}: StrategyCardProps) {
  return (
    <Card 
      className={cn(
        "group relative overflow-hidden p-5 transition-all hover-elevate cursor-pointer",
        "border-border/50 hover:border-primary/30",
        className
      )}
      onClick={onClick}
      data-testid={`strategy-card-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div className={cn(
            "p-2.5 rounded-lg bg-primary/10",
            iconColor
          )}>
            <Icon className="w-5 h-5" />
          </div>
          {badge && (
            <Badge variant={badgeVariant} className="text-xs">
              {badge}
            </Badge>
          )}
        </div>
        
        <div>
          <h3 className="font-semibold text-base mb-1">{title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {description}
          </p>
        </div>
        
        {performance && (
          <div className="flex flex-wrap gap-3 pt-2 border-t border-border/50">
            {performance.winRate !== undefined && (
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Win Rate</span>
                <span className="text-sm font-semibold text-emerald-500">
                  {performance.winRate.toFixed(1)}%
                </span>
              </div>
            )}
            {performance.annualizedReturn !== undefined && (
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Ann. Return</span>
                <span className="text-sm font-semibold text-emerald-500">
                  +{performance.annualizedReturn.toFixed(0)}%
                </span>
              </div>
            )}
            {performance.sharpeRatio !== undefined && (
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Sharpe</span>
                <span className="text-sm font-semibold">
                  {performance.sharpeRatio.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}
        
        <div className="flex items-center text-sm text-primary font-medium pt-1">
          <span>View Signals</span>
          <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </Card>
  );
}

export const strategyIcons = {
  aiPicker: TrendingUp,
  swing: BarChart3,
  dayTrade: Zap,
  options: Target,
  crypto: Coins,
  futures: LineChart,
};

interface StrategyGridProps {
  strategies: Array<{
    id: string;
    title: string;
    description: string;
    icon: LucideIcon;
    iconColor?: string;
    performance?: StrategyCardProps['performance'];
    badge?: string;
    href?: string;
  }>;
  onStrategyClick?: (id: string) => void;
  className?: string;
}

export function StrategyGrid({ strategies, onStrategyClick, className }: StrategyGridProps) {
  return (
    <div className={cn("", className)}>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xl font-bold">AI Trading Strategies</h2>
        <span className="text-muted-foreground">&gt;</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {strategies.map((strategy) => (
          <StrategyCard
            key={strategy.id}
            title={strategy.title}
            description={strategy.description}
            icon={strategy.icon}
            iconColor={strategy.iconColor}
            performance={strategy.performance}
            badge={strategy.badge}
            onClick={() => onStrategyClick?.(strategy.id)}
          />
        ))}
      </div>
    </div>
  );
}
