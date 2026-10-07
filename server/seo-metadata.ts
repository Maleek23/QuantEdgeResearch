/**
 * SERVER-SIDE SEO — what crawlers and link previews read before any JS runs.
 *
 * Every HTML response goes through injectServerSeo(): one title, description,
 * robots directive, canonical and OG/Twitter set per route, plus JSON-LD for the
 * public pages. seoStatusFor() gives the HTTP status (200 known route, 404
 * anything else) so an unknown URL is a real 404, not a soft one.
 *
 * Copy comes from docs/POSITIONING.md. Titles ≤ 60 chars, descriptions ≤ 155 —
 * research/check-seo.ts asserts both, plus route coverage against App.tsx.
 */
import { LANDING_FAQ } from '@shared/landing-faq';
import { PUBLIC_PAGE_META as M } from '@shared/public-seo';
import { PLANS } from '../shared/pricing';

export const SITE_URL = 'https://quantedgelabs.net';
export const BRAND = 'QuantEdge Labs';

export type SeoRoute = {
  title: string;
  description: string;
  index?: boolean;
  type?: 'website' | 'article';
  schema?: Record<string, unknown>[];
};

// ─── Entities ────────────────────────────────────────────────────────────────
// Founder: Abdulmalik Ajisegiri. One Person entity, referenced by @id from the
// Organization. sameAs lists only profiles the operator has published (portfolio,
// LinkedIn and GitHub are linked from /about). TODO(operator): add the X/Twitter
// profile URL here and in client/src/pages/about.tsx once confirmed.
const ORG_ID = `${SITE_URL}/#organization`;
const FOUNDER_ID = `${SITE_URL}/about#founder`;
const WEBSITE_ID = `${SITE_URL}/#website`;

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': ORG_ID,
  name: BRAND,
  alternateName: ['QuantEdge', 'Quant Edge Labs'],
  url: SITE_URL,
  logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon-512.png`, width: 512, height: 512 },
  description: 'QuantEdge Labs builds QuantEdge, a trading research terminal for stocks, options and crypto.',
  email: 'support@quantedgelabs.net',
  founder: { '@id': FOUNDER_ID },
  // TODO(operator): add the company's X/Twitter and LinkedIn page URLs when they exist.
  sameAs: ['https://discord.gg/ppjjxVfsc'],
};

const founderSchema = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  '@id': FOUNDER_ID,
  name: 'Abdulmalik Ajisegiri',
  jobTitle: 'Founder',
  url: `${SITE_URL}/about#founder`,
  image: `${SITE_URL}/founder.jpg`,
  worksFor: { '@id': ORG_ID },
  sameAs: [
    'https://abdulmalikajisegiri.com/',
    'https://www.linkedin.com/in/malikajisegiri',
    'https://github.com/Maleek23',
  ],
};

const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  name: BRAND,
  alternateName: 'QuantEdge',
  url: `${SITE_URL}/`,
  publisher: { '@id': ORG_ID },
  inLanguage: 'en-US',
  // No SearchAction: the public site has no search results page to point it at
  // (ticker search lives inside the signed-in terminal).
};

// Offers come from the same PLANS table the Pricing section renders
// (shared/pricing.ts); plans marked comingSoon or without a price are left out.
const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': `${SITE_URL}/#software`,
  name: 'QuantEdge',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  url: SITE_URL,
  image: `${SITE_URL}/og-image.png`,
  description: 'A trading research terminal for stocks, options and crypto: dealer positioning (GEX/VEX), options flow and dark pool, evidence-ranked setups, a 0DTE desk, charts, a paper-trading bot and trading journals.',
  publisher: { '@id': ORG_ID },
  offers: PLANS.filter((p) => !p.comingSoon && p.monthly != null).map((p) => ({
    '@type': 'Offer',
    name: p.name,
    price: (p.monthly ?? 0).toFixed(2),
    priceCurrency: 'USD',
    url: `${SITE_URL}/?section=pricing`,
  })),
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: LANDING_FAQ.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
};

function breadcrumb(name: string, path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: BRAND, item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name, item: `${SITE_URL}${path}` },
    ],
  };
}

const aboutPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  '@id': `${SITE_URL}/about`,
  url: `${SITE_URL}/about`,
  name: 'About QuantEdge Labs',
  isPartOf: { '@id': WEBSITE_ID },
  about: { '@id': ORG_ID },
  mainEntity: { '@id': FOUNDER_ID },
};

// ─── Public, indexable routes ────────────────────────────────────────────────
export const PUBLIC_ROUTES: Record<string, SeoRoute> = {
  // Titles/descriptions: shared/public-seo.ts (the client's SEOHead reads the same copy).
  '/': { ...M['/'], schema: [organizationSchema, websiteSchema, founderSchema, softwareSchema, faqSchema] },
  '/about': { ...M['/about'], schema: [organizationSchema, founderSchema, aboutPageSchema, breadcrumb('About', '/about')] },
  '/blog': { ...M['/blog'], schema: [breadcrumb('Blog', '/blog')] },
  '/academy': { ...M['/academy'], schema: [breadcrumb('Academy', '/academy')] },
  '/how-to': { ...M['/how-to'], schema: [breadcrumb('How to use QuantEdge', '/how-to')] },
  '/updates': { ...M['/updates'], schema: [breadcrumb("What's new", '/updates')] },
  '/privacy': { ...M['/privacy'] },
  '/terms': { ...M['/terms'] },
};

// ─── Known app routes (rendered by the SPA, never indexed) ──────────────────
// Mirrors the <Route path> list in client/src/App.tsx; research/check-seo.ts
// fails if a Route is added there without a match here (it would 404).
const APP_ROUTE_PATTERNS: RegExp[] = [
  /^\/t$/, /^\/r$/, /^\/r\/[^/]+$/, /^\/today$/, /^\/w$/,
  /^\/login$/, /^\/signup$/, /^\/forgot-password$/, /^\/reset-password$/,
  /^\/join-beta$/, /^\/invite$/, /^\/settings$/, /^\/alerts$/,
  /^\/trade-ideas\/[^/]+\/audit$/,
  /^\/admin$/, /^\/admin\/(users|invites|waitlist|roadmap|system|blog|audit|traders)$/,
  /^\/desk$/, /^\/desk\/[^/]+$/, /^\/setup$/, /^\/trader-setup$/, /^\/swings$/,
];

export function isAppRoute(pathname: string): boolean {
  return APP_ROUTE_PATTERNS.some((re) => re.test(pathname));
}

export function normalizePath(requestPath: string): string {
  return requestPath.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
}

export const BLOG_POST_PATTERN = /^\/blog\/([^/]+)$/;

/** 200 for a page the SPA renders, 404 for anything else. Blog slugs are checked against the DB by the caller. */
export function seoStatusFor(requestPath: string): 200 | 404 {
  const pathname = normalizePath(requestPath);
  if (PUBLIC_ROUTES[pathname] || isAppRoute(pathname) || BLOG_POST_PATTERN.test(pathname)) return 200;
  return 404;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function routeFor(pathname: string): SeoRoute {
  if (PUBLIC_ROUTES[pathname]) return PUBLIC_ROUTES[pathname];
  if (BLOG_POST_PATTERN.test(pathname)) {
    return {
      title: `Research Note | ${BRAND}`,
      description: 'Research notes on options, dealer positioning, model risk and trading-system design from QuantEdge Labs.',
      type: 'article',
    };
  }
  if (isAppRoute(pathname)) {
    return {
      title: `QuantEdge Terminal | ${BRAND}`,
      description: 'Private QuantEdge Labs research workspace.',
      index: false,
    };
  }
  return {
    title: `Page not found | ${BRAND}`,
    description: 'The requested QuantEdge Labs page could not be found.',
    index: false,
  };
}

/** A published blog post's own meta; the caller looks the post up by slug. */
export function blogPostRoute(post: {
  title: string; excerpt?: string | null; metaDescription?: string | null;
}): SeoRoute {
  const raw = (post.metaDescription || post.excerpt || post.title).replace(/\s+/g, ' ').trim();
  const description = raw.length > 155 ? `${raw.slice(0, 152).replace(/\s+\S*$/, '')}…` : raw;
  const suffix = ` | ${BRAND}`;
  const title = post.title.length + suffix.length <= 60 ? `${post.title}${suffix}` : post.title;
  return { title, description, type: 'article', schema: [breadcrumb('Blog', '/blog')] };
}

function replaceMeta(html: string, pattern: RegExp, replacement: string): string {
  return pattern.test(html) ? html.replace(pattern, replacement) : html.replace('</head>', `    ${replacement}\n  </head>`);
}

export function injectServerSeo(html: string, requestPath: string, override?: SeoRoute): string {
  const pathname = normalizePath(requestPath);
  const seo = override ?? routeFor(pathname);
  const canonical = `${SITE_URL}${pathname === '/' ? '/' : pathname}`;
  const robots = seo.index === false ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';
  const title = escapeAttribute(seo.title);
  const author = 'Abdulmalik Ajisegiri';
  const description = escapeAttribute(seo.description);

  let output = html
    .replace(/<title>.*?<\/title>/s, `<title>${title}</title>`)
    .replace(/<meta name="title" content="[^"]*"\s*\/>/, `<meta name="title" content="${title}" />`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${description}" />`)
    .replace(/<meta name="robots" content="[^"]*"\s*\/>/, `<meta name="robots" content="${robots}" />`)
    .replace(/<meta name="author" content="[^"]*"\s*\/>/, `<meta name="author" content="${author}" />`);

  // A noindex page carries no canonical (canonical + noindex are conflicting signals).
  output = seo.index === false
    ? output.replace(/\s*<link rel="canonical" href="[^"]*"\s*\/>/, '')
    : output.replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${canonical}" />`);

  const tags: Array<[RegExp, string]> = [
    [/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${canonical}" />`],
    [/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${title}" />`],
    [/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${description}" />`],
    [/<meta property="og:type" content="[^"]*"\s*\/>/, `<meta property="og:type" content="${seo.type ?? 'website'}" />`],
    [/<meta name="twitter:url" content="[^"]*"\s*\/>/, `<meta name="twitter:url" content="${canonical}" />`],
    [/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${title}" />`],
    [/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${description}" />`],
  ];
  for (const [pattern, replacement] of tags) output = replaceMeta(output, pattern, replacement);

  output = output.replace(/\s*<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g, '');
  if (seo.schema?.length) {
    const structuredData = JSON.stringify(seo.schema).replace(/</g, '\\u003c');
    output = output.replace('</head>', `    <script type="application/ld+json" data-server-seo>${structuredData}</script>\n  </head>`);
  }
  return output;
}
