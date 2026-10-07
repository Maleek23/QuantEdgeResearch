/**
 * Reads the bar-level verification ledger research/verify-nexus-book.ts writes
 * (--out, default /tmp/nexus-book-verify.json; override NEXUS_BOOK_VERIFY_LEDGER).
 * Read-only, cached by mtime. Missing / unreadable ledger → null (the book then
 * falls back to the row-level integrity checks and says so).
 */
import fs from 'node:fs';
import type { DeskLedger, DeskLedgerEntry } from './journal-row-maps';

export const DEFAULT_LEDGER_PATH = '/tmp/nexus-book-verify.json';
let cache: { path: string; mtimeMs: number; ledger: DeskLedger } | null = null;

export function loadDeskVerifyLedger(): DeskLedger | null {
  const path = process.env.NEXUS_BOOK_VERIFY_LEDGER || DEFAULT_LEDGER_PATH;
  try {
    const st = fs.statSync(path);
    if (cache && cache.path === path && cache.mtimeMs === st.mtimeMs) return cache.ledger;
    const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
    const list: any[] = Array.isArray(raw?.trades) ? raw.trades : [];
    const byId = new Map<string, DeskLedgerEntry>();
    for (const t of list) {
      if (!t || typeof t.id !== 'string') continue;
      const verdict = t.verdict === 'VERIFIED' || t.verdict === 'MISMATCH' || t.verdict === 'UNVERIFIABLE' ? t.verdict : null;
      if (!verdict) continue;
      byId.set(t.id, {
        verdict,
        recordedPnL: typeof t.recordedPnL === 'number' ? t.recordedPnL : null,
        recomputedPnL: typeof t.recomputedPnL === 'number' ? t.recomputedPnL : null,
        bugClass: typeof t.bugClass === 'string' ? t.bugClass : null,
        reason: typeof t.reason === 'string' ? t.reason : null,
      });
    }
    const ledger: DeskLedger = { asOf: String(raw?.generatedAt ?? new Date(st.mtimeMs).toISOString()), path, byId };
    cache = { path, mtimeMs: st.mtimeMs, ledger };
    return ledger;
  } catch {
    return null;
  }
}
