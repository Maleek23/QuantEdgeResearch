import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { useStockContext } from "@/contexts/stock-context";
import {
  Search,
  TrendingUp,
  BarChart3,
  Brain,
  Newspaper,
  LineChart,
  Globe,
  Target,
  ChevronRight,
  Sparkles,
  Loader2,
  Star,
  PieChart,
  Eye,
  FileText,
  BookOpen,
  ArrowRight,
  RefreshCw,
  X,
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
  category: string;
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
    category: "I want to trade",
  },
  {
    id: "technical",
    name: "Trading Signals QuickView",
    description: "Quick multi-timeframe signals",
    icon: LineChart,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10 border-cyan-500/30",
    assets: ["Stocks", "ETFs", "Crypto", "Forex"],
    category: "I want to trade",
  },
  {
    id: "buy_sell",
    name: "Buy or Sell",
    description: "Investment ratings & analysis",
    icon: Target,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/30",
    assets: ["Stocks", "ETFs", "Crypto", "Forex"],
    category: "I want to invest",
  },
  {
    id: "fundamental",
    name: "Fundamental Analyst",
    description: "Valuations & financial health",
    icon: PieChart,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/30",
    assets: ["Stocks"],
    category: "I want to invest",
  },
  {
    id: "market_outlook",
    name: "Market Outlook",
    description: "Global market momentum",
    icon: Globe,
    color: "text-pink-400",
    bgColor: "bg-pink-500/10 border-pink-500/30",
    assets: ["US", "Europe", "China"],
    category: "I want to read the market",
  },
  {
    id: "news_sentiment",
    name: "News Sentiment",
    description: "Bullish or bearish news signals",
    icon: Newspaper,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/30",
    assets: ["Stocks", "ETFs", "Crypto", "Forex"],
    category: "I want to read the market",
  },
];

const commodityAgents = [
  { name: "Swing Trade Analysis", description: "Entry & exit timing", assets: ["Commodities", "Futures"] },
  { name: "Trend Analysis", description: "Gold, oil, corn trend direction", assets: ["Commodities", "Futures"] },
];

const mockResearchHistory = [
  { symbol: "USAR", name: "USA Rare Earth Inc", type: "Swing trading analysis", time: "Completed 4 hours ago" },
  { symbol: "NVDA", name: "NVIDIA Corporation", type: "Technical analysis", time: "Completed 6 hours ago" },
  { symbol: "TSLA", name: "Tesla Inc", type: "Buy or Sell", time: "Completed 1 day ago" },
];

export function ResearchHub() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const { currentStock, setCurrentStock } = useStockContext();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (searchQuery.length >= 1) {
      const upperQuery = searchQuery.toUpperCase();
      const suggestions = [
        { symbol: "AAPL", name: "Apple Inc.", price: 248.04, change: 1.2 },
        { symbol: "NVDA", name: "NVIDIA Corporation", price: 187.67, change: 2.4 },
        { symbol: "TSLA", name: "Tesla Inc.", price: 449.06, change: -0.8 },
        { symbol: "META", name: "Meta Platforms", price: 612.34, change: 1.5 },
        { symbol: "AMD", name: "Advanced Micro Devices", price: 124.56, change: 3.2 },
        { symbol: "PLTR", name: "Palantir Technologies", price: 78.90, change: 4.1 },
        { symbol: "MSFT", name: "Microsoft Corporation", price: 432.15, change: 0.95 },
        { symbol: "GOOGL", name: "Alphabet Inc.", price: 192.34, change: 1.1 },
      ].filter(s =>
        s.symbol.includes(upperQuery) ||
        s.name.toUpperCase().includes(upperQuery)
      );
      setSearchResults(suggestions.slice(0, 6));
      setShowSearchResults(true);
    } else {
      setSearchResults([]);
      setShowSearchResults(false);
    }
  }, [searchQuery]);

  const handleSelectStock = (stock: any) => {
    setCurrentStock({
      symbol: stock.symbol,
      name: stock.name,
      price: stock.price,
      change: stock.change,
    });
    setSearchQuery("");
    setShowSearchResults(false);
  };

  const handleRunResearch = (agentId: string) => {
    if (!currentStock) {
      // If no stock selected, prompt user to select one
      alert("Please select a stock first using the search above or from the quick actions.");
      return;
    }

    // Navigate to appropriate page based on agent type
    switch (agentId) {
      case "swing_trade":
      case "technical":
        setLocation(`/chart-analysis?symbol=${currentStock.symbol}`);
        break;
      case "buy_sell":
        setLocation(`/ai-stock-picker?symbol=${currentStock.symbol}`);
        break;
      case "fundamental":
        setLocation(`/options-analyzer?symbol=${currentStock.symbol}`);
        break;
      case "news_sentiment":
        setLocation(`/smart-money?symbol=${currentStock.symbol}`);
        break;
      case "market_outlook":
        setLocation(`/market-movers`);
        break;
      default:
        setLocation(`/chart-analysis?symbol=${currentStock.symbol}`);
    }
  };

  const tradeAgents = analysisAgents.filter(a => a.category === "I want to trade");
  const investAgents = analysisAgents.filter(a => a.category === "I want to invest");
  const marketAgents = analysisAgents.filter(a => a.category === "I want to read the market");

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl font-semibold text-slate-100 mb-2">Your Research Library</h1>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Specialized agents providing institutional-grade deep research across stocks, crypto, forex, and ETFs.
            Make confident trading and investing decisions 24/7.
          </p>

          {/* Stock Search */}
          <div className="max-w-md mx-auto mt-6 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              placeholder="Search ticker to analyze (e.g. AAPL, NVDA)..."
              className="pl-10 bg-slate-900/60 border-slate-700 text-slate-100"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {showSearchResults && searchResults.length > 0 && (
              <Card className="absolute top-full mt-2 w-full bg-slate-900 border-slate-700 overflow-hidden z-50">
                {searchResults.map((result, i) => (
                  <div
                    key={i}
                    className="p-3 hover:bg-slate-800 cursor-pointer transition-colors border-b border-slate-800 last:border-0"
                    onClick={() => handleSelectStock(result)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-cyan-400">{result.symbol}</span>
                        <span className="text-sm text-slate-400 ml-2">{result.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-slate-200">${result.price}</div>
                        <div className={cn(
                          "text-xs",
                          result.change >= 0 ? "text-green-400" : "text-red-400"
                        )}>
                          {result.change >= 0 ? "+" : ""}{result.change}%
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </div>

          {/* Current Stock Indicator */}
          {currentStock && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-4 inline-flex items-center gap-3 px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg"
            >
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-slate-300">
                Ready to analyze <span className="font-semibold text-cyan-400">{currentStock.symbol}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-slate-400 hover:text-white"
                onClick={() => setCurrentStock(null)}
              >
                Clear
              </Button>
            </motion.div>
          )}
        </motion.div>

        {/* What do you want to do? */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-6">
            <h2 className="text-lg font-medium text-slate-200">What do you want to do?</h2>
            <Button variant="outline" size="sm" className="text-xs border-slate-700 text-slate-400">
              <BookOpen className="w-3 h-3 mr-1" />
              Quick Guide
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* I want to trade */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">I want to trade</span>
              </div>
              <div className="space-y-2">
                {tradeAgents.map((agent) => (
                  <Card
                    key={agent.id}
                    className={cn(
                      "p-4 cursor-pointer transition-all border group",
                      selectedAgent === agent.id
                        ? "bg-cyan-500/10 border-cyan-500/40"
                        : "bg-slate-900/60 border-slate-800 hover:border-cyan-500/30"
                    )}
                    onClick={() => {
                      setSelectedAgent(agent.id);
                      handleRunResearch(agent.id);
                    }}
                    data-testid={`agent-${agent.id}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-medium text-slate-200 group-hover:text-cyan-400 transition-colors">
                        {agent.name}
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 transition-colors" />
                    </div>
                    <div className="text-xs text-slate-400 mb-2">{agent.description}</div>
                    <div className="flex gap-1 flex-wrap">
                      {agent.assets.map((asset) => (
                        <Badge key={asset} variant="outline" className="text-xs py-0 border-slate-700 text-slate-500">
                          {asset}
                        </Badge>
                      ))}
                      {agent.id === "technical" && (
                        <Badge className="text-xs bg-cyan-500/20 text-cyan-400 border-0">+1</Badge>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* I want to invest */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-400">I want to invest</span>
              </div>
              <div className="space-y-2">
                {investAgents.map((agent) => (
                  <Card
                    key={agent.id}
                    className={cn(
                      "p-4 cursor-pointer transition-all border group",
                      selectedAgent === agent.id
                        ? "bg-cyan-500/10 border-cyan-500/40"
                        : "bg-slate-900/60 border-slate-800 hover:border-cyan-500/30"
                    )}
                    onClick={() => {
                      setSelectedAgent(agent.id);
                      handleRunResearch(agent.id);
                    }}
                    data-testid={`agent-${agent.id}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-medium text-slate-200 group-hover:text-cyan-400 transition-colors">
                        {agent.name}
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 transition-colors" />
                    </div>
                    <div className="text-xs text-slate-400 mb-2">{agent.description}</div>
                    <div className="flex gap-1 flex-wrap">
                      {agent.assets.map((asset) => (
                        <Badge key={asset} variant="outline" className="text-xs py-0 border-slate-700 text-slate-500">
                          {asset}
                        </Badge>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* I want to read the market + commodities */}
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-4 h-4 text-pink-400" />
                  <span className="text-sm font-medium text-pink-400">I want to read the market</span>
                </div>
                <div className="space-y-2">
                  {marketAgents.map((agent) => (
                    <Card
                      key={agent.id}
                      className={cn(
                        "p-4 cursor-pointer transition-all border group",
                        selectedAgent === agent.id
                          ? "bg-cyan-500/10 border-cyan-500/40"
                          : "bg-slate-900/60 border-slate-800 hover:border-cyan-500/30"
                      )}
                      onClick={() => {
                        setSelectedAgent(agent.id);
                        handleRunResearch(agent.id);
                      }}
                      data-testid={`agent-${agent.id}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-medium text-slate-200 group-hover:text-cyan-400 transition-colors">
                          {agent.name}
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 transition-colors" />
                      </div>
                      <div className="text-xs text-slate-400 mb-2">{agent.description}</div>
                      <div className="flex gap-1 flex-wrap">
                        {agent.assets.map((asset) => (
                          <Badge key={asset} variant="outline" className="text-xs py-0 border-slate-700 text-slate-500">
                            {asset}
                          </Badge>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-4 h-4 text-orange-400" />
                  <span className="text-sm font-medium text-orange-400">I want to trade commodities</span>
                </div>
                <div className="space-y-2">
                  {commodityAgents.map((agent, i) => (
                    <Card
                      key={i}
                      className="p-4 cursor-pointer transition-all bg-slate-900/60 border-slate-800 hover:border-slate-700"
                      data-testid={`commodity-agent-${i}`}
                    >
                      <div className="font-medium text-slate-200 mb-1">{agent.name}</div>
                      <div className="text-xs text-slate-400 mb-2">{agent.description}</div>
                      <div className="flex gap-1 flex-wrap">
                        {agent.assets.map((asset) => (
                          <Badge key={asset} variant="outline" className="text-xs py-0 border-slate-700 text-slate-500">
                            {asset}
                          </Badge>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Your Research History */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-slate-900/60 border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="font-semibold text-slate-100">Your Research</h3>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="text-slate-400">
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" className="text-slate-400 border-slate-700">
                  + Select Agent
                </Button>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input
                    placeholder="Search by ticker or analysis type..."
                    className="pl-9 bg-slate-800/50 border-slate-700 text-sm w-64"
                    data-testid="input-search-research"
                  />
                </div>
              </div>
            </div>
            <p className="text-sm text-slate-400 px-4 py-2 border-b border-slate-800/50">
              Every analysis you've run, organized and ready to revisit
            </p>
            
            <div className="divide-y divide-slate-800/50">
              {mockResearchHistory.map((item, i) => (
                <div 
                  key={i}
                  className="p-4 hover:bg-slate-800/30 transition-colors flex items-center justify-between"
                  data-testid={`research-history-${i}`}
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-cyan-400">{item.symbol}</span>
                        <span className="text-sm text-slate-400">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs border-slate-700 text-slate-500">
                          <LineChart className="w-3 h-3 mr-1" />
                          {item.type}
                        </Badge>
                        <span className="text-xs text-slate-500">• {item.time}</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-cyan-400">
                    <Eye className="w-4 h-4 mr-1" />
                    Run Research
                  </Button>
                </div>
              ))}
            </div>

            {mockResearchHistory.length === 0 && (
              <div className="p-12 text-center">
                <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No research history yet</p>
                <p className="text-sm text-slate-500 mt-1">Select an agent above and analyze a stock to get started</p>
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
