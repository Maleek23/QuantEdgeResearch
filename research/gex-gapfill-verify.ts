/**
 * GEX gap-fill verification — before/after on live Alpaca chains.
 *
 *   npx tsx research/gex-gapfill-verify.ts SPY BE
 *
 * Reads ALPACA_* from the environment (or ../QuantEdgeee/.env — only those keys).
 * Touches no database. For each symbol it fetches the chain once (the gap-fill
 * runs inside getAlpacaOptionsChain), then reconstructs "before" by blanking the
 * greeks/IV of every contract the fill modelled:
 *
 *   before-rank  — the cross-ticker rankings' behaviour: no gamma + no IV ⇒ GEX 0
 *   before-hub   — the exposure hub's behaviour: no IV ⇒ Black-Scholes on DEFAULT_IV 30%,
 *                  excluded from the zero-gamma sweep
 *   after        — the fill (implied-from-price, else smile-interpolated)
 *
 * and reports strikes-with-GEX, net GEX, zero-gamma and walls for each.
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
    if (process.env.ALPACA_API_KEY) return;
  }
}

async function main() {
  loadAlpacaEnv();
  const { getAlpacaOptionsChain, alpacaToTradierShape } = await import('../server/alpaca-options');
  const { computeExposures, optionToInput } = await import('../server/options-exposures');
  const { gexPer1Pct, expiryInstantMs } = await import('../shared/gex-math');
  const syms = process.argv.slice(2).length ? process.argv.slice(2) : ['SPY', 'BE'];

  for (const sym of syms) {
    const chain = await getAlpacaOptionsChain(sym);
    if (!chain || !chain.spot) { console.log(`${sym}: no chain`); continue; }
    const S = chain.spot;
    console.log(`\n=== ${sym} spot ${S} · ${chain.contracts.length} contracts · ${chain.expirations.length} expiries · fetched ${new Date(chain.fetchedAt).toISOString()} · OI ${chain.openInterestDate}`);
    console.log(`greek sources: ${JSON.stringify(chain.greekSources)} · modelledShare ${(chain.modelledShare * 100).toFixed(1)}%`);

    const modelled = chain.contracts.filter((c) => c.greekSource === 'implied-from-price' || c.greekSource === 'smile-interpolated');
    const rowsAfter = alpacaToTradierShape(chain);
    const blank = new Set(modelled.map((c) => c.occ));
    const rowsBefore = rowsAfter.map((r) => blank.has(r.symbol)
      ? { ...r, greeks: { delta: undefined, gamma: undefined, vega: undefined, theta: undefined, mid_iv: undefined }, greek_source: undefined }
      : r);

    // Per-expiry strike ladder inside the display band — the operator's "gaps".
    const exps = chain.expirations.slice(0, 6);
    const lo = S * 0.95; const hi = S * 1.05;
    console.log(`strikes within ±5% of spot carrying GEX (OI>0), by expiry — before-rank / after (of strikes with OI):`);
    for (const e of exps) {
      const inExp = chain.contracts.filter((c) => c.expiration === e && c.strike >= lo && c.strike <= hi && (c.openInterest ?? 0) > 0);
      const strikes = new Set(inExp.map((c) => c.strike));
      const withBefore = new Set(inExp.filter((c) => !blank.has(c.occ) && (c.gamma ?? 0) > 0).map((c) => c.strike));
      const withAfter = new Set(inExp.filter((c) => (c.gamma ?? 0) > 0).map((c) => c.strike));
      const bare = chain.contracts.filter((c) => c.expiration === e && c.strike >= lo && c.strike <= hi);
      const bareN = bare.filter((c) => blank.has(c.occ) || c.greekSource === 'none').length;
      console.log(`  ${e}: ${withBefore.size} → ${withAfter.size} of ${strikes.size} strikes · contracts without provider greeks ${bareN}/${bare.length}`);
    }

    // Whole-book aggregates, three ways.
    const inputsAfter = rowsAfter.map((o) => optionToInput(o, o.expiration_date)).filter(Boolean) as any[];
    const pairsBefore = rowsBefore.map((o) => ({ occ: o.symbol as string, input: optionToInput(o, o.expiration_date) })).filter((p) => p.input);
    const inputsBefore = pairsBefore.map((p) => p.input) as any[];
    const after = computeExposures(sym, S, inputsAfter, chain.expirations);
    const hubBefore = computeExposures(sym, S, inputsBefore, chain.expirations);
    // before-rank: drop the modelled contracts entirely (gamma 0 ⇒ contributes nothing).
    const rankBefore = computeExposures(sym, S, pairsBefore.filter((p) => !blank.has(p.occ)).map((p) => p.input) as any[], chain.expirations);

    const withGex = (snap: any) => snap.strikes.filter((s: any) => Math.abs(s.callGEX) + Math.abs(s.putGEX) > 0 && s.strike >= lo && s.strike <= hi).length;
    const line = (name: string, s: any) =>
      console.log(`  ${name.padEnd(12)} strikes±5% w/ GEX ${String(withGex(s)).padStart(4)} · net GEX ${s.totalGEX.toFixed(3)}B/1% · gross ${s.grossGEX.toFixed(3)}B · zeroγ ${s.zeroGammaLevel?.toFixed(2) ?? '—'} · walls ${s.putWall ?? '—'}/${s.callWall ?? '—'} · profile-excluded ${(s.profileExcludedGrossShare * 100).toFixed(1)}% · modelled ${(s.modelledGrossShare * 100).toFixed(1)}%gross`);
    line('before-rank', rankBefore);
    line('before-hub', hubBefore);
    line('after', after);

    // How far the old DEFAULT_IV sat from the fill on the same contracts.
    const live = (c: any) => expiryInstantMs(c.expiration) > Date.now();
    const diffs = modelled.filter(live).map((c) => c.iv ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
    if (diffs.length) console.log(`  filled IV: median ${(diffs[Math.floor(diffs.length / 2)] * 100).toFixed(1)}% (min ${(diffs[0] * 100).toFixed(1)}%, max ${(diffs[diffs.length - 1] * 100).toFixed(1)}%) vs DEFAULT_IV 30%`);
    const gmod = modelled.filter(live).reduce((a, c) => a + gexPer1Pct(c.gamma ?? 0, c.openInterest ?? 0, S), 0);
    console.log(`  gross GEX on filled contracts: $${(gmod / 1e9).toFixed(3)}B/1%`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
