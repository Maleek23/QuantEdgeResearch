/**
 * Trader self-setup from the sign-in page (docs/DESK_ADMINS.md §Trader self-setup) — security tests.
 *   npx tsx scripts/test-trader-self-setup.ts      (npm run test:trader-self-setup)
 *
 * No database. The real routes run in a throwaway Express app with the real
 * requireAdminJWT, establishSession, verifyPassword, bcrypt passcode check,
 * CSRF check and per-IP limiters; storage is an in-memory fake, so every
 * passcode and password can be searched for in "the database", the audit file
 * and everything the process printed.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';

let checks = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); checks++; };
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); checks++; };
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const printed: string[] = [];
const tap = (stream: NodeJS.WriteStream) => {
  const orig = stream.write.bind(stream);
  (stream as any).write = (chunk: unknown, ...rest: unknown[]) => { printed.push(String(chunk)); return (orig as any)(chunk, ...rest); };
};
tap(process.stdout); tap(process.stderr);

async function main() {
  process.env.JWT_SECRET = 'test-trader-self-setup-secret';
  process.env.ADMIN_EMAIL = 'malik@x.io';
  process.env.DATABASE_URL ||= 'postgres://nobody@127.0.0.1:1/none';
  const dir = mkdtempSync(path.join(tmpdir(), 'qe-self-setup-'));
  process.env.ADMIN_AUDIT_FILE = path.join(dir, 'actions.jsonl');

  const H = await import('../server/trader-self-setup');
  const S = await import('../shared/trader-self-setup');
  const TA = await import('../shared/trader-accounts');
  const { verifyPassword } = await import('../server/userAuth');

  // ── 1. Pure rules ─────────────────────────────────────────────────────────
  const ex = (slug: string, name: string) => S.isExcludedSelfSetupBook({ slug, name });
  for (const [slug, name] of [['malik', 'Malik'], ['leek', 'Leek'], ['mine', 'Mine'], ['m1', "Malik's book"], ['quant-bot', 'Quant Bot'], ['bot', 'Bot'], ['nexus', 'NEXUS'], ['x1', 'NEXUS desk'], ['op', 'Operator']] as const) {
    ok(ex(slug, name), `operator / system book excluded: ${slug} "${name}"`);
  }
  for (const [slug, name] of [['femi', 'Femi'], ['uzo', 'Uzo'], ['ayo', 'Ayo'], ['tommi', 'Tommi']] as const) ok(!ex(slug, name), `trader book offered: ${name}`);
  ok(S.isExcludedSelfSetupBook({ slug: 'femi', name: 'Femi' }, ['femi']), 'env TRADER_SELF_SETUP_EXCLUDE adds slugs');
  eq([H.selfSetupEnvOn(undefined), H.selfSetupEnvOn(''), H.selfSetupEnvOn('on'), H.selfSetupEnvOn('off'), H.selfSetupEnvOn('0'), H.selfSetupEnvOn('FALSE')], [true, true, true, false, false, false], 'env TRADER_SELF_SETUP: default on, off/0/false close it');
  eq(H.normalizeSelfSetupConfig(null), { enabled: true, closedBooks: [] }, 'no state file = on, nothing closed');
  eq(H.normalizeSelfSetupConfig({ enabled: false, closedBooks: ['Femi', 'femi', 3] }), { enabled: false, closedBooks: ['femi'] }, 'config normalised');
  ok(!H.selfSetupOpen({ enabled: true, closedBooks: [] }, false), 'env off beats the hub switch');
  eq([S.selfSetupUsername('femi'), S.selfSetupUsername('9x'), S.selfSetupUsername('admin')], ['femi', null, null], 'username = slug when it is a valid, unreserved username');
  const tr = new H.NameAttemptTracker(5, 1000);
  for (let i = 0; i < 4; i++) ok(!tr.fail('femi', 0), `fail ${i + 1} is not the lockout`);
  ok(tr.fail('femi', 0) && tr.isLocked('femi', 10) && !tr.isLocked('uzo', 10), 'the 5th failure locks that name only');
  ok(!tr.isLocked('femi', 1001), 'the lock lifts when the window passes');
  const small = new H.NameAttemptTracker(5, 1000, 3);
  for (const n of ['a', 'b', 'c', 'd', 'e']) small.fail(n, 0);
  ok(small.size() <= 3, 'the per-name map is bounded');
  ok(H.csrfOk({ headers: { 'x-csrf-token': 'a'.repeat(64) }, cookies: { csrf_token: 'a'.repeat(64) } }), 'CSRF: cookie = header passes');
  ok(!H.csrfOk({ headers: { 'x-csrf-token': 'b'.repeat(64) }, cookies: { csrf_token: 'a'.repeat(64) } }), 'CSRF: mismatch fails');
  ok(!H.csrfOk({ headers: {}, cookies: { csrf_token: 'a'.repeat(64) } }) && !H.csrfOk({ headers: { 'x-csrf-token': 'a'.repeat(64) }, cookies: {} }), 'CSRF: missing header / cookie fails');

  // ── 2. The real routes ────────────────────────────────────────────────────
  const { requireAdminJWT, generateAdminToken } = await import('../server/auth');
  const { establishSession } = await import('../server/auth-hardening');
  const { registerTraderSelfSetupRoutes } = await import('../server/trader-self-setup-routes');
  const { traderSelfSetupLimiters, traderSelfSetupNamesLimiters } = await import('../server/rate-limiter');
  const { isProtectedAdmin } = await import('../server/admin-ops');

  const PASS = { malik: 'malik-book-code', leek: 'leek-book-code', bot: 'bot-book-code', femi: 'femi-book-code-77', uzo: 'uzo-book-code-88', tommi: 'tommi-book-code-99', bean: 'bean-book-code-11', kay: 'kay-book-code-22' };
  const ph = async (c: string) => bcrypt.hash(c, 4);
  const realHash = await ph('Existing-pass-1');
  let clock = Date.parse('2026-10-07T12:00:00Z');
  const users = new Map<string, any>([
    ['u-malik', { id: 'u-malik', email: 'malik@x.io', passwordHash: realHash, subscriptionTier: 'admin', hasBetaAccess: true }],
    ['u-uzo', { id: 'u-uzo', email: 'uzo@login.quantedge.invalid', passwordHash: realHash, subscriptionTier: 'free', hasBetaAccess: true }],
    ['u-bean', { id: 'u-bean', email: 'bean@login.quantedge.invalid', passwordHash: realHash, subscriptionTier: 'free' }],
  ]);
  const books: { slug: string; name: string; linkedUserId: string | null; passcodeHash: string | null }[] = [
    { slug: 'leek', name: 'Mine', linkedUserId: 'u-malik', passcodeHash: await ph(PASS.leek) },
    { slug: 'malik', name: 'Malik', linkedUserId: null, passcodeHash: await ph(PASS.malik) },
    { slug: 'quant-bot', name: 'Quant Bot', linkedUserId: null, passcodeHash: await ph(PASS.bot) },
    { slug: 'femi', name: 'Femi', linkedUserId: null, passcodeHash: await ph(PASS.femi) },
    { slug: 'uzo', name: 'Uzo', linkedUserId: 'u-uzo', passcodeHash: await ph(PASS.uzo) },
    { slug: 'ayo', name: 'Ayo', linkedUserId: null, passcodeHash: null },
    { slug: 'tommi', name: 'Tommi', linkedUserId: null, passcodeHash: await ph(PASS.tommi) },
    { slug: 'bean', name: 'Bean', linkedUserId: null, passcodeHash: await ph(PASS.bean) }, // username already held by u-bean
    { slug: 'kay', name: 'Kay', linkedUserId: null, passcodeHash: await ph(PASS.kay) },
  ];
  let cfg = { enabled: true, closedBooks: [] as string[] };
  let envOn = true;
  const sessionsMade: string[] = [];
  const inserts: string[] = [];
  let n = 0;
  const deps = {
    listTraders: async () => books.map((b) => ({ ...b })),
    getTrader: async (slug: string) => { const b = books.find((x) => x.slug === slug); return b ? { ...b } : null; },
    getUser: async (id: string) => (users.has(id) ? { ...users.get(id) } : null),
    getUserByEmail: async (email: string) => [...users.values()].find((u) => u.email === email) ?? null,
    insertUser: async (r: any) => {
      if ([...users.values()].some((u) => u.email === r.email)) throw Object.assign(new Error('duplicate key'), { code: '23505' }); // users.email UNIQUE
      const u = { id: `u-new-${++n}`, ...r, subscriptionStatus: 'active', createdAt: new Date(clock) };
      users.set(u.id, u); inserts.push(u.email); return { ...u };
    },
    setPasswordHash: async () => { throw new Error('self-setup never rewrites a password'); },
    setLinkedUser: async (slug: string, uid: string | null) => { books.find((b) => b.slug === slug)!.linkedUserId = uid; },
    isProtectedAdmin: (u: any) => isProtectedAdmin(u),
    listSetupRows: async () => [], insertSetupRow: async () => {}, revokeSetupRows: async () => {}, findSetupRow: async () => null, consumeSetupRow: async () => null,
    hashPassword: (p: string) => bcrypt.hash(p, 4),
    verifyPassword,
    deleteUserSessions: async () => 0,
    establishSession: async (req: any, uid: string) => { await establishSession(req, uid); sessionsMade.push(uid); },
    now: () => clock,
    readConfig: () => ({ enabled: cfg.enabled, closedBooks: [...cfg.closedBooks] }),
    writeConfig: (c: typeof cfg) => { cfg = { enabled: c.enabled, closedBooks: [...c.closedBooks] }; return true; },
    verifyPasscode: (c: string, h: string) => bcrypt.compare(c, h),
    envOn: () => envOn,
    extraExcluded: () => [] as string[],
  };

  const mkSession = (req: any, data: Record<string, unknown> = {}) => ({
    ...data,
    regenerate(cb: (e?: unknown) => void) { req.session = mkSession(req, { regenerated: true }); cb(); },
    save(cb: (e?: unknown) => void) { cb(); },
  });
  const mkApp = (lim: { names: express.RequestHandler[]; attempt: express.RequestHandler[] }) => {
    const a = express();
    a.use(cookieParser());
    a.use(express.json());
    a.use((req: any, _res, next) => { req.session = mkSession(req); next(); });
    a.post('/__session', (req: any, res) => res.json({ userId: req.session.userId ?? null }));
    registerTraderSelfSetupRoutes(a, requireAdminJWT, lim, deps as never);
    return a;
  };
  let blockAll = false;
  const testLimiter: express.RequestHandler = (_req, res, next) => (blockAll ? res.status(429).json({ error: 'Too many attempts' }) : next());
  // Capture the session the complete route establishes.
  let lastSessionUser: string | null = null;
  const app = express();
  app.use((req: any, res, next) => { res.on('finish', () => { lastSessionUser = req.session?.userId ?? null; }); next(); });
  app.use(mkApp({ names: [testLimiter], attempt: [testLimiter] }));
  const app2 = mkApp({ names: traderSelfSetupNamesLimiters, attempt: traderSelfSetupLimiters });

  const server = app.listen(0);
  const server2 = app2.listen(0);
  const CSRF = 'c'.repeat(64);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const base2 = `http://127.0.0.1:${(server2.address() as AddressInfo).port}`;
    const call = async (method: string, route: string, opts: { body?: unknown; csrf?: string | null; admin?: boolean; on?: string } = {}) => {
      const headers: Record<string, string> = {};
      const cookies: string[] = [];
      if (opts.csrf !== null) { cookies.push(`csrf_token=${CSRF}`); headers['x-csrf-token'] = opts.csrf ?? CSRF; }
      if (opts.admin) cookies.push(`admin_token=${generateAdminToken()}`);
      if (cookies.length) headers.Cookie = cookies.join('; ');
      if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
      const r = await fetch((opts.on ?? base) + route, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
      let j: any = null; try { j = await r.json(); } catch { /* empty */ }
      return { status: r.status, body: j, cache: r.headers.get('cache-control') };
    };
    const names = async () => (await call('GET', '/api/auth/trader-setup/names')).body;
    const verify = (slug: unknown, passcode: unknown, o: { csrf?: string | null } = {}) => call('POST', '/api/auth/trader-setup/verify', { body: { slug, passcode }, ...o });
    const complete = (slug: unknown, passcode: unknown, password: unknown, o: { csrf?: string | null } = {}) => call('POST', '/api/auth/trader-setup/complete', { body: { slug, passcode, password }, ...o });
    const GENERIC = [403, S.SELF_SETUP_ERROR];

    // 2a. Step 1: the list.
    const l1 = await names();
    eq(l1, { open: true, names: [{ slug: 'femi', name: 'Femi' }, { slug: 'kay', name: 'Kay' }, { slug: 'tommi', name: 'Tommi' }] },
      'names: only books with a passcode, no linked account, a free username — never Mine/Malik/bot, never set-up Uzo, never passcode-less Ayo');
    ok(!JSON.stringify(l1).includes('$2'), 'the list never carries a passcode hash');

    // 2b. CSRF.
    eq((await verify('femi', PASS.femi, { csrf: null })).status, 403, 'verify without the CSRF cookie/header → 403');
    eq((await verify('femi', PASS.femi, { csrf: 'd'.repeat(64) })).status, 403, 'verify with a mismatched CSRF header → 403');
    eq((await complete('femi', PASS.femi, 'Femi-own-pass-1', { csrf: null })).status, 403, 'complete without CSRF → 403');
    eq(inserts, [], 'no account from a CSRF-refused call');

    // 2c. Wrong passcode / unknown name / set-up name / operator book: one answer.
    const wrong = await verify('femi', 'not-the-code');
    eq([wrong.status, wrong.body.error], GENERIC, 'wrong passcode → generic 403');
    ok(wrong.cache === 'no-store', 'answers are no-store');
    const unknown = await verify('nobody', PASS.femi);
    eq([unknown.status, unknown.body], [wrong.status, wrong.body], 'unknown name → byte-identical answer');
    eq([(await verify('../etc', 'x')).status, (await verify(42, 'x')).body.error], [403, S.SELF_SETUP_ERROR], 'malformed name → the same answer');
    const setUp = await verify('uzo', PASS.uzo);
    eq([setUp.status, setUp.body], [wrong.status, wrong.body], 'already-set-up name with its RIGHT passcode → the same answer (closed for good)');
    eq((await complete('uzo', PASS.uzo, 'Uzo-new-pass-1')).body.error, S.SELF_SETUP_ERROR, 'and complete is refused too');
    eq(users.get('u-uzo').passwordHash, realHash, "Uzo's existing password untouched");
    for (const [slug, code] of [['malik', PASS.malik], ['leek', PASS.leek], ['quant-bot', PASS.bot]] as const) {
      const r = await verify(slug, code);
      eq([r.status, r.body], [wrong.status, wrong.body], `operator / bot book "${slug}" with its right passcode → the same answer`);
      eq((await complete(slug, code, 'Owned-pass-1234')).status, 403, `no account for "${slug}"`);
    }
    eq((await verify('ayo', '')).body.error, S.SELF_SETUP_ERROR, 'a book without a passcode → the same answer');
    eq((await verify('bean', PASS.bean)).body.error, S.SELF_SETUP_ERROR, 'a book whose username is taken → the same answer');
    eq(inserts, [], 'no account created by any refusal');
    ok(books.find((b) => b.slug === 'malik')!.linkedUserId === null && books.find((b) => b.slug === 'leek')!.linkedUserId === 'u-malik', "the operator's books unchanged");

    // 2d. Lockout: 5 failures per name per 15 min, then even the right passcode waits.
    clock += 16 * 60_000; // clear the femi failure above
    for (let i = 1; i <= 5; i++) eq((await verify('tommi', `guess-${i}`)).status, 403, `tommi wrong passcode #${i} → 403`);
    const locked = await verify('tommi', PASS.tommi);
    eq([locked.status, locked.body.error], [429, S.SELF_SETUP_LOCKED_ERROR], 'after 5 failures the RIGHT passcode is refused (429) for that name');
    eq((await complete('tommi', PASS.tommi, 'Tommi-own-pass-1')).status, 429, 'complete is locked too');
    eq((await verify('femi', 'still-wrong')).status, 403, 'another name is not locked');
    for (let i = 1; i <= 5; i++) await verify('ghost', `g-${i}`);
    eq((await verify('ghost', 'x')).status, 429, 'a name that does not exist locks the same way (lockout reveals nothing)');
    clock += 15 * 60_000 + 1;
    eq((await verify('tommi', PASS.tommi)).status, 200, 'the lock lifts after 15 minutes');

    // 2e. Step 2 success, then password policy (not counted as a guess).
    clock += 16 * 60_000;
    const v = await verify('Femi ', PASS.femi);
    eq([v.status, v.body.name, v.body.login], [200, 'Femi', 'femi'], 'right passcode → step 3 (name, sign-in name)');
    eq(inserts, [], 'verify alone creates nothing');
    for (let i = 0; i < 6; i++) {
      const w = await complete('femi', PASS.femi, 'short');
      ok(w.status === 400 && /at least 8/.test(w.body.error), `weak password refused (${i + 1})`);
    }
    eq((await complete('femi', PASS.femi, 'x'.repeat(129))).status, 400, 'over-long password refused');
    eq((await complete('femi', 'wrong-code', 'Femi-own-pass-1')).body.error, S.SELF_SETUP_ERROR, 'complete re-checks the passcode');
    eq(inserts, [], 'still nothing created');

    // 2f. Success: user, desk-admin link, session, redirect.
    const done = await complete('femi', PASS.femi, 'Femi-own-pass-1');
    eq([done.status, done.body.login, done.body.redirect], [201, 'femi', '/desk'], 'complete → 201, sign-in name femi, /desk');
    const femi = [...users.values()].find((u) => u.email === 'femi@login.quantedge.invalid');
    ok(femi && femi.firstName === 'Femi' && femi.subscriptionTier === TA.TRADER_ACCOUNT_DEFAULT_TIER && femi.hasBetaAccess === true, 'user: username login = slug, display name, default trader tier + beta');
    ok(await verifyPassword('Femi-own-pass-1', femi.passwordHash) && femi.passwordHash.startsWith('$2'), 'their own password stored as bcrypt and verifies (normal sign-in)');
    ok(!(await verifyPassword(PASS.femi, femi.passwordHash)), 'the book passcode is NOT their password');
    eq(books.find((b) => b.slug === 'femi')!.linkedUserId, femi.id, 'linked to the Femi book as desk admin');
    eq([sessionsMade.at(-1), lastSessionUser], [femi.id, femi.id], 'a fresh (regenerated) session is established for the new account');
    eq(TA.resolveLoginIdentifier('Femi'), femi.email, "the sign-in field takes the trader's name → their username");

    // 2g. One-time.
    ok(!(await names()).names.some((x: any) => x.slug === 'femi'), 'femi is no longer offered');
    eq((await verify('femi', PASS.femi)).body.error, S.SELF_SETUP_ERROR, 'femi + right passcode → refused now');
    eq((await complete('femi', PASS.femi, 'Hijack-pass-123')).status, 403, 'a second setup for femi is refused');
    ok(await verifyPassword('Femi-own-pass-1', users.get(femi.id).passwordHash), 'and did not touch the password');
    eq(inserts.filter((e) => e.startsWith('femi@')).length, 1, 'exactly one femi account');

    // 2h. Race: concurrent completes for one name → exactly one account.
    const race = await Promise.all([1, 2, 3].map((i) => complete('tommi', PASS.tommi, `Race-pass-${i}-xx`)));
    eq(race.filter((r) => r.status === 201).length, 1, 'three concurrent setups for Tommi → exactly one succeeds');
    eq(inserts.filter((e) => e.startsWith('tommi@')).length, 1, 'one Tommi account');

    // 2i. Admin switches.
    eq((await call('GET', '/api/admin/ops/trader-self-setup')).status, 401, 'state needs the admin hub cookie');
    eq((await call('PUT', '/api/admin/ops/trader-self-setup', { body: { enabled: false } })).status, 401, 'switch needs the admin hub cookie');
    ok(cfg.enabled, 'unchanged by the refused call');
    const st = await call('GET', '/api/admin/ops/trader-self-setup', { admin: true });
    const row = (slug: string) => st.body.books.find((b: any) => b.slug === slug);
    eq([row('kay').offered, row('femi').block, row('malik').block, row('ayo').block, row('bean').block], [true, 'linked', 'excluded', 'no_passcode', 'username_taken'], 'admin state explains every book');
    ok(!JSON.stringify(st.body).includes('$2'), 'admin state carries no passcode hash');
    const off1 = await call('PUT', '/api/admin/ops/trader-self-setup', { admin: true, body: { slug: 'kay', open: false } });
    ok(off1.status === 200 && cfg.closedBooks.includes('kay'), 'per-book off');
    ok(!(await names()).names.some((x: any) => x.slug === 'kay'), 'a closed book is not offered');
    eq((await verify('kay', PASS.kay)).body.error, S.SELF_SETUP_ERROR, 'a closed book + right passcode → generic refusal');
    await call('PUT', '/api/admin/ops/trader-self-setup', { admin: true, body: { slug: 'kay', open: true } });
    eq((await call('PUT', '/api/admin/ops/trader-self-setup', { admin: true, body: { slug: 'nope', open: false } })).status, 404, 'unknown book → 404');
    eq((await call('PUT', '/api/admin/ops/trader-self-setup', { admin: true, body: { enabled: 'no' } })).status, 400, 'bad body → 400');
    await call('PUT', '/api/admin/ops/trader-self-setup', { admin: true, body: { enabled: false } });
    eq(await names(), { open: false, names: [] }, 'global off → nothing listed');
    const offV = await verify('kay', PASS.kay);
    eq([offV.status, offV.body.error], [403, S.SELF_SETUP_OFF_ERROR], 'global off → verify refused');
    eq((await complete('kay', PASS.kay, 'Kay-own-pass-1')).status, 403, 'global off → complete refused');
    await call('PUT', '/api/admin/ops/trader-self-setup', { admin: true, body: { enabled: true } });
    envOn = false;
    eq((await names()).open, false, 'env TRADER_SELF_SETUP=off closes it even with the hub switch on');
    eq((await call('GET', '/api/admin/ops/trader-self-setup', { admin: true })).body.envOn, false, 'the hub shows the env is off');
    envOn = true;
    eq(inserts.filter((e) => e.startsWith('kay@')).length, 0, 'no Kay account while closed');

    // 2j. Limiters: in front of every public route; the real per-IP ones trip.
    blockAll = true;
    eq((await call('GET', '/api/auth/trader-setup/names')).status, 429, 'limiter runs before names');
    eq((await verify('kay', PASS.kay)).status, 429, 'limiter runs before verify');
    eq((await complete('kay', PASS.kay, 'Kay-own-pass-1')).status, 429, 'limiter runs before complete');
    blockAll = false;
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await call('POST', '/api/auth/trader-setup/verify', { body: { slug: `ip${i}`, passcode: 'x' }, on: base2 })).status);
    eq([codes.slice(0, 10).every((c) => c === 403), codes[10]], [true, 429], 'the real per-IP limiter: 10 attempts per 15 min, then 429 (across names)');

    // 2k. Audit.
    const auditText = readFileSync(process.env.ADMIN_AUDIT_FILE!, 'utf8');
    const audit = auditText.trim().split('\n').map((l) => JSON.parse(l));
    const acts = audit.map((a) => a.action);
    for (const a of ['trader_self_setup.fail', 'trader_self_setup.lockout', 'trader_self_setup.complete', 'trader_self_setup.config', 'desk.assign']) ok(acts.includes(a), `audited: ${a}`);
    const comp = audit.find((a) => a.action === 'trader_self_setup.complete');
    ok(comp.actor === `user:${femi.id}` && comp.detail.traderSlug === 'femi', 'complete audit names the account and book');
    ok(audit.find((a) => a.action === 'desk.assign').detail.via === 'trader_self_setup', 'desk.assign says it came from self-setup');

    // 2l. No plaintext passcode / password at rest or in output.
    const atRest = JSON.stringify({ users: [...users.values()], books, cfg }) + auditText;
    const out = printed.join('');
    const secrets = [...Object.values(PASS), 'Femi-own-pass-1', 'Race-pass-1-xx', 'Race-pass-2-xx', 'Race-pass-3-xx', 'not-the-code', 'guess-1', 'Hijack-pass-123'];
    for (const s of secrets) {
      ok(!atRest.includes(s), `"${s.slice(0, 3)}…" is not in the DB or the audit file`);
      ok(!out.includes(s), `"${s.slice(0, 3)}…" was never printed / logged`);
    }
  } finally {
    server.close(); server2.close();
  }

  // ── 3. Wiring (source) ────────────────────────────────────────────────────
  const routes = src('server/routes.ts');
  ok(/registerTraderSelfSetupRoutes\(app, requireAdminJWT, \{ names: traderSelfSetupNamesLimiters, attempt: traderSelfSetupLimiters \}\)/.test(routes), 'routes wired with the admin JWT and the per-IP limiters');
  const ta = src('server/trader-accounts-routes.ts');
  const adminCreate = ta.slice(ta.indexOf("app.post('/api/admin/ops/trader-accounts', requireAdmin"), ta.indexOf("app.post('/api/admin/ops/trader-accounts/:id/regenerate'"));
  ok(/provisionTraderAccount\(d,/.test(adminCreate), 'the admin "Add trader account" uses provisionTraderAccount');
  const ssr = src('server/trader-self-setup-routes.ts');
  ok(/provisionTraderAccount\(d,/.test(ssr) && /deskAdmin: true/.test(ssr), 'self-setup uses the same provisionTraderAccount, as desk admin');
  ok(/limiters\.attempt, csrf,/.test(ssr) && (ssr.match(/limiters\.attempt, csrf,/g) ?? []).length === 2, 'both public writes run limiter → CSRF before the handler');
  ok(!/logger\.(info|warn|error|debug)\([^)]*(passcode|password)\b/i.test(ssr), 'no logger call in the routes takes a passcode or password');
  const csrf = src('server/csrf.ts');
  ok(/req\.path\.startsWith\('\/api\/auth\/'\)/.test(csrf), '(why the routes check CSRF themselves: /api/auth/* is exempt globally)');
  const login = src('client/src/pages/login.tsx');
  ok(/href="\/trader-setup"/.test(login) && /Trader\? Set up your account/.test(login), 'sign-in page links to /trader-setup');
  const app3 = src('client/src/App.tsx');
  ok(/<Route path="\/trader-setup" component=\{TraderSetup\} \/>/.test(app3) && /publicPages = \[[^\]]*'\/trader-setup'/.test(app3), '/trader-setup is routed as a public page');

  console.log(`\n✓ trader self-setup: ${checks} checks passed`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
