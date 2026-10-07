/**
 * Reads the managed-exit replay ledger research/managed-exit-replay.ts writes
 * (--out, default /tmp/nexus-managed-replay.json; override MANAGED_REPLAY_LEDGER).
 * Read-only, cached by mtime. Missing / unreadable → null: the journal then has
 * no Managed view and no call-accuracy headline, and says so.
 *
 * The ledger is a SEPARATE, labelled view ("replayed with current exit rules —
 * not live fills"): it never changes a recorded row's P&L. It adds, per idea,
 * `managed` (the replayed exit), `peak` (MFE with time) and `call` (call
 * accuracy, shared/call-accuracy.ts).
 */
import fs from 'node:fs';
import type { DeskCall, DeskManaged, DeskPeak } from '@shared/desk-view';
import { CALL_ACCURACY_DEFINITION, splitHalves, summarizeCalls, type CallAccuracyHeadline, type CallResult, type CallSummary } from '@shared/call-accuracy';

export const DEFAULT_MANAGED_LEDGER_PATH = '/tmp/nexus-managed-replay.json';

export interface ManagedLedgerEntry { managed: DeskManaged; peak: DeskPeak; call: DeskCall; publishedAt: string }
export interface ManagedLedger {
  asOf: string;
  path: string;
  policyLabel: string | null;
  byId: Map<string, ManagedLedgerEntry>;
  /** Call accuracy over every idea in the ledger (headline; n and date range included). */
  calls: { overall: CallSummary; firstHalf: CallSummary; secondHalf: CallSummary };
}

const CALL_RESULTS = new Set<CallResult>(['win', 'loss', 'no_result', 'pending', 'not_triggered']);
let cache: { path: string; mtimeMs: number; ledger: ManagedLedger } | null = null;
const numOrNull = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** Parse a ledger object (exported for tests). */
export function parseManagedLedger(raw: any, path: string, mtimeMs: number): ManagedLedger {
  const byId = new Map<string, ManagedLedgerEntry>();
  for (const e of Array.isArray(raw?.ideas) ? raw.ideas : []) {
    if (!e || typeof e.id !== 'string') continue;
    const m = e.managed ?? {};
    const status = m.status === 'closed' || m.status === 'open' || m.status === 'skipped' ? m.status : 'skipped';
    const callResult: CallResult = CALL_RESULTS.has(e.call?.result) ? e.call.result : 'no_result';
    byId.set(e.id, {
      publishedAt: String(e.publishedAt ?? ''),
      managed: {
        status, pnlUnit: status === 'closed' ? numOrNull(m.pnlUnit) : null, rMultiple: numOrNull(m.r), exitAt: typeof m.exitAt === 'string' ? m.exitAt : null,
        exitPx: numOrNull(m.exitPx), exitReason: String(m.exitReason ?? ''), entryPremium: numOrNull(m.entryPremium), premiumStop: numOrNull(m.premiumStop),
      },
      peak: {
        underlying: e.peak?.underlying && numOrNull(e.peak.underlying.px) != null
          ? { px: e.peak.underlying.px, at: String(e.peak.underlying.at), r: numOrNull(e.peak.underlying.r), pct: numOrNull(e.peak.underlying.pct) } : null,
        premium: e.peak?.premium && numOrNull(e.peak.premium.px) != null
          ? { px: e.peak.premium.px, at: String(e.peak.premium.at), pct: numOrNull(e.peak.premium.pct) } : null,
        unitPnl: numOrNull(e.peak?.unitPnl),
      },
      call: { result: callResult, at: typeof e.call?.at === 'string' ? e.call.at : null, winKind: e.call?.winKind === 'T1' || e.call?.winKind === '1R' ? e.call.winKind : null, winLevel: numOrNull(e.call?.winLevel) },
    });
  }
  const items = [...byId.values()].map((v) => ({ result: v.call.result, publishedAt: v.publishedAt }));
  const [h1, h2] = splitHalves(items.filter((x) => x.result === 'win' || x.result === 'loss'));
  return {
    asOf: String(raw?.generatedAt ?? new Date(mtimeMs).toISOString()), path,
    policyLabel: typeof raw?.summary?.policyLabel === 'string' ? raw.summary.policyLabel : null,
    byId,
    calls: { overall: summarizeCalls(items), firstHalf: summarizeCalls(h1), secondHalf: summarizeCalls(h2) },
  };
}

export function loadManagedLedger(): ManagedLedger | null {
  const path = process.env.MANAGED_REPLAY_LEDGER || DEFAULT_MANAGED_LEDGER_PATH;
  try {
    const st = fs.statSync(path);
    if (cache && cache.path === path && cache.mtimeMs === st.mtimeMs) return cache.ledger;
    const ledger = parseManagedLedger(JSON.parse(fs.readFileSync(path, 'utf8')), path, st.mtimeMs);
    cache = { path, mtimeMs: st.mtimeMs, ledger };
    return ledger;
  } catch {
    return null;
  }
}

/** Desk rows (`desk:<ideaId>`) + the ledger's managed / peak / call. Rows not in the ledger are returned unchanged. */
export function attachManagedReplay<T extends { id: string }>(rows: T[], ledger: ManagedLedger | null = loadManagedLedger()): T[] {
  if (!ledger) return rows;
  return rows.map((r) => {
    const e = ledger.byId.get(r.id.startsWith('desk:') ? r.id.slice(5) : r.id);
    return e ? { ...r, managed: e.managed, peak: e.peak, call: e.call } : r;
  });
}

/** Headline payload (Track record, landing): call accuracy with n and date range, or null without a ledger. */
export function callAccuracyHeadline(ledger: ManagedLedger | null = loadManagedLedger()): CallAccuracyHeadline | null {
  if (!ledger) return null;
  return { ...ledger.calls, ledgerAsOf: ledger.asOf, definition: CALL_ACCURACY_DEFINITION };
}
