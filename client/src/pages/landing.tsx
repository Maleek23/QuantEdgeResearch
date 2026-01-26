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

      {/* Hero Section - Clean & Modern */}
      <section className="relative pt-24 pb-8" data-testid="hero-section">
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

      {/* Hero Visual - Animated Hexagon Engine Diagram */}
      <section className="relative py-8">
        <div className="container mx-auto px-6">
          <div className="max-w-sm mx-auto">
            {/* Hexagon Engine Visualization */}
            <div className="relative aspect-square max-w-[320px] mx-auto">
              {/* Ambient glow */}
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-pink-500/10 blur-3xl rounded-full" />

              {/* SVG Hexagon with connecting lines */}
              <svg viewBox="0 0 400 400" className="w-full h-full relative z-10">
                {/* Connecting lines from engines to center */}
                {[0, 60, 120, 180, 240, 300].map((angle, i) => {
                  const radians = (angle - 90) * (Math.PI / 180);
                  const x = 200 + 130 * Math.cos(radians);
                  const y = 200 + 130 * Math.sin(radians);
                  const colors = ['#ec4899', '#a855f7', '#3b82f6', '#06b6d4', '#f59e0b', '#22c55e'];
                  return (
                    <line
                      key={angle}
                      x1={x}
                      y1={y}
                      x2="200"
                      y2="200"
                      stroke={colors[i]}
                      strokeWidth="1"
                      strokeOpacity="0.3"
                      className="animate-pulse"
                      style={{ animationDelay: `${i * 0.2}s` }}
                    />
                  );
                })}

                {/* Hexagon outline */}
                <polygon
                  points="200,70 313,135 313,265 200,330 87,265 87,135"
                  fill="none"
                  stroke="rgba(6,182,212,0.2)"
                  strokeWidth="1"
                />

                {/* Center glow circle */}
                <circle cx="200" cy="200" r="50" fill="url(#centerGlow)" className="animate-pulse" />
                <circle cx="200" cy="200" r="40" fill="rgba(6,182,212,0.1)" stroke="rgba(6,182,212,0.3)" strokeWidth="2" />

                {/* Center score */}
                <text x="200" y="195" textAnchor="middle" className="fill-white text-3xl font-bold">87</text>
                <text x="200" y="218" textAnchor="middle" className="fill-slate-400 text-xs">EDGE SCORE</text>

                {/* Gradient definitions */}
                <defs>
                  <radialGradient id="centerGlow">
                    <stop offset="0%" stopColor="rgba(6,182,212,0.3)" />
                    <stop offset="100%" stopColor="transparent" />
                  </radialGradient>
                </defs>
              </svg>

              {/* Engine nodes positioned absolutely */}
              {[
                { name: 'ML', score: 92, color: 'pink', angle: -90 },
                { name: 'AI', score: 88, color: 'purple', angle: -30 },
                { name: 'Quant', score: 85, color: 'blue', angle: 30 },
                { name: 'Flow', score: 91, color: 'cyan', angle: 90 },
                { name: 'Sent', score: 78, color: 'amber', angle: 150 },
                { name: 'Tech', score: 89, color: 'green', angle: 210 },
              ].map((engine, i) => {
                const radians = engine.angle * (Math.PI / 180);
                const x = 50 + 32.5 * Math.cos(radians); // Percentage positioning
                const y = 50 + 32.5 * Math.sin(radians);
                const colorMap: Record<string, { bg: string; border: string; text: string; glow: string }> = {
                  pink: { bg: 'bg-pink-500/20', border: 'border-pink-500/50', text: 'text-pink-400', glow: 'shadow-pink-500/20' },
                  purple: { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400', glow: 'shadow-purple-500/20' },
                  blue: { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400', glow: 'shadow-blue-500/20' },
                  cyan: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/50', text: 'text-cyan-400', glow: 'shadow-cyan-500/20' },
                  amber: { bg: 'bg-amber-500/20', border: 'border-amber-500/50', text: 'text-amber-400', glow: 'shadow-amber-500/20' },
                  green: { bg: 'bg-green-500/20', border: 'border-green-500/50', text: 'text-green-400', glow: 'shadow-green-500/20' },
                };
                const colors = colorMap[engine.color];
                return (
                  <div
                    key={engine.name}
                    className={`absolute w-14 h-14 -translate-x-1/2 -translate-y-1/2 rounded-lg ${colors.bg} ${colors.border} border backdrop-blur-sm flex flex-col items-center justify-center shadow-lg ${colors.glow}`}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                    }}
                  >
                    <span className="text-[9px] text-slate-400 font-medium">{engine.name}</span>
                    <span className={`text-base font-bold ${colors.text}`}>{engine.score}</span>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-sm text-slate-500 mt-6">
              Six engines. One converged edge score.
            </p>
          </div>
        </div>
      </section>

      {/* Stats Strip */}
      <div className="relative py-4 border-y border-slate-800/50 bg-slate-900/30">
        <div className="container mx-auto px-6">
          <div className="flex justify-center gap-8 md:gap-12">
            {[
              { value: '6', label: 'AI Engines' },
              { value: '24/7', label: 'Analysis' },
              { value: '<1s', label: 'Speed' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-xl font-bold text-white">{stat.value}</div>
                <p className="text-xs text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

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
