import { db, pool } from './server/db';
import { sql } from 'drizzle-orm';
(async () => {
  for (const t of ['trade_diagnostics','trade_input_snapshots','symbol_heat_scores','bullish_trends','attention_events','symbol_catalyst_snapshots','symbol_behavior_profiles','watchlist','catalyst_events','analysis_audit_log','signal_performance','options_flow_history','whale_flows','research_history']) {
    try {
      const c = await db.execute(sql.raw(`SELECT column_name FROM information_schema.columns WHERE table_name='${t}'`));
      const cols = c.rows.map((r:any)=>r.column_name);
      const n = await db.execute(sql.raw(`SELECT count(*)::int n FROM ${t}`));
      console.log(`--- ${t} (${(n.rows[0] as any).n}) cols: ${cols.join(',')}`);
      if (cols.includes('symbol')) {
        const r = await db.execute(sql.raw(`SELECT * FROM ${t} WHERE symbol='LEU' LIMIT 5`));
        console.log(`   LEU rows: ${r.rows.length}`); if (r.rows.length) console.log(JSON.stringify(r.rows,null,1).slice(0,2000));
      }
    } catch(e:any){ console.log(t,'ERR',e.message); }
  }
  await pool.end();
})();
