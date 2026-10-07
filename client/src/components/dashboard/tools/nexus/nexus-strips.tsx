/**
 * NEXUS strip tiles — the two thin reads that used to sit inside the Ranked
 * Setups board header, as tiles of their own so the workspace can resize,
 * move, collapse or hide them (operator 2026-10-01: "like tools"). The board
 * still renders them inline whenever these tiles are not placed.
 */
import { useQuery } from '@tanstack/react-query';
import { RotationStrip, useSectorIgnition } from '@/components/sector-ignition/sector-ignition';
import { QEEmpty } from '@/components/ui/qe-states';
import { isLiveBookPick } from '@/lib/convictions';
import { useFocusSymbol, useToolReport } from '../../frame';
import { TrackedRow } from './tracked-row';
import { useSelect, useSetupBook } from './nexus-tools';

/** Tracked symbols (time-boxed) — a symbol click opens its top live setup, else re-points the focus ticker. */
export function NexusTrackedTool() {
  const { all } = useSetupBook();
  const select = useSelect();
  const [, setFocus] = useFocusSymbol();
  // same key as TrackedRow's own query — this only reads the cache to know whether the row has anything to draw
  const tracked = useQuery<{ tracked: Array<{ symbol: string }> }>({ queryKey: ['/api/nexus/tracked'], enabled: false });
  const onFilter = (sym: string) => {
    const top = all.filter((p) => p.symbol === sym && isLiveBookPick(p)).sort((a, b) => b.convictionScore - a.convictionScore)[0];
    if (top) select.setup(top); else setFocus(sym);
  };
  return (
    <div className="fd-fill nxd nxd-strip">
      <TrackedRow picks={all} onFilter={onFilter} />
      {tracked.data && !tracked.data.tracked?.length && <QEEmpty className="fd-m" message="No symbols are being tracked right now." />}
    </div>
  );
}

/** Sector rotation one-liner: which groups money is moving into / out of, with laggards to watch. */
export function NexusRotationTool() {
  const daily = useSectorIgnition('daily');
  useToolReport({ asOf: daily.data ? daily.data.asOf : daily.isError ? null : undefined, source: 'sector ignition · /api/sector-ignition' });
  return (
    <div className="fd-fill nxd nxd-strip" style={{ padding: '6px 8px' }}>
      <RotationStrip />
    </div>
  );
}
