/**
 * Public product pages (/product, /product/:slug) — content model.
 * One typed entry per module in shared/product/catalog.ts; every page renders
 * through the same template (client/src/pages/product.tsx) in the same order:
 * hero + real product shot → problem → how it works → capabilities → feature
 * groups → how it has performed → pairs with → docs → FAQ → CTA + disclaimer.
 * Framework-free: the server reads it for SEO titles and the sitemap.
 *
 * Facts come from the docs field guides (shared/docs/pages/<module>). Never put
 * a performance number in here — the "How it has performed" block reads live
 * verified figures from /api/public/showcase or links to Journal.
 */

/** Which real app screen the hero frame shows (client/src/components/landing/real-frame.tsx). */
export type ProductShot = 'nexus' | 'zerodte' | 'flow' | 'gex' | 'chart' | 'leaps' | 'ask' | 'bot' | 'journal' | 'alerts';

/**
 * Where "How it has performed" comes from:
 *  - 'nexus-record' — the bar-verified NEXUS ideas record (/api/public/showcase → record)
 *  - 'bot-record'   — the Quantinum Bot paper record (/api/public/showcase → bot)
 *  - 'ledger'       — no public endpoint for this module: link to Journal only
 */
export type ProductProof = 'nexus-record' | 'bot-record' | 'ledger';

export interface ProductStep { title: string; body: string }
export interface ProductCard { title: string; body: string }
export interface ProductFeatureGroup { group: string; items: string[] }
export interface ProductFaq { q: string; a: string }

export interface Product {
  slug: string;
  name: string;
  /** Menu / card one-liner (≤ 60 chars). */
  oneLiner: string;
  /** lucide icon name, resolved on the client. */
  icon: string;
  /** Small caps label above the H1. */
  role: string;
  headline: string;
  lede: string;
  shot: ProductShot;
  /** In-app route ("Open in app" for members). */
  appHref: string;
  /** /docs/:module id. */
  docsModule: string;
  problem: { title: string; body: string[] };
  steps: ProductStep[];
  capabilities: ProductCard[];
  features: ProductFeatureGroup[];
  proof: ProductProof;
  /** Other product slugs. */
  pairsWith: string[];
  faq: ProductFaq[];
  /** <title> ≤ 60 chars, meta description ≤ 155 (research/check-seo.ts). */
  seoTitle: string;
  seoDescription: string;
  /** YYYY-MM-DD the copy last changed (sitemap lastmod). */
  updated: string;
}
