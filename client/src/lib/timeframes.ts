import { startOfDay, addDays, isBefore, isAfter, parseISO, differenceInDays } from "date-fns";
import type { TradeIdea } from "@shared/schema";

export type TimeframeBucket = 'all' | 'today_tomorrow' | 'few_days' | 'next_week' | 'next_month';

export const TIMEFRAME_LABELS: Record<TimeframeBucket, string> = {
  all: 'All Plays',
  today_tomorrow: 'Today/Tomorrow',
  few_days: 'Next Few Days',
  next_week: 'Next Week',
  next_month: 'Next Month+',
};

export const TIMEFRAME_DESCRIPTIONS: Record<TimeframeBucket, string> = {
  all: 'All trade ideas',
  today_tomorrow: 'Day trades and overnight holds',
  few_days: '2-5 day swing trades',
  next_week: '1-2 week positions',
  next_month: 'Monthly+ positions and LEAPS',
};

function classifyByDays(days: number): TimeframeBucket {
  if (days < 0) return 'today_tomorrow';
  if (days <= 1) return 'today_tomorrow';
  if (days <= 5) return 'few_days';
  if (days <= 14) return 'next_week';
  return 'next_month';
}

export function classifyTimeframe(idea: TradeIdea): TimeframeBucket {
  const now = new Date();
  const today = startOfDay(now);
  
  const holdingPeriod = idea.holdingPeriod || 'day';
  
  if (idea.exitBy) {
    try {
      const exitDate = parseISO(idea.exitBy);
      const daysUntilExit = differenceInDays(exitDate, today);
      return classifyByDays(daysUntilExit);
    } catch {
    }
  }
  
  if (idea.expiryDate) {
    try {
      const expiryDate = parseISO(idea.expiryDate);
      const daysUntilExpiry = differenceInDays(expiryDate, today);
      return classifyByDays(daysUntilExpiry);
    } catch {
    }
  }
  
  if (holdingPeriod === 'day') {
    return 'today_tomorrow';
  }
  
  if (holdingPeriod === 'swing') {
    return 'few_days';
  }
  
  if (holdingPeriod === 'week-ending') {
    return 'next_week';
  }
  
  if (holdingPeriod === 'position') {
    return 'next_month';
  }
  
  return 'few_days';
}

export function filterByTimeframe(ideas: TradeIdea[], timeframe: TimeframeBucket): TradeIdea[] {
  if (timeframe === 'all') {
    return ideas;
  }
  
  return ideas.filter(idea => classifyTimeframe(idea) === timeframe);
}

export function getTimeframeCounts(ideas: TradeIdea[]): Record<TimeframeBucket, number> {
  const counts: Record<TimeframeBucket, number> = {
    all: ideas.length,
    today_tomorrow: 0,
    few_days: 0,
    next_week: 0,
    next_month: 0,
  };
  
  ideas.forEach(idea => {
    const bucket = classifyTimeframe(idea);
    counts[bucket]++;
  });
  
  return counts;
}
