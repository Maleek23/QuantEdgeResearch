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
  Sparkles,
  Zap,
  BarChart3
} from "lucide-react";
import { useState } from "react";
import { SiDiscord } from "react-icons/si";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import { HeroProductPanel } from "@/components/hero-product-panel";
import { ShimmerButton } from "@/components/magicui/shimmer-button";
import { WaitlistPopup } from "@/components/waitlist-popup";
import { GeminiGradient, GeminiOrb, FloatingParticles, AnimatedMetricCard } from "@/components/gemini-gradient";
import { motion } from "framer-motion";

const DISCORD_INVITE_URL = "https://discord.gg/3QF8QEKkYq";

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
  const [waitlistOpen, setWaitlistOpen] = useState(false);
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
                    onClick={() => setWaitlistOpen(true)}
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

      {/* Hero Section - Gemini-Inspired */}
      <section className="relative min-h-screen flex items-center pt-16 overflow-hidden" data-testid="hero-section">
        <GeminiGradient variant="hero" />
        <FloatingParticles count={30} />
        
        <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Copy with animations */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <motion.div 
                className="inline-flex items-center gap-2 backdrop-blur-md bg-slate-900/40 border border-cyan-500/30 rounded-full px-4 py-2 mb-6"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <motion.span 
                  className="w-2 h-2 rounded-full bg-cyan-400"
                  animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-sm font-mono text-cyan-400">LIVE BETA</span>
              </motion.div>
              
              <motion.h1 
                className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                data-testid="text-hero-headline"
              >
                <span className="bg-gradient-to-r from-white via-white to-slate-400 bg-clip-text text-transparent">Six Engines</span>
                <span className="text-cyan-400">.</span>
                <br />
                <span className="bg-gradient-to-r from-cyan-300 via-cyan-400 to-purple-400 bg-clip-text text-transparent">One Edge</span>
                <span className="text-purple-400">.</span>
              </motion.h1>
              
              <motion.p 
                className="text-lg text-slate-300 max-w-xl mb-8 leading-relaxed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                data-testid="text-hero-subheadline"
              >
                ML, AI, Quant, Flow, Sentiment & Technical signals converge into{" "}
                <span className="text-cyan-400 font-medium">higher-conviction setups</span>.
                Every signal verified. Every outcome tracked.
              </motion.p>
              
              <motion.div 
                className="flex flex-wrap gap-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <Button 
                  size="lg"
                  className="bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 shadow-xl shadow-cyan-500/30 font-semibold"
                  onClick={() => setWaitlistOpen(true)}
                  data-testid="button-join-waitlist"
                >
                  <Zap className="mr-2 h-5 w-5" />
                  Join Waitlist
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  className="border-slate-600 bg-slate-900/50 backdrop-blur-sm font-semibold gap-2"
                  onClick={() => window.open(DISCORD_INVITE_URL, '_blank')}
                  data-testid="button-join-discord"
                >
                  <SiDiscord className="h-5 w-5" />
                  Join Discord
                </Button>
              </motion.div>

              {/* Trust indicators */}
              <motion.div 
                className="mt-10 pt-8 border-t border-slate-800/50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Powered by</p>
                <div className="flex flex-wrap gap-4 items-center">
                  <Badge variant="secondary" className="bg-slate-800/50 text-slate-300 border-slate-700">Claude Sonnet</Badge>
                  <Badge variant="secondary" className="bg-slate-800/50 text-slate-300 border-slate-700">GPT-4</Badge>
                  <Badge variant="secondary" className="bg-slate-800/50 text-slate-300 border-slate-700">Gemini</Badge>
                  <Badge variant="secondary" className="bg-slate-800/50 text-slate-300 border-slate-700">Tradier</Badge>
                </div>
              </motion.div>
            </motion.div>
            
            {/* Right: Visual orbs + floating metrics */}
            <motion.div 
              className="hidden lg:block relative h-[500px]"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              {/* Main orb cluster */}
              <div className="absolute inset-0 flex items-center justify-center">
                <GeminiOrb size="xl" color="cyan" className="absolute" />
                <GeminiOrb size="lg" color="purple" className="absolute translate-x-20 -translate-y-16" />
                <GeminiOrb size="md" color="pink" className="absolute -translate-x-24 translate-y-12" />
                <GeminiOrb size="sm" color="blue" className="absolute translate-x-32 translate-y-20" />
              </div>

              {/* Floating metric cards */}
              <motion.div 
                className="absolute top-8 right-0 backdrop-blur-lg bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 shadow-xl"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Engines Live</p>
                    <p className="text-xl font-bold text-green-400">6</p>
                  </div>
                </div>
              </motion.div>

              <motion.div 
                className="absolute bottom-16 left-0 backdrop-blur-lg bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 shadow-xl"
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Markets</p>
                    <p className="text-xl font-bold text-cyan-400">4</p>
                  </div>
                </div>
              </motion.div>

              <motion.div 
                className="absolute top-1/2 right-4 backdrop-blur-lg bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 shadow-xl"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                    <Brain className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">AI Models</p>
                    <p className="text-xl font-bold text-purple-400">3</p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
        
        {/* Scroll indicator */}
        <motion.div 
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="w-6 h-10 rounded-full border-2 border-slate-600 flex items-start justify-center p-2">
            <motion.div 
              className="w-1.5 h-1.5 rounded-full bg-cyan-400"
              animate={{ y: [0, 12, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
        </motion.div>
      </section>

      {/* Stats Strip - Animated Metrics */}
      <div className="relative py-12 overflow-hidden" data-testid="stats-strip">
        <GeminiGradient variant="subtle" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/80 to-transparent" />
        <div className="container mx-auto px-6 relative z-10">
          <motion.div 
            className="grid grid-cols-2 lg:grid-cols-4 gap-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ staggerChildren: 0.1 }}
          >
            <AnimatedMetricCard
              label="Trade Ideas"
              value={statsLoading ? "—" : (perfStats?.overall?.totalIdeas || "—")}
              color="cyan"
              icon={<LineChart className="w-4 h-4" />}
            />
            <AnimatedMetricCard
              label="Active"
              value={statsLoading ? "—" : (perfStats?.overall?.openIdeas || "—")}
              color="green"
              icon={<Activity className="w-4 h-4" />}
            />
            <AnimatedMetricCard
              label="Engines"
              value="6"
              color="purple"
              icon={<Brain className="w-4 h-4" />}
            />
            <AnimatedMetricCard
              label="Markets"
              value="4"
              color="amber"
              icon={<BarChart3 className="w-4 h-4" />}
            />
          </motion.div>
        </div>
      </div>

      {/* Platform Capabilities - Visual Cards */}
      <section className="relative py-16 lg:py-24 overflow-hidden" id="features" data-testid="section-features">
        <GeminiGradient variant="subtle" />
        <div className="container mx-auto px-6 relative z-10">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <motion.p 
              className="text-sm font-medium uppercase tracking-wider text-cyan-400 mb-3"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              Platform Capabilities
            </motion.p>
            <h2 className="text-3xl lg:text-4xl font-bold mb-4 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Six Engines. Complete Coverage.
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto text-lg">
              Every angle analyzed. Every signal tracked. Every outcome measured.
            </p>
          </motion.div>
          
          {/* Research Engines - Animated Visual Grid */}
          <div className="mb-16">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-6 text-center">Research Engines</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {/* ML Engine */}
              <motion.div
                className="group relative overflow-visible rounded-2xl bg-gradient-to-br from-pink-500/10 to-pink-600/5 border border-pink-500/20 p-6 backdrop-blur-sm"
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0, duration: 0.5 }}
                whileHover={{ scale: 1.02, y: -5 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />
                <div className="relative">
                  <motion.div 
                    className="h-14 w-14 rounded-2xl bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center mb-4 shadow-xl shadow-pink-500/30"
                    whileHover={{ rotate: [0, -5, 5, 0] }}
                    transition={{ duration: 0.5 }}
                  >
                    <Sparkles className="h-7 w-7 text-white" />
                  </motion.div>
                  <h3 className="font-semibold text-lg mb-2">ML Engine</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">Machine learning predictions. Direction, regime, position sizing.</p>
                </div>
              </motion.div>

              {/* AI Engine */}
              <motion.div
                className="group relative overflow-visible rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 p-6 backdrop-blur-sm"
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1, duration: 0.5 }}
                whileHover={{ scale: 1.02, y: -5 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />
                <div className="relative">
                  <motion.div 
                    className="h-14 w-14 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center mb-4 shadow-xl shadow-purple-500/30"
                    whileHover={{ rotate: [0, -5, 5, 0] }}
                    transition={{ duration: 0.5 }}
                  >
                    <Brain className="h-7 w-7 text-white" />
                  </motion.div>
                  <h3 className="font-semibold text-lg mb-2">AI Engine</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">Multi-LLM consensus. News, earnings, SEC filings analysis.</p>
                </div>
              </motion.div>

              {/* Quant Engine */}
              <motion.div
                className="group relative overflow-visible rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 p-6 backdrop-blur-sm"
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2, duration: 0.5 }}
                whileHover={{ scale: 1.02, y: -5 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />
                <div className="relative">
                  <motion.div 
                    className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-4 shadow-xl shadow-blue-500/30"
                    whileHover={{ rotate: [0, -5, 5, 0] }}
                    transition={{ duration: 0.5 }}
                  >
                    <Calculator className="h-7 w-7 text-white" />
                  </motion.div>
                  <h3 className="font-semibold text-lg mb-2">Quant Engine</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">RSI(2), VWAP, volume spike detection, ADX filtering.</p>
                </div>
              </motion.div>

              {/* Flow Engine */}
              <motion.div
                className="group relative overflow-visible rounded-2xl bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-cyan-500/20 p-6 backdrop-blur-sm"
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3, duration: 0.5 }}
                whileHover={{ scale: 1.02, y: -5 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />
                <div className="relative">
                  <motion.div 
                    className="h-14 w-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center mb-4 shadow-xl shadow-cyan-500/30"
                    whileHover={{ rotate: [0, -5, 5, 0] }}
                    transition={{ duration: 0.5 }}
                  >
                    <Activity className="h-7 w-7 text-white" />
                  </motion.div>
                  <h3 className="font-semibold text-lg mb-2">Flow Engine</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">Institutional sweeps, blocks, dark pool prints.</p>
                </div>
              </motion.div>

              {/* Sentiment Engine */}
              <motion.div
                className="group relative overflow-visible rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 p-6 backdrop-blur-sm"
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4, duration: 0.5 }}
                whileHover={{ scale: 1.02, y: -5 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />
                <div className="relative">
                  <motion.div 
                    className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center mb-4 shadow-xl shadow-amber-500/30"
                    whileHover={{ rotate: [0, -5, 5, 0] }}
                    transition={{ duration: 0.5 }}
                  >
                    <TrendingUp className="h-7 w-7 text-white" />
                  </motion.div>
                  <h3 className="font-semibold text-lg mb-2">Sentiment Engine</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">Market mood, VIX levels, fear/greed analysis.</p>
                </div>
              </motion.div>

              {/* Technical Engine */}
              <motion.div
                className="group relative overflow-visible rounded-2xl bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 p-6 backdrop-blur-sm"
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5, duration: 0.5 }}
                whileHover={{ scale: 1.02, y: -5 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />
                <div className="relative">
                  <motion.div 
                    className="h-14 w-14 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center mb-4 shadow-xl shadow-green-500/30"
                    whileHover={{ rotate: [0, -5, 5, 0] }}
                    transition={{ duration: 0.5 }}
                  >
                    <CandlestickChart className="h-7 w-7 text-white" />
                  </motion.div>
                  <h3 className="font-semibold text-lg mb-2">Technical Engine</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">Chart patterns, support/resistance, trend analysis.</p>
                </div>
              </motion.div>
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
            <div className="flex items-center justify-center gap-2 mb-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Pricing Plans
              </p>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30" data-testid="badge-pricing-beta">
                BETA
              </span>
            </div>
            <h2 className="text-xl font-semibold mb-4">Choose Your Plan</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
              Early access pricing - lock in these rates before launch
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
                  onClick={() => setWaitlistOpen(true)}
                  data-testid="button-pricing-free"
                >
                  Join Waitlist
                </Button>
              </CardContent>
            </Card>

            {/* Advanced Tier */}
            <Card className="glass-card border-cyan-500/50" data-testid="card-pricing-advanced">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1">
                <Badge className="bg-cyan-500 text-slate-950">Most Popular</Badge>
                <Badge className="bg-purple-500/20 text-purple-400 border border-purple-500/30">BETA</Badge>
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
                  onClick={() => setWaitlistOpen(true)}
                  data-testid="button-pricing-advanced"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Join Waitlist
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
                  What markets does Quant Edge Labs cover?
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
                  Quant Edge Labs includes a built-in paper trading journal to track your hypothetical trades.
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
                  Is Quant Edge Labs financial advice?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-3 text-sm" data-testid="content-faq-advice">
                  No. Quant Edge Labs is an educational research platform. We provide analysis tools and pattern recognition—not recommendations. 
                  You make all trading decisions yourself. Trading involves substantial risk of loss.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      {/* Discord Community Section */}
      <section className="py-12 lg:py-16" data-testid="section-discord">
        <div className="container mx-auto px-6">
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-600/20 via-purple-600/10 to-indigo-600/20 border border-indigo-500/20 p-8 lg:p-12 max-w-4xl mx-auto">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl" />
            
            <div className="relative flex flex-col lg:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <div className="h-20 w-20 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                  <SiDiscord className="h-10 w-10 text-white" />
                </div>
              </div>
              
              <div className="flex-1 text-center lg:text-left">
                <h2 className="text-2xl font-bold mb-2">Join the Lab Community</h2>
                <p className="text-muted-foreground mb-4 max-w-lg">
                  Connect with traders, get real-time signal alerts, ask questions, and learn together. 
                  Our Discord is where the action happens.
                </p>
                <div className="flex flex-wrap gap-4 justify-center lg:justify-start text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-indigo-400" /> Live signal alerts
                  </span>
                  <span className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-indigo-400" /> Trading discussions
                  </span>
                  <span className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-indigo-400" /> Educational content
                  </span>
                </div>
              </div>
              
              <div className="flex-shrink-0">
                <Button 
                  size="lg"
                  className="bg-indigo-600 font-semibold gap-2"
                  onClick={() => window.open(DISCORD_INVITE_URL, '_blank')}
                  data-testid="button-discord-section"
                >
                  <SiDiscord className="h-5 w-5" />
                  Join Discord
                </Button>
              </div>
            </div>
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
                onClick={() => setWaitlistOpen(true)} 
                data-testid="button-cta-signup"
                className="font-medium"
              >
                Join Waitlist <ArrowRight className="h-4 w-4 ml-2" />
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
              <img src={quantEdgeLabsLogoUrl} alt="Quant Edge Labs" className="h-6 w-6 object-contain" />
              <span className="font-semibold text-sm">Quant Edge Labs</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">Research tools for self-directed traders</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <Link href="/trade-desk" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-link-dashboard">Dashboard</Link>
              <Link href="/academy" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-link-academy">Academy</Link>
              <Link href="/blog" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="footer-link-blog">Blog</Link>
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
            <p>© {new Date().getFullYear()} Quant Edge Labs</p>
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6" 
                onClick={() => window.open(DISCORD_INVITE_URL, '_blank')}
                data-testid="link-social-discord"
              >
                <SiDiscord className="h-3 w-3" />
              </Button>
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

      <WaitlistPopup 
        open={waitlistOpen} 
        onOpenChange={setWaitlistOpen}
      />
    </div>
  );
}
