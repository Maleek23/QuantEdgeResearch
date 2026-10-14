/**
 * Chart drawings — per user × symbol, server side, so drawings follow the
 * user across devices and intervals. No DB migration: one JSON file per user
 * under .cache/shared/chart-drawings/ (file name = sha256 of the user id, the
 * Ask Quantinum history pattern), written atomically (tmp + rename).
 *
 *   GET /api/chart/drawings/:symbol   → { symbol, drawings, updatedAt }   (updatedAt 0 = none stored)
 *   PUT /api/chart/drawings/:symbol   { drawings, updatedAt? } → { ok, count, updatedAt }
 *   GET /api/chart/drawings           → { symbols: [{ symbol, count, updatedAt }] }
 *
 * Every write runs the same sanitiser the client does (shared/chart-drawings.ts):
 * malformed rows are dropped, sizes capped. The client keeps a device copy and
 * falls back to it when this is unreachable or the visitor is signed out.
 */
import type { Express, Request, RequestHandler } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeDrawings, type Drawing } from '@shared/chart-drawings';

export interface DrawingsRecord { drawings: Drawing[]; updatedAt: number }
interface UserFile { v: 1; symbols: Record<string, DrawingsRecord> }

export const MAX_SYMBOLS_PER_USER = 400;
const SYMBOL_RE = /^[A-Z0-9^=$:_-][A-Z0-9.^=$:_-]{0,23}$/;

export function cleanSymbol(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toUpperCase();
  return SYMBOL_RE.test(s) && !s.includes("..") ? s : null;
}

export interface ChartDrawingStore {
  get(userId: string, symbol: string): DrawingsRecord;
  put(userId: string, symbol: string, drawings: unknown, updatedAt?: number): DrawingsRecord;
  list(userId: string): { symbol: string; count: number; updatedAt: number }[];
}

export function fileChartDrawingStore(dir: string, now: () => number = Date.now): ChartDrawingStore {
  const file = (u: string) => path.join(dir, `${crypto.createHash('sha256').update(u).digest('hex').slice(0, 32)}.json`);
  const read = (u: string): UserFile => {
    try {
      const raw = JSON.parse(fs.readFileSync(file(u), 'utf8'));
      const symbols: Record<string, DrawingsRecord> = {};
      for (const [k, v] of Object.entries((raw?.symbols ?? {}) as Record<string, { drawings?: unknown; updatedAt?: unknown }>)) {
        const sym = cleanSymbol(k);
        if (!sym) continue;
        symbols[sym] = { drawings: sanitizeDrawings(v?.drawings), updatedAt: Number.isFinite(v?.updatedAt) ? Number(v.updatedAt) : 0 };
      }
      return { v: 1, symbols };
    } catch { return { v: 1, symbols: {} }; }
  };
  const write = (u: string, f: UserFile) => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file(u)}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(f));
    fs.renameSync(tmp, file(u));
  };
  return {
    get(u, symbol) { return read(u).symbols[symbol] ?? { drawings: [], updatedAt: 0 }; },
    put(u, symbol, drawings, updatedAt) {
      const f = read(u);
      const t = now();
      // A client clock far ahead must not pin its copy as "newest" forever.
      const stamp = Number.isFinite(updatedAt) && (updatedAt as number) > 0 ? Math.min(updatedAt as number, t + 60_000) : t;
      const rec: DrawingsRecord = { drawings: sanitizeDrawings(drawings), updatedAt: stamp };
      f.symbols[symbol] = rec;
      const keys = Object.keys(f.symbols);
      if (keys.length > MAX_SYMBOLS_PER_USER) {
        // Drop the least recently edited symbols, never the one just written.
        keys.sort((a, b) => f.symbols[a].updatedAt - f.symbols[b].updatedAt);
        for (const k of keys.slice(0, keys.length - MAX_SYMBOLS_PER_USER)) if (k !== symbol) delete f.symbols[k];
      }
      write(u, f);
      return rec;
    },
    list(u) {
      return Object.entries(read(u).symbols).map(([symbol, r]) => ({ symbol, count: r.drawings.length, updatedAt: r.updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
  };
}

export function chartDrawingsDir(): string {
  return path.join(process.env.SHARED_STATE_DIR || path.join(process.cwd(), '.cache', 'shared'), 'chart-drawings');
}

/** Session user id (email/password session or the Replit OIDC claim), or null. */
export function sessionUserId(req: Request): string | null {
  const s = (req as { session?: { userId?: unknown } }).session?.userId;
  if (typeof s === 'string' && s) return s;
  const sub = (req as { user?: { claims?: { sub?: unknown } } }).user?.claims?.sub;
  return typeof sub === 'string' && sub ? sub : null;
}

export function registerChartDrawingRoutes(app: Express, requireMember: RequestHandler, store: () => ChartDrawingStore = (() => { let s: ChartDrawingStore | null = null; return () => (s ??= fileChartDrawingStore(chartDrawingsDir())); })()): void {
  const who = (req: Request) => sessionUserId(req);
  app.get('/api/chart/drawings', requireMember, (req, res) => {
    const u = who(req);
    if (!u) return res.status(401).json({ error: 'Sign in to sync drawings.' });
    res.json({ symbols: store().list(u) });
  });
  app.get('/api/chart/drawings/:symbol', requireMember, (req, res) => {
    const u = who(req);
    if (!u) return res.status(401).json({ error: 'Sign in to sync drawings.' });
    const sym = cleanSymbol(req.params.symbol);
    if (!sym) return res.status(400).json({ error: 'Bad symbol.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ symbol: sym, ...store().get(u, sym) });
  });
  app.put('/api/chart/drawings/:symbol', requireMember, (req, res) => {
    const u = who(req);
    if (!u) return res.status(401).json({ error: 'Sign in to sync drawings.' });
    const sym = cleanSymbol(req.params.symbol);
    if (!sym) return res.status(400).json({ error: 'Bad symbol.' });
    if (!Array.isArray(req.body?.drawings)) return res.status(400).json({ error: 'drawings[] required' });
    try {
      const rec = store().put(u, sym, req.body.drawings, Number(req.body.updatedAt));
      res.json({ ok: true, count: rec.drawings.length, updatedAt: rec.updatedAt });
    } catch {
      res.status(500).json({ error: 'Could not save drawings.' });
    }
  });
}
