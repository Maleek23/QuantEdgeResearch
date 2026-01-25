import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { 
  TrendingUp, 
  Target, 
  Activity, 
  Wallet,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AssetCard {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  color: string;
  bgColor: string;
}

const assetCards: AssetCard[] = [
  {
    id: "stocks",
    label: "Stocks",
    description: "AI-powered stock analysis & trade ideas",
    icon: TrendingUp,
    href: "/trade-desk?asset=stock",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    id: "options",
    label: "Options",
    description: "Flow detection & premium setups",
    icon: Target,
    href: "/trade-desk?asset=option",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  {
    id: "futures",
    label: "Futures",
    description: "ES, NQ, GC market analysis",
    icon: Activity,
    href: "/trade-desk?tab=futures",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  {
    id: "crypto",
    label: "Crypto",
    description: "BTC, ETH signals & sentiment",
    icon: Wallet,
    href: "/trade-desk?asset=crypto",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
];

export function AssetHeroCards() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {assetCards.map((card) => (
        <Link key={card.id} href={card.href}>
          <Card 
            className="group cursor-pointer transition-all hover:border-primary/50 hover:shadow-lg"
            data-testid={`asset-card-${card.id}`}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className={cn("p-2 rounded-lg", card.bgColor)}>
                  <card.icon className={cn("h-5 w-5", card.color)} />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">{card.label}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2">{card.description}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
