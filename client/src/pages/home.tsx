import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  LineChart, 
  Activity,
  Zap,
  Target,
  Clock,
  ArrowRight,
  Play,
  Star,
  Newspaper,
  Plus,
  PieChart,
} from "lucide-react";

const portfolioData = [
  { symbol: "AAPL", name: "Apple Inc.", value: 22.7, color: "#3b82f6", price: 248.04, change: -8.76 },
  { symbol: "AXP", name: "American Express", value: 18.8, color: "#f97316", price: 312.45, change: 2.34 },
  { symbol: "BAC", name: "Bank of America", value: 11.0, color: "#22c55e", price: 42.18, change: 0.87 },
  { symbol: "KO", name: "Coca-Cola", value: 9.9, color: "#ef4444", price: 62.34, change: -0.23 },
  { symbol: "CVX", name: "Chevron", value: 7.1, color: "#8b5cf6", price: 156.78, change: 1.45 },
  { symbol: "OXY", name: "Occidental", value: 4.7, color: "#ec4899", price: 52.34, change: 3.21 },
];

const newsItems = [
  { id: 1, title: "Fed Signals Potential Rate Cut in March Meeting", time: "2 hours ago", source: "Reuters" },
  { id: 2, title: "NVIDIA Hits New All-Time High Amid AI Chip Demand", time: "4 hours ago", source: "Bloomberg" },
  { id: 3, title: "Oil Prices Rise on Middle East Tensions", time: "5 hours ago", source: "WSJ" },
  { id: 4, title: "Apple Announces Record Q1 Earnings", time: "6 hours ago", source: "CNBC" },
];

const analysisButtons = [
  { id: "technical", label: "Technical Analysis", icon: LineChart, href: "/analysis" },
  { id: "fundamental", label: "Fundamental Analysis", icon: BarChart3, href: "/analysis" },
  { id: "swing", label: "Swing Trade Setup", icon: TrendingUp, href: "/research" },
  { id: "options", label: "Options Play", icon: Target, href: "/analysis" },
  { id: "chart", label: "Chart Analysis", icon: Activity, href: "/chart-analysis" },
  { id: "daytrade", label: "Day Trade Setup", icon: Zap, href: "/research" },
];

function PortfolioPieChart() {
  const total = portfolioData.reduce((sum, item) => sum + item.value, 0);
  let currentAngle = 0;
  
  return (
    <div className="relative w-56 h-56 mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        {portfolioData.map((item) => {
          const angle = (item.value / total) * 360;
          const startAngle = currentAngle;
          currentAngle += angle;
          
          const x1 = 50 + 40 * Math.cos((startAngle * Math.PI) / 180);
          const y1 = 50 + 40 * Math.sin((startAngle * Math.PI) / 180);
          const x2 = 50 + 40 * Math.cos(((startAngle + angle) * Math.PI) / 180);
          const y2 = 50 + 40 * Math.sin(((startAngle + angle) * Math.PI) / 180);
          
          const largeArc = angle > 180 ? 1 : 0;
          
          return (
            <path
              key={item.symbol}
              d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={item.color}
              className="transition-opacity hover:opacity-80 cursor-pointer"
            />
          );
        })}
        <circle cx="50" cy="50" r="22" className="fill-card" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl font-bold text-foreground">$125.4K</p>
          <p className="text-xs text-muted-foreground">Total Value</p>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Welcome Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Welcome back</h1>
          <p className="text-muted-foreground mt-1">Here's what's happening with your portfolio today.</p>
        </div>
        <Link href="/watchlist">
          <Button className="gap-2" data-testid="button-add-watchlist">
            <Plus className="h-4 w-4" />
            Add to Watchlist
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Portfolio Overview */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex-row items-center justify-between gap-4">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <PieChart className="h-5 w-5 text-primary" />
              Portfolio Overview
            </CardTitle>
            <Link href="/portfolio">
              <Button variant="ghost" size="sm" className="text-primary gap-1" data-testid="link-portfolio">
                View All <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row items-center gap-6">
              <PortfolioPieChart />
              <div className="flex-1 space-y-1.5 w-full">
                {portfolioData.map((item) => (
                  <Link key={item.symbol} href={`/analysis/${item.symbol}`}>
                    <div 
                      className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                      data-testid={`portfolio-${item.symbol}`}
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: item.color }}
                        />
                        <div>
                          <span className="font-medium text-foreground">{item.symbol}</span>
                          <span className="text-muted-foreground text-sm ml-2 hidden sm:inline">{item.value}%</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-foreground">${item.price}</p>
                        <p className={`text-sm ${item.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {item.change >= 0 ? '+' : ''}{item.change}%
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions - Analysis Buttons */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-medium">Quick Analysis</CardTitle>
            <p className="text-sm text-muted-foreground">Search a stock and run analysis</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {analysisButtons.map((btn) => (
              <Link key={btn.id} href={btn.href}>
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-3 h-10"
                  data-testid={`analysis-${btn.id}`}
                >
                  <btn.icon className="h-4 w-4 text-primary" />
                  <span className="flex-1 text-left">{btn.label}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Button>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* News & Market Movers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Breaking News */}
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between gap-4">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Newspaper className="h-5 w-5 text-primary" />
              Breaking News
            </CardTitle>
            <Link href="/discover">
              <Button variant="ghost" size="sm" className="text-primary gap-1" data-testid="link-discover">
                View All <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {newsItems.map((news) => (
              <div 
                key={news.id}
                className="p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer border border-border"
                data-testid={`news-${news.id}`}
              >
                <p className="font-medium text-foreground text-sm leading-snug">{news.title}</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {news.time}
                  <span>•</span>
                  {news.source}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Movers */}
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between gap-4">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Top Movers
            </CardTitle>
            <Link href="/market-movers">
              <Button variant="ghost" size="sm" className="text-primary gap-1" data-testid="link-movers">
                View All <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {[
                { symbol: "NVDA", name: "NVIDIA Corp", change: 5.67, price: 892.34 },
                { symbol: "SMCI", name: "Super Micro", change: 4.23, price: 1024.56 },
                { symbol: "AMD", name: "AMD Inc", change: 3.45, price: 178.90 },
                { symbol: "TSLA", name: "Tesla Inc", change: -2.34, price: 245.67 },
              ].map((stock) => (
                <Link key={stock.symbol} href={`/analysis/${stock.symbol}`}>
                  <div 
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                    data-testid={`mover-${stock.symbol}`}
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-primary">{stock.symbol}</span>
                      <span className="text-muted-foreground text-sm ml-2 hidden sm:inline">{stock.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-foreground">${stock.price}</span>
                      <Badge className={`${stock.change >= 0 ? 'bg-green-500/15 text-green-500 border-green-500/30' : 'bg-red-500/15 text-red-500 border-red-500/30'}`}>
                        {stock.change >= 0 ? '+' : ''}{stock.change}%
                      </Badge>
                      <Button size="sm" variant="ghost" className="h-8 text-primary" data-testid={`research-${stock.symbol}`}>
                        <Play className="h-3 w-3 mr-1" />
                        Research
                      </Button>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Watchlist Preview */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between gap-4">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" />
            Your Watchlist
          </CardTitle>
          <Link href="/watchlist">
            <Button variant="ghost" size="sm" className="text-primary gap-1" data-testid="link-watchlist">
              Manage <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2.5 text-sm font-medium text-muted-foreground">Symbol</th>
                  <th className="text-right py-2.5 text-sm font-medium text-muted-foreground">Price</th>
                  <th className="text-right py-2.5 text-sm font-medium text-muted-foreground">Change</th>
                  <th className="text-right py-2.5 text-sm font-medium text-muted-foreground hidden sm:table-cell">Market Cap</th>
                  <th className="text-right py-2.5 text-sm font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { symbol: "SPY", name: "S&P 500 ETF", price: 689.13, change: 1.07, cap: "711.44B" },
                  { symbol: "MSFT", name: "Microsoft Corp", price: 465.95, change: -3.65, cap: "3.46T" },
                  { symbol: "AAPL", name: "Apple Inc", price: 248.04, change: -8.76, cap: "3.67T" },
                  { symbol: "QQQ", name: "Invesco QQQ", price: 622.72, change: 1.37, cap: "408.46B" },
                ].map((stock) => (
                  <tr key={stock.symbol} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                    <td className="py-3">
                      <Link href={`/analysis/${stock.symbol}`}>
                        <span className="font-semibold text-primary hover:underline cursor-pointer">{stock.symbol}</span>
                      </Link>
                      <span className="text-muted-foreground text-sm ml-2 hidden sm:inline">{stock.name}</span>
                    </td>
                    <td className="text-right py-3 font-medium text-foreground">${stock.price}</td>
                    <td className={`text-right py-3 ${stock.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {stock.change >= 0 ? '+' : ''}{stock.change}%
                    </td>
                    <td className="text-right py-3 text-muted-foreground hidden sm:table-cell">{stock.cap}</td>
                    <td className="text-right py-3">
                      <Link href={`/analysis/${stock.symbol}`}>
                        <Button size="sm" variant="ghost" className="text-primary h-8" data-testid={`run-research-${stock.symbol}`}>
                          <Play className="h-3 w-3 mr-1" />
                          Run Research
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
