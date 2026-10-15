import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'trajectory',
  slug: 'reference',
  section: 'reference',
  nav: 'Path parameters',
  title: 'Path projection parameters',
  description: 'The parameters behind the Chart Path fan: path count, volatility model, node pull, skew, horizons and chart defaults.',
  seoTitle: 'Path projection parameters | QuantEdge Docs',
  updated: '2026-10-14',
  blocks: [
    { t: 'h2', text: 'Engine parameters' },
    { t: 'table', head: ['Parameter', 'Value', 'Notes'], rows: [
      ['Paths', '2,000 (100–10,000)', 'Deterministic for a given seed.'],
      ['Step', '5 minutes, regular hours', 'Intraday variance curve from the last 10 sessions, U-shape fallback.'],
      ['Overnight share', '20%', 'Applied at each open the horizon crosses.'],
      ['Node pull (λ)', '0.12 in positive gamma, else 0', 'Capped at 0.35σ per step.'],
      ['Negative-node vol', 'Up to 1.6×', 'No pull.'],
      ['Skew', '25Δ put IV vs 25Δ call IV', 'Clamped to ±0.25.'],
      ['Bands', 'p10 · p25 · p50 · p75 · p90', '50% band = p25–p75; 80% band = p10–p90.'],
      ['Cache', '60 seconds', 'Per symbol and horizon.'],
    ] },
    { t: 'callout', kind: 'note', md: 'NYSE full-day holidays (2026–2027 table) are removed from the horizon grid. Early 1 pm closes are still treated as full sessions.' },
    { t: 'h2', text: 'Known events' },
    { t: 'p', md: 'Scheduled events inside the horizon add one random jump to every simulated path at the step they land on. Macro releases come from the economic calendar (FRED release dates, with a curated floor); a stock\'s own earnings date comes from the earnings calendar. Index symbols get no earnings step.' },
    { t: 'table', head: ['Event', 'Jump size (1σ)', 'When it lands'], rows: [
      ['High-importance macro (CPI, NFP, FOMC…)', '0.35 × the priced session move', 'At its time if inside 09:30–16:00 ET, else the next open'],
      ['Medium-importance macro', '0.15 × the priced session move', 'Same'],
      ['Earnings', 'The implied earnings move when known, else 1 × the session move', 'Before open: that open. After close: the next open'],
    ] },
    { t: 'callout', kind: 'note', md: 'These weights are modelled, not fitted. The priced session move already holds some event premium, so the weights stay below 1 to limit double-counting. The payload note lists the events used.' },
    { t: 'h2', text: 'Chart defaults' },
    { t: 'p', md: 'Walls, GEX bubbles, expected move and Path are on by default (Path horizon: Session, bands: both, terminal density: on). Overlays refetch every 1–5 minutes, only while the chart is visible.' },
  ],
};
export default page;
