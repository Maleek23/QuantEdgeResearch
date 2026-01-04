import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Download,
  BookOpen,
  TrendingUp,
  BarChart3,
  Target,
  Shield,
  Zap,
  Brain,
  Activity,
  LineChart,
  Calculator,
  ChevronRight,
} from "lucide-react";

export default function TechnicalGuide() {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      
      let y = 20;
      const lineHeight = 7;
      const pageHeight = 280;
      
      const addPage = () => {
        doc.addPage();
        y = 20;
      };
      
      const addText = (text: string, size: number = 12, isBold: boolean = false) => {
        if (y > pageHeight) addPage();
        doc.setFontSize(size);
        doc.setFont("helvetica", isBold ? "bold" : "normal");
        const lines = doc.splitTextToSize(text, 180);
        doc.text(lines, 15, y);
        y += lines.length * lineHeight;
      };
      
      const addSection = (title: string) => {
        y += 5;
        if (y > pageHeight - 20) addPage();
        addText(title, 14, true);
        y += 3;
      };

      addText("QUANT EDGE LABS", 20, true);
      addText("Technical Analysis Foundations", 16, true);
      y += 5;
      addText("Educational Guide - Not Financial Advice", 10);
      y += 10;

      addSection("1. TECHNICAL INDICATORS");
      
      addText("RSI (Relative Strength Index)", 12, true);
      addText("Measures momentum on 0-100 scale. RSI > 70 = overbought (sell signal), RSI < 30 = oversold (buy signal). Quant Edge Labs uses RSI(2) for short-term mean reversion and RSI(14) for trend confirmation.");
      y += 5;

      addText("RSI(2) Mean Reversion Strategy", 12, true);
      addText("Based on Larry Connors research: When RSI(2) < 10 and price > 200 SMA, buy for mean reversion bounce. RSI(2) < 5 = strong buy signal. Targets 55-65% win rate.");
      y += 5;

      addText("MACD (Moving Average Convergence Divergence)", 12, true);
      addText("Shows trend direction and momentum. MACD line crossing above signal = bullish. Histogram shows momentum strength. Used for trend confirmation, not primary signal.");
      y += 5;

      addText("Bollinger Bands", 12, true);
      addText("20-period SMA with 2 standard deviation bands. Price touching lower band = potential bounce. Price touching upper band = potential pullback. Width indicates volatility.");
      y += 5;

      addText("VWAP (Volume-Weighted Average Price)", 12, true);
      addText("Average price weighted by volume - used by institutions. Price above VWAP = bullish bias. Price below VWAP = bearish bias. Key for intraday trading.");
      y += 5;

      addText("ADX (Average Directional Index)", 12, true);
      addText("Measures trend STRENGTH (not direction). ADX < 20 = weak/ranging (good for mean reversion). ADX > 25 = strong trend (good for momentum). Critical filter.");
      
      addPage();
      addSection("2. SIGNAL GRADING SYSTEM");
      
      addText("Quant Edge Labs uses academic-style grading (A+ to F) based on confidence scores:", 12);
      y += 3;
      addText("A+ (95%+) - Exceptional: Multiple strong signals aligned, high probability");
      addText("A (93-94%) - Excellent: Strong technical setup with volume confirmation");
      addText("A- (90-92%) - Very Strong: Clear directional bias with good risk/reward");
      addText("B+ (87-89%) - Strong: Solid setup, may need patience for entry");
      addText("B (83-86%) - Good: Tradeable setup with moderate conviction");
      addText("B- (80-82%) - Above Average: Acceptable but requires tight risk management");
      addText("C+ (77-79%) - Average+: Speculative, smaller position size recommended");
      addText("C (73-76%) - Average: Higher risk, use only with strong catalyst");
      addText("D/F (<70%) - Below Average/Failing: Not recommended for trading");

      addSection("3. RISK/REWARD RATIOS");
      
      addText("R:R Calculation", 12, true);
      addText("Risk/Reward = (Target - Entry) / (Entry - Stop)");
      addText("Example: Entry $100, Target $115, Stop $95");
      addText("Reward = $15, Risk = $5, R:R = 3:1");
      y += 5;
      addText("Quant Edge Labs Minimums:", 12, true);
      addText("Day trades: 2:1 minimum R:R");
      addText("Swing trades: 2.5:1 minimum R:R");
      addText("Lotto plays: 5:1+ minimum R:R (high risk)");

      addPage();
      addSection("4. QUANTITATIVE ENGINE METHODOLOGY");
      
      addText("Engine 1: RSI(2) Mean Reversion", 12, true);
      addText("When: RSI(2) < 10, Price > 200 SMA, ADX < 25");
      addText("Entry: At oversold extreme, expecting bounce");
      addText("Exit: RSI(2) > 70 or target hit");
      addText("Win Rate Target: 55-65%");
      y += 5;

      addText("Engine 2: VWAP Institutional Flow", 12, true);
      addText("When: Price crosses VWAP with 150%+ volume");
      addText("Long: Price breaks above VWAP with volume");
      addText("Short: Price breaks below VWAP with volume");
      addText("Confirms institutional participation");
      y += 5;

      addText("Engine 3: Volume Spike Early Entry", 12, true);
      addText("When: Volume > 2x average with small price move");
      addText("Theory: Smart money accumulating before move");
      addText("Entry: Before price catches up to volume");
      addText("Risk: False breakouts require tight stops");
      y += 5;

      addText("Engine 4: ADX Regime Filtering", 12, true);
      addText("ADX < 20: Use mean reversion strategies");
      addText("ADX 20-25: Transitional, be cautious");
      addText("ADX > 25: Use trend-following strategies");
      addText("Prevents wrong strategy in wrong market");

      addPage();
      addSection("5. CHART ANALYSIS SYSTEM");
      
      addText("Dual-Engine Approach:", 12, true);
      addText("1. AI Vision Analysis (Primary): Uses Claude/GPT-4/Gemini to analyze chart images for patterns, support/resistance, trendlines");
      addText("2. Quantitative Fallback: When AI unavailable, falls back to calculated indicators (RSI, MACD, Bollinger, VWAP)");
      y += 5;

      addText("Pattern Recognition:", 12, true);
      addText("- Support/Resistance levels from price clusters");
      addText("- Trend channels from highs/lows analysis");
      addText("- Volume profile for institutional interest");
      addText("- Candlestick patterns (doji, engulfing, hammer)");

      addSection("6. POSITION SIZING & RISK MANAGEMENT");
      
      addText("Position Sizing Rules:", 12, true);
      addText("Max 5% portfolio risk per trade");
      addText("Options: Max 2% premium per lotto play");
      addText("Crypto: Max $100 or 30% balance per trade");
      addText("Futures: 1 micro contract per $300 capital");
      y += 5;

      addText("Stop Loss Guidelines:", 12, true);
      addText("Stocks: ATR-based or support level");
      addText("Options: 50% premium (lotto) or 30% (swing)");
      addText("Crypto: 7% from entry");
      addText("Futures: Tick-based calculation");

      addPage();
      addSection("7. DISCLAIMER");
      
      addText("EDUCATIONAL PURPOSES ONLY", 14, true);
      y += 5;
      addText("Quant Edge Labs provides educational analysis and research tools. This is NOT financial advice. All trading involves substantial risk of loss. Past performance does not guarantee future results. Always do your own research and consult a licensed financial advisor before making investment decisions.");
      y += 10;
      addText("Document generated: " + new Date().toLocaleDateString());
      
      doc.save("QuantEdgeLabs-Technical-Analysis-Guide.pdf");
    } catch (error) {
      console.error("PDF generation failed:", error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-primary" />
            Technical Analysis Foundations
          </h1>
          <p className="text-muted-foreground mt-1">
            Understanding Quant Edge Labs' quantitative methodology
          </p>
        </div>
        <Button 
          onClick={handleDownloadPdf} 
          disabled={isGeneratingPdf}
          data-testid="button-download-pdf"
        >
          <Download className="h-4 w-4 mr-2" />
          {isGeneratingPdf ? "Generating..." : "Download PDF"}
        </Button>
      </div>

      <Card className="mb-6 border-amber-500/20 bg-amber-500/5">
        <CardContent className="pt-4">
          <p className="text-sm text-amber-600 dark:text-amber-400">
            <strong>Educational Disclaimer:</strong> This guide is for educational purposes only. 
            Trading involves substantial risk. Past performance does not guarantee future results. 
            Always consult a licensed financial advisor.
          </p>
        </CardContent>
      </Card>

      <ScrollArea className="h-[calc(100vh-240px)]">
        <Accordion type="multiple" defaultValue={["indicators", "grading", "riskReward"]} className="space-y-4">
          <AccordionItem value="indicators" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-cyan-500" />
                <span className="font-semibold">Technical Indicators</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-4 pt-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      RSI (Relative Strength Index)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <p>Measures momentum on a 0-100 scale. The most important momentum indicator.</p>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="outline" className="bg-red-500/10">RSI &gt; 70 = Overbought</Badge>
                      <Badge variant="outline" className="bg-green-500/10">RSI &lt; 30 = Oversold</Badge>
                    </div>
                    <p className="text-muted-foreground">
                      <strong>RSI(2)</strong>: Short-term mean reversion. RSI(2) &lt; 10 = strong buy signal.
                      <br />
                      <strong>RSI(14)</strong>: Standard momentum. Used for trend confirmation.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <LineChart className="h-4 w-4 text-purple-500" />
                      MACD (Moving Average Convergence Divergence)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <p>Shows trend direction and momentum using 12/26/9 EMAs.</p>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="outline" className="bg-green-500/10">MACD &gt; Signal = Bullish</Badge>
                      <Badge variant="outline" className="bg-red-500/10">MACD &lt; Signal = Bearish</Badge>
                    </div>
                    <p className="text-muted-foreground">
                      Histogram shows momentum strength. Crossovers signal potential trend changes.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-blue-500" />
                      Bollinger Bands
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <p>20-period SMA with 2 standard deviation bands. Measures volatility.</p>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="outline">Lower Band = Potential Bounce</Badge>
                      <Badge variant="outline">Upper Band = Potential Pullback</Badge>
                    </div>
                    <p className="text-muted-foreground">
                      Band width indicates volatility. Squeeze = low volatility, expansion coming.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      VWAP (Volume-Weighted Average Price)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <p>Average price weighted by volume - the institutional benchmark.</p>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="outline" className="bg-green-500/10">Price &gt; VWAP = Bullish</Badge>
                      <Badge variant="outline" className="bg-red-500/10">Price &lt; VWAP = Bearish</Badge>
                    </div>
                    <p className="text-muted-foreground">
                      Institutions use VWAP to execute large orders. Crossing VWAP with volume = significant.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="h-4 w-4 text-orange-500" />
                      ADX (Average Directional Index)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-2">
                    <p>Measures trend STRENGTH (not direction). Critical for strategy selection.</p>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="outline">ADX &lt; 20 = Ranging</Badge>
                      <Badge variant="outline">ADX &gt; 25 = Trending</Badge>
                    </div>
                    <p className="text-muted-foreground">
                      Low ADX = use mean reversion. High ADX = use momentum strategies.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="grading" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-purple-500" />
                <span className="font-semibold">Signal Grading System</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-2 space-y-3">
                <p className="text-sm text-muted-foreground mb-4">
                  Quant Edge Labs uses academic-style grading based on confidence scores (0-100):
                </p>
                <div className="grid gap-2">
                  {[
                    { grade: "A+", range: "95%+", desc: "Exceptional - Multiple strong signals aligned", color: "text-green-500" },
                    { grade: "A", range: "93-94%", desc: "Excellent - Strong technical setup with volume", color: "text-green-500" },
                    { grade: "A-", range: "90-92%", desc: "Very Strong - Clear directional bias", color: "text-green-400" },
                    { grade: "B+", range: "87-89%", desc: "Strong - Solid setup, patience for entry", color: "text-blue-500" },
                    { grade: "B", range: "83-86%", desc: "Good - Tradeable with moderate conviction", color: "text-blue-400" },
                    { grade: "B-", range: "80-82%", desc: "Above Average - Tight risk management", color: "text-blue-300" },
                    { grade: "C+", range: "77-79%", desc: "Average+ - Speculative, small size", color: "text-yellow-500" },
                    { grade: "C", range: "73-76%", desc: "Average - Higher risk, needs catalyst", color: "text-yellow-400" },
                    { grade: "D/F", range: "<70%", desc: "Below Average - Not recommended", color: "text-red-500" },
                  ].map((item) => (
                    <div key={item.grade} className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
                      <Badge className={`${item.color} bg-transparent border-current w-12 justify-center`}>
                        {item.grade}
                      </Badge>
                      <span className="text-sm text-muted-foreground w-16">{item.range}</span>
                      <span className="text-sm">{item.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="riskReward" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-500" />
                <span className="font-semibold">Risk/Reward Ratios</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-2 space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">R:R Calculation</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <div className="bg-muted/50 p-3 rounded-md font-mono mb-3">
                      R:R = (Target - Entry) / (Entry - Stop)
                    </div>
                    <p className="mb-2"><strong>Example:</strong></p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Entry: $100</li>
                      <li>Target: $115 (Reward = $15)</li>
                      <li>Stop: $95 (Risk = $5)</li>
                      <li>R:R = 15/5 = <strong className="text-foreground">3:1</strong></li>
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Quant Edge Labs Minimums</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <div className="grid gap-2">
                      <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
                        <span>Day Trades</span>
                        <Badge variant="outline">2:1 minimum</Badge>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
                        <span>Swing Trades</span>
                        <Badge variant="outline">2.5:1 minimum</Badge>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
                        <span>Lotto Plays</span>
                        <Badge variant="outline">5:1+ minimum</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="engines" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-cyan-500" />
                <span className="font-semibold">Quantitative Engine Methodology</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-2 grid gap-4">
                {[
                  {
                    name: "RSI(2) Mean Reversion",
                    when: "RSI(2) < 10, Price > 200 SMA, ADX < 25",
                    entry: "At oversold extreme, expecting bounce",
                    exit: "RSI(2) > 70 or target hit",
                    winRate: "55-65%",
                    color: "border-green-500/50"
                  },
                  {
                    name: "VWAP Institutional Flow",
                    when: "Price crosses VWAP with 150%+ volume",
                    entry: "On VWAP break with volume confirmation",
                    exit: "VWAP recross or target",
                    winRate: "50-60%",
                    color: "border-blue-500/50"
                  },
                  {
                    name: "Volume Spike Early Entry",
                    when: "Volume > 2x average, small price move",
                    entry: "Before price catches up to volume",
                    exit: "Momentum fade or target",
                    winRate: "45-55%",
                    color: "border-purple-500/50"
                  },
                  {
                    name: "ADX Regime Filtering",
                    when: "Strategy selection based on trend strength",
                    entry: "Low ADX = reversion, High ADX = momentum",
                    exit: "Regime change or target",
                    winRate: "Improves other strategies",
                    color: "border-orange-500/50"
                  },
                ].map((engine) => (
                  <Card key={engine.name} className={`border-l-4 ${engine.color}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{engine.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-muted-foreground">When:</span>
                          <p>{engine.when}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Entry:</span>
                          <p>{engine.entry}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Exit:</span>
                          <p>{engine.exit}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Win Rate:</span>
                          <p className="font-semibold">{engine.winRate}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sizing" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-red-500" />
                <span className="font-semibold">Position Sizing & Risk Management</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-2 space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Position Sizing Rules</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        <span>Max <strong>5% portfolio risk</strong> per trade</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        <span>Options: Max <strong>2% premium</strong> per lotto play</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        <span>Crypto: Max <strong>$100</strong> or <strong>30% balance</strong> per trade</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        <span>Futures: <strong>1 micro contract</strong> per $300 capital</span>
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Stop Loss Guidelines</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <div className="grid gap-2">
                      <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
                        <span>Stocks</span>
                        <span className="text-muted-foreground">ATR-based or support level</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
                        <span>Options (Lotto)</span>
                        <span className="text-muted-foreground">50% of premium</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
                        <span>Options (Swing)</span>
                        <span className="text-muted-foreground">30% of premium</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
                        <span>Crypto</span>
                        <span className="text-muted-foreground">7% from entry</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
                        <span>Futures</span>
                        <span className="text-muted-foreground">Tick-based calculation</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </ScrollArea>
    </div>
  );
}
