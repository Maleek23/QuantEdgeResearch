/**
 * Prefetch the Holy Grail research bars into .cache/holy-grail/ (idempotent):
 *   daily 2025-01-02 → END for the 300-name liquid universe,
 *   5-min for September (today's scan) for all 300, and 2025-08 → END for the
 *   replay's intraday universe (top INTRADAY_N by dollar volume + the names
 *   with cached 1-min/option data).
 * Run: npx tsx research/holy-grail-prefetch.ts [--end 2026-09-30]
 */
import { dailyBars, liquidUniverse, m5Bars } from './holy-grail-data';
import { requests } from './fast-moves-data';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const END = arg('--end') ?? '2026-09-30';
export const INTRADAY_N = 150;
export const OPTION_NAMES = ['SPY', 'QQQ', 'IWM', 'TSLA', 'NVDA', 'AMD', 'META', 'MSTR', 'AAPL', 'AMZN', 'GOOGL', 'MSFT', 'AVGO', 'PLTR', 'COIN', 'NFLX', 'SMCI', 'MU', 'HOOD', 'BE'];

export function intradayUniverse(symbols: string[]): string[] {
  return [...new Set([...symbols.slice(0, INTRADAY_N), ...OPTION_NAMES])];
}

async function main() {
  const t0 = Date.now();
  const u = await liquidUniverse(END, 300);
  console.log(`universe ${u.symbols.length} (of ${u.considered} considered)`);
  await dailyBars(u.symbols, '2025-01-02', END);
  console.log(`\ndaily done (${requests} requests)`);
  await m5Bars(u.symbols, '2026-09-01', END);
  console.log(`\n5m September done (${requests} requests)`);
  await m5Bars(intradayUniverse(u.symbols), '2025-08-01', END);
  console.log(`\n5m replay universe done (${requests} requests, ${((Date.now() - t0) / 60000).toFixed(1)} min)`);
}
if (process.argv[1]?.endsWith('holy-grail-prefetch.ts')) main().catch((e) => { console.error(e); process.exit(1); });
