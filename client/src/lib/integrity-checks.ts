/**
 * Journal › Performance › Audit — /api/audit/data-integrity wire shape
 * (audit 2026-10-01 P0 #18). The panel read `actual/expected` and
 * `isWin/isRealLoss`, but the server sends `independent/reported` (and
 * `actual/threshold` for the sample-size check) and `countedAsWin/countedAsLoss`,
 * so 3 of 4 checks printed "undefined / undefined" and every sample said EXCL.
 */
export interface IntegrityCheckWire {
  checkName: string;
  status: 'pass' | 'fail' | 'warning';
  independent?: number | null;
  reported?: number | null;
  actual?: number | null;
  threshold?: number | null;
  /** legacy field name */
  expected?: number | null;
  details?: string;
}

const show = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : String(v));

/** "12 counted / 12 reported", or "48 decided / 100 needed" — never "undefined / undefined". */
export function integrityCheckValues(c: IntegrityCheckWire): string {
  if (c.independent != null || c.reported != null) return `${show(c.independent)} counted / ${show(c.reported)} reported`;
  if (c.actual != null || c.threshold != null || c.expected != null) return `${show(c.actual)} / ${show(c.threshold ?? c.expected)} needed`;
  return '—';
}

export interface SampleTradeWire {
  countedAsWin?: boolean;
  countedAsLoss?: boolean;
  /** legacy names */
  isWin?: boolean;
  isRealLoss?: boolean;
}

export function sampleTradeClass(t: SampleTradeWire): 'WIN' | 'LOSS' | 'EXCL' {
  if (t.countedAsWin ?? t.isWin) return 'WIN';
  if (t.countedAsLoss ?? t.isRealLoss) return 'LOSS';
  return 'EXCL';
}
