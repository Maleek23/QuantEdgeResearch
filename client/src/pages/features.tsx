import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { SEOHead } from "@/components/seo-head";
import { 
  Brain, 
  Calculator, 
  ArrowRight,
  Activity,
  Check,
  Bot,
  Database,
  Target,
  Coins,
  CandlestickChart,
  PieChart,
  FileSearch,
  AlertTriangle,
  ClipboardList,
  GraduationCap,
  Newspaper,
  MessageSquare,
  TrendingUp,
  LineChart,
  BarChart3,
  Eye,
  Layers
} from "lucide-react";
import quantEdgeLogoUrl from "@assets/q_1767502987714.png";
import { AuroraBackground } from "@/components/aurora-background";
import { ParticleBackground } from "@/components/particle-background";

export default function Features() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 relative">
      <SEOHead
        pageKey="features"
        title="Platform Features | Quant Edge Labs"
        description="Explore all Quant Edge Labs features: 6 AI Engines, ML Predictions, Technical Analysis, Options Flow, Sentiment Tracking, and more."
      />

      {/* Consistent Background with Homepage */}
      <AuroraBackground />
      <div className="fixed inset-0 pointer-events-none z-[1]">
        <ParticleBackground />
      </div>
      <div className="fixed inset-0 bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-900/90 pointer-events-none z-[2]" />
      
      {/* Sticky Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/5" data-testid="navbar">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            <Link href="/" className="flex items-center gap-3" data-testid="link-logo">
              <img src={quantEdgeLogoUrl} alt="Quant Edge Labs" className="h-10 w-10 object-contain" />
              <span className="hidden sm:block text-lg font-semibold bg-gradient-to-r from-cyan-400 to-cyan-200 bg-clip-text text-transparent">Quant Edge Labs</span>
            </Link>

            <nav className="hidden md:flex items-center gap-6">
              <Link 
                href="/features" 
                className="text-sm text-cyan-400 font-medium"
                data-testid="link-features"
              >
                Features
              </Link>
              <Link 
                href="/pricing" 
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-pricing"
              >
                Pricing
              </Link>
              <Link 
                href="/academy" 
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-academy"
              >
                Academy
              </Link>
              <Link 
                href="/blog" 
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-blog"
              >
                Blog
              </Link>
            </nav>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              {isAuthenticated ? (
                <Button onClick={() => setLocation('/trading-engine')} data-testid="button-dashboard">
                  Command Center
                </Button>
              ) : (
                <>
                  <Button 
                    variant="outline" 
                    onClick={() => setLocation('/login')}
                    className="hidden sm:inline-flex border-slate-700"
                    data-testid="button-login"
                  >
                    Login
                  </Button>
                  <Button 
                    onClick={() => setLocation('/')}
                    className="bg-cyan-500 text-slate-950"
                    data-testid="button-join-beta"
                  >
                    Join Beta
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-28 pb-16 relative z-10" data-testid="features-hero">
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="container mx-auto px-6 relative">
          <div className="text-center max-w-3xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-4">
              Complete Platform Overview
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 text-white">
              Everything You Get with{" "}
              <span className="bg-gradient-to-r from-cyan-400 to-cyan-200 bg-clip-text text-transparent">Quant Edge Labs</span>
            </h1>
            <p className="text-lg text-slate-400 leading-relaxed">
              A comprehensive research platform combining AI analysis, quantitative signals, 
              institutional flow detection, and full performance transparency.
            </p>
          </div>
        </div>
      </section>

      {/* Six Engines Section */}
      <section className="py-12 lg:py-16 relative z-10" id="engines" data-testid="section-engines">
        <div className="container mx-auto px-6">
          <div className="text-center mb-10">
            <p className="text-xs font-medium uppercase tracking-wider text-cyan-400 mb-2">
              Core Analysis Engines
            </p>
            <h2 className="text-2xl font-bold text-white">Six AI Engines Working Together</h2>
            <p className="text-slate-400 mt-2 max-w-2xl mx-auto">
              Each engine specializes in a different aspect of market analysis.
              When multiple engines converge, you get higher-conviction trade ideas.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* ML Engine */}
            <div className="bg-slate-900/60 backdrop-blur rounded-xl p-6 border border-pink-500/20 hover:border-pink-500/40 transition-all" data-testid="card-ml-engine">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-lg bg-pink-500/10 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-pink-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-white">ML Engine</h3>
                  <p className="text-xs text-slate-500">Predictive Analytics</p>
                </div>
              </div>
              <p className="text-sm text-slate-400 mb-4">
                Machine learning predictions using regime detection, confidence calibration, and historical pattern analysis.
              </p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Market regime detection
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Confidence calibration
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Signal weight optimization
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Win rate tracking
                </li>
              </ul>
            </div>

            {/* AI Engine */}
            <div className="bg-slate-900/60 backdrop-blur rounded-xl p-6 border border-purple-500/20 hover:border-purple-500/40 transition-all" data-testid="card-ai-engine">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Brain className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-white">AI Engine</h3>
                  <p className="text-xs text-slate-500">Multi-LLM Analysis</p>
                </div>
              </div>
              <p className="text-sm text-slate-400 mb-4">
                Multi-LLM consensus using Claude, GPT, and Gemini for SEC filings, earnings, and news catalyst analysis.
              </p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> SEC filing analysis
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Earnings call insights
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> News catalyst detection
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Multi-model consensus
                </li>
              </ul>
            </div>

            {/* Quant Engine */}
            <div className="bg-slate-900/60 backdrop-blur rounded-xl p-6 border border-blue-500/20 hover:border-blue-500/40 transition-all" data-testid="card-quant-engine">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Calculator className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-white">Quant Engine</h3>
                  <p className="text-xs text-slate-500">Statistical Signals</p>
                </div>
              </div>
              <p className="text-sm text-slate-400 mb-4">
                Systematic signal generation using RSI, VWAP, volume analysis, and statistical edge detection for day traders.
              </p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> RSI mean reversion
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> VWAP analysis
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Volume spike detection
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> ADX trend filtering
                </li>
              </ul>
            </div>

            {/* Flow Engine */}
            <div className="bg-slate-900/60 backdrop-blur rounded-xl p-6 border border-cyan-500/20 hover:border-cyan-500/40 transition-all" data-testid="card-flow-engine">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <Activity className="h-6 w-6 text-cyan-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-white">Flow Engine</h3>
                  <p className="text-xs text-slate-500">Smart Money Tracking</p>
                </div>
              </div>
              <p className="text-sm text-slate-400 mb-4">
                Track institutional order flow, dark pool prints, and whale trades in real-time to follow smart money.
              </p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Unusual options volume
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Dark pool prints
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Sweep detection
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Block trade alerts
                </li>
              </ul>
            </div>

            {/* Sentiment Engine */}
            <div className="bg-slate-900/60 backdrop-blur rounded-xl p-6 border border-amber-500/20 hover:border-amber-500/40 transition-all" data-testid="card-sentiment-engine">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Target className="h-6 w-6 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-white">Sentiment Engine</h3>
                  <p className="text-xs text-slate-500">Market Psychology</p>
                </div>
              </div>
              <p className="text-sm text-slate-400 mb-4">
                Social media sentiment analysis with Fear & Greed tracking to gauge market psychology and retail positioning.
              </p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Social sentiment analysis
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Fear & Greed index
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> WSB tracking
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> News sentiment
                </li>
              </ul>
            </div>

            {/* Technical Engine */}
            <div className="bg-slate-900/60 backdrop-blur rounded-xl p-6 border border-green-500/20 hover:border-green-500/40 transition-all" data-testid="card-technical-engine">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CandlestickChart className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-white">Technical Engine</h3>
                  <p className="text-xs text-slate-500">Pattern Recognition</p>
                </div>
              </div>
              <p className="text-sm text-slate-400 mb-4">
                AI-powered chart pattern recognition with automated support, resistance, and trend line detection.
              </p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Chart pattern AI
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Support/resistance
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Multi-timeframe analysis
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Trend line detection
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Research Tools Section */}
      <section className="py-12 lg:py-16 relative z-10 border-y border-slate-800/50" id="research-tools" data-testid="section-research-tools">
        <div className="container mx-auto px-6">
          <div className="text-center mb-10">
            <p className="text-xs font-medium uppercase tracking-wider text-cyan-400 mb-2">
              Research Workbench
            </p>
            <h2 className="text-2xl font-bold text-white">Professional-Grade Tools</h2>
            <p className="text-slate-400 mt-2 max-w-2xl mx-auto">
              Everything you need for comprehensive market research in one platform.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            <div className="glass-card rounded-lg p-5 border-l-2 border-amber-500/50 hover-elevate" data-testid="card-chart-analysis">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center mb-4">
                <Target className="h-5 w-5 text-amber-400" />
              </div>
              <h3 className="font-semibold mb-2">Chart Analysis</h3>
              <p className="text-sm text-muted-foreground">
                Multi-timeframe chart annotations with AI-powered pattern recognition and key level identification.
              </p>
            </div>
            
            <div className="glass-card rounded-lg p-5 border-l-2 border-purple-500/50 hover-elevate" data-testid="card-chart-database">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center mb-4">
                <Database className="h-5 w-5 text-purple-400" />
              </div>
              <h3 className="font-semibold mb-2">Chart Database</h3>
              <p className="text-sm text-muted-foreground">
                Historical trade pattern library for educational study and backtesting research.
              </p>
            </div>
            
            <div className="glass-card rounded-lg p-5 border-l-2 border-green-500/50 hover-elevate" data-testid="card-futures-terminal">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-green-500/20 to-green-600/10 flex items-center justify-center mb-4">
                <CandlestickChart className="h-5 w-5 text-green-400" />
              </div>
              <h3 className="font-semibold mb-2">Futures Terminal</h3>
              <p className="text-sm text-muted-foreground">
                Real-time NQ, GC futures data with institutional-grade charting and analysis.
              </p>
            </div>
            
            <div className="glass-card rounded-lg p-5 border-l-2 border-cyan-500/50 hover-elevate" data-testid="card-auto-lotto-bot">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center mb-4">
                <Bot className="h-5 w-5 text-cyan-400" />
              </div>
              <h3 className="font-semibold mb-2">Auto-Lotto Bot</h3>
              <p className="text-sm text-muted-foreground">
                Autonomous paper trading system that tests high R:R strategies with full transparency.
              </p>
              <Badge variant="outline" className="mt-2 text-xs border-cyan-500/30 text-cyan-400">
                Paper Trading Only
              </Badge>
            </div>
          </div>
        </div>
      </section>

      {/* Market Coverage Section */}
      <section className="py-12 lg:py-16" id="market-coverage" data-testid="section-market-coverage">
        <div className="container mx-auto px-6">
          <div className="text-center mb-10">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Full Market Coverage
            </p>
            <h2 className="text-xl font-semibold">Research Any Market</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
              Comprehensive coverage across all major asset classes.
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            <div className="glass-card rounded-lg p-6 text-center hover-elevate" data-testid="badge-stocks">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center mx-auto mb-3">
                <TrendingUp className="h-6 w-6 text-cyan-400" />
              </div>
              <h3 className="font-semibold">Stocks</h3>
              <p className="text-xs text-muted-foreground mt-1">US Equities</p>
            </div>
            
            <div className="glass-card rounded-lg p-6 text-center hover-elevate" data-testid="badge-options">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center mx-auto mb-3">
                <LineChart className="h-6 w-6 text-purple-400" />
              </div>
              <h3 className="font-semibold">Options</h3>
              <p className="text-xs text-muted-foreground mt-1">Full Chain + Greeks</p>
            </div>
            
            <div className="glass-card rounded-lg p-6 text-center hover-elevate" data-testid="badge-crypto">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center mx-auto mb-3">
                <Coins className="h-6 w-6 text-amber-400" />
              </div>
              <h3 className="font-semibold">Crypto</h3>
              <p className="text-xs text-muted-foreground mt-1">BTC, ETH, Altcoins</p>
            </div>
            
            <div className="glass-card rounded-lg p-6 text-center hover-elevate" data-testid="badge-futures">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-green-500/20 to-green-600/10 flex items-center justify-center mx-auto mb-3">
                <CandlestickChart className="h-6 w-6 text-green-400" />
              </div>
              <h3 className="font-semibold">Futures</h3>
              <p className="text-xs text-muted-foreground mt-1">NQ, GC Contracts</p>
            </div>
          </div>
        </div>
      </section>

      {/* Analytics & Risk Section */}
      <section className="py-12 lg:py-16 bg-slate-900/30 dark:bg-slate-900/30" id="analytics" data-testid="section-analytics">
        <div className="container mx-auto px-6">
          <div className="text-center mb-10">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Full Transparency
            </p>
            <h2 className="text-xl font-semibold">Analytics & Risk Controls</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
              Every outcome tracked. Every loss analyzed. Complete audit trail.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            <div className="glass-card rounded-lg p-5 border-l-2 border-cyan-500/50 hover-elevate" data-testid="card-performance-analytics">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center mb-4">
                <PieChart className="h-5 w-5 text-cyan-400" />
              </div>
              <h3 className="font-semibold mb-2">Performance Analytics</h3>
              <p className="text-sm text-muted-foreground">
                Win rates, drawdowns, engine comparisons, and calibrated statistics.
              </p>
            </div>
            
            <div className="glass-card rounded-lg p-5 border-l-2 border-amber-500/50 hover-elevate" data-testid="card-loss-analysis">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center mb-4">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <h3 className="font-semibold mb-2">Loss Analysis</h3>
              <p className="text-sm text-muted-foreground">
                Automatic post-mortem on losing trades with pattern detection and lessons learned.
              </p>
            </div>
            
            <div className="glass-card rounded-lg p-5 border-l-2 border-purple-500/50 hover-elevate" data-testid="card-paper-journal">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center mb-4">
                <ClipboardList className="h-5 w-5 text-purple-400" />
              </div>
              <h3 className="font-semibold mb-2">Paper Trading Journal</h3>
              <p className="text-sm text-muted-foreground">
                Track hypothetical trades and build your research methodology.
              </p>
            </div>
            
            <div className="glass-card rounded-lg p-5 border-l-2 border-blue-500/50 hover-elevate" data-testid="card-trade-audit">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center mb-4">
                <FileSearch className="h-5 w-5 text-blue-400" />
              </div>
              <h3 className="font-semibold mb-2">Trade Audit</h3>
              <p className="text-sm text-muted-foreground">
                Full transparency on every research brief with complete audit trails.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Data Intelligence Section */}
      <section className="py-12 lg:py-16" id="data-intelligence" data-testid="section-data-intelligence">
        <div className="container mx-auto px-6">
          <div className="text-center mb-10">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Historical Intelligence
            </p>
            <h2 className="text-xl font-semibold">Data-Driven Insights</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
              <span className="font-mono tabular-nums">411+</span> resolved trades analyzed for patterns and performance calibration.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="glass-card rounded-lg p-5 text-center hover-elevate" data-testid="card-engine-perf">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="h-5 w-5 text-cyan-400" />
              </div>
              <h3 className="font-semibold mb-2">Engine Performance</h3>
              <p className="text-sm text-muted-foreground">
                Historical win rates and average gains per engine, recalibrated monthly.
              </p>
            </div>
            
            <div className="glass-card rounded-lg p-5 text-center hover-elevate" data-testid="card-symbol-tracking">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center mx-auto mb-4">
                <Eye className="h-5 w-5 text-purple-400" />
              </div>
              <h3 className="font-semibold mb-2">Symbol Tracking</h3>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono tabular-nums">30+</span> symbols with <span className="font-mono tabular-nums">3+</span> trades tracked for pattern recognition.
              </p>
            </div>
            
            <div className="glass-card rounded-lg p-5 text-center hover-elevate" data-testid="card-confidence-calibration">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center mx-auto mb-4">
                <Layers className="h-5 w-5 text-blue-400" />
              </div>
              <h3 className="font-semibold mb-2">Signal Strength Bands</h3>
              <p className="text-sm text-muted-foreground">
                A/B/C grades based on signal consensus, not misleading probabilities.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Education Section */}
      <section className="py-12 lg:py-16 bg-slate-900/30 dark:bg-slate-900/30" id="education" data-testid="section-education">
        <div className="container mx-auto px-6">
          <div className="text-center mb-10">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Learn & Grow
            </p>
            <h2 className="text-xl font-semibold">Education & Community</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
              Structured learning resources to build your trading knowledge.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Link href="/academy" className="block" data-testid="card-academy">
              <div className="glass-card rounded-lg p-5 border-l-2 border-cyan-500/50 hover-elevate h-full">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center mb-4">
                  <GraduationCap className="h-5 w-5 text-cyan-400" />
                </div>
                <h3 className="font-semibold mb-2">Trading Academy</h3>
                <p className="text-sm text-muted-foreground">
                  Structured courses on options basics, position sizing, chart reading, and risk management.
                </p>
              </div>
            </Link>
            
            <Link href="/blog" className="block" data-testid="card-blog">
              <div className="glass-card rounded-lg p-5 border-l-2 border-purple-500/50 hover-elevate h-full">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center mb-4">
                  <Newspaper className="h-5 w-5 text-purple-400" />
                </div>
                <h3 className="font-semibold mb-2">Educational Blog</h3>
                <p className="text-sm text-muted-foreground">
                  Weekly articles covering trading concepts, market analysis techniques, and learning resources.
                </p>
              </div>
            </Link>
            
            <div className="glass-card rounded-lg p-5 border-l-2 border-blue-500/50 hover-elevate" data-testid="card-discord">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center mb-4">
                <MessageSquare className="h-5 w-5 text-blue-400" />
              </div>
              <h3 className="font-semibold mb-2">Discord Alerts</h3>
              <p className="text-sm text-muted-foreground">
                Real-time notifications for new research briefs delivered to your Discord.
              </p>
              <Badge variant="outline" className="mt-2 text-xs border-cyan-500/30 text-cyan-400">
                Advanced + Pro Plans
              </Badge>
            </div>
          </div>
        </div>
      </section>

      {/* Data Providers Section */}
      <section className="py-8" id="data-providers" data-testid="section-data-providers">
        <div className="container mx-auto px-6">
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
              Powered By Real-Time Data
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm font-mono text-muted-foreground/60">
              <span>Yahoo Finance</span>
              <span className="text-muted-foreground/30">|</span>
              <span>Tradier</span>
              <span className="text-muted-foreground/30">|</span>
              <span>CoinGecko</span>
              <span className="text-muted-foreground/30">|</span>
              <span>Alpha Vantage</span>
              <span className="text-muted-foreground/30">|</span>
              <span>Databento</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16" data-testid="section-cta">
        <div className="container mx-auto px-6">
          <div className="glass-card rounded-lg p-8 md:p-12 text-center max-w-3xl mx-auto border border-cyan-500/20">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Get Started Today
            </p>
            <h2 className="text-xl font-semibold mb-4">Ready to Start Your Research?</h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Join thousands of traders using Quant Edge Labs for educational market research. 
              Free tier available.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button 
                className="bg-cyan-500 text-slate-950"
                onClick={() => setLocation('/')}
                data-testid="button-cta-join-beta"
              >
                Join Waitlist <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button 
                variant="outline"
                onClick={() => setLocation('/pricing')}
                className="border-slate-700"
                data-testid="button-cta-pricing"
              >
                View Pricing
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Educational Disclaimer */}
      <section className="py-8 border-t border-slate-800/50" data-testid="section-disclaimer">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto">
            <p className="text-xs text-muted-foreground/60 leading-relaxed">
              <strong className="text-muted-foreground">Educational Research Only:</strong> Quant Edge Labs is a research and educational platform. 
              Nothing on this platform constitutes financial advice or a recommendation to buy or sell any security. 
              All trading involves risk of loss. Past performance does not guarantee future results. 
              Always conduct your own research and consult a licensed financial advisor.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-slate-800/50">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={quantEdgeLogoUrl} alt="Quant Edge Labs" className="h-6 w-6" />
              <span className="font-semibold">Quant Edge Labs</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
              <Link href="/terms" className="hover:text-foreground">Terms</Link>
              <Link href="/about" className="hover:text-foreground">About</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
