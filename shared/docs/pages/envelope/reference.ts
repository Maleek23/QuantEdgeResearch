import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'envelope',
  slug: 'reference',
  section: 'reference',
  nav: 'Formulas',
  title: 'Envelope formulas',
  description: 'How Envelope computes the daily and weekly expected move and the forward cone, and which chain each reads.',
  seoTitle: 'Envelope formulas | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'h2', text: 'Formulas' },
    { t: 'table', head: ['Line', 'Formula'], rows: [
      ['Daily', 'ATM straddle mid of the nearest expiry (or IV × √T without a two-sided quote), scaled to today\'s share of time to that expiry.'],
      ['Weekly', 'Same, on the last listed expiry on or before this Friday.'],
      ['Cone', '± per-session move × √(sessions ahead), from current spot. Per-session move = weekly (else daily) straddle ÷ √(sessions to its expiry).'],
    ] },
    { t: 'h2', text: 'Sources and cadence' },
    { t: 'list', items: [
      'Chains from the 0DTE desk\'s cache: Alpaca indicative, or the CBOE delayed feed for SPX and as fallback.',
      'The chart refetches the expected move every 5 minutes while visible.',
      'Anchors persist across restarts.',
    ] },
  ],
};
export default page;
