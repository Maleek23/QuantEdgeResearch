import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'platform',
  slug: '',
  section: 'field-guide',
  nav: 'Platform field guide',
  title: 'QuantEdge field guide',
  description: 'How the desks fit together: where ideas come from, how levels are modelled, and where every outcome is recorded.',
  seoTitle: 'Field guide | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'disclaimer' },
    { t: 'h2', text: 'What QuantEdge is' },
    { t: 'p', md: 'QuantEdge is a research terminal for US equities, index options and crypto. It puts dealer positioning, options flow, price structure and a published idea record in one place, and labels every number with where it came from and how old it is.' },
    { t: 'h2', text: 'The modules' },
    { t: 'table', head: ['Module', 'Job', 'Docs'], rows: [
      ['**NEXUS**', 'The trading desk: ranked setups with entry, stop and targets.', '[Field guide](/docs/nexus)'],
      ['**Zero**', 'The same-day (0DTE) index desk inside NEXUS.', '[Field guide](/docs/zero)'],
      ['**GEX**', 'Dealer positioning: GEX, VEX, walls and the zero-gamma flip.', '[Field guide](/docs/gravity)'],
      ['**Current**', 'Live options flow: prints, sweeps and blocks.', '[Field guide](/docs/current)'],
      ['**Chart**', 'The chart, with levels and the Path projection.', '[Field guide](/docs/trajectory)'],
      ['**Expected move**', 'Expected-move cones from implied volatility.', '[Field guide](/docs/envelope)'],
      ['**LEAPS & Swings**', 'LEAPS and swing candidates, 30 days to a year.', '[Field guide](/docs/horizon)'],
      ['**Journal**', 'The journal and the verified record of outcomes.', '[Field guide](/docs/ledger)'],
      ['**Alerts**', 'Alerts on price, levels and ideas.', '[Field guide](/docs/tripwire)'],
      ['**Quantinum**', 'The AI analyst that reads every engine for a symbol.', '[Field guide](/docs/quantinum)'],
      ['**Quantinum Bot**', 'A paper-trading bot with a public record.', '[Field guide](/docs/quantinum-bot)'],
      ['**Academy**', 'Lessons on options, GEX and flow.', '[Field guide](/docs/academy)'],
    ] },
    { t: 'h2', text: 'How to read any number' },
    { t: 'list', items: [
      '**Measured** values (a quote, a print) come straight from a feed. Check the source and the age stamp.',
      '**Modelled** values (GEX, the Path fan, a cone, a score) are built on assumptions. Read them as scenarios, not forecasts.',
      '**Recorded** values (wins, losses, R) live on [Journal](/docs/ledger) with their sample size. Do not read any other page as a performance claim.',
    ] },
    { t: 'h2', text: 'Next' },
    { t: 'p', md: 'New to the vocabulary? Start with the [Glossary](/docs/platform/glossary). Want to know which feed is which? See [Data sources](/docs/platform/data-sources).' },
  ],
};
export default page;
