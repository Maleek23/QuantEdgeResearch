/**
 * TEST-HARNESS ADMIN FIXTURES — synthetic answers for every admin-hub GET.
 *
 * DEV-only companion to harness-fixtures.ts (client/src/dev/harness.ts routes
 * /api requests here first). Nothing here touches a server or database: every
 * row is invented, every person is "Fixture user N" @example.test, and sources
 * read `test_harness_fixture`. Shapes follow the client types in
 * client/src/pages/admin/* + components/admin/* and the matching server routes.
 */
import type { AdminAuditRow, AdminInviteRow, AdminUserRow, HealthResponse } from '@/components/admin/hub-data';
import type { IntakeProfile } from '@shared/intake';
import type { RoadmapItem } from '@shared/roadmap';
import type { QuantinumAiConfig } from '@shared/quantinum-ai';
import type { SelfSetupBlock } from '@shared/trader-self-setup';
import type { TraderAccountStatus } from '@shared/trader-accounts';

export interface AdminFixtureAnswer { status: number; body: unknown }

const SRC = 'test_harness_fixture';
const MIN = 60e3, HOUR = 3600e3, DAY = 864e5;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();
const etDay = (offsetDays = 0) => new Date(Date.now() - offsetDays * DAY).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/* ── Users ─────────────────────────────────────────────────────────────── */
const TIERS: AdminUserRow['tier'][] = ['free', 'advanced', 'pro', 'free', 'free', 'pro', 'advanced', 'free'];
const USERS: AdminUserRow[] = [
  { id: 'fx-user-admin', email: 'fixture-admin@example.test', name: 'Fixture admin', tier: 'admin', hasBetaAccess: true, disabled: false, isAdmin: true, createdAt: ago(200 * DAY), lastLoginAt: ago(12 * MIN), authMethod: 'password' },
  ...TIERS.map((tier, i): AdminUserRow => ({
    id: `fx-user-${i + 1}`, email: `fixture-user-${i + 1}@example.test`, name: i === 3 ? null : `Fixture user ${i + 1}`, tier,
    hasBetaAccess: i % 3 !== 2, disabled: i === 5, isAdmin: false, createdAt: ago((i * 9 + 2) * DAY),
    lastLoginAt: i === 6 ? null : ago((i * 7 + 1) * HOUR), authMethod: i % 4 === 1 ? 'google' : 'password',
  })),
];

const userDetail = (id: string) => {
  const u = USERS.find((x) => x.id === id);
  return u ? { user: u, source: SRC } : null;
};

/* ── Invites ───────────────────────────────────────────────────────────── */
const INVITE_STATUSES: AdminInviteRow['status'][] = ['unused', 'unused', 'used', 'expired', 'revoked', 'unused'];
const INVITES: AdminInviteRow[] = INVITE_STATUSES.map((status, i) => {
  const code = `FIXTURE-${(1000 + i * 37).toString(36).toUpperCase()}`;
  return {
    id: `fx-invite-${i + 1}`, code, link: `/signup?code=${code}`, email: i % 2 ? `fixture-invitee-${i + 1}@example.test` : null, status,
    rawStatus: status === 'unused' ? 'pending' : status, tierOverride: i === 1 ? 'advanced' : null, note: i === 0 ? 'Fixture batch (synthetic)' : null,
    createdAt: ago((i + 1) * 2 * DAY), expiresAt: status === 'expired' ? ago(DAY) : ahead((14 - i) * DAY), sentAt: i % 2 ? ago((i + 1) * DAY) : null,
    redeemedAt: status === 'used' ? ago(3 * DAY) : null, redeemedBy: status === 'used' ? { id: 'fx-user-2', email: 'fixture-user-2@example.test' } : null,
  };
});

/* ── Audit (admin actions log) ─────────────────────────────────────────── */
const AUDIT: AdminAuditRow[] = ([
  ['invite.generate', 'FIXTURE batch', { count: 3, tier: 'free' }],
  ['waitlist.approve', 'fixture-waiter-2@example.test', { emailed: true }],
  ['user.tier', 'fixture-user-3@example.test', { from: 'free', to: 'pro' }],
  ['user.disable', 'fixture-user-6@example.test', {}],
  ['trader.passcode_set', 'fixture-book-a', {}],
  ['trader_account.create', 'Fixture trader A', { method: 'link' }],
  ['invite.revoke', 'FIXTURE-SAMPLE', {}],
  ['desk.assign', 'fixture-book-b', { userId: 'fx-user-2' }],
] as Array<[string, string, Record<string, unknown>]>).map(([action, target, detail], i) => ({
  at: ago((i * 3 + 1) * HOUR), action, actor: 'fixture-admin', target, detail, ip: i % 3 ? '203.0.113.7' : null,
}));

/* ── Intake profiles ───────────────────────────────────────────────────── */
const profile = (n: number, consent: boolean): IntakeProfile => ({
  name: `Fixture user ${n}`, experience: n % 2 ? 'lt1' : '1to3', markets: n % 2 ? ['stocks', 'options'] : ['0dte'], accountSize: n % 2 ? '1to5k' : 'lt1k',
  goal: n % 2 ? 'ideas' : 'learn', source: 'discord', occupation: 'Fixture occupation', timezone: 'America/New_York', tradingTime: 'open',
  struggle: n === 2 ? 'Synthetic struggle text for the harness — not a real answer.' : undefined, tools: ['tradingview'],
  consentEmails: consent, ackNotAdvice: true, submittedAt: ago(n * DAY), via: 'waitlist',
});

/* ── Waitlist (ops) ────────────────────────────────────────────────────── */
const WAIT_STATUSES = ['pending', 'pending', 'approved', 'invited', 'joined', 'rejected'];
const waitlistOps = () => {
  const entries = WAIT_STATUSES.map((status, i) => {
    const code = `FIXTURE-W${i}`;
    const invite = status === 'approved' || status === 'invited' || status === 'joined'
      ? { id: `fx-winv-${i}`, code, link: `/signup?code=${code}`, status: status === 'joined' ? 'used' : 'pending', sentAt: status === 'approved' ? null : ago(DAY), expiresAt: ahead(10 * DAY), emailError: status === 'approved' ? 'fixture: sandbox sender refused (synthetic failure)' : null }
      : null;
    return {
      id: `fx-wait-${i + 1}`, email: `fixture-waiter-${i + 1}@example.test`, source: i % 2 ? 'landing' : SRC, referralCode: null, status, createdAt: ago((i + 1) * 5 * HOUR),
      referrer: i === 1 ? 'https://example.test/fixture-post' : null, landingPath: '/', utm: i === 0 ? { utm_source: 'fixture', utm_campaign: 'harness' } : null,
      invite, profile: i < 3 ? profile(i + 1, i !== 1) : null,
    };
  });
  return { entries, count: entries.length, sender: { configured: true, from: 'fixture-sender@example.test', sandbox: false, problem: null } };
};

/* ── Trader books / accounts / desks / self-setup ──────────────────────── */
const BOOKS = [
  { slug: 'fixture-book-a', name: 'Fixture trader A' },
  { slug: 'fixture-book-b', name: 'Fixture trader B' },
  { slug: 'fixture-book-c', name: 'Fixture trader C' },
  { slug: 'fixture-book-d', name: 'Fixture trader D' },
];
const ACCT_STATUSES: TraderAccountStatus[] = ['active', 'setup_pending', 'temp_password', 'setup_expired'];
const traderAccounts = () => ({
  traders: BOOKS.map((b, i) => ({ ...b, hasDeskAdmin: i === 1 })),
  accounts: ACCT_STATUSES.map((status, i) => ({
    id: `fx-tacct-${i + 1}`, displayName: BOOKS[i].name, login: BOOKS[i].slug, email: i === 3 ? `fixture-trader-${i + 1}@example.test` : null, username: i === 3 ? null : BOOKS[i].slug,
    status, linkExpiresAt: status === 'setup_pending' ? ahead(20 * HOUR) : status === 'setup_expired' ? ago(4 * HOUR) : null,
    traderSlug: BOOKS[i].slug, traderName: i === 3 ? null : BOOKS[i].name, tier: 'pro', hasBetaAccess: i !== 2, createdAt: ago((i + 2) * DAY),
  })),
});
const desks = () => ({
  enabled: true, setUp: true, maxBots: 3, enabledBots: 1,
  desks: BOOKS.map((b, i) => ({
    ...b,
    deskAdmin: i === 1 ? { id: 'fx-user-2', email: 'fixture-user-2@example.test', hasBetaAccess: true, isSuperAdmin: false }
      : i === 2 ? { id: 'fx-user-3', email: 'fixture-user-3@example.test', hasBetaAccess: false, isSuperAdmin: false } : null,
    bot: { enabled: i === 1, updatedAt: i === 1 ? ago(2 * DAY) : null },
  })),
});
const SELF_BLOCKS: Array<SelfSetupBlock | null> = ['linked', null, 'no_passcode', 'book_off'];
const selfSetup = () => ({
  envOn: true, enabled: true, open: true,
  books: BOOKS.map((b, i) => ({ ...b, offered: SELF_BLOCKS[i] === null, block: SELF_BLOCKS[i], closed: SELF_BLOCKS[i] === 'book_off' })),
});
const traders = () => ({ traders: BOOKS.map((b, i) => ({ ...b, locked: i !== 2, linked: i < 2, source: i === 3 ? null : SRC })) });

/* ── Overview / hub status / system ────────────────────────────────────── */
const overview = () => {
  const byTier: Record<string, number> = {};
  for (const u of USERS) byTier[u.tier] = (byTier[u.tier] ?? 0) + 1;
  const n = (s: AdminInviteRow['status']) => INVITES.filter((i) => i.status === s).length;
  return {
    users: { total: USERS.length, byTier, betaAccess: USERS.filter((u) => u.hasBetaAccess).length, disabled: USERS.filter((u) => u.disabled).length, signups7d: 2, signups30d: 5, seen24h: 4, seen7d: 7 },
    sessions: { active: 6, users: 4 },
    waitlist: { total: WAIT_STATUSES.length, byStatus: { pending: 2, approved: 1, invited: 1, joined: 1, rejected: 1 } },
    invites: { issued: INVITES.length, unused: n('unused'), used: n('used'), expired: n('expired'), revoked: n('revoked') },
    jobs: [
      { id: 'convictions', label: 'Convictions scan (fixture)', cadence: 'every 5 min in market hours', asOf: ago(3 * MIN), ageSec: 180, stale: false },
      { id: 'flow', label: 'Flow tape sync (fixture)', cadence: 'every 1 min', asOf: ago(40e3), ageSec: 40, stale: false },
      { id: 'outcomes', label: 'Outcome tracker (fixture)', cadence: 'every 15 min', asOf: ago(3 * HOUR), ageSec: 10800, stale: true },
      { id: 'weekly-path', label: 'Weekly path (fixture)', cadence: 'daily 09:00 ET', asOf: null, ageSec: null, stale: true },
    ],
    web: { rssMb: 412, heapUsedMb: 188, uptimeSec: 3 * 86400 + 4 * 3600 },
    worker: { pid: 4242, rssMb: 655, peakRssMb: 801, heapUsedMb: 301, uptimeSec: 2 * 86400, asOf: ago(20e3), ageSec: 20 },
    at: ago(0),
  };
};
const hubStatus = () => ({
  release: { label: 'Fixture release', version: '0.0.0-fixture', series: 'harness', date: etDay() },
  gitSha: 'f1x7ure0000000000000000000000000000000000', env: 'development',
  process: { pid: 4241, node: 'v22.0.0', uptimeSec: 3 * 86400, rssMb: 412, heapUsedMb: 188, heapTotalMb: 256, pm2: { id: 0, name: 'quantedge-fixture', restarts: 2 } },
  faultsSinceBoot: { unhandledRejection: 1, uncaughtException: 0, dbTimeout: 2 },
  discord: { botConfigured: true },
  ideaProducersInWeb: false,
  api: {
    summary: { failingAPIs: 1, rateLimitWarnings: 1, unresolvedAlerts: 1, criticalAlerts: 0, totalAPIMetrics: 14 },
    rateLimited: [{ provider: 'fixture-provider', endpoint: '/v1/fixture/quotes', failureCount: 3, lastFailure: ago(25 * MIN) }],
  },
  at: ago(0),
});
/** Only for admin pages that read /api/health directly (harness-fixtures answers /api/health too). */
export const adminHealthFixture = (): HealthResponse => ({
  release: '0.0.0-fixture', status: 'degraded', timestamp: ago(5e3), uptimeSec: 3 * 86400, memMb: 412, version: '0.0.0-fixture', env: 'development',
  checks: { postgres: { ok: true, latencyMs: 4, required: true } }, dataPartial: true, dataPartialProviders: ['Fixture feed B'],
  dataProviders: [
    { id: 'fx-a', label: 'Fixture feed A', role: 'quotes', configured: true, state: 'ok', lastSuccessAt: ago(15e3), lastFailureAt: null, detail: SRC },
    { id: 'fx-b', label: 'Fixture feed B', role: 'options chains', configured: true, state: 'degraded', lastSuccessAt: ago(9 * MIN), lastFailureAt: ago(MIN), detail: 'fixture: synthetic 429s' },
    { id: 'fx-c', label: 'Fixture feed C', role: 'news', configured: false, state: 'not_configured', lastSuccessAt: null, lastFailureAt: null, detail: null },
  ],
});
const dbHealth = () => ({
  databaseSize: '1.2 GB (fixture)',
  tables: [['trade_ideas', '512 MB', 120400], ['options_flow_history', '388 MB', 2100500], ['outcome_events', '96 MB', 88000], ['users', '2 MB', USERS.length], ['waitlist', '1 MB', WAIT_STATUSES.length]]
    .map(([name, size, rowCount]) => ({ name: String(name), size: String(size), rowCount: Number(rowCount) })),
});
const aiStatus = () => ({
  groq: { status: 'configured', model: 'fixture-model-small' },
  gemini: { status: 'configured', model: 'fixture-model-flash' },
  anthropic: { status: 'not_configured', message: 'fixture: no key' },
  openai: { status: 'not_configured', message: 'fixture: no key' },
});
const securityStats = () => ({
  last24HoursRequests: 312, failedAttempts: 2, blockedIPs: 1, uniqueIPs: 3,
  recentFailedLogins: [{ ip: '203.0.113.9', count: 5, blockedUntil: ahead(40 * MIN) }, { ip: '198.51.100.4', count: 1, blockedUntil: null }],
});
const auditLogs = (limit: number) => {
  const logs = Array.from({ length: Math.min(limit, 12) }, (_, i) => ({
    id: `fx-alog-${i}`, timestamp: ago((i + 1) * 9 * MIN), action: ['VIEW_SECURITY_STATS', 'VIEW_AUDIT_LOGS', 'ADMIN_LOGIN', 'UPDATE_USER'][i % 4],
    endpoint: ['/api/admin/security-stats', '/api/admin/audit-logs', '/api/admin/login', '/api/admin/ops/users/fx-user-3'][i % 4], method: i % 4 === 3 ? 'PATCH' : i % 4 === 2 ? 'POST' : 'GET',
    responseStatus: i === 6 ? 401 : 200,
  }));
  return { logs, total: 12 };
};

/* ── Quantinum AI / Discord lifecycle ──────────────────────────────────── */
const AI_DEFAULTS: QuantinumAiConfig = {
  quick: [{ provider: 'groq', model: 'fixture-model-small' }, { provider: 'gemini', model: 'fixture-model-flash' }],
  deep: [{ provider: 'gemini', model: 'fixture-model-pro' }, { provider: 'anthropic', model: 'fixture-model-deep' }],
  updatedAt: null, updatedBy: null,
};
const quantinumAi = () => ({
  mode: 'admin' as const, capUsd: 5, today: etDay(), spentTodayUsd: 0.4123,
  config: { ...AI_DEFAULTS, updatedAt: ago(2 * DAY), updatedBy: 'fixture-admin' }, defaults: AI_DEFAULTS,
  providersWithKey: { groq: true, gemini: true, anthropic: false, openai: false },
  usage: {
    days: [0, 1, 2].map((d) => ({ day: etDay(d), questions: 14 - d * 4, answered: 13 - d * 4, blocked: d === 0 ? 1 : 0, costUsd: 0.41 - d * 0.1, inputTokens: 42000 - d * 9000, outputTokens: 9100 - d * 2000 })),
    byProvider: [
      { provider: 'groq', model: 'fixture-model-small', questions: 22, costUsd: 0.31, fallbacks: 0, errors: 1 },
      { provider: 'gemini', model: 'fixture-model-flash', questions: 6, costUsd: 0.48, fallbacks: 2, errors: 0 },
    ],
    byTier: [{ tier: 'pro', questions: 18 }, { tier: 'advanced', questions: 7 }, { tier: 'free', questions: 3 }],
    topUsersToday: [{ userKey: 'fx-user-3-fixture', tier: 'pro', questions: 6 }, { userKey: 'fx-user-2-fixture', tier: 'advanced', questions: 4 }],
  },
  note: 'Test-harness fixture — no AI provider was called.',
});
const discordLifecycle = () => ({
  enabled: true, env: 'fixture', outbox: 2, caps: { perHour: 6, perDay: 30 },
  channels: [
    { key: 'swing', label: '#swing-ideas (fixture)', env: 'DISCORD_FIXTURE_SWING', configured: true, on: true, cardsToday: 4, openCards: 3, pending: 0, capped: 0, recapToday: false },
    { key: 'zerodte', label: '#0dte-ideas (fixture)', env: 'DISCORD_FIXTURE_0DTE', configured: true, on: false, cardsToday: 0, openCards: 0, pending: 2, capped: 1, recapToday: false },
    { key: 'leaps', label: '#leaps (fixture)', env: 'DISCORD_FIXTURE_LEAPS', configured: false, on: false, cardsToday: 0, openCards: 0, pending: 0, capped: 0, recapToday: false },
  ],
  lastError: { at: Date.now() - 50 * MIN, channel: 'swing', message: 'fixture: webhook 429 (synthetic)' },
});

/* ── Roadmap / updates / blog / desk role ──────────────────────────────── */
const ROADMAP: RoadmapItem[] = ([
  ['Fixture shipped item', 'NEXUS', 'shipped', 'high', -3, 'all', true],
  ['Fixture in-progress item', 'GEX', 'in_progress', 'medium', 5, 'pro', true],
  ['Fixture planned item', 'Journal', 'planned', 'medium', 20, 'beginner', false],
  ['Fixture idea', 'Infra', 'idea', 'low', null, 'all', false],
] as const).map(([title, area, status, priority, days, audience, announce], i) => ({
  id: `fx-road-${i + 1}`, title, description: `Synthetic roadmap row ${i + 1} — test harness only.`, area, status, priority,
  targetDate: days == null ? null : new Date(Date.now() + days * DAY).toISOString().slice(0, 10), audience, announce,
  createdAt: ago((10 - i) * DAY), updatedAt: ago((i + 1) * HOUR),
}));
const updates = () => ({
  items: ROADMAP.filter((r) => r.status === 'shipped' || r.status === 'in_progress')
    .map(({ id, title, description, area, status, targetDate, audience }) => ({ id, title, description, area, status, targetDate, audience })),
});
const blog = () => (['published', 'draft', 'archived'] as const).map((status, i) => ({
  id: `fx-blog-${i + 1}`, slug: `fixture-post-${i + 1}`, title: `Fixture post ${i + 1}`, excerpt: 'Synthetic excerpt — test harness fixture.',
  content: `# Fixture post ${i + 1}\n\nThis text is a test-harness fixture, not published content.`, heroImageUrl: null,
  category: (['education', 'platform-updates', 'market-commentary'] as const)[i], tags: ['fixture', 'harness'], authorId: 'fx-user-admin',
  authorName: 'Fixture author', status, metaDescription: 'Fixture meta description', metaKeywords: 'fixture, harness',
  publishedAt: status === 'published' ? ago((i + 1) * DAY) : null, createdAt: ago((i + 3) * DAY), updatedAt: ago((i + 1) * HOUR),
}));
const deskMe = () => ({ enabled: true, role: 'super' as const, isSuperAdmin: true, deskSlug: null, desks: BOOKS.map(({ slug, name }) => ({ slug, name })) });

/* ── Legacy admin endpoints (routes.ts) ───────────────────────────────── */
const legacyStats = () => ({ totalUsers: USERS.length, premiumUsers: USERS.filter((u) => u.tier === 'pro').length, totalIdeas: 1204, activeIdeas: 32, closedIdeas: 88, expiredIdeas: 72, wins: 37, losses: 51, winRate: 42 });
const legacyActivity = () => Array.from({ length: 6 }, (_, i) => ({ id: `fx-act-${i}`, type: ['signup', 'idea', 'login'][i % 3], description: `Fixture activity ${i + 1} (synthetic)`, timestamp: ago((i + 1) * 23 * MIN) }));
const legacyAnalytics = () => ({ totalUsers: USERS.length, activeUsers24h: 4, totalPageViews24h: 640, topPages: [{ path: '/t', count: 210 }, { path: '/today', count: 160 }, { path: '/settings', count: 12 }] });

/** Answer one admin-hub GET with a fixture, or null when the path isn't an admin fixture. */
export function adminHarnessApi(pathname: string, search: URLSearchParams): AdminFixtureAnswer | null {
  const p = pathname.replace(/\/+$/, '');
  const ok = (body: unknown): AdminFixtureAnswer => ({ status: 200, body });
  switch (p) {
    case '/api/admin/check-auth': return ok({ authenticated: true, expiresAt: ahead(8 * HOUR), absoluteExpiresAt: ahead(12 * HOUR) });
    case '/api/admin/ops/overview': return ok(overview());
    case '/api/admin/hub/status': return ok(hubStatus());
    case '/api/admin/ops/users': return ok({ users: USERS });
    case '/api/admin/ops/invites': return ok({ invites: INVITES });
    case '/api/admin/ops/desks': return ok(desks());
    case '/api/admin/ops/audit': {
      const limit = Math.max(1, Math.min(500, Number(search.get('limit')) || 100));
      return ok({ entries: AUDIT.slice(0, limit) });
    }
    case '/api/admin/ops/intake-profiles': return ok({ members: [{ email: 'fixture-user-1@example.test', profile: profile(4, true) }, { email: 'fixture-user-2@example.test', profile: profile(5, false) }] });
    case '/api/admin/ops/trader-self-setup': return ok(selfSetup());
    case '/api/admin/ops/waitlist': return ok(waitlistOps());
    case '/api/admin/ops/traders': return ok(traders());
    case '/api/admin/ops/trader-accounts': return ok(traderAccounts());
    case '/api/admin/security-stats': return ok(securityStats());
    case '/api/admin/database-health': return ok(dbHealth());
    case '/api/admin/ai-provider-status': return ok(aiStatus());
    case '/api/admin/email-status': return ok({ configured: true, provider: 'resend', fromEmail: 'fixture-sender@example.test', sandbox: false, problem: null });
    case '/api/admin/discord-lifecycle': return ok(discordLifecycle());
    case '/api/admin/quantinum-ai': return ok(quantinumAi());
    case '/api/admin/roadmap': return ok({ items: ROADMAP });
    case '/api/admin/blog': return ok(blog());
    case '/api/admin/audit-logs': return ok(auditLogs(Math.max(1, Number(search.get('limit')) || 50)));
    case '/api/admin/stats': return ok(legacyStats());
    case '/api/admin/activity': return ok(legacyActivity());
    case '/api/admin/analytics': return ok(legacyAnalytics());
    case '/api/admin/invites': return ok(INVITES.map((i) => ({ id: i.id, code: i.code, email: i.email, status: i.rawStatus, createdAt: i.createdAt, expiresAt: i.expiresAt })));
    case '/api/admin/waitlist': return ok({ entries: waitlistOps().entries.map(({ id, email, source, status, createdAt }) => ({ id, email, source, status, createdAt })) });
    case '/api/updates': return ok(updates());
    case '/api/blog': return ok(blog().filter((b) => b.status === 'published'));
    case '/api/desk/me': return ok(deskMe());
  }
  const u = p.match(/^\/api\/admin\/(?:ops\/)?users\/([^/]+)$/);
  if (u) { const d = userDetail(decodeURIComponent(u[1])); return d ? ok(d) : { status: 404, body: { error: 'fixture: no such user' } }; }
  return null;
}
