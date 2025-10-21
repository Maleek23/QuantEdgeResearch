import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

// User's timezone (from user preference or default to CST)
export const USER_TIMEZONE = 'America/Chicago';

/**
 * Format a date in the user's timezone
 */
export function formatInUserTZ(date: Date | string, formatStr: string = "MMM d, h:mm a"): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(dateObj, USER_TIMEZONE, formatStr);
}

/**
 * Format a relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = dateObj.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  
  if (Math.abs(diffHours) < 1) {
    const diffMinutes = Math.floor(Math.abs(diffMs) / (1000 * 60));
    return diffMs > 0 
      ? `in ${diffMinutes} min`
      : `${diffMinutes} min ago`;
  } else if (Math.abs(diffHours) < 24) {
    const hours = Math.floor(Math.abs(diffHours));
    return diffMs > 0
      ? `in ${hours}h`
      : `${hours}h ago`;
  } else {
    const days = Math.floor(Math.abs(diffHours) / 24);
    return diffMs > 0
      ? `in ${days}d`
      : `${days}d ago`;
  }
}

/**
 * Format time until expiry with countdown
 */
export function formatTimeUntilExpiry(exitBy: Date | string): { 
  formatted: string; 
  isExpired: boolean;
  hoursRemaining: number;
} {
  const exitByDate = typeof exitBy === 'string' ? new Date(exitBy) : exitBy;
  const now = new Date();
  const diffMs = exitByDate.getTime() - now.getTime();
  const hoursRemaining = diffMs / (1000 * 60 * 60);
  
  if (hoursRemaining < 0) {
    return {
      formatted: 'Expired',
      isExpired: true,
      hoursRemaining: 0
    };
  }
  
  if (hoursRemaining < 1) {
    const minutes = Math.floor(hoursRemaining * 60);
    return {
      formatted: `${minutes}m remaining`,
      isExpired: false,
      hoursRemaining
    };
  } else if (hoursRemaining < 24) {
    const hours = Math.floor(hoursRemaining);
    return {
      formatted: `${hours}h remaining`,
      isExpired: false,
      hoursRemaining
    };
  } else {
    const days = Math.floor(hoursRemaining / 24);
    return {
      formatted: `${days}d remaining`,
      isExpired: false,
      hoursRemaining
    };
  }
}

/**
 * Get timezone abbreviation (CST/CDT)
 */
export function getTimezoneAbbreviation(): string {
  const date = new Date();
  const formatted = formatInTimeZone(date, USER_TIMEZONE, 'zzz');
  return formatted; // Returns "CST" or "CDT"
}
