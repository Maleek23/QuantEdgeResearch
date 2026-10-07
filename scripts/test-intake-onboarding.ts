/**
 * Beta intake form, onboarding progress and the roadmap / updates feed.
 *   npm run test:intake-onboarding
 * No DB, no server: stores run against an in-memory kv and a fake DB layer.
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { EXPERIENCE, experienceTier, validateIntakeProfile, cleanText, STRUGGLE_MAX } from '../shared/intake';
import { EMPTY_PROGRESS, mergeProgress, newerProgress, normalizeProgress } from '../shared/onboarding';
import { GLOSSARY } from '../shared/glossary';
import { publicRoadmap, seedRoadmap, unseenShipped, latestShippedDate, validateRoadmapInput, ROADMAP_AREAS } from '../shared/roadmap';
import { _resetIntakeStoreState, patchProgress, readAllProfiles, readProgress, saveProfile, type IntakeStoreDeps, type KvStore } from '../server/intake-store';
import { createRoadmapItem, deleteRoadmapItem, listRoadmap, updateRoadmapItem } from '../server/roadmap-store';
import { isAppRoute, PUBLIC_ROUTES, seoStatusFor } from '../server/seo-metadata';
import { TOURS, stepsFor, tourForLocation } from '../client/src/components/onboarding/tours';

let n = 0;
const tests: [string, () => void | Promise<void>][] = [];
const t = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const VALID = {
  name: 'Ada', experience: 'lt1', markets: ['options', '0dte'], accountSize: '1to5k', goal: 'learn', source: 'referral',
  sourceDetail: 'Femi', consentEmails: true, ackNotAdvice: true,
};

// ── intake validation ──
t('valid required profile passes and is normalised', () => {
  const v = validateIntakeProfile({ ...VALID, junk: 'x', markets: ['options', 'options', 'bogus', '0dte'] });
  assert.ok(v.ok);
  assert.deepEqual(v.value.markets, ['options', '0dte']);
  assert.equal((v.value as unknown as Record<string, unknown>).junk, undefined);
  assert.equal(v.value.sourceDetail, 'Femi');
});
t('each required field is reported', () => {
  const v = validateIntakeProfile({});
  assert.ok(!v.ok);
  for (const k of ['name', 'experience', 'markets', 'accountSize', 'goal', 'source', 'ackNotAdvice']) assert.ok(v.errors[k as keyof typeof v.errors], k);
});
t('not-financial-advice ack must be literally true', () => {
  assert.ok(!validateIntakeProfile({ ...VALID, ackNotAdvice: 'yes' }).ok);
});
t('"prefer not to say" is a valid account size', () => {
  assert.ok(validateIntakeProfile({ ...VALID, accountSize: 'na' }).ok);
});
t('sourceDetail only kept for referral/other', () => {
  const v = validateIntakeProfile({ ...VALID, source: 'tiktok', sourceDetail: 'x' });
  assert.ok(v.ok); assert.equal(v.value.sourceDetail, undefined);
});
t('optional fields: struggle capped at 280, html stripped, bad enums dropped', () => {
  const v = validateIntakeProfile({ ...VALID, struggle: '<b>' + 'a'.repeat(400), tradingTime: 'midnight', tools: ['ibkr', 'nope'], occupation: '  nurse  ' });
  assert.ok(v.ok);
  assert.equal(v.value.struggle!.length, STRUGGLE_MAX);
  assert.ok(!v.value.struggle!.includes('<'));
  assert.equal(v.value.tradingTime, undefined);
  assert.deepEqual(v.value.tools, ['ibkr']);
  assert.equal(v.value.occupation, 'nurse');
  assert.equal(cleanText('   '), undefined);
});
t('experience → tier', () => {
  assert.deepEqual(EXPERIENCE.map((e) => experienceTier(e.id)), ['beginner', 'beginner', 'intermediate', 'pro', 'pro']);
  assert.equal(experienceTier(null), null);
});

// ── onboarding progress ──
t('merge is additive for tours/checklist; resetTours clears tours', () => {
  const a = mergeProgress(EMPTY_PROGRESS, { tours: { today: '2026-10-07T10:00:00.000Z' } }, '2026-10-07T10:00:00.000Z');
  const b = mergeProgress(a, { tours: { gex: '2026-10-07T11:00:00.000Z' }, checklist: { discord: '2026-10-07T11:00:00.000Z' } });
  assert.deepEqual(Object.keys(b.tours).sort(), ['gex', 'today']);
  assert.ok(b.checklist.discord);
  const c = mergeProgress(b, { resetTours: true });
  assert.deepEqual(c.tours, {}); assert.ok(c.checklist.discord);
});
t('normalize drops unknown tours and non-ISO values', () => {
  const p = normalizeProgress({ tours: { today: 'yesterday', nexus: '2026-10-07T10:00:00.000Z', hack: '2026-10-07T10:00:00.000Z' }, showTips: 'yes' });
  assert.deepEqual(Object.keys(p.tours), ['nexus']); assert.equal(p.showTips, null);
});
t('showTips only changes when present in the patch', () => {
  const a = mergeProgress(EMPTY_PROGRESS, { showTips: false });
  assert.equal(mergeProgress(a, { checklistHidden: true }).showTips, false);
});
t('newer progress wins', () => {
  const old = { ...EMPTY_PROGRESS, updatedAt: '2026-10-01T00:00:00.000Z', checklistHidden: true };
  const nu = { ...EMPTY_PROGRESS, updatedAt: '2026-10-02T00:00:00.000Z' };
  assert.equal(newerProgress(old, nu), nu); assert.equal(newerProgress(null, old), old);
});

// ── stores ──
function memKv(): KvStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return { data, read: <T,>(k: string) => (data.has(k) ? structuredClone(data.get(k)) as T : null), write: (k, v) => { data.set(k, structuredClone(v)); return true; } };
}
const missingColumn = () => Object.assign(new Error('column "profile" does not exist'), { code: '42703' });

t('profile: column missing → saved to the file, DB switched off after the first 42703', async () => {
  _resetIntakeStoreState();
  let calls = 0;
  const deps: IntakeStoreDeps = { kv: memKv(), db: {
    saveProfile: async () => { calls++; throw missingColumn(); }, readProfiles: async () => { calls++; throw missingColumn(); },
    saveProgress: async () => { throw missingColumn(); }, readProgress: async () => { throw missingColumn(); },
  } };
  const p = validateIntakeProfile(VALID); assert.ok(p.ok);
  assert.equal(await saveProfile(deps, 'Ada@Example.com', p.value, false), 'saved');
  assert.equal(await saveProfile(deps, 'b@example.com', p.value, false), 'saved');
  assert.equal(calls, 1, 'second save skips the DB');
  const all = await readAllProfiles(deps);
  assert.equal(all.get('ada@example.com')?.name, 'Ada');
  assert.ok(all.get('ada@example.com')?.submittedAt);
});
t('profile: anonymous resubmit keeps the first answers; signed-in overwrite replaces', async () => {
  _resetIntakeStoreState();
  const deps: IntakeStoreDeps = { kv: memKv() };
  const a = validateIntakeProfile(VALID); const b = validateIntakeProfile({ ...VALID, name: 'Mallory' });
  assert.ok(a.ok && b.ok);
  await saveProfile(deps, 'ada@example.com', a.value, false);
  assert.equal(await saveProfile(deps, 'ada@example.com', b.value, false), 'kept');
  assert.equal((await readAllProfiles(deps)).get('ada@example.com')?.name, 'Ada');
  assert.equal(await saveProfile(deps, 'ada@example.com', b.value, true), 'saved');
  assert.equal((await readAllProfiles(deps)).get('ada@example.com')?.name, 'Mallory');
});
t('profile: DB rows win over the file once the column exists', async () => {
  _resetIntakeStoreState();
  const kv = memKv();
  const deps: IntakeStoreDeps = { kv, db: {
    saveProfile: async () => {}, readProfiles: async () => [{ email: 'ADA@example.com', profile: { name: 'From DB' } }],
    saveProgress: async () => {}, readProgress: async () => null,
  } };
  const a = validateIntakeProfile(VALID); assert.ok(a.ok);
  await saveProfile(deps, 'ada@example.com', a.value, true);
  assert.equal((await readAllProfiles(deps)).get('ada@example.com')?.name, 'From DB');
});
t('progress: patch persists to the file without a DB and reads back', async () => {
  _resetIntakeStoreState();
  const deps: IntakeStoreDeps = { kv: memKv() };
  await patchProgress(deps, 'u1', { tours: { today: new Date().toISOString() }, showTips: false });
  const p = await readProgress(deps, 'u1');
  assert.ok(p.tours.today); assert.equal(p.showTips, false);
  assert.deepEqual((await readProgress(deps, 'u2')).tours, {});
});

// ── roadmap ──
t('seed: only real git-log items, every area valid, shipped ones dated', () => {
  const s = seedRoadmap('2026-10-07T00:00:00.000Z');
  assert.ok(s.length >= 10);
  for (const i of s) {
    assert.ok(ROADMAP_AREAS.includes(i.area));
    if (i.status === 'shipped') assert.match(i.targetDate ?? '', /^2026-(09|10)-\d\d$/);
  }
  const titles = s.map((i) => i.title.toLowerCase()).join(' | ');
  for (const must of ['budget contract', 'whole-contract', 'risk $500', 'peaks', 'discord lifecycle', 'self-setup', 'call accuracy', 'sector rotation', 'spx mirror']) {
    assert.ok(titles.includes(must), must);
  }
  // Commit subjects back the seed: each anchor word appears in the last 3 weeks of git log.
  let log = '';
  try { log = execSync('git log --since=2026-09-20 --format=%s', { encoding: 'utf8' }).toLowerCase(); } catch { /* not a git checkout */ }
  if (log) for (const w of ['budget contract', 'fractional', 'risk $500', 'peaks', 'lifecycle', 'self-setup', 'call accuracy', 'rotation → trade ideas', 'spx mirror']) assert.ok(log.includes(w), `git log mentions "${w}"`);
});
t('public roadmap = shipped + in progress, in progress first', () => {
  const s = seedRoadmap();
  const all = [...s, { ...s[0], id: 'x', status: 'idea' as const }, { ...s[0], id: 'y', status: 'planned' as const }];
  const p = publicRoadmap(all);
  assert.ok(p.every((i) => i.status === 'shipped' || i.status === 'in_progress'));
  assert.equal(p[0].status, 'in_progress');
  assert.equal(p.length, s.length);
});
t('badge: first visit 0, then shipped items after the seen date', () => {
  const s = seedRoadmap();
  assert.equal(unseenShipped(s, null), 0);
  assert.equal(unseenShipped(s, latestShippedDate(s)), 0);
  assert.ok(unseenShipped(s, '2026-09-30') >= 7);
});
t('roadmap validation', () => {
  assert.ok(!validateRoadmapInput({ area: 'NEXUS', status: 'idea' }).ok, 'title required');
  assert.ok(!validateRoadmapInput({ title: 'x', area: 'Mars', status: 'idea' }).ok);
  assert.ok(!validateRoadmapInput({ title: 'x', area: 'GEX', status: 'idea', targetDate: '10/07/2026' }).ok);
  const ok = validateRoadmapInput({ title: '<b>x</b>', area: 'GEX', status: 'idea' });
  assert.ok(ok.ok); assert.equal(ok.value.title, 'bx/b');
  assert.deepEqual(validateRoadmapInput({ status: 'shipped' }, true), { ok: true, value: { status: 'shipped' } });
});
t('roadmap store: seed on first read, create / update / ship stamps date / delete', () => {
  const kv = memKv();
  const seeded = listRoadmap(kv).length;
  const c = createRoadmapItem(kv, { title: 'GEX tour video', area: 'Onboarding', status: 'planned' });
  assert.ok(c.ok);
  assert.equal(listRoadmap(kv).length, seeded + 1);
  const u = updateRoadmapItem(kv, c.item.id, { status: 'shipped' });
  assert.ok(u.ok); assert.match(u.item.targetDate ?? '', /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!updateRoadmapItem(kv, 'nope', { status: 'idea' }).ok);
  assert.ok(deleteRoadmapItem(kv, c.item.id));
  assert.equal(listRoadmap(kv).length, seeded);
});

// ── routes / tours / glossary ──
t('SEO: /updates public + indexable, /admin/roadmap an app route', () => {
  assert.ok(PUBLIC_ROUTES['/updates']); assert.equal(seoStatusFor('/updates'), 200);
  assert.ok(isAppRoute('/admin/roadmap'));
});
t('tour per location', () => {
  assert.equal(tourForLocation('/today', ''), 'today');
  assert.equal(tourForLocation('/t', ''), 'nexus');
  assert.equal(tourForLocation('/t', '?nx=0dte'), '0dte');
  assert.equal(tourForLocation('/t', '?tab=gex'), 'gex');
  assert.equal(tourForLocation('/t', '?tab=leaps'), null);
  assert.equal(tourForLocation('/settings', ''), null);
});
t('intermediate tours are shorter; every tour has core steps; terms exist in the glossary', () => {
  for (const [id, tour] of Object.entries(TOURS)) {
    const full = stepsFor(id as keyof typeof TOURS, 'beginner').length;
    const core = stepsFor(id as keyof typeof TOURS, 'intermediate').length;
    assert.ok(core > 0 && core <= full, id);
    for (const s of tour.steps) for (const k of s.terms ?? []) assert.ok(k in GLOSSARY, `${id}: ${k}`);
  }
  for (const k of ['gex', 'call-wall', 'gamma-flip', '0dte', 'r', 'targets', 'vwap', 'orb', 'delta']) assert.ok(k in GLOSSARY, k);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); n++; } catch (e) { console.error('FAIL', name); throw e; }
  }
  console.log(`intake-onboarding: ${n}/${tests.length} passed`);
})().catch(() => process.exit(1));
