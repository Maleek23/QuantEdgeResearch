import { db } from './server/db';
import { tradeIdeas } from './shared/schema';
import { sql, gte, eq, desc } from 'drizzle-orm';

async function main() {
  // 1. Any MRNA idea ever
  const mrnaAll = await db.select().from(tradeIdeas).where(eq(tradeIdeas.symbol, 'MRNA')).orderBy(desc(tradeIdeas.timestamp));
  console.log('=== MRNA ideas (all time):', mrnaAll.length);
  for (const i of mrnaAll.slice(0, 20)) {
    console.log(JSON.stringify({
      id: i.id, ts: i.timestamp, dir: i.direction, at: i.assetType, entry: i.entryPrice,
      target: i.targetPrice, conf: i.confidenceScore, band: i.probabilityBand,
      outcome: i.outcomeStatus, pnl: i.realizedPnL, src: i.source, cat: i.catalyst?.slice(0, 120),
    }));
  }

  // 2. All ideas last 7 days
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const recent = await db.select().from(tradeIdeas).where(gte(tradeIdeas.timestamp, since)).orderBy(desc(tradeIdeas.timestamp));
  console.log('\n=== ideas since', since, ':', recent.length);
  const bySym: Record<string, number> = {};
  for (const r of recent) bySym[r.symbol] = (bySym[r.symbol] || 0) + 1;
  console.log('symbols:', JSON.stringify(bySym));
  const byDay: Record<string, number> = {};
  for (const r of recent) { const d = r.timestamp.slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; }
  console.log('by day:', JSON.stringify(byDay));

  // 3. Overall table stats
  const total = await db.select({ c: sql<number>`count(*)` }).from(tradeIdeas);
  const range = await db.select({ min: sql<string>`min(timestamp)`, max: sql<string>`max(timestamp)` }).from(tradeIdeas);
  console.log('\n=== total ideas:', total[0].c, 'range:', JSON.stringify(range[0]));

  // 4. Biotech / healthcare peers recently
  const peers = ['BNTX', 'XBI', 'NVAX', 'PFE', 'CRSP', 'BEAM', 'NTLA', 'VRTX', 'REGN', 'LLY'];
  const peerRows = recent.filter(r => peers.includes(r.symbol));
  console.log('peer ideas last 7d:', peerRows.map(r => `${r.symbol}/${r.direction}/${r.timestamp}`).join(', ') || 'NONE');

  // 5. table list
  const tables = await db.execute(sql`select table_name from information_schema.tables where table_schema='public' order by 1`);
  console.log('\n=== tables:', (tables.rows as any[]).map(r => r.table_name).join(', '));

  process.exit(0);
}
main().catch(e => { console.error('ERR', e); process.exit(1); });
