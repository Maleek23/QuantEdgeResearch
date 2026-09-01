import { isApprovedTicker, getSector, APPROVED_TICKERS } from './shared/approved-tickers';
import { getFullUniverse, PREMIUM_WATCHLIST, USER_CORE_WATCHLIST, LOTTO_ELIGIBLE, NUCLEAR_URANIUM } from './server/ticker-universe';
async function main() {
  const S = 'OKLO';
  console.log('isApprovedTicker:', isApprovedTicker(S));
  console.log('getSector:', getSector(S));
  const u = getFullUniverse();
  console.log('getFullUniverse size:', u.length, 'includes OKLO:', u.includes(S));
  console.log('PREMIUM_WATCHLIST includes:', PREMIUM_WATCHLIST.includes(S));
  console.log('USER_CORE_WATCHLIST includes:', USER_CORE_WATCHLIST.includes(S));
  console.log('LOTTO_ELIGIBLE includes:', LOTTO_ELIGIBLE.includes(S));
  console.log('NUCLEAR_URANIUM:', NUCLEAR_URANIUM);
  try {
    const { isSkipTicker } = await import('./shared/approved-tickers');
    console.log('isSkipTicker:', (isSkipTicker as any)(S));
  } catch(e:any){ console.log('isSkipTicker import err', e.message); }
  // peers sector
  for (const p of ['UEC','SMR','LEU','CCJ','NNE','UUUU']) console.log(p, 'approved:', isApprovedTicker(p), 'sector:', getSector(p));
  process.exit(0);
}
main();
