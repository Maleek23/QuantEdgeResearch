import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'zero',
  slug: 'reference',
  section: 'reference',
  nav: 'Feeds & stamps',
  title: 'Zero feeds and stamps',
  description: 'Which feed each part of the 0DTE desk reads, how often it refreshes, and what the delayed and stale stamps mean.',
  seoTitle: 'Zero feeds and stamps | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'h2', text: 'Feeds' },
    { t: 'table', head: ['Input', 'Comes from', 'Notes'], rows: [
      ['Option chains', 'Alpaca indicative; SPX from the CBOE delayed feed', 'Alpaca lists no index options, so SPX is delayed.'],
      ['Bars', '5-minute bars from Yahoo Finance', 'VWAP and opening range.'],
      ['Flow', 'Bullflow prints and net premium', 'Flow tide and day net premium.'],
      ['SPX ideas', 'Index scalp engine (SPY GEX translated to SPX)', 'Shown on the desk and graded like every other idea.'],
    ] },
    { t: 'h2', text: 'Cadence' },
    { t: 'p', md: 'The desk payload is cached for 60 seconds on the server and refetched every 60 seconds in the app.' },
    { t: 'h2', text: 'Stamps' },
    { t: 'table', head: ['Stamp', 'Meaning'], rows: [
      ['live · source · age', 'A fresh mark from a live feed.'],
      ['delayed Nm', 'The feed is delayed, or the mark is more than 2 minutes old.'],
      ['stale', 'The mark is more than 20 minutes old. Do not read it as a price.'],
      ['LOW N', 'Fewer than 20 decided outcomes for this engine.'],
      ['Blind', 'The engine\'s options data is too old to trust; it stops posting.'],
    ] },
  ],
};
export default page;
