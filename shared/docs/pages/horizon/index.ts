import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'horizon',
  slug: '',
  section: 'field-guide',
  nav: 'LEAPS & Swings',
  title: 'LEAPS & Swings field guide',
  description: 'Longer-dated ideas: liquid LEAPS calls ranked by sector, trend and contract quality, plus the monthly swings screen.',
  seoTitle: 'LEAPS & Swings LEAPS field guide | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'disclaimer' },
    { t: 'h2', text: 'Why it matters' },
    { t: 'p', md: 'Not every idea is for today. LEAPS & Swings screens for **30 days to a year**: stock-replacement LEAPS calls on names in strong sectors and trends, and beaten-down names with a reason to recover.' },
    { t: 'h2', text: 'LEAP Tracker' },
    { t: 'table', head: ['Layer', 'Comes from', 'What you see'], rows: [
      ['**Ranked contracts**', 'LEAP tracker engine + option selection', 'Liquid calls with strike, expiry, premium, days to expiry, IV and the return at a +30% move. Filter by budget and minimum grade.'],
      ['**Score 0–100**', 'Sector 30 + Trend 30 + Contract 40', 'Sector: the sector ETF\'s rotation quadrant and 3-month relative strength. Trend: 50/200-day, golden cross, 3- and 6-month returns. Contract: delta fit, liquidity, IV level, modelled reward-to-risk.'],
      ['**Grade S/A/B/C**', 'Score cut-offs', 'S 78+, A 66+, B 52+, otherwise C.'],
      ['**Summary**', 'Same scan', 'Liquid-of-scanned count, S-grade count, averages, staleness and the SPY move the scan ran against.'],
      ['**Universe**', 'Curated list', 'Each name tagged **core** or **spec**.'],
    ] },
    { t: 'p', md: 'Delta fit scores best at **0.70–0.82**, then 0.60–0.70, then 0.50–0.60. Names with no liquid LEAP or no price history are dropped, never filled in.' },
    { t: 'h2', text: 'Swings screen' },
    { t: 'p', md: 'The swings page lists names **40–85% below their all-time high**, rebuilt nightly at 18:40 ET. Each gets a score from Fundamentals (35), Structure (35), Catalyst (15) and Flow/GEX (15). A factor with no data shows **n/a** and is left out of the score — never scored as zero.' },
    { t: 'p', md: 'Each name carries two worked contract examples: a **monthly** (30–60 days, Δ0.30–0.55) and a **LEAPS** (270–760 days, Δ0.60–0.80), sized for $500 and $1,000 with a −50% premium stop. A `*` marks a cheapest-fit fallback.' },
    { t: 'callout', kind: 'caution', md: 'The swings score is labelled in the app as an unvalidated composite with no forward record yet. The contracts are worked examples, not orders.' },
    { t: 'h2', text: 'How to read it' },
    { t: 'list', ordered: true, items: [
      'Filter by budget first; a great score on a contract you cannot size is no use.',
      'Read the three score parts, not just the total — a sector-driven score behaves differently from a trend-driven one.',
      'Check staleness and the session the scan ran in.',
    ] },
  ],
};
export default page;
