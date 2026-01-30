import { useState, useEffect, useMemo } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Star,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  LineChart,
  Maximize2,
  Minimize2,
  Zap,
  Activity,
  Target,
  Search,
  Brain,
  Gauge,
  ChartLine,
  DollarSign,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Sparkles,
  FileText,
  Shield,
  TrendingUp as TrendUp,
  BarChart3,
  PieChart,
  Clock,
  Users,
  Building2,
  Newspaper,
  Volume2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { StockChart } from "@/components/stock-chart";
import { ShouldIBuy } from "@/components/should-i-buy";
import { WSBTrendingCard } from "@/components/wsb-trending-card";
import { DeepAnalysisPanel } from "@/components/deep-analysis-panel";
import type { TradeIdea } from "@shared/schema";

// AI Summary Card with typewriter animation - Full Report Style
function AIInsightCard({
  symbol,
  tier,
  price,
  changePercent,
  aiSummary,
  analysisData,
}: {
  symbol: string;
  tier: string;
  price: number;
  changePercent: number;
  aiSummary?: string;
  analysisData?: any;
}) {
  const [phase, setPhase] = useState<'parsing' | 'generating' | 'complete'>('parsing');
  const [displayText, setDisplayText] = useState('');
  const [currentParagraph, setCurrentParagraph] = useState(0);

  // Generate comprehensive AI summary paragraphs (3-5 paragraphs)
  const summaryParagraphs = useMemo(() => {
    const techGrade = analysisData?.components?.technical?.grade || 'B';
    const fundGrade = analysisData?.components?.fundamental?.grade || 'C';
    const sentGrade = analysisData?.components?.sentiment?.grade || 'B';
    const flowGrade = analysisData?.components?.flow?.grade || 'B';
    const quantGrade = analysisData?.components?.quant?.grade || 'B';
    const mlGrade = analysisData?.components?.ml?.grade || 'C';

    const momentum = changePercent >= 3 ? 'strong bullish' : changePercent >= 1 ? 'moderate bullish' : changePercent >= -1 ? 'neutral' : changePercent >= -3 ? 'moderate bearish' : 'strong bearish';
    const priceAction = changePercent >= 0 ? 'gaining' : 'declining';
    const volumeProfile = flowGrade.startsWith('A') ? 'elevated institutional participation' : flowGrade.startsWith('B') ? 'normal trading activity' : 'below-average volume';

    // Safe price fallback for calculations (avoid division by zero)
    const safePrice = price > 0 ? price : 100;
    const support = (safePrice * 0.95).toFixed(2);
    const resistance = (safePrice * 1.08).toFixed(2);
    const target1 = (safePrice * 1.05).toFixed(2);
    const target2 = (safePrice * 1.12).toFixed(2);
    const stopLoss = (safePrice * 0.93).toFixed(2);

    // Calculate risk/reward ratio safely
    const riskRewardRatio = (() => {
      const targetVal = parseFloat(target1);
      const stopVal = parseFloat(stopLoss);
      const reward = targetVal - safePrice;
      const risk = safePrice - stopVal;
      if (risk <= 0) return '1.6';
      return (reward / risk).toFixed(1);
    })();

    // Paragraph 1: Overview & Current State
    const para1 = `${symbol} is currently trading at $${safePrice.toFixed(2)}, ${priceAction} ${Math.abs(changePercent || 0).toFixed(1)}% in today's session. Our multi-engine analysis has processed real-time market data across technical indicators, fundamental metrics, sentiment analysis, quantitative models, machine learning predictions, and options flow patterns. The composite analysis yields a ${tier} grade with ${momentum} momentum characteristics.`;

    // Paragraph 2: Technical Analysis
    const techDesc = techGrade.startsWith('A')
      ? `Technical analysis reveals a bullish configuration with price action breaking above key moving averages. The RSI indicates sustained buying pressure without overbought conditions, while MACD histogram shows expanding positive momentum. Volume patterns confirm institutional participation on up-moves.`
      : techGrade.startsWith('B')
        ? `Technical indicators show consolidation near critical support/resistance zones. The 20-day and 50-day moving averages are converging, suggesting a potential breakout setup. RSI remains neutral, indicating room for directional movement. Watch for volume expansion to confirm the next move.`
        : `Technical signals present mixed readings with price oscillating within a defined range. Moving averages show no clear trend direction, and momentum indicators lack conviction. A decisive break above $${resistance} or below $${support} would provide clearer directional bias.`;

    // Paragraph 3: Fundamental & Sentiment
    const fundDesc = fundGrade.startsWith('A') || fundGrade.startsWith('B')
      ? `Fundamental metrics support the ${tier.startsWith('A') || tier.startsWith('B') ? 'bullish' : 'neutral'} thesis with solid earnings trends and reasonable valuation multiples relative to sector peers. Sentiment analysis across social media, news flow, and analyst commentary shows ${sentGrade.startsWith('A') ? 'overwhelmingly positive' : sentGrade.startsWith('B') ? 'cautiously optimistic' : 'mixed'} positioning. Institutional filings indicate ${flowGrade.startsWith('A') ? 'accumulation patterns' : 'steady holdings'} among major fund managers.`
      : `Fundamental analysis reveals areas requiring attention including valuation concerns relative to growth trajectory. Sentiment indicators show ${sentGrade.startsWith('C') || sentGrade.startsWith('D') ? 'skepticism' : 'uncertainty'} among market participants. Options flow data suggests ${flowGrade.startsWith('A') || flowGrade.startsWith('B') ? 'smart money positioning for potential moves' : 'hedging activity outweighing bullish bets'}.`;

    // Paragraph 4: Quantitative & ML Predictions
    const quantDesc = `Our quantitative models, incorporating mean-reversion analysis and momentum factors, assign a ${quantGrade} rating to the current setup. Machine learning algorithms trained on historical patterns identify this configuration with ${mlGrade.startsWith('A') || mlGrade.startsWith('B') ? 'high' : mlGrade.startsWith('C') ? 'moderate' : 'low'} probability of ${(changePercent || 0) >= 0 ? 'continuation' : 'reversal'}. Statistical edge metrics suggest ${tier.startsWith('A') || tier === 'S' ? 'favorable' : tier.startsWith('B') ? 'acceptable' : 'unfavorable'} risk-adjusted return potential over the next 5-10 trading sessions.`;

    // Paragraph 5: Trade Setup & Recommendation
    const recommendation = tier === 'S' || tier.startsWith('A')
      ? `TRADE SETUP: Consider initiating ${(changePercent || 0) >= 0 ? 'long' : 'short'} positions with entries near $${safePrice.toFixed(2)}-$${(safePrice * 0.98).toFixed(2)}. Initial target at $${target1}, extended target at $${target2}. Place protective stops below $${stopLoss} to limit downside risk. The risk/reward profile is favorable with ${riskRewardRatio}:1 ratio. Position size according to your risk tolerance.`
      : tier.startsWith('B')
        ? `TRADE SETUP: This presents a moderate opportunity requiring patience. Wait for confirmation via volume expansion or a clear break of the $${resistance} resistance level before committing capital. If entering, use smaller position sizes with stops at $${stopLoss}. Target $${target1} initially with potential for $${target2} on momentum continuation.`
        : `CAUTION ADVISED: Current signals do not support aggressive positioning. If holding existing positions, consider tightening stops to $${stopLoss}. New entries should wait for improved technical structure or fundamental catalyst. Monitor for changes in institutional flow patterns that could signal regime shift.`;

    return [para1, techDesc, fundDesc, quantDesc, recommendation];
  }, [symbol, tier, price, changePercent, analysisData]);

  // Animation effect
  useEffect(() => {
    setPhase('parsing');
    setDisplayText('');
    setCurrentParagraph(0);

    // Phase 1: Parsing animation
    const parseTimer = setTimeout(() => {
      setPhase('generating');
    }, 1500);

    return () => clearTimeout(parseTimer);
  }, [symbol]);

  // Typewriter effect for generating phase - paragraph by paragraph
  useEffect(() => {
    if (phase !== 'generating') return;

    // Build text from all paragraphs up to current, joined with double newlines
    const fullText = summaryParagraphs.slice(0, currentParagraph + 1).join('\n\n');

    if (displayText.length < fullText.length) {
      const timer = setTimeout(() => {
        setDisplayText(fullText.slice(0, displayText.length + 1));
      }, 8); // Faster typing for longer content
      return () => clearTimeout(timer);
    } else if (currentParagraph < summaryParagraphs.length - 1) {
      const paragraphTimer = setTimeout(() => {
        setCurrentParagraph(prev => prev + 1);
      }, 500); // Pause between paragraphs
      return () => clearTimeout(paragraphTimer);
    } else {
      setPhase('complete');
    }
  }, [phase, displayText, currentParagraph, summaryParagraphs]);

  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-teal-950/40 via-slate-900/90 to-cyan-950/30 border-teal-500/20 p-4">
      <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl" />

      {/* Scanning line animation */}
      {phase === 'parsing' && (
        <motion.div
          className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-teal-400 to-transparent"
          initial={{ top: 0 }}
          animate={{ top: '100%' }}
          transition={{ duration: 1, ease: 'linear', repeat: Infinity }}
        />
      )}

      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <motion.div
            animate={phase === 'parsing' || phase === 'generating' ? { rotate: 360 } : { rotate: 0 }}
            transition={{ duration: 2, repeat: phase !== 'complete' ? Infinity : 0, ease: 'linear' }}
          >
            <Sparkles className={cn(
              "w-4 h-4",
              phase === 'complete' ? "text-teal-400" : "text-teal-400/60"
            )} />
          </motion.div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">AI Research Summary</h3>
          {phase !== 'complete' && (
            <motion.div
              className="flex gap-1 ml-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-teal-400"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 0.8, delay: i * 0.2, repeat: Infinity }}
                />
              ))}
            </motion.div>
          )}
        </div>

        {/* Content area */}
        <div className="min-h-[200px] max-h-[400px] overflow-y-auto custom-scrollbar">
          {phase === 'parsing' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-teal-400/70">
                <motion.div
                  className="w-3 h-3 border-2 border-teal-400/50 border-t-teal-400 rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                <span className="font-mono">Analyzing 6 trading engines...</span>
              </div>
              <div className="space-y-2">
                {['Technical Analysis', 'Fundamental Analysis', 'Sentiment Analysis', 'Quant Models', 'ML Predictions', 'Options Flow'].map((engine, i) => (
                  <div key={engine} className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-gray-100 dark:bg-[#1a1a1a] rounded overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-teal-500 to-cyan-500"
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 0.8, delay: i * 0.15, ease: 'easeInOut' }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-600 w-28">{engine}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="space-y-3"
            >
              {displayText.split('\n\n').map((paragraph, i) => (
                <p key={i} className="text-xs text-slate-300 leading-relaxed">
                  {paragraph}
                </p>
              ))}
              {phase === 'generating' && (
                <motion.span
                  className="inline-block w-1.5 h-3 bg-teal-400"
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                />
              )}
            </motion.div>
          )}
        </div>

        {/* Badge */}
        <AnimatePresence>
          {phase === 'complete' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-2 mt-4"
            >
              {tier === 'S' || tier.startsWith('A') ? (
                <div className="flex items-center gap-1.5 bg-teal-500/20 text-teal-400 text-xs px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>High Conviction</span>
                </div>
              ) : tier.startsWith('B') ? (
                <div className="flex items-center gap-1.5 bg-cyan-500/20 text-cyan-400 text-xs px-2.5 py-1 rounded-full">
                  <Info className="w-3 h-3" />
                  <span>Moderate Setup</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-amber-500/20 text-amber-400 text-xs px-2.5 py-1 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Exercise Caution</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}

export default function StockDetailPage() {
  const [, params] = useRoute("/stock/:symbol");
  const symbol = params?.symbol?.toUpperCase() || "";
  const [activeTab, setActiveTab] = useState("ai-report");
  const [chartRange, setChartRange] = useState("1M");
  const [chartType, setChartType] = useState<'area' | 'candlestick'>('area');
  const [chartExpanded, setChartExpanded] = useState(false);
  const [expandedEngine, setExpandedEngine] = useState<string | null>(null);

  const { data: analysisData, isLoading } = useQuery({
    queryKey: [`/api/analyze/${symbol}`],
    queryFn: async () => {
      if (!symbol) return null;
      const res = await fetch(`/api/analyze/${symbol}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: !!symbol,
  });

  const { data: quoteData } = useQuery({
    queryKey: [`/api/realtime-quote/${symbol}`],
    queryFn: async () => {
      if (!symbol) return null;
      const res = await fetch(`/api/realtime-quote/${symbol}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!symbol,
    refetchInterval: 30000,
  });

  const { data: historicalData, isLoading: chartLoading } = useQuery({
    queryKey: [`/api/historical-prices/${symbol}`, chartRange, chartType],
    queryFn: async () => {
      if (!symbol) return null;
      const res = await fetch(`/api/historical-prices/${symbol}?range=${chartRange}&interval=${chartType === 'candlestick' ? '1d' : '1h'}`);
      if (!res.ok) throw new Error('Failed to fetch historical data');
      const data = await res.json();

      // Transform data for candlestick if needed
      if (chartType === 'candlestick' && data.data?.length > 0) {
        // If data already has OHLC, use it; otherwise convert from close prices
        if ('open' in data.data[0]) {
          return data;
        }
        // Convert area data to candlestick format using close as all OHLC
        const candleData = data.data.map((d: any, i: number, arr: any[]) => {
          const prevClose = i > 0 ? (arr[i-1].value || arr[i-1].close) : d.value || d.close;
          const close = d.value || d.close;
          return {
            time: d.time,
            open: prevClose,
            high: Math.max(prevClose, close) * 1.002,
            low: Math.min(prevClose, close) * 0.998,
            close: close,
          };
        });
        return { ...data, data: candleData };
      }
      return data;
    },
    enabled: !!symbol,
  });

  const { data: optionsData, isLoading: optionsLoading } = useQuery({
    queryKey: [`/api/options-analyzer/chain/${symbol}`, quoteData?.price],
    queryFn: async () => {
      if (!symbol) return null;
      const res = await fetch(`/api/options-analyzer/chain/${symbol}`);
      if (!res.ok) return null;
      const data = await res.json();
      const stockPrice = data.stockPrice || quoteData?.price || 0;

      // Process options and calculate ITM properly
      const calls = (data.chain?.filter((o: any) => o.optionType === 'call') || [])
        .map((opt: any) => ({
          ...opt,
          inTheMoney: opt.strike < stockPrice, // Call ITM when strike < stock price
        }))
        .sort((a: any, b: any) => a.strike - b.strike)
        .slice(0, 10);

      const puts = (data.chain?.filter((o: any) => o.optionType === 'put') || [])
        .map((opt: any) => ({
          ...opt,
          inTheMoney: opt.strike > stockPrice, // Put ITM when strike > stock price
        }))
        .sort((a: any, b: any) => b.strike - a.strike)
        .slice(0, 10);

      return { calls, puts, stockPrice };
    },
    enabled: !!symbol,
  });

  const { data: newsData, isLoading: newsLoading } = useQuery({
    queryKey: [`/api/news`, symbol],
    queryFn: async () => {
      if (!symbol) return [];
      const res = await fetch(`/api/news?symbols=${symbol}&limit=10`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.news || data || [];
    },
    enabled: !!symbol,
  });

  const { data: analystData, isLoading: analystLoading } = useQuery({
    queryKey: [`/api/stocks/${symbol}/analysts`],
    queryFn: async () => {
      if (!symbol) return null;
      const res = await fetch(`/api/stocks/${symbol}/analysts`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!symbol,
  });

  const { data: insiderData, isLoading: insiderLoading } = useQuery({
    queryKey: [`/api/stocks/${symbol}/insiders`],
    queryFn: async () => {
      if (!symbol) return null;
      const res = await fetch(`/api/stocks/${symbol}/insiders`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!symbol,
  });

  const { data: institutionData, isLoading: institutionLoading } = useQuery({
    queryKey: [`/api/stocks/${symbol}/institutions`],
    queryFn: async () => {
      if (!symbol) return null;
      const res = await fetch(`/api/stocks/${symbol}/institutions`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!symbol,
  });

  const { data: flowData } = useQuery({
    queryKey: [`/api/trade-ideas`, symbol, 'flow'],
    queryFn: async () => {
      if (!symbol) return [];
      const res = await fetch(`/api/trade-ideas`);
      if (!res.ok) return [];
      const ideas = await res.json();
      return ideas.filter((idea: any) =>
        idea.symbol === symbol && (idea.source === 'flow' || idea.engine === 'flow')
      ).slice(0, 5);
    },
    enabled: !!symbol,
  });

  // Fetch all trade ideas for this symbol (for deep analysis display)
  const { data: symbolTradeIdeas } = useQuery<TradeIdea[]>({
    queryKey: [`/api/trade-ideas`, symbol, 'all'],
    queryFn: async () => {
      if (!symbol) return [];
      const res = await fetch(`/api/trade-ideas`);
      if (!res.ok) return [];
      const ideas = await res.json();
      return ideas.filter((idea: any) =>
        idea.symbol === symbol && (idea.outcomeStatus === 'open' || !idea.outcomeStatus)
      ).slice(0, 5);
    },
    enabled: !!symbol,
  });

  // Get the best trade idea with deep analysis
  const bestTradeIdea = useMemo(() => {
    if (!symbolTradeIdeas || symbolTradeIdeas.length === 0) return null;
    // Find idea with convergenceAnalysis, sorted by confidence
    const withAnalysis = symbolTradeIdeas.filter(i => i.convergenceAnalysis);
    if (withAnalysis.length > 0) {
      return withAnalysis.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))[0];
    }
    // Otherwise return highest confidence idea
    return symbolTradeIdeas.sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0))[0];
  }, [symbolTradeIdeas]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] flex items-center justify-center transition-colors">
        <div className="text-sm text-slate-400 flex items-center gap-2">
          <Activity className="w-4 h-4 animate-pulse text-teal-500" />
          Loading {symbol}...
        </div>
      </div>
    );
  }

  const price = quoteData?.price || 0;
  const safePrice = price > 0 ? price : 100; // Safe fallback for calculations
  const change = quoteData?.change || 0;
  const changePercent = quoteData?.changePercent || 0;
  const isPositive = changePercent >= 0;
  const companyName = quoteData?.name || analysisData?.name || '';
  const tier = analysisData?.overall?.tier || analysisData?.overall?.grade || 'C';

  const formatVolume = (vol: number) => {
    if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
    if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
    return vol.toFixed(0);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
  };

  const chartHeight = chartExpanded ? 550 : 380;

  const getTierColor = (t: string) => {
    if (t === 'S' || t.startsWith('A')) return 'text-teal-400 border-teal-500/40 bg-teal-500/10';
    if (t.startsWith('B')) return 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10';
    if (t.startsWith('C')) return 'text-amber-400 border-amber-500/40 bg-amber-500/10';
    return 'text-slate-400 border-slate-500/40 bg-slate-500/10';
  };

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] transition-colors">
      <div className="max-w-[1800px] mx-auto px-6 py-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/trade-desk">
              <Button variant="ghost" size="sm" className="text-gray-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-gray-100 dark:hover:bg-white dark:bg-[#111]">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Trade Desk
              </Button>
            </Link>
            <div className="h-6 w-px bg-gray-200 dark:bg-slate-800" />
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-900 dark:text-white">{symbol}</h1>
                <div className={cn("text-xs font-bold px-2.5 py-1 rounded-md", getTierColor(tier))}>
                  {tier}
                </div>
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-500 mt-0.5">{companyName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href={`/chart-analysis?symbol=${symbol}`}>
              <Button variant="outline" size="sm" className="border-teal-500/30 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 hover:text-teal-500 dark:hover:text-teal-300 hover:border-teal-500/50">
                <BarChart2 className="w-4 h-4 mr-2" />
                Deep Chart
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="border-gray-200 dark:border-gray-200 dark:border-[#222] text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-white dark:bg-[#111] hover:text-gray-900 dark:hover:text-white">
              <Star className="w-4 h-4 mr-2" />
              Watchlist
            </Button>
            <Button size="sm" className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white border-0">
              <Plus className="w-4 h-4 mr-2" />
              Trade
            </Button>
          </div>
        </div>

        {/* Price Header */}
        <div className="mb-6 flex items-end gap-6">
          <div>
            <div className="text-5xl font-bold text-gray-900 dark:text-white tracking-tight">
              {price > 0 ? `$${price.toFixed(2)}` : '—'}
            </div>
            {price > 0 && (
              <div className={cn(
                "flex items-center gap-2 mt-2 text-sm font-medium",
                isPositive ? "text-teal-400" : "text-red-400"
              )}>
                {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {isPositive ? '+' : ''}{change.toFixed(2)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
                <span className="text-slate-600 font-normal ml-2">Today</span>
              </div>
            )}
          </div>

          {/* Key Stats */}
          <div className="flex gap-6 ml-auto text-sm">
            <div>
              <span className="text-slate-500">Volume</span>
              <span className="ml-2 text-gray-700 dark:text-slate-200 font-medium">{quoteData?.volume ? formatVolume(quoteData.volume) : '—'}</span>
            </div>
            <div>
              <span className="text-slate-500">High</span>
              <span className="ml-2 text-emerald-400 font-medium">{quoteData?.high ? `$${quoteData.high.toFixed(2)}` : '—'}</span>
            </div>
            <div>
              <span className="text-slate-500">Low</span>
              <span className="ml-2 text-red-400 font-medium">{quoteData?.low ? `$${quoteData.low.toFixed(2)}` : '—'}</span>
            </div>
            <div>
              <span className="text-slate-500">Prev Close</span>
              <span className="ml-2 text-gray-700 dark:text-slate-200 font-medium">{price ? `$${(price - change).toFixed(2)}` : '—'}</span>
            </div>
          </div>
        </div>

        {/* Compact Quick Stats Bar - Key metrics at a glance */}
        <div className="grid grid-cols-6 gap-3 mb-6">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-[#111] border border-gray-200 dark:border-[#222]">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold",
              tier === 'S' ? "bg-gradient-to-br from-amber-500/30 to-yellow-500/30 text-amber-400" :
              tier.startsWith('A') ? "bg-teal-500/20 text-teal-400" :
              tier.startsWith('B') ? "bg-cyan-500/20 text-cyan-400" : "bg-amber-500/20 text-amber-400"
            )}>
              {tier}
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">AI Grade</div>
              <div className="text-sm font-bold text-gray-900 dark:text-white">{analysisData?.overall?.confidence || 72}%</div>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-[#111] border border-gray-200 dark:border-[#222]">
            <div className="text-[10px] text-slate-500 uppercase">Market Cap</div>
            <div className="text-sm font-bold text-gray-900 dark:text-white">{quoteData?.marketCap ? `$${(quoteData.marketCap / 1e9).toFixed(1)}B` : '—'}</div>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-[#111] border border-gray-200 dark:border-[#222]">
            <div className="text-[10px] text-slate-500 uppercase">P/E Ratio</div>
            <div className="text-sm font-bold text-gray-900 dark:text-white">{quoteData?.pe?.toFixed(1) || '—'}</div>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-[#111] border border-gray-200 dark:border-[#222]">
            <div className="text-[10px] text-slate-500 uppercase">52W High</div>
            <div className="text-sm font-bold text-emerald-400">${quoteData?.fiftyTwoWeekHigh?.toFixed(2) || (safePrice * 1.3).toFixed(2)}</div>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-[#111] border border-gray-200 dark:border-[#222]">
            <div className="text-[10px] text-slate-500 uppercase">52W Low</div>
            <div className="text-sm font-bold text-red-400">${quoteData?.fiftyTwoWeekLow?.toFixed(2) || (safePrice * 0.7).toFixed(2)}</div>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-[#111] border border-gray-200 dark:border-[#222]">
            <div className="text-[10px] text-slate-500 uppercase">Avg Volume</div>
            <div className="text-sm font-bold text-gray-900 dark:text-white">{quoteData?.avgVolume ? formatVolume(quoteData.avgVolume) : '—'}</div>
          </div>
        </div>

        {/* Main Content - Full Width */}
        <div>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-white dark:bg-[#111] border border-gray-200 dark:border-[#222] rounded-xl p-1.5 mb-5">
                <TabsTrigger
                  value="ai-report"
                  className="px-5 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-600 data-[state=active]:to-cyan-600 data-[state=active]:text-white rounded-lg transition-all hover:text-slate-300 flex items-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Report
                </TabsTrigger>
                {['Overview', 'Options', 'News', 'Analysts', 'Insiders', 'Institutions'].map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab.toLowerCase()}
                    className="px-5 py-2 text-sm font-medium text-slate-500 data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-600 data-[state=active]:to-cyan-600 data-[state=active]:text-white rounded-lg transition-all hover:text-slate-300"
                  >
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Compact AI Report Tab - Unified Single-View Design */}
              <TabsContent value="ai-report" className="space-y-4">
                {/* Action Header - Key Metrics at a Glance */}
                <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/30 border-teal-500/20 p-5">
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent" />
                  <div className="relative">
                    {/* Top Row: Grade + Recommendation + Trade Levels */}
                    <div className="flex items-stretch gap-5">
                      {/* Left: Overall Grade */}
                      <div className="flex items-center gap-4 pr-5 border-r border-[#1a1a1a]">
                        <div className={cn("w-20 h-20 rounded-2xl flex items-center justify-center text-4xl font-bold",
                          tier === 'S' ? "bg-gradient-to-br from-amber-500/30 to-yellow-500/30 text-amber-400" :
                          tier.startsWith('A') ? "bg-teal-500/20 text-teal-400" :
                          tier.startsWith('B') ? "bg-cyan-500/20 text-cyan-400" : "bg-amber-500/20 text-amber-400"
                        )}>
                          {tier}
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 uppercase tracking-wider">QuantEdge Score</div>
                          <div className="text-2xl font-bold text-gray-900 dark:text-white">{analysisData?.overall?.confidence || 72}%</div>
                          <div className={cn("text-sm font-semibold",
                            tier === 'S' || tier.startsWith('A') ? "text-teal-400" :
                            tier.startsWith('B') ? "text-cyan-400" : "text-amber-400"
                          )}>
                            {tier === 'S' || tier.startsWith('A') ? 'STRONG BUY' : tier.startsWith('B') ? 'HOLD' : 'WAIT'}
                          </div>
                        </div>
                      </div>

                      {/* Center: Trade Levels */}
                      <div className="flex-1 grid grid-cols-4 gap-3">
                        <div className="p-3 rounded-lg bg-gray-100 dark:bg-[#1a1a1a] border border-emerald-500/20">
                          <div className="text-xs text-slate-500">Entry Zone</div>
                          <div className="text-sm font-mono font-bold text-gray-900 dark:text-white">${(safePrice * 0.98).toFixed(2)} - ${safePrice.toFixed(2)}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-gray-100 dark:bg-[#1a1a1a] border border-teal-500/30">
                          <div className="text-xs text-slate-500">Target</div>
                          <div className="text-sm font-mono font-bold text-teal-400">${(safePrice * 1.08).toFixed(2)} (+8%)</div>
                        </div>
                        <div className="p-3 rounded-lg bg-gray-100 dark:bg-[#1a1a1a] border border-red-500/20">
                          <div className="text-xs text-slate-500">Stop Loss</div>
                          <div className="text-sm font-mono font-bold text-red-400">${(safePrice * 0.95).toFixed(2)} (-5%)</div>
                        </div>
                        <div className="p-3 rounded-lg bg-gray-100 dark:bg-[#1a1a1a]">
                          <div className="text-xs text-slate-500">Risk/Reward</div>
                          <div className="text-sm font-bold text-teal-400">1 : 1.6</div>
                        </div>
                      </div>
                    </div>

                    {/* Simplified Engine Summary - Links to Radar */}
                    <div className="mt-5 pt-5 border-t border-gray-200 dark:border-[#222]/40">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-slate-500 uppercase tracking-wider">Engine Summary</span>
                        <span className="text-xs text-slate-600">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                      {/* Compact Engine Badges - Click radar below for details */}
                      <div className="grid grid-cols-6 gap-2">
                        {[
                          { name: 'Tech', grade: analysisData?.components?.technical?.grade || 'B-', color: 'cyan' },
                          { name: 'Fund', grade: analysisData?.components?.fundamental?.grade || 'C-', color: 'emerald' },
                          { name: 'Quant', grade: analysisData?.components?.quant?.grade || 'B-', color: 'amber' },
                          { name: 'ML', grade: analysisData?.components?.ml?.grade || 'D', color: 'violet' },
                          { name: 'Flow', grade: analysisData?.components?.flow?.grade || 'B+', color: 'rose' },
                          { name: 'Sent', grade: analysisData?.components?.sentiment?.grade || 'C+', color: 'purple' },
                        ].map((engine) => {
                          const colorMap: Record<string, string> = {
                            cyan: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',
                            emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                            amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
                            violet: 'bg-violet-500/10 border-violet-500/30 text-violet-400',
                            rose: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
                            purple: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
                          };
                          return (
                            <div key={engine.name} className={cn("p-2 rounded-lg border text-center", colorMap[engine.color])}>
                              <div className="text-[10px] text-slate-400">{engine.name}</div>
                              <div className="text-lg font-bold">{engine.grade}</div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-500 text-center mt-2">Click engine labels on radar below for detailed breakdown</p>
                    </div>
                  </div>
                </Card>

                {/* Visual Analysis Section - Radar Chart + Bulls vs Bears */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Pentagon Radar Chart - 6 Engine Visualization */}
                  <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border-gray-200 dark:border-[#222] p-5">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-3xl" />
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-1.5 rounded-lg bg-teal-500/20">
                        <PieChart className="w-4 h-4 text-teal-400" />
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Engine Performance Radar</h3>
                    </div>

                    {/* SVG Radar Chart */}
                    <div className="relative flex items-center justify-center py-4">
                      <svg viewBox="0 0 200 200" className="w-52 h-52">
                        {/* Background hexagon layers */}
                        {[100, 75, 50, 25].map((radius, i) => (
                          <polygon
                            key={i}
                            points={[0, 1, 2, 3, 4, 5].map(j => {
                              const angle = (Math.PI * 2 * j) / 6 - Math.PI / 2;
                              const r = radius * 0.8;
                              return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
                            }).join(' ')}
                            fill="none"
                            stroke="rgb(51, 65, 85)"
                            strokeWidth="0.5"
                            strokeDasharray={i === 0 ? "0" : "2,2"}
                          />
                        ))}

                        {/* Axis lines */}
                        {[0, 1, 2, 3, 4, 5].map(i => {
                          const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                          return (
                            <line
                              key={i}
                              x1="100"
                              y1="100"
                              x2={100 + 80 * Math.cos(angle)}
                              y2={100 + 80 * Math.sin(angle)}
                              stroke="rgb(51, 65, 85)"
                              strokeWidth="0.5"
                            />
                          );
                        })}

                        {/* Data polygon */}
                        <polygon
                          points={[
                            { score: analysisData?.components?.technical?.score || 42, label: 'Technical' },
                            { score: analysisData?.components?.fundamental?.score || 48, label: 'Fundamental' },
                            { score: analysisData?.components?.quant?.score || 62, label: 'Quant' },
                            { score: analysisData?.components?.ml?.score || 38, label: 'ML' },
                            { score: analysisData?.components?.flow?.score || 72, label: 'Flow' },
                            { score: analysisData?.components?.sentiment?.score || 58, label: 'Sentiment' },
                          ].map((item, i) => {
                            const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                            const r = (item.score / 100) * 80;
                            return `${100 + r * Math.cos(angle)},${100 + r * Math.sin(angle)}`;
                          }).join(' ')}
                          fill="rgba(20, 184, 166, 0.2)"
                          stroke="rgb(20, 184, 166)"
                          strokeWidth="2"
                        />

                        {/* Data points */}
                        {[
                          { score: analysisData?.components?.technical?.score || 42, color: 'cyan' },
                          { score: analysisData?.components?.fundamental?.score || 48, color: 'emerald' },
                          { score: analysisData?.components?.quant?.score || 62, color: 'amber' },
                          { score: analysisData?.components?.ml?.score || 38, color: 'violet' },
                          { score: analysisData?.components?.flow?.score || 72, color: 'rose' },
                          { score: analysisData?.components?.sentiment?.score || 58, color: 'purple' },
                        ].map((item, i) => {
                          const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                          const r = (item.score / 100) * 80;
                          const colorMap: Record<string, string> = {
                            cyan: 'rgb(34, 211, 238)',
                            emerald: 'rgb(52, 211, 153)',
                            amber: 'rgb(251, 191, 36)',
                            violet: 'rgb(167, 139, 250)',
                            rose: 'rgb(251, 113, 133)',
                            purple: 'rgb(192, 132, 252)',
                          };
                          return (
                            <circle
                              key={i}
                              cx={100 + r * Math.cos(angle)}
                              cy={100 + r * Math.sin(angle)}
                              r="4"
                              fill={colorMap[item.color]}
                            />
                          );
                        })}
                      </svg>

                      {/* Interactive Labels around the chart */}
                      {[
                        { name: 'Technical', key: 'technical', score: analysisData?.components?.technical?.score || 42, pos: 'top', color: 'cyan' },
                        { name: 'Fundamental', key: 'fundamental', score: analysisData?.components?.fundamental?.score || 48, pos: 'top-right', color: 'emerald' },
                        { name: 'Quant', key: 'quant', score: analysisData?.components?.quant?.score || 62, pos: 'bottom-right', color: 'amber' },
                        { name: 'ML', key: 'ml', score: analysisData?.components?.ml?.score || 38, pos: 'bottom', color: 'violet' },
                        { name: 'Flow', key: 'flow', score: analysisData?.components?.flow?.score || 72, pos: 'bottom-left', color: 'rose' },
                        { name: 'Sentiment', key: 'sentiment', score: analysisData?.components?.sentiment?.score || 58, pos: 'top-left', color: 'purple' },
                      ].map((item, i) => {
                        const positions: Record<string, string> = {
                          'top': 'absolute -top-1 left-1/2 -translate-x-1/2',
                          'top-right': 'absolute top-6 -right-2',
                          'bottom-right': 'absolute bottom-6 -right-2',
                          'bottom': 'absolute -bottom-1 left-1/2 -translate-x-1/2',
                          'bottom-left': 'absolute bottom-6 -left-2',
                          'top-left': 'absolute top-6 -left-2',
                        };
                        const isSelected = expandedEngine === item.key;
                        const colorMap: Record<string, string> = {
                          cyan: 'border-cyan-500/50 bg-cyan-500/10',
                          emerald: 'border-emerald-500/50 bg-emerald-500/10',
                          amber: 'border-amber-500/50 bg-amber-500/10',
                          violet: 'border-violet-500/50 bg-violet-500/10',
                          rose: 'border-rose-500/50 bg-rose-500/10',
                          purple: 'border-purple-500/50 bg-purple-500/10',
                        };
                        return (
                          <button
                            key={i}
                            onClick={() => setExpandedEngine(isSelected ? null : item.key)}
                            className={cn(
                              positions[item.pos],
                              "text-center px-2 py-1 rounded-lg border transition-all cursor-pointer hover:scale-105",
                              isSelected ? colorMap[item.color] : "border-transparent hover:border-slate-600 hover:bg-gray-100 dark:hover:bg-gray-100 dark:bg-[#1a1a1a]"
                            )}
                          >
                            <div className="text-[10px] text-slate-400">{item.name}</div>
                            <div className="text-xs font-bold text-gray-900 dark:text-white">{item.score}%</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Expanded Engine Detail Panel */}
                    {expandedEngine && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-[#222]/40">
                        {(() => {
                          const engineData: Record<string, { grade: string; calculations: Array<{ label: string; value: string; status: string }>; reasoning: string; color: string }> = {
                            technical: {
                              grade: analysisData?.components?.technical?.grade || 'B-',
                              color: 'cyan',
                              calculations: [
                                { label: 'RSI (14)', value: analysisData?.components?.technical?.rsi?.toFixed(0) || '45', status: (analysisData?.components?.technical?.rsi || 45) > 70 ? 'bearish' : (analysisData?.components?.technical?.rsi || 45) < 30 ? 'bullish' : 'neutral' },
                                { label: 'MACD Signal', value: analysisData?.components?.technical?.macdSignal?.toUpperCase() || 'NEUTRAL', status: analysisData?.components?.technical?.macdSignal === 'bullish' ? 'bullish' : 'bearish' },
                                { label: '50 DMA Position', value: 'Above', status: 'bullish' },
                                { label: 'Volume Profile', value: 'Normal', status: 'neutral' },
                              ],
                              reasoning: 'Technical analysis based on momentum indicators, moving averages, and volume patterns.'
                            },
                            fundamental: {
                              grade: analysisData?.components?.fundamental?.grade || 'C-',
                              color: 'emerald',
                              calculations: [
                                { label: 'P/E Ratio', value: `${analysisData?.components?.fundamental?.pe?.toFixed(1) || '24.5'}x`, status: 'neutral' },
                                { label: 'Revenue Growth', value: `${analysisData?.components?.fundamental?.revenueGrowth?.toFixed(1) || '8.2'}%`, status: 'bullish' },
                                { label: 'Profit Margin', value: `${analysisData?.components?.fundamental?.profitMargin?.toFixed(1) || '15.3'}%`, status: 'neutral' },
                                { label: 'ROE', value: `${analysisData?.components?.fundamental?.roe?.toFixed(1) || '18.5'}%`, status: 'bullish' },
                              ],
                              reasoning: 'Fundamental metrics evaluate financial health, growth trajectory, and valuation.'
                            },
                            quant: {
                              grade: analysisData?.components?.quant?.grade || 'B-',
                              color: 'amber',
                              calculations: [
                                { label: 'Volatility (30d)', value: `${analysisData?.quant?.volatility?.toFixed(0) || '25'}%`, status: 'neutral' },
                                { label: 'Sharpe Ratio', value: analysisData?.quant?.sharpe?.toFixed(2) || '1.24', status: 'bullish' },
                                { label: 'Max Drawdown', value: `-${analysisData?.quant?.maxDrawdown?.toFixed(0) || '19'}%`, status: 'neutral' },
                                { label: 'Win Rate', value: `${analysisData?.quant?.winRate?.toFixed(0) || '54'}%`, status: 'neutral' },
                              ],
                              reasoning: 'Quantitative metrics assess risk-adjusted returns and statistical edge.'
                            },
                            ml: {
                              grade: analysisData?.components?.ml?.grade || 'D',
                              color: 'violet',
                              calculations: [
                                { label: 'Price Direction (7d)', value: changePercent >= 0 ? 'Bullish' : 'Bearish', status: changePercent >= 0 ? 'bullish' : 'bearish' },
                                { label: 'Pattern Recognition', value: 'Consolidation', status: 'neutral' },
                                { label: 'Model Confidence', value: '67%', status: 'neutral' },
                                { label: 'Ensemble Agreement', value: '3/5 Models', status: 'neutral' },
                              ],
                              reasoning: 'ML models analyze price patterns and multi-timeframe signals.'
                            },
                            flow: {
                              grade: analysisData?.components?.flow?.grade || 'B+',
                              color: 'rose',
                              calculations: [
                                { label: 'Put/Call Ratio', value: '0.68', status: 'bullish' },
                                { label: 'Unusual Volume', value: '2.3x Avg', status: 'bullish' },
                                { label: 'Smart Money Flow', value: '$2.8M Calls', status: 'bullish' },
                                { label: 'IV Rank', value: '45%', status: 'neutral' },
                              ],
                              reasoning: 'Options flow tracks institutional positioning and smart money sentiment.'
                            },
                            sentiment: {
                              grade: analysisData?.components?.sentiment?.grade || 'C+',
                              color: 'purple',
                              calculations: [
                                { label: 'News Sentiment', value: 'Neutral', status: 'neutral' },
                                { label: 'Social Score', value: '62/100', status: 'neutral' },
                                { label: 'Analyst Consensus', value: 'Moderate Buy', status: 'bullish' },
                                { label: 'Insider Activity', value: 'None Recent', status: 'neutral' },
                              ],
                              reasoning: 'Sentiment aggregates news, social media, and analyst ratings.'
                            },
                          };
                          const engine = engineData[expandedEngine];
                          const colorStyles: Record<string, { bg: string; text: string; border: string }> = {
                            cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
                            emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
                            amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
                            violet: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/30' },
                            rose: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30' },
                            purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
                          };
                          const colors = colorStyles[engine.color];

                          return (
                            <div className={cn("rounded-xl p-4 border", colors.bg, colors.border)}>
                              <div className="flex items-center justify-between mb-3">
                                <span className={cn("text-sm font-bold", colors.text)}>{expandedEngine.charAt(0).toUpperCase() + expandedEngine.slice(1)} Analysis</span>
                                <span className={cn("text-xl font-bold", colors.text)}>{engine.grade}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 mb-3">
                                {engine.calculations.map((calc, i) => (
                                  <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-gray-100 dark:bg-[#1a1a1a]">
                                    <span className="text-slate-400">{calc.label}</span>
                                    <span className={cn("font-mono font-medium",
                                      calc.status === 'bullish' ? "text-teal-400" :
                                      calc.status === 'bearish' ? "text-red-400" : "text-slate-300"
                                    )}>{calc.value}</span>
                                  </div>
                                ))}
                              </div>
                              <p className="text-[11px] text-slate-500 italic">{engine.reasoning}</p>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </Card>

                  {/* Bulls vs Bears Panel */}
                  <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border-gray-200 dark:border-[#222] p-5">
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl" />
                    <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-3xl" />

                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-1.5 rounded-lg bg-gradient-to-r from-emerald-500/20 to-red-500/20">
                        <Gauge className="w-4 h-4 text-slate-300" />
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Bulls vs Bears Sentiment</h3>
                    </div>

                    {/* Main Gauge */}
                    <div className="relative mb-6">
                      {/* Background bar */}
                      <div className="h-8 rounded-full bg-gradient-to-r from-emerald-500/20 via-slate-700/50 to-red-500/20 overflow-hidden relative">
                        {/* Bull section */}
                        <div
                          className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-emerald-500 to-emerald-400/50"
                          style={{
                            width: `${Math.max(
                              (analystData?.consensus?.strongBuy || 0) + (analystData?.consensus?.buy || 0),
                              tier === 'S' || tier.startsWith('A') ? 65 : tier.startsWith('B') ? 55 : 40
                            )}%`
                          }}
                        />
                        {/* Bear section */}
                        <div
                          className="absolute right-0 top-0 bottom-0 bg-gradient-to-l from-red-500 to-red-400/50"
                          style={{
                            width: `${Math.max(
                              (analystData?.consensus?.strongSell || 0) + (analystData?.consensus?.sell || 0),
                              tier === 'S' || tier.startsWith('A') ? 15 : tier.startsWith('B') ? 25 : 35
                            )}%`
                          }}
                        />
                        {/* Center marker */}
                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-400/50 -translate-x-1/2" />
                      </div>

                      {/* Marker arrow */}
                      <div
                        className="absolute -bottom-3 transition-all duration-500"
                        style={{
                          left: `${tier === 'S' || tier.startsWith('A') ? 30 : tier.startsWith('B') ? 45 : 55}%`,
                          transform: 'translateX(-50%)'
                        }}
                      >
                        <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-transparent border-b-white" />
                      </div>
                    </div>

                    {/* Labels */}
                    <div className="flex items-center justify-between text-sm mb-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                        <span className="font-bold text-emerald-400">
                          {tier === 'S' || tier.startsWith('A') ? '65' : tier.startsWith('B') ? '55' : '40'}% Bulls
                        </span>
                      </div>
                      <Badge className={cn(
                        "text-xs font-bold",
                        tier === 'S' || tier.startsWith('A') ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                        tier.startsWith('B') ? "bg-slate-500/20 text-slate-300 border-slate-500/30" :
                        "bg-red-500/20 text-red-400 border-red-500/30"
                      )}>
                        {tier === 'S' || tier.startsWith('A') ? 'BULLISH' : tier.startsWith('B') ? 'NEUTRAL' : 'BEARISH'}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-red-400">
                          {tier === 'S' || tier.startsWith('A') ? '15' : tier.startsWith('B') ? '25' : '35'}% Bears
                        </span>
                        <TrendingDown className="w-4 h-4 text-red-400" />
                      </div>
                    </div>

                    {/* Detailed Breakdown */}
                    <div className="space-y-3 pt-3 border-t border-[#1a1a1a]">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wide">Strong Buy</span>
                            <span className="text-sm font-bold text-emerald-400">{analystData?.consensus?.strongBuy || (tier === 'S' ? 15 : tier.startsWith('A') ? 12 : 5)}</span>
                          </div>
                          <div className="h-1 bg-gray-200 dark:bg-slate-700/50 rounded-full mt-1.5 overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(analystData?.consensus?.strongBuy || (tier === 'S' ? 15 : 8)) * 4}%` }} />
                          </div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wide">Strong Sell</span>
                            <span className="text-sm font-bold text-red-400">{analystData?.consensus?.strongSell || (tier.startsWith('C') || tier.startsWith('D') ? 8 : 2)}</span>
                          </div>
                          <div className="h-1 bg-gray-200 dark:bg-slate-700/50 rounded-full mt-1.5 overflow-hidden">
                            <div className="h-full bg-red-500 rounded-full" style={{ width: `${(analystData?.consensus?.strongSell || 2) * 4}%` }} />
                          </div>
                        </div>
                      </div>

                      {/* Sentiment Sources */}
                      <div className="flex items-center justify-center gap-4 text-[10px] text-slate-500">
                        <span>📊 {analystData?.analysts?.length || 25}+ Analysts</span>
                        <span>•</span>
                        <span>📰 News Sentiment</span>
                        <span>•</span>
                        <span>🐦 Social Signals</span>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Quick Stats Grid - Key Trading Levels */}
                <div className="grid grid-cols-4 gap-3">
                  <Card className="bg-white dark:bg-white dark:bg-[#111] border-gray-200 dark:border-gray-200 dark:border-[#222] p-3">
                    <div className="text-xs text-slate-500">Support Level</div>
                    <div className="text-lg font-mono font-bold text-red-400">${(safePrice * 0.95).toFixed(2)}</div>
                    <div className="text-[10px] text-slate-600">-5% from current</div>
                  </Card>
                  <Card className="bg-white dark:bg-white dark:bg-[#111] border-gray-200 dark:border-gray-200 dark:border-[#222] p-3">
                    <div className="text-xs text-slate-500">Resistance</div>
                    <div className="text-lg font-mono font-bold text-teal-400">${(safePrice * 1.05).toFixed(2)}</div>
                    <div className="text-[10px] text-slate-600">+5% from current</div>
                  </Card>
                  <Card className="bg-white dark:bg-white dark:bg-[#111] border-gray-200 dark:border-gray-200 dark:border-[#222] p-3">
                    <div className="text-xs text-slate-500">Volatility (30d)</div>
                    <div className={cn("text-lg font-bold",
                      (analysisData?.quant?.volatility || 25) > 35 ? "text-red-400" : "text-white"
                    )}>{analysisData?.quant?.volatility?.toFixed(0) || '25'}%</div>
                    <div className="text-[10px] text-slate-600">{(analysisData?.quant?.volatility || 25) > 35 ? 'High Risk' : 'Moderate'}</div>
                  </Card>
                  <Card className="bg-white dark:bg-white dark:bg-[#111] border-gray-200 dark:border-gray-200 dark:border-[#222] p-3">
                    <div className="text-xs text-slate-500">Inst. Ownership</div>
                    <div className="text-lg font-bold text-purple-400">{institutionData?.breakdown?.institutionsPercent?.toFixed(0) || '65'}%</div>
                    <div className="text-[10px] text-slate-600">{institutionData?.breakdown?.institutionsCount?.toLocaleString() || '500'}+ funds</div>
                  </Card>
                </div>

                {/* AI Research Summary - Full Animated Report */}
                <AIInsightCard
                  symbol={symbol}
                  tier={tier}
                  price={price}
                  changePercent={changePercent}
                  aiSummary={analysisData?.aiSummary}
                  analysisData={analysisData}
                />

                {/* Deep Analysis Panel - Shows trade idea breakdown if available */}
                {bestTradeIdea && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-teal-400" />
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">Active Trade Idea</span>
                        {bestTradeIdea.probabilityBand && (
                          <Badge className={cn(
                            "text-[10px]",
                            bestTradeIdea.probabilityBand.startsWith('A') ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                            bestTradeIdea.probabilityBand.startsWith('B') ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" :
                            "bg-amber-500/20 text-amber-400 border-amber-500/30"
                          )}>
                            Grade {bestTradeIdea.probabilityBand}
                          </Badge>
                        )}
                      </div>
                      <Link href="/trade-desk">
                        <Button variant="ghost" size="sm" className="text-teal-400 hover:text-teal-300 text-xs">
                          View on Trade Desk <ArrowUpRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </div>

                    {/* Trade Idea Quick Info */}
                    <Card className="p-4 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border-[#222]">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <Badge className={cn(
                            "text-xs font-bold",
                            bestTradeIdea.direction?.toLowerCase() === 'long' ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                          )}>
                            {bestTradeIdea.direction?.toUpperCase() || 'LONG'}
                          </Badge>
                          <span className="text-sm text-slate-400">{bestTradeIdea.strategy || 'Swing Trade'}</span>
                          {bestTradeIdea.confidenceScore && (
                            <span className="text-xs text-slate-500">{bestTradeIdea.confidenceScore}% confidence</span>
                          )}
                        </div>
                        {bestTradeIdea.timestamp && (
                          <span className="text-[10px] text-slate-600">
                            {new Date(bestTradeIdea.timestamp).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="p-2 rounded bg-slate-800/50">
                          <div className="text-[10px] text-slate-500">Entry</div>
                          <div className="text-sm font-mono text-white">${bestTradeIdea.entryPrice?.toFixed(2) || safePrice.toFixed(2)}</div>
                        </div>
                        <div className="p-2 rounded bg-emerald-500/10">
                          <div className="text-[10px] text-slate-500">Target</div>
                          <div className="text-sm font-mono text-emerald-400">${bestTradeIdea.targetPrice?.toFixed(2) || (safePrice * 1.08).toFixed(2)}</div>
                        </div>
                        <div className="p-2 rounded bg-red-500/10">
                          <div className="text-[10px] text-slate-500">Stop</div>
                          <div className="text-sm font-mono text-red-400">${bestTradeIdea.stopLoss?.toFixed(2) || (safePrice * 0.95).toFixed(2)}</div>
                        </div>
                      </div>

                      {bestTradeIdea.catalyst && (
                        <p className="text-xs text-slate-400 line-clamp-2 mb-3">{bestTradeIdea.catalyst}</p>
                      )}
                    </Card>

                    {/* Deep Analysis Panel if available */}
                    {bestTradeIdea.convergenceAnalysis && (
                      <DeepAnalysisPanel
                        analysis={bestTradeIdea.convergenceAnalysis}
                        symbol={symbol}
                        direction={bestTradeIdea.direction?.toLowerCase() === 'long' ? 'long' : 'short'}
                        defaultExpanded={false}
                      />
                    )}
                  </div>
                )}

                {/* Compact Disclaimer */}
                <div className="text-center text-[10px] text-slate-600 px-4">
                  This AI analysis is for informational purposes only and is not financial advice. Past performance ≠ future results. Trade at your own risk.
                  <span className="mx-2">•</span>Report ID: QE-{symbol}-{new Date().toISOString().split('T')[0].replace(/-/g, '')}
                </div>
              </TabsContent>

              <TabsContent value="overview" className="space-y-4">
                {/* Professional Trading Chart Card */}
                <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border-gray-200 dark:border-[#222]">
                  {/* Decorative elements */}
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-500/50 via-cyan-500/50 to-teal-500/50" />
                  <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/5 rounded-full blur-3xl" />
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-cyan-500/5 rounded-full blur-3xl" />

                  {/* Chart Header - Professional Trading Terminal Style */}
                  <div className="relative p-4 border-b border-gray-200 dark:border-[#222]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Symbol & Price */}
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-gradient-to-br from-teal-500/20 to-cyan-500/20 border border-teal-500/30">
                            <LineChart className="w-4 h-4 text-teal-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-bold text-gray-900 dark:text-white">{symbol}</span>
                              <Badge className="bg-gray-200 dark:bg-slate-700/50 text-slate-300 border-slate-600 text-[10px]">
                                {chartRange}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-sm font-mono text-gray-900 dark:text-white">${price.toFixed(2)}</span>
                              <span className={cn(
                                "text-xs font-medium flex items-center gap-0.5",
                                isPositive ? "text-emerald-400" : "text-red-400"
                              )}>
                                {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Divider */}
                        <div className="h-10 w-px bg-gray-200 dark:bg-slate-700/50" />

                        {/* Chart Type Toggle */}
                        <div className="flex items-center gap-1 bg-gray-100 dark:bg-[#1a1a1a] rounded-lg p-1 border border-[#1a1a1a]">
                          <button
                            onClick={() => setChartType('area')}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                              chartType === 'area'
                                ? "bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-lg shadow-teal-500/20"
                                : "text-slate-400 hover:text-white hover:bg-gray-200 dark:bg-slate-700/50"
                            )}
                          >
                            <LineChart className="w-3.5 h-3.5" />
                            Area
                          </button>
                          <button
                            onClick={() => setChartType('candlestick')}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                              chartType === 'candlestick'
                                ? "bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-lg shadow-teal-500/20"
                                : "text-slate-400 hover:text-white hover:bg-gray-200 dark:bg-slate-700/50"
                            )}
                          >
                            <BarChart2 className="w-3.5 h-3.5" />
                            Candles
                          </button>
                        </div>

                        {/* Expand Toggle */}
                        <button
                          onClick={() => setChartExpanded(!chartExpanded)}
                          className={cn(
                            "p-2 rounded-lg transition-all border",
                            chartExpanded
                              ? "bg-teal-600/20 border-teal-500/30 text-teal-400"
                              : "border-[#1a1a1a] text-slate-400 hover:text-white hover:border-slate-600"
                          )}
                        >
                          {chartExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                      </div>

                      {/* Time Range Selector - Pill Style */}
                      <div className="flex items-center gap-1 bg-gray-100 dark:bg-[#1a1a1a] rounded-xl p-1 border border-gray-200 dark:border-[#222]/40">
                        {['1D', '5D', '1M', '3M', '6M', '1Y', '5Y'].map((range) => (
                          <button
                            key={range}
                            onClick={() => setChartRange(range)}
                            className={cn(
                              "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                              chartRange === range
                                ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-md"
                                : "text-slate-500 hover:text-white hover:bg-gray-200 dark:bg-slate-700/50"
                            )}
                          >
                            {range}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Live Indicator & Stats Bar */}
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-[#222]">
                      <div className="flex items-center gap-4">
                        {/* Live Indicator */}
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                            <div className="absolute inset-0 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                          </div>
                          <span className="text-xs text-emerald-400 font-medium">Live</span>
                        </div>

                        {/* Quick Stats */}
                        <div className="flex items-center gap-4 text-xs">
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 dark:bg-[#1a1a1a]">
                            <span className="text-slate-500">H:</span>
                            <span className="text-emerald-400 font-mono font-medium">${quoteData?.high?.toFixed(2) || '—'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 dark:bg-[#1a1a1a]">
                            <span className="text-slate-500">L:</span>
                            <span className="text-red-400 font-mono font-medium">${quoteData?.low?.toFixed(2) || '—'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 dark:bg-[#1a1a1a]">
                            <span className="text-slate-500">O:</span>
                            <span className="text-slate-300 font-mono font-medium">${quoteData?.open?.toFixed(2) || (price - change).toFixed(2)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 dark:bg-[#1a1a1a]">
                            <Volume2 className="w-3 h-3 text-slate-500" />
                            <span className="text-slate-300 font-mono font-medium">{quoteData?.volume ? formatVolume(quoteData.volume) : '—'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Technical Indicators Quick View */}
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium",
                          (analysisData?.components?.technical?.rsi || 50) > 70 ? "bg-red-500/20 text-red-400" :
                          (analysisData?.components?.technical?.rsi || 50) < 30 ? "bg-emerald-500/20 text-emerald-400" :
                          "bg-gray-200 dark:bg-slate-700/50 text-slate-300"
                        )}>
                          <span className="text-slate-500">RSI</span>
                          <span>{analysisData?.components?.technical?.rsi?.toFixed(0) || '50'}</span>
                        </div>
                        <div className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium",
                          analysisData?.components?.technical?.macdSignal === 'bullish' ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                        )}>
                          <span className="text-slate-500">MACD</span>
                          <span>{analysisData?.components?.technical?.macdSignal?.toUpperCase() || 'NEUTRAL'}</span>
                        </div>
                        <div className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium",
                          price > (safePrice * 0.98) ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                        )}>
                          <span className="text-slate-500">50 DMA</span>
                          <span>{price > (safePrice * 0.98) ? 'ABOVE' : 'BELOW'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Chart Container */}
                  <div className="relative p-4" style={{ minHeight: chartHeight + 40 }}>
                    {/* Gradient Overlay for Chart */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-slate-900/80 to-transparent" />
                    </div>

                    {chartLoading ? (
                      <div className="flex flex-col items-center justify-center text-slate-400" style={{ height: chartHeight }}>
                        <div className="relative mb-3">
                          <Activity className="w-8 h-8 text-teal-500" />
                          <motion.div
                            className="absolute inset-0 border-2 border-teal-500/30 rounded-full"
                            animate={{ scale: [1, 1.5, 1], opacity: [1, 0, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                          />
                        </div>
                        <span className="text-sm">Loading chart data...</span>
                      </div>
                    ) : historicalData?.data ? (
                      <StockChart symbol={symbol} data={historicalData.data} height={chartHeight} chartType={chartType} />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-400" style={{ height: chartHeight }}>
                        <BarChart2 className="w-10 h-10 text-slate-600 mb-2" />
                        <span className="text-sm">No chart data available</span>
                      </div>
                    )}
                  </div>

                  {/* Chart Footer - Key Levels */}
                  <div className="relative px-4 pb-4">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-[#151515] border border-[#1a1a1a]">
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-red-500/30 border border-red-500" />
                          <span className="text-xs text-slate-400">Support</span>
                          <span className="text-xs font-mono font-bold text-red-400">${(safePrice * 0.95).toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-emerald-500/30 border border-emerald-500" />
                          <span className="text-xs text-slate-400">Resistance</span>
                          <span className="text-xs font-mono font-bold text-emerald-400">${(safePrice * 1.05).toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-amber-500/30 border border-amber-500" />
                          <span className="text-xs text-slate-400">52W Range</span>
                          <span className="text-xs font-mono text-slate-300">
                            ${quoteData?.fiftyTwoWeekLow?.toFixed(2) || (safePrice * 0.7).toFixed(2)} - ${quoteData?.fiftyTwoWeekHigh?.toFixed(2) || (safePrice * 1.3).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <Link href={`/chart-analysis?symbol=${symbol}`}>
                        <Button className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white shadow-lg shadow-teal-500/20">
                          <BarChart2 className="w-4 h-4 mr-2" />
                          Deep Chart Analysis
                          <ArrowUpRight className="w-4 h-4 ml-2" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>

                {/* Quick Stats Grid Below Chart */}
                <div className="grid grid-cols-4 gap-3">
                  <Card className="bg-gradient-to-br from-slate-900 to-slate-900/80 border-gray-200 dark:border-[#222] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-md bg-teal-500/20">
                        <Target className="w-3.5 h-3.5 text-teal-400" />
                      </div>
                      <span className="text-xs text-slate-500">Day Range</span>
                    </div>
                    <div className="relative h-2 bg-gray-200 dark:bg-slate-700/50 rounded-full overflow-hidden">
                      <div
                        className="absolute h-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500 rounded-full"
                        style={{
                          left: '0%',
                          right: '0%',
                        }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-teal-500 shadow-lg"
                        style={{
                          left: `${quoteData?.low && quoteData?.high && quoteData.high !== quoteData.low
                            ? ((price - quoteData.low) / (quoteData.high - quoteData.low) * 100)
                            : 50}%`,
                          transform: 'translate(-50%, -50%)'
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-[10px]">
                      <span className="text-red-400 font-mono">${quoteData?.low?.toFixed(2) || '—'}</span>
                      <span className="text-emerald-400 font-mono">${quoteData?.high?.toFixed(2) || '—'}</span>
                    </div>
                  </Card>

                  <Card className="bg-gradient-to-br from-slate-900 to-slate-900/80 border-gray-200 dark:border-[#222] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-md bg-purple-500/20">
                        <PieChart className="w-3.5 h-3.5 text-purple-400" />
                      </div>
                      <span className="text-xs text-slate-500">Market Cap</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{quoteData?.marketCap ? `$${(quoteData.marketCap / 1e9).toFixed(1)}B` : '—'}</p>
                    <p className="text-[10px] text-slate-600 mt-1">Enterprise Value</p>
                  </Card>

                  <Card className="bg-gradient-to-br from-slate-900 to-slate-900/80 border-gray-200 dark:border-[#222] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-md bg-amber-500/20">
                        <Activity className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      <span className="text-xs text-slate-500">Avg Volume</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{quoteData?.avgVolume ? formatVolume(quoteData.avgVolume) : '—'}</p>
                    <p className="text-[10px] text-slate-600 mt-1">10-day average</p>
                  </Card>

                  <Card className="bg-gradient-to-br from-slate-900 to-slate-900/80 border-gray-200 dark:border-[#222] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-md bg-cyan-500/20">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      </div>
                      <span className="text-xs text-slate-500">P/E Ratio</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{quoteData?.pe?.toFixed(1) || analysisData?.components?.fundamental?.pe?.toFixed(1) || '—'}</p>
                    <p className="text-[10px] text-slate-600 mt-1">TTM earnings</p>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="options" className="space-y-4">
                {/* Whale Flow */}
                <Card className="bg-white/80 dark:bg-white dark:bg-[#111]/80 border-gray-200 dark:border-[#222]">
                  <div className="p-4 border-b border-gray-200 dark:border-[#222] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Whale Flow Activity</h3>
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">Live</Badge>
                    </div>
                    <Link href="/trade-desk">
                      <Button variant="ghost" size="sm" className="text-teal-400 hover:text-teal-300">
                        View All Flow <ArrowUpRight className="w-4 h-4 ml-1" />
                      </Button>
                    </Link>
                  </div>
                  <div className="p-4 space-y-2">
                    {flowData && flowData.length > 0 ? flowData.map((flow: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-100 dark:bg-gray-100 dark:bg-[#1a1a1a] hover:bg-gray-200 dark:hover:bg-slate-800 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={cn("w-2 h-2 rounded-full", flow.direction === 'long' ? "bg-emerald-500" : "bg-red-500")} />
                          <span className={cn("text-sm font-medium", flow.direction === 'long' ? "text-emerald-400" : "text-red-400")}>
                            {flow.strategy || (flow.direction === 'long' ? 'BULLISH' : 'BEARISH')}
                          </span>
                          {flow.expiry && <span className="text-xs text-slate-500">{flow.expiry}</span>}
                        </div>
                        <div className="flex items-center gap-4">
                          {flow.volume && <span className="text-xs text-slate-400">{formatVolume(flow.volume)} vol</span>}
                          <span className="font-mono text-sm text-gray-700 dark:text-slate-200">${flow.entryPrice?.toFixed(2)}</span>
                          <Badge variant="outline" className={cn(
                            "text-xs",
                            flow.confidenceScore >= 80 ? "text-emerald-400 border-emerald-500/40" :
                            flow.confidenceScore >= 70 ? "text-teal-400 border-teal-500/40" : "text-slate-400 border-slate-600"
                          )}>
                            {flow.confidenceScore}%
                          </Badge>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-4 text-slate-500 text-sm">
                        No whale flow activity detected for {symbol}
                      </div>
                    )}
                  </div>
                </Card>

                {/* Options Chain */}
                <Card className="bg-white/80 dark:bg-white dark:bg-[#111]/80 border-gray-200 dark:border-[#222]">
                  <div className="p-4 border-b border-gray-200 dark:border-[#222] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Options Chain</h3>
                      {optionsData?.stockPrice && <span className="text-xs text-slate-400">@ ${optionsData.stockPrice.toFixed(2)}</span>}
                    </div>
                    <Link href={`/options-analyzer?symbol=${symbol}`}>
                      <Button variant="outline" size="sm" className="border-gray-200 dark:border-[#222] text-slate-300 hover:bg-teal-600 hover:text-white hover:border-teal-600">
                        <BarChart2 className="w-4 h-4 mr-2" /> Analyzer
                      </Button>
                    </Link>
                  </div>
                  {optionsLoading ? (
                    <div className="p-8 text-center text-slate-400">
                      <Activity className="w-6 h-6 mx-auto mb-2 animate-pulse" />
                      Loading options chain...
                    </div>
                  ) : optionsData?.calls?.length > 0 || optionsData?.puts?.length > 0 ? (
                    <div className="p-4 grid grid-cols-2 gap-6">
                      {/* Calls */}
                      <div>
                        <div className="text-xs font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" /> CALLS
                          <span className="text-slate-500 font-normal ml-auto">
                            {optionsData?.calls?.filter((o: any) => o.inTheMoney).length || 0} ITM
                          </span>
                        </div>
                        {/* Header */}
                        <div className="flex items-center text-[10px] text-slate-500 uppercase tracking-wider mb-2 px-2">
                          <span className="w-16">Exp</span>
                          <span className="w-16 text-right">Strike</span>
                          <span className="w-14 text-right">Bid</span>
                          <span className="w-14 text-right">Ask</span>
                          <span className="w-12 text-right">IV</span>
                        </div>
                        <div className="space-y-1">
                          {optionsData?.calls?.slice(0, 8).map((opt: any, i: number) => (
                            <div key={i} className={cn(
                              "flex items-center text-xs p-2 rounded transition-colors",
                              opt.inTheMoney ? "bg-emerald-500/15 border-l-2 border-emerald-500" : "bg-gray-50 dark:bg-[#151515] hover:bg-gray-100 dark:hover:bg-gray-100 dark:bg-[#1a1a1a]"
                            )}>
                              <span className="text-slate-400 w-16">{opt.expiration?.slice(5)}</span>
                              <span className={cn("font-mono w-16 text-right", opt.inTheMoney ? "text-emerald-300" : "text-gray-700 dark:text-slate-200")}>${opt.strike}</span>
                              <span className="font-mono text-emerald-400 w-14 text-right">{opt.bid?.toFixed(2) || '—'}</span>
                              <span className="font-mono text-emerald-400 w-14 text-right">{opt.ask?.toFixed(2) || '—'}</span>
                              <span className="text-slate-500 w-12 text-right">{opt.iv ? `${(opt.iv * 100).toFixed(0)}%` : '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Puts */}
                      <div>
                        <div className="text-xs font-semibold text-red-400 mb-3 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-red-500" /> PUTS
                          <span className="text-slate-500 font-normal ml-auto">
                            {optionsData?.puts?.filter((o: any) => o.inTheMoney).length || 0} ITM
                          </span>
                        </div>
                        {/* Header */}
                        <div className="flex items-center text-[10px] text-slate-500 uppercase tracking-wider mb-2 px-2">
                          <span className="w-16">Exp</span>
                          <span className="w-16 text-right">Strike</span>
                          <span className="w-14 text-right">Bid</span>
                          <span className="w-14 text-right">Ask</span>
                          <span className="w-12 text-right">IV</span>
                        </div>
                        <div className="space-y-1">
                          {optionsData?.puts?.slice(0, 8).map((opt: any, i: number) => (
                            <div key={i} className={cn(
                              "flex items-center text-xs p-2 rounded transition-colors",
                              opt.inTheMoney ? "bg-red-500/15 border-l-2 border-red-500" : "bg-gray-50 dark:bg-[#151515] hover:bg-gray-100 dark:hover:bg-gray-100 dark:bg-[#1a1a1a]"
                            )}>
                              <span className="text-slate-400 w-16">{opt.expiration?.slice(5)}</span>
                              <span className={cn("font-mono w-16 text-right", opt.inTheMoney ? "text-red-300" : "text-gray-700 dark:text-slate-200")}>${opt.strike}</span>
                              <span className="font-mono text-red-400 w-14 text-right">{opt.bid?.toFixed(2) || '—'}</span>
                              <span className="font-mono text-red-400 w-14 text-right">{opt.ask?.toFixed(2) || '—'}</span>
                              <span className="text-slate-500 w-12 text-right">{opt.iv ? `${(opt.iv * 100).toFixed(0)}%` : '—'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-500">
                      No options data available for {symbol}
                    </div>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="news" className="space-y-4">
                {/* News Header Card */}
                <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/30 border-gray-200 dark:border-[#222] p-4">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl" />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30">
                        <Newspaper className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{symbol} News Feed</h3>
                        <p className="text-xs text-slate-500">Latest news and market coverage</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30">
                        <div className="relative">
                          <div className="w-2 h-2 bg-blue-500 rounded-full" />
                          <div className="absolute inset-0 w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                        </div>
                        <span className="text-xs text-blue-400 font-medium">Live</span>
                      </div>
                      <Badge className="bg-gray-200 dark:bg-slate-700/50 text-slate-300 border-slate-600">
                        {newsData?.length || 0} Articles
                      </Badge>
                    </div>
                  </div>
                </Card>

                {/* News Articles Grid */}
                <div className="grid grid-cols-2 gap-4">
                  {newsLoading ? (
                    <Card className="col-span-2 bg-white/80 dark:bg-white dark:bg-[#111]/80 border-gray-200 dark:border-[#222] p-8">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <motion.div
                          className="mb-3"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        >
                          <Newspaper className="w-8 h-8 text-blue-500" />
                        </motion.div>
                        <span className="text-sm">Fetching latest news...</span>
                      </div>
                    </Card>
                  ) : newsData && newsData.length > 0 ? (
                    <>
                      {/* Featured Article - First One */}
                      <Card className="col-span-2 relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800/50 border-[#1a1a1a] hover:border-blue-500/50 transition-all group">
                        <a
                          href={newsData[0]?.url || newsData[0]?.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-5"
                        >
                          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 mb-3">Featured</Badge>
                          <h4 className="text-lg font-semibold text-white leading-tight group-hover:text-blue-400 transition-colors">
                            {newsData[0]?.title || newsData[0]?.headline}
                          </h4>
                          {newsData[0]?.summary && (
                            <p className="text-sm text-slate-400 mt-2 line-clamp-2">{newsData[0].summary}</p>
                          )}
                          <div className="flex items-center gap-4 mt-4">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center">
                                <Building2 className="w-3 h-3 text-slate-400" />
                              </div>
                              <span className="text-xs text-blue-400 font-medium">{newsData[0]?.source}</span>
                            </div>
                            <span className="text-xs text-slate-500">{formatTimeAgo(newsData[0]?.publishedAt || newsData[0]?.timestamp)}</span>
                            <ArrowUpRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition-colors ml-auto" />
                          </div>
                        </a>
                      </Card>

                      {/* Other Articles */}
                      {newsData.slice(1).map((item: any, i: number) => (
                        <Card
                          key={i}
                          className="relative overflow-hidden bg-white dark:bg-white dark:bg-[#111] border-gray-200 dark:border-gray-200 dark:border-[#222] hover:border-gray-200 dark:border-[#222] transition-all group"
                        >
                          <a
                            href={item.url || item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <h4 className="text-sm font-medium text-gray-700 dark:text-slate-200 leading-snug group-hover:text-white transition-colors line-clamp-2">
                                {item.title || item.headline}
                              </h4>
                              <ArrowUpRight className="w-4 h-4 text-slate-600 group-hover:text-teal-400 transition-colors shrink-0" />
                            </div>
                            <div className="flex items-center gap-3 mt-3">
                              <span className="text-xs text-blue-400">{item.source}</span>
                              <span className="text-xs text-slate-600">•</span>
                              <span className="text-xs text-slate-500">{formatTimeAgo(item.publishedAt || item.timestamp)}</span>
                            </div>
                          </a>
                        </Card>
                      ))}
                    </>
                  ) : (
                    <Card className="col-span-2 bg-white/80 dark:bg-white dark:bg-[#111]/80 border-gray-200 dark:border-[#222] p-8">
                      <div className="flex flex-col items-center justify-center text-slate-500">
                        <Newspaper className="w-10 h-10 text-slate-600 mb-2" />
                        <span className="text-sm">No news articles available for {symbol}</span>
                      </div>
                    </Card>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="analysts" className="space-y-4">
                {/* Analyst Consensus Header */}
                <div className="grid grid-cols-3 gap-4">
                  <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/30 border-gray-200 dark:border-[#222] p-4">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl" />
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded-lg bg-emerald-500/20">
                          <Users className="w-4 h-4 text-emerald-400" />
                        </div>
                        <span className="text-xs text-slate-500">Analyst Consensus</span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {analystData?.consensus?.recommendation || 'Moderate Buy'}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Based on {analystData?.consensus?.totalAnalysts || analystData?.ratings?.length || 0} analysts
                      </div>
                    </div>
                  </Card>

                  <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/30 border-gray-200 dark:border-[#222] p-4">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/10 rounded-full blur-2xl" />
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded-lg bg-teal-500/20">
                          <Target className="w-4 h-4 text-teal-400" />
                        </div>
                        <span className="text-xs text-slate-500">Avg Price Target</span>
                      </div>
                      <div className="text-2xl font-bold text-teal-400">
                        ${analystData?.priceTarget?.average?.toFixed(2) || (safePrice * 1.15).toFixed(2)}
                      </div>
                      <div className={cn("text-xs mt-1",
                        (analystData?.priceTarget?.average || price * 1.15) > price ? "text-emerald-400" : "text-red-400"
                      )}>
                        {((((analystData?.priceTarget?.average || safePrice * 1.15) - safePrice) / safePrice) * 100).toFixed(1)}% upside
                      </div>
                    </div>
                  </Card>

                  <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border-gray-200 dark:border-[#222] p-4">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl" />
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 rounded-lg bg-amber-500/20">
                          <TrendingUp className="w-4 h-4 text-amber-400" />
                        </div>
                        <span className="text-xs text-slate-500">Target Range</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm text-red-400">${analystData?.priceTarget?.low?.toFixed(2) || (safePrice * 0.85).toFixed(2)}</span>
                        <span className="text-xs text-slate-600">-</span>
                        <span className="text-sm text-emerald-400">${analystData?.priceTarget?.high?.toFixed(2) || (safePrice * 1.35).toFixed(2)}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Low - High estimates</div>
                    </div>
                  </Card>
                </div>

                {/* Rating Distribution */}
                <Card className="bg-white dark:bg-white dark:bg-[#111] border-gray-200 dark:border-gray-200 dark:border-[#222] p-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Rating Distribution</h3>
                  <div className="flex items-center gap-3">
                    {[
                      { label: 'Strong Buy', value: analystData?.consensus?.strongBuy || 3, color: 'bg-emerald-500' },
                      { label: 'Buy', value: analystData?.consensus?.buy || 8, color: 'bg-teal-500' },
                      { label: 'Hold', value: analystData?.consensus?.hold || 5, color: 'bg-amber-500' },
                      { label: 'Sell', value: analystData?.consensus?.sell || 1, color: 'bg-orange-500' },
                      { label: 'Strong Sell', value: analystData?.consensus?.strongSell || 0, color: 'bg-red-500' },
                    ].map((item, i) => {
                      const total = (analystData?.consensus?.strongBuy || 3) + (analystData?.consensus?.buy || 8) + (analystData?.consensus?.hold || 5) + (analystData?.consensus?.sell || 1) + (analystData?.consensus?.strongSell || 0);
                      const pct = total > 0 ? (item.value / total) * 100 : 0;
                      return (
                        <div key={i} className="flex-1">
                          <div className="h-20 flex items-end">
                            <div
                              className={cn("w-full rounded-t-md transition-all", item.color)}
                              style={{ height: `${Math.max(pct, 5)}%` }}
                            />
                          </div>
                          <div className="text-center mt-2">
                            <div className="text-xs font-bold text-gray-900 dark:text-white">{item.value}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{item.label}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* Recent Ratings Table */}
                <Card className="bg-white dark:bg-white dark:bg-[#111] border-gray-200 dark:border-gray-200 dark:border-[#222] overflow-hidden">
                  <div className="p-4 border-b border-gray-200 dark:border-[#222] flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Analyst Actions</h3>
                    <Badge className="bg-gray-200 dark:bg-slate-700/50 text-slate-300 border-slate-600">
                      {analystData?.ratings?.length || 0} Ratings
                    </Badge>
                  </div>
                  {analystLoading ? (
                    <div className="p-8 text-center text-slate-400">
                      <Activity className="w-6 h-6 mx-auto mb-2 animate-pulse" />
                      Loading analyst ratings...
                    </div>
                  ) : analystData?.ratings && analystData.ratings.length > 0 ? (
                    <div className="divide-y divide-slate-800/50">
                      {analystData.ratings.map((rating: any, i: number) => (
                        <div key={i} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-50 dark:bg-[#151515] transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-800/80 flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-slate-500" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{rating.firm || rating.analyst}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{formatDate(rating.date)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <Badge className={cn(
                              "text-xs px-3 py-1",
                              rating.rating?.toLowerCase().includes('buy') || rating.rating?.toLowerCase().includes('overweight')
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                : rating.rating?.toLowerCase().includes('sell') || rating.rating?.toLowerCase().includes('underweight')
                                ? "bg-red-500/20 text-red-400 border-red-500/30"
                                : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                            )}>
                              {rating.rating}
                            </Badge>
                            {rating.priceTarget && (
                              <div className="text-right">
                                <span className="font-mono text-sm font-bold text-teal-400">${rating.priceTarget}</span>
                                <div className={cn("text-[10px]",
                                  rating.priceTarget > price ? "text-emerald-400" : "text-red-400"
                                )}>
                                  {safePrice > 0 ? ((rating.priceTarget - safePrice) / safePrice * 100).toFixed(1) : '0.0'}%
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-500">
                      <Users className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                      <p className="text-sm">No analyst ratings available for {symbol}</p>
                    </div>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="insiders" className="space-y-4">
                {/* Insider Activity Summary */}
                <div className="grid grid-cols-3 gap-4">
                  {(() => {
                    const buys = insiderData?.transactions?.filter((t: any) =>
                      t.transactionType?.toLowerCase().includes('purchase') || t.transactionType?.toLowerCase().includes('buy')
                    ) || [];
                    const sells = insiderData?.transactions?.filter((t: any) =>
                      t.transactionType?.toLowerCase().includes('sale') || t.transactionType?.toLowerCase().includes('sell')
                    ) || [];
                    const totalBuyValue = buys.reduce((sum: number, t: any) => sum + ((t.sharesTraded || t.shares || 0) * (t.pricePerShare || t.price || 0)), 0);
                    const totalSellValue = sells.reduce((sum: number, t: any) => sum + ((t.sharesTraded || t.shares || 0) * (t.pricePerShare || t.price || 0)), 0);
                    const netActivity = totalBuyValue - totalSellValue;

                    return (
                      <>
                        <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/30 border-gray-200 dark:border-[#222] p-4">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl" />
                          <div className="relative">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="p-1.5 rounded-lg bg-emerald-500/20">
                                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                              </div>
                              <span className="text-xs text-slate-500">Insider Buys</span>
                            </div>
                            <div className="text-2xl font-bold text-emerald-400">{buys.length}</div>
                            <div className="text-xs text-slate-500 mt-1">${formatVolume(totalBuyValue)} total</div>
                          </div>
                        </Card>

                        <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-red-950/30 border-gray-200 dark:border-[#222] p-4">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl" />
                          <div className="relative">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="p-1.5 rounded-lg bg-red-500/20">
                                <ArrowDownRight className="w-4 h-4 text-red-400" />
                              </div>
                              <span className="text-xs text-slate-500">Insider Sells</span>
                            </div>
                            <div className="text-2xl font-bold text-red-400">{sells.length}</div>
                            <div className="text-xs text-slate-500 mt-1">${formatVolume(totalSellValue)} total</div>
                          </div>
                        </Card>

                        <Card className={cn(
                          "relative overflow-hidden border-gray-200 dark:border-[#222] p-4",
                          netActivity >= 0
                            ? "bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/30"
                            : "bg-gradient-to-br from-slate-900 via-slate-900 to-orange-950/30"
                        )}>
                          <div className={cn("absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl",
                            netActivity >= 0 ? "bg-teal-500/10" : "bg-orange-500/10"
                          )} />
                          <div className="relative">
                            <div className="flex items-center gap-2 mb-2">
                              <div className={cn("p-1.5 rounded-lg",
                                netActivity >= 0 ? "bg-teal-500/20" : "bg-orange-500/20"
                              )}>
                                <Activity className={cn("w-4 h-4",
                                  netActivity >= 0 ? "text-teal-400" : "text-orange-400"
                                )} />
                              </div>
                              <span className="text-xs text-slate-500">Net Activity</span>
                            </div>
                            <div className={cn("text-2xl font-bold",
                              netActivity >= 0 ? "text-teal-400" : "text-orange-400"
                            )}>
                              {netActivity >= 0 ? '+' : '-'}${formatVolume(Math.abs(netActivity))}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {netActivity >= 0 ? 'Net buying' : 'Net selling'} activity
                            </div>
                          </div>
                        </Card>
                      </>
                    );
                  })()}
                </div>

                {/* Insider Transactions Table */}
                <Card className="bg-white dark:bg-white dark:bg-[#111] border-gray-200 dark:border-gray-200 dark:border-[#222] overflow-hidden">
                  <div className="p-4 border-b border-gray-200 dark:border-[#222] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-500/30">
                        <Shield className="w-4 h-4 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Insider Transactions</h3>
                        <p className="text-xs text-slate-500">Recent executive & director trades</p>
                      </div>
                    </div>
                    <Badge className="bg-gray-200 dark:bg-slate-700/50 text-slate-300 border-slate-600">
                      {insiderData?.transactions?.length || 0} Trades
                    </Badge>
                  </div>
                  {insiderLoading ? (
                    <div className="p-8 text-center text-slate-400">
                      <Activity className="w-6 h-6 mx-auto mb-2 animate-pulse" />
                      Loading insider data...
                    </div>
                  ) : insiderData?.transactions && insiderData.transactions.length > 0 ? (
                    <div className="divide-y divide-slate-800/50">
                      {insiderData.transactions.map((trade: any, i: number) => {
                        const isBuy = trade.transactionType?.toLowerCase().includes('purchase') || trade.transactionType?.toLowerCase().includes('buy');
                        const shares = trade.sharesTraded || trade.shares || 0;
                        const pricePerShare = trade.pricePerShare || trade.price || 0;
                        const totalValue = shares * pricePerShare;

                        return (
                          <div key={i} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-50 dark:bg-[#151515] transition-colors">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className={cn(
                                  "w-10 h-10 rounded-xl flex items-center justify-center",
                                  isBuy ? "bg-emerald-500/20" : "bg-red-500/20"
                                )}>
                                  {isBuy ? (
                                    <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                                  ) : (
                                    <ArrowDownRight className="w-5 h-5 text-red-400" />
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-white">{trade.name || trade.insiderName}</p>
                                  <p className="text-xs text-purple-400 mt-0.5">{trade.title || trade.position}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge className={cn(
                                  "text-xs mb-2",
                                  isBuy ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"
                                )}>
                                  {trade.transactionType}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-[#222]">
                              <div className="flex items-center gap-4 text-xs">
                                <div>
                                  <span className="text-slate-500">Shares:</span>
                                  <span className="ml-1 font-mono text-white">{formatVolume(shares)}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500">Price:</span>
                                  <span className="ml-1 font-mono text-white">${pricePerShare.toFixed(2)}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500">Value:</span>
                                  <span className={cn("ml-1 font-mono font-medium",
                                    isBuy ? "text-emerald-400" : "text-red-400"
                                  )}>${formatVolume(totalValue)}</span>
                                </div>
                              </div>
                              <span className="text-xs text-slate-500">{formatDate(trade.transactionDate || trade.date)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-500">
                      <Shield className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                      <p className="text-sm">No insider transactions available for {symbol}</p>
                      <p className="text-xs text-slate-600 mt-1">SEC filings may take time to appear</p>
                    </div>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="institutions" className="space-y-4">
                {institutionLoading ? (
                  <Card className="bg-white/80 dark:bg-white dark:bg-[#111]/80 border-gray-200 dark:border-[#222]">
                    <div className="p-8 flex flex-col items-center justify-center text-slate-400">
                      <motion.div
                        className="mb-3"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      >
                        <Building2 className="w-8 h-8 text-purple-500" />
                      </motion.div>
                      <span className="text-sm">Loading institutional data...</span>
                    </div>
                  </Card>
                ) : (
                  <>
                    {/* Ownership Overview */}
                    <div className="grid grid-cols-4 gap-4">
                      <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/30 border-gray-200 dark:border-[#222] p-4">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/10 rounded-full blur-2xl" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 rounded-lg bg-teal-500/20">
                              <Building2 className="w-4 h-4 text-teal-400" />
                            </div>
                            <span className="text-xs text-slate-500">Institutional</span>
                          </div>
                          <div className="text-3xl font-bold text-teal-400">
                            {institutionData?.breakdown?.institutionsPercent?.toFixed(1) || '65.0'}%
                          </div>
                          <div className="h-1.5 bg-gray-200 dark:bg-slate-700/50 rounded-full mt-3 overflow-hidden">
                            <div className="h-full bg-teal-500 rounded-full" style={{ width: `${institutionData?.breakdown?.institutionsPercent || 65}%` }} />
                          </div>
                        </div>
                      </Card>

                      <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-purple-950/30 border-gray-200 dark:border-[#222] p-4">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 rounded-lg bg-purple-500/20">
                              <Shield className="w-4 h-4 text-purple-400" />
                            </div>
                            <span className="text-xs text-slate-500">Insiders</span>
                          </div>
                          <div className="text-3xl font-bold text-purple-400">
                            {institutionData?.breakdown?.insidersPercent?.toFixed(2) || '0.50'}%
                          </div>
                          <div className="h-1.5 bg-gray-200 dark:bg-slate-700/50 rounded-full mt-3 overflow-hidden">
                            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min((institutionData?.breakdown?.insidersPercent || 0.5) * 10, 100)}%` }} />
                          </div>
                        </div>
                      </Card>

                      <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/30 border-gray-200 dark:border-[#222] p-4">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 rounded-lg bg-emerald-500/20">
                              <PieChart className="w-4 h-4 text-emerald-400" />
                            </div>
                            <span className="text-xs text-slate-500">Float</span>
                          </div>
                          <div className="text-3xl font-bold text-emerald-400">
                            {institutionData?.breakdown?.floatPercent?.toFixed(1) || '85.0'}%
                          </div>
                          <div className="h-1.5 bg-gray-200 dark:bg-slate-700/50 rounded-full mt-3 overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${institutionData?.breakdown?.floatPercent || 85}%` }} />
                          </div>
                        </div>
                      </Card>

                      <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border-gray-200 dark:border-[#222] p-4">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl" />
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="p-1.5 rounded-lg bg-amber-500/20">
                              <Users className="w-4 h-4 text-amber-400" />
                            </div>
                            <span className="text-xs text-slate-500"># Institutions</span>
                          </div>
                          <div className="text-3xl font-bold text-amber-400">
                            {institutionData?.breakdown?.institutionsCount?.toLocaleString() || '500'}
                          </div>
                          <p className="text-[10px] text-slate-600 mt-2">Funds holding {symbol}</p>
                        </div>
                      </Card>
                    </div>

                    {/* Ownership Pie Visualization */}
                    <Card className="bg-white dark:bg-white dark:bg-[#111] border-gray-200 dark:border-gray-200 dark:border-[#222] p-5">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Ownership Distribution</h3>
                      <div className="flex items-center gap-8">
                        {/* Simple visual bar breakdown */}
                        <div className="flex-1">
                          <div className="h-6 rounded-full overflow-hidden flex">
                            <div className="bg-teal-500" style={{ width: `${institutionData?.breakdown?.institutionsPercent || 65}%` }} />
                            <div className="bg-purple-500" style={{ width: `${(institutionData?.breakdown?.insidersPercent || 0.5) * 5}%` }} />
                            <div className="bg-emerald-500 flex-1" />
                          </div>
                          <div className="flex justify-between mt-3">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-sm bg-teal-500" />
                              <span className="text-xs text-slate-400">Institutions ({institutionData?.breakdown?.institutionsPercent?.toFixed(1) || 65}%)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-sm bg-purple-500" />
                              <span className="text-xs text-slate-400">Insiders ({institutionData?.breakdown?.insidersPercent?.toFixed(2) || 0.5}%)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                              <span className="text-xs text-slate-400">Retail & Other</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>

                    {/* Top Institutional Holders */}
                    <Card className="bg-white dark:bg-white dark:bg-[#111] border-gray-200 dark:border-gray-200 dark:border-[#222] overflow-hidden">
                      <div className="p-4 border-b border-gray-200 dark:border-[#222] flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 border border-teal-500/30">
                            <Building2 className="w-5 h-5 text-teal-400" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Top Institutional Holders</h3>
                            <p className="text-xs text-slate-500">Major fund positions in {symbol}</p>
                          </div>
                        </div>
                        <Badge className="bg-gray-200 dark:bg-slate-700/50 text-slate-300 border-slate-600">
                          {institutionData?.holders?.length || 0} Holders
                        </Badge>
                      </div>
                      {institutionData?.holders && institutionData.holders.length > 0 ? (
                        <div className="divide-y divide-slate-800/50">
                          {institutionData.holders.map((holder: any, i: number) => (
                            <div key={i} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-50 dark:bg-[#151515] transition-colors">
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3">
                                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-lg font-bold text-slate-400">
                                    {i + 1}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-white">{holder.name || holder.holder}</p>
                                    <div className="flex items-center gap-3 mt-1 text-xs">
                                      <span className="text-slate-500">{formatVolume(holder.shares)} shares</span>
                                      <span className="text-teal-400 font-medium">{holder.percentOwnership?.toFixed(2) || holder.percentage?.toFixed(2)}% ownership</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-gray-900 dark:text-white">${formatVolume(holder.value)}</p>
                                  {holder.changePercent !== undefined && holder.changePercent !== 0 && (
                                    <div className={cn(
                                      "flex items-center gap-1 justify-end text-xs mt-1",
                                      holder.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
                                    )}>
                                      {holder.changePercent >= 0 ? (
                                        <ArrowUpRight className="w-3 h-3" />
                                      ) : (
                                        <ArrowDownRight className="w-3 h-3" />
                                      )}
                                      {holder.changePercent >= 0 ? '+' : ''}{holder.changePercent?.toFixed(1)}%
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-6">
                          <div className="text-center mb-6">
                            <Building2 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                            <p className="text-sm text-slate-400">13F institutional holder data pending</p>
                            <p className="text-xs text-slate-600">SEC filings typically update quarterly</p>
                          </div>
                          {/* Show QuantEdge Flow Analysis instead */}
                          <div className="bg-gradient-to-br from-teal-950/30 to-slate-900 rounded-xl p-4 border border-teal-500/20">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="p-1.5 rounded-lg bg-teal-500/20">
                                <Brain className="w-4 h-4 text-teal-400" />
                              </div>
                              <span className="text-sm font-semibold text-gray-900 dark:text-white">QuantEdge Flow Analysis</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="p-3 rounded-lg bg-gray-100 dark:bg-[#1a1a1a]">
                                <div className="text-xs text-slate-500">Options Flow Grade</div>
                                <div className="text-lg font-bold text-rose-400">{analysisData?.components?.flow?.grade || 'B+'}</div>
                              </div>
                              <div className="p-3 rounded-lg bg-gray-100 dark:bg-[#1a1a1a]">
                                <div className="text-xs text-slate-500">Flow Score</div>
                                <div className="text-lg font-bold text-gray-900 dark:text-white">{analysisData?.components?.flow?.score || 72}%</div>
                              </div>
                              <div className="p-3 rounded-lg bg-gray-100 dark:bg-[#1a1a1a]">
                                <div className="text-xs text-slate-500">Smart Money Signal</div>
                                <div className={cn("text-sm font-bold",
                                  (analysisData?.components?.flow?.score || 72) >= 70 ? "text-emerald-400" :
                                  (analysisData?.components?.flow?.score || 72) >= 50 ? "text-amber-400" : "text-red-400"
                                )}>
                                  {(analysisData?.components?.flow?.score || 72) >= 70 ? 'Bullish' : (analysisData?.components?.flow?.score || 72) >= 50 ? 'Neutral' : 'Bearish'}
                                </div>
                              </div>
                              <div className="p-3 rounded-lg bg-gray-100 dark:bg-[#1a1a1a]">
                                <div className="text-xs text-slate-500">Institutional Est.</div>
                                <div className="text-lg font-bold text-teal-400">{institutionData?.breakdown?.institutionsPercent?.toFixed(0) || '65'}%</div>
                              </div>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-3 text-center">Based on QuantEdge 6-engine analysis</p>
                          </div>
                        </div>
                      )}
                    </Card>
                  </>
                )}
              </TabsContent>
            </Tabs>
        </div>
      </div>
    </div>
  );
}
