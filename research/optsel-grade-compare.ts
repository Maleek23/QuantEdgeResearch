/**
 * OPTION-SELECTION GRADE COMPARE — old engine vs new (shared/contract-engine.ts).
 *
 *   npx tsx research/optsel-grade-compare.ts            # uses the saved snapshot
 *   npx tsx research/optsel-grade-compare.ts --refresh  # re-fetch CBOE chains first
 *
 * Question: server/option-selection-engine.ts graded (nearly) everything F.
 * After delegating grading to shared/contract-engine.ts and turning account
 * limits into constraints, does the all-F collapse disappear — and does it
 * disappear for the right reason (limits no longer masquerade as quality)?
 *
 * DATA: CBOE delayed chains (public, no credentials) fetched through the
 * platform's own fetcher (server/contract-analyzer/cboe-chain.ts) and saved to
 * research/data/optsel-chains.json.gz (gitignored — `data/`) so reruns grade the
 * identical chains; without it the script fetches a fresh one. The snapshot's
 * fetch time is printed; the numbers describe THAT snapshot only.
 * First run (2026-09-29 21:13Z, 20 symbols, 120 theses × 3 profiles): see the
 * feat/optsel commit message for the printed distribution.
 *
 * THESES ARE SYNTHETIC and identical for both engines — the point is the
 * engine, not the idea. For every symbol, both directions, three plans:
 *   swing     (MONTHLY window) entry = spot, T1 = spot ± 6%,   stop = spot ∓ 3%
 *   scalp     (WEEKLY window)  entry = spot, T1 = spot ± 2.5%, stop = spot ∓ 1.25%
 *   swing 1:1 (MONTHLY window) entry = spot, T1 = spot ± 3%,   stop = spot ∓ 3%  (weak plan)
 *   conviction 80 (so the conviction DTE gate does not move the window).
 * LIMIT PROFILES (the same three the callers actually use):
 *   none   — idea generators / LEAP tracker / analyzer pass no account inputs
 *   bot    — quant-bot defaults: risk budget $250, max debit $300, ROI floor 30%
 *   ui     — Contract Engine defaults: account $10k, max loss $250, max debit $500
 *
 * OLD = research/legacy/option-selection-engine.v1.ts (frozen pre-change core).
 * NEW = server/option-selection-engine.ts selectFromChain (grades via shared engine).
 */
import { gunzipSync, gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as OLD from './legacy/option-selection-engine.v1';
import * as NEW from '../server/option-selection-engine';
import { rankContracts } from '../shared/contract-engine';

const here = dirname(fileURLToPath(import.meta.url));
const SNAP = join(here, 'data', 'optsel-chains.json.gz');
const SYMBOLS = [
  'AAPL', 'MSFT', 'NVDA', 'AMD', 'TSLA', 'META', 'AMZN', 'GOOGL', 'SPY', 'QQQ',
  'IWM', 'PLTR', 'SOFI', 'MU', 'COIN', 'HOOD', 'ORCL', 'BA', 'JPM', 'XOM',
];

type Raw = NEW.RawChainOption;
interface Snapshot { fetchedAt: string; chains: Record<string, { spot: number; fetchedAt: number | null; rows: Raw[] }> }

async function refresh(): Promise<Snapshot> {
  const { fetchCboeChain } = await import('../server/contract-analyzer/cboe-chain');
  const snap: Snapshot = { fetchedAt: new Date().toISOString(), chains: {} };
  for (const s of SYMBOLS) {
    const c = await fetchCboeChain(s, 15_000).catch(() => null);
    if (!c || !(c.spot > 0) || !c.rawChain.length) { console.log(`  ${s}: no chain`); continue; }
    // Keep ≤ 800 DTE (the new engine's horizon) — the old engine never looks further either.
    const cutoff = Date.now() + 800 * 864e5;
    const rows = c.rawChain.filter((o) => Date.parse(o.expiration_date) <= cutoff);
    snap.chains[s] = { spot: c.spot, fetchedAt: c.fetchedAt ?? null, rows };
    console.log(`  ${s}: spot ${c.spot} · ${rows.length} rows`);
    await new Promise((r) => setTimeout(r, 1500)); // CBOE CDN 429s bursts
  }
  mkdirSync(dirname(SNAP), { recursive: true });
  writeFileSync(SNAP, gzipSync(JSON.stringify(snap)));
  return snap;
}

function load(): Snapshot | null {
  if (!existsSync(SNAP)) return null;
  return JSON.parse(gunzipSync(readFileSync(SNAP)).toString('utf8'));
}

const PROFILES = {
  none: {},
  bot: { accountSize: 100_000, riskBudgetDollars: 250, maxDebitDollars: 300, minRoiAtT1Pct: 30 },
  ui: { accountSize: 10_000, riskBudgetDollars: 250, maxDebitDollars: 500 },
} as const;
type ProfileKey = keyof typeof PROFILES;

const SETUPS = [
  { setup: 'swing' as const, t1: 0.06, stop: 0.03 },
  { setup: 'scalp' as const, t1: 0.025, stop: 0.0125 },
  // A deliberately weak 1:1 plan so the grade has something to discriminate.
  { setup: 'swing' as const, t1: 0.03, stop: 0.03 },
];

const LETTERS = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
type Tally = Record<string, number>;
const blank = (): Tally => Object.fromEntries(LETTERS.map((l) => [l, 0]));
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}%` : '—');
const row = (t: Tally) => {
  const n = LETTERS.reduce((a, l) => a + t[l], 0);
  return `${LETTERS.map((l) => `${l} ${String(t[l]).padStart(3)} (${pct(t[l], n).padStart(4)})`).join('  ')}   n=${n}`;
};

interface Stats {
  picks: Tally; recGrade: Tally; theses: number; withPicks: number; withRec: number;
  picksFit: number; picksOutside: number; outsideF: number; fitF: number;
}
const newStats = (): Stats => ({ picks: blank(), recGrade: blank(), theses: 0, withPicks: 0, withRec: 0, picksFit: 0, picksOutside: 0, outsideF: 0, fitF: 0 });

function tally(st: Stats, sel: { picks: Array<{ grade: string; tier: string; fitsAccount: boolean }>; recommendedTier: string | null }) {
  st.theses++;
  if (sel.picks.length) st.withPicks++;
  for (const p of sel.picks) {
    st.picks[p.grade]++;
    if (p.fitsAccount) { st.picksFit++; if (p.grade === 'F') st.fitF++; }
    else { st.picksOutside++; if (p.grade === 'F') st.outsideF++; }
  }
  if (sel.recommendedTier) {
    st.withRec++;
    const rec = sel.picks.find((p) => p.tier === sel.recommendedTier);
    if (rec) st.recGrade[rec.grade]++;
  }
}

async function main() {
  let snap = process.argv.includes('--refresh') ? null : load();
  if (!snap) {
    console.log('Fetching CBOE delayed chains (no credentials needed)…');
    snap = await refresh();
  }
  const syms = Object.keys(snap.chains);
  console.log(`\nSnapshot fetched ${snap.fetchedAt} · ${syms.length} symbols: ${syms.join(' ')}`);
  console.log('NOTE: DTE is computed against the CURRENT clock, so re-running a stale snapshot shifts windows; --refresh for a fresh read.\n');

  const results: Record<ProfileKey, { old: Stats; neu: Stats }> = {
    none: { old: newStats(), neu: newStats() },
    bot: { old: newStats(), neu: newStats() },
    ui: { old: newStats(), neu: newStats() },
  };
  const oldPenaltyHits = { outside_account_risk: 0, strike_beyond_t1: 0, totalPicks: 0 };
  const wholeWindow = blank();

  for (const sym of syms) {
    const { spot, rows } = snap.chains[sym];
    for (const dir of ['bullish', 'bearish'] as const) {
      for (const s of SETUPS) {
        const sg = dir === 'bullish' ? 1 : -1;
        const base = {
          symbol: sym, direction: dir, setup: s.setup, entry: spot,
          t1: +(spot * (1 + sg * s.t1)).toFixed(2), stop: +(spot * (1 - sg * s.stop)).toFixed(2),
          conviction: 80, asOfSpot: spot,
        };
        for (const pk of Object.keys(PROFILES) as ProfileKey[]) {
          const thesis = { ...base, ...PROFILES[pk] };
          const o = OLD.selectFromChain(thesis as OLD.PriceActionThesis, spot, rows as OLD.RawChainOption[]);
          const n = NEW.selectFromChain(thesis as NEW.PriceActionThesis, spot, rows);
          tally(results[pk].old, o);
          tally(results[pk].neu, n);
          if (pk === 'none') {
            // Every tradeable contract in the same window, graded by the shared engine —
            // shows whether the grade discriminates or just hands out A's.
            const optionType = dir === 'bullish' ? 'call' : 'put';
            const ranked = rankContracts({
              symbol: sym, spot,
              rows: rows.filter((r) => r.option_type === optionType).map((r) => ({
                occ: r.symbol, type: optionType, strike: r.strike, expiry: r.expiration_date.slice(0, 10),
                bid: r.bid ?? null, ask: r.ask ?? null,
                delta: r.greeks?.delta ? r.greeks.delta : null, gamma: r.greeks?.gamma ?? null,
                theta: r.greeks?.theta ?? null, vega: r.greeks?.vega ?? null,
                iv: (r.greeks?.mid_iv ?? 0) > 0 ? r.greeks!.mid_iv! : null,
                openInterest: r.open_interest ?? null, volume: r.volume ?? null,
              })),
              thesis: { direction: dir === 'bullish' ? 'long' : 'short', entry: spot, stop: base.stop, t1: base.t1, holdingDays: s.setup === 'swing' ? 2 : 0.5 },
              limits: { accountSize: Infinity, maxLossDollars: Infinity, maxDebitDollars: Infinity, dteMin: n.dteWindow.min, dteMax: n.dteWindow.max },
              source: { kind: 'cboe_delayed', label: 'CBOE', fetchedAt: snap.fetchedAt, quotesAsOf: null, openInterestDate: null, note: '' },
              sourcesTried: [], withinCap: Infinity, outsideCap: Infinity,
            });
            for (const c of ranked.within) wholeWindow[c.grade]++;
          }
          if (pk === 'bot') {
            for (const p of o.picks) {
              oldPenaltyHits.totalPicks++;
              if (p.flags.includes('outside_account_risk')) oldPenaltyHits.outside_account_risk++;
              if (p.flags.includes('strike_beyond_t1')) oldPenaltyHits.strike_beyond_t1++;
            }
          }
        }
      }
    }
  }

  for (const pk of Object.keys(PROFILES) as ProfileKey[]) {
    const { old, neu } = results[pk];
    console.log(`━━ profile: ${pk.toUpperCase()} ${JSON.stringify(PROFILES[pk])} — ${old.theses} theses`);
    console.log(`  tier-pick grades  OLD  ${row(old.picks)}`);
    console.log(`                    NEW  ${row(neu.picks)}`);
    console.log(`  recommended grade OLD  ${row(old.recGrade)}`);
    console.log(`                    NEW  ${row(neu.recGrade)}`);
    console.log(`  theses with a recommended (tradeable) pick: OLD ${old.withRec}/${old.theses}   NEW ${neu.withRec}/${neu.theses}`);
    console.log(`  picks inside limits: OLD ${old.picksFit}/${old.picksFit + old.picksOutside}   NEW ${neu.picksFit}/${neu.picksFit + neu.picksOutside}`);
    console.log(`  F among picks OUTSIDE limits: OLD ${old.outsideF}/${old.picksOutside}   NEW ${neu.outsideF}/${neu.picksOutside}`);
    console.log(`  F among picks INSIDE limits:  OLD ${old.fitF}/${old.picksFit}   NEW ${neu.fitF}/${neu.picksFit}\n`);
  }
  console.log(`NEW grade of EVERY tradeable contract in the thesis windows (not just the picks):\n  ${row(wholeWindow)}\n`);
  console.log(`OLD engine, bot profile:${oldPenaltyHits.outside_account_risk}/${oldPenaltyHits.totalPicks} picks carried the −30 account penalty, ${oldPenaltyHits.strike_beyond_t1}/${oldPenaltyHits.totalPicks} the −12 strike-past-T1 penalty.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
