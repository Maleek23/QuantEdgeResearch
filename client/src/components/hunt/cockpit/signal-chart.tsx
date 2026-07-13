/**
 * SignalChart — clean area line of real closes with labeled entry / target / stop
 * reference lines. Optional TA overlay (`fib`) layers the key Fibonacci
 * retracements (38.2 / 50 / 61.8) and a candlestick-pattern badge on top, sourced
 * from /api/ta — so the same technical read powers the chart and the conviction.
 */
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Loader2 } from 'lucide-react';
import { usePriceHistory } from './use-price-history';
import { useTA } from './use-ta';
import { cn } from '@/lib/utils';

interface Props {
  symbol: string;
  range?: string;
  interval?: string;
  entry?: number;
  target?: number;
  stop?: number;
  tone?: 'bull' | 'bear';
  height?: number;
  /** Layer Fibonacci levels + candlestick pattern badge from /api/ta. */
  fib?: boolean;
}

export function SignalChart({
  symbol,
  range = '1mo',
  interval = '1d',
  entry,
  target,
  stop,
  tone = 'bull',
  height = 300,
  fib = false,
}: Props) {
  const { points, isLoading, isError } = usePriceHistory(symbol, range, interval);
  // TA is computed over a longer window than the visible range so swing
  // high/low are meaningful even on a 1mo chart.
  const { ta } = useTA(symbol, '6mo', '1d', fib);
  const color = tone === 'bull' ? 'var(--trade-bullish)' : 'var(--trade-bearish)';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <Loader2 className="w-4 h-4 animate-spin text-[var(--brand-cyan)]" />
      </div>
    );
  }
  if (isError || points.length < 2) {
    return (
      <div className="flex items-center justify-center text-[11px] font-mono text-muted-foreground/60" style={{ height }}>
        Price history unavailable for {symbol}
      </div>
    );
  }

  const closes = points.map((p) => p.close);
  const levels = [entry, target, stop].filter((v): v is number => typeof v === 'number');

  // Only show Fib levels that fall inside the visible price band (else they'd
  // squash the y-domain and push the line into a flat ribbon).
  const visibleMin = Math.min(...closes, ...levels);
  const visibleMax = Math.max(...closes, ...levels);
  const fibLines = (fib && ta?.fib?.levels ? ta.fib.levels : [])
    .filter((l) => l.key && l.price >= visibleMin * 0.98 && l.price <= visibleMax * 1.02);

  const fibPrices = fibLines.map((l) => l.price);
  const min = Math.min(visibleMin, ...fibPrices);
  const max = Math.max(visibleMax, ...fibPrices);
  const pad = (max - min) * 0.08 || 1;

  // Strongest detected candlestick pattern (for the badge).
  const topPattern = (fib && ta?.patterns ? ta.patterns : [])
    .filter((p) => p.detected && p.type !== 'neutral')
    .sort((a, b) => strengthRank(b.strength) - strengthRank(a.strength))[0];

  return (
    <div className="relative" style={{ height }}>
      {topPattern && (
        <div
          className={cn(
            'absolute top-1 left-1 z-10 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider border',
            topPattern.type === 'bullish'
              ? 'text-[var(--trade-bullish)] border-[var(--trade-bullish)]/40 bg-[var(--trade-bullish)]/10'
              : 'text-[var(--trade-bearish)] border-[var(--trade-bearish)]/40 bg-[var(--trade-bearish)]/10',
          )}
          title={`Candlestick pattern detected on latest candle · ${topPattern.strength}`}
        >
          {topPattern.name}
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 64, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id={`sig-${symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="time" hide />
          <YAxis domain={[min - pad, max + pad]} hide />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
            }}
            labelFormatter={(t) => new Date((t as number) * 1000).toLocaleDateString()}
            formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Close']}
          />
          {/* Fibonacci retracements (gold, subtle, labeled on the LEFT so they
              don't collide with entry/target/stop labels on the right). */}
          {fibLines.map((l) => (
            <ReferenceLine
              key={`fib-${l.ratio}`}
              y={l.price}
              stroke="var(--brand-gold, #d4af37)"
              strokeDasharray="2 4"
              strokeOpacity={0.45}
              label={{ value: `${l.label}`, position: 'left', fill: 'var(--brand-gold, #d4af37)', fontSize: 8, fontFamily: 'var(--font-mono)' }}
            />
          ))}
          {typeof entry === 'number' && (
            <ReferenceLine y={entry} stroke="var(--brand-cyan)" strokeDasharray="4 4" strokeOpacity={0.7}
              label={{ value: `ENTRY $${entry.toFixed(2)}`, position: 'right', fill: 'var(--brand-cyan)', fontSize: 9, fontFamily: 'var(--font-mono)' }} />
          )}
          {typeof target === 'number' && (
            <ReferenceLine y={target} stroke="var(--trade-bullish)" strokeDasharray="4 4" strokeOpacity={0.7}
              label={{ value: `T1 $${target.toFixed(2)}`, position: 'right', fill: 'var(--trade-bullish)', fontSize: 9, fontFamily: 'var(--font-mono)' }} />
          )}
          {typeof stop === 'number' && (
            <ReferenceLine y={stop} stroke="var(--trade-bearish)" strokeDasharray="4 4" strokeOpacity={0.7}
              label={{ value: `STOP $${stop.toFixed(2)}`, position: 'right', fill: 'var(--trade-bearish)', fontSize: 9, fontFamily: 'var(--font-mono)' }} />
          )}
          <Area
            type="monotone"
            dataKey="close"
            stroke={color}
            strokeWidth={2}
            fill={`url(#sig-${symbol})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function strengthRank(s: 'strong' | 'moderate' | 'weak'): number {
  return s === 'strong' ? 3 : s === 'moderate' ? 2 : 1;
}
