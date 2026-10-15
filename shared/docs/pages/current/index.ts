import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'current',
  slug: '',
  section: 'field-guide',
  nav: 'Current',
  title: 'Current field guide',
  description: 'Live options flow from two labelled sources: sweeps, blocks, unusual volume and net premium, ranked by a significance score.',
  seoTitle: 'Current options flow guide | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'disclaimer' },
    { t: 'h2', text: 'Why it matters' },
    { t: 'p', md: 'Flow shows **where money went**, not why. A large call sweep can be a bet, a hedge or one leg of a spread. Current keeps every print tagged with where it came from, so you can weigh it rather than follow it.' },
    { t: 'h2', text: 'Two sources, kept separate' },
    { t: 'list', items: [
      '**Bullflow** — algo and custom alerts from a third-party flow feed. The alert name is shown as the feed sends it. These rows carry no spot, open interest or bid/ask.',
      '**Chain scan** — QuantEdge\'s own scanner. Spot, open interest and volume-to-OI are measured; the pattern is inferred, so labels read **Sweep-like**, **Block-like** or **Unusual vol**.',
    ] },
    { t: 'callout', kind: 'caution', md: 'Neither feed measures which side was the aggressor, so the tape shows no bull/bear label on a print. Directional leans come from net premium, which the provider infers.' },
    { t: 'h2', text: 'What you see' },
    { t: 'table', head: ['Layer', 'Comes from', 'What you see'], rows: [
      ['**Options Flow**', 'Flow tape (Bullflow + chain scan)', 'Every print, source-tagged and sortable, with its SigScore.'],
      ['**Top Tickers**', 'Bullflow leaders', 'Net premium (ask − bid) or total premium by ticker.'],
      ['**Sweeps & Blocks**', 'Flow tape', 'Today\'s sweeps, blocks and grenades above a premium floor.'],
      ['**Unusual Activity**', 'Chain scan only', 'Volume at 2×, 5× or 10× open interest.'],
      ['**Repeat & Position Builders**', 'Flow repeats and exits', 'Open interest building or unwinding across sessions.'],
      ['**Market Flow Tide**', 'SPY net premium series', 'Cumulative call vs put net premium for SPY — a market proxy.'],
      ['**Flow by Strike / Expiry / Time**', 'Per-ticker tape', 'Call vs put premium per strike, per expiry and per 5-minute bin.'],
      ['**Flow × GEX Convergence**', 'Flow tape + [GEX](/docs/gravity)', 'Traded premium drawn against walls, the magnet and the flip.'],
      ['**Dark Pool**', 'Bullflow dark-pool prints', 'About 28 days of prints summed by price, or today\'s prints of $1M+. Levels, not direction.'],
    ] },
    { t: 'h2', text: 'How to read it' },
    { t: 'list', ordered: true, items: [
      'Sort by **SigScore** to see the biggest, most aggressive, most repeated prints first. It orders prints; it is not a probability or a direction.',
      'Check the source tag. A Bullflow row cannot score above 0.80 because it has no open-interest data.',
      'Look for repeats and OI building across sessions — one print is weak evidence.',
      'Line flow up with GEX: premium traded into a wall reads differently from premium traded through the flip.',
    ] },
  ],
};
export default page;
