/**
 * Auth / sign-up hardening (homepage audit 2026-09-30, docs/HOME_AUDIT_2026-09-30.md
 * §Server findings 1–5, 7).
 *   npx tsx scripts/test-auth-hardening.ts
 *
 * No database: helpers are exercised directly, the limiters and session
 * regeneration through a throwaway Express app on an ephemeral port, and the
 * route wiring by reading the route source.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import express from 'express';
import session from 'express-session';
import {
  safeSecretEqual,
  establishSession,
  InviteAttemptTracker,
  normalizeInviteCode,
  normalizeEmail,
  parseWaitlistInput,
  googleNewUserTier,
  GENERIC_INVITE_ERROR,
} from '../server/auth-hardening';
import { makeStrictIpLimiter, signupLimiters, waitlistLimiters } from '../server/rate-limiter';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  validatePassword,
} from '../shared/password-policy';
import { betaOnboardingSchema } from '../shared/schema';

let checks = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); checks++; };
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); checks++; };

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const routes = src('server/routes.ts');
const google = src('server/googleAuth.ts');

/** Body of one route handler: from its registration to the next app.<verb>( */
function handler(path: string): string {
  const start = routes.indexOf(`"${path}"`);
  assert.ok(start > 0, `route ${path} not found`);
  const next = routes.slice(start + path.length).search(/\n  app\.(get|post|put|patch|delete)\(/);
  return routes.slice(start - 20, start + path.length + (next < 0 ? 4000 : next));
}

async function withServer(app: express.Express, fn: (base: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', () => r()));
  const { port } = server.address() as AddressInfo;
  try { await fn(`http://127.0.0.1:${port}`); } finally { server.close(); }
}

async function main() {
  // ── 4. One password rule ────────────────────────────────────────────────
  eq(PASSWORD_MIN_LENGTH, 8, 'password minimum is 8');
  ok(validatePassword('1234567') !== null, '7 characters rejected');
  eq(validatePassword('12345678'), null, '8 characters accepted');
  ok(validatePassword('x'.repeat(PASSWORD_MAX_LENGTH + 1)) !== null, 'over max rejected');
  ok(validatePassword(undefined) !== null && validatePassword(12345678) !== null, 'non-strings rejected');
  ok(!betaOnboardingSchema.safeParse({
    occupation: 'x', tradingExperienceLevel: 'beginner', knowledgeFocus: ['a'], investmentGoals: 'growth',
    riskTolerance: 'moderate', referralSource: 'x', password: '1234567', confirmPassword: '1234567',
  }).success, 'shared onboarding schema uses the same minimum');
  for (const route of ['/api/auth/signup', '/api/auth/reset-password', '/api/beta/onboard']) {
    ok(/validatePassword\(password\)/.test(handler(route)), `${route} uses the shared validator`);
  }
  ok(!/password\.length < [0-9]/.test(routes), 'no ad-hoc password length checks left in routes.ts');
  for (const page of ['client/src/pages/signup.tsx', 'client/src/pages/join-beta.tsx', 'client/src/pages/reset-password.tsx']) {
    const s = src(page);
    ok(s.includes('@shared/password-policy'), `${page} reads the shared password constant`);
    ok(!/MIN_PASSWORD = 6|min\((6|8)[,)]|minLength=\{6\}|length < 6/.test(s), `${page} has no hard-coded password minimum`);
  }

  // ── 5. Admin code: never an invite, compared in constant time ───────────
  ok(safeSecretEqual('s3cret-code', 's3cret-code'), 'equal secrets match');
  ok(!safeSecretEqual('s3cret-codf', 's3cret-code'), 'different secrets do not match');
  ok(!safeSecretEqual('short', 's3cret-code'), 'different lengths do not throw and do not match');
  ok(!safeSecretEqual(undefined, 's3cret-code') && !safeSecretEqual('x', undefined), 'missing side never matches');
  ok(!safeSecretEqual({ toString: () => 'x' }, 'x') && !safeSecretEqual('', ''), 'non-string / empty never matches');
  const signup = handler('/api/auth/signup');
  ok(!signup.includes('ADMIN_ACCESS_CODE') && !/usingAdminCode/.test(signup), 'signup does not accept the admin code');
  ok(!handler('/api/beta/redeem').includes('ADMIN_ACCESS_CODE'), 'beta/redeem does not accept the admin code');
  ok(!/[!=]==\s*adminCode|adminCode\s*[!=]==|[!=]==\s*adminPassword|adminPassword\s*[!=]==/.test(routes),
    'no plain ===/!== against the admin code or password in routes.ts');
  ok(/safeSecretEqual\(accessCode, adminCode\)/.test(handler('/api/auth/dev-login')), 'dev-login compares in constant time');
  ok(/safeSecretEqual\(req\.body\?\.code, adminCode\)/.test(handler('/api/admin/verify-code')), 'admin verify-code compares in constant time');
  ok(/safeSecretEqual\(req\.body\?\.password, adminPassword\)/.test(handler('/api/admin/login')), 'admin login compares in constant time');
  ok(/safeSecretEqual\(providedPassword, adminPassword\)/.test(src('server/auth.ts')), 'legacy requireAdmin compares in constant time');

  // ── 1. Sign-up: limiter, per-code budget, generic errors ────────────────
  ok(/"\/api\/auth\/signup", \.\.\.signupLimiters,/.test(routes), 'signup has the per-IP limiters');
  ok(/"\/api\/auth\/login", authLimiter,/.test(routes), 'login keeps authLimiter');
  ok(/"\/api\/auth\/dev-login", authLimiter,/.test(routes), 'dev-login keeps authLimiter');
  ok(/signupInviteAttempts\.attempt\(/.test(signup), 'signup counts attempts per invite code');
  ok(!/already been used|has been revoked|has expired/.test(signup), 'signup never says which state a code is in');
  eq((signup.match(/GENERIC_INVITE_ERROR/g) || []).length >= 2, true, 'every code failure returns the generic error');
  ok(!/it exists|already used|revoked|expired/i.test(GENERIC_INVITE_ERROR), 'the generic error reveals nothing');

  eq(normalizeInviteCode('  AbC-123  '), 'abc-123', 'codes are trimmed and lower-cased');
  eq(normalizeInviteCode('abc'), null, 'too short rejected');
  eq(normalizeInviteCode('a'.repeat(65)), null, 'too long rejected');
  eq(normalizeInviteCode("abcd' or 1=1"), null, 'odd characters rejected');
  eq(normalizeInviteCode(42), null, 'non-string rejected');

  let now = 0;
  const tracker = new InviteAttemptTracker(3, 1000, 4, () => now);
  ok(tracker.attempt('code-a') && tracker.attempt('code-a') && tracker.attempt('code-a'), 'first 3 attempts allowed');
  ok(!tracker.attempt('code-a'), '4th attempt on the same code refused');
  ok(tracker.attempt('code-b'), 'another code has its own budget');
  now = 1000;
  ok(tracker.attempt('code-a'), 'budget resets after the window');
  for (let i = 0; i < 50; i++) tracker.attempt(`flood-${i}`);
  ok(tracker.size() <= 4, 'tracker memory is bounded');

  // Per-IP limiters, end to end (5 per window, then 429).
  eq(signupLimiters.length, 2, 'signup has a 15-minute and a daily limiter');
  eq(waitlistLimiters.length, 2, 'waitlist has a 15-minute and a daily limiter');
  {
    const app = express();
    app.post('/signup', ...signupLimiters, (_req, res) => { res.status(403).json({ error: GENERIC_INVITE_ERROR }); });
    app.post('/waitlist', ...waitlistLimiters, (_req, res) => { res.json({ success: true }); });
    const tiny = makeStrictIpLimiter({ name: 'test', windowMs: 60_000, max: 2, message: 'slow down' });
    app.post('/tiny', tiny, (_req, res) => { res.json({ ok: true }); });
    await withServer(app, async (base) => {
      const statuses = async (path: string, n: number) => {
        const out: number[] = [];
        for (let i = 0; i < n; i++) out.push((await fetch(base + path, { method: 'POST' })).status);
        return out;
      };
      eq(await statuses('/signup', 6), [403, 403, 403, 403, 403, 429], 'signup: 5 attempts per 15 min per IP, failed ones count');
      eq(await statuses('/waitlist', 6), [200, 200, 200, 200, 200, 429], 'waitlist: 5 per 15 min per IP, successful ones count');
      const r = await fetch(base + '/tiny', { method: 'POST' }); await fetch(base + '/tiny', { method: 'POST' });
      const limited = await fetch(base + '/tiny', { method: 'POST' });
      eq(r.status, 200, 'limiter passes under budget');
      eq(limited.status, 429, 'limiter blocks over budget');
      const body = await limited.json() as { error: string; message: string; retryAfter: number };
      eq([body.error, body.message, body.retryAfter], ['Too many attempts', 'slow down', 60], '429 body is generic JSON');
    });
  }

  // ── 2. Waitlist input ───────────────────────────────────────────────────
  ok(/"\/api\/waitlist\/join", \.\.\.waitlistLimiters,/.test(routes), 'waitlist has the per-IP limiters');
  ok(/parseWaitlistInput\(req\.body\)/.test(handler('/api/waitlist/join')), 'waitlist validates its body');
  ok(/23505/.test(handler('/api/waitlist/join')), 'concurrent duplicate email answered as a duplicate');
  const good = parseWaitlistInput({ email: '  Me@Example.COM ', source: 'signup' });
  eq(good, { ok: true, value: { email: 'me@example.com', source: 'signup', referralCode: null } }, 'email normalised for dedupe');
  eq(parseWaitlistInput({ email: 'a@b.co' }), { ok: true, value: { email: 'a@b.co', source: 'landing', referralCode: null } }, 'default source');
  eq(parseWaitlistInput({}).ok, false, 'missing email rejected');
  eq(parseWaitlistInput({ email: `${'a'.repeat(250)}@b.co` }).ok, false, 'over-long email rejected');
  eq(parseWaitlistInput({ email: 'not-an-email' }).ok, false, 'malformed email rejected');
  eq(parseWaitlistInput({ email: ['a@b.co'] }).ok, false, 'non-string email rejected');
  eq(parseWaitlistInput({ email: 'a@b.co', source: 'x'.repeat(33) }).ok, false, 'over-long source rejected');
  eq(parseWaitlistInput({ email: 'a@b.co', source: '<script>' }).ok, false, 'odd source rejected');
  eq(parseWaitlistInput({ email: 'a@b.co', referralCode: 'r'.repeat(65) }).ok, false, 'over-long referral rejected');
  eq(normalizeEmail('x'.repeat(300)), null, 'normalizeEmail caps length');

  // ── 3. Session regeneration ─────────────────────────────────────────────
  for (const route of ['/api/auth/signup', '/api/auth/login', '/api/beta/onboard', '/api/auth/dev-login']) {
    ok(/await establishSession\(req, /.test(handler(route)), `${route} signs in on a regenerated session`);
    ok(!/\(req\.session as any\)\.userId = /.test(handler(route)), `${route} never sets userId on the pre-login session`);
  }
  ok(/req\.logIn\(user/.test(google) && /saveSession\(req\)/.test(google), 'Google callback: passport logIn (regenerates) then save before redirect');
  {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: 'test-only', resave: false, saveUninitialized: false, store: new session.MemoryStore() }));
    app.post('/plant', (req, res) => { (req.session as any).planted = 'attacker'; (req.session as any).keep = 'k'; res.json({ id: req.sessionID }); });
    app.post('/login', async (req, res) => {
      await establishSession(req, 'user-1', { maxAgeMs: 60_000, carry: req.body?.carry });
      res.json({ id: req.sessionID, session: req.session });
    });
    app.get('/whoami', (req, res) => { res.json({ userId: (req.session as any).userId ?? null, planted: (req.session as any).planted ?? null }); });
    await withServer(app, async (base) => {
      const plant = await fetch(base + '/plant', { method: 'POST' });
      const oldCookie = (plant.headers.get('set-cookie') || '').split(';')[0];
      const { id: oldId } = await plant.json() as { id: string };
      const login = await fetch(base + '/login', {
        method: 'POST', headers: { cookie: oldCookie, 'content-type': 'application/json' }, body: JSON.stringify({ carry: ['keep'] }),
      });
      const newCookie = (login.headers.get('set-cookie') || '').split(';')[0];
      const body = await login.json() as { id: string; session: Record<string, any> };
      ok(body.id && body.id !== oldId, 'login issues a new session id');
      ok(newCookie && newCookie !== oldCookie, 'login sets a new session cookie');
      eq(body.session.userId, 'user-1', 'userId set on the new session');
      eq(body.session.keep, 'k', 'named fields are carried over');
      ok(!('planted' in body.session), 'everything else from the old session is dropped');
      eq(body.session.cookie.originalMaxAge, 60_000, 'remember-me lifetime applied');
      const viaOld = await (await fetch(base + '/whoami', { headers: { cookie: oldCookie } })).json() as { userId: string | null };
      eq(viaOld.userId, null, 'the pre-login (fixable) session id is not signed in');
      const viaNew = await (await fetch(base + '/whoami', { headers: { cookie: newCookie } })).json() as { userId: string | null };
      eq(viaNew.userId, 'user-1', 'the new session id is signed in (saved before responding)');
    });
    await assert.rejects(establishSession({ session: {} }, 'u'), /Session store unavailable/);
    checks++;
  }

  // ── 6. Google sign-in never changes a tier ──────────────────────────────
  eq(googleNewUserTier(true), 'free', 'new invited Google user starts on free (operator 2026-09-30: every new account starts on Free)');
  eq(googleNewUserTier(false), 'free', 'other new Google users start on free');
  ok(!/subscriptionTier:\s*'pro'/.test(google), 'googleAuth never writes pro directly (no upgrade on login)');
  ok(!/Upgraded beta user from free to pro/.test(google), 'login-time upgrade removed');
  ok((google.match(/subscriptionTier/g) || []).length === 1, 'the only tier write is in the new-user branch');

  // ── Also: cookie flags, no error detail leaks ───────────────────────────
  const cookie = src('server/replitAuth.ts');
  ok(/httpOnly: true/.test(cookie) && /secure: process\.env\.NODE_ENV === 'production'/.test(cookie) && /sameSite: 'lax'/.test(cookie),
    'session cookie: HttpOnly, Secure in production, SameSite=Lax');
  for (const route of ['/api/auth/signup', '/api/auth/login', '/api/auth/dev-login', '/api/waitlist/join', '/api/auth/reset-password']) {
    ok(!/details:|\.stack\b.*res\.|err\.message\s*\}/.test(handler(route).replace(/logger\.[a-z]+\([^;]*;/gs, '')), `${route} returns no error details`);
  }

  console.log(`auth-hardening: ${checks} checks pass`);
}

main().catch((e) => { console.error(e); process.exit(1); });
