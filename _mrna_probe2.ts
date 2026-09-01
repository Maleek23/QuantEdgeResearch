import { db } from './server/db';
import { tradeIdeas } from './shared/schema';
import { sql, eq } from 'drizzle-orm';

async function main() {
  const rows = await db.select().from(tradeIdeas).where(eq(tradeIdeas.symbol, 'MRNA'));
  for (const r of rows) console.log(JSON.stringify(r, null, 1));

  for (const t of ['catalysts', 'catalyst_events', 'market_data', 'options_flow_history', 'whale_flows', 'active_trades', 'sec_filings', 'trade_diagnostics', 'signal_performance', 'symbol_catalyst_responses', 'watchlist']) {
    try {
      const c = await db.execute(sql.raw(`select count(*)::int as c from ${t}`));
      console.log(`TABLE ${t}: ${(c.rows as any[])[0].c}`);
    } catch (e: any) { console.log(`TABLE ${t}: ERR ${e.message}`); }
  }

  // MRNA anywhere else
  for (const [t, col] of [['market_data', 'symbol'], ['options_flow_history', 'symbol'], ['active_trades', 'symbol'], ['trade_diagnostics', 'symbol'], ['catalysts', 'symbol']] as const) {
    try {
      const c = await db.execute(sql.raw(`select count(*)::int as c from ${t} where ${col}='MRNA'`));
      console.log(`MRNA in ${t}: ${(c.rows as any[])[0].c}`);
    } catch (e: any) { console.log(`MRNA in ${t}: ERR ${e.message}`); }
  }

  // trade_diagnostics schema + any MRNA rejection record
  try {
    const cols = await db.execute(sql.raw(`select column_name from information_schema.columns where table_name='trade_diagnostics'`));
    console.log('trade_diagnostics cols:', (cols.rows as any[]).map(r => r.column_name).join(','));
  } catch (e: any) { console.log(e.message); }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
