import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { formatCTTime, cn } from "@/lib/utils";
import type { Catalyst } from "@shared/schema";
import { Calendar, Newspaper, TrendingUp, AlertCircle, FileText, ExternalLink, RefreshCw } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

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
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);

  const syncEarnings = useMutation({
    mutationFn: async () => {
      setIsSyncing(true);
      const response = await apiRequest(
        'POST',
        '/api/catalysts/sync-earnings',
        {}
      );
      const data = await response.json() as { message: string; total: number; synced: number };
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/catalysts'] });
      toast({
        title: "Earnings Synced",
        description: `${data.synced} upcoming earnings added to catalyst feed`,
      });
      setIsSyncing(false);
    },
    onError: (error) => {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync earnings calendar",
        variant: "destructive",
      });
      setIsSyncing(false);
    },
  });

  const earningsCount = catalysts.filter(c => c.eventType === 'earnings').length;

  return (
    <Card data-testid="card-catalyst-feed">
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Newspaper className="h-5 w-5" />
              Market Catalysts
            </CardTitle>
            <CardDescription>
              Latest events and news impacting trade opportunities
              {earningsCount > 0 && (
                <span className="ml-2 text-xs text-primary font-medium">
                  • {earningsCount} upcoming earnings
                </span>
              )}
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncEarnings.mutate()}
            disabled={isSyncing}
            className="gap-2"
            data-testid="button-sync-earnings"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
            Sync Earnings
          </Button>
        </div>
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

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>Source:</span>
                          <span className="font-medium" data-testid={`text-catalyst-source-${catalyst.symbol}`}>{catalyst.source}</span>
                        </div>
                        {catalyst.sourceUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            asChild
                            data-testid={`link-catalyst-source-${catalyst.symbol}`}
                          >
                            <a href={catalyst.sourceUrl} target="_blank" rel="noopener noreferrer">
                              View Source <ExternalLink className="h-3 w-3" />
                            </a>
                          </Button>
                        )}
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