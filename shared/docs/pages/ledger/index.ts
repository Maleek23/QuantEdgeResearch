import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'ledger',
  slug: '',
  section: 'field-guide',
  nav: 'Ledger',
  title: 'Ledger field guide',
  description: 'The journal and the verified record: every idea\'s outcome, re-checked against price bars, with what is excluded and why.',
  seoTitle: 'Ledger verified journal guide | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'disclaimer' },
    { t: 'h2', text: 'Why it matters' },
    { t: 'p', md: 'A record is only useful if you can check it. Ledger is where QuantEdge\'s outcomes live — and the **only** place they should be read from. Every headline number counts **verified** rows only, and every excluded row says why.' },
    { t: 'h2', text: 'What "verified" means' },
    { t: 'table', head: ['Status', 'Meaning', 'Counts in headline?'], rows: [
      ['**Verified**', 'An independent recomputation from price bars matched the recorded result (including bar-corrected rows).', 'Yes'],
      ['**Checked**', 'Passed every row-level integrity check, but not yet checked against bars.', 'No'],
      ['**Unverified**', 'Failed a check, is a duplicate, or the bar check disagreed or found no data. Shown with an amber chip; hover for the reason.', 'No'],
    ] },
    { t: 'h2', text: 'Triggered, or not' },
    { t: 'p', md: 'An idea becomes a trade only when its entry **triggered**. An idea still waiting for its trigger is not an open trade and has no P&L. An idea whose entry window passed without triggering is excluded as "entry never triggered". Ideas with no recorded contract or entry premium are excluded too.' },
    { t: 'h2', text: 'What you see' },
    { t: 'table', head: ['Layer', 'Comes from', 'What you see'], rows: [
      ['**Net P&L**', 'Verified rows', 'Bar-verified options P&L, with a note of how many closed rows sit outside the headline and their recorded total.'],
      ['**Calendar**', 'Verified rows by day', 'Each day\'s verified P&L plus a "+N unverified" tag.'],
      ['**Outcome chips**', 'Each row', 'WIN, LOSS, B/E or OPEN.'],
      ['**Row notes**', 'Bar replay', '"Capped at stop", the runner after T1, and the peak price reached.'],
      ['**Edge Score**', 'Your closed trades', 'A six-axis 0–100 score, withheld under 5 closed trades or without an account balance.'],
      ['**Insights**', 'Your trades', 'Activity, a time-of-day heatmap (New York time), results by setup and behaviour notes.'],
    ] },
    { t: 'h2', text: 'How to read it' },
    { t: 'list', ordered: true, items: [
      'Always read a rate with its **sample size**. The platform does not quote a win rate below 30 closed trades.',
      'Sizing is fixed so rows compare: options are 1 contract at the recorded premium; stock, crypto and futures are $1,000 notional.',
      'Look at the unverified count. A large one means the headline covers fewer trades than the list.',
    ] },
  ],
};
export default page;
