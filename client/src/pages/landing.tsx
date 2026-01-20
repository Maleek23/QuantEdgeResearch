import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { motion } from "framer-motion";
import { SiDiscord } from "react-icons/si";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import { HeroProductPanel } from "@/components/hero-product-panel";
import { ShimmerButton } from "@/components/magicui/shimmer-button";
import { WaitlistPopup } from "@/components/waitlist-popup";
import { GeminiGradient, GeminiOrb, FloatingParticles, AnimatedMetricCard } from "@/components/gemini-gradient";
import { LiveActivityFeed } from "@/components/live-activity-feed";
import { AnimatedStat } from "@/components/animated-stat";
import { SocialProofSection } from "@/components/social-proof-section";
import { ComparisonTable } from "@/components/comparison-table";

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
                <Link href="/auth">
                  <Button size="sm" variant="outline" data-testid="button-login">
                    Sign In
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section - Gemini Inspired with Orbs */}
      <section className="relative min-h-[90vh] pt-24 flex items-center overflow-hidden" data-testid="hero-section">
        <GeminiGradient variant="hero" />
        <FloatingParticles count={30} />
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
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
                    <Target className="h-7 w-7 text-white" />
                  </motion.div>
                  <h3 className="font-semibold text-lg mb-2">Sentiment Engine</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">Social buzz, fear/greed, put/call ratios.</p>
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

          {/* Asset Classes */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-6 text-center">Asset Classes</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {[
                { name: 'Stocks', icon: <TrendingUp className="h-5 w-5" />, desc: 'US Equities' },
                { name: 'Options', icon: <Activity className="h-5 w-5" />, desc: 'Calls & Puts' },
                { name: 'Crypto', icon: <Coins className="h-5 w-5" />, desc: 'BTC, ETH, SOL' },
                { name: 'Futures', icon: <BarChart3 className="h-5 w-5" />, desc: 'NQ, ES, GC' },
              ].map((asset, i) => (
                <motion.div 
                  key={asset.name}
                  className="text-center p-4 rounded-xl bg-slate-900/50 border border-slate-800"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center mx-auto mb-2">
                    {asset.icon}
                  </div>
                  <p className="font-medium">{asset.name}</p>
                  <p className="text-xs text-muted-foreground">{asset.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Live Activity Feed Section */}
      <section className="py-12 bg-slate-950/50" data-testid="section-activity">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            <div>
              <h2 className="text-2xl font-bold mb-4">Real-Time Platform Activity</h2>
              <p className="text-muted-foreground mb-6">
                Watch as our engines analyze markets and generate trade ideas in real-time.
              </p>
              <LiveActivityFeed />
            </div>
            <div>
              <HeroProductPanel className="w-full" />
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-16 lg:py-24" id="pricing" data-testid="section-pricing">
        <div className="container mx-auto px-6">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <p className="text-sm font-medium uppercase tracking-wider text-cyan-400 mb-3">Pricing</p>
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Start with paper trading. Upgrade when you're ready.
            </p>
          </motion.div>

          {/* Billing Toggle */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 p-1 bg-slate-900 rounded-lg border border-slate-800">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingPeriod === 'monthly' 
                    ? 'bg-cyan-500 text-slate-950' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod('yearly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingPeriod === 'yearly' 
                    ? 'bg-cyan-500 text-slate-950' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Yearly <span className="text-xs opacity-80">(-20%)</span>
              </button>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Free Tier */}
            <motion.div 
              className="rounded-xl border border-slate-800 bg-slate-900/50 p-6"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h3 className="font-semibold text-lg mb-2">Paper Trader</h3>
              <p className="text-3xl font-bold mb-4">$0<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              <ul className="space-y-2 mb-6">
                {['Paper trading journal', 'Basic research briefs', 'Chart analysis', 'Community Discord'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-green-500" /> {f}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full" onClick={() => setLocation('/auth')}>
                Get Started
              </Button>
            </motion.div>

            {/* Pro Tier */}
            <motion.div 
              className="rounded-xl border-2 border-cyan-500 bg-gradient-to-b from-cyan-500/10 to-transparent p-6 relative"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-cyan-500">Most Popular</Badge>
              <h3 className="font-semibold text-lg mb-2">Pro Trader</h3>
              <p className="text-3xl font-bold mb-4">
                ${billingPeriod === 'monthly' ? '49' : '39'}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
              <ul className="space-y-2 mb-6">
                {['Everything in Free', 'All 6 research engines', 'Real-time alerts', 'Auto-Lotto bot', 'Priority support'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-cyan-500" /> {f}
                  </li>
                ))}
              </ul>
              <Button className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950" onClick={() => setWaitlistOpen(true)}>
                Join Waitlist
              </Button>
            </motion.div>

            {/* Institutional */}
            <motion.div 
              className="rounded-xl border border-slate-800 bg-slate-900/50 p-6"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <h3 className="font-semibold text-lg mb-2">Institutional</h3>
              <p className="text-3xl font-bold mb-4">Custom</p>
              <ul className="space-y-2 mb-6">
                {['Everything in Pro', 'API access', 'Custom integrations', 'Dedicated support', 'White-label options'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-purple-500" /> {f}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full">
                Contact Sales
              </Button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-12 lg:py-16 bg-slate-950/50" data-testid="section-faq">
        <div className="container mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          <div className="max-w-2xl mx-auto">
            <Accordion type="single" collapsible className="space-y-2">
              <AccordionItem value="what" className="border border-slate-800 rounded-lg px-4" data-testid="accordion-faq-what">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-3 text-sm" data-testid="trigger-faq-what">
                  What is Quant Edge Labs?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-3 text-sm" data-testid="content-faq-what">
                  Quant Edge Labs is an educational research platform for self-directed traders. 
                  We use 6 engines (ML, AI, Quant, Flow, Sentiment, Technical) to analyze markets and surface potential setups. 
                  This is a learning tool—not a signal service or financial advice.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="risk" className="border border-slate-800 rounded-lg px-4" data-testid="accordion-faq-risk">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-3 text-sm" data-testid="trigger-faq-risk">
                  How does the platform handle risk management?
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
