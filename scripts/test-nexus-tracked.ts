/**
 * NEXUS tracked symbols: pure core (shared/nexus-tracked.ts), the shared-file
 * store (server/nexus-tracked.ts, in a temp SHARED_STATE_DIR) and the route guard.
 *   npm run -s test:nexus-tracked
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-tracked-'));
process.env.SHARED_STATE_DIR = dir;
process.env.NEXUS_TRACK = 'MRVL:2026-10-02,MSFT:2026-10-02,bad!:2026-10-02,NVDA:nope';

let n = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); n++; } catch (e) { console.error(`✗ ${name}`); throw e; } };

// Thu 2026-10-01 11:00 ET (EDT, UTC-4)
const THU = Date.parse('2026-10-01T15:00:00Z');
const FRI_END = '2026-10-03T03:59:59.999Z';

async function main() {
  const core = await import('../shared/nexus-tracked');
  const store = await import('../server/nexus-tracked');
  const { guardFor } = await import('../server/route-guards');

  await t('end of ET day is DST-aware', () => {
    assert.equal(core.etEndOfDayIso('2026-10-02'), FRI_END);                 // EDT
    assert.equal(core.etEndOfDayIso('2026-12-04'), '2026-12-05T04:59:59.999Z'); // EST
    assert.equal(core.etEndOfDayIso('nope'), null);
  });
  await t('trading days count today and skip the weekend', () => {
    assert.equal(core.tradingDayAhead(THU, 1), '2026-10-01');
    assert.equal(core.tradingDayAhead(THU, 2), '2026-10-02');
    assert.equal(core.tradingDayAhead(THU, 3), '2026-10-05');
    assert.equal(core.tradingDayAhead(Date.parse('2026-10-03T15:00:00Z'), 1), '2026-10-05'); // Saturday → Monday
  });
  await t('env seed parses MRVL/MSFT through Friday and skips junk', () => {
    const env = core.parseTrackEnv(process.env.NEXUS_TRACK, THU);
    assert.deepEqual(env.map((e) => [e.symbol, e.until]), [['MRVL', FRI_END], ['MSFT', FRI_END]]);
  });
  await t('expired entries drop; Friday night they are gone', () => {
    assert.deepEqual(store.getTrackedSymbols(THU).sort(), ['MRVL', 'MSFT']);
    assert.deepEqual(store.getTrackedSymbols(Date.parse(FRI_END) - 1).sort(), ['MRVL', 'MSFT']);
    assert.deepEqual(store.getTrackedSymbols(Date.parse(FRI_END) + 1), []);
  });
  await t('operator add persists to the shared file and extends', () => {
    const list = store.addTracked({ symbol: 'amd', days: 3, note: 'earnings run' }, THU);
    const amd = list.find((e) => e.symbol === 'AMD');
    assert.equal(amd?.until, core.etEndOfDayIso('2026-10-05'));
    assert.equal(amd?.origin, 'operator');
    assert.ok(fs.existsSync(path.join(dir, 'nexus-tracked.json')));
    const ext = store.addTracked({ symbol: 'MRVL', until: '2026-10-06' }, THU).find((e) => e.symbol === 'MRVL');
    assert.equal(ext?.until, core.etEndOfDayIso('2026-10-06'));            // file entry beats the env seed
  });
  await t('remove dismisses an env seed and deletes a file entry', () => {
    let list = store.removeTracked('MSFT', THU);
    assert.ok(!list.some((e) => e.symbol === 'MSFT'));
    list = store.removeTracked('AMD', THU);
    assert.deepEqual(list.map((e) => e.symbol), ['MRVL']);
  });
  await t('bad input is a TrackedInputError, cap holds', () => {
    assert.throws(() => store.addTracked({ symbol: '123' }, THU), store.TrackedInputError);
    assert.throws(() => store.addTracked({ symbol: 'AAPL', until: '2026-09-30' }, THU), store.TrackedInputError);
    for (const s of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) store.addTracked({ symbol: s, days: 2 }, THU);
    assert.equal(store.listTracked(THU).length, core.MAX_TRACKED);
    assert.throws(() => store.addTracked({ symbol: 'H', days: 2 }, THU), /at most/);
  });
  await t('withTracked puts tracked first, deduped', () => {
    assert.deepEqual(core.withTracked(['MRVL', 'msft'], ['AAPL', 'MSFT', 'NVDA']), ['MRVL', 'MSFT', 'AAPL', 'NVDA']);
  });
  await t('untilLabel', () => {
    assert.equal(core.untilLabel(FRI_END, THU), 'Fri');
    assert.equal(core.untilLabel(core.etEndOfDayIso('2026-10-01')!, THU), 'today');
  });
  await t('route guard: writes are operator, read is not in the table', () => {
    assert.equal(guardFor('POST', '/api/nexus/tracked'), 'operator');
    assert.equal(guardFor('DELETE', '/api/nexus/tracked/MRVL'), 'operator');
    assert.equal(guardFor('DELETE', '/API/Nexus/Tracked/MRVL/'), 'operator');
    assert.equal(guardFor('GET', '/api/nexus/tracked'), null); // requireBetaAccess on the route itself
  });

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`✓ nexus-tracked: ${n} tests passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
