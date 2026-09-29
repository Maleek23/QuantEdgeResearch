/**
 * IDEAS TABLE — sortable, horizon-aware comparison of published ideas.
 *
 * Reusable: takes ConvictionPick-shaped rows, renders every column from the
 * row itself (no fetches), and states ages from the row's own publish time.
 * Pair with <HorizonFilter> (./horizon-filter) for the 0DTE / weekly / swing /
 * monthly / LEAPS cut. Clicking a header sorts; clicking it again reverses.
 */
import { useMemo, useState } from 'react';
import { HORIZON_ORDER } from '@shared/idea-horizon';
import type { ConvictionPick } from '@/lib/convictions';
import { cn } from '@/lib/utils';
import { horizonOf } from './horizon-filter';

type SortKey = 'symbol' | 'side' | 'horizon' | 'dte' | 'entry' | 'rr' | 'score' | 'source' | 'age';

const money = (v?: number | null) => (v != null && Number.isFinite(v) ? `$${Number(v).toFixed(2)}` : '—');

function ageText(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

function contractText(p: ConvictionPick): string {
  if (p.strikePrice == null || !p.optionType) return p.assetType === 'option' ? 'option' : p.assetType;
  const side = p.optionType.toLowerCase().startsWith('c') ? 'C' : 'P';
  const k = Number(p.strikePrice);
  return `$${k.toFixed(k % 1 ? 1 : 0)}${side}${p.expiryDate ? ` ${p.expiryDate.slice(5)}` : ''}`;
}

export function IdeasTable({
  picks,
  selectedId,
  onSelect,
  className,
}: {
  picks: ConvictionPick[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'score', dir: -1 });
  const now = Date.now();
  const rows = useMemo(() => {
    const rank = (h: string) => HORIZON_ORDER.indexOf(h as any);
    const val = (p: ConvictionPick): number | string => {
      const hz = horizonOf(p, now);
      switch (sort.key) {
        case 'symbol': return p.symbol;
        case 'side': return p.direction;
        case 'horizon': return rank(hz.horizon) * 10_000 + (hz.dte ?? 0);
        case 'dte': return hz.dte ?? Number.POSITIVE_INFINITY;
        case 'entry': return p.entryPrice;
        case 'rr': return p.riskRewardRatio ?? 0;
        case 'score': return p.convictionScore;
        case 'source': return p.source ?? '';
        case 'age': return -Date.parse(p.generatedAt || '') || 0;
      }
    };
    return [...picks].sort((a, b) => {
      const x = val(a); const y = val(b);
      const c = typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : (x as number) - (y as number);
      return c * sort.dir;
    });
  }, [picks, sort, now]);

  const th = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => {
    const active = sort.key === key;
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
        className={cn('px-3 py-2 font-normal', align === 'right' && 'text-right')}
      >
        <button
          type="button"
          onClick={() => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'symbol' || key === 'horizon' || key === 'dte' ? 1 : -1 }))}
          className={cn('uppercase tracking-[0.14em] hover:text-foreground', active && 'text-foreground')}
        >
          {label}{active ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
        </button>
      </th>
    );
  };

  if (picks.length === 0) {
    return <p className="py-10 text-center font-mono text-[11px] text-muted-foreground">Nothing in this horizon right now.</p>;
  }

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border/70 bg-card', className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left font-mono text-[12px] tabular-nums">
          <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
            <tr className="border-b border-border/70 text-[10px] text-muted-foreground">
              {th('symbol', 'Ticker')}
              {th('side', 'Side')}
              {th('horizon', 'Horizon')}
              {th('dte', 'DTE')}
              <th scope="col" className="px-3 py-2 font-normal uppercase tracking-[0.14em]">Vehicle</th>
              {th('entry', 'Entry', 'right')}
              <th scope="col" className="px-3 py-2 text-right font-normal uppercase tracking-[0.14em]">Stop</th>
              <th scope="col" className="px-3 py-2 text-right font-normal uppercase tracking-[0.14em]">Target</th>
              {th('rr', 'R:R', 'right')}
              {th('score', 'Score', 'right')}
              {th('source', 'Source')}
              {th('age', 'Age', 'right')}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const hz = horizonOf(p, now);
              const up = p.direction === 'long';
              const selected = selectedId === p.ideaId;
              return (
                <tr
                  key={p.ideaId}
                  onClick={onSelect ? () => onSelect(p.ideaId) : undefined}
                  className={cn(
                    'border-b border-border/40 last:border-0',
                    onSelect && 'cursor-pointer hover:bg-muted/40',
                    selected && 'bg-muted/60',
                  )}
                >
                  <td className="px-3 py-2 font-semibold text-foreground">{p.symbol}</td>
                  <td className={cn('px-3 py-2', up ? 'text-[var(--trade-bullish)]' : 'text-[var(--trade-bearish)]')}>{up ? '▲ long' : '▼ short'}</td>
                  <td className="px-3 py-2">
                    <span className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em]">{hz.label}</span>
                    {hz.expired && <span className="ml-1.5 text-[10px] text-muted-foreground">expired</span>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{hz.dte != null ? (hz.dte < 0 ? '—' : hz.dte) : '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{contractText(p)}</td>
                  <td className="px-3 py-2 text-right">{money(p.entryPrice)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{money(p.stopLoss)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{money(p.targetPrice)}</td>
                  <td className="px-3 py-2 text-right">{Number.isFinite(p.riskRewardRatio) ? Number(p.riskRewardRatio).toFixed(2) : '—'}</td>
                  <td className="px-3 py-2 text-right">{Number.isFinite(p.convictionScore) ? Math.round(p.convictionScore) : "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.source ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground" title={p.generatedAt}>{ageText(p.generatedAt, now)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
