import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, toZonedTime } from "date-fns-tz";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCTTime(date: Date | string): string {
  const timezone = "America/Chicago";
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const zonedDate = toZonedTime(dateObj, timezone);
  return format(zonedDate, "MMM dd, yyyy h:mm a 'CT'", { timeZone: timezone });
}

export function getMarketSession(): 'pre-market' | 'rth' | 'after-hours' | 'closed' {
  const now = new Date();
  const timezone = "America/Chicago";
  const zonedNow = toZonedTime(now, timezone);
  const hour = zonedNow.getHours();
  const minute = zonedNow.getMinutes();
  const day = zonedNow.getDay();
  
  // Weekend (0 = Sunday, 6 = Saturday)
  if (day === 0 || day === 6) return 'closed';
  
  const timeInMinutes = hour * 60 + minute;
  
  // Pre-market: 4:00 AM - 9:30 AM CT (240 - 570 minutes)
  if (timeInMinutes >= 240 && timeInMinutes < 570) return 'pre-market';
  
  // RTH (Regular Trading Hours): 9:30 AM - 4:00 PM CT (570 - 960 minutes)
  if (timeInMinutes >= 570 && timeInMinutes < 960) return 'rth';
  
  // After-hours: 4:00 PM - 8:00 PM CT (960 - 1200 minutes)
  if (timeInMinutes >= 960 && timeInMinutes < 1200) return 'after-hours';
  
  return 'closed';
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number, decimals: number = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(2)}B`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(2)}K`;
  return volume.toFixed(0);
}

export function calculatePositionSize(
  entryPrice: number,
  stopLoss: number,
  capitalAllocated: number,
  maxRiskPercent: number
): { shares: number; riskAmount: number; riskPercent: number } {
  const stopLossPercent = Math.abs((stopLoss - entryPrice) / entryPrice) * 100;
  const maxRiskAmount = capitalAllocated * (maxRiskPercent / 100);
  const shares = Math.floor(maxRiskAmount / Math.abs(entryPrice - stopLoss));
  const actualRiskAmount = shares * Math.abs(entryPrice - stopLoss);
  const actualRiskPercent = (actualRiskAmount / capitalAllocated) * 100;
  
  return {
    shares,
    riskAmount: actualRiskAmount,
    riskPercent: actualRiskPercent,
  };
}

export function calculateRiskReward(
  entryPrice: number,
  stopLoss: number,
  targetPrice: number
): number {
  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(targetPrice - entryPrice);
  return reward / risk;
}

export function getPriceChangeColor(change: number): string {
  if (change > 0) return 'text-bullish';
  if (change < 0) return 'text-bearish';
  return 'text-muted-foreground';
}
