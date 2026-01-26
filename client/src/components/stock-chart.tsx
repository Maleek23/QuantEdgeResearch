import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, AreaSeries, CandlestickSeries, Time, CrosshairMode } from 'lightweight-charts';

interface AreaDataPoint {
  time: number;
  value: number;
}

interface CandleDataPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface StockChartProps {
  symbol: string;
  data: AreaDataPoint[] | CandleDataPoint[];
  height?: number;
  chartType?: 'area' | 'candlestick';
  onPriceChange?: (price: number | null, change: number | null) => void;
}

function isCandle(d: AreaDataPoint | CandleDataPoint): d is CandleDataPoint {
  return 'open' in d && 'high' in d && 'low' in d && 'close' in d;
}

export function StockChart({ symbol, data, height = 400, chartType = 'area', onPriceChange }: StockChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [hoverData, setHoverData] = useState<{ price: number; time: string; change: number } | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || !data || data.length === 0) return;

    const firstDataPoint = data[0];
    const lastDataPoint = data[data.length - 1];
    const firstPrice = isCandle(firstDataPoint) ? firstDataPoint.close : firstDataPoint.value;
    const lastPrice = isCandle(lastDataPoint) ? lastDataPoint.close : lastDataPoint.value;

    // Create chart with interactive styling
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#64748b',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(100, 116, 139, 0.08)' },
        horzLines: { color: 'rgba(100, 116, 139, 0.08)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      rightPriceScale: {
        borderColor: 'rgba(100, 116, 139, 0.15)',
        scaleMargins: {
          top: 0.15,
          bottom: 0.15,
        },
      },
      timeScale: {
        borderColor: 'rgba(100, 116, 139, 0.15)',
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#3b82f6',
          width: 1,
          style: 0,
          labelBackgroundColor: '#3b82f6',
        },
        horzLine: {
          color: '#3b82f6',
          width: 1,
          style: 0,
          labelBackgroundColor: '#3b82f6',
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    let series: any;

    if (chartType === 'candlestick' && data.length > 0 && isCandle(data[0])) {
      // Candlestick chart with better colors
      series = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });

      const candleData = (data as CandleDataPoint[]).map(d => ({
        time: d.time as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));
      series.setData(candleData);
    } else {
      // Area chart with sharper blue
      const isPositive = lastPrice >= firstPrice;
      series = chart.addSeries(AreaSeries, {
        lineColor: isPositive ? '#22c55e' : '#ef4444',
        topColor: isPositive ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)',
        bottomColor: isPositive ? 'rgba(34, 197, 94, 0.0)' : 'rgba(239, 68, 68, 0.0)',
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 5,
        crosshairMarkerBorderColor: isPositive ? '#22c55e' : '#ef4444',
        crosshairMarkerBackgroundColor: '#ffffff',
      });

      // Handle both area and candle data formats
      const areaData = data.map(d => ({
        time: d.time as Time,
        value: 'value' in d ? d.value : (d as CandleDataPoint).close,
      }));
      series.setData(areaData);
    }

    // Subscribe to crosshair move for interactive tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) {
        setHoverData(null);
        onPriceChange?.(null, null);
        return;
      }

      const seriesData = param.seriesData.get(series);
      if (seriesData) {
        const price = 'close' in seriesData ? seriesData.close : (seriesData as any).value;
        const change = ((price - firstPrice) / firstPrice) * 100;
        const timeStr = new Date((param.time as number) * 1000).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        setHoverData({ price, time: timeStr, change });
        onPriceChange?.(price, change);
      }
    });

    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, height, chartType, onPriceChange]);

  return (
    <div className="relative w-full">
      {/* Hover tooltip */}
      {hoverData && (
        <div className="absolute top-2 left-2 z-10 bg-slate-900/90 backdrop-blur-sm rounded-lg px-3 py-2 pointer-events-none">
          <div className="text-[13px] font-semibold text-white">${hoverData.price.toFixed(2)}</div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-slate-400">{hoverData.time}</span>
            <span className={hoverData.change >= 0 ? "text-green-400" : "text-red-400"}>
              {hoverData.change >= 0 ? '+' : ''}{hoverData.change.toFixed(2)}%
            </span>
          </div>
        </div>
      )}
      <div ref={chartContainerRef} className="w-full cursor-crosshair" />
    </div>
  );
}
