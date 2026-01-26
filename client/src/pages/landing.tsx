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
  Play
} from "lucide-react";
import { useState, lazy, Suspense } from "react";
import { SiDiscord } from "react-icons/si";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import { WaitlistPopup } from "@/components/waitlist-popup";

// Lazy load heavy components
const LiveActivityFeed = lazy(() => import("@/components/live-activity-feed").then(m => ({ default: m.LiveActivityFeed })));

const DISCORD_INVITE_URL = "https://discord.gg/3QF8QEKkYq";

export default function Landing() {
  const [, setLocation] = useLocation();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const { isAuthenticated } = useAuth();

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

      {/* Hero Section - Clean & Modern */}
      <section className="relative min-h-[85vh] pt-20 flex items-center" data-testid="hero-section">
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm mb-6">
              <Zap className="h-3.5 w-3.5" />
              <span>AI-Powered Trading Research</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 text-white">
              Six Engines.
              <br />
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">One Edge.</span>
            </h1>

            <p className="text-lg text-slate-400 max-w-xl mx-auto mb-8">
              ML, AI, Quant, Flow, Sentiment & Technical signals converge into higher-conviction setups.
            </p>

            <div className="flex flex-wrap gap-3 justify-center mb-12">
              <Button
                size="lg"
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold h-12 px-6"
                onClick={() => setWaitlistOpen(true)}
              >
                Get Started Free
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
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
              <span className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-500" />
                Bank-level security
              </span>
              <span className="flex items-center gap-2">
                <ChartLine className="h-4 w-4 text-cyan-500" />
                Real-time analysis
              </span>
              <span className="flex items-center gap-2">
                <Check className="h-4 w-4 text-cyan-500" />
                No credit card required
              </span>
            </div>
          </div>
        </div>

        {/* Subtle gradient orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* Hero Product Preview */}
      <section className="relative py-12 -mt-8">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            {/* Mockup Trade Idea Card */}
            <div className="relative">
              {/* Glow effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-pink-500/20 blur-3xl opacity-50" />

              {/* Card */}
              <div className="relative bg-slate-900/80 backdrop-blur border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-bold">
                      N
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-white">NVDA</span>
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">BULLISH</Badge>
                      </div>
                      <span className="text-sm text-slate-400">NVIDIA Corporation</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-emerald-400">87%</div>
                    <span className="text-xs text-slate-500">AI Confidence</span>
                  </div>
                </div>

                {/* 6 Engine Scores */}
                <div className="grid grid-cols-6 gap-2 mb-6">
                  {[
                    { name: 'ML', score: 92, color: 'pink' },
                    { name: 'AI', score: 88, color: 'purple' },
                    { name: 'Quant', score: 85, color: 'blue' },
                    { name: 'Flow', score: 91, color: 'cyan' },
                    { name: 'Sent', score: 78, color: 'amber' },
                    { name: 'Tech', score: 89, color: 'green' },
                  ].map((engine) => {
                    const colors: Record<string, string> = {
                      pink: 'from-pink-500/20 to-pink-500/5 border-pink-500/30 text-pink-400',
                      purple: 'from-purple-500/20 to-purple-500/5 border-purple-500/30 text-purple-400',
                      blue: 'from-blue-500/20 to-blue-500/5 border-blue-500/30 text-blue-400',
                      cyan: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/30 text-cyan-400',
                      amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-400',
                      green: 'from-green-500/20 to-green-500/5 border-green-500/30 text-green-400',
                    };
                    return (
                      <div key={engine.name} className={`p-2 rounded-lg bg-gradient-to-b border text-center ${colors[engine.color]}`}>
                        <div className="text-[10px] text-slate-400 mb-0.5">{engine.name}</div>
                        <div className="text-sm font-bold">{engine.score}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Signal Summary */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-xs text-slate-500">Entry</span>
                      <div className="text-sm font-semibold text-white">$142.50</div>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">Target</span>
                      <div className="text-sm font-semibold text-emerald-400">$158.00</div>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500">Stop</span>
                      <div className="text-sm font-semibold text-red-400">$135.00</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500">Risk/Reward</span>
                    <div className="text-sm font-semibold text-cyan-400">1:2.1</div>
                  </div>
                </div>

                {/* Convergence indicator */}
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <div className="flex -space-x-1">
                    <div className="w-4 h-4 rounded-full bg-pink-500/50 border border-slate-800" />
                    <div className="w-4 h-4 rounded-full bg-purple-500/50 border border-slate-800" />
                    <div className="w-4 h-4 rounded-full bg-cyan-500/50 border border-slate-800" />
                    <div className="w-4 h-4 rounded-full bg-emerald-500/50 border border-slate-800" />
                  </div>
                  <span>4/6 engines aligned</span>
                </div>
              </div>
            </div>

            <p className="text-center text-sm text-slate-500 mt-4">
              Real AI-generated trade idea from our platform
            </p>
          </div>
        </div>
      </section>

      {/* Stats Strip */}
      <div className="relative py-8 border-y border-slate-800/50 bg-slate-900/30">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { value: '6', label: 'AI Engines' },
              { value: '24/7', label: 'Market Analysis' },
              { value: '50K+', label: 'Signals Tracked' },
              { value: '<1s', label: 'Signal Speed' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
                <p className="text-sm text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Six Engines Section */}
      <section className="relative py-20" id="features" data-testid="section-features">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-sm font-medium uppercase tracking-wider text-cyan-400 mb-3">The Technology</p>
            <h2 className="text-3xl lg:text-4xl font-bold mb-4 text-white">Six Engines Working Together</h2>
            <p className="text-slate-400 max-w-xl mx-auto">
              Every angle analyzed. Every signal tracked. Every outcome measured.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {[
              { name: 'ML Engine', icon: Sparkles, color: 'pink', desc: 'Machine learning predictions & regime detection' },
              { name: 'AI Engine', icon: Brain, color: 'purple', desc: 'Multi-LLM analysis of news & filings' },
              { name: 'Quant Engine', icon: Calculator, color: 'blue', desc: 'RSI, VWAP, volume & statistical analysis' },
              { name: 'Flow Engine', icon: Activity, color: 'cyan', desc: 'Institutional sweeps & dark pool prints' },
              { name: 'Sentiment Engine', icon: Target, color: 'amber', desc: 'Social buzz & fear/greed indicators' },
              { name: 'Technical Engine', icon: CandlestickChart, color: 'green', desc: 'Chart patterns & support/resistance' },
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
          <div className="mt-12 pt-12 border-t border-slate-800">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-6 text-center">Asset Classes</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-3xl mx-auto">
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
      <section className="py-16 bg-slate-900/30 border-y border-slate-800/50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-white mb-3">How It Works</h2>
            <p className="text-slate-400">From signal to action in three steps</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { step: '01', title: 'Engines Analyze', desc: 'Six AI engines scan markets 24/7 for high-probability setups' },
              { step: '02', title: 'Signals Converge', desc: 'Multiple engines agreeing = higher conviction opportunities' },
              { step: '03', title: 'You Decide', desc: 'Research-grade analysis delivered. You make the final call.' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="text-4xl font-bold text-cyan-500/20 mb-2">{item.step}</div>
                <h3 className="font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20" id="pricing" data-testid="section-pricing">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-sm font-medium uppercase tracking-wider text-cyan-400 mb-3">Pricing</p>
            <h2 className="text-3xl font-bold text-white mb-4">Simple, Transparent Pricing</h2>
            <p className="text-slate-400">Start with paper trading. Upgrade when ready.</p>
          </div>

          {/* Billing Toggle */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center p-1 bg-slate-900 rounded-lg border border-slate-800">
              <button
                onClick={() => setBillingPeriod('monthly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingPeriod === 'monthly' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingPeriod('yearly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  billingPeriod === 'yearly' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                Yearly <span className="text-xs opacity-70">(-20%)</span>
              </button>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {/* Free */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h3 className="font-semibold mb-2 text-white">Paper Trader</h3>
              <p className="text-3xl font-bold text-white mb-4">$0<span className="text-sm font-normal text-slate-500">/mo</span></p>
              <ul className="space-y-2 mb-6">
                {['Paper trading journal', 'Basic research briefs', 'Chart analysis', 'Community Discord'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-400">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full border-slate-700" onClick={() => setLocation('/signup')}>
                Get Started
              </Button>
            </div>

            {/* Pro */}
            <div className="rounded-xl border-2 border-cyan-500 bg-gradient-to-b from-cyan-500/10 to-transparent p-6 relative">
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-cyan-500 text-slate-950">Most Popular</Badge>
              <h3 className="font-semibold mb-2 text-white">Pro Trader</h3>
              <p className="text-3xl font-bold text-white mb-4">
                ${billingPeriod === 'monthly' ? '49' : '39'}
                <span className="text-sm font-normal text-slate-500">/mo</span>
              </p>
              <ul className="space-y-2 mb-6">
                {['Everything in Free', 'All 6 research engines', 'Real-time alerts', 'Auto-Lotto bot', 'Priority support'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-white">
                    <Check className="h-4 w-4 text-cyan-400 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Button className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950" onClick={() => setWaitlistOpen(true)}>
                Join Waitlist
              </Button>
            </div>

            {/* Institutional */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h3 className="font-semibold mb-2 text-white">Institutional</h3>
              <p className="text-3xl font-bold text-white mb-4">Custom</p>
              <ul className="space-y-2 mb-6">
                {['Everything in Pro', 'API access', 'Custom integrations', 'Dedicated support', 'White-label options'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-400">
                    <Check className="h-4 w-4 text-purple-400 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full border-slate-700">Contact Sales</Button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-slate-900/30 border-y border-slate-800/50" data-testid="section-faq">
        <div className="container mx-auto px-6">
          <h2 className="text-2xl font-bold text-center text-white mb-8">Frequently Asked Questions</h2>
          <div className="max-w-2xl mx-auto">
            <Accordion type="single" collapsible className="space-y-2">
              {[
                { id: 'what', q: 'What is Quant Edge Labs?', a: 'An educational research platform for self-directed traders. We use 6 engines (ML, AI, Quant, Flow, Sentiment, Technical) to analyze markets and surface potential setups. This is a learning tool—not a signal service or financial advice.' },
                { id: 'risk', q: 'How does risk management work?', a: 'Research briefs display calculated risk/reward ratios and suggested exit levels for educational context. We provide paper trading tools so users can learn risk management concepts without capital at risk.' },
                { id: 'paper', q: 'What is paper trading?', a: 'Simulated trading with fake money. It lets you test strategies without real capital. Quant Edge Labs includes a built-in paper trading journal to track your hypothetical trades.' },
                { id: 'data', q: 'Where does the market data come from?', a: 'Real-time quotes from Tradier (stocks/options), CoinGecko (crypto), Yahoo Finance (equities), and Alpha Vantage (news/earnings). All data is refreshed every few seconds during market hours.' },
                { id: 'advice', q: 'Is this financial advice?', a: 'No. Quant Edge Labs is an educational research platform. We provide analysis tools and pattern recognition—not recommendations. You make all trading decisions yourself. Trading involves substantial risk of loss.' },
              ].map((faq) => (
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

      {/* Discord Section */}
      <section className="py-16" data-testid="section-discord">
        <div className="container mx-auto px-6">
          <div className="rounded-xl bg-gradient-to-r from-indigo-900/40 to-purple-900/40 border border-indigo-500/20 p-8 max-w-3xl mx-auto text-center">
            <div className="h-14 w-14 rounded-xl bg-indigo-600 flex items-center justify-center mx-auto mb-4">
              <SiDiscord className="h-7 w-7 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Join the Community</h2>
            <p className="text-slate-400 mb-6 max-w-md mx-auto">
              Connect with traders, get real-time alerts, and learn together.
            </p>
            <Button
              size="lg"
              className="bg-indigo-600 hover:bg-indigo-500"
              onClick={() => window.open(DISCORD_INVITE_URL, '_blank')}
            >
              <SiDiscord className="mr-2 h-4 w-4" />
              Join Discord
            </Button>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16" data-testid="section-cta">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Ready to Get an Edge?</h2>
          <p className="text-slate-400 mb-6 max-w-md mx-auto">
            Join thousands of traders using AI-powered research to level up their trading.
          </p>
          <Button
            size="lg"
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold"
            onClick={() => setWaitlistOpen(true)}
          >
            Get Started Free
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-slate-800">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={quantEdgeLabsLogoUrl} alt="Quant Edge Labs" className="h-6 w-6" />
              <span className="text-sm text-slate-400">© {new Date().getFullYear()} Quant Edge Labs</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-slate-500">
              <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
              <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
              <Link href="/about" className="hover:text-white transition-colors">About</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Waitlist Popup */}
      {waitlistOpen && <WaitlistPopup onClose={() => setWaitlistOpen(false)} />}
    </div>
  );
}
