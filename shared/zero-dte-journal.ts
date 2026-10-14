/**
 * 0DTE / INDEX PLAYS — one definition for "is this a 0DTE/index play" and for
 * how an SPX thesis traded on SPY is labelled, shared by the journal (server row
 * flag + client filter chip), the idea detail endpoint and the 0DTE desk.
 *
 * Operator bug 2026-10-14: the desk showed the SPY 770P 1DTE index scalp under
 * its "SPX" row, the detail looked the idea up by "SPX" and dead-ended. The
 * idea is an SPX thesis expressed on SPY; every surface now says so.
 */

/** Engines whose every idea is a 0DTE / index play. */
export const ZERO_DTE_SOURCES = ['zero_dte_flow', 'zero_dte_desk', 'zero_dte_sniper', 'open_drive', 'spx_fast_move', 'spx_session'] as const;
export type ZeroDteFamily = (typeof ZERO_DTE_SOURCES)[number] | 'index_scalp';

const SOURCE_SET = new Set<string>(ZERO_DTE_SOURCES);
const INDEX_SCALP_RE = /^GEX_index_scalp_/;

export function isIndexScalp(r: { source?: string | null; dataSourceUsed?: string | null; qualitySignals?: unknown }): boolean {
  if (INDEX_SCALP_RE.test(String(r.dataSourceUsed ?? ''))) return true;
  return Array.isArray(r.qualitySignals) && r.qualitySignals.some((s) => typeof s === 'string' && s.startsWith('index_scalp:'));
}

/** The 0DTE engine family of an idea (null when it is not a 0DTE/index engine). */
export function zeroDteFamilyOf(r: { source?: string | null; dataSourceUsed?: string | null; qualitySignals?: unknown }): ZeroDteFamily | null {
  if (isIndexScalp(r)) return 'index_scalp';
  const s = String(r.source ?? '');
  return SOURCE_SET.has(s) ? (s as ZeroDteFamily) : null;
}

const etDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms));

/** Calendar days from the publish day (ET) to expiry; null when unknown. */
export function dteAtPublish(expiryDate: string | null | undefined, publishedAt: string | Date | null | undefined): number | null {
  const exp = String(expiryDate ?? '').slice(0, 10);
  const pub = publishedAt == null ? NaN : new Date(publishedAt as any).getTime();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp) || !Number.isFinite(pub)) return null;
  return Math.round((Date.parse(`${exp}T00:00:00Z`) - Date.parse(`${etDay(pub)}T00:00:00Z`)) / 86_400_000);
}

/**
 * A 0DTE/index journal row: a 0DTE engine, an index scalp, or any option idea
 * whose contract expired within one trading day of publish (0–1 DTE).
 */
export function isZeroDteJournalRow(r: {
  source?: string | null; setupType?: string | null; dataSourceUsed?: string | null; qualitySignals?: unknown;
  assetType?: string | null; expiryDate?: string | null; entryTime?: string | Date | null;
}): boolean {
  if (zeroDteFamilyOf({ source: r.source ?? r.setupType, dataSourceUsed: r.dataSourceUsed, qualitySignals: r.qualitySignals })) return true;
  if (String(r.assetType ?? '').toLowerCase() !== 'option') return false;
  const dte = dteAtPublish(r.expiryDate, r.entryTime ?? null);
  return dte != null && dte >= 0 && dte <= 1;
}

const qs = (signals: unknown, key: string): string | null => {
  if (!Array.isArray(signals)) return null;
  const hit = signals.find((s) => typeof s === 'string' && s.startsWith(`${key}:`));
  return typeof hit === 'string' ? hit.slice(key.length + 1) : null;
};

/**
 * "SPX thesis · traded on SPY 770P" — when an index (SPX) thesis is expressed on
 * a SPY contract. Null for everything else (a plain SPY idea is just SPY).
 */
export function spxThesisLabel(r: {
  symbol: string; source?: string | null; dataSourceUsed?: string | null; qualitySignals?: unknown;
  optionType?: string | null; strikePrice?: number | null;
}): string | null {
  if (String(r.symbol).toUpperCase() !== 'SPY') return null;
  const underlying = qs(r.qualitySignals, 'underlying');
  const indexThesis = isIndexScalp(r) || r.source === 'spx_fast_move' || r.source === 'spx_session' || r.source === 'open_drive';
  if (!indexThesis && underlying !== 'SPX') return null;
  const strike = r.strikePrice != null && Number.isFinite(Number(r.strikePrice)) ? `${Number(r.strikePrice)}` : '';
  const side = r.optionType ? (String(r.optionType).toLowerCase().startsWith('p') ? 'P' : 'C') : '';
  return `SPX thesis · traded on SPY${strike ? ` ${strike}${side}` : ''}`;
}

export type IdeaStatusCode = 'open' | 'waiting' | 'hit_t1' | 'hit_t2' | 'stopped' | 'expired' | 'closed' | 'missed';

/** The status chip on a by-id detail: Open / Hit T1 / Stopped / Expired … */
export function ideaStatusChip(r: {
  outcomeStatus?: string | null; resolutionReason?: string | null; lifecycleState?: string | null;
  t2HitAt?: number | null;
}): { code: IdeaStatusCode; label: string; tone: 'live' | 'gain' | 'loss' | 'muted' } {
  const s = String(r.outcomeStatus ?? 'open').toLowerCase();
  const why = String(r.resolutionReason ?? '').toLowerCase();
  if (why.startsWith('missed_entry')) return { code: 'missed', label: 'Missed entry', tone: 'muted' };
  if (s === 'hit_target') return r.t2HitAt ? { code: 'hit_t2', label: 'Hit T2', tone: 'gain' } : { code: 'hit_t1', label: 'Hit T1', tone: 'gain' };
  if (s === 'hit_stop') return { code: 'stopped', label: 'Stopped', tone: 'loss' };
  if (s === 'expired') return { code: 'expired', label: 'Expired', tone: 'muted' };
  if (s !== 'open' && s !== '') return { code: 'closed', label: 'Closed', tone: 'muted' };
  const st = String(r.lifecycleState ?? '');
  if (st === 'triggered' || st === 'executed') return { code: 'open', label: 'Open', tone: 'live' };
  if (st === 'invalidated') return { code: 'missed', label: 'Invalidated', tone: 'muted' };
  return { code: 'waiting', label: 'Open · waiting for trigger', tone: 'live' };
}
