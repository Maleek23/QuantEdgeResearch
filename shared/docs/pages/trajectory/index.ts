import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'trajectory',
  slug: '',
  section: 'field-guide',
  nav: 'Chart',
  title: 'Chart field guide',
  description: 'One chart with published levels, dealer walls and the Path projection: a modelled fan of where price could travel over a horizon.',
  seoTitle: 'Chart chart field guide | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'disclaimer' },
    { t: 'h2', text: 'Why it matters' },
    { t: 'p', md: 'Most charts show price and leave positioning somewhere else. Chart puts the published plan, the dealer levels and a probability-weighted **Path** on the same candles, so you can see **where price is, where the levels are, and what range the options market is pricing between them**.' },
    { t: 'h2', text: 'What you see' },
    { t: 'table', head: ['Layer', 'Comes from', 'What you see'], rows: [
      ['**Candles**', 'Historical prices', 'Price, at the timeframe you choose.'],
      ['**Idea levels**', '[NEXUS](/docs/nexus)', 'Published STOP, ENTRY and T1 for the symbol, with side and reward-to-risk. It says so when nothing is published.'],
      ['**Walls · flip · king node**', '[GEX](/docs/gravity)', 'Call wall, put wall, zero-γ and the strongest gamma nodes within 15%.'],
      ['**GEX bubbles · VEX**', 'Chart overlays', 'How gamma at each level has changed through time.'],
      ['**Dark pool · flow prints**', '[Current](/docs/current)', 'Dark-pool price levels and notable prints on the candles.'],
      ['**Expected move**', '[Expected move](/docs/envelope)', 'The day and week ranges the options market is pricing, and the forward cone.'],
      ['**Path fan**', 'Path projection engine', 'Shaded 50% and 80% bands of simulated paths over the horizon you pick.'],
      ['**Terminal density**', 'Path projection engine', 'A histogram at the right edge: where simulated paths finished.'],
      ['**ES translation**', 'ES futures context', 'The ES–SPX basis and an MES/ES contract sizer.'],
    ] },
    { t: 'h2', text: 'How the Path is built' },
    { t: 'p', md: 'Path is a **Monte-Carlo simulation** — 2,000 paths by default, stepped every 5 minutes through regular trading hours.' },
    { t: 'list', items: [
      '**Volatility** comes from the priced move (ATM straddle or implied volatility), spread through the day using the intraday volatility curve of the last 10 sessions.',
      '**Positive-gamma nodes pull** paths toward them, but only when dealers are long gamma, and the pull is capped. Nodes price has already traded through count at half weight.',
      '**Negative-gamma nodes** raise local volatility (up to 1.6×) instead of pulling.',
      '**Skew** from 25-delta puts vs calls tilts the paths. Priced events add a jump at their time.',
      'Horizons: **Session**, **Tomorrow**, **Week** and **OpEx** (the third Friday).',
    ] },
    { t: 'h2', text: 'How to read it' },
    { t: 'list', ordered: true, items: [
      'Read the 50% band as "half the simulated paths stayed in here", not as a target.',
      '**Apex** marks the largest positive node; **Gatekeeper** the level between spot and apex where most paths stopped.',
      '**Rug** (a positive node over a larger negative one) and **Trampoline** (the reverse) describe structure. They are not signals.',
      'If the Path disagrees with the idea levels, that is information — check which layer is stale before acting.',
    ] },
    { t: 'callout', kind: 'note', md: 'The Path is labelled "modelled scenario, not a forecast" everywhere it appears. How often closes landed inside the bands is a question for the record, not this page.' },
  ],
};
export default page;
