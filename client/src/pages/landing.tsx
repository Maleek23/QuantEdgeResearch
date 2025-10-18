import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
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
  ExternalLink
} from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  const features = [
    {
      icon: Brain,
      title: "AI-Powered Analysis",
      description: "Multi-provider AI (Claude, GPT, Gemini) generates trade ideas with comprehensive market analysis and risk assessment."
    },
    {
      icon: Calculator,
      title: "Quantitative Signals",
      description: "Rules-based 7-signal engine using RSI, MACD, momentum, volume, and multi-timeframe analysis for pure quant opportunities."
    },
    {
      icon: Bell,
      title: "Discord Alerts",
      description: "Instant notifications for new trade ideas with complete details, grades, and entry/exit levels delivered to your Discord."
    },
    {
      icon: BarChart3,
      title: "Real-Time Market Data",
      description: "Live pricing from Yahoo Finance, Alpha Vantage, and CoinGecko across stocks, options, and crypto markets."
    },
    {
      icon: Shield,
      title: "Risk Management",
      description: "Built-in position sizing calculator with educational disclaimers. Every idea includes entry, target, stop-loss, and R:R ratio."
    },
    {
      icon: Target,
      title: "Performance Tracking",
      description: "Monitor trade outcomes, track win rates, and analyze which signal types perform best for your strategy."
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
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />
        <div className="container relative mx-auto px-6 py-24 text-center">
          <Badge variant="secondary" className="mb-6">
            <Zap className="h-3 w-3 mr-1" />
            Dual-Engine Architecture: AI + Quantitative
          </Badge>
          
          <h1 className="text-5xl font-bold tracking-tight mb-6">
            QuantEdge Research Platform
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Discover day-trading opportunities across US equities, options, and crypto markets. 
            Real market data, transparent explainability, professional-grade risk management.
          </p>

          <div className="flex gap-4 justify-center">
            {isAuthenticated ? (
              <Button 
                size="lg" 
                onClick={() => setLocation('/dashboard')}
                data-testid="button-get-started"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Go to Dashboard
              </Button>
            ) : (
              <Button 
                size="lg" 
                onClick={() => window.location.href = '/api/login'}
                data-testid="button-login"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Login / Sign Up
              </Button>
            )}
            <Button 
              size="lg" 
              variant="outline"
              onClick={() => setLocation('/about')}
              data-testid="button-learn-more"
            >
              Learn More
            </Button>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-8 max-w-2xl mx-auto">
            <div>
              <div className="text-3xl font-bold text-primary">8</div>
              <div className="text-sm text-muted-foreground">Signal Types</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary">3</div>
              <div className="text-sm text-muted-foreground">AI Providers</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-primary">Real-Time</div>
              <div className="text-sm text-muted-foreground">Market Data</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Platform Features</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Professional-grade tools for discovering and analyzing trading opportunities with complete transparency
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <Card key={idx} className="hover-elevate" data-testid={`card-feature-${idx}`}>
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t bg-muted/30 py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From market data to trade execution in four simple steps
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.number} className="text-center" data-testid={`step-${step.number}`}>
                  <div className="relative mb-6">
                    <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto">
                      {step.number}
                    </div>
                    <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="border-t bg-muted/30 py-20">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Pricing</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Choose the plan that fits your trading needs
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Tier */}
            <Card className="hover-elevate" data-testid="card-pricing-free">
              <CardContent className="p-8">
                <div className="mb-6">
                  <h3 className="text-2xl font-bold mb-2">Free</h3>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-4xl font-bold">$0</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Access to public performance ledger and basic features</p>
                </div>
                
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">View public performance track record</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Historical trade ideas archive</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Basic market data</span>
                  </li>
                </ul>
                
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => window.location.href = '/api/login'}
                  data-testid="button-pricing-free"
                >
                  Sign Up Free
                </Button>
              </CardContent>
            </Card>

            {/* Premium Tier */}
            <Card className="hover-elevate border-primary" data-testid="card-pricing-premium">
              <CardContent className="p-8">
                <Badge className="mb-4">Most Popular</Badge>
                <div className="mb-6">
                  <h3 className="text-2xl font-bold mb-2">Premium</h3>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-4xl font-bold">$39.99</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Full access to live signals, analytics, and Discord community</p>
                </div>
                
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Everything in Free</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Real-time trade signals</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">AI + Quantitative dual-engine</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Discord community access</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Instant Discord notifications</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Advanced analytics & ML insights</span>
                  </li>
                </ul>
                
                <Button 
                  className="w-full"
                  onClick={() => window.location.href = '/api/login'}
                  data-testid="button-pricing-premium"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Start Premium
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="container mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Get In Touch</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Questions about pricing, features, or partnership opportunities? We're here to help.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <Card className="hover-elevate" data-testid="card-contact-email">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Email Support</h3>
                <a 
                  href="mailto:support@quantedge.io" 
                  className="text-sm text-primary hover:underline"
                  data-testid="link-contact-email"
                >
                  support@quantedge.io
                </a>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate" data-testid="card-contact-discord">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Join Our Discord</h3>
                <a 
                  href="https://discord.gg/quantedge" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                  data-testid="link-contact-discord"
                >
                  discord.gg/quantedge
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-6 py-20">
        <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/20">
          <CardContent className="p-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Start Trading Smarter?</h2>
            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
              Access dual-engine trade idea generation, real-time market analysis, and professional risk management tools. 
              Educational research platform for active traders.
            </p>
            {isAuthenticated ? (
              <Button 
                size="lg" 
                onClick={() => setLocation('/dashboard')}
                data-testid="button-cta-get-started"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Launch Dashboard
              </Button>
            ) : (
              <Button 
                size="lg" 
                onClick={() => window.location.href = '/api/login'}
                data-testid="button-cta-login"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Login / Sign Up
              </Button>
            )}
            <p className="text-xs text-muted-foreground mt-4">
              ⚠️ For educational and research purposes only. Not financial advice.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>© 2025 QuantEdge Research. All rights reserved.</p>
          <p className="mt-2">Educational platform for trading research and analysis.</p>
        </div>
      </footer>
    </div>
  );
}
