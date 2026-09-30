/**
 * PEER CONFIRMATION — does the rest of the group agree with this idea?
 *
 * The old sector layer read one number: the sector ETF's change relative to
 * SPY. That misses the question a trader actually asks before taking MU long —
 * "are STX, WDC and SNDK bid too?" A name moving alone is a different trade from
 * a name moving with its complex, and an ETF can be flat while the handful of
 * names that matter for THIS idea are all moving one way.
 *
 * This layer reads the idea's 3–5 closest peers (shared/sector-peers.ts) AND
 * the group ETF, and scores agreement with the idea's direction:
 *
 *   peer vote     a peer CONFIRMS when it has moved ≥ 1% the idea's way today,
 *                 is AGAINST when it has moved ≥ 1% the other way, else flat.
 *                 peer points = round(6 × (confirm − against) / peers read)
 *                 → −6 … +6
 *   ETF vote      group ETF change minus SPY change (relative, so a broad tape
 *                 move is not mistaken for group rotation):
 *                 ≥ +2% → +3, ≥ +0.5% → +2, ≤ −0.5% → −3, ≤ −2% → −5
 *                 (headwind weighted harder than tailwind, as before)
 *   total         clamped to −10 … +8
 *
 * Every read is stated in the why-line — "3 of 4 memory/storage peers up >1%
 * (STX +2.4%, WDC +1.8%, SNDK +1.2%) · SMH +0.9% vs SPY — confirms" — and a
 * move from a previous session is labelled as such, never passed off as today.
 *
 * These weights are a stated prior, not a fitted model: the 2026-09-29 rating
 * study (research/rating-accuracy-2026-09-29.md) found the conviction score as a
 * whole has no demonstrated skill, so this layer is explanation first. Do not
 * raise its weight until a walk-forward shows peer agreement predicts outcome.
 *
 * QUOTES: one batched Yahoo "spark" request per 20 symbols, through the shared
 * Yahoo rate limiter, cached 3 minutes. The conviction build prefetches every
 * top pick's peer set in one pass (prefetchPeerMoves) so scoring a pick never
 * fans out a request of its own.
 */
import { logger } from './logger';
import { getPeerSet, type PeerSet } from '@shared/sector-peers';
import { BoundedCache } from './lib/bounded-cache';

export interface PeerMove {
  symbol: string;
  price: number;
  changePct: number;
  /** Epoch ms of the print the change was measured at. */
  atMs: number;
}

interface CacheEntry { move: PeerMove | null; fetchedAt: number }

const CACHE_TTL_MS = 3 * 60_000;
const CHUNK = 20;
const YAHOO_MIN_GAP_MS = 350; // same cadence yahoo-client uses for the shared limiter
const cache = new BoundedCache<string, CacheEntry>({ name: 'peerConfirmation', maxEntries: 400, ttlMs: 6 * 3_600_000 });

function fresh(e: CacheEntry | undefined): boolean {
  return !!e && Date.now() - e.fetchedAt < CACHE_TTL_MS;
}

async function fetchSparkChunk(symbols: string[]): Promise<Map<string, PeerMove>> {
  const out = new Map<string, PeerMove>();
  const { rateLimited } = await import('./provider-cache');
  const { toYahooSymbol } = await import('./yahoo-client');
  const provider = symbols.map((s) => toYahooSymbol(s));
  const back = new Map(provider.map((p, i) => [p, symbols[i]]));
  await rateLimited('yahoo', YAHOO_MIN_GAP_MS, async () => {
    for (const host of ['query1', 'query2']) {
      try {
        const r = await fetch(
          `https://${host}.finance.yahoo.com/v7/finance/spark?symbols=${provider.map(encodeURIComponent).join(',')}&range=1d&interval=15m`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } },
        );
        if (r.status === 429) { logger.warn('[PEERS] Yahoo 429 on spark — peer read skipped this pass'); return; }
        if (!r.ok) continue;
        const j: any = await r.json();
        for (const row of j?.spark?.result ?? []) {
          const meta = row?.response?.[0]?.meta;
          const sym = back.get(String(row?.symbol ?? '').toUpperCase()) ?? String(row?.symbol ?? '').toUpperCase();
          const price = Number(meta?.regularMarketPrice);
          const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
          let chg = Number(meta?.regularMarketChangePercent);
          if (!Number.isFinite(chg) && price > 0 && prev > 0) chg = ((price - prev) / prev) * 100;
          const at = Number(meta?.regularMarketTime) * 1000;
          if (sym && price > 0 && Number.isFinite(chg)) {
            out.set(sym, { symbol: sym, price, changePct: chg, atMs: Number.isFinite(at) ? at : Date.now() });
          }
        }
        return;
      } catch {
        /* try the other host */
      }
    }
  });
  return out;
}

/**
 * Fetch (or serve from cache) the day move for every symbol. Missing symbols are
 * negatively cached for the same TTL so a dead ticker is not re-asked each build.
 */
export async function prefetchPeerMoves(symbols: string[]): Promise<Map<string, PeerMove>> {
  const want = Array.from(new Set(symbols.map((s) => String(s).toUpperCase()).filter(Boolean)));
  const missing = want.filter((s) => !fresh(cache.get(s)));
  if (missing.length > 0) {
    try {
      const { yahooBackoffRemainingMs } = await import('./yahoo-client');
      if (yahooBackoffRemainingMs() === 0) {
        for (let i = 0; i < missing.length; i += CHUNK) {
          const slice = missing.slice(i, i + CHUNK);
          const got = await fetchSparkChunk(slice);
          const now = Date.now();
          for (const s of slice) cache.set(s, { move: got.get(s) ?? null, fetchedAt: now });
        }
      }
    } catch (err) {
      logger.debug(`[PEERS] prefetch failed: ${(err as Error).message}`);
    }
  }
  const out = new Map<string, PeerMove>();
  for (const s of want) {
    const e = cache.get(s);
    if (e?.move) out.set(s, e.move);
  }
  return out;
}

/** Every symbol a peer read of `symbol` needs: peers, the group ETF, and SPY. */
export function peerSymbolsFor(symbol: string): string[] {
  const set = getPeerSet(symbol);
  if (!set) return [];
  return [...set.peers, ...(set.group.etf ? [set.group.etf] : []), 'SPY'];
}

function etDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

const fmt = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}%`;

export interface PeerLayerResult {
  kind: 'sector';
  label: string;
  points: number;
  why: string;
  data: Record<string, unknown>;
}

const MOVE_PCT = 1.0;

/**
 * Score peer + ETF agreement for one idea from the cache. Returns null when the
 * symbol has no peer group or fewer than two peers could be read — the caller
 * then falls back to the ETF-only sector read.
 */
export function scorePeerConfirmation(
  symbol: string,
  direction: 'long' | 'short',
  moves: Map<string, PeerMove>,
): PeerLayerResult | null {
  const set: PeerSet | null = getPeerSet(symbol);
  if (!set) return null;

  const read = set.peers.map((p) => moves.get(p)).filter((m): m is PeerMove => !!m);
  if (read.length < 2) return null;

  const sign = direction === 'long' ? 1 : -1;
  const confirm = read.filter((m) => sign * m.changePct >= MOVE_PCT);
  const against = read.filter((m) => sign * m.changePct <= -MOVE_PCT);
  const flat = read.length - confirm.length - against.length;
  const peerPoints = Math.round(6 * (confirm.length - against.length) / read.length);

  // ETF vs SPY — relative, so a whole-market move is not read as group rotation.
  const etf = set.group.etf ? moves.get(set.group.etf) : undefined;
  const spy = moves.get('SPY');
  let etfPoints = 0;
  let etfNote = '';
  if (etf && spy && set.group.etf !== 'SPY') {
    const rel = sign * (etf.changePct - spy.changePct);
    etfPoints = rel >= 2 ? 3 : rel >= 0.5 ? 2 : rel <= -2 ? -5 : rel <= -0.5 ? -3 : 0;
    etfNote = `${set.group.etf} ${fmt(etf.changePct)} vs SPY ${fmt(spy.changePct)}`;
  }

  const points = Math.max(-10, Math.min(8, peerPoints + etfPoints));

  // Session honesty: if the prints are not from today's session, say so.
  const today = etDate(Date.now());
  const stale = read.some((m) => etDate(m.atMs) !== today);
  const when = stale ? ' (last session)' : '';

  const dirWord = direction === 'long' ? 'up' : 'down';
  const oppWord = direction === 'long' ? 'down' : 'up';
  const list = (ms: PeerMove[]) => ms
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 3)
    .map((m) => `${m.symbol} ${fmt(m.changePct)}`)
    .join(', ');

  let lead: string;
  if (confirm.length > against.length) {
    lead = `${confirm.length} of ${read.length} ${set.group.label} peers ${dirWord} >${MOVE_PCT}%${when} (${list(confirm)})`;
  } else if (against.length > confirm.length) {
    lead = `${against.length} of ${read.length} ${set.group.label} peers ${oppWord} >${MOVE_PCT}%${when} (${list(against)})`;
  } else {
    lead = `${set.group.label} peers split${when} — ${confirm.length} ${dirWord}, ${against.length} ${oppWord}, ${flat} flat`;
  }
  // "Confirms" / "fights" need a peer MAJORITY, not just a positive sum — one
  // peer up plus a firm ETF is a lean, and the why-line should say so.
  const majority = Math.ceil(read.length / 2);
  const verdict =
    confirm.length > against.length && confirm.length >= majority && points > 0 ? 'confirms'
      : against.length > confirm.length && against.length >= majority && points < 0 ? `fights the ${direction}`
        : points > 0 ? 'leans with you'
          : points < 0 ? 'leans against'
            : 'no confirmation';
  const why = `${lead}${etfNote ? ` · ${etfNote}` : ''} — ${verdict}`;

  return {
    kind: 'sector',
    label: 'Sector & Peers',
    points,
    why,
    data: {
      group: set.group.id,
      groupLabel: set.group.label,
      etf: set.group.etf,
      etfChange: etf?.changePct ?? null,
      spyChange: spy?.changePct ?? null,
      peers: read.map((m) => ({ symbol: m.symbol, changePct: Number(m.changePct.toFixed(2)) })),
      peersUnread: set.peers.filter((p) => !moves.has(p)),
      confirm: confirm.length,
      against: against.length,
      flat,
      peerPoints,
      etfPoints,
      lastSession: stale,
      thresholdPct: MOVE_PCT,
    },
  };
}
