import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface MarketRegime {
  regime: string;
  vix: number;
  trend: string;
}

export function VixFearGauge() {
  const { data: regimeData } = useQuery<MarketRegime>({
    queryKey: ["/api/market-regime"],
    refetchInterval: 60000,
  });

  const vix = regimeData?.vix || 0;
  const regime = regimeData?.regime || "unknown";

  const getGaugeColor = () => {
    if (vix < 15) return { color: "text-green-500", bg: "bg-green-500", label: "Low Fear", rotation: 20 };
    if (vix < 20) return { color: "text-emerald-500", bg: "bg-emerald-500", label: "Calm", rotation: 40 };
    if (vix < 25) return { color: "text-yellow-500", bg: "bg-yellow-500", label: "Neutral", rotation: 90 };
    if (vix < 30) return { color: "text-orange-500", bg: "bg-orange-500", label: "Elevated", rotation: 130 };
    return { color: "text-red-500", bg: "bg-red-500", label: "Extreme Fear", rotation: 160 };
  };

  const gauge = getGaugeColor();

  return (
    <Link href="/chart-analysis?symbol=VIX">
      <Card className="cursor-pointer hover:border-primary/50 transition-all" data-testid="vix-fear-gauge">
        <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            VIX Fear Gauge
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="relative w-24 h-12 overflow-hidden">
              <div className="absolute inset-x-0 bottom-0 h-24 w-24">
                <svg viewBox="0 0 100 50" className="w-full h-full">
                  <defs>
                    <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#22c55e" />
                      <stop offset="25%" stopColor="#84cc16" />
                      <stop offset="50%" stopColor="#eab308" />
                      <stop offset="75%" stopColor="#f97316" />
                      <stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 10 50 A 40 40 0 0 1 90 50"
                    fill="none"
                    stroke="url(#gaugeGradient)"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                  <line
                    x1="50"
                    y1="50"
                    x2="50"
                    y2="20"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-foreground"
                    style={{
                      transformOrigin: "50px 50px",
                      transform: `rotate(${gauge.rotation - 90}deg)`,
                    }}
                  />
                  <circle cx="50" cy="50" r="4" className="fill-foreground" />
                </svg>
              </div>
            </div>
            <div className="text-right">
              <p className={cn("text-2xl font-bold", gauge.color)}>{vix.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">{gauge.label}</p>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Market Regime</span>
              <span className={cn("font-medium capitalize", gauge.color)}>{regime}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
