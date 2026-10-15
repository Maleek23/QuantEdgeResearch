import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'quantinum-bot',
  slug: 'reference',
  section: 'reference',
  nav: 'Sleeves & schedule',
  title: 'Quantinum Bot sleeves and schedule',
  description: 'The bot\'s account size, sleeve limits, brackets and daily schedule, in one table.',
  seoTitle: 'Quantinum Bot reference | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'h2', text: 'Account' },
    { t: 'p', md: 'Paper portfolio "Quant Bot · 100K": $100,000 starting capital, up to 10 open positions.' },
    { t: 'h2', text: 'Sleeves' },
    { t: 'table', head: ['Sleeve', 'Max positions', 'Risk', 'Other'], rows: [
      ['0DTE', '3', '$150', 'Entries 09:31–11:30 ET · −40% stop · breakeven at +50% · +100% target · flat 15:45'],
      ['Swing', '4', '$500', 'NEXUS grade 65+ · $1,500 max debit'],
    ] },
    { t: 'h2', text: 'Schedule (ET)' },
    { t: 'table', head: ['Job', 'Time'], rows: [
      ['Cycle', 'Every 10 minutes, 09:34–15:54'],
      ['Flatten', '15:56'],
      ['Settle', '16:20'],
    ] },
  ],
};
export default page;
