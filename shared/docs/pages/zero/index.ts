import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'zero',
  slug: '',
  section: 'field-guide',
  nav: 'Zero',
  title: 'Zero field guide',
  description: 'The same-day (0DTE) desk inside NEXUS: per-name levels, trade cards with live marks, and the engine\'s own record.',
  seoTitle: 'Zero 0DTE field guide | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'disclaimer' },
    { t: 'callout', kind: 'caution', md: 'Same-day options can lose their full value within hours. Read every card as a scenario with a defined stop, not a recommendation.' },
    { t: 'h2', text: 'Why it matters' },
    { t: 'p', md: 'On expiry day, the levels that matter are the ones for **that expiry**. Zero builds them from today\'s chain only, puts the expected move beside them, and turns each idea into one card that answers: **can I still trade this, right now?**' },
    { t: 'h2', text: 'Where to find it' },
    { t: 'p', md: 'Open [NEXUS](/docs/nexus) and choose the **0DTE** view. The desk watches a short list of names (by default SPX, MSTR, META, BE and TSLA).' },
    { t: 'h2', text: 'The per-name panel' },
    { t: 'table', head: ['Layer', 'Comes from', 'What you see'], rows: [
      ['**Exp. move today**', 'ATM straddle or IV on today\'s chain', 'The ± move the market is pricing for the session. See [Envelope](/docs/envelope).'],
      ['**Call wall · Put wall · Zero-γ · King node**', 'GEX on today\'s expiry only', 'Single-expiry levels, each linking to [Gravity](/docs/gravity). A footnote states the expiry, contract count and share of gamma modelled.'],
      ['**Regime**', 'Net vs gross GEX', 'Positive or negative gamma, with a **near flip** flag within 1% of zero-γ.'],
      ['**VWAP**', '5-minute bars', 'The level, and which side price is on.'],
      ['**Opening range**', '5-minute bars', 'Opening-range breakout state and the first-30-minute high and low.'],
      ['**Flow tide · Day net premium**', 'Bullflow prints and net premium', 'Whether call or put premium is leading today.'],
    ] },
    { t: 'h2', text: 'The trade card' },
    { t: 'list', items: [
      'Contract and side, entry (trigger and mid at entry), stop on both premium and underlying, T1 and T2, and reward-to-risk.',
      'Time left and the grade.',
      '**Live mark and live underlying**, each stamped with source and age. A mark older than 2 minutes, or from a delayed feed, reads **delayed**; older than 20 minutes is **stale**.',
      'Progress toward T1.',
    ] },
    { t: 'h2', text: 'How to read it' },
    { t: 'list', ordered: true, items: [
      'Check the engine status first. **Blind** means its options data is too old, and it publishes nothing until it catches up.',
      'Read the regime: negative gamma means moves tend to run; positive gamma means they tend to stall at walls.',
      'Read the card\'s stamps before the numbers. A delayed mark is not a fill price.',
      'The **Record** strip is this engine only. A **LOW N** badge means fewer than 20 decided outcomes — too few to judge.',
    ] },
    { t: 'callout', kind: 'note', md: 'Short swings (2–4 days) and the Sniper list are labelled **unvalidated** in the app until they have a forward record.' },
  ],
};
export default page;
