import { useEffect, useRef, useMemo } from "react";
import { createChart, IChartApi, LineSeries, LineData, UTCTimestamp } from "lightweight-charts";
import { cn, safeNumber } from "@/lib/utils";

interface MiniSparklineProps {
  data: { time: string | number; value: number }[];
  width?: number;
  height?: number;
  className?: string;
  color?: string;
  showGradient?: boolean;
}

export function MiniSparkline({
  data,
  width = 120,
  height = 40,
  className,
  color,
  showGradient = true,
}: MiniSparklineProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const lineColor = useMemo(() => {
    if (color) return color;
    if (data.length < 2) return "rgb(148, 163, 184)";
    const firstValue = safeNumber(data[0]?.value);
    const lastValue = safeNumber(data[data.length - 1]?.value);
    return lastValue >= firstValue ? "rgb(16, 185, 129)" : "rgb(239, 68, 68)";
  }, [data, color]);

  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    const isDark = document.documentElement.classList.contains("dark");

    const chart = createChart(chartContainerRef.current, {
      width,
      height,
      layout: {
        background: { color: "transparent" },
        textColor: "transparent",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      crosshair: { mode: 0 },
      handleScale: false,
      handleScroll: false,
    });

    chartRef.current = chart;

    const series = chart.addSeries(LineSeries, {
      color: lineColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    // Filter out invalid data points and ensure values are safe numbers
    const lineData: LineData[] = data
      .filter((d) => d && d.time != null && d.value != null)
      .map((d) => ({
        time: (typeof d.time === "string" ? new Date(d.time).getTime() / 1000 : d.time) as UTCTimestamp,
        value: safeNumber(d.value),
      }));

    if (lineData.length === 0) return;
    series.setData(lineData);
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [data, width, height, lineColor]);

  if (data.length === 0) {
    return (
      <div 
        className={cn("flex items-center justify-center text-xs text-muted-foreground", className)}
        style={{ width, height }}
      >
        No data
      </div>
    );
  }

  return (
    <div
      ref={chartContainerRef}
      className={cn("overflow-hidden rounded", className)}
      style={{ width, height }}
    />
  );
}

export function generateSparklineData(basePrice: number, days: number = 14) {
  const data: { time: string; value: number }[] = [];
  let price = basePrice * (0.95 + Math.random() * 0.1);
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const change = (Math.random() - 0.48) * (basePrice * 0.015);
    price = Math.max(basePrice * 0.8, Math.min(basePrice * 1.2, price + change));
    data.push({
      time: date.toISOString().split("T")[0],
      value: price,
    });
  }

  return data;
}
