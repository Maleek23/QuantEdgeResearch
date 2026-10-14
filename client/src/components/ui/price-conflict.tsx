/**
 * Shown when two price sources for one symbol disagree by more than 5%
 * (shared/price-agreement.ts). Prints every source with its age; the caller
 * suppresses values derived from the price while this is up.
 */
import type { PriceAgreement } from '@shared/price-agreement';
import { compactAge } from '@/components/ui/qe-phone';

const fmt = (v: number) => (v >= 1000 ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${v.toFixed(2)}`);

export function PriceConflictNote({ agreement, className }: { agreement: PriceAgreement; className?: string }) {
  if (agreement.ok || !agreement.referenceRead) return null;
  const rows = [{ ...agreement.referenceRead, price: agreement.reference as number }, ...agreement.conflicts];
  return (
    <div role="status" className={className ?? 'qe-price-conflict'} style={{
      border: '1px solid var(--amber, #facc15)', borderRadius: 6, padding: '8px 10px', margin: '6px 0',
      fontSize: 12, lineHeight: 1.45, color: 'var(--text, #e8ecf3)', background: 'color-mix(in srgb, var(--amber, #facc15) 8%, transparent)',
    }}>
      <b style={{ color: 'var(--amber, #facc15)' }}>Price sources disagree</b>
      {' — '}
      {rows.map((r, i) => (
        <span key={r.label}>
          {i > 0 ? ' · ' : ''}{r.label} <span style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>{fmt(r.price)}</span>
          {' '}<span style={{ color: 'var(--text-dim, #8b93a3)' }}>({r.asOf != null ? `${compactAge(r.asOf) ?? 'age unknown'} old` : 'age unknown'})</span>
        </span>
      ))}
      . Distances, range position and the week band are hidden until they agree.
    </div>
  );
}
