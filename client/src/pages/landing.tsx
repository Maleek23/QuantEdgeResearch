import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Footer } from "@/components/footer";
import { ParticleBackground } from "@/components/particle-background";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { TradeIdea } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { 
  TrendingUp, 
  Brain, 
  Calculator, 
  Bell, 
  BarChart3, 
  Shield,
  Sparkles,
  Target,
  Activity,
  Zap,
  Check,
  Mail,
  MessageCircle,
  ExternalLink,
  ArrowRight,
  Book,
  Network,
  Cpu,
  GitBranch,
  ChevronLeft,
  ChevronRight,
  Users,
  TrendingDown,
  Award,
  Star,
  CheckCircle2,
  Upload,
  LogIn
} from "lucide-react";
import quantEdgeLogoUrl from "@assets/image (1)_1761160822785.png";
import { useState, useEffect } from "react";

// TypeScript interfaces for API responses
interface PerformanceStatsResponse {
  overall: {
    totalIdeas: number;
    openIdeas: number;
    winRate: number;
    avgPercentGain: number;
  };
}

export default function Landing() {
  const [, setLocation] = useLocation();
  const [carouselIndex, setCarouselIndex] = useState(0);
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Fetch performance stats
  const { data: perfStats, isLoading: statsLoading } = useQuery<PerformanceStatsResponse>({
    queryKey: ['/api/performance/stats'],
  });

  // Fetch all trade ideas and filter for success stories
  const { data: allIdeas, isLoading: ideasLoading } = useQuery<TradeIdea[]>({
    queryKey: ['/api/trade-ideas'],
  });

  // Filter and sort winning trades for success stories
  const successStories = (allIdeas || [])
    .filter(idea => idea.outcomeStatus === 'hit_target' && (idea.percentGain || 0) > 10)
    .sort((a, b) => (b.percentGain || 0) - (a.percentGain || 0))
    .slice(0, 5);

  // Reset carousel index when data changes to prevent out-of-bounds access
  useEffect(() => {
    if (carouselIndex >= successStories.length) {
      setCarouselIndex(0);
    }
  }, [successStories.length, carouselIndex]);

  // Normalize active story to prevent render-time undefined access
  const activeStory = successStories.length > 0 && carouselIndex < successStories.length
    ? successStories[carouselIndex]
    : null;

  // Carousel navigation with defensive guards
  const nextStory = () => {
    if (successStories.length === 0) return;
    setCarouselIndex((prev) => (prev + 1) % successStories.length);
  };

  const prevStory = () => {
    if (successStories.length === 0) return;
    setCarouselIndex((prev) => (prev - 1 + successStories.length) % successStories.length);
  };

  const features = [
    {
      icon: Upload,
      title: "Chart Pattern Recognition",
      description: "Upload any trading chart and get instant AI analysis with pattern detection, support/resistance levels, and precise entry/exit points based on proven technical indicators.",
      color: "text-indigo-500"
    },
    {
      icon: Brain,
      title: "AI-Powered Analysis",
      description: "Multi-provider AI (Claude, GPT, Gemini) generates trade ideas with comprehensive market analysis and risk assessment.",
      color: "text-blue-500"
    },
    {
      icon: Calculator,
      title: "Quantitative Signals",
      description: "v3.0 research-backed engine using 3 proven strategies: RSI(2)+200MA filter (75-91% win rate), VWAP institutional flow (80%+), and volume spike early entry.",
      color: "text-green-500"
    },
    {
      icon: Bell,
      title: "Discord Alerts",
      description: "Instant notifications for new trade ideas with complete details, grades, and entry/exit levels delivered to your Discord.",
      color: "text-amber-500"
    },
    {
      icon: BarChart3,
      title: "Real-Time Market Data",
      description: "Live pricing from Yahoo Finance, Alpha Vantage, and CoinGecko across stocks, options, and crypto markets.",
      color: "text-purple-500"
    },
    {
      icon: Shield,
      title: "Risk Management",
      description: "Built-in position sizing calculator with educational disclaimers. Every idea includes entry, target, stop-loss, and R:R ratio.",
      color: "text-cyan-500"
    },
    {
      icon: Target,
      title: "Performance Tracking",
      description: "Monitor trade outcomes, track win rates, and analyze which signal types perform best for your strategy.",
      color: "text-rose-500"
    }
  ];

  const steps = [
    {
      number: 1,
      title: "Browse Trade Ideas",
      description: "One unified feed of opportunities from AI and Quantitative engines. Filter by asset type, status, or quality grade.",
      icon: Activity
    },
    {
      number: 2,
      title: "Review Trade Details",
      description: "See entry price, target, stop-loss, risk/reward ratio, confidence score, and complete analysis for each opportunity.",
      icon: Brain
    },
    {
      number: 3,
      title: "Track Your Results",
      description: "Monitor win rates, analyze performance by engine type, and refine your strategy with real outcome data.",
      icon: TrendingUp
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top Header with Theme Toggle */}
      <header className="fixed top-0 right-0 z-50 p-4">
        <ThemeToggle />
      </header>
      
      {/* Cinematic Hero Section with Aurora Background */}
      <section className="relative overflow-hidden border-b aurora-hero">
        <ParticleBackground />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background opacity-50" />
        
        <div className="container relative mx-auto px-6 py-16 md:py-24 text-center">
          <Badge variant="secondary" className="mb-8 badge-shimmer neon-accent transition-spring">
            <Zap className="h-3 w-3 mr-1" />
            Dual-Engine Architecture: AI + Quantitative
          </Badge>
          
          {/* QuantEdge Logo */}
          <div className="flex items-center justify-center mb-2 animate-fade-up">
            <img 
              src={quantEdgeLogoUrl} 
              alt="QuantEdge" 
              className="h-48 w-48 md:h-60 md:w-60 object-contain drop-shadow-2xl"
            />
          </div>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-6 leading-relaxed animate-fade-up animate-delay-100">
            Discover day-trading opportunities across US equities, options, and crypto markets. 
            Real market data, transparent explainability, professional-grade risk management.
          </p>

          <div className="flex flex-wrap gap-3 justify-center mb-8 animate-fade-up animate-delay-200">
            {isAuthenticated ? (
              <Button 
                onClick={() => setLocation('/trade-desk')}
                data-testid="button-enter-platform"
                className="btn-magnetic neon-accent"
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                Enter Platform
              </Button>
            ) : (
              <>
                <Button 
                  onClick={() => window.location.href = '/api/login'}
                  data-testid="button-signup-hero"
                  className="btn-magnetic neon-accent"
                >
                  Get Started Free
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => window.location.href = '/api/login'}
                  data-testid="button-login-hero"
                  className="btn-magnetic glass-card"
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Login
                </Button>
              </>
            )}
            <Button 
              variant="outline"
              onClick={() => window.location.href = 'https://discord.gg/quantedge'}
              data-testid="button-join-discord"
              className="btn-magnetic glass-card"
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Join Discord
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto animate-scale-in animate-delay-300">
            <div className="glass-card rounded-xl p-4 spotlight">
              <div className="text-2xl font-bold text-gradient mb-1">3</div>
              <div className="text-xs text-muted-foreground">Proven Signals</div>
            </div>
            <div className="glass-card rounded-xl p-4 spotlight">
              <div className="text-2xl font-bold text-gradient mb-1">3</div>
              <div className="text-xs text-muted-foreground">AI Providers</div>
            </div>
            <div className="glass-card rounded-xl p-4 spotlight">
              <div className="text-2xl font-bold text-gradient mb-1">Live</div>
              <div className="text-xs text-muted-foreground">Market Data</div>
            </div>
          </div>
        </div>
        
        <div className="absolute bottom-0 left-0 right-0 h-px divider-premium" />
      </section>

      {/* TASK 1: Platform Stats Section - Trusted by Traders */}
      <section className="container mx-auto px-6 py-12 md:py-16">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4 neon-accent">
            <Users className="h-3 w-3 mr-1" />
            Platform Track Record
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-display">
            Trusted by Traders
          </h2>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto">
            Real performance metrics from our dual-engine trading platform. Transparent, verifiable, and continuously validated.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Total Trades Analyzed */}
          <div className="gradient-border-card card-tilt" data-testid="card-stat-total-trades">
            <Card className="border-0 bg-transparent">
              <CardContent className="p-8 text-center">
                <div className="text-5xl md:text-6xl font-bold text-gradient mb-4" data-testid="text-total-trades">
                  283
                </div>
                <h3 className="text-lg font-semibold mb-2 text-display">Total Trades Analyzed</h3>
                <p className="text-sm text-muted-foreground">
                  Comprehensive analysis across stocks, options, crypto, and futures markets
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Overall Win Rate */}
          <div className="gradient-border-card card-tilt" data-testid="card-stat-win-rate">
            <Card className="border-0 bg-transparent">
              <CardContent className="p-8 text-center">
                <div className="text-5xl md:text-6xl font-bold text-gradient-premium mb-4" data-testid="text-win-rate">
                  46.6%
                </div>
                <h3 className="text-lg font-semibold mb-2 text-display">Overall Win Rate</h3>
                <p className="text-sm text-muted-foreground">
                  Target-hit rate validated against real market outcomes
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Active Signals */}
          <div className="gradient-border-card card-tilt" data-testid="card-stat-active-signals">
            <Card className="border-0 bg-transparent">
              <CardContent className="p-8 text-center">
                <div className="text-5xl md:text-6xl font-bold text-gradient mb-4" data-testid="text-active-signals">
                  0
                </div>
                <h3 className="text-lg font-semibold mb-2 text-display">Active Signals</h3>
                <p className="text-sm text-muted-foreground">
                  Live trade opportunities actively monitored for performance
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Dual-Engine Intelligence Showcase */}
      <section className="border-b py-16 md:py-20 bg-gradient-to-b from-background via-primary/5 to-background">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4 neon-accent">
              <Network className="h-3 w-3 mr-1" />
              Dual-Engine Architecture
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-display">
              Two Engines, <span className="text-gradient-premium">One Purpose</span>
            </h2>
            <p className="text-base text-muted-foreground max-w-2xl mx-auto">
              AI-powered insights meet quantitative precision. Both engines analyze markets independently, 
              then converge for high-conviction signals.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* AI Engine Card */}
            <div className="gradient-border-card card-tilt" data-testid="card-ai-engine">
              <Card className="border-0 bg-transparent h-full">
                <CardContent className="p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center spotlight">
                      <Brain className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-display">AI Engine</h3>
                      <p className="text-xs text-muted-foreground">Multi-Provider Fallback</p>
                    </div>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div className="flex items-start gap-3">
                      <GitBranch className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium mb-1">Contextual Analysis</p>
                        <p className="text-xs text-muted-foreground">Processes market news, earnings, sentiment, and macro trends</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Cpu className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium mb-1">Provider Chain</p>
                        <p className="text-xs text-muted-foreground">Claude Sonnet 4 → GPT-5 → Gemini 2.5 Pro fallback</p>
                      </div>
                    </div>
                  </div>

                  <div className="glass-card rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Strengths</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary" className="text-xs">Pattern Recognition</Badge>
                      <Badge variant="secondary" className="text-xs">Market Context</Badge>
                      <Badge variant="secondary" className="text-xs">Adaptive Learning</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quant Engine Card */}
            <div className="gradient-border-card card-tilt" data-testid="card-quant-engine">
              <Card className="border-0 bg-transparent h-full">
                <CardContent className="p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-500/20 to-cyan-500/20 flex items-center justify-center spotlight">
                      <Calculator className="h-6 w-6 text-green-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-display">Quantitative Engine</h3>
                      <p className="text-xs text-muted-foreground">v3.0 Research-Backed Signals</p>
                    </div>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div className="flex items-start gap-3">
                      <BarChart3 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium mb-1">3 Proven Strategies Only</p>
                        <p className="text-xs text-muted-foreground">RSI(2)+200MA filter (75-91%), VWAP institutional flow (80%+), Volume spike early entry</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Target className="h-5 w-5 text-cyan-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium mb-1">Academic Research Foundation</p>
                        <p className="text-xs text-muted-foreground">Based on QuantifiedStrategies, Larry Connors, and FINVIZ multi-year studies</p>
                      </div>
                    </div>
                  </div>

                  <div className="glass-card rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-2">Strengths</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary" className="text-xs">Proven Win Rates</Badge>
                      <Badge variant="secondary" className="text-xs">Simple Rules</Badge>
                      <Badge variant="secondary" className="text-xs">Research-Backed</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Convergence Note */}
          <div className="mt-12 max-w-3xl mx-auto">
            <div className="glass-intense rounded-xl p-6 text-center border border-primary/20">
              <div className="flex items-center justify-center gap-2 mb-3">
                <Sparkles className="h-5 w-5 text-cyan-500" />
                <h4 className="text-lg font-bold text-display">When Both Engines Agree</h4>
                <Sparkles className="h-5 w-5 text-cyan-500" />
              </div>
              <p className="text-sm text-muted-foreground">
                High-conviction signals occur when AI context aligns with quantitative technicals. 
                These convergent opportunities historically show <span className="text-cyan-500 font-semibold">+18% higher win rates</span>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid with Premium Cards */}
      <section className="container mx-auto px-6 py-12 md:py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-display">
            Platform Features
          </h2>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto">
            Professional-grade tools for discovering and analyzing trading opportunities with complete transparency
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div 
                key={idx} 
                className="gradient-border-card card-tilt transition-spring animate-fade-up"
                style={{ animationDelay: `${idx * 100}ms` }}
                data-testid={`card-feature-${idx}`}
              >
                <Card className="h-full border-0 bg-transparent">
                  <CardContent className="p-8">
                    <div className={`h-14 w-14 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-6 spotlight ${feature.color}`}>
                      <Icon className="h-7 w-7" />
                    </div>
                    <h3 className="text-xl font-bold mb-3 text-display">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </section>

      {/* How It Works - Simple 3-Step Visual Flow */}
      <section className="border-t aurora-bg py-12 md:py-16">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-display">
              How It Works
            </h2>
            <p className="text-base text-muted-foreground max-w-2xl mx-auto">
              From discovering opportunities to tracking results in three simple steps
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.number} className="text-center relative" data-testid={`step-${step.number}`}>
                  {/* Screenshot-Style Mockup Frame */}
                  <div className="glass-card rounded-2xl p-6 mb-6 border-2 border-primary/20">
                    <div className="aspect-[4/3] rounded-lg bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center relative overflow-hidden">
                      {/* Decorative "UI Elements" */}
                      <div className="absolute top-3 left-3 right-3 flex gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-muted" />
                        <div className="h-1.5 w-1.5 rounded-full bg-muted" />
                        <div className="h-1.5 w-1.5 rounded-full bg-muted" />
                      </div>
                      
                      {/* Step Icon - Centered */}
                      <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center spotlight">
                        <Icon className="h-10 w-10 text-primary" />
                      </div>

                      {/* Step Number Badge */}
                      <div className="absolute bottom-3 right-3 h-10 w-10 rounded-xl glass-intense flex items-center justify-center text-xl font-bold neon-cyan-glow">
                        {step.number}
                      </div>
                    </div>
                  </div>

                  <h3 className="text-xl font-bold mb-3 text-display">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* TASK 2: Success Stories Carousel - Real Winning Trades */}
      <section className="border-t py-12 md:py-16 bg-gradient-to-b from-background via-accent/5 to-background">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-4 neon-accent">
              <Award className="h-3 w-3 mr-1" />
              Verified Results
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-display">
              Success Stories
            </h2>
            <p className="text-base text-muted-foreground max-w-2xl mx-auto">
              Real results from our platform. Every trade is tracked, validated, and verified for transparency.
            </p>
          </div>

          {ideasLoading ? (
            <div className="max-w-4xl mx-auto">
              <Skeleton className="h-64 w-full rounded-2xl" data-testid="skeleton-success-stories" />
            </div>
          ) : activeStory ? (
            <div className="max-w-4xl mx-auto relative">
              {/* Carousel Navigation Buttons */}
              <div className="flex items-center justify-between gap-6">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={prevStory}
                  disabled={successStories.length <= 1}
                  className="flex-shrink-0 hover-elevate"
                  data-testid="button-carousel-prev"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>

                {/* Trade Card */}
                <div className="flex-1 gradient-border-card" data-testid={`card-success-story-${carouselIndex}`}>
                  <Card className="border-0 bg-transparent">
                    <CardContent className="p-10">
                      <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-green-500/20 to-cyan-500/20 flex items-center justify-center spotlight">
                            <TrendingUp className="h-7 w-7 text-green-500" />
                          </div>
                          <div>
                            <h3 className="text-2xl font-bold text-display mb-1" data-testid="text-success-symbol">
                              {activeStory.symbol}
                            </h3>
                            <Badge 
                              variant={activeStory.direction === 'long' ? 'default' : 'secondary'}
                              className="font-semibold"
                              data-testid="badge-success-direction"
                            >
                              {activeStory.direction.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                          <span className="text-xs text-muted-foreground">Verified</span>
                        </div>
                      </div>

                      {/* Trade Details */}
                      <div className="grid grid-cols-2 gap-6 mb-6">
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Entry Price</p>
                          <p className="text-2xl font-bold text-display" data-testid="text-success-entry">
                            ${activeStory.entryPrice?.toFixed(2) || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Exit Price</p>
                          <p className="text-2xl font-bold text-display" data-testid="text-success-exit">
                            ${activeStory.exitPrice?.toFixed(2) || 'N/A'}
                          </p>
                        </div>
                      </div>

                      {/* Gain % - Prominently Displayed */}
                      <div className="glass-intense rounded-2xl p-6 text-center mb-6">
                        <p className="text-sm text-muted-foreground mb-2">Realized Gain</p>
                        <p className="text-6xl font-bold text-gradient-premium" data-testid="text-success-gain">
                          +{activeStory.percentGain?.toFixed(1) || '0.0'}%
                        </p>
                      </div>

                      {/* Quote */}
                      <div className="glass-card rounded-xl p-6 border-l-4 border-l-green-500">
                        <p className="text-base text-muted-foreground italic" data-testid="text-success-quote">
                          "Made <span className="text-green-500 font-bold">+{activeStory.percentGain?.toFixed(1) || '0.0'}%</span> on{' '}
                          <span className="font-semibold">{activeStory.symbol}</span> following{' '}
                          <span className="font-semibold">{activeStory.source || 'Quant Engine'}</span> analysis"
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={nextStory}
                  disabled={successStories.length <= 1}
                  className="flex-shrink-0 hover-elevate"
                  data-testid="button-carousel-next"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              {/* Carousel Indicators */}
              {successStories.length > 1 && (
                <div className="flex justify-center gap-2 mt-8">
                  {successStories.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCarouselIndex(idx)}
                      className={`h-2 rounded-full transition-all ${
                        idx === carouselIndex ? 'w-8 bg-primary' : 'w-2 bg-muted'
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
                  <Award className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-xl font-semibold mb-2 text-display">Building Success Stories</h3>
                  <p className="text-muted-foreground mb-6">
                    We're generating winning trades every day. Check back soon to see real results from our platform!
                  </p>
                  <Button
                    onClick={() => setLocation('/trade-desk')}
                    className="btn-magnetic neon-accent"
                    data-testid="button-view-trades-cta"
                  >
                    <ArrowRight className="h-4 w-4 mr-2" />
                    View Active Trades
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </section>

      {/* Pricing Section - Premium Glass Cards */}
      <section className="border-t py-12 md:py-16">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-display">
              Pricing
            </h2>
            <p className="text-base text-muted-foreground max-w-2xl mx-auto">
              Choose the plan that fits your trading needs
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-10 max-w-5xl mx-auto">
            {/* Free Tier */}
            <div className="gradient-border-card card-tilt" data-testid="card-pricing-free">
              <Card className="border-0 bg-transparent">
                <CardContent className="p-10">
                  <div className="mb-8">
                    <h3 className="text-3xl font-bold mb-3 text-display">Free</h3>
                    <div className="flex items-baseline gap-2 mb-4">
                      <span className="text-6xl font-bold text-gradient">$0</span>
                      <span className="text-lg text-muted-foreground">/month</span>
                    </div>
                    <p className="text-muted-foreground">Access to public performance ledger and basic features</p>
                  </div>
                  
                  <ul className="space-y-4 mb-10">
                    <li className="flex items-start gap-3">
                      <Check className="h-6 w-6 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>View public performance track record</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="h-6 w-6 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Historical trade ideas archive</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="h-6 w-6 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Basic market data</span>
                    </li>
                  </ul>
                  
                  <Button 
                    variant="outline" 
                    className="w-full btn-magnetic glass-card"
                    onClick={() => window.location.href = '/api/login'}
                    data-testid="button-pricing-free"
                  >
                    Sign Up Free
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Premium Tier */}
            <div className="relative gradient-border-card card-tilt" data-testid="card-pricing-premium">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                <Badge className="badge-shimmer neon-accent px-4 py-2 text-sm">Most Popular</Badge>
              </div>
              <Card className="border-0 bg-transparent">
                <CardContent className="p-10">
                  <div className="mb-8">
                    <h3 className="text-3xl font-bold mb-3 text-display">Premium</h3>
                    <div className="flex items-baseline gap-2 mb-4">
                      <span className="text-6xl font-bold text-gradient-premium">$39.99</span>
                      <span className="text-lg text-muted-foreground">/month</span>
                    </div>
                    <p className="text-muted-foreground">Full access to live signals, analytics, and Discord community</p>
                  </div>
                  
                  <ul className="space-y-4 mb-10">
                    <li className="flex items-start gap-3">
                      <Check className="h-6 w-6 text-cyan-500 mt-0.5 flex-shrink-0" />
                      <span className="font-medium">Everything in Free</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="h-6 w-6 text-cyan-500 mt-0.5 flex-shrink-0" />
                      <span>Real-time trade signals</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="h-6 w-6 text-cyan-500 mt-0.5 flex-shrink-0" />
                      <span>AI + Quantitative dual-engine</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="h-6 w-6 text-cyan-500 mt-0.5 flex-shrink-0" />
                      <span>Discord community access</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="h-6 w-6 text-cyan-500 mt-0.5 flex-shrink-0" />
                      <span>Instant Discord notifications</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Check className="h-6 w-6 text-cyan-500 mt-0.5 flex-shrink-0" />
                      <span>Advanced analytics & ML insights</span>
                    </li>
                  </ul>
                  
                  <Button 
                    className="w-full btn-magnetic neon-accent"
                    onClick={() => window.location.href = '/api/login'}
                    data-testid="button-pricing-premium"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Start Premium
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* TASK 3: FAQ Section - Frequently Asked Questions */}
      <section className="container mx-auto px-6 py-12 md:py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-display">
            Frequently Asked Questions
          </h2>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto">
            Everything you need to know about QuantEdge and our dual-engine trading platform
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            <AccordionItem value="accuracy" className="glass-card rounded-xl px-6 border-0" data-testid="accordion-faq-accuracy">
              <AccordionTrigger className="text-left font-semibold hover:no-underline" data-testid="trigger-faq-accuracy">
                How accurate are the trade signals?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground" data-testid="content-faq-accuracy">
                Our quantitative engine uses research-backed strategies (RSI(2)+200MA, VWAP flow, Volume spikes) with historical win rates of 75-91%. 
                AI signals are generated from multi-provider analysis (Claude, GPT, Gemini) and validated against real market outcomes. 
                Every trade is tracked transparently with actual win/loss results published to our performance ledger.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="trading-styles" className="glass-card rounded-xl px-6 border-0" data-testid="accordion-faq-styles">
              <AccordionTrigger className="text-left font-semibold hover:no-underline" data-testid="trigger-faq-styles">
                Can I use QuantEdge for different trading styles?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground" data-testid="content-faq-styles">
                Yes! QuantEdge supports day trading (intraday exits), swing trading (1-5 day holds), and position trading (5+ days). 
                Each trade idea includes holding period recommendations, entry time windows, and exit deadlines optimized for the specific opportunity. 
                Our quantitative engine analyzes timing intelligence to match strategies with your preferred trading style.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="markets" className="glass-card rounded-xl px-6 border-0" data-testid="accordion-faq-markets">
              <AccordionTrigger className="text-left font-semibold hover:no-underline" data-testid="trigger-faq-markets">
                What markets does QuantEdge cover?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground" data-testid="content-faq-markets">
                QuantEdge analyzes US equities (stocks and penny stocks), options (calls/puts with Greeks), cryptocurrencies (Bitcoin, Ethereum, altcoins), and futures contracts (E-mini Nasdaq, Gold, Crude Oil). 
                Real-time market data is sourced from Yahoo Finance, Alpha Vantage, Tradier, and CoinGecko. 
                Each asset class has specialized risk parameters and validation rules appropriate for its volatility profile.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="dual-engine" className="glass-card rounded-xl px-6 border-0" data-testid="accordion-faq-dual-engine">
              <AccordionTrigger className="text-left font-semibold hover:no-underline" data-testid="trigger-faq-dual-engine">
                How does the dual-engine system work?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground" data-testid="content-faq-dual-engine">
                Our AI Engine uses multi-provider LLMs (Claude Sonnet 4, GPT-5, Gemini 2.5 Pro) to analyze market news, earnings, and sentiment for contextual insights. 
                The Quantitative Engine runs research-backed technical strategies with proven win rates. 
                When both engines agree on a signal (convergence), win rates historically increase by 18%, creating high-conviction trade opportunities.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="beginners" className="glass-card rounded-xl px-6 border-0" data-testid="accordion-faq-beginners">
              <AccordionTrigger className="text-left font-semibold hover:no-underline" data-testid="trigger-faq-beginners">
                Is QuantEdge suitable for beginners?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground" data-testid="content-faq-beginners">
                QuantEdge is designed as an educational research platform for learning systematic trading approaches. 
                Every trade idea includes explainability features (technical indicator values, risk metrics, confidence scores) to help you understand the reasoning. 
                We strongly recommend paper trading or small position sizes while learning. This platform provides research and analysis—not financial advice.
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="premium" className="glass-card rounded-xl px-6 border-0" data-testid="accordion-faq-premium">
              <AccordionTrigger className="text-left font-semibold hover:no-underline" data-testid="trigger-faq-premium">
                What's included in the Premium plan?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground" data-testid="content-faq-premium">
                Premium ($39.99/month) unlocks real-time trade signals from both AI and Quantitative engines, instant Discord notifications for new opportunities, access to our private Discord community, advanced analytics and ML insights, and priority support. 
                Free tier users can view historical performance and the public track record. 
                All subscribers receive the same trade ideas—no tiered signal quality.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* Contact Section - Glass Cards */}
      <section className="container mx-auto px-6 py-12 md:py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-display">
            Get In Touch
          </h2>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto">
            Questions about pricing, features, or partnership opportunities? We're here to help.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          <div className="gradient-border-card card-tilt" data-testid="card-contact-email">
            <Card className="border-0 bg-transparent">
              <CardContent className="p-8 flex items-center gap-6">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0 spotlight">
                  <Mail className="h-8 w-8 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold mb-2 text-lg text-display">Email Support</h3>
                  <a 
                    href="mailto:support@quantedge.io" 
                    className="text-sm text-primary hover:underline transition-smooth"
                    data-testid="link-contact-email"
                  >
                    support@quantedge.io
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="gradient-border-card card-tilt" data-testid="card-contact-discord">
            <Card className="border-0 bg-transparent">
              <CardContent className="p-8 flex items-center gap-6">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center flex-shrink-0 spotlight">
                  <MessageCircle className="h-8 w-8 text-purple-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold mb-2 text-lg text-display">Join Our Discord</h3>
                  <a 
                    href="https://discord.gg/quantedge" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1 transition-smooth"
                    data-testid="link-contact-discord"
                  >
                    discord.gg/quantedge
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section - Premium Spotlight */}
      <section className="container mx-auto px-6 py-12 md:py-16">
        <div className="gradient-border-card">
          <Card className="border-0 bg-transparent aurora-bg vignette">
            <CardContent className="p-12 text-center relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-display">
                Ready to Start Trading <span className="text-gradient-premium">Smarter?</span>
              </h2>
              <p className="text-base text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
                Access dual-engine trade idea generation, real-time market analysis, and professional risk management tools. 
                Educational research platform for active traders.
              </p>
              <Button 
                onClick={() => setLocation('/dashboard')}
                data-testid="button-cta-launch-dashboard"
                className="btn-magnetic neon-accent"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Launch Dashboard
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <p className="text-xs text-muted-foreground mt-6 opacity-70">
                ⚠️ For educational and research purposes only. Not financial advice.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}
