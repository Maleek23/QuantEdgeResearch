/**
 * THE glossary — one source for every "What is this?" chip (client/src/components/onboarding/term.tsx),
 * the onboarding tours and the Start-here checklist. Plain English, ≤ 2 sentences,
 * no promises about outcomes.
 */
export interface GlossaryEntry { term: string; short: string; more?: string }

export const GLOSSARY = {
  gex: {
    term: 'GEX (gamma exposure)',
    short: 'An estimate of how much options dealers must buy or sell as price moves. Positive GEX tends to dampen moves; negative GEX tends to amplify them.',
    more: 'It is modelled from open interest, so it is a map of likely hedging pressure, not a forecast.',
  },
  'call-wall': {
    term: 'Call wall',
    short: 'The strike with the most call gamma. Price often stalls near it because dealer hedging pushes back as price approaches.',
  },
  'put-wall': {
    term: 'Put wall',
    short: 'The strike with the most put gamma. It often acts as support until it breaks; below it, moves can speed up.',
  },
  'gamma-flip': {
    term: 'Gamma flip (zero-γ)',
    short: 'The price where net dealer gamma changes sign. Above it moves tend to be calmer; below it they tend to be faster.',
  },
  '0dte': {
    term: '0DTE',
    short: 'Options that expire the same day (zero days to expiration). Cheap and fast — they can go to $0 within hours.',
  },
  r: {
    term: 'R (risk unit)',
    short: 'The amount you planned to lose if the stop hits. +2R means you made twice what you risked; −1R means the stop hit.',
  },
  targets: {
    term: 'T1 / T2',
    short: 'First and second profit targets. Many traders take some off at T1 and let the rest work toward T2.',
  },
  vwap: {
    term: 'VWAP',
    short: 'Volume-weighted average price for the session. Above it buyers are in control on average; below it sellers are.',
  },
  orb: {
    term: 'ORB (opening-range breakout)',
    short: 'A trade taken when price breaks above or below the high/low of the first minutes after the open.',
  },
  delta: {
    term: 'Delta',
    short: 'How much an option’s price moves for a $1 move in the stock. A 0.30 delta call gains about $0.30 per $1 up.',
  },
  flow: {
    term: 'Options flow',
    short: 'Large or unusual options orders as they print. It shows where money went, not why — many are hedges.',
  },
  // UI audit 2026-10-07 #22 — terms members met with no explanation.
  'king-node': {
    term: 'King node (max γ)',
    short: 'The single strike with the most dealer gamma. Price is often pulled toward it and pins there, especially near expiry.',
  },
  'delta-adjusted': {
    term: 'Δ-adjusted GEX',
    short: 'Gamma exposure re-measured for a real ±1% move, with each option’s delta re-priced. It can move the walls a strike or two versus the raw estimate.',
  },
  'naive-oi': {
    term: 'Dealer sign assumption',
    short: 'We assume dealers are long the calls and short the puts customers trade. Real dealer positions aren’t published, so the sign is an estimate.',
  },
  'validation-hold': {
    term: 'Validation hold',
    short: 'Not enough outcomes are fully recorded yet to quote a win rate. The counts are shown, but they are not a performance claim.',
  },
  'win-loss': {
    term: 'W–L count',
    short: 'Wins and losses among trades that have finished. 37W–51L means 37 reached their target and 51 hit their stop.',
  },
  'engine-blind': {
    term: 'Index engine status',
    short: 'Whether the 0DTE index engine has fresh SPY options data. “Blind” means its data is too old to trust during the session, so it posts no index ideas until it catches up.',
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
export const isGlossaryKey = (k: string): k is GlossaryKey => k in GLOSSARY;
