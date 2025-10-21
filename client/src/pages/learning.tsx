import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, BarChart3, Activity, Target, BookOpen, AlertCircle } from "lucide-react";
import { RiskDisclosure } from "@/components/risk-disclosure";

export default function LearningPage() {
  return (
    <div className="container mx-auto p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="relative overflow-hidden border-b aurora-hero rounded-xl -mx-6 px-6 pb-6 mb-8">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background opacity-50" />
        <div className="relative pt-6">
          <div className="flex items-center gap-3">
            <BookOpen className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gradient-premium">Quantitative Trading Signals</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Learn the technical indicators used in our quant engine
              </p>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px divider-premium" />
      </div>

      {/* Educational Disclaimer */}
      <RiskDisclosure variant="compact" />

      {/* Signal Explanations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Technical Indicator Library
          </CardTitle>
          <CardDescription>
            Interactive explanations of the technical signals used to generate trade ideas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            
            {/* RSI Divergence */}
            <AccordionItem value="rsi-divergence">
              <AccordionTrigger className="hover-elevate px-4 rounded-lg">
                <div className="flex items-center gap-3 flex-1 text-left">
                  <Badge variant="default" className="shrink-0">Priority 1</Badge>
                  <span className="font-semibold">RSI Divergence</span>
                  <Badge variant="outline" className="ml-auto">25 points</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pt-4 space-y-3">
                <div className="flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">Bullish RSI Divergence</p>
                    <p className="text-sm text-muted-foreground">
                      Price makes a lower low, but RSI makes a higher low. This suggests weakening selling pressure and potential upside reversal.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <TrendingDown className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">Bearish RSI Divergence</p>
                    <p className="text-sm text-muted-foreground">
                      Price makes a higher high, but RSI makes a lower high. Indicates weakening buying momentum and potential downside.
                    </p>
                  </div>
                </div>

                <div className="bg-muted/30 rounded-lg p-3 mt-2">
                  <p className="text-xs font-semibold mb-1">How We Use It:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>RSI &lt; 30 (oversold) with bullish divergence → LONG signal</li>
                    <li>RSI &gt; 70 (overbought) with bearish divergence → SHORT signal</li>
                    <li>Strongest when combined with volume confirmation</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* MACD Crossover */}
            <AccordionItem value="macd-crossover">
              <AccordionTrigger className="hover-elevate px-4 rounded-lg">
                <div className="flex items-center gap-3 flex-1 text-left">
                  <Badge variant="default" className="shrink-0">Priority 1</Badge>
                  <span className="font-semibold">MACD Crossover (Fresh)</span>
                  <Badge variant="outline" className="ml-auto">25 points</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  MACD (Moving Average Convergence Divergence) tracks momentum by comparing two exponential moving averages.
                  We prioritize <strong>fresh crossovers</strong> (within last 3 bars) to catch early momentum shifts.
                </p>

                <div className="flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">Bullish Crossover</p>
                    <p className="text-sm text-muted-foreground">
                      MACD line crosses above signal line → Momentum shifting to upside
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <TrendingDown className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">Bearish Crossover</p>
                    <p className="text-sm text-muted-foreground">
                      MACD line crosses below signal line → Momentum shifting to downside
                    </p>
                  </div>
                </div>

                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs font-semibold mb-1">Why "Fresh" Matters:</p>
                  <p className="text-xs text-muted-foreground">
                    Late crossovers (5+ bars old) often indicate a finished move. We target fresh crossovers (1-3 bars) to enter early in the trend.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Volume Spike */}
            <AccordionItem value="volume-spike">
              <AccordionTrigger className="hover-elevate px-4 rounded-lg">
                <div className="flex items-center gap-3 flex-1 text-left">
                  <Badge variant="secondary" className="shrink-0">Priority 2</Badge>
                  <span className="font-semibold">Volume Spike</span>
                  <Badge variant="outline" className="ml-auto">15 points</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Unusual trading volume (3x+ average) signals institutional activity or news-driven moves. High volume validates price movements.
                </p>

                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs font-semibold mb-1">Detection Rules:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Stocks: Volume &gt; 3x 20-day average</li>
                    <li>Crypto: Volume &gt; 3x 7-day average (faster markets)</li>
                    <li>Options: Open Interest or Volume spike (5x baseline)</li>
                  </ul>
                </div>

                <div className="flex items-center gap-2 text-xs text-amber-500">
                  <AlertCircle className="h-4 w-4" />
                  <span>Volume alone is not directional - combine with RSI/MACD for confirmation</span>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Early Breakout */}
            <AccordionItem value="early-breakout">
              <AccordionTrigger className="hover-elevate px-4 rounded-lg">
                <div className="flex items-center gap-3 flex-1 text-left">
                  <Badge variant="secondary" className="shrink-0">Priority 2</Badge>
                  <span className="font-semibold">Early Breakout Setup</span>
                  <Badge variant="outline" className="ml-auto">20 points</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Identifies when price is approaching (but hasn't yet crossed) a resistance level. Entering before the breakout
                  maximizes R:R ratio vs. chasing after the move.
                </p>

                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs font-semibold mb-1">Entry Criteria:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Price within 2% of resistance (52-week high or key level)</li>
                    <li>Volume increasing (confirmation of buying pressure)</li>
                    <li>RSI &gt; 50 (showing strength, not exhaustion)</li>
                    <li>Target: +8-12% above breakout level</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Mean Reversion */}
            <AccordionItem value="mean-reversion">
              <AccordionTrigger className="hover-elevate px-4 rounded-lg">
                <div className="flex items-center gap-3 flex-1 text-left">
                  <Badge variant="secondary" className="shrink-0">Priority 2</Badge>
                  <span className="font-semibold">Mean Reversion</span>
                  <Badge variant="outline" className="ml-auto">15 points</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  When price deviates significantly from its moving average, statistical odds favor a return to the mean.
                  Best in range-bound or choppy markets.
                </p>

                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs font-semibold mb-1">Setup Rules:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Oversold (RSI &lt; 30) with price &gt;10% below 20-day SMA → LONG</li>
                    <li>Overbought (RSI &gt; 70) with price &gt;10% above 20-day SMA → SHORT</li>
                    <li>Tighter stops (3-4%) since we're counter-trend trading</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>

          </Accordion>
        </CardContent>
      </Card>

      {/* Model Philosophy */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Our Quantitative Philosophy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-semibold mb-2">Predictive Over Reactive</p>
            <p className="text-muted-foreground">
              We prioritize <strong>early setup signals</strong> (RSI divergence, fresh MACD crossovers) over late-stage momentum indicators.
              Goal: Enter at the beginning of moves, not chase finished trends.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">Wider Stops, Better Survival</p>
            <p className="text-muted-foreground">
              v2.2.0 uses 4-5% stops (vs. 3% in v2.1) to avoid premature exits from normal volatility. Day trading requires room to breathe.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">Machine Learning Enhancement</p>
            <p className="text-muted-foreground">
              Our ML system tracks which signals actually win, then adjusts their weights in real-time. High-performing signals get boosted;
              underperformers get reduced. This creates a self-improving feedback loop.
            </p>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
            <p className="text-xs font-semibold mb-1">Current Target: 60%+ Quant Accuracy</p>
            <p className="text-xs text-muted-foreground">
              System currently at 12% accuracy (legacy momentum-chasing trades). Fresh trades (v2.2.0 engine) are being validated.
              Need 30+ closed trades to measure true performance of new predictive approach.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
