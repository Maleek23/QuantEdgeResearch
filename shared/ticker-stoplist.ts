/**
 * Words that look like tickers but are not (pure, no I/O; client + server).
 *
 * Discord journals are written in chart shorthand: "HH/HL on the HTF, RR 3:1,
 * OI building". The upper-case word scanner in shared/discord-journal-parser.ts
 * read those as tickers. Femi's notes carried HH 17, OI 15, HL 13, HTF 9, RR 9
 * and LTF 6 as "symbols", and his watchlist got `CES HOLY LTF SHIT`
 * (docs/FEMI_JOURNAL_ANALYSIS_2026-09-30.md, data-quality issue 3).
 *
 * Three layers, applied in this order:
 *   1. CHART_JARGON   TA / options / macro-event abbreviations. Never a ticker
 *                     when written bare in prose.
 *   2. ENGLISH_CAPS   common English words people type in caps for emphasis
 *                     ("HOLY", "SHIT", "LETS", "GOOD"). Never a ticker when bare.
 *   3. universe       the server's ticker universe (liquid top-2000 + curated
 *                     sectors + approved list + crypto/futures roots). When it is
 *                     known, a symbol must be in it. When it is cold (tests, the
 *                     client, a fresh droplet with no snapshot), layers 1-2 still
 *                     apply and nothing is invented.
 *
 * "Explicit" mentions ($BE, "BE 30c 10/2", "100 shares of F") skip layers 1-2:
 * the writer marked the word as an instrument. They still have to be in the
 * universe when it is known, so "$HTF" goes nowhere.
 *
 * Deliberately NOT in ENGLISH_CAPS: words that in a trading channel are almost
 * always the ticker (HOOD, COIN, SNOW, SHOP, NET, PATH, ARM, PLAY, OPEN...).
 */

/** TA, options, order-flow and macro-event shorthand. Upper case. */
export const CHART_JARGON: ReadonlySet<string> = new Set([
  // Structure / trend
  'HH', 'HL', 'LH', 'LL', 'EQH', 'EQL', 'BOS', 'CHOCH', 'MSS', 'SR', 'SNR',
  // Timeframes
  'HTF', 'LTF', 'MTF', 'DTF', 'WTF', 'TF', 'D1', 'H1', 'H4', 'M5', 'M15', 'M30', 'W1', 'MN',
  // Indicators / levels
  'EMA', 'SMA', 'MA', 'VWAP', 'AVWAP', 'RSI', 'MACD', 'FIB', 'FIBS', 'ATR', 'ADX', 'OBV', 'BB', 'BBANDS', 'KC', 'TTM',
  'POC', 'VAH', 'VAL', 'VP', 'HVN', 'LVN', 'FVG', 'IFVG', 'OB', 'BPR', 'SMT', 'ICT', 'SMC', 'EWT', 'ABC', 'GP',
  'ATH', 'ATL', 'HOD', 'LOD', 'HOW', 'LOW', 'PDH', 'PDL', 'PDC', 'PWH', 'PWL', 'PMH', 'PML', 'ONH', 'ONL', 'ORB', 'ORH', 'ORL', 'IB',
  'R1', 'R2', 'R3', 'S1', 'S2', 'S3', 'PP',
  // Sessions / time
  'PM', 'AH', 'AM', 'RTH', 'ETH', 'EOD', 'EOW', 'EOM', 'EOY', 'BOD', 'MOC', 'MOO', 'OPEX', 'QUAD', 'WK', 'MO', 'YR',
  // Options
  'OTM', 'ITM', 'ATM', 'IV', 'IVR', 'IVP', 'HV', 'DTE', 'ODTE', 'OI', 'GEX', 'DEX', 'VEX', 'CHEX', 'GAMMA', 'DELTA', 'THETA', 'VEGA',
  'LEAP', 'LEAPS', 'CSP', 'CC', 'PCR', 'UOA', 'BTO', 'STO', 'BTC', 'STC', 'OCO', 'OTO', 'MM', 'MMS',
  // Risk / execution
  'TP', 'TP1', 'TP2', 'TP3', 'SL', 'BE', 'RR', 'R', 'PT', 'PT1', 'PT2', 'PTS', 'PNL', 'PL', 'DCA', 'AVG', 'QTY', 'SIZE', 'FOMO', 'FUD',
  // Macro / events
  'CPI', 'PPI', 'PCE', 'FOMC', 'NFP', 'GDP', 'JOLTS', 'ISM', 'PMI', 'FED', 'ECB', 'BOJ', 'CES', 'ER', 'EPS', 'YOY', 'QOQ', 'MOM',
  // Market-wide shorthand (indices traders name without a ticker)
  'SPX', 'NDX', 'RUT', 'VIX', 'DXY', 'TNX', 'US10Y', 'US02Y',
  // Patterns
  'HNS', 'IHS', 'H&S', 'DB', 'DT', 'BF', 'ABCD',
]);

/**
 * Common English words, upper case. Function words, chat words and the
 * profanity/emphasis people type in caps. Not exhaustive: the universe check
 * on the server is the real gate; this list is what keeps a cold universe honest.
 */
export const ENGLISH_CAPS: ReadonlySet<string> = new Set([
  'A', 'I', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'HE', 'IF', 'IN', 'IS', 'IT', 'ME', 'MY', 'NO', 'OF', 'OH', 'OK', 'ON', 'OR', 'SO',
  'TO', 'UP', 'US', 'WE', 'YO', 'YA', 'YE',
  'ALL', 'AND', 'ANY', 'ARE', 'ASK', 'BAD', 'BIG', 'BOY', 'BUT', 'BUY', 'CAN', 'DAY', 'DID', 'DUE', 'END', 'FEW', 'FOR', 'GET', 'GOD',
  'GOT', 'GUY', 'HAD', 'HAS', 'HER', 'HIM', 'HIS', 'HOT', 'HOW', 'ITS', 'JOB', 'LET', 'LOT', 'LOW', 'MAN', 'MAY', 'NEW', 'NOT', 'NOW',
  'ODD', 'OFF', 'OLD', 'ONE', 'OUR', 'OUT', 'OWN', 'PUT', 'RAN', 'RED', 'RUN', 'SAD', 'SAW', 'SAY', 'SEE', 'SET', 'SHE', 'SIR', 'TOO',
  'TOP', 'TRY', 'TWO', 'USE', 'WAS', 'WAY', 'WHO', 'WHY', 'WIN', 'WON', 'YES', 'YET', 'YOU', 'BRO', 'LOL', 'OMG', 'WTF', 'LMAO', 'SMH',
  'ABLE', 'ALSO', 'BACK', 'BEEN', 'BEST', 'BOTH', 'CALL', 'CAME', 'COME', 'COOL', 'DAMN', 'DEAD', 'DONE', 'DOWN', 'EACH', 'EASY',
  'EVEN', 'EVER', 'FAST', 'FEEL', 'FELT', 'FILL', 'FINE', 'FROM', 'FULL', 'GAVE', 'GIVE', 'GOES', 'GONE', 'GOOD', 'HAVE', 'HELL',
  'HERE', 'HIGH', 'HOLD', 'HOLY', 'HOPE', 'HUGE', 'JUST', 'KEEP', 'KNEW', 'KNOW', 'LAST', 'LETS', 'LIKE', 'LONG', 'LOOK', 'LOSS',
  'LOST', 'LOVE', 'MADE', 'MAKE', 'MANY', 'MISS', 'MORE', 'MOST', 'MOVE', 'MUCH', 'MUST', 'NEED', 'NEXT', 'NICE', 'ONLY', 'OVER',
  'PLAN', 'PUMP', 'PUTS', 'REAL', 'RIDE', 'RISK', 'SAID', 'SAME', 'SEEN', 'SELL', 'SHIT', 'SOLD', 'SOME', 'SOON', 'STOP', 'SUCH',
  'SURE', 'TAKE', 'TELL', 'THAN', 'THAT', 'THEM', 'THEN', 'THEY', 'THIS', 'TIME', 'TOLD', 'TOOK', 'TRUE', 'TURN', 'VERY', 'WAIT',
  'WANT', 'WEEK', 'WELL', 'WENT', 'WERE', 'WHAT', 'WHEN', 'WILD', 'WILL', 'WITH', 'WORK', 'YEAH', 'YEAR', 'YOUR', 'ZERO', 'FUCK',
  'DUMP', 'CASH', 'GAIN', 'GAINS', 'BULL', 'BEAR', 'MOON', 'RIP', 'NOPE', 'OKAY', 'WOW', 'YUP', 'GG', 'GM', 'GN', 'LFG', 'IMO',
  'ABOUT', 'AFTER', 'AGAIN', 'BEING', 'CALLS', 'CLOSE', 'COULD', 'EARLY', 'ENTRY', 'EVERY', 'FIRST', 'GOING', 'GREAT', 'GREEN',
  'LATER', 'MAYBE', 'MONEY', 'NEVER', 'OTHER', 'PRICE', 'QUICK', 'READY', 'RIGHT', 'SHORT', 'SHOULD', 'SINCE', 'STILL', 'THEIR',
  'THERE', 'THESE', 'THING', 'THINK', 'THOSE', 'TODAY', 'TRADE', 'UNDER', 'UNTIL', 'WATCH', 'WHERE', 'WHICH', 'WHILE', 'WOULD',
  'NOTE', 'EDIT', 'UPDATE', 'ALERT', 'CHART', 'SETUP', 'LEVEL', 'ZONE', 'DIP', 'RIP', 'RUNNER', 'BAG', 'BAGS', 'EXIT', 'TRIM',
]);

const SHAPE = /^[A-Z][A-Z0-9.]{0,5}$/;

/** Bare upper-case word in prose: jargon or English → not a ticker. */
export function isTickerJargon(sym: string): boolean {
  const s = sym.toUpperCase().replace(/^\$/, '');
  return CHART_JARGON.has(s) || ENGLISH_CAPS.has(s);
}

/** A ticker universe check: a Set, a predicate, or null (= cold, stop-lists only). */
export type TickerUniverse = ReadonlySet<string> | ((sym: string) => boolean) | null | undefined;

function inUniverse(u: TickerUniverse, s: string): boolean | null {
  if (!u) return null;
  if (typeof u === 'function') return u(s);
  return u.size ? u.has(s) : null; // an empty set is a cold universe, not "nothing exists"
}

/**
 * Is `sym` a ticker worth keeping?
 *   explicit=false (bare word in prose): not jargon, not English, and in the universe when known.
 *   explicit=true  ($X, a contract, "X calls"): in the universe when known; else anything ticker-shaped.
 */
export function acceptTicker(sym: string, opts: { universe?: TickerUniverse; explicit?: boolean } = {}): boolean {
  const s = sym.toUpperCase().replace(/^\$/, '');
  if (!SHAPE.test(s)) return false;
  const known = inUniverse(opts.universe, s);
  if (opts.explicit) return known ?? true;
  if (isTickerJargon(s)) return false;
  return known ?? true;
}

/**
 * An existing watchlist row's symbol that should not be there (bare mode: the
 * row no longer says how it was written). `CES HOLY LTF SHIT` → junk; AAPL → kept.
 */
export function isJunkWatchSymbol(sym: string, universe?: TickerUniverse): boolean {
  return !acceptTicker(sym, { universe, explicit: false });
}

/** Filter a symbol list (order kept, duplicates dropped). Symbols reaching here are treated as bare. */
export function filterTickers(symbols: Iterable<string>, universe?: TickerUniverse, explicit?: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of symbols) {
    const s = raw.toUpperCase().replace(/^\$/, '');
    if (seen.has(s)) continue;
    seen.add(s);
    if (acceptTicker(s, { universe, explicit: explicit?.has(s) })) out.push(s);
  }
  return out;
}
