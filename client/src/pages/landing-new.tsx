import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ArrowRight, Play, ChevronRight, Sparkles, Brain, BarChart3, Zap, Shield } from "lucide-react";
import { SiDiscord } from "react-icons/si";
import quantEdgeLabsLogoUrl from "@assets/q_1767502987714.png";
import { WaitlistPopup } from "@/components/waitlist-popup";
import { useAuth } from "@/hooks/useAuth";

const DISCORD_INVITE_URL = "https://discord.gg/3QF8QEKkYq";

export default function LandingNew() {
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white overflow-hidden">
      {/* Subtle grid pattern overlay */}
      <div
        className="fixed inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      {/* Gradient orbs */}
      <div className="fixed top-0 right-0 w-[800px] h-[800px] bg-gradient-to-br from-teal-500/10 via-cyan-500/5 to-transparent rounded-full blur-3xl" />
      <div className="fixed bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-blue-500/10 via-indigo-500/5 to-transparent rounded-full blur-3xl" />

      {/* Minimal Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <img src={quantEdgeLabsLogoUrl} alt="QuantEdge" className="h-10 w-10" />
              <span className="text-lg font-semibold tracking-tight">QuantEdge</span>
            </Link>

            <nav className="hidden md:flex items-center gap-8">
              <Link href="/features" className="text-sm text-slate-400 hover:text-white transition-colors">
                Features
              </Link>
              <Link href="/academy" className="text-sm text-slate-400 hover:text-white transition-colors">
                Academy
              </Link>
              <Link href="/about" className="text-sm text-slate-400 hover:text-white transition-colors">
                About
              </Link>
            </nav>

            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-slate-400 hover:text-white"
                onClick={() => window.open(DISCORD_INVITE_URL, '_blank')}
              >
                <SiDiscord className="h-4 w-4" />
              </Button>
              {isAuthenticated ? (
                <Link href="/trade-desk">
                  <Button className="bg-white text-black hover:bg-slate-200 font-medium px-5">
                    Dashboard
                  </Button>
                </Link>
              ) : (
                <Link href="/login">
                  <Button variant="outline" className="border-slate-700 hover:bg-slate-800 font-medium px-5">
                    Sign In
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center pt-20">
        <div className="max-w-7xl mx-auto px-8 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: Typography */}
            <div className="relative z-10">
              {/* Small badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-slate-300 mb-8">
                <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                6-Engine AI Analysis
              </div>

              {/* Main headline */}
              <h1 className="text-6xl sm:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.9] mb-8">
                Find Your
                <br />
                <span className="bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  Edge.
                </span>
              </h1>

              <p className="text-xl text-slate-400 max-w-lg mb-10 leading-relaxed">
                AI-powered trading research that combines machine learning, sentiment analysis, and order flow into actionable insights.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap gap-4">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold h-14 px-8 text-base"
                  onClick={() => setWaitlistOpen(true)}
                >
                  Get Early Access
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="border-slate-700 hover:bg-white/5 h-14 px-8 text-base"
                >
                  <Play className="mr-2 h-5 w-5" />
                  Watch Demo
                </Button>
              </div>

              {/* Social proof */}
              <div className="flex items-center gap-6 mt-12 pt-8 border-t border-slate-800/50">
                <div>
                  <div className="text-2xl font-bold">2,400+</div>
                  <div className="text-sm text-slate-500">Beta Users</div>
                </div>
                <div className="w-px h-10 bg-slate-800" />
                <div>
                  <div className="text-2xl font-bold">94%</div>
                  <div className="text-sm text-slate-500">Accuracy Rate</div>
                </div>
                <div className="w-px h-10 bg-slate-800" />
                <div>
                  <div className="text-2xl font-bold">6</div>
                  <div className="text-sm text-slate-500">AI Engines</div>
                </div>
              </div>
            </div>

            {/* Right: 3D Visual / Spline Embed */}
            <div className="relative h-[600px] flex items-center justify-center">
              {/* Placeholder for Spline - using CSS 3D effect for now */}
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Geometric shape composition */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {/* Main crystal/gem shape */}
                  <div className="relative">
                    {/* Outer glow */}
                    <div className="absolute inset-0 w-80 h-80 bg-gradient-to-br from-teal-500/30 to-cyan-500/30 rounded-3xl blur-3xl animate-pulse" />

                    {/* Main shape - rotated square (diamond) */}
                    <div
                      className="relative w-72 h-72 rounded-3xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/10 backdrop-blur-sm"
                      style={{ transform: 'rotate(45deg)' }}
                    >
                      {/* Inner glow */}
                      <div className="absolute inset-4 rounded-2xl bg-gradient-to-br from-teal-500/10 to-cyan-500/10 border border-teal-500/20" />

                      {/* Center content - rotated back */}
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ transform: 'rotate(-45deg)' }}
                      >
                        <div className="text-center">
                          <div className="text-6xl font-bold bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent mb-2">
                            A+
                          </div>
                          <div className="text-sm text-slate-400">AI Grade</div>
                        </div>
                      </div>
                    </div>

                    {/* Floating accent shapes */}
                    <div className="absolute -top-8 -right-8 w-16 h-16 rounded-xl bg-gradient-to-br from-teal-500/40 to-teal-600/40 border border-teal-500/30 rotate-12 animate-float" />
                    <div className="absolute -bottom-6 -left-6 w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500/40 to-blue-500/40 border border-cyan-500/30 -rotate-12 animate-float-delayed" />
                    <div className="absolute top-1/2 -right-16 w-8 h-8 rounded-md bg-gradient-to-br from-blue-500/40 to-indigo-500/40 border border-blue-500/30 rotate-45" />
                  </div>
                </div>

                {/* Floating data cards */}
                <div className="absolute top-20 left-0 p-4 rounded-2xl bg-slate-900/80 border border-slate-700/50 backdrop-blur-sm animate-float">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
                      <Brain className="w-5 h-5 text-teal-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">ML Prediction</div>
                      <div className="text-xs text-slate-500">87% Confidence</div>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-24 right-0 p-4 rounded-2xl bg-slate-900/80 border border-slate-700/50 backdrop-blur-sm animate-float-delayed">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">Flow Analysis</div>
                      <div className="text-xs text-slate-500">Bullish Signal</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-500">
          <span className="text-xs uppercase tracking-widest">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-slate-500 to-transparent" />
        </div>
      </section>

      {/* Features Section - Bento Grid */}
      <section className="relative py-32" id="features">
        <div className="max-w-7xl mx-auto px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold mb-4">
              Powered by <span className="text-teal-400">Intelligence</span>
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Six specialized AI engines working together to find high-conviction trading opportunities.
            </p>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Large feature card */}
            <div className="lg:col-span-2 lg:row-span-2 p-8 rounded-3xl bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-slate-800/50 backdrop-blur-sm group hover:border-teal-500/30 transition-all">
              <div className="h-full flex flex-col">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Brain className="w-7 h-7 text-teal-400" />
                </div>
                <h3 className="text-2xl font-bold mb-3">6-Engine AI Analysis</h3>
                <p className="text-slate-400 mb-8 flex-grow">
                  Our proprietary system combines ML predictions, sentiment analysis, technical patterns, order flow, fundamental data, and quant models into a unified confidence score.
                </p>
                <div className="grid grid-cols-3 gap-4">
                  {['ML/AI', 'Sentiment', 'Technical', 'Flow', 'Fundamental', 'Quant'].map((engine) => (
                    <div key={engine} className="p-3 rounded-xl bg-slate-800/50 text-center">
                      <div className="text-xs text-slate-400">{engine}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Small feature cards */}
            <div className="p-6 rounded-3xl bg-slate-900/50 border border-slate-800/50 backdrop-blur-sm hover:border-cyan-500/30 transition-all">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-cyan-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Real-Time Signals</h3>
              <p className="text-sm text-slate-400">
                Get instant alerts when high-conviction opportunities emerge across markets.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-slate-900/50 border border-slate-800/50 backdrop-blur-sm hover:border-blue-500/30 transition-all">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Risk Management</h3>
              <p className="text-sm text-slate-400">
                Every idea includes calculated entry, target, and stop-loss levels.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-slate-900/50 border border-slate-800/50 backdrop-blur-sm hover:border-purple-500/30 transition-all">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Paper Trading</h3>
              <p className="text-sm text-slate-400">
                Practice strategies risk-free before committing real capital.
              </p>
            </div>

            <div className="lg:col-span-2 p-6 rounded-3xl bg-gradient-to-r from-teal-500/10 to-cyan-500/10 border border-teal-500/20 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold mb-1">Ready to find your edge?</h3>
                  <p className="text-sm text-slate-400">Join 2,400+ traders using AI-powered research.</p>
                </div>
                <Button
                  className="bg-white text-black hover:bg-slate-200 font-medium"
                  onClick={() => setWaitlistOpen(true)}
                >
                  Get Started
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Simple CTA Section */}
      <section className="relative py-32">
        <div className="max-w-4xl mx-auto px-8 text-center">
          <h2 className="text-5xl sm:text-6xl font-bold mb-6">
            Start Trading
            <br />
            <span className="bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">Smarter.</span>
          </h2>
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
            Join the waitlist for early access to our AI-powered trading research platform.
          </p>
          <Button
            size="lg"
            className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-black font-semibold h-14 px-10 text-base"
            onClick={() => setWaitlistOpen(true)}
          >
            Join Beta Waitlist
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="border-t border-slate-800/50 py-8">
        <div className="max-w-7xl mx-auto px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={quantEdgeLabsLogoUrl} alt="QuantEdge" className="h-8 w-8" />
              <span className="text-sm text-slate-500">© 2025 Quant Edge Labs. Not financial advice.</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/privacy" className="text-sm text-slate-500 hover:text-white">Privacy</Link>
              <Link href="/terms" className="text-sm text-slate-500 hover:text-white">Terms</Link>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-500 hover:text-white"
                onClick={() => window.open(DISCORD_INVITE_URL, '_blank')}
              >
                <SiDiscord className="h-4 w-4 mr-2" />
                Discord
              </Button>
            </div>
          </div>
        </div>
      </footer>

      {/* Waitlist Popup */}
      <WaitlistPopup open={waitlistOpen} onOpenChange={setWaitlistOpen} />

      {/* Floating animation styles */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(12deg); }
          50% { transform: translateY(-10px) rotate(12deg); }
        }
        @keyframes float-delayed {
          0%, 100% { transform: translateY(0px) rotate(-12deg); }
          50% { transform: translateY(-8px) rotate(-12deg); }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
        .animate-float-delayed {
          animation: float-delayed 4s ease-in-out infinite;
          animation-delay: 1s;
        }
      `}</style>
    </div>
  );
}
