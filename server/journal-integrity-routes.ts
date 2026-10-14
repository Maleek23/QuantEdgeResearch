/**
 * JOURNAL INTEGRITY ROUTES — every read straight from trade_ideas rows
 * (shared/journal-integrity.ts), so the desk, NEXUS and the journal agree.
 *
 *   GET /api/zero-dte/sessions?date=YYYY-MM-DD  every 0DTE play of an ET day (default today) + days with plays
 *   GET /api/zero-dte/replay/:id               the play's contract premium path (1-min bars) + its premium plan
 *   GET /api/setups/by-day?date=YYYY-MM-DD      every NEXUS setup of an ET day with its outcome
 *   GET /api/integrity/data-health?days=14      gaps by day: missing contract / stale outcome / mismatch / unpriced
 *   GET /api/admin/withheld-ideas?days=14       ideas the write point refused (options-only, short-dated guard)
 */
import type { Express, NextFunction, Request, Response } from 'express';
import { logger } from './logger';
import { dataHealth, etDayBounds, isZeroDtePlay, toPlay, toSetupRow, type IdeaRowLike } from '@shared/journal-integrity';
import { etDateKey, premiumPlanFor, readPremiumPlan } from '@shared/premium-outcome';
import { contractGap } from '@shared/options-only';

type Mw = (req: Request, res: Response, next: NextFunction) => unknown;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

async function rowsBetween(fromIso: string, toIso: string, limit = 3000): Promise<IdeaRowLike[]> {
  const { db } = await import('./db');
  const { tradeIdeas } = await import('@shared/schema');
  const { and, gte, lt, desc } = await import('drizzle-orm');
  return await db.select().from(tradeIdeas)
    .where(and(gte(tradeIdeas.timestamp, fromIso), lt(tradeIdeas.timestamp, toIso)))
    .orderBy(desc(tradeIdeas.timestamp)).limit(limit) as unknown as IdeaRowLike[];
}

const replayCache = new Map<string, { at: number; body: unknown }>();

export function registerJournalIntegrityRoutes(app: Express, requireBetaAccess: Mw, requireAdmin: Mw) {
  app.get('/api/zero-dte/sessions', requireBetaAccess, async (req, res) => {
    const date = String(req.query.date ?? etDateKey(Date.now()));
    const b = DAY_RE.test(date) ? etDayBounds(date) : null;
    if (!b) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    try {
      const rows = (await rowsBetween(b.fromIso, b.toIso)).filter(isZeroDtePlay);
      const plays = rows.map(toPlay).sort((x, y) => x.firedAt.localeCompare(y.firedAt));
      // Days with plays (last 60 days) for the "Past sessions" picker.
      const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
      const recent = (await rowsBetween(since, new Date(Date.now() + 86_400_000).toISOString(), 5000)).filter(isZeroDtePlay);
      const days = [...new Set(recent.map((r) => etDateKey(Date.parse(r.timestamp))))].sort().reverse();
      res.json({
        date, asOf: new Date().toISOString(), plays, days,
        source: 'trade_ideas rows (the same rows the journal scores) — not the desk\'s in-memory state',
      });
    } catch (err) {
      logger.warn(`[ZD-SESSIONS] ${date}: ${(err as Error).message}`);
      res.status(500).json({ error: '0DTE sessions failed', message: (err as Error).message });
    }
  });

  app.get('/api/zero-dte/replay/:id', requireBetaAccess, async (req, res) => {
    const id = String(req.params.id ?? '');
    if (!/^[0-9a-f-]{8,40}$/i.test(id)) return res.status(400).json({ error: 'bad id' });
    const hit = replayCache.get(id);
    if (hit && Date.now() - hit.at < 5 * 60_000) return res.json(hit.body);
    try {
      const { storage } = await import('./storage');
      const idea: any = await storage.getTradeIdeaById(id);
      if (!idea) return res.status(404).json({ error: 'not found' });
      const gap = contractGap(idea);
      if (gap || String(idea.assetType) !== 'option') return res.json({ id, contract: null, note: `contract not recorded — ${gap ?? 'not an option'}; no premium path to replay`, bars: [] });
      const { contractMinuteBars } = await import('./option-bars-chain');
      const { ideaEntryMs } = await import('./option-peak-job');
      const entryMs = ideaEntryMs(idea) ?? Date.parse(idea.timestamp);
      const day = etDateKey(entryMs);
      const { etWallMs } = await import('@shared/premium-outcome');
      const open = etWallMs(day, 9 * 60 + 30), close = etWallMs(day, 16 * 60);
      const toMs = Math.min(close, Date.now());
      const type = String(idea.optionType).toLowerCase().startsWith('p') ? 'put' : 'call';
      const cb = await contractMinuteBars({ symbol: idea.symbol, expiry: String(idea.expiryDate).slice(0, 10), optionType: type, strike: Number(idea.strikePrice), fromMs: open, toMs });
      const plan = readPremiumPlan(idea.convergenceSignalsJson) ?? premiumPlanFor(idea, { zeroDte: true });
      const body = {
        id, symbol: idea.symbol, contract: `${idea.symbol} ${idea.strikePrice}${type === 'put' ? 'P' : 'C'} ${String(idea.expiryDate).slice(0, 10)}`,
        entryMs, exitMs: Date.parse(String(idea.exitDate ?? '')) || null,
        entryPremium: idea.entryPremium ?? null, exitPremium: idea.exitPremium ?? null,
        plan, bars: cb.bars.map((x) => ({ t: x.t, o: x.o, h: x.h, l: x.l, c: x.c })),
        source: cb.source, occ: cb.occ, tried: cb.tried, asOf: new Date().toISOString(),
        note: cb.bars.length ? `${cb.bars.length} 1-minute bars · ${cb.source} (indicative/delayed prints, not NBBO)` : `no contract bars answered (${cb.tried.join(', ') || 'no source'})`,
      };
      replayCache.set(id, { at: Date.now(), body });
      if (replayCache.size > 300) replayCache.delete(replayCache.keys().next().value as string);
      res.json(body);
    } catch (err) {
      logger.warn(`[ZD-REPLAY] ${id}: ${(err as Error).message}`);
      res.status(500).json({ error: 'replay failed', message: (err as Error).message });
    }
  });

  app.get('/api/setups/by-day', requireBetaAccess, async (req, res) => {
    const date = String(req.query.date ?? etDateKey(Date.now()));
    const b = DAY_RE.test(date) ? etDayBounds(date) : null;
    if (!b) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    try {
      const rows = await rowsBetween(b.fromIso, b.toIso);
      // NEXUS P&L per day (shared/nexus-pnl.ts, computed on the client at the $500/$1,000 toggle):
      // the contract fields, budget contract, recorded peak and verify-ledger chip ride along.
      const { readBudgetContract } = await import('@shared/budget-contract');
      const { parsePeak } = await import('@shared/option-peak');
      const { ideaVerification } = await import('./idea-verification');
      const setups = rows.filter((r) => !['manual', 'user'].includes(String(r.source ?? '').toLowerCase())).map((r) => {
        const x = r as IdeaRowLike & Record<string, any>;
        const pk = parsePeak(x.outcomeNotes);
        const resolved = String(x.outcomeStatus ?? 'open') !== 'open';
        return {
          ...toSetupRow(r),
          pnlInput: {
            assetType: x.assetType ?? null, optionType: x.optionType ?? null, strikePrice: x.strikePrice ?? null, expiryDate: x.expiryDate ?? null,
            entryPremium: x.entryPremium ?? null, exitPremium: x.exitPremium ?? null, outcomeStatus: x.outcomeStatus ?? 'open', exitDate: x.exitDate ?? null,
            budgetContract: readBudgetContract(x.convergenceSignalsJson), peak: pk ? { premium: pk.premium, atMs: pk.atMs } : null,
          },
          verification: resolved ? ideaVerification(String(x.id)) : null,
        };
      });
      res.json({ date, asOf: new Date().toISOString(), setups, source: 'trade_ideas rows published that ET day; outcomes as recorded by the tracker' });
    } catch (err) {
      res.status(500).json({ error: 'setups by day failed', message: (err as Error).message });
    }
  });

  app.get('/api/integrity/data-health', requireBetaAccess, async (req, res) => {
    const days = Math.max(1, Math.min(60, Number(req.query.days ?? 14) || 14));
    try {
      const rows = await rowsBetween(new Date(Date.now() - days * 86_400_000).toISOString(), new Date(Date.now() + 60_000).toISOString(), 8000);
      const auto = rows.filter((r) => !['manual', 'user'].includes(String(r.source ?? '').toLowerCase()));
      res.json({ windowDays: days, asOf: new Date().toISOString(), ...dataHealth(auto, Date.now()), source: 'trade_ideas rows (automated sources) — computed on request' });
    } catch (err) {
      res.status(500).json({ error: 'data health failed', message: (err as Error).message });
    }
  });

  app.get('/api/admin/withheld-ideas', requireAdmin, async (req, res) => {
    try {
      const { listWithheldIdeas } = await import('./lib/withheld-ideas');
      const rows = await listWithheldIdeas({ days: Number(req.query.days ?? 14) || 14 });
      res.json({ asOf: new Date().toISOString(), rows, source: 'analysis_audit_log consumed_by=withheld_idea' });
    } catch (err) {
      res.status(500).json({ error: 'withheld list failed', message: (err as Error).message });
    }
  });
}
