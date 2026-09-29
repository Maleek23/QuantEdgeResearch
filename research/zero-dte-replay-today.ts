/**
 * What would the index 0DTE policies have called today? — a diagnostic, not a backtest.
 *
 *   npx tsx research/zero-dte-replay-today.ts [SPY QQQ IWM]
 *
 * Walks today's 5-minute bars (Yahoo, regular hours) one closed bar at a time
 * through server/zero-dte-policies.ts. GEX levels (zero-gamma, walls, sign) are
 * the CURRENT live read from the Alpaca chain (gap-filled) — i.e. taken at run
 * time, not point-in-time. That is look-ahead on the levels, so this shows only
 * whether the gates can fire on a real tape; it measures nothing about edge.
 * No database, no publishing. After each fire, the next 5-min bars are scanned
 * for which of stop / target / 15:55 time stop came first (underlying only).
 */
import fs from 'fs';
import path from 'path';

function loadAlpacaEnv() {
  if (process.env.ALPACA_API_KEY) return;
  for (const f of [path.resolve('.env'), path.resolve('../QuantEdgeee/.env')]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = /^(ALPACA_[A-Z_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

async function main() {
  loadAlpacaEnv();
  const { getAlpacaOptionsChain, alpacaToTradierShape } = await import('../server/alpaca-options');
  const { computeExposures, optionToInput } = await import('../server/options-exposures');
  const { structureFromBars } = await import('../server/zero-dte-structure');
  const { evaluateZeroDte } = await import('../server/zero-dte-policies');
  const syms = process.argv.slice(2).length ? process.argv.slice(2) : ['SPY', 'QQQ', 'IWM'];

  for (const sym of syms) {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=5m&range=5d&includePrePost=false`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const j: any = await r.json();
    const res = j?.chart?.result?.[0];
    const q = res?.indicators?.quote?.[0];
    const bars = (res?.timestamp ?? []).map((t: number, i: number) => ({ t: t * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] ?? 0 }))
      .filter((b: any) => [b.o, b.h, b.l, b.c].every((x: any) => typeof x === 'number' && x > 0));

    const chain = await getAlpacaOptionsChain(sym);
    if (!chain?.spot) { console.log(`${sym}: no chain`); continue; }
    const inputs = alpacaToTradierShape(chain).map((o) => optionToInput(o, o.expiration_date)).filter(Boolean) as any[];
    const snap = computeExposures(sym, chain.spot, inputs, chain.expirations);
    const sign = snap.regimeRead.regime;
    console.log(`\n=== ${sym}: levels AT RUN TIME (look-ahead) — sign ${sign}, zero-γ ${snap.zeroGammaLevel?.toFixed(2)}, walls ${snap.putWall}/${snap.callWall}, modelled ${(snap.modelledGrossShare * 100).toFixed(1)}% gross`);

    const last = bars[bars.length - 1];
    const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(last.t));
    const today = bars.filter((b: any) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(b.t)) === dayKey);
    let fires = 0; let lastFireAt = 0;
    const waitsSeen = new Map<string, number>();
    for (const b of today) {
      const now = b.t + 5 * 60_000 + 1000; // just after this bar closes
      const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(now));
      const etMin = (Number(p.find((x) => x.type === 'hour')!.value) % 24) * 60 + Number(p.find((x) => x.type === 'minute')!.value);
      const st = structureFromBars(sym, bars.filter((x: any) => x.t + 5 * 60_000 <= now), now);
      const v = evaluateZeroDte(sym, {
        spot: st.lastClose ?? 0, zeroGamma: snap.zeroGammaLevel, callWall: snap.callWall, putWall: snap.putWall,
        sign, fetchedAt: new Date(now).toISOString(), modelledGrossShare: snap.modelledGrossShare,
      }, st, now, etMin, null);
      if (!v.setup) { for (const w of v.wait.slice(0, 1)) waitsSeen.set(w.replace(/[\d.$]+/g, '#'), (waitsSeen.get(w.replace(/[\d.$]+/g, '#')) ?? 0) + 1); continue; }
      if (now - lastFireAt < 30 * 60_000) continue; // the producer's 30-min dedup
      lastFireAt = now; fires++;
      const s = v.setup;
      const after = today.filter((x: any) => x.t >= b.t + 5 * 60_000);
      let outcome = 'time stop 15:55';
      for (const x of after) {
        const m = (() => { const pp = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(x.t)); return (Number(pp.find((y) => y.type === 'hour')!.value) % 24) * 60 + Number(pp.find((y) => y.type === 'minute')!.value); })();
        if (m >= 955) break;
        const hitStop = s.direction === 'long' ? x.l <= s.stop : x.h >= s.stop;
        const hitTgt = s.direction === 'long' ? x.h >= s.target : x.l <= s.target;
        if (hitStop) { outcome = hitTgt ? 'stop (same bar as target — counted stop)' : 'stop'; break; }
        if (hitTgt) { outcome = 'target'; break; }
      }
      const hhmm = `${String(Math.floor(etMin / 60)).padStart(2, '0')}:${String(etMin % 60).padStart(2, '0')}`;
      console.log(`  ${hhmm} ET ${s.policy}${s.powerHour ? ' (power hour)' : ''} ${s.direction.toUpperCase()} entry ${s.entry.toFixed(2)} stop ${s.stop.toFixed(2)} target ${s.target.toFixed(2)} (${s.targetLevel.name}) ${s.rr.toFixed(2)}R → ${outcome}`);
    }
    console.log(`  fires: ${fires}. Most common waits: ${[...waitsSeen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w, n]) => `${w} ×${n}`).join(' · ')}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
