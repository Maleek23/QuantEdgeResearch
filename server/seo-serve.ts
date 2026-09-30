/**
 * SEO SERVING — HTTP-level behaviour crawlers depend on.
 *
 * seoRedirects (registered before every route):
 *   - www.quantedgelabs.net → quantedgelabs.net (301), so one host is indexed;
 *   - trailing slash → no slash (301), so /about and /about/ are one URL;
 *   - every retired URL in client/src/lib/legacy-redirects.ts → its final
 *     destination (301). The SPA already redirects these client-side; doing it
 *     here as well passes old links' ranking to the new URL in one hop.
 *
 * renderSeoPage (the SPA fallback): the per-route meta from seo-metadata.ts and
 * a real status — 404 for unknown paths and for blog slugs that are not a
 * published post. The page body is still the SPA, which renders its NotFound.
 */
import type { Request, Response, NextFunction } from 'express';
import { resolveLegacyRedirect } from '../client/src/lib/legacy-redirects';
import { BLOG_POST_PATTERN, blogPostRoute, injectServerSeo, normalizePath, seoStatusFor, type SeoRoute } from './seo-metadata';

const CANONICAL_HOST = 'quantedgelabs.net';

export function seoRedirects(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const path = req.path;
  if (path.startsWith('/api/') || path.startsWith('/assets/') || path === '/health') return next();

  const host = (req.hostname || '').toLowerCase();
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';

  if (host === `www.${CANONICAL_HOST}`) {
    return res.redirect(301, `https://${CANONICAL_HOST}${req.originalUrl}`);
  }

  if (path.length > 1 && path.endsWith('/')) {
    return res.redirect(301, `${path.replace(/\/+$/, '') || '/'}${query}`);
  }

  // Only page-like paths (no file extension) can be legacy routes.
  if (!/\.[a-z0-9]+$/i.test(path)) {
    const target = resolveLegacyRedirect(path, query);
    if (target && target !== `${path}${query}`) return res.redirect(301, target);
  }
  next();
}

/** Status + HTML for an SPA page request. */
export async function renderSeoPage(html: string, requestUrl: string): Promise<{ status: number; html: string }> {
  const pathname = normalizePath(requestUrl);
  let status: number = seoStatusFor(pathname);
  let override: SeoRoute | undefined;

  const blog = BLOG_POST_PATTERN.exec(pathname);
  if (blog) {
    try {
      const { storage } = await import('./storage');
      const post = await storage.getBlogPostBySlug(decodeURIComponent(blog[1]));
      if (post && post.status === 'published') {
        override = blogPostRoute(post);
      } else {
        status = 404;
        override = {
          title: 'Page not found | QuantEdge Labs',
          description: 'The requested QuantEdge Labs page could not be found.',
          index: false,
        };
      }
    } catch {
      // DB unavailable: serve the generic article meta with 200 rather than
      // telling crawlers a real post is gone.
    }
  }

  return { status, html: injectServerSeo(html, requestUrl, override) };
}
