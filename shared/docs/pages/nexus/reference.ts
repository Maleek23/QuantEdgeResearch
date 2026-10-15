import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'nexus',
  slug: 'reference',
  section: 'reference',
  nav: 'Grades & layers',
  title: 'NEXUS grades and layers',
  description: 'Exact definitions behind NEXUS: the conviction layers, band cut-offs, the grade factors and refresh cadence.',
  seoTitle: 'NEXUS grades and layers | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'h2', text: 'Grade factors' },
    { t: 'p', md: 'The grade (version `g2`) sums five factors to 100. In code it is labelled "actionability score — unvalidated, not a win probability".' },
    { t: 'table', head: ['Factor', 'Points', 'Definition'], rows: [
      ['Confluence', '25', 'Displayed conviction (0–100) × 25.'],
      ['Technical', '15', 'Technical, signal and structure points, capped at 10 raw points.'],
      ['Live validity', '25', 'Fresh or carried 25 · stale 5 · resolved 0.'],
      ['Window left', '25', 'Share of the setup\'s own holding window still ahead.'],
      ['Session', '10', 'Published in the current New York session.'],
    ] },
    { t: 'table', head: ['Letter', 'Score'], rows: [['A', '90+'], ['B', '80–89'], ['C', '65–79'], ['D', '45–64'], ['F', 'below 45']] },
    { t: 'h2', text: 'Conviction layer families' },
    { t: 'table', head: ['Layer', 'Comes from', 'What you see'], rows: [
      ['Technical · Signals · Structure · Weekly', 'Price bars and the pattern scanner', 'Trend, breakouts, compression and weekly structure.'],
      ['GEX · Convergence', '[GEX](/docs/gravity) and [Current](/docs/current)', 'Dealer positioning and flow agreeing with the setup\'s side.'],
      ['Sector · Regime · Breadth · Macro', 'Sector rotation, market pulse, rates and VIX', 'Whether the tape around the name supports it.'],
      ['Catalyst · Analyst · Fundamental · Geopolitical', 'Calendars, news and fundamentals', 'Dated events and background quality.'],
      ['Pre-market · Freshness', 'Extended-hours quotes, publish time', 'The pre-market gap as a direction read, and how old the setup is.'],
    ] },
    { t: 'h2', text: 'Cadence' },
    { t: 'list', items: [
      'The convictions worker warms the board about every 4 minutes.',
      'Most board tiles refetch every 60 seconds; some every 30.',
    ] },
  ],
};
export default page;
