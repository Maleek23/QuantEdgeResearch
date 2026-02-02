import { useMemo, useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, safeToFixed } from "@/lib/utils";
import { ChevronRight, Activity, TrendingUp, TrendingDown } from "lucide-react";
import { useRealtimePrices } from "@/context/realtime-prices-context";
import { Link } from "wouter";

interface DataPoint {
  time: string;
  price: number;
  change?: number;
}

interface MarketMonitorChartProps {
  symbol: string;
  name: string;
  data: DataPoint[];
  currentPrice: number;
  changePercent: number;
  className?: string;
}

export function MarketMonitorChart({
  symbol,
  name,
  data,
  currentPrice,
  changePercent,
  className,
}: MarketMonitorChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });

  const chartMetrics = useMemo(() => {
    if (!data.length) return { minPrice: 0, maxPrice: 0, priceRange: 1, points: "" };
    
    const prices = data.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;
    const padding = priceRange * 0.1;
    
    return {
      minPrice: minPrice - padding,
      maxPrice: maxPrice + padding,
      priceRange: priceRange + padding * 2,
      prices,
    };
  }, [data]);

  const svgPath = useMemo(() => {
    if (!data.length) return "";
    
    const width = 600;
    const height = 200;
    const paddingX = 40;
    const paddingY = 20;
    const chartWidth = width - paddingX * 2;
    const chartHeight = height - paddingY * 2;
    
    const points = data.map((d, i) => {
      const x = paddingX + (i / (data.length - 1)) * chartWidth;
      const y = paddingY + chartHeight - ((d.price - chartMetrics.minPrice) / chartMetrics.priceRange) * chartHeight;
      return { x, y, data: d };
    });
    
    const pathD = points
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(" ");
    
    return { pathD, points, width, height, paddingX, paddingY, chartWidth, chartHeight };
  }, [data, chartMetrics]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgPath || typeof svgPath === 'string') return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const relativeX = (x - svgPath.paddingX) / svgPath.chartWidth;
    const index = Math.round(relativeX * (data.length - 1));
    
    if (index >= 0 && index < data.length) {
      const point = svgPath.points[index];
      setHoveredPoint(data[index]);
      setHoverPosition({ x: point.x, y: point.y });
    }
  }, [svgPath, data]);

  const handleMouseLeave = useCallback(() => {
    setHoveredPoint(null);
  }, []);

  if (!data.length || typeof svgPath === 'string') {
    return (
      <Card className={cn("bg-slate-900/50 border-slate-800/50", className)}>
        <CardContent className="p-6 flex items-center justify-center h-64">
          <span className="text-slate-500">No data available</span>
        </CardContent>
      </Card>
    );
  }

  const isPositive = changePercent >= 0;
  const lineColor = isPositive ? "#22c55e" : "#ef4444";
  const gradientId = `gradient-${symbol}`;

  return (
    <Card className={cn("bg-slate-900/50 border-slate-800/50 overflow-hidden", className)} data-testid={`chart-${symbol.toLowerCase()}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg font-medium">{name}</CardTitle>
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative">
          <svg
            viewBox={`0 0 ${svgPath.width} ${svgPath.height}`}
            className="w-full h-48"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
                <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
              </linearGradient>
            </defs>
            
            {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
              const y = svgPath.paddingY + svgPath.chartHeight * (1 - pct);
              const price = chartMetrics.minPrice + chartMetrics.priceRange * pct;
              return (
                <g key={i}>
                  <line
                    x1={svgPath.paddingX}
                    y1={y}
                    x2={svgPath.width - svgPath.paddingX}
                    y2={y}
                    stroke="#334155"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text
                    x={svgPath.width - 5}
                    y={y + 4}
                    fill="#64748b"
                    fontSize="10"
                    textAnchor="end"
                    className="font-mono"
                  >
                    {safeToFixed(price, 2)}
                  </text>
                </g>
              );
            })}
            
            <path
              d={`${svgPath.pathD} L ${svgPath.points[svgPath.points.length - 1].x} ${svgPath.height - svgPath.paddingY} L ${svgPath.paddingX} ${svgPath.height - svgPath.paddingY} Z`}
              fill={`url(#${gradientId})`}
            />
            
            <path
              d={svgPath.pathD}
              fill="none"
              stroke={lineColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            
            {hoveredPoint && (
              <>
                <line
                  x1={hoverPosition.x}
                  y1={svgPath.paddingY}
                  x2={hoverPosition.x}
                  y2={svgPath.height - svgPath.paddingY}
                  stroke="#64748b"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <circle
                  cx={hoverPosition.x}
                  cy={hoverPosition.y}
                  r="6"
                  fill={lineColor}
                  stroke="#0f172a"
                  strokeWidth="2"
                />
              </>
            )}
            
            {data.map((d, i) => {
              if (i % Math.ceil(data.length / 6) !== 0 && i !== data.length - 1) return null;
              const x = svgPath.paddingX + (i / (data.length - 1)) * svgPath.chartWidth;
              return (
                <text
                  key={i}
                  x={x}
                  y={svgPath.height - 5}
                  fill="#64748b"
                  fontSize="10"
                  textAnchor="middle"
                  className="font-mono"
                >
                  {d.time}
                </text>
              );
            })}
          </svg>
          
          {hoveredPoint && (
            <div
              className="absolute pointer-events-none bg-slate-800/95 border border-slate-700 rounded-lg px-3 py-2 shadow-xl backdrop-blur-sm"
              style={{
                left: hoverPosition.x + 10,
                top: 10,
                transform: hoverPosition.x > 400 ? 'translateX(-100%)' : undefined,
              }}
            >
              <div className="flex items-center gap-2">
                <Badge className={cn(
                  "text-xs font-mono",
                  isPositive ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                )}>
                  {symbol}
                </Badge>
                <span className="text-lg font-bold font-mono text-white">
                  ${safeToFixed(hoveredPoint.price, 3, '0.000')}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {hoveredPoint.time}
              </div>
              {hoveredPoint.change !== undefined && (
                <div className={cn(
                  "text-sm font-mono mt-1",
                  hoveredPoint.change >= 0 ? "text-emerald-400" : "text-red-400"
                )}>
                  {hoveredPoint.change >= 0 ? '+' : ''}{safeToFixed(hoveredPoint.change, 2)}%
                </div>
              )}
            </div>
          )}
          
          <div className="absolute top-2 left-4">
            <span className="text-sm text-slate-400">{symbol}</span>
          </div>
          
          <div className="absolute bottom-16 right-4 bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-1.5 backdrop-blur-sm">
            <span className="text-lg font-bold font-mono text-white">
              ${safeToFixed(currentPrice, 3, '0.000')}
            </span>
            <span className={cn(
              "ml-2 text-sm font-mono",
              isPositive ? "text-emerald-400" : "text-red-400"
            )}>
              {isPositive ? '+' : ''}{safeToFixed(changePercent, 2)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function generateInitialData(basePrice: number, points: number = 50): DataPoint[] {
  const data: DataPoint[] = [];
  let price = basePrice;
  const now = new Date();
  const startHour = 9;
  const startMinute = 30;
  
  for (let i = 0; i < points; i++) {
    const minutes = i * 6;
    const hour = startHour + Math.floor((startMinute + minutes) / 60);
    const minute = (startMinute + minutes) % 60;
    const time = `${hour}:${minute.toString().padStart(2, '0')}`;
    
    const change = (Math.random() - 0.48) * 1.5;
    price = price + change;
    const changePercent = ((price - basePrice) / basePrice) * 100;
    
    data.push({ time, price, change: changePercent });
  }
  
  return data;
}

export function MarketMonitorSection() {
  const { getPrice, isConnected } = useRealtimePrices();
  const [basePrice, setBasePrice] = useState<number | null>(null);
  const [priceHistory, setPriceHistory] = useState<DataPoint[]>([]);
  const [initialized, setInitialized] = useState(false);
  
  const spyPrice = getPrice("SPY");
  
  useEffect(() => {
    if (spyPrice?.price && !initialized) {
      const initialBase = spyPrice.price;
      setBasePrice(initialBase);
      setPriceHistory(generateInitialData(initialBase, 30));
      setInitialized(true);
    }
  }, [spyPrice?.price, initialized]);
  
  useEffect(() => {
    if (spyPrice?.price && basePrice && initialized) {
      const now = new Date();
      const time = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
      const changePercent = ((spyPrice.price - basePrice) / basePrice) * 100;
      
      setPriceHistory(prev => {
        const newHistory = [...prev, { time, price: spyPrice.price, change: changePercent }];
        if (newHistory.length > 100) newHistory.shift();
        return newHistory;
      });
    }
  }, [spyPrice?.price, basePrice, initialized]);

  const currentPrice = spyPrice?.price || (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1]?.price : 0);
  const effectiveBase = basePrice || currentPrice || 1;
  const changePercent = currentPrice && effectiveBase ? ((currentPrice - effectiveBase) / effectiveBase) * 100 : 0;
  const isPositive = changePercent >= 0;
  
  if (!initialized || priceHistory.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              Market Monitor
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </h2>
            <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">
              <Activity className="w-3 h-3 mr-1 animate-pulse" />
              Connecting...
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3">
            <Card className="bg-slate-900/50 border-slate-800/50 h-[300px] flex items-center justify-center">
              <div className="text-center">
                <Activity className="w-8 h-8 text-cyan-400 animate-pulse mx-auto mb-2" />
                <p className="text-slate-400">Loading market data...</p>
              </div>
            </Card>
          </div>
          <div className="space-y-3">
            <Card className="bg-slate-900/50 border-slate-800/50 h-24 animate-pulse" />
            <Card className="bg-slate-900/50 border-slate-800/50 h-24 animate-pulse" />
            <Card className="bg-slate-900/50 border-slate-800/50 h-24 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            Market Monitor
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </h2>
          <Badge 
            variant="outline" 
            className={cn(
              "text-xs",
              isConnected ? "border-emerald-500/50 text-emerald-400" : "border-slate-600 text-slate-400"
            )}
          >
            <Activity className={cn("w-3 h-3 mr-1", isConnected && "animate-pulse")} />
            {isConnected ? "Live" : "Cached"}
          </Badge>
        </div>
        <Link href="/market-scanner">
          <Badge 
            variant="outline" 
            className="cursor-pointer border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
            data-testid="link-market-scanner"
          >
            Full Scanner
            <ChevronRight className="w-3 h-3 ml-1" />
          </Badge>
        </Link>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <MarketMonitorChart
            symbol="SPY"
            name="S&P 500"
            data={priceHistory}
            currentPrice={currentPrice}
            changePercent={changePercent}
            className="h-full"
          />
        </div>
        
        <div className="space-y-3">
          <MarketIndexCard symbol="QQQ" name="Nasdaq 100" />
          <MarketIndexCard symbol="DIA" name="Dow Jones" />
          <MarketIndexCard symbol="IWM" name="Russell 2000" />
        </div>
      </div>
    </div>
  );
}

function MarketIndexCard({ symbol, name }: { symbol: string; name: string }) {
  const { getPrice } = useRealtimePrices();
  const priceData = getPrice(symbol);
  
  const price = priceData?.price || 0;
  const previousPrice = priceData?.previousPrice || price;
  const changePercent = previousPrice > 0 ? ((price - previousPrice) / previousPrice) * 100 : 0;
  const isPositive = changePercent >= 0;
  
  return (
    <Card className="bg-slate-900/50 border-slate-800/50" data-testid={`card-index-${symbol.toLowerCase()}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-400">{name}</span>
          <Badge variant="outline" className="text-xs border-slate-700 text-slate-300">
            {symbol}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold font-mono text-white">
            ${price > 0 ? safeToFixed(price, 2) : '--'}
          </span>
          <div className={cn(
            "flex items-center gap-1 text-sm font-mono",
            isPositive ? "text-emerald-400" : "text-red-400"
          )}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {changePercent !== 0 ? `${isPositive ? '+' : ''}${safeToFixed(changePercent, 2)}%` : '--'}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
