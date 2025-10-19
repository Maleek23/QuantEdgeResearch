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

      {/* Why Trust QuantEdge */}
      <section className="container mx-auto px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-display">
              Why Trust <span className="text-gradient-premium">QuantEdge?</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Transparency, real data, and open methodology set us apart from typical trading signal services.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="gradient-border-card card-tilt">
              <Card className="border-0 bg-transparent h-full">
                <CardHeader>
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center mb-4 spotlight">
                    <Activity className="h-8 w-8 text-green-500" />
                  </div>
                  <CardTitle className="text-2xl text-display">Live Performance Tracking</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    Every trade idea is automatically tracked with real-time outcome validation. We show both wins AND losses - no cherry-picking.
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Public performance ledger visible to all users</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Automatic outcome validation (hit target/stop/expired)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>Win rate, profit factor, and drawdown metrics</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="gradient-border-card card-tilt">
              <Card className="border-0 bg-transparent h-full">
                <CardHeader>
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center mb-4 spotlight">
                    <Database className="h-8 w-8 text-blue-500" />
                  </div>
                  <CardTitle className="text-2xl text-display">Real Market Data</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    All prices and market data come from reputable financial APIs - not simulated or manipulated data.
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <span>Yahoo Finance API (unlimited stock data)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <span>CoinGecko Pro API (crypto market rankings)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <span>Alpha Vantage (historical price verification)</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="gradient-border-card card-tilt">
              <Card className="border-0 bg-transparent h-full">
                <CardHeader>
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-4 spotlight">
                    <Shield className="h-8 w-8 text-purple-500" />
                  </div>
                  <CardTitle className="text-2xl text-display">Open Methodology</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    Full transparency on how signals are calculated, weighted, and scored. No black box algorithms.
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                      <span>7-signal quantitative breakdown documented</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                      <span>ML learning weights visible on Signal Intelligence page</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                      <span>Confidence scoring formula explained</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="gradient-border-card card-tilt">
              <Card className="border-0 bg-transparent h-full">
                <CardHeader>
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mb-4 spotlight">
                    <Users className="h-8 w-8 text-amber-500" />
                  </div>
                  <CardTitle className="text-2xl text-display">Community Verification</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    Active Discord community tracks signals in real-time, shares feedback, and validates results.
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>Real traders discussing live signals daily</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>Performance feedback loop improves ML accuracy</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span>Educational focus - learn, don't just follow</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Dual-Engine Architecture */}
      <section className="border-t container mx-auto px-6 py-24">
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

      {/* Data Source Reliability */}
      <section className="container mx-auto px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-display">
              Data Source Reliability
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Real-time market data from industry-leading APIs with detailed update frequencies and reliability metrics.
            </p>
          </div>

          <div className="space-y-6">
            <div className="gradient-border-card">
              <Card className="border-0 bg-transparent">
                <CardHeader>
                  <CardTitle className="text-2xl text-display">Stock Market Data</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="glass-card rounded-xl p-6">
                      <div className="flex items-start gap-4 mb-4">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center flex-shrink-0">
                          <Database className="h-6 w-6 text-blue-500" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-lg mb-1">Yahoo Finance API (Primary)</h4>
                          <p className="text-sm text-muted-foreground">Industry-standard financial data provider</p>
                        </div>
                      </div>
                      <div className="grid md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground mb-1">Update Frequency</div>
                          <div className="font-semibold">Real-time (15-30 sec delay)</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground mb-1">Rate Limit</div>
                          <div className="font-semibold">Unlimited requests</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground mb-1">Coverage</div>
                          <div className="font-semibold">All US stocks & ETFs</div>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t">
                        <div className="text-xs text-muted-foreground"><strong className="text-foreground">Use Cases:</strong> Current prices, market-wide discovery (top gainers/losers/most active), historical OHLCV data, volume analysis</div>
                      </div>
                    </div>

                    <div className="glass-card rounded-xl p-6">
                      <div className="flex items-start gap-4 mb-4">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center flex-shrink-0">
                          <Database className="h-6 w-6 text-purple-500" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-lg mb-1">Alpha Vantage (Fallback)</h4>
                          <p className="text-sm text-muted-foreground">Professional-grade market data</p>
                        </div>
                      </div>
                      <div className="grid md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground mb-1">Update Frequency</div>
                          <div className="font-semibold">Real-time to 1-min delay</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground mb-1">Rate Limit</div>
                          <div className="font-semibold">500 requests/day</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground mb-1">Coverage</div>
                          <div className="font-semibold">Global stocks</div>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t">
                        <div className="text-xs text-muted-foreground"><strong className="text-foreground">Use Cases:</strong> Historical price verification, intraday data cross-validation, technical indicator calculations</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="gradient-border-card">
              <Card className="border-0 bg-transparent">
                <CardHeader>
                  <CardTitle className="text-2xl text-display">Cryptocurrency Data</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="glass-card rounded-xl p-6">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center flex-shrink-0">
                        <Database className="h-6 w-6 text-amber-500" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-lg mb-1">CoinGecko Pro API</h4>
                        <p className="text-sm text-muted-foreground">Leading cryptocurrency market data aggregator</p>
                      </div>
                    </div>
                    <div className="grid md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground mb-1">Update Frequency</div>
                        <div className="font-semibold">Real-time (5-15 sec)</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">Rate Limit</div>
                        <div className="font-semibold">500 calls/min</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">Coverage</div>
                        <div className="font-semibold">10,000+ cryptocurrencies</div>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t">
                      <div className="text-xs text-muted-foreground"><strong className="text-foreground">Use Cases:</strong> Live crypto prices, market cap rankings, 24h volume, trending tokens, historical price data</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="gradient-border-card">
              <Card className="border-0 bg-transparent aurora-bg">
                <CardContent className="p-8">
                  <h3 className="text-xl font-bold mb-4 text-display">Data Quality & Validation</h3>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-semibold mb-1">Cross-Source Validation</div>
                          <p className="text-sm text-muted-foreground">Critical prices verified against multiple sources when available</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-semibold mb-1">Automatic Failover</div>
                          <p className="text-sm text-muted-foreground">Switches to backup data source if primary fails</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-semibold mb-1">Staleness Detection</div>
                          <p className="text-sm text-muted-foreground">Alerts when data is &gt;5 minutes old during market hours</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-semibold mb-1">Cache Management</div>
                          <p className="text-sm text-muted-foreground">30-60 second cache to optimize API usage without sacrificing freshness</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-semibold mb-1">Error Logging</div>
                          <p className="text-sm text-muted-foreground">All API errors tracked for reliability monitoring</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-semibold mb-1">Data Verification Badge</div>
                          <p className="text-sm text-muted-foreground">Glowing badge on UI indicates real-time verified data</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Security Features */}
      <section className="border-t container mx-auto px-6 py-24">
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

      {/* Quantitative Signals Deep Dive */}
      <section className="border-t container mx-auto px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-display">
              7-Signal Quantitative Breakdown
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Detailed technical specifications for each signal our quantitative engine analyzes.
            </p>
          </div>

          <div className="space-y-6">
            <div className="gradient-border-card">
              <Card className="border-0 bg-transparent">
                <CardContent className="p-8">
                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-green-500" />
                        RSI (Relative Strength Index)
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Identifies overbought/oversold conditions on 14-period RSI
                      </p>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li><strong className="text-foreground">Long Signal:</strong> RSI &lt; 35 (oversold bounce potential)</li>
                        <li><strong className="text-foreground">Short Signal:</strong> RSI &gt; 65 (overbought pullback potential)</li>
                        <li><strong className="text-foreground">Timeframes:</strong> 1H, 4H, 1D for confluence</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-blue-500" />
                        MACD Crossover
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Detects momentum shifts via MACD line crossing signal line
                      </p>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li><strong className="text-foreground">Long Signal:</strong> MACD crosses above signal line (bullish momentum)</li>
                        <li><strong className="text-foreground">Short Signal:</strong> MACD crosses below signal line (bearish momentum)</li>
                        <li><strong className="text-foreground">Settings:</strong> 12/26/9 EMA configuration</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-purple-500" />
                        Price Momentum
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Measures rate of price change over recent periods
                      </p>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li><strong className="text-foreground">Calculation:</strong> (Current - 10 periods ago) / 10 periods ago</li>
                        <li><strong className="text-foreground">Threshold:</strong> ±5% momentum for signal activation</li>
                        <li><strong className="text-foreground">Use Case:</strong> Confirms trend strength and continuation</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-amber-500" />
                        Volume Spike Analysis
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Detects unusual trading activity indicating institutional interest
                      </p>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li><strong className="text-foreground">Threshold:</strong> Volume &gt; 1.5x 20-day average</li>
                        <li><strong className="text-foreground">Confirmation:</strong> Requires price movement in same direction</li>
                        <li><strong className="text-foreground">Importance:</strong> High volume = stronger signal conviction</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-red-500" />
                        Volatility Analysis
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Measures price stability using ATR (Average True Range)
                      </p>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li><strong className="text-foreground">ATR Period:</strong> 14-period rolling calculation</li>
                        <li><strong className="text-foreground">High Volatility:</strong> ATR &gt; 1.2x average (wider stops needed)</li>
                        <li><strong className="text-foreground">Position Sizing:</strong> Adjust size based on volatility</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-cyan-500" />
                        Support & Resistance
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Identifies key price levels using pivot points and historical data
                      </p>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li><strong className="text-foreground">Long Signal:</strong> Price bounces off support with volume</li>
                        <li><strong className="text-foreground">Short Signal:</strong> Price rejects resistance with volume</li>
                        <li><strong className="text-foreground">Breakout Mode:</strong> Triggers when price breaks key levels</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-pink-500" />
                        Multi-Timeframe Confluence
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Validates signals across 1H, 4H, and daily timeframes
                      </p>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li><strong className="text-foreground">Minimum Requirement:</strong> 3+ signals aligned across timeframes</li>
                        <li><strong className="text-foreground">Confidence Boost:</strong> +15 points per aligned timeframe</li>
                        <li><strong className="text-foreground">Filters:</strong> Eliminates low-probability noise trades</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="gradient-border-card">
              <Card className="border-0 bg-transparent aurora-bg">
                <CardContent className="p-8">
                  <h3 className="text-2xl font-bold mb-4 text-display">Signal Weighting & Confidence Scoring</h3>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-muted-foreground mb-4">
                        Each signal contributes to a base confidence score (0-100). The ML adaptive learning system then adjusts these weights based on historical performance.
                      </p>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex items-start gap-2">
                          <ChevronRight className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          <span><strong className="text-foreground">Base Score:</strong> Sum of activated signals × base weight</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <ChevronRight className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          <span><strong className="text-foreground">ML Adjustment:</strong> ±20% based on learned signal effectiveness</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <ChevronRight className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          <span><strong className="text-foreground">Min Signals:</strong> Requires 3+ signals to generate idea</span>
                        </li>
                      </ul>
                    </div>
                    <div className="glass-intense rounded-xl p-6">
                      <h4 className="font-bold mb-3">Grade Thresholds</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">A+ Grade:</span> <span className="font-mono">95-100</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">A Grade:</span> <span className="font-mono">90-94</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">B+ Grade:</span> <span className="font-mono">85-89</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">B Grade:</span> <span className="font-mono">80-84</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">C+ Grade:</span> <span className="font-mono">75-79</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">C Grade:</span> <span className="font-mono">70-74</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">D Grade:</span> <span className="font-mono">&lt;70</span></div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ML Adaptive Learning Deep Dive */}
      <section className="border-t aurora-bg py-24">
        <div className="container mx-auto px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold mb-6 text-display">
                Machine Learning Adaptive System
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                How our ML engine learns from historical performance to improve signal accuracy over time.
              </p>
            </div>

            <div className="space-y-8">
              <div className="gradient-border-card">
                <Card className="border-0 bg-transparent">
                  <CardHeader>
                    <CardTitle className="text-2xl text-display">Pattern Recognition Algorithm</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-muted-foreground">
                    <p>
                      The ML system analyzes every closed trade idea (minimum 10 required for statistical significance) and identifies which signals were most predictive of successful outcomes.
                    </p>
                    <div className="grid md:grid-cols-3 gap-6 mt-6">
                      <div className="glass-card rounded-xl p-6">
                        <div className="text-3xl font-bold text-gradient mb-2">Step 1</div>
                        <h4 className="font-bold mb-2">Data Collection</h4>
                        <p className="text-sm">Gathers all closed trades with outcomes (hit_target, hit_stop, expired) and their signal compositions</p>
                      </div>
                      <div className="glass-card rounded-xl p-6">
                        <div className="text-3xl font-bold text-gradient mb-2">Step 2</div>
                        <h4 className="font-bold mb-2">Win Rate Calculation</h4>
                        <p className="text-sm">Calculates win rate for each signal type: RSI wins / RSI total = RSI effectiveness %</p>
                      </div>
                      <div className="glass-card rounded-xl p-6">
                        <div className="text-3xl font-bold text-gradient mb-2">Step 3</div>
                        <h4 className="font-bold mb-2">Weight Adjustment</h4>
                        <p className="text-sm">Boosts weights for high-performing signals, reduces weights for underperforming ones</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="gradient-border-card">
                <Card className="border-0 bg-transparent">
                  <CardHeader>
                    <CardTitle className="text-2xl text-display">Adaptive Confidence Scoring Formula</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="glass-intense rounded-xl p-8 font-mono text-sm">
                      <div className="mb-4 text-foreground">
                        <strong>Base Confidence Score:</strong>
                      </div>
                      <div className="ml-4 mb-6 text-muted-foreground">
                        baseScore = Σ(signal_weight × signal_strength) for all active signals
                      </div>

                      <div className="mb-4 text-foreground">
                        <strong>ML-Adjusted Confidence:</strong>
                      </div>
                      <div className="ml-4 mb-6 text-muted-foreground">
                        adjustedScore = baseScore × (1 + ml_adjustment_factor)
                        <br />
                        where ml_adjustment_factor = (signal_win_rate - 50%) / 2.5
                      </div>

                      <div className="mb-4 text-foreground">
                        <strong>Example Calculation:</strong>
                      </div>
                      <div className="ml-4 text-muted-foreground">
                        RSI signal (70% historical win rate): +8% confidence boost
                        <br />
                        MACD signal (45% historical win rate): -2% confidence penalty
                        <br />
                        Volume signal (60% win rate): +4% confidence boost
                      </div>
                    </div>
                    <div className="mt-6 p-6 glass-card rounded-xl">
                      <p className="text-sm text-muted-foreground">
                        <strong className="text-foreground">Minimum Data Requirement:</strong> The ML system requires at least 10 closed trades before applying learned weights. Until then, it uses baseline equal weights for all signals.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="gradient-border-card">
                <Card className="border-0 bg-transparent aurora-bg">
                  <CardHeader>
                    <CardTitle className="text-2xl text-display">Continuous Improvement Loop</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <p className="text-muted-foreground">
                        Every time a trade idea closes (target hit, stop hit, or expiration), the ML system re-analyzes all historical data and updates signal weights. This creates a continuous feedback loop that improves accuracy over time.
                      </p>
                      <div className="grid md:grid-cols-2 gap-4 mt-6">
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center flex-shrink-0">
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          </div>
                          <div>
                            <h4 className="font-bold mb-1">Real-Time Learning</h4>
                            <p className="text-sm text-muted-foreground">Weights update immediately after each trade closes</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center flex-shrink-0">
                            <TrendingUp className="h-5 w-5 text-blue-500" />
                          </div>
                          <div>
                            <h4 className="font-bold mb-1">Market Adaptation</h4>
                            <p className="text-sm text-muted-foreground">Adjusts to changing market conditions automatically</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center flex-shrink-0">
                            <Database className="h-5 w-5 text-purple-500" />
                          </div>
                          <div>
                            <h4 className="font-bold mb-1">Historical Analysis</h4>
                            <p className="text-sm text-muted-foreground">Learns from every past trade, not just recent ones</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center flex-shrink-0">
                            <Activity className="h-5 w-5 text-amber-500" />
                          </div>
                          <div>
                            <h4 className="font-bold mb-1">Transparency</h4>
                            <p className="text-sm text-muted-foreground">View learned weights on Signal Intelligence page</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How Trade Ideas Are Generated */}
      <section className="border-t py-24">
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
