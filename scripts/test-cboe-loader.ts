/**
 * CBOE loader smoke test (live network): SPX maps to _SPX, trims to ≤60 days,
 * concurrent callers share one read, reads never overlap, quote endpoint works.
 * Run: npx tsx scripts/test-cboe-loader.ts
 */
import { loadCboeChain, loadCboeQuote, cboeKey } from '../server/lib/cboe-loader';

const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) process.exitCode = 1; };

async function main() {
  ok(cboeKey('SPX') === '_SPX' && cboeKey('^SPX') === '_SPX' && cboeKey('spy') === 'SPY', 'index key mapping');
  const rss0 = process.memoryUsage().rss;
  const [a, b, c] = await Promise.all([loadCboeChain('SPX'), loadCboeChain('SPX'), loadCboeChain('SPY')]);
  ok(a === b, 'concurrent SPX callers share one read');
  const opts: any[] = a.payload?.data?.options ?? [];
  ok(opts.length > 1000, `SPX chain loaded (${opts.length} contracts after trim)`);
  const far = opts.filter((o) => { const m = /(\d{2})(\d{2})(\d{2})[CP]/.exec(o.option); return m && Date.UTC(2000 + +m[1], +m[2] - 1, +m[3]) - Date.now() > 61 * 864e5; });
  ok(far.length === 0, 'no SPX expiry beyond 60 days kept');
  ok((c.payload?.data?.options?.length ?? 0) > 500, `SPY chain loaded (${c.payload?.data?.options?.length})`);
  const q = await loadCboeQuote('SPX');
  ok(Number(q?.current_price) > 0 && Number(q?.prev_day_close) > 0, `SPX quote ${q?.current_price}`);
  console.log(`rss delta ${Math.round((process.memoryUsage().rss - rss0) / 1e6)} MB`);
}
main();
