import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'current',
  slug: 'reference',
  section: 'reference',
  nav: 'SigScore & kinds',
  title: 'Current SigScore and print kinds',
  description: 'How Current scores a print (SigScore), how print kinds are assigned, and how often each tile refreshes.',
  seoTitle: 'Current SigScore reference | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'h2', text: 'SigScore (0–1)' },
    { t: 'table', head: ['Part', 'Weight', 'Scale'], rows: [
      ['Size', '0.40', 'Premium, log-scaled: $50K → 0, $10M → 1.'],
      ['Aggression', '0.20', 'Sweep 1 · block 0.5 · other 0.'],
      ['Repeat', '0.20', '(prints − 1) ÷ 4, capped at 1.'],
      ['Volume / OI', '0.20', '(vol ÷ OI) ÷ 5, capped at 1. Bullflow rows have no OI.'],
    ] },
    { t: 'p', md: 'The **High Sig** filter shows prints with a SigScore of 0.60 or more.' },
    { t: 'h2', text: 'Print kinds' },
    { t: 'p', md: 'Kinds are sweep, block, unusual, repeater, grenade, custom and other. Bullflow rows take their kind from the alert name; chain-scan rows from the scanner\'s flow type.' },
    { t: 'h2', text: 'Cadence' },
    { t: 'table', head: ['Feed', 'Cache'], rows: [
      ['Flow tape', '15 seconds'],
      ['Top tickers', '6 minutes'],
      ['Net premium series', '3 minutes'],
      ['Dark pool', '30 minutes'],
    ] },
  ],
};
export default page;
