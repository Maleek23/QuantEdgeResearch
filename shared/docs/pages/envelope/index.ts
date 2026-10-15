import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'envelope',
  slug: '',
  section: 'field-guide',
  nav: 'Expected move',
  title: 'Expected move field guide',
  description: 'Expected-move lines and cones: the day and week ranges the options market is pricing, anchored so they do not chase price.',
  seoTitle: 'Expected move expected move guide | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'disclaimer' },
    { t: 'h2', text: 'Why it matters' },
    { t: 'p', md: 'The options market prices a range. Expected move draws it: **how far price is expected to travel today and this week**, before you size a stop or a target against it.' },
    { t: 'h2', text: 'What you see' },
    { t: 'table', head: ['Layer', 'Comes from', 'What you see'], rows: [
      ['**EM day ±X**', 'Nearest expiry\'s ATM straddle (or IV × √T)', 'Dashed lines for today\'s priced range, scaled to today\'s share of time to that expiry.'],
      ['**EM week ±X**', 'The last expiry on or before Friday', 'Longer dashes for this week\'s priced range.'],
      ['**Forward cone**', 'Per-session move × √(sessions ahead)', 'A cone past the last candle, captioned "priced range (options) · √t cone, modelled".'],
      ['**Source stamp**', 'Chain cache', '`atm_straddle` or `atm_iv`, and when the line was anchored.'],
    ] },
    { t: 'h2', text: 'Anchoring' },
    { t: 'p', md: 'The day and week lines are anchored at the **first read** of the day or week, so they stay put instead of following price. If the service restarts before that first read, the line anchors later — and the stamp shows when.' },
    { t: 'h2', text: 'How to read it' },
    { t: 'list', ordered: true, items: [
      'Treat the lines as the market\'s priced range, not as support, resistance or a target.',
      'A move outside the day line means price is travelling further than options priced in.',
      'The cone is a √t extrapolation — a model. It widens with time because uncertainty does.',
      'The same numbers appear as **Exp. move today** and **To expiry** on [Zero](/docs/zero).',
    ] },
  ],
};
export default page;
