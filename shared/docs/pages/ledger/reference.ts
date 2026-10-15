import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'ledger',
  slug: 'reference',
  section: 'reference',
  nav: 'Verification',
  title: 'Ledger verification reference',
  description: 'When the Ledger verification job runs, which rows it excludes, and the sizing rules every row uses.',
  seoTitle: 'Ledger verification reference | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'h2', text: 'Verification schedule' },
    { t: 'table', head: ['Run', 'When (ET)'], rows: [
      ['Daily', '17:30, weekdays'],
      ['Catch-up', '09:20, weekdays'],
      ['After a restart', '15 minutes after boot, if the ledger is older than 26 hours'],
    ] },
    { t: 'h2', text: 'Exclusions' },
    { t: 'table', head: ['Reason shown', 'Meaning'], rows: [
      ['Awaiting entry', 'Trigger not hit yet. Not an open trade, no P&L.'],
      ['Entry never triggered', 'The entry window passed without a trigger.'],
      ['Expired, no measured exit', 'No price data to measure the exit.'],
      ['Contract not recorded', 'An option idea without its contract.'],
      ['No entry premium', 'An option idea without its entry price.'],
    ] },
    { t: 'h2', text: 'Sizing' },
    { t: 'p', md: 'Options: 1 contract at the recorded premium. Stock, crypto and futures: $1,000 notional.' },
  ],
};
export default page;
