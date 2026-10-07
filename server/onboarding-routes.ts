/**
 * Intake profile, onboarding progress and the roadmap / public updates feed.
 *
 *   GET   /api/onboarding/me            signed in → { profile, progress }
 *   PUT   /api/onboarding/profile       signed in → save the intake profile for the account email
 *   PATCH /api/onboarding/progress      signed in → merge tours / checklist / showTips
 *   GET   /api/updates                  public   → shipped + in-progress roadmap items
 *   GET   /api/admin/roadmap            admin    → every item
 *   POST  /api/admin/roadmap            admin    → create
 *   PATCH /api/admin/roadmap/:id        admin    → update
 *   DELETE /api/admin/roadmap/:id       admin    → delete
 *   GET   /api/admin/ops/intake-profiles admin   → member profiles (emails not on the waitlist)
 *
 * The public waitlist form posts its profile with /api/waitlist/join (routes.ts).
 */
import type { Express, Request, RequestHandler, Response } from 'express';
import { validateIntakeProfile } from '@shared/intake';
import { publicRoadmap } from '@shared/roadmap';
import { defaultIntakeDeps, patchProgress, readAllProfiles, readProfile, readProgress, saveProfile } from './intake-store';
import { createRoadmapItem, deleteRoadmapItem, listRoadmap, updateRoadmapItem } from './roadmap-store';
import { appendAdminAudit, auditActor } from './admin-audit';
import { logger } from './logger';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const userIdOf = (req: Request): string | null => {
  const r = req as unknown as { session?: { userId?: string }; user?: { claims?: { sub?: string } } };
  const id = r.session?.userId ?? r.user?.claims?.sub;
  return id ? String(id) : null;
};
async function userEmail(userId: string): Promise<string | null> {
  const { storage } = await import('./storage');
  const u = await storage.getUser(userId);
  return u?.email ? u.email.trim().toLowerCase() : null;
}
const fail = (res: Response, err: unknown, what: string) => {
  logger.error(`[ONBOARDING] ${what} failed`, { error: (err as Error)?.message });
  res.status(500).json({ error: `${what} failed` });
};

export function registerOnboardingRoutes(app: Express, requireAdmin: RequestHandler): void {
  app.get('/api/onboarding/me', async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ error: 'Sign in first' });
    try {
      const deps = await defaultIntakeDeps();
      const email = await userEmail(userId);
      const [profile, progress] = await Promise.all([email ? readProfile(deps, email) : null, readProgress(deps, userId)]);
      res.set('Cache-Control', 'no-store');
      res.json({ profile, progress });
    } catch (e) { fail(res, e, 'Onboarding read'); }
  });

  app.put('/api/onboarding/profile', async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ error: 'Sign in first' });
    const v = validateIntakeProfile(req.body);
    if (!v.ok) return res.status(400).json({ error: 'Some answers are missing', errors: v.errors });
    try {
      const email = await userEmail(userId);
      if (!email) return res.status(400).json({ error: 'Your account has no email address' });
      const via = typeof req.body?.via === 'string' && /^[a-z-]{1,20}$/.test(req.body.via) ? req.body.via : 'profile-sheet';
      const r = await saveProfile(await defaultIntakeDeps(), email, { ...v.value, via }, true);
      if (r === 'error') return res.status(500).json({ error: 'Your profile could not be saved — try again' });
      res.json({ ok: true, profile: { ...v.value, via } });
    } catch (e) { fail(res, e, 'Profile save'); }
  });

  app.patch('/api/onboarding/progress', async (req, res) => {
    const userId = userIdOf(req);
    if (!userId) return res.status(401).json({ error: 'Sign in first' });
    try {
      res.json({ progress: await patchProgress(await defaultIntakeDeps(), userId, req.body) });
    } catch (e) { fail(res, e, 'Progress save'); }
  });

  // ── Roadmap ────────────────────────────────────────────────────────────
  const kv = async () => (await defaultIntakeDeps()).kv;

  app.get('/api/updates', async (_req, res) => {
    try {
      const items = publicRoadmap(listRoadmap(await kv())).map(({ id, title, description, area, status, targetDate, audience }) =>
        ({ id, title, description, area, status, targetDate, audience }));
      res.set('Cache-Control', 'public, max-age=60');
      res.json({ items });
    } catch (e) { fail(res, e, 'Updates'); }
  });

  app.get('/api/admin/roadmap', requireAdmin, async (_req, res) => {
    try { res.set('Cache-Control', 'no-store'); res.json({ items: listRoadmap(await kv()) }); } catch (e) { fail(res, e, 'Roadmap list'); }
  });
  app.post('/api/admin/roadmap', requireAdmin, async (req, res) => {
    try {
      const r = createRoadmapItem(await kv(), req.body);
      if (!r.ok) return res.status(400).json({ error: r.error });
      appendAdminAudit({ action: 'roadmap.create', actor: auditActor(req), target: r.item.id, detail: { title: r.item.title }, ip: req.ip ?? null });
      res.json({ item: r.item });
    } catch (e) { fail(res, e, 'Roadmap create'); }
  });
  app.patch('/api/admin/roadmap/:id', requireAdmin, async (req, res) => {
    if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
    try {
      const r = updateRoadmapItem(await kv(), req.params.id, req.body);
      if (!r.ok) return res.status(r.notFound ? 404 : 400).json({ error: r.error });
      appendAdminAudit({ action: 'roadmap.update', actor: auditActor(req), target: r.item.id, detail: { title: r.item.title, status: r.item.status }, ip: req.ip ?? null });
      res.json({ item: r.item });
    } catch (e) { fail(res, e, 'Roadmap update'); }
  });
  app.delete('/api/admin/roadmap/:id', requireAdmin, async (req, res) => {
    if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Bad id' });
    try {
      if (!deleteRoadmapItem(await kv(), req.params.id)) return res.status(404).json({ error: 'No such item' });
      appendAdminAudit({ action: 'roadmap.delete', actor: auditActor(req), target: req.params.id, ip: req.ip ?? null });
      res.json({ ok: true });
    } catch (e) { fail(res, e, 'Roadmap delete'); }
  });

  // Profiles from the "Complete your profile" sheet for accounts not on the waitlist.
  app.get('/api/admin/ops/intake-profiles', requireAdmin, async (_req, res) => {
    try {
      const { storage } = await import('./storage');
      const [profiles, waitlist] = await Promise.all([readAllProfiles(await defaultIntakeDeps()), storage.getAllWaitlistEntries()]);
      const onList = new Set(waitlist.map((w) => w.email.toLowerCase()));
      const members = [...profiles.entries()].filter(([email]) => !onList.has(email)).map(([email, profile]) => ({ email, profile }));
      res.set('Cache-Control', 'no-store');
      res.json({ members });
    } catch (e) { fail(res, e, 'Member profiles'); }
  });
}
