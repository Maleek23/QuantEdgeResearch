/**
 * PUBLIC SHOWCASE DATA — the landing's live numbers (GET /api/public/showcase,
 * no auth, 15 s server cache), polled every 15 s while a consumer is mounted.
 *
 * Data only. The landing's product visuals are the REAL app (real-frame.tsx);
 * the hand-built marketing panels that used to live here were removed
 * (operator rule 2026-10-07: never a recreation of the UI). Consumers: the stat
 * strip (bar-verified record) and the track-record band (paper ledger, delayed ideas).
 */
import { useEffect, useState } from 'react';
import type { PublicRecord } from '@shared/landing-record';

type Section<T> = { data: T | null; asOf: string | null; error?: string };
type Quote = { symbol: string; price: number; changePct: number | null; source: string; asOf: string; delayed?: boolean };
type Gex = {
  symbol: string; spot: number; callWall: number | null; putWall: number | null; zeroGamma: number | null;
  wallBasisLabel?: string; maxGammaStrike: number | null; regime: string | null; netGexB: number | null; source: string | null;
  chainAgeMs: number | null; delayedFeed: boolean; profile: Array<{ strike: number; netGex: number }>;
};
type Idea = { symbol: string; side: string; band: string | null; publishedAt: string; outcome: string | null; percentGain: number | null; assetType: string };
type Mover = { symbol: string; name: string; price: number; change24h: number };
type Catalyst = { symbol: string; date: string; estimate: string | null };
export type ShowcaseBot = {
  closed: number; open: number; wins: number; winRate: number | null; minSample: number; netRealizedPnL: number;
  avgWinPct: number | null; avgLossPct: number | null; profitFactor: number | null; since: string | null;
  runLabel: string | null; startingCapital: number | null;
};
export type Showcase = {
  builtAt: string; quotes: Section<Quote[]>; gex: Section<Gex>; ideas: Section<Idea[]>;
  crypto: Section<Mover[]>; catalysts: Section<Catalyst[]>; bot: Section<ShowcaseBot>;
  /** Bar-verified NEXUS record (shared/landing-record.ts) — absent on older servers. */
  record?: Section<PublicRecord>;
};

const POLL_MS = 15_000;

/* One shared poll for every consumer on the page — one request per 15 s. */
type Store = { data: Showcase | null; failed: boolean };
let store: Store = { data: null, failed: false };
const subs = new Set<(s: Store) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
async function loadShowcase() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  try {
    const r = await fetch('/api/public/showcase', { credentials: 'omit' });
    if (!r.ok) throw new Error(String(r.status));
    store = { data: (await r.json()) as Showcase, failed: false };
  } catch { store = { ...store, failed: true }; }
  subs.forEach((f) => f(store));
}

/** The showcase payload, polled every 15 s while at least one consumer is active. */
export function useShowcase(active: boolean) {
  const [s, setS] = useState<Store>(store);
  useEffect(() => {
    if (!active) return;
    subs.add(setS);
    setS(store);
    if (!timer) { loadShowcase(); timer = setInterval(loadShowcase, POLL_MS); }
    return () => {
      subs.delete(setS);
      if (!subs.size && timer) { clearInterval(timer); timer = null; }
    };
  }, [active]);
  return s;
}
