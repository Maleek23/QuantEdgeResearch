/**
 * The conviction layers, as one canonical list.
 *
 * The layer count was previously typed by hand in three places on the landing
 * page and disagreed with itself: the section heading claimed 14, the hero
 * claimed 15, and the chips below the heading showed 6 from an older taxonomy.
 * The engine's own type union listed 15 while emitting 16 — `macro` was being
 * assigned to layers without ever being declared.
 *
 * A number that is asserted in prose drifts the moment the engine changes. This
 * is the single source: the engine's union is built from it, and the marketing
 * copy counts it, so the two cannot disagree again.
 */

export const CONVICTION_LAYERS = [
  { kind: 'technical',    label: 'Technical',      short: 'TCH', blurb: 'Price action, RSI, volume against its own average' },
  { kind: 'ta',           label: 'Signals',        short: 'SIG', blurb: 'Named setups the scanner recognises' },
  { kind: 'compression',  label: 'Compression',    short: 'CMP', blurb: 'Darvas box and TTM squeeze — range tightening against its own volatility' },
  { kind: 'gex',          label: 'Gamma',          short: 'GEX', blurb: 'Dealer positioning: flip point, call wall, put wall' },
  { kind: 'convergence',  label: 'Convergence',    short: 'CNV', blurb: 'Independent methods agreeing on the same direction' },
  { kind: 'sector',       label: 'Sector',         short: 'SEC', blurb: 'Is the group being bought, with breadth behind it' },
  { kind: 'regime',       label: 'Regime',         short: 'RGM', blurb: 'Whether the market favours this side today' },
  { kind: 'breadth',      label: 'Breadth',        short: 'BRD', blurb: 'How much of the market is participating' },
  { kind: 'macro',        label: 'Macro',          short: 'MAC', blurb: 'Rates, dollar and cross-asset backdrop' },
  { kind: 'catalyst',     label: 'Catalyst',       short: 'CAT', blurb: 'Tracked events, and whether they argue with the call' },
  { kind: 'analyst',      label: 'Analyst',        short: 'ANL', blurb: 'Estimate revisions and coverage shifts' },
  { kind: 'fundamental',  label: 'Fundamental',    short: 'FND', blurb: 'Quality tier of the underlying business' },
  { kind: 'geopolitical', label: 'Geopolitical',   short: 'GEO', blurb: 'Policy and conflict exposure for the sector' },
  { kind: 'premarket',    label: 'Pre-market',     short: 'PRE', blurb: 'Whether the overnight tape confirms or fights the setup' },
  { kind: 'freshness',    label: 'Freshness',      short: 'FRS', blurb: 'How much of the move has already happened' },
  { kind: 'weekly',       label: 'Weekly',         short: 'WKY', blurb: 'Position within the weekly watchlist thesis' },
] as const;

export type ConvictionLayerKind = (typeof CONVICTION_LAYERS)[number]['kind'];

/** How many layers the engine can score. Count it, never type it. */
export const CONVICTION_LAYER_COUNT = CONVICTION_LAYERS.length;

/**
 * Not every layer fires on every signal — several are conditional (weekly only
 * applies to watchlist names, pre-market only outside regular hours). Copy should
 * say a setup is scored ACROSS these, not that all of them always contribute.
 */
export const CONVICTION_LAYER_NOTE =
  'Not every layer fires on every signal; several are conditional. A signal shows which ones did.';
