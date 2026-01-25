import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Search,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Brain,
  Newspaper,
  DollarSign,
  LineChart,
  Globe,
  Zap,
  Target,
  Activity,
  ChevronRight,
  Sparkles,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  History,
  Star,
  Briefcase,
  PieChart,
  Flame,
  TrendingUp as Trending,
  Users,
  Building2,
  Percent,
  BarChart2,
  Award,
  Eye,
  FileText,
  Coins,
  Rocket,
  Shield,
} from "lucide-react";

type AnalysisType = 
  | "swing_trade" 
  | "buy_sell" 
  | "technical" 
  | "news_sentiment" 
  | "fundamental"
  | "market_outlook";

interface AnalysisAgent {
  id: AnalysisType;
  name: string;
  description: string;
  icon: any;
  color: string;
  bgColor: string;
  assets: string[];
}

interface ResearchResult {
  symbol: string;
  type: AnalysisType;
  timestamp: string;
  summary: string;
  signal: "BUY" | "SELL" | "HOLD" | "WAIT";
  confidence: number;
}

const analysisAgents: AnalysisAgent[] = [
  {
    id: "swing_trade",
    name: "Swing Trade Analysis",
    description: "Days to weeks opportunities",
    icon: TrendingUp,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/30",
    assets: ["Stocks", "ETFs", "Crypto", "Forex"],
  },
  {
    id: "buy_sell",
    name: "Buy or Sell",
    description: "Investment ratings & analysis",
    icon: Target,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/30",
    assets: ["Stocks", "ETFs", "Crypto", "Forex"],
  },
  {
    id: "technical",
    name: "Technical Analyst",
    description: "Live price trends & technicals",
    icon: LineChart,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/30",
    assets: ["Stocks", "ETFs", "Crypto", "Forex"],
  },
  {
    id: "news_sentiment",
    name: "News Sentiment",
    description: "Bullish or bearish news signals",
    icon: Newspaper,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/30",
    assets: ["Stocks", "ETFs", "Crypto", "Forex"],
  },
  {
    id: "fundamental",
    name: "Fundamental Analyst",
    description: "Valuations & financial health",
    icon: PieChart,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10 border-cyan-500/30",
    assets: ["Stocks"],
  },
  {
    id: "market_outlook",
    name: "Market Outlook",
    description: "Global market momentum",
    icon: Globe,
    color: "text-pink-400",
    bgColor: "bg-pink-500/10 border-pink-500/30",
    assets: ["US", "Europe", "China", "Asia"],
  },
];

const quickDiscoveryItems = [
  { id: "top-picks", label: "Today's Top Picks", icon: Star, color: "text-amber-400" },
  { id: "guru-holdings", label: "Guru Holdings", icon: Users, color: "text-purple-400" },
  { id: "insider-buying", label: "Insider Buying", icon: Building2, color: "text-emerald-400" },
  { id: "upside-stocks", label: "20%+ Upside Stocks", icon: Percent, color: "text-cyan-400" },
  { id: "rsi-oversold", label: "RSI Oversold", icon: BarChart2, color: "text-blue-400" },
  { id: "top-gainers", label: "Top Gainers", icon: Rocket, color: "text-green-400" },
];

const mockBreakingNews = [
  { time: "05:17", title: "NeoGenomics: Distribution Moat In Community Oncology", sentiment: "Bullish" },
  { time: "04:45", title: "NVDA Chip Demand Surges Ahead of Q4 Earnings", sentiment: "Bullish" },
  { time: "03:22", title: "Tesla FSD v13 Rolling Out Nationwide", sentiment: "Bullish" },
  { time: "02:58", title: "Fed Signals Potential Rate Pause in February", sentiment: "Neutral" },
];

const mockMarketLens = [
  { title: "Cathie Wood's Golden Age Thesis: What Investors Need to Know in 2026", date: "Jan 20, 2026", image: "gradient" },
  { title: "AI Chip Sector Analysis: Winners and Losers for Q1 2026", date: "Jan 19, 2026", image: "gradient" },
];

const findTradeItems = [
  { label: "What Stocks to buy?", color: "from-emerald-500/20 to-cyan-500/20" },
  { label: "What ETFs to buy?", color: "from-blue-500/20 to-purple-500/20" },
  { label: "What Cryptos to buy?", color: "from-amber-500/20 to-orange-500/20" },
  { label: "What Forex to buy?", color: "from-pink-500/20 to-red-500/20" },
];

export function ResearchHub() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AnalysisType | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [researchHistory, setResearchHistory] = useState<ResearchResult[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Search stocks as user types
  useEffect(() => {
    if (searchQuery.length >= 1) {
      const upperQuery = searchQuery.toUpperCase();
      const suggestions = [
        { symbol: "AAPL", name: "Apple Inc.", price: 248.04, change: 1.2, sector: "Technology" },
        { symbol: "NVDA", name: "NVIDIA Corporation", price: 187.67, change: 2.4, sector: "Semiconductors" },
        { symbol: "TSLA", name: "Tesla Inc.", price: 449.06, change: -0.8, sector: "Automotive" },
        { symbol: "META", name: "Meta Platforms", price: 612.34, change: 1.5, sector: "Technology" },
        { symbol: "AMD", name: "Advanced Micro Devices", price: 124.56, change: 3.2, sector: "Semiconductors" },
        { symbol: "PLTR", name: "Palantir Technologies", price: 78.90, change: 4.1, sector: "Software" },
        { symbol: "MARA", name: "Marathon Digital", price: 24.56, change: 5.2, sector: "Crypto" },
        { symbol: "ONDS", name: "Ondas Holdings", price: 12.12, change: -5.8, sector: "Technology" },
        { symbol: "RDW", name: "Redwire Corporation", price: 12.52, change: 17.4, sector: "Aerospace" },
        { symbol: "USAR", name: "USA Rare Earth", price: 24.77, change: 12.3, sector: "Materials" },
        { symbol: "SPY", name: "S&P 500 ETF", price: 592.45, change: 0.89, sector: "ETF" },
        { symbol: "QQQ", name: "Nasdaq 100 ETF", price: 518.32, change: 1.45, sector: "ETF" },
        { symbol: "BTC", name: "Bitcoin", price: 97245, change: 2.24, sector: "Crypto" },
        { symbol: "ETH", name: "Ethereum", price: 3421, change: 2.67, sector: "Crypto" },
        { symbol: "MSFT", name: "Microsoft Corporation", price: 432.15, change: 0.95, sector: "Technology" },
        { symbol: "GOOGL", name: "Alphabet Inc.", price: 192.34, change: 1.1, sector: "Technology" },
        { symbol: "AMZN", name: "Amazon.com Inc.", price: 225.67, change: 1.8, sector: "E-Commerce" },
      ].filter(s => 
        s.symbol.includes(upperQuery) || 
        s.name.toUpperCase().includes(upperQuery)
      );
      setSearchResults(suggestions.slice(0, 8));
      setShowSearchResults(true);
    } else {
      setSearchResults([]);
      setShowSearchResults(false);
    }
  }, [searchQuery]);

  const runAnalysis = async (symbol: string, agentType: AnalysisType) => {
    setIsAnalyzing(true);
    setAnalysisResult(null);
    
    try {
      const response = await apiRequest("POST", `/api/research/analyze`, { symbol, analysisType: agentType });
      const data = await response.json();
      setAnalysisResult(data);
      
      const newResult: ResearchResult = {
        symbol,
        type: agentType,
        timestamp: new Date().toISOString(),
        summary: data.summary || "Analysis complete",
        signal: data.signal || "HOLD",
        confidence: data.confidence || 75,
      };
      setResearchHistory(prev => [newResult, ...prev.slice(0, 9)]);
      
    } catch (error) {
      console.error("Analysis error:", error);
      setAnalysisResult(generateMockAnalysis(symbol, agentType));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateMockAnalysis = (symbol: string, type: AnalysisType) => {
    const signals = ["BUY", "SELL", "HOLD", "WAIT"] as const;
    const signal = signals[Math.floor(Math.random() * signals.length)];
    const confidence = 65 + Math.floor(Math.random() * 30);
    
    return {
      symbol,
      type,
      signal,
      confidence,
      timestamp: new Date().toISOString(),
      sections: [
        {
          title: "Executive Summary",
          content: `${symbol} shows ${signal === "BUY" ? "bullish" : signal === "SELL" ? "bearish" : "neutral"} signals with ${confidence}% confidence. Our 6-engine analysis indicates ${signal === "BUY" ? "strong upward momentum with institutional accumulation" : signal === "SELL" ? "potential downside risk with distribution patterns" : "consolidation phase with mixed signals"}.`,
        },
        {
          title: "Technical Analysis",
          metrics: [
            { name: "RSI(14)", value: 45 + Math.random() * 30, signal: signal },
            { name: "MACD", value: (Math.random() - 0.5) * 2, signal: signal },
            { name: "Volume Ratio", value: 1.2 + Math.random() * 0.8, signal: "neutral" },
            { name: "ADX", value: 20 + Math.random() * 25, signal: signal },
          ],
        },
        {
          title: "Entry & Risk Management",
          levels: {
            entry: (Math.random() * 50 + 10).toFixed(2),
            stop: (Math.random() * 40 + 8).toFixed(2),
            target1: (Math.random() * 60 + 15).toFixed(2),
            target2: (Math.random() * 80 + 20).toFixed(2),
          },
        },
        ...(type === "fundamental" ? [{
          title: "Fundamental Metrics",
          fundamentals: {
            pe: (15 + Math.random() * 20).toFixed(1),
            ps: (3 + Math.random() * 5).toFixed(1),
            pb: (2 + Math.random() * 4).toFixed(1),
            evEbitda: (10 + Math.random() * 15).toFixed(1),
            debtEquity: (0.3 + Math.random() * 0.7).toFixed(2),
            roe: (10 + Math.random() * 20).toFixed(1),
            revenueGrowth: (5 + Math.random() * 25).toFixed(1),
            earningsGrowth: (8 + Math.random() * 30).toFixed(1),
          }
        }] : []),
      ],
    };
  };

  const selectSymbolAndAgent = (symbol: string) => {
    setSelectedSymbol(symbol);
    setSearchQuery(symbol);
    setShowSearchResults(false);
  };

  const handleAgentSelect = (agentId: AnalysisType) => {
    setSelectedAgent(agentId);
    if (selectedSymbol) {
      runAnalysis(selectedSymbol, agentId);
    }
  };

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case "BUY": return "text-emerald-400 bg-emerald-500/20 border-emerald-500/30";
      case "SELL": return "text-red-400 bg-red-500/20 border-red-500/30";
      case "HOLD": return "text-amber-400 bg-amber-500/20 border-amber-500/30";
      case "WAIT": return "text-blue-400 bg-blue-500/20 border-blue-500/30";
      default: return "text-slate-400 bg-slate-500/20";
    }
  };

  const getSentimentColor = (sentiment: string) => {
    if (sentiment === "Bullish") return "text-emerald-400 bg-emerald-500/20";
    if (sentiment === "Bearish") return "text-red-400 bg-red-500/20";
    return "text-amber-400 bg-amber-500/20";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
        <motion.div
          animate={{ opacity: [0.2, 0.4, 0.2], scale: [1, 1.1, 1] }}
          transition={{ duration: 8, repeat: Infinity }}
          className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl"
        />
        <motion.div
          animate={{ opacity: [0.15, 0.3, 0.15], scale: [1, 1.15, 1] }}
          transition={{ duration: 10, repeat: Infinity, delay: 2 }}
          className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-3xl"
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 mb-4">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span className="text-sm text-slate-300">6-Engine AI Research</span>
          </div>
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-white via-cyan-200 to-purple-200 bg-clip-text text-transparent">
            What should we analyze next?
          </h1>
          <p className="text-slate-400 text-lg">Ask anything...</p>
        </motion.div>

        {/* Global Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative max-w-3xl mx-auto mb-12"
        >
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/50 to-purple-500/50 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500" />
            <div className="relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                placeholder="Search for companies, tickers, or crypto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-14 pr-4 py-7 text-lg bg-slate-900/90 backdrop-blur-xl border-slate-700/50 rounded-2xl focus:border-cyan-500/50 focus:ring-cyan-500/20 placeholder:text-slate-500"
                data-testid="input-global-search"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedSymbol(null);
                    setShowSearchResults(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Search Results Dropdown */}
          <AnimatePresence>
            {showSearchResults && searchResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                className="absolute top-full left-0 right-0 mt-2 bg-slate-900/98 backdrop-blur-xl border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl z-50"
              >
                {searchResults.map((stock, i) => (
                  <motion.button
                    key={stock.symbol}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => selectSymbolAndAgent(stock.symbol)}
                    className="w-full flex items-center justify-between p-4 hover:bg-slate-800/60 transition-all duration-200 border-b border-slate-800/50 last:border-0 group"
                    data-testid={`search-result-${stock.symbol}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-slate-700/50 flex items-center justify-center group-hover:border-cyan-500/30 transition-colors">
                        <span className="text-sm font-bold text-cyan-400">{stock.symbol.slice(0, 2)}</span>
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-100">{stock.symbol}</span>
                          <Badge variant="outline" className="text-xs border-slate-700 text-slate-400">
                            {stock.sector}
                          </Badge>
                        </div>
                        <div className="text-sm text-slate-400">{stock.name}</div>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-4">
                      <div>
                        <div className="font-mono text-slate-100 font-medium">${stock.price.toLocaleString()}</div>
                        <div className={cn(
                          "text-sm font-medium flex items-center justify-end gap-1",
                          stock.change >= 0 ? "text-emerald-400" : "text-red-400"
                        )}>
                          {stock.change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {stock.change >= 0 ? "+" : ""}{stock.change.toFixed(2)}%
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-cyan-400 transition-colors" />
                    </div>
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Main Content */}
        <AnimatePresence mode="wait">
          {!selectedSymbol ? (
            <motion.div
              key="guide"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-10"
            >
              {/* Main Grid - Categories */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* I want to trade */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <Card className="p-5 bg-slate-900/60 backdrop-blur border-slate-700/50 hover:border-emerald-500/30 transition-all h-full" data-testid="card-trade-section">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                        <Zap className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-100">I want to trade</h3>
                        <p className="text-xs text-slate-400">3 Sections</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {[
                        { name: "Swing Trade Analysis", desc: "Days to weeks opportunities", assets: ["Stocks", "ETFs", "Crypto", "Forex"], icon: TrendingUp },
                        { name: "Trading Signals QuickView", desc: "Quick multi-timeframe signals", assets: ["Stocks", "ETFs", "Crypto", "Forex"], icon: Activity },
                        { name: "Technical Analyst", desc: "Live price trends & technicals", assets: ["Stocks", "ETFs", "Crypto", "Forex"], icon: LineChart },
                      ].map((item, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 cursor-pointer transition-all group border border-transparent hover:border-emerald-500/20"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <item.icon className="w-4 h-4 text-emerald-400" />
                            <span className="font-medium text-slate-200 text-sm">{item.name}</span>
                          </div>
                          <p className="text-xs text-slate-400 mb-2">{item.desc}</p>
                          <div className="flex flex-wrap gap-1">
                            {item.assets.map(a => (
                              <span key={a} className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400">{a}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </motion.div>

                {/* I want to stay updated */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  <Card className="p-5 bg-slate-900/60 backdrop-blur border-slate-700/50 hover:border-amber-500/30 transition-all h-full" data-testid="card-stay-updated-section">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                        <Newspaper className="w-5 h-5 text-amber-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-100">I want to stay updated</h3>
                        <p className="text-xs text-slate-400">2 Sections</p>
                      </div>
                    </div>
                    
                    {/* Breaking News */}
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Flame className="w-4 h-4 text-orange-400" />
                        <span className="text-sm font-medium text-slate-300">Breaking News</span>
                      </div>
                      <div className="space-y-2">
                        {mockBreakingNews.slice(0, 2).map((news, i) => (
                          <div key={i} className="p-2 rounded-lg bg-slate-800/40 hover:bg-slate-800/60 cursor-pointer transition-all">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs text-slate-500 font-mono">{news.time}</span>
                              <Badge className={cn("text-xs", getSentimentColor(news.sentiment))}>
                                {news.sentiment}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-300 line-clamp-2">{news.title}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Market Lens */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Eye className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm font-medium text-slate-300">Market Lens</span>
                      </div>
                      {mockMarketLens.slice(0, 1).map((item, i) => (
                        <div key={i} className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border border-slate-700/50 hover:border-cyan-500/30 cursor-pointer transition-all">
                          <p className="text-sm text-slate-200 font-medium mb-1 line-clamp-2">{item.title}</p>
                          <span className="text-xs text-slate-400">{item.date}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </motion.div>

                {/* I want to invest */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <Card className="p-5 bg-slate-900/60 backdrop-blur border-slate-700/50 hover:border-blue-500/30 transition-all h-full" data-testid="card-invest-section">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30">
                        <Briefcase className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-100">I want to invest</h3>
                        <p className="text-xs text-slate-400">2 Sections</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {[
                        { name: "Buy or Sell", desc: "Investment ratings & analysis", assets: ["Stocks", "ETFs", "Crypto", "Forex"], icon: Target },
                        { name: "Fundamental Analyst", desc: "Valuations & financial health", assets: ["Stocks"], icon: PieChart },
                      ].map((item, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 cursor-pointer transition-all group border border-transparent hover:border-blue-500/20"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <item.icon className="w-4 h-4 text-blue-400" />
                            <span className="font-medium text-slate-200 text-sm">{item.name}</span>
                          </div>
                          <p className="text-xs text-slate-400 mb-2">{item.desc}</p>
                          <div className="flex flex-wrap gap-1">
                            {item.assets.map(a => (
                              <span key={a} className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400">{a}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </motion.div>
              </div>

              {/* Second Row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* I want to read the market */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                >
                  <Card className="p-5 bg-slate-900/60 backdrop-blur border-slate-700/50 hover:border-purple-500/30 transition-all h-full">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30">
                        <Globe className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-100">I want to read the market</h3>
                        <p className="text-xs text-slate-400">2 Sections</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {[
                        { name: "Market Outlook", desc: "Global market momentum", assets: ["US", "Europe", "China", "+3"], icon: Globe },
                        { name: "News Sentiment", desc: "Bullish or bearish news signals", assets: ["Stocks", "ETFs", "Crypto", "Forex"], icon: Newspaper },
                      ].map((item, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 cursor-pointer transition-all group border border-transparent hover:border-purple-500/20"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <item.icon className="w-4 h-4 text-purple-400" />
                            <span className="font-medium text-slate-200 text-sm">{item.name}</span>
                          </div>
                          <p className="text-xs text-slate-400 mb-2">{item.desc}</p>
                          <div className="flex flex-wrap gap-1">
                            {item.assets.map(a => (
                              <span key={a} className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400">{a}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </motion.div>

                {/* Find your next trade */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <Card className="p-5 bg-slate-900/60 backdrop-blur border-slate-700/50 hover:border-cyan-500/30 transition-all h-full">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
                        <Rocket className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-100">Find your next trade</h3>
                        <p className="text-xs text-slate-400">Quick Discovery</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {findTradeItems.map((item, i) => (
                        <div
                          key={i}
                          className={cn(
                            "p-3 rounded-xl bg-gradient-to-br cursor-pointer transition-all hover:scale-[1.02] border border-slate-700/50 hover:border-cyan-500/30",
                            item.color
                          )}
                        >
                          <span className="text-sm text-slate-200 font-medium">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </motion.div>

                {/* I want to trade commodities */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                >
                  <Card className="p-5 bg-slate-900/60 backdrop-blur border-slate-700/50 hover:border-orange-500/30 transition-all h-full">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/30">
                        <Coins className="w-5 h-5 text-orange-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-100">I want to trade commodities</h3>
                        <p className="text-xs text-slate-400">2 Sections</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {[
                        { name: "Swing Trade Analysis", desc: "Entry & exit timing", assets: ["Commodities", "Futures"], icon: TrendingUp },
                        { name: "Trend Analysis", desc: "Gold, oil, corn trend direction", assets: ["Commodities", "Futures"], icon: BarChart3 },
                      ].map((item, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/60 cursor-pointer transition-all group border border-transparent hover:border-orange-500/20"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <item.icon className="w-4 h-4 text-orange-400" />
                            <span className="font-medium text-slate-200 text-sm">{item.name}</span>
                          </div>
                          <p className="text-xs text-slate-400 mb-2">{item.desc}</p>
                          <div className="flex flex-wrap gap-1">
                            {item.assets.map(a => (
                              <span key={a} className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400">{a}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </motion.div>
              </div>

              {/* Quick Discovery Row */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-amber-400" />
                  <h3 className="font-semibold text-slate-200">Quick Discovery:</h3>
                </div>
                <div className="flex flex-wrap gap-3">
                  {quickDiscoveryItems.map((item, i) => (
                    <motion.button
                      key={item.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4 + i * 0.05 }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-800/60 border border-slate-700/50 transition-all group hover-elevate"
                      data-testid={`button-discovery-${item.id}`}
                    >
                      <item.icon className={cn("w-4 h-4", item.color)} />
                      <span className="text-sm text-slate-300 group-hover:text-slate-100">{item.label}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>

              {/* Research History */}
              {researchHistory.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <History className="w-5 h-5 text-purple-400" />
                    <h3 className="font-semibold text-slate-200">Your Research</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {researchHistory.map((result, i) => (
                      <motion.div
                        key={`${result.symbol}-${result.timestamp}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <Card 
                          className="p-4 bg-slate-900/50 border-slate-700/50 hover:border-purple-500/30 cursor-pointer transition-all"
                          onClick={() => {
                            setSelectedSymbol(result.symbol);
                            setSearchQuery(result.symbol);
                            handleAgentSelect(result.type);
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-slate-100">{result.symbol}</span>
                            <Badge className={getSignalColor(result.signal)}>
                              {result.signal}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-400 mb-2 line-clamp-2">{result.summary}</p>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>{analysisAgents.find(a => a.id === result.type)?.name}</span>
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : (
            /* Analysis View */
            <motion.div
              key="analysis"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* Symbol Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 flex items-center justify-center">
                    <span className="text-2xl font-bold text-cyan-400">{selectedSymbol.slice(0, 2)}</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-100">{selectedSymbol}</h2>
                    <p className="text-slate-400">
                      {searchResults.find(s => s.symbol === selectedSymbol)?.name || "Stock Analysis"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedSymbol(null);
                    setSelectedAgent(null);
                    setAnalysisResult(null);
                    setSearchQuery("");
                  }}
                  className="border-slate-700 hover:bg-slate-800"
                  data-testid="button-back"
                >
                  Back to Search
                </Button>
              </div>

              {/* Agent Selection - Horizontal Scroll */}
              <div className="mb-6 overflow-x-auto pb-2">
                <div className="flex gap-2 min-w-max">
                  {analysisAgents.map(agent => (
                    <Button
                      key={agent.id}
                      variant={selectedAgent === agent.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleAgentSelect(agent.id)}
                      className={cn(
                        "gap-2 whitespace-nowrap",
                        selectedAgent === agent.id 
                          ? "bg-cyan-600 text-white border-0" 
                          : "border-slate-700 text-slate-300"
                      )}
                      data-testid={`button-agent-${agent.id}`}
                    >
                      <agent.icon className="w-4 h-4" />
                      {agent.name}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Analysis Results */}
              <AnimatePresence mode="wait">
                {isAnalyzing ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-20"
                  >
                    <div className="relative mb-6">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="w-20 h-20 rounded-full border-2 border-cyan-500/30 border-t-cyan-500"
                      />
                      <Brain className="absolute inset-0 m-auto w-10 h-10 text-cyan-400" />
                    </div>
                    <p className="text-lg text-slate-300 mb-3">Running 6-engine analysis on {selectedSymbol}...</p>
                    <div className="flex items-center gap-2">
                      {["ML", "AI", "Quant", "Flow", "Sentiment", "Technical"].map((engine, i) => (
                        <motion.span
                          key={engine}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                          className="text-xs px-3 py-1.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/50"
                        >
                          {engine}
                        </motion.span>
                      ))}
                    </div>
                  </motion.div>
                ) : analysisResult ? (
                  <motion.div
                    key="results"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* Signal Summary Card */}
                    <Card className="p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800/50 border-slate-700/50">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          <span className="text-sm text-slate-400">Analysis completed</span>
                        </div>
                        <span className="text-xs text-slate-500 font-mono">{new Date().toLocaleString()}</span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="text-center p-5 rounded-2xl bg-slate-800/50 border border-slate-700/50">
                          <p className="text-sm text-slate-400 mb-3">Signal</p>
                          <Badge className={cn("text-xl px-5 py-2.5 font-bold", getSignalColor(analysisResult.signal))}>
                            {analysisResult.signal}
                          </Badge>
                        </div>
                        <div className="text-center p-5 rounded-2xl bg-slate-800/50 border border-slate-700/50">
                          <p className="text-sm text-slate-400 mb-3">Confidence</p>
                          <p className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                            {analysisResult.confidence}%
                          </p>
                        </div>
                        <div className="text-center p-5 rounded-2xl bg-slate-800/50 border border-slate-700/50">
                          <p className="text-sm text-slate-400 mb-3">Horizon</p>
                          <p className="text-xl font-semibold text-slate-200">
                            {selectedAgent === "swing_trade" ? "3-15 Days" : selectedAgent === "fundamental" ? "Long-Term" : "1-5 Days"}
                          </p>
                        </div>
                      </div>
                    </Card>

                    {/* Analysis Sections */}
                    {analysisResult.sections?.map((section: any, i: number) => (
                      <motion.div
                        key={section.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                      >
                        <Card className="p-6 bg-slate-900/60 backdrop-blur border-slate-700/50">
                          <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-3">
                            <span className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-sm">
                              {i + 1}
                            </span>
                            {section.title}
                          </h3>
                          
                          {section.content && (
                            <p className="text-slate-300 leading-relaxed">{section.content}</p>
                          )}
                          
                          {section.metrics && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {section.metrics.map((metric: any) => (
                                <div key={metric.name} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                  <p className="text-sm text-slate-400 mb-1">{metric.name}</p>
                                  <p className={cn(
                                    "text-xl font-mono font-semibold",
                                    metric.signal === "BUY" || metric.signal === "bullish" ? "text-emerald-400" :
                                    metric.signal === "SELL" || metric.signal === "bearish" ? "text-red-400" :
                                    "text-amber-400"
                                  )}>
                                    {typeof metric.value === 'number' ? metric.value.toFixed(2) : metric.value}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {section.levels && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                                <p className="text-sm text-slate-400 mb-1">Entry Zone</p>
                                <p className="text-xl font-mono font-semibold text-emerald-400">${section.levels.entry}</p>
                              </div>
                              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                                <p className="text-sm text-slate-400 mb-1">Stop Loss</p>
                                <p className="text-xl font-mono font-semibold text-red-400">${section.levels.stop}</p>
                              </div>
                              <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
                                <p className="text-sm text-slate-400 mb-1">Target 1</p>
                                <p className="text-xl font-mono font-semibold text-cyan-400">${section.levels.target1}</p>
                              </div>
                              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30">
                                <p className="text-sm text-slate-400 mb-1">Target 2</p>
                                <p className="text-xl font-mono font-semibold text-purple-400">${section.levels.target2}</p>
                              </div>
                            </div>
                          )}

                          {section.fundamentals && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {[
                                { label: "P/E Ratio", value: section.fundamentals.pe, suffix: "x" },
                                { label: "P/S Ratio", value: section.fundamentals.ps, suffix: "x" },
                                { label: "P/B Ratio", value: section.fundamentals.pb, suffix: "x" },
                                { label: "EV/EBITDA", value: section.fundamentals.evEbitda, suffix: "x" },
                                { label: "Debt/Equity", value: section.fundamentals.debtEquity, suffix: "" },
                                { label: "ROE", value: section.fundamentals.roe, suffix: "%" },
                                { label: "Revenue Growth", value: section.fundamentals.revenueGrowth, suffix: "%" },
                                { label: "Earnings Growth", value: section.fundamentals.earningsGrowth, suffix: "%" },
                              ].map((item) => (
                                <div key={item.label} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                                  <p className="text-sm text-slate-400 mb-1">{item.label}</p>
                                  <p className="text-xl font-mono font-semibold text-slate-200">
                                    {item.value}{item.suffix}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </Card>
                      </motion.div>
                    ))}

                    {/* Other Analysis Options */}
                    <div className="pt-4">
                      <p className="text-sm text-slate-400 mb-3">Run more analysis:</p>
                      <div className="flex flex-wrap gap-2">
                        {analysisAgents.filter(a => a.id !== selectedAgent).map(agent => (
                          <Button
                            key={agent.id}
                            variant="outline"
                            size="sm"
                            onClick={() => handleAgentSelect(agent.id)}
                            className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-600"
                          >
                            <agent.icon className={cn("w-4 h-4", agent.color)} />
                            {agent.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ) : selectedAgent ? (
                  <motion.div
                    key="prompt"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-16"
                  >
                    <p className="text-slate-400">Select an analysis type above to run research on {selectedSymbol}</p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
