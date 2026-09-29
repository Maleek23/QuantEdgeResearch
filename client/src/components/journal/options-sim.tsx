/**
 * Options P&L simulator over the option legs in view (was Trade Log → "P&L Sim").
 * Groups legs by underlying; the drawer's "Simulate P&L" preselects one.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { SimPosition } from '@/components/position-pnl-simulator';
import type { JournalTradeRow } from '@/lib/journal/types';
import { ToolSkeleton } from '@/components/ui/qe-loading';

const PositionPnLSimulator = lazy(() => import('@/components/position-pnl-simulator'));

export function OptionsSim({ rows, preselect }: { rows: JournalTradeRow[]; preselect?: string | null }) {
  const groups = useMemo(() => {
    const m = new Map<string, SimPosition[]>();
    for (const t of rows) {
      if (t.assetType !== 'option' || !t.strikePrice || !t.optionType) continue;
      const arr = m.get(t.symbol) ?? [];
      arr.push({
        symbol: t.symbol,
        strikePrice: t.strikePrice,
        optionType: t.optionType === 'put' ? 'put' : 'call',
        direction: t.direction === 'short' ? 'short' : 'long',
        quantity: t.quantity || 1,
        avgCost: t.entryPrice,
        expiryDate: t.expiryDate || '',
      });
      m.set(t.symbol, arr);
    }
    return m;
  }, [rows]);
  const symbols = useMemo(() => [...groups.keys()].sort(), [groups]);
  const [sym, setSym] = useState<string>(preselect && groups.has(preselect) ? preselect : symbols[0] ?? '');
  useEffect(() => {
    if (preselect && groups.has(preselect)) setSym(preselect);
    else if (!groups.has(sym) && symbols[0]) setSym(symbols[0]);
  }, [preselect, groups, symbols, sym]);

  if (!symbols.length) {
    return <p className="jr-note">No option legs with a strike and call/put in view. Log or import option trades (with strike and expiry) to project their payoff at any underlying price.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label htmlFor="jr-sim-sym" className="jr-mute" style={{ fontSize: 12 }}>Underlying</label>
        <select id="jr-sim-sym" className="jr-select" value={sym} onChange={(e) => setSym(e.target.value)}>
          {symbols.map((s) => <option key={s} value={s}>{s} · {groups.get(s)!.length} leg{groups.get(s)!.length === 1 ? '' : 's'}</option>)}
        </select>
        <span className="jr-note" style={{ margin: 0 }}>At-expiry payoff of every logged leg on this underlying (open and closed), from your entry premiums.</span>
      </div>
      <Suspense fallback={<ToolSkeleton rows={2} />}>
        <PositionPnLSimulator positions={groups.get(sym) ?? []} symbol={sym} />
      </Suspense>
    </div>
  );
}
