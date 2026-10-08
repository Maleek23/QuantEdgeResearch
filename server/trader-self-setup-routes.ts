/**
 * Trader self-setup from the sign-in page (docs/DESK_ADMINS.md §Trader self-setup).
 * Rules: shared/trader-self-setup.ts. Helpers: server/trader-self-setup.ts.
 *
 * Public (per-IP limiters; the POSTs also check CSRF themselves, because the
 * global validateCSRF exempts /api/auth/*):
 *   GET  /api/auth/trader-setup/names     { open, names: [{ slug, name }] }  books open for self-setup
 *   POST /api/auth/trader-setup/verify    { slug, passcode }                 step 2 — passcode check only
 *   POST /api/auth/trader-setup/complete  { slug, passcode, password }       step 3 — account + desk admin + session
 *
 * Admin hub (requireAdminJWT):
 *   GET  /api/admin/ops/trader-self-setup                                    switch + every book's state
 *   PUT  /api/admin/ops/trader-self-setup  { enabled } | { slug, open }      global / per-book switch
 *
 * Every refusal of a name or passcode is the same 403 (SELF_SETUP_ERROR) and
 * costs one bcrypt, so a guesser cannot tell a wrong passcode from a closed or
 * unknown name. 5 failures per name per 15 min lock that name. The passcode
 * and the password never reach a log or the audit file; account creation is
 * provisionTraderAccount — the admin hub's "Add trader account" path.
 */
import type { Express, Request, RequestHandler, Response } from 'express';
import { validatePassword } from '@shared/password-policy';
import { DESK_SLUG_RE } from '@shared/desk-admin';
import { TRADER_ACCOUNT_DEFAULT_TIER, loginNameOf, usernameLoginEmail } from '@shared/trader-accounts';
import {
  SELF_SETUP_ERROR, SELF_SETUP_LOCKED_ERROR, SELF_SETUP_OFF_ERROR, selfSetupUsername, type SelfSetupBlock,
} from '@shared/trader-self-setup';
import { appendAdminAudit, auditActor } from './admin-audit';
import { defaultTraderAccountDeps, provisionTraderAccount, type TATrader, type TraderAccountDeps } from './trader-accounts-routes';
import {
  DEFAULT_SELF_SETUP_CONFIG, NameAttemptTracker, csrfOk, normalizeSelfSetupConfig, selfSetupBlock, selfSetupEnvOn,
  selfSetupExtraExcluded, selfSetupOpen, type SelfSetupConfig,
} from './trader-self-setup';

export interface SelfSetupDeps extends TraderAccountDeps {
  readConfig: () => SelfSetupConfig;
  writeConfig: (cfg: SelfSetupConfig) => boolean;
  /** bcrypt compare against traders.passcode_hash (constant-time inside bcrypt). */
  verifyPasscode: (code: string, hash: string) => Promise<boolean>;
  envOn: () => boolean;
  extraExcluded: () => string[];
}

const STATE_NAME = 'trader-self-setup';

async function defaultSelfSetupDeps(): Promise<SelfSetupDeps> {
  const base = await defaultTraderAccountDeps();
  const { readShared, writeSharedSync } = await import('./lib/shared-state');
  const bcrypt = (await import('bcrypt')).default;
  return {
    ...base,
    readConfig: () => normalizeSelfSetupConfig(readShared<SelfSetupConfig>(STATE_NAME)?.data ?? DEFAULT_SELF_SETUP_CONFIG),
    writeConfig: (cfg) => writeSharedSync(STATE_NAME, normalizeSelfSetupConfig(cfg)),
    verifyPasscode: (code, hash) => bcrypt.compare(code, hash),
    envOn: () => selfSetupEnvOn(),
    extraExcluded: () => selfSetupExtraExcluded(),
  };
}

function fail(res: Response, err: unknown, context: string) {
  // The message only — never the request body (it holds a passcode / password).
  void import('./logger').then(({ logger }) => logger.error(`[TRADER-SELF-SETUP] ${context} failed`, { error: (err as Error)?.message })).catch(() => {});
  return res.status(500).json({ error: `${context} failed` });
}

export function registerTraderSelfSetupRoutes(
  app: Express,
  requireAdmin: RequestHandler,
  limiters: { names: RequestHandler[]; attempt: RequestHandler[] },
  injected?: Partial<SelfSetupDeps>,
  tracker: NameAttemptTracker = new NameAttemptTracker(),
) {
  let depsP: Promise<SelfSetupDeps> | null = null;
  const deps = async (): Promise<SelfSetupDeps> => {
    if (!depsP) depsP = defaultSelfSetupDeps().then((d) => ({ ...d, ...injected }));
    return depsP;
  };
  let dummy: Promise<string> | null = null;
  /** One bcrypt on every refusal, so a closed / unknown name costs what a wrong passcode costs. */
  const burn = async (d: SelfSetupDeps, code: string) => {
    dummy ??= d.hashPassword('trader-self-setup-timing-dummy');
    await d.verifyPasscode(code, await dummy).catch(() => false);
  };
  const inFlight = new Set<string>();

  const blockOf = async (d: SelfSetupDeps, book: TATrader, cfg: SelfSetupConfig): Promise<SelfSetupBlock | null> => {
    const pre = selfSetupBlock(book, { cfg, extraExcluded: d.extraExcluded() });
    if (pre) return pre;
    const username = selfSetupUsername(book.slug)!;
    return (await d.getUserByEmail(usernameLoginEmail(username))) ? 'username_taken' : null;
  };

  const csrf: RequestHandler = (req, res, next) => (csrfOk(req) ? next() : res.status(403).json({ error: 'CSRF validation failed — reload the page and try again' }));

  /**
   * Steps 2 and 3 share this: is the switch on, is the name locked, is it an
   * open book, is the passcode right. Answers the refusal itself; returns the
   * book only on success.
   */
  const check = async (d: SelfSetupDeps, req: Request, res: Response, opts: { password?: unknown }): Promise<TATrader | null> => {
    res.set('Cache-Control', 'no-store');
    const cfg = d.readConfig();
    if (!selfSetupOpen(cfg, d.envOn())) { res.status(403).json({ error: SELF_SETUP_OFF_ERROR, off: true }); return null; }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const code = typeof body.passcode === 'string' ? body.passcode : '';
    if (!DESK_SLUG_RE.test(name)) { await burn(d, code.slice(0, 128)); res.status(403).json({ error: SELF_SETUP_ERROR }); return null; }
    if (tracker.isLocked(name, d.now())) { res.status(429).json({ error: SELF_SETUP_LOCKED_ERROR }); return null; }
    if (opts.password !== undefined) {
      // Policy before the passcode: a weak password is not a guess and is not counted.
      const pwErr = validatePassword(opts.password);
      if (pwErr) { res.status(400).json({ error: pwErr, field: 'password' }); return null; }
    }
    const book = await d.getTrader(name);
    const why: SelfSetupBlock | 'unknown' | 'bad_passcode' | null =
      !book ? 'unknown' : (await blockOf(d, book, cfg)) ?? (code.length < 1 || code.length > 128 ? 'bad_passcode' : null);
    let ok = false;
    if (why) await burn(d, code.slice(0, 128));
    else {
      // Forgiving of how a passcode gets typed on a phone: surrounding spaces, a pasted
      // "name=" prefix from the passcode sheet, and an auto-capitalised first letter.
      const raw = code.trim().replace(new RegExp(`^${name}\\s*[=:]\\s*`, 'i'), '');
      const tries = Array.from(new Set([code, raw, raw.charAt(0).toLowerCase() + raw.slice(1)])).filter((x) => x.length > 0 && x.length <= 128);
      for (const t of tries) { if (await d.verifyPasscode(t, book!.passcodeHash!).catch(() => false)) { ok = true; break; } }
    }
    if (!ok) {
      const lockedNow = tracker.fail(name, d.now());
      appendAdminAudit({
        action: lockedNow ? 'trader_self_setup.lockout' : 'trader_self_setup.fail', actor: 'public', target: name,
        detail: { why: why ?? 'bad_passcode', step: opts.password === undefined ? 'verify' : 'complete' }, ip: req.ip ?? null,
      });
      res.status(403).json({ error: SELF_SETUP_ERROR });
      return null;
    }
    return book!;
  };

  // ── Public ────────────────────────────────────────────
  app.get('/api/auth/trader-setup/names', ...limiters.names, async (_req, res) => {
    try {
      const d = await deps();
      const cfg = d.readConfig();
      res.set('Cache-Control', 'no-store');
      if (!selfSetupOpen(cfg, d.envOn())) return res.json({ open: false, names: [] });
      const books = await d.listTraders();
      const names: { slug: string; name: string }[] = [];
      for (const b of books) if (!(await blockOf(d, b, cfg))) names.push({ slug: b.slug, name: b.name });
      names.sort((a, b) => a.name.localeCompare(b.name));
      res.json({ open: true, names });
    } catch (err) { fail(res, err, 'Trader list'); }
  });

  app.post('/api/auth/trader-setup/verify', ...limiters.attempt, csrf, async (req, res) => {
    try {
      const d = await deps();
      const book = await check(d, req, res, {});
      if (!book) return;
      res.json({ ok: true, name: book.name, login: selfSetupUsername(book.slug) });
    } catch (err) { fail(res, err, 'Passcode check'); }
  });

  app.post('/api/auth/trader-setup/complete', ...limiters.attempt, csrf, async (req, res) => {
    let held: string | null = null;
    try {
      const d = await deps();
      const password = (req.body ?? {}).password;
      const book = await check(d, req, res, { password: password ?? '' });
      if (!book) return;
      // One setup per name at a time; users.email UNIQUE settles any race across processes.
      if (inFlight.has(book.slug)) return res.status(403).json({ error: SELF_SETUP_ERROR });
      inFlight.add(book.slug); held = book.slug;

      const username = selfSetupUsername(book.slug)!;
      const p = await provisionTraderAccount(d, {
        displayName: book.name, loginEmail: usernameLoginEmail(username), traderSlug: book.slug,
        tier: TRADER_ACCOUNT_DEFAULT_TIER, deskAdmin: true, passwordHash: await d.hashPassword(password as string),
      });
      if (!p.ok) return res.status(403).json({ error: SELF_SETUP_ERROR }); // lost a race: the book is closed now
      tracker.clear(book.slug);
      await d.establishSession(req, p.user.id); // a NEW session id (fixation), persisted before we answer

      const login = loginNameOf(p.user.email);
      appendAdminAudit({ action: 'trader_self_setup.complete', actor: `user:${p.user.id}`, target: `${p.user.id} ${login}`,
        detail: { traderSlug: book.slug, tier: TRADER_ACCOUNT_DEFAULT_TIER, betaAccess: true, deskAdmin: true }, ip: req.ip ?? null });
      appendAdminAudit({ action: 'desk.assign', actor: `user:${p.user.id}`, target: book.slug,
        detail: { userId: p.user.id, replaced: null, via: 'trader_self_setup', role: 'self' }, ip: req.ip ?? null });
      res.status(201).json({ ok: true, login, redirect: '/desk' });
    } catch (err) { fail(res, err, 'Account setup'); } finally { if (held) inFlight.delete(held); }
  });

  // ── Admin hub ─────────────────────────────────────────
  const state = async (d: SelfSetupDeps) => {
    const cfg = d.readConfig();
    const books = await d.listTraders();
    const rows = [];
    for (const b of books) {
      const block = await blockOf(d, b, cfg);
      rows.push({ slug: b.slug, name: b.name, offered: !block, block, closed: cfg.closedBooks.includes(b.slug.toLowerCase()) });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return { envOn: d.envOn(), enabled: cfg.enabled, open: selfSetupOpen(cfg, d.envOn()), books: rows };
  };

  app.get('/api/admin/ops/trader-self-setup', requireAdmin, async (_req, res) => {
    try { res.set('Cache-Control', 'no-store'); res.json(await state(await deps())); } catch (err) { fail(res, err, 'Self-setup state'); }
  });

  app.put('/api/admin/ops/trader-self-setup', requireAdmin, async (req, res) => {
    try {
      const d = await deps();
      const b = (req.body ?? {}) as Record<string, unknown>;
      const cfg = d.readConfig();
      let detail: Record<string, unknown>;
      if (typeof b.enabled === 'boolean' && b.slug === undefined) {
        cfg.enabled = b.enabled;
        detail = { enabled: b.enabled };
      } else if (typeof b.slug === 'string' && typeof b.open === 'boolean') {
        const slug = b.slug.trim().toLowerCase();
        if (!DESK_SLUG_RE.test(slug) || !(await d.getTrader(slug))) return res.status(404).json({ error: 'No such trader book' });
        cfg.closedBooks = b.open ? cfg.closedBooks.filter((s) => s !== slug) : Array.from(new Set([...cfg.closedBooks, slug]));
        detail = { slug, open: b.open };
      } else {
        return res.status(400).json({ error: 'Send { enabled: boolean } or { slug, open: boolean }' });
      }
      if (!d.writeConfig(normalizeSelfSetupConfig(cfg))) return res.status(500).json({ error: 'Could not save the switch' });
      appendAdminAudit({ action: 'trader_self_setup.config', actor: auditActor(req as never), target: typeof detail.slug === 'string' ? detail.slug : 'global', detail: { role: 'super', ...detail }, ip: req.ip ?? null });
      res.json(await state(d));
    } catch (err) { fail(res, err, 'Self-setup switch'); }
  });
}
