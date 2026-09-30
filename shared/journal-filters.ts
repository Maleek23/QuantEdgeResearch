/**
 * Journal filters — one definition shared by the client (which filters the rows
 * it already holds) and the server (which filters before computing insights,
 * timing and DTE analytics). Both sides must agree on what "in view" means or
 * the numbers on one screen would describe two different samples.
 *
 * Filter keys and the URL-param approach follow LuxAlgo Trade Journal's
 * FILTER_KEYS / readFilters (MIT, https://github.com/LuxAlgo/trade-journal),
 * re-implemented for our journal_trades row shape.
 */

export type JournalOutcomeFilter = 'win' | 'loss' | 'breakeven' | 'open';

export interface JournalFilters {
  /** Inclusive trading-day bounds, YYYY-MM-DD (America/New_York). */
  from?: string;
  to?: string;
  /** Upper-cased symbols; a row matches if it is any of them. */
  symbols?: string[];
  setup?: string;
  mistake?: string;
  emotion?: string;
  side?: 'long' | 'short';
  asset?: string;
  outcome?: JournalOutcomeFilter;
  broker?: string;
  /** Bot book: one run (paper portfolio id). Absent = every run, combined. */
  run?: string;
  /**
   * Drill-down: exactly these trade ids (an Insights / Loss-driver row or a
   * weekday × hour cell opens the Trades page on the trades it summarises).
   * Capped at JOURNAL_DRILL_MAX_IDS so the URL stays shareable.
   */
  ids?: string[];
  /** Display-only name of the drill ("Loss driver · Exit: stop hit") — never filters. */
  drill?: string;
}

/** Most trade ids a drill-down URL carries (~40 chars each → ≤ 6 KB of query). */
export const JOURNAL_DRILL_MAX_IDS = 150;
const ID_RE = /^[A-Za-z0-9:_.-]{1,80}$/;

/** URL parameter name for each filter — `j`-prefixed so they never collide with the shell's params. */
export const JOURNAL_FILTER_PARAMS = {
  from: 'jfrom',
  to: 'jto',
  symbols: 'jsym',
  setup: 'jsetup',
  mistake: 'jmistake',
  emotion: 'jemotion',
  side: 'jside',
  asset: 'jasset',
  outcome: 'jout',
  broker: 'jbroker',
  run: 'jrun',
  ids: 'jids',
  drill: 'jdrill',
} as const satisfies Record<keyof JournalFilters, string>;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const OUTCOMES: readonly JournalOutcomeFilter[] = ['win', 'loss', 'breakeven', 'open'];

const clean = (value: string | null | undefined, max = 80): string | undefined => {
  const v = value?.trim();
  return v ? v.slice(0, max) : undefined;
};

/** Parse filters from anything with a `get` (URLSearchParams, or an Express query adapter). */
export function parseJournalFilters(get: (key: string) => string | null | undefined): JournalFilters {
  const f: JournalFilters = {};
  const from = clean(get(JOURNAL_FILTER_PARAMS.from));
  const to = clean(get(JOURNAL_FILTER_PARAMS.to));
  if (from && DAY_RE.test(from)) f.from = from;
  if (to && DAY_RE.test(to)) f.to = to;
  const symbols = clean(get(JOURNAL_FILTER_PARAMS.symbols), 400)
    ?.split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (symbols?.length) f.symbols = symbols.slice(0, 25);
  const setup = clean(get(JOURNAL_FILTER_PARAMS.setup));
  if (setup) f.setup = setup;
  const mistake = clean(get(JOURNAL_FILTER_PARAMS.mistake));
  if (mistake) f.mistake = mistake;
  const emotion = clean(get(JOURNAL_FILTER_PARAMS.emotion));
  if (emotion) f.emotion = emotion.toLowerCase();
  const side = clean(get(JOURNAL_FILTER_PARAMS.side));
  if (side === 'long' || side === 'short') f.side = side;
  const asset = clean(get(JOURNAL_FILTER_PARAMS.asset));
  if (asset) f.asset = asset.toLowerCase();
  const outcome = clean(get(JOURNAL_FILTER_PARAMS.outcome)) as JournalOutcomeFilter | undefined;
  if (outcome && OUTCOMES.includes(outcome)) f.outcome = outcome;
  const broker = clean(get(JOURNAL_FILTER_PARAMS.broker));
  if (broker) f.broker = broker.toLowerCase();
  const run = clean(get(JOURNAL_FILTER_PARAMS.run), 64);
  if (run && /^[a-zA-Z0-9-]+$/.test(run)) f.run = run;
  const ids = clean(get(JOURNAL_FILTER_PARAMS.ids), JOURNAL_DRILL_MAX_IDS * 81)
    ?.split(',')
    .map((s) => s.trim())
    .filter((s) => ID_RE.test(s));
  if (ids?.length) f.ids = [...new Set(ids)].slice(0, JOURNAL_DRILL_MAX_IDS);
  const drill = clean(get(JOURNAL_FILTER_PARAMS.drill));
  if (drill && f.ids) f.drill = drill;
  return f;
}

/**
 * A drill-down from a summary row: the filters in view PLUS exactly these trade
 * ids (a subset of the rows in view, so the combination is exact). null when
 * there is nothing to open or too many trades to carry in a URL.
 */
export function buildJournalDrill(current: JournalFilters, ids: readonly string[], label: string): JournalFilters | null {
  const uniq = [...new Set(ids)];
  // Every id must survive the URL round trip, or the drill would not be exact.
  if (!uniq.length || uniq.length > JOURNAL_DRILL_MAX_IDS || !uniq.every((id) => ID_RE.test(id))) return null;
  const next: JournalFilters = { ...current, ids: uniq };
  const l = label.trim().slice(0, 80);
  if (l) next.drill = l; else delete next.drill;
  return next;
}

/** Serialise to URL params (only set keys). */
export function journalFiltersToParams(f: JournalFilters): URLSearchParams {
  const p = new URLSearchParams();
  (Object.keys(JOURNAL_FILTER_PARAMS) as (keyof JournalFilters)[]).forEach((key) => {
    const value = f[key];
    if (value == null) return;
    const s = Array.isArray(value) ? value.join(',') : String(value);
    if (s) p.set(JOURNAL_FILTER_PARAMS[key], s);
  });
  return p;
}

export function countJournalFilters(f: JournalFilters): number {
  return (Object.keys(f) as (keyof JournalFilters)[]).filter((k) => {
    if (k === 'drill') return false; // a label, not a filter
    const v = f[k];
    return Array.isArray(v) ? v.length > 0 : v != null && v !== '';
  }).length;
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Trading-day key (YYYY-MM-DD) in New York time — the session a US trade belongs to. */
export function journalDayKey(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return dayFormatter.format(d);
}

/** The minimum row shape the predicate reads — satisfied by JournalTrade on both sides. */
export interface JournalFilterableRow {
  /** Needed only by the `ids` drill-down filter. */
  id?: string;
  symbol: string;
  direction: string;
  assetType: string;
  entryTime: string;
  exitTime?: string | null;
  status: string;
  realizedPnL?: number | null;
  setupType?: string | null;
  mistakeTag?: string | null;
  emotion?: string | null;
  broker?: string | null;
  runId?: string | null;
}

/** Closed-with-a-price → win/loss/breakeven by sign; anything else is open. */
export function journalRowOutcome(row: Pick<JournalFilterableRow, 'status' | 'realizedPnL'>): JournalOutcomeFilter {
  if (row.status !== 'closed' || row.realizedPnL == null || !Number.isFinite(row.realizedPnL)) return 'open';
  if (Math.abs(row.realizedPnL) < 0.005) return 'breakeven';
  return row.realizedPnL > 0 ? 'win' : 'loss';
}

const same = (a: string | null | undefined, b: string) => (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();

export function matchesJournalFilters(row: JournalFilterableRow, f: JournalFilters): boolean {
  if (f.from || f.to) {
    const day = journalDayKey(row.exitTime || row.entryTime);
    if (!day) return false;
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
  }
  if (f.symbols?.length && !f.symbols.includes(row.symbol.toUpperCase())) return false;
  if (f.setup && !same(row.setupType, f.setup)) return false;
  if (f.mistake && !same(row.mistakeTag, f.mistake)) return false;
  if (f.emotion && !same(row.emotion, f.emotion)) return false;
  if (f.side && row.direction !== f.side) return false;
  if (f.asset && !same(row.assetType, f.asset)) return false;
  if (f.broker && !same(row.broker, f.broker)) return false;
  if (f.run && row.runId !== f.run) return false;
  if (f.outcome && journalRowOutcome(row) !== f.outcome) return false;
  if (f.ids?.length && !(row.id && f.ids.includes(row.id))) return false;
  return true;
}
