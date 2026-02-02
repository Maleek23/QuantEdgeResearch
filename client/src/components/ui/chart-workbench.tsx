import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, IChartApi, ISeriesApi, CandlestickSeries, LineSeries, CandlestickData, LineData, UTCTimestamp } from "lightweight-charts";
import { cn, safeToFixed } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CandlestickChart, LineChart, ZoomIn, ZoomOut, Maximize2, RotateCcw } from "lucide-react";

type ChartType = "candlestick" | "line";
type TimeFrame = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";

interface ChartDataPoint {
  time: string | number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  value?: number;
}

interface ChartAnnotation {
  time: string | number;
  text: string;
  color?: string;
  position?: "top" | "bottom";
}

interface PriceLevel {
  price: number;
  label: string;
  color: string;
  lineWidth?: number;
  lineStyle?: number;
}

interface ChartWorkbenchProps {
  symbol: string;
  data: ChartDataPoint[];
  annotations?: ChartAnnotation[];
  priceLevels?: PriceLevel[];
  chartType?: ChartType;
  timeFrame?: TimeFrame;
  height?: number;
  showToolbar?: boolean;
  showTimeframes?: boolean;
  onTimeFrameChange?: (tf: TimeFrame) => void;
  className?: string;
}

export function ChartWorkbench({
  symbol,
  data,
  annotations = [],
  priceLevels = [],
  chartType: initialChartType = "line",
  timeFrame: initialTimeFrame = "1M",
  height = 400,
  showToolbar = true,
  showTimeframes = true,
  onTimeFrameChange,
  className,
}: ChartWorkbenchProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
  
  const [chartType, setChartType] = useState<ChartType>(initialChartType);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>(initialTimeFrame);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number | null>(null);

  const timeFrames: TimeFrame[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

  const getChartColors = useCallback(() => {
    const isDark = document.documentElement.classList.contains("dark");
    return {
      backgroundColor: isDark ? "rgb(15, 23, 42)" : "rgb(255, 255, 255)",
      textColor: isDark ? "rgb(148, 163, 184)" : "rgb(71, 85, 105)",
      gridColor: isDark ? "rgba(148, 163, 184, 0.1)" : "rgba(71, 85, 105, 0.1)",
      lineColor: "rgb(16, 185, 129)",
      upColor: "rgb(16, 185, 129)",
      downColor: "rgb(239, 68, 68)",
    };
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    const colors = getChartColors();

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { color: colors.backgroundColor },
        textColor: colors.textColor,
      },
      grid: {
        vertLines: { color: colors.gridColor },
        horzLines: { color: colors.gridColor },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: colors.textColor,
          width: 1,
          style: 2,
          labelBackgroundColor: colors.lineColor,
        },
        horzLine: {
          color: colors.textColor,
          width: 1,
          style: 2,
          labelBackgroundColor: colors.lineColor,
        },
      },
      rightPriceScale: {
        borderColor: colors.gridColor,
      },
      timeScale: {
        borderColor: colors.gridColor,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    });

    chartRef.current = chart;

    let series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line">;

    if (chartType === "candlestick") {
      series = chart.addSeries(CandlestickSeries, {
        upColor: colors.upColor,
        downColor: colors.downColor,
        borderUpColor: colors.upColor,
        borderDownColor: colors.downColor,
        wickUpColor: colors.upColor,
        wickDownColor: colors.downColor,
      });

      const candleData: CandlestickData[] = data.map((d) => ({
        time: (typeof d.time === "string" ? new Date(d.time).getTime() / 1000 : d.time) as UTCTimestamp,
        open: d.open ?? d.value ?? 0,
        high: d.high ?? d.value ?? 0,
        low: d.low ?? d.value ?? 0,
        close: d.close ?? d.value ?? 0,
      }));

      series.setData(candleData);
    } else {
      series = chart.addSeries(LineSeries, {
        color: colors.lineColor,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: colors.lineColor,
        crosshairMarkerBackgroundColor: colors.backgroundColor,
      });

      const lineData: LineData[] = data.map((d) => ({
        time: (typeof d.time === "string" ? new Date(d.time).getTime() / 1000 : d.time) as UTCTimestamp,
        value: d.close ?? d.value ?? 0,
      }));

      series.setData(lineData);
    }

    seriesRef.current = series;

    priceLevels.forEach((level) => {
      series.createPriceLine({
        price: level.price,
        color: level.color,
        lineWidth: (level.lineWidth ?? 1) as 1 | 2 | 3 | 4,
        lineStyle: level.lineStyle ?? 2,
        axisLabelVisible: true,
        title: level.label,
      });
    });

    if (data.length > 0) {
      const lastPoint = data[data.length - 1];
      const firstPoint = data[0];
      const price = lastPoint.close ?? lastPoint.value ?? 0;
      const startPrice = firstPoint.close ?? firstPoint.value ?? 0;
      setCurrentPrice(price);
      setPriceChange(startPrice > 0 ? ((price - startPrice) / startPrice) * 100 : 0);
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, chartType, height, getChartColors, priceLevels]);

  const handleTimeFrameChange = (tf: TimeFrame) => {
    setTimeFrame(tf);
    onTimeFrameChange?.(tf);
  };

  const handleChartTypeChange = (type: string) => {
    if (type === "candlestick" || type === "line") {
      setChartType(type);
    }
  };

  const handleReset = () => {
    chartRef.current?.timeScale().fitContent();
  };

  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", className)}>
      {showToolbar && (
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-3">
            <div>
              <span className="font-bold text-lg">{symbol}</span>
              {currentPrice !== null && (
                <span className="ml-2 text-lg font-medium">
                  ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
              {priceChange !== null && (
                <span className={cn(
                  "ml-2 text-sm font-medium",
                  priceChange >= 0 ? "text-emerald-500" : "text-red-500"
                )}>
                  {priceChange >= 0 ? "+" : ""}{safeToFixed(priceChange, 2)}%
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ToggleGroup 
              type="single" 
              value={chartType} 
              onValueChange={handleChartTypeChange}
              className="h-8"
            >
              <ToggleGroupItem 
                value="line" 
                size="sm" 
                className="h-7 px-2"
                data-testid="chart-toggle-line"
              >
                <LineChart className="w-4 h-4" />
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="candlestick" 
                size="sm" 
                className="h-7 px-2"
                data-testid="chart-toggle-candlestick"
              >
                <CandlestickChart className="w-4 h-4" />
              </ToggleGroupItem>
            </ToggleGroup>

            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={handleReset}
              data-testid="chart-reset"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {showTimeframes && (
        <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/30">
          {timeFrames.map((tf) => (
            <Button
              key={tf}
              variant={timeFrame === tf ? "secondary" : "ghost"}
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => handleTimeFrameChange(tf)}
              data-testid={`chart-timeframe-${tf.toLowerCase()}`}
            >
              {tf}
            </Button>
          ))}
        </div>
      )}

      <div ref={chartContainerRef} className="w-full" style={{ height }} data-testid="chart-container" />
    </div>
  );
}

export function generateMockChartData(days: number = 30): ChartDataPoint[] {
  const data: ChartDataPoint[] = [];
  let price = 100 + Math.random() * 50;
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    const change = (Math.random() - 0.48) * 5;
    price = Math.max(10, price + change);
    
    const open = price;
    const close = price + (Math.random() - 0.5) * 3;
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;

    data.push({
      time: date.toISOString().split("T")[0],
      open,
      high,
      low,
      close,
      value: close,
    });
  }

  return data;
}
