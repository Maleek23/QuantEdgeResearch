import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/hooks/useAuth";
import {
  TrendingUp,
  Brain,
  Calculator,
  Check,
  ArrowRight,
  Activity,
  Target,
  Coins,
  CandlestickChart,
  Sparkles,
  BarChart3,
  Zap,
  Shield,
  ChartLine,
  Play,
  Loader2
} from "lucide-react";
import { useState, lazy, Suspense, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { SiDiscord } from "react-icons/si";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import { WaitlistPopup } from "@/components/waitlist-popup";

// Interface for real trade idea from API
interface TradeIdea {
  symbol: string;
  direction?: string;
  confidenceScore?: number;
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  riskRewardRatio?: number;
  analysis?: string;
}

// Lazy load heavy components
const LiveActivityFeed = lazy(() => import("@/components/live-activity-feed").then(m => ({ default: m.LiveActivityFeed })));

const DISCORD_INVITE_URL = "https://discord.gg/3QF8QEKkYq";

// FAQ data for both display and structured data
const faqData = [
  { id: 'what', q: 'What is Quant Edge Labs?', a: 'Quant Edge Labs is an AI-powered stock analysis platform for self-directed traders. We use 6 specialized engines (ML, AI, Quant, Flow, Sentiment, Technical) to analyze markets 24/7 and surface potential trading setups. This is an educational research tool—not a signal service or financial advice.' },
  { id: 'engines', q: 'How do the 6 AI engines work together?', a: 'Each engine specializes in a different analysis type: ML for predictions, AI for news/filings, Quant for statistical patterns, Flow for institutional activity, Sentiment for social signals, and Technical for chart patterns. When multiple engines agree on a setup, you get higher-conviction trade ideas with confidence scores.' },
  { id: 'risk', q: 'How does the risk management work?', a: 'Every trade idea includes calculated risk/reward ratios, suggested entry points, profit targets, and stop-loss levels. We also provide a paper trading simulator so you can practice strategies without risking real capital.' },
  { id: 'data', q: 'Where does the market data come from?', a: 'We source real-time data from Tradier (stocks/options), CoinGecko (crypto), Yahoo Finance (equities), and Alpha Vantage (news/earnings). All data refreshes every few seconds during market hours for accurate analysis.' },
  { id: 'advice', q: 'Is this financial advice?', a: 'No. Quant Edge Labs is strictly an educational research platform. We provide AI-powered analysis tools and pattern recognition—not buy/sell recommendations. You make all trading decisions yourself. Trading involves substantial risk of loss.' },
];

export default function Landing() {
  const [, setLocation] = useLocation();
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const { isAuthenticated } = useAuth();

  // Fetch REAL trade idea for hero section
  const { data: heroIdea, isLoading: heroLoading } = useQuery<TradeIdea>({
    queryKey: ['/api/trade-ideas/featured'],
    queryFn: async () => {
      try {
        // Try to get best setup first
        const res = await fetch('/api/trade-ideas/best-setups?period=daily&limit=1');
        if (res.ok) {
          const data = await res.json();
          if (data.setups && data.setups.length > 0) {
            return data.setups[0];
          }
        }
        // Fallback to latest trade idea
        const fallback = await fetch('/api/trade-ideas?limit=1');
        if (fallback.ok) {
          const ideas = await fallback.json();
          if (ideas.length > 0) return ideas[0];
        }
        return null;
      } catch {
        return null;
      }
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  // Inject FAQ structured data for SEO rich snippets
  useEffect(() => {
    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": faqData.map(faq => ({
        "@type": "Question",
        "name": faq.q,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": faq.a
        }
      }))
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(faqSchema);
    script.id = 'faq-schema';

    // Remove existing schema if present
    const existing = document.getElementById('faq-schema');
    if (existing) existing.remove();

    document.head.appendChild(script);

    return () => {
      const el = document.getElementById('faq-schema');
      if (el) el.remove();
    };
  }, []);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Gradient Background */}
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-slate-950 via-slate-900 to-black" />

      {/* Sticky Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/50" data-testid="navbar">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            <Link href="/" className="flex-shrink-0" data-testid="link-logo">
              <img src={quantEdgeLabsLogoUrl} alt="Quant Edge Labs" className="h-10 w-10 object-contain" />
            </Link>

            <nav className="hidden md:flex items-center gap-6">
              <Link 
                href="/features" 
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-features"
              >
                Features
              </Link>
              <button 
                onClick={() => scrollToSection('pricing')} 
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-pricing"
              >
                Pricing
              </button>
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
              <Link 
                href="/about" 
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-about"
              >
                About
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8"
                onClick={() => window.open(DISCORD_INVITE_URL, '_blank')}
                data-testid="button-discord-nav"
              >
                <SiDiscord className="h-4 w-4" />
              </Button>
              {isAuthenticated ? (
                <Link href="/trade-desk">
                  <Button size="sm" className="bg-cyan-500 hover:bg-cyan-400 text-slate-950" data-testid="button-dashboard">
                    Dashboard
                  </Button>
                </Link>
              ) : (
                <Link href="/login">
                  <Button size="sm" variant="outline" data-testid="button-login">
                    Sign In
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section - Side by Side Layout */}
      <section className="relative pt-24 pb-12" data-testid="hero-section">
        <div className="container mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Hero Text */}
            <div className="text-center lg:text-left">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm mb-6">
                <Zap className="h-3.5 w-3.5" />
                <span>AI-Powered Trading Research</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-white">
                AI Stock Analysis.
                <br />
                <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Six Engines. One Edge.</span>
              </h1>

              <p className="text-lg text-slate-400 max-w-xl mx-auto lg:mx-0 mb-8">
                Our AI trading platform combines ML predictions, sentiment analysis, order flow tracking, and technical signals into higher-conviction trade ideas.
              </p>

              <div className="flex flex-wrap gap-3 justify-center lg:justify-start mb-8">
                <Button
                  size="lg"
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold h-12 px-6"
                  onClick={() => setWaitlistOpen(true)}
                >
                  Join Beta Waitlist
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="border-slate-700 hover:bg-slate-800 h-12 px-6"
                  onClick={() => scrollToSection('features')}
                >
                  <Play className="mr-2 h-4 w-4" />
                  See How It Works
                </Button>
              </div>

              {/* Trust Badges */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-500" />
                  256-bit SSL encryption
                </span>
                <span className="flex items-center gap-2">
                  <ChartLine className="h-4 w-4 text-cyan-500" />
                  Live market data
                </span>
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-500" />
                  Free forever in beta
                </span>
              </div>
            </div>

            {/* Right: Product Mockup - Animated */}
            <div className="relative animate-float">
              {/* Glow effect behind */}
              <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/20 via-blue-500/10 to-purple-500/20 rounded-2xl blur-2xl opacity-50" />

              {/* Browser Window Frame */}
              <div className="relative rounded-xl overflow-hidden shadow-2xl shadow-cyan-500/20 border border-slate-700/50">
                {/* Browser Chrome */}
                <div className="bg-slate-800 px-4 py-2.5 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-slate-700/50 rounded px-3 py-1 text-xs text-slate-400 text-center">
                      quantedgelabs.net/trade-desk
                    </div>
                  </div>
                </div>

                {/* Trade Card Content - REAL DATA */}
                <div className="bg-slate-900 p-5">
                  {heroLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                    </div>
                  ) : heroIdea ? (
                    <>
                      {/* Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm ${
                            heroIdea.direction?.toLowerCase() === 'long' || heroIdea.direction?.toLowerCase() === 'bullish'
                              ? 'bg-gradient-to-br from-green-500 to-emerald-600'
                              : 'bg-gradient-to-br from-red-500 to-rose-600'
                          }`}>
                            {heroIdea.symbol?.slice(0, 2)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{heroIdea.symbol}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                heroIdea.direction?.toLowerCase() === 'long' || heroIdea.direction?.toLowerCase() === 'bullish'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}>
                                {heroIdea.direction?.toUpperCase() || 'SIGNAL'}
                              </span>
                            </div>
                            <span className="text-xs text-slate-500">AI-Generated Setup</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-bold ${
                            (heroIdea.confidenceScore || 0) >= 80 ? 'text-emerald-400' :
                            (heroIdea.confidenceScore || 0) >= 60 ? 'text-amber-400' : 'text-slate-400'
                          }`}>
                            {heroIdea.confidenceScore?.toFixed(0) || '--'}%
                          </div>
                          <span className="text-[10px] text-slate-500">Confidence</span>
                        </div>
                      </div>

                      {/* 6 Engine Visual */}
                      <div className="flex gap-1.5 mb-4">
                        {[
                          { name: 'ML', color: 'text-pink-400 bg-pink-500/10' },
                          { name: 'AI', color: 'text-purple-400 bg-purple-500/10' },
                          { name: 'QT', color: 'text-blue-400 bg-blue-500/10' },
                          { name: 'FL', color: 'text-cyan-400 bg-cyan-500/10' },
                          { name: 'ST', color: 'text-amber-400 bg-amber-500/10' },
                          { name: 'TC', color: 'text-green-400 bg-green-500/10' },
                        ].map((e) => (
                          <div key={e.name} className={`flex-1 text-center py-1.5 rounded ${e.color}`}>
                            <div className="text-[9px] text-slate-500">{e.name}</div>
                            <div className={`text-sm font-bold ${e.color.split(' ')[0]}`}>
                              <Check className="w-3 h-3 mx-auto" />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Signal Details */}
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 text-xs">
                        <div className="text-center">
                          <div className="text-slate-500">Entry</div>
                          <div className="font-semibold text-white">
                            {heroIdea.entryPrice ? `$${heroIdea.entryPrice.toFixed(2)}` : '--'}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-slate-500">Target</div>
                          <div className="font-semibold text-emerald-400">
                            {heroIdea.targetPrice ? `$${heroIdea.targetPrice.toFixed(2)}` : '--'}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-slate-500">Stop</div>
                          <div className="font-semibold text-red-400">
                            {heroIdea.stopLoss ? `$${heroIdea.stopLoss.toFixed(2)}` : '--'}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-slate-500">R:R</div>
                          <div className="font-semibold text-cyan-400">
                            {heroIdea.riskRewardRatio ? `1:${heroIdea.riskRewardRatio.toFixed(1)}` : '--'}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-6 text-slate-500">
                      <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">AI engines analyzing markets...</p>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-center text-xs text-slate-500 mt-3">
                {heroIdea ? 'Live AI-generated trade idea' : 'Real-time AI analysis'}
              </p>
            </div>
          </div>
        </div>

        {/* Subtle gradient orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* Data Sources Strip - REAL */}
      <section className="relative py-8 border-y border-slate-800/50 bg-slate-900/20">
        <div className="container mx-auto px-6">
          <p className="text-center text-xs text-slate-500 mb-4 uppercase tracking-wider">Powered by real-time data from</p>
          <div className="flex items-center justify-center gap-8 md:gap-12 flex-wrap opacity-60">
            {['Tradier API', 'Yahoo Finance', 'Alpha Vantage', 'CoinGecko', 'Polygon.io'].map((name) => (
              <span key={name} className="text-sm font-medium text-slate-400">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section - Real Capabilities */}
      <section className="relative py-12">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              { value: '6', label: 'AI Analysis Engines', suffix: '' },
              { value: '5K', label: 'Stocks Scanned Daily', suffix: '+' },
              { value: '24/7', label: 'Real-Time Monitoring', suffix: '' },
              { value: '100', label: 'Data Sources Integrated', suffix: '+' },
            ].map((stat) => (
              <div key={stat.label} className="text-center p-4">
                <div className="text-3xl md:text-4xl font-bold text-white mb-1">
                  {stat.value}<span className="text-cyan-400">{stat.suffix}</span>
                </div>
                <p className="text-xs text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Six Engines Section */}
      <section className="relative py-12" id="features" data-testid="section-features">
        <div className="container mx-auto px-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2 text-white">Six AI Trading Engines Working Together</h2>
            <p className="text-sm text-slate-400">Comprehensive stock analysis from every angle—technical patterns, fundamentals, sentiment, and institutional flow.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {[
              { name: 'ML Engine', icon: Sparkles, color: 'pink', desc: 'AI stock predictions using machine learning to detect market regime shifts and momentum changes before they happen' },
              { name: 'AI Engine', icon: Brain, color: 'purple', desc: 'Multi-LLM analysis of SEC filings, earnings calls, and breaking news to surface trading catalysts' },
              { name: 'Quant Engine', icon: Calculator, color: 'blue', desc: 'Quantitative stock screener with RSI, VWAP, volume analysis and statistical edge detection for day traders' },
              { name: 'Flow Engine', icon: Activity, color: 'cyan', desc: 'Track institutional order flow, dark pool prints, and whale trades in real-time to follow smart money' },
              { name: 'Sentiment Engine', icon: Target, color: 'amber', desc: 'Social media sentiment analysis with Fear & Greed tracking to gauge market psychology and retail positioning' },
              { name: 'Technical Engine', icon: CandlestickChart, color: 'green', desc: 'AI-powered chart pattern recognition with automated support, resistance, and trend line detection' },
            ].map((engine) => {
              const Icon = engine.icon;
              const colorMap: Record<string, string> = {
                pink: 'border-pink-500/20 hover:border-pink-500/40',
                purple: 'border-purple-500/20 hover:border-purple-500/40',
                blue: 'border-blue-500/20 hover:border-blue-500/40',
                cyan: 'border-cyan-500/20 hover:border-cyan-500/40',
                amber: 'border-amber-500/20 hover:border-amber-500/40',
                green: 'border-green-500/20 hover:border-green-500/40',
              };
              const iconColorMap: Record<string, string> = {
                pink: 'text-pink-400',
                purple: 'text-purple-400',
                blue: 'text-blue-400',
                cyan: 'text-cyan-400',
                amber: 'text-amber-400',
                green: 'text-green-400',
              };
              return (
                <div
                  key={engine.name}
                  className={`p-5 rounded-xl bg-slate-900/50 border transition-colors ${colorMap[engine.color]}`}
                >
                  <Icon className={`h-6 w-6 mb-3 ${iconColorMap[engine.color]}`} />
                  <h3 className="font-semibold text-white mb-1">{engine.name}</h3>
                  <p className="text-sm text-slate-400">{engine.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Asset Classes */}
          <div className="mt-8 pt-6 border-t border-slate-800">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-4 text-center">Asset Classes</p>
            <div className="grid grid-cols-4 gap-2 max-w-2xl mx-auto">
              {[
                { name: 'Stocks', icon: TrendingUp, desc: 'US Equities' },
                { name: 'Options', icon: Activity, desc: 'Calls & Puts' },
                { name: 'Crypto', icon: Coins, desc: 'BTC, ETH, SOL' },
                { name: 'Futures', icon: BarChart3, desc: 'NQ, ES, GC' },
              ].map((asset) => {
                const Icon = asset.icon;
                return (
                  <div key={asset.name} className="text-center p-4 rounded-lg bg-slate-900/30 border border-slate-800">
                    <Icon className="h-5 w-5 mx-auto mb-2 text-slate-400" />
                    <p className="font-medium text-sm text-white">{asset.name}</p>
                    <p className="text-xs text-slate-500">{asset.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-10 bg-slate-900/30 border-y border-slate-800/50">
        <div className="container mx-auto px-6">
          <h2 className="text-xl font-bold text-white mb-6 text-center">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {[
              { step: '01', title: 'Connect & Scan', desc: 'Sign up free. Our 6 AI engines immediately start analyzing thousands of stocks, options, and crypto' },
              { step: '02', title: 'Get Trade Ideas', desc: 'Receive AI-generated setups when multiple engines converge—with entry, targets, and risk levels' },
              { step: '03', title: 'Execute or Paper Trade', desc: 'Act on high-conviction ideas or practice risk-free with our built-in paper trading simulator' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="text-3xl font-bold text-cyan-500/20 mb-1">{item.step}</div>
                <h3 className="font-semibold text-white text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section - Prominent */}
      <section className="py-16 bg-gradient-to-b from-slate-900/50 to-slate-950 relative z-10" id="pricing" data-testid="section-pricing">
        <div className="container mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-10">
            <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 mb-4 text-sm px-4 py-1">
              <Sparkles className="w-3.5 h-3.5 mr-1.5 inline" />
              Limited Beta Access
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
              Start Free. <span className="text-cyan-400">No Credit Card.</span>
            </h2>
            <p className="text-slate-400 max-w-lg mx-auto">
              Get full access to all 6 AI engines and professional tools while we're in beta. Upgrade later when Pro launches.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Free Beta - Featured */}
            <div className="relative rounded-2xl border-2 border-cyan-500 bg-gradient-to-b from-cyan-500/10 via-slate-900/50 to-slate-900/80 p-6 md:p-8">
              {/* Most Popular Badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-cyan-500 text-slate-950 font-semibold px-4 py-1 shadow-lg shadow-cyan-500/30">
                  MOST POPULAR
                </Badge>
              </div>

              <div className="mt-4 mb-6">
                <h3 className="text-lg font-semibold text-white mb-1">Beta Access</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-bold text-white">$0</span>
                  <span className="text-slate-400">/forever during beta</span>
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {[
                  'All 6 AI research engines',
                  'Real-time market analysis',
                  'Advanced charting tools',
                  'Stock screener & discovery',
                  'Paper trading simulator',
                  'Market news & sentiment',
                  'Discord community access',
                  'Unlimited stock research',
                ].map(f => (
                  <li key={f} className="flex items-center gap-3 text-sm text-slate-200">
                    <div className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-cyan-400" />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold h-12 text-base"
                onClick={() => setWaitlistOpen(true)}
              >
                Join Beta Waitlist
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              <p className="text-center text-xs text-slate-500 mt-3">
                No credit card required • Cancel anytime
              </p>
            </div>

            {/* Pro Coming Soon */}
            <div className="rounded-2xl border border-slate-700/50 bg-slate-900/30 p-6 md:p-8 relative overflow-hidden">
              {/* Coming Soon Overlay */}
              <div className="absolute top-4 right-4">
                <Badge variant="outline" className="border-purple-500/50 text-purple-400 bg-purple-500/10">
                  Coming Q2 2025
                </Badge>
              </div>

              <div className="mt-4 mb-6">
                <h3 className="text-lg font-semibold text-white mb-1">Pro</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold text-slate-400">$29</span>
                  <span className="text-slate-500">/month</span>
                </div>
              </div>

              <p className="text-sm text-slate-400 mb-4">Everything in Beta, plus:</p>

              <ul className="space-y-3 mb-8">
                {[
                  'Priority real-time alerts',
                  'Auto-Lotto options bot',
                  'API access for automation',
                  'Advanced screener filters',
                  'Backtesting & analytics',
                  'Priority support',
                ].map(f => (
                  <li key={f} className="flex items-center gap-3 text-sm text-slate-400">
                    <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-slate-500" />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>

              <Button
                variant="outline"
                size="lg"
                className="w-full border-slate-600 text-slate-300 hover:bg-slate-800 h-12"
                onClick={() => setWaitlistOpen(true)}
              >
                Join Pro Waitlist
              </Button>

              <p className="text-center text-xs text-slate-600 mt-3">
                Be first to know when Pro launches
              </p>
            </div>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap items-center justify-center gap-6 mt-10 text-sm text-slate-500">
            <span className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-500" />
              Secure & encrypted
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-cyan-500" />
              No credit card needed
            </span>
            <span className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-500" />
              2,500+ traders joined
            </span>
          </div>
        </div>
      </section>

      {/* Platform Features Section */}
      <section className="py-8 relative z-10 bg-slate-950" data-testid="section-features-highlight">
        <div className="container mx-auto px-6">
          <div className="text-center mb-6">
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 mb-3">Platform Highlights</Badge>
            <h2 className="text-2xl font-bold text-white mb-2">Built for Serious Traders</h2>
            <p className="text-sm text-slate-400">Real data. Real analysis. No fluff.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {[
              {
                title: "Multi-Engine Analysis",
                description: "6 independent AI engines analyze every trade from different angles - technical, fundamental, flow, sentiment, and more.",
                icon: Brain,
              },
              {
                title: "Real-Time Data",
                description: "Live market data from Tradier, Yahoo Finance, and Polygon. Options flow, earnings calendars, and news - all in one place.",
                icon: Zap,
              },
              {
                title: "Risk Management",
                description: "Every trade idea includes entry, target, stop-loss, and risk/reward ratio. Paper trading to test strategies risk-free.",
                icon: Shield,
              },
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div key={idx} className="p-5 rounded-xl bg-slate-900/50 border border-slate-800/50 hover:border-cyan-500/30 transition-colors">
                  <Icon className="w-8 h-8 text-cyan-400 mb-3" />
                  <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-6 bg-slate-900/30 border-y border-slate-800/50 relative z-10" data-testid="section-faq">
        <div className="container mx-auto px-6">
          <h2 className="text-xl font-bold text-center text-white mb-6">FAQ</h2>
          <div className="max-w-2xl mx-auto">
            <Accordion type="single" collapsible className="space-y-2">
              {faqData.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id} className="border border-slate-800 rounded-lg px-4">
                  <AccordionTrigger className="text-left font-medium hover:no-underline py-3 text-sm text-white">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-slate-400 pb-3 text-sm">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="pt-8 pb-6 border-t border-slate-800 bg-slate-950 relative z-10">
        <div className="container mx-auto px-6">
          {/* Footer Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <img src={quantEdgeLabsLogoUrl} alt="Quant Edge Labs" className="h-8 w-8" />
                <span className="font-bold text-white">QuantEdge</span>
              </div>
              <p className="text-xs text-slate-500 mb-4">AI-powered trading intelligence. Six engines, one edge.</p>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-indigo-500/20"
                  onClick={() => window.open(DISCORD_INVITE_URL, '_blank')}
                >
                  <SiDiscord className="h-4 w-4 text-slate-400 hover:text-indigo-400" />
                </Button>
              </div>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Product</h4>
              <ul className="space-y-2">
                <li><Link href="/features" className="text-xs text-slate-500 hover:text-white transition-colors">Features</Link></li>
                <li><Link href="/trade-desk" className="text-xs text-slate-500 hover:text-white transition-colors">Trade Desk</Link></li>
                <li><Link href="/chart-analysis" className="text-xs text-slate-500 hover:text-white transition-colors">Chart Analysis</Link></li>
                <li><button onClick={() => scrollToSection('pricing')} className="text-xs text-slate-500 hover:text-white transition-colors">Pricing</button></li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Resources</h4>
              <ul className="space-y-2">
                <li><Link href="/academy" className="text-xs text-slate-500 hover:text-white transition-colors">Academy</Link></li>
                <li><Link href="/blog" className="text-xs text-slate-500 hover:text-white transition-colors">Blog</Link></li>
                <li><Link href="/success-stories" className="text-xs text-slate-500 hover:text-white transition-colors">Success Stories</Link></li>
                <li><Link href="/technical-guide" className="text-xs text-slate-500 hover:text-white transition-colors">Technical Guide</Link></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Legal</h4>
              <ul className="space-y-2">
                <li><Link href="/terms" className="text-xs text-slate-500 hover:text-white transition-colors">Terms of Service</Link></li>
                <li><Link href="/privacy" className="text-xs text-slate-500 hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="text-xs text-slate-500 hover:text-white transition-colors">Risk Disclosure</Link></li>
                <li><Link href="/about" className="text-xs text-slate-500 hover:text-white transition-colors">About Us</Link></li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-6 border-t border-slate-800/50 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-600">© {new Date().getFullYear()} Quant Edge Labs. All rights reserved.</p>
            <p className="text-[10px] text-slate-600 max-w-md text-center md:text-right">
              Trading involves substantial risk. Past performance is not indicative of future results. This is an educational research platform, not financial advice.
            </p>
          </div>
        </div>
      </footer>

      {/* Waitlist Popup */}
      <WaitlistPopup open={waitlistOpen} onOpenChange={setWaitlistOpen} />
    </div>
  );
}
