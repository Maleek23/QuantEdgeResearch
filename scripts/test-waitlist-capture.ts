/**
 * Waitlist capture, lost-signup recovery and approve → invite email (2026-10-07).
 *   npx tsx scripts/test-waitlist-capture.ts      (npm run test:waitlist)
 *
 * No database, no network, NO real email: every sender here is a mock and
 * RESEND_API_KEY is unset for the run.
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
  delete process.env.RESEND_API_KEY;
  process.env.JWT_SECRET = 'test-waitlist-secret';

  // ── 1. Attribution parsing ────────────────────────────────────────────────
  const { parseAttribution, captureWaitlistEmail, hasAttribution, _resetAttributionState } = await import('../server/waitlist-capture');
  const a = parseAttribution({
    referrer: 'https://t.co/abc?token=secret#x', landingPath: '/pricing?utm_source=x',
    utm: { utm_source: 'twitter', utm_campaign: 'launch week', utm_medium: '<script>', evil: 'x', utm_term: 'a'.repeat(101) },
  });
  eq(a, { referrer: 'https://t.co/abc', landingPath: '/pricing', utm: { utm_source: 'twitter', utm_campaign: 'launch week' } }, 'referrer loses its query, path loses its query, utm whitelisted + clean values only');
  eq(parseAttribution({ referrer: 'javascript:alert(1)', landingPath: '//evil.com/x', utm: 'nope' }), { referrer: null, landingPath: null, utm: null }, 'non-http referrer and protocol-relative path dropped');
  eq(parseAttribution(null), { referrer: null, landingPath: null, utm: null }, 'no body → empty attribution, no throw');
  ok(!hasAttribution(parseAttribution({})) && hasAttribution(a), 'hasAttribution');

  // ── 2. captureWaitlistEmail (mock storage) ───────────────────────────────
  const rows = new Map<string, { id: string; email: string; source: string }>();
  const attrWrites: string[] = [];
  const fallbackRows: unknown[] = [];
  let failCreate: unknown = null;
  let attrError: unknown = null;
  const deps = {
    getWaitlistEntry: async (email: string) => rows.get(email) ?? null,
    createWaitlistEntry: async (e: { email: string; source: string }) => {
      if (failCreate) throw failCreate;
      const row = { id: `w${rows.size + 1}`, email: e.email, source: e.source };
      rows.set(e.email, row);
      return row;
    },
    execAttribution: async (id: string) => { if (attrError) throw attrError; attrWrites.push(id); },
    fallback: (row: unknown) => { fallbackRows.push(row); return true; },
  };
  const c1 = await captureWaitlistEmail(deps, { email: '  Jane@Gmail.COM ', source: 'google', attribution: a });
  eq(c1, { status: 'created', id: 'w1', email: 'jane@gmail.com' }, 'new email → created, lower-cased + trimmed');
  eq(rows.get('jane@gmail.com')?.source, 'google', 'source stored');
  eq(attrWrites, ['w1'], 'attribution written for the new row');
  eq((await captureWaitlistEmail(deps, { email: 'JANE@gmail.com', source: 'signup' })).status, 'exists', 'same email, other case → exists (deduped)');
  eq(rows.size, 1, 'no second row');
  eq((await captureWaitlistEmail(deps, { email: 'not-an-email', source: 'signup' })).status, 'invalid', 'junk → invalid, nothing written');
  eq((await captureWaitlistEmail(deps, { email: undefined, source: 'signup' })).status, 'invalid', 'missing → invalid');
  eq((await captureWaitlistEmail(deps, { email: 'x@y.io', source: 'Bad Source!' })).status, 'created', 'bad source still captures the email');
  eq(rows.get('x@y.io')?.source, 'other', '…under source "other"');
  failCreate = Object.assign(new Error('dup'), { code: '23505' });
  eq((await captureWaitlistEmail(deps, { email: 'race@y.io', source: 'signup' })).status, 'exists', 'concurrent duplicate (23505) → exists, not error');
  failCreate = new Error('connection terminated');
  const down = await captureWaitlistEmail(deps, { email: 'down@y.io', source: 'signup' });
  ok(down.status === 'error' && down.savedToFallback === true, 'DB down → error, but the email is kept by the fallback');
  eq((fallbackRows[0] as { email: string; source: string }).email, 'down@y.io', 'fallback row carries the email');
  failCreate = null;
  attrError = Object.assign(new Error('column "referrer" does not exist'), { code: '42703' });
  eq((await captureWaitlistEmail(deps, { email: 'pre0006@y.io', source: 'signup', attribution: a })).status, 'created', 'missing 0006 columns never lose the signup');
  attrError = null;
  const before = attrWrites.length;
  await captureWaitlistEmail(deps, { email: 'after@y.io', source: 'signup', attribution: a });
  eq(attrWrites.length, before, 'after one 42703 the attribution write is switched off');
  _resetAttributionState();

  // ── 3. Capture paths wired (source) ──────────────────────────────────────
  const join = handler('server/routes.ts', 'post', '/api/waitlist/join');
  ok(/waitlistLimiters/.test(join) && /parseWaitlistInput/.test(join) && /captureWaitlistEmail/.test(join) && /parseAttribution\(req\.body\)/.test(join), 'join: rate-limited, validated, captured with attribution');
  ok(/savedToFallback/.test(join), 'join: DB-down capture still answers success');
  const signup = handler('server/routes.ts', 'post', '/api/auth/signup');
  ok((signup.match(/await captureRejected\(\)/g) ?? []).length === 3, 'signup: all three invite-code refusals capture the email');
  ok(signup.indexOf('captureRejected') < signup.indexOf('createUser('), 'signup: capture only on the refusal paths');
  ok(/GENERIC_INVITE_ERROR/.test(signup), 'signup: refusal answer unchanged (no code oracle)');
  ok(/captureLostSignup\(emailLower, 'join_beta'\)/.test(handler('server/routes.ts', 'post', '/api/beta/verify-code')), 'join-beta: unknown code captures the email');
  const g = src('server/googleAuth.ts');
  ok(/captureLostSignup\(emailLower, "google"\)/.test(g) && /INVITE_REQUIRED_WAITLISTED/.test(g) && /invite_waitlisted/.test(g), 'Google sign-in without an invite → waitlist + honest message');
  ok(/'invite_waitlisted'/.test(src('client/src/pages/login.tsx')), 'login page explains the Google capture');
  ok(/attributionPayload\(\)/.test(src('client/src/pages/signup.tsx')) && /attributionPayload\(\)/.test(src('client/src/components/waitlist-popup.tsx')), 'both client forms send attribution');
  ok(/captureFirstTouch\(\)/.test(src('client/src/main.tsx')), 'first touch kept at app start');

  // CSRF: the public join is exempt (a missing cookie used to 403 before the handler), admin writes are not.
  const { validateCSRF } = await import('../server/csrf');
  const run = (method: string, p: string, cookies: Record<string, string> = {}, headers: Record<string, string> = {}) => {
    let status = 0; let passed = false;
    const res = { status(s: number) { status = s; return { json() { /* noop */ } }; } };
    validateCSRF({ method, path: p, cookies, headers, ip: '1.2.3.4' } as never, res as never, () => { passed = true; });
    return passed ? 'next' : status;
  };
  eq(run('POST', '/api/waitlist/join'), 'next', 'POST /api/waitlist/join with no csrf cookie passes CSRF');
  eq(run('POST', '/api/admin/ops/waitlist/approve'), 403, 'admin approve still needs the CSRF token');
  eq(run('POST', '/api/admin/logout'), 403, 'logout still needs the CSRF token');
  eq(run('POST', '/api/admin/ops/waitlist/approve', { csrf_token: 'abc' }, { 'x-csrf-token': 'abc' }), 'next', 'matching token passes');

  // ── 4. Recovery helpers (pure) + read-only guarantee ─────────────────────
  const rec = await import('../research/waitlist-recovery');
  eq(rec.extractEmails('{"message":"New beta waitlist signup","email":"Ann.Lee+qe@Outlook.com","x":"icon@2x.png support@quantedgelabs.net noreply@x.com"}'),
    ['ann.lee+qe@outlook.com'], 'extract: lower-cased, skips file names, own domain, system senders');
  eq(rec.classifyLogLine('2026-09-12 10:00:00 [info]: New beta waitlist signup {"email":"a@b.co"}'), 'log:waitlist_join', 'classify waitlist join');
  eq(rec.classifyLogLine('Google OAuth: user not authorized for beta {"email":"a@b.co"}'), 'log:google_no_invite', 'classify google refusal');
  eq(rec.classifyLogLine('Price alert sent to desk'), null, 'unrelated line → null');
  eq(rec.lineTimestamp('2026-09-12 10:00:00 [info]: x'), '2026-09-12T10:00:00.000Z', 'winston printf timestamp');
  eq(rec.lineTimestamp('2026-10-01T09:30:12: PM2 log: {"timestamp":"2026-10-01 09:30:12"}'), '2026-10-01T09:30:12.000Z', 'pm2 --time prefix');
  eq(rec.lineTimestamp('no time here'), null, 'no timestamp → null');
  const m = new Map();
  rec.addSighting(m, { email: 'A@b.co', source: 'log:waitlist_join', at: '2026-09-12T10:00:00.000Z' });
  rec.addSighting(m, { email: 'a@b.co', source: 'discord:waitlist_embed', at: '2026-09-11T10:00:00.000Z' });
  rec.addSighting(m, { email: 'a@b.co', source: 'db:users', at: null });
  const cand = m.get('a@b.co')!;
  eq([cand.firstSeen, [...cand.sources].sort(), cand.count], ['2026-09-11T10:00:00.000Z', ['db:users', 'discord:waitlist_embed', 'log:waitlist_join'], 3], 'dedupe: earliest first-seen, all sources');
  eq(rec.emailFromWaitlistEmbed({ title: 'New Beta Waitlist Signup', fields: [{ name: 'Email', value: 'Lynn@iCloud.com' }, { name: 'Source', value: 'landing' }] }), 'lynn@icloud.com', 'pre-09-30 Discord embed → email');
  eq(rec.emailFromWaitlistEmbed({ title: 'New Beta Waitlist Signup', fields: [{ name: 'Email', value: '…@gmail.com' }] }), null, 'domain-only (post-09-30) embed → nothing');
  eq(rec.emailFromWaitlistEmbed({ title: 'SPY breakout', fields: [{ name: 'Email', value: 'a@b.co' }] }), null, 'non-waitlist embed ignored');
  ok(rec.toCsv([cand]).startsWith('email,first_seen,on_waitlist,sources,count\na@b.co,2026-09-11T10:00:00.000Z,no,'), 'CSV shape');
  const recSrc = src('research/waitlist-recovery.ts');
  ok(/default_transaction_read_only=on/.test(recSrc) && /BEGIN READ ONLY/.test(recSrc) && /ROLLBACK/.test(recSrc), 'recovery: DB sessions are read-only and rolled back');
  ok(!/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\s/i.test(recSrc.replace(/\/\*\*[\s\S]*?\*\//, '').replace(/\/\/.*$/gm, '')), 'recovery: no write SQL anywhere');
  ok(!/writeFile|appendFile|createWriteStream|unlink|rmSync|renameSync/.test(recSrc), 'recovery: no file writes');
  ok(/method: 'GET'/.test(recSrc) && !/method: '(POST|PUT|PATCH|DELETE)'/.test(recSrc), 'recovery: HTTP is GET only');
  ok(/RECOVERY_DATABASE_URLS/.test(recSrc) && /\.env\.supabase/.test(recSrc), 'recovery: scans the old databases too');

  // ── 5. Invite email + approve (mock sender only) ─────────────────────────
  const mailer = await import('../server/invite-mailer');
  const mail = mailer.buildBetaInviteEmail({ link: 'https://quantedgelabs.net/signup?code=qe-aaaaa-bbbbb-ccccc-ddddd', code: 'qe-aaaaa-bbbbb-ccccc-ddddd', expiresAt: '2026-10-21T12:00:00Z' });
  eq(mail.subject, 'You’re in — QuantEdge beta', 'subject');
  for (const part of [mail.text, mail.html]) {
    ok(part.includes('https://quantedgelabs.net/signup?code=qe-aaaaa-bbbbb-ccccc-ddddd'), 'body carries the /signup?code= link');
    ok(part.includes('https://discord.gg/ppjjxVfsc'), 'body carries the Discord link');
    ok(/not investment advice/i.test(part) && /educational/i.test(part), 'educational / not investment advice footer');
  }
  ok(mailer.buildBetaInviteEmail({ link: 'https://x.io/signup?code=<b>"', code: 'c', expiresAt: null }).html.includes('code=&lt;b&gt;&quot;'), 'html escapes the link');

  const cfgSandbox = mailer.inviteSenderConfig({ RESEND_API_KEY: 'k' } as never);
  ok(cfgSandbox.sandbox && /resend\.dev/.test(cfgSandbox.from) && /Verify quantedgelabs\.net/.test(cfgSandbox.problem ?? ''), 'no FROM_EMAIL → sandbox sender reported as a problem');
  const cfgOk = mailer.inviteSenderConfig({ RESEND_API_KEY: 'k', FROM_EMAIL: 'beta@quantedgelabs.net' } as never);
  ok(cfgOk.configured && !cfgOk.sandbox && cfgOk.problem === null && cfgOk.fromHeader === 'QuantEdge <beta@quantedgelabs.net>', 'verified-domain sender is clean');
  ok(!mailer.inviteSenderConfig({} as never).configured, 'no key → not configured');
  ok(/not verified in Resend/.test(mailer.explainSendError('The quantedgelabs.net domain is not verified', cfgOk)), 'domain error explained');

  type Inv = { id: string; token: string; status: string; expiresAt: Date; sentAt: Date | null; email: string };
  const mkWorld = () => {
    const invites: Inv[] = [];
    const status = new Map<string, string>();
    const sent: { to: string; subject: string; text: string; from: string }[] = [];
    const sleeps: number[] = [];
    let n = 0;
    const deps = {
      getOpenInvite: async (email: string) => [...invites].reverse().find((i) => i.email === email && (i.status === 'pending' || i.status === 'sent')) ?? null,
      createInvite: async (x: { email: string; expiresAt: Date }) => { const inv = { id: `i${++n}`, token: `qe-code-${n}`, status: 'pending', expiresAt: x.expiresAt, sentAt: null, email: x.email }; invites.push(inv); return inv; },
      setWaitlistStatus: async (id: string, s: 'approved' | 'invited') => { status.set(id, s); },
      markInviteSent: async (id: string) => { const i = invites.find((x) => x.id === id)!; i.status = 'sent'; i.sentAt = new Date('2026-10-07T14:32:00Z'); },
      recordEmailResult: async () => undefined,
      isUnused: (i: { status: string | null }) => i.status === 'pending' || i.status === 'sent',
      send: async (msg: { to: string; subject: string; text: string; from: string }) => { sent.push(msg); return msg.to.startsWith('bounce') ? { ok: false as const, error: 'The resend.dev domain is not verified' } : { ok: true as const, id: `m-${msg.to}` }; },
      sleep: async (ms: number) => { sleeps.push(ms); },
      now: () => Date.parse('2026-10-07T14:32:00Z'),
    };
    return { invites, status, sent, sleeps, deps };
  };
  const opts = { origin: 'https://quantedgelabs.net', tierOverride: null, expiresAt: new Date('2026-10-21T00:00:00Z'), sendEmail: true, sender: cfgOk };

  const w = mkWorld();
  const res = await mailer.approveWaitlistEntries([
    { id: 'w1', email: 'Lynn@iCloud.com', status: 'pending' },
    { id: 'w2', email: 'bounce@x.io', status: 'pending' },
    { id: 'w3', email: 'joined@x.io', status: 'joined' },
  ], opts, w.deps);
  eq(res.map((r) => [r.email, r.emailed, !!r.emailError, r.skipped ?? null]), [['Lynn@iCloud.com', true, false, null], ['bounce@x.io', false, true, null], ['joined@x.io', false, false, 'already joined']], 'emailed / email failed / skipped');
  eq(w.sent.map((s) => [s.to, s.subject, s.from]), [['lynn@icloud.com', 'You’re in — QuantEdge beta', 'QuantEdge <beta@quantedgelabs.net>'], ['bounce@x.io', 'You’re in — QuantEdge beta', 'QuantEdge <beta@quantedgelabs.net>']], 'one email per approved entry, to the locked address, from FROM_EMAIL');
  ok(w.sent[0].text.includes('https://quantedgelabs.net/signup?code=qe-code-1'), 'the email link is the code that was created for that person');
  eq([w.status.get('w1'), w.status.get('w2'), w.status.get('w3')], ['invited', 'approved', undefined], 'emailed → invited; failed → approved; joined untouched');
  eq([w.invites[0].status, w.invites[1].status], ['sent', 'pending'], 'invite marked sent only when the email went out');
  eq(res[0].emailedAt, '2026-10-07T14:32:00.000Z', 'emailedAt stamped');
  ok(/not verified in Resend/.test(res[1].emailError ?? '') && res[1].link === 'https://quantedgelabs.net/signup?code=qe-code-2', 'failure carries the reason and the link to copy');
  eq(w.sleeps, [mailer.SEND_SPACING_MS], 'sends are paced (Resend 2/s)');

  // Re-approve ("Show code"): the emailed code is not emailed again; the failed one is retried.
  const again = await mailer.approveWaitlistEntries([{ id: 'w1', email: 'lynn@icloud.com', status: 'invited' }, { id: 'w2', email: 'bounce@x.io', status: 'approved' }], opts, w.deps);
  eq(again.map((r) => [r.reused, r.emailed, r.code]), [[true, true, 'qe-code-1'], [true, false, 'qe-code-2']], 'existing codes reused');
  eq(w.sent.length, 3, 'only the failed one was re-sent');
  eq(w.invites.length, 2, 'no second code per person');

  const w2 = mkWorld();
  const quiet = await mailer.approveWaitlistEntries([{ id: 'w9', email: 'q@x.io', status: 'pending' }], { ...opts, sendEmail: false }, w2.deps);
  eq([quiet[0].emailed, quiet[0].emailError, w2.sent.length, w2.status.get('w9')], [false, null, 0, 'approved'], 'sendEmail:false → code only, no email');
  const w3 = mkWorld();
  const nokey = await mailer.approveWaitlistEntries([{ id: 'w8', email: 'k@x.io', status: 'pending' }], { ...opts, sender: mailer.inviteSenderConfig({} as never) }, w3.deps);
  eq([nokey[0].emailed, w3.sent.length, /RESEND_API_KEY/.test(nokey[0].emailError ?? '')], [false, 0, true], 'no API key → nothing sent, reason shown');
  const w4 = mkWorld();
  w4.deps.send = async () => { throw new Error('socket hang up'); };
  const threw = await mailer.approveWaitlistEntries([{ id: 'w7', email: 't@x.io', status: 'pending' }], opts, w4.deps);
  eq([threw[0].emailed, threw[0].emailError, w4.status.get('w7')], [false, 'socket hang up', 'approved'], 'a throwing sender is a failed email, not a 500');

  // The production sender is swappable and the tests never reach Resend.
  const calls: string[] = [];
  mailer.setInviteEmailSender(async (msg) => { calls.push(msg.to); return { ok: true, id: null }; });
  await mailer.currentInviteSender()({ from: 'a', to: 'mock@x.io', replyTo: 'r', subject: 's', text: 't', html: 'h' });
  eq(calls, ['mock@x.io'], 'injected sender used');
  mailer.setInviteEmailSender(null);
  const real = await mailer.currentInviteSender()({ from: 'a', to: 'never@x.io', replyTo: 'r', subject: 's', text: 't', html: 'h' });
  eq(real, { ok: false, error: 'RESEND_API_KEY is not set' }, 'with no key the Resend sender refuses before any network call');

  // Approve all: confirmation must match the server's pending count.
  eq(mailer.checkApproveAllConfirmation({ confirm: 'approve-all-pending', expectedCount: 12 }, 12), { ok: true }, 'matching count → ok');
  eq(mailer.checkApproveAllConfirmation({ expectedCount: 12 }, 12).ok, false, 'no confirm string → refused');
  const moved = mailer.checkApproveAllConfirmation({ confirm: 'approve-all-pending', expectedCount: 12 }, 14);
  ok(!moved.ok && moved.status === 409 && /14 pending now/.test(moved.error), 'list moved since the dialog → 409');
  eq(mailer.checkApproveAllConfirmation({ confirm: 'approve-all-pending', expectedCount: 0 }, 0).ok, false, 'nothing pending → refused');

  // Routes: admin-gated, audited, wired to the mailer.
  const ops = src('server/admin-ops-routes.ts');
  ok(/app\.post\('\/api\/admin\/ops\/waitlist\/approve-all', requireAdmin/.test(ops) && /checkApproveAllConfirmation\(req\.body, pending\.length\)/.test(ops), 'approve-all: admin-only, confirmation checked against the live count');
  ok(/send: currentInviteSender\(\)/.test(ops) && /sendEmail: body\.sendEmail !== false/.test(ops), 'approve uses the injectable sender, email on by default');
  ok(/'waitlist\.approve_all'/.test(src('server/admin-audit.ts')) && /auditApprove\(req, 'waitlist\.approve_all'/.test(ops), 'approve-all audited');
  ok(/app\.get\('\/api\/admin\/ops\/waitlist', requireAdmin/.test(ops), 'waitlist list with email status is admin-only');
  const page = src('client/src/pages/admin/waitlist.tsx');
  ok(/invited · emailed/.test(page) && /email failed — /.test(page) && /copy link/.test(page), 'admin row: "invited · emailed HH:MM" / "email failed — copy link"');
  ok(/window\.confirm\(`Approve all/.test(page) && /approve-all-pending/.test(page), 'Approve all pending asks first');

  process.env.ADMIN_AUDIT_FILE = `${process.env.TMPDIR ?? '/tmp'}/qe-waitlist-test-audit.jsonl`;
  const { requireAdminJWT } = await import('../server/auth');
  const { registerAdminOpsRoutes } = await import('../server/admin-ops-routes');
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  registerAdminOpsRoutes(app, requireAdminJWT);
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const [method, route] of [['GET', '/api/admin/ops/waitlist'], ['POST', '/api/admin/ops/waitlist/approve-all'], ['POST', '/api/admin/ops/waitlist/approve']] as const) {
      eq((await fetch(base + route, { method })).status, 401, `${method} ${route} without the admin cookie → 401`);
    }
  } finally { server.close(); }

  console.log(`test-waitlist-capture: ${checks} checks passed`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
