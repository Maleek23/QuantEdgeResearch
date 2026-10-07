/**
 * NEXUS setup-detail defects (operator AMD paste, 2026-10-06 after hours):
 * bar/legend time labels, closed-session stamp, levels asOf, volume read
 * (closed session + reasons), after-close option attach gate, off-hours contract label.
 */
import assert from 'node:assert/strict';
import {
  barSessionDate, barTimeLabel, chartSessionStamp, lastRegularCloseDate,
  calledOutsideRegularSession, levelsAsOfLabel,
} from '../shared/bar-time';
import { computeVolumeRead, type VolBar } from '../server/volume-read';
import { optionAttachGate, publishGateFor } from '../server/lib/publish-gates';

let n = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++; };
const eq = <T>(a: T, b: T, m: string) => { assert.equal(a, b, m); n++; };
const at = (iso: string) => Date.parse(iso);

/* ── 2. bar time labels ── */
// Yahoo daily stamp: 09:30 ET = 13:30 UTC (EDT)
eq(barSessionDate(at('2026-10-06T13:30:00Z')), '2026-10-06', 'yahoo daily → its ET date');
// 00:00 UTC stamp must NOT become the prior day (20:00 ET Oct 5)
eq(barSessionDate(at('2026-10-06T00:00:00Z')), '2026-10-06', 'midnight-UTC daily → its UTC date');
// a forming daily bar stamped at an after-hours print (19:54 ET)
eq(barSessionDate(at('2026-10-06T23:54:00Z')), '2026-10-06', '19:54 ET stamp → same session date');
eq(barTimeLabel(at('2026-10-06T23:54:00Z'), '1D'), 'Oct 6', 'daily label is date-only (no 07:54 PM)');
eq(barTimeLabel(at('2026-05-13T13:30:00Z'), '1D'), 'May 13', 'daily label date');
eq(barTimeLabel(at('2026-10-06T19:55:00Z'), '5m'), 'Oct 6 15:55 ET', 'intraday label in ET');
eq(barTimeLabel(at('2026-10-06T19:55:00Z'), '5m', { compact: true }), '15:55', 'compact intraday axis tick');
eq(barTimeLabel(NaN, '1D'), '—', 'NaN → dash');

/* ── 3. closed / extended-hours stamp ── */
const post = chartSessionStamp(at('2026-10-06T23:22:00Z')); // Tue 19:22 ET
eq(post.session, 'post', '19:22 ET is after-hours');
ok(!post.expectTape && /After-hours · last 16:00 ET/.test(post.label), `after-hours label: ${post.label}`);
const night = chartSessionStamp(at('2026-10-07T01:30:00Z')); // 21:30 ET
ok(/^Closed · last 16:00 ET$/.test(night.label), `overnight label: ${night.label}`);
const rth = chartSessionStamp(at('2026-10-06T15:00:00Z'));
ok(rth.expectTape && /Waiting for tape/.test(rth.label), 'regular session still waits for tape');
const sat = chartSessionStamp(at('2026-10-10T16:00:00Z')); // Saturday
ok(/Closed · last Oct 9 16:00 ET/.test(sat.label), `weekend points at Friday close: ${sat.label}`);
eq(lastRegularCloseDate(at('2026-10-06T14:00:00Z')), '2026-10-05', 'mid-session → prior close');
eq(lastRegularCloseDate(at('2026-09-08T02:00:00Z')), '2026-09-04', 'Labor Day night → Friday before');
const pre = chartSessionStamp(at('2026-10-07T11:00:00Z')); // 07:00 ET
ok(/Pre-market · last Oct 6 16:00 ET/.test(pre.label), `pre-market label: ${pre.label}`);

/* ── 4. levels asOf ── */
eq(levelsAsOfLabel({ asOf: 'garbage', clusters: [] }), null, 'unparseable asOf is omitted, not "Invalid Date"');
eq(levelsAsOfLabel({ asOf: undefined, clusters: [{ members: [{ asOf: '2026-10-06T20:00:00Z' }] }] }), 'Oct 6, 4:00 PM ET', 'falls back to newest member asOf');
eq(levelsAsOfLabel({ asOf: '2026-10-06T23:22:00Z' }), 'Oct 6, 7:22 PM ET', 'map asOf in ET');

/* ── 5. volume read ── */
// 6 sessions of flat 1,000-share 5-min RTH bars, "today" 2× heavier, completed.
function sessionBars(ymd: string, perBar: number): VolBar[] {
  const out: VolBar[] = [];
  const open = Date.parse(`${ymd}T13:30:00Z`) / 1000; // 09:30 EDT
  for (let i = 0; i < 78; i++) out.push({ t: open + i * 300, v: perBar });
  out.push({ t: open + 78 * 300 + 600, v: 50_000 }); // a post-market bar — excluded
  return out;
}
const days = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05'];
const bars = [...days.flatMap((d) => sessionBars(d, 1000)), ...sessionBars('2026-10-06', 2000)];
const closed = computeVolumeRead('AMD', bars, null, 'test 5m', at('2026-10-06T23:22:00Z'));
eq(closed.label, 'heavy', 'completed 2× session reads heavy');
eq(closed.sessionRvol, 2, 'full-day rvol 2.0');
eq(closed.sessionClosed, true, 'after 16:00 the read is a completed session');
eq(closed.asOf, '2026-10-06T20:00:00.000Z', 'asOf = close of the 15:55 bar');
eq(closed.sessionVolume, 156_000, 'RTH only — post-market bar excluded');
const noBase = computeVolumeRead('AMD', sessionBars('2026-10-06', 2000), null, 'test 5m', at('2026-10-06T23:22:00Z'));
ok(noBase.label === 'unknown' && /no prior sessions/.test(String(noBase.note)), `no baseline states why: ${noBase.note}`);
const empty = computeVolumeRead('AMD', [], null, 'test 5m');
ok(empty.label === 'unknown' && /no regular-session bars/.test(String(empty.note)), 'empty states why');
const trig = computeVolumeRead('AMD', bars, '2026-10-06T14:02:00Z', 'test 5m', at('2026-10-06T23:22:00Z'));
eq(trig.trigger?.rvol, 2, 'trigger bar rvol (10:00 bar)');

/* ── 7. after-close option attach gate ── */
ok(optionAttachGate(at('2026-10-06T23:22:31Z')) != null, '19:22 ET: no contract may be attached');
eq(optionAttachGate(at('2026-10-06T15:00:00Z')), null, '11:00 ET: attach allowed');
eq(optionAttachGate(at('2026-10-06T23:22:31Z'), { OPTIONS_AFTER_CLOSE: 'allow' }), null, 'env override');
eq(publishGateFor({ source: 'quant', assetType: 'option' }, at('2026-10-06T23:22:31Z')), optionAttachGate(at('2026-10-06T23:22:31Z')), 'publish gate shares the attach gate');
ok(calledOutsideRegularSession(at('2026-10-06T23:22:31Z')), 'called 19:22 ET → off-hours contract label');
ok(!calledOutsideRegularSession(at('2026-10-06T15:00:00Z')), 'called 11:00 ET → option-backed');
ok(calledOutsideRegularSession(at('2026-09-07T15:00:00Z')), 'Labor Day is not a session');

console.log(`nexus detail: ${n} checks passed`);
