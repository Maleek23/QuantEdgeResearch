/**
 * Stage-1 memory probe for the 0DTE sniper: runs the live engine's stage 1
 * (server/zero-dte-sniper.ts runStage1) on a 150-symbol batch against real
 * Alpaca bars and reports RSS / heap before and after, plus a second
 * (incremental) pass. No option chains, no database.
 *
 *   node --expose-gc --import tsx research/zero-dte-sniper-stage1-mem.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: process.env.ENV_FILE || '/Users/abdulmalik/UnTitld/QuantEdgeee/.env', quiet: true } as any);

const SYMBOLS = (
  'SPY,QQQ,IWM,TSLA,NVDA,AMD,META,MSTR,AAPL,AMZN,GOOGL,MSFT,AVGO,PLTR,COIN,NFLX,SMCI,MU,HOOD,BE,' +
  'SOFI,RKLB,APP,UBER,SHOP,CRWD,PANW,SNOW,NET,DDOG,ZS,MDB,ORCL,ADBE,CRM,INTC,QCOM,TXN,ARM,MRVL,' +
  'ON,LRCX,AMAT,KLAC,ASML,TSM,DELL,HPE,ANET,CSCO,IBM,NOW,INTU,WDAY,TEAM,OKTA,TWLO,U,RBLX,ROKU,' +
  'PYPL,SQ,AFRM,UPST,MARA,RIOT,CLSK,HUT,IREN,CORZ,WULF,CIFR,BITF,GME,AMC,DKNG,ABNB,DASH,LYFT,SNAP,' +
  'PINS,SPOT,BABA,JD,PDD,NIO,XPEV,LI,RIVN,LCID,F,GM,BA,CAT,DE,GE,LMT,RTX,NOC,XOM,' +
  'CVX,OXY,COP,SLB,HAL,DVN,JPM,BAC,C,WFC,GS,MS,SCHW,V,MA,AXP,UNH,LLY,NVO,PFE,' +
  'MRK,ABBV,JNJ,MRNA,BMY,CVS,WMT,COST,TGT,HD,LOW,NKE,SBUX,MCD,DIS,CMCSA,T,VZ,KO,PEP,' +
  'SMH,XLF,XLE,ARKK,TQQQ,SQQQ,SOXL,TLT,GLD,SLV'
).split(',');

async function main() {
  const { runStage1 } = await import('../server/zero-dte-sniper');
  const gc = (globalThis as any).gc as (() => void) | undefined;
  const snap = () => { gc?.(); const m = process.memoryUsage(); return { rssMb: +(m.rss / 1048576).toFixed(1), heapUsedMb: +(m.heapUsed / 1048576).toFixed(1), externalMb: +(m.external / 1048576).toFixed(1) }; };
  const syms = [...new Set(SYMBOLS)].slice(0, 150);
  if (process.argv.includes('--cycle-only')) return dryCycle(syms, snap);
  const before = snap();
  let peakRss = before.rssMb;
  const timer = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss / 1048576); }, 50);
  const t0 = Date.now();
  const r1 = await runStage1(syms, Date.now(), { freshMs: Infinity });
  const ms1 = Date.now() - t0;
  const after1 = snap();
  const t1 = Date.now();
  const r2 = await runStage1(syms, Date.now() + 60_000, { freshMs: Infinity });
  const ms2 = Date.now() - t1;
  const after2 = snap();
  clearInterval(timer);
  const out = {
    symbols: syms.length, feed: r1.feed,
    pass1: { ms: ms1, requests: r1.requests, barsHeld: r1.barsHeld, triggersSeenToday: r1.fresh.length },
    pass2Incremental: { ms: ms2, requests: r2.requests, barsHeld: r2.barsHeld, newTriggers: r2.fresh.length },
    memory: { before, afterPass1: after1, afterPass2: after2, peakRssMbSampled: +peakRss.toFixed(1), retainedRssDeltaMb: +(after2.rssMb - before.rssMb).toFixed(1), retainedHeapDeltaMb: +(after2.heapUsedMb - before.heapUsedMb).toFixed(1) },
    bySetup: r1.fresh.reduce((a: Record<string, number>, t) => { const k = `${t.setup}:${t.side}`; a[k] = (a[k] ?? 0) + 1; return a; }, {}),
  };
  console.log(JSON.stringify(out, null, 2));
}

/**
 * --cycle-only: one full dry cycle in a fresh process (stage 1 + stage 2 through the real heavy gate and
 * chain helpers), explicit universe (no convictions / DB), publish OFF, freshness widened (FRESH_MIN,
 * default 30) so the session's recent triggers qualify.
 */
async function dryCycle(syms: string[], snap: () => { rssMb: number; heapUsedMb: number; externalMb: number }) {
  {
    const { runZeroDteSniper } = await import('../server/zero-dte-sniper');
    const b = snap();
    let peak = b.rssMb;
    const tm = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss / 1048576); }, 50);
    const c = await runZeroDteSniper(Date.now(), { force: true, universe: syms, publish: false, freshMs: Number(process.env.FRESH_MIN ?? 30) * 60_000 });
    clearInterval(tm);
    const a = snap();
    console.log(JSON.stringify({
      dryCycle: {
        cycleMs: c.cycleMs, universe: c.universeSize, fresh: c.triggersFresh, stale: c.triggersStale, chainFetches: c.chainFetches,
        memory: { before: b, after: a, peakRssMbSampled: +peak.toFixed(1), cycleReported: c.memory },
        rows: c.rows.slice(0, 12).map((r) => ({ sym: r.symbol, setup: r.setup, side: r.side, at: r.triggerEt, touch: r.touch, zone: r.zoneKind, rvol: r.volume?.triggerRvol ?? null, contracts: r.contracts.map((p) => `${p.variant}:${p.occ}@${p.ask}`), reason: r.reason })),
        errors: c.errors,
      },
    }, null, 2));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
