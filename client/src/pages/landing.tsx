import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Footer } from "@/components/footer";
import { ParticleBackground } from "@/components/particle-background";
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
  ArrowRight,
  Book,
  Network,
  Cpu,
  GitBranch
} from "lucide-react";
import quantEdgeLogoUrl from "@assets/image (1)_1761160822785.png";
import { UntitldLogo } from "@/components/untitld-logo";

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
        <ParticleBackground />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background opacity-50" />
        
        <div className="container relative mx-auto px-6 py-16 md:py-24 text-center">
          <Badge variant="secondary" className="mb-8 badge-shimmer neon-accent transition-spring">
            <Zap className="h-3 w-3 mr-1" />
            Dual-Engine Architecture: AI + Quantitative
          </Badge>
          
          {/* QuantEdge Logo + UN/TITLD Branding - Professional Lockup */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8 mb-10 animate-fade-up">
            <img 
              src={quantEdgeLogoUrl} 
              alt="QuantEdge" 
              className="h-36 w-36 md:h-44 md:w-44 object-contain drop-shadow-2xl"
            />
            
            {/* Vertical divider on desktop */}
            <div className="hidden md:block w-px h-16 bg-gradient-to-b from-transparent via-border to-transparent" />
            
            {/* Studio credit with proper hierarchy */}
            <div className="flex flex-col items-center md:items-start gap-1.5">
              <span className="text-xs md:text-sm text-muted-foreground/70 tracking-[0.24em] uppercase font-medium">
                by
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-lg md:text-xl font-semibold text-foreground tracking-tight">UN</span>
                <span className="text-lg md:text-xl font-bold text-muted-foreground/40">/</span>
                <span className="text-lg md:text-xl font-semibold text-foreground tracking-tight">TITLD</span>
              </div>
            </div>
          </div>
          
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
              onClick={() => setLocation('/learn-more')}
              data-testid="button-learn-more"
              className="btn-magnetic glass-card"
            >
              <Book className="h-4 w-4 mr-2" />
              Learn More
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
