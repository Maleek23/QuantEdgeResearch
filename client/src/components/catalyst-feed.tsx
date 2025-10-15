import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCTTime, cn } from "@/lib/utils";
import type { Catalyst } from "@shared/schema";
import { Calendar, Newspaper, TrendingUp, AlertCircle, FileText } from "lucide-react";

interface CatalystFeedProps {
  catalysts: Catalyst[];
}

const eventIcons = {
  earnings: Calendar,
  fda: AlertCircle,
  guidance: TrendingUp,
  news: Newspaper,
  filing: FileText,
};

const impactColors = {
  high: "text-destructive",
  medium: "text-neutral",
  low: "text-muted-foreground",
};

export function CatalystFeed({ catalysts }: CatalystFeedProps) {
  return (
    <Card data-testid="card-catalyst-feed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Newspaper className="h-5 w-5" />
          Market Catalysts
        </CardTitle>
        <CardDescription>
          Latest events and news impacting trade opportunities
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-4">
            {catalysts.map((catalyst) => {
              const Icon = eventIcons[catalyst.eventType as keyof typeof eventIcons] || Newspaper;
              const impactColor = impactColors[catalyst.impact as keyof typeof impactColors];

              return (
                <div
                  key={catalyst.id}
                  className="group p-4 rounded-lg border border-border hover-elevate transition-all"
                  data-testid={`catalyst-item-${catalyst.symbol}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("p-2 rounded-md bg-muted", impactColor)}>
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-mono text-sm" data-testid={`text-catalyst-symbol-${catalyst.symbol}`}>
                            {catalyst.symbol}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {catalyst.eventType.toUpperCase()}
                          </Badge>
                          <Badge variant={catalyst.impact === 'high' ? 'destructive' : 'secondary'} className="text-xs">
                            {catalyst.impact.toUpperCase()}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground font-mono whitespace-nowrap" data-testid={`text-catalyst-time-${catalyst.symbol}`}>
                          {formatCTTime(catalyst.timestamp)}
                        </span>
                      </div>

                      <h4 className="font-semibold text-sm leading-snug" data-testid={`text-catalyst-title-${catalyst.symbol}`}>
                        {catalyst.title}
                      </h4>

                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {catalyst.description}
                      </p>

                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>Source:</span>
                        <span className="font-medium" data-testid={`text-catalyst-source-${catalyst.symbol}`}>{catalyst.source}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {catalysts.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Newspaper className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No catalysts available</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}