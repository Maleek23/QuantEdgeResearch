/**
 * Reads the bar-level verification ledger research/verify-nexus-book.ts writes —
 * since 2026-10-14 refreshed NIGHTLY by server/journal-verify-job.ts (17:30 ET +
 * catch-up), not a static snapshot. Path: NEXUS_BOOK_VERIFY_LEDGER, else
 * .cache/shared/ledgers/nexus-book-verify.json, else the legacy /tmp file.
 * Also reads the retro (shares → options) ledger scripts/retro-options-convert.ts
 * writes (NEXUS_RETRO_OPTIONS_LEDGER, else .cache/shared/ledgers/nexus-retro-options.json).
 * Read-only, cached by mtime. Missing / unreadable ledger → null.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DeskLedger, DeskLedgerEntry } from './journal-row-maps';
import { readRetroLedger, type RetroRecord } from '@shared/journal-pnl-truth';

export const LEDGER_DIR = path.join(process.cwd(), '.cache', 'shared', 'ledgers');
export const DEFAULT_LEDGER_PATH = path.join(LEDGER_DIR, 'nexus-book-verify.json');
export const LEGACY_LEDGER_PATH = '/tmp/nexus-book-verify.json';
export const DEFAULT_RETRO_LEDGER_PATH = path.join(LEDGER_DIR, 'nexus-retro-options.json');

export function deskVerifyLedgerPath(): string {
  if (process.env.NEXUS_BOOK_VERIFY_LEDGER) return process.env.NEXUS_BOOK_VERIFY_LEDGER;
  return fs.existsSync(DEFAULT_LEDGER_PATH) || !fs.existsSync(LEGACY_LEDGER_PATH) ? DEFAULT_LEDGER_PATH : LEGACY_LEDGER_PATH;
}
export function retroLedgerPath(): string {
  return process.env.NEXUS_RETRO_OPTIONS_LEDGER || DEFAULT_RETRO_LEDGER_PATH;
}

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** One ledger trade → the entry the journal reads. Pure (exported for tests). */
export function ledgerEntryOf(t: any): DeskLedgerEntry | null {
  if (!t || typeof t.id !== 'string') return null;
  const verdict = t.verdict === 'VERIFIED' || t.verdict === 'MISMATCH' || t.verdict === 'UNVERIFIABLE' ? t.verdict : null;
  if (!verdict) return null;
  return {
    verdict,
    recordedPnL: num(t.recordedPnL),
    recomputedPnL: num(t.recomputedPnL),
    recomputedEntry: num(t.recomputedEntry),
    recomputedExit: num(t.recomputedExit),
    bugClass: typeof t.bugClass === 'string' ? t.bugClass : null,
    reason: typeof t.reason === 'string' ? t.reason : null,
    optionSource: typeof t.evidence?.optionSource === 'string' ? t.evidence.optionSource : null,
  };
}

let cache: { path: string; mtimeMs: number; ledger: DeskLedger } | null = null;

export function loadDeskVerifyLedger(): DeskLedger | null {
  const p = deskVerifyLedgerPath();
  try {
    const st = fs.statSync(p);
    if (cache && cache.path === p && cache.mtimeMs === st.mtimeMs) return cache.ledger;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const list: any[] = Array.isArray(raw?.trades) ? raw.trades : [];
    const byId = new Map<string, DeskLedgerEntry>();
    for (const t of list) {
      const e = ledgerEntryOf(t);
      if (e) byId.set(t.id, e);
    }
    const ledger: DeskLedger = { asOf: String(raw?.generatedAt ?? new Date(st.mtimeMs).toISOString()), path: p, byId };
    cache = { path: p, mtimeMs: st.mtimeMs, ledger };
    return ledger;
  } catch {
    return null;
  }
}

let retroCache: { path: string; mtimeMs: number; asOf: string; byId: Map<string, RetroRecord> } | null = null;

export function loadRetroOptionsLedger(): { asOf: string; path: string; byId: Map<string, RetroRecord> } | null {
  const p = retroLedgerPath();
  try {
    const st = fs.statSync(p);
    if (retroCache && retroCache.path === p && retroCache.mtimeMs === st.mtimeMs) return retroCache;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    retroCache = { path: p, mtimeMs: st.mtimeMs, asOf: String(raw?.generatedAt ?? new Date(st.mtimeMs).toISOString()), byId: readRetroLedger(raw) };
    return retroCache;
  } catch {
    return null;
  }
}
