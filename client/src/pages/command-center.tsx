import { useState } from "react";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MarketRegimeDetector,
  VolatilitySnapshot,
  IndexHeatmap,
  FuturesBiasPanel,
  EconomicCalendarWidget,
  CorrelationMatrix,
  SignalConfidenceGauge,
  EngineConvergenceGauge,
  AIConsensusSummary,
  IdeaLifecycleTracker,
  LiveResearchFeed,
  QuantEnginePanel,
  RollingWinRate,
  SymbolLeaderboard,
  BotActivityMonitor,
  ThematicInvestingTable,
} from "@/components/dashboard";
import { AuroraBackground } from "@/components/aurora-background";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/motion";
import {
  Activity,
  BarChart2,
  Bot,
  Brain,
  Layers,
  LineChart,
  Zap,
  Terminal,
  Cpu,
} from "lucide-react";

const mockIndexData = [
  { symbol: "SPY", name: "S&P 500", price: 592.45, change: 5.23, changePercent: 0.89 },
  { symbol: "QQQ", name: "Nasdaq 100", price: 518.32, change: 7.41, changePercent: 1.45 },
  { symbol: "IWM", name: "Russell 2000", price: 224.18, change: -1.23, changePercent: -0.55 },
  { symbol: "BTC", name: "Bitcoin", price: 97245, change: 2134, changePercent: 2.24 },
  { symbol: "ETH", name: "Ethereum", price: 3421, change: 89, changePercent: 2.67 },
  { symbol: "GLD", name: "Gold", price: 241.56, change: 0.45, changePercent: 0.19 },
];

const mockFuturesData = [
  { symbol: "NQ", name: "Nasdaq Futures", price: 21452.50, change: 156.25, changePercent: 0.73, trend: "bullish" as const, pivotHigh: 21680, pivotLow: 21220, tickBias: 45 },
  { symbol: "ES", name: "S&P Futures", price: 5987.25, change: 32.50, changePercent: 0.55, trend: "bullish" as const, pivotHigh: 6020, pivotLow: 5940, tickBias: 28 },
  { symbol: "GC", name: "Gold Futures", price: 2678.40, change: -8.20, changePercent: -0.31, trend: "neutral" as const, pivotHigh: 2695, pivotLow: 2655, tickBias: -12 },
];

const mockEconomicEvents = [
  { id: "1", name: "CPI Data", time: "8:30 AM", impact: "high" as const, isUpcoming: true },
  { id: "2", name: "Fed Minutes", time: "2:00 PM", impact: "high" as const, isUpcoming: true },
  { id: "3", name: "Jobless Claims", time: "8:30 AM", impact: "medium" as const, isUpcoming: true },
  { id: "4", name: "PMI Data", time: "9:45 AM", impact: "medium" as const, actual: "52.3", forecast: "51.8", previous: "51.2", isUpcoming: false },
];

const mockCorrelationAssets = ["SPY", "QQQ", "BTC", "GLD", "TLT"];
const mockCorrelations = [
  [1, 0.92, 0.45, -0.12, -0.35],
  [0.92, 1, 0.52, -0.18, -0.42],
  [0.45, 0.52, 1, -0.08, -0.28],
  [-0.12, -0.18, -0.08, 1, 0.45],
  [-0.35, -0.42, -0.28, 0.45, 1],
];

const mockEngines = [
  { name: "AI", direction: "bullish" as const, confidence: 78, color: "purple" },
  { name: "Quant", direction: "bullish" as const, confidence: 72, color: "blue" },
  { name: "Flow", direction: "neutral" as const, confidence: 55, color: "cyan" },
  { name: "Sentiment", direction: "bullish" as const, confidence: 68, color: "green" },
  { name: "Technical", direction: "bullish" as const, confidence: 82, color: "amber" },
  { name: "ML", direction: "bullish" as const, confidence: 75, color: "pink" },
];

const mockAIProviders = [
  { name: "Claude", sentiment: "bullish" as const, confidence: 82, summary: "Strong momentum signals" },
  { name: "GPT-4", sentiment: "bullish" as const, confidence: 76, summary: "Positive trend" },
  { name: "Gemini", sentiment: "neutral" as const, confidence: 58, summary: "Mixed signals" },
];

const mockResearchBriefs = [
  { id: "1", symbol: "NVDA", title: "AI chip demand continues to surge, beating estimates", direction: "bullish" as const, confidence: 85, source: "AI Engine", timestamp: "2m ago", isNew: true, isPinned: true },
  { id: "2", symbol: "AAPL", title: "Services revenue growth accelerating in Q1", direction: "bullish" as const, confidence: 72, source: "Quant Engine", timestamp: "15m ago", isNew: true },
  { id: "3", symbol: "TSLA", title: "Delivery concerns offset by FSD progress", direction: "neutral" as const, confidence: 55, source: "AI Engine", timestamp: "1h ago" },
  { id: "4", symbol: "META", title: "Ad revenue momentum strong heading into earnings", direction: "bullish" as const, confidence: 78, source: "Flow Scanner", timestamp: "2h ago" },
];

const mockQuantMetrics = [
  { name: "RSI(2)", value: 32.5, signal: "bullish" as const, description: "Oversold reversal setup" },
  { name: "VWAP Distance", value: -0.45, signal: "bullish" as const, description: "Below VWAP, mean reversion" },
  { name: "ADX", value: 28.3, signal: "neutral" as const, description: "Moderate trend strength" },
  { name: "Volume Z-Score", value: 1.82, signal: "bullish" as const, description: "Above average volume" },
];

const mockWinRateData = [
  { period: "7D", winRate: 68, trades: 25, wins: 17, losses: 8 },
  { period: "30D", winRate: 62, trades: 89, wins: 55, losses: 34 },
  { period: "90D", winRate: 58, trades: 245, wins: 142, losses: 103 },
];

const mockWinners = [
  { symbol: "NVDA", totalReturn: 34.5, trades: 8, winRate: 75, avgHoldTime: "2.3d" },
  { symbol: "META", totalReturn: 28.2, trades: 6, winRate: 83, avgHoldTime: "1.8d" },
  { symbol: "TSLA", totalReturn: 22.1, trades: 12, winRate: 58, avgHoldTime: "3.2d" },
];

const mockLosers = [
  { symbol: "INTC", totalReturn: -18.5, trades: 5, winRate: 20, avgHoldTime: "4.1d" },
  { symbol: "BA", totalReturn: -12.3, trades: 4, winRate: 25, avgHoldTime: "2.8d" },
  { symbol: "DIS", totalReturn: -8.7, trades: 3, winRate: 33, avgHoldTime: "1.5d" },
];

const mockBots = [
  { id: "1", name: "Auto-Lotto Bot", status: "running" as const, lastAction: "Opened NVDA $145C", lastActionTime: "5m ago", positionsOpen: 2, todayPnl: 234, todayTrades: 4 },
  { id: "2", name: "Crypto Swing", status: "running" as const, lastAction: "Watching BTC", lastActionTime: "12m ago", positionsOpen: 1, todayPnl: -45, todayTrades: 2 },
  { id: "3", name: "Futures Scalper", status: "paused" as const, lastAction: "Session ended", lastActionTime: "2h ago", positionsOpen: 0, todayPnl: 156, todayTrades: 8 },
];

const mockThematicStocks = [
  { symbol: "IONQ", sector: "Quantum Computing", entry: 35.00, target: 80, upside: 129, conviction: "high" as const, thesis: "Leader in trapped-ion quantum computing. Re..." },
  { symbol: "RGTI", sector: "Quantum Computing", entry: 12.00, target: 40, upside: 233, conviction: "speculative" as const, thesis: "Superconducting quantum chips. Strong IP po..." },
  { symbol: "RKLB", sector: "Space", entry: 28.00, target: 75, upside: 168, conviction: "high" as const, thesis: "Rocket Lab - second most active orbital launc..." },
  { symbol: "NNE", sector: "Nuclear/Clean Energy", entry: 35.00, target: 100, upside: 186, conviction: "speculative" as const, thesis: "Nano Nuclear Energy - portable nuclear micro..." },
  { symbol: "SMR", sector: "Nuclear/Clean Energy", entry: 28.00, target: 70, upside: 150, conviction: "high" as const, thesis: "NuScale Power - small modular reactors. First..." },
  { symbol: "AI", sector: "AI/ML", entry: 35.00, target: 85, upside: 143, conviction: "medium" as const, thesis: "C3.ai - Enterprise AI platform. Federal contrac..." },
  { symbol: "SOUN", sector: "AI/ML", entry: 18.00, target: 50, upside: 178, conviction: "medium" as const, thesis: "SoundHound AI - voice AI platform. Restauran..." },
  { symbol: "ACHR", sector: "eVTOL/Flying Cars", entry: 8.00, target: 35, upside: 338, conviction: "speculative" as const, thesis: "Archer Aviation - Electric air taxi. United Airlin..." },
];

const mockIdeaLifecycle = [
  { id: "1", symbol: "NVDA", direction: "long" as const, stage: "active" as const, entryPrice: 142.50, currentPrice: 148.20, createdAt: "2h ago" },
  { id: "2", symbol: "META", direction: "long" as const, stage: "new" as const, entryPrice: 612.00, currentPrice: 612.00, createdAt: "10m ago" },
  { id: "3", symbol: "AAPL", direction: "long" as const, stage: "resolved" as const, entryPrice: 185.20, currentPrice: 192.40, createdAt: "2d ago", pnlPercent: 3.89 },
];

// Engine status for terminal display
const engineSystems = [
  { name: "ML Intelligence", status: "online" as const },
  { name: "Quant Scanner", status: "online" as const },
  { name: "Flow Detector", status: "online" as const },
  { name: "Sentiment AI", status: "online" as const },
  { name: "Technical Engine", status: "online" as const },
  { name: "Pattern Recognition", status: "online" as const },
];

export default function CommandCenter() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-x-hidden w-full">
      {/* Background */}
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-slate-950 to-slate-900"></div>
      <AuroraBackground />

      <div className="relative z-10 min-h-screen p-6">
      <div className="max-w-[1800px] mx-auto">
        {/* Header with terminal styling */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div className="flex items-center gap-4">
            <div className="p-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
              <Terminal className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">
                Command Center
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                6-engine analysis • real-time scanning
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 border border-slate-700/50 rounded-lg text-xs text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>6 Engines Active</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-lg">
              <motion.div
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-2 h-2 rounded-full bg-green-400"
              />
              <span className="text-xs text-green-400 font-medium">Market Open</span>
            </div>
          </div>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <TabsList className="bg-slate-900/80 border border-slate-700/50 p-1" data-testid="command-center-tabs">
              <TabsTrigger value="overview" data-testid="tab-overview" className="gap-2 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                <Activity className="w-4 h-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="signals" data-testid="tab-signals" className="gap-2 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                <Brain className="w-4 h-4" />
                Signals
              </TabsTrigger>
              <TabsTrigger value="engines" data-testid="tab-engines" className="gap-2 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                <BarChart2 className="w-4 h-4" />
                Engines
              </TabsTrigger>
              <TabsTrigger value="performance" data-testid="tab-performance" className="gap-2 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                <LineChart className="w-4 h-4" />
                Performance
              </TabsTrigger>
              <TabsTrigger value="automation" data-testid="tab-automation" className="gap-2 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                <Bot className="w-4 h-4" />
                Automation
              </TabsTrigger>
              <TabsTrigger value="thematic" data-testid="tab-thematic" className="gap-2 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                <Layers className="w-4 h-4" />
                Thematic
              </TabsTrigger>
            </TabsList>
          </motion.div>

          <TabsContent value="overview" className="space-y-6">
            <StaggerContainer staggerDelay={0.08} className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <StaggerItem>
                <MarketRegimeDetector
                  regime="risk-on"
                  confidence={78}
                  vixLevel={14.52}
                  breadthAdvancing={65}
                />
              </StaggerItem>
              <StaggerItem>
                <VolatilitySnapshot
                  vix={14.52}
                  vixChange={-3.2}
                  vvix={82.4}
                  realizedVol={12.8}
                  impliedVol={15.2}
                />
              </StaggerItem>
              <StaggerItem>
                <IndexHeatmap indices={mockIndexData} />
              </StaggerItem>
              <StaggerItem>
                <EconomicCalendarWidget events={mockEconomicEvents} />
              </StaggerItem>
            </StaggerContainer>

            <StaggerContainer staggerDelay={0.1} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <StaggerItem>
                <FuturesBiasPanel futures={mockFuturesData} />
              </StaggerItem>
              <StaggerItem>
                <CorrelationMatrix assets={mockCorrelationAssets} correlations={mockCorrelations} />
              </StaggerItem>
              <StaggerItem>
                {/* Live market feed */}
                <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/50 backdrop-blur-xl border border-cyan-500/20 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4 text-cyan-400 text-sm">
                    <Zap className="w-4 h-4" />
                    <span className="font-medium">Real-Time Data</span>
                    <motion.div
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="w-2 h-2 rounded-full bg-green-400 ml-auto"
                    />
                  </div>
                  <LiveResearchFeed briefs={mockResearchBriefs} />
                </div>
              </StaggerItem>
            </StaggerContainer>
          </TabsContent>

          <TabsContent value="signals" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <SignalConfidenceGauge
                confidence={75}
                direction="bullish"
                symbol="SPY"
                factors={[
                  { name: "Technical", value: 82 },
                  { name: "Sentiment", value: 68 },
                  { name: "Flow", value: 75 },
                ]}
              />
              <EngineConvergenceGauge
                engines={mockEngines}
                overallConvergence={72}
              />
              <AIConsensusSummary
                consensus="bullish"
                overallConfidence={72}
                providers={mockAIProviders}
                summary="Multiple AI models agree on bullish momentum driven by strong earnings expectations and favorable macro conditions."
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <LiveResearchFeed briefs={mockResearchBriefs} />
              <IdeaLifecycleTracker ideas={mockIdeaLifecycle} />
            </div>
          </TabsContent>

          <TabsContent value="engines" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <QuantEnginePanel
                metrics={mockQuantMetrics}
                overallSignal="bullish"
                zScore={1.45}
              />
              <EngineConvergenceGauge
                engines={mockEngines}
                overallConvergence={72}
              />
              <AIConsensusSummary
                consensus="bullish"
                overallConfidence={72}
                providers={mockAIProviders}
                summary="Strong agreement across AI models on bullish bias."
              />
            </div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <RollingWinRate
                data={mockWinRateData}
                overallWinRate={61}
              />
              <SymbolLeaderboard
                winners={mockWinners}
                losers={mockLosers}
              />
              <IdeaLifecycleTracker ideas={mockIdeaLifecycle} />
            </div>
          </TabsContent>

          <TabsContent value="automation" className="space-y-6">
            <StaggerContainer staggerDelay={0.1} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <StaggerItem className="lg:col-span-2">
                <BotActivityMonitor bots={mockBots} />
              </StaggerItem>
              <StaggerItem>
                <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/50 backdrop-blur-xl border border-cyan-500/20 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4 text-cyan-400 text-sm">
                    <Cpu className="w-4 h-4" />
                    <span className="font-medium">Engine Status</span>
                  </div>
                  <div className="space-y-3">
                    {engineSystems.map((system) => (
                      <div key={system.name} className="flex items-center justify-between text-sm">
                        <span className="text-slate-300">{system.name}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-400" />
                          <span className="text-green-400 text-xs">Online</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-700/50">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-slate-400">System Load</span>
                      <span className="text-cyan-400">67%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2">
                      <div className="bg-gradient-to-r from-cyan-500 to-cyan-400 h-2 rounded-full" style={{ width: '67%' }} />
                    </div>
                  </div>
                </div>
              </StaggerItem>
            </StaggerContainer>
            <FadeIn delay={0.3}>
              <RollingWinRate
                data={mockWinRateData}
                overallWinRate={61}
              />
            </FadeIn>
          </TabsContent>

          <TabsContent value="thematic" className="space-y-6">
            <ThematicInvestingTable
              stocks={mockThematicStocks}
              title="Thematic Investing - High Growth Sectors"
            />
          </TabsContent>
        </Tabs>
      </div>
      </div>
    </div>
  );
}
