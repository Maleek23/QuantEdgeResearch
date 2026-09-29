/**
 * HORIZON BOOK — filter chips + sortable table in one drop-in block.
 * Mount with the picks a page already has: <HorizonBook picks={ideas} storageKey="qe.today.horizon" />.
 */
import type { ConvictionPick } from '@/lib/convictions';
import { HorizonFilter, useHorizonFilter } from './horizon-filter';
import { IdeasTable } from './ideas-table';

export function HorizonBook({
  picks,
  storageKey,
  onSelect,
  className,
}: {
  picks: ConvictionPick[];
  storageKey?: string;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const cut = useHorizonFilter(picks, storageKey);
  return (
    <div className={className}>
      <HorizonFilter className="mb-3" value={cut.value} onChange={cut.setValue} counts={cut.counts} total={picks.length} />
      <IdeasTable picks={cut.filtered} onSelect={onSelect} />
    </div>
  );
}
