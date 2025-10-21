import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Clock, AlertCircle } from 'lucide-react';

interface EnhancedCountdownProps {
  exitBy: string;
  className?: string;
}

export function EnhancedCountdown({ exitBy, className }: EnhancedCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<{
    total: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const exitDate = new Date(exitBy);
      const diff = exitDate.getTime() - now.getTime();

      if (diff <= 0) {
        return { total: 0, hours: 0, minutes: 0, seconds: 0 };
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      return { total: diff, hours, minutes, seconds };
    };

    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [exitBy]);

  if (!timeLeft) {
    return null;
  }

  // Calculate urgency level based on time remaining
  const getUrgencyLevel = () => {
    const hoursLeft = timeLeft.total / (1000 * 60 * 60);
    
    if (hoursLeft <= 0) return 'expired';
    if (hoursLeft <= 2) return 'critical';   // Red - less than 2 hours
    if (hoursLeft <= 6) return 'warning';    // Amber - less than 6 hours
    if (hoursLeft <= 24) return 'active';    // Green - less than 1 day
    return 'safe';                            // Blue - more than 1 day
  };

  const urgency = getUrgencyLevel();

  const urgencyStyles = {
    expired: {
      bg: 'bg-red-500/10',
      text: 'text-red-600 dark:text-red-400',
      border: 'border-red-500/50'
    },
    critical: {
      bg: 'bg-red-500/10',
      text: 'text-red-600 dark:text-red-400',
      border: 'border-red-500/50 animate-pulse'
    },
    warning: {
      bg: 'bg-amber-500/10',
      text: 'text-amber-600 dark:text-amber-400',
      border: 'border-amber-500/50'
    },
    active: {
      bg: 'bg-green-500/10',
      text: 'text-green-600 dark:text-green-400',
      border: 'border-green-500/50'
    },
    safe: {
      bg: 'bg-blue-500/10',
      text: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-500/50'
    }
  };

  const style = urgencyStyles[urgency];

  const formatTimeDisplay = () => {
    if (timeLeft.total <= 0) {
      return 'EXPIRED';
    }
    
    if (timeLeft.hours > 24) {
      const days = Math.floor(timeLeft.hours / 24);
      const remainingHours = timeLeft.hours % 24;
      return `${days}d ${remainingHours}h`;
    }
    
    if (timeLeft.hours > 0) {
      return `${timeLeft.hours}h ${timeLeft.minutes}m`;
    }
    
    return `${timeLeft.minutes}m ${timeLeft.seconds}s`;
  };

  return (
    <div 
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-md border font-mono text-sm font-medium transition-all",
        style.bg,
        style.text,
        style.border,
        className
      )}
      data-testid="countdown-timer"
    >
      {urgency === 'critical' ? (
        <AlertCircle className="w-4 h-4 animate-pulse" />
      ) : (
        <Clock className="w-4 h-4" />
      )}
      <span className="tabular-nums">
        {formatTimeDisplay()}
      </span>
    </div>
  );
}
