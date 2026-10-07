/**
 * sitemap.xml and robots.txt for QuantEdge Labs.
 *
 * The sitemap lists only indexable, 200-status URLs: the public pages in
 * server/seo-metadata.ts PUBLIC_ROUTES and published blog posts. <lastmod> is
 * a real date — the post's updatedAt, or for static pages the date their copy
 * last changed (STATIC_LASTMOD; bump it when you edit a page's content).
 */
import { PUBLIC_ROUTES, SITE_URL } from './seo-metadata';

/** Last content change per public page (YYYY-MM-DD). */
const STATIC_LASTMOD: Record<string, string> = {
  '/': '2026-09-30',
  '/about': '2026-09-30',
  '/blog': '2026-09-30',
  '/academy': '2026-09-26',
  '/how-to': '2026-09-30',
  '/updates': '2026-10-07',
  '/privacy': '2026-09-30',
  '/terms': '2026-09-30',
};

export interface SitemapPost {
  slug: string;
  updatedAt?: Date | string | null;
  publishedAt?: Date | string | null;
}

function isoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function urlEntry(loc: string, lastmod: string | null): string {
  return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ''}  </url>\n`;
}

export function generateSitemap(posts: SitemapPost[] = []): string {
  const postDates = posts.map((p) => isoDate(p.updatedAt) ?? isoDate(p.publishedAt)).filter((d): d is string => !!d).sort();
  const newestPost = postDates[postDates.length - 1] ?? null;

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const path of Object.keys(PUBLIC_ROUTES)) {
    // An empty blog index is thin content — list it once a post is published.
    if (path === '/blog' && posts.length === 0) continue;
    let lastmod = STATIC_LASTMOD[path] ?? null;
    // The blog index changes whenever a post does.
    if (path === '/blog' && newestPost && (!lastmod || newestPost > lastmod)) lastmod = newestPost;
    xml += urlEntry(`${SITE_URL}${path === '/' ? '/' : path}`, lastmod);
  }
  for (const post of posts) {
    if (!post.slug) continue;
    xml += urlEntry(`${SITE_URL}/blog/${encodeURIComponent(post.slug)}`, isoDate(post.updatedAt) ?? isoDate(post.publishedAt));
  }
  xml += '</urlset>\n';
  return xml;
}

/**
 * robots.txt. One `User-agent: *` group on purpose: a crawler obeys only the most
 * specific group that names it, so the old `User-agent: Googlebot / Allow: /`
 * group silently cancelled every Disallow for Google and Bing.
 *
 * Signed-in app pages (/t, /r/:symbol, /today, /login …) are NOT disallowed: they
 * serve `noindex`, and a crawler has to be allowed to fetch a page to see that.
 * Disallowing them would let linked URLs (the landing links /t and /r/SPY) be
 * indexed as bare URLs. Only the API and account-only paths are blocked.
 */
export function generateRobotsTxt(): string {
  return `# QuantEdge Labs — ${SITE_URL}

User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin
Disallow: /settings
Disallow: /reset-password
Disallow: /forgot-password
Disallow: /invite
Disallow: /trade-ideas/

Sitemap: ${SITE_URL}/sitemap.xml
`;
}
