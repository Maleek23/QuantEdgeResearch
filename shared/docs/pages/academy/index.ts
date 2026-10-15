import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'academy',
  slug: '',
  section: 'field-guide',
  nav: 'Academy',
  title: 'Academy field guide',
  description: 'Where to learn the concepts behind QuantEdge: a daily workflow, what each desk does, and lessons on options, GEX and flow.',
  seoTitle: 'Academy field guide | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'disclaimer' },
    { t: 'h2', text: 'Why it matters' },
    { t: 'p', md: 'The desks assume some vocabulary. Academy teaches it — and the docs you are reading explain each desk in detail.' },
    { t: 'h2', text: 'What is in it' },
    { t: 'table', head: ['Layer', 'Comes from', 'What you see'], rows: [
      ['**Daily workflow**', 'The how-to guide (`/how-to`)', 'What to check from 08:00 to the open, during the session, at lunch and at the close.'],
      ['**What each page does**', 'The how-to guide', 'A card per desk.'],
      ['**How discovery works**', 'The how-to guide', 'How ideas are found before they are published.'],
      ['**Decision tree**', 'The how-to guide', 'A question, and the desk that answers it.'],
      ['**What QuantEdge isn\'t**', 'The how-to guide', 'Its limits and its data sources.'],
      ['**Lessons**', 'Academy articles (`/academy`)', 'Options, market regimes, gamma exposure, flow, risk and trade structure.'],
      ['**PDF guide**', 'Downloadable', 'The how-to guide as a PDF.'],
    ] },
    { t: 'h2', text: 'How to use it' },
    { t: 'list', ordered: true, items: [
      'Read the daily workflow once, then keep the [Glossary](/docs/platform/glossary) open.',
      'When a desk shows something unfamiliar, open its field guide here — each one has a reference table.',
    ] },
    { t: 'callout', kind: 'note', md: 'Some how-to cards still use older names (for example "Journal" for Ledger). The docs use the current product names.' },
  ],
};
export default page;
