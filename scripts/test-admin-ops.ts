/**
 * Admin hub operator actions + Free-tier gates (docs/ADMIN_TAB.md).
 *   npx tsx scripts/test-admin-ops.ts      (npm run test:admin-ops)
 *
 * No database. Pure helpers are exercised directly; the admin routes' auth
 * through a throwaway Express app (real requireAdminJWT, real JWT); the
 * route wiring by reading source; the delete cascade against shared/schema.ts.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { is } from 'drizzle-orm';
import * as schema from '../shared/schema';
import {
  ADMIN_ASSIGNABLE_TIERS, DISABLED_STATUS, UNLOCKED_INVITE_EMAIL, deleteConfirmed, generateInviteCode, inviteDisplayStatus,
  inviteEmailMatches, inviteLink, isAccountDisabled, isInviteEmailLocked, isProtectedAdmin, isWellFormedCode,
  parseAssignableTier, parseGenerateInvitesInput, safeInviteTier, summarizeUsers, toAdminUserRow,
} from '../server/admin-ops';
import { appendAdminAudit, readAdminAudit, scrubAuditDetail, codeTail } from '../server/admin-audit';
import { coveredColumns } from '../server/user-cascade-plan';
import { tierGateDecision, requiredTierForFeature } from '../server/tier-gate';
import { TIER_CONFIG, type TierLimits } from '../server/tierConfig';
import { googleNewUserTier, normalizeInviteCode } from '../server/auth-hardening';

let checks = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); checks++; };
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); checks++; };
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** Body of one route handler in a source file: from its registration to the next app.<verb>( */
function handler(file: string, verb: string, route: string): string {
  const s = src(file);
  const needles = [`app.${verb}("${route}"`, `app.${verb}('${route}'`];
  const start = Math.max(...needles.map((n) => s.indexOf(n)));
  assert.ok(start > 0, `route ${verb.toUpperCase()} ${route} not found in ${file}`);
  const next = s.slice(start + 10).search(/\n\s*app\.(get|post|put|patch|delete)\(/);
  return s.slice(start, next > 0 ? start + 10 + next : undefined);
}

async function main() {
  // ── 1. Invite codes ───────────────────────────────────────────────────────
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const c = generateInviteCode();
    ok(/^qe-[a-hjkmnp-z2-9]{5}(-[a-hjkmnp-z2-9]{5}){3}$/.test(c), `code format ${c}`);
    seen.add(c);
    if (i < 5) { ok(isWellFormedCode(c) && normalizeInviteCode(c) === c, 'code survives the signup normaliser unchanged'); }
  }
  eq(seen.size, 2000, '2000 generated codes are all distinct');
  // Rejection sampling: bytes >= 248 are never used (no modulo bias), so a stream of 255s then zeros yields all 'a'.
  let calls = 0;
  const biased = generateInviteCode((n) => { calls++; return Buffer.alloc(n, calls === 1 ? 255 : 0); });
  eq(biased, 'qe-aaaaa-aaaaa-aaaaa-aaaaa', 'out-of-range bytes are rejected, not folded');
  ok(/randomBytes/.test(src('server/admin-ops.ts')) && !/Math\.random/.test(src('server/admin-ops.ts')), 'codes come from crypto.randomBytes, never Math.random');

  // generate input
  eq(parseGenerateInvitesInput({}).ok, true, 'defaults are valid (1 code, no lock, no tier, 14 days)');
  const d = parseGenerateInvitesInput({});
  if (d.ok) eq([d.value.count, d.value.email, d.value.tierOverride, d.value.expiryDays], [1, null, null, 14], 'default values');
  eq(parseGenerateInvitesInput({ count: 101 }).ok, false, 'over 100 codes refused');
  eq(parseGenerateInvitesInput({ count: 0 }).ok, false, 'zero codes refused');
  eq(parseGenerateInvitesInput({ count: 2.5 }).ok, false, 'fractional count refused');
  eq(parseGenerateInvitesInput({ tierOverride: 'admin' }).ok, false, 'an invite can never carry the admin tier');
  eq(parseGenerateInvitesInput({ tierOverride: 'none' }).ok, true, "'none' = no override");
  eq(parseGenerateInvitesInput({ email: 'A@B.co', count: 2 }).ok, false, 'an email lock means exactly one code');
  const locked = parseGenerateInvitesInput({ email: ' A@B.co ', tierOverride: 'pro', expiryDays: 30, note: 'vip' });
  eq(locked.ok && [locked.value.email, locked.value.tierOverride, locked.value.expiryDays, locked.value.note], ['a@b.co', 'pro', 30, 'vip'], 'lock email normalised');
  eq(parseGenerateInvitesInput({ email: 'nope' }).ok, false, 'bad lock email refused');
  eq(parseGenerateInvitesInput({ expiryDays: 0 }).ok, false, 'expiry < 1 day refused');
  eq(parseGenerateInvitesInput({ expiryDays: 366 }).ok, false, 'expiry > 365 days refused');
  eq(parseGenerateInvitesInput({ note: 'x'.repeat(501) }).ok, false, 'over-long note refused');

  // status + lock
  const now = Date.parse('2026-10-01T12:00:00Z');
  eq(inviteDisplayStatus({ status: 'pending', expiresAt: '2026-10-05' }, now), 'unused', 'pending + future expiry = unused');
  eq(inviteDisplayStatus({ status: 'sent', expiresAt: '2026-10-05' }, now), 'unused', 'sent (emailed) is still unused');
  eq(inviteDisplayStatus({ status: 'pending', expiresAt: '2026-09-01' }, now), 'expired', 'past expiry = expired even if not marked');
  eq(inviteDisplayStatus({ status: 'redeemed', expiresAt: '2026-09-01' }, now), 'used', 'redeemed = used regardless of date');
  eq(inviteDisplayStatus({ status: 'revoked', expiresAt: '2026-12-01' }, now), 'revoked', 'revoked');
  ok(!isInviteEmailLocked({ email: UNLOCKED_INVITE_EMAIL }) && isInviteEmailLocked({ email: 'a@b.co' }), "'' = unlocked, an address = locked");
  ok(inviteEmailMatches({ email: '' }, 'anyone@x.io'), 'unlocked code works for any email');
  ok(inviteEmailMatches({ email: 'A@b.co' }, 'a@B.CO'), 'lock compares case-insensitively');
  ok(!inviteEmailMatches({ email: 'a@b.co' }, 'c@d.co') && !inviteEmailMatches({ email: 'a@b.co' }, null), 'locked code refuses another / no email');
  eq(inviteLink('https://quantedgelabs.net/', 'qe-abcde-fghjk-mnpqr-stuvw'), 'https://quantedgelabs.net/signup?code=qe-abcde-fghjk-mnpqr-stuvw', 'invite link = /signup?code=');
  ok(/params\.get\('code'\)/.test(src('client/src/pages/signup.tsx')), 'the sign-up page prefills ?code=');

  // ── 2. Tiers: admin is never assignable ───────────────────────────────────
  eq([...ADMIN_ASSIGNABLE_TIERS], ['free', 'advanced', 'pro'], 'assignable tiers');
  eq(parseAssignableTier('admin'), null, 'admin not assignable from the hub');
  eq(parseAssignableTier('pro'), 'pro', 'pro assignable');
  eq(safeInviteTier('admin'), null, 'a legacy admin override on an invite grants nothing');
  ok(isProtectedAdmin({ email: 'Boss@x.io', subscriptionTier: 'free' }, 'boss@x.io'), 'ADMIN_EMAIL account is protected');
  ok(isProtectedAdmin({ email: 'a@x.io', subscriptionTier: 'admin' }, 'boss@x.io'), 'admin-tier account is protected');
  ok(!isProtectedAdmin({ email: 'a@x.io', subscriptionTier: 'pro' }, 'boss@x.io'), 'a pro member is not');
  ok(!isProtectedAdmin({ email: 'a@x.io', subscriptionTier: 'pro' }, undefined), 'no ADMIN_EMAIL set → only the tier protects');

  // ── 3. Users ──────────────────────────────────────────────────────────────
  const row = toAdminUserRow({ id: 'u1', email: 'm@x.io', firstName: 'Mo', lastName: null, subscriptionTier: 'free', subscriptionStatus: 'active', hasBetaAccess: true, createdAt: new Date(now - 3 * 86_400_000), passwordHash: '$2b$12$secret' }, new Date(now - 3_600_000), 'boss@x.io');
  ok(!('passwordHash' in row) && !JSON.stringify(row).includes('$2b$'), 'the admin row never carries the password hash');
  eq([row.name, row.tier, row.hasBetaAccess, row.disabled, row.isAdmin, row.authMethod], ['Mo', 'free', true, false, false, 'password'], 'row fields');
  const g = toAdminUserRow({ id: 'google_1', email: 'g@x.io', subscriptionStatus: DISABLED_STATUS, createdAt: new Date(now - 40 * 86_400_000), lastLoginDate: '2026-09-30' }, null, 'boss@x.io');
  eq([g.tier, g.disabled, g.authMethod, g.lastLoginAt], ['free', true, 'google', '2026-09-30T00:00:00.000Z'], 'missing tier reads Free; disabled; streak date as fallback last-login');
  const sum = summarizeUsers([row, g, toAdminUserRow({ id: 'a', email: 'boss@x.io', subscriptionTier: 'admin', hasBetaAccess: true, createdAt: new Date(now - 10 * 86_400_000) }, new Date(now - 6 * 86_400_000), 'boss@x.io')], now);
  eq(sum, { total: 3, byTier: { free: 2, advanced: 0, pro: 0, admin: 1 }, betaAccess: 2, disabled: 1, signups7d: 1, signups30d: 2, seen24h: 1, seen7d: 3 }, 'overview counts (streak date counts as seen)');
  ok(deleteConfirmed({ email: 'M@x.io' }, ' m@x.io ') && !deleteConfirmed({ email: 'm@x.io' }, 'm@x.i') && !deleteConfirmed({ email: 'm@x.io' }, undefined), 'delete needs the email retyped');
  ok(isAccountDisabled({ subscriptionStatus: 'disabled' }) && !isAccountDisabled({ subscriptionStatus: 'active' }) && !isAccountDisabled(null), 'disabled = subscription_status disabled');

  // ── 4. A brand-new Free account: Free features open, paid-only refused ────
  ok(/subscriptionTier: 'free',\s*\n\s*subscriptionStatus: 'active'/.test(src('server/userAuth.ts')), 'email sign-up creates the account on Free / active');
  eq(googleNewUserTier(true), 'free', 'Google sign-up starts on Free even with beta access');
  eq(googleNewUserTier(false), 'free', 'Google sign-up starts on Free');
  const newFree = { email: 'new@x.io', subscriptionTier: 'free', subscriptionStatus: 'active' };
  const features = Object.keys(TIER_CONFIG.free).filter((k) => typeof (TIER_CONFIG.free as any)[k] === 'boolean') as (keyof TierLimits)[];
  let freeOpen = 0, freeShut = 0;
  for (const f of features) {
    const dec = tierGateDecision(newFree, f, false);
    if (TIER_CONFIG.free[f]) {
      ok(dec.ok, `Free can use ${f}`); freeOpen++;
    } else {
      ok(!dec.ok && dec.status === 403, `Free is refused ${f}`); freeShut++;
      ok(!dec.ok && dec.body.currentTier === 'Free' && requiredTierForFeature(f) !== 'Free', `${f} names a paid tier in the 403`);
      // and the tier it names actually unlocks it
      const need = requiredTierForFeature(f) === 'Pro' ? 'pro' : 'advanced';
      ok(TIER_CONFIG[need][f] === true, `${f}: ${need} actually unlocks it`);
    }
  }
  ok(freeOpen >= 5 && freeShut >= 20, `Free: ${freeOpen} features open, ${freeShut} paid-only`);
  for (const f of ['canAccessTradingJournal', 'canAccessAIEngine', 'canAccessQuantEngine', 'canTradeStocks', 'canTradeCrypto'] as const) {
    ok(tierGateDecision(newFree, f, false).ok, `Free core feature open: ${f}`);
  }
  // Every requireTier(...) route in routes.ts refuses Free and admits the tier it names.
  const gated = [...src('server/routes.ts').matchAll(/app\.(get|post)\("([^"]+)", requireTier\('([A-Za-z]+)'\)/g)];
  ok(gated.length >= 15, `${gated.length} tier-gated routes found`);
  for (const [, verb, route, f] of gated) {
    const feat = f as keyof TierLimits;
    ok(!tierGateDecision(newFree, feat, false).ok, `${verb.toUpperCase()} ${route} refuses a Free account`);
    const need = requiredTierForFeature(feat) === 'Pro' ? 'pro' : 'advanced';
    ok(tierGateDecision({ ...newFree, subscriptionTier: need }, feat, false).ok, `${route} admits ${need}`);
  }
  eq(tierGateDecision(null, 'canAccessTradingJournal', false), { ok: false, status: 401, body: { message: 'Unauthorized' } }, 'signed out = 401');
  ok(tierGateDecision({ ...newFree, subscriptionTier: 'mystery' }, 'canTradeFutures', false).ok === false, 'an unknown tier is gated as Free (no crash)');
  ok(tierGateDecision(newFree, 'canTradeFutures', true).ok, 'admin passes every gate');
  const dis = tierGateDecision({ ...newFree, subscriptionTier: 'pro', subscriptionStatus: 'disabled' }, 'canTradeStocks', false);
  ok(!dis.ok && dis.status === 403 && dis.body.code === 'ACCOUNT_DISABLED', 'a disabled account is refused even on a paid tier');
  ok(/tierGateDecision\(user, feature, checkIsAdmin\(user\)\)/.test(src('server/routes.ts')), 'routes.ts requireTier uses the tested decision');

  // ── 5. Sign-up / redeem / login wiring ────────────────────────────────────
  const signup = handler('server/routes.ts', 'post', '/api/auth/signup');
  ok(/!inviteEmailMatches\(candidateInvite, emailLower\)/.test(signup), 'signup enforces the invite email lock (generic error)');
  ok(/safeInviteTier\(validatedInvite\.tierOverride\)/.test(signup) && !/subscriptionTier: validatedInvite\.tierOverride/.test(signup), 'signup grants only a safe tier override');
  const redeem = handler('server/routes.ts', 'post', '/api/beta/redeem');
  ok(/inviteEmailMatches\(candidate, user\.email\)/.test(redeem) && redeem.indexOf('inviteEmailMatches') < redeem.indexOf('redeemBetaInvite('), 'redeem checks the lock before burning the code');
  ok(!/invite\.tierOverride \|\| 'free'/.test(redeem), 'redeem no longer resets an existing paid member to Free');
  const verify = handler('server/routes.ts', 'post', '/api/beta/verify-code');
  ok(/!isInviteEmailLocked\(invite\)/.test(verify), 'the attach-to-existing-account flow only takes email-locked codes');
  const onboard = handler('server/routes.ts', 'post', '/api/beta/onboard');
  ok(/existingUser\.passwordHash/.test(onboard) && /409/.test(onboard), 'onboarding never overwrites an existing password');
  ok(/isAccountDisabled\(user\)/.test(handler('server/routes.ts', 'post', '/api/auth/login')), 'login refuses a disabled account');
  ok(/isAccountDisabled\(user\)/.test(handler('server/routes.ts', 'get', '/api/auth/me')), '/api/auth/me treats a disabled account as signed out');
  const beta = src('server/routes.ts').slice(src('server/routes.ts').indexOf('async function requireBetaAccess'), src('server/routes.ts').indexOf('export async function registerRoutes'));
  ok(/isAccountDisabled\(user\)/.test(beta), 'requireBetaAccess refuses a disabled account');
  const google = src('server/googleAuth.ts');
  ok(/isAccountDisabled\(existingUser\)/.test(google) && /account_disabled/.test(google), 'Google sign-in refuses a disabled account');
  ok((google.match(/subscriptionTier/g) || []).length === 1, 'Google still writes a tier only on first creation');
  ok(/safeInviteTier\(invite\?\.tierOverride\)/.test(google), "Google honours a redeemed invite's explicit override");
  const storageSrc = src('server/storage.ts');
  ok(/or\(eq\(betaInvites\.status, 'pending'\), eq\(betaInvites\.status, 'sent'\)/.test(storageSrc) && /won\.length \? invite : null/.test(storageSrc), 'redeem is a conditional update (one winner per code)');

  // ── 6. Admin endpoints: requireAdminJWT everywhere, admin never grantable ─
  const ops = src('server/admin-ops-routes.ts');
  const opsRoutes = [...ops.matchAll(/app\.(get|post|patch|put|delete)\('([^']+)', ([A-Za-z]+)/g)];
  ok(opsRoutes.length >= 11, `${opsRoutes.length} ops routes`);
  for (const [, verb, route, mw] of opsRoutes) {
    ok(route.startsWith('/api/admin/ops/') && mw === 'requireAdmin', `${verb.toUpperCase()} ${route} is behind requireAdmin`);
  }
  ok(/registerAdminOpsRoutes\(app, requireAdminJWT\)/.test(src('server/routes.ts')), 'ops routes registered with requireAdminJWT');
  const patchOld = handler('server/routes.ts', 'patch', '/api/admin/users/:userId');
  ok(/parseAssignableTier\(subscriptionTier\)/.test(patchOld) && !/'admin'\]\.includes\(subscriptionTier\)/.test(patchOld), 'legacy PATCH /api/admin/users refuses the admin tier');
  ok(/isProtectedAdmin\(target\)/.test(patchOld), 'legacy PATCH cannot change the admin account');
  const delOld = handler('server/routes.ts', 'delete', '/api/admin/users/:userId');
  ok(/isProtectedAdmin\(target\)/.test(delOld) && /deleteConfirmed\(target/.test(delOld), 'legacy DELETE: admin protected + email confirmation');
  ok(/users\.map\(\(u\) => sanitizeUser\(u\)\)/.test(handler('server/routes.ts', 'get', '/api/admin/users')), 'GET /api/admin/users strips password hashes');
  ok(/safeInviteTier\(rawTier\)/.test(handler('server/routes.ts', 'post', '/api/admin/invites')), 'legacy invite create refuses an admin override');
  const pass = src('server/journals-routes.ts');
  ok(/trader\.passcode_set/.test(pass) && /if \(!actor\.isAdmin\) return res\.status\(403\)/.test(pass), 'passcode endpoint stays admin-only and is audited');

  // Auth through a real Express app: no token → 401, forged token → 403, real admin token → 200.
  process.env.JWT_SECRET = 'test-admin-ops-secret';
  const dir = mkdtempSync(path.join(tmpdir(), 'qe-admin-audit-'));
  process.env.ADMIN_AUDIT_FILE = path.join(dir, 'actions.jsonl');
  const { requireAdminJWT, generateAdminToken } = await import('../server/auth');
  const { registerAdminOpsRoutes } = await import('../server/admin-ops-routes');
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  registerAdminOpsRoutes(app, requireAdminJWT);
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const jwt = (await import('jsonwebtoken')).default;
    const forged = jwt.sign({ isAdmin: true }, 'not-the-secret');
    const notAdmin = jwt.sign({ isAdmin: false }, 'test-admin-ops-secret');
    for (const [method, route] of [['GET', '/api/admin/ops/overview'], ['GET', '/api/admin/ops/users'], ['PATCH', '/api/admin/ops/users/u1'], ['DELETE', '/api/admin/ops/users/u1'],
      ['POST', '/api/admin/ops/invites/generate'], ['POST', '/api/admin/ops/invites/i1/revoke'], ['POST', '/api/admin/ops/waitlist/approve'],
      ['GET', '/api/admin/ops/traders'], ['GET', '/api/admin/ops/audit'], ['POST', '/api/admin/ops/users/u1/password-reset']] as const) {
      const none = await fetch(base + route, { method });
      eq(none.status, 401, `${method} ${route} without a token → 401`);
      const bad = await fetch(base + route, { method, headers: { Cookie: `admin_token=${forged}` } });
      eq(bad.status, 403, `${method} ${route} with a forged token → 403`);
      const na = await fetch(base + route, { method, headers: { Authorization: `Bearer ${notAdmin}` } });
      eq(na.status, 403, `${method} ${route} with a non-admin token → 403`);
    }
    appendAdminAudit({ action: 'invite.generate', actor: 'admin-hub', target: 'x@y.io', detail: { count: 1 } });
    const good = await fetch(`${base}/api/admin/ops/audit`, { headers: { Cookie: `admin_token=${generateAdminToken()}` } });
    eq(good.status, 200, 'a real admin token reads the audit log');
    const body = await good.json() as { entries: { action: string }[] };
    eq(body.entries[0]?.action, 'invite.generate', 'audit entry visible through the route');
    // Validation runs before any DB access.
    const badGen = await fetch(`${base}/api/admin/ops/invites/generate`, { method: 'POST', headers: { Cookie: `admin_token=${generateAdminToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ tierOverride: 'admin' }) });
    eq(badGen.status, 400, 'generating an admin-tier code → 400');
    const badIds = await fetch(`${base}/api/admin/ops/waitlist/approve`, { method: 'POST', headers: { Cookie: `admin_token=${generateAdminToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ["x' OR 1=1"] }) });
    eq(badIds.status, 400, 'odd waitlist ids → 400');
  } finally { server.close(); }

  // ── 7. Audit log file ─────────────────────────────────────────────────────
  const f2 = path.join(dir, 'b.jsonl');
  const scrubbed = scrubAuditDetail({ passcode: 'hunter22', token: 'abc', code: 'qe-x', codeTail: '…wxyz', codeTails: ['…1234'], email: 'a@b.co' });
  eq(scrubbed, { codeTail: '…wxyz', codeTails: ['…1234'], email: 'a@b.co' }, 'secrets never reach the log; code tails do');
  eq(codeTail('qe-abcde-fghjk-mnpqr-stuvw'), '…tuvw', 'code tail = last 4');
  appendAdminAudit({ action: 'user.tier', actor: 'admin-hub', target: 'u1', detail: { from: 'free', to: 'pro' } }, f2);
  appendFileSync(f2, '{"torn":');
  appendFileSync(f2, '\n');
  appendAdminAudit({ action: 'user.delete', actor: 'admin-hub', target: 'u2' }, f2);
  const read = readAdminAudit(10, f2);
  eq(read.map((r) => r.action), ['user.delete', 'user.tier'], 'newest first; a torn line is skipped');
  eq(readAdminAudit(10, path.join(dir, 'missing.jsonl')), [], 'no file = empty log');
  writeFileSync(path.join(dir, 'big.jsonl'), Array.from({ length: 20_000 }, (_, i) => JSON.stringify({ at: new Date(i).toISOString(), action: 'user.beta', actor: 'a', target: `u${i}`, detail: { pad: 'x'.repeat(30) }, ip: null })).join('\n') + '\n');
  const tail = readAdminAudit(3, path.join(dir, 'big.jsonl'));
  eq(tail.map((r) => r.target), ['u19999', 'u19998', 'u19997'], 'large log: reads the tail only');

  // ── 8. Delete cascade covers every user-owned table ───────────────────────
  const covered = coveredColumns();
  const userCols = /^(user_id|owner_id|linked_user_id)$/;
  const missing: string[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const cfg = getTableConfig(value);
    if (cfg.name === 'users' || cfg.name === 'sessions') continue;
    for (const col of cfg.columns) {
      if (userCols.test(col.name) && !covered.get(cfg.name)?.has(col.name)) missing.push(`${cfg.name}.${col.name}`);
    }
  }
  eq(missing, [], 'every user_id / owner_id / linked_user_id column is in the delete plan');
  ok(covered.get('trade_ideas')?.has('user_id') && /USER_DETACH/.test(src('server/user-cascade-plan.ts')), 'trade ideas are detached, not deleted (model record)');
  const del = storageSrc.slice(storageSrc.indexOf('async deleteUser(id: string): Promise<boolean> {\n    // Full cascade'));
  ok(/db\.transaction\(/.test(del.slice(0, 2500)) && /DELETE FROM sessions/.test(del.slice(0, 2500)), 'storage.deleteUser runs the plan in one transaction and ends sessions');

  // ── 9. Client: admin-only, admin tier not offered ─────────────────────────
  const usersPage = src('client/src/pages/admin/users.tsx');
  ok(!/<option value="admin">Admin<\/option><\/select>|value="admin">Admin<\/option>\s*<\/select>/.test(usersPage) && !/\{ tier: 'admin'/.test(usersPage), 'Users page never offers the admin tier as a change');
  ok(/useIsAdmin\(\)/.test(src('client/src/components/shell/mode-menu.tsx')) && /isAdmin && <Link href="\/admin"/.test(src('client/src/pages/settings.tsx')), 'the hub link is shown to the admin only');

  console.log(`admin-ops: ${checks} checks pass`);
}

main().catch((e) => { console.error(e); process.exit(1); });
