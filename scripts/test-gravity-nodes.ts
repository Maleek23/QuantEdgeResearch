/**
 * Gravity — shared/gravity-nodes.ts labels + velocity/Halo, the route's pure
 * timeline adapter, tool registration and the flag.
 *   npm run test:gravity-nodes
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { apexOf, gatekeeperOf, haloOf, nodeVelocity, readGravity } from '../shared/gravity-nodes';
import { gravityFromTimeline } from '../server/gravity-route';
import { flagOn } from '../shared/feature-flags';

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const eq = (a: unknown, b: unknown, m: string) => { assert.deepEqual(a, b, m); n++; };

const nodes = [
  { strike: 610, gex: 9 },   // apex
  { strike: 605, gex: -4 },  // gatekeeper (largest |gex| between 600 and 610)
  { strike: 603, gex: 2 },
  { strike: 598, gex: 3 },   // rug over...
  { strike: 595, gex: -6 },  // ...larger negative
  { strike: 590, gex: -1 },
];
eq(apexOf(nodes), 610, 'apex = largest positive');
eq(gatekeeperOf(600, nodes, 610)?.strike, 605, 'gatekeeper = largest |GEX| between price and apex');
eq(gatekeeperOf(600, nodes, null), null, 'no apex → no gatekeeper');
eq(gatekeeperOf(600, [{ strike: 610, gex: 9 }], 610), null, 'nothing between → none');

const g = readGravity({ spot: 600, nodes, sessionHigh: 604, sessionLow: 597 });
eq(g.apex, 610, 'read apex'); eq(g.gatekeeper, 605, 'read gatekeeper');
eq(g.rug, 598, 'rug strike'); eq(g.rugInto, 595, 'rug falls into the negative node');
ok(g.nodes.find((x) => x.strike === 603)!.delivered === true, '603 inside range → delivered');
ok(g.nodes.find((x) => x.strike === 610)!.delivered === false, '610 outside → fresh');
ok(readGravity({ spot: 600, nodes }).nodes.every((x) => x.delivered === null), 'no range → unknown, not invented');
ok(g.nodes.find((x) => x.strike === 605)!.roles.includes('gatekeeper'), 'role chip');
const tramp = readGravity({ spot: 600, nodes: [{ strike: 598, gex: -2 }, { strike: 595, gex: 7 }] });
eq(tramp.trampoline, 595, 'trampoline = strong + under a −');

// velocity: 5-min samples over 1h
const T = Date.UTC(2026, 9, 14, 16, 0);
const times = Array.from({ length: 13 }, (_, i) => T + i * 300_000);
const asOf = times.at(-1)!;
const series = [
  { strike: 610, points: times.map((t, i) => [t, 5 + i * 0.4] as [number, number]) }, // steadily building
  { strike: 605, points: times.map((t, i) => [t, -4 + (i % 2 ? 0.01 : -0.01)] as [number, number]) }, // flicker
];
const vel = nodeVelocity(series, times, asOf, 10);
ok(vel.get(610)!.v['5m']! > 0 && vel.get(610)!.v['1h']! > 0, 'building node has + velocity');
eq(vel.get(610)!.halo, 'building', 'halo when ≥2 timeframes agree');
eq(vel.get(605)!.halo, null, 'flicker → no halo');
eq(haloOf({ '5m': 0.06, '15m': -0.07, '1h': 0.01 }), null, 'disagreeing timeframes → no halo');
eq(haloOf({ '5m': -0.06, '15m': -0.2, '1h': null }), 'bleeding', 'two down → bleeding');
const short = nodeVelocity(series.map((x) => ({ ...x, points: x.points.slice(-2) })), times.slice(-2), asOf, 10);
eq(short.get(605)?.v['1h'], null, 'no sample 1h back → null, not interpolated');
// negative node getting MORE negative = building
const gn = readGravity({ spot: 600, nodes: [{ strike: 595, gex: -10 }], series: [{ strike: 595, points: times.map((t, i) => [t, -2 - i * 0.6] as [number, number]) }], sampleTimes: times, asOf });
eq(gn.nodes[0].velocity?.halo, 'building', 'halo direction follows the node sign');

// route adapter
const p = gravityFromTimeline('SPY', 'today', { samples: times.map((t) => ({ t, spot: 600 })), series }, asOf);
ok(p.read && p.read.apex === 610 && p.samples === 13, 'route payload');
ok(gravityFromTimeline('SPY', 'today', { samples: [], series: [] }, asOf).read === null, 'empty timeline → no read');

// tool registered + flag
ok(fs.readFileSync('client/src/components/dashboard/defs/gex.ts', 'utf8').includes("id: 'gex-gravity'"), 'tool registered');
ok(fs.readFileSync('server/routes.ts', 'utf8').includes('registerGravityRoutes'), 'route registered');
ok(flagOn('GRAVITY_LABELS') && !flagOn('GRAVITY_LABELS', { env: { FLAG_GRAVITY_LABELS: 'false' } }), 'flag default on, env off');

console.log(`test-gravity-nodes: ${n} checks passed`);
