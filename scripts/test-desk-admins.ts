/**
 * Desk admins (docs/DESK_ADMINS.md) — role isolation, caps, bot wiring.
 *   npx tsx scripts/test-desk-admins.ts      (npm run test:desk-admins)
 *
 * No database. The real routes run in a throwaway Express app with the real
 * requireAdminJWT and the real access rule (resolveDeskAccess + the super-admin
 * check); only storage is an in-memory fake, so every refused request can also
 * be checked for "and nothing was written".
 *
 * The critical property: a desk admin is refused on every platform-admin route
 * and on every other trader's desk; the super-admin passes everywhere.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import {
  DESK_BOT_CAPS, canManageDesk, defaultDeskBotConfig, deskBotOwnerId, deskBotsToRun, deskEngineConfig, deskEntryCheck,
  normalizeStoredDeskConfig, parseDeskBotPatch, resolveDeskAccess, type DeskBotConfig,
} from '../shared/desk-admin';

let checks = 0;
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); checks++; };
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); checks++; };
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const PLATFORM = { minConviction: 18, maxOpen: 10, startingCapital: 100_000, riskPerTradePct: 2, maxProgressPct: 35, minUnderlyingRR: 1, maxOptionSpreadPct: 0.15, maxDebitPct: 0.03, maxRiskDollars: 250, maxDebitDollars: 300, minContractRoiAtT1Pct: 30, delayedFillNotBeforeEtMinutes: 600 };

async function main() {
  // ── 1. Who is who ─────────────────────────────────────────────────────────
  const traders = [
    { slug: 'femi', linkedUserId: 'u-femi', createdAt: '2026-09-29' },
    { slug: 'uzo', linkedUserId: 'u-uzo', createdAt: '2026-09-29' },
    { slug: 'ayo', linkedUserId: null, createdAt: '2026-09-29' },
    { slug: 'leek', linkedUserId: 'u-malik', createdAt: '2026-09-28' },
  ];
  eq(resolveDeskAccess({ userId: 'u-femi', isSuperAdmin: false, traders }), { role: 'desk', userId: 'u-femi', deskSlug: 'femi' }, 'a linked user is the desk admin of their book');
  eq(resolveDeskAccess({ userId: 'u-malik', isSuperAdmin: true, traders }).role, 'super', 'the super-admin is super even when linked to a book');
  eq(resolveDeskAccess({ userId: 'u-x', isSuperAdmin: false, traders }).role, 'none', 'an unlinked member is nobody');
  eq(resolveDeskAccess({ userId: null, isSuperAdmin: false, traders }).role, 'none', 'signed out is nobody');
  eq(resolveDeskAccess({ userId: 'u-femi', isSuperAdmin: false, disabled: true, traders }).role, 'none', 'a disabled account is nobody, link or not');
  eq(resolveDeskAccess({ userId: 'u-malik', isSuperAdmin: true, disabled: true, traders }).role, 'none', 'a disabled super-admin is nobody');
  eq(resolveDeskAccess({ userId: 'u2', isSuperAdmin: false, traders: [{ slug: 'zed', linkedUserId: 'u2', createdAt: '2026-09-30' }, { slug: 'bean', linkedUserId: 'u2', createdAt: '2026-09-29' }] }).deskSlug, 'bean', 'a stray second link never changes the desk (oldest wins)');
  const femi = resolveDeskAccess({ userId: 'u-femi', isSuperAdmin: false, traders });
  const boss = resolveDeskAccess({ userId: 'u-malik', isSuperAdmin: true, traders });
  ok(canManageDesk(femi, 'femi') && !canManageDesk(femi, 'uzo') && !canManageDesk(femi, 'leek'), "a desk admin manages only their own desk (not another trader's, not Malik's)");
  ok(['femi', 'uzo', 'ayo', 'leek'].every((s) => canManageDesk(boss, s)), 'the super-admin manages every desk');
  ok(!canManageDesk(boss, '../etc') && !canManageDesk(femi, 'FEMI ') && !canManageDesk(boss, ''), 'malformed slugs are refused for everyone');

  // ── 2. Bot config: replica of the platform bot, inside platform caps ─────
  const def = defaultDeskBotConfig(PLATFORM);
  eq([def.minConviction, def.riskPerTradePct, def.maxRiskDollars, def.maxDebitDollars, def.maxProgressPct, def.minUnderlyingRR, def.minContractRoiAtT1Pct],
    [18, 2, 250, 300, 35, 1, 30], "defaults clone the platform bot's current rules");
  eq(def.maxOpen, DESK_BOT_CAPS.maxOpen.max, 'max open is clamped to the desk cap (platform bot runs 10)');
  const eng = deskEngineConfig(def, PLATFORM);
  eq([eng.startingCapital, eng.maxOptionSpreadPct, eng.maxDebitPct, eng.delayedFillNotBeforeEtMinutes], [100_000, 0.15, 0.03, 600], 'fresh 100K book; spread/debit/delayed-fill rules stay platform-set');
  for (const [k, cap] of Object.entries(DESK_BOT_CAPS)) {
    ok(!parseDeskBotPatch({ [k]: cap.min - cap.step }, def).ok, `${k} below ${cap.min} refused`);
    ok(!parseDeskBotPatch({ [k]: cap.max + cap.step }, def).ok, `${k} above ${cap.max} refused`);
  }
  ok(DESK_BOT_CAPS.minConviction.min >= PLATFORM.minConviction && DESK_BOT_CAPS.riskPerTradePct.max <= PLATFORM.riskPerTradePct
    && DESK_BOT_CAPS.maxRiskDollars.max <= PLATFORM.maxRiskDollars && DESK_BOT_CAPS.maxDebitDollars.max <= PLATFORM.maxDebitDollars
    && DESK_BOT_CAPS.maxProgressPct.max <= PLATFORM.maxProgressPct && DESK_BOT_CAPS.minUnderlyingRR.min >= PLATFORM.minUnderlyingRR
    && DESK_BOT_CAPS.minContractRoiAtT1Pct.min >= PLATFORM.minContractRoiAtT1Pct, 'no cap lets a desk bot be looser than the platform bot');
  ok(!parseDeskBotPatch({ startingCapital: 1e9 }, def).ok && !parseDeskBotPatch({ maxOptionSpreadPct: 1 }, def).ok && !parseDeskBotPatch({ delayedFillNotBeforeEtMinutes: 0 }, def).ok, 'platform-set fields cannot be changed');
  ok(!parseDeskBotPatch({ riskPerTradePct: '2' }, def).ok && !parseDeskBotPatch({ riskPerTradePct: NaN }, def).ok, 'numbers must be numbers');
  ok(!parseDeskBotPatch({ allowLongs: false, allowShorts: false }, def).ok, 'a bot with neither longs nor shorts refused');
  ok(!parseDeskBotPatch({ entryStartEt: 900, entryEndEt: 905 }, def).ok, 'entry window under 15 minutes refused');
  ok(!parseDeskBotPatch({ blockedSymbols: ['NVDA', 'DROP TABLE'] }, def).ok && !parseDeskBotPatch({ blockedSymbols: Array.from({ length: 51 }, (_, i) => `A${i}`) }, def).ok, 'block list: tickers only, at most 50');
  ok(!parseDeskBotPatch([], def).ok && !parseDeskBotPatch(null, def).ok, 'body must be an object');
  const good = parseDeskBotPatch({ riskPerTradePct: 1, maxOpen: 3, allowShorts: false, universe: 'watchlist', blockedSymbols: ['$tsla', 'nvda', 'TSLA'], minStopWidthPct: 2 }, def);
  ok(good.ok, 'a change inside the caps is accepted');
  if (good.ok) {
    eq(good.value.blockedSymbols, ['NVDA', 'TSLA'], 'tickers normalised and de-duplicated');
    eq(good.changed.sort(), ['allowShorts', 'blockedSymbols', 'maxOpen', 'minStopWidthPct', 'riskPerTradePct', 'universe'], 'changed keys reported for the audit log');
  }
  const stored = normalizeStoredDeskConfig({ riskPerTradePct: 9, maxOpen: 99, allowLongs: false, allowShorts: false, blockedSymbols: ['OK', 'bad sym'], universe: 'everything' }, PLATFORM);
  eq([stored.riskPerTradePct, stored.maxOpen, stored.allowLongs, stored.blockedSymbols, stored.universe], [2, 5, true, ['OK'], 'board'], 'a stored row is pulled back inside the caps on read');

  // ── 3. Desk entry rules sit on top of the platform gates ─────────────────
  const cfg: DeskBotConfig = { ...def, allowShorts: false, allowIndex0dte: false, universe: 'watchlist', blockedSymbols: ['TSLA'], minStopWidthPct: 1, entryStartEt: 600, entryEndEt: 900 };
  const wl = new Set(['NVDA', 'AMD', 'TSLA']);
  const at = (m: number) => ({ etMinutes: m, watchlist: wl });
  ok(deskEntryCheck(cfg, { symbol: 'NVDA', direction: 'long', entryPrice: 100, stopLoss: 97 }, null, at(700)).ok, 'long on the watchlist with a 3% stop inside the window: allowed');
  eq((deskEntryCheck(cfg, { symbol: 'NVDA', direction: 'long', entryPrice: 100, stopLoss: 97 }, null, at(599)) as any).code, 'desk_window', 'before the window: refused');
  eq((deskEntryCheck(cfg, { symbol: 'NVDA', direction: 'long', entryPrice: 100, stopLoss: 97 }, null, at(901)) as any).code, 'desk_window', 'after the window: refused');
  eq((deskEntryCheck(cfg, { symbol: 'NVDA', direction: 'short', entryPrice: 100, stopLoss: 103 }, null, at(700)) as any).code, 'desk_no_shorts', 'shorts off: refused');
  eq((deskEntryCheck(cfg, { symbol: 'TSLA', direction: 'long', entryPrice: 100, stopLoss: 95 }, null, at(700)) as any).code, 'desk_blocked', 'blocked symbol: refused');
  eq((deskEntryCheck(cfg, { symbol: 'META', direction: 'long', entryPrice: 100, stopLoss: 95 }, null, at(700)) as any).code, 'desk_universe', 'off-watchlist in watchlist mode: refused');
  eq((deskEntryCheck(cfg, { symbol: 'AMD', direction: 'long', entryPrice: 100, stopLoss: 99.5 }, null, at(700)) as any).code, 'desk_stop_width', 'stop tighter than the desk minimum: refused');
  eq((deskEntryCheck(cfg, { symbol: 'AMD', direction: 'long' }, { source: 'gex_scanner', dataSourceUsed: 'GEX_index_scalp_spx' }, at(700)) as any).code, 'desk_no_0dte', 'index 0DTE off: refused');
  ok(deskEntryCheck({ ...cfg, universe: 'board' }, { symbol: 'META', direction: 'long', entryPrice: 100, stopLoss: 95 }, null, at(700)).ok, 'board mode trades any published pick');

  // ── 4. Ledger ownership and the bot cap ───────────────────────────────────
  eq(deskBotOwnerId('femi'), 'desk-bot:femi', 'desk ledger owner id');
  ok(deskBotOwnerId('femi') !== 'system-quant-bot', "a desk bot never owns the platform bot's book");
  assert.throws(() => deskBotOwnerId('../x')); checks++;
  const rows = [
    { traderSlug: 'c', enabled: true, enabledAt: '2026-10-01T03:00:00Z' }, { traderSlug: 'a', enabled: true, enabledAt: '2026-10-01T01:00:00Z' },
    { traderSlug: 'b', enabled: false, enabledAt: '2026-10-01T00:00:00Z' }, { traderSlug: 'd', enabled: true, enabledAt: '2026-10-01T02:00:00Z' },
    { traderSlug: 'e', enabled: true, enabledAt: '2026-10-01T04:00:00Z' },
  ];
  eq(deskBotsToRun(rows, 3).map((r) => r.traderSlug), ['a', 'd', 'c'], 'at most DESK_BOTS_MAX run, oldest-enabled first, disabled never');
  eq(deskBotsToRun(rows, 0), [], 'DESK_BOTS_MAX=0 runs none');

  // ── 5. Engine wiring (source) ─────────────────────────────────────────────
  const qb = src('server/quant-bot.ts');
  const inner = qb.slice(qb.indexOf('async function runBotCycleInner'), qb.indexOf('export interface BotOpenPositionView'));
  ok(/const alerts = owner\.primary && discordAlerts/.test(inner) && !/if \(discordAlerts\)/.test(inner) && !/announceExit\(/.test(inner.replace('announceExit(pos, px, why, alerts)', '')),
    'every Discord side effect in the cycle is the platform bot only');
  ok(/owner\.primary \? lossRulesMod\.noteBotSkip : \(\) => \{\}/.test(inner), "a desk bot's refusals never reach the platform's blocked-trade ledger");
  ok(/reconcileExpiredBotPositions\(\{ apply: true, ownerId: owner\.userId \}\)/.test(inner), 'expiry settlement is scoped to the owner');
  ok(/if \(owner\.primary\) try \{ await repriceRetiredRuns/.test(inner) && /owner\.primary && gapWatch\.length/.test(inner), 'retired runs + gap watch: platform bot only');
  ok(inner.indexOf('owner.entryCheck') > 0 && inner.indexOf('owner.entryCheck') < inner.indexOf('if (rules.botEntryWindow)')
    && inner.indexOf('if (rules.botConfluence)') > inner.indexOf('owner.entryCheck'), 'desk rules run in ADDITION to the loss-rule gates, before a slot is assigned');
  ok(/getCachedConvictions\(\{\}\)/.test(inner) && /tapeGate/.test(inner), 'desk bots trade the same published board under the same tape gate');
  ok(/if \(owner\.primary \|\| owner\.userId === BOT_USER\) throw/.test(qb), 'runDeskBotCycle refuses to run the platform bot');
  ok(/runBotCycleInner\(cfg\);/.test(qb.slice(qb.indexOf('export async function runBotCycle('), qb.indexOf('export async function runBotCycle(') + 1800)), 'the platform cycle still runs with its default (primary) owner');
  const sched = src('server/quant-bot-schedule.ts');
  ok(/if \(!deskAdminsEnabled\(\)\) return;/.test(sched) && /runDeskBots\(origin\)/.test(sched), 'desk bots run only with DESK_ADMINS=true, after the platform bot');
  ok(/reconcileExpiredBotPositions\(opts: \{[^}]*ownerId\?: string/.test(src('server/bot-reconcile.ts')) && /opts\.ownerId \?\? BOT_USER_ID/.test(src('server/bot-reconcile.ts')), 'reconcile defaults to the platform bot');
  const da = src('server/desk-admin.ts');
  ok(/at most \$\{max\} desk bot/.test(da) && /DESK_BOTS_MAX/.test(da), 'enabling past DESK_BOTS_MAX is refused');
  ok(!/isDevBypass|NODE_ENV/.test(da) && !/NODE_ENV/.test(src('server/desk-admin-routes.ts')), 'no dev bypass in desk access');

  // ── 6. Role isolation through real routes ─────────────────────────────────
  process.env.JWT_SECRET = 'test-desk-admins-secret';
  process.env.ADMIN_EMAIL = 'malik@x.io';
  const dir = mkdtempSync(path.join(tmpdir(), 'qe-desk-audit-'));
  process.env.ADMIN_AUDIT_FILE = path.join(dir, 'actions.jsonl');
  const { requireAdminJWT, generateAdminToken } = await import('../server/auth');
  const { registerAdminOpsRoutes } = await import('../server/admin-ops-routes');
  const { registerDeskAdminRoutes } = await import('../server/desk-admin-routes');
  const { isSuperAdminUser } = await import('../server/desk-admin');
  const { isAccountDisabled } = await import('../server/admin-ops');
  const { readAdminAudit } = await import('../server/admin-audit');

  const users: Record<string, any> = {
    'u-malik': { id: 'u-malik', email: 'Malik@x.io', subscriptionTier: 'pro', hasBetaAccess: true },
    'u-femi': { id: 'u-femi', email: 'femi@x.io', subscriptionTier: 'pro', hasBetaAccess: true },
    'u-uzo': { id: 'u-uzo', email: 'uzo@x.io', subscriptionTier: 'free', hasBetaAccess: false },
    'u-rando': { id: 'u-rando', email: 'r@x.io', subscriptionTier: 'pro', hasBetaAccess: true },
    'u-gone': { id: 'u-gone', email: 'g@x.io', subscriptionTier: 'pro', subscriptionStatus: 'disabled' },
  };
  const book = [
    { id: 't1', slug: 'femi', name: 'Femi', linkedUserId: 'u-femi', passcodeHash: null as string | null, createdAt: '2026-09-29' },
    { id: 't2', slug: 'uzo', name: 'Uzo', linkedUserId: 'u-uzo', passcodeHash: null as string | null, createdAt: '2026-09-29' },
    { id: 't3', slug: 'ayo', name: 'Ayo', linkedUserId: null as string | null, passcodeHash: null as string | null, createdAt: '2026-09-29' },
    { id: 't4', slug: 'gone', name: 'Gone', linkedUserId: 'u-gone', passcodeHash: null as string | null, createdAt: '2026-09-29' },
    { id: 't0', slug: 'leek', name: 'Malik', linkedUserId: 'u-malik', passcodeHash: null as string | null, createdAt: '2026-09-28' },
  ];
  const bots = new Map<string, { enabled: boolean; config: DeskBotConfig }>();
  const writes: string[] = [];
  let flag = true;
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  // Test session: x-test-user stands in for a signed-in session cookie.
  app.use((req, _res, next) => { const u = req.headers['x-test-user']; (req as any).session = u ? { userId: String(u) } : {}; next(); });
  registerAdminOpsRoutes(app, requireAdminJWT);
  registerDeskAdminRoutes(app, requireAdminJWT, {
    enabled: () => flag,
    maxBots: () => 3,
    access: async (req) => {
      const uid = (req as any).session?.userId ?? null;
      const u = uid ? users[uid] : null;
      if (!u) return { role: 'none', userId: null, deskSlug: null };
      return resolveDeskAccess({ userId: uid, isSuperAdmin: isSuperAdminUser(u), disabled: isAccountDisabled(u), traders: book });
    },
    listTraders: async () => book,
    getTrader: async (slug) => book.find((t) => t.slug === slug) ?? null,
    getUser: async (id) => users[id] ?? null,
    isProtectedAdmin: (u) => isSuperAdminUser(u),
    readBot: async (slug) => { const b = bots.get(slug); return { enabled: b?.enabled ?? false, config: b?.config ?? def, exists: !!b, updatedAt: null }; },
    writeBotConfig: async (slug, c) => { writes.push(`config:${slug}`); bots.set(slug, { enabled: bots.get(slug)?.enabled ?? false, config: c }); },
    setBotEnabled: async (slug, on) => { writes.push(`enabled:${slug}:${on}`); bots.set(slug, { enabled: on, config: bots.get(slug)?.config ?? def }); return { ok: true }; },
    listBots: async () => [...bots.entries()].map(([slug, b]) => ({ slug, ...b, exists: true, updatedAt: null })),
    botStatus: async () => ({ setUp: true, enabled: false, portfolio: null }),
    bookStats: async () => ({ trades: 0 }),
    setPasscodeHash: async (slug, h) => { writes.push(`passcode:${slug}:${h ? 'set' : 'clear'}`); const t = book.find((x) => x.slug === slug); if (t) t.passcodeHash = h; },
    hashPasscode: async (c) => `hash(${c.length})`,
    setLinkedUser: async (slug, uid) => { writes.push(`link:${slug}:${uid}`); const t = book.find((x) => x.slug === slug); if (t) t.linkedUserId = uid; },
    runCycle: async (slug) => { writes.push(`run:${slug}`); return { opened: [] }; },
  });
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const call = async (method: string, route: string, as?: string, body?: unknown, headers: Record<string, string> = {}) => {
      const r = await fetch(base + route, {
        method,
        headers: { ...(as ? { 'x-test-user': as } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let j: any = null; try { j = await r.json(); } catch { /* empty */ }
      return { status: r.status, body: j };
    };
    const jwt = (await import('jsonwebtoken')).default;
    const forged = jwt.sign({ isAdmin: true }, 'not-the-secret');

    // 6a. Every platform-admin route refuses a desk admin's session — with no
    // admin token, with a forged one, and with the session of the super-admin's
    // own book holder only when no admin token is present.
    const PLATFORM_ROUTES: [string, string][] = [
      ['GET', '/api/admin/ops/overview'], ['GET', '/api/admin/ops/users'], ['PATCH', '/api/admin/ops/users/u-rando'], ['DELETE', '/api/admin/ops/users/u-rando'],
      ['POST', '/api/admin/ops/users/u-rando/password-reset'], ['GET', '/api/admin/ops/invites'], ['POST', '/api/admin/ops/invites/generate'],
      ['POST', '/api/admin/ops/invites/i1/revoke'], ['POST', '/api/admin/ops/waitlist/approve'], ['GET', '/api/admin/ops/traders'], ['GET', '/api/admin/ops/audit'],
      ['GET', '/api/admin/ops/desks'], ['POST', '/api/admin/ops/desks/femi/assign'], ['DELETE', '/api/admin/ops/desks/uzo/assign'], ['POST', '/api/admin/ops/desks/femi/bot'],
    ];
    for (const [m, r] of PLATFORM_ROUTES) {
      const a = await call(m, r, 'u-femi', m === 'GET' ? undefined : { userId: 'u-femi', enabled: true, tier: 'pro' });
      ok(a.status === 401 || a.status === 403, `desk admin session → ${m} ${r} refused (${a.status})`);
      const b = await call(m, r, 'u-femi', m === 'GET' ? undefined : {}, { Cookie: `admin_token=${forged}` });
      eq(b.status, 403, `desk admin with a forged admin token → ${m} ${r} 403`);
    }
    eq(writes, [], 'no platform-admin write happened for a desk admin');
    // Every /api/admin route in routes.ts, the platform bot's controls and the
    // operator route guards stay admin-only (source).
    const routesSrc = src('server/routes.ts');
    const adminRoutes = [...routesSrc.matchAll(/app\.(get|post|put|patch|delete)\("(\/api\/admin[^"]*)",\s*([^\n]*)/g)];
    const open = adminRoutes.filter(([, , route, rest]) => !/requireAdminJWT|requireAdmin\b/.test(rest) && !['/api/admin/verify-code', '/api/admin/login', '/api/admin/logout'].includes(route));
    eq(open.map((m) => m[2]), [], `all ${adminRoutes.length} /api/admin routes in routes.ts need the admin JWT (only the login steps are open)`);
    for (const r of ['/api/quant-bot/run', '/api/automations/quant-bot/toggle', '/api/automations/quant-bot/scan', '/api/automations/quant-bot/settings']) {
      ok(new RegExp(`app\\.post\\("${r.replace(/\//g, '\\/')}", requireAdminJWT`).test(routesSrc), `Malik's bot: POST ${r} is admin-JWT only`);
    }
    const { guardFor } = await import('../server/route-guards');
    for (const r of ['/api/executor/start', '/api/alpaca/account', '/api/portfolio/positions', '/api/notifications/sms/phone']) {
      eq(guardFor('POST', r), 'operator', `${r} is operator-only (a desk admin is not an admin user)`);
    }
    ok(!isSuperAdminUser(users['u-femi']) && isSuperAdminUser(users['u-malik']), 'the operator check: a desk admin is not admin; ADMIN_EMAIL (any case) is');
    ok(!/desk/.test(src('server/admin-ops.ts')) && !/subscriptionTier.*desk|tier.*'desk'/.test(src('server/desk-admin-routes.ts')), 'desk admin is never a tier: it grants no paid feature and no admin tier');

    // 6b. The desk routes.
    const DESK_ROUTES: [string, string, unknown?][] = [
      ['GET', '/api/desk/SLUG'], ['GET', '/api/desk/SLUG/bot'], ['PATCH', '/api/desk/SLUG/bot', { riskPerTradePct: 1 }],
      ['POST', '/api/desk/SLUG/bot/enabled', { enabled: true }], ['PUT', '/api/desk/SLUG/passcode', { passcode: 'abcdef12' }],
      ['POST', '/api/desk/SLUG/bot/run', {}],
    ];
    for (const [m, r, b] of DESK_ROUTES) {
      const own = r.replace('SLUG', 'femi');
      const anon = await call(m, own, undefined, b);
      eq(anon.status, 401, `signed out → ${m} ${own} 401`);
      for (const other of ['uzo', 'ayo', 'leek', 'nope', 'UZO']) {
        const x = await call(m, r.replace('SLUG', other), 'u-femi', b);
        eq(x.status, 403, `desk admin femi → ${m} ${r.replace('SLUG', other)} 403`);
      }
      eq((await call(m, own, 'u-rando', b)).status, 403, `unlinked member → ${m} ${own} 403`);
      eq((await call(m, r.replace('SLUG', 'gone'), 'u-gone', b)).status, 403, `disabled linked account → ${m} its own desk 403`);
    }
    eq(writes, [], "no write happened on another trader's desk, for a stranger, or signed out");
    for (const [m, r, b] of DESK_ROUTES) {
      const own = r.replace('SLUG', 'femi');
      const res = await call(m, own, 'u-femi', b);
      if (r.endsWith('/run')) eq(res.status, 403, 'a desk admin cannot force a cycle (super-admin only — CPU)');
      else eq(res.status, 200, `desk admin femi → ${m} ${own} 200`);
      for (const s of ['uzo', 'femi', 'ayo']) eq((await call(m, r.replace('SLUG', s), 'u-malik', b)).status, 200, `super-admin → ${m} ${r.replace('SLUG', s)} 200`);
    }
    ok(writes.includes('config:femi') && writes.includes('enabled:femi:true') && writes.includes('passcode:femi:set') && writes.includes('run:uzo'), 'own-desk writes landed; the super-admin ran a cycle');

    // caps through the route
    const bad = await call('PATCH', '/api/desk/femi/bot', 'u-femi', { riskPerTradePct: 5 });
    ok(bad.status === 400 && /between/.test(bad.body?.error ?? ''), 'over-cap risk → 400 with the reason');
    eq((await call('PATCH', '/api/desk/femi/bot', 'u-femi', { startingCapital: 1e9 })).status, 400, 'platform-set field → 400');
    eq((await call('PUT', '/api/desk/femi/passcode', 'u-femi', { passcode: 'abc' })).status, 400, 'short passcode → 400');
    eq((await call('PUT', '/api/desk/femi/passcode', 'u-femi', { passcode: 42 })).status, 400, 'non-string passcode → 400');

    // /api/desk/me — what the client hook reads
    const meF = await call('GET', '/api/desk/me', 'u-femi');
    eq([meF.status, meF.body.role, meF.body.deskSlug, meF.body.isSuperAdmin, meF.body.desks], [200, 'desk', 'femi', false, undefined], 'me: femi is the femi desk admin and sees no other desk');
    const meM = await call('GET', '/api/desk/me', 'u-malik');
    ok(meM.body.role === 'super' && meM.body.isSuperAdmin && meM.body.desks.length === book.length, 'me: super-admin sees every desk');
    eq((await call('GET', '/api/desk/me')).body.role, 'none', 'me: signed out is none (200, like /api/auth/me)');

    // flag off
    flag = false;
    eq((await call('GET', '/api/desk/femi', 'u-femi')).status, 404, 'DESK_ADMINS off → desk routes 404');
    eq((await call('GET', '/api/desk/femi', 'u-malik')).status, 404, 'DESK_ADMINS off → 404 for the super-admin too');
    const meOff = await call('GET', '/api/desk/me', 'u-malik');
    ok(meOff.body.enabled === false && meOff.body.isSuperAdmin === true && meOff.body.deskSlug === null, 'flag off: me still reports the super-admin (Admin link), no desk');
    flag = true;

    // 6c. Hub: assign / unassign (admin JWT)
    const hub = { Cookie: `admin_token=${generateAdminToken()}` };
    const list = await call('GET', '/api/admin/ops/desks', undefined, undefined, hub);
    ok(list.status === 200 && list.body.desks.find((d: any) => d.slug === 'femi')?.deskAdmin?.email === 'femi@x.io', 'hub lists each desk with its desk admin');
    eq((await call('POST', '/api/admin/ops/desks/ayo/assign', undefined, { userId: 'u-femi' }, hub)).status, 409, 'one person runs one desk');
    eq((await call('POST', '/api/admin/ops/desks/femi/assign', undefined, { userId: 'u-rando' }, hub)).status, 409, 'a desk with a desk admin needs an explicit replace');
    eq((await call('POST', '/api/admin/ops/desks/ayo/assign', undefined, { userId: 'u-malik' }, hub)).status, 400, 'the super-admin is not made a desk admin');
    eq((await call('POST', '/api/admin/ops/desks/ayo/assign', undefined, { userId: 'u-gone' }, hub)).status, 400, 'a disabled account cannot be assigned');
    eq((await call('POST', '/api/admin/ops/desks/ayo/assign', undefined, { userId: "x' OR 1=1" }, hub)).status, 400, 'odd user id → 400');
    const asg = await call('POST', '/api/admin/ops/desks/ayo/assign', undefined, { userId: 'u-rando' }, hub);
    ok(asg.status === 200 && book.find((t) => t.slug === 'ayo')?.linkedUserId === 'u-rando', 'assign links the user to the book');
    eq((await call('GET', '/api/desk/ayo', 'u-rando')).status, 200, 'the new desk admin reaches their desk at once');
    eq((await call('GET', '/api/desk/femi', 'u-rando')).status, 403, "…and still not someone else's");
    const un = await call('DELETE', '/api/admin/ops/desks/ayo/assign', undefined, undefined, hub);
    ok(un.status === 200 && book.find((t) => t.slug === 'ayo')?.linkedUserId === null, 'unassign clears the link');
    eq((await call('GET', '/api/desk/ayo', 'u-rando')).status, 403, 'an unassigned desk admin loses the desk immediately');
    eq((await call('POST', '/api/admin/ops/desks/uzo/assign', undefined, { userId: 'u-rando', replace: true }, hub)).status, 200, 'explicit replace works');
    eq((await call('GET', '/api/desk/uzo', 'u-uzo')).status, 403, 'the replaced desk admin is out');

    // 6d. Audit
    const log = readAdminAudit(200);
    const cfgRow = log.find((e) => e.action === 'desk.bot_config' && e.target === 'femi' && e.actor === 'user:u-femi');
    ok(cfgRow && (cfgRow.detail as any).role === 'desk' && (cfgRow.detail as any).changed?.riskPerTradePct === 1, 'desk admin config change is audited with actor, role and the change');
    ok(log.some((e) => e.action === 'desk.passcode_set' && e.target === 'femi') && !JSON.stringify(log).includes('abcdef12'), 'passcode set is audited, the passcode never is');
    ok(log.some((e) => e.action === 'desk.bot_enable' && e.actor === 'user:u-femi'), 'bot enable audited');
    ok(log.some((e) => e.action === 'desk.bot_run' && e.actor === 'user:u-malik' && (e.detail as any).role === 'super'), 'super-admin run audited as super');
    ok(['desk.assign', 'desk.unassign'].every((a) => log.some((e) => e.action === a && e.actor === 'admin-hub')), 'assign / unassign audited from the hub');
  } finally { server.close(); }

  // ── 7. Client ────────────────────────────────────────────────────────────
  const hook = src('client/src/lib/desk-role.ts');
  ok(/export function useDeskRole/.test(hook) && /\/api\/desk\/me/.test(hook) && /isSuperAdmin/.test(hook) && /deskSlug/.test(hook), 'useDeskRole() exported for the nav (isSuperAdmin, deskSlug)');
  const app2 = src('client/src/App.tsx');
  ok(/<Route path="\/desk" component=\{DeskPortal\}/.test(app2) && /<Route path="\/desk\/:slug" component=\{DeskPortal\}/.test(app2), '/desk and /desk/:slug routed');
  const pal = src('client/src/components/command-palette.tsx');
  ok(/useDeskRole\(\)/.test(pal) && /href: '\/admin'/.test(pal) && /href: '\/desk'/.test(pal), 'command palette: Admin (super) and My desk (desk admin) entries, role-gated');
  const usersPage = src('client/src/pages/admin/users.tsx');
  ok(/\/api\/admin\/ops\/desks/.test(usersPage) && /Make desk admin/.test(usersPage), '/admin/users has the Desk admins section');

  console.log(`desk-admins: ${checks} checks pass`);
}

main().catch((e) => { console.error(e); process.exit(1); });
