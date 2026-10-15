import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'nexus',
  slug: '',
  section: 'field-guide',
  nav: 'NEXUS',
  title: 'NEXUS field guide',
  description: 'The trading desk: published setups ranked by how much independent evidence lines up, each with an entry, a stop and targets.',
  seoTitle: 'NEXUS field guide | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'disclaimer' },
    { t: 'h2', text: 'Why it matters' },
    { t: 'p', md: 'Most scanners give you a list of tickers. NEXUS gives you a **plan**: a trigger, a stop, T1 and T2, and the evidence behind it, then keeps checking whether that plan is still takeable. It answers one question: **which published setups have the most evidence behind them, and which can still be acted on right now?**' },
    { t: 'h2', text: 'The three views' },
    { t: 'list', items: [
      '**Board** — the ranked setups and the tools around them.',
      '**0DTE** — the same-day index desk. See [Zero](/docs/zero).',
      '**History** — setups by day with their outcomes and the data health for that day.',
    ] },
    { t: 'h2', text: 'What is on the board' },
    { t: 'table', head: ['Layer', 'Comes from', 'What you see'], rows: [
      ['**Ranked Setups**', 'Convictions engine (`/api/convictions`)', 'Published setups ranked by conviction. Filter by side, recency, top 10, S–A band, ticker or sector. List, grid or table.'],
      ['**Setup Detail**', 'Convictions engine, pattern scanner, extended-hours quotes', 'A chart with trigger, stop and T1 drawn on it, plus tabs for overview, technicals, management, risk and the contract.'],
      ['**Developing Candidates**', 'Pattern scanner', 'Structures within 20% of their trigger that have not been published yet.'],
      ['**Tracked Symbols**', 'Levels engine, Bullflow net premium', 'Live quote, nearest support and resistance, today\'s options net premium and any open ideas.'],
      ['**Rotation Strip**', 'Sector-ignition engine', 'Peer groups moving from quiet to stirring, igniting, then extended.'],
      ['**Market Context**', 'Market pulse, 10Y / TLT / VIX', 'The regime, a macro gauge and the side the regime prefers.'],
      ['**Book by Horizon**', 'Each idea\'s holding window', 'Ideas grouped as 0DTE, weekly, swing, monthly, position and LEAPS.'],
      ['**Trader Calls**', 'Imported trader journals', 'Recent calls from ranked traders. Evidence only: not scored into conviction and not used by the bot.'],
    ] },
    { t: 'h2', text: 'Conviction: how much evidence lines up' },
    { t: 'p', md: 'Every setup is scored by up to 17 independent **layers** — technical structure, signals, compression, GEX, sector, regime, breadth, macro, catalysts, analysts, fundamentals, pre-market, freshness, weekly structure and more. Each layer adds or subtracts points. The total maps to a band:' },
    { t: 'table', head: ['Band', 'Raw points', 'Shown as'], rows: [
      ['**S**', '25 or more', '86–99'],
      ['**A**', '19–24', '72–86'],
      ['**B**', '13–18', '58–72'],
      ['**C**', 'below 13', 'below 58'],
    ] },
    { t: 'callout', kind: 'caution', md: 'The displayed number is a 0–100 rescale of the raw points. **It is not a percentage chance of winning.** A 90 means many layers agree, not that the trade works 90% of the time.' },
    { t: 'h2', text: 'The NEXUS grade: can I still act on it?' },
    { t: 'p', md: 'The letter grade (A–F) is an **actionability** score. It rewards conviction, but also asks whether the plan is still fresh and has time left. See the [reference](/docs/nexus/reference) for the factor weights.' },
    { t: 'h2', text: 'How to read it' },
    { t: 'list', ordered: true, items: [
      'Start with the band: S and A have the most independent agreement.',
      'Check the grade: a high band with a low grade usually means the setup is stale or its window is nearly over.',
      'Open Setup Detail and read the layers. A score carried by one layer is weaker than one spread across many.',
      'Check the stamps. Publish-time prices are repriced live or shown with their age.',
      'For how setups have actually resolved, use [Ledger](/docs/ledger), where every result carries its sample size.',
    ] },
  ],
};
export default page;
