/**
 * StockTwits Service
 *
 * Per-symbol social sentiment from StockTwits' public symbol stream API.
 * No auth required; rate-limited (~200 req/hour by IP).
 *
 * Endpoint: https://api.stocktwits.com/api/2/streams/symbol/{SYMBOL}.json
 *
 * Returns the last ~30 messages with user-tagged Bullish/Bearish sentiment,
 * which lets us compute a real bull/bear ratio per ticker — the missing piece
 * in `sentiment-scorer.ts` (currently a placeholder) and `social-sentiment-scanner.ts`
 * (currently WSB-only).
 */
import { logger } from './logger';

const STOCKTWITS_BASE = 'https://api.stocktwits.com/api/2/streams/symbol';
const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export interface StockTwitsMessage {
  id: number;
  body: string;
  created_at: string;
  user: {
    username: string;
    followers: number;
    ideas: number;
  };
  sentiment: 'Bullish' | 'Bearish' | null;
  likes: number;
  url: string;
}

export interface StockTwitsSymbolSentiment {
  symbol: string;
  fetchedAt: string;
  messageCount: number;
  bullishCount: number;
  bearishCount: number;
  untaggedCount: number;
  bullishRatio: number;       // 0..1 over tagged messages, 0.5 if none tagged
  sentimentScore: number;     // -100..+100
  topMessages: StockTwitsMessage[];
  watchersAddedToday?: number;
  totalWatchers?: number;
  source: 'stocktwits';
}

const cache = new Map<string, { data: StockTwitsSymbolSentiment; expires: number }>();

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'QuantEdge-Research/1.0',
        'Accept': 'application/json',
      },
    });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fetch raw StockTwits symbol stream. Returns null on error so callers can
 * decide whether to fall back to placeholder sentiment.
 */
export async function fetchStockTwitsStream(symbol: string): Promise<{
  messages: StockTwitsMessage[];
  watchlistCount?: number;
} | null> {
  const sym = symbol.toUpperCase().replace(/^\$/, '');
  const url = `${STOCKTWITS_BASE}/${encodeURIComponent(sym)}.json`;

  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    if (!res.ok) {
      if (res.status === 429) {
        logger.warn(`[StockTwits] rate-limited on ${sym}`);
      } else if (res.status === 404) {
        logger.info(`[StockTwits] no stream for ${sym} (404)`);
      } else {
        logger.warn(`[StockTwits] HTTP ${res.status} on ${sym}`);
      }
      return null;
    }

    const data: any = await res.json();
    const messages: StockTwitsMessage[] = (data?.messages ?? []).map((m: any) => ({
      id: m.id,
      body: String(m.body ?? ''),
      created_at: m.created_at,
      user: {
        username: m?.user?.username ?? 'unknown',
        followers: Number(m?.user?.followers ?? 0),
        ideas: Number(m?.user?.ideas ?? 0),
      },
      sentiment:
        m?.entities?.sentiment?.basic === 'Bullish'
          ? 'Bullish'
          : m?.entities?.sentiment?.basic === 'Bearish'
          ? 'Bearish'
          : null,
      likes: Number(m?.likes?.total ?? 0),
      url: `https://stocktwits.com/${m?.user?.username ?? ''}/message/${m.id}`,
    }));

    return {
      messages,
      watchlistCount: Number(data?.symbol?.watchlist_count ?? 0) || undefined,
    };
  } catch (err: any) {
    logger.warn(`[StockTwits] fetch failed for ${sym}: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * Compute per-symbol sentiment. Cached for 5 min to stay under rate limits.
 */
export async function getStockTwitsSentiment(
  symbol: string,
  opts: { force?: boolean } = {}
): Promise<StockTwitsSymbolSentiment | null> {
  const sym = symbol.toUpperCase().replace(/^\$/, '');
  const cached = cache.get(sym);
  if (!opts.force && cached && cached.expires > Date.now()) return cached.data;

  const stream = await fetchStockTwitsStream(sym);
  if (!stream) return null;

  const { messages, watchlistCount } = stream;
  const bullish = messages.filter(m => m.sentiment === 'Bullish').length;
  const bearish = messages.filter(m => m.sentiment === 'Bearish').length;
  const untagged = messages.length - bullish - bearish;
  const tagged = bullish + bearish;
  const bullishRatio = tagged > 0 ? bullish / tagged : 0.5;
  const sentimentScore = Math.round((bullishRatio - 0.5) * 200); // -100..+100

  // Top messages = highest engagement
  const topMessages = [...messages]
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 5);

  const result: StockTwitsSymbolSentiment = {
    symbol: sym,
    fetchedAt: new Date().toISOString(),
    messageCount: messages.length,
    bullishCount: bullish,
    bearishCount: bearish,
    untaggedCount: untagged,
    bullishRatio,
    sentimentScore,
    topMessages,
    totalWatchers: watchlistCount,
    source: 'stocktwits',
  };

  cache.set(sym, { data: result, expires: Date.now() + CACHE_TTL_MS });
  return result;
}

/**
 * Batch fetch with sequential pacing to respect rate limits.
 * Returns a map keyed by uppercase symbol; missing entries = fetch failed.
 */
export async function getStockTwitsSentimentBatch(
  symbols: string[],
  opts: { delayMs?: number } = {}
): Promise<Map<string, StockTwitsSymbolSentiment>> {
  const out = new Map<string, StockTwitsSymbolSentiment>();
  const delay = opts.delayMs ?? 350;
  for (const s of symbols) {
    const r = await getStockTwitsSentiment(s);
    if (r) out.set(r.symbol, r);
    if (delay > 0) await new Promise(res => setTimeout(res, delay));
  }
  return out;
}
