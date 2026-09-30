/**
 * Journal building blocks — KPI tiles, cards, P&L text, outcome chips and the
 * bucket table. Every rate carries its sample size (n = closed trades) and a
 * "low n" flag below LOW_SAMPLE, so a 3-trade 100% win rate can't pass as an edge.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import {
  fmtDuration, fmtMoney, fmtPct, fmtRatio, LOW_SAMPLE, type BucketStats, type TradeStatus,
} from '@/lib/journal/metrics';

/** Class list for portaled journal surfaces (dialogs/sheets render outside .nexus-vars). */
export function useJournalPortalClass(): string {
  const { theme } = useTheme();
  return cn('nexus-vars jr', theme === 'nexus-light' && 'light');
}

export function Pnl({ value, className, compact }: { value: number | null | undefined; className?: string; compact?: boolean }) {
  const cls = value == null || value === 0 ? 'jr-dim' : value > 0 ? 'jr-gain' : 'jr-loss';
  return <span className={cn(cls, 'tabular-nums', className)}>{fmtMoney(value, { compact })}</span>;
}

/** Sample-size tag: "n=61" or "n=24 days". */
export function N({ n, unit }: { n: number; unit?: string }) {
  return <span className="jr-n" title="Sample size behind this block">n={n}{unit ? ` ${unit}` : ''}</span>;
}

export function LowSample({ n }: { n: number }) {
  if (n >= LOW_SAMPLE || n === 0) return null;
  return <span className="jr-lowsample" title={`Fewer than ${LOW_SAMPLE} closed trades — treat as anecdote, not edge`}>LOW N</span>;
}

export function Kpi({ label, value, sub, tone, hint }: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'gain' | 'loss' | null;
  hint?: string;
}) {
  return (
    <div className="jr-kpi" title={hint}>
      <div className="jr-kpi-l">{label}</div>
      <div className={cn('jr-kpi-v', tone === 'gain' && 'jr-gain', tone === 'loss' && 'jr-loss')}>{value}</div>
      {sub != null && <div className="jr-kpi-s">{sub}</div>}
    </div>
  );
}

export function Card({ title, num, meta, children, className, id }: {
  title: ReactNode;
  num?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={cn('jr-card', className)} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      <div className="jr-card-h">
        {num && <span className="jr-sec-num">{num}</span>}
        <h3 className="jr-card-t">{title}</h3>
        {meta && <div className="jr-card-meta">{meta}</div>}
      </div>
      {children}
    </section>
  );
}

export function OutcomeChip({ status }: { status: TradeStatus }) {
  const label = status === 'win' ? 'WIN' : status === 'loss' ? 'LOSS' : status === 'breakeven' ? 'B/E' : 'OPEN';
  return <span className={cn('jr-chip', status === 'win' && 'win', status === 'loss' && 'loss', status === 'open' && 'open')}>{label}</span>;
}

export function SideChip({ direction }: { direction: string }) {
  return <span className="jr-chip">{direction === 'short' ? '▼ SHORT' : '▲ LONG'}</span>;
}

export function tone(v: number | null | undefined): 'gain' | 'loss' | null {
  return v == null || v === 0 ? null : v > 0 ? 'gain' : 'loss';
}

/** Diverging bars from a zero baseline: direction is geometry, the number carries sign. */
export function BucketBars({ buckets, empty }: { buckets: BucketStats[]; empty: string }) {
  if (!buckets.length) return <p className="jr-note">{empty}</p>;
  const max = Math.max(1, ...buckets.map((b) => Math.abs(b.netPnl)));
  return (
    <div className="jr-bars">
      {buckets.map((b) => {
        const w = (Math.abs(b.netPnl) / max) * 50;
        return (
          <div className="jr-bar-row" key={b.key}>
            <span className="jr-bar-k" title={b.key}>{b.key}</span>
            <span className="jr-bar-track" aria-hidden>
              <span className={cn('jr-bar-fill', b.netPnl >= 0 ? 'pos' : 'neg')} style={{ width: `${w}%` }} />
            </span>
            <span className="jr-bar-v">
              <Pnl value={b.netPnl} compact /> <span className="jr-n">· {fmtPct(b.winRate)} · n={b.closed}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function BucketTable({ buckets, keyLabel, onPick, showHold = false }: {
  buckets: BucketStats[];
  keyLabel: string;
  onPick?: (key: string) => void;
  /** Add an average-holding-time column (Reports). */
  showHold?: boolean;
}) {
  return (
    <div className="jr-table-wrap">
      <table className="jr-table">
        <thead>
          <tr>
            <th scope="col">{keyLabel}</th>
            <th scope="col" className="num">Closed n</th>
            <th scope="col" className="num">Win %</th>
            <th scope="col" className="num">Profit factor</th>
            <th scope="col" className="num">Expectancy</th>
            {showHold && <th scope="col" className="num">Avg hold</th>}
            <th scope="col" className="num">Net P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr
              key={b.key}
              onClick={onPick ? () => onPick(b.key) : undefined}
              style={onPick ? undefined : { cursor: 'default' }}
            >
              <td>
                {onPick ? (
                  <button type="button" className="jr-cell-btn jr-sym" style={{ fontSize: 13 }} onClick={(e) => { e.stopPropagation(); onPick(b.key); }}
                    aria-label={`Filter the journal to ${keyLabel.toLowerCase()} ${b.key}`}>{b.key}</button>
                ) : <span className="jr-sym" style={{ fontSize: 13 }}>{b.key}</span>}{' '}
                <LowSample n={b.closed} />
              </td>
              <td className="num">{b.closed}{b.trades > b.closed && <span className="jr-mute"> +{b.trades - b.closed} open</span>}</td>
              <td className="num">{fmtPct(b.winRate)}</td>
              <td className="num">{fmtRatio(b.profitFactor, b.profitFactorIsInfinite)}</td>
              <td className="num"><Pnl value={b.expectancy} /></td>
              {showHold && <td className="num">{fmtDuration(b.avgDurationMs)}</td>}
              <td className="num"><Pnl value={b.netPnl} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Tue, Sep 1, 2026" for a New York day key (YYYY-MM-DD). */
export function fmtDayLabel(day: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }): string {
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' }) : day;
}
