/**
 *   GET /api/ideas/:id/detail — any idea by id, in the board's pick shape
 *   (server/idea-detail-core.ts), with its stored outcome and the contract's
 *   premium outcome (T1 / T2 / stop / peak with times) judged on the
 *   contract's own 1-minute bars. Open, resolved, expired and past-day ideas.
 *
 * Read-only. The premium bars are bounded (6 s) and cached per idea; a slow or
 * empty bar feed ships the detail without them, with the reason.
 */
import type { Express, RequestHandler } from 'express';
import { storage } from './storage';
import { logger } from './logger';
import { buildIdeaDetail, type IdeaDetailResponse } from './idea-detail-core';
import { judgePremiumOutcome, premiumPlanFor } from '@shared/premium-outcome';
import { isZeroDteJournalRow } from '@shared/zero-dte-journal';

const cache = new Map<string, { at: number; premium: IdeaDetailResponse['premium']; note: string | null }>();
const OPEN_TTL = 45_000;
const RESOLVED_TTL = 30 * 60_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

async function premiumFor(idea: any, nowMs: number): Promise<{ premium: IdeaDetailResponse['premium']; note: string | null }> {
  if (String(idea.assetType) !== 'option') return { premium: null, note: null };
  const resolved = String(idea.outcomeStatus ?? 'open').toLowerCase() !== 'open';
  const hit = cache.get(idea.id);
  if (hit && nowMs - hit.at < (resolved ? RESOLVED_TTL : OPEN_TTL)) return hit;
  const zeroDte = isZeroDteJournalRow({ source: idea.source, dataSourceUsed: idea.dataSourceUsed, qualitySignals: idea.qualitySignals, assetType: idea.assetType, expiryDate: idea.expiryDate, entryTime: idea.timestamp });
  const plan = premiumPlanFor(idea, { zeroDte, nowMs });
  const strike = Number(idea.strikePrice);
  const day = String(idea.expiryDate ?? '').slice(0, 10);
  const out = (premium: IdeaDetailResponse['premium'], note: string | null) => { const v = { at: nowMs, premium, note }; cache.set(idea.id, v); if (cache.size > 500) cache.delete(cache.keys().next().value as string); return v; };
  if (!plan) return out(null, 'no premium plan — the contract entry premium was not recorded');
  if (!(strike > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return out(null, 'contract strike / expiry not recorded');
  try {
    const { ideaEntryMs } = await import('./option-peak-job');
    const { contractMinuteBars } = await import('./option-bars-chain');
    const entryMs = ideaEntryMs(idea);
    if (entryMs == null) return out(null, 'no recorded entry time');
    const exitMs = Date.parse(String(idea.exitDate ?? ''));
    const expiryEnd = Date.parse(`${day}T20:15:00Z`); // after the 16:00 ET close (EDT/EST safe)
    const toMs = Math.min(nowMs, resolved && Number.isFinite(exitMs) ? Math.max(exitMs, entryMs + 60_000) : expiryEnd);
    if (toMs <= entryMs) return out(null, 'entry has not happened yet');
    const type = String(idea.optionType ?? '').toLowerCase().startsWith('p') ? 'put' : 'call';
    const cb = await withTimeout(contractMinuteBars({ symbol: idea.symbol, expiry: day, optionType: type, strike, fromMs: entryMs, toMs, nowMs }), 6000);
    if (!cb) return { premium: null, note: 'contract bars timed out — try again' }; // not cached
    if (!cb.bars.length) return out(null, `no contract bars from ${cb.tried.join(', ') || 'any feed'}`);
    const final = resolved || nowMs >= expiryEnd;
    const judged = judgePremiumOutcome(cb.bars, plan, entryMs, toMs, { final, source: cb.source });
    const last = cb.bars[cb.bars.length - 1];
    // MAE: lowest premium from entry to the exit (or now) — NEXUS P&L block (shared/nexus-pnl.ts).
    const troughTo = judged.exitAtMs != null ? judged.exitAtMs + 60_000 : toMs;
    let trough: { premium: number; atMs: number } | null = null;
    for (const b of cb.bars) if (b.t >= entryMs && b.t < troughTo && Number.isFinite(b.l) && b.l > 0 && (!trough || b.l < trough.premium)) trough = { premium: Math.round(b.l * 100) / 100, atMs: b.t };
    return out({ ...judged, trough, asOf: new Date(last.t).toISOString(), lastPremium: last.c, source: cb.occ ? `${cb.occ} · ${cb.source}` : cb.source }, null);
  } catch (e: any) {
    logger.warn('[idea-detail] premium bars failed', { id: idea.id, error: e?.message });
    return { premium: null, note: 'contract bars unavailable' };
  }
}

/** The detail for one idea id (null when no trade_ideas row). Read-only. */
export async function ideaDetailFor(id: string, nowMs = Date.now()): Promise<IdeaDetailResponse | null> {
  const idea = await storage.getTradeIdeaById(id);
  if (!idea) return null;
  const { premium, note } = await premiumFor(idea, nowMs);
  const { ideaVerification } = await import('./idea-verification');
  return { ...buildIdeaDetail(idea, premium, note, nowMs), verification: ideaVerification(String(idea.id)) };
}

export function registerIdeaDetailRoutes(app: Express, gate: RequestHandler): void {
  app.get('/api/ideas/:id/detail', gate, async (req, res) => {
    try {
      const id = String(req.params.id ?? '').replace(/^desk:/, '').trim();
      if (!/^[A-Za-z0-9_-]{4,80}$/.test(id)) return res.status(400).json({ error: 'bad idea id' });
      const detail = await ideaDetailFor(id);
      if (!detail) return res.status(404).json({ error: 'idea not found — no trade_ideas row for this id' });
      res.set('Cache-Control', 'private, max-age=15');
      res.json(detail);
    } catch (e: any) {
      logger.error('[idea-detail] failed', { error: e?.message });
      res.status(500).json({ error: 'idea detail failed' });
    }
  });
}
