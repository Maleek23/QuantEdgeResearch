import type { DocPage } from '../../types';

const page: DocPage = {
  module: 'envelope',
  slug: 'cones',
  section: 'reference',
  nav: '1σ / 2σ cones',
  title: 'Envelope cones: 1σ, 2σ and move vs priced',
  description: 'How the shaped 68% and 95% cones are built from the options-priced move, intraday variance and skew, and how the 09:40 cone is frozen.',
  seoTitle: 'Envelope 1σ / 2σ cones | QuantEdge Docs',
  updated: '2026-10-15',
  blocks: [
    { t: 'callout', kind: 'note', md: 'Every cone is **modelled**: a range built from what the options market prices, not a forecast of where price goes.' },
    { t: 'h2', text: 'What you see' },
    { t: 'list', items: [
      'Two bands past the last candle: the inner **1σ** band (about 68% under a normal approximation) and the faint outer **2σ** band (about 95%).',
      'A horizon picker in the chart legend: **Today**, **Next day**, **Week** and **Month (OpEx)**.',
      'The legend prints the edges as +up / −down for each band, so an uneven cone is visible in numbers too.',
      '**Move vs priced**: how far price has travelled since the frozen 09:40 cone, in units of the σ that cone priced for the time elapsed.',
    ] },
    { t: 'h2', text: 'How the cone is shaped' },
    { t: 'table', head: ['Input', 'Comes from', 'Effect'], rows: [
      ['Per-session move S', 'ATM straddle (or IV × √T) on the weekly, else daily, expiry', 'Sets the width'],
      ['Intraday variance curve', 'Our own 5-minute bars, last ~10 sessions (U-shape default when too few)', 'Fast widening at the open, flat lunch, wider into the close'],
      ['Overnight share', '20% of a session\'s variance, paid at each open crossed', 'A step at each open on multi-day horizons'],
      ['Skew s', '25Δ put IV vs 25Δ call IV on the nearest expiry', 'Upper edge × (1 − s), lower edge × (1 + s)'],
    ] },
    { t: 'p', md: 'σ(t) = S × √(variance share from now to t). The 2σ band is twice the 1σ band on each side.' },
    { t: 'h2', text: 'The frozen 09:40 cone' },
    { t: 'list', items: [
      'The first read at or after 09:40 ET on a weekday stores the spot, S and skew for that day. It does not move afterwards.',
      'Move vs priced = (price now − 09:40 anchor) ÷ σ priced from 09:40 to now. +1.0σ means price moved exactly what was priced for that much of the day.',
      'The readout also shows the move as a share of the whole day\'s 1σ from the anchor.',
      'In replay the cone is hidden: it is the range priced now, not then.',
    ] },
    { t: 'h2', text: 'Limits' },
    { t: 'list', items: [
      'Exchange holidays are not removed from the session count.',
      'No event calendar is wired yet, so earnings or CPI do not add a step.',
      'Normal coverage (68% / 95%) is an assumption. Fat tails make 2σ breaks more common than 5%.',
    ] },
    { t: 'p', md: 'Switch-off: the flag `ENVELOPE_V2` (server `FLAG_ENVELOPE_V2=off`) brings back the plain √t cone.' },
    { t: 'disclaimer' },
  ],
};
export default page;
