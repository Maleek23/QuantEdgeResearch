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
import { useAuth } from "@/hooks/useAuth";
import { SEOHead } from "@/components/seo-head";
import { 
  TrendingUp, 
  Brain, 
  Calculator, 
  Check,
  ArrowRight,
  Clock,
  LineChart,
  Twitter,
  Linkedin,
  Github,
  Activity,
  Target,
  Coins,
  CandlestickChart,
  Sparkles
} from "lucide-react";
import { useState } from "react";
import quantEdgeLogoUrl from "@assets/image (1)_1761160822785.png";
import { HeroProductPanel } from "@/components/hero-product-panel";
import { ShimmerButton } from "@/components/magicui/shimmer-button";

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
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const { isAuthenticated } = useAuth();

  const { data: perfStats, isLoading: statsLoading } = useQuery<PerformanceStatsResponse>({
    queryKey: ['/api/performance/stats'],
  });

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead pageKey="landing" />
      
      {/* Sticky Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-transparent backdrop-blur-sm" data-testid="navbar">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            <Link href="/" className="flex-shrink-0" data-testid="link-logo">
              <img src={quantEdgeLogoUrl} alt="QuantEdge" className="h-10 w-10 object-contain" />
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
                    className="bg-cyan-500 text-slate-950"
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
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            {/* Left: Copy */}
            <div>
              <div className="inline-flex items-center gap-2 glass-subtle rounded-full px-4 py-2 mb-6">
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                <span className="text-sm font-mono text-cyan-400">LIVE BETA</span>
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4" data-testid="text-hero-headline">
                Multiple Engines<span className="text-cyan-400">.</span>
                <br />
                One Edge<span className="text-cyan-400">.</span>
              </h1>
              
              <p className="text-lg text-muted-foreground max-w-xl mb-8" data-testid="text-hero-subheadline">
                Five-engine research platform. AI, Quant, Flow, Chart, and Futures signals converge for higher-conviction setups.
                Every signal verified. Every outcome tracked.
              </p>
              
              <div className="flex flex-wrap gap-4">
                <Button 
                  className="bg-cyan-500 text-slate-950 hover:bg-cyan-400 h-12 px-8 text-base font-semibold shadow-lg shadow-cyan-500/20"
                  onClick={() => setLocation('/signup')}
                  data-testid="button-join-beta"
                >
                  Join Beta <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button 
                  variant="outline" 
                  className="border-slate-700 h-12 px-8 text-base font-semibold"
                  onClick={() => scrollToSection('engine-matrix')}
                  data-testid="button-view-engines"
                >
                  View Engines
                </Button>
              </div>
            </div>
            
            {/* Right: Product Preview Panel */}
            <div className="hidden lg:block">
              <HeroProductPanel className="w-full" />
            </div>
          </div>
        </div>
      </section>

      {/* Stats Strip - Terminal Style */}
      <div className="border-y border-slate-800 bg-slate-950 py-6" data-testid="stats-strip">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="stat-glass rounded-lg p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Ideas</p>
              <div className="text-2xl font-bold font-mono tabular-nums text-foreground">
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  perfStats?.overall?.totalIdeas || '—'
                )}
              </div>
            </div>
            <div className="stat-glass rounded-lg p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Active</p>
              <div className="text-2xl font-bold font-mono tabular-nums text-cyan-400">
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : perfStats?.overall?.openIdeas ? (
                  perfStats.overall.openIdeas
                ) : (
                  '—'
                )}
              </div>
            </div>
            <div className="stat-glass rounded-lg p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Engines</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-foreground">5</p>
            </div>
            <div className="stat-glass rounded-lg p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Markets</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-foreground">4</p>
            </div>
          </div>
        </div>
      </div>

      {/* Engine Matrix - Core Signal Convergence */}
      <section className="py-10 lg:py-16" id="engine-matrix" data-testid="engine-matrix">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Core Signal Convergence
            </p>
            <h2 className="text-xl font-semibold">When Engines Agree</h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* AI Engine */}
            <div className="glass-card rounded-lg p-6 border-l-2 border-purple-500/50">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Brain className="h-5 w-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold">AI Engine</h3>
                  <p className="text-xs text-muted-foreground">Fundamental Analysis</p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Fundamental analysis
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> News catalysts
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Multi-LLM consensus
                </li>
              </ul>
            </div>
            
            {/* Quant Engine */}
            <div className="glass-card rounded-lg p-6 border-l-2 border-blue-500/50">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Calculator className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Quant Engine</h3>
                  <p className="text-xs text-muted-foreground">Technical Signals</p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> RSI(2) mean reversion
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> VWAP flow analysis
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Volume spike detection
                </li>
              </ul>
            </div>
            
            {/* Flow Scanner */}
            <div className="glass-card rounded-lg p-6 border-l-2 border-cyan-500/50">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Flow Scanner</h3>
                  <p className="text-xs text-muted-foreground">Institutional Activity</p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Institutional flow
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Unusual activity
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-cyan-400" /> Real-time scanning
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Capabilities - Visual Cards */}
      <section className="py-12 lg:py-20 bg-slate-900/30" id="features" data-testid="section-features">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium uppercase tracking-wider text-cyan-400 mb-2">
              Platform Capabilities
            </p>
            <h2 className="text-2xl lg:text-3xl font-bold mb-3">Five Engines. Complete Coverage.</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Every angle analyzed. Every signal tracked. Every outcome measured.
            </p>
          </div>
          
          {/* Research Engines - Visual Grid */}
          <div className="mb-12">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4 text-center">Research Engines</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 max-w-5xl mx-auto">
              {/* AI Engine */}
              <div className="group relative overflow-visible rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 p-5 hover-elevate">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                <div className="relative">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg shadow-purple-500/20">
                    <Brain className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-semibold mb-1">AI Engine</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">Multi-LLM consensus. News, earnings, SEC filings.</p>
                </div>
              </div>
              
              {/* Quant Engine */}
              <div className="group relative overflow-visible rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 p-5 hover-elevate">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                <div className="relative">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
                    <Calculator className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-semibold mb-1">Quant Engine</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">RSI(2), VWAP, volume spike detection.</p>
                </div>
              </div>
              
              {/* Flow Scanner */}
              <div className="group relative overflow-visible rounded-xl bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/20 p-5 hover-elevate">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                <div className="relative">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center mb-4 shadow-lg shadow-cyan-500/20">
                    <Activity className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-semibold mb-1">Flow Scanner</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">Institutional sweeps, blocks, dark pool prints.</p>
                </div>
              </div>
              
              {/* Chart Analysis */}
              <div className="group relative overflow-visible rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 p-5 hover-elevate">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                <div className="relative">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center mb-4 shadow-lg shadow-amber-500/20">
                    <Target className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-semibold mb-1">Chart Analysis</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">AI pattern recognition from screenshots.</p>
                </div>
              </div>
              
              {/* Futures Engine */}
              <div className="group relative overflow-visible rounded-xl bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 p-5 hover-elevate">
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                <div className="relative">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center mb-4 shadow-lg shadow-green-500/20">
                    <CandlestickChart className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-semibold mb-1">Futures Engine</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">NQ & GC with CME specs, tick targets.</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Tools & Analytics - Horizontal Cards */}
          <div className="mb-10">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4 text-center">Tools & Analytics</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
              {/* Auto-Lotto Bot */}
              <div className="glass-card rounded-xl p-5 border-l-2 border-pink-500/50">
                <div className="flex items-center gap-3 mb-2">
                  <Sparkles className="h-5 w-5 text-pink-400" />
                  <h3 className="font-semibold text-sm">Auto-Lotto Bot</h3>
                </div>
                <p className="text-xs text-muted-foreground">Autonomous paper trading. Scans for high R:R setups automatically.</p>
              </div>
              
              {/* Performance Analytics */}
              <div className="glass-card rounded-xl p-5 border-l-2 border-cyan-500/50">
                <div className="flex items-center gap-3 mb-2">
                  <LineChart className="h-5 w-5 text-cyan-400" />
                  <h3 className="font-semibold text-sm">Performance</h3>
                </div>
                <p className="text-xs text-muted-foreground">Win rates, symbol leaderboards, confidence calibration.</p>
              </div>
              
              {/* Loss Analysis */}
              <div className="glass-card rounded-xl p-5 border-l-2 border-red-500/50">
                <div className="flex items-center gap-3 mb-2">
                  <Target className="h-5 w-5 text-red-400" />
                  <h3 className="font-semibold text-sm">Loss Analysis</h3>
                </div>
                <p className="text-xs text-muted-foreground">Automatic post-mortem. Patterns, lessons, prevention.</p>
              </div>
              
              {/* Paper Trading */}
              <div className="glass-card rounded-xl p-5 border-l-2 border-green-500/50">
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="h-5 w-5 text-green-400" />
                  <h3 className="font-semibold text-sm">Paper Trading</h3>
                </div>
                <p className="text-xs text-muted-foreground">Virtual portfolios. Track P&L, learn without risk.</p>
              </div>
            </div>
          </div>
          
          {/* Market Coverage - Pill badges */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700/50">
              <TrendingUp className="h-4 w-4 text-cyan-400" />
              <span className="text-sm">Stocks</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700/50">
              <LineChart className="h-4 w-4 text-purple-400" />
              <span className="text-sm">Options</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700/50">
              <Coins className="h-4 w-4 text-amber-400" />
              <span className="text-sm">Crypto</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700/50">
              <CandlestickChart className="h-4 w-4 text-green-400" />
              <span className="text-sm">Futures (NQ, GC)</span>
            </div>
          </div>
          
          {/* See All Features CTA */}
          <div className="text-center">
            <Button 
              variant="outline" 
              className="border-slate-700"
              onClick={() => setLocation('/features')}
              data-testid="button-see-features"
            >
              See All Features <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-10 lg:py-16" id="pricing" data-testid="section-pricing">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Pricing Plans
            </p>
            <h2 className="text-xl font-semibold mb-4">Choose Your Plan</h2>
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
                    <span className="text-3xl font-bold font-mono tabular-nums">$0</span>
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
                    <span className="text-3xl font-bold font-mono tabular-nums text-cyan-400">
                      ${billingPeriod === 'monthly' ? '39' : '33'}
                    </span>
                    <span className="text-muted-foreground text-sm">/month</span>
                  </div>
                  {billingPeriod === 'yearly' && (
                    <p className="text-xs text-cyan-400 font-mono tabular-nums">Billed $390/year (save $78)</p>
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
                  className="w-full bg-cyan-500 text-slate-950"
                  onClick={() => setLocation('/signup')}
                  data-testid="button-pricing-advanced"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Get Advanced
                </Button>
              </CardContent>
            </Card>

            {/* Pro Tier */}
            <Card className="glass-card border-slate-700" data-testid="card-pricing-pro">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge variant="outline" className="border-slate-600 text-muted-foreground bg-slate-900">
                  <Clock className="h-3 w-3 mr-1" />
                  Coming Soon
                </Badge>
              </div>
              <CardContent className="p-6 pt-8 flex flex-col h-full">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-2">Pro</h3>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-3xl font-bold font-mono tabular-nums text-muted-foreground">$79</span>
                    <span className="text-muted-foreground text-sm">/month</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Institutional-grade tools</p>
                </div>
                
                <ul className="space-y-3 mb-6 flex-1">
                  <li className="flex items-center gap-2 text-sm font-medium">
                    <Check className="h-4 w-4 text-cyan-400 flex-shrink-0" />
                    Everything in Advanced
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    Futures trading
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    REST API access
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    Backtesting module
                  </li>
                </ul>
                
                <Button 
                  variant="outline"
                  className="w-full border-slate-700"
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
      <section className="py-10 lg:py-16 border-t border-slate-800" id="faq" data-testid="section-faq">
        <div className="container mx-auto px-6">
          <div className="text-center mb-8">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              FAQ
            </p>
            <h2 className="text-xl font-semibold">Frequently Asked Questions</h2>
          </div>

          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="space-y-2">
              <AccordionItem value="accuracy" className="border border-slate-800 rounded-lg px-4" data-testid="accordion-faq-accuracy">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-3 text-sm" data-testid="trigger-faq-accuracy">
                  How accurate are the research briefs?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-3 text-sm" data-testid="content-faq-accuracy">
                  All research briefs are tracked transparently with actual outcomes visible on the Performance page. 
                  Past patterns do not guarantee future results. This is educational research only.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="markets" className="border border-slate-800 rounded-lg px-4" data-testid="accordion-faq-markets">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-3 text-sm" data-testid="trigger-faq-markets">
                  What markets does QuantEdge cover?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-3 text-sm" data-testid="content-faq-markets">
                  US equities, options, cryptocurrencies, and futures contracts. Data sourced from Yahoo Finance, Alpha Vantage, Tradier, and CoinGecko.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="five-engine" className="border border-slate-800 rounded-lg px-4" data-testid="accordion-faq-engine">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-3 text-sm" data-testid="trigger-faq-engine">
                  How does the five-engine system work?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-3 text-sm" data-testid="content-faq-engine">
                  AI Engine uses multi-provider LLMs for fundamental analysis. Quant Engine runs RSI, VWAP, and volume strategies. 
                  Flow Scanner detects institutional activity. Chart Analysis provides technical pattern recognition. 
                  Futures Engine specializes in NQ and GC contracts. When multiple engines agree, you get higher-conviction setups.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="premium" className="border border-slate-800 rounded-lg px-4" data-testid="accordion-faq-premium">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-3 text-sm" data-testid="trigger-faq-premium">
                  What's included in each plan?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-3 text-sm" data-testid="content-faq-premium">
                  <strong>Free:</strong> 5 briefs/day, delayed data. <strong>Advanced ($39/mo):</strong> Unlimited briefs, real-time data, chart analysis, Discord alerts, full history.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="risk" className="border border-slate-800 rounded-lg px-4" data-testid="accordion-faq-risk">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-3 text-sm" data-testid="trigger-faq-risk">
                  How do you handle risk management?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-3 text-sm" data-testid="content-faq-risk">
                  Research briefs display calculated risk/reward ratios and suggested exit levels for educational context. 
                  We provide paper trading tools so users can learn risk management concepts without capital at risk.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="paper" className="border border-slate-800 rounded-lg px-4" data-testid="accordion-faq-paper">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-3 text-sm" data-testid="trigger-faq-paper">
                  What is paper trading?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-3 text-sm" data-testid="content-faq-paper">
                  Paper trading is simulated trading with fake money. It lets you test strategies without real capital. 
                  QuantEdge includes a built-in paper trading journal to track your hypothetical trades.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="data" className="border border-slate-800 rounded-lg px-4" data-testid="accordion-faq-data">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-3 text-sm" data-testid="trigger-faq-data">
                  Where does the market data come from?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-3 text-sm" data-testid="content-faq-data">
                  Real-time quotes from Tradier (stocks/options), CoinGecko (crypto), Yahoo Finance (equities), and Alpha Vantage (news/earnings). 
                  All data is refreshed every few seconds during market hours.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="advice" className="border border-slate-800 rounded-lg px-4" data-testid="accordion-faq-advice">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-3 text-sm" data-testid="trigger-faq-advice">
                  Is QuantEdge financial advice?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-3 text-sm" data-testid="content-faq-advice">
                  No. QuantEdge is an educational research platform. We provide analysis tools and pattern recognition—not recommendations. 
                  You make all trading decisions yourself. Trading involves substantial risk of loss.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-10 lg:py-12" data-testid="section-cta">
        <div className="container mx-auto px-6">
          <div className="glass-card rounded-lg p-8 text-center max-w-3xl mx-auto">
            <h2 className="text-lg font-semibold mb-3">
              Ready to Trade with Precision?
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-6">
              Research platform for self-directed traders. Paper trade first, risk second.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <ShimmerButton 
                shimmerColor="#22d3ee"
                shimmerSize="0.1em"
                background="linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)"
                borderRadius="8px"
                onClick={() => setLocation('/signup')} 
                data-testid="button-cta-signup"
                className="font-medium"
              >
                Get Started Free <ArrowRight className="h-4 w-4 ml-2" />
              </ShimmerButton>
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

      {/* Footer - Compact */}
      <footer className="py-6 border-t border-slate-800" data-testid="footer">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <img src={quantEdgeLogoUrl} alt="QuantEdge" className="h-6 w-6 object-contain" />
              <span className="font-semibold text-sm">QuantEdge</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">Research tools for self-directed traders</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <Link href="/trade-desk" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-link-dashboard">Dashboard</Link>
              <Link href="/academy" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-link-academy">Academy</Link>
              <button onClick={() => scrollToSection('pricing')} className="text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-link-pricing">Pricing</button>
              <Link href="/terms-of-service" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-link-terms">Terms</Link>
              <Link href="/privacy-policy" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-link-privacy">Privacy</Link>
            </div>
          </div>

          <div className="bg-red-500/10 border border-red-500/20 rounded px-3 py-2 text-center mb-4">
            <p className="text-xs text-red-400">
              <strong>NOT FINANCIAL ADVICE</strong> — Educational research only. Trading involves substantial risk.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-muted-foreground">
            <p>© {new Date().getFullYear()} QuantEdge Research</p>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" className="h-6 w-6" data-testid="link-social-twitter">
                <Twitter className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" data-testid="link-social-linkedin">
                <Linkedin className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" data-testid="link-social-github">
                <Github className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
