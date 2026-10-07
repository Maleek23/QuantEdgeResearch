/**
 * Admin hub session (fix 2026-10-07): the hub asked for the access code +
 * password after every click.
 *   npx tsx scripts/test-admin-session.ts      (npm run test:admin-session)
 *
 * Root cause: every admin page mounts its own <AdminLayout>, whose "signed in"
 * was local state seeded from the check-auth query — and that query's
 * pre-login {authenticated:false} stayed cached (staleTime 2 min) after the
 * password step. Fix: the query IS the state (login/lock write it), plus a
 * server session that is a real one: code ticket → password → httpOnly,
 * SameSite=Strict, path /api cookie, 8 h sliding, 24 h absolute.
 *
 * No database. Real requireAdminJWT / JWTs through a throwaway Express app;
 * route wiring and the client gate by reading source.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';

let checks = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); checks++; };
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); checks++; };
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function handler(file: string, verb: string, route: string): string {
  const s = src(file);
  const needles = [`app.${verb}("${route}"`, `app.${verb}('${route}'`];
  const start = Math.max(...needles.map((n) => s.indexOf(n)));
  assert.ok(start > 0, `route ${verb.toUpperCase()} ${route} not found in ${file}`);
  const next = s.slice(start + 10).search(/\n\s*app\.(get|post|put|patch|delete)\(/);
  return s.slice(start, next > 0 ? start + 10 + next : undefined);
}

async function main() {
  process.env.JWT_SECRET = 'test-admin-session-secret';
  const auth = await import('../server/auth');
  const jwt = (await import('jsonwebtoken')).default;
  const {
    generateAdminToken, verifyAdminToken, requireAdminJWT, adminCookieOptions, generateAdminCodeTicket, verifyAdminCodeTicket,
    ADMIN_IDLE_MS, ADMIN_ABSOLUTE_MS, ADMIN_COOKIE_PATH, adminSessionInfo,
  } = auth;

  // ── 1. Token + cookie policy ──────────────────────────────────────────────
  eq(ADMIN_IDLE_MS, 8 * 3600_000, 'idle window is 8 h');
  eq(ADMIN_ABSOLUTE_MS, 24 * 3600_000, 'absolute cap is 24 h');
  const opts = adminCookieOptions();
  eq([opts.httpOnly, opts.sameSite, opts.path, opts.maxAge], [true, 'strict', '/api', ADMIN_IDLE_MS], 'cookie: httpOnly, SameSite=Strict, path /api, 8 h');
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  ok(adminCookieOptions().secure === true, 'cookie is Secure in production');
  process.env.NODE_ENV = prevEnv;

  const now = Date.now();
  const t = generateAdminToken();
  const d = verifyAdminToken(t)!;
  ok(d && d.isAdmin === true && d.typ === 'admin' && typeof d.authTime === 'number', 'fresh token verifies with typ + authTime');
  ok(Math.abs((d.exp! - d.iat!) - ADMIN_IDLE_MS / 1000) <= 1, 'token exp = iat + 8 h');
  const info = adminSessionInfo(d);
  ok(Date.parse(info.absoluteExpiresAt) - d.authTime! * 1000 === ADMIN_ABSOLUTE_MS, 'session info reports the absolute cap');

  // Absolute cap: a token refreshed forever still dies 24 h after the password step.
  const oldAuth = Math.floor((now - ADMIN_ABSOLUTE_MS - 60_000) / 1000);
  ok(verifyAdminToken(generateAdminToken(oldAuth)) === null, 'a refreshed token past 24 h from the password step is refused');
  ok(verifyAdminToken(generateAdminToken(Math.floor((now - 23 * 3600_000) / 1000))) !== null, 'a token 23 h after the password step still works');
  // Pre-fix tokens (7 d, no authTime): honoured only within 24 h of iat.
  const legacyFresh = jwt.sign({ isAdmin: true }, 'test-admin-session-secret', { expiresIn: '7d' });
  ok(verifyAdminToken(legacyFresh) !== null, 'legacy token issued just now still works (no forced re-login on deploy)');
  const legacyOld = jwt.sign({ isAdmin: true, iat: Math.floor((now - 3 * 86400_000) / 1000) }, 'test-admin-session-secret', { expiresIn: '7d' });
  ok(verifyAdminToken(legacyOld) === null, 'legacy 7-day token older than 24 h is refused');
  ok(verifyAdminToken(jwt.sign({ isAdmin: true, typ: 'admin' }, 'wrong-secret')) === null, 'forged signature refused');
  ok(verifyAdminToken(jwt.sign({ isAdmin: false }, 'test-admin-session-secret')) === null, 'isAdmin:false refused');
  ok(verifyAdminToken(generateAdminCodeTicket()) === null, 'the access-code ticket is not an admin session');
  ok(verifyAdminToken(jwt.sign({ isAdmin: true, typ: 'admin-code' }, 'test-admin-session-secret')) === null, 'typ other than admin refused');

  // Code ticket
  ok(verifyAdminCodeTicket(generateAdminCodeTicket()), 'code ticket verifies');
  ok(!verifyAdminCodeTicket(t), 'an admin session token is not a code ticket');
  ok(!verifyAdminCodeTicket(jwt.sign({ typ: 'admin-code' }, 'x')), 'forged code ticket refused');
  ok(!verifyAdminCodeTicket(jwt.sign({ typ: 'admin-code', exp: Math.floor(now / 1000) - 10 }, 'test-admin-session-secret')), 'expired code ticket refused');
  ok(!verifyAdminCodeTicket(undefined) && !verifyAdminCodeTicket(''), 'missing ticket refused');

  // ── 2. requireAdminJWT through Express: sliding refresh, survives "navigation" ─
  const app = express();
  app.use(cookieParser());
  app.get('/api/admin/check-auth', requireAdminJWT, (_req, res) => res.json({ authenticated: true }));
  app.get('/api/cache/stats', requireAdminJWT, (_req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const fresh = await fetch(`${base}/api/admin/check-auth`, { headers: { Cookie: `admin_token=${t}` } });
    eq(fresh.status, 200, 'fresh cookie → 200');
    eq(fresh.headers.get('set-cookie'), null, 'a token younger than 5 min is not re-issued on every request');
    for (let i = 0; i < 5; i++) {
      eq((await fetch(`${base}/api/admin/check-auth`, { headers: { Cookie: `admin_token=${t}` } })).status, 200, `repeated admin request #${i + 1} stays signed in`);
    }

    const aging = jwt.sign({ isAdmin: true, typ: 'admin', authTime: Math.floor((now - 2 * 3600_000) / 1000), iat: Math.floor((now - 2 * 3600_000) / 1000) },
      'test-admin-session-secret', { expiresIn: Math.floor(ADMIN_IDLE_MS / 1000) });
    const slid = await fetch(`${base}/api/admin/check-auth`, { headers: { Cookie: `admin_token=${aging}` } });
    eq(slid.status, 200, '2 h-old cookie → 200');
    const sc = slid.headers.get('set-cookie') ?? '';
    ok(/admin_token=/.test(sc), 'a 2 h-old cookie is re-issued (sliding)');
    ok(/HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc) && /Path=\/api(;|$)/.test(sc) && /Max-Age=28800/.test(sc), `re-issued cookie keeps the policy: ${sc}`);
    const reissued = decodeURIComponent(sc.match(/admin_token=([^;]+)/)![1]);
    const rd = verifyAdminToken(reissued)!;
    eq(rd.authTime, Math.floor((now - 2 * 3600_000) / 1000), 'sliding keeps the ORIGINAL authTime (the 24 h cap does not move)');

    const bearerOld = await fetch(`${base}/api/admin/check-auth`, { headers: { Authorization: `Bearer ${aging}` } });
    eq([bearerOld.status, bearerOld.headers.get('set-cookie')], [200, null], 'Bearer clients are never handed a cookie');

    eq((await fetch(`${base}/api/cache/stats`, { headers: { Cookie: `admin_token=${t}` } })).status, 200, 'operator routes outside /api/admin work with the /api-scoped cookie');
    eq((await fetch(`${base}/api/admin/check-auth`)).status, 401, 'no cookie → 401');
    eq((await fetch(`${base}/api/admin/check-auth`, { headers: { Cookie: `admin_token=${generateAdminToken(oldAuth)}` } })).status, 403, 'past the absolute cap → 403');
    eq(ADMIN_COOKIE_PATH, '/api', 'path constant');
  } finally { server.close(); }

  // ── 3. Route wiring (source) ──────────────────────────────────────────────
  const verify = handler('server/routes.ts', 'post', '/api/admin/verify-code');
  ok(/safeSecretEqual\(req\.body\?\.code, adminCode\)/.test(verify) && /setAdminCodeTicket\(res\)/.test(verify), 'verify-code: constant-time compare, then the ticket');
  ok(/adminLimiter/.test(verify), 'verify-code keeps adminLimiter');
  const login = handler('server/routes.ts', 'post', '/api/admin/login');
  ok(/adminLimiter/.test(login) && /checkLoginBlock\(clientIp\)/.test(login), 'login keeps adminLimiter + IP lockout');
  ok(login.indexOf('verifyAdminCodeTicket') > 0 && login.indexOf('verifyAdminCodeTicket') < login.indexOf('safeSecretEqual(req.body?.password'), 'login refuses before checking the password when the code step was skipped');
  ok(/safeSecretEqual\(req\.body\?\.password, adminPassword\)/.test(login), 'password compared in constant time');
  ok(/setAdminCookie\(res, token\)/.test(login) && !/res\.cookie\('admin_token'/.test(login), 'login sets the cookie through setAdminCookie (one policy)');
  ok(/logAdminAction\('ADMIN_LOGIN_SUCCESS'/.test(login) && /logAdminAction\('ADMIN_LOGIN_FAILED'/.test(login), 'login success / failure audited');
  ok(!/expiresIn: '24h'/.test(login), 'login no longer claims a 24 h session it did not set');
  const logout = handler('server/routes.ts', 'post', '/api/admin/logout');
  ok(/clearAdminCookies\(res\)/.test(logout) && /logAdminAction\('ADMIN_LOCK'/.test(logout), 'logout ("Lock admin") clears both cookie paths and is audited');
  const check = handler('server/routes.ts', 'get', '/api/admin/check-auth');
  ok(/requireAdminJWT/.test(check) && /no-store/.test(check), 'check-auth is admin-gated and never cached');
  const authSrc = src('server/auth.ts');
  ok(/res\.clearCookie\(ADMIN_COOKIE, \{ path: '\/' \}\)/.test(authSrc), 'the legacy path=/ cookie is cleared too');
  ok(/'\/api\/admin\/login' \|\| req\.path === '\/api\/admin\/verify-code'/.test(src('server/csrf.ts')), 'CSRF exemptions for the two login steps unchanged (logout still needs the token)');

  // ── 4. Client gate (source) ───────────────────────────────────────────────
  const layout = src('client/src/components/admin/admin-layout.tsx');
  ok(!/type AuthStep = "pin" \| "password" \| "authenticated"/.test(layout), 'AuthStep no longer carries the signed-in state');
  ok(/qc\.setQueryData<AdminAuthState>\(ADMIN_AUTH_KEY, \{ authenticated: true/.test(layout), 'login writes the shared check-auth cache entry');
  ok(/qc\.setQueryData<AdminAuthState>\(ADMIN_AUTH_KEY, \{ authenticated: false \}\)/.test(layout), 'lock writes it back to false');
  ok(/const authenticated = !!authCheck\?\.authenticated/.test(layout) && /if \(!authenticated\)/.test(layout), 'the gate renders from the query, so every admin page agrees');
  ok(/checkingAuth && !authCheck/.test(layout), 'a cached answer renders at once — no gate flash between pages');
  ok(/button-lock-admin/.test(layout) && /Lock admin/.test(layout), 'explicit "Lock admin" button');
  ok(/x-csrf-token/.test(layout.slice(layout.indexOf('const lockAdmin'))), 'Lock sends the CSRF token (the old "Leave admin" POST had none → 403, cookie never cleared)');
  ok(/codeRequired|access code/i.test(layout), 'a refused password step (no ticket) sends the operator back to the code');

  console.log(`test-admin-session: ${checks} checks passed`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
