import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { TradeIdea } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { SEOHead } from "@/components/seo-head";
import { 
  TrendingUp, 
  Brain, 
  Calculator, 
  Bell, 
  BarChart3, 
  Shield,
  Check,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  LineChart,
  Twitter,
  Linkedin,
  Github,
  Activity,
  Sparkles,
  Zap
} from "lucide-react";
import { useState, useEffect } from "react";
import quantEdgeLogoUrl from "@assets/image (1)_1761160822785.png";

interface AssetTypeStats {
  assetType: string;
  totalIdeas: number;
  wonIdeas: number;
  lostIdeas: number;
  winRate: number;
  avgPercentGain: number;
}

interface PerformanceStatsResponse {
  overall: {
    totalIdeas: number;
    openIdeas: number;
    winRate: number;
    avgPercentGain: number;
  };
  byAssetType?: AssetTypeStats[];
}

export default function Landing() {
  const [, setLocation] = useLocation();
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const { isAuthenticated } = useAuth();

  const { data: perfStats, isLoading: statsLoading } = useQuery<PerformanceStatsResponse>({
    queryKey: ['/api/performance/stats'],
  });

  const { data: allIdeas, isLoading: ideasLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
  });

  const recentTrades = (allIdeas || [])
    .filter(idea => idea.outcomeStatus && ['hit_target', 'hit_stop', 'expired'].includes(idea.outcomeStatus))
    .sort((a, b) => {
      const dateA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const dateB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 5);

  useEffect(() => {
    if (carouselIndex >= recentTrades.length) {
      setCarouselIndex(0);
    }
  }, [recentTrades.length, carouselIndex]);

  const activeTrade = recentTrades.length > 0 && carouselIndex < recentTrades.length
    ? recentTrades[carouselIndex]
    : null;

  const nextTrade = () => {
    if (recentTrades.length === 0) return;
    setCarouselIndex((prev) => (prev + 1) % recentTrades.length);
  };

  const prevTrade = () => {
    if (recentTrades.length === 0) return;
    setCarouselIndex((prev) => (prev - 1 + recentTrades.length) % recentTrades.length);
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead pageKey="landing" />
      
      {/* Sticky Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-slate-800" data-testid="navbar">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            <Link href="/" className="flex-shrink-0" data-testid="link-logo">
              <img src={quantEdgeLogoUrl} alt="QuantEdge" className="h-10 w-10 object-contain" />
            </Link>

            <nav className="hidden md:flex items-center gap-6">
              <button 
                onClick={() => scrollToSection('engine-matrix')} 
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-features"
              >
                Features
              </button>
              <button 
                onClick={() => scrollToSection('recent-performance')} 
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-performance"
              >
                Performance
              </button>
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
            </nav>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              {isAuthenticated ? (
                <Button onClick={() => setLocation('/home')} data-testid="button-dashboard">
                  Dashboard
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
                    onClick={() => setLocation('/signup')}
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                    data-testid="button-signup"
                  >
                    Sign Up
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section - Clean & Technical */}
      <section className="relative min-h-[70vh] flex items-center pt-16" data-testid="hero-section">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="inline-flex items-center gap-2 glass-subtle rounded-full px-4 py-2 mb-6">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
            <span className="text-sm font-mono text-cyan-400">LIVE</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4" data-testid="text-hero-headline">
            Multiple Engines<span className="text-cyan-400">.</span>
            <br />
            One Edge<span className="text-cyan-400">.</span>
          </h1>
          
          <p className="text-lg text-muted-foreground max-w-xl mb-8" data-testid="text-hero-subheadline">
            Dual-engine research platform. AI analysis meets quantitative validation.
            Every signal verified. Every outcome tracked.
          </p>
          
          <div className="flex flex-wrap gap-4">
            <Button 
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950"
              onClick={() => setLocation('/signup')}
              data-testid="button-start-research"
            >
              Start Research <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="border-slate-700"
              onClick={() => scrollToSection('recent-performance')}
              data-testid="button-view-performance"
            >
              View Performance
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Strip - Terminal Style */}
      <div className="border-y border-slate-800 bg-slate-900/50 py-6" data-testid="stats-strip">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Ideas</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-foreground">
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  perfStats?.overall?.totalIdeas || '—'
                )}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Win Rate</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-green-400">
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : perfStats?.overall?.winRate ? (
                  `${perfStats.overall.winRate.toFixed(0)}%`
                ) : (
                  '—'
                )}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Engines</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-foreground">3</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Markets</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-foreground">4</p>
            </div>
          </div>
        </div>
      </div>

      {/* Engine Matrix - Clean Two-Column */}
      <section className="py-16 lg:py-24" id="engine-matrix" data-testid="engine-matrix">
        <div className="container mx-auto px-6">
          <h2 className="text-2xl font-semibold mb-12 text-center">The Dual-Engine Approach</h2>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* AI Engine */}
            <div className="glass-card rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Brain className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold">AI Engine</h3>
                  <p className="text-xs text-muted-foreground">Claude, GPT-4, Gemini</p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Fundamental analysis
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> News catalyst detection
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Context-aware research
                </li>
              </ul>
            </div>
            
            {/* Quant Engine */}
            <div className="glass-card rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Calculator className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Quant Engine</h3>
                  <p className="text-xs text-muted-foreground">RSI, VWAP, Volume</p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Technical validation
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Statistical signals
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Risk parameters
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Section - Minimalist */}
      <section className="py-12 border-y border-slate-800" data-testid="trust-section">
        <div className="container mx-auto px-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground text-center mb-6">
            Data Sources
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            {['Yahoo Finance', 'Tradier', 'CoinGecko', 'Alpha Vantage'].map(source => (
              <span key={source} className="text-sm text-muted-foreground">{source}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Engine Outcomes Matrix - Two Column */}
      <section className="py-16 lg:py-24" id="features" data-testid="section-features">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              What You Get
            </p>
            <h2 className="text-2xl font-semibold">Engine → Outcome</h2>
          </div>
          
          <div className="max-w-3xl mx-auto">
            {/* Table Header */}
            <div className="grid grid-cols-2 gap-4 mb-4 px-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Engine Capability</p>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Trader Outcome</p>
            </div>
            
            {/* Row 1 */}
            <div className="glass-card rounded-lg p-4 mb-3" data-testid="row-outcome-0">
              <div className="grid grid-cols-2 gap-4 items-center">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                    <Brain className="h-4 w-4 text-purple-400" />
                  </div>
                  <span className="text-sm">AI fundamental analysis</span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Skip hours of manual research</span>
                </div>
              </div>
            </div>
            
            {/* Row 2 */}
            <div className="glass-card rounded-lg p-4 mb-3" data-testid="row-outcome-1">
              <div className="grid grid-cols-2 gap-4 items-center">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <Calculator className="h-4 w-4 text-blue-400" />
                  </div>
                  <span className="text-sm">Quantitative validation</span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Remove emotional decisions</span>
                </div>
              </div>
            </div>
            
            {/* Row 3 */}
            <div className="glass-card rounded-lg p-4 mb-3" data-testid="row-outcome-2">
              <div className="grid grid-cols-2 gap-4 items-center">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                    <Zap className="h-4 w-4 text-cyan-400" />
                  </div>
                  <span className="text-sm">Dual-engine consensus</span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Higher-conviction setups</span>
                </div>
              </div>
            </div>
            
            {/* Row 4 */}
            <div className="glass-card rounded-lg p-4 mb-3" data-testid="row-outcome-3">
              <div className="grid grid-cols-2 gap-4 items-center">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <Shield className="h-4 w-4 text-green-400" />
                  </div>
                  <span className="text-sm">Built-in risk parameters</span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Proper position sizing</span>
                </div>
              </div>
            </div>
            
            {/* Row 5 */}
            <div className="glass-card rounded-lg p-4" data-testid="row-outcome-4">
              <div className="grid grid-cols-2 gap-4 items-center">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="h-4 w-4 text-amber-400" />
                  </div>
                  <span className="text-sm">Auditable performance</span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Full transparency, no hidden losses</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Performance */}
      <section className="py-16 lg:py-24 bg-slate-900/30" id="recent-performance" data-testid="section-performance">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Transparent Tracking
            </p>
            <h2 className="text-2xl font-semibold mb-4">Recent Performance</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              All research briefs are tracked for transparency. Results include both successful and unsuccessful patterns.
            </p>
          </div>

          {ideasLoading ? (
            <div className="max-w-4xl mx-auto">
              <Skeleton className="h-64 w-full rounded-lg" data-testid="skeleton-recent-trades" />
            </div>
          ) : activeTrade ? (
            <div className="max-w-4xl mx-auto relative">
              <div className="flex items-center justify-between gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={prevTrade}
                  disabled={recentTrades.length <= 1}
                  className="border-slate-700"
                  data-testid="button-carousel-prev"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>

                <Card className="flex-1 glass-card" data-testid={`card-recent-trade-${carouselIndex}`}>
                  <CardContent className="p-8">
                    <div className="flex items-start justify-between gap-4 mb-6">
                      <div className="flex items-center gap-3">
                        <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${
                          activeTrade.outcomeStatus === 'hit_target' 
                            ? 'bg-green-500/10' 
                            : 'bg-red-500/10'
                        }`}>
                          <TrendingUp className={`h-6 w-6 ${
                            activeTrade.outcomeStatus === 'hit_target' 
                              ? 'text-green-400' 
                              : 'text-red-400'
                          }`} />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold font-mono" data-testid="text-trade-symbol">
                            {activeTrade.symbol}
                          </h3>
                          <Badge 
                            variant={activeTrade.direction === 'long' ? 'default' : 'secondary'}
                            className="text-xs"
                            data-testid="badge-trade-direction"
                          >
                            {activeTrade.direction.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                      <Badge 
                        className={activeTrade.outcomeStatus === 'hit_target' 
                          ? 'bg-green-500/10 text-green-400 border-green-500/30' 
                          : 'bg-red-500/10 text-red-400 border-red-500/30'}
                        data-testid="badge-trade-outcome"
                      >
                        {activeTrade.outcomeStatus === 'hit_target' ? 'Win' : 'Loss'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-6">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Entry</p>
                        <p className="text-lg font-bold font-mono tabular-nums" data-testid="text-trade-entry">
                          ${activeTrade.entryPrice?.toFixed(2) || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Exit</p>
                        <p className="text-lg font-bold font-mono tabular-nums" data-testid="text-trade-exit">
                          ${activeTrade.exitPrice?.toFixed(2) || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Result</p>
                        <p className={`text-lg font-bold font-mono tabular-nums ${
                          (activeTrade.percentGain || 0) >= 0 
                            ? 'text-green-400' 
                            : 'text-red-400'
                        }`} data-testid="text-trade-result">
                          {(activeTrade.percentGain || 0) >= 0 ? '+' : ''}{activeTrade.percentGain?.toFixed(1) || '0.0'}%
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={nextTrade}
                  disabled={recentTrades.length <= 1}
                  className="border-slate-700"
                  data-testid="button-carousel-next"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              {recentTrades.length > 1 && (
                <div className="flex justify-center gap-2 mt-6">
                  {recentTrades.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCarouselIndex(idx)}
                      className={`h-2 rounded-full transition-all ${
                        idx === carouselIndex ? 'w-8 bg-cyan-500' : 'w-2 bg-slate-700'
                      }`}
                      data-testid={`button-carousel-indicator-${idx}`}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              <Card className="glass-card">
                <CardContent className="p-12 text-center">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">Pattern Tracking</h3>
                  <p className="text-muted-foreground mb-6">
                    All research briefs are tracked for transparency. View historical outcomes—both wins and losses.
                  </p>
                  <Button 
                    onClick={() => setLocation('/trade-desk')} 
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                    data-testid="button-view-trades-cta"
                  >
                    View Research <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-16 lg:py-24" id="pricing" data-testid="section-pricing">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Pricing Plans
            </p>
            <h2 className="text-2xl font-semibold mb-4">Choose Your Plan</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
              Start free and upgrade as you grow
            </p>
            
            <div className="flex items-center justify-center gap-4" data-testid="billing-toggle">
              <span className={`text-sm ${billingPeriod === 'monthly' ? 'text-foreground' : 'text-muted-foreground'}`}>
                Monthly
              </span>
              <button
                onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
                className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors border ${
                  billingPeriod === 'yearly' ? 'bg-cyan-500 border-cyan-400' : 'bg-slate-800 border-slate-700'
                }`}
                data-testid="button-billing-toggle"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    billingPeriod === 'yearly' ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
              <div className="flex items-center gap-2">
                <span className={`text-sm ${billingPeriod === 'yearly' ? 'text-foreground' : 'text-muted-foreground'}`}>
                  Yearly
                </span>
                <Badge className="text-xs bg-green-500/10 text-green-400 border-green-500/30">
                  Save 17%
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Free Tier */}
            <Card className="glass-card" data-testid="card-pricing-free">
              <CardContent className="p-6 flex flex-col h-full">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-2">Free</h3>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-3xl font-bold font-mono">$0</span>
                    <span className="text-muted-foreground text-sm">/month</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Preview the platform</p>
                </div>
                
                <ul className="space-y-3 mb-6 flex-1">
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                    5 research briefs per day
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                    Delayed market data (15min)
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                    7-day performance history
                  </li>
                </ul>
                
                <Button 
                  variant="outline" 
                  className="w-full border-slate-700"
                  onClick={() => setLocation('/signup')}
                  data-testid="button-pricing-free"
                >
                  Get Started Free
                </Button>
              </CardContent>
            </Card>

            {/* Advanced Tier */}
            <Card className="glass-card border-cyan-500/50" data-testid="card-pricing-advanced">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-cyan-500 text-slate-950">Most Popular</Badge>
              </div>
              <CardContent className="p-6 pt-8 flex flex-col h-full">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-2">Advanced</h3>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-3xl font-bold font-mono text-cyan-400">
                      ${billingPeriod === 'monthly' ? '39' : '33'}
                    </span>
                    <span className="text-muted-foreground text-sm">/month</span>
                  </div>
                  {billingPeriod === 'yearly' && (
                    <p className="text-xs text-green-400">Billed $390/year (save $78)</p>
                  )}
                  <p className="text-xs text-muted-foreground">Full stock & crypto access</p>
                </div>
                
                <ul className="space-y-3 mb-6 flex-1">
                  <li className="flex items-center gap-2 text-sm font-medium">
                    <Check className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                    Everything in Free
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                    Unlimited research briefs
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                    Real-time market data
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                    Discord alerts
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                    Full performance history
                  </li>
                </ul>
                
                <Button 
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                  onClick={() => setLocation('/signup')}
                  data-testid="button-pricing-advanced"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Get Advanced
                </Button>
              </CardContent>
            </Card>

            {/* Pro Tier */}
            <Card className="glass-card border-amber-500/30" data-testid="card-pricing-pro">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">
                  <Clock className="h-3 w-3 mr-1" />
                  Coming Soon
                </Badge>
              </div>
              <CardContent className="p-6 pt-8 flex flex-col h-full">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-2">Pro</h3>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-3xl font-bold font-mono text-amber-400">$79</span>
                    <span className="text-muted-foreground text-sm">/month</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Institutional-grade tools</p>
                </div>
                
                <ul className="space-y-3 mb-6 flex-1">
                  <li className="flex items-center gap-2 text-sm font-medium">
                    <Check className="h-4 w-4 text-amber-400 flex-shrink-0" />
                    Everything in Advanced
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 text-amber-500/60 flex-shrink-0" />
                    Futures trading
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 text-amber-500/60 flex-shrink-0" />
                    REST API access
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 text-amber-500/60 flex-shrink-0" />
                    Backtesting module
                  </li>
                </ul>
                
                <Button 
                  variant="outline"
                  className="w-full border-amber-500/30 text-amber-400"
                  data-testid="button-pricing-pro"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Join Waitlist
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 lg:py-24 border-t border-slate-800" id="faq" data-testid="section-faq">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              FAQ
            </p>
            <h2 className="text-2xl font-semibold mb-4">Frequently Asked Questions</h2>
          </div>

          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-3">
              <AccordionItem value="accuracy" className="border border-slate-800 rounded-lg px-6" data-testid="accordion-faq-accuracy">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4" data-testid="trigger-faq-accuracy">
                  How accurate are the research briefs?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4" data-testid="content-faq-accuracy">
                  All research briefs are tracked transparently with actual outcomes visible on the Performance page. 
                  Past patterns do not guarantee future results. This is educational research only—you make your own trading decisions.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="markets" className="border border-slate-800 rounded-lg px-6" data-testid="accordion-faq-markets">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4" data-testid="trigger-faq-markets">
                  What markets does QuantEdge cover?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4" data-testid="content-faq-markets">
                  QuantEdge analyzes US equities, options, cryptocurrencies, and futures contracts. 
                  Real-time data is sourced from Yahoo Finance, Alpha Vantage, Tradier, and CoinGecko.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="dual-engine" className="border border-slate-800 rounded-lg px-6" data-testid="accordion-faq-dual-engine">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4" data-testid="trigger-faq-dual-engine">
                  How does the dual-engine system work?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4" data-testid="content-faq-dual-engine">
                  Our AI Engine uses multi-provider LLMs for contextual insights. The Quantitative Engine runs research-backed technical strategies. 
                  When both engines agree on a trade, you get confluence from multiple analysis perspectives.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="premium" className="border border-slate-800 rounded-lg px-6" data-testid="accordion-faq-premium">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4" data-testid="trigger-faq-premium">
                  What's the difference between the plans?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-4" data-testid="content-faq-premium">
                  <strong>Free</strong> gives you 5 research briefs per day with delayed market data to preview the platform. 
                  <strong>Advanced</strong> ($39/mo) unlocks unlimited research briefs, real-time data, chart analysis, Discord alerts, and full performance history.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24" data-testid="section-cta">
        <div className="container mx-auto px-6">
          <div className="glass-card rounded-lg p-12 text-center max-w-4xl mx-auto">
            <h2 className="text-2xl font-semibold mb-4">
              Ready to Trade with Precision?
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
              Research platform for self-directed traders. Paper trade first, risk second.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button 
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-950"
                onClick={() => setLocation('/signup')} 
                data-testid="button-cta-signup"
              >
                Get Started Free <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <Button 
                variant="outline" 
                className="border-slate-700"
                onClick={() => setLocation('/chart-analysis')} 
                data-testid="button-cta-demo"
              >
                Try Chart Analysis
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-12" data-testid="footer">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <img src={quantEdgeLogoUrl} alt="QuantEdge" className="h-8 w-8 object-contain" />
                <span className="font-semibold">QuantEdge</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Research tools for self-directed traders. Education, not advice.
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="link-social-twitter">
                  <Twitter className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="link-social-linkedin">
                  <Linkedin className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="link-social-github">
                  <Github className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-sm">Product</h4>
              <ul className="space-y-2">
                <li>
                  <button 
                    onClick={() => scrollToSection('engine-matrix')} 
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="footer-link-features"
                  >
                    Features
                  </button>
                </li>
                <li>
                  <Link 
                    href="/trade-desk" 
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="footer-link-dashboard"
                  >
                    Dashboard
                  </Link>
                </li>
                <li>
                  <button 
                    onClick={() => scrollToSection('pricing')} 
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="footer-link-pricing"
                  >
                    Pricing
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-sm">Resources</h4>
              <ul className="space-y-2">
                <li>
                  <Link 
                    href="/academy" 
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="footer-link-academy"
                  >
                    Academy
                  </Link>
                </li>
                <li>
                  <Link 
                    href="/terms-of-service" 
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="footer-link-terms"
                  >
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link 
                    href="/privacy-policy" 
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="footer-link-privacy"
                  >
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-sm">Get Started</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Start analyzing charts with AI precision today.
              </p>
              <Button 
                onClick={() => setLocation('/signup')} 
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950" 
                data-testid="footer-button-signup"
              >
                Create Free Account
              </Button>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 mb-6">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
              <p className="text-sm font-medium text-red-400 mb-1">
                NOT FINANCIAL ADVICE
              </p>
              <p className="text-xs text-muted-foreground">
                QuantEdge is an educational research platform. Trading involves substantial risk of loss. 
                Past performance does not guarantee future results. You could lose your entire investment.
              </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} QuantEdge Research. All rights reserved.
            </p>
            <p className="text-xs text-muted-foreground">
              Research platform for self-directed traders. Education, not advice.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
