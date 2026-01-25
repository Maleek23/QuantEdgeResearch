/**
 * Universal Search Service
 *
 * Searches across all platform data:
 * - Stocks (symbols, company names)
 * - Trade Ideas (by symbol, catalyst, strategy)
 * - News Articles (keywords, symbols mentioned)
 * - Actions (quick commands like "chart AAPL")
 * - Help Topics
 */

import { db } from './db';
import { tradeIdeas } from '../shared/schema';
import { ilike, or, sql, desc } from 'drizzle-orm';
import { fetchAlphaVantageNews, type NewsArticle } from './news-service';
import type {
  SearchResponse,
  AnySearchResult,
  StockSearchResult,
  TradeIdeaSearchResult,
  NewsSearchResult,
  ActionSearchResult,
  HelpSearchResult,
  SearchCategory,
  SearchSuggestion,
  TrendingSearch,
} from '../shared/search-types';
import { logger } from './logger';

// Popular stock symbols with company names (for quick search)
const POPULAR_STOCKS = [
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', sector: 'Technology' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', sector: 'Technology' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', sector: 'Consumer Cyclical' },
  { symbol: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', sector: 'Automotive' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', sector: 'Technology' },
  { symbol: 'META', name: 'Meta Platforms Inc.', exchange: 'NASDAQ', sector: 'Technology' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', exchange: 'NYSE', sector: 'ETF' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', exchange: 'NASDAQ', sector: 'ETF' },
  { symbol: 'BTC', name: 'Bitcoin', exchange: 'CRYPTO', sector: 'Cryptocurrency' },
  { symbol: 'ETH', name: 'Ethereum', exchange: 'CRYPTO', sector: 'Cryptocurrency' },
];

// Quick actions that users can search for
const QUICK_ACTIONS: ActionSearchResult[] = [
  {
    id: 'action-chart',
    category: 'actions',
    action: 'chart',
    label: 'Open Chart',
    title: 'Open Chart Analysis',
    subtitle: 'View interactive price chart with indicators',
    icon: '📊',
    url: '/chart',
  },
  {
    id: 'action-screen',
    category: 'actions',
    action: 'screen',
    label: 'Screen Stocks',
    title: 'Stock Screener',
    subtitle: 'Find stocks matching your criteria',
    icon: '🔬',
    url: '/discover',
  },
  {
    id: 'action-ideas',
    category: 'actions',
    action: 'ideas',
    label: 'AI Trade Ideas',
    title: 'AI Trade Ideas',
    subtitle: 'View AI-generated trade opportunities',
    icon: '🤖',
    url: '/trade-desk',
  },
  {
    id: 'action-watchlist',
    category: 'actions',
    action: 'watchlist',
    label: 'Watchlist',
    title: 'My Watchlist',
    subtitle: 'View and manage your watchlist',
    icon: '⭐',
    url: '/watchlist',
  },
  {
    id: 'action-movers',
    category: 'actions',
    action: 'movers',
    label: 'Top Movers',
    title: 'Market Movers',
    subtitle: 'Biggest gainers and losers',
    icon: '🚀',
    url: '/movers',
  },
];

// Help topics for documentation
const HELP_TOPICS: HelpSearchResult[] = [
  {
    id: 'help-confidence',
    category: 'help',
    topic: 'Confidence Score',
    section: 'Analysis',
    title: 'Understanding Confidence Scores',
    description: 'Learn how our AI calculates confidence scores for trade ideas',
    icon: '📚',
    url: '/help/confidence-scores',
    tags: ['confidence', 'scoring', 'ai', 'analysis'],
  },
  {
    id: 'help-grading',
    category: 'help',
    topic: 'Stock Grading',
    section: 'Analysis',
    title: 'Stock Grading System',
    description: 'How we grade stocks from S to F based on technical and fundamental analysis',
    icon: '📚',
    url: '/help/grading',
    tags: ['grading', 'fundamentals', 'technicals', 'score'],
  },
  {
    id: 'help-vix',
    category: 'help',
    topic: 'VIX Index',
    section: 'Market Indicators',
    title: 'What is the VIX?',
    description: 'Understanding market volatility and the fear gauge',
    icon: '📚',
    url: '/help/vix',
    tags: ['vix', 'volatility', 'fear', 'market'],
  },
];

/**
 * Search stocks by symbol or company name
 */
async function searchStocks(query: string): Promise<StockSearchResult[]> {
  const results: StockSearchResult[] = [];
  const upperQuery = query.toUpperCase();

  // Search popular stocks
  for (const stock of POPULAR_STOCKS) {
    if (
      stock.symbol.includes(upperQuery) ||
      stock.name.toUpperCase().includes(upperQuery)
    ) {
      results.push({
        id: `stock-${stock.symbol}`,
        category: 'stocks',
        symbol: stock.symbol,
        companyName: stock.name,
        exchange: stock.exchange,
        title: stock.symbol,
        subtitle: stock.name,
        description: `${stock.exchange} • ${stock.sector}`,
        icon: '📈',
        url: `/stock/${stock.symbol}`,
        sector: stock.sector,
        relevanceScore: stock.symbol === upperQuery ? 100 : 80,
      });
    }
  }

  // Also search symbols from our trade ideas
  try {
    const ideas = await db
      .selectDistinct({ symbol: tradeIdeas.symbol })
      .from(tradeIdeas)
      .where(ilike(tradeIdeas.symbol, `%${upperQuery}%`))
      .limit(10);

    for (const idea of ideas) {
      if (!results.find(r => r.symbol === idea.symbol)) {
        results.push({
          id: `stock-${idea.symbol}`,
          category: 'stocks',
          symbol: idea.symbol,
          companyName: idea.symbol,
          exchange: 'UNKNOWN',
          title: idea.symbol,
          subtitle: 'Recently analyzed',
          description: 'View analysis and trade ideas',
          icon: '📈',
          url: `/stock/${idea.symbol}`,
          relevanceScore: 60,
        });
      }
    }
  } catch (error) {
    logger.error('Error searching trade ideas symbols:', error);
  }

  return results.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
}

/**
 * Search trade ideas by symbol, catalyst, or analysis
 */
async function searchTradeIdeas(query: string): Promise<TradeIdeaSearchResult[]> {
  const results: TradeIdeaSearchResult[] = [];

  try {
    const ideas = await db
      .select()
      .from(tradeIdeas)
      .where(
        or(
          ilike(tradeIdeas.symbol, `%${query}%`),
          ilike(tradeIdeas.catalyst, `%${query}%`),
          ilike(tradeIdeas.analysis, `%${query}%`)
        )
      )
      .orderBy(desc(tradeIdeas.timestamp))
      .limit(20);

    for (const idea of ideas) {
      results.push({
        id: `idea-${idea.id}`,
        category: 'ideas',
        symbol: idea.symbol,
        direction: idea.direction as 'long' | 'short',
        confidence: idea.confidenceScore,
        engine: idea.source,
        strategy: idea.catalyst,
        entryPrice: idea.entryPrice,
        targetPrice: idea.targetPrice,
        title: `${idea.symbol} ${idea.direction.toUpperCase()}`,
        subtitle: `${idea.confidenceScore}% confidence • ${idea.source}`,
        description: idea.catalyst.substring(0, 100),
        icon: idea.direction === 'long' ? '📈' : '📉',
        url: `/trade-desk?ideaId=${idea.id}`,
        createdAt: idea.timestamp,
        relevanceScore: idea.confidenceScore,
      });
    }
  } catch (error) {
    logger.error('Error searching trade ideas:', error);
  }

  return results;
}

/**
 * Search news articles (from Alpha Vantage news service)
 */
async function searchNews(query: string): Promise<NewsSearchResult[]> {
  const results: NewsSearchResult[] = [];

  try {
    // Fetch news related to query (if it's a symbol)
    const upperQuery = query.toUpperCase();
    const isSymbol = /^[A-Z]{1,5}$/.test(upperQuery);

    let articles: NewsArticle[] = [];
    if (isSymbol) {
      articles = await fetchAlphaVantageNews(upperQuery, undefined, undefined, 10);
    }

    for (const article of articles) {
      results.push({
        id: `news-${article.uuid}`,
        category: 'news',
        headline: article.title,
        source: article.source,
        publishedAt: article.timePublished,
        symbols: article.tickers,
        sentiment: article.overallSentimentLabel.includes('Bullish')
          ? 'positive'
          : article.overallSentimentLabel.includes('Bearish')
          ? 'negative'
          : 'neutral',
        title: article.title,
        subtitle: article.source,
        description: article.summary.substring(0, 150),
        icon: '📰',
        url: article.url,
        relevanceScore: parseFloat(
          article.tickerSentiments.find(t => t.ticker === upperQuery)?.relevance_score || '50'
        ),
      });
    }
  } catch (error) {
    logger.error('Error searching news:', error);
  }

  return results;
}

/**
 * Search quick actions
 */
function searchActions(query: string): ActionSearchResult[] {
  const lowerQuery = query.toLowerCase();
  return QUICK_ACTIONS.filter(
    action =>
      action.label.toLowerCase().includes(lowerQuery) ||
      action.title.toLowerCase().includes(lowerQuery) ||
      action.action.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Search help topics
 */
function searchHelp(query: string): HelpSearchResult[] {
  const lowerQuery = query.toLowerCase();
  return HELP_TOPICS.filter(
    help =>
      help.topic.toLowerCase().includes(lowerQuery) ||
      help.title.toLowerCase().includes(lowerQuery) ||
      help.tags.some(tag => tag.includes(lowerQuery))
  );
}

/**
 * Universal search across all categories
 */
export async function universalSearch(
  query: string,
  categories?: SearchCategory[]
): Promise<SearchResponse> {
  const startTime = Date.now();
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return {
      query,
      results: [],
      categories: [],
      totalResults: 0,
      searchTime: 0,
    };
  }

  const shouldSearchCategory = (category: SearchCategory) =>
    !categories || categories.length === 0 || categories.includes(category) || categories.includes('all');

  // Perform parallel searches
  const [stocks, tradeIdeasResults, news, actions, help] = await Promise.all([
    shouldSearchCategory('stocks') ? searchStocks(trimmedQuery) : Promise.resolve([]),
    shouldSearchCategory('ideas') ? searchTradeIdeas(trimmedQuery) : Promise.resolve([]),
    shouldSearchCategory('news') ? searchNews(trimmedQuery) : Promise.resolve([]),
    shouldSearchCategory('actions') ? Promise.resolve(searchActions(trimmedQuery)) : Promise.resolve([]),
    shouldSearchCategory('help') ? Promise.resolve(searchHelp(trimmedQuery)) : Promise.resolve([]),
  ]);

  // Combine all results
  const allResults: AnySearchResult[] = [
    ...stocks,
    ...tradeIdeasResults,
    ...news,
    ...actions,
    ...help,
  ];

  // Group by category
  const categoryCounts = new Map<SearchCategory, AnySearchResult[]>();
  for (const result of allResults) {
    const existing = categoryCounts.get(result.category) || [];
    existing.push(result);
    categoryCounts.set(result.category, existing);
  }

  const categoryResults = Array.from(categoryCounts.entries()).map(([category, results]) => ({
    category,
    count: results.length,
    results,
  }));

  const searchTime = Date.now() - startTime;

  logger.info(
    `🔍 [SEARCH] Query: "${trimmedQuery}" | Results: ${allResults.length} | Time: ${searchTime}ms`
  );

  return {
    query: trimmedQuery,
    results: allResults,
    categories: categoryResults,
    totalResults: allResults.length,
    searchTime,
  };
}

/**
 * Get search suggestions for autocomplete
 */
export async function getSearchSuggestions(query: string): Promise<SearchSuggestion[]> {
  const suggestions: SearchSuggestion[] = [];
  const upperQuery = query.toUpperCase();

  // Suggest popular stocks
  for (const stock of POPULAR_STOCKS) {
    if (stock.symbol.startsWith(upperQuery) || stock.name.toUpperCase().includes(upperQuery)) {
      suggestions.push({
        text: stock.symbol,
        category: 'stocks',
        icon: '📈',
        metadata: { companyName: stock.name },
      });
    }
  }

  // Suggest actions
  const lowerQuery = query.toLowerCase();
  for (const action of QUICK_ACTIONS) {
    if (action.label.toLowerCase().includes(lowerQuery)) {
      suggestions.push({
        text: action.label,
        category: 'actions',
        icon: action.icon,
      });
    }
  }

  return suggestions.slice(0, 8); // Limit to 8 suggestions
}

/**
 * Get trending searches (mock data for now)
 */
export async function getTrendingSearches(): Promise<TrendingSearch[]> {
  return [
    { query: 'NVDA', category: 'stocks', count: 150, trendDirection: 'up' },
    { query: 'TSLA', category: 'stocks', count: 120, trendDirection: 'up' },
    { query: 'AI stocks', category: 'stocks', count: 95, trendDirection: 'stable' },
    { query: 'earnings', category: 'news', count: 80, trendDirection: 'up' },
    { query: 'SPY', category: 'stocks', count: 75, trendDirection: 'stable' },
  ];
}

/**
 * Store recent search in localStorage (client-side)
 * This function is just a type definition for the client
 */
export interface RecentSearchStorage {
  userId: string;
  query: string;
  category: SearchCategory;
  timestamp: string;
  resultClicked?: string;
}
