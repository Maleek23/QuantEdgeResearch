/**
 * SignalCard shared types
 * =======================
 * Canonical data shape used by Mini / Standard / Full SignalCard variants.
 * All variants render from the same SignalData object — single source of truth.
 */

export type SignalSize = 'mini' | 'standard' | 'full';
export type SignalDirection = 'BULL' | 'BEAR' | 'NEUTRAL';
export type SignalStatus = 'TRIGGER_PENDING' | 'TRIGGER_CONFIRMED' | 'T1_HIT' | 'T2_HIT' | 'STOPPED' | 'EXPIRED';

export interface SignalData {
  id: string;
  symbol: string;
  direction: SignalDirection;
  spot: number;
  spotChangeToday: number;          // % change today
  confidence: number;                // 0-100
  confidenceDelta: number;           // change since issued
  holdPeriodLabel: string;           // "3 MONTHS" | "1 WEEK" | "5 DAYS"
  entry: number;
  t1: number;
  t2?: number;
  stop: number;
  pnlPct: number;
  pnlAbs: number;
  daysActive: number;
  status: SignalStatus;
  issuedAt: string;                  // ISO
  targetDate?: string;               // ISO
  trigger: { confirmed: boolean; price?: number };
  // Component scores (for SignalComponents bar chart)
  signalComponents?: {
    validity: number;                // 0-100
    progress: number;
    pace: number;
    retention: number;
    overlay: number;
  };
  // Trade geometry
  geometry?: {
    stopRMultiple: number;           // 1.0 = 1R away
    horizonUsedPct: number;          // 35 = 35% of horizon used
  };
  // Oracle option pick (auto-suggested contract)
  oracleOption?: {
    strike: number;
    expiry: string;
    optionType: 'call' | 'put';
    premiumAtIssue: number;
    premiumNow: number;
    pctChange: number;
  };
  // Source of the signal
  source: string;                     // 'quant_signal' | 'whale' | 'breakout' | etc.
}

export interface SignalCardProps {
  signal: SignalData;
  size?: SignalSize;
  onClick?: (id: string) => void;
  onPushTrade?: (id: string) => void;
  showActions?: boolean;
}
