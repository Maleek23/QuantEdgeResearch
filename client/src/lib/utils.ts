import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, toZonedTime } from "date-fns-tz";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

export function isWeekend(): boolean {
  const now = new Date();
  const timezone = "America/Chicago";
  const zonedNow = toZonedTime(now, timezone);
  const day = zonedNow.getDay();
  
  // Weekend: 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

export type MarketSession = 'open' | 'pre_market' | 'after_hours' | 'closed';

export interface MarketStatus {
  session: MarketSession;
  label: string;
  nextOpen: string | null;
  message: string;
}

export function getMarketStatus(): MarketStatus {
  const now = new Date();
  const etTimezone = "America/New_York";
  const zonedNow = toZonedTime(now, etTimezone);
  const day = zonedNow.getDay();
  const hours = zonedNow.getHours();
  const minutes = zonedNow.getMinutes();
  const timeDecimal = hours + minutes / 60;
  
  // Weekend check
  if (day === 0 || day === 6) {
    return {
      session: 'closed',
      label: 'Market Closed',
      nextOpen: 'Monday 9:30 AM ET',
      message: 'Review recent research briefs and prepare watchlists for next week.'
    };
  }
  
  // Market hours: 9:30 AM - 4:00 PM ET
  if (timeDecimal >= 9.5 && timeDecimal < 16) {
    return {
      session: 'open',
      label: 'Market Open',
      nextOpen: null,
      message: 'Live trading session in progress.'
    };
  }
  
  // Pre-market: 4:00 AM - 9:30 AM ET
  if (timeDecimal >= 4 && timeDecimal < 9.5) {
    return {
      session: 'pre_market',
      label: 'Pre-Market',
      nextOpen: '9:30 AM ET',
      message: 'Pre-market session active. Fresh ideas will be generated at market open.'
    };
  }
  
  // After-hours: 4:00 PM - 8:00 PM ET
  if (timeDecimal >= 16 && timeDecimal < 20) {
    return {
      session: 'after_hours',
      label: 'After-Hours',
      nextOpen: 'Tomorrow 9:30 AM ET',
      message: 'After-hours trading. Review recent briefs and plan tomorrow\'s trades.'
    };
  }
  
  // Overnight: 8:00 PM - 4:00 AM ET
  return {
    session: 'closed',
    label: 'Market Closed',
    nextOpen: timeDecimal >= 20 ? 'Tomorrow 9:30 AM ET' : '9:30 AM ET',
    message: 'Market closed. Recent research briefs are shown below for planning.'
  };
}
export function formatCurrency(value: number): string {
  try {
    // Handle null/undefined/NaN - convert first for safety
    if (value === null || value === undefined) {
      return '$0.00';
    }
    const num = typeof value === 'number' ? value : Number(value);
    if (isNaN(num) || !isFinite(num)) {
      return '$0.00';
    }

    // Handle very small crypto prices (< $0.01)
    if (num < 0.01 && num > 0) {
      // Count leading zeros after decimal
      const str = num.toFixed(10);
      const match = str.match(/0\.0*[1-9]/);
      if (match) {
        const significantDigits = match[0].length - 2; // -2 for "0."
        return `$${num.toFixed(Math.min(significantDigits + 2, 8))}`;
      }
    }

    // Normal formatting for values >= $0.01
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return '$0.00';
  }
}

export function formatPercent(value: number, decimals: number = 2): string {
  try {
    // Handle null/undefined/NaN - convert first for safety
    if (value === null || value === undefined) {
      return '+0.00%';
    }
    const num = typeof value === 'number' ? value : Number(value);
    if (isNaN(num) || !isFinite(num)) {
      return '+0.00%';
    }
    return `${num >= 0 ? '+' : ''}${num.toFixed(decimals)}%`;
  } catch {
    return '+0.00%';
  }
}

export function formatVolume(volume: number): string {
  try {
    // Handle null/undefined/NaN - convert first for safety
    if (volume === null || volume === undefined) {
      return '0';
    }
    const num = typeof volume === 'number' ? volume : Number(volume);
    if (isNaN(num) || !isFinite(num)) {
      return '0';
    }
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toFixed(0);
  } catch {
    return '0';
  }
}

export function calculatePositionSize(
  entryPrice: number,
  stopLoss: number,
  capitalAllocated: number,
  maxRiskPercent: number
): { shares: number; riskAmount: number; riskPercent: number } {
  // Protect against division by zero
  const safeEntryPrice = entryPrice || 1;
  const entryStopDiff = Math.abs(safeEntryPrice - stopLoss) || 0.01;
  const stopLossPercent = Math.abs((stopLoss - safeEntryPrice) / safeEntryPrice) * 100;
  const maxRiskAmount = capitalAllocated * (maxRiskPercent / 100);
  const shares = Math.floor(maxRiskAmount / entryStopDiff);
  const actualRiskAmount = shares * entryStopDiff;
  const actualRiskPercent = capitalAllocated > 0 ? (actualRiskAmount / capitalAllocated) * 100 : 0;

  return {
    shares,
    riskAmount: actualRiskAmount,
    riskPercent: actualRiskPercent,
  };
}
export type TradeSignal = {
  status: 'ENTRY ZONE' | 'HOLDING' | 'TAKE PROFIT' | 'STOP OUT' | 'BREAKOUT' | 'INVALIDATED' | 'MONITORING';
  color: 'green' | 'blue' | 'yellow' | 'red' | 'purple' | 'gray';
  message: string;
  action: 'BUY' | 'HOLD' | 'SELL' | 'EXIT' | 'WATCH';
};
// ============================================
// SAFE NUMBER FORMATTING UTILITIES
// Prevents "Cannot read properties of null (reading 'toFixed')" errors
// ============================================

/**
 * Safely converts a value to a number, returning a fallback if null/undefined/NaN/Infinity
 */
export function safeNumber(value: any, fallback: number = 0): number {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return fallback;
  return num;
}

/**
 * Safely formats a number with toFixed, returning fallback string if value is invalid
 * Wrapped in try-catch for bulletproof safety
 */
export function safeToFixed(value: any, decimals: number = 2, fallback: string = '0.00'): string {
  try {
    if (value === null || value === undefined) return fallback;
    const num = typeof value === 'number' ? value : Number(value);
    if (isNaN(num) || !isFinite(num)) return fallback;
    return num.toFixed(decimals);
  } catch {
    return fallback;
  }
}
