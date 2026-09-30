/**
 * Import plan for POST /api/journal/import-csv — pure (no DB), so
 * scripts/test-journal.ts can pin it.
 *
 * For each parsed round trip:
 *   • 'duplicate' — an identical row is already in the journal;
 *   • 'close'     — the journal holds the SAME lot still OPEN (same contract,
 *                   side, size, entry price and entry time) and the new parse
 *                   closed it (a later export, or an option now settled at
 *                   expiry): update that row instead of inserting a second copy
 *                   of the trade next to the stale open one;
 *   • 'resettle'  — the lot is already in the journal, closed BY THE EXPIRY RULE
 *                   (e.g. at $0 before intrinsic settlement), and the new parse
 *                   settled it differently: update that row's settlement, never a
 *                   second copy. A verified intrinsic row is never downgraded to an
 *                   unverified $0, and a row whose exit was edited by hand is skipped.
 *   • 'insert'    — new.
 */
import { parseExpiryMarker, resettleEligible } from '@shared/journal-expiry';

export interface ImportableTrade {
  broker: string;
  brokerOrderId?: string | null;
  symbol: string;
  assetType: string;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  direction: string;
  quantity: number;
  entryPrice: number;
  exitPrice?: number | null;
  entryTime: string | Date;
  exitTime?: string | Date | null;
  status: string;
  notes?: string | null;
  realizedPnL?: number | null;
  fees?: number | null;
}

const iso = (v: string | Date | null | undefined) => (v == null ? '' : v instanceof Date ? v.toISOString() : new Date(v).toISOString?.() ?? String(v));
const safeIso = (v: string | Date | null | undefined) => { try { return iso(v); } catch { return String(v ?? ''); } };

/** Full identity — the import's long-standing duplicate check. */
export function importFingerprint(t: ImportableTrade): string {
  return [
    t.broker, t.brokerOrderId || '', t.symbol, t.assetType, t.optionType || '', t.strikePrice ?? '', t.expiryDate || '', t.direction,
    Number(t.quantity || 0).toFixed(6), Number(t.entryPrice || 0).toFixed(6), Number(t.exitPrice || 0).toFixed(6),
    safeIso(t.entryTime), safeIso(t.exitTime),
  ].join('|');
}

/** The lot's opening identity (no exit, no order id — a close appends its own id). */
export function entryFingerprint(t: ImportableTrade): string {
  return [
    t.broker, t.symbol, t.assetType, t.optionType || '', t.strikePrice ?? '', String(t.expiryDate || '').slice(0, 10), t.direction,
    Number(t.quantity || 0).toFixed(6), Number(t.entryPrice || 0).toFixed(6), safeIso(t.entryTime),
  ].join('|');
}

export type ImportAction<E> = { kind: 'duplicate' } | { kind: 'insert' } | { kind: 'close'; existing: E } | { kind: 'resettle'; existing: E };

/** Decide, trade by trade, what the import does. `existing` is the journal's rows before the import. */
export function planJournalImport<E extends ImportableTrade & { id: string }, T extends ImportableTrade>(existing: E[], parsed: T[]): ImportAction<E>[] {
  const known = new Set(existing.map(importFingerprint));
  const openByEntry = new Map<string, E[]>();
  for (const e of existing) {
    if (e.status !== 'open') continue;
    const k = entryFingerprint(e);
    const list = openByEntry.get(k);
    if (list) list.push(e); else openByEntry.set(k, [e]);
  }
  // Closed rows the expiry rule wrote, by opening identity.
  const expiredByEntry = new Map<string, E[]>();
  for (const e of existing) {
    if (e.status !== 'closed' || !parseExpiryMarker(e.notes)) continue;
    const k = entryFingerprint(e);
    const list = expiredByEntry.get(k);
    if (list) list.push(e); else expiredByEntry.set(k, [e]);
  }
  return parsed.map((t) => {
    const key = importFingerprint(t);
    const mk = t.status === 'closed' ? parseExpiryMarker(t.notes) : null;
    if (mk) {
      const hit = expiredByEntry.get(entryFingerprint(t))?.shift();
      if (hit) {
        known.add(key);
        const had = parseExpiryMarker(hit.notes)!;
        const differs = had.source !== mk.source || Math.abs(had.px - mk.px) >= 0.005 || had.approximate !== mk.approximate;
        const downgrade = had.source === 'intrinsic' && mk.source !== 'intrinsic';
        if (!differs || downgrade || !resettleEligible(hit as never)) return { kind: 'duplicate' };
        return { kind: 'resettle', existing: hit };
      }
    }
    if (known.has(key)) return { kind: 'duplicate' };
    known.add(key);
    if (t.status === 'closed') {
      const list = openByEntry.get(entryFingerprint(t));
      const hit = list?.shift();
      if (hit) return { kind: 'close', existing: hit };
    }
    return { kind: 'insert' };
  });
}
