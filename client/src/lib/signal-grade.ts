/**
 * UNIFIED Signal-Based Grading System
 * 
 * This matches exactly what Discord cards show for consistency.
 * Grades are based on qualitySignals count (0-5 indicators):
 * - 5 signals = A+ Signal (Exceptional)
 * - 4 signals = A Signal (Strong)
 * - 3 signals = B Signal (Good)
 * - 2 signals = C Signal (Average)
 * - 0-1 signals = Low Signal (Weak)
 */

export interface SignalGrade {
  grade: string;
  label: string;
  color: string;
  description: string;
  signalCount: number;
}

/**
 * Get signal grade from qualitySignals array
 * This is the CANONICAL grading function used across Discord and Dashboard
 */
export function getSignalGrade(qualitySignals: string[] | null | undefined): SignalGrade {
  const signalCount = qualitySignals?.length || 0;
  
  if (signalCount >= 5) {
    return {
      grade: 'A+',
      label: 'A+ Signal',
      color: 'text-green-400',
      description: 'Exceptional - All indicators aligned',
      signalCount
    };
  }
  
  if (signalCount >= 4) {
    return {
      grade: 'A',
      label: 'A Signal',
      color: 'text-green-500',
      description: 'Strong - Most indicators aligned',
      signalCount
    };
  }
  
  if (signalCount >= 3) {
    return {
      grade: 'B',
      label: 'B Signal',
      color: 'text-blue-500',
      description: 'Good - Multiple indicators aligned',
      signalCount
    };
  }
  
  if (signalCount >= 2) {
    return {
      grade: 'C',
      label: 'C Signal',
      color: 'text-yellow-500',
      description: 'Average - Some indicators aligned',
      signalCount
    };
  }
  
  return {
    grade: 'D',
    label: 'Low Signal',
    color: 'text-orange-500',
    description: 'Weak - Few indicators aligned',
    signalCount
  };
}

/**
 * Get short grade letter for filters/badges
 */
export function getSignalGradeLetter(qualitySignals: string[] | null | undefined): string {
  return getSignalGrade(qualitySignals).grade;
}

/**
 * Get grade color class
 */
export function getSignalGradeColor(qualitySignals: string[] | null | undefined): string {
  return getSignalGrade(qualitySignals).color;
}

/**
 * Resolution reason icon types (use lucide-react icons instead of emoji)
 */
export type ResolutionIcon = 
  | 'clock' 
  | 'hourglass' 
  | 'minus' 
  | 'target' 
  | 'octagon' 
  | 'skull' 
  | 'coins' 
  | 'help-circle';

/**
 * Human-readable resolution reasons for expired/closed trades
 * Uses lucide-react icon names instead of emoji for consistent rendering
 */
export function getResolutionReasonLabel(reason: string | null | undefined): {
  label: string;
  description: string;
  color: string;
  iconName: ResolutionIcon;
} {
  switch (reason) {
    case 'missed_entry_would_have_won':
      return {
        label: 'Missed Entry (Would Have Won)',
        description: 'Entry window closed before entry was made, but price did reach target',
        color: 'text-yellow-500',
        iconName: 'clock'
      };
    case 'missed_entry_would_have_lost':
      return {
        label: 'Missed Entry (Would Have Lost)',
        description: 'Entry window closed before entry was made, price hit stop level',
        color: 'text-slate-400',
        iconName: 'clock'
      };
    case 'missed_entry_no_outcome':
      return {
        label: 'Missed Entry (No Outcome)',
        description: 'Entry window closed, trade never reached target or stop',
        color: 'text-slate-500',
        iconName: 'clock'
      };
    case 'auto_expired':
      return {
        label: 'Time Expired',
        description: 'Trade idea exceeded 7-day holding period without resolution',
        color: 'text-slate-400',
        iconName: 'hourglass'
      };
    case 'auto_breakeven':
      return {
        label: 'Breakeven Exit',
        description: 'Trade exited near entry price (minimal loss/gain)',
        color: 'text-slate-400',
        iconName: 'minus'
      };
    case 'auto_target_hit':
      return {
        label: 'Target Hit',
        description: 'Price reached the target price - trade successful',
        color: 'text-green-500',
        iconName: 'target'
      };
    case 'auto_stop_hit':
      return {
        label: 'Stop Hit',
        description: 'Price hit stop loss level - trade closed at loss',
        color: 'text-red-500',
        iconName: 'octagon'
      };
    case 'option_expired_worthless':
      return {
        label: 'Option Expired Worthless',
        description: 'Option contract expired out of the money',
        color: 'text-red-400',
        iconName: 'skull'
      };
    case 'option_expired_itm':
      return {
        label: 'Option Expired ITM',
        description: 'Option contract expired in the money',
        color: 'text-green-400',
        iconName: 'coins'
      };
    default:
      return {
        label: reason || 'Unknown',
        description: 'Trade closed - reason not specified',
        color: 'text-slate-500',
        iconName: 'help-circle'
      };
  }
}
