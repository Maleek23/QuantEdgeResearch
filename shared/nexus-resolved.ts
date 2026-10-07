/**
 * NEXUS "Resolved today" — ideas that closed this ET session stay on the board.
 *
 * Operator, 2026-10-07: "my TSLA puts trade disappeared" — TSLA 380P 0DTE hit
 * target at 10:05 ET and left the open-only board (/api/convictions builds
 * from open ideas). The board now shows today's resolved ideas greyed, in a
 * "Resolved today" group, with an outcome chip (✓ T1 / ✕ stop / time exit) and
 * the resolution time.
 *
 * Pure: no I/O. Server: GET /api/nexus/resolved-today (server/routes.ts).
 */

const ET_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const ET_HM = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
const etDay = (ms: number) => ET_DAY.format(new Date(ms));

export interface ResolvedIdea {
  ideaId: string;
  symbol: string;
  direction: 'long' | 'short';
  assetType: string;
  source: string | null;
  optionType: string | null;
  strikePrice: number | null;
  expiryDate: string | null;
  entryPrice: number;
  targetPrice: number | null;
  stopLoss: number | null;
  exitPrice: number | null;
  entryPremium: number | null;
  exitPremium: number | null;
  /** Option P&L % on premium when known, else underlying % gain. */
  percentGain: number | null;
  optionPercentGain: number | null;
  outcomeStatus: string;
  resolutionReason: string | null;
  /** Publish time (ISO). */
  timestamp: string;
  /** Resolution time (ISO). */
  exitDate: string;
}

export type OutcomeTone = 'win' | 'loss' | 'flat';
export interface OutcomeChip { label: string; tone: OutcomeTone; at: string | null; title: string }

/** ✓ T1 / ✕ stop / time exit / expired / closed — plus the ET time it resolved. */
export function outcomeChip(r: Pick<ResolvedIdea, 'outcomeStatus' | 'resolutionReason' | 'exitDate' | 'percentGain' | 'optionPercentGain'>): OutcomeChip {
  const t = Date.parse(r.exitDate);
  const at = Number.isFinite(t) ? ET_HM.format(new Date(t)) : null;
  const pnl = r.optionPercentGain ?? r.percentGain;
  const reason = String(r.resolutionReason ?? '');
  const s = String(r.outcomeStatus ?? '');
  if (s === 'hit_target') return { label: '✓ T1', tone: 'win', at, title: 'Target hit' };
  if (s === 'hit_stop') return { label: '✕ stop', tone: 'loss', at, title: 'Stop hit' };
  if (s === 'expired' || reason === 'auto_time_stop' || reason === 'auto_expired') {
    const tone: OutcomeTone = pnl == null || Math.abs(pnl) < 0.05 ? 'flat' : pnl > 0 ? 'win' : 'loss';
    return { label: reason === 'auto_expired' ? 'expired' : 'time exit', tone, at, title: reason === 'auto_expired' ? 'Contract / window expired' : 'Planned time stop' };
  }
  if (reason.startsWith('missed_entry')) return { label: 'no fill', tone: 'flat', at, title: 'Entry window passed without a fill' };
  const tone: OutcomeTone = pnl == null || Math.abs(pnl) < 0.05 ? 'flat' : pnl > 0 ? 'win' : 'loss';
  return { label: 'closed', tone, at, title: 'Closed manually' };
}

/**
 * Today's (ET) resolved ideas, newest first, one per idea id. Ideas that never
 * filled (missed_entry_*) were never trades and are left off.
 */
export function resolvedToday<T extends Pick<ResolvedIdea, 'ideaId' | 'exitDate' | 'outcomeStatus'> & { resolutionReason?: string | null }>(rows: T[], nowMs: number): T[] {
  const today = etDay(nowMs);
  const seen = new Set<string>();
  return rows
    .filter((r) => r.outcomeStatus && r.outcomeStatus !== 'open')
    .filter((r) => !String(r.resolutionReason ?? '').startsWith('missed_entry'))
    .filter((r) => { const t = Date.parse(r.exitDate); return Number.isFinite(t) && etDay(t) === today; })
    .sort((a, b) => Date.parse(b.exitDate) - Date.parse(a.exitDate))
    .filter((r) => (seen.has(r.ideaId) ? false : (seen.add(r.ideaId), true)));
}

/** "TSLA 380P 10/07" or the symbol for a share idea. */
export function resolvedInstrument(r: Pick<ResolvedIdea, 'symbol' | 'assetType' | 'optionType' | 'strikePrice' | 'expiryDate'>): string {
  if (r.assetType !== 'option' || r.strikePrice == null) return r.symbol;
  const cp = String(r.optionType ?? '').toLowerCase().startsWith('p') ? 'P' : 'C';
  const exp = r.expiryDate ? ` ${String(r.expiryDate).slice(5, 10).replace('-', '/')}` : '';
  return `${r.symbol} ${r.strikePrice}${cp}${exp}`;
}
