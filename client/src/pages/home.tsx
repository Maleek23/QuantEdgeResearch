import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  Target, 
  Brain, 
  Zap, 
  BarChart3,
  ArrowRight,
  Shield,
  Clock
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface PerformanceStats {
  overall: {
    totalIdeas: number;
    winRate: number;
    closedIdeas: number;
  };
}

export default function HomePage() {
  const { data: stats } = useQuery<PerformanceStats>({
    queryKey: ['/api/performance/stats'],
  });

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-[600px] flex items-center justify-center overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.15),rgba(255,255,255,0))]" />
        
        {/* Floating Data Particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className={cn(
                "absolute w-1 h-1 bg-primary/20 rounded-full animate-pulse",
                "blur-sm"
              )}
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 3}s`,
              }}
            />
          ))}
        </div>

        <div className="container relative z-10 mx-auto px-6 py-20">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            {/* Badge */}
            <Badge variant="outline" className="mb-4 border-primary/50 bg-primary/10">
              <Zap className="w-3 h-3 mr-1" />
              Dual-Engine Intelligence Platform
            </Badge>

            {/* Main Heading */}
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
                QuantEdge
              </span>
              <br />
              <span className="text-3xl md:text-5xl text-muted-foreground">
                Research Platform
              </span>
            </h1>

            {/* Description */}
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Professional quantitative trading research for day-trading opportunities.
              Powered by dual engines: <span className="text-cyan-500 font-semibold">Quant Analytics</span> + <span className="text-purple-500 font-semibold">AI Intelligence</span>.
            </p>

            {/* Live Stats Grid */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto mt-8">
                <Card className="border-primary/20 bg-card/50 backdrop-blur">
                  <CardContent className="p-6 text-center">
                    <div className="text-4xl font-bold text-primary mb-2">
                      {stats.overall.totalIdeas}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Total Trade Ideas
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-blue-500/20 bg-card/50 backdrop-blur">
                  <CardContent className="p-6 text-center">
                    <div className="text-4xl font-bold text-blue-500 mb-2">
                      {stats.overall.closedIdeas}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Analyzed Trades
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
              <Link href="/trade-ideas">
                <Button size="lg" className="gap-2 shadow-lg shadow-primary/20">
                  View Trade Ideas
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/performance">
                <Button variant="outline" size="lg" className="gap-2">
                  <BarChart3 className="w-4 h-4" />
                  View Performance
                </Button>
              </Link>
            </div>

            {/* Disclaimer */}
            <p className="text-xs text-muted-foreground max-w-2xl mx-auto mt-8">
              <Shield className="w-3 h-3 inline mr-1" />
              Educational research platform. Not financial advice. Trade at your own risk.
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">
            Dual-Engine Architecture
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* AI Engine */}
            <Card className="hover-elevate transition-all border-purple-500/20">
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-purple-500/10">
                    <Brain className="w-6 h-6 text-purple-500" />
                  </div>
                  <h3 className="text-xl font-bold">AI Engine</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Zap className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                    Multi-provider AI (Claude, GPT, Gemini)
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                    Natural language market analysis
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                    Adaptive pattern recognition
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Quant Engine */}
            <Card className="hover-elevate transition-all border-cyan-500/20">
              <CardContent className="p-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 rounded-lg bg-cyan-500/10">
                    <BarChart3 className="w-6 h-6 text-cyan-500" />
                  </div>
                  <h3 className="text-xl font-bold">Quant Engine v2.3.0</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Target className="w-4 h-4 text-cyan-500 mt-0.5 flex-shrink-0" />
                    7 technical signals (RSI, MACD, Volume, etc.)
                  </li>
                  <li className="flex items-start gap-2">
                    <Target className="w-4 h-4 text-cyan-500 mt-0.5 flex-shrink-0" />
                    Real-time historical price analysis
                  </li>
                  <li className="flex items-start gap-2">
                    <Target className="w-4 h-4 text-cyan-500 mt-0.5 flex-shrink-0" />
                    Tightened stops (2-3%) + 90+ confidence filter
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">
            Research-Grade Tools
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card className="hover-elevate transition-all">
              <CardContent className="p-6 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Real-Time Analysis</h3>
                <p className="text-sm text-muted-foreground">
                  Live market data with instant signal generation
                </p>
              </CardContent>
            </Card>

            <Card className="hover-elevate transition-all">
              <CardContent className="p-6 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Performance Tracking</h3>
                <p className="text-sm text-muted-foreground">
                  Comprehensive metrics with win rate analysis
                </p>
              </CardContent>
            </Card>

            <Card className="hover-elevate transition-all">
              <CardContent className="p-6 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">Risk Management</h3>
                <p className="text-sm text-muted-foreground">
                  Strict stop losses and confidence filtering
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
