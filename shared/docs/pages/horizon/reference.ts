import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'horizon',
  slug: 'reference',
  section: 'reference',
  nav: 'Scoring',
  title: 'Horizon scoring reference',
  description: 'Score weights, grade cut-offs, delta bands and refresh cadence for the LEAP Tracker and the swings screen.',
  seoTitle: 'Horizon scoring reference | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'h2', text: 'LEAP Tracker' },
    { t: 'table', head: ['Part', 'Points', 'Inputs'], rows: [
      ['Sector', '0–30', 'Sector ETF rotation quadrant, 3-month relative strength.'],
      ['Trend', '0–30', 'Above 50/200-day, golden cross, positive 3M and 6M return.'],
      ['Contract', '0–40', 'Delta fit, liquidity, IV level, modelled reward-to-risk.'],
    ] },
    { t: 'p', md: 'Refetched every 10 minutes in the app; the server caches the scan for 15 minutes.' },
    { t: 'h2', text: 'Swings screen' },
    { t: 'table', head: ['Group', 'Max points'], rows: [['Fundamentals', '35'], ['Structure', '35'], ['Catalyst', '15'], ['Flow / GEX', '15']] },
    { t: 'table', head: ['Contract', 'Days to expiry', 'Delta'], rows: [['Monthly', '30–60', '0.30–0.55'], ['LEAPS', '270–760', '0.60–0.80']] },
  ],
};
export default page;
