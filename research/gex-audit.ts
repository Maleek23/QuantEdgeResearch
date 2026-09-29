/**
 * GEX / VEX MATH AUDIT — independent recomputation vs. our pipelines
 * ==================================================================
 * Pulls one CBOE delayed chain per ticker (sequential, ≥2.5 s apart — CBOE
 * 429s bursts), recomputes every number from first principles with a
 * self-contained Black-Scholes (nothing imported from server/ or shared/ for
 * the reference), then feeds the IDENTICAL payload to each production path
 * (fetch is stubbed so no second request is made) and prints the diff.
 *
 *   npx tsx research/gex-audit.ts [SYM ...]          (default SPY BE)
 *   npx tsx research/gex-audit.ts --offline SPY BE   (reuse the latest saved chain)
 *
 * Raw chains are saved under .cache/gex-chains/<SYM>/<iso>.json (gitignored)
 * so a run is reproducible and the archive can feed research/gex-magnet-backtest.ts.
 *
 * REFERENCE DEFINITIONS (docs/GEX_VEX_METHODOLOGY.md):
 *   GEX_i  = sign_i · Γ_i · OI_i · 100 · S² · 0.01      $ of underlying per 1% move
 *   VEX_i  = −sign_i · vanna_i · OI_i · 100 · S · 0.01   $ per 1 IV point; + = dealers BUY as IV rises
 *   sign   = +1 call, −1 put  (naive: dealers long calls, short puts)
 *   zero-gamma = spot S* where Σ_i sign_i·Γ_BS(S*, K_i, T_i, σ_i)·OI_i·100·S*²·0.01 = 0,
 *                found by re-pricing Γ on a spot grid (Perfiliev method), nearest crossing to spot
 *   call wall (SpotGamma-style) = strike with the largest call GEX, all expiries
 *   call wall (OI)              = strike above spot with the largest call OI (our hub's rule)
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline');
const SYMS = args.filter((a) => !a.startsWith('--')).map((s) => s.toUpperCase());
if (!SYMS.length) SYMS.push('SPY', 'BE');
const CACHE_DIR = path.join(process.cwd(), '.cache', 'gex-chains');
const SPACING_MS = 2500;

// ─── Self-contained reference math ─────────────────────────────────────────
const SQRT2PI = Math.sqrt(2 * Math.PI);
const pdf = (x: number) => Math.exp(-0.5 * x * x) / SQRT2PI;
function bsGamma(S: number, K: number, T: number, v: number): number {
  if (!(S > 0 && K > 0 && T > 0 && v > 0)) return 0;
  const d1 = (Math.log(S / K) + 0.5 * v * v * T) / (v * Math.sqrt(T));
  return pdf(d1) / (S * v * Math.sqrt(T));
}
function bsVanna(S: number, K: number, T: number, v: number): number {
  if (!(S > 0 && K > 0 && T > 0 && v > 0)) return 0;
  const d1 = (Math.log(S / K) + 0.5 * v * v * T) / (v * Math.sqrt(T));
  return (-pdf(d1) * (d1 - v * Math.sqrt(T))) / v;
}
function expiryMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const nyHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }).format(probe));
  return Date.UTC(y, m - 1, d, 16 + (12 - (nyHour % 24)), 0);
}
const OCC = /^([A-Z0-9.]+?)(\d{6})([CP])(\d{8})$/;

interface C { exp: string; T: number; cp: 'C' | 'P'; K: number; oi: number; vol: number; gamma: number; iv: number }

function parse(payload: any, now: number): { S: number; cs: C[]; ivMissing: number; withOI: number } {
  const d = payload?.data;
  const S = Number(d?.current_price ?? 0);
  const cs: C[] = [];
  let ivMissing = 0; let withOI = 0;
  for (const o of d?.options ?? []) {
    const m = OCC.exec(String(o.option ?? ''));
    if (!m) continue;
    const exp = `20${m[2].slice(0, 2)}-${m[2].slice(2, 4)}-${m[2].slice(4, 6)}`;
    const T = (expiryMs(exp) - now) / (365 * 864e5);
    if (T <= 0) continue;
    const oi = Number(o.open_interest) || 0;
    if (oi <= 0) continue;
    withOI++;
    const iv = Number(o.iv) || 0;
    if (!(iv > 0)) ivMissing++;
    cs.push({ exp, T, cp: m[3] as 'C' | 'P', K: Number(m[4]) / 1000, oi, vol: Number(o.volume) || 0, gamma: Number(o.gamma) || 0, iv });
  }
  return { S, cs, ivMissing, withOI };
}

function reference(payload: any, now: number) {
  const { S, cs, ivMissing, withOI } = parse(payload, now);
  let net = 0; let gross = 0; let netBS = 0; let vex = 0;
  const callGexByK = new Map<number, number>(); const putGexByK = new Map<number, number>();
  const callOIByK = new Map<number, number>(); const putOIByK = new Map<number, number>();
  const netByK = new Map<number, number>();
  for (const c of cs) {
    const sign = c.cp === 'C' ? 1 : -1;
    const g = c.gamma * c.oi * 100 * S * S * 0.01;
    net += sign * g; gross += g;
    netBS += sign * bsGamma(S, c.K, c.T, c.iv) * c.oi * 100 * S * S * 0.01;
    vex += -sign * bsVanna(S, c.K, c.T, c.iv) * c.oi * 100 * S * 0.01;
    netByK.set(c.K, (netByK.get(c.K) ?? 0) + sign * g);
    const [gm, om] = c.cp === 'C' ? [callGexByK, callOIByK] : [putGexByK, putOIByK];
    gm.set(c.K, (gm.get(c.K) ?? 0) + g); om.set(c.K, (om.get(c.K) ?? 0) + c.oi);
  }
  // Spot-grid re-pricing: ±20 %, 0.05 % steps.
  const grid: Array<{ s: number; g: number }> = [];
  for (let x = 0.8; x <= 1.2 + 1e-9; x += 0.0005) {
    const s = S * x; let g = 0;
    for (const c of cs) g += (c.cp === 'C' ? 1 : -1) * bsGamma(s, c.K, c.T, c.iv) * c.oi * 100 * s * s * 0.01;
    grid.push({ s, g });
  }
  let zg: number | null = null;
  for (let i = 1; i < grid.length; i++) {
    const a = grid[i - 1]; const b = grid[i];
    if (a.g === 0 || Math.sign(a.g) === Math.sign(b.g)) continue;
    const z = a.s + (b.s - a.s) * (a.g / (a.g - b.g));
    if (zg == null || Math.abs(z - S) < Math.abs(zg - S)) zg = z;
  }
  // Cumulative-by-strike crossing (the method we are auditing), nearest to spot.
  let cum = 0; let prev = 0; let cumFlip: number | null = null;
  for (const K of [...netByK.keys()].sort((a, b) => a - b)) {
    cum += netByK.get(K)!;
    const sg = Math.sign(cum);
    if (prev !== 0 && sg !== 0 && sg !== prev && (cumFlip == null || Math.abs(K - S) < Math.abs(cumFlip - S))) cumFlip = K;
    if (sg !== 0) prev = sg;
  }
  const argmax = (m: Map<number, number>, f: (k: number) => boolean) => {
    let best: number | null = null; let bv = -Infinity;
    for (const [k, v] of m) if (f(k) && v > bv) { bv = v; best = k; }
    return best;
  };
  return {
    S, contracts: cs.length, withOI, ivMissingShare: withOI ? ivMissing / withOI : 0,
    netGEX: net, netGEXbs: netBS, grossGEX: gross, netVEX: vex,
    zeroGamma: zg, cumStrikeFlip: cumFlip,
    callWallGamma: argmax(callGexByK, () => true),
    callWallGammaAbove: argmax(callGexByK, (k) => k > S),
    putWallGammaBelow: argmax(putGexByK, (k) => k < S),
    callWallOI: argmax(callOIByK, (k) => k > S),
    putWallOI: argmax(putOIByK, (k) => k < S),
    profileAt: (x: number) => grid.reduce((b, p) => (Math.abs(p.s - S * x) < Math.abs(b.s - S * x) ? p : b)).g,
  };
}

// ─── Fetch (throttled) + archive ───────────────────────────────────────────
const realFetch = globalThis.fetch;
async function getChain(sym: string): Promise<{ payload: any; fetchedAt: number } | null> {
  const dir = path.join(CACHE_DIR, sym);
  if (OFFLINE) {
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
    if (!files.length) return null;
    const f = files[files.length - 1];
    return { payload: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), fetchedAt: Date.parse(f.replace('.json', '').replace(/_/g, ':')) };
  }
  const cboe = sym === 'SPX' ? '_SPX' : sym;
  let r: Response | null = null;
  // 429 → back off 45 s, 90 s, 180 s. Never hammer: one request in flight, ever.
  for (let attempt = 0; attempt < 4; attempt++) {
    r = await realFetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${cboe}.json`, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
    if (r.status !== 429) break;
    const wait = 45_000 * 2 ** attempt;
    console.log(`${sym}: HTTP 429 — backing off ${wait / 1000}s`);
    await new Promise((res) => setTimeout(res, wait));
  }
  const fetchedAt = Date.now();
  if (!r || !r.ok) { console.log(`${sym}: HTTP ${r?.status}`); return null; }
  const payload = await r.json();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${new Date(fetchedAt).toISOString().replace(/:/g, '_')}.json`), JSON.stringify(payload));
  return { payload, fetchedAt };
}

const $ = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v); const s = v < 0 ? '−' : '+';
  return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(3)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(2)}M` : `${s}$${(a / 1e3).toFixed(1)}K`;
};
const pct = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || b === 0 ? '' : ` (${(((a - b) / Math.abs(b)) * 100).toFixed(1)}% vs ref)`;
const lvl = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `$${Number(v).toFixed(2)}`);

(async () => {
  for (let i = 0; i < SYMS.length; i++) {
    const sym = SYMS[i];
    if (i > 0 && !OFFLINE) await new Promise((r) => setTimeout(r, SPACING_MS));
    const got = await getChain(sym);
    if (!got) { console.log(`${sym}: no chain`); continue; }
    const { payload } = got;
    const qt = typeof payload?.timestamp === 'string' ? Date.parse(payload.timestamp.replace(' ', 'T') + 'Z') : got.fetchedAt;
    const now = Number.isFinite(qt) ? qt : got.fetchedAt;
    const ref = reference(payload, now);

    // Stub fetch so every production path reads THIS payload.
    (globalThis as any).fetch = async (url: any, init?: any) => {
      if (String(url).includes('cdn.cboe.com')) return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
      return realFetch(url, init);
    };
    const { computeRankRowFromCboe } = await import('../server/gex-rankings');
    const { computeGEXFromCBOE } = await import('../server/gex-cboe-fallback');
    const { getCBOEOptionsChain } = await import('../server/cboe-options-fallback');
    const oe: any = await import('../server/options-exposures');

    const rank = computeRankRowFromCboe(sym, payload, now, now);
    const fb: any = await computeGEXFromCBOE(sym);
    // Emulate calculateAggregateGammaExposure's CBOE leg.
    //   v1: first 30 expiries of the ±15% `options` slice, per-expiry.
    //   v2: one-shot over `allOptions` (every expiry, full ladder; computeExposures keeps ±40%).
    const chain = await getCBOEOptionsChain(sym);
    let agg: any = null;
    if (chain) {
      const inputs: any[] = [];
      if (oe.EXPOSURE_UNITS_VERSION === 2) {
        for (const o of chain.allOptions) { if (!((o.open_interest || 0) > 0 || (o.volume || 0) > 0)) continue; const inp = oe.optionToInput(o, o.expiration_date); if (inp) inputs.push(inp); }
        agg = oe.computeExposures(sym, ref.S, inputs, chain.expirations);
      } else {
        const exps = chain.expirations.slice(0, 30);
        for (const e of exps) for (const o of chain.options.filter((x: any) => x.expiration_date === e)) { const inp = oe.optionToInput(o, e); if (inp) inputs.push(inp); }
        agg = oe.computeExposures(sym, ref.S, inputs, exps);
      }
    }
    (globalThis as any).fetch = realFetch;

    // Units as each path documents them (see methodology doc, "Audit findings").
    const aggGEX = agg ? (agg.unitsVersion === 2 ? agg.totalGEX * 1e9 : agg.totalGEX * 1e9) : null;
    const aggVEX = agg ? (agg.unitsVersion === 2 ? agg.totalVEX * 1e6 : (agg.totalVEX * 1e6) / 100) : null;
    const fbGEX = fb ? fb.totalGEX * 1e9 : null;

    console.log(`\n══ ${sym}  spot ${lvl(ref.S)}  quote ${new Date(now).toISOString()}  contracts(OI>0, live) ${ref.contracts}  IV-missing ${(ref.ivMissingShare * 100).toFixed(2)}%`);
    console.log(`REFERENCE  netGEX ${$(ref.netGEX)}/1%  (BS-Γ ${$(ref.netGEXbs)})  gross ${$(ref.grossGEX)}  netVEX ${$(ref.netVEX)}/IVpt`);
    console.log(`           zero-gamma (spot-grid) ${lvl(ref.zeroGamma)}   cum-strike crossing ${lvl(ref.cumStrikeFlip)}   profile@spot ${$(ref.profileAt(1))}`);
    console.log(`           call wall: γ-any ${lvl(ref.callWallGamma)} γ-above ${lvl(ref.callWallGammaAbove)} OI-above ${lvl(ref.callWallOI)}   put wall: γ-below ${lvl(ref.putWallGammaBelow)} OI-below ${lvl(ref.putWallOI)}`);
    if (agg) {
      console.log(`HUB (options-exposures, CBOE leg — v2: every expiry, full ladder)`);
      console.log(`           netGEX ${$(aggGEX)}${pct(aggGEX, ref.netGEX)}  netVEX ${$(aggVEX)}${pct(aggVEX, ref.netVEX)}  regime ${agg.regime}  conc ${agg.gammaConcentration?.toFixed(3)}`);
      console.log(`           flip ${lvl(agg.gammaFlipPrice)}  zeroGamma ${lvl(agg.zeroGammaLevel)}  callWall ${lvl(agg.callWall)}  putWall ${lvl(agg.putWall)}  ivFallback ${(agg.ivFallbackShare * 100).toFixed(2)}%  bsComputed ${agg.contractsUsed ? ((agg.bsComputedCount / agg.contractsUsed) * 100).toFixed(1) : '—'}%`);
      if (agg.gexByScope) console.log(`           scope: all ${$(agg.gexByScope.all * 1e9)}  front expiry (${agg.gexByScope.frontExpiryDays}d) ${$(agg.gexByScope.frontExpiry * 1e9)}  ≤7d ${$(agg.gexByScope.le7d * 1e9)}  — all $ per 1%`);
      const matrixSum = (agg.strikeExpiryMatrix ?? []).reduce((a: number, c: any) => a + c.netGEX, 0);
      const maxCell = (agg.strikeExpiryMatrix ?? []).reduce((b: any, c: any) => (!b || Math.abs(c.netGEX) > Math.abs(b.netGEX) ? c : b), null);
      console.log(`           matrix Σ ${matrixSum.toFixed(4)} (raw field)  largest cell ${maxCell ? `${maxCell.strike} ${maxCell.expiryLabel} raw ${maxCell.netGEX.toFixed(4)}` : '—'}`);
    }
    if (fb) {
      const fbVEX = fb.unitsVersion === 2 ? fb.totalVEX * 1e6 : null;
      console.log(`CBOE-FALLBACK  netGEX ${$(fbGEX)}${pct(fbGEX, ref.netGEX)}  netVEX ${fbVEX != null ? $(fbVEX) + pct(fbVEX, ref.netVEX) : `raw ${fb.totalVEX?.toFixed(3)} (v1: vega proxy)`}  zeroGamma ${lvl(fb.zeroGammaLevel)}  regime ${fb.regime}  flip ${lvl(fb.gammaFlipPrice)}  callWall ${lvl(fb.callWall)}  putWall ${lvl(fb.putWall)}  dealerFlow/1% ${$(fb.dealerFlowPer1Pct)}`);
    }
    if (rank) {
      console.log(`RANKINGS   netGEX ${$(rank.netGEX)}${pct(rank.netGEX, ref.netGEX)}  netVEX ${$(rank.netVEX)}${pct(rank.netVEX, ref.netVEX)}  regime ${rank.regime}  callWall ${lvl(rank.callWall)}  putWall ${lvl(rank.putWall)}  zeroGamma ${lvl((rank as any).zeroGamma)}`);
      if (rank.magnet) console.log(`           magnet ${rank.magnet.strike} (+${rank.magnet.distPct.toFixed(2)}%) share ${(rank.magnet.share * 100).toFixed(1)}% vol/OI ${rank.magnet.volOI.toFixed(2)}`);
      for (const st of (rank as any).setups ?? []) console.log(`           SETUP ${st.side} ${st.strike} exp ${st.expiry} score ${st.score} :: ${st.why.join(' | ')}`);
      if (!((rank as any).setups ?? []).length && (rank as any).setups) console.log('           no setup (detector criteria not all met)');
    }
  }
  process.exit(0);
})();
