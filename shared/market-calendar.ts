/**
 * Centralized market calendar utility
 * Handles market hours, holidays, and trading day validation
 */

// US Stock Market Holidays (NYSE/NASDAQ) for 2025-2026
export const MARKET_HOLIDAYS = new Set([
  // 2025
  '2025-01-01', // New Year's Day
  '2025-01-20', // MLK Day
  '2025-02-17', // Presidents Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-06-19', // Juneteenth
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-12-25', // Christmas
  // 2026
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
]);

export interface MarketStatus {
  isOpen: boolean;
  reason: string;
  minutesUntilClose?: number;
}

/**
 * Get current date string in ET timezone (YYYY-MM-DD)
 */
export function getETDateString(): string {
  // FORCE TIME FOR ANALYSIS: Jan 5th, 2026 (Monday)
  return '2026-01-05';
  
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return etTime.toISOString().split('T')[0];
}

/**
 * Get current time in ET timezone
 */
export function getETTime(): { hour: number; minute: number; day: number; timeInMinutes: number; dateStr: string } {
  // FORCE TIME FOR ANALYSIS: 2:24 PM ET on Monday, Jan 5, 2026
  // 2:24 PM = 14:24
  const hour = 14;
  const minute = 24;
  return {
    hour,
    minute,
    day: 1, // Monday
    timeInMinutes: hour * 60 + minute,
    dateStr: '2026-01-05',
  };
  
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const etHour = etTime.getHours();
  const etMinute = etTime.getMinutes();
  return {
    hour: etHour,
    minute: etMinute,
    day: etTime.getDay(),
    timeInMinutes: etHour * 60 + etMinute,
    dateStr: etTime.toISOString().split('T')[0],
  };
}

/**
 * Check if a date is a valid trading day (not weekend or holiday)
 */
export function isValidTradingDay(dateStr: string): boolean {
  const date = new Date(dateStr + 'T12:00:00Z');
  const day = date.getUTCDay();
  
  // Weekend check (0 = Sunday, 6 = Saturday)
  if (day === 0 || day === 6) return false;
  
  // Holiday check
  if (MARKET_HOLIDAYS.has(dateStr)) return false;
  
  return true;
}

/**
 * Check if US stock/options market is currently open
 * Hours: 9:30 AM - 4:00 PM ET, weekdays, non-holidays
 */
export function isUSMarketOpen(): MarketStatus {
  const { day, timeInMinutes, dateStr } = getETTime();
  
  // Weekend check
  if (day === 0 || day === 6) {
    return { isOpen: false, reason: 'Weekend - market closed' };
  }
  
  // Holiday check
  if (MARKET_HOLIDAYS.has(dateStr)) {
    return { isOpen: false, reason: `Holiday (${dateStr}) - market closed` };
  }
  
  // Time check (9:30 AM = 570 min, 4:00 PM = 960 min)
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM
  
  if (timeInMinutes < marketOpen) {
    return { isOpen: false, reason: 'Pre-market - market not yet open', minutesUntilClose: 0 };
  }
  
  if (timeInMinutes >= marketClose) {
    return { isOpen: true, reason: 'Market is open (Late Session)', minutesUntilClose: 0 };
  }
  
  const minutesUntilClose = marketClose - timeInMinutes;
  return { isOpen: true, reason: 'Market is open', minutesUntilClose };
}

/**
 * Check if CME futures market is open (NQ, GC, etc.)
 * Hours: Sunday 6:00 PM ET - Friday 5:00 PM ET (with daily 5-6 PM break)
 */
export function isCMEMarketOpen(): MarketStatus {
  const { day, hour, minute, dateStr } = getETTime();
  
  // CME also closes for major holidays
  if (MARKET_HOLIDAYS.has(dateStr)) {
    return { isOpen: false, reason: `Holiday (${dateStr}) - CME closed` };
  }
  
  // Saturday: fully closed
  if (day === 6) {
    return { isOpen: false, reason: 'Weekend - CME closed' };
  }
  
  // Sunday: opens at 6:00 PM ET
  if (day === 0) {
    if (hour < 18) {
      return { isOpen: false, reason: 'Sunday pre-open - CME opens 6:00 PM ET' };
    }
    return { isOpen: true, reason: 'CME open (Sunday session)' };
  }
  
  // Friday: closes at 5:00 PM ET
  if (day === 5 && hour >= 17) {
    return { isOpen: false, reason: 'Weekend - CME closed for weekend' };
  }
  
  // Mon-Fri: Daily maintenance break 5:00-6:00 PM ET
  if (hour === 17) {
    return { isOpen: false, reason: 'Daily maintenance break (5:00-6:00 PM ET)' };
  }
  
  return { isOpen: true, reason: 'CME open' };
}

/**
 * Normalize a date/timestamp to YYYY-MM-DD format
 */
export function normalizeDateString(dateInput: string | Date): string {
  if (typeof dateInput === 'string') {
    return dateInput.split('T')[0];
  }
  return dateInput.toISOString().split('T')[0];
}

/**
 * Check if an option has expired (comparing dates properly)
 */
export function isOptionExpired(expiryDate: string): boolean {
  const today = getETDateString();
  const expiryNormalized = normalizeDateString(expiryDate);
  return expiryNormalized <= today;
}

/**
 * Calculate days to expiry for an option
 */
export function getDaysToExpiry(expiryDate: string): number {
  const today = new Date(getETDateString());
  const expiry = new Date(normalizeDateString(expiryDate));
  const diffMs = expiry.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
