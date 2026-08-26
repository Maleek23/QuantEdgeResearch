/**
 * POLYGON / MASSIVE NEWS → CATALYSTS
 *
 * The catalysts table this writes to had zero rows. Not "few" — zero. Every
 * consequence of that was load-bearing:
 *
 *   • generateCatalyst() in quant-ideas-generator never found a real event, so
 *     100% of published ideas carried a technical pattern dressed as a catalyst.
 *   • hasEventCatalyst (quant-ideas-generator) was permanently false, so
 *     short-discipline could never see the event a short is supposed to need.
 *   • is_news_catalyst was true on 0 of 336 ideas.
 *   • scoreCatalystLayer in the convictions engine had nothing to score.
 *
 * The platform did have a catalyst producer — createCatalystFromFiling in
 * catalyst-intelligence-service — but it writes catalyst_events, a DIFFERENT
 * table, which storage.getAllCatalysts() does not read. Producer and consumer
 * were never connected, so the table could not fill no matter how long it ran.
 *
 * This writes to `catalysts`, the table that is actually read.
 *
 * Source is Massive's ticker-news endpoint, which is available on the FREE tier
 * and returns per-ticker sentiment with reasoning. Worth noting what that buys:
 * on the day this was written MRNA was the session's largest mover at +13.7%,
 * and this feed carried "Moderna's cancer vaccine achieved its primary goals in
 * first-ever late-stage trial" tagged MRNA/positive. The platform had generated
 * no MRNA idea and had no way to see why it moved.
 */

import { logger } from './logger';
import { storage } from './storage';
import type { InsertCatalyst } from '@shared/schema';

const NEWS_API = 'https://api.polygon.io/v2/reference/news';

interface PolygonInsight {
  ticker?: string;
  sentiment?: string;
  sentiment_reasoning?: string;
}

interface PolygonNewsArticle {
  id?: string;
  title?: string;
  description?: string;
  article_url?: string;
  published_utc?: string;
  tickers?: string[];
  publisher?: { name?: string };
  insights?: PolygonInsight[];
}

/**
 * Map a headline to the eventType vocabulary the rest of the platform already
 * uses ('earnings' | 'fda' | 'guidance' | 'news' ...). Deliberately conservative:
 * anything not clearly classifiable stays 'news' rather than being forced into a
 * bucket it does not belong in — a mislabelled event type would flow straight
 * into the catalyst scoring layer.
 */
function classifyEvent(title: string): string {
  // Title ONLY. Classifying off the description matched unrelated context from
  // multi-ticker roundups and produced results like "Oklo Isn't Exactly an AI
  // Stock. Here's Why I Love It Anyway" scored as an FDA event.
  const t = title.toLowerCase();
  if (/\bearnings\b|\bq[1-4] results\b|\bquarterly results\b|\bbeats? (earnings|estimates)\b|\bmisses? estimates\b/.test(t)) return 'earnings';
  if (/\bfda\b|\bphase [123]\b|\bclinical trial\b|\bapproval\b|\bendpoints? (met|hit)\b/.test(t)) return 'fda';
  if (/\braises? guidance\b|\bcuts? guidance\b|\bguidance\b|\boutlook (raised|cut)\b/.test(t)) return 'guidance';
  if (/\bupgrade[sd]?\b|\bdowngrade[sd]?\b|\bprice target\b|\binitiates? coverage\b/.test(t)) return 'analyst';
  if (/\bacquisition\b|\bmerger\b|\bbuyout\b|\bto acquire\b|\bagrees? to buy\b/.test(t)) return 'ma';
  if (/\bsec (charges|probe)\b|\blawsuit\b|\binvestigation\b|\bindict\w+|\bsubpoena\b|\brecall\b/.test(t)) return 'legal';
  if (/\bwins? contract\b|\bawarded\b|\bpartnership with\b|\bsigns? deal\b/.test(t)) return 'contract';
  return 'news';
}

/**
 * Opinion and speculation, which financial media produces far more of than it
 * produces events. "Prediction: X Will Soar", "Here's Why I Love It", "Is It a
 * Buy?" are columns, not catalysts — and this feed goes straight to the gate
 * that decides whether a SHORT has a real reason behind it. Treat these as
 * commentary so they can never satisfy that gate.
 */
function isOpinionPiece(title: string): boolean {
  const t = title.toLowerCase();
  return /\bprediction:|\bhere'?s why\b|\bis it a buy\b|\bshould you buy\b|\b\d+ reasons?\b|\bcould (soar|surge|crash|help)\b|\bwhy i \b|\bbetter buy\b|\bmy top\b|\bbest stocks?\b|\bwhere will\b/.test(t);
}

/**
 * Impact from the strength of the signal we actually have, not from a guess.
 * A multi-ticker roundup mentioning a name in passing is not a high-impact
 * catalyst for that name, so breadth REDUCES confidence rather than raising it.
 */
function classifyImpact(article: PolygonNewsArticle, eventType: string, hasInsight: boolean): 'high' | 'medium' | 'low' {
  const tickerCount = article.tickers?.length ?? 0;
  const isMarketWideRoundup = tickerCount > 6;
  if (isMarketWideRoundup) return 'low';
  const highValueEvent = eventType === 'earnings' || eventType === 'fda' || eventType === 'ma' || eventType === 'guidance';
  if (highValueEvent && hasInsight && tickerCount <= 3) return 'high';
  if (highValueEvent || (hasInsight && tickerCount <= 3)) return 'medium';
  return 'low';
}

async function fetchNewsForSymbol(symbol: string, key: string, limit: number): Promise<PolygonNewsArticle[]> {
  const url = `${NEWS_API}?ticker=${encodeURIComponent(symbol)}&order=desc&limit=${limit}&apiKey=${key}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: any = await res.json();
  if (data?.status && data.status !== 'OK' && data.status !== 'DELAYED') {
    throw new Error(data?.message || data.status);
  }
  return (data?.results ?? []) as PolygonNewsArticle[];
}

/**
 * Pull recent news for the given symbols and persist anything new as a catalyst.
 * Returns the number of rows written. Never throws — a news outage must not take
 * down the scan that calls it.
 */
export async function ingestNewsCatalysts(
  symbols: string[],
  opts: { perSymbol?: number; maxAgeHours?: number } = {},
): Promise<number> {
  const key = process.env.POLYGON_API_KEY?.trim();
  if (!key) {
    logger.debug('[NEWS] POLYGON_API_KEY not set — skipping news catalyst ingest');
    return 0;
  }

  const perSymbol = opts.perSymbol ?? 5;
  const maxAgeMs = (opts.maxAgeHours ?? 72) * 3600_000;
  const cutoff = Date.now() - maxAgeMs;

  // Dedupe against what is already stored. The table is small and this runs on a
  // slow cadence, so one read beats a uniqueness migration.
  let existing = new Set<string>();
  try {
    const rows = await storage.getAllCatalysts();
    existing = new Set(rows.map((c: any) => `${String(c.symbol).toUpperCase()}|${c.title}`));
  } catch (error) {
    logger.warn('[NEWS] could not read existing catalysts for dedupe:', error);
  }

  let written = 0;
  let failed = 0;

  for (const symbol of symbols) {
    const sym = symbol.toUpperCase();
    let articles: PolygonNewsArticle[];
    try {
      articles = await fetchNewsForSymbol(sym, key, perSymbol);
    } catch (error) {
      failed++;
      logger.debug(`[NEWS] ${sym}: ${(error as Error).message}`);
      // The free tier is rate-limited; back off rather than hammering through.
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }

    for (const article of articles) {
      const title = article.title?.trim();
      if (!title) continue;

      const publishedMs = article.published_utc ? Date.parse(article.published_utc) : NaN;
      if (!Number.isFinite(publishedMs) || publishedMs < cutoff) continue;

      const dedupeKey = `${sym}|${title}`;
      if (existing.has(dedupeKey)) continue;

      // Only keep the insight written about THIS ticker. A roundup carries an
      // insight per ticker and attaching the wrong one would invert the read.
      const insight = (article.insights ?? []).find(
        (i) => i.ticker?.toUpperCase() === sym,
      );
      const opinion = isOpinionPiece(title);
      const eventType = opinion ? 'news' : classifyEvent(title);
      const impact = opinion ? 'low' : classifyImpact(article, eventType, !!insight);

      const sentimentNote = insight?.sentiment
        ? `[${insight.sentiment}] ${insight.sentiment_reasoning ?? ''}`.trim()
        : '';
      const description = [sentimentNote, article.description?.trim()]
        .filter(Boolean)
        .join(' — ')
        .slice(0, 1200) || title;

      const row: InsertCatalyst = {
        symbol: sym,
        title: title.slice(0, 300),
        description,
        // Prefix marks commentary so a consumer can exclude it without
        // re-parsing the headline.
        source: `${opinion ? 'opinion' : 'news'}:${article.publisher?.name ?? 'massive'}`,
        sourceUrl: article.article_url ?? null,
        timestamp: new Date(publishedMs).toISOString(),
        eventType,
        impact,
      };

      try {
        await storage.createCatalyst(row);
        existing.add(dedupeKey);
        written++;
      } catch (error) {
        logger.debug(`[NEWS] write failed for ${sym}: ${(error as Error).message}`);
      }
    }

    // Free tier is 5 requests/minute. Pace deliberately.
    await new Promise((r) => setTimeout(r, 1200));
  }

  if (written > 0 || failed > 0) {
    logger.info(`[NEWS] ingested ${written} catalyst${written === 1 ? '' : 's'} from ${symbols.length} symbols${failed ? ` (${failed} fetch failure${failed === 1 ? '' : 's'})` : ''}`);
  }
  return written;
}
