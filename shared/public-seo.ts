/**
 * PUBLIC PAGE META — one title and description per indexable page.
 *
 * Read by the server (server/seo-metadata.ts, what crawlers and link previews
 * get in the first HTML) and by the client (client/src/lib/seo.ts via SEOHead,
 * what the page sets after it renders), so the two never disagree. Copy follows
 * docs/POSITIONING.md. Titles ≤ 60 chars, descriptions ≤ 155 chars —
 * research/check-seo.ts enforces both.
 */
export interface PublicPageMeta { title: string; description: string }

export const PUBLIC_PAGE_META = {
  '/': {
    title: 'QuantEdge Labs | Options & Stock Trading Research Terminal',
    description: 'A trading research terminal for stocks, options and crypto: dealer positioning, options flow, evidence-ranked setups, a paper-trading bot and journals.',
  },
  '/about': {
    title: 'About QuantEdge Labs | Founded by Abdulmalik Ajisegiri',
    description: 'QuantEdge Labs builds a trading research terminal where every number carries its source, age and record. Founded by Abdulmalik Ajisegiri.',
  },
  '/blog': {
    title: 'Research Notes on Options and Markets | QuantEdge Labs',
    description: 'Research notes from QuantEdge Labs on options, dealer positioning, model validation, risk and trading-system design.',
  },
  '/academy': {
    title: 'QuantEdge Academy | Learn Options and Market Structure',
    description: 'Learn to read market regimes, options flow, gamma exposure, risk and trade structure, and why a score is evidence, not certainty.',
  },
  '/how-to': {
    title: 'How to Use QuantEdge | Trading Terminal Guide',
    description: 'A practical guide to the QuantEdge terminal: dealer positioning, options flow, ranked setups, the 0DTE desk, charts, the paper bot and your journal.',
  },
  '/updates': {
    title: "What's New in QuantEdge | Updates and Roadmap",
    description: 'Every QuantEdge update with its ship date, plus what is being built now: NEXUS, 0DTE, GEX, FLOW, the journal and Discord.',
  },
  '/privacy': {
    title: 'Privacy Policy | QuantEdge Labs',
    description: 'How QuantEdge Labs collects, uses and protects account and product data.',
  },
  '/terms': {
    title: 'Terms of Service | QuantEdge Labs',
    description: 'Terms governing use of the QuantEdge Labs trading research platform.',
  },
} satisfies Record<string, PublicPageMeta>;

export type PublicPath = keyof typeof PUBLIC_PAGE_META;
