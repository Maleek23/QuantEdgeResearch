/**
 * Pure row mappers for the read-only journal books (no DB import, so the
 * journal tests can exercise them): one published trade idea → one journal row.
 */
import { isZeroDteJournalRow, spxThesisLabel } from '@shared/zero-dte-journal';
import { afterStopLabel, parseAfterStop, isStoppedOut } from '@shared/after-stop';
import { parsePeak, peakLine } from '@shared/option-peak';
import { budgetLine, primaryLine, readBudgetContract } from '@shared/budget-contract';
import { parseRunner, runnerLine } from '@shared/runner-policy';
import type { JournalTrade } from '@shared/schema';
import type { DeskUnverifiedItem, DeskVerificationMeta } from '@shared/journal-sources';
import { isUnmeasuredExpiry } from '@shared/constants';
import { isHitTimeUnknown, unresolvedExitLabel } from '@shared/exit-hit-time';
import { captureRatio } from '@shared/exit-policy';
import {
  DESK_BUG_CLASSES, deskIntegrityFlags, failsIntegrity, findDuplicates, type DeskBugClass, type DeskIntegrityFlag,
} from '@shared/desk-integrity';
import { readPlanSnapshot } from '@shared/plan-snapshot';
import { CONTRACT_NOT_RECORDED, SHARES_IDEA_LABEL, contractGap, instrumentIntent } from '@shared/options-only';
import { gradeIdeaRowAtPublish } from '@shared/nexus-grade';
import { deskRiskBasis, type DeskCall, type DeskManaged, type DeskPeak, type DeskRiskBasis } from '@shared/desk-view';
import {
  PNL_TRUTH_VERSION, TRUTH_CLASS_LABEL, classifyClosedRow, retroLine, summarizeTruth,
  type RetroRecord, type TruthClass, type TruthLedgerEntry,
} from '@shared/journal-pnl-truth';

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
  /** Desk rows from a stock engine: "Shares idea" (shared/options-only.ts); converted rows: "Options view (rule-picked, verified)". */
  instrumentLabel?: string | null;
  /** 0DTE / index play (shared/zero-dte-journal.ts) — drives the journal's 0DTE chip. */
  zeroDte?: boolean;
  /** "SPX thesis · traded on SPY 770P" (shared/zero-dte-journal.ts spxThesisLabel). */
  thesisLabel?: string | null;
  /** Legacy shares rows converted to the rule-picked contract (shared/journal-pnl-truth.ts RetroRecord). */
  retroOption?: RetroRecord | null;
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
  /**
   * Option rows: the contract's best price after entry beside the exit —
   * "peak $5.45 at 10:12 · exit $4.22" (shared/option-peak.ts; hindsight, the P&L is the exit's).
   */
  peakLine?: string | null;
  /**
   * Option rows with a budget contract (shared/budget-contract.ts): "Primary: 11/20 1100C $39.65 (over budget)"
   * and "Budget: 10/09 1090C ×2 @ $1.93 · $386 debit · … · peak $17.30 · T1 hit".
   */
  primaryLine?: string | null;
  budgetLine?: string | null;
  /** Option rows: the recorded peak premium (number) — LiveMark.peak starts from it (server/journal-marks.ts). */
  peakPremium?: number | null;
  /** 0DTE desk rows under the runner policy: "½ at T1 $4.22 · runner $5.10 (trail …) · blended $4.66". */
  runner?: string | null;
  /** Desk rows: whether the recorded P&L is verified, only integrity-checked, or unverified (and why). */
  verification?: DeskVerification;
  /** Bot book only: whether option P&L reconciles to its saved execution/settlement evidence. */
  measurementStatus?: 'pending' | 'verified' | 'unverified' | 'not_applicable';
  measurementNote?: string | null;
  /** Desk rows: published plan levels for equal-risk re-sizing (shared/desk-view.ts, shared/position-sizing.ts). */
  riskBasis?: DeskRiskBasis | null;
  /** Desk rows: managed-exit replay, peak (MFE) and call accuracy from the replay ledger (server/managed-replay-ledger.ts). */
  managed?: DeskManaged | null;
  peak?: DeskPeak | null;
  call?: DeskCall | null;
};

/**
 * verified    an independent bar recomputation (research/verify-nexus-book.ts ledger) matched it
 * checked     passes every row-level integrity check (shared/desk-integrity.ts); not bar-verified
 * unverified  failed a check, a duplicate, or the bar recomputation disagreed / found no data —
 *             not counted in the default book
 */
export interface DeskVerification {
  /** 'verified' = in the headline (bar-verified, bar-corrected or a verified options view); else outside it. */
  status: 'verified' | 'checked' | 'unverified';
  basis: 'bars' | 'integrity' | 'retro';
  reasons: { code: DeskBugClass; detail: string }[];
  recordedPnL: number | null;
  recomputedPnL: number | null;
  /** The one P&L-truth class (shared/journal-pnl-truth.ts). */
  truth?: TruthClass;
}

export type DeskLedgerEntry = TruthLedgerEntry;
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
  /** Options-only conversion markers (shared/options-only.ts). */
  qualitySignals?: unknown;
  analysis?: string | null;
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
  // Options-only (shared/options-only.ts): an option engine's idea without a usable
  // contract — stored as shares by a legacy fallback, or missing strike/premium —
  // is listed as "contract not recorded", never scored as shares or at a made-up premium.
  const gap = contractGap(i);
  if (gap) return { excluded: `${CONTRACT_NOT_RECORDED} — ${gap}` };
  const option = i.assetType === 'option';
  const sharesIdea = instrumentIntent(i) === 'shares';
  // Operator rule 2026-10-07 (supersedes the 2026-10-06 exclusion): never hide a
  // trade the platform called. A pass-priced contract exit keeps its row and P&L;
  // verifyDeskRows labels it unverified (exit_premium_pass, shared/desk-integrity.ts).
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
    `${sharesIdea ? `${SHARES_IDEA_LABEL} (${i.source ?? "engine"} published the underlying before options-only-v2) — ` : ""}Published ${planDirection.toUpperCase()} ${i.symbol}${option ? ` ${planStrike ?? ''}${(planOptionType ?? '').charAt(0).toUpperCase()} ${planExpiry?.slice(0, 10) ?? ''}` : ''}`.trim(),
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
  const runnerTxt = option && resolved ? runnerLine(parseRunner(i.outcomeNotes)) : null;
  const pkRec = option ? parsePeak(i.outcomeNotes) : null;
  const peakTxt = pkRec ? peakLine(pkRec, resolved ? exit : null) : null;
  const bcRec = option ? readBudgetContract(i.convergenceSignalsJson) : null;
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
      ...(sharesIdea ? { instrumentLabel: SHARES_IDEA_LABEL } : {}),
      ...(zeroDteOf(i, planExpiry) ? { zeroDte: true } : {}),
      ...(thesisOf(i) ? { thesisLabel: thesisOf(i) } : {}),
      ...(exitTimeNote ? { exitTimeNote } : {}),
      ...(capture != null ? { captureRatio: capture } : {}),
      ...(afterStop ? { afterStop } : {}),
      riskBasis: deskRiskBasis({
        assetType: i.assetType, direction: planDirection, entry: planEntry, stop: planStop, entryPremium: option ? entry : null,
        expiryDate: planExpiry, publishedAt: i.timestamp, unitQty: qty,
      }),
      ...(peakTxt ? { peakLine: peakTxt, peakPremium: pkRec!.premium } : {}),
      ...(runnerTxt ? { runner: runnerTxt } : {}),
      ...(bcRec ? { budgetLine: budgetLine(bcRec), primaryLine: primaryLine({ expiry: planExpiry, strike: i.strikePrice ?? null, optionType: i.optionType ?? null, entryPremium: entry }, bcRec.budget) } : {}),
    },
  };
}

/** 0DTE / index play flag for a desk idea (shared/zero-dte-journal.ts). */
export function zeroDteOf(i: Pick<DeskIdea, 'source' | 'assetType' | 'expiryDate' | 'timestamp'> & { dataSourceUsed?: string | null; qualitySignals?: unknown }, expiry?: string | null): boolean {
  return isZeroDteJournalRow({ source: i.source, dataSourceUsed: i.dataSourceUsed, qualitySignals: i.qualitySignals, assetType: i.assetType, expiryDate: expiry ?? i.expiryDate, entryTime: i.timestamp });
}
const thesisOf = (i: DeskIdea) => spxThesisLabel({ symbol: i.symbol, source: i.source, dataSourceUsed: (i as any).dataSourceUsed, qualitySignals: (i as any).qualitySignals, optionType: i.optionType, strikePrice: i.strikePrice });

// ─── NEXUS book verification (audit 2026-10-06) ─────────────

const money = (v: number | null) => v == null ? '—' : `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export interface DeskVerifyResult {
  /** Rows the default book shows: open rows, verified + integrity-checked closed rows. */
  counted: JournalWireRow[];
  /** Closed rows whose recorded P&L is not counted, labelled. */
  unverified: JournalWireRow[];
}

/**
 * Label every mapped desk row with its ONE P&L-truth class (shared/journal-pnl-truth.ts)
 * and split off the closed rows outside the headline. Headline = closed option rows
 * that are bar-verified, bar-corrected (P&L replaced by the bar re-price, recorded value
 * kept on the label), or legacy shares rows with a verified rule-picked options view
 * (the row becomes that option trade, labelled). Duplicates (first kept), crypto,
 * shares without a verified options view, and every not-yet / not bar-verified row
 * are listed outside the headline with their reason — never summed into it.
 */
export function verifyDeskRows(pairs: { idea: DeskIdea; row: JournalWireRow }[], ledger: DeskLedger | null, retro: Map<string, RetroRecord> | null = null): DeskVerifyResult {
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
  for (const { idea, row: row0 } of pairs) {
    let row = row0;
    const flags: DeskIntegrityFlag[] = deskIntegrityFlags(idea);
    const isClosed = row.status === 'closed';
    const dupOf = isClosed ? dups.get(idea.id) : undefined;
    if (dupOf) flags.push({ code: 'duplicate', severity: 'fail', detail: `same position as desk:${dupOf} (first kept)` });
    const entry = isClosed ? ledger?.byId.get(idea.id) : undefined;
    const recorded = row.realizedPnL ?? null;
    const intent = instrumentIntent(idea);
    const instrument = idea.assetType === 'option' ? 'option' : intent === 'crypto' ? 'crypto' : intent === 'future' ? 'future' : intent === 'shares' ? 'shares' : 'other';
    if (!isClosed) {
      const v: DeskVerification = { status: 'checked', basis: 'integrity', reasons: pick(flags), recordedPnL: null, recomputedPnL: null };
      counted.push({ ...row, verification: v, notes: v.reasons.length ? `${row.notes ?? ''}\nVerification: open — ${v.reasons.map((r) => `${r.code} (${r.detail})`).join('; ')}`.trim() : row.notes });
      continue;
    }
    const c = classifyClosedRow({ instrument, duplicateOf: dupOf ?? null, ledger: entry ?? null, integrityFail: failsIntegrity(flags) });
    let v: DeskVerification;
    let label: string;
    const rr = instrument === 'shares' && !dupOf ? retro?.get(idea.id) : undefined;
    if (rr && rr.status === 'verified' && rr.contract && rr.entryPremium != null && rr.exitPremium != null && rr.unitPnL != null) {
      // Legacy shares idea → its rule-picked options view becomes the trade (unit: 1 contract; the client sizes whole contracts).
      const pnl = r2(rr.unitPnL);
      v = { status: 'verified', basis: 'retro', reasons: [], recordedPnL: recorded, recomputedPnL: pnl, truth: 'retro' };
      label = `${retroLine(rr)}\nShares as published: ${money(recorded)} on $${DESK_STOCK_NOTIONAL.toLocaleString()} notional — replaced in the options headline by the options view (${PNL_TRUTH_VERSION}).`;
      row = {
        ...row,
        assetType: 'option', direction: 'long', optionType: rr.contract.type, strikePrice: rr.contract.strike, expiryDate: rr.contract.expiry,
        quantity: 1, entryPrice: rr.entryPremium, exitPrice: rr.exitPremium,
        entryTime: rr.triggerAt ?? row.entryTime, exitTime: rr.exitAt ?? row.exitTime,
        holdingMinutes: minutesBetween(rr.triggerAt ?? row.entryTime, rr.exitAt ?? row.exitTime),
        realizedPnL: pnl, grossPnL: pnl, realizedPnLPercent: r2(((rr.exitPremium - rr.entryPremium) / rr.entryPremium) * 100), outcome: outcomeOf(pnl),
        instrumentLabel: 'Options view (rule-picked, verified)', retroOption: rr,
        riskBasis: deskRiskBasis({
          assetType: 'option', direction: idea.direction, entry: idea.entryPrice, stop: idea.stopLoss, entryPremium: rr.entryPremium,
          expiryDate: rr.contract.expiry, publishedAt: idea.timestamp, unitQty: 1,
        }),
        peakLine: null, budgetLine: null, primaryLine: null, runner: null, captureRatio: null,
      };
    } else if (c.cls === 'verified') {
      v = { status: 'verified', basis: 'bars', reasons: pick(flags, 'caveat'), recordedPnL: recorded, recomputedPnL: entry?.recomputedPnL ?? null, truth: 'verified' };
      label = `Verification: BAR-VERIFIED${ledger ? ` (ledger ${ledger.asOf.slice(0, 16)}Z)` : ''}${v.recomputedPnL != null ? ` — recomputed ${money(v.recomputedPnL)}` : ''}`;
    } else if (c.cls === 'corrected' && c.corrected) {
      v = { status: 'verified', basis: 'bars', reasons: [{ code: 'bar_mismatch', detail: [entry?.bugClass, entry?.reason].filter(Boolean).join(': ') }], recordedPnL: recorded, recomputedPnL: c.corrected.pnl, truth: 'corrected' };
      label = `Verification: BAR-CORRECTED — recorded ${money(recorded)} → bars ${money(c.corrected.pnl)} (entry ${c.corrected.entry} → exit ${c.corrected.exit}, ${entry?.optionSource ?? 'contract bars'}); the bar value is the one counted`;
      row = {
        ...row, entryPrice: c.corrected.entry, exitPrice: c.corrected.exit, realizedPnL: c.corrected.pnl, grossPnL: c.corrected.pnl,
        realizedPnLPercent: c.corrected.entry > 0 ? r2(((c.corrected.exit - c.corrected.entry) / c.corrected.entry) * 100) : row.realizedPnLPercent,
        outcome: outcomeOf(c.corrected.pnl),
        riskBasis: row.riskBasis ? { ...row.riskBasis, entryPremium: c.corrected.entry } : row.riskBasis,
      };
    } else {
      const code: DeskBugClass = c.cls === 'integrity_fail' ? (pick(flags, 'fail')[0]?.code ?? 'bar_pending') : c.cls as DeskBugClass;
      const ledgerDetail = entry ? [entry.bugClass, entry.reason].filter(Boolean).join(': ') : '';
      const retroWhy = instrument === 'shares' ? (rr ? ` · options view: ${rr.status.replace('_', ' ')} — ${rr.reason}` : ' · options view: not converted yet') : '';
      const failFirst = c.cls === 'integrity_fail' ? pick(flags, 'fail')[0] : undefined;
      const first = { code, detail: `${failFirst?.detail || ledgerDetail || TRUTH_CLASS_LABEL[c.cls]}${retroWhy}` };
      const rest = pick(flags, 'fail').filter((f) => f.code !== code);
      v = { status: 'unverified', basis: entry ? 'bars' : 'integrity', reasons: [first, ...rest], recordedPnL: recorded, recomputedPnL: entry?.recomputedPnL ?? null, truth: c.cls };
      label = `Verification: OUTSIDE THE HEADLINE — recorded ${money(recorded)}${v.recomputedPnL != null ? `, recomputed ${money(v.recomputedPnL)}` : ''}, not counted: ${v.reasons.map((r) => `${r.code} (${r.detail})`).join('; ')}`;
      if (rr) row = { ...row, retroOption: rr };
    }
    const labelled: JournalWireRow = { ...row, verification: v, notes: `${row.notes ?? ''}\n${label}`.trim() };
    if (v.status === 'unverified') unverified.push(labelled);
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
    // Every unverified row is listed (operator rule 2026-10-07: nothing silently disappears).
    .slice(0, 5000)
    .map((r) => ({
      id: r.id, symbol: r.symbol, entryTime: r.entryTime, recordedPnL: r.realizedPnL ?? null,
      recomputedPnL: r.verification?.recomputedPnL ?? null, reasons: r.verification?.reasons ?? [],
    }));
  const truth = summarizeTruth([...res.counted, ...res.unverified]);
  return {
    ledger: ledger ? { asOf: ledger.asOf, path: ledger.path } : null,
    counted: { verified: verified.length, checked: checked.length, verifiedPnL: sum(verified.map((r) => r.realizedPnL)), checkedPnL: sum(checked.map((r) => r.realizedPnL)) },
    truth,
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

