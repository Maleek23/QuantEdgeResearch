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
  ChevronRight
} from "lucide-react";

export default function LearnMore() {
  const [, setLocation] = useLocation();

  const architectureFeatures = [
    {
      icon: Brain,
      title: "AI Engine",
      description: "Multi-provider fallback system (Claude Sonnet 4, GPT-5, Gemini 2.5) for intelligent market analysis with contextual reasoning.",
      color: "text-blue-500"
    },
    {
      icon: Calculator,
      title: "Quantitative Engine",
      description: "7-signal technical analysis engine: RSI, MACD, Momentum, Volume, Multi-timeframe confluence, Volatility, and Support/Resistance.",
      color: "text-green-500"
    },
    {
      icon: Database,
      title: "Real Market Data",
      description: "Yahoo Finance for stocks (unlimited), CoinGecko for crypto, Alpha Vantage fallback. Dynamic market-wide discovery scans entire markets.",
      color: "text-purple-500"
    },
    {
      icon: TrendingUp,
      title: "ML Adaptive Learning",
      description: "Machine learning analyzes historical performance, identifies winning patterns, and adjusts confidence scores based on signal effectiveness.",
      color: "text-amber-500"
    }
  ];

  const authSteps = [
    {
      number: 1,
      title: "Click Login/Sign Up",
      description: "Start the authentication process from the landing page"
    },
    {
      number: 2,
      title: "Replit OAuth",
      description: "Redirected to Replit's secure login page (Google, GitHub, X, Apple, Email)"
    },
    {
      number: 3,
      title: "Account Creation",
      description: "First-time users: account auto-created. Returning users: existing account used"
    },
    {
      number: 4,
      title: "Return to Dashboard",
      description: "Session created, user data stored, redirected to your dashboard"
    }
  ];

  const securityFeatures = [
    "🔒 OAuth 2.0 + OpenID Connect authentication",
    "🔐 Passwords managed by Replit (never stored in our database)",
    "📝 PostgreSQL session storage with 1-week TTL",
    "🛡️ HTTPS-only secure cookies with httpOnly and sameSite",
    "🔄 Auto token refresh for seamless experience",
    "👤 User data isolation (all trades scoped to userId)"
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
      <section className="border-b bg-gradient-to-br from-primary/5 via-background to-background">
        <div className="container mx-auto px-6 py-20">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="secondary" className="mb-6">
              <Activity className="h-3 w-3 mr-1" />
              Platform Documentation
            </Badge>
            <h1 className="text-5xl font-bold tracking-tight mb-6">
              How QuantEdge Works
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              A comprehensive guide to our dual-engine quantitative trading research platform, 
              authentication system, and educational approach to market analysis.
            </p>
            <div className="flex gap-4 justify-center">
              <Button 
                onClick={() => window.location.href = '/api/login'}
                data-testid="button-get-started"
              >
                Get Started
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <Button 
                variant="outline"
                onClick={() => setLocation('/')}
                data-testid="button-back-home"
              >
                Back to Home
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Dual-Engine Architecture */}
      <section className="container mx-auto px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Dual-Engine Architecture</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              QuantEdge combines AI-powered analysis with pure quantitative signals to provide 
              multiple perspectives on market opportunities.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {architectureFeatures.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Card key={idx} className="hover-elevate" data-testid={`card-architecture-${idx}`}>
                  <CardHeader>
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                      <Icon className={`h-6 w-6 ${feature.color}`} />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Authentication Flow */}
      <section className="border-t bg-muted/30 py-20">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-full mb-4">
                <Lock className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Powered by Replit Auth</span>
              </div>
              <h2 className="text-3xl font-bold mb-4">How Login & Signup Works</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                No forms to fill out, no passwords to remember. QuantEdge uses Replit Auth 
                for secure, seamless authentication.
              </p>
            </div>

            <div className="grid md:grid-cols-4 gap-6 mb-12">
              {authSteps.map((step) => (
                <div key={step.number} className="text-center" data-testid={`auth-step-${step.number}`}>
                  <div className="relative mb-4">
                    <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto">
                      {step.number}
                    </div>
                    {step.number < 4 && (
                      <ChevronRight className="hidden md:block absolute top-6 -right-8 h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <h3 className="font-semibold mb-2 text-sm">{step.title}</h3>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>

            <Card className="bg-gradient-to-br from-primary/5 to-background border-primary/20">
              <CardContent className="p-8">
                <div className="flex items-start gap-4 mb-6">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Key className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">Supported Login Methods</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Choose from multiple authentication providers managed by Replit
                    </p>
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-background/50 rounded-lg">
                    <Cloud className="h-5 w-5 text-blue-500" />
                    <span className="text-sm font-medium">Google Account</span>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-background/50 rounded-lg">
                    <Zap className="h-5 w-5 text-purple-500" />
                    <span className="text-sm font-medium">GitHub Account</span>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-background/50 rounded-lg">
                    <Users className="h-5 w-5 text-amber-500" />
                    <span className="text-sm font-medium">X (Twitter) Account</span>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-background/50 rounded-lg">
                    <Shield className="h-5 w-5 text-green-500" />
                    <span className="text-sm font-medium">Email/Password</span>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Important:</strong> Your passwords are NEVER stored 
                    in QuantEdge's database. Authentication is handled entirely by Replit's secure OAuth system. 
                    We only receive your basic profile information (name, email) after you authenticate.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Security Features */}
      <section className="container mx-auto px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Security & Privacy</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Enterprise-grade security features to protect your data and trading activity.
            </p>
          </div>

          <Card>
            <CardContent className="p-8">
              <div className="grid md:grid-cols-2 gap-4">
                {securityFeatures.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-3" data-testid={`security-${idx}`}>
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* How Trade Ideas Are Generated */}
      <section className="border-t bg-muted/30 py-20">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Trade Idea Generation Process</h2>
            </div>

            <div className="space-y-6">
              <Card className="hover-elevate">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Brain className="h-5 w-5 text-blue-500" />
                    </div>
                    <CardTitle>AI Engine Process</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p><strong className="text-foreground">1. Market Discovery:</strong> Scans entire stock market via Yahoo Finance screener (top gainers, losers, most active) + CoinGecko rankings for crypto gems</p>
                  <p><strong className="text-foreground">2. AI Analysis:</strong> Sends market data to Claude/GPT/Gemini for deep analysis of patterns, catalysts, momentum, volume</p>
                  <p><strong className="text-foreground">3. Risk Calculation:</strong> AI determines entry price, target, stop-loss, position size, and risk:reward ratio</p>
                  <p><strong className="text-foreground">4. Quality Grading:</strong> Assigns confidence score and quality grade (A+ to F) based on signal strength</p>
                </CardContent>
              </Card>

              <Card className="hover-elevate">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <Calculator className="h-5 w-5 text-green-500" />
                    </div>
                    <CardTitle>Quantitative Engine Process</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p><strong className="text-foreground">1. Signal Calculation:</strong> Computes RSI, MACD, momentum, volume spike, volatility, support/resistance for every discovered asset</p>
                  <p><strong className="text-foreground">2. ML Weight Application:</strong> Applies learned weights from historical performance - high-performing signals boost confidence</p>
                  <p><strong className="text-foreground">3. Multi-Timeframe Confluence:</strong> Validates signals across multiple timeframes (1H, 4H, 1D) for higher probability setups</p>
                  <p><strong className="text-foreground">4. Filtering & Ranking:</strong> Only surfaces ideas with 3+ quality signals, ranked by ML-adjusted confidence score</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Disclaimers */}
      <section className="container mx-auto px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardHeader>
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
                <CardTitle className="text-amber-500">Important Disclaimers</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {disclaimers.map((disclaimer, idx) => (
                <div key={idx} className="flex items-start gap-3" data-testid={`disclaimer-${idx}`}>
                  <div className="h-2 w-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                  <p className="text-sm text-muted-foreground">{disclaimer}</p>
                </div>
              ))}
              
              <div className="mt-6 p-4 bg-background/50 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Platform Purpose:</strong> QuantEdge Research is designed 
                  as an educational tool for learning about quantitative analysis, technical indicators, and 
                  AI-assisted market research. All generated ideas should be thoroughly researched and validated 
                  independently before any trading decisions are made.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/20">
            <CardContent className="p-12">
              <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
              <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                Sign up with your preferred authentication method and start exploring 
                quantitative trading research today.
              </p>
              <Button 
                size="lg"
                onClick={() => window.location.href = '/api/login'}
                data-testid="button-cta-signup"
              >
                <Lock className="h-4 w-4 mr-2" />
                Sign Up Securely
              </Button>
              <p className="text-xs text-muted-foreground mt-4">
                No credit card required • Free tier available • Secure OAuth authentication
              </p>
            </CardContent>
          </Card>
        </div>
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
