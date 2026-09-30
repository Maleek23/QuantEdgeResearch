import { PUBLIC_PAGE_META } from "@shared/public-seo";
export interface SEOMetadata {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: "summary" | "summary_large_image";
  keywords?: string[];
  canonical?: string;
}

// Keywords describe what the product does (docs/POSITIONING.md) — no "AI trading" bait.
const CORE_KEYWORDS = [
  "trading research terminal",
  "gamma exposure",
  "GEX",
  "dealer positioning",
  "options flow",
  "dark pool levels",
  "0DTE",
  "gamma squeeze",
  "stock research",
  "options research",
  "crypto research",
  "trade ideas",
  "trading journal",
  "paper trading",
  "track record",
];

// docs/POSITIONING.md is the source for these sentences.
const DEFINITION = "A trading research terminal for stocks, options and crypto: dealer positioning, options flow, evidence-ranked setups, a paper-trading bot and trading journals.";

export const DEFAULT_SEO: SEOMetadata = {
  title: "QuantEdge Labs | Trading Research Terminal",
  description: DEFINITION,
  ogImage: "/og-image.png",
  twitterCard: "summary_large_image",
  keywords: CORE_KEYWORDS,
};

export const PAGE_SEO: Record<string, SEOMetadata> = {
  howTo: { ...PUBLIC_PAGE_META["/how-to"] },
  privacy: { ...PUBLIC_PAGE_META["/privacy"] },
  terms: { ...PUBLIC_PAGE_META["/terms"] },

  landing: {
    ...PUBLIC_PAGE_META["/"],
    ogTitle: "QuantEdge Labs | Trading Research Terminal",
    ogDescription: "Dealer positioning, options flow, evidence-ranked setups, charts, a paper-trading bot and trading journals in one terminal. Every number carries its evidence and its record.",
    keywords: CORE_KEYWORDS,
  },

  home: {
    title: "Terminal | QuantEdge Labs",
    description: DEFINITION,
    ogTitle: "QuantEdge Labs | Trading Research Terminal",
    ogDescription: DEFINITION,
    keywords: CORE_KEYWORDS,
  },

  pricing: {
    title: "Pricing | QuantEdge Labs Trading Research Terminal",
    description: "Start free on the QuantEdge terminal — dealer positioning, options flow, evidence-ranked setups and trading journals. Upgrade for unlimited access.",
    ogTitle: "QuantEdge Labs Pricing - Free Trading Tools",
    ogDescription: "Plans for the QuantEdge trading research terminal.",
    keywords: [
      "trading terminal pricing",
      "options flow pricing",
      "gamma exposure tool",
      "trading journal pricing",
    ],
  },
  about: {
    ...PUBLIC_PAGE_META["/about"],
    keywords: [
      "about QuantEdge Labs",
      "trading research terminal",
      "quantitative fintech",
      "quantitative trading company",
    ],
  },
  blog: {
    ...PUBLIC_PAGE_META["/blog"],
    keywords: [
      "quantitative trading strategies",
      "quantitative investing",
    ],
  },
  successStories: {
    title: "Track Record | Published Ideas & Outcomes - QuantEdge Labs",
    description: "The platform's published ideas and how they did — wins and losses, each rate with its sample size.",
    ogTitle: "QuantEdge Track Record",
    ogDescription: "Every published idea and its outcome, with sample sizes.",
    keywords: [
      "quantitative trading success",
    ],
  },
  tradeDesk: {
    title: "NEXUS | Evidence-Ranked Setups - QuantEdge Labs",
    description: "Evidence-ranked setups with entry, stop and target, graded after the fact — model ideas for research, not recommendations.",
    ogTitle: "QuantEdge Labs Trade Desk",
    ogDescription: "Evidence-ranked setups and confluence analysis for stocks, options and crypto — research, not recommendations.",
    keywords: [
      "real-time trading signals",
      "trading terminal",
      "quantitative trade signals",
    ],
  },
  performance: {
    title: "Trading Performance | Analytics & Win Rates - QuantEdge Labs",
    description: "Transparent trading performance metrics. Track hit rates, returns, and analytics across each scanner source — with sample sizes and breakeven thresholds disclosed.",
    ogTitle: "QuantEdge Labs Performance Analytics",
    ogDescription: "Transparent performance tracking for our quantitative confluence trading signals.",
    keywords: [
      "quantitative trading win rate",
    ],
  },
  chartAnalysis: {
    title: "Chart Analysis | Pattern Recognition - QuantEdge Labs",
    description: "Upload trading charts for instant pattern recognition. Quantitative analysis identifies support, resistance, trends, and trading opportunities automatically.",
    ogTitle: "Chart Analysis - Instant Pattern Recognition",
    ogDescription: "Chart pattern recognition and technical analysis. Upload any chart for instant quantitative insights.",
    keywords: [
      "quantitative technical analysis",
      "automated chart analysis",
    ],
  },
  academy: {
    ...PUBLIC_PAGE_META["/academy"],
    keywords: [
      "quantitative trading tutorial",
      "algorithmic trading course",
      "quantitative trading education",
    ],
  },
  discover: {
    title: "Stock Discovery | QuantEdge Labs",
    description: "Discover high-potential stocks with quantitative scoring. Our scanners analyze thousands of stocks to find breakout candidates, momentum plays, and undervalued opportunities.",
    ogTitle: "Stock Discovery - Find Your Next Trade",
    ogDescription: "Quantitative stock discovery. Let confluence scoring find your next winning trade.",
    keywords: [
      "quantitative stock picks",
      "automated stock discovery",
    ],
  },
  research: {
    title: "Ticker Research | Dealer Map, Chart, Options and Setups - QuantEdge Labs",
    description: "Search a ticker, get one page: live price, dealer map, chart with walls and zero-gamma, options flow, setups and the name's own record.",
    ogTitle: "Stock Research - Deep Analysis",
    ogDescription: "One page per ticker: dealer positioning, chart, options and setups, with sources and ages.",
    keywords: [
      "quantitative stock analysis",
      "automated stock research",
    ],
  },
};

export function generateSEO(pageKey?: string, overrides?: Partial<SEOMetadata>): SEOMetadata {
  const pageSeo: Partial<SEOMetadata> = pageKey && PAGE_SEO[pageKey] ? PAGE_SEO[pageKey] : {};
  // SEOHead passes every prop, most of them undefined — and spreading
  // {title: undefined} OVERWRITES the page's title. Every page using SEOHead
  // shipped with document.title "undefined" (UI validation 2026-09-24).
  const set = Object.fromEntries(
    Object.entries(overrides ?? {}).filter(([, v]) => v !== undefined),
  ) as Partial<SEOMetadata>;

  return {
    ...DEFAULT_SEO,
    ...pageSeo,
    ...set,
    ogTitle: overrides?.ogTitle || pageSeo.ogTitle || overrides?.title || pageSeo.title || DEFAULT_SEO.title,
    ogDescription: overrides?.ogDescription || pageSeo.ogDescription || overrides?.description || pageSeo.description || DEFAULT_SEO.description,
  };
}

export function formatTitle(title: string, siteName: string = "QuantEdge Labs"): string {
  if (title.includes(siteName)) return title;
  return `${title} | ${siteName}`;
}

// Generate dynamic SEO for stock detail pages
export function generateStockSEO(symbol: string, companyName?: string): SEOMetadata {
  const name = companyName || symbol;
  return {
    title: `${symbol} Research | Dealer Map, Flow and Setups - QuantEdge Labs`,
    description: `${name} (${symbol}) on QuantEdge: dealer positioning, options flow, chart levels and evidence-ranked setups, each with its source and age.`,
    ogTitle: `${symbol} Stock Analysis - QuantEdge Labs`,
    ogDescription: `Quantitative analysis for ${name}. Confluence scoring, technical patterns, and research.`,
    keywords: [
      `${symbol} stock prediction`,
      `${symbol} quantitative analysis`,
      `${symbol} trading signals`,
    ],
    twitterCard: "summary_large_image",
    ogImage: "/og-image.png",
  };
}

// Generate dynamic SEO for blog posts
export function generateBlogPostSEO(title: string, excerpt: string, slug: string): SEOMetadata {
  return {
    title: `${title} | QuantEdge Labs Research`,
    description: excerpt.slice(0, 160),
    ogTitle: title,
    ogDescription: excerpt.slice(0, 160),
    canonical: `https://quantedgelabs.net/blog/${slug}`,
    keywords: [
      "quantitative trading",
      "stock analysis",
      ...title.toLowerCase().split(' ').filter(w => w.length > 4),
    ],
    twitterCard: "summary_large_image",
    ogImage: "/og-image.png",
  };
}
