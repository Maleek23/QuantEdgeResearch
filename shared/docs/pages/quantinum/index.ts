import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'quantinum',
  slug: '',
  section: 'field-guide',
  nav: 'Quantinum',
  title: 'Quantinum field guide',
  description: 'The analyst that reads every engine for a symbol and answers in cards that name their sources, beside a live chart.',
  seoTitle: 'Quantinum AI analyst guide | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'disclaimer' },
    { t: 'h2', text: 'Why it matters' },
    { t: 'p', md: 'QuantEdge has many engines. Quantinum asks all of them about one symbol and lays out **what each one says, how strongly, and where it got that**, so you do not have to visit every desk.' },
    { t: 'h2', text: 'Where to find it' },
    { t: 'p', md: 'Open **Ask Quantinum** in the terminal, or the full page at `/ask` (a live 5-minute chart beside the conversation; on a phone, the chart sits on top). It is the same conversation in both places. Every docs page has an **Ask Quantinum** button that opens it with the page as context.' },
    { t: 'h2', text: 'The symbol dossier' },
    { t: 'table', head: ['Layer', 'Comes from', 'What you see'], rows: [
      ['**Price**', 'Quote feeds', 'Last, change, source, session and a stale flag.'],
      ['**GEX**', '[GEX](/docs/gravity)', 'Call wall, put wall, zero-γ, regime and wall basis.'],
      ['**Engine layers**', 'Every engine with something to say', 'Signed points (+ bullish, − bearish), the reason, and the source.'],
      ['**Unavailable**', 'Engines with no read', 'Listed by name rather than hidden.'],
      ['**Lean**', 'Sum of layer points', 'Mixed, bullish, bearish or quiet.'],
      ['**Confidence**', 'Size of the net points', 'A display index from 0 to 95. Not a probability.'],
      ['**Short gate**', 'Short-discipline rules', 'Shown next to any bearish lean.'],
    ] },
    { t: 'h2', text: 'Slash commands' },
    { t: 'p', md: 'These run without an AI model and every fact on the card names its source: `/levels`, `/flow`, `/setup`, `/indices`, `/trinity`, `/sector`, `/news` and `/record`. `/record` reads verified outcomes only and says "too few to judge" under 20.' },
    { t: 'h2', text: 'How to read it' },
    { t: 'list', ordered: true, items: [
      'Read the unavailable list as carefully as the layers — silence is information.',
      'A **mixed** lean means meaningful points on both sides; do not average it into a direction.',
      'Quantinum can be wrong. Check the cited source before acting.',
    ] },
  ],
};
export default page;
