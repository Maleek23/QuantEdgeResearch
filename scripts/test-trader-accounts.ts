/**
 * Trader accounts (docs/DESK_ADMINS.md §Trader accounts) — security tests.
 *   npx tsx scripts/test-trader-accounts.ts      (npm run test:trader-accounts)
 *
 * No database. The real routes run in a throwaway Express app with the real
 * requireAdminJWT, the real establishSession, the real verifyPassword
 * (server/userAuth.ts) and the real per-IP limiters; storage is an in-memory
 * fake, so every secret can be searched for in "the database", the audit file
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

// Capture everything the process prints from here on (logger → console/stdout).
const printed: string[] = [];
const tap = (stream: NodeJS.WriteStream) => {
  const orig = stream.write.bind(stream);
  (stream as any).write = (chunk: unknown, ...rest: unknown[]) => { printed.push(String(chunk)); return (orig as any)(chunk, ...rest); };
};
tap(process.stdout); tap(process.stderr);

async function main() {
  process.env.JWT_SECRET = 'test-trader-accounts-secret';
  process.env.ADMIN_EMAIL = 'malik@x.io';
  process.env.DATABASE_URL ||= 'postgres://nobody@127.0.0.1:1/none'; // userAuth imports db; the pool never connects here
  process.env.APP_URL = 'https://quantedge.test';
  const dir = mkdtempSync(path.join(tmpdir(), 'qe-trader-acct-'));
  process.env.ADMIN_AUDIT_FILE = path.join(dir, 'actions.jsonl');

  const T = await import('../server/trader-accounts');
  const S = await import('../shared/trader-accounts');
  const { validatePassword } = await import('../shared/password-policy');
  const { verifyPassword } = await import('../server/userAuth');

  // ── 1. Setup tokens: random, hashed, shape-checked ────────────────────────
  const toks = new Set(Array.from({ length: 2000 }, () => T.generateSetupToken()));
  eq(toks.size, 2000, '2000 setup tokens, no repeats');
  const tok = [...toks][0];
  ok(/^[A-Za-z0-9_-]{43}$/.test(tok), 'token = 32 random bytes, base64url (43 chars)');
  const h = T.hashSetupToken(tok);
  ok(/^setup:[0-9a-f]{64}$/.test(h) && h === T.hashSetupToken(tok) && !h.includes(tok), 'stored form is setup:+sha256 (deterministic, never contains the token)');
  ok(T.hashSetupToken(tok) !== T.hashSetupToken([...toks][1]), 'different tokens → different hashes');
  ok(T.looksLikeSetupToken(tok) && !T.looksLikeSetupToken(h) && !T.looksLikeSetupToken('a'.repeat(64)) && !T.looksLikeSetupToken(`${tok}x`) && !T.looksLikeSetupToken(null) && !T.looksLikeSetupToken('../../etc/passwd'),
    'shape check refuses the stored hash, a reset-token hex, junk and non-strings');
  ok(T.setupLink('https://q.io/', tok) === `https://q.io/setup#token=${tok}`, 'link carries the token in the fragment (not sent to the server / Referer)');
  eq(T.setupLinkExpiry(1_000).getTime(), 1_000 + 48 * 3_600_000, 'link expires after 48 h');
  eq(S.readSetupTokenFromLocation({ hash: `#token=${tok}` }), tok, '/setup reads #token=');
  eq(S.readSetupTokenFromLocation({ search: `?token=${tok}` }), tok, '/setup also reads ?token=');
  eq(S.readSetupTokenFromLocation({ hash: '#token=short' }), null, '/setup refuses a malformed token client-side');
  let short = false; try { T.generateSetupToken(() => Buffer.alloc(8)); } catch { short = true; }
  ok(short, 'a short random read throws instead of issuing a weak token');

  // ── 2. Temporary passwords ────────────────────────────────────────────────
  const temps = Array.from({ length: 500 }, () => T.generateTempPassword());
  eq(new Set(temps).size, 500, '500 temp passwords, no repeats');
  ok(temps.every((p) => /^[a-zA-Z2-9]{5}(-[a-zA-Z2-9]{5}){3}$/.test(p) && !/[01oOlIi]/.test(p.replace(/-/g, ''))), 'xxxxx-xxxxx-xxxxx-xxxxx, no ambiguous characters');
  ok(temps.every((p) => validatePassword(p) === null), 'every temp password passes the password policy');
  ok(20 * Math.log2(55) > 112, 'temp password entropy > 112 bits');

  // ── 3. users.password_hash states + the real verifyPassword ───────────────
  const realHash = await bcrypt.hash('Correct-Horse-9', 4);
  const pend = T.pendingPasswordHash();
  eq([T.passwordState(null), T.passwordState(pend), T.passwordState(T.markMustChange(realHash)), T.passwordState(realHash)], ['none', 'pending', 'must_change', 'set'], 'four hash states');
  ok(!(await verifyPassword('anything', pend)) && !(await verifyPassword('', pend)), 'a pending account verifies against nothing');
  ok(!(await verifyPassword(pend, pend)), 'not even the pending marker itself');
  ok(await verifyPassword('Correct-Horse-9', T.markMustChange(realHash)), 'a temp password verifies (login then demands a change)');
  ok(!(await verifyPassword('wrong', T.markMustChange(realHash))), 'a wrong temp password fails');
  ok(!(await verifyPassword(T.markMustChange(realHash), T.markMustChange(realHash))), 'the stored marker is not a password');
  ok(await verifyPassword('Correct-Horse-9', realHash) && !(await verifyPassword('x', null)), 'normal bcrypt hashes unchanged; null never verifies');
  let notBcrypt = false; try { T.markMustChange('plaintext'); } catch { notBcrypt = true; }
  ok(notBcrypt, 'markMustChange refuses anything but a bcrypt hash');

  // ── 4. Username login ─────────────────────────────────────────────────────
  eq(S.resolveLoginIdentifier('Femi '), 'femi@login.quantedge.invalid', 'username (any case, trimmed) → its synthetic address');
  eq(S.resolveLoginIdentifier(' A@B.io'), 'a@b.io', 'an email keeps the old lower-case/trim behaviour');
  eq([S.resolveLoginIdentifier('admin'), S.resolveLoginIdentifier('f'), S.resolveLoginIdentifier('fe mi'), S.resolveLoginIdentifier(''), S.resolveLoginIdentifier(42), S.resolveLoginIdentifier('9lives'), S.resolveLoginIdentifier('x'.repeat(300))],
    [null, null, null, null, null, null, null], 'reserved, too short, spaces, empty, non-string, digit-first, overlong → no lookup');
  eq(S.usernameOfLoginEmail('femi@login.quantedge.invalid'), 'femi', 'synthetic address → username');
  eq(S.usernameOfLoginEmail('femi@gmail.com'), null, 'a real email has no username');
  ok(S.isReservedLoginEmail('X@LOGIN.QUANTEDGE.INVALID') && !S.isReservedLoginEmail('x@quantedge.io'), 'reserved-domain check is case-insensitive and exact');
  eq([S.usernameFromDisplayName('Femi Ade'), S.usernameFromDisplayName('  Uzo'), S.usernameFromDisplayName("O'Bean"), S.usernameFromDisplayName('42')], ['femi', 'uzo', 'obean', null], 'username prefill from the display name');

  // ── 5. Create-form validation ─────────────────────────────────────────────
  const P = T.parseCreateTraderAccountInput;
  const good = P({ displayName: 'Femi', traderSlug: 'femi' });
  ok(good.ok && good.value.username === 'femi' && good.value.loginEmail === 'femi@login.quantedge.invalid' && good.value.tier === 'free' && good.value.deskAdmin && good.value.method === 'link',
    'defaults: username from the name, free tier, desk admin, setup link');
  const withEmail = P({ displayName: 'Uzo', traderSlug: 'uzo', email: ' Uzo@X.io ', username: 'ignored', method: 'temp', tier: 'pro', deskAdmin: false });
  ok(withEmail.ok && withEmail.value.loginEmail === 'uzo@x.io' && withEmail.value.username === null && withEmail.value.method === 'temp' && !withEmail.value.deskAdmin, 'an email is the login; username ignored');
  for (const [body, why] of [
    [{ traderSlug: 'femi' }, 'no name'], [{ displayName: '<script>', traderSlug: 'femi' }, 'markup in the name'], [{ displayName: 'x'.repeat(61), traderSlug: 'femi' }, 'name too long'],
    [{ displayName: 'Femi', traderSlug: '../x' }, 'bad slug'], [{ displayName: 'Femi', traderSlug: 'femi', email: 'nope' }, 'bad email'],
    [{ displayName: 'Femi', traderSlug: 'femi', email: 'femi@login.quantedge.invalid' }, 'reserved domain as email'],
    [{ displayName: 'Femi', traderSlug: 'femi', username: 'root' }, 'reserved username'], [{ displayName: 'Femi', traderSlug: 'femi', tier: 'admin' }, 'admin tier'],
    [{ displayName: 'Femi', traderSlug: 'femi', method: 'email' }, 'unknown method'], [{ displayName: 'Femi', traderSlug: 'femi', deskAdmin: 'yes' }, 'non-boolean deskAdmin'],
    [{ displayName: '12', traderSlug: 'femi' }, 'no usable username'],
  ] as [unknown, string][]) ok(!P(body).ok, `create refused: ${why}`);

  // ── 6. Status ─────────────────────────────────────────────────────────────
  const now = Date.parse('2026-10-07T12:00:00Z');
  const row = (o: Partial<{ token: string; used: boolean; expiresAt: number }>) => ({ token: o.token ?? 'setup:abc', used: o.used ?? false, expiresAt: new Date(o.expiresAt ?? now + 3_600_000) });
  eq(T.traderAccountStatus({ passwordHash: pend }, [row({})], now), 'setup_pending', 'pending + live link');
  eq(T.traderAccountStatus({ passwordHash: pend }, [row({ expiresAt: now - 1 })], now), 'setup_expired', 'pending + expired link');
  eq(T.traderAccountStatus({ passwordHash: pend }, [row({ used: true })], now), 'no_credentials', 'pending + revoked link');
  eq(T.traderAccountStatus({ passwordHash: T.markMustChange(realHash) }, [], now), 'temp_password', 'temp password');
  eq(T.traderAccountStatus({ passwordHash: realHash }, [row({})], now), 'active', 'own password = active (even with a reset link out)');
  eq(T.traderAccountStatus({ passwordHash: realHash, subscriptionStatus: 'disabled' }, [], now), 'disabled', 'disabled wins');
  eq(T.liveSetupLink([row({ token: 'setup:inert:aa' })], now), null, 'an inert marker row is never a live link');

  // ── 7. The real routes ────────────────────────────────────────────────────
  const { requireAdminJWT, generateAdminToken } = await import('../server/auth');
  const { establishSession } = await import('../server/auth-hardening');
  const { registerTraderAccountRoutes, SETUP_LINK_ERROR } = await import('../server/trader-accounts-routes');
  const { setupLinkLimiters } = await import('../server/rate-limiter');
  const { isProtectedAdmin } = await import('../server/admin-ops');

  let clock = now;
  const users = new Map<string, any>([
    ['u-malik', { id: 'u-malik', email: 'malik@x.io', passwordHash: realHash, subscriptionTier: 'pro', hasBetaAccess: true }],
    ['u-rando', { id: 'u-rando', email: 'r@x.io', passwordHash: realHash, subscriptionTier: 'free', hasBetaAccess: true }],
    ['u-taken', { id: 'u-taken', email: 'taken@x.io', passwordHash: realHash, subscriptionTier: 'free' }],
  ]);
  const books = [
    { slug: 'leek', name: 'Mine', linkedUserId: 'u-malik' as string | null },
    { slug: 'femi', name: 'Femi', linkedUserId: null as string | null },
    { slug: 'uzo', name: 'Uzo', linkedUserId: null as string | null },
    { slug: 'ayo', name: 'Ayo', linkedUserId: 'u-rando' as string | null },
    { slug: 'bean', name: 'Bean', linkedUserId: null as string | null },
    { slug: 'tommi', name: 'Tommi', linkedUserId: null as string | null },
  ];
  const rows: any[] = [];
  const writes: string[] = [];
  const sessionsDeleted: string[] = [];
  const sessionsMade: string[] = [];
  let n = 0;
  const deps = {
    listTraders: async () => books.map((b) => ({ ...b })),
    getTrader: async (slug: string) => books.find((b) => b.slug === slug) ?? null,
    getUser: async (id: string) => (users.has(id) ? { ...users.get(id) } : null),
    getUserByEmail: async (email: string) => [...users.values()].find((u) => u.email === email) ?? null,
    insertUser: async (r: any) => { const u = { id: `u-new-${++n}`, ...r, subscriptionStatus: 'active', createdAt: new Date(clock) }; users.set(u.id, u); writes.push(`user:${u.email}`); return { ...u }; },
    setPasswordHash: async (id: string, hash: string) => { users.get(id).passwordHash = hash; writes.push(`hash:${id}`); },
    setLinkedUser: async (slug: string, uid: string | null) => { books.find((b) => b.slug === slug)!.linkedUserId = uid; writes.push(`link:${slug}:${uid}`); },
    isProtectedAdmin: (u: any) => isProtectedAdmin(u),
    listSetupRows: async (uid?: string) => rows.filter((r) => r.token.startsWith('setup:') && (!uid || r.userId === uid)).map((r) => ({ ...r })),
    insertSetupRow: async (userId: string, email: string, token: string, expiresAt: Date, used = false) => { rows.push({ id: `r${rows.length + 1}`, userId, email, token, expiresAt, used, createdAt: new Date(clock) }); writes.push(`row:${userId}`); },
    revokeSetupRows: async (uid: string) => { for (const r of rows) if (r.userId === uid && r.token.startsWith('setup:')) r.used = true; },
    findSetupRow: async (hash: string) => { const r = rows.find((x) => x.token === hash); return r ? { ...r } : null; },
    // Same predicate as the SQL: unused AND unexpired, flipped in one step.
    consumeSetupRow: async (hash: string) => {
      const r = rows.find((x) => x.token === hash && !x.used && new Date(x.expiresAt).getTime() > clock);
      if (!r) return null;
      r.used = true;
      return { ...r };
    },
    hashPassword: (p: string) => bcrypt.hash(p, 4),
    verifyPassword, // the real one
    deleteUserSessions: async (id: string) => { sessionsDeleted.push(id); return 1; },
    establishSession: async (req: any, uid: string) => { await establishSession(req, uid); sessionsMade.push(uid); },
    now: () => clock,
  };

  const app = express();
  app.set('trust proxy', false);
  app.use(cookieParser());
  app.use(express.json());
  // A fake express-session: regenerate swaps req.session, save persists.
  const mkSession = (req: any, data: Record<string, unknown> = {}) => ({
    ...data,
    regenerate(cb: (e?: unknown) => void) { req.session = mkSession(req); cb(); },
    save(cb: (e?: unknown) => void) { cb(); },
  });
  app.use((req: any, _res, next) => { const u = req.headers['x-test-user']; req.session = mkSession(req, u ? { userId: String(u) } : {}); next(); });
  let blockAll = false;
  const testLimiter: express.RequestHandler = (_req, res, next) => (blockAll ? res.status(429).json({ error: 'Too many attempts' }) : next());
  registerTraderAccountRoutes(app, requireAdminJWT, { setup: [testLimiter], login: [testLimiter] }, deps as never);

  // A second app with the REAL per-IP setup limiters.
  const app2 = express();
  app2.use(express.json());
  app2.use((req: any, _res, next) => { req.session = mkSession(req); next(); });
  registerTraderAccountRoutes(app2, requireAdminJWT, { setup: setupLinkLimiters, login: setupLinkLimiters }, deps as never);

  const server = app.listen(0);
  const server2 = app2.listen(0);
  const issued: string[] = []; // every plaintext secret the API handed out
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const base2 = `http://127.0.0.1:${(server2.address() as AddressInfo).port}`;
    const call = async (method: string, route: string, opts: { admin?: boolean; as?: string; body?: unknown; cookie?: string; on?: string } = {}) => {
      const headers: Record<string, string> = {};
      if (opts.admin) headers.Cookie = `admin_token=${generateAdminToken()}`;
      if (opts.cookie) headers.Cookie = opts.cookie;
      if (opts.as) headers['x-test-user'] = opts.as;
      if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
      const r = await fetch((opts.on ?? base) + route, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
      let j: any = null; try { j = await r.json(); } catch { /* empty */ }
      return { status: r.status, body: j, cache: r.headers.get('cache-control') };
    };
    const jwt = (await import('jsonwebtoken')).default;
    const forged = jwt.sign({ isAdmin: true }, 'not-the-secret');

    // 7a. Admin only.
    const ADMIN_ROUTES: [string, string][] = [
      ['GET', '/api/admin/ops/trader-accounts'], ['POST', '/api/admin/ops/trader-accounts'],
      ['POST', '/api/admin/ops/trader-accounts/u-rando/regenerate'], ['POST', '/api/admin/ops/trader-accounts/u-rando/revoke'],
    ];
    for (const [m, r] of ADMIN_ROUTES) {
      const body = m === 'GET' ? undefined : { displayName: 'Evil', traderSlug: 'femi', method: 'temp' };
      eq((await call(m, r, { body })).status, 401, `no admin token → ${m} ${r} 401`);
      eq((await call(m, r, { body, as: 'u-rando' })).status, 401, `a signed-in desk admin / member session → ${m} ${r} 401`);
      eq((await call(m, r, { body, cookie: `admin_token=${forged}` })).status, 403, `forged admin token → ${m} ${r} 403`);
      eq((await call(m, r, { body, as: 'u-malik' })).status, 401, `even Malik's member session needs the admin hub cookie → ${m} ${r}`);
    }
    eq(writes, [], 'no write from any refused admin call');

    // 7b. Create with a setup link (default): username login, desk admin, beta open.
    const c1 = await call('POST', '/api/admin/ops/trader-accounts', { admin: true, body: { displayName: 'Femi', traderSlug: 'femi' } });
    eq(c1.status, 201, 'create → 201');
    ok(c1.cache === 'no-store', 'the one-time response is no-store');
    const link1: string = c1.body.credential.link;
    const tok1 = link1.split('#token=')[1];
    issued.push(tok1);
    ok(link1.startsWith('https://quantedge.test/setup#token=') && T.looksLikeSetupToken(tok1), 'response carries the setup link once');
    const femi = [...users.values()].find((u) => u.email === 'femi@login.quantedge.invalid');
    ok(femi && femi.firstName === 'Femi' && femi.subscriptionTier === 'free' && femi.hasBetaAccess === true, 'user created: name, free tier + beta (everything open)');
    ok(T.passwordState(femi.passwordHash) === 'pending', 'no usable password until setup');
    eq(books.find((b) => b.slug === 'femi')!.linkedUserId, femi.id, 'linked to the Femi book as desk admin');
    const femiRows = rows.filter((r) => r.userId === femi.id);
    ok(femiRows.length === 1 && femiRows[0].token === T.hashSetupToken(tok1) && !JSON.stringify(rows).includes(tok1), 'the DB holds only the hash of the token');
    eq(new Date(femiRows[0].expiresAt).getTime(), clock + 48 * 3_600_000, 'stored expiry = 48 h');
    eq([c1.body.account.status, c1.body.account.login, c1.body.account.username, c1.body.account.email], ['setup_pending', 'femi', 'femi', null], 'account row: setup pending, username login');

    const list1 = await call('GET', '/api/admin/ops/trader-accounts', { admin: true });
    const lf = list1.body.accounts.find((a: any) => a.id === femi.id);
    ok(lf && lf.status === 'setup_pending' && lf.linkExpiresAt === new Date(clock + 48 * 3_600_000).toISOString() && lf.traderSlug === 'femi', 'list: status + link expiry');
    ok(!list1.body.accounts.some((a: any) => a.id === 'u-malik'), 'the platform admin is never listed');
    const listText = JSON.stringify(list1.body);
    ok(!listText.includes(tok1) && !/setup:|\$2[aby]\$|pending\$|mustchange\$/.test(listText), 'the list never returns a token, a token hash or a password hash');
    ok(!('credential' in list1.body) && !/#token=/.test(listText), 'the link is not retrievable after the first response');

    // 7c. Conflicts and refusals.
    eq((await call('POST', '/api/admin/ops/trader-accounts', { admin: true, body: { displayName: 'Femi', traderSlug: 'uzo' } })).status, 409, 'username taken → 409');
    eq((await call('POST', '/api/admin/ops/trader-accounts', { admin: true, body: { displayName: 'Ayo', traderSlug: 'ayo' } })).status, 409, 'book already has a desk admin → 409');
    eq((await call('POST', '/api/admin/ops/trader-accounts', { admin: true, body: { displayName: 'T', traderSlug: 'uzo', email: 'taken@x.io' } })).status, 409, 'email taken → 409');
    eq((await call('POST', '/api/admin/ops/trader-accounts', { admin: true, body: { displayName: 'Nobody', traderSlug: 'nope' } })).status, 404, 'unknown book → 404');
    eq((await call('POST', '/api/admin/ops/trader-accounts/u-malik/regenerate', { admin: true, body: {} })).status, 403, 'regenerate for the platform admin → 403');
    eq((await call('POST', '/api/admin/ops/trader-accounts/u-taken/regenerate', { admin: true, body: {} })).status, 404, 'regenerate for an ordinary member (not a trader account) → 404');
    eq((await call('POST', '/api/admin/ops/trader-accounts/u-taken/revoke', { admin: true })).status, 404, 'revoke for an ordinary member → 404');
    eq((await call('POST', `/api/admin/ops/trader-accounts/${femi.id}/regenerate`, { admin: true, body: { method: 'sms' } })).status, 400, 'unknown method → 400');

    // 7d. The setup link: inspect, weak password, complete, single use.
    const insp = await call('POST', '/api/auth/setup/inspect', { body: { token: tok1 } });
    eq([insp.status, insp.body.displayName, insp.body.login, insp.body.loginIsUsername, insp.body.traderName], [200, 'Femi', 'femi', true, 'Femi'], 'inspect: the trader sees their name and login');
    for (const [t, why] of [[T.hashSetupToken(tok1), 'the stored hash'], [T.generateSetupToken(), 'an unknown token'], ['short', 'a malformed token'], [undefined, 'no token']] as [unknown, string][]) {
      const r = await call('POST', '/api/auth/setup/inspect', { body: { token: t } });
      eq([r.status, r.body.error], [400, SETUP_LINK_ERROR], `inspect with ${why} → the same generic 400`);
    }
    const weak = await call('POST', '/api/auth/setup/complete', { body: { token: tok1, password: 'short' } });
    ok(weak.status === 400 && /at least 8/.test(weak.body.error), 'password policy enforced on setup');
    ok(rows.find((r) => r.token === T.hashSetupToken(tok1)).used === false, 'a refused password does not burn the link');
    const tooLong = await call('POST', '/api/auth/setup/complete', { body: { token: tok1, password: 'x'.repeat(129) } });
    eq(tooLong.status, 400, 'over-long password refused');
    const done = await call('POST', '/api/auth/setup/complete', { body: { token: tok1, password: 'Femi-own-pass-1' } });
    eq([done.status, done.body.redirect], [200, '/desk'], 'setup complete → signed in, sent to /desk');
    ok(sessionsMade.at(-1) === femi.id && sessionsDeleted.includes(femi.id), 'a fresh session for the trader; older sessions ended');
    ok(T.passwordState(users.get(femi.id).passwordHash) === 'set' && await verifyPassword('Femi-own-pass-1', users.get(femi.id).passwordHash), 'their own password is stored (bcrypt) and verifies');
    const again = await call('POST', '/api/auth/setup/complete', { body: { token: tok1, password: 'Another-pass-22' } });
    eq([again.status, again.body.error], [400, SETUP_LINK_ERROR], 'single use: the second use is refused');
    ok(await verifyPassword('Femi-own-pass-1', users.get(femi.id).passwordHash), 'and did not change the password');
    eq((await call('POST', '/api/auth/setup/inspect', { body: { token: tok1 } })).status, 400, 'a used link no longer inspects');
    eq((await call('GET', '/api/admin/ops/trader-accounts', { admin: true })).body.accounts.find((a: any) => a.id === femi.id).status, 'active', 'list: active');

    // 7e. Expiry.
    const c2 = await call('POST', '/api/admin/ops/trader-accounts', { admin: true, body: { displayName: 'Uzo', traderSlug: 'uzo', email: 'uzo@x.io' } });
    const tok2 = c2.body.credential.link.split('#token=')[1]; issued.push(tok2);
    const uzoId = c2.body.account.id;
    eq([c2.body.account.login, c2.body.account.email], ['uzo@x.io', 'uzo@x.io'], 'with an email, the email is the login');
    clock += 48 * 3_600_000 + 1_000;
    eq((await call('POST', '/api/auth/setup/inspect', { body: { token: tok2 } })).status, 400, 'expired link → inspect refused');
    eq((await call('POST', '/api/auth/setup/complete', { body: { token: tok2, password: 'Uzo-own-pass-1' } })).status, 400, 'expired link → complete refused');
    eq((await call('GET', '/api/admin/ops/trader-accounts', { admin: true })).body.accounts.find((a: any) => a.id === uzoId).status, 'setup_expired', 'list: link expired');
    clock -= 1_000; clock -= 48 * 3_600_000; // back inside the window for the next checks

    // 7f. Regenerate kills the old link; revoke kills the new one.
    const r1 = await call('POST', `/api/admin/ops/trader-accounts/${uzoId}/regenerate`, { admin: true, body: { method: 'link' } });
    const tok3 = r1.body.credential.link.split('#token=')[1]; issued.push(tok3);
    ok(r1.status === 200 && tok3 !== tok2, 'regenerate → a new link');
    eq((await call('POST', '/api/auth/setup/inspect', { body: { token: tok2 } })).status, 400, 'the old link died on regenerate (even inside its 48 h)');
    eq((await call('POST', '/api/auth/setup/inspect', { body: { token: tok3 } })).status, 200, 'the new link works');
    eq((await call('POST', `/api/admin/ops/trader-accounts/${uzoId}/revoke`, { admin: true })).status, 200, 'revoke → 200');
    eq((await call('POST', '/api/auth/setup/complete', { body: { token: tok3, password: 'Uzo-own-pass-1' } })).status, 400, 'a revoked link is refused');
    eq((await call('GET', '/api/admin/ops/trader-accounts', { admin: true })).body.accounts.find((a: any) => a.id === uzoId).status, 'no_credentials', 'list: revoked');

    // 7g. Race: two completes on one link → exactly one wins.
    const r2 = await call('POST', `/api/admin/ops/trader-accounts/${uzoId}/regenerate`, { admin: true, body: {} });
    const tok4 = r2.body.credential.link.split('#token=')[1]; issued.push(tok4);
    const race = await Promise.all([1, 2, 3].map((i) => call('POST', '/api/auth/setup/complete', { body: { token: tok4, password: `Race-pass-${i}-xx` } })));
    eq(race.filter((r) => r.status === 200).length, 1, 'concurrent uses of one link: exactly one succeeds');

    // 7h. Disabled account: its link does nothing; regenerate refused.
    const c3 = await call('POST', '/api/admin/ops/trader-accounts', { admin: true, body: { displayName: 'Bean', traderSlug: 'bean' } });
    const tok5 = c3.body.credential.link.split('#token=')[1]; issued.push(tok5);
    users.get(c3.body.account.id).subscriptionStatus = 'disabled';
    eq((await call('POST', '/api/auth/setup/complete', { body: { token: tok5, password: 'Bean-own-pass-1' } })).status, 400, 'a disabled account cannot use its link');
    eq((await call('POST', `/api/admin/ops/trader-accounts/${c3.body.account.id}/regenerate`, { admin: true, body: {} })).status, 400, 'no new credentials for a disabled account');

    // 7i. Temporary password → forced change.
    const c4 = await call('POST', '/api/admin/ops/trader-accounts', { admin: true, body: { displayName: 'Tommi', traderSlug: 'tommi', method: 'temp' } });
    eq(c4.status, 201, 'create with a temp password → 201');
    const temp: string = c4.body.credential.tempPassword; issued.push(temp);
    const tommiId = c4.body.account.id;
    ok(validatePassword(temp) === null && c4.body.credential.login === 'tommi', 'temp password shown once with the login name');
    const th = users.get(tommiId).passwordHash as string;
    ok(th.startsWith('mustchange$$2') && !th.includes(temp), 'stored as mustchange$ + bcrypt only');
    eq(c4.body.account.status, 'temp_password', 'status: temp password');
    ok(!JSON.stringify(rows).includes(temp), 'no setup row holds the temp password');
    eq((await call('POST', '/api/auth/first-login', { body: { login: 'tommi', password: 'wrong-wrong-1', newPassword: 'Tommi-own-pass-1' } })).status, 401, 'wrong temp password → 401');
    eq((await call('POST', '/api/auth/first-login', { body: { login: 'nobody', password: temp, newPassword: 'Tommi-own-pass-1' } })).status, 401, 'unknown login → the same 401');
    eq((await call('POST', '/api/auth/first-login', { body: { login: 'femi', password: 'Femi-own-pass-1', newPassword: 'Femi-new-pass-2' } })).status, 401, 'an account with no temp password cannot use first-login');
    const weak2 = await call('POST', '/api/auth/first-login', { body: { login: 'tommi', password: temp, newPassword: 'short' } });
    ok(weak2.status === 400 && /at least 8/.test(weak2.body.error), 'new password must meet the policy');
    eq((await call('POST', '/api/auth/first-login', { body: { login: 'tommi', password: temp, newPassword: temp } })).status, 400, 'the temp password cannot be kept');
    ok(T.passwordState(users.get(tommiId).passwordHash) === 'must_change', 'still must-change after refusals');
    const fl = await call('POST', '/api/auth/first-login', { body: { login: 'TOMMI ', password: temp, newPassword: 'Tommi-own-pass-1' } });
    eq([fl.status, fl.body.redirect], [200, '/desk'], 'temp password + new password (username, any case) → signed in to /desk');
    ok(sessionsMade.at(-1) === tommiId, 'session established only after the change');
    ok(T.passwordState(users.get(tommiId).passwordHash) === 'set' && !(await verifyPassword(temp, users.get(tommiId).passwordHash)), 'the temp password no longer works');
    eq((await call('POST', '/api/auth/first-login', { body: { login: 'tommi', password: temp, newPassword: 'Tommi-own-pass-2' } })).status, 401, 'first-login cannot be replayed');

    // Temp regenerate on an active account replaces the password and signs out; a link regenerate kills a pending temp.
    const before = sessionsDeleted.length;
    const r3 = await call('POST', `/api/admin/ops/trader-accounts/${tommiId}/regenerate`, { admin: true, body: { method: 'temp' } });
    issued.push(r3.body.credential.tempPassword);
    ok(r3.status === 200 && sessionsDeleted.length === before + 1, 'a new temp password signs the account out everywhere');
    ok(!(await verifyPassword('Tommi-own-pass-1', users.get(tommiId).passwordHash)), 'and replaces the old password');
    const r4 = await call('POST', `/api/admin/ops/trader-accounts/${tommiId}/regenerate`, { admin: true, body: { method: 'link' } });
    issued.push(r4.body.credential.link.split('#token=')[1]);
    ok(!(await verifyPassword(r3.body.credential.tempPassword, users.get(tommiId).passwordHash)), 'issuing a link kills an outstanding temp password');
    const r5 = await call('POST', `/api/admin/ops/trader-accounts/${tommiId}/regenerate`, { admin: true, body: { method: 'temp' } });
    issued.push(r5.body.credential.tempPassword);
    await call('POST', `/api/admin/ops/trader-accounts/${tommiId}/revoke`, { admin: true });
    ok(!(await verifyPassword(r5.body.credential.tempPassword, users.get(tommiId).passwordHash)), 'revoke kills a temp password');

    // 7j. Rate limits: injected limiter is in front of every public route; the real one trips.
    blockAll = true;
    for (const r of ['/api/auth/setup/inspect', '/api/auth/setup/complete', '/api/auth/first-login']) eq((await call('POST', r, { body: {} })).status, 429, `limiter runs before ${r}`);
    blockAll = false;
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await call('POST', '/api/auth/setup/inspect', { body: { token: 'bad' }, on: base2 })).status);
    eq([codes.slice(0, 10).every((c) => c === 400), codes[10]], [true, 429], 'the real per-IP setup limiter: 10 per 15 min, then 429');

    // 7k. Audit: every action, last 4 only.
    const audit = readFileSync(process.env.ADMIN_AUDIT_FILE!, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const acts = audit.map((a) => a.action);
    for (const a of ['trader_account.create', 'trader_account.regenerate', 'trader_account.revoke', 'trader_account.setup_complete', 'trader_account.password_changed', 'desk.assign']) ok(acts.includes(a), `audited: ${a}`);
    const created = audit.find((a) => a.action === 'trader_account.create');
    eq(created.detail.codeTail, `…${tok1.slice(-4)}`, 'the audit keeps only the last 4 characters');
    ok(created.actor === 'admin-hub' && created.detail.role === 'super', 'actor = the admin hub');

    // 7l. No plaintext anywhere at rest or in output.
    const atRest = JSON.stringify({ users: [...users.values()], rows }) + readFileSync(process.env.ADMIN_AUDIT_FILE!, 'utf8');
    const out = printed.join('');
    ok(issued.length >= 9, `${issued.length} secrets issued during the run`);
    for (const s of issued) {
      ok(!atRest.includes(s), `secret …${s.slice(-4)} is not in the DB or the audit file`);
      ok(!out.includes(s), `secret …${s.slice(-4)} was never printed / logged`);
    }
    for (const p of ['Femi-own-pass-1', 'Tommi-own-pass-1']) ok(!atRest.includes(p) && !out.includes(p), 'own passwords are never stored or logged in plaintext');
  } finally {
    server.close(); server2.close();
  }

  // ── 8. Wiring in routes.ts / client (source) ──────────────────────────────
  const routes = src('server/routes.ts');
  const login = routes.slice(routes.indexOf('app.post("/api/auth/login"'), routes.indexOf('app.post("/api/auth/logout"'));
  ok(/resolveLoginIdentifier\(email\)/.test(login), 'login accepts username or email through resolveLoginIdentifier');
  ok(/authLimiter/.test(login.split('\n')[0]), 'login keeps its brute-force limiter');
  ok(login.indexOf('mustChangePassword') > 0 && login.indexOf('mustChangePassword') < login.indexOf('establishSession'), 'a temp password is answered BEFORE any session is created');
  ok(/Invalid email\/username or password/.test(login), 'one generic login error');
  const reset = routes.slice(routes.indexOf('app.post("/api/auth/reset-password"'), routes.indexOf('// ========== BETA WAITLIST'));
  ok(/token\.startsWith\(SETUP_TOKEN_PREFIX\)/.test(reset) && reset.indexOf('SETUP_TOKEN_PREFIX') < reset.indexOf('getPasswordResetToken'), 'reset-password refuses setup-row values before the lookup');
  const signup = routes.slice(routes.indexOf('app.post("/api/auth/signup"'), routes.indexOf('app.post("/api/auth/login"'));
  ok(/isReservedLoginEmail\(emailLower\)/.test(signup), 'public sign-up cannot squat a username address');
  ok(/registerTraderAccountRoutes\(app, requireAdminJWT, \{ setup: setupLinkLimiters, login: \[authLimiter, \.\.\.setupLinkLimiters\] \}\)/.test(routes), 'routes wired with the admin JWT and the limiters');
  const ua = src('server/userAuth.ts');
  ok(/verifiableHashOf\(hash\)/.test(ua) && /timingDummy/.test(ua), 'userAuth verifies only real bcrypt parts and spends a bcrypt on unknown accounts');
  const rts = src('server/trader-accounts-routes.ts');
  ok(!/logger\.(info|warn|error|debug)\([^)]*(token|tempPassword|secret|password)\b/i.test(rts.replace(/\[TRADER-ACCOUNTS\] \$\{context\} failed/g, '')), 'no logger call in the routes takes a token or password');
  ok(!/NODE_ENV|isDevBypass/.test(rts), 'no dev bypass in trader-account routes');
  const panel = src('client/src/components/admin/trader-accounts-panel.tsx');
  ok(!/localStorage|sessionStorage|console\.log/.test(panel), 'the admin UI never persists or logs the one-time secret');
  const setupPage = src('client/src/pages/setup-account.tsx');
  ok(/history\.replaceState/.test(setupPage) && !/localStorage|sessionStorage|console\.log/.test(setupPage), '/setup strips the token from the address bar and never stores it');

  console.log(`test-trader-accounts: ${checks} checks passed`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
