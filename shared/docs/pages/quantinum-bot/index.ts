import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'quantinum-bot',
  slug: '',
  section: 'field-guide',
  nav: 'Quantinum Bot',
  title: 'Quantinum Bot field guide',
  description: 'A paper-trading bot that takes NEXUS ideas under fixed, written rules — its book, its gates and every refusal on view.',
  seoTitle: 'Quantinum Bot field guide | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'disclaimer' },
    { t: 'callout', kind: 'note', md: 'The bot trades **paper** money only. Its fills are simulated.' },
    { t: 'h2', text: 'Why it matters' },
    { t: 'p', md: 'Rules are easy to write and hard to follow. The bot follows them every time, on a $100,000 paper account, so you can see what a rule set does without discretion getting in the way.' },
    { t: 'h2', text: 'What you see' },
    { t: 'table', head: ['Layer', 'Comes from', 'What you see'], rows: [
      ['**Paper Book**', 'Bot status (60-second refresh)', 'Holdings with cash and marks, mark age, brackets, and where each mark sits between stop and target.'],
      ['**Record**', 'The bot\'s journal on [Ledger](/docs/ledger)', 'Count, wins and losses, realized and open P&L.'],
      ['**Automation KPIs**', 'Convictions, outcomes, FRED', 'A win rate only once there are 30+ outcomes with 80%+ coverage.'],
      ['**Blocked Ledger**', 'Discipline gate', 'Shorts the gate refused, replayed on daily bars.'],
      ['**Gates & Rules**', 'Bot rules', 'Every rule, with the file that enforces it.'],
      ['**Activity Log**', 'Bot cycles', 'Every action and every refusal, tallied by reason.'],
    ] },
    { t: 'h2', text: 'The rules' },
    { t: 'list', items: [
      '**0DTE sleeve** — up to 3 positions, $150 risk each, entries 09:31–11:30 ET. Stop −40%; at +50% the stop moves to breakeven; target +100%. Flat by 15:45 ET.',
      '**Swing sleeve** — up to 4 positions, NEXUS grade 65+, $500 risk, $1,500 maximum debit.',
      'One position per symbol, never both directions on one symbol, no re-entry the same day after a stop-out.',
      'Shorts need a dated, high-impact catalyst and fail closed. A macro cash gate reads FRED data.',
      'A cycle runs every 10 minutes from 09:34 to 15:54 ET, then flattens at 15:56 and settles at 16:20.',
    ] },
    { t: 'h2', text: 'How to read it' },
    { t: 'list', ordered: true, items: [
      'Read the Record with its count. A short run of wins or losses says little.',
      'Read the Blocked Ledger to see what the rules cost or saved.',
      'Mark age matters: a stale mark is not the position\'s value.',
    ] },
  ],
};
export default page;
