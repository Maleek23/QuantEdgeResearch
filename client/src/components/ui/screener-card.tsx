import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";

interface ScreenerCardProps {
  title: string;
  symbolCount: number;
  sentiment: "bullish" | "bearish" | "neutral";
  imageUrl?: string;
  gradientFrom?: string;
  gradientTo?: string;
  onClick?: () => void;
  className?: string;
}

const defaultImages = {
  bullish: "linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(6, 78, 59, 0.4) 100%)",
  bearish: "linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(127, 29, 29, 0.4) 100%)",
  neutral: "linear-gradient(135deg, rgba(148, 163, 184, 0.2) 0%, rgba(71, 85, 105, 0.4) 100%)",
};

const sentimentColors = {
  bullish: "bg-emerald-500 text-white",
  bearish: "bg-red-500 text-white",
  neutral: "bg-slate-500 text-white",
};

export function ScreenerCard({
  title,
  symbolCount,
  sentiment,
  imageUrl,
  gradientFrom,
  gradientTo,
  onClick,
  className,
}: ScreenerCardProps) {
  const backgroundStyle = imageUrl 
    ? { backgroundImage: `url(${imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : gradientFrom && gradientTo
    ? { background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)` }
    : { background: defaultImages[sentiment] };

  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative h-36 rounded-xl overflow-hidden cursor-pointer transition-all hover-elevate",
        "border border-border/30 hover:border-primary/40",
        className
      )}
      data-testid={`screener-card-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div 
        className="absolute inset-0 transition-transform group-hover:scale-105"
        style={backgroundStyle}
      />
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
      
      <div className="relative h-full flex flex-col justify-between p-4">
        <div>
          <Badge 
            className={cn(
              "text-xs font-medium capitalize",
              sentimentColors[sentiment]
            )}
          >
            {sentiment}
          </Badge>
        </div>
        
        <div className="flex items-end justify-between">
          <div>
            <h3 className="font-semibold text-white text-sm mb-0.5">{title}</h3>
            <p className="text-xs text-white/70">{symbolCount} symbols</p>
          </div>
          
          <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/20 transition-colors">
            <ChevronRight className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>
    </div>
  );
}

interface FeaturedScreenersProps {
  screeners: Array<{
    id: string;
    title: string;
    symbolCount: number;
    sentiment: "bullish" | "bearish" | "neutral";
    imageUrl?: string;
  }>;
  onScreenerClick?: (id: string) => void;
  className?: string;
}

export function FeaturedScreeners({ 
  screeners, 
  onScreenerClick,
  className 
}: FeaturedScreenersProps) {
  return (
    <div className={cn("", className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">Featured Screener</h2>
          <span className="text-muted-foreground">&gt;</span>
        </div>
      </div>
      
      <p className="text-sm text-muted-foreground mb-4">
        Explore a variety of template screeners to uncover winning trades with ease
      </p>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {screeners.map((screener) => (
          <ScreenerCard
            key={screener.id}
            title={screener.title}
            symbolCount={screener.symbolCount}
            sentiment={screener.sentiment}
            imageUrl={screener.imageUrl}
            onClick={() => onScreenerClick?.(screener.id)}
          />
        ))}
      </div>
    </div>
  );
}

const stockScreenerGradients = {
  bullishTomorrow: { from: "rgba(16, 185, 129, 0.3)", to: "rgba(6, 78, 59, 0.6)" },
  bullishWeek: { from: "rgba(34, 197, 94, 0.3)", to: "rgba(21, 128, 61, 0.6)" },
  bullishMonth: { from: "rgba(52, 211, 153, 0.3)", to: "rgba(5, 150, 105, 0.6)" },
  bearishTomorrow: { from: "rgba(239, 68, 68, 0.3)", to: "rgba(127, 29, 29, 0.6)" },
  bearishWeek: { from: "rgba(248, 113, 113, 0.3)", to: "rgba(185, 28, 28, 0.6)" },
  bearishMonth: { from: "rgba(252, 165, 165, 0.3)", to: "rgba(153, 27, 27, 0.6)" },
};

const cryptoScreenerGradients = {
  bullishTomorrow: { from: "rgba(245, 158, 11, 0.3)", to: "rgba(146, 64, 14, 0.6)" },
  bullishWeek: { from: "rgba(251, 191, 36, 0.3)", to: "rgba(180, 83, 9, 0.6)" },
  bullishMonth: { from: "rgba(252, 211, 77, 0.3)", to: "rgba(161, 98, 7, 0.6)" },
  bearishTomorrow: { from: "rgba(168, 85, 247, 0.3)", to: "rgba(88, 28, 135, 0.6)" },
  bearishWeek: { from: "rgba(192, 132, 252, 0.3)", to: "rgba(107, 33, 168, 0.6)" },
  bearishMonth: { from: "rgba(216, 180, 254, 0.3)", to: "rgba(126, 34, 206, 0.6)" },
};

export { stockScreenerGradients, cryptoScreenerGradients };
