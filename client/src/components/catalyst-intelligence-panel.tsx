import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { cn, formatCTTime, safeToFixed } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  FileText,
  Building2,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  DollarSign,
  Calendar,
  Info,
  Loader2,
} from "lucide-react";

interface SECFiling {
  id: number;
  ticker: string;
  cik: string;
  formType: string;
  filedDate: string;
  accessionNumber: string;
  description: string;
  sentiment: string;
  impactScore: number;
  filingUrl: string;
  processed: boolean;
}

interface GovernmentContract {
  id: number;
  ticker: string;
  contractId: string;
  awardAmount: number;
  awardDate: string;
  agency: string;
  description: string;
  contractType: string;
  periodOfPerformance: string;
  naicsCode: string | null;
  impactScore: number;
  sourceUrl: string;
}

interface CatalystScore {
  ticker: string;
  score: number;
  catalystCount: number;
  summary: string;
  recentCatalysts?: Array<{
    type: string;
    description: string;
    score: number;
    timestamp: string;
  }>;
}

interface CatalystIntelligencePanelProps {
  symbol: string;
  compact?: boolean;
}

const getSentimentColor = (sentiment: string) => {
  switch (sentiment?.toLowerCase()) {
    case 'bullish':
      return 'text-success';
    case 'bearish':
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
};

const getSentimentIcon = (sentiment: string) => {
  switch (sentiment?.toLowerCase()) {
    case 'bullish':
      return TrendingUp;
    case 'bearish':
      return TrendingDown;
    default:
      return Minus;
  }
};

const getScoreColor = (score: number) => {
  if (score >= 50) return 'text-success';
  if (score >= 25) return 'text-primary';
  if (score >= 0) return 'text-muted-foreground';
  if (score >= -25) return 'text-neutral';
  if (score >= -50) return 'text-amber-500';
  return 'text-destructive';
};

const formatContractAmount = (amount: number) => {
  if (amount >= 1e9) return `$${safeToFixed(amount / 1e9, 2)}B`;
  if (amount >= 1e6) return `$${safeToFixed(amount / 1e6, 2)}M`;
  if (amount >= 1e3) return `$${safeToFixed(amount / 1e3, 0)}K`;
  return `$${safeToFixed(amount, 0)}`;
};

export function CatalystIntelligencePanel({ symbol, compact = false }: CatalystIntelligencePanelProps) {
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: catalystData, isLoading: loadingCatalysts } = useQuery<{
    ticker: string;
    catalysts: any[];
    score: number;
    catalystCount: number;
    summary: string;
  }>({
    queryKey: ['/api/catalysts/symbol', symbol],
    enabled: !!symbol,
  });

  const { data: secFilings, isLoading: loadingFilings } = useQuery<{ ticker: string; filings: SECFiling[] }>({
    queryKey: ['/api/sec-filings', symbol],
    enabled: !!symbol,
  });

  const { data: govContracts, isLoading: loadingContracts } = useQuery<{ ticker: string; contracts: GovernmentContract[] }>({
    queryKey: ['/api/gov-contracts', symbol],
    enabled: !!symbol,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      setIsRefreshing(true);
      const response = await apiRequest('POST', '/api/catalysts/refresh', { tickers: [symbol] });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/catalysts/symbol', symbol] });
      queryClient.invalidateQueries({ queryKey: ['/api/sec-filings', symbol] });
      queryClient.invalidateQueries({ queryKey: ['/api/gov-contracts', symbol] });
      toast({ title: 'Catalysts Refreshed', description: `Updated catalyst data for ${symbol}` });
      setIsRefreshing(false);
    },
    onError: () => {
      toast({ title: 'Refresh Failed', description: 'Could not refresh catalyst data', variant: 'destructive' });
      setIsRefreshing(false);
    },
  });

  const isLoading = loadingCatalysts || loadingFilings || loadingContracts;
  const score = catalystData?.score ?? 0;
  const catalystCount = catalystData?.catalystCount ?? 0;
  const filings = secFilings?.filings ?? [];
  const contracts = govContracts?.contracts ?? [];

  if (compact) {
    return (
      <Card className="h-full" data-testid="card-catalyst-intelligence-compact">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Catalyst Score
            </CardTitle>
            <Badge
              variant={score >= 25 ? 'default' : score <= -25 ? 'destructive' : 'secondary'}
              className={cn('text-xs font-mono', getScoreColor(score))}
              data-testid="badge-catalyst-score"
            >
              {score >= 0 ? '+' : ''}{score}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{catalystCount} catalyst events</span>
                <span className={getScoreColor(score)}>
                  {score >= 50 ? 'Strong Bullish' : score >= 25 ? 'Bullish' : score <= -50 ? 'Strong Bearish' : score <= -25 ? 'Bearish' : 'Neutral'}
                </span>
              </div>
              <Progress
                value={Math.min(100, Math.max(0, (score + 100) / 2))}
                className="h-1.5"
              />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3 w-3" />
                <span>{filings.length} SEC filings</span>
                <Building2 className="h-3 w-3 ml-2" />
                <span>{contracts.length} contracts</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-catalyst-intelligence">
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Catalyst Intelligence
              <Badge variant="outline" className="text-xs font-mono ml-1" data-testid="text-symbol">
                {symbol}
              </Badge>
            </CardTitle>
            <CardDescription>
              SEC filings, government contracts, and market catalysts
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={score >= 25 ? 'default' : score <= -25 ? 'destructive' : 'secondary'}
              className={cn('text-lg font-mono px-3 py-1', getScoreColor(score))}
              data-testid="badge-catalyst-score-large"
            >
              {score >= 0 ? '+' : ''}{score}
            </Badge>
            <Button
              size="icon"
              variant="outline"
              onClick={() => refreshMutation.mutate()}
              disabled={isRefreshing}
              data-testid="button-refresh-catalysts"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3" data-testid="tabs-catalyst-intelligence">
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="sec" data-testid="tab-sec">SEC Filings ({filings.length})</TabsTrigger>
              <TabsTrigger value="contracts" data-testid="tab-contracts">Gov Contracts ({contracts.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border bg-muted/30" data-testid="stat-catalyst-score">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-sm">Catalyst Score</span>
                  </div>
                  <div className={cn('text-2xl font-bold font-mono', getScoreColor(score))}>
                    {score >= 0 ? '+' : ''}{score}
                  </div>
                  <Progress
                    value={Math.min(100, Math.max(0, (score + 100) / 2))}
                    className="h-2 mt-2"
                  />
                </div>

                <div className="p-4 rounded-lg border bg-muted/30" data-testid="stat-sec-filings">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm">SEC Filings (90d)</span>
                  </div>
                  <div className="text-2xl font-bold font-mono">{filings.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {filings.filter(f => f.sentiment === 'bullish').length} bullish,{' '}
                    {filings.filter(f => f.sentiment === 'bearish').length} bearish
                  </div>
                </div>

                <div className="p-4 rounded-lg border bg-muted/30" data-testid="stat-gov-contracts">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Building2 className="h-4 w-4" />
                    <span className="text-sm">Gov Contracts (90d)</span>
                  </div>
                  <div className="text-2xl font-bold font-mono">{contracts.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatContractAmount(contracts.reduce((sum, c) => sum + (c.awardAmount || 0), 0))} total
                  </div>
                </div>
              </div>

              {catalystData?.summary && (
                <div className="p-4 rounded-lg border bg-muted/30" data-testid="text-catalyst-summary">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <Info className="h-4 w-4" />
                    <span className="text-sm font-medium">Summary</span>
                  </div>
                  <p className="text-sm">{catalystData.summary}</p>
                </div>
              )}

              {catalystCount === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No recent catalyst events for {symbol}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 gap-2"
                    onClick={() => refreshMutation.mutate()}
                    disabled={isRefreshing}
                    data-testid="button-refresh-empty"
                  >
                    <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
                    Fetch Latest Data
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="sec" className="mt-4">
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {filings.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No SEC filings found for {symbol}</p>
                    </div>
                  ) : (
                    filings.map((filing) => {
                      const SentimentIcon = getSentimentIcon(filing.sentiment);
                      return (
                        <div
                          key={filing.id}
                          className="p-3 rounded-lg border hover-elevate transition-all"
                          data-testid={`sec-filing-${filing.id}`}
                        >
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono text-xs">
                                {filing.formType}
                              </Badge>
                              <SentimentIcon className={cn('h-4 w-4', getSentimentColor(filing.sentiment))} />
                              <Badge variant="secondary" className="text-xs">
                                Impact: {filing.impactScore}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground font-mono">
                              {formatCTTime(filing.filedDate)}
                            </span>
                          </div>
                          <p className="text-sm mt-2">{filing.description}</p>
                          {filing.filingUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs mt-2 p-0"
                              asChild
                            >
                              <a href={filing.filingUrl} target="_blank" rel="noopener noreferrer">
                                View Filing <ExternalLink className="h-3 w-3" />
                              </a>
                            </Button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="contracts" className="mt-4">
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {contracts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No government contracts found for {symbol}</p>
                    </div>
                  ) : (
                    contracts.map((contract) => (
                      <div
                        key={contract.id}
                        className="p-3 rounded-lg border hover-elevate transition-all"
                        data-testid={`gov-contract-${contract.id}`}
                      >
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Badge className="font-mono text-xs bg-success/20 text-success border-success/30">
                              <DollarSign className="h-3 w-3 mr-1" />
                              {formatContractAmount(contract.awardAmount)}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {contract.agency}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatCTTime(contract.awardDate)}
                          </span>
                        </div>
                        <p className="text-sm mt-2">{contract.description}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>Type: {contract.contractType}</span>
                          {contract.periodOfPerformance && (
                            <span>Period: {contract.periodOfPerformance}</span>
                          )}
                        </div>
                        {contract.sourceUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs mt-2 p-0"
                            asChild
                          >
                            <a href={contract.sourceUrl} target="_blank" rel="noopener noreferrer">
                              View Contract <ExternalLink className="h-3 w-3" />
                            </a>
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
