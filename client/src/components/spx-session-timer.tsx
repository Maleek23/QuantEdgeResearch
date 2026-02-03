/**
 * SPX Session Timer Component
 *
 * Critical timing tool for 0DTE SPX trading:
 * - Shows current market phase (pre-market, open, power hour, close)
 * - Countdown to key session times
 * - VIX-based position sizing recommendations
 * - Gamma level awareness zones
 */

import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn, safeToFixed } from '@/lib/utils';
import {
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Zap,
  Timer,
  Target
} from 'lucide-react';

interface MarketPhase {
  name: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: typeof Clock;
  tradingAdvice: string;
}

const MARKET_PHASES: Record<string, MarketPhase> = {
  premarket: {
    name: 'PRE-MARKET',
    description: 'Futures trading, setting up levels',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    icon: Clock,
    tradingAdvice: 'Monitor overnight levels, identify key gamma strikes',
  },
  opening: {
    name: 'OPENING RANGE',
    description: '9:30-10:00 ET - High volatility',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    icon: Zap,
    tradingAdvice: 'Wait for OR to form (9:45), trade breakouts after confirmation',
  },
  morningSession: {
    name: 'MORNING SESSION',
    description: '10:00-12:00 ET - Trend development',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
    icon: TrendingUp,
    tradingAdvice: 'Trade with momentum, respect gamma levels',
  },
  midday: {
    name: 'MIDDAY CHOP',
    description: '12:00-2:00 ET - Low volume zone',
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10',
    borderColor: 'border-slate-500/30',
    icon: Timer,
    tradingAdvice: 'Reduced position size, watch for range-bound action',
  },
  afternoon: {
    name: 'AFTERNOON SESSION',
    description: '2:00-3:00 ET - Positioning begins',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    icon: Target,
    tradingAdvice: 'Watch for trend resumption, institutional flow',
  },
  powerHour: {
    name: 'POWER HOUR',
    description: '3:00-4:00 ET - Maximum gamma exposure',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    icon: Zap,
    tradingAdvice: 'Highest volatility - quick scalps, tight stops, reduce size',
  },
  closed: {
    name: 'MARKET CLOSED',
    description: 'After hours',
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
    borderColor: 'border-gray-500/30',
    icon: Clock,
    tradingAdvice: 'Prepare for next session, review trades',
  },
};

// Market session times in ET (Eastern Time)
const SESSION_TIMES = {
  premarket: { start: 4, end: 9.5 },      // 4:00 AM - 9:30 AM
  opening: { start: 9.5, end: 10 },       // 9:30 AM - 10:00 AM
  morningSession: { start: 10, end: 12 }, // 10:00 AM - 12:00 PM
  midday: { start: 12, end: 14 },         // 12:00 PM - 2:00 PM
  afternoon: { start: 14, end: 15 },      // 2:00 PM - 3:00 PM
  powerHour: { start: 15, end: 16 },      // 3:00 PM - 4:00 PM
};

// VIX-based position sizing
function getPositionSizing(vix: number): {
  sizeMultiplier: number;
  maxContracts: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  color: string;
} {
  if (vix < 15) {
    return { sizeMultiplier: 1.0, maxContracts: 10, riskLevel: 'LOW', color: 'text-emerald-400' };
  } else if (vix < 20) {
    return { sizeMultiplier: 0.75, maxContracts: 7, riskLevel: 'MEDIUM', color: 'text-amber-400' };
  } else if (vix < 30) {
    return { sizeMultiplier: 0.5, maxContracts: 5, riskLevel: 'HIGH', color: 'text-orange-400' };
  } else {
    return { sizeMultiplier: 0.25, maxContracts: 2, riskLevel: 'EXTREME', color: 'text-red-400' };
  }
}

function getETTime(): Date {
  // Convert current time to Eastern Time
  const now = new Date();
  const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  return new Date(etString);
}

function getCurrentPhase(etTime: Date): string {
  const hours = etTime.getHours() + etTime.getMinutes() / 60;
  const day = etTime.getDay();

  // Weekend check
  if (day === 0 || day === 6) return 'closed';

  // Check each session
  if (hours >= SESSION_TIMES.powerHour.start && hours < SESSION_TIMES.powerHour.end) return 'powerHour';
  if (hours >= SESSION_TIMES.afternoon.start && hours < SESSION_TIMES.afternoon.end) return 'afternoon';
  if (hours >= SESSION_TIMES.midday.start && hours < SESSION_TIMES.midday.end) return 'midday';
  if (hours >= SESSION_TIMES.morningSession.start && hours < SESSION_TIMES.morningSession.end) return 'morningSession';
  if (hours >= SESSION_TIMES.opening.start && hours < SESSION_TIMES.opening.end) return 'opening';
  if (hours >= SESSION_TIMES.premarket.start && hours < SESSION_TIMES.premarket.end) return 'premarket';

  return 'closed';
}

function getTimeToNextPhase(etTime: Date, currentPhase: string): { hours: number; minutes: number; seconds: number; nextPhase: string } {
  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const seconds = etTime.getSeconds();

  const phaseOrder = ['premarket', 'opening', 'morningSession', 'midday', 'afternoon', 'powerHour', 'closed'];
  const currentIdx = phaseOrder.indexOf(currentPhase);
  const nextPhase = phaseOrder[currentIdx + 1] || 'premarket';

  let targetHour = 0;
  let targetMinute = 0;

  switch (currentPhase) {
    case 'premarket':
      targetHour = 9; targetMinute = 30;
      break;
    case 'opening':
      targetHour = 10; targetMinute = 0;
      break;
    case 'morningSession':
      targetHour = 12; targetMinute = 0;
      break;
    case 'midday':
      targetHour = 14; targetMinute = 0;
      break;
    case 'afternoon':
      targetHour = 15; targetMinute = 0;
      break;
    case 'powerHour':
      targetHour = 16; targetMinute = 0;
      break;
    default:
      // Market closed, time to next pre-market
      targetHour = 4; targetMinute = 0;
  }

  let diffSeconds = (targetHour * 3600 + targetMinute * 60) - (hours * 3600 + minutes * 60 + seconds);

  if (diffSeconds < 0) {
    diffSeconds += 24 * 3600; // Add a day if negative
  }

  return {
    hours: Math.floor(diffSeconds / 3600),
    minutes: Math.floor((diffSeconds % 3600) / 60),
    seconds: diffSeconds % 60,
    nextPhase,
  };
}

interface SPXSessionTimerProps {
  vix?: number;
  spxPrice?: number;
  gammaFlip?: number;
  className?: string;
}

export function SPXSessionTimer({
  vix = 18,
  spxPrice,
  gammaFlip,
  className
}: SPXSessionTimerProps) {
  const [etTime, setETTime] = useState(getETTime());
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0, seconds: 0, nextPhase: '' });

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => {
      const newTime = getETTime();
      setETTime(newTime);
      const phase = getCurrentPhase(newTime);
      setCountdown(getTimeToNextPhase(newTime, phase));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const currentPhase = useMemo(() => getCurrentPhase(etTime), [etTime]);
  const phaseConfig = MARKET_PHASES[currentPhase];
  const positionSizing = useMemo(() => getPositionSizing(vix), [vix]);
  const PhaseIcon = phaseConfig.icon;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const gammaPosition = useMemo(() => {
    if (!spxPrice || !gammaFlip) return null;
    const diff = spxPrice - gammaFlip;
    const pctDiff = (diff / gammaFlip) * 100;
    return {
      above: diff > 0,
      distance: Math.abs(diff),
      pctDistance: Math.abs(pctDiff),
    };
  }, [spxPrice, gammaFlip]);

  return (
    <Card className={cn(
      'p-4 border',
      phaseConfig.bgColor,
      phaseConfig.borderColor,
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <PhaseIcon className={cn('w-5 h-5', phaseConfig.color)} />
          <span className={cn('text-sm font-bold tracking-wide', phaseConfig.color)}>
            {phaseConfig.name}
          </span>
        </div>
        <div className="text-xs text-slate-400">
          {formatTime(etTime)} ET
        </div>
      </div>

      {/* Phase Description */}
      <p className="text-xs text-slate-400 mb-3">{phaseConfig.description}</p>

      {/* Countdown to Next Phase */}
      {currentPhase !== 'closed' && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded bg-black/20">
          <Timer className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-400">Next phase in:</span>
          <span className="text-sm font-mono font-bold text-white">
            {String(countdown.hours).padStart(2, '0')}:
            {String(countdown.minutes).padStart(2, '0')}:
            {String(countdown.seconds).padStart(2, '0')}
          </span>
        </div>
      )}

      {/* VIX-Based Position Sizing */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="p-2 rounded bg-black/20">
          <div className="text-[10px] text-slate-500 uppercase mb-1">VIX Level</div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">{safeToFixed(vix, 1)}</span>
            <Badge className={cn('text-[10px]', positionSizing.color, 'bg-transparent border-current')}>
              {positionSizing.riskLevel}
            </Badge>
          </div>
        </div>
        <div className="p-2 rounded bg-black/20">
          <div className="text-[10px] text-slate-500 uppercase mb-1">Size Multiplier</div>
          <div className="text-lg font-bold text-white">
            {safeToFixed(positionSizing.sizeMultiplier * 100, 0)}%
          </div>
        </div>
      </div>

      {/* Gamma Level Position */}
      {gammaPosition && (
        <div className="p-2 rounded bg-black/20 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {gammaPosition.above ? (
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-400" />
              )}
              <span className="text-xs text-slate-400">
                {gammaPosition.above ? 'Above' : 'Below'} Gamma Flip
              </span>
            </div>
            <span className={cn(
              'text-sm font-bold',
              gammaPosition.above ? 'text-emerald-400' : 'text-red-400'
            )}>
              {safeToFixed(gammaPosition.distance, 0)} pts ({safeToFixed(gammaPosition.pctDistance, 2)}%)
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {gammaPosition.above
              ? 'Positive gamma zone - dealers hedge by buying dips, selling rips (mean reversion)'
              : 'Negative gamma zone - dealers amplify moves (momentum/trend continuation)'}
          </p>
        </div>
      )}

      {/* Trading Advice */}
      <div className="flex items-start gap-2 p-2 rounded bg-cyan-500/10 border border-cyan-500/20">
        <AlertTriangle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-cyan-300">{phaseConfig.tradingAdvice}</p>
      </div>

      {/* Quick Stats Row */}
      {spxPrice && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">SPX</span>
            <span className="font-mono font-bold text-white">${safeToFixed(spxPrice, 2)}</span>
          </div>
          {gammaFlip && (
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-slate-500">Gamma Flip</span>
              <span className="font-mono text-amber-400">${safeToFixed(gammaFlip, 0)}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default SPXSessionTimer;
