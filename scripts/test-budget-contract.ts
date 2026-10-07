/**
 * Budget contract (shared/budget-contract.ts) + whole-contract sizing
 * (shared/position-sizing.ts) — operator 2026-10-07: NEXUS picked MU 11/20 1100C
 * at $39.65 and the $500–1,000 budget fractionalized it. Keep the primary and
 * pick a whole, liquid contract the budget can buy.
 *   npm run test:budget-contract
 *
 * MU fixture (real Alpaca 1-min prints, Oct 7 2026; signal 09:53 ET MU long @ $1,028.59):
 *   10/09 1090C $1.93 → peak $17.30 @ 12:51 ET · 10/09 1100C $1.32 → $13.10 ·
 *   10/16 1100C $7.65 → $28.82 · primary 11/20 1100C $39.65.
 * The other strikes of the chain are FIXTURE ASSUMPTIONS: each expiry's IV is
 * backed out of the real print and applied flat across strikes; bid/ask = mid
 * ±2%; OI 2,500 / prior-day volume 800 (MU weeklies are liquid). T1/T2/stop
 * are assumptions too (the idea row is not in this fixture): T1 $1,060, T2 $1,090,
 * stop $1,012.
 */
import assert from 'node:assert/strict';
import {
  budgetContractEnabled, budgetLine, minDteFor, pickBudgetContract, premiumAtLevel, primaryLine, readBudgetContract,
  trackBudgetContract, wholeContracts, type BudgetChainRow,
} from '../shared/budget-contract';
import { bsDelta, bsPrice, impliedVol } from '../shared/iv-fill';
import { readLiquidityConfig } from '../shared/option-liquidity';
import { sizeForRisk } from '../shared/position-sizing';
import { attachBudgetContract } from '../server/lib/budget-contract-attach';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };

const S = 1028.59;
const NOW = Date.parse('2026-10-07T13:53:00Z'); // 09:53 ET
const cfg = readLiquidityConfig({});
const REAL: Record<string, { dte: number; K: number; p: number }> = {
  '2026-10-09': { dte: 2, K: 1090, p: 1.93 },
  '2026-10-16': { dte: 9, K: 1100, p: 7.65 },
  '2026-11-20': { dte: 44, K: 1100, p: 39.65 },
};
const realPrint: Record<string, number> = { '2026-10-09|1090': 1.93, '2026-10-09|1100': 1.32, '2026-10-16|1100': 7.65, '2026-11-20|1100': 39.65 };

function chain(): BudgetChainRow[] {
  const rows: BudgetChainRow[] = [];
  for (const [exp, r] of Object.entries(REAL)) {
    const T = r.dte / 365;
    const iv = impliedVol(r.p, S, r.K, T, true)!;
    for (let K = 940; K <= 1160; K += 10) {
      for (const type of ['call', 'put'] as const) {
        const isCall = type === 'call';
        const mid = realPrint[`${exp}|${K}`] && isCall ? realPrint[`${exp}|${K}`] : Math.round(bsPrice(S, K, T, iv, isCall) * 100) / 100;
        if (!(mid > 0.05)) continue;
        rows.push({
          type, strike: K, expiry: exp, bid: Math.round(mid * 0.98 * 100) / 100, ask: Math.round(mid * 1.02 * 100) / 100,
          delta: bsDelta(S, K, T, iv, isCall), iv, openInterest: 2500, volume: 300, prevVolume: 800, dte: r.dte,
        });
      }
    }
  }
  return rows;
}

const base = { symbol: 'MU', direction: 'long' as const, spot: S, t1: 1060, t2: 1090, stop: 1012, rows: chain(), nowMs: NOW, liqCfg: cfg, source: 'fixture', asOf: new Date(NOW).toISOString() };

(async () => {
  await t('sizing: MU primary $39.65 is over a $500 and a $1,000 budget — never fractional', () => {
    for (const b of [500, 1000]) {
      const s = sizeForRisk({ assetType: 'option', entry: S, stop: 1012, entryPremium: 39.65 }, b);
      assert.equal(s.ok, false); assert.ok(!s.ok && s.overBudget);
    }
    assert.equal(wholeContracts(500, 39.65), 0);
    assert.equal(wholeContracts(500, 1.93), 2);
    assert.equal(wholeContracts(1000, 7.65), 1);
    assert.equal(primaryLine({ expiry: '2026-11-20', strike: 1100, optionType: 'call', entryPremium: 39.65 }, 500), 'Primary: 11/20 1100C $39.65 (over budget)');
  });

  await t('fixture deltas: the real prints and their implied deltas', () => {
    const rows = base.rows.filter((r) => r.type === 'call' && realPrint[`${r.expiry}|${r.strike}`]);
    for (const r of rows) console.log(`  ${r.expiry} ${r.strike}C mid ${((r.bid! + r.ask!) / 2).toFixed(2)} Δ${r.delta!.toFixed(3)} iv ${(r.iv! * 100).toFixed(0)}%`);
    assert.equal(rows.length, 4);
  });

  let dayPick: ReturnType<typeof pickBudgetContract> | null = null;
  await t('MU day idea, $500: whole, liquid, ≥1 DTE, Δ 0.15–0.45, debit ≤ $500', () => {
    const r = pickBudgetContract({ ...base, budget: 500, holding: 'day' });
    dayPick = r;
    assert.ok(r.ok, !r.ok ? r.reason : '');
    const p = r.pick;
    console.log(`  day/$500 → ${p.rationale}`);
    console.log(`  ${budgetLine(p)}`);
    assert.ok(p.qty >= 1 && Number.isInteger(p.qty));
    assert.ok(p.debit <= 500);
    assert.ok(p.dte >= 1);
    assert.ok(Math.abs(p.delta) >= 0.15 && Math.abs(p.delta) <= 0.45);
    assert.equal(p.optionType, 'call');
    assert.ok(p.premiumT1 > p.entryPremium && p.premiumStop < p.entryPremium);
    assert.ok(p.liquidity.ok);
  });

  await t('MU swing idea (3-day hold), $1,000: needs DTE ≥ 3 → never the 10/09 weekly', () => {
    const r = pickBudgetContract({ ...base, budget: 1000, holding: 'swing', holdDays: 3 });
    assert.ok(r.ok, !r.ok ? r.reason : '');
    console.log(`  swing/$1000 → ${r.pick.rationale}`);
    assert.ok(r.pick.dte >= 3); assert.ok(r.pick.debit <= 1000);
  });

  await t('0DTE rows are excluded unless the idea is itself a 0DTE desk idea', () => {
    const zero = base.rows.filter((r) => r.expiry === '2026-10-09').map((r) => ({ ...r, dte: 0 }));
    const r = pickBudgetContract({ ...base, rows: zero, budget: 500, holding: 'day' });
    assert.equal(r.ok, false);
    const z = pickBudgetContract({ ...base, rows: zero, budget: 500, holding: 'day', zeroDteIdea: true });
    assert.ok(z.ok && z.pick.dte === 0);
    assert.equal(minDteFor({ holding: 'day' }), 1);
    assert.equal(minDteFor({ holding: 'swing', holdDays: 5 }), 5);
  });

  await t('illiquid rows are never picked', () => {
    const thin = base.rows.map((r) => ({ ...r, openInterest: 10 }));
    const r = pickBudgetContract({ ...base, rows: thin, budget: 500, holding: 'day' });
    assert.equal(r.ok, false); assert.ok(!r.ok && /liquidity/.test(r.reason));
  });

  await t('short idea → puts', () => {
    const r = pickBudgetContract({ ...base, direction: 'short', t1: 1000, t2: 980, stop: 1040, budget: 1000, holding: 'day' });
    assert.ok(r.ok, !r.ok ? r.reason : ''); assert.equal(r.pick.optionType, 'put');
  });

  await t('premium mapping: never below intrinsic; delta fallback without IV', () => {
    const row = { type: 'call' as const, strike: 1090, delta: 0.2, gamma: null, iv: null, dte: 2 };
    assert.equal(premiumAtLevel(row, 1.93, S, 1120, 0.25).premium, 30); // intrinsic
    const d = premiumAtLevel(row, 1.93, S, 1040, 0.25);
    assert.equal(d.method, 'delta'); assert.equal(d.premium, Math.round((1.93 + 0.2 * (1040 - S)) * 100) / 100);
  });

  await t('tracking: the real 10/09 1090C path ($1.93 → $17.30 @ 12:51 ET) hits T1 and records the peak', () => {
    assert.ok(dayPick && dayPick.ok);
    // At its implied Δ≈0.09 the 1090C is OUTSIDE the 0.15–0.45 band, so the picker does not choose it
    // (asserted below); the tracker is exercised on it directly with the same plan mapping.
    const only = base.rows.filter((x) => x.expiry === '2026-10-09' && x.strike === 1090 && x.type === 'call');
    const r0 = pickBudgetContract({ ...base, budget: 500, holding: 'day', rows: only });
    assert.equal(r0.ok, false); assert.ok(!r0.ok && /band/.test(r0.reason));
    const row = only[0];
    const t1p = premiumAtLevel(row, 1.93, S, 1060, 0.25).premium;
    const bc = { ...dayPick.pick, label: 'MU 2026-10-09 1090C', strike: 1090, expiry: '2026-10-09', entryPremium: 1.93, qty: 2, debit: 386, delta: Math.round(row.delta! * 100) / 100,
      premiumT1: t1p, premiumT2: premiumAtLevel(row, 1.93, S, 1090, 0.25).premium, premiumStop: 0.97, tracking: undefined };
    assert.equal(bc.label, 'MU 2026-10-09 1090C'); assert.equal(bc.qty, 2); assert.equal(bc.debit, 386);
    const m = (et: string) => Date.parse(`2026-10-07T${et}:00-04:00`);
    const bars = [
      { t: m('09:53'), o: 1.93, h: 2.05, l: 1.80, c: 2.00 },
      { t: m('10:30'), o: 2.0, h: 4.10, l: 1.95, c: 4.0 },
      { t: m('11:40'), o: 9.0, h: 11.2, l: 8.8, c: 11.0 },
      { t: m('12:51'), o: 15.9, h: 17.30, l: 15.5, c: 16.8 },
      { t: m('15:59'), o: 12.0, h: 12.4, l: 11.8, c: 12.1 },
    ];
    const tr = trackBudgetContract(bc, bars, m('09:53'), m('16:00'), 'alpaca:1Min', m('16:30'));
    assert.equal(tr.peak!.premium, 17.3); assert.equal(tr.peak!.atMs, m('12:51'));
    assert.ok(tr.t1HitAt != null && tr.stopHitAt == null);
    assert.ok(tr.outcome === 'hit_t1' || tr.outcome === 'hit_t2');
    const line = budgetLine({ ...bc, tracking: tr })!;
    console.log(`  ${line}`);
    assert.match(line, /^Budget: 10\/09 1090C ×2 @ \$1\.93 · \$386 debit/);
    assert.match(line, /peak \$17\.30/);
    // a peak never goes down on a later pass
    const tr2 = trackBudgetContract({ ...bc, tracking: tr }, [{ t: m('15:59'), o: 12, h: 12.4, l: 11.8, c: 12.1 }], m('15:00'), m('16:00'), 'x', m('16:40'));
    assert.equal(tr2.peak!.premium, 17.3); assert.equal(tr2.t1HitAt, tr.t1HitAt);
    // stored shape round-trips
    assert.ok(readBudgetContract(JSON.stringify({ budgetContract: { ...bc, tracking: tr } })));
  });

  await t('stop first → stopped, later T1 touch does not count', () => {
    assert.ok(dayPick && dayPick.ok);
    const bc = dayPick.pick;
    const tr = trackBudgetContract(bc, [
      { t: NOW + 60_000, o: bc.entryPremium, h: bc.entryPremium, l: bc.premiumStop - 0.01, c: bc.premiumStop },
      { t: NOW + 120_000, o: bc.entryPremium, h: bc.premiumT1 + 1, l: bc.entryPremium, c: bc.premiumT1 },
    ], NOW, NOW + 3_600_000, 'x', NOW + 3_600_000);
    assert.equal(tr.outcome, 'hit_stop'); assert.equal(tr.t1HitAt ?? null, null);
  });

  await t('flag: BUDGET_CONTRACT default on; off disables attach', async () => {
    assert.equal(budgetContractEnabled({}), true);
    assert.equal(budgetContractEnabled({ BUDGET_CONTRACT: 'off' }), false);
    const idea = { symbol: 'MU', assetType: 'option', direction: 'long', entryPrice: S, targetPrice: 1060, stopLoss: 1012, holdingPeriod: 'day', source: 'quant', strikePrice: 1100, expiryDate: '2026-11-20', entryPremium: 39.65, optionType: 'call', convergenceSignalsJson: { contractLiquidity: { ok: true } } };
    const off = await attachBudgetContract(idea, { env: { BUDGET_CONTRACT: 'off' }, nowMs: NOW, loadChain: async () => { throw new Error('must not load'); } });
    assert.equal(off.pick, null);
    const on = await attachBudgetContract(idea, { env: {}, nowMs: NOW, loadChain: async () => ({ rows: base.rows, source: 'fixture', asOf: new Date(NOW).toISOString() }) });
    assert.ok(on.pick); assert.equal((on.idea.convergenceSignalsJson as any).contractLiquidity.ok, true); // existing JSON kept
    assert.equal(on.idea.strikePrice, 1100); assert.equal(on.idea.entryPremium, 39.65); // primary untouched
    const none = await attachBudgetContract(idea, { env: {}, nowMs: NOW, loadChain: async () => null });
    assert.equal(none.pick, null); assert.ok((none.idea.convergenceSignalsJson as any).budgetContractSkip);
    const slow = await attachBudgetContract(idea, { env: {}, nowMs: NOW, timeoutMs: 20, loadChain: () => new Promise((res) => setTimeout(() => res(null), 500)) });
    assert.equal(slow.pick, null);
  });

  await t('Discord lifecycle card shows primary (over budget) + budget contract lines', async () => {
    assert.ok(dayPick && dayPick.ok);
    const { buildCardPayload } = await import('../server/discord-lifecycle');
    const card: any = {
      ideaId: 'mu-1', channel: 'nexus', day: '2026-10-07', thesisKey: 'k', symbol: 'MU', label: 'MU 1100C 11/20', direction: 'long', isOption: true, isPut: false,
      plan: { entry: S, target: 1060, stop: 1012, premium: 39.65, expiry: '2026-11-20' }, grade: 'A 90', thesis: '', source: 'quant', publishedAt: NOW,
      status: 'published', statusLine: 'Published', verified: null, events: [], messageId: null, channelId: null, guildId: null,
      primary: primaryLine({ expiry: '2026-11-20', strike: 1100, optionType: 'call', entryPremium: 39.65 }, 500), budget: budgetLine(dayPick.pick),
    };
    const f = (buildCardPayload(card) as any).embeds[0].fields.find((x: any) => x.name === 'Budget contract');
    assert.ok(f); assert.match(f.value, /Primary: 11\/20 1100C \$39\.65 \(over budget\)/); assert.match(f.value, /Budget: 10\/09 1070C ×1 @ \$4\.48/);
  });

  console.log(`test-budget-contract: ${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
