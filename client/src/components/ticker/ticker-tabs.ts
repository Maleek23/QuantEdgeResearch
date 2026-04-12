/**
 * Ticker page tab registry — single source of truth.
 *
 * Every tab is identified by a short URL slug. The slug is what shows up
 * in the address bar (`/t/PLTR/chart`) and what we match against to pick
 * the active tab content. Putting this in its own file means the page
 * shell, the tab nav, and the redirect rules can all import the same
 * canonical list and stay in sync.
 *
 * Order here = order in the nav bar.
 */

export const TICKER_TABS = [
  {
    slug: 'overview',
    label: 'OVERVIEW',
    description: '5-second read on the ticker',
    status: 'stub' as const,
  },
  {
    slug: 'chart',
    label: 'CHART',
    description: 'Skylit terminal — candles, orbs, projection arc',
    status: 'live' as const,
  },
  {
    slug: 'gex',
    label: 'GEX / VEX',
    description: 'Per-strike exposure, heatmap by expiry, dealer Greeks',
    status: 'live' as const,
  },
  {
    slug: 'options',
    label: 'OPTIONS',
    description: 'Strike ladder, OI, volume, P/C, unusual flow',
    status: 'stub' as const,
  },
  {
    slug: 'vol',
    label: 'VOL',
    description: 'IV surface, term structure, skew, VRP',
    status: 'stub' as const,
  },
  {
    slug: 'projection',
    label: 'PROJECTION',
    description: 'Zero-gamma magnet target, scenarios, horizon outlook',
    status: 'stub' as const,
  },
  {
    slug: 'catalysts',
    label: 'CATALYSTS',
    description: 'Earnings, news, macro events anchoring the tape',
    status: 'stub' as const,
  },
] as const;

export type TickerTabSlug = (typeof TICKER_TABS)[number]['slug'];

export const DEFAULT_TICKER_TAB: TickerTabSlug = 'chart';

export function isValidTickerTab(slug: string | undefined): slug is TickerTabSlug {
  return !!slug && TICKER_TABS.some((t) => t.slug === slug);
}
