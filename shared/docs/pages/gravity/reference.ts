import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'gravity',
  slug: 'reference',
  section: 'reference',
  nav: 'GEX math',
  title: 'Gravity math and definitions',
  description: 'How Gravity computes GEX, VEX, the walls, the regime and the zero-gamma flip, and the assumptions behind each.',
  seoTitle: 'Gravity GEX math | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'h2', text: 'Formulas' },
    { t: 'table', head: ['Quantity', 'Formula', 'Unit'], rows: [
      ['GEX', '`Γ × OI × 100 × S² × 0.01`', '$ of underlying dealers trade per 1% spot move'],
      ['VEX', '`vanna × OI × 100 × S × 0.01`', '$ per 1 point of implied volatility'],
      ['Regime balance', '`net GEX ÷ gross GEX`', 'Neutral when its size is under 5%'],
    ] },
    { t: 'h2', text: 'Zero-gamma' },
    { t: 'p', md: 'Zero-γ is found by re-pricing Black-Scholes gamma for every contract across a grid of hypothetical spot prices and bisecting the sign change nearest the current spot. It is **not** the strike where the cumulative per-strike total changes sign.' },
    { t: 'h2', text: 'Regime labels' },
    { t: 'table', head: ['Label', 'Rule', 'Typical behaviour'], rows: [
      ['Positive (+γ)', 'Balance above +5%', 'Dealers dampen moves.'],
      ['Negative (−γ)', 'Balance below −5%', 'Dealers amplify moves.'],
      ['Neutral', 'Balance within ±5%', 'No strong hedging pressure either way.'],
      ['Near flip', 'Spot within 1% of zero-γ', 'Behaviour can change quickly.'],
    ] },
    { t: 'h2', text: 'Cadence and sources' },
    { t: 'list', items: [
      'Chains from Alpaca, or the CBOE delayed feed.',
      'Gravity tiles refetch every 2–3 minutes.',
      'Δ-adjusted GEX re-measures exposure for a real ±1% move; it can shift walls by a strike or two versus the raw estimate.',
    ] },
  ],
};
export default page;
