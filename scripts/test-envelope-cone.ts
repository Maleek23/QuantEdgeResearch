/**
 * Envelope v2 — shared/envelope-cone.ts (1σ/2σ cones, intraday shape, skew,
 * frozen 09:40 cone, move vs priced) + the feature flag.
 *   npm run test:envelope-cone
 */
import assert from 'node:assert/strict';
import { buildCone, buildEnvelope, freezeCone, moveVsPriced, shouldFreeze, parseEnvelopeHorizon } from '../shared/envelope-cone';
import { defaultVarianceCurve, etInstant } from '../shared/path-projection';
import { flagOn } from '../shared/feature-flags';

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const near = (a: number, b: number, tol: number, m: string) => { assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`); n++; };

// Wed 2026-10-14
const D = '2026-10-14';
const open = etInstant(D, 570);
const preOpen = etInstant(D, 540);

// 1) Today from before the open: full session variance = overnight share (scaled) + 80% intraday
const c0 = buildCone({ spot: 600, nowMs: preOpen, sessionMove: 6 }, 'today');
ok(c0.points.length > 5, 'points produced');
ok(c0.sd > 0 && c0.sd <= 6 + 1e-9, 'today 1σ ≤ full session move');
near(c0.up2, 2 * c0.up1, 1e-9, '2σ = 2 × 1σ (no skew)');
near(c0.up1, c0.dn1, 1e-9, 'symmetric without skew');
ok(c0.points.every((p, i, a) => i === 0 || p.u1 >= a[i - 1].u1 - 1e-12), 'cone never narrows');
ok(c0.points.at(-1)!.tm === 390 * 60_000, 'trading ms = one full session (390 min)');

// 2) intraday shape: first 30 min of variance > middle 30 min (U-curve)
const cIntra = buildCone({ spot: 600, nowMs: open, sessionMove: 6, overnightShare: 0, maxPoints: 1000 }, 'today');
const at = (min: number) => cIntra.points.find((p) => p.tm >= min * 60_000)!.u1 - 600;
const first30 = at(30) ** 2; const mid30 = at(195 + 15) ** 2 - at(195 - 15) ** 2;
ok(first30 > mid30 * 1.5, `open window wider than lunch (${first30.toFixed(3)} vs ${mid30.toFixed(3)})`);
near(cIntra.sd, 6, 1e-6, 'full RTH from the open, no overnight = S');

// 3) skew asymmetry: puts richer → lower edge further
const cs = buildCone({ spot: 600, nowMs: open, sessionMove: 6, skew: 0.1 }, 'today');
ok(cs.dn1 > cs.up1, 'downside wider with + skew');
near(cs.dn1 / cs.up1, 1.1 / 0.9, 1e-9, 'skew ratio');
ok(buildCone({ spot: 600, nowMs: open, sessionMove: 6, skew: 9 }, 'today').dn1 / buildCone({ spot: 600, nowMs: open, sessionMove: 6, skew: 9 }, 'today').up1 <= 1.25 / 0.75 + 1e-9, 'skew clamped at 0.25');

// 4) horizons widen: today < next < week ≤ month
const all = buildEnvelope({ spot: 600, nowMs: open + 3_600_000, sessionMove: 6 });
ok(all.length === 4, 'four cones');
ok(all[0].sd < all[1].sd && all[1].sd < all[2].sd && all[2].sd <= all[3].sd, 'horizon order widens');
ok(all[1].sessions.length === 2, 'next day spans two sessions');
ok(buildEnvelope({ spot: 600, nowMs: open, sessionMove: 0 }).length === 0, 'no priced move → no cones (nothing invented)');
ok(parseEnvelopeHorizon('bogus') === 'today' && parseEnvelopeHorizon('week') === 'week', 'horizon parse');

// 5) frozen 09:40 cone
ok(!shouldFreeze(etInstant(D, 575), null), 'no freeze before 09:40');
ok(shouldFreeze(etInstant(D, 580), null), 'freeze at 09:40');
const f = freezeCone(600, 6, etInstant(D, 580), defaultVarianceCurve());
ok(!shouldFreeze(etInstant(D, 700), f), 'frozen once per day');
ok(shouldFreeze(etInstant('2026-10-15', 600), f), 'new day re-freezes');
ok(!shouldFreeze(etInstant('2026-10-17', 600), null), 'weekend never freezes');
ok(f.daySd > 0 && f.daySd < 6, 'day σ from 09:40 < full-session σ');
const m = moveVsPriced(f, 603, etInstant(D, 700))!;
ok(m && m.move === 3 && m.sigmas! > 0 && m.ofDay! > 0, 'move vs priced computed');
ok(/since 09:40/.test(m.text), 'readout text');
ok(moveVsPriced(f, 603, etInstant('2026-10-15', 700)) === null, 'stale day → no readout');
const m2 = moveVsPriced(f, 597, etInstant(D, 959))!;
near(m2.sigmas!, -3 / m2.pricedSoFar, 1e-9, 'signed σ');

// 6) flag
ok(flagOn('ENVELOPE_V2') === true, 'default ON');
ok(flagOn('ENVELOPE_V2', { env: { FLAG_ENVELOPE_V2: 'off' } }) === false, 'env off');
ok(flagOn('ENVELOPE_V2', { storage: { getItem: () => '0' } }) === false, 'storage off');

// 7) holidays + events
const thx = buildCone({ spot: 600, nowMs: etInstant('2026-11-25', 1000), sessionMove: 6 }, 'today');
ok(thx.sessions[0] === '2026-11-27', 'Thanksgiving skipped: next session is Friday');
const now7 = etInstant(D, 600);
const plainW = buildCone({ spot: 600, nowMs: now7, sessionMove: 6 }, 'week');
const evW = buildCone({ spot: 600, nowMs: now7, sessionMove: 6, events: [{ atMs: etInstant('2026-10-15', 570), move: 3, label: 'CPI' }] }, 'week');
near(evW.sd, Math.sqrt(plainW.sd ** 2 + 9), 1e-9, 'event adds its jump variance to the terminal σ');
const evT = buildCone({ spot: 600, nowMs: now7, sessionMove: 6, events: [{ atMs: etInstant('2026-10-15', 570), move: 3, label: 'CPI' }] }, 'today');
near(evT.sd, buildCone({ spot: 600, nowMs: now7, sessionMove: 6 }, 'today').sd, 1e-12, 'event past the horizon ignored');
const before = evW.points.filter((p) => p.t < etInstant('2026-10-15', 570));
ok(before.every((p, i) => Math.abs(p.u1 - plainW.points[i].u1) < 1e-9), 'cone unchanged before the event');

console.log(`test-envelope-cone: ${n} checks passed`);
