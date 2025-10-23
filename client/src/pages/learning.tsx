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
            
            {/* RSI(2) Mean Reversion */}
            <AccordionItem value="rsi2-mean-reversion">
              <AccordionTrigger className="hover-elevate px-4 rounded-lg">
                <div className="flex items-center gap-3 flex-1 text-left">
                  <Badge variant="default" className="shrink-0">Priority 1</Badge>
                  <span className="font-semibold">RSI(2) Mean Reversion + 200MA Filter</span>
                  <Badge variant="outline" className="ml-auto">75-91% Win Rate</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Larry Connors' proven strategy: Buy when 2-period RSI drops below 10 AND price is above the 200-day moving average.
                  This catches oversold bounces in confirmed uptrends.
                </p>

                <div className="flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">Entry Signal</p>
                    <p className="text-sm text-muted-foreground">
                      RSI(2) &lt; 10 AND price &gt; 200-day MA → LONG signal with 2-4% target
                    </p>
                  </div>
                </div>

                <div className="bg-muted/30 rounded-lg p-3 mt-2">
                  <p className="text-xs font-semibold mb-1">Research Backing:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>QuantifiedStrategies: 75-91% win rate on QQQ (1998-2024 backtest)</li>
                    <li>Larry Connors: Multiple books documenting this strategy's edge</li>
                    <li>200-day MA filter ensures we're trading with the trend, not against it</li>
                  </ul>
                </div>

                <div className="flex items-center gap-2 text-xs text-green-500">
                  <AlertCircle className="h-4 w-4" />
                  <span>This is our highest-conviction signal based on academic research</span>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* VWAP Institutional Flow */}
            <AccordionItem value="vwap-flow">
              <AccordionTrigger className="hover-elevate px-4 rounded-lg">
                <div className="flex items-center gap-3 flex-1 text-left">
                  <Badge variant="default" className="shrink-0">Priority 2</Badge>
                  <span className="font-semibold">VWAP Institutional Flow</span>
                  <Badge variant="outline" className="ml-auto">80%+ Win Rate</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  VWAP (Volume-Weighted Average Price) is the most widely used indicator by professional traders.
                  When price crosses above VWAP with elevated volume, it signals institutional buying.
                </p>

                <div className="flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-cyan-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">Institutional Signal</p>
                    <p className="text-sm text-muted-foreground">
                      Price crosses above VWAP with 1.5x+ volume → Institutions accumulating
                    </p>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <p className="text-xs font-semibold mb-1">Current Limitation:</p>
                  <p className="text-xs text-muted-foreground">
                    We currently approximate VWAP using daily data. True intraday VWAP requires tick-level data.
                    This is documented for transparency - still effective as a proxy signal.
                  </p>
                </div>

                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs font-semibold mb-1">Why Professionals Use VWAP:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Shows the "fair value" where most volume traded</li>
                    <li>Institutions use VWAP to benchmark execution quality</li>
                    <li>Price above VWAP = bullish, below = bearish</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Volume Spike Early Entry */}
            <AccordionItem value="volume-spike">
              <AccordionTrigger className="hover-elevate px-4 rounded-lg">
                <div className="flex items-center gap-3 flex-1 text-left">
                  <Badge variant="secondary" className="shrink-0">Priority 3</Badge>
                  <span className="font-semibold">Volume Spike Early Entry</span>
                  <Badge variant="outline" className="ml-auto">High Win Rate</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Catches stocks at the very beginning of breakout moves. Targets 3x+ volume spikes with minimal price movement (0-2%)
                  to enter before momentum traders pile in.
                </p>

                <div className="flex items-start gap-3">
                  <Activity className="h-5 w-5 text-purple-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">Early Detection</p>
                    <p className="text-sm text-muted-foreground">
                      3x+ volume spike with 0-2% price move → Enter before breakout confirmed
                    </p>
                  </div>
                </div>

                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs font-semibold mb-1">Entry Criteria:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Volume ratio ≥ 3x average (institutional activity)</li>
                    <li>Price move 0-2% (early stage, not late)</li>
                    <li>Price within 5% of day high (not gap-and-fade)</li>
                    <li>Target: Catch the move before it's obvious</li>
                  </ul>
                </div>

                <div className="flex items-center gap-2 text-xs text-amber-500">
                  <AlertCircle className="h-4 w-4" />
                  <span>Volume spike alone is not directional - we validate with price proximity to highs</span>
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
            <p className="font-semibold mb-2">v3.0.0: Research Over Complexity</p>
            <p className="text-muted-foreground">
              After 12.1% win rate proved our complex ML system broken, we rebuilt from scratch using <strong>ONLY academically-proven signals</strong>.
              Three strategies with documented 75-91% win rates replaced 7+ unproven indicators.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">Simple Rule-Based Approach</p>
            <p className="text-muted-foreground">
              No machine learning. No complex scoring. Just clean entry rules based on peer-reviewed research from QuantifiedStrategies,
              Larry Connors, and FINVIZ multi-year studies. Code went from 178 lines → 54 lines.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">What We Removed (And Why)</p>
            <p className="text-muted-foreground">
              <strong>MACD</strong> - Academic consensus: "very low success rate" (FINVIZ 16,954 stock study)<br/>
              <strong>RSI Divergence</strong> - 0% live win rate (catching falling knives)<br/>
              <strong>Complex ML Scoring</strong> - Added complexity without proven edge<br/>
              <strong>Multi-Timeframe Analysis</strong> - 200-day MA filter is sufficient
            </p>
          </div>

          <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
            <p className="text-xs font-semibold mb-1">Target: 60%+ Win Rate (Research-Backed)</p>
            <p className="text-xs text-muted-foreground">
              RSI(2)+200MA has 75-91% backtested win rate. VWAP institutional flow shows 80%+ success.
              We're targeting 60%+ as our baseline expectation based on proven academic research.
            </p>
          </div>

          <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3">
            <p className="text-xs font-semibold mb-1">Transparency: VWAP Limitation</p>
            <p className="text-xs text-muted-foreground">
              Our VWAP signal currently uses approximated daily data (not true intraday tick data).
              We document this limitation for transparency - it's still effective as a proxy until we integrate intraday feeds.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
