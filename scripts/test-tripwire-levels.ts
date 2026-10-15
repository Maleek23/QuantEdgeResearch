/**
 * Tripwire level alerts — shared/tripwire-levels.ts evaluation + dedupe, and
 * server/tripwire-levels.ts sweep with FAKE deps. No webhook is ever reached:
 * global fetch is replaced with a thrower and the Discord env vars are cleared.
 *   npm run test:tripwire-levels
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluateTripwires, tripKey } from '../shared/tripwire-levels';

for (const k of Object.keys(process.env)) if (/DISCORD|WEBHOOK/i.test(k)) delete process.env[k];
(globalThis as any).fetch = () => { throw new Error('network is forbidden in this test'); };

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); n++; };

(async () => {
  const D = '2026-10-14';
  const levels = [{ kind: 'apex' as const, price: 600 }, { kind: 'put-wall' as const, price: 580 }];
  const sent = new Set<string>();
  // far away → nothing
  eq(evaluateTripwires({ date: D, symbol: 'SPY', price: 590, prevPrice: null, levels, sent }).length, 0, 'far → no alert');
  // approach within 0.25%
  const a1 = evaluateTripwires({ date: D, symbol: 'SPY', price: 599, prevPrice: 590, levels, sent });
  eq(a1.map((a) => a.event), ['approach'], 'approach fires');
  a1.forEach((a) => sent.add(a.key));
  eq(evaluateTripwires({ date: D, symbol: 'SPY', price: 599.2, prevPrice: 599, levels, sent }).length, 0, 'approach deduped');
  // cross through → touch
  const t1 = evaluateTripwires({ date: D, symbol: 'SPY', price: 601, prevPrice: 599.2, levels, sent });
  eq(t1.map((a) => a.event), ['touch'], 'crossing = touch');
  t1.forEach((a) => sent.add(a.key));
  eq(evaluateTripwires({ date: D, symbol: 'SPY', price: 599.5, prevPrice: 601, levels, sent }).length, 0, 'touch once per session; no approach after touch');
  ok(evaluateTripwires({ date: '2026-10-15', symbol: 'SPY', price: 599.5, prevPrice: null, levels, sent }).length === 1, 'new session re-arms');
  ok(evaluateTripwires({ date: D, symbol: 'SPY', price: 599.5, prevPrice: null, levels: [{ kind: 'apex', price: 599.6 }], sent }).length === 1, 'a moved level is a new level');
  eq(evaluateTripwires({ date: D, symbol: 'SPY', price: 0, prevPrice: null, levels, sent }), [], 'no price → nothing');
  ok(tripKey(D, 'SPY', 'apex', 600, 'touch') === `${D}|SPY|apex|600|touch`, 'key shape');
  ok(t1[0].text.includes('Apex 600.00'), 'text names the level');

  // sweep with fake deps (in-app + discord captured, never sent)
  const { sweepTripwires, resetTripwireState } = await import('../server/tripwire-levels');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'trip-')), 'sent.json');
  const inApp: string[] = []; const discord: string[] = [];
  let price = 599;
  const deps = {
    symbols: async () => ['SPY', 'QQQ'],
    levels: async (s: string) => (s === 'SPY' ? [{ kind: 'zero-gamma' as const, price: 600 }, { kind: 'gatekeeper' as const, price: 650 }] : []),
    quotes: async () => new Map([['SPY', price]]),
    inApp: (t: string) => { inApp.push(t); },
    discord: async (t: string) => { discord.push(t); },
    now: () => Date.UTC(2026, 9, 14, 15, 0),
  };
  resetTripwireState();
  const f1 = await sweepTripwires(deps, file);
  eq(f1.map((a) => `${a.kind}:${a.event}`), ['zero-gamma:approach'], 'sweep fires approach');
  eq(inApp.length, 1, 'in-app delivered'); eq(discord.length, 1, 'one batched discord line');
  ok(discord[0].startsWith('Tripwire'), 'discord text');
  ok((await sweepTripwires(deps, file)).length === 0, 'second sweep deduped');
  price = 600.5;
  eq((await sweepTripwires(deps, file)).map((a) => a.event), ['touch'], 'then touch');
  resetTripwireState();
  ok((await sweepTripwires(deps, file)).length === 0, 'dedupe survives a restart (file)');
  process.env.FLAG_TRIPWIRE_LEVELS = 'off';
  resetTripwireState();
  price = 640;
  ok((await sweepTripwires(deps, file)).length === 0, 'flag off → no sweep');
  delete process.env.FLAG_TRIPWIRE_LEVELS;

  // static guards
  const src = fs.readFileSync('server/tripwire-levels.ts', 'utf8');
  ok(!/femi/i.test(src) && !/discord\.com\/api\/webhooks/.test(src), 'no hard-coded webhook, never Femi');
  ok(fs.readFileSync('server/index.ts', 'utf8').includes("import('./tripwire-levels')"), 'sweep scheduled');
  console.log(`test-tripwire-levels: ${n} checks passed`);
})().catch((e) => { console.error(e); process.exit(1); });
