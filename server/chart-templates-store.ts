/**
 * Chart templates + per-layer style — per user, server side (same pattern as
 * chart-drawings-store.ts: one JSON file per user under
 * .cache/shared/chart-settings/, sha256 file name, atomic write).
 *
 *   GET /api/chart/settings  → { templates, style, activeTemplate, updatedAt }   (updatedAt 0 = none stored)
 *   PUT /api/chart/settings  { templates?, style?, activeTemplate? } → same shape
 *
 * Writes run shared/chart-templates.ts sanitisers. The client keeps a device
 * copy and falls back to it when signed out or offline.
 */
import type { Express, RequestHandler } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeChartStyle, sanitizeTemplates, type ChartStyle, type ChartTemplate } from '@shared/chart-templates';
import { sessionUserId } from './chart-drawings-store';

export interface ChartSettingsRecord { templates: ChartTemplate[]; style: ChartStyle; activeTemplate: string | null; updatedAt: number }

export function chartSettingsDir(): string {
  return path.join(process.env.SHARED_STATE_DIR || path.join(process.cwd(), '.cache', 'shared'), 'chart-settings');
}

export function fileChartSettingsStore(dir: string, now: () => number = Date.now) {
  const file = (u: string) => path.join(dir, `${crypto.createHash('sha256').update(u).digest('hex').slice(0, 32)}.json`);
  const clean = (raw: any, at: number): ChartSettingsRecord => ({
    templates: sanitizeTemplates(raw?.templates), style: sanitizeChartStyle(raw?.style),
    activeTemplate: typeof raw?.activeTemplate === 'string' && /^[\w-]{1,40}$/.test(raw.activeTemplate) ? raw.activeTemplate : null,
    updatedAt: at,
  });
  return {
    get(u: string): ChartSettingsRecord {
      try { const raw = JSON.parse(fs.readFileSync(file(u), 'utf8')); return clean(raw, Number(raw?.updatedAt) || 0); } catch { return clean(null, 0); }
    },
    put(u: string, patch: Record<string, unknown>): ChartSettingsRecord {
      const cur = this.get(u);
      const rec = clean({ ...cur, ...Object.fromEntries(Object.entries(patch).filter(([k]) => ['templates', 'style', 'activeTemplate'].includes(k))) }, now());
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${file(u)}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(rec));
      fs.renameSync(tmp, file(u));
      return rec;
    },
  };
}

export function registerChartSettingsRoutes(app: Express, requireMember: RequestHandler): void {
  let store: ReturnType<typeof fileChartSettingsStore> | null = null;
  const s = () => (store ??= fileChartSettingsStore(chartSettingsDir()));
  app.get('/api/chart/settings', requireMember, (req, res) => {
    const u = sessionUserId(req);
    if (!u) return res.status(401).json({ error: 'Sign in to sync chart settings.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json(s().get(u));
  });
  app.put('/api/chart/settings', requireMember, (req, res) => {
    const u = sessionUserId(req);
    if (!u) return res.status(401).json({ error: 'Sign in to sync chart settings.' });
    if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'body required' });
    try { res.json(s().put(u, req.body)); } catch { res.status(500).json({ error: 'Could not save chart settings.' }); }
  });
}
