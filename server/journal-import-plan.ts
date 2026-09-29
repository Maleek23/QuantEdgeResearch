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
 *   • 'insert'    — new.
 */

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

export type ImportAction<E> = { kind: 'duplicate' } | { kind: 'insert' } | { kind: 'close'; existing: E };

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
  return parsed.map((t) => {
    const key = importFingerprint(t);
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
