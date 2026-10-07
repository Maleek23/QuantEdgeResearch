/**
 * Pure row mappers for the read-only journal books (no DB import, so the
 * journal tests can exercise them): one published trade idea → one journal row.
 */
import { afterStopLabel, parseAfterStop, isStoppedOut } from '@shared/after-stop';
import type { JournalTrade } from '@shared/schema';
import type { DeskUnverifiedItem, DeskVerificationMeta } from '@shared/journal-sources';
import { isUnmeasuredExpiry } from '@shared/constants';
import { isHitTimeUnknown, unresolvedExitLabel } from '@shared/exit-hit-time';
import { captureRatio } from '@shared/exit-policy';
import {
  DESK_BUG_CLASSES, deskIntegrityFlags, failsIntegrity, findDuplicates, type DeskBugClass, type DeskIntegrityFlag,
} from '@shared/desk-integrity';
import { readPlanSnapshot } from '@shared/plan-snapshot';
import { gradeIdeaRowAtPublish } from '@shared/nexus-grade';

/** The journal wire row (client/src/lib/journal/types.ts JournalTradeRow). */
export type JournalWireRow = Pick<JournalTrade,
  'id' | 'symbol' | 'assetType' | 'direction' | 'optionType' | 'strikePrice' | 'expiryDate' | 'quantity' | 'entryPrice' |
  'exitPrice' | 'fees' | 'entryTime' | 'exitTime' | 'holdingMinutes' | 'realizedPnL' | 'realizedPnLPercent' | 'grossPnL' |
  'status' | 'outcome' | 'notes' | 'emotion' | 'setupType' | 'mistakeTag' | 'rating' | 'screenshot' | 'importBatchId'
> & {
  broker: string;
  userId?: string;
  /** Personal / trader books: 'quantedge_idea' = taken from a NEXUS idea ("I took this"); 'own_idea' = the trader's own. */
  origin?: 'own_idea' | 'quantedge_idea';
  /** Bot book only: the run (paper portfolio) the fill belongs to. */
  runId?: string | null;
  runLabel?: string | null;
  /** Open bot rows: the last mark and when it was taken — never a 0 standing in for "unknown". */
  mark?: { price: number; asOf: string; unrealizedPnL: number } | null;
  /**
   * Desk rows: set when a target/stop exit's time is the tracker cycle that
   * graded it, not the bar that touched — "resolved at 11:40 ET (hit time unknown)".
   */
  exitTimeNote?: string | null;
  /**
   * Desk rows, closed: realized underlying move ÷ the best favourable underlying
   * move while open (shared/exit-policy.ts captureRatio; docs/EXIT_RULE_REPLAY.md).
   */
  captureRatio?: number | null;
  /**
   * Desk rows, stopped out: what the underlying did next inside the hold window —
   * "stopped · later reached T1 at 11:42" (shared/after-stop.ts, after-close job).
   * Hindsight beside the outcome; the row stays a loss.
   */
  afterStop?: string | null;
  /** Desk rows: whether the recorded P&L is verified, only integrity-checked, or unverified (and why). */
  verification?: DeskVerification;
  /** Bot book only: whether option P&L reconciles to its saved execution/settlement evidence. */
  measurementStatus?: 'pending' | 'verified' | 'unverified' | 'not_applicable';
  measurementNote?: string | null;
};

/**
 * verified    an independent bar recomputation (research/verify-nexus-book.ts ledger) matched it
 * checked     passes every row-level integrity check (shared/desk-integrity.ts); not bar-verified
 * unverified  failed a check, a duplicate, or the bar recomputation disagreed / found no data —
 *             not counted in the default book
 */
export interface DeskVerification {
  status: 'verified' | 'checked' | 'unverified';
  basis: 'bars' | 'integrity';
  reasons: { code: DeskBugClass; detail: string }[];
  recordedPnL: number | null;
  recomputedPnL: number | null;
}

export interface DeskLedgerEntry {
  verdict: 'VERIFIED' | 'MISMATCH' | 'UNVERIFIABLE';
  recordedPnL: number | null;
  recomputedPnL: number | null;
  bugClass: string | null;
  reason: string | null;
}
export interface DeskLedger { asOf: string; path: string; byId: Map<string, DeskLedgerEntry> }

export const r2 = (v: number) => Math.round(v * 100) / 100;
export const minutesBetween = (a: string, b: string | null | undefined) => {
  if (!b) return null;
  const d = (Date.parse(b) - Date.parse(a)) / 60_000;
  return Number.isFinite(d) ? Math.max(0, Math.round(d)) : null;
};
export const outcomeOf = (pnl: number | null): JournalTrade['outcome'] =>
  pnl == null ? 'open' : Math.abs(pnl) < 0.005 ? 'breakeven' : pnl > 0 ? 'win' : 'loss';
export const assetOf = (a: string | null | undefined): JournalTrade['assetType'] =>
  a === 'option' ? 'option' : a === 'crypto' ? 'crypto' : a === 'future' || a === 'futures' ? 'future' : 'stock';


// ─── Trade desk: every published idea, scored as a trade ────

/** Unit size for ideas, which carry no position size of their own. */
export const DESK_STOCK_NOTIONAL = 1000;

export interface DeskIdea {
  id: string;
  symbol: string;
  assetType: string;
  direction: string;
  entryPrice: number;
  targetPrice: number | null;
  stopLoss: number | null;
  riskRewardRatio: number | null;
  optionType: string | null;
  strikePrice: number | null;
  expiryDate: string | null;
  entryPremium: number | null;
  exitPremium: number | null;
  /** Premium basis: historical contract trade print, tracker-pass fallback, or withheld. */
  exitPremiumBasis?: 'touch_bar' | 'pass' | 'withheld' | null;
  optionPercentGain: number | null;
  outcomeNotes?: string | null;
  exitPrice: number | null;
  percentGain: number | null;
  outcomeStatus: string | null;
  resolutionReason: string | null;
  exitDate: string | null;
  timestamp: string;
  source: string | null;
  catalyst: string | null;
  genConvictionBand: string | null;
  /** Read by the NEXUS grade at publish (shared/nexus-grade.ts gradeIdeaRowAtPublish). */
  genConvictionScore?: number | null;
  genScoringLayers?: unknown;
  generationTimestamp?: string | null;
  holdingPeriod?: string | null;
  exitBy?: string | null;
  /** convergenceSignalsJson.nexusGradeAtPublish, when the board logged it. */
  nexusGradeAtPublish?: { letter?: string; score?: number } | null;
  /** The [exit-time:…] tag from outcomeNotes (bar_hit | deadline | live), when present. */
  exitTimeSource?: string | null;
  /** Tracker's peak / trough of the UNDERLYING while the idea was open. */
  highestPriceReached?: number | null;
  lowestPriceReached?: number | null;
  /** Immutable levels and contract terms captured at first publication. */
  convergenceSignalsJson?: unknown;
  /**
   * convergence_signals_json.executionAudit.state (shared/oracle-lifecycle.ts).
   * When the loader supplies it, an OPEN idea counts as an open trade only once
   * it is triggered/executed — a pending trigger is "awaiting entry", no P&L.
   */
  executionState?: string | null;
  /** Provenance: synthetic backfill / replay rows are not live publications. */
  dataSourceUsed?: string | null;
  sessionContext?: string | null;
}

/** States in which a published plan has actually been entered. */
export const ENTERED_STATES = new Set(['triggered', 'executed', 'closed']);
export const AWAITING_ENTRY_REASON = 'awaiting entry — trigger not hit yet (not an open trade, no P&L)';

export type DeskMapResult = { row: JournalWireRow } | { excluded: string };

/**
 * One idea → one journal row. Options: 1 contract at the recorded entry premium,
 * exited at the recorded exit premium (or entry × the recorded contract %).
 * Stock/crypto/futures: $1,000 notional at the published entry. Anything that
 * cannot be scored is returned as an exclusion reason — never as a 0 P&L.
 */
export function mapDeskIdea(i: DeskIdea): DeskMapResult {
  const snapshot = readPlanSnapshot(i.convergenceSignalsJson);
  const planEntry = snapshot?.entryPrice ?? i.entryPrice;
  const planTarget = snapshot?.targetPrice ?? i.targetPrice;
  const planStop = snapshot?.stopLoss ?? i.stopLoss;
  const planRr = snapshot?.riskRewardRatio ?? i.riskRewardRatio;
  const planDirection = snapshot?.direction ?? i.direction;
  const planPremium = snapshot?.entryPremium ?? i.entryPremium;
  const planOptionType = snapshot?.optionType ?? i.optionType;
  const planStrike = snapshot?.strikePrice ?? i.strikePrice;
  const planExpiry = snapshot?.expiryDate ?? i.expiryDate;
  const status = (i.outcomeStatus ?? 'open').trim().toLowerCase();
  if ((i.resolutionReason ?? '').startsWith('missed_entry')) return { excluded: 'entry never triggered (missed entry window)' };
  const resolved = status !== 'open' && status !== '';
  // Audit 2026-10-01 P0 #14: untriggered ideas were counted as open trades at
  // entry and then live-marked. No recorded trigger → awaiting entry.
  if (!resolved && 'executionState' in i && !ENTERED_STATES.has(String(i.executionState ?? ''))) {
    return { excluded: AWAITING_ENTRY_REASON };
  }
  if (resolved && isUnmeasuredExpiry(i)) return { excluded: 'expired without a measured exit' };
  const option = i.assetType === 'option';
  // Operator decision 2026-10-06: a contract exit priced at a LATER tracker pass is
  // not the outcome-time price (live, not carried) — no journal P&L from it.
  if (option && resolved && i.exitPremiumBasis === 'pass') {
    return { excluded: 'option exit premium came from a later tracker pass, not the outcome time' };
  }
  const short = planDirection === 'short';

  let entry: number, qty: number, exit: number | null = null, pnl: number | null = null, pct: number | null = null;
  if (option) {
    if (!(planPremium != null && planPremium > 0)) return { excluded: 'option idea without a recorded entry premium' };
    entry = planPremium;
    qty = 1;
    if (resolved) {
      exit = i.exitPremium != null && i.exitPremium >= 0 ? i.exitPremium
        : i.optionPercentGain != null ? Math.max(0, entry * (1 + i.optionPercentGain / 100)) : null;
      if (exit == null) return { excluded: 'resolved without a contract exit premium' };
      pnl = (exit - entry) * 100;
      pct = ((exit - entry) / entry) * 100;
    }
  } else {
    if (!(planEntry > 0)) return { excluded: 'no entry price' };
    entry = planEntry;
    qty = DESK_STOCK_NOTIONAL / entry;
    if (resolved) {
      if (i.exitPrice != null && i.exitPrice > 0) pct = ((i.exitPrice - entry) / entry) * 100 * (short ? -1 : 1);
      else if (i.percentGain != null) pct = i.percentGain;
      if (pct == null) return { excluded: 'resolved without an exit price or % result' };
      exit = i.exitPrice != null && i.exitPrice > 0 ? i.exitPrice : entry * (1 + (short ? -1 : 1) * (pct / 100));
      pnl = (pct / 100) * DESK_STOCK_NOTIONAL;
    }
  }
  const exitTime = resolved ? i.exitDate ?? null : null;
  const exitMs = exitTime ? Date.parse(exitTime) : NaN;
  const exitTimeNote = exitTime && Number.isFinite(exitMs) && isHitTimeUnknown(status, i.exitTimeSource)
    ? unresolvedExitLabel(exitMs) : null;
  const plan = [
    `Published ${planDirection.toUpperCase()} ${i.symbol}${option ? ` ${planStrike ?? ''}${(planOptionType ?? '').charAt(0).toUpperCase()} ${planExpiry?.slice(0, 10) ?? ''}` : ''}`.trim(),
    `plan${snapshot ? ` (${snapshot.version} · ${snapshot.capturedAt})` : ''}: entry ${planEntry} · target ${planTarget ?? '—'} · stop ${planStop ?? '—'}${planRr ? ` · R:R ${planRr.toFixed(1)}` : ''}`,
    (() => {
      // The ONE grade, as published: the logged stamp when present, else rebuilt
      // from the generation-time evidence at first board surfacing.
      const logged = i.nexusGradeAtPublish && i.nexusGradeAtPublish.letter && Number.isFinite(Number(i.nexusGradeAtPublish.score))
        ? { letter: i.nexusGradeAtPublish.letter, score: Number(i.nexusGradeAtPublish.score) } : null;
      const g = logged ?? (i.genConvictionScore != null ? gradeIdeaRowAtPublish({ ...i, entryPrice: planEntry, targetPrice: planTarget, stopLoss: planStop, direction: planDirection, expiryDate: planExpiry }) : null);
      return g ? `NEXUS grade at publish: ${g.letter} ${g.score} (actionability, unvalidated)` : null;
    })(),
    i.genConvictionBand ? `diagnostics (unvalidated): conviction band ${i.genConvictionBand}` : null,
    resolved ? `outcome: ${status}${i.resolutionReason ? ` (${i.resolutionReason})` : ''}` : 'still open — no live mark carried here',
    exitTimeNote ? `exit time: ${exitTimeNote} — the tracker could not find the bar that touched the ${status === 'hit_stop' ? 'stop' : 'target'}` : null,
    i.catalyst ? `catalyst: ${i.catalyst}` : null,
  ].filter(Boolean).join('\n');
  const rp = pnl == null ? null : r2(pnl);
  // Capture on the underlying (options too: exitPrice is the underlying at exit).
  const capRaw = resolved ? captureRatio({
    direction: short ? 'short' : 'long', entry: planEntry, exit: i.exitPrice,
    high: i.highestPriceReached ?? null, low: i.lowestPriceReached ?? null,
  }) : null;
  const capture = capRaw == null ? null : r2(capRaw);
  const afterStop = resolved && isStoppedOut(status)
    ? afterStopLabel(parseAfterStop(i.outcomeNotes), exitTime ? Date.parse(exitTime) : null)
    : null;
  return {
    row: {
      id: `desk:${i.id}`,
      symbol: i.symbol,
      assetType: assetOf(i.assetType),
      // Options are bought contracts (long); stock ideas keep their published side.
      direction: option ? 'long' : short ? 'short' : 'long',
      optionType: (i.optionType as 'call' | 'put' | null) ?? null,
      strikePrice: i.strikePrice ?? null,
      expiryDate: i.expiryDate ?? null,
      quantity: Math.round(qty * 10_000) / 10_000,
      entryPrice: entry,
      exitPrice: exit == null ? null : Math.round(exit * 10_000) / 10_000,
      fees: 0,
      entryTime: i.timestamp,
      exitTime,
      holdingMinutes: minutesBetween(i.timestamp, exitTime),
      realizedPnL: rp,
      realizedPnLPercent: pct == null ? null : r2(pct),
      grossPnL: rp,
      status: resolved ? 'closed' : 'open',
      outcome: outcomeOf(rp),
      notes: plan,
      emotion: null,
      setupType: i.source ?? null,
      mistakeTag: null,
      rating: null,
      screenshot: null,
      importBatchId: null,
      broker: 'trade-desk',
      ...(exitTimeNote ? { exitTimeNote } : {}),
      ...(capture != null ? { captureRatio: capture } : {}),
      ...(afterStop ? { afterStop } : {}),
    },
  };
}

// ─── NEXUS book verification (audit 2026-10-06) ─────────────

const money = (v: number | null) => v == null ? '—' : `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export interface DeskVerifyResult {
  /** Rows the default book shows: open rows, verified + integrity-checked closed rows. */
  counted: JournalWireRow[];
  /** Closed rows whose recorded P&L is not counted, labelled. */
  unverified: JournalWireRow[];
}

/**
 * Label every mapped desk row and split off the closed rows whose recorded P&L
 * cannot be counted: a failed integrity check (shared/desk-integrity.ts), a
 * duplicate of an earlier open position, or — when a bar-level ledger exists —
 * a MISMATCH / UNVERIFIABLE verdict. Never edits P&L; it only decides what is
 * counted and says why.
 */
export function verifyDeskRows(pairs: { idea: DeskIdea; row: JournalWireRow }[], ledger: DeskLedger | null): DeskVerifyResult {
  const closed = pairs.filter((p) => p.row.status === 'closed');
  const dups = findDuplicates(closed.map(({ idea, row }) => ({
    id: idea.id, symbol: idea.symbol, assetType: idea.assetType, direction: idea.direction, optionType: idea.optionType,
    strikePrice: idea.strikePrice, expiryDate: idea.expiryDate, entryMs: Date.parse(row.entryTime),
    exitMs: row.exitTime ? Date.parse(row.exitTime) : null,
  })));
  const counted: JournalWireRow[] = [];
  const unverified: JournalWireRow[] = [];
  const pick = (fs: DeskIntegrityFlag[], sev?: 'fail' | 'caveat') =>
    fs.filter((f) => !sev || f.severity === sev).map(({ code, detail }) => ({ code, detail }));
  for (const { idea, row } of pairs) {
    const flags: DeskIntegrityFlag[] = deskIntegrityFlags(idea);
    const isClosed = row.status === 'closed';
    const dupOf = isClosed ? dups.get(idea.id) : undefined;
    if (dupOf) flags.push({ code: 'duplicate', severity: 'fail', detail: `same position as desk:${dupOf}` });
    const entry = isClosed ? ledger?.byId.get(idea.id) : undefined;
    const recorded = row.realizedPnL ?? null;
    let v: DeskVerification;
    if (dupOf) {
      v = { status: 'unverified', basis: 'integrity', reasons: pick(flags, 'fail'), recordedPnL: recorded, recomputedPnL: null };
    } else if (entry?.verdict === 'VERIFIED') {
      v = { status: 'verified', basis: 'bars', reasons: pick(flags, 'caveat'), recordedPnL: recorded, recomputedPnL: entry.recomputedPnL };
    } else if (entry) {
      const code: DeskBugClass = entry.verdict === 'MISMATCH' ? 'bar_mismatch' : 'bar_unverifiable';
      const detail = [entry.bugClass, entry.reason].filter(Boolean).join(': ') || DESK_BUG_CLASSES[code];
      v = { status: 'unverified', basis: 'bars', reasons: [{ code, detail }, ...pick(flags, 'fail')], recordedPnL: recorded, recomputedPnL: entry.recomputedPnL };
    } else {
      const fail = isClosed && failsIntegrity(flags);
      v = { status: fail ? 'unverified' : 'checked', basis: 'integrity', reasons: pick(flags, fail ? 'fail' : undefined), recordedPnL: recorded, recomputedPnL: null };
    }
    const label = v.status === 'verified'
      ? `Verification: VERIFIED against market bars${ledger ? ` (ledger ${ledger.asOf.slice(0, 16)}Z)` : ''}${v.recomputedPnL != null ? ` — recomputed ${money(v.recomputedPnL)}` : ''}`
      : v.status === 'checked'
        ? `Verification: integrity-checked, not bar-verified${v.reasons.length ? ` — ${v.reasons.map((r) => `${r.code} (${r.detail})`).join('; ')}` : ''}`
        : `Verification: UNVERIFIED — recorded ${money(recorded)}${v.recomputedPnL != null ? `, recomputed ${money(v.recomputedPnL)}` : ''}, not counted: ${v.reasons.map((r) => `${r.code} (${r.detail})`).join('; ')}`;
    const labelled: JournalWireRow = { ...row, verification: v, notes: isClosed || v.reasons.length ? `${row.notes ?? ''}\n${label}`.trim() : row.notes };
    if (isClosed && v.status === 'unverified') unverified.push(labelled);
    else counted.push(labelled);
  }
  return { counted, unverified };
}

/** The basis-line summary of a verifyDeskRows split (shared/journal-sources.ts DeskVerificationMeta). */
export function deskVerificationMeta(res: DeskVerifyResult, ledger: DeskLedger | null, includeUnverified: boolean): DeskVerificationMeta {
  const sum = (xs: (number | null | undefined)[]) => r2(xs.reduce<number>((s, x) => s + (typeof x === 'number' && Number.isFinite(x) ? x : 0), 0));
  const closedCounted = res.counted.filter((r) => r.status === 'closed');
  const verified = closedCounted.filter((r) => r.verification?.status === 'verified');
  const checked = closedCounted.filter((r) => r.verification?.status !== 'verified');
  const byReason = new Map<string, { count: number; recordedPnL: number }>();
  for (const r of res.unverified) {
    const code = r.verification?.reasons[0]?.code ?? 'unknown';
    const cur = byReason.get(code) ?? { count: 0, recordedPnL: 0 };
    cur.count++;
    cur.recordedPnL = r2(cur.recordedPnL + (r.realizedPnL ?? 0));
    byReason.set(code, cur);
  }
  const rows: DeskUnverifiedItem[] = [...res.unverified]
    .sort((a, b) => Math.abs(b.realizedPnL ?? 0) - Math.abs(a.realizedPnL ?? 0))
    .slice(0, 200)
    .map((r) => ({
      id: r.id, symbol: r.symbol, entryTime: r.entryTime, recordedPnL: r.realizedPnL ?? null,
      recomputedPnL: r.verification?.recomputedPnL ?? null, reasons: r.verification?.reasons ?? [],
    }));
  return {
    ledger: ledger ? { asOf: ledger.asOf, path: ledger.path } : null,
    counted: { verified: verified.length, checked: checked.length, verifiedPnL: sum(verified.map((r) => r.realizedPnL)), checkedPnL: sum(checked.map((r) => r.realizedPnL)) },
    unverified: {
      count: res.unverified.length,
      recordedPnL: sum(res.unverified.map((r) => r.realizedPnL)),
      byReason: [...byReason.entries()].map(([code, v]) => ({ code, label: (DESK_BUG_CLASSES as Record<string, string>)[code] ?? code, ...v }))
        .sort((a, b) => Math.abs(b.recordedPnL) - Math.abs(a.recordedPnL)),
      rows,
    },
    includeUnverified,
  };
}

