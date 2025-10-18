import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { 
  Brain, 
  Calculator, 
  Shield,
  Activity,
  TrendingUp,
  Lock,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Database,
  Cloud,
  Users,
  ArrowRight,
  Key,
  ChevronRight,
  Sparkles,
  MessageCircle,
  Check
} from "lucide-react";

export default function LearnMore() {
  const [, setLocation] = useLocation();

  const architectureFeatures = [
    {
      icon: Brain,
      title: "AI Engine",
      description: "Multi-provider fallback system (Claude Sonnet 4, GPT-5, Gemini 2.5) for intelligent market analysis with contextual reasoning.",
      color: "from-blue-500/20 to-cyan-500/20"
    },
    {
      icon: Calculator,
      title: "Quantitative Engine",
      description: "7-signal technical analysis engine: RSI, MACD, Momentum, Volume, Multi-timeframe confluence, Volatility, and Support/Resistance.",
      color: "from-green-500/20 to-emerald-500/20"
    },
    {
      icon: Database,
      title: "Real Market Data",
      description: "Yahoo Finance for stocks (unlimited), CoinGecko for crypto, Alpha Vantage fallback. Dynamic market-wide discovery scans entire markets.",
      color: "from-purple-500/20 to-pink-500/20"
    },
    {
      icon: TrendingUp,
      title: "ML Adaptive Learning",
      description: "Machine learning analyzes historical performance, identifies winning patterns, and adjusts confidence scores based on signal effectiveness.",
      color: "from-amber-500/20 to-orange-500/20"
    }
  ];

  const securityFeatures = [
    "Discord community-based membership management",
    "Role-based access control (Free vs Premium tiers)",
    "No passwords stored - Discord handles all authentication",
    "Automatic tier tracking via Discord roles",
    "Secure payment processing for Premium subscriptions",
    "User data isolation and privacy protection"
  ];

  const disclaimers = [
    "This platform is for EDUCATIONAL and RESEARCH purposes only",
    "Not financial advice, investment recommendation, or trading strategy",
    "Past performance does not guarantee future results",
    "All trading involves risk - you can lose 100% of invested capital",
    "Consult a licensed financial advisor before making trading decisions",
    "ML signals are probabilistic, not deterministic guarantees"
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="border-b aurora-hero relative overflow-hidden">
        <div className="container mx-auto px-6 py-28">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="secondary" className="mb-8 badge-shimmer neon-accent">
              <Activity className="h-3 w-3 mr-1" />
              Platform Documentation
            </Badge>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-8 text-display animate-fade-up">
              How <span className="text-gradient-premium">QuantEdge</span> Works
            </h1>
            <p className="text-xl text-muted-foreground mb-12 leading-relaxed animate-fade-up animate-delay-100">
              A comprehensive guide to our dual-engine quantitative trading research platform, 
              authentication system, and educational approach to market analysis.
            </p>
            <div className="flex flex-wrap gap-4 justify-center animate-fade-up animate-delay-200">
              <Button 
                onClick={() => window.location.href = 'https://discord.gg/quantedge'}
                data-testid="button-get-started"
                className="btn-magnetic px-8 py-6 text-lg neon-accent"
              >
                Join Discord
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
              <Button 
                variant="outline"
                onClick={() => setLocation('/')}
                data-testid="button-back-home"
                className="btn-magnetic px-8 py-6 text-lg glass-card"
              >
                Back to Home
              </Button>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px divider-premium" />
      </section>

      {/* Dual-Engine Architecture */}
      <section className="container mx-auto px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-display">
              Dual-Engine Architecture
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              QuantEdge combines AI-powered analysis with pure quantitative signals to provide 
              multiple perspectives on market opportunities.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {architectureFeatures.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div key={idx} className="gradient-border-card card-tilt" data-testid={`card-architecture-${idx}`}>
                  <Card className="border-0 bg-transparent h-full">
                    <CardHeader>
                      <div className={`h-16 w-16 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 spotlight`}>
                        <Icon className="h-8 w-8 text-primary" />
                      </div>
                      <CardTitle className="text-2xl text-display">{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Authentication Flow */}
      <section className="border-t aurora-bg py-24">
        <div className="container mx-auto px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 glass-intense px-6 py-3 rounded-full mb-6 neon-cyan-glow">
                <MessageCircle className="h-5 w-5 text-cyan-500" />
                <span className="font-semibold">Discord Community-Powered</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6 text-display">
                Join Our Discord Community
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                All membership tiers are managed through our Discord server. Join to access premium signals, 
                analytics, and connect with fellow traders.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-16">
              <div className="text-center">
                <div className="h-20 w-20 rounded-3xl glass-intense flex items-center justify-center text-3xl font-bold mx-auto neon-cyan-glow mb-6">1</div>
                <h3 className="font-bold mb-2 text-display">Join Discord</h3>
                <p className="text-sm text-muted-foreground">Click the invite link to join our community server</p>
              </div>
              <div className="text-center">
                <div className="h-20 w-20 rounded-3xl glass-intense flex items-center justify-center text-3xl font-bold mx-auto neon-cyan-glow mb-6">2</div>
                <h3 className="font-bold mb-2 text-display">Choose Tier</h3>
                <p className="text-sm text-muted-foreground">Free access or Premium ($39.99/mo) for live signals</p>
              </div>
              <div className="text-center">
                <div className="h-20 w-20 rounded-3xl glass-intense flex items-center justify-center text-3xl font-bold mx-auto neon-cyan-glow mb-6">3</div>
                <h3 className="font-bold mb-2 text-display">Get Access</h3>
                <p className="text-sm text-muted-foreground">Receive your role and access premium channels</p>
              </div>
            </div>

            <div className="gradient-border-card">
              <Card className="border-0 bg-transparent aurora-bg">
                <CardContent className="p-10">
                  <div className="flex items-start gap-6 mb-8">
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0 spotlight">
                      <MessageCircle className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold mb-3 text-display">Membership Tiers</h3>
                      <p className="text-muted-foreground">
                        Choose the tier that works best for your trading research needs
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-6 mb-8">
                    <div className="glass-card rounded-xl p-6">
                      <h4 className="font-bold text-xl mb-2">Free Tier</h4>
                      <div className="text-3xl font-bold text-gradient mb-4">$0/mo</div>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>View public performance ledger</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>Access historical trade ideas archive</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>Basic market data and tools</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>Community Discord access</span>
                        </li>
                      </ul>
                    </div>
                    <div className="glass-card rounded-xl p-6 border-2 border-primary/30">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-xl">Premium Tier</h4>
                        <Badge className="badge-shimmer">Popular</Badge>
                      </div>
                      <div className="text-3xl font-bold text-gradient mb-4">$39.99/mo</div>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>Everything in Free</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>Real-time trade signals (AI + Quant)</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>Instant Discord alerts</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>Advanced analytics & ML insights</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>Premium Discord channels</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="glass-intense rounded-xl p-6">
                    <p className="text-sm text-muted-foreground">
                      <strong className="text-foreground">How it works:</strong> Join our Discord server, subscribe to the Premium tier via payment link, 
                      and you'll automatically receive the Premium role with access to exclusive channels and features.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Security Features */}
      <section className="container mx-auto px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-display">
              Security & Privacy
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Enterprise-grade security features to protect your data and trading activity.
            </p>
          </div>

          <div className="gradient-border-card">
            <Card className="border-0 bg-transparent">
              <CardContent className="p-10">
                <div className="grid md:grid-cols-2 gap-6">
                  {securityFeatures.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-3" data-testid={`security-${idx}`}>
                      <CheckCircle2 className="h-6 w-6 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How Trade Ideas Are Generated */}
      <section className="border-t aurora-bg py-24">
        <div className="container mx-auto px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-6 text-display">
                Trade Idea Generation Process
              </h2>
            </div>

            <div className="space-y-8">
              <div className="gradient-border-card card-tilt">
                <Card className="border-0 bg-transparent">
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center spotlight">
                        <Brain className="h-7 w-7 text-blue-500" />
                      </div>
                      <CardTitle className="text-2xl text-display">AI Engine Process</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-muted-foreground">
                    <p><strong className="text-foreground">1. Market Discovery:</strong> Scans entire stock market via Yahoo Finance screener (top gainers, losers, most active) + CoinGecko rankings for crypto gems</p>
                    <p><strong className="text-foreground">2. AI Analysis:</strong> Sends market data to Claude/GPT/Gemini for deep analysis of patterns, catalysts, momentum, volume</p>
                    <p><strong className="text-foreground">3. Risk Calculation:</strong> AI determines entry price, target, stop-loss, position size, and risk:reward ratio</p>
                    <p><strong className="text-foreground">4. Quality Grading:</strong> Assigns confidence score and quality grade (A+ to F) based on signal strength</p>
                  </CardContent>
                </Card>
              </div>

              <div className="gradient-border-card card-tilt">
                <Card className="border-0 bg-transparent">
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center spotlight">
                        <Calculator className="h-7 w-7 text-green-500" />
                      </div>
                      <CardTitle className="text-2xl text-display">Quantitative Engine Process</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-muted-foreground">
                    <p><strong className="text-foreground">1. Signal Calculation:</strong> Computes RSI, MACD, momentum, volume spike, volatility, support/resistance for every discovered asset</p>
                    <p><strong className="text-foreground">2. ML Weight Application:</strong> Applies learned weights from historical performance - high-performing signals boost confidence</p>
                    <p><strong className="text-foreground">3. Multi-Timeframe Confluence:</strong> Validates signals across multiple timeframes (1H, 4H, 1D) for higher probability setups</p>
                    <p><strong className="text-foreground">4. Filtering & Ranking:</strong> Only surfaces ideas with 3+ quality signals, ranked by ML-adjusted confidence score</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Disclaimers */}
      <section className="container mx-auto px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="gradient-border-card">
            <Card className="border-0 bg-transparent border-amber-500/30">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <AlertTriangle className="h-8 w-8 text-amber-500" />
                  <CardTitle className="text-2xl text-amber-500 text-display">Important Disclaimers</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {disclaimers.map((disclaimer, idx) => (
                  <div key={idx} className="flex items-start gap-3" data-testid={`disclaimer-${idx}`}>
                    <div className="h-2 w-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                    <p className="text-muted-foreground">{disclaimer}</p>
                  </div>
                ))}
                
                <div className="mt-8 glass-intense rounded-xl p-6">
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">Platform Purpose:</strong> QuantEdge Research is designed 
                    as an educational tool for learning about quantitative analysis, technical indicators, and 
                    AI-assisted market research. All generated ideas should be thoroughly researched and validated 
                    independently before any trading decisions are made.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="gradient-border-card">
            <Card className="border-0 bg-transparent aurora-bg vignette">
              <CardContent className="p-16 text-center relative z-10">
                <h2 className="text-4xl md:text-5xl font-bold mb-6 text-display">
                  Ready to <span className="text-gradient-premium">Get Started?</span>
                </h2>
                <p className="text-lg text-muted-foreground mb-10 max-w-3xl mx-auto leading-relaxed">
                  Sign up with your preferred authentication method and start exploring 
                  quantitative trading research today.
                </p>
                <Button 
                  size="lg"
                  onClick={() => window.location.href = 'https://discord.gg/quantedge'}
                  data-testid="button-cta-join-discord"
                  className="btn-magnetic px-10 py-7 text-lg neon-accent"
                >
                  <MessageCircle className="h-5 w-5 mr-2" />
                  Join Discord Community
                  <Sparkles className="h-5 w-5 ml-2" />
                </Button>
                <p className="text-sm text-muted-foreground/70 mt-6">
                  Free access available • Premium: $39.99/month • Discord-managed membership
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container mx-auto px-6 text-center">
          <div className="mb-4">
            <span className="text-2xl font-bold text-gradient-premium">QuantEdge</span>
          </div>
          <p className="text-sm text-muted-foreground mb-2">© 2025 QuantEdge Research. All rights reserved.</p>
          <p className="text-xs text-muted-foreground/70">Educational platform for trading research and analysis.</p>
        </div>
      </footer>
    </div>
  );
}
