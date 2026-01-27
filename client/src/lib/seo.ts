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

// High-value keywords for AI trading search ranking
const CORE_KEYWORDS = [
  // Primary targets (highest search volume)
  "AI trading",
  "AI stock analysis",
  "stock research AI",
  "AI trading platform",
  "AI powered trading",

  // Secondary targets
  "machine learning trading",
  "AI trading signals",
  "AI stock picker",
  "automated stock analysis",
  "AI market analysis",

  // Long-tail keywords (lower competition, high intent)
  "best AI trading tool",
  "AI trading for beginners",
  "free AI stock analysis",
  "AI options trading",
  "AI crypto trading",

  // Feature-specific keywords
  "AI chart analysis",
  "AI technical analysis",
  "quantitative trading signals",
  "algorithmic trading platform",
  "real-time trading AI",
];

export const DEFAULT_SEO: SEOMetadata = {
  title: "Quant Edge Labs | #1 AI Trading Research Platform",
  description: "Free AI-powered stock analysis with 6 machine learning engines. Get real-time AI trading signals, chart pattern recognition, and quantitative analysis for stocks, options & crypto.",
  ogImage: "/og-image.png",
  twitterCard: "summary_large_image",
  keywords: CORE_KEYWORDS,
};

export const PAGE_SEO: Record<string, SEOMetadata> = {
  landing: {
    title: "Quant Edge Labs | AI Stock Analysis & Trading Signals Platform",
    description: "Best free AI trading platform with 6 machine learning engines analyzing stocks 24/7. Get instant AI trading signals, chart pattern recognition, and quantitative research for smarter trades.",
    ogTitle: "Quant Edge Labs - AI Trading Platform | 6 Engines, 1 Edge",
    ogDescription: "Free AI-powered stock research platform. Machine learning analysis, real-time signals, and quantitative insights for stocks, options & crypto.",
    keywords: [
      "AI trading platform",
      "AI stock analysis free",
      "machine learning trading signals",
      "best AI for stock trading",
      "AI trading software",
      "automated stock research",
      "AI investment platform",
      "stock market AI",
    ],
  },
  home: {
    title: "Dashboard | Quant Edge Labs AI Trading Platform",
    description: "Your AI trading command center. Real-time market data, AI-generated trade ideas, and quantitative signals across stocks, options, and crypto.",
    ogTitle: "Quant Edge Labs Dashboard - AI Trading Signals",
    ogDescription: "Access real-time AI trading signals and market analysis. Six machine learning engines working 24/7.",
    keywords: [
      "AI trading dashboard",
      "real-time AI signals",
      "AI market scanner",
      "stock market AI analysis",
      "AI trade ideas",
    ],
  },
  pricing: {
    title: "Pricing | Free AI Trading Platform - Quant Edge Labs",
    description: "Start free with AI stock analysis and trading signals. Upgrade for advanced ML features, unlimited scans, and priority AI insights.",
    ogTitle: "Quant Edge Labs Pricing - Free AI Trading Tools",
    ogDescription: "Free AI trading analysis. Premium plans for serious traders with advanced machine learning features.",
    keywords: [
      "free AI trading platform",
      "AI trading subscription",
      "best free AI stock analysis",
      "AI trading tools pricing",
      "machine learning trading cost",
    ],
  },
  about: {
    title: "About | Quant Edge Labs AI Trading Platform",
    description: "Built by a Model Risk Engineer combining AI, machine learning, and quantitative finance to democratize institutional-grade trading research.",
    ogTitle: "About Quant Edge Labs - AI Trading Innovation",
    ogDescription: "Meet the team building the future of AI-powered trading research and stock analysis.",
    keywords: [
      "about Quant Edge Labs",
      "AI trading startup",
      "machine learning fintech",
      "quantitative trading company",
    ],
  },
  blog: {
    title: "AI Trading Blog | Stock Analysis & Market Insights - Quant Edge Labs",
    description: "Learn AI trading strategies, machine learning market analysis, and quantitative methods. Expert insights on using AI for stock research and trading signals.",
    ogTitle: "Quant Edge Labs Blog - AI Trading Insights",
    ogDescription: "Expert AI trading education, market analysis, and machine learning strategies for traders.",
    keywords: [
      "AI trading blog",
      "machine learning trading strategies",
      "AI stock analysis tips",
      "how to use AI for trading",
      "AI trading education",
      "stock market AI insights",
      "AI trading tutorial",
      "machine learning investing",
    ],
  },
  successStories: {
    title: "AI Trading Results | Real Trades & Performance - Quant Edge Labs",
    description: "Verified AI trading results and winning trades from our 6 machine learning engines. See real performance data and trade outcomes.",
    ogTitle: "AI Trading Success Stories - Real Results",
    ogDescription: "Browse verified winning trades generated by our AI and quantitative analysis engines.",
    keywords: [
      "AI trading results",
      "AI stock picks performance",
      "machine learning trading success",
      "AI trading track record",
      "verified AI trades",
    ],
  },
  tradeDesk: {
    title: "AI Trade Desk | Real-Time Trading Signals - Quant Edge Labs",
    description: "Your AI trading command center. Access real-time machine learning signals, AI-generated trade ideas, and quantitative analysis across all markets.",
    ogTitle: "Quant Edge Labs AI Trade Desk",
    ogDescription: "Real-time AI trading signals and machine learning analysis for stocks, options, and crypto.",
    keywords: [
      "AI trade desk",
      "real-time AI signals",
      "AI trading terminal",
      "machine learning trade signals",
      "AI stock scanner",
    ],
  },
  performance: {
    title: "AI Trading Performance | Analytics & Win Rates - Quant Edge Labs",
    description: "Transparent AI trading performance metrics. Track win rates, returns, and analytics across all 6 machine learning engines.",
    ogTitle: "Quant Edge Labs AI Performance Analytics",
    ogDescription: "Transparent performance tracking for our AI and machine learning trading signals.",
    keywords: [
      "AI trading performance",
      "machine learning trading win rate",
      "AI signal analytics",
      "AI trading backtesting results",
    ],
  },
  chartAnalysis: {
    title: "AI Chart Analysis | Pattern Recognition & Technical Analysis - Quant Edge Labs",
    description: "Upload trading charts for instant AI pattern recognition. Machine learning identifies support, resistance, trends, and trading opportunities automatically.",
    ogTitle: "AI Chart Analysis - Instant Pattern Recognition",
    ogDescription: "AI-powered chart pattern recognition and technical analysis. Upload any chart for instant ML insights.",
    keywords: [
      "AI chart analysis",
      "AI pattern recognition trading",
      "machine learning technical analysis",
      "AI chart reading",
      "automated chart analysis",
      "AI candlestick pattern recognition",
      "best AI for chart analysis",
    ],
  },
  academy: {
    title: "AI Trading Academy | Learn Machine Learning Trading - Quant Edge Labs",
    description: "Free AI trading courses and tutorials. Learn how to use machine learning for stock analysis, quantitative strategies, and algorithmic trading.",
    ogTitle: "Quant Edge Labs Academy - Learn AI Trading",
    ogDescription: "Master AI trading with free courses on machine learning, quantitative analysis, and algorithmic strategies.",
    keywords: [
      "AI trading course",
      "learn AI trading",
      "machine learning trading tutorial",
      "AI trading for beginners",
      "algorithmic trading course",
      "quantitative trading education",
    ],
  },
  discover: {
    title: "AI Stock Discovery | Find Trading Opportunities - Quant Edge Labs",
    description: "Discover high-potential stocks with AI. Machine learning scans thousands of stocks to find breakout candidates, momentum plays, and undervalued opportunities.",
    ogTitle: "AI Stock Discovery - Find Your Next Trade",
    ogDescription: "AI-powered stock discovery. Let machine learning find your next winning trade.",
    keywords: [
      "AI stock discovery",
      "AI stock screener",
      "machine learning stock picks",
      "AI find stocks",
      "automated stock discovery",
      "AI stock scanner free",
    ],
  },
  research: {
    title: "AI Stock Research | Deep Analysis & Reports - Quant Edge Labs",
    description: "Institutional-grade AI stock research. Get comprehensive machine learning analysis, fundamental scores, and technical ratings for any stock.",
    ogTitle: "AI Stock Research - Deep Analysis",
    ogDescription: "AI-powered stock research with fundamental and technical analysis powered by machine learning.",
    keywords: [
      "AI stock research",
      "AI fundamental analysis",
      "machine learning stock analysis",
      "AI equity research",
      "automated stock research",
      "AI stock report",
    ],
  },
};

export function generateSEO(pageKey?: string, overrides?: Partial<SEOMetadata>): SEOMetadata {
  const pageSeo: Partial<SEOMetadata> = pageKey && PAGE_SEO[pageKey] ? PAGE_SEO[pageKey] : {};

  return {
    ...DEFAULT_SEO,
    ...pageSeo,
    ...overrides,
    ogTitle: overrides?.ogTitle || pageSeo.ogTitle || overrides?.title || pageSeo.title || DEFAULT_SEO.title,
    ogDescription: overrides?.ogDescription || pageSeo.ogDescription || overrides?.description || pageSeo.description || DEFAULT_SEO.description,
  };
}

export function formatTitle(title: string, siteName: string = "Quant Edge Labs"): string {
  if (title.includes(siteName)) return title;
  return `${title} | ${siteName}`;
}

// Generate dynamic SEO for stock detail pages
export function generateStockSEO(symbol: string, companyName?: string): SEOMetadata {
  const name = companyName || symbol;
  return {
    title: `${symbol} AI Analysis | Stock Research & Signals - Quant Edge Labs`,
    description: `AI-powered ${name} (${symbol}) analysis. Get machine learning price predictions, technical signals, fundamental scores, and real-time trading insights.`,
    ogTitle: `${symbol} AI Stock Analysis - Quant Edge Labs`,
    ogDescription: `AI analysis for ${name}. Machine learning signals, technical patterns, and quantitative research.`,
    keywords: [
      `${symbol} AI analysis`,
      `${symbol} stock prediction`,
      `${symbol} machine learning`,
      `${symbol} trading signals`,
      `AI analysis ${symbol}`,
    ],
    twitterCard: "summary_large_image",
    ogImage: "/og-image.png",
  };
}

// Generate dynamic SEO for blog posts
export function generateBlogPostSEO(title: string, excerpt: string, slug: string): SEOMetadata {
  return {
    title: `${title} | AI Trading Blog - Quant Edge Labs`,
    description: excerpt.slice(0, 160),
    ogTitle: title,
    ogDescription: excerpt.slice(0, 160),
    canonical: `https://quantedgelabs.net/blog/${slug}`,
    keywords: [
      "AI trading",
      "machine learning trading",
      "stock analysis",
      ...title.toLowerCase().split(' ').filter(w => w.length > 4),
    ],
    twitterCard: "summary_large_image",
    ogImage: "/og-image.png",
  };
}
