import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'gravity',
  slug: '',
  section: 'field-guide',
  nav: 'Gravity',
  title: 'Gravity field guide',
  description: 'Dealer positioning modelled from open interest: GEX and VEX by strike, the call and put walls, the king node and the zero-gamma flip.',
  seoTitle: 'Gravity GEX field guide | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'disclaimer' },
    { t: 'h2', text: 'Why it matters' },
    { t: 'p', md: 'Options dealers hedge. When they are long gamma they sell rallies and buy dips, which tends to **dampen** moves; when they are short gamma they chase price, which tends to **amplify** them. Gravity estimates where that hedging pressure sits by strike, so you can see the levels before price gets there.' },
    { t: 'callout', kind: 'caution', md: 'Real dealer positions are not published. Gravity assumes dealers are long the calls and short the puts customers trade (the **naive-OI** convention). Every number here is a model of likely hedging, not an observation.' },
    { t: 'h2', text: 'What you see' },
    { t: 'table', head: ['Layer', 'Comes from', 'What you see'], rows: [
      ['**Dealer Map**', 'GEX engine on Alpaca / CBOE chains', 'Net GEX per strike for expiries within 7 days, with walls, max-γ and zero-γ rows marked.'],
      ['**Strike × Expiry Matrix**', 'GEX engine', 'GEX or VEX per cell, coloured per expiry by default (or absolute), with net per expiry.'],
      ['**Gamma Profile**', 'GEX re-priced across spot', 'Net GEX re-priced over ±20% of spot. Where the line crosses zero is the flip.'],
      ['**Key Levels**', 'GEX engine', 'A price rail with walls, max-γ, zero-γ, net GEX and VEX, and near-dated nodes.'],
      ['**Regime & Narrative**', 'Net vs gross GEX', 'Plain-language dealer behaviour, and what changes if a wall holds or breaks.'],
      ['**Cross-Ticker Rankings**', 'GEX hub (3-minute refresh)', 'Tickers ranked by play score or by size of VEX.'],
      ['**Magnet Setups**', 'GEX rankings', 'Near-expiry gamma just beyond spot, opened today, with price moving toward it.'],
      ['**Squeeze Radar**', 'GEX + flow components', 'A 0–100 squeeze score with its parts. Labelled unvalidated in the app.'],
      ['**Trinity**', 'SPY, QQQ, IWM (optional SPX)', 'Heatmaps side by side with a one-line read of whether they agree.'],
    ] },
    { t: 'h2', text: 'The levels' },
    { t: 'list', items: [
      '**Call wall** — the strike above spot with the most call GEX. Price often stalls there.',
      '**Put wall** — the strike below spot with the most put GEX. Often support until it breaks.',
      '**King node (max-γ)** — the single strike with the largest absolute GEX. Price is often pulled toward it near expiry.',
      '**Zero-γ (flip)** — the spot price where net modelled GEX would be zero. Above it, moves tend to be calmer; below it, faster.',
    ] },
    { t: 'p', md: 'Walls are taken from the **next-7-day** book when it has one, otherwise from all expiries. Every surface prints which basis it used.' },
    { t: 'h2', text: 'How to read it' },
    { t: 'list', ordered: true, items: [
      'Read the regime first: positive, negative, neutral (under 5% net), or **near flip** (spot within 1% of zero-γ).',
      'In positive gamma, treat walls as places price tends to stall. In negative gamma, treat a broken wall as a place moves can speed up.',
      'Check the basis and the chain\'s age. A CBOE chain runs about 15 minutes behind.',
      'Use VEX for volatility: positive VEX means dealers buy as implied volatility rises.',
    ] },
  ],
};
export default page;
