/**
 * Signal Quality & Trade Utilities
 * 
 * IMPORTANT: Trade grades (A+, B, C, etc.) should come from the stored
 * `probabilityBand` field, NOT from signal count. See shared/grading.ts
 * for the unified grading contract.
 * 
 * Signal count (0-5) shows how many technical indicators agree on direction.
 * This is SUPPLEMENTARY information displayed in tooltips, not the trade grade.
 */

// Re-export grading utilities from shared contract
export { 
  getLetterGrade, 
  getGradeStyle, 
  getSignalQuality,
  type GradeLetter,
  type GradeInfo 
} from '../../../shared/grading';

/**
 * Signal Confluence Info (NOT a grade)
 * Shows how many technical indicators agree on direction
 */
export interface SignalConfluence {
  count: number;
  label: string;
  description: string;
}

/**
 * Get signal confluence info from qualitySignals array
 * NOTE: This is NOT the trade grade - it's supplementary information
 */
export function getSignalConfluence(qualitySignals: string[] | null | undefined): SignalConfluence {
  const count = qualitySignals?.length || 0;
  
  if (count >= 5) {
    return { count, label: 'Strong', description: 'All indicators aligned' };
  }
  if (count >= 4) {
    return { count, label: 'Good', description: 'Most indicators aligned' };
  }
  if (count >= 3) {
    return { count, label: 'Moderate', description: 'Multiple indicators aligned' };
  }
  if (count >= 2) {
    return { count, label: 'Weak', description: 'Some indicators aligned' };
  }
  return { count, label: 'Low', description: 'Few indicators aligned' };
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
 * CANONICAL Trade Outcome Styling
 * Use this instead of percentGain-based color decisions
 * 
 * outcomeStatus determines color, NOT percentGain:
 * - hit_target = green (WIN)
 * - hit_stop = red (LOSS) 
 * - expired = amber (EXPIRED - excluded from win rate)
 * - open = neutral
 */
export interface TradeOutcomeStyle {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  isWin: boolean;
  isLoss: boolean;
  isExpired: boolean;
  description: string;
}

export function getTradeOutcomeStyle(outcomeStatus: string | null | undefined): TradeOutcomeStyle {
  const status = (outcomeStatus || '').trim().toLowerCase();
  
  switch (status) {
    case 'hit_target':
      return {
        label: 'WIN',
        color: 'text-[var(--trade-bullish)] dark:text-[var(--trade-bullish)]',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/30',
        isWin: true,
        isLoss: false,
        isExpired: false,
        description: 'Target price reached'
      };
    case 'hit_stop':
      return {
        label: 'LOSS',
        color: 'text-[var(--trade-bearish)] dark:text-[var(--trade-bearish)]',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/30',
        isWin: false,
        isLoss: true,
        isExpired: false,
        description: 'Stop loss triggered'
      };
    case 'expired':
      return {
        label: 'EXPIRED',
        color: 'text-amber-500 dark:text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/30',
        isWin: false,
        isLoss: false,
        isExpired: true,
        description: 'Time window ended without hitting target or stop'
      };
    case 'open':
      return {
        label: 'OPEN',
        color: 'text-blue-500 dark:text-blue-400',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/30',
        isWin: false,
        isLoss: false,
        isExpired: false,
        description: 'Trade is active'
      };
    default:
      return {
        label: status?.toUpperCase() || 'N/A',
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/10',
        borderColor: 'border-muted/30',
        isWin: false,
        isLoss: false,
        isExpired: false,
        description: 'Unknown status'
      };
  }
}

/**
 * Get P&L color based on outcomeStatus (not just percentGain)
 * 
 * For expired trades, use amber (not red) regardless of percentGain
 * For open trades, use green/red based on current unrealized P&L
 */
export function getPnlColor(outcomeStatus: string | null | undefined, percentGain: number | null | undefined): string {
  const status = (outcomeStatus || '').trim().toLowerCase();
  
  // Expired trades always use amber - they're not counted as wins or losses
  if (status === 'expired') {
    return 'text-amber-400';
  }
  
  // For closed trades (hit_target, hit_stop), use outcome-based color
  if (status === 'hit_target') {
    return 'text-[var(--trade-bullish)]';
  }
  if (status === 'hit_stop') {
    return 'text-[var(--trade-bearish)]';
  }
  
  // For open trades or unknown, use P&L-based color
  const gain = percentGain ?? 0;
  if (gain > 0) return 'text-[var(--trade-bullish)]';
  if (gain < 0) return 'text-[var(--trade-bearish)]';
  return 'text-muted-foreground';
}
