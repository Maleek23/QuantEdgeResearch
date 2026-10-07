/**
 * NEXUS ideas book — VIEW + SIZING transform (pure; the journal applies it to
 * the book's rows before any KPI, calendar, curve or list is computed, so every
 * number on every journal page follows the choice).
 *
 *   view    recorded   the tracker's recorded outcome (default; never overwritten)
 *           managed    the same ideas replayed with the current managed exit rules
 *                      (shared/managed-exit.ts via research/managed-exit-replay.ts) —
 *                      "replayed with current exit rules — not live fills"
 *   sizing  unit       1 contract / $1,000 notional (the book's native unit)
 *           risk       equal risk $R to the stop per idea (shared/position-sizing.ts)
 *
 * Win = positive CLOSED P&L under the view's exits. Rows the view cannot price
 * (not in the replay ledger; too expensive for the risk budget; no stop) are
 * left out AND counted by reason — nothing disappears silently.
 *
 * Desk rows carry the fields this reads (server/journal-row-maps.ts riskBasis;
 * server/managed-replay-ledger.ts managed / peak / call).
 */
import type { CallResult } from './call-accuracy';
import { journalDayKey } from './journal-filters';
import { sizeForRisk, scaleUnitPnl, type RiskBasis, type SizingChoice } from './position-sizing';

export type DeskView = 'recorded' | 'managed';
export const DESK_VIEW_LABEL: Record<DeskView, string> = { recorded: 'Recorded', managed: 'Managed replay' };
export const MANAGED_VIEW_CAVEAT = 'replayed with current exit rules — not live fills';

export interface DeskRiskBasis extends RiskBasis {
  /** Units the unit book holds: 1 contract, or $1,000 / entry shares. */
  unitQty: number;
  /** Called direction on the underlying. */
  direction: 'long' | 'short';
}

export interface DeskPeak {
  /** Underlying MFE inside the hold window. */
  underlying: { px: number; at: string; r: number | null; pct: number | null } | null;
  /** Options: best contract premium inside the hold window. */
  premium: { px: number; at: string; pct: number | null } | null;
  /** Unit-size $ at the peak (what the unit book would have shown at the best print). */
  unitPnl: number | null;
}

export interface DeskManaged {
  status: 'closed' | 'open';
  /** Unit-size realized P&L under the managed policy (closed only). */
  pnlUnit: number | null;
  rMultiple: number | null;
  exitAt: string | null;
  /** Size-weighted exit (premium for options, underlying for stocks). */
  exitPx: number | null;
  exitReason: string;
  /** Options: the premium the replay entered at and the premium stop it used. */
  entryPremium?: number | null;
  premiumStop?: number | null;
}

export interface DeskCall { result: CallResult; at: string | null; winKind: 'T1' | '1R' | null; winLevel: number | null }

/** The fields this transform reads / writes (a structural subset of the journal row). */
export interface DeskViewRow {
  id: string;
  status: string;
  quantity: number;
  entryPrice: number;
  exitPrice?: number | null;
  exitTime?: string | null;
  entryTime: string;
  holdingMinutes?: number | null;
  realizedPnL?: number | null;
  realizedPnLPercent?: number | null;
  grossPnL?: number | null;
  outcome?: string | null;
  riskBasis?: DeskRiskBasis | null;
  managed?: DeskManaged | null;
  peak?: DeskPeak | null;
  call?: DeskCall | null;
  /** Set by this transform: how the row is sized / which view priced it. */
  sizedAs?: { mode: 'risk'; riskDollars: number; qty: number; riskToStop: number; notional: number; premiumStopBasis: string | null } | null;
  viewedAs?: DeskView;
}

export interface DeskViewResult<T> {
  rows: T[];
  /** Rows left out of this view, by reason. */
  skipped: { reason: string; count: number }[];
  view: DeskView;
  sizing: SizingChoice;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const outcomeOf = (pnl: number | null) => (pnl == null ? 'open' : Math.abs(pnl) < 0.005 ? 'breakeven' : pnl > 0 ? 'win' : 'loss');
const minutesBetween = (a: string, b: string | null | undefined) => {
  if (!b) return null;
  const d = (Date.parse(b) - Date.parse(a)) / 60_000;
  return Number.isFinite(d) ? Math.max(0, Math.round(d)) : null;
};

/** Normalise a skip reason into a stable bucket ("too expensive …$1,234…" → one bucket). */
function bucket(reason: string): string {
  if (reason.startsWith('too expensive for risk budget')) return 'too expensive for risk budget';
  return reason;
}

export function applyDeskView<T extends DeskViewRow>(rows: readonly T[], opts: { view: DeskView; sizing: SizingChoice }): DeskViewResult<T> {
  const skipped = new Map<string, number>();
  const skip = (why: string) => skipped.set(bucket(why), (skipped.get(bucket(why)) ?? 0) + 1);
  const out: T[] = [];
  for (const row0 of rows) {
    let row: T = row0;
    // ── view ──
    if (opts.view === 'managed') {
      const m = row.managed;
      if (!m) { skip('not in the managed-replay ledger (no bars, or replayed before this idea)'); continue; }
      const closed = m.status === 'closed' && m.pnlUnit != null;
      const pnl = closed ? r2(m.pnlUnit!) : null;
      const opt = row.riskBasis?.assetType === 'option';
      const entry = opt && m.entryPremium != null && m.entryPremium > 0 ? m.entryPremium : row.entryPrice;
      row = {
        ...row,
        status: closed ? 'closed' : 'open',
        entryPrice: entry,
        exitPrice: closed ? m.exitPx : null,
        exitTime: closed ? m.exitAt : null,
        holdingMinutes: closed ? minutesBetween(row.entryTime, m.exitAt) : null,
        realizedPnL: pnl,
        grossPnL: pnl,
        realizedPnLPercent: closed && m.exitPx != null && entry > 0
          ? r2(((m.exitPx - entry) / entry) * 100 * (!opt && row.riskBasis?.direction === 'short' ? -1 : 1))
          : null,
        outcome: outcomeOf(pnl),
        viewedAs: 'managed',
        ...(opt && m.entryPremium != null && row.riskBasis
          ? { riskBasis: { ...row.riskBasis, entryPremium: m.entryPremium, premiumStop: m.premiumStop ?? row.riskBasis.premiumStop ?? null } }
          : {}),
      };
    } else if (row.viewedAs !== 'recorded') {
      row = { ...row, viewedAs: 'recorded' };
    }
    // ── sizing ──
    if (opts.sizing.mode === 'risk') {
      const b = row.riskBasis;
      if (!b) { skip('no plan levels to size from'); continue; }
      const sz = sizeForRisk(b, opts.sizing.riskDollars);
      if (!sz.ok) { skip(sz.reason); continue; }
      const pnl = scaleUnitPnl(row.realizedPnL ?? null, b.unitQty, sz);
      row = {
        ...row,
        quantity: sz.qty,
        realizedPnL: row.realizedPnL == null ? null : pnl,
        grossPnL: row.realizedPnL == null ? null : pnl,
        outcome: row.realizedPnL == null ? row.outcome : outcomeOf(pnl),
        sizedAs: { mode: 'risk', riskDollars: opts.sizing.riskDollars, qty: sz.qty, riskToStop: r2(sz.riskDollars), notional: r2(sz.notional), premiumStopBasis: sz.premiumStopBasis },
        ...(row.peak && row.peak.unitPnl != null ? { peak: { ...row.peak, unitPnl: scaleUnitPnl(row.peak.unitPnl, b.unitQty, sz) } } : {}),
      };
    }
    out.push(row);
  }
  return {
    rows: out,
    skipped: [...skipped.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    view: opts.view,
    sizing: opts.sizing,
  };
}

/** Parse the persisted sizing preference (journal prefs). */
export function parseSizingChoice(raw: unknown): SizingChoice {
  if (!raw || typeof raw !== 'object') return { mode: 'unit', riskDollars: 0 };
  const r = raw as Record<string, unknown>;
  const v = Number(r.riskDollars);
  if (r.mode === 'risk' && Number.isFinite(v) && v >= 50 && v <= 100_000) return { mode: 'risk', riskDollars: Math.round(v) };
  return { mode: 'unit', riskDollars: 0 };
}

export function parseDeskView(raw: unknown): DeskView {
  return raw === 'managed' ? 'managed' : 'recorded';
}

/**
 * The sizing basis of one desk idea (its PUBLISHED plan levels), carried on the
 * journal row so the client can re-size it. Null when there is nothing to size.
 */
export function deskRiskBasis(a: {
  assetType: string; direction: string; entry: number; stop: number | null; entryPremium: number | null;
  expiryDate: string | null; publishedAt: string; unitQty: number; premiumStop?: number | null;
}): DeskRiskBasis | null {
  const assetType = a.assetType === 'option' ? 'option' : a.assetType === 'crypto' ? 'crypto' : a.assetType === 'future' || a.assetType === 'futures' ? 'future' : 'stock';
  if (!(a.entry > 0) || !(a.unitQty > 0)) return null;
  const exp = a.expiryDate ? String(a.expiryDate).slice(0, 10) : null;
  return {
    assetType, direction: a.direction === 'short' ? 'short' : 'long', entry: a.entry,
    stop: a.stop != null && a.stop > 0 ? a.stop : null, unitQty: a.unitQty,
    ...(assetType === 'option' ? {
      entryPremium: a.entryPremium ?? null, premiumStop: a.premiumStop ?? null,
      zeroDte: !!exp && exp === journalDayKey(a.publishedAt),
    } : {}),
  };
}
