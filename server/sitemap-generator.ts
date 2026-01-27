/**
 * Dynamic Sitemap Generator for Quant Edge Labs
 * Generates XML sitemap for SEO optimization
 */

const BASE_URL = 'https://quantedgelabs.net';

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
}

// Static pages with SEO priority
const STATIC_PAGES: SitemapUrl[] = [
  // High priority - main entry points
  { loc: '/', changefreq: 'daily', priority: 1.0 },
  { loc: '/home', changefreq: 'hourly', priority: 0.9 },
  { loc: '/discover', changefreq: 'hourly', priority: 0.9 },
  { loc: '/trade-desk', changefreq: 'hourly', priority: 0.9 },

  // Core features - high SEO value
  { loc: '/chart-analysis', changefreq: 'daily', priority: 0.8 },
  { loc: '/market-scanner', changefreq: 'hourly', priority: 0.8 },
  { loc: '/ai-stock-picker', changefreq: 'daily', priority: 0.8 },
  { loc: '/research-hub', changefreq: 'daily', priority: 0.8 },
  { loc: '/smart-money', changefreq: 'daily', priority: 0.8 },
  { loc: '/options-analyzer', changefreq: 'daily', priority: 0.8 },

  // Trading tools
  { loc: '/whale-flow', changefreq: 'hourly', priority: 0.7 },
  { loc: '/market-movers', changefreq: 'hourly', priority: 0.7 },
  { loc: '/futures', changefreq: 'hourly', priority: 0.7 },
  { loc: '/swing-scanner', changefreq: 'daily', priority: 0.7 },
  { loc: '/bullish-trends', changefreq: 'daily', priority: 0.7 },

  // Content & Education
  { loc: '/blog', changefreq: 'daily', priority: 0.8 },
  { loc: '/academy', changefreq: 'weekly', priority: 0.7 },
  { loc: '/success-stories', changefreq: 'weekly', priority: 0.7 },
  { loc: '/technical-guide', changefreq: 'monthly', priority: 0.6 },
  { loc: '/strategy-playbooks', changefreq: 'weekly', priority: 0.6 },
  { loc: '/trading-rules', changefreq: 'monthly', priority: 0.5 },

  // Information pages
  { loc: '/pricing', changefreq: 'monthly', priority: 0.8 },
  { loc: '/features', changefreq: 'monthly', priority: 0.7 },
  { loc: '/about', changefreq: 'monthly', priority: 0.6 },
  { loc: '/performance', changefreq: 'daily', priority: 0.6 },

  // Social & Community
  { loc: '/social-trends', changefreq: 'hourly', priority: 0.6 },
  { loc: '/wsb-trending', changefreq: 'hourly', priority: 0.6 },

  // Legal (low priority but important)
  { loc: '/privacy-policy', changefreq: 'yearly', priority: 0.3 },
  { loc: '/terms-of-service', changefreq: 'yearly', priority: 0.3 },
];

// Popular stock symbols for dynamic stock pages
const POPULAR_STOCKS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'AMD', 'NFLX', 'CRM',
  'INTC', 'ORCL', 'ADBE', 'PYPL', 'SQ', 'SHOP', 'UBER', 'ABNB', 'COIN', 'RBLX',
  'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'ARKK', 'XLF', 'XLE', 'XLK',
  'BTC', 'ETH', 'SOL', 'DOGE', 'XRP'
];

export function generateSitemap(blogSlugs: string[] = []): string {
  const today = new Date().toISOString().split('T')[0];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
`;

  // Add static pages
  for (const page of STATIC_PAGES) {
    xml += `  <url>
    <loc>${BASE_URL}${page.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority.toFixed(1)}</priority>
  </url>
`;
  }

  // Add stock detail pages for popular symbols
  for (const symbol of POPULAR_STOCKS) {
    xml += `  <url>
    <loc>${BASE_URL}/stock/${symbol}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
`;
  }

  // Add blog post pages
  for (const slug of blogSlugs) {
    xml += `  <url>
    <loc>${BASE_URL}/blog/${slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
`;
  }

  xml += `</urlset>`;

  return xml;
}

// Generate robots.txt content
export function generateRobotsTxt(): string {
  return `# Quant Edge Labs Robots.txt
# https://quantedgelabs.net

User-agent: *
Allow: /

# Crawl delay for polite crawling
Crawl-delay: 1

# Disallow admin and private areas
Disallow: /admin
Disallow: /admin-*
Disallow: /api/
Disallow: /settings
Disallow: /reset-password
Disallow: /invite-welcome

# Allow search engines to index API docs if present
Allow: /api-docs

# Sitemap location
Sitemap: https://quantedgelabs.net/sitemap.xml

# Google specific
User-agent: Googlebot
Allow: /
Crawl-delay: 0

# Bing specific
User-agent: Bingbot
Allow: /
Crawl-delay: 1
`;
}
