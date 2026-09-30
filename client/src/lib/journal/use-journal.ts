/**
 * Journal data + filter state.
 *
 * Filters live in the URL (j-prefixed params, see shared/journal-filters.ts) so a
 * filtered view survives switching destinations, reloads, and can be shared.
 * The range preset (jrange) resolves to concrete from/to days before anything
 * is filtered — the same way LuxAlgo's useFilters resolves its `range` param.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  journalDayKey, journalFiltersToParams, matchesJournalFilters, parseJournalFilters,
  countJournalFilters, JOURNAL_FILTER_PARAMS, type JournalFilters,
} from '@shared/journal-filters';
import {
  JOURNAL_PARAM, parseJournalKey, type JournalKey, type JournalNoteKind, type JournalSourceListItem, type JournalSourceMeta,
} from '@shared/journal-sources';
import { settleExpiredRows } from '@shared/journal-expiry';
import { apiRequest } from '@/lib/queryClient';
import { computeMetrics, dailyStats, equityCurve, toTrade } from './metrics';
import type { JournalAnalytics, JournalNoteRow, JournalTradeRow } from './types';

export const RANGE_PRESETS = [
  { id: 'all', label: 'All time' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: 'ytd', label: 'YTD' },
  { id: 'custom', label: 'Custom' },
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number]['id'];

export interface JournalFilterState {
  range: RangePreset;
  /** User-chosen filters. from/to only matter when range === 'custom'. */
  filters: JournalFilters;
}

const RANGE_PARAM = 'jrange';

function readState(): JournalFilterState {
  if (typeof window === 'undefined') return { range: 'all', filters: {} };
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(RANGE_PARAM) as RangePreset | null;
  const filters = parseJournalFilters((k) => params.get(k));
  const range: RangePreset = raw && RANGE_PRESETS.some((r) => r.id === raw)
    ? raw
    : filters.from || filters.to ? 'custom' : 'all';
  return { range, filters };
}

/** Resolve the preset into concrete bounds (New York trading days). */
export function resolveFilters(state: JournalFilterState, now = new Date()): JournalFilters {
  const f: JournalFilters = { ...state.filters };
  if (state.range === 'custom') return f;
  delete f.from;
  delete f.to;
  if (state.range === 'all') return f;
  const today = journalDayKey(now);
  if (state.range === 'ytd') {
    f.from = `${today.slice(0, 4)}-01-01`;
  } else {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - Number(state.range.replace('d', '')) + 1);
    f.from = d.toISOString().slice(0, 10);
  }
  f.to = today;
  return f;
}

export function useJournalFilterState() {
  const [state, setState] = useState<JournalFilterState>(readState);

  // Mirror into the URL (replaceState: filtering is not navigation).
  useEffect(() => {
    const url = new URL(window.location.href);
    Object.values(JOURNAL_FILTER_PARAMS).forEach((k) => url.searchParams.delete(k));
    url.searchParams.delete(RANGE_PARAM);
    const f = state.range === 'custom' ? state.filters : { ...state.filters, from: undefined, to: undefined };
    journalFiltersToParams(f).forEach((v, k) => url.searchParams.set(k, v));
    if (state.range !== 'all') url.searchParams.set(RANGE_PARAM, state.range);
    window.history.replaceState(window.history.state, '', url.toString());
  }, [state]);

  const setRange = useCallback((range: RangePreset) => setState((s) => ({ ...s, range })), []);
  const setFilter = useCallback(<K extends keyof JournalFilters>(key: K, value: JournalFilters[K] | undefined) => {
    setState((s) => {
      const filters = { ...s.filters };
      if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) delete filters[key];
      else filters[key] = value;
      return { ...s, filters };
    });
  }, []);
  const clear = useCallback(() => setState({ range: 'all', filters: {} }), []);
  /** Replace every filter at once (a drill-down); the range preset is kept. */
  const setAll = useCallback((filters: JournalFilters) => setState((s) => ({ ...s, filters })), []);
  /** Leave a drill-down: drop the id list and its label, keep everything else. */
  const clearDrill = useCallback(() => setState((s) => {
    const { ids: _ids, drill: _drill, ...rest } = s.filters;
    return { ...s, filters: rest };
  }), []);

  const resolved = useMemo(() => resolveFilters(state), [state]);
  return { state, resolved, setRange, setFilter, setAll, clearDrill, clear, activeCount: countJournalFilters(resolved) };
}

export const JOURNAL_TRADES_KEY = ['journal-trades'] as const;
export const JOURNAL_ANALYTICS_KEY = 'journal-analytics';
export const JOURNAL_NOTES_KEY = 'journal-notes';
export const JOURNAL_SOURCES_KEY = ['journal-sources'] as const;

/** `?journal=` for a book; empty for "mine" so existing URLs keep working. */
export function journalQs(key: JournalKey): string {
  return key === 'mine' ? '' : `${JOURNAL_PARAM}=${encodeURIComponent(key)}`;
}

const withQs = (path: string, ...parts: string[]) => {
  const q = parts.filter(Boolean).join('&');
  return q ? `${path}?${q}` : path;
};

/** Which book the journal shows — lives in the URL (?journal=) next to the filters. */
export function useJournalKey() {
  const [key, setKey] = useState<JournalKey>(() => {
    if (typeof window === 'undefined') return 'mine';
    const raw = new URLSearchParams(window.location.search).get(JOURNAL_PARAM);
    // No book in the URL → the viewer's default book (Settings), else Mine.
    return raw ? parseJournalKey(raw) : readJournalPrefs().defaultBook;
  });
  useEffect(() => {
    const url = new URL(window.location.href);
    if (key === 'mine') url.searchParams.delete(JOURNAL_PARAM);
    else url.searchParams.set(JOURNAL_PARAM, key);
    window.history.replaceState(window.history.state, '', url.toString());
  }, [key]);
  return [key, setKey] as const;
}

export interface JournalSourcesResponse {
  sources: JournalSourceListItem[];
  isAdmin: boolean;
  capabilities: { discordBot: boolean; brokerKeys: boolean; serverAlpaca: boolean };
}

export function useJournalSources() {
  return useQuery<JournalSourcesResponse>({
    queryKey: JOURNAL_SOURCES_KEY,
    queryFn: async () => {
      const res = await fetch('/api/journal/sources', { credentials: 'include' });
      if (!res.ok) throw new Error(`Journal sources request failed (${res.status})`);
      return res.json();
    },
    staleTime: 60_000,
  });
}

export type JournalTradesPayload = { trades: JournalTradeRow[]; count: number; journal?: JournalSourceMeta };

/**
 * The one query behind a book's rows. The BOT tab reads the bot's record through
 * this same key and fetch (useBotLedger), so the journal's Bot book and the BOT
 * tab share one request and one cache entry — they cannot show two records.
 */
export function journalTradesQuery(key: JournalKey) {
  return {
    queryKey: [...JOURNAL_TRADES_KEY, key] as const,
    queryFn: async (): Promise<JournalTradesPayload> => {
      const res = await fetch(withQs('/api/journal/trades', journalQs(key)), { credentials: 'include' });
      if (!res.ok) throw new Error(`Journal trades request failed (${res.status})`);
      return res.json();
    },
  };
}

export function useJournalData(filters: JournalFilters, key: JournalKey = 'mine') {
  const tradesQ = useQuery<JournalTradesPayload>(journalTradesQuery(key));

  const qs = journalFiltersToParams(filters).toString();
  const analyticsQ = useQuery<JournalAnalytics>({
    queryKey: [JOURNAL_ANALYTICS_KEY, key, qs],
    queryFn: async () => {
      const res = await fetch(withQs('/api/journal/analytics', journalQs(key), qs), { credentials: 'include' });
      if (!res.ok) throw new Error(`Journal analytics request failed (${res.status})`);
      return res.json();
    },
    enabled: (tradesQ.data?.count ?? 0) > 0,
    staleTime: 60_000,
  });

  const notesQ = useQuery<{ notes: JournalNoteRow[]; count: number }>({
    queryKey: [JOURNAL_NOTES_KEY, key],
    queryFn: async () => {
      const res = await fetch(withQs('/api/journal/notes', journalQs(key)), { credentials: 'include' });
      if (!res.ok) throw new Error(`Journal notes request failed (${res.status})`);
      return res.json();
    },
    // The bot and trade-desk books are ledgers — they carry no notes.
    enabled: key === 'mine' || key.startsWith('trader:'),
    staleTime: 60_000,
  });

  // Options that expired with no closing fill are settled at $0 (shared/journal-expiry.ts) —
  // left "open" they fell out of every number. Rows carry expiredAssumed so the basis line names them.
  const rawRows = tradesQ.data?.trades;
  const allRows = useMemo(() => settleExpiredRows(rawRows ?? []), [rawRows]);
  const rows = useMemo(() => allRows.filter((r) => matchesJournalFilters(r, filters)), [allRows, filters]);
  const trades = useMemo(() => rows.map(toTrade), [rows]);
  const days = useMemo(() => dailyStats(trades), [trades]);
  const curve = useMemo(() => equityCurve(trades), [trades]);
  const metrics = useMemo(() => computeMetrics(trades, days, curve), [trades, days, curve]);

  // Option lists for filter dropdowns come from ALL rows, so choosing one never hides the others.
  const options = useMemo(() => {
    const uniq = (xs: (string | null | undefined)[]) =>
      [...new Set(xs.map((x) => x?.trim()).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
    return {
      setups: uniq(allRows.map((r) => r.setupType)),
      mistakes: uniq(allRows.map((r) => r.mistakeTag)),
      emotions: uniq(allRows.map((r) => r.emotion?.toLowerCase())),
      assets: uniq(allRows.map((r) => r.assetType)),
      brokers: uniq(allRows.map((r) => r.broker?.toLowerCase())),
      symbols: uniq(allRows.map((r) => r.symbol.toUpperCase())),
      /** Bot book: every run, labelled (id → label), oldest first. */
      runs: (tradesQ.data?.journal?.runs ?? []).map((r) => ({ id: r.id, label: r.label, displayName: r.displayName })),
    };
  }, [allRows, tradesQ.data]);

  const meta = tradesQ.data?.journal ?? null;
  return { key, meta, tradesQ, analyticsQ, notesQ, allRows, rows, trades, days, curve, metrics, options };
}

export type JournalData = ReturnType<typeof useJournalData>;

/** Payload accepted by POST /api/journal/trade and PATCH /api/journal/trade/:id. */
export interface JournalTradeInput {
  symbol: string;
  direction: 'long' | 'short';
  assetType: 'stock' | 'option' | 'future' | 'crypto';
  optionType?: 'call' | 'put' | null;
  strikePrice?: number | null;
  expiryDate?: string | null;
  quantity: number;
  entryPrice: number;
  exitPrice?: number | null;
  fees?: number;
  entryTime: string;
  exitTime?: string | null;
  notes?: string | null;
  emotion?: string | null;
  setupType?: string | null;
  mistakeTag?: string | null;
  rating?: number | null;
  screenshot?: string | null;
}

/** Server error bodies carry `error` + optional `issues`; surface them verbatim. */
export async function readApiError(err: unknown): Promise<string> {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/^\d+: (.*)$/s);
  if (m) {
    try {
      const body = JSON.parse(m[1]);
      return [body.error, ...(body.issues ?? [])].filter(Boolean).join(' — ') || msg;
    } catch { return m[1]; }
  }
  return msg;
}

export function useJournalMutations(key: JournalKey = 'mine') {
  const qc = useQueryClient();
  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: JOURNAL_TRADES_KEY });
    qc.invalidateQueries({ queryKey: [JOURNAL_ANALYTICS_KEY] });
    qc.invalidateQueries({ queryKey: [JOURNAL_NOTES_KEY] });
  }, [qc]);
  const q = journalQs(key);

  const save = useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: Partial<JournalTradeInput> }) => {
      const res = id
        ? await apiRequest('PATCH', withQs(`/api/journal/trade/${encodeURIComponent(id)}`, q), input)
        : await apiRequest('POST', withQs('/api/journal/trade', q), input);
      return (await res.json()) as { trade: JournalTradeRow };
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', withQs(`/api/journal/trade/${encodeURIComponent(id)}`, q));
    },
    onSuccess: refresh,
  });

  const resetAll = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', withQs('/api/journal/trades/all', q));
      return (await res.json()) as { deleted: number };
    },
    onSuccess: refresh,
  });

  return { save, remove, resetAll, refresh, qs: q };
}

// ─── Notes written from the journal (day note, notebook, missed, playbook) ─

export interface JournalNoteInput {
  kind: JournalNoteKind;
  day: string;
  body: string;
  symbols?: string[];
  /** playbook: the setup the definition belongs to; trade_review: the trade id. */
  ref?: string;
  attachments?: { url: string; name: string; isImage: boolean }[];
}

export function useJournalNoteMutations(key: JournalKey) {
  const qc = useQueryClient();
  const q = journalQs(key);
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: [JOURNAL_NOTES_KEY, key] }), [qc, key]);
  const save = useMutation({
    mutationFn: async (input: JournalNoteInput) => {
      const res = await apiRequest('POST', withQs('/api/journal/notes', q), input);
      return (await res.json()) as { note: JournalNoteRow | null };
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await apiRequest('DELETE', withQs(`/api/journal/notes/${encodeURIComponent(id)}`, q)); },
    onSuccess: refresh,
  });
  return { save, remove };
}

/** Notes the UI writes are kinds; everything else (Discord analysis, unmatched exits…) was imported. */
export function noteKindLabel(reason: string | null, source: string): string {
  switch (reason) {
    case 'day_note': return 'day note';
    case 'missed': return 'missed trade';
    case 'note': return 'note';
    case 'playbook': return 'playbook';
    case 'trade_review': return 'trade review';
    case 'unmatched_exit': return 'exit, no entry found';
    case 'unpriced_exit': return 'closed without price';
    case 'entry_without_price': return 'entry without price';
    case 'discord_post': return 'Discord';
    default: return source === 'discord' ? 'Discord post' : 'imported note';
  }
}

// ─── Local preferences (per viewer, this device) ─────────────

export interface JournalPrefs {
  /** Book opened when the URL names none. */
  defaultBook: JournalKey;
  /** Show the book's sizing rule under the basis line, or tuck it away. */
  sizing: 'show' | 'hide';
  /** Clock used for times on notes and days (day buckets are always New York). */
  timeDisplay: 'et' | 'local';
  sidebarCollapsed: boolean;
}

const PREFS_KEY = 'qe-journal-prefs-v1';
const DEFAULT_PREFS: JournalPrefs = { defaultBook: 'mine', sizing: 'show', timeDisplay: 'et', sidebarCollapsed: false };

export function readJournalPrefs(): JournalPrefs {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<JournalPrefs>;
    return {
      defaultBook: parseJournalKey(p.defaultBook ?? null),
      sizing: p.sizing === 'hide' ? 'hide' : 'show',
      timeDisplay: p.timeDisplay === 'local' ? 'local' : 'et',
      sidebarCollapsed: p.sidebarCollapsed === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function useJournalPrefs() {
  const [prefs, setPrefs] = useState<JournalPrefs>(readJournalPrefs);
  const update = useCallback((patch: Partial<JournalPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* storage unavailable: still works this session */ }
      return next;
    });
  }, []);
  return [prefs, update] as const;
}

/** A timestamp in the viewer's chosen clock. */
export function fmtStamp(iso: string, clock: JournalPrefs['timeDisplay'], opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return `${d.toLocaleString('en-US', { ...opts, ...(clock === 'et' ? { timeZone: 'America/New_York' } : {}) })}${clock === 'et' ? ' ET' : ''}`;
}

// ─── Book-specific sources for the sidebar pages ─────────────

async function getJson<T>(url: string, what: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`${what} request failed (${res.status})`);
  return res.json();
}

export interface BotBookInfo {
  asOf: string;
  config: {
    minConviction: number; maxOpen: number; startingCapital: number; riskPerTradePct: number; maxProgressPct: number;
    minUnderlyingRR: number; maxOptionSpreadPct: number; maxDebitPct: number; maxRiskDollars: number; maxDebitDollars: number;
    minContractRoiAtT1Pct: number; delayedFillNotBeforeEtMinutes: number;
  };
  activePortfolio: string;
  runs?: import('@shared/bot-runs').BotRunInfo[];
  portfolios: {
    id: string; name: string; displayName?: string; runLabel?: string; runNo?: number; active: boolean; startingCapital: number; cashBalance: number;
    /** cash + open positions at their marks, computed at read. */
    totalValue: number; positionsValue?: number; storedTotalValue?: number;
    openCount?: number; unmarked?: number; oldestMarkAt?: string | null; newestMarkAt?: string | null;
    totalPnL: number; totalPnLPercent: number; winCount: number; lossCount: number; riskPerTrade: number | null;
    maxPositionSize: number | null; createdAt: string | null; updatedAt: string | null;
  }[];
}

export function useBotBook(enabled: boolean) {
  return useQuery<BotBookInfo>({ queryKey: ['journal-bot-book'], queryFn: () => getJson('/api/journal/bot', 'Bot rules'), enabled, staleTime: 60_000 });
}

export interface BlockedEntry {
  symbol: string; blockedAt: string; entryPrice: number; stopLoss: number; targetPrice: number; reason: string; source?: string;
  outcome?: string; wouldBePercent?: number | null; lastPrice?: number; replay?: string;
}
export interface BlockedLedger {
  asOf?: string; totalBlocked: number; decided: number; blockedWinners: number; blockedLosers: number; netWouldBePercent: number;
  entries: BlockedEntry[]; _meta?: { note?: string };
}

/** The short-discipline gate's shadow ledger (the same feed the Bot tab reads). */
export function useBlockedLedger(enabled: boolean) {
  return useQuery<BlockedLedger>({ queryKey: ['/api/discipline/ledger', 'journal'], queryFn: () => getJson('/api/discipline/ledger', 'Blocked-trade ledger'), enabled, staleTime: 300_000 });
}

export interface TraderWatchlist { trader: { slug: string; name: string }; canWrite: boolean; items: { id: string; symbol: string; note: string | null; addedAt: string | null }[] }

export function useTraderWatchlist(slug: string | null) {
  return useQuery<TraderWatchlist>({
    queryKey: ['/api/traders', slug, 'watchlist'],
    queryFn: () => getJson(`/api/traders/${encodeURIComponent(slug!)}/watchlist`, 'Trader watchlist'),
    enabled: !!slug,
    staleTime: 60_000,
  });
}
