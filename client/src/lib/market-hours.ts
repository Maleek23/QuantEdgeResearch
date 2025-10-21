import { format, isWithinInterval, set, getDay } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const MARKET_TIMEZONE = 'America/New_York';

export interface MarketStatus {
  isOpen: boolean;
  nextOpen: Date | null;
  nextClose: Date | null;
  statusMessage: string;
}

export function getMarketStatus(): MarketStatus {
  const now = new Date();
  const nyTime = toZonedTime(now, MARKET_TIMEZONE);
  const dayOfWeek = getDay(nyTime);

  // Weekend check (0 = Sunday, 6 = Saturday)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      isOpen: false,
      nextOpen: getNextMarketOpen(nyTime),
      nextClose: null,
      statusMessage: 'Market Closed (Weekend)'
    };
  }

  // Market hours: 9:30 AM - 4:00 PM ET
  const marketOpen = set(nyTime, { hours: 9, minutes: 30, seconds: 0, milliseconds: 0 });
  const marketClose = set(nyTime, { hours: 16, minutes: 0, seconds: 0, milliseconds: 0 });

  const isOpen = isWithinInterval(nyTime, {
    start: marketOpen,
    end: marketClose
  });

  if (isOpen) {
    return {
      isOpen: true,
      nextOpen: null,
      nextClose: marketClose,
      statusMessage: `Market Open (closes at ${format(marketClose, 'h:mm a')} ET)`
    };
  }

  // Before market open
  if (nyTime < marketOpen) {
    return {
      isOpen: false,
      nextOpen: marketOpen,
      nextClose: null,
      statusMessage: `Pre-Market (opens at ${format(marketOpen, 'h:mm a')} ET)`
    };
  }

  // After market close
  return {
    isOpen: false,
    nextOpen: getNextMarketOpen(nyTime),
    nextClose: null,
    statusMessage: `After Hours (opens tomorrow at 9:30 AM ET)`
  };
}

function getNextMarketOpen(currentTime: Date): Date {
  let nextOpen = set(currentTime, { hours: 9, minutes: 30, seconds: 0, milliseconds: 0 });
  const currentDay = getDay(currentTime);

  // If it's Friday after hours, next open is Monday
  if (currentDay === 5 && currentTime.getHours() >= 16) {
    nextOpen.setDate(nextOpen.getDate() + 3);
  }
  // If it's Saturday, next open is Monday
  else if (currentDay === 6) {
    nextOpen.setDate(nextOpen.getDate() + 2);
  }
  // If it's Sunday, next open is Monday
  else if (currentDay === 0) {
    nextOpen.setDate(nextOpen.getDate() + 1);
  }
  // Otherwise next open is tomorrow (or today if before 9:30 AM)
  else if (currentTime.getHours() >= 16) {
    nextOpen.setDate(nextOpen.getDate() + 1);
  }

  return nextOpen;
}

export function getMetricsUpdateMessage(): string {
  const status = getMarketStatus();
  
  if (status.isOpen) {
    return 'Live market data updating every 30 seconds';
  }
  
  return `${status.statusMessage} - Metrics update when market reopens`;
}
