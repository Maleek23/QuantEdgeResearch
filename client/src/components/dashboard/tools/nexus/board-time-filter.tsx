/**
 * NEXUS board — filter by call time (date + time range, ET).
 * The pure filter lives in shared/board-time-range.ts (tested by
 * scripts/test-idea-timeline.ts); this file re-exports it and adds the control.
 *
 * The control holds ISO bounds; the two datetime-local inputs are read and
 * written as America/New_York wall time, whatever the viewer's own zone is.
 */
import { etLocalToIso, isoToEtLocal, filterByCalledRange, calledMsOf } from '@shared/board-time-range';
import './setup-tools.css';

export { filterByCalledRange, calledMsOf, etLocalToIso, isoToEtLocal };

export interface CalledRange { from: string | null; to: string | null }
export const EMPTY_CALLED_RANGE: CalledRange = { from: null, to: null };
export const isRangeActive = (r: CalledRange | null | undefined) => !!(r && (r.from || r.to));

export function BoardTimeRangeFilter({ value, onChange, count }: {
  value: CalledRange;
  onChange: (next: CalledRange) => void;
  /** rows left after the filter (shown while a bound is set) */
  count?: number;
}) {
  const active = isRangeActive(value);
  return (
    <div className={`nxp-trf${active ? ' on' : ''}`} role="group" aria-label="Called between (ET)">
      <span className="nxp-trf-label">CALLED</span>
      <input
        type="datetime-local"
        aria-label="Called from (ET)"
        title="Called at or after this time (America/New_York)"
        value={isoToEtLocal(value.from)}
        onChange={(e) => onChange({ ...value, from: etLocalToIso(e.target.value) })}
      />
      <span className="nxp-trf-sep" aria-hidden="true">→</span>
      <input
        type="datetime-local"
        aria-label="Called until (ET)"
        title="Called at or before this time (America/New_York)"
        value={isoToEtLocal(value.to)}
        onChange={(e) => onChange({ ...value, to: etLocalToIso(e.target.value, true) })}
      />
      <span className="nxp-trf-tz">ET</span>
      {active && count != null && <span className="nxp-trf-count">{count}</span>}
      {active && <button type="button" className="nxp-trf-clear" aria-label="Clear the called-time range" onClick={() => onChange(EMPTY_CALLED_RANGE)}>clear</button>}
    </div>
  );
}
