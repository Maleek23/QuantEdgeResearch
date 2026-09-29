/**
 * Row mappers for the loss-rules report (pure — no DB import, so the research
 * script can feed a JSON export through the exact same mapping as the API).
 */
import { LOSS_RULES_TAG, readLossRulesStamp, type EvidenceLayer } from '@shared/loss-rules';
import type { PeerIdeaRow, ReportTrade } from '@shared/loss-rules-report';
import { mapDeskIdea, type DeskIdea } from './journal-row-maps';

export interface IdeaRow extends DeskIdea {
  holdingPeriod: string | null;
  genScoringLayers: unknown;
  convergenceSignalsJson: unknown;
}

export interface BotPositionRow {
  id: string;
  tradeIdeaId: string | null;
  symbol: string;
  assetType: string;
  direction: string;
  optionType: string | null;
  expiryDate: string | null;
  entryTime: string;
  status: string;
  realizedPnL: number | null;
  entrySignals: string | null;
}

const thesisOf = (d: string | null | undefined): 'long' | 'short' => (String(d ?? '').toLowerCase() === 'short' ? 'short' : 'long');

function layersOf(v: unknown): EvidenceLayer[] | null {
  const arr = typeof v === 'string' ? safeJson(v) : v;
  return Array.isArray(arr) ? (arr as EvidenceLayer[]) : null;
}
function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return null; } }
function convOf(v: unknown): Array<{ source: string; direction?: string | null }> | null {
  const o = typeof v === 'string' ? safeJson(v) : v;
  const sig = o && typeof o === 'object' ? (o as { signals?: unknown }).signals : null;
  return Array.isArray(sig) ? sig.map((x: any) => ({ source: String(x?.source ?? ''), direction: x?.direction ?? null })) : null;
}
function stampVersion(v: unknown): string | null {
  const o = typeof v === 'string' ? safeJson(v) : v;
  return readLossRulesStamp(o)?.version ?? null;
}

/** A published idea → a report trade, P&L on the journal's desk basis. Null when the desk cannot score it. */
export function deskReportTrade(i: IdeaRow): ReportTrade | null {
  const m = mapDeskIdea(i);
  if (!('row' in m) || m.row.realizedPnL == null) return null;
  return {
    id: m.row.id,
    ideaId: i.id,
    symbol: i.symbol,
    source: i.source,
    thesis: thesisOf(i.direction),
    assetType: i.assetType,
    entryTime: i.timestamp,
    publishedAt: i.timestamp,
    pnl: m.row.realizedPnL,
    holdingPeriod: i.holdingPeriod,
    expiryDate: i.expiryDate,
    entry: i.entryPrice ?? null,
    target: i.targetPrice ?? null,
    stop: i.stopLoss ?? null,
    layers: layersOf(i.genScoringLayers),
    convergenceSources: convOf(i.convergenceSignalsJson),
    rulesVersion: stampVersion(i.convergenceSignalsJson),
  };
}

/** A closed bot fill → a report trade (thesis from the contract: a bought put is short the underlying). */
export function botReportTrade(p: BotPositionRow, idea: IdeaRow | null): ReportTrade | null {
  if (p.status !== 'closed' || p.realizedPnL == null || !Number.isFinite(Number(p.realizedPnL))) return null;
  const thesis: 'long' | 'short' = p.assetType === 'option'
    ? (String(p.optionType ?? '').toLowerCase() === 'put' ? 'short' : 'long')
    : thesisOf(p.direction);
  const sig = p.entrySignals ? safeJson(p.entrySignals) : null;
  const stamped = Array.isArray(sig) && sig.includes(LOSS_RULES_TAG);
  return {
    id: `bot:${p.id}`,
    ideaId: p.tradeIdeaId,
    symbol: p.symbol,
    source: idea?.source ?? null,
    thesis,
    assetType: p.assetType,
    entryTime: p.entryTime,
    publishedAt: idea?.timestamp ?? null,
    pnl: Number(p.realizedPnL),
    holdingPeriod: idea?.holdingPeriod ?? null,
    expiryDate: p.expiryDate,
    entry: idea?.entryPrice ?? null,
    target: idea?.targetPrice ?? null,
    stop: idea?.stopLoss ?? null,
    layers: layersOf(idea?.genScoringLayers),
    convergenceSources: convOf(idea?.convergenceSignalsJson),
    rulesVersion: stamped ? LOSS_RULES_TAG.replace(/^rules:/, '') : null,
  };
}

export function peerRow(i: IdeaRow): PeerIdeaRow {
  const closed = i.outcomeStatus && i.outcomeStatus !== 'open' && i.exitDate ? Date.parse(i.exitDate) : NaN;
  return {
    id: i.id,
    symbol: i.symbol,
    source: i.source,
    direction: thesisOf(i.direction),
    publishedMs: Date.parse(i.timestamp),
    closedMs: Number.isFinite(closed) ? closed : null,
  };
}
