import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Minus, ChevronRight } from "lucide-react";
import { useState } from "react";

type PredictionType = "beat" | "miss" | "neutral";

interface EarningsItem {
  symbol: string;
  companyName: string;
  logoUrl?: string;
  reportDate: string;
  reportTime: "Pre-Market" | "After-Market" | "During-Market";
  prediction: PredictionType;
  probability: number;
  revenuePrediction?: PredictionType;
  epsPrediction?: PredictionType;
}

interface EarningsCardProps extends EarningsItem {
  onClick?: () => void;
  className?: string;
}

const predictionConfig = {
  beat: {
    label: "Beat",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    icon: TrendingUp,
  },
  miss: {
    label: "Miss",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    icon: TrendingDown,
  },
  neutral: {
    label: "Neutral",
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    icon: Minus,
  },
};

function PredictionBadge({ type }: { type: PredictionType }) {
  const config = predictionConfig[type];
  return (
    <span className={cn("text-xs font-medium px-2 py-0.5 rounded", config.bgColor, config.color)}>
      {config.label}
    </span>
  );
}

function EarningsCard({
  symbol,
  companyName,
  logoUrl,
  reportDate,
  reportTime,
  prediction,
  probability,
  revenuePrediction,
  epsPrediction,
  onClick,
  className,
}: EarningsCardProps) {
  const config = predictionConfig[prediction];
  
  return (
    <Card
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden p-4 transition-all hover-elevate cursor-pointer",
        "border-border/50 hover:border-primary/30",
        className
      )}
      data-testid={`earnings-card-${symbol}`}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt={symbol} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-muted-foreground">
              {symbol.charAt(0)}
            </span>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{symbol}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{companyName}</p>
        </div>
        
        <div className="text-right flex-shrink-0">
          <div className="text-xs text-muted-foreground">{reportTime}</div>
          <div className="text-xs font-medium">{reportDate}</div>
        </div>
      </div>
      
      <div className="flex items-center gap-4 mb-3">
        <div>
          <div className="text-xs text-muted-foreground mb-0.5">AI Prediction</div>
          <div className={cn("text-lg font-bold", config.color)}>
            {config.label}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-0.5">Probability</div>
          <div className="text-lg font-bold">
            {probability}%
          </div>
        </div>
      </div>
      
      <div className="flex gap-3 pt-3 border-t border-border/50">
        {revenuePrediction && (
          <div className="flex-1">
            <div className="text-xs text-muted-foreground mb-1">Revenue</div>
            <PredictionBadge type={revenuePrediction} />
          </div>
        )}
        {epsPrediction && (
          <div className="flex-1">
            <div className="text-xs text-muted-foreground mb-1">EPS</div>
            <PredictionBadge type={epsPrediction} />
          </div>
        )}
      </div>
    </Card>
  );
}

type FilterTab = "all" | "past" | "today" | "future";

interface EarningsPredictionSectionProps {
  earnings: EarningsItem[];
  onEarningsClick?: (symbol: string) => void;
  onSeeAllClick?: () => void;
  className?: string;
}

export function EarningsPredictionSection({
  earnings,
  onEarningsClick,
  onSeeAllClick,
  className,
}: EarningsPredictionSectionProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  
  const filteredEarnings = earnings.filter((item) => {
    if (activeTab === "all") return true;
    const today = new Date().toISOString().split("T")[0];
    const itemDate = item.reportDate;
    
    if (activeTab === "today") return itemDate === today;
    if (activeTab === "past") return itemDate < today;
    if (activeTab === "future") return itemDate > today;
    return true;
  });

  return (
    <div className={cn("", className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">AI Earnings Prediction</h2>
          <span className="text-muted-foreground">&gt;</span>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FilterTab)} className="mb-4">
        <TabsList className="h-8">
          <TabsTrigger value="all" className="text-xs px-3 h-6" data-testid="earnings-tab-all">
            All
          </TabsTrigger>
          <TabsTrigger value="past" className="text-xs px-3 h-6" data-testid="earnings-tab-past">
            Past
          </TabsTrigger>
          <TabsTrigger value="today" className="text-xs px-3 h-6" data-testid="earnings-tab-today">
            Today
          </TabsTrigger>
          <TabsTrigger value="future" className="text-xs px-3 h-6" data-testid="earnings-tab-future">
            Future
          </TabsTrigger>
        </TabsList>
      </Tabs>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEarnings.slice(0, 6).map((item, index) => (
          <EarningsCard
            key={`${item.symbol}-${index}`}
            {...item}
            onClick={() => onEarningsClick?.(item.symbol)}
          />
        ))}
      </div>
      
      {onSeeAllClick && (
        <div className="flex justify-center mt-4">
          <button
            onClick={onSeeAllClick}
            className="text-sm text-primary hover:underline flex items-center gap-1"
            data-testid="earnings-see-all"
          >
            See all AI Earnings Prediction
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export type { EarningsItem, PredictionType };
