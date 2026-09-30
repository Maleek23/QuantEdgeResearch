/**
 * RAW vs Δ-ADJUSTED vs FLOW-SIGNED GEX on one saved CBOE chain
 * ============================================================
 * docs/GAMMA_RAW_VS_ADJUSTED.md §4 is this script's output.
 *
 *   npx tsx research/gamma-raw-vs-adjusted.ts <chain.json> [SYM]
 *
 * <chain.json> is a CBOE delayed-quotes payload saved to disk (the same shape
 * research/gex-audit.ts archives under .cache/gex-chains/). The script makes
 * NO network call: it re-times every contract to the payload's own timestamp
 * (ET) and runs the production engine (server/options-exposures.ts) on it,
 * then prints the single-strike worked example and the key-strike rankings.
 */
import fs from 'fs';
import { computeExposures, type OptionInput } from '../server/options-exposures';
import { bsGamma, gexPer1Pct, deltaAdjGexPer1Pct, deltaMoveSplit, bsCallDelta, expiryInstantMs } from '../shared/gex-math';

const [file, symArg] = process.argv.slice(2);
if (!file) { console.error('usage: npx tsx research/gamma-raw-vs-adjusted.ts <chain.json> [SYM]'); process.exit(1); }
const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
const d = payload.data;
const S = Number(d.current_price);
const sym = (symArg ?? d.symbol ?? 'SPY').toUpperCase();
// CBOE's timestamp is New York wall time. EDT (UTC−4) in Sep–Oct.
const ts = String(payload.timestamp ?? '');
const nowMs = ts ? Date.parse(ts.replace(' ', 'T') + '-04:00') : Date.now();
const OCC = /^([A-Z0-9.]+?)(\d{6})([CP])(\d{8})$/;

const inputs: OptionInput[] = [];
for (const o of d.options ?? []) {
  const m = OCC.exec(String(o.option ?? ''));
  if (!m) continue;
  const exp = `20${m[2].slice(0, 2)}-${m[2].slice(2, 4)}-${m[2].slice(4, 6)}`;
  const dte = (expiryInstantMs(exp) - nowMs) / 864e5;
  if (dte <= 0) continue;
  const oi = Number(o.open_interest) || 0; const vol = Number(o.volume) || 0;
  if (oi <= 0 && vol <= 0) continue;
  const iv = Number(o.iv) || 0;
  inputs.push({
    strike: Number(m[4]) / 1000, optionType: m[3] === 'C' ? 'call' : 'put', openInterest: oi, volume: vol,
    impliedVolatility: iv > 0 ? iv : 0.3, ivDefaulted: !(iv > 0), daysToExpiry: dte,
    greeks: { gamma: Number(o.gamma) || undefined, delta: Number(o.delta) || undefined },
  });
}
const snap = computeExposures(sym, S, inputs);
const gm = snap.gammaMetrics!;
const B = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toFixed(3)}B`;
const M = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v / 1e6).toFixed(1)}M`;

console.log(`\n${sym} spot ${S} · chain ${ts} ET · ${inputs.length} contracts used\n`);
console.log('BOOK ($ per 1% move, all listed expiries)');
console.log(`  raw            ${B(gm.raw.net)}   gross ${B(gm.raw.gross)}   balance ${(gm.raw.balance! * 100).toFixed(1)}%`);
console.log(`  Δ-adjusted     ${B(gm.deltaAdjusted.net)}   gross ${B(gm.deltaAdjusted.gross)}   balance ${(gm.deltaAdjusted.balance! * 100).toFixed(1)}%   (up 1%: ${B(gm.deltaAdjusted.moveUp)}, down 1%: ${B(gm.deltaAdjusted.moveDown)})`);
console.log(`  flow-signed    ${B(gm.flowSigned.net)}   re-signed gross ${B(gm.flowSigned.resignedGross)} (${((gm.flowSigned.resignedShare ?? 0) * 100).toFixed(1)}%)`);

console.log('\nLEVELS');
const lv = (name: string, l: typeof gm.raw.levels) => console.log(
  `  ${name.padEnd(12)} call wall ${l.callWall} · put wall ${l.putWall} · max-γ ${l.maxGammaStrike} · king ${l.kingNode ? `${l.kingNode.strike} (${l.kingNode.dte}d, ${B(l.kingNode.value)})` : '—'} · zero-γ ${l.zeroGamma?.toFixed(2) ?? 'none'} · top-5 ${l.keyStrikes.join(', ')}`);
lv('raw', gm.raw.levels); lv('Δ-adjusted', gm.deltaAdjusted.levels); lv('flow-signed', gm.flowSigned.levels);
console.log(`  differs (Δ-adj): ${gm.differs.deltaAdjusted.join(', ') || 'none'} · (flow): ${gm.differs.flowSigned.join(', ') || 'none'} · top-5 overlap ${gm.keyStrikeOverlap}/5`);

// Front expiry ranking — where the two definitions part ways.
const front = Math.min(...snap.strikeExpiryMatrix.map((c) => c.dte));
const fc = snap.strikeExpiryMatrix.filter((c) => c.dte === front);
const rankBy = (k: 'netGEX' | 'netGEXAdj') => [...fc].sort((a, b) => Math.abs((b[k] ?? 0)) - Math.abs((a[k] ?? 0))).slice(0, 8);
console.log(`\nFRONT EXPIRY (${fc[0]?.expiryLabel}, dte bucket ${front}) — top 8 strikes`);
console.log('  rank  raw                      Δ-adjusted');
const r1 = rankBy('netGEX'); const r2 = rankBy('netGEXAdj');
for (let i = 0; i < 8; i++) {
  const a = r1[i]; const b = r2[i];
  console.log(`  ${String(i + 1).padStart(4)}  ${a ? `${a.strike} ${B(a.netGEX)}`.padEnd(24) : ''} ${b ? `${b.strike} ${B(b.netGEXAdj!)} (raw ${B(b.netGEX)})` : ''}`);
}

// Single-strike worked example: nearest-to-spot strike in the front expiry and a 30-ish-day one.
console.log('\nSINGLE-STRIKE WORKED EXAMPLE (per contract line, calls, BS on the line\'s own IV, r = 4.5%)');
const pick = (dteTarget: number, K: number, type: 'call' | 'put') => inputs
  .filter((o) => o.optionType === type && o.strike === K)
  .sort((a, b) => Math.abs(a.daysToExpiry - dteTarget) - Math.abs(b.daysToExpiry - dteTarget))[0];
const Katm = Math.round(S);
const ex = [
  ['front ATM', pick(0, Katm, 'call')],
  ['front +0.5%', pick(0, Math.round(S * 1.005), 'call')],
  ['front +1.5%', pick(0, Math.round(S * 1.015), 'call')],
  ['~30d ATM', pick(30, Katm, 'call')],
] as const;
for (const [name, o] of ex) {
  if (!o) continue;
  const T = o.daysToExpiry / 365.25; const v = o.impliedVolatility;
  const g = bsGamma(S, o.strike, T, v, 0.045);
  const raw = gexPer1Pct(g, o.openInterest, S);
  const adj = deltaAdjGexPer1Pct(S, o.strike, T, v, o.openInterest, 0.045);
  const sp = deltaMoveSplit(S, o.strike, T, v, o.openInterest, 0.045);
  const delta = bsCallDelta(S, o.strike, T, v, 0.045);
  const dex = delta * o.openInterest * 100 * S;
  console.log(`  ${name.padEnd(12)} K=${o.strike} T=${o.daysToExpiry.toFixed(2)}d IV=${(v * 100).toFixed(1)}% OI=${o.openInterest} vol=${o.volume}`);
  console.log(`    Γ=${g.toExponential(3)} Δ=${delta.toFixed(3)} Δ(+1%)=${bsCallDelta(S * 1.01, o.strike, T, v, 0.045).toFixed(3)} Δ(−1%)=${bsCallDelta(S * 0.99, o.strike, T, v, 0.045).toFixed(3)}`);
  console.log(`    raw share-Γ Γ·OI·100 = ${(g * o.openInterest * 100).toFixed(0)} sh per $1 · raw GEX ${M(raw)}/1% · Δ-adj ${M(adj)}/1% (×${(adj / raw).toFixed(2)}) · up ${M(sp.up)} down ${M(sp.down)} · DEX (Δ·OI·100·S) ${M(dex)} · DAOI ${(delta * o.openInterest * 100).toFixed(0)} sh`);
}
