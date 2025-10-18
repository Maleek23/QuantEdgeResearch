import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
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
  ArrowRight
} from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();

  const features = [
    {
      icon: Brain,
      title: "AI-Powered Analysis",
      description: "Multi-provider AI (Claude, GPT, Gemini) generates trade ideas with comprehensive market analysis and risk assessment.",
      color: "text-blue-500"
    },
    {
      icon: Calculator,
      title: "Quantitative Signals",
      description: "Rules-based 7-signal engine using RSI, MACD, momentum, volume, and multi-timeframe analysis for pure quant opportunities.",
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
      title: "Connect Market Data",
      description: "Live prices stream from stocks, options, and crypto markets with 30-second refresh intervals.",
      icon: Activity
    },
    {
      number: 2,
      title: "Generate Ideas",
      description: "Choose AI-powered analysis or quantitative signals. Platform creates opportunities with complete risk parameters.",
      icon: Sparkles
    },
    {
      number: 3,
      title: "Analyze Trades",
      description: "Review entry/target/stop levels, confidence scores, quality signals, and explainability features for each idea.",
      icon: Brain
    },
    {
      number: 4,
      title: "Track Performance",
      description: "Record outcomes, monitor active positions, and refine your strategy based on historical performance data.",
      icon: TrendingUp
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Cinematic Hero Section with Aurora Background */}
      <section className="relative overflow-hidden border-b aurora-hero">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background opacity-50" />
        
        <div className="container relative mx-auto px-6 py-16 md:py-20 text-center">
          <Badge variant="secondary" className="mb-6 badge-shimmer neon-accent transition-spring">
            <Zap className="h-3 w-3 mr-1" />
            Dual-Engine Architecture: AI + Quantitative
          </Badge>
          
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 text-display animate-fade-up">
            <span className="text-gradient-premium">QuantEdge</span>
            <br />
            <span className="text-foreground">Research Platform</span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed animate-fade-up animate-delay-100">
            Discover day-trading opportunities across US equities, options, and crypto markets. 
            Real market data, transparent explainability, professional-grade risk management.
          </p>

          <div className="flex flex-wrap gap-3 justify-center mb-8 animate-fade-up animate-delay-200">
            <Button 
              onClick={() => setLocation('/dashboard')}
              data-testid="button-enter-platform"
              className="btn-magnetic neon-accent"
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Enter Platform
            </Button>
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
              <div className="text-2xl font-bold text-gradient mb-1">8</div>
              <div className="text-xs text-muted-foreground">Signal Types</div>
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

      {/* How It Works - Premium Timeline */}
      <section className="border-t aurora-bg py-12 md:py-16">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-display">
              How It Works
            </h2>
            <p className="text-base text-muted-foreground max-w-2xl mx-auto">
              From market data to trade execution in four simple steps
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.number} className="text-center relative" data-testid={`step-${step.number}`}>
                  <div className="relative mb-8 inline-block">
                    <div className="h-24 w-24 rounded-3xl glass-intense flex items-center justify-center text-3xl font-bold mx-auto neon-cyan-glow">
                      {step.number}
                    </div>
                    <div className="absolute -top-3 -right-3 h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center spotlight">
                      <Icon className="h-6 w-6 text-white" />
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
      <section className="container mx-auto px-6 py-24">
        <div className="gradient-border-card">
          <Card className="border-0 bg-transparent aurora-bg vignette">
            <CardContent className="p-16 text-center relative z-10">
              <h2 className="text-4xl md:text-5xl font-bold mb-6 text-display">
                Ready to Start Trading <span className="text-gradient-premium">Smarter?</span>
              </h2>
              <p className="text-lg text-muted-foreground mb-10 max-w-3xl mx-auto leading-relaxed">
                Access dual-engine trade idea generation, real-time market analysis, and professional risk management tools. 
                Educational research platform for active traders.
              </p>
              <Button 
                size="lg" 
                onClick={() => setLocation('/dashboard')}
                data-testid="button-cta-launch-dashboard"
                className="btn-magnetic px-10 py-7 text-lg neon-accent"
              >
                <Sparkles className="h-5 w-5 mr-2" />
                Launch Dashboard
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
              <p className="text-xs text-muted-foreground mt-6 opacity-70">
                ⚠️ For educational and research purposes only. Not financial advice.
              </p>
            </CardContent>
          </Card>
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
