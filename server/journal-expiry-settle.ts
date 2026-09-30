/**
 * Expired broker-CSV option lots settled at INTRINSIC — the I/O half.
 *
 * The rule and the arithmetic live in shared/journal-expiry.ts (pure, tested in
 * scripts/test-journal.ts). This file:
 *   • fetches the underlying's daily bar on each expiry date — batched: one
 *     request per underlying covering every expiry day it needs, results cached
 *     in-process — with an injectable fetcher so tests never touch the network;
 *   • settles freshly parsed trades at import (POST /api/journal/import-csv);
 *   • plans the re-settle of rows already in a journal
 *     (POST /api/journal/resettle-expired) — only rows the expiry rule wrote,
 *     never a real exit fill, never bot / desk / manual / Discord rows.
 */
import {
  EXPIRED_NOTE_HEAD, intrinsicSettlement, parseExpiryMarker, replaceExpiryNote, resettleEligible, settlementUnderlying,
  type ExpiryPrint, type IntrinsicInput,
} from '@shared/journal-expiry';

/** Daily bars of `symbol` on each of `days` (YYYY-MM-DD, New York). Missing day = no entry. */
export type ExpiryBarFetcher = (symbol: string, kind: 'index' | 'equity', days: string[]) => Promise<Map<string, ExpiryPrint>>;

const barCache = new Map<string, ExpiryPrint>();

function rangeFor(oldestDay: string): string {
  const age = (Date.now() - Date.parse(`${oldestDay}T00:00:00Z`)) / 86_400_000;
  return age <= 360 ? '1y' : age <= 720 ? '2y' : age <= 1800 ? '5y' : '10y';
}

/** Default source: Massive unadjusted close for equities (split-safe), Yahoo daily bars otherwise / as fallback. */
export const defaultExpiryBarFetcher: ExpiryBarFetcher = async (symbol, kind, days) => {
  const out = new Map<string, ExpiryPrint>();
  const need = days.filter((d) => {
    const hit = barCache.get(`${symbol}|${d}`);
    if (hit) out.set(d, hit);
    return !hit;
  });
  if (!need.length) return out;
  let rest = need;
  if (kind === 'equity') {
    try {
      const { massiveEnabled, fetchUnadjustedCloseOn } = await import('./massive-market-data');
      if (massiveEnabled()) {
        for (const d of need) {
          const c = await fetchUnadjustedCloseOn(symbol, d).catch(() => null);
          if (c != null && c > 0) { const b = { open: c, close: c, source: 'massive' }; out.set(d, b); barCache.set(`${symbol}|${d}`, b); }
        }
        rest = need.filter((d) => !out.has(d));
      }
    } catch { /* fall through to Yahoo */ }
  }
  if (!rest.length) return out;
  try {
    const { fetchCandles } = await import('./historical-candles');
    const { nyDay } = await import('@shared/bot-runs');
    const bars = await fetchCandles(symbol, rangeFor([...rest].sort()[0]), '1d');
    const byDay = new Map(bars.map((b) => [nyDay(new Date(b.time * 1000)), b] as const));
    for (const d of rest) {
      const b = byDay.get(d);
      if (b && b.close > 0 && b.open > 0) { const p = { open: b.open, close: b.close, source: 'yahoo' }; out.set(d, p); barCache.set(`${symbol}|${d}`, p); }
    }
  } catch { /* unavailable → unverified */ }
  return out;
};

/** Fetch every (underlying, expiry day) print the rows need — one call per underlying. */
export async function fetchExpiryPrints(rows: IntrinsicInput[], fetcher: ExpiryBarFetcher): Promise<Map<string, ExpiryPrint>> {
  const want = new Map<string, { kind: 'index' | 'equity'; days: Set<string> }>();
  for (const r of rows) {
    const day = String(r.expiryDate ?? '').slice(0, 10);
    const src = settlementUnderlying(r.symbol, day);
    if (!src) continue;
    const w = want.get(src.symbol) ?? { kind: src.kind, days: new Set<string>() };
    w.days.add(day);
    want.set(src.symbol, w);
  }
  const prints = new Map<string, ExpiryPrint>();
  const entries = [...want.entries()];
  for (let i = 0; i < entries.length; i += 6) {
    await Promise.all(entries.slice(i, i + 6).map(async ([sym, w]) => {
      try {
        const got = await fetcher(sym, w.kind, [...w.days]);
        got.forEach((p, d) => prints.set(`${sym}|${d}`, p));
      } catch { /* that underlying stays unverified */ }
    }));
  }
  return prints;
}

const printFor = (prints: Map<string, ExpiryPrint>, r: IntrinsicInput) => {
  const day = String(r.expiryDate ?? '').slice(0, 10);
  const src = settlementUnderlying(r.symbol, day);
  return src ? prints.get(`${src.symbol}|${day}`) ?? null : null;
};

/** A parsed trade the CSV parser closed at $0 because it expired with no closing fill. */
type ParsedLike = IntrinsicInput & { status: string; exitPrice?: number | null; exitTime?: string | null; realizedPnL?: number | null; notes?: string | null };

/**
 * Import time: upgrade the parser's $0 expiry settlements to intrinsic, in place.
 * Returns how many were settled in the money / worthless / unverified.
 */
export async function settleParsedExpiries<T extends ParsedLike>(trades: T[], fetcher: ExpiryBarFetcher = defaultExpiryBarFetcher) {
  const lots = trades.filter((t) => t.status === 'closed' && t.assetType === 'option' && !!t.notes?.includes(EXPIRED_NOTE_HEAD) && Number(t.exitPrice ?? 0) === 0);
  const counts = { settled: lots.length, itm: 0, worthless: 0, unverified: 0 };
  if (!lots.length) return counts;
  const prints = await fetchExpiryPrints(lots, fetcher);
  for (const t of lots) {
    const s = intrinsicSettlement(t, printFor(prints, t));
    Object.assign(t, { exitPrice: s.exitPrice, exitTime: s.exitTime, realizedPnL: s.realizedPnL, notes: replaceExpiryNote(t.notes, s.noteLine) });
    if (s.source === 'zero') counts.unverified++; else if (s.exitPrice > 0) counts.itm++; else counts.worthless++;
  }
  return counts;
}

export interface ResettleRow extends IntrinsicInput {
  id: string;
  status: string;
  exitPrice?: number | null;
  exitTime?: string | null;
  realizedPnL?: number | null;
  notes?: string | null;
}

export interface ResettleChange {
  id: string;
  symbol: string;
  contract: string;
  from: { exitPrice: number | null; realizedPnL: number | null; source: string };
  to: { exitPrice: number; realizedPnL: number; source: 'intrinsic' | 'zero'; underlyingPrint: number | null; approximate: boolean };
  delta: number;
  patch: Record<string, unknown>;
}

export interface ResettleSummary {
  scanned: number;
  eligible: number;
  changed: number;
  unchanged: number;
  /** Intrinsic rows whose print could not be fetched this time — left as they were (never downgraded). */
  keptVerified: number;
  pnlDelta: number;
  counts: { itm: number; worthless: number; unverified: number; approximate: number };
  bySymbol: { symbol: string; rows: number; delta: number }[];
  changes: Omit<ResettleChange, 'patch'>[];
}

/**
 * Plan the re-settle of a journal's rows. Pure apart from the injected fetcher;
 * the caller writes each change's `patch`. Idempotent: a second run over the
 * written rows finds nothing to change.
 */
export async function planExpiryResettle(rows: ResettleRow[], fetcher: ExpiryBarFetcher = defaultExpiryBarFetcher, nowMs = Date.now()): Promise<{ summary: ResettleSummary; changes: ResettleChange[] }> {
  const eligible = rows.filter((r) => resettleEligible(r, nowMs));
  const prints = await fetchExpiryPrints(eligible, fetcher);
  const changes: ResettleChange[] = [];
  const counts = { itm: 0, worthless: 0, unverified: 0, approximate: 0 };
  let unchanged = 0;
  let keptVerified = 0;
  for (const r of eligible) {
    const before = parseExpiryMarker(r.notes);
    const s = intrinsicSettlement(r, printFor(prints, r));
    // Never downgrade a verified settlement because the print is unavailable today.
    if (s.source === 'zero' && before?.source === 'intrinsic') { keptVerified++; counts[before.px > 0 ? 'itm' : 'worthless']++; continue; }
    if (s.source === 'zero') counts.unverified++; else if (s.exitPrice > 0) counts.itm++; else counts.worthless++;
    if (s.approximate) counts.approximate++;
    const notes = replaceExpiryNote(r.notes, s.noteLine);
    const same = r.status === 'closed' && Math.abs(Number(r.exitPrice ?? 0) - s.exitPrice) < 0.005
      && Math.abs(Number(r.realizedPnL ?? 0) - s.realizedPnL) < 0.005 && (r.notes ?? '') === notes;
    if (same) { unchanged++; continue; }
    const fromPnl = r.status === 'closed' ? Number(r.realizedPnL ?? 0) : null;
    const day = String(r.expiryDate).slice(0, 10);
    changes.push({
      id: r.id,
      symbol: r.symbol,
      contract: `${r.symbol} ${r.strikePrice ?? '?'}${String(r.optionType || '').toLowerCase() === 'put' ? 'P' : 'C'} ${day}`,
      from: { exitPrice: r.status === 'closed' ? Number(r.exitPrice ?? 0) : null, realizedPnL: fromPnl, source: r.status === 'open' ? 'open' : before?.source ?? 'legacy' },
      to: { exitPrice: s.exitPrice, realizedPnL: s.realizedPnL, source: s.source, underlyingPrint: s.underlyingPrint, approximate: s.approximate },
      // An open row was read by the client at $0 — that is the baseline its delta is measured from.
      delta: Math.round((s.realizedPnL - (fromPnl ?? intrinsicSettlement(r, null).realizedPnL)) * 100) / 100,
      patch: {
        status: 'closed', exitPrice: s.exitPrice, exitTime: s.exitTime, realizedPnL: s.realizedPnL, grossPnL: s.grossPnL,
        realizedPnLPercent: s.realizedPnLPercent, holdingMinutes: s.holdingMinutes, outcome: s.outcome, notes,
      },
    });
  }
  const bySym = new Map<string, { rows: number; delta: number }>();
  for (const c of changes) {
    const b = bySym.get(c.symbol) ?? { rows: 0, delta: 0 };
    b.rows++; b.delta = Math.round((b.delta + c.delta) * 100) / 100;
    bySym.set(c.symbol, b);
  }
  const summary: ResettleSummary = {
    scanned: rows.length,
    eligible: eligible.length,
    changed: changes.length,
    unchanged,
    keptVerified,
    pnlDelta: Math.round(changes.reduce((s, c) => s + c.delta, 0) * 100) / 100,
    counts,
    bySymbol: [...bySym.entries()].map(([symbol, v]) => ({ symbol, ...v })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    changes: changes.map(({ patch: _p, ...c }) => c),
  };
  return { summary, changes };
}
