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
                Six Engines.
                <br />
                <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">One Edge.</span>
              </h1>

              <p className="text-lg text-slate-400 max-w-xl mx-auto lg:mx-0 mb-8">
                ML, AI, Quant, Flow, Sentiment & Technical signals converge into higher-conviction setups.
              </p>

              <div className="flex flex-wrap gap-3 justify-center lg:justify-start mb-8">
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
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-sm text-slate-500">
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
                  No credit card
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

                {/* Trade Card Content */}
                <div className="bg-slate-900 p-5">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">
                        NV
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">NVDA</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">BULLISH</span>
                        </div>
                        <span className="text-xs text-slate-500">NVIDIA Corporation</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-emerald-400">87%</div>
                      <span className="text-[10px] text-slate-500">Confidence</span>
                    </div>
                  </div>

                  {/* 6 Engine Scores - Inline */}
                  <div className="flex gap-1.5 mb-4">
                    {[
                      { name: 'ML', score: 92, color: 'text-pink-400 bg-pink-500/10' },
                      { name: 'AI', score: 88, color: 'text-purple-400 bg-purple-500/10' },
                      { name: 'QT', score: 85, color: 'text-blue-400 bg-blue-500/10' },
                      { name: 'FL', score: 91, color: 'text-cyan-400 bg-cyan-500/10' },
                      { name: 'ST', score: 78, color: 'text-amber-400 bg-amber-500/10' },
                      { name: 'TC', score: 89, color: 'text-green-400 bg-green-500/10' },
                    ].map((e) => (
                      <div key={e.name} className={`flex-1 text-center py-1.5 rounded ${e.color}`}>
                        <div className="text-[9px] text-slate-500">{e.name}</div>
                        <div className={`text-sm font-bold ${e.color.split(' ')[0]}`}>{e.score}</div>
                      </div>
                    ))}
                  </div>

                  {/* Signal Details */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 text-xs">
                    <div className="text-center">
                      <div className="text-slate-500">Entry</div>
                      <div className="font-semibold text-white">$142.50</div>
                    </div>
                    <div className="text-center">
                      <div className="text-slate-500">Target</div>
                      <div className="font-semibold text-emerald-400">$158.00</div>
                    </div>
                    <div className="text-center">
                      <div className="text-slate-500">Stop</div>
                      <div className="font-semibold text-red-400">$135.00</div>
                    </div>
                    <div className="text-center">
                      <div className="text-slate-500">R:R</div>
                      <div className="font-semibold text-cyan-400">1:2.1</div>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-center text-xs text-slate-500 mt-3">Real AI-generated trade idea</p>
            </div>
          </div>
        </div>

        {/* Subtle gradient orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      </section>

      {/* Social Proof Strip */}
      <section className="relative py-8 border-y border-slate-800/50 bg-slate-900/20">
        <div className="container mx-auto px-6">
          <p className="text-center text-xs text-slate-500 mb-4 uppercase tracking-wider">Trusted by traders using</p>
          <div className="flex items-center justify-center gap-8 md:gap-12 flex-wrap opacity-50 grayscale">
            {['TradingView', 'Benzinga', 'Bloomberg', 'Yahoo Finance', 'CNBC', 'Investopedia'].map((name) => (
              <span key={name} className="text-sm font-semibold text-slate-400 hover:text-white hover:opacity-100 transition-all cursor-default">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section - Big Impact */}
      <section className="relative py-12">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              { value: '6', label: 'AI Engines', suffix: '' },
              { value: '10K', label: 'Signals Generated', suffix: '+' },
              { value: '24/7', label: 'Market Analysis', suffix: '' },
              { value: '87', label: 'Avg Confidence', suffix: '%' },
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
            <h2 className="text-2xl font-bold mb-2 text-white">Six Engines Working Together</h2>
            <p className="text-sm text-slate-400">Every angle analyzed. Every signal tracked.</p>
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
              { step: '01', title: 'Engines Analyze', desc: 'Six AI engines scan markets 24/7' },
              { step: '02', title: 'Signals Converge', desc: 'Multiple engines agreeing = higher conviction' },
              { step: '03', title: 'You Decide', desc: 'Research delivered. You make the call.' },
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

      {/* Pricing Section - Beta */}
      <section className="py-10" id="pricing" data-testid="section-pricing">
        <div className="container mx-auto px-6">
          <div className="max-w-2xl mx-auto">
            {/* Beta Banner */}
            <div className="text-center mb-6">
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 mb-3">Beta Access</Badge>
              <h2 className="text-2xl font-bold text-white mb-2">Free During Beta</h2>
              <p className="text-sm text-slate-400">Full access to all features while we're in beta.</p>
            </div>

            {/* Two column: Current + Coming Soon */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Free Beta */}
              <div className="rounded-xl border-2 border-cyan-500 bg-gradient-to-b from-cyan-500/10 to-transparent p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-white">Beta Access</h3>
                  <span className="text-2xl font-bold text-white">$0</span>
                </div>
                <ul className="space-y-2 mb-4">
                  {['All 6 research engines', 'Real-time analysis', 'Chart tools', 'Paper trading', 'Discord community'].map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-slate-300">
                      <Check className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Button className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950" onClick={() => setLocation('/signup')}>
                  Get Started Free
                </Button>
              </div>

              {/* Pro Coming Soon */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-5 opacity-75">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-white">Pro</h3>
                  <span className="text-lg text-slate-500">Coming Soon</span>
                </div>
                <ul className="space-y-2 mb-4">
                  {['Priority alerts', 'Auto-Lotto bot', 'API access', 'Advanced screeners', 'Priority support'].map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-slate-500">
                      <Check className="h-3.5 w-3.5 text-slate-600 flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Button variant="outline" className="w-full border-slate-700 text-slate-400" onClick={() => setWaitlistOpen(true)}>
                  Join Waitlist
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-12" data-testid="section-testimonials">
        <div className="container mx-auto px-6">
          <div className="text-center mb-8">
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 mb-3">Success Stories</Badge>
            <h2 className="text-2xl font-bold text-white mb-2">What Traders Say</h2>
            <div className="flex items-center justify-center gap-1 text-amber-400">
              {[1,2,3,4,5].map(i => (
                <svg key={i} className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                  <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                </svg>
              ))}
              <span className="text-sm text-slate-400 ml-2">4.8/5 from beta testers</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {[
              {
                quote: "The 6-engine convergence is genius. When ML, AI, and Flow all agree, those trades have been my best performers this month.",
                name: "Marcus T.",
                handle: "@swingtrader",
                avatar: "MT",
              },
              {
                quote: "Finally a platform that shows me WHY a trade is good, not just 'buy here'. The confidence scores and engine breakdowns are exactly what I needed.",
                name: "Sarah K.",
                handle: "@daytrading_mom",
                avatar: "SK",
              },
              {
                quote: "Switched from TradingView alerts to QuantEdge. The AI analysis catches patterns I miss, and the risk/reward calc saves me from bad entries.",
                name: "James L.",
                handle: "@crypto_james",
                avatar: "JL",
              },
            ].map((testimonial, idx) => (
              <div key={idx} className="p-5 rounded-xl bg-slate-900/50 border border-slate-800/50 hover:border-slate-700 transition-colors">
                <p className="text-sm text-slate-300 mb-4 leading-relaxed">"{testimonial.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{testimonial.name}</p>
                    <p className="text-xs text-slate-500">{testimonial.handle}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-10 bg-slate-900/30 border-y border-slate-800/50" data-testid="section-faq">
        <div className="container mx-auto px-6">
          <h2 className="text-xl font-bold text-center text-white mb-6">FAQ</h2>
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

      {/* Discord + CTA Combined */}
      <section className="py-10" data-testid="section-cta">
        <div className="container mx-auto px-6">
          <div className="max-w-xl mx-auto text-center">
            <h2 className="text-xl font-bold text-white mb-2">Ready to Get an Edge?</h2>
            <p className="text-sm text-slate-400 mb-4">
              Join traders using AI-powered research to level up.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold"
                onClick={() => setLocation('/signup')}
              >
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/10"
                onClick={() => window.open(DISCORD_INVITE_URL, '_blank')}
              >
                <SiDiscord className="mr-2 h-4 w-4" />
                Join Discord
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="pt-12 pb-6 border-t border-slate-800 bg-slate-950">
        <div className="container mx-auto px-6">
          {/* Footer Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
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
                <li><Link href="/risk-disclosure" className="text-xs text-slate-500 hover:text-white transition-colors">Risk Disclosure</Link></li>
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
      {waitlistOpen && <WaitlistPopup onClose={() => setWaitlistOpen(false)} />}
    </div>
  );
}
