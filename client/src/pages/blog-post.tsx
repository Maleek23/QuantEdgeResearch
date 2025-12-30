import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ArrowLeft, Calendar, Clock, User, Search, BarChart3, Target, 
  DollarSign, CheckCircle2, AlertTriangle, Lightbulb, TrendingUp,
  TrendingDown, Zap, Shield, BookOpen, ArrowRight, Sparkles
} from "lucide-react";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SEOHead } from "@/components/seo-head";
import { useState } from "react";
import type { BlogPost } from "@shared/schema";

function TradingGuideContent() {
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  const toggleCheck = (key: string) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const checklistItems = [
    { key: 'grade', label: 'Signal grade is A or B?' },
    { key: 'timeframe', label: 'Chart timeframe matches expiry?' },
    { key: 'trend', label: 'Trend on higher timeframe confirms?' },
    { key: 'rr', label: 'R:R is at least 2:1?' },
    { key: 'stop', label: 'Stop loss is set before entry?' },
    { key: 'size', label: 'Position size is max 2% of account?' },
    { key: 'dte', label: 'At least 3+ days to expiration?' },
    { key: 'events', label: 'No major earnings/events during hold?' },
  ];

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500/20 via-primary/10 to-purple-500/20 p-8 md:p-12">
        <div className="absolute inset-0 bg-grid-white/5" />
        <div className="relative">
          <Badge className="mb-4 bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
            <BookOpen className="h-3 w-3 mr-1" />
            Complete Trading Guide
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            How to Trade Like a Pro
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            A complete step-by-step guide to analyzing charts, picking the right options, and executing trades with confidence.
          </p>
        </div>
        
        {/* Step Progress */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { num: 1, label: 'Find Ideas', icon: Search },
            { num: 2, label: 'Analyze Chart', icon: BarChart3 },
            { num: 3, label: 'Pick Strike/Expiry', icon: Target },
            { num: 4, label: 'Execute Trade', icon: DollarSign },
          ].map((step) => (
            <div key={step.num} className="flex items-center gap-3 bg-background/50 backdrop-blur rounded-lg p-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold">
                {step.num}
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Step {step.num}</div>
                <div className="font-medium text-sm">{step.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Find Trade Ideas */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl">
            1
          </div>
          <div>
            <h2 className="text-2xl font-bold">Find Trade Ideas</h2>
            <p className="text-muted-foreground">Use our research briefs to discover high-probability setups</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {[
            { title: 'Trade Desk', desc: 'Fresh AI + Quant research briefs generated daily at market open', icon: Sparkles, color: 'from-cyan-500 to-blue-600' },
            { title: 'Flow Scanner', desc: 'Unusual options activity from institutional traders', icon: Zap, color: 'from-purple-500 to-pink-600' },
            { title: 'Lotto Ideas', desc: 'High R:R weekly options with 2:1+ risk/reward', icon: Target, color: 'from-orange-500 to-red-600' },
            { title: 'Chart Analysis', desc: 'Upload your own chart for AI-powered analysis', icon: BarChart3, color: 'from-green-500 to-emerald-600' },
          ].map((item) => (
            <Card key={item.title} className="hover-elevate overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-start gap-4 p-4">
                  <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0`}>
                    <item.icon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{item.title}</h3>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Signal Grades */}
        <Card className="border-cyan-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-cyan-500" />
              Understanding Signal Grades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Signal grades show how many technical indicators agree on the trade direction:
            </p>
            <div className="space-y-2">
              {[
                { grade: 'A+', signals: '5 signals', meaning: 'Strong consensus - highest probability', color: 'bg-green-500' },
                { grade: 'A', signals: '4 signals', meaning: 'Good consensus - reliable setup', color: 'bg-green-400' },
                { grade: 'B', signals: '3 signals', meaning: 'Moderate - proceed with caution', color: 'bg-yellow-500' },
                { grade: 'C', signals: '2 signals', meaning: 'Weak - consider skipping', color: 'bg-orange-500' },
                { grade: 'D', signals: '1 signal', meaning: 'Conflicting signals - avoid', color: 'bg-red-500' },
              ].map((item) => (
                <div key={item.grade} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                  <Badge className={`${item.color} text-white font-bold min-w-[40px] justify-center`}>
                    {item.grade}
                  </Badge>
                  <span className="text-sm font-medium w-24">{item.signals}</span>
                  <span className="text-sm text-muted-foreground">{item.meaning}</span>
                </div>
              ))}
            </div>
            
            <div className="mt-6 p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <div className="flex items-start gap-3">
                <Lightbulb className="h-5 w-5 text-cyan-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-cyan-400">Pro Tip:</span>
                  <span className="text-muted-foreground ml-2">
                    Focus on A and B grade setups with clear risk/reward. Skip C and D grades unless you have additional confirmation.
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Step 2: Analyze the Chart */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white font-bold text-xl">
            2
          </div>
          <div>
            <h2 className="text-2xl font-bold">Analyze the Chart</h2>
            <p className="text-muted-foreground">Match your timeframe to your expiration date</p>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Which Timeframe for Which Expiry?</CardTitle>
            <p className="text-muted-foreground">This is the most important concept. Your chart timeframe should match your trade duration:</p>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-3">
              {[
                { timeframe: '5-15 Minute', best: 'Same-day (0DTE)', use: 'Quick momentum plays that resolve in hours', color: 'border-l-red-500' },
                { timeframe: '1 Hour', best: '1-3 day swings', use: 'Catching overnight moves or 2-day momentum', color: 'border-l-orange-500' },
                { timeframe: '4 Hour', best: 'Weekly options (5-7 days)', use: 'Best for Friday expirations bought Mon-Wed', color: 'border-l-green-500' },
                { timeframe: 'Daily', best: '2-4 week swings', use: 'Monthly options or longer-dated plays', color: 'border-l-blue-500' },
              ].map((item) => (
                <div key={item.timeframe} className={`p-4 rounded-lg bg-muted/50 border-l-4 ${item.color}`}>
                  <div className="font-bold text-lg">{item.timeframe}</div>
                  <div className="text-sm text-cyan-400 font-medium">{item.best}</div>
                  <div className="text-sm text-muted-foreground mt-1">{item.use}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Weekly Options Guide */}
        <Card className="mb-6 border-purple-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-purple-500" />
              For Weekly Options (Expiring Friday)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { label: 'Primary', chart: '4-Hour Chart', desc: 'Shows the weekly trend and key support/resistance levels', color: 'bg-purple-500' },
                { label: 'Entry', chart: '1-Hour Chart', desc: 'Fine-tune your entry point within the larger trend', color: 'bg-pink-500' },
                { label: 'Confirmation', chart: 'Daily Chart', desc: "Make sure you're trading WITH the larger trend", color: 'bg-blue-500' },
              ].map((item, i) => (
                <div key={item.label} className="text-center p-4 rounded-lg bg-muted/50">
                  <Badge className={`${item.color} text-white mb-3`}>{item.label}</Badge>
                  <div className="font-bold mb-2">{item.chart}</div>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Bullish/Bearish Signs */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="border-green-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-green-500">
                <TrendingUp className="h-5 w-5" />
                Bullish Signs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {[
                  'Price above key moving averages',
                  'Higher highs and higher lows',
                  'Bouncing off support levels',
                  'RSI below 30 (oversold bounce)',
                  'Volume increasing on up moves',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-red-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-red-500">
                <TrendingDown className="h-5 w-5" />
                Bearish Signs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {[
                  'Price below key moving averages',
                  'Lower highs and lower lows',
                  'Rejecting at resistance levels',
                  'RSI above 70 (overbought fade)',
                  'Volume increasing on down moves',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-red-500 shrink-0" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Step 3: Pick Strike & Expiry */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white font-bold text-xl">
            3
          </div>
          <div>
            <h2 className="text-2xl font-bold">Pick Your Strike & Expiry</h2>
            <p className="text-muted-foreground">Balance probability vs. reward potential</p>
          </div>
        </div>

        {/* Strike Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Strike Price Selection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { type: 'ITM', name: 'In-The-Money', delta: 'Delta 0.60-0.80', desc: 'Higher cost, higher probability. Best for directional conviction plays.', color: 'from-green-500 to-emerald-600' },
                { type: 'ATM', name: 'At-The-Money', delta: 'Delta ~0.50', desc: 'Balanced risk/reward. Good for uncertain direction but expecting a move.', color: 'from-yellow-500 to-orange-500' },
                { type: 'OTM', name: 'Out-of-The-Money', delta: 'Delta 0.20-0.40', desc: 'Cheaper, higher reward but lower probability. Use for lotto plays only.', color: 'from-red-500 to-pink-600' },
              ].map((item) => (
                <div key={item.type} className="relative overflow-hidden rounded-xl border bg-card">
                  <div className={`h-2 bg-gradient-to-r ${item.color}`} />
                  <div className="p-4">
                    <Badge variant="outline" className="mb-2 font-mono">{item.type}</Badge>
                    <h4 className="font-bold mb-1">{item.name}</h4>
                    <div className="text-xs text-cyan-400 mb-2">{item.delta}</div>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Expiration Rules */}
        <Card className="mb-6 border-orange-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              Expiration Selection Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { icon: Clock, text: 'Give yourself 2x the time you think you need' },
                { icon: Calendar, text: 'Weekly plays: Buy Monday-Wednesday for Friday expiry' },
                { icon: AlertTriangle, text: 'Avoid buying options expiring in less than 3 days' },
                { icon: TrendingDown, text: 'Theta decay accelerates rapidly in final 5 days' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <item.icon className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
                  <span className="text-sm text-muted-foreground">{item.text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* R:R Guide */}
        <Card>
          <CardHeader>
            <CardTitle>Risk/Reward Quick Guide</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {[
                { rr: '2:1', label: 'Minimum R:R', desc: 'Risk $1 to make $2', color: 'text-yellow-500' },
                { rr: '3:1', label: 'Good R:R', desc: 'Risk $1 to make $3', color: 'text-green-500' },
                { rr: '5:1+', label: 'Lotto R:R', desc: 'Risk $1 to make $5+', color: 'text-cyan-500' },
              ].map((item) => (
                <div key={item.rr} className="text-center p-4 rounded-lg bg-muted/50">
                  <div className={`text-3xl font-bold ${item.color}`}>{item.rr}</div>
                  <div className="font-medium text-sm mt-1">{item.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{item.desc}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Step 4: Execute the Trade */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-xl">
            4
          </div>
          <div>
            <h2 className="text-2xl font-bold">Execute the Trade</h2>
            <p className="text-muted-foreground">Set your levels and manage risk properly</p>
          </div>
        </div>

        {/* Before You Buy */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-500" />
              Before You Click Buy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { num: 1, text: 'Know your stop loss BEFORE entering (max 50% of premium)' },
                { num: 2, text: 'Know your profit target (minimum 2x your risk)' },
                { num: 3, text: 'Size correctly: Risk only 1-2% of account per trade' },
                { num: 4, text: 'Write it down in your trading journal' },
              ].map((item) => (
                <div key={item.num} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="h-6 w-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {item.num}
                  </div>
                  <span className="text-sm text-muted-foreground">{item.text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Position Sizing Example */}
        <Card className="mb-6 border-green-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              Position Sizing Example
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Account Size', value: '$10,000' },
                { label: 'Max Risk (2%)', value: '$200' },
                { label: 'Option Price', value: '$2.00' },
                { label: 'Stop Loss (50%)', value: '$1.00 loss/contract' },
                { label: 'Max Contracts', value: '2 contracts' },
              ].map((item) => (
                <div key={item.label} className="text-center p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                  <div className="font-bold text-sm">{item.value}</div>
                </div>
              ))}
            </div>
            
            <div className="mt-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-red-400">Golden Rule:</span>
                  <span className="text-muted-foreground ml-2">
                    Never risk more than you can afford to lose. Options can go to zero. Only trade with money you can lose completely.
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pre-Trade Checklist */}
        <Card className="border-cyan-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-cyan-500" />
              Pre-Trade Checklist
            </CardTitle>
            <p className="text-muted-foreground text-sm">Run through this before every trade</p>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-3">
              {checklistItems.map((item) => (
                <div 
                  key={item.key} 
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    checklist[item.key] ? 'bg-green-500/10 border border-green-500/30' : 'bg-muted/50 hover:bg-muted'
                  }`}
                  onClick={() => toggleCheck(item.key)}
                >
                  <Checkbox 
                    checked={checklist[item.key] || false}
                    className="data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500"
                  />
                  <span className={`text-sm ${checklist[item.key] ? 'text-green-400' : 'text-muted-foreground'}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
            
            {Object.values(checklist).filter(Boolean).length === checklistItems.length && (
              <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <div className="font-bold text-green-400">All checks passed! You're ready to trade.</div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Disclaimer */}
      <Card className="bg-muted/30 border-muted">
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground italic">
            <strong>Educational Disclaimer:</strong> This guide is for educational purposes only and does not constitute financial advice. Trading options involves substantial risk of loss and is not suitable for all investors. Past performance does not guarantee future results. Always do your own research and consider consulting a financial advisor before making investment decisions.
          </p>
        </CardContent>
      </Card>

      {/* CTA */}
      <Card className="bg-gradient-to-br from-cyan-500/10 via-primary/5 to-purple-500/10 border-cyan-500/20">
        <CardContent className="p-8 text-center">
          <Sparkles className="h-12 w-12 text-cyan-500 mx-auto mb-4" />
          <h3 className="text-2xl font-bold mb-2">Ready to Start Trading?</h3>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
            Put what you've learned into practice with our AI-powered research tools
          </p>
          <Link href="/trade-desk">
            <Button size="lg" className="gap-2" data-testid="button-go-to-trade-desk">
              Go to Trade Desk
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function DefaultBlogContent({ content }: { content: string }) {
  return (
    <div className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-bold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-primary prose-code:text-primary prose-table:text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function BlogPostPage() {
  const [, params] = useRoute("/blog/:slug");
  const slug = params?.slug;

  const { data: post, isLoading, error } = useQuery<BlogPost>({
    queryKey: ["/api/blog", slug],
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="container mx-auto max-w-4xl">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="h-64 w-full rounded-2xl mb-8" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="container mx-auto max-w-4xl text-center py-20">
          <h1 className="text-2xl font-bold mb-4">Article Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The article you're looking for doesn't exist or has been removed.
          </p>
          <Link href="/blog">
            <Button variant="outline" data-testid="button-back-to-blog">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Blog
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isTradeGuide = slug === 'how-to-trade-like-a-pro';

  return (
    <div className="min-h-screen bg-background p-6">
      <SEOHead pageKey="blog" />
      <div className="container mx-auto max-w-4xl">
        <Link href="/blog">
          <Button variant="ghost" size="sm" className="mb-6" data-testid="button-back-to-blog">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Blog
          </Button>
        </Link>

        {isTradeGuide ? (
          <TradingGuideContent />
        ) : (
          <article>
            <header className="mb-8">
              <Badge variant="outline" className="mb-4">
                {post.category}
              </Badge>
              <h1 className="text-4xl font-bold mb-4" data-testid="text-post-title">
                {post.title}
              </h1>
              {post.excerpt && (
                <p className="text-xl text-muted-foreground mb-6">
                  {post.excerpt}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>{post.authorName}</span>
                </div>
                {post.publishedAt && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>{format(new Date(post.publishedAt), 'MMMM d, yyyy')}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>8 min read</span>
                </div>
              </div>
            </header>

            <DefaultBlogContent content={post.content} />

            {post.tags && post.tags.length > 0 && (
              <div className="mt-8 pt-8 border-t">
                <h3 className="text-sm font-semibold mb-3">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
