import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'ledger',
  slug: 'proof',
  section: 'reference',
  nav: 'Proof page',
  title: 'The Proof page',
  description: 'What the public /proof page shows: the bar-verified NEXUS record and Path model calibration, with sample sizes, dates and age.',
  seoTitle: 'The Proof page | QuantEdge Docs',
  updated: '2026-10-15',
  blocks: [
    { t: 'p', md: 'The public [Proof page](/proof) has two sections. Both read live endpoints. Nothing on the page is typed in by hand.' },
    { t: 'h2', text: 'Verified NEXUS record' },
    { t: 'list', items: [
      'Only closed ideas whose P&L was re-computed against market bars and matched are counted.',
      'Outcomes before **26 Aug 2026** are invalid and never counted.',
      'Each figure shows its sample size (n), its date range and when the verification ledger last ran.',
      'A rate is shown as **Withheld** until the sample reaches the minimum.',
      'Unverified and checked-only ideas are counted separately and left out of the numbers.',
    ] },
    { t: 'h2', text: 'Path calibration' },
    { t: 'list', items: [
      'Each weekday the Path model\'s session fan is frozen at 09:40 ET for SPY, QQQ and SPX.',
      'After the session, the 5-minute closes are checked against that frozen fan. A calibrated model has about half the closes inside the 50% fan and about four in five inside the 80% fan.',
      'Coverage is published only after 20 scored sessions. Until then the page says **Collecting since** the first snapshot date.',
    ] },
    { t: 'p', md: 'Switch-off: flag `PROOF_PAGE` (server `FLAG_PROOF_PAGE=off`).' },
    { t: 'disclaimer' },
  ],
};
export default page;
