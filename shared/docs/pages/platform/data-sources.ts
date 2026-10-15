import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'platform',
  slug: 'data-sources',
  section: 'reference',
  nav: 'Data sources',
  title: 'Data sources and freshness',
  description: 'Which feed each part of QuantEdge reads, how delayed it can be, and how a tile tells you its age.',
  seoTitle: 'Data sources | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'h2', text: 'Feeds' },
    { t: 'table', head: ['Data', 'Comes from', 'Notes'], rows: [
      ['Equity quotes and trades', 'Alpaca (IEX trades), Tradier, Yahoo Finance', 'The Free plan uses 15-minute delayed quotes.'],
      ['Options chains', 'Alpaca, Tradier, or the CBOE delayed feed', 'CBOE chains run about 15 minutes behind, and the tile says so.'],
      ['Options flow', 'Bullflow (a third-party flow feed)', 'Prints as the feed reports them. See [Current](/docs/current).'],
      ['Crypto', 'Coinbase live feed', 'BTC/ETH and their equity proxies.'],
    ] },
    { t: 'h2', text: 'Freshness rules' },
    { t: 'list', items: [
      'Every tile shows its source and its age. A delayed or stale feed is labelled, never shown as live.',
      'Values captured when an idea was published are repriced live or stamped with their age. They are never presented as current.',
      'When an engine\'s inputs are too old (for example the 0DTE engine marked **Blind**), it stops publishing rather than guessing.',
    ] },
    { t: 'callout', kind: 'note', md: 'Modelled layers (GEX, the Path fan, cones, scores) are computed by QuantEdge from these feeds. They inherit any delay in their inputs.' },
  ],
};
export default page;
