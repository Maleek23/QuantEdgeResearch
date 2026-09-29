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
  JOURNAL_PARAM, parseJournalKey, type JournalKey, type JournalSourceListItem, type JournalSourceMeta,
} from '@shared/journal-sources';
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

  const resolved = useMemo(() => resolveFilters(state), [state]);
  return { state, resolved, setRange, setFilter, clear, activeCount: countJournalFilters(resolved) };
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
  const [key, setKey] = useState<JournalKey>(() =>
    parseJournalKey(typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(JOURNAL_PARAM)));
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

export function useJournalData(filters: JournalFilters, key: JournalKey = 'mine') {
  const tradesQ = useQuery<{ trades: JournalTradeRow[]; count: number; journal?: JournalSourceMeta }>({
    queryKey: [...JOURNAL_TRADES_KEY, key],
    queryFn: async () => {
      const res = await fetch(withQs('/api/journal/trades', journalQs(key)), { credentials: 'include' });
      if (!res.ok) throw new Error(`Journal trades request failed (${res.status})`);
      return res.json();
    },
  });

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

  const allRows = tradesQ.data?.trades ?? [];
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
    };
  }, [allRows]);

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
