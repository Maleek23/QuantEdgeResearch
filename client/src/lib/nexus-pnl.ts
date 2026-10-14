/**
 * NEXUS P&L on the client — budget toggle, batched contract marks, and the
 * pick → P&L adapter (rules: shared/nexus-pnl.ts).
 *
 *   usePnlBudget()      $500 default / $1,000, one setting for every NEXUS surface (localStorage, synced across tools)
 *   useNexusMarks(keys) POST /api/nexus/marks (server/option-marks-batch.ts) — batched + cached server side;
 *                       keys the server could not mark inside its budget come back `pending` and are
 *                       re-asked after 2.5 s (progressive fill: "loading mark" per row, never a blank)
 *   pickPnl(...)        a board pick (or a stored idea / resolved row) → NexusPnl
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_PNL_BUDGET, PNL_BUDGETS, budgetExitPremium, nexusPnl, pnlStateOf, tradableContract,
  type BudgetContractLike, type MarkLike, type NexusPnl, type PnlBudget, type PremiumPoint,
} from '@shared/nexus-pnl';

const BUDGET_KEY = 'qe-nexus-pnl-budget';
const BUDGET_EVENT = 'qe-nexus-pnl-budget';

function readBudget(): PnlBudget {
  try {
    const v = Number(localStorage.getItem(BUDGET_KEY));
    return (PNL_BUDGETS as readonly number[]).includes(v) ? (v as PnlBudget) : DEFAULT_PNL_BUDGET;
  } catch { return DEFAULT_PNL_BUDGET; }
}

/** The P&L budget every NEXUS surface sizes at ($500 default, $1,000 option). */
export function usePnlBudget(): [PnlBudget, (b: PnlBudget) => void] {
  const [b, setB] = useState<PnlBudget>(readBudget);
  useEffect(() => {
    const on = () => setB(readBudget());
    window.addEventListener(BUDGET_EVENT, on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener(BUDGET_EVENT, on); window.removeEventListener('storage', on); };
  }, []);
  const set = (v: PnlBudget) => {
    try { localStorage.setItem(BUDGET_KEY, String(v)); } catch { /* storage blocked */ }
    setB(v);
    window.dispatchEvent(new Event(BUDGET_EVENT));
  };
  return [b, set];
}

export interface MarksPayload {
  marks: Record<string, MarkLike & { basis?: string }>;
  pending: string[];
  unquoted?: string[];
  asOf: string;
  timing: { totalMs: number; batchMs: number | null; keys: number; cached: number; batched: number; perKey: number; pending: number } | null;
}

export const MARKS_REFRESH_MS = 30_000;
export const MARKS_PENDING_RETRY_MS = 2_500;

/** Contract marks for a set of instrument keys (one request for the whole board). */
export function useNexusMarks(keys: readonly string[]) {
  const sorted = useMemo(() => Array.from(new Set(keys)).sort(), [keys]);
  const q = useQuery<MarksPayload & { clientMs: number }>({
    queryKey: ['/api/nexus/marks', sorted.join(',')],
    queryFn: async () => {
      const t0 = performance.now();
      const r = await fetch('/api/nexus/marks', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contracts: sorted }),
      });
      if (!r.ok) throw new Error(`marks HTTP ${r.status}`);
      const body = (await r.json()) as MarksPayload;
      return { ...body, clientMs: Math.round(performance.now() - t0) };
    },
    enabled: sorted.length > 0,
    staleTime: MARKS_REFRESH_MS - 1_000,
    refetchInterval: (s) => ((s.state.data?.pending?.length ?? 0) > 0 ? MARKS_PENDING_RETRY_MS : MARKS_REFRESH_MS),
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
    retry: 1,
  });
  return useMemo(() => {
    const marks = q.data?.marks ?? {};
    const pending = new Set(q.data?.pending ?? []);
    /** A key's mark, 'loading' while in flight / pending, or null when no venue quoted it. */
    const markOf = (key: string): MarkLike | 'loading' | null => {
      if (marks[key]) return marks[key];
      if (pending.has(key) || (q.isLoading && sorted.includes(key)) || (!q.data && !q.isError)) return 'loading';
      return null;
    };
    return { markOf, data: q.data, isError: q.isError, error: q.error as Error | null };
  }, [q.data, q.isLoading, q.isError, q.error, sorted]);
}

/** Marks the board already fetched — the inline / tool detail reuses them instead of a second request. */
export const NexusMarksContext = createContext<((key: string) => MarkLike | 'loading' | null) | null>(null);
export function useBoardMarkOf() { return useContext(NexusMarksContext); }

const ET_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Pick-like shape every NEXUS surface can supply. */
export interface PnlPickLike {
  ideaId?: string;
  symbol: string;
  assetType?: string | null;
  optionType?: string | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  entryPremium?: number | null;
  premiumStop?: number | null;
  optionDte?: number | null;
  lifecycleState?: string | null;
  isBotHeld?: boolean;
  budgetContract?: BudgetContractLike | null;
}

export interface PnlRecordLike {
  outcomeStatus?: string | null;
  resolutionReason?: string | null;
  exitPremium?: number | null;
  exitDate?: string | null;
  optionPercentGain?: number | null;
  entryPremium?: number | null;
  peak?: { premium: number; atMs?: number | null; at?: string | null } | null;
  trough?: { premium: number; atMs?: number | null } | null;
  /** Primary contract's last 1-min trade bar (idea detail premium read) — the mark when nothing quotes. */
  lastTrade?: { premium: number; atMs: number | null; source?: string | null } | null;
}

export function isZeroDtePick(p: PnlPickLike, nowMs: number): boolean {
  if (p.optionDte === 0) return true;
  const exp = String(p.expiryDate ?? '').slice(0, 10);
  return !!exp && exp === ET_DAY.format(new Date(nowMs));
}

const msOf = (x: { atMs?: number | null; at?: string | null } | null | undefined) => {
  if (!x) return null;
  if (x.atMs != null && Number.isFinite(x.atMs)) return x.atMs;
  const t = Date.parse(String(x.at ?? ''));
  return Number.isFinite(t) ? t : null;
};

/** A NEXUS setup's P&L at the budget, from its pick (+ stored record when off the board / resolved). */
export function pickPnl(pick: PnlPickLike, budget: number, markOf: ((key: string) => MarkLike | 'loading' | null) | null, rec: PnlRecordLike | null, nowMs: number): NexusPnl {
  const tradable = tradableContract({ ...pick, zeroDte: isZeroDtePick(pick, nowMs) }, budget);
  const reason = String(rec?.resolutionReason ?? '');
  // No fill / superseded is not a trade — no P&L (same as the journal: never booked).
  let state = pnlStateOf({ lifecycleState: pick.lifecycleState, outcomeStatus: rec?.outcomeStatus, isBotHeld: pick.isBotHeld });
  if (state === 'resolved' && (reason.startsWith('missed_entry') || reason.startsWith('superseded'))) state = 'waiting';
  let exit: PremiumPoint | null = null;
  let peak: PremiumPoint | null = null;
  let trough: PremiumPoint | null = null;
  if (tradable.ok && tradable.basis === 'budget') {
    const bx = budgetExitPremium(pick.budgetContract);
    if (bx) exit = { premium: bx.premium, atMs: bx.atMs };
    const bp = pick.budgetContract?.tracking?.peak;
    if (bp) peak = { premium: bp.premium, atMs: bp.atMs };
  } else if (tradable.ok) {
    const exitMs = Date.parse(String(rec?.exitDate ?? ''));
    const ep = rec?.exitPremium ?? (rec?.optionPercentGain != null && tradable.entryPremium > 0 ? Math.round(tradable.entryPremium * (1 + rec.optionPercentGain / 100) * 100) / 100 : null);
    if (ep != null) exit = { premium: ep, atMs: Number.isFinite(exitMs) ? exitMs : null };
    if (rec?.peak) peak = { premium: rec.peak.premium, atMs: msOf(rec.peak) };
    if (rec?.trough) trough = { premium: rec.trough.premium, atMs: msOf(rec.trough) };
  }
  let mark: MarkLike | 'loading' | null = state === 'open' && tradable.ok ? (markOf ? markOf(tradable.key) : 'loading') : null;
  // No live quote → the contract's last trade (labelled 'last-trade', never shown as live):
  // budget contract from its own tracking, primary from the idea's 1-min bars.
  if (state === 'open' && tradable.ok && mark === null) {
    const tr = pick.budgetContract?.tracking;
    const lt = tradable.basis === 'budget'
      ? (tr?.lastMark != null && tr.lastMark > 0 ? { premium: tr.lastMark, atMs: tr.lastMarkAt ?? null, source: 'budget contract tracking' } : null)
      : (rec?.lastTrade && rec.lastTrade.premium > 0 ? rec.lastTrade : null);
    if (lt) mark = { price: lt.premium, asOf: lt.atMs != null ? new Date(lt.atMs).toISOString() : '', delayed: true, source: lt.source ?? 'last 1m bar', kind: 'last-trade' };
  }
  return nexusPnl({ state, tradable, mark, exit, peak, trough, nowMs });
}
