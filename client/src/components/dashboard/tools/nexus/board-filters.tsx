/**
 * NEXUS board filter bar — ONE compact row (operator 2026-10-07: "the filter
 * bar is overwhelming"):
 *
 *   [search] [Today · Week · All] [All · Long · Short] [Grade A/B] [Filters (n)] count
 *
 * Everything else — asset (Crypto / SPX), rotation, recency (New / Top 10),
 * published day (Yesterday / a date), called-time range, show stale, and the
 * view (list / grid / table) — lives in the Filters popover (bottom sheet on a
 * phone), with an active-filter count on the button and Clear.
 * State rules: shared/board-filters.ts.
 */
import { useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { usePhone } from '@/components/ui/qe-phone';
import { QEDrawer } from '@/components/ui/qe-drawer';
import {
  DAY_SEGMENTS, activeFilterCount, clearPopoverFilters,
  type BoardFilterState, type BoardSide, type BoardView,
} from '@shared/board-filters';
import { BoardTimeRangeFilter, EMPTY_CALLED_RANGE } from './board-time-filter';
import './board-filters.css';

const isDateKey = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export function BoardFilterBar({ state, onChange, count, counts, staleHidden, earliest, today }: {
  state: BoardFilterState;
  onChange: (patch: Partial<BoardFilterState>) => void;
  /** rows shown */
  count: number;
  /** rows per day chip (today / yesterday / week / all) */
  counts: Record<string, number>;
  staleHidden: number;
  earliest: string | null;
  today: string;
}) {
  const n = activeFilterCount(state);
  const gradeOn = state.rank === 'conviction';
  return (
    <div className="nxf-row" role="toolbar" aria-label="Filter the board">
      <label className="nxf-search">
        <Search size={13} aria-hidden />
        <input value={state.query} onChange={(e) => onChange({ query: e.target.value })} placeholder="Ticker or sector" aria-label="Ticker or sector" />
        {state.query && <button type="button" className="nxf-x" aria-label="Clear search" onClick={() => onChange({ query: '' })}><X size={12} /></button>}
      </label>
      <Seg label="Day">
        {DAY_SEGMENTS.map((d) => (
          <button key={d.key} type="button" aria-pressed={state.day === d.key} className={state.day === d.key ? 'on' : ''} onClick={() => onChange({ day: d.key })}
            title={`${d.label} — ${counts[d.key] ?? 0} open`}>{d.label}</button>
        ))}
      </Seg>
      <Seg label="Side">
        {(['all', 'long', 'short'] as BoardSide[]).map((s) => (
          <button key={s} type="button" aria-pressed={state.side === s} className={state.side === s ? 'on' : ''} onClick={() => onChange({ side: s })}>
            {s === 'all' ? 'All' : s === 'long' ? 'Long' : 'Short'}
          </button>
        ))}
      </Seg>
      <button type="button" className={`nxf-chip${gradeOn ? ' on' : ''}`} aria-pressed={gradeOn} title="NEXUS grade A and B only (actionability, unvalidated)"
        onClick={() => onChange({ rank: gradeOn ? 'all' : 'conviction' })}>A/B</button>
      <FiltersMenu state={state} onChange={onChange} count={n} counts={counts} staleHidden={staleHidden} earliest={earliest} today={today} rows={count} />
      <span className="nxf-count" aria-label={`${count} shown`}>{count}</span>
    </div>
  );
}

function Seg({ label, children }: { label: string; children: ReactNode }) {
  return <div className="nxf-seg" role="group" aria-label={label}>{children}</div>;
}

function FiltersMenu({ state, onChange, count, counts, staleHidden, earliest, today, rows }: {
  state: BoardFilterState; onChange: (p: Partial<BoardFilterState>) => void; count: number;
  counts: Record<string, number>; staleHidden: number; earliest: string | null; today: string; rows: number;
}) {
  const [open, setOpen] = useState(false);
  const phone = usePhone();
  const trigger = (
    <button type="button" className={`nxf-chip nxf-more${count ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={open}
      aria-label={`Filters${count ? `, ${count} active` : ''}`} onClick={phone ? () => setOpen(true) : undefined}>
      <SlidersHorizontal size={13} aria-hidden /><span className="nxf-more-l">Filters</span>{count > 0 && <b className="nxf-badge">{count}</b>}
    </button>
  );
  const body = <FiltersBody state={state} onChange={onChange} count={count} counts={counts} staleHidden={staleHidden} earliest={earliest} today={today} rows={rows} />;
  if (phone) {
    return (
      <>
        {trigger}
        <QEDrawer open={open} onClose={() => setOpen(false)} title="Board filters" side="bottom" className="nexus-vars nxf-sheet">{body}</QEDrawer>
      </>
    );
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="nexus-vars nxf-pop" side="bottom" align="end" sideOffset={6} collisionPadding={12} aria-label="Board filters">
          {body}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Toggle({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return <button type="button" className={`nxf-opt${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick} title={title}>{children}</button>;
}

function FiltersBody({ state, onChange, count, counts, staleHidden, earliest, today, rows }: {
  state: BoardFilterState; onChange: (p: Partial<BoardFilterState>) => void; count: number;
  counts: Record<string, number>; staleHidden: number; earliest: string | null; today: string; rows: number;
}) {
  return (
    <div className="nxf-body">
      <section>
        <h5>Asset</h5>
        <div className="nxf-opts">
          <Toggle on={state.cryptoOnly} onClick={() => onChange({ cryptoOnly: !state.cryptoOnly })} title="Crypto ideas only (24/7 crypto engine and any other crypto rows)">Crypto</Toggle>
          <Toggle on={state.spxOnly} onClick={() => onChange({ spxOnly: !state.spxOnly })} title="SPY / SPX index 0DTE ideas — SPX plays are published on SPY and carry an SPXW mirror">SPX 0DTE</Toggle>
          <Toggle on={state.withRotation} onClick={() => onChange({ withRotation: !state.withRotation })} title="Only ideas riding the current sector rotation (measuring)">With rotation</Toggle>
        </div>
      </section>
      <section>
        <h5>Recency</h5>
        <div className="nxf-opts">
          <Toggle on={state.rank === 'new'} onClick={() => onChange({ rank: state.rank === 'new' ? 'all' : 'new' })} title="Published in the last 24 hours">New (24h)</Toggle>
          <Toggle on={state.rank === 'best'} onClick={() => onChange({ rank: state.rank === 'best' ? 'all' : 'best' })} title="Top 10 in the board order">Top 10</Toggle>
        </div>
      </section>
      <section>
        <h5>Published day</h5>
        <div className="nxf-opts">
          <Toggle on={state.day === 'yesterday'} onClick={() => onChange({ day: state.day === 'yesterday' ? 'today' : 'yesterday' })} title="Published in the previous trading session (ET)">Yesterday <b>{counts.yesterday ?? 0}</b></Toggle>
          <input type="date" className={`nxf-date${isDateKey(state.day) ? ' on' : ''}`} aria-label="Published on a past day (ET)" title="Any past day in the board's lookback (ET publish day)"
            value={isDateKey(state.day) ? state.day : ''} min={earliest ?? undefined} max={today}
            onChange={(e) => onChange({ day: isDateKey(e.target.value) ? e.target.value : 'today' })} />
          {(state.day === 'today' && (staleHidden > 0 || state.showStale)) && (
            <Toggle on={state.showStale} onClick={() => onChange({ showStale: !state.showStale })} title="Stale = past its holding window, entry window closed, or price ran past entry without a fill">
              Show stale{staleHidden ? ` (${staleHidden})` : ''}
            </Toggle>
          )}
        </div>
      </section>
      <section>
        <h5>Called between (ET)</h5>
        <BoardTimeRangeFilter value={state.calledRange ?? EMPTY_CALLED_RANGE} onChange={(v) => onChange({ calledRange: v })} count={rows} />
      </section>
      <section>
        <h5>View</h5>
        <div className="nxf-opts" role="group" aria-label="View">
          {(['list', 'grid', 'table'] as BoardView[]).map((v) => (
            <Toggle key={v} on={state.view === v} onClick={() => onChange({ view: v })}>{v[0].toUpperCase() + v.slice(1)}</Toggle>
          ))}
        </div>
      </section>
      <footer className="nxf-foot">
        <span>{count ? `${count} filter${count === 1 ? '' : 's'} active` : 'No extra filters'}</span>
        <button type="button" className="nxf-clear" disabled={!count} onClick={() => onChange(clearPopoverFilters(state))}>Clear</button>
      </footer>
    </div>
  );
}
