import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { cn } from '@/lib/utils';

interface MiniSparklineProps {
  data: number[];
  targetPrice: number;
  stopLoss: number;
  entryPrice: number;
  direction: 'long' | 'short';
  className?: string;
}

export function MiniSparkline({ 
  data, 
  targetPrice, 
  stopLoss, 
  entryPrice, 
  direction,
  className 
}: MiniSparklineProps) {
  if (data.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-16 text-xs text-muted-foreground", className)}>
        No price data
      </div>
    );
  }

  // Create chart data points
  const chartData = data.map((price, index) => ({ index, price }));
  
  // Get current price (last data point)
  const currentPrice = data[data.length - 1];
  
  // Determine line color based on performance
  let lineColor = '#6b7280'; // gray default
  
  if (direction === 'long') {
    if (currentPrice >= targetPrice) {
      lineColor = '#22c55e'; // green - hit target
    } else if (currentPrice <= stopLoss) {
      lineColor = '#ef4444'; // red - hit stop
    } else if (currentPrice > entryPrice) {
      lineColor = '#84cc16'; // lime - moving toward target
    } else {
      lineColor = '#f59e0b'; // amber - warning
    }
  } else {
    if (currentPrice <= targetPrice) {
      lineColor = '#22c55e'; // green - hit target
    } else if (currentPrice >= stopLoss) {
      lineColor = '#ef4444'; // red - hit stop
    } else if (currentPrice < entryPrice) {
      lineColor = '#84cc16'; // lime - moving toward target
    } else {
      lineColor = '#f59e0b'; // amber - warning
    }
  }
  
  // Calculate Y-axis domain with some padding
  const prices = [targetPrice, stopLoss, entryPrice, ...data];
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.1;
  
  return (
    <div className={cn("relative", className)}>
      <ResponsiveContainer width="100%" height={64}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <YAxis 
            domain={[minPrice - padding, maxPrice + padding]} 
            hide 
          />
          <Line 
            type="monotone" 
            dataKey="price" 
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
      
      {/* Reference lines overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Target line */}
        <div 
          className="absolute w-full border-t border-dashed border-green-500/30"
          style={{
            top: `${((maxPrice + padding - targetPrice) / ((maxPrice + padding) - (minPrice - padding))) * 100}%`
          }}
        />
        {/* Stop line */}
        <div 
          className="absolute w-full border-t border-dashed border-red-500/30"
          style={{
            top: `${((maxPrice + padding - stopLoss) / ((maxPrice + padding) - (minPrice - padding))) * 100}%`
          }}
        />
      </div>
    </div>
  );
}
