/**
 * One-shot verification of the GEX/VEX ranking computation on BE and STX.
 * Fetches each CBOE delayed chain once (throttled ≥1.5s via the shared limiter),
 * prints the row and which rank views each ticker lands in. No fabrication:
 * a failed fetch prints the HTTP status and nothing else.
 *
 *   npx tsx research/_gexrank-verify.ts [SYM ...]
 */
import { rankSymbol, buildViews, GEX_RANK_UNITS, SIGN_CONVENTION_NOTE, type GexRankRow } from '../server/gex-rankings';

const SYMS = process.argv.slice(2).length ? process.argv.slice(2).map((s) => s.toUpperCase()) : ['BE', 'STX'];
const $ = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v); const s = v < 0 ? '−' : '+';
  return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(2)}M` : `${s}$${(a / 1e3).toFixed(0)}K`;
};

(async () => {
  const rows: GexRankRow[] = [];
  for (const s of SYMS) {
    const { row, status } = await rankSymbol(s);
    if (!row) { console.log(`${s}: no row (HTTP ${status})`); continue; }
    rows.push(row);
    console.log(`\n=== ${s}  spot $${row.spot}  chg ${row.changePct?.toFixed(2) ?? '—'}%  iv30 ${row.iv30 ?? '—'}  quoteTime ${row.quoteTime}  fetched ${row.fetchedAt}`);
    console.log(`  netGEX ${$(row.netGEX)}/1%   netVEX ${$(row.netVEX)}/IVpt   GEX+ ${$(row.gexPlus)}   regime ${row.regime}   contracts ${row.contracts}`);
    console.log(`  near expiries ${row.nearExpiries.join(', ')}   nearNetGEX ${$(row.nearNetGEX)}`);
    console.log(`  topStrike ${row.topStrike} (${$(row.topStrikeGEX)}, share ${((row.topStrikeShare ?? 0) * 100).toFixed(1)}%, dist ${row.topStrikeDistPct?.toFixed(2)}%)  vol/OI ${row.topStrikeVolume}/${row.topStrikeOI} = ${row.topStrikeVolOI?.toFixed(2)}`);
    console.log(`  nearest-expiry callWall ${row.callWall}  putWall ${row.putWall}   pinScore ${row.pinScore?.toFixed(3) ?? '—'}`);
    console.log(`  magnet ${row.magnet ? `strike ${row.magnet.strike} (+${row.magnet.distPct.toFixed(2)}%) callGEX ${$(row.magnet.callGEX)} share ${(row.magnet.share * 100).toFixed(1)}% callVol/OI ${row.magnet.callVolume}/${row.magnet.callOI} = ${row.magnet.volOI.toFixed(2)} score ${row.magnet.score.toFixed(3)}` : 'none'}`);
  }
  const views = buildViews(rows);
  console.log('\nviews:', JSON.stringify(views));
  console.log('units:', JSON.stringify(GEX_RANK_UNITS));
  console.log('sign:', SIGN_CONVENTION_NOTE);
  process.exit(0);
})();
