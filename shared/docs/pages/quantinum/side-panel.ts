import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'quantinum',
  slug: 'side-panel',
  section: 'reference',
  nav: 'Side panel (⌘\\)',
  title: 'Quantinum side panel',
  description: 'Open the analyst on any app page with ⌘\\ or Ctrl+\\. It reads the page you are on, and Push back makes it re-check its answer with sources.',
  seoTitle: 'Quantinum side panel | QuantEdge Docs',
  updated: '2026-10-15',
  blocks: [
    { t: 'h2', text: 'Open it' },
    { t: 'list', items: [
      'Press **⌘\\** (Mac) or **Ctrl+\\** (Windows) on any signed-in page, or tap the Ask Quantinum button.',
      'It is the same conversation as the [/ask](/ask) page, so a thread started on Gravity is still there on NEXUS.',
    ] },
    { t: 'h2', text: 'Page context' },
    { t: 'p', md: 'The panel sends the page you are on with each question: the route, the tab (Gravity, Current, Trajectory, Ledger…) and the symbol in the URL or in focus. The header shows what it is reading.' },
    { t: 'h2', text: 'Push back' },
    { t: 'list', items: [
      '**Re-check** asks the same question again on fresh data and lists what changed.',
      '**Push back** challenges the answer: Quantinum re-fetches the data, cites the source and age of every figure, and says which claims the data does not support.',
      'A push-back counts as one question against your daily allowance.',
    ] },
    { t: 'p', md: 'Switch-off: flag `QUANTINUM_PANEL` (per device `localStorage qe-flag-quantinum_panel=off`). Access to the analyst itself still follows your account.' },
    { t: 'disclaimer' },
  ],
};
export default page;
