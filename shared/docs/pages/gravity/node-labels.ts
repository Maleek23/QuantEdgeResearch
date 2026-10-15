import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'gravity',
  slug: 'node-labels',
  section: 'reference',
  nav: 'Node labels & velocity',
  title: 'Gravity node labels, velocity and Halo',
  description: 'What Apex, Gatekeeper, Rug, Trampoline, delivered and fresh mean, and how node velocity and Halo are measured from 5-minute GEX snapshots.',
  seoTitle: 'Gravity node labels & velocity | QuantEdge Docs',
  updated: '2026-10-15',
  blocks: [
    { t: 'callout', kind: 'note', md: 'These labels are **our structural definitions**. They describe where dealer gamma sits. They are not trade signals.' },
    { t: 'h2', text: 'Labels' },
    { t: 'table', head: ['Label', 'Definition'], rows: [
      ['Apex', 'The largest positive-GEX node in the expiry horizon you picked.'],
      ['Gatekeeper', 'The largest node by size (either sign) strictly between price and the Apex. Price meets it before the Apex.'],
      ['Rug', 'Below price: a positive node sitting directly above a larger negative node. A floor that can give way into faster movement.'],
      ['Trampoline', 'Below price: a negative node sitting directly above a larger positive node. A fast drop into a strong floor.'],
      ['Delivered', 'Today\'s range has already traded through the strike (from 5-minute snapshot prices).'],
      ['Fresh', 'Not traded through yet today.'],
    ] },
    { t: 'h2', text: 'Velocity and Halo' },
    { t: 'list', items: [
      'Velocity = change in a node\'s GEX over **5m**, **15m** and **1h**, divided by the largest node in the current book, so a small name and SPX read on the same scale.',
      'A timeframe counts as moving when the change is at least 5% of that scale.',
      '**Halo** = at least two timeframes moving the same way. **Building** means the node is getting larger (more positive, or more negative for a negative node). **Bleeding** means it is shrinking.',
      'A gap in the snapshots shows as —. Missing samples are never filled in.',
    ] },
    { t: 'h2', text: 'Where you see it' },
    { t: 'list', items: [
      'The **Gravity** workspace layout in GEX, and the "Gravity · node labels + velocity" tool you can add to any GEX layout.',
      'Chart tags (with dealer walls on): GATEKEEPER, RUG → strike, TRAMPOLINE, with HALO ↑ or ↓ when one applies. Hidden in replay.',
      'Data comes from the 5-minute intraday GEX snapshots (`GEX_INTRADAY_SNAPSHOTS`) through `/api/gex/gravity/:symbol`.',
    ] },
    { t: 'p', md: 'Switch-off: flag `GRAVITY_LABELS` (server `FLAG_GRAVITY_LABELS=off`).' },
    { t: 'disclaimer' },
  ],
};
export default page;
