import { RiskCalculator } from "@/components/risk-calculator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertTriangle, DollarSign, TrendingUp, Shield } from "lucide-react";

export default function RiskCalculatorPage() {
  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
          <Shield className="h-7 w-7 text-blue-500" />
          Risk Calculator
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Calculate position sizing and risk/reward for your trades
        </p>
      </div>

      {/* Educational Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <CardTitle className="text-sm font-medium">Position Sizing</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Determines how much capital to allocate to a trade based on your account size and risk tolerance.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-sm font-medium">Risk/Reward Ratio</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Compares potential profit to potential loss. A minimum 2:1 ratio is recommended for day trading.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-sm font-medium">Stop Loss Protection</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Defines your exit point to limit losses. Never risk more than 1-2% of your account per trade.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Risk Calculator Component */}
      <Card>
        <CardHeader>
          <CardTitle>Calculate Your Trade</CardTitle>
          <CardDescription>
            Enter your trade parameters to calculate optimal position size and risk metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RiskCalculator />
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <Card className="border-amber-500/50 bg-amber-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-sm">Risk Disclaimer</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Educational Purpose Only:</strong> This calculator is for research and educational purposes. 
            Always consult with a licensed financial advisor before making investment decisions.
          </p>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Risk Management:</strong> Never risk more than you can afford to lose. 
            The 1-2% rule is a guideline - adjust based on your personal risk tolerance and financial situation.
          </p>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Market Volatility:</strong> Past performance does not guarantee future results. 
            Markets can be unpredictable, and all trading involves risk of loss.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
