/**
 * Public docs (/docs) — content model. Every page is a typed TS file under
 * shared/docs/pages/<module>/<slug>.ts so a feature and its docs ship in one PR.
 * Inline text is a tiny markdown subset: **bold**, `code`, [label](href).
 * The server reads this too (SEO titles, sitemap), so keep it framework-free.
 */
export type DocSection = 'field-guide' | 'reference' | 'glossary';

export type DocBlock =
  | { t: 'p'; md: string }
  | { t: 'h2'; text: string; id?: string }
  | { t: 'h3'; text: string }
  | { t: 'list'; items: string[]; ordered?: boolean }
  /** A reference table. Field guides use head = ['Layer', 'Comes from', 'What you see']. */
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'callout'; kind: 'note' | 'caution'; md: string }
  /** The standard "educational, not advice; modelled outputs are scenarios" box. */
  | { t: 'disclaimer' }
  /** Renders shared/glossary.ts — the Glossary page only. */
  | { t: 'glossary' };

export interface DocPage {
  module: string;
  /** '' for a module's index page (its field guide). */
  slug: string;
  section: DocSection;
  /** Sidebar label. */
  nav: string;
  /** H1. */
  title: string;
  /** Lede under the H1; also the meta description (≤ 155 chars). */
  description: string;
  /** <title> (≤ 60 chars incl. the " | QuantEdge Docs" suffix). */
  seoTitle: string;
  /** YYYY-MM-DD the copy last changed — the sitemap's <lastmod>. */
  updated: string;
  blocks: DocBlock[];
}

export interface DocModule {
  id: string;
  name: string;
  /** Short role shown under the name in search and the module index. */
  role: string;
  /** lucide icon name, resolved on the client (client/src/pages/docs.tsx). */
  icon: string;
  /** In-app route for "Open in app". */
  appHref: string;
}

export const DISCLAIMER_TEXT =
  'Educational material, not financial advice. Nothing here recommends buying or selling any security. ' +
  'Modelled outputs (paths, cones, scores, GEX) are scenarios built from assumptions, not forecasts. ' +
  'Options carry substantial risk and can lose their full value.';

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
