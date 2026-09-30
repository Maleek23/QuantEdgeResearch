/**
 * OpenMark — the live mark of an OPEN journal trade:
 *   "Mark $x · +$y (+z%) · 12s"
 * The price cell flashes on a changed mark (lib/use-tick-flash.ts). The age is
 * always shown and ticks; a delayed venue says "delayed"; an option priced only
 * by its underlying shows the note and no P&L — a stale or indirect mark is
 * never dressed up as a live contract price.
 * Falls back to the row's stored ledger mark (bot rows) with its age.
 */
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useTickFlash } from '@/lib/use-tick-flash';
import { fmtMoney, fmtPrice } from '@/lib/journal/metrics';
import { markAgeLabel, type LiveMark } from '@/lib/journal/use-journal-marks';

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), ms); return () => window.clearInterval(t); }, [ms]);
  return now;
}

const STALE_MS = 90_000;

export function OpenMark({ rowId, live, stored, compact }: {
  rowId: string;
  live?: LiveMark | null;
  stored?: { price: number; asOf: string; unrealizedPnL: number } | null;
  compact?: boolean;
}) {
  const now = useNow(1000);
  const m = live ?? (stored ? { ...stored, source: 'ledger', delayed: true, basis: 'quote' as const, unrealizedPct: null, note: undefined } : null);
  const flash = useTickFlash(m?.price, { resetKey: rowId });
  if (!m) return <span className="jr-dim">open · no mark</span>;
  const age = now - Date.parse(m.asOf);
  const stale = !Number.isFinite(age) || age > STALE_MS || !live;
  const pnl = m.unrealizedPnL;
  const tone = pnl == null || pnl === 0 ? 'jr-dim' : pnl > 0 ? 'jr-gain' : 'jr-loss';
  const title = [
    `${m.basis === 'contract' ? 'Contract mid' : m.basis === 'underlying' ? 'Underlying quote' : 'Quote'} ${fmtPrice(m.price)} from ${m.source}`,
    `observed ${new Date(m.asOf).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
    m.delayed ? 'delayed venue' : null,
    live ? 'refreshes every 30 s while this page is visible' : 'last stored mark — not a live quote',
    'Unrealized — not in realized P&L',
  ].filter(Boolean).join(' · ');
  return (
    <span className={cn('tabular-nums', stale && 'jr-dim')} title={title} data-testid="open-mark">
      {!compact && <>Mark </>}<span className={cn(flash)}>{fmtPrice(m.price)}</span>
      {m.note
        ? <small className="jr-dim"> · {m.note}</small>
        : <> · <span className={tone}>{fmtMoney(pnl)}</span>{m.unrealizedPct != null && <span className={tone}> ({m.unrealizedPct > 0 ? '+' : m.unrealizedPct < 0 ? '−' : ''}{Math.abs(m.unrealizedPct).toFixed(1)}%)</span>}</>}
      <small className="jr-dim"> · {markAgeLabel(m.asOf, now)}{m.delayed ? ' delayed' : ''}{!live ? ' old' : ''}</small>
    </span>
  );
}
