import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MarketSession } from "@shared/schema";

interface MarketSessionBadgeProps {
  session: MarketSession;
  className?: string;
}

export function MarketSessionBadge({ session, className }: MarketSessionBadgeProps) {
  const sessionConfig = {
    'pre-market': { label: 'Pre-Market', variant: 'outline' as const, color: 'text-neutral' },
    'rth': { label: 'Regular Hours', variant: 'default' as const, color: 'text-bullish' },
    'after-hours': { label: 'After Hours', variant: 'outline' as const, color: 'text-neutral' },
    'closed': { label: 'Market Closed', variant: 'secondary' as const, color: 'text-muted-foreground' },
  };

  const config = sessionConfig[session];

  return (
    <Badge variant={config.variant} className={cn("font-mono text-xs", config.color, className)} data-testid={`badge-market-session-${session}`}>
      {config.label}
    </Badge>
  );
}