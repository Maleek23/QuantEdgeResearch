import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  BookOpen, TrendingUp, Target, Clock, ChevronRight, 
  BarChart3, Zap, Shield, AlertTriangle, CheckCircle2,
  ArrowRight, Eye, Calendar, DollarSign, Activity,
  LineChart, CandlestickChart, ArrowUpRight, ArrowDownRight,
  Timer, Percent, Calculator, Brain, Lightbulb
} from "lucide-react";
import { Link } from "wouter";

interface StepCardProps {
  stepNumber: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  color: string;
}

function StepCard({ stepNumber, title, description, icon, children, color }: StepCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute top-0 left-0 w-1 h-full ${color}`} />
      <CardHeader>
        <div className="flex items-center gap-4">
          <div className={`flex items-center justify-center w-12 h-12 rounded-full ${color.replace('bg-', 'bg-')}/10 text-${color.replace('bg-', '')}`}>
            {icon}
          </div>
          <div>
            <Badge variant="outline" className="mb-1">Step {stepNumber}</Badge>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
      </CardContent>
    </Card>
  );
}

function TimeframeCard({ timeframe, use, icon, example }: { timeframe: string; use: string; icon: React.ReactNode; example: string }) {
  return (
    <div className="p-4 rounded-lg border bg-card hover-elevate">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <p className="font-bold">{timeframe}</p>
          <p className="text-sm text-muted-foreground">{use}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground italic">{example}</p>
    </div>
  );
}

function SignalBadge({ grade, signals, description }: { grade: string; signals: number; description: string }) {
  const colors: Record<string, string> = {
    'A+': 'bg-green-500/10 text-green-500 border-green-500/50',
    'A': 'bg-emerald-500/10 text-emerald-500 border-emerald-500/50',
    'B': 'bg-cyan-500/10 text-cyan-500 border-cyan-500/50',
    'C': 'bg-amber-500/10 text-amber-500 border-amber-500/50',
    'D': 'bg-red-500/10 text-red-500 border-red-500/50',
  };
  
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border">
      <div className="flex items-center gap-3">
        <Badge variant="outline" className={colors[grade] || 'bg-muted'}>
          {grade}
        </Badge>
        <span className="text-sm">{signals} signals agreeing</span>
      </div>
      <span className="text-xs text-muted-foreground">{description}</span>
    </div>
  );
}

export default function TradingGuidePage() {
  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4 py-8">
        <Badge variant="outline" className="mb-4">
          <BookOpen className="h-3 w-3 mr-1" />
          Trading Education
        </Badge>
        <h1 className="text-4xl font-bold">How to Trade Like a Pro</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          A complete step-by-step guide to analyzing charts, picking the right options, and executing trades with confidence.
        </p>
      </div>

      {/* Quick Navigation */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex flex-wrap justify-center gap-4">
            <a href="#step-1" className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
              <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-500 flex items-center justify-center text-xs font-bold">1</div>
              Find Ideas
            </a>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <a href="#step-2" className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
              <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-500 flex items-center justify-center text-xs font-bold">2</div>
              Analyze Chart
            </a>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <a href="#step-3" className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-xs font-bold">3</div>
              Pick Strike/Expiry
            </a>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <a href="#step-4" className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
              <div className="w-6 h-6 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center text-xs font-bold">4</div>
              Execute Trade
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Find Trade Ideas */}
      <div id="step-1">
        <StepCard
          stepNumber={1}
          title="Find Trade Ideas"
          description="Use our research briefs to discover high-probability setups"
          icon={<Eye className="h-6 w-6" />}
          color="bg-cyan-500"
        >
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Where to Find Ideas
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded border bg-card">
                <p className="font-medium">Trade Desk</p>
                <p className="text-sm text-muted-foreground">Fresh AI + Quant research briefs generated daily at market open</p>
              </div>
              <div className="p-3 rounded border bg-card">
                <p className="font-medium">Flow Scanner</p>
                <p className="text-sm text-muted-foreground">Unusual options activity from institutional traders</p>
              </div>
              <div className="p-3 rounded border bg-card">
                <p className="font-medium">Lotto Ideas</p>
                <p className="text-sm text-muted-foreground">High R:R weekly options with 2:1+ risk/reward</p>
              </div>
              <div className="p-3 rounded border bg-card">
                <p className="font-medium">Chart Analysis</p>
                <p className="text-sm text-muted-foreground">Upload your own chart for AI-powered analysis</p>
              </div>
            </div>
          </div>

          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-500" />
              Understanding Signal Grades
            </h4>
            <p className="text-sm text-muted-foreground mb-3">
              Signal grades show how many technical indicators agree on the trade direction:
            </p>
            <div className="space-y-2">
              <SignalBadge grade="A+" signals={5} description="Strong consensus - highest probability" />
              <SignalBadge grade="A" signals={4} description="Good consensus - reliable setup" />
              <SignalBadge grade="B" signals={3} description="Moderate - proceed with caution" />
              <SignalBadge grade="C" signals={2} description="Weak - consider skipping" />
              <SignalBadge grade="D" signals={1} description="Conflicting signals - avoid" />
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <Lightbulb className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm">
              <span className="font-semibold">Pro Tip:</span> Focus on A and B grade setups with clear risk/reward. Skip C and D grades unless you have additional confirmation.
            </p>
          </div>
        </StepCard>
      </div>

      {/* Step 2: Analyze the Chart */}
      <div id="step-2">
        <StepCard
          stepNumber={2}
          title="Analyze the Chart"
          description="Match your timeframe to your expiration date"
          icon={<CandlestickChart className="h-6 w-6" />}
          color="bg-purple-500"
        >
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-cyan-500" />
              Which Timeframe for Which Expiry?
            </h4>
            <p className="text-sm text-muted-foreground mb-4">
              This is the most important concept. Your chart timeframe should match your trade duration:
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <TimeframeCard 
                timeframe="5-15 Minute" 
                use="Same-day (0DTE) trades"
                icon={<Timer className="h-4 w-4" />}
                example="Looking for quick momentum plays that resolve in hours"
              />
              <TimeframeCard 
                timeframe="1 Hour" 
                use="1-3 day swings"
                icon={<Clock className="h-4 w-4" />}
                example="Catching overnight moves or 2-day momentum"
              />
              <TimeframeCard 
                timeframe="4 Hour" 
                use="Weekly options (5-7 days)"
                icon={<BarChart3 className="h-4 w-4" />}
                example="Best for Friday expirations bought Mon-Wed"
              />
              <TimeframeCard 
                timeframe="Daily" 
                use="2-4 week swings"
                icon={<Calendar className="h-4 w-4" />}
                example="Monthly options or longer-dated plays"
              />
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500/10 to-cyan-500/10 rounded-lg p-4 border border-purple-500/20">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-500" />
              For Weekly Options (Expiring Friday)
            </h4>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Primary: 4-Hour Chart</p>
                  <p className="text-sm text-muted-foreground">Shows the weekly trend and key support/resistance levels</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Entry: 1-Hour Chart</p>
                  <p className="text-sm text-muted-foreground">Fine-tune your entry point within the larger trend</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Confirmation: Daily Chart</p>
                  <p className="text-sm text-muted-foreground">Make sure you're trading WITH the larger trend, not against it</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <LineChart className="h-4 w-4 text-green-500" />
              What to Look For
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowUpRight className="h-4 w-4 text-green-500" />
                  <span className="font-medium text-green-500">Bullish Signs</span>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Price above key moving averages</li>
                  <li>• Higher highs and higher lows</li>
                  <li>• Bouncing off support levels</li>
                  <li>• RSI below 30 (oversold bounce)</li>
                  <li>• Volume increasing on up moves</li>
                </ul>
              </div>
              <div className="p-3 rounded border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <ArrowDownRight className="h-4 w-4 text-red-500" />
                  <span className="font-medium text-red-500">Bearish Signs</span>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Price below key moving averages</li>
                  <li>• Lower highs and lower lows</li>
                  <li>• Rejecting at resistance levels</li>
                  <li>• RSI above 70 (overbought fade)</li>
                  <li>• Volume increasing on down moves</li>
                </ul>
              </div>
            </div>
          </div>
        </StepCard>
      </div>

      {/* Step 3: Pick Strike & Expiry */}
      <div id="step-3">
        <StepCard
          stepNumber={3}
          title="Pick Your Strike & Expiry"
          description="Balance probability vs. reward potential"
          icon={<Calculator className="h-6 w-6" />}
          color="bg-amber-500"
        >
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-amber-500" />
              Strike Price Selection
            </h4>
            <div className="space-y-3">
              <div className="p-3 rounded border bg-card flex items-start gap-3">
                <Badge variant="outline" className="bg-green-500/10 text-green-500 shrink-0">ITM</Badge>
                <div>
                  <p className="font-medium">In-The-Money (Delta 0.60-0.80)</p>
                  <p className="text-sm text-muted-foreground">Higher cost, higher probability. Best for directional conviction plays.</p>
                </div>
              </div>
              <div className="p-3 rounded border bg-card flex items-start gap-3">
                <Badge variant="outline" className="bg-cyan-500/10 text-cyan-500 shrink-0">ATM</Badge>
                <div>
                  <p className="font-medium">At-The-Money (Delta ~0.50)</p>
                  <p className="text-sm text-muted-foreground">Balanced risk/reward. Good for uncertain direction but expecting a move.</p>
                </div>
              </div>
              <div className="p-3 rounded border bg-card flex items-start gap-3">
                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 shrink-0">OTM</Badge>
                <div>
                  <p className="font-medium">Out-of-The-Money (Delta 0.20-0.40)</p>
                  <p className="text-sm text-muted-foreground">Cheaper, higher reward but lower probability. Use for lotto plays only.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-purple-500" />
              Expiration Selection Rules
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-2 rounded bg-card border">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm">Give yourself 2x the time you think you need</span>
              </div>
              <div className="flex items-center gap-3 p-2 rounded bg-card border">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm">Weekly plays: Buy Monday-Wednesday for Friday expiry</span>
              </div>
              <div className="flex items-center gap-3 p-2 rounded bg-card border">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm">Avoid buying options expiring in less than 3 days</span>
              </div>
              <div className="flex items-center gap-3 p-2 rounded bg-card border">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm">Theta decay accelerates rapidly in final 5 days</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-500/10 to-red-500/10 rounded-lg p-4 border border-amber-500/20">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Percent className="h-4 w-4 text-amber-500" />
              Risk/Reward Quick Guide
            </h4>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded bg-card border">
                <p className="text-2xl font-bold text-green-500">2:1</p>
                <p className="text-xs text-muted-foreground">Minimum R:R</p>
                <p className="text-xs">Risk $1 to make $2</p>
              </div>
              <div className="p-3 rounded bg-card border">
                <p className="text-2xl font-bold text-cyan-500">3:1</p>
                <p className="text-xs text-muted-foreground">Good R:R</p>
                <p className="text-xs">Risk $1 to make $3</p>
              </div>
              <div className="p-3 rounded bg-card border">
                <p className="text-2xl font-bold text-purple-500">5:1+</p>
                <p className="text-xs text-muted-foreground">Lotto R:R</p>
                <p className="text-xs">Risk $1 to make $5+</p>
              </div>
            </div>
          </div>
        </StepCard>
      </div>

      {/* Step 4: Execute the Trade */}
      <div id="step-4">
        <StepCard
          stepNumber={4}
          title="Execute the Trade"
          description="Set your levels and manage risk properly"
          icon={<Zap className="h-6 w-6" />}
          color="bg-green-500"
        >
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-500" />
              Before You Click Buy
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-2 rounded bg-card border">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">1</div>
                <span className="text-sm">Know your stop loss BEFORE entering (max 50% of premium)</span>
              </div>
              <div className="flex items-center gap-3 p-2 rounded bg-card border">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">2</div>
                <span className="text-sm">Know your profit target (minimum 2x your risk)</span>
              </div>
              <div className="flex items-center gap-3 p-2 rounded bg-card border">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">3</div>
                <span className="text-sm">Size correctly: Risk only 1-2% of account per trade</span>
              </div>
              <div className="flex items-center gap-3 p-2 rounded bg-card border">
                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">4</div>
                <span className="text-sm">Write it down in your trading journal</span>
              </div>
            </div>
          </div>

          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" />
              Position Sizing Example
            </h4>
            <div className="p-4 rounded border bg-card font-mono text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account Size:</span>
                <span>$10,000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max Risk (2%):</span>
                <span>$200</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Option Price:</span>
                <span>$2.00</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stop Loss (50%):</span>
                <span>$1.00 loss per contract</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between text-primary font-bold">
                <span>Max Contracts:</span>
                <span>2 contracts ($200 ÷ $100)</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-sm">
              <span className="font-semibold">Golden Rule:</span> Never risk more than you can afford to lose. Options can go to zero. Only trade with money you can lose completely.
            </p>
          </div>
        </StepCard>
      </div>

      {/* Summary Checklist */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Pre-Trade Checklist
          </CardTitle>
          <CardDescription>Run through this before every trade</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-2 rounded bg-card border">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm">Signal grade is A or B?</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-card border">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm">Chart timeframe matches expiry?</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-card border">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm">Trend on higher timeframe confirms?</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-card border">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm">R:R is at least 2:1?</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-card border">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm">Stop loss is set before entry?</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-card border">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm">Position size is max 2% of account?</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-card border">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm">At least 3+ days to expiration?</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded bg-card border">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm">No major earnings/events during hold?</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CTA */}
      <div className="text-center space-y-4 py-8">
        <h2 className="text-2xl font-bold">Ready to Start?</h2>
        <p className="text-muted-foreground">Head to the Trade Desk to find your first setup</p>
        <div className="flex justify-center gap-4">
          <Link href="/trade-desk">
            <Button size="lg" data-testid="button-goto-trade-desk">
              <TrendingUp className="h-4 w-4 mr-2" />
              Go to Trade Desk
            </Button>
          </Link>
          <Link href="/chart-analysis">
            <Button variant="outline" size="lg" data-testid="button-goto-chart-analysis">
              <CandlestickChart className="h-4 w-4 mr-2" />
              Analyze a Chart
            </Button>
          </Link>
        </div>
      </div>

      {/* Disclaimer */}
      <Card className="bg-muted/30 border-muted">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground text-center">
            <strong>Educational Disclaimer:</strong> This guide is for educational purposes only and does not constitute financial advice. 
            Trading options involves substantial risk of loss and is not suitable for all investors. Past performance does not guarantee future results. 
            Always do your own research and consider consulting a financial advisor before making investment decisions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
