import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  BarChart3,
  Activity,
  Target,
  AlertTriangle,
  CheckCircle,
  Zap,
  RefreshCw,
  Search,
  Layers,
  Gauge
} from "lucide-react";

interface MLStatus {
  isActive: boolean;
  modelsLoaded: {
    pricePredictor: boolean;
    sentimentAnalyzer: boolean;
    patternRecognizer: boolean;
    positionSizer: boolean;
    regimeDetector: boolean;
  };
  cacheStats: {
    predictions: number;
    sentiments: number;
    regimes: number;
  };
  lastUpdated: string;
  version: string;
}

interface PricePrediction {
  symbol: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  predictedChange: number;
  timeframe: string;
  signals: string[];
  features: {
    rsi: number;
    macd: number;
    momentum: number;
    volatility: number;
    volumeRatio: number;
    priceChange24h: number;
    trendStrength: number;
  };
  timestamp: string;
}

interface MarketRegime {
  regime: 'trending_bull' | 'trending_bear' | 'ranging' | 'high_volatility' | 'low_volatility';
  confidence: number;
  characteristics: string[];
  recommendedStrategies: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'extreme';
  timestamp: string;
}

interface ScanResult {
  symbol: string;
  recommendation: string;
  compositeScore: number;
  direction: string;
  confidence: number;
  regime: string;
  patterns: number;
}

interface MLSignal {
  symbol: string;
  compositeScore: number;
  tradingRecommendation: string;
  prediction: PricePrediction;
  sentiment: {
    overallSentiment: string;
    score: number;
    newsScore: number;
    socialScore: number;
  };
  patterns: Array<{
    pattern: string;
    type: string;
    reliability: number;
    priceTarget: number;
  }>;
  positionSize: {
    recommendedSize: number;
    riskPercent: number;
    kellyFraction: number;
    reasoning: string[];
  };
  regime: MarketRegime;
}

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === 'bullish') return <TrendingUp className="w-5 h-5 text-green-500" />;
  if (direction === 'bearish') return <TrendingDown className="w-5 h-5 text-red-500" />;
  return <Minus className="w-5 h-5 text-muted-foreground" />;
}

function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const colors: Record<string, string> = {
    'strong_buy': 'bg-green-500/20 text-green-400 border-green-500/50',
    'buy': 'bg-green-500/10 text-green-300 border-green-500/30',
    'hold': 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
    'sell': 'bg-red-500/10 text-red-300 border-red-500/30',
    'strong_sell': 'bg-red-500/20 text-red-400 border-red-500/50',
  };
  
  return (
    <Badge className={colors[recommendation] || 'bg-muted'} data-testid={`badge-recommendation-${recommendation}`}>
      {recommendation.replace('_', ' ').toUpperCase()}
    </Badge>
  );
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    'low': 'bg-green-500/10 text-green-300',
    'medium': 'bg-yellow-500/10 text-yellow-300',
    'high': 'bg-orange-500/10 text-orange-300',
    'extreme': 'bg-red-500/10 text-red-300',
  };
  
  return <Badge className={colors[level] || 'bg-muted'}>{level.toUpperCase()}</Badge>;
}

export default function MLIntelligence() {
  const [searchSymbol, setSearchSymbol] = useState("");
  const [analyzedSymbol, setAnalyzedSymbol] = useState("");

  const { data: status, isLoading: statusLoading } = useQuery<MLStatus>({
    queryKey: ['/api/ml/status'],
    refetchInterval: 30000,
  });

  const { data: regime, isLoading: regimeLoading } = useQuery<MarketRegime>({
    queryKey: ['/api/ml/regime'],
    refetchInterval: 60000,
  });

  const { data: scan, isLoading: scanLoading, refetch: refetchScan } = useQuery<{ scanned: number; signals: ScanResult[] }>({
    queryKey: ['/api/ml/scan'],
    refetchInterval: 300000,
  });

  const { data: signal, isLoading: signalLoading, refetch: refetchSignal } = useQuery<MLSignal>({
    queryKey: ['/api/ml/signal', analyzedSymbol],
    enabled: !!analyzedSymbol,
  });

  const handleAnalyze = () => {
    if (searchSymbol.trim()) {
      setAnalyzedSymbol(searchSymbol.trim().toUpperCase());
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-ml-intelligence">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">ML Intelligence</h1>
            <p className="text-muted-foreground">Machine Learning Trading Signals & Analysis</p>
          </div>
        </div>
        <Badge variant="outline" className="flex items-center gap-1" data-testid="badge-ml-status">
          {status?.isActive ? (
            <>
              <CheckCircle className="w-3 h-3 text-green-500" />
              <span>ML Active</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3 h-3 text-yellow-500" />
              <span>Loading...</span>
            </>
          )}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-models-status">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Models Loaded
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-models-count">
                {status ? Object.values(status.modelsLoaded).filter(Boolean).length : 0}/5
              </div>
            )}
            <p className="text-xs text-muted-foreground">Active ML models</p>
          </CardContent>
        </Card>

        <Card data-testid="card-cache-stats">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Cache Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="flex gap-2" data-testid="text-cache-stats">
                <Badge variant="secondary">{status?.cacheStats.predictions || 0} pred</Badge>
                <Badge variant="secondary">{status?.cacheStats.sentiments || 0} sent</Badge>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Cached results</p>
          </CardContent>
        </Card>

        <Card data-testid="card-market-regime">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Market Regime
            </CardTitle>
          </CardHeader>
          <CardContent>
            {regimeLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="flex items-center gap-2" data-testid="text-regime">
                <span className="text-lg font-semibold capitalize">
                  {regime?.regime.replace(/_/g, ' ') || 'Unknown'}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs text-muted-foreground">Risk:</p>
              {regime && <RiskBadge level={regime.riskLevel} />}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-version">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gauge className="w-4 h-4" />
              System Version
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-version">
              v{status?.version || '1.0.0'}
            </div>
            <p className="text-xs text-muted-foreground">ML Intelligence Engine</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" data-testid="card-symbol-analysis">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Symbol Analysis
            </CardTitle>
            <CardDescription>Get comprehensive ML signal for any symbol</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input 
                placeholder="Enter symbol (e.g., AAPL, TSLA, SPY)" 
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
                className="flex-1"
                data-testid="input-symbol-search"
              />
              <Button 
                onClick={handleAnalyze}
                disabled={!searchSymbol.trim() || signalLoading}
                data-testid="button-analyze"
              >
                {signalLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Analyze'}
              </Button>
            </div>

            {signal && (
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <DirectionIcon direction={signal.prediction.direction} />
                    <div>
                      <h3 className="text-xl font-bold" data-testid="text-analyzed-symbol">{signal.symbol}</h3>
                      <p className="text-sm text-muted-foreground">
                        Score: <span className={signal.compositeScore > 0 ? 'text-green-500' : signal.compositeScore < 0 ? 'text-red-500' : ''}>
                          {signal.compositeScore.toFixed(0)}
                        </span>
                      </p>
                    </div>
                  </div>
                  <RecommendationBadge recommendation={signal.tradingRecommendation} />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" /> Prediction
                    </h4>
                    <div className="text-sm space-y-1">
                      <p>Direction: <span className="font-medium capitalize">{signal.prediction.direction}</span></p>
                      <p>Confidence: <span className="font-medium">{signal.prediction.confidence.toFixed(0)}%</span></p>
                      <p>RSI: <span className="font-medium">{signal.prediction.features.rsi.toFixed(1)}</span></p>
                      <p>Momentum: <span className="font-medium">{signal.prediction.features.momentum.toFixed(2)}%</span></p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm flex items-center gap-1">
                      <BarChart3 className="w-4 h-4" /> Sentiment
                    </h4>
                    <div className="text-sm space-y-1">
                      <p>Overall: <span className="font-medium capitalize">{signal.sentiment.overallSentiment.replace(/_/g, ' ')}</span></p>
                      <p>Score: <span className={`font-medium ${signal.sentiment.score > 0 ? 'text-green-500' : signal.sentiment.score < 0 ? 'text-red-500' : ''}`}>
                        {signal.sentiment.score.toFixed(0)}
                      </span></p>
                      <p>News Score: <span className="font-medium">{signal.sentiment.newsScore.toFixed(0)}</span></p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm flex items-center gap-1">
                      <Target className="w-4 h-4" /> Position Sizing
                    </h4>
                    <div className="text-sm space-y-1">
                      <p>Recommended: <span className="font-medium">${signal.positionSize.recommendedSize.toFixed(0)}</span></p>
                      <p>Risk %: <span className="font-medium">{signal.positionSize.riskPercent.toFixed(1)}%</span></p>
                      <p>Kelly: <span className="font-medium">{signal.positionSize.kellyFraction.toFixed(1)}%</span></p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm flex items-center gap-1">
                      <Layers className="w-4 h-4" /> Patterns ({signal.patterns.length})
                    </h4>
                    <div className="text-sm space-y-1">
                      {signal.patterns.slice(0, 3).map((p, i) => (
                        <p key={i}>
                          <Badge variant={p.type === 'bullish' ? 'default' : 'destructive'} className="text-xs mr-1">
                            {p.type}
                          </Badge>
                          {p.pattern}
                        </p>
                      ))}
                      {signal.patterns.length === 0 && <p className="text-muted-foreground">No patterns detected</p>}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t">
                  <h4 className="font-semibold text-sm mb-2">Signals</h4>
                  <div className="flex flex-wrap gap-1">
                    {signal.prediction.signals.map((s, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-market-scan">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Market Scan
              </CardTitle>
              <CardDescription>Top symbols by ML signal strength</CardDescription>
            </div>
            <Button 
              size="icon" 
              variant="ghost" 
              onClick={() => refetchScan()}
              disabled={scanLoading}
              data-testid="button-refresh-scan"
            >
              <RefreshCw className={`w-4 h-4 ${scanLoading ? 'animate-spin' : ''}`} />
            </Button>
          </CardHeader>
          <CardContent>
            {scanLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {scan?.signals.slice(0, 8).map((s, i) => (
                  <div 
                    key={s.symbol} 
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover-elevate cursor-pointer"
                    onClick={() => {
                      setSearchSymbol(s.symbol);
                      setAnalyzedSymbol(s.symbol);
                    }}
                    data-testid={`scan-result-${s.symbol}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                      <DirectionIcon direction={s.direction} />
                      <span className="font-semibold">{s.symbol}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${s.compositeScore > 0 ? 'text-green-500' : s.compositeScore < 0 ? 'text-red-500' : ''}`}>
                        {s.compositeScore > 0 ? '+' : ''}{s.compositeScore.toFixed(0)}
                      </span>
                      <RecommendationBadge recommendation={s.recommendation} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {regime && (
        <Card data-testid="card-regime-details">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Market Regime Details
            </CardTitle>
            <CardDescription>Current market conditions and recommended strategies</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h4 className="font-semibold mb-2">Characteristics</h4>
                <div className="space-y-1">
                  {regime.characteristics.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Recommended Strategies</h4>
                <div className="flex flex-wrap gap-2">
                  {regime.recommendedStrategies.map((s, i) => (
                    <Badge key={i} variant="secondary">{s}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-ml-capabilities">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            ML Capabilities
          </CardTitle>
          <CardDescription>Active machine learning models and their status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            {[
              { name: 'Price Predictor', key: 'pricePredictor', icon: TrendingUp, desc: 'Statistical direction prediction' },
              { name: 'Sentiment Analyzer', key: 'sentimentAnalyzer', icon: BarChart3, desc: 'News & social sentiment' },
              { name: 'Pattern Recognizer', key: 'patternRecognizer', icon: Layers, desc: 'Chart pattern detection' },
              { name: 'Position Sizer', key: 'positionSizer', icon: Target, desc: 'Adaptive Kelly sizing' },
              { name: 'Regime Detector', key: 'regimeDetector', icon: Activity, desc: 'Market regime clustering' },
            ].map((model) => {
              const isLoaded = status?.modelsLoaded?.[model.key as keyof typeof status.modelsLoaded];
              const Icon = model.icon;
              return (
                <div 
                  key={model.key}
                  className={`p-4 rounded-lg border ${isLoaded ? 'bg-green-500/5 border-green-500/20' : 'bg-muted/50 border-muted'}`}
                  data-testid={`model-${model.key}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-5 h-5 ${isLoaded ? 'text-green-500' : 'text-muted-foreground'}`} />
                    <span className="font-semibold text-sm">{model.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{model.desc}</p>
                  <Badge 
                    variant={isLoaded ? 'default' : 'secondary'} 
                    className={`mt-2 ${isLoaded ? 'bg-green-500/20 text-green-400' : ''}`}
                  >
                    {isLoaded ? 'Active' : 'Loading...'}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
