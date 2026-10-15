import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'quantinum',
  slug: 'reference',
  section: 'reference',
  nav: 'Lean & commands',
  title: 'Quantinum lean and commands',
  description: 'The exact lean rules, the confidence index, the slash commands and the URL parameters the Ask Quantinum page reads.',
  seoTitle: 'Quantinum reference | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'h2', text: 'Lean rules' },
    { t: 'table', head: ['Lean', 'Rule'], rows: [
      ['Mixed', 'Bullish and bearish points are each 5 or more.'],
      ['Bullish', 'Net points 6 or more.'],
      ['Bearish', 'Net points −6 or less.'],
      ['Quiet', 'Anything else.'],
    ] },
    { t: 'p', md: 'Confidence = min(95, |net| × 4). A display index, not a probability.' },
    { t: 'h2', text: 'Commands' },
    { t: 'table', head: ['Command', 'Returns'], rows: [
      ['`/levels [sym]`', 'Walls, flip and key levels.'],
      ['`/flow [sym]`', 'Recent flow and net premium.'],
      ['`/setup [sym|id]`', 'A published setup and its plan.'],
      ['`/indices` · `/trinity`', 'SPY, QQQ, IWM read side by side.'],
      ['`/sector <name>`', 'A sector\'s rotation and leaders.'],
      ['`/news [sym]`', 'Recent headlines.'],
      ['`/record [sym|pattern]`', 'Verified outcomes; "too few to judge" under 20.'],
    ] },
    { t: 'h2', text: 'URL parameters' },
    { t: 'table', head: ['Parameter', 'Effect'], rows: [
      ['`?sym=NVDA`', 'Charts that symbol.'],
      ['`?q=…`', 'Pre-fills the question box. Never sent automatically.'],
    ] },
  ],
};
export default page;
