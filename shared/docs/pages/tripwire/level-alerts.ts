import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'tripwire',
  slug: 'level-alerts',
  section: 'reference',
  nav: 'Level alerts',
  title: 'Alerts level alerts',
  description: 'Automatic approach and touch alerts on Apex, Gatekeeper, call and put walls and zero-γ for every symbol on your watchlist.',
  seoTitle: 'Alerts level alerts | QuantEdge Docs',
  updated: '2026-10-15',
  blocks: [
    { t: 'h2', text: 'What fires' },
    { t: 'table', head: ['Event', 'Rule'], rows: [
      ['Approach', 'Price is within 0.25% of the level and has not touched it yet this session.'],
      ['Touch', 'Price traded through the level since the last sweep, or sits within 0.03% of it.'],
    ] },
    { t: 'h2', text: 'Which levels' },
    { t: 'list', items: [
      'Call wall, put wall and zero-γ from the 0DTE (Today) book, falling back to the all-expiry read.',
      'Apex and Gatekeeper from [GEX node labels](/docs/gravity/node-labels).',
      'Every symbol on any watchlist, checked every 2 minutes from 09:30 to 16:00 ET on weekdays.',
    ] },
    { t: 'h2', text: 'Delivery and dedupe' },
    { t: 'list', items: [
      'In-app on the alerts feed, and one batched line to the alerts Discord channel per sweep.',
      'Each level sends at most one approach and one touch per session. After a touch, no approach is sent for that level again that day.',
      'If a level moves (a new Apex strike), it counts as a new level.',
      'The sent list survives restarts, so a redeploy does not repeat alerts.',
    ] },
    { t: 'callout', kind: 'caution', md: 'A touch says price reached a level. It does not say what price will do next.' },
    { t: 'p', md: 'Switch-off: flag `TRIPWIRE_LEVELS` (server `FLAG_TRIPWIRE_LEVELS=off`).' },
    { t: 'disclaimer' },
  ],
};
export default page;
