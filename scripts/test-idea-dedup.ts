/**
 * test-idea-dedup — the same-instrument publish rule (server/lib/instrument-dedup.ts).
 *
 *   npx tsx scripts/test-idea-dedup.ts
 *
 * Replays the 2026-09-30 duplicates (IWM 279P 0DTE ×3, CRM 220P ×2) and checks
 * that genuinely different instruments / the opposite side still pass.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  findSameInstrumentDuplicate, instrumentKey, isZeroDte, etSessionStartMs, etDate,
  markDedupedResult, isDedupedResult, normalizeSide,
} from '../server/lib/instrument-dedup';

let failed = 0;
const ok = (cond: unknown, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failed++; console.log(`  ✗ ${msg}`); }
};

const et = (s: string) => Date.parse(`${s}-04:00`); // EDT on 2026-09-30

const iwm = (id: string, ts: string, extra: Record<string, any> = {}) => ({
  id, symbol: 'IWM', direction: 'short', source: 'gex_scanner', assetType: 'option',
  optionType: 'put', strikePrice: 279, expiryDate: '2026-09-30',
  timestamp: new Date(et(ts)).toISOString(), outcomeStatus: 'open', status: 'published', archived: false,
  ...extra,
});

console.log('\n1. IWM 279P 0DTE — the three afternoon publishes');
{
  const first = iwm('iwm-1', '2026-09-30T13:25:00');
  const cand = { ...first, id: undefined as any };
  // 14:15 — first still open
  let hit = findSameInstrumentDuplicate(cand, [first], et('2026-09-30T14:15:00'));
  ok(hit?.row.id === 'iwm-1' && hit.why === 'open', '14:15 blocked by the open 13:25 row');
  // 14:50 — first already stopped out at 13:40 (closed today) → still blocked
  const closed = { ...first, outcomeStatus: 'hit_stop', exitDate: new Date(et('2026-09-30T13:40:00')).toISOString() };
  hit = findSameInstrumentDuplicate(cand, [closed], et('2026-09-30T14:50:00'));
  ok(!!hit && hit.row.id === 'iwm-1', '14:50 blocked by the closed-today 13:25 row (old 30-min window missed it)');
  ok(isZeroDte(cand, et('2026-09-30T14:50:00')), '0DTE detected (expiry = ET session date)');
  ok(etSessionStartMs(et('2026-09-30T14:50:00')) === et('2026-09-30T00:00:00'), 'session start = 00:00 ET');
  ok(etDate(Date.parse('2026-10-01T02:00:00Z')) === '2026-09-30', 'etDate: 02:00Z is still 09-30 in New York');

  // A genuinely different contract / the opposite side pass
  ok(!findSameInstrumentDuplicate({ ...cand, strikePrice: 278 }, [closed], et('2026-09-30T14:50:00')), '278P passes');
  ok(!findSameInstrumentDuplicate({ ...cand, optionType: 'call', direction: 'long' }, [closed], et('2026-09-30T14:50:00')), 'long call (opposite side) passes');
  ok(!findSameInstrumentDuplicate({ ...cand, direction: 'long' }, [first], et('2026-09-30T14:50:00')), 'opposite direction on same contract passes');
  ok(!findSameInstrumentDuplicate({ ...cand, expiryDate: '2026-10-01' }, [closed], et('2026-09-30T14:50:00')), 'next-day expiry passes');
  ok(!findSameInstrumentDuplicate({ ...cand, source: 'zero_dte_desk' }, [first], et('2026-09-30T14:50:00')), 'a different source is not this rule');
  ok(!findSameInstrumentDuplicate({ ...cand, assetType: 'stock', optionType: null, strikePrice: null, expiryDate: null }, [first], et('2026-09-30T14:50:00')), 'stock idea on the same symbol passes');

  // 0DTE: yesterday's same-strike closed row does not block today's session
  const yday = iwm('iwm-y', '2026-09-29T15:00:00', { expiryDate: '2026-09-30', outcomeStatus: 'hit_stop', exitDate: new Date(et('2026-09-29T15:30:00')).toISOString() });
  ok(!findSameInstrumentDuplicate(cand, [yday], et('2026-09-30T10:00:00')), '0DTE: a row closed in the prior session does not block (session lookback)');
  // archived rows never block
  ok(!findSameInstrumentDuplicate(cand, [{ ...first, status: 'archived' }], et('2026-09-30T14:50:00')), 'archived row does not block');
}

console.log('\n2. CRM 220P Nov-20 — 03:40 and 18:28 publishes');
{
  const a = {
    id: 'crm-1', symbol: 'CRM', direction: 'short', source: 'gex_scanner', assetType: 'option',
    optionType: 'put', strikePrice: 220, expiryDate: '2026-11-20',
    timestamp: new Date(et('2026-09-30T03:40:00')).toISOString(), outcomeStatus: 'hit_stop',
    exitDate: new Date(et('2026-09-30T11:40:00')).toISOString(), status: 'published',
  };
  const cand = { symbol: 'crm', direction: 'bearish', source: 'gex_scanner', assetType: 'option', optionType: 'put', strikePrice: 220.0, expiryDate: '2026-11-20' };
  const hit = findSameInstrumentDuplicate(cand, [a], et('2026-09-30T18:28:00'));
  ok(hit?.row.id === 'crm-1', '18:28 blocked (14.8 h after publish; spine window was 6 h)');
  ok(!findSameInstrumentDuplicate(cand, [a], et('2026-10-01T12:00:00')), 'next day after 24 h since publish and close → allowed');
  const stillOpen = { ...a, outcomeStatus: 'open', exitDate: null, timestamp: new Date(et('2026-09-25T10:00:00')).toISOString() };
  ok(!!findSameInstrumentDuplicate(cand, [stillOpen], et('2026-09-30T18:28:00')), 'an OPEN row blocks whatever its age');
  ok(!findSameInstrumentDuplicate({ ...cand, strikePrice: 215 }, [a], et('2026-09-30T18:28:00')), '215P passes');
  ok(!findSameInstrumentDuplicate({ ...cand, expiryDate: '2026-12-18' }, [a], et('2026-09-30T18:28:00')), 'Dec expiry passes');
}

console.log('\n3. helpers');
{
  ok(instrumentKey({ symbol: 'X', direction: 'long', assetType: 'option', optionType: 'PUT', strikePrice: 279, expiryDate: '2026-09-30T00:00:00Z' }) === 'option|put|279.000|2026-09-30', 'instrument key normalises case, strike and expiry');
  ok(instrumentKey({ symbol: 'X', direction: 'long' }) === 'stock', 'default instrument is stock');
  ok(normalizeSide('bearish') === 'short' && normalizeSide('long') === 'long', 'side normalisation');
  const r = markDedupedResult({ id: 'x' });
  ok(isDedupedResult(r) && !isDedupedResult({ id: 'x' }), 'dedup marker is per-object');
}

console.log('\n4. storage wiring (static)');
{
  const s = fs.readFileSync(path.resolve(import.meta.dirname ?? __dirname, '../server/storage.ts'), 'utf8');
  ok(/findSameInstrumentIdea\(idea\)/.test(s) && /\[INSTRUMENT-DEDUP\] rejected/.test(s) && /existing idea \$\{hit\.row\.id\}/.test(s), 'createTradeIdea runs the rule and logs the existing id');
  for (const f of ['index-scalp-engine.ts', 'zero-dte-desk.ts', 'gex-idea-scanner.ts', 'gex-vex-scanner.ts', 'universal-idea-generator.ts']) {
    const t = fs.readFileSync(path.resolve(import.meta.dirname ?? __dirname, '../server', f), 'utf8');
    ok(t.includes('isDedupedResult(created)'), `${f} does not announce a deduped row as new`);
  }
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
