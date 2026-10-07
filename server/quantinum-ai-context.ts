/**
 * Ask Quantinum — the context pack. OUR data only, for the object in front of
 * the member: the Quantinum dossier (live quote with source + age, GEX walls,
 * engine layers incl. flow + sector), the level map, the flow tape summary, the
 * verified model record (with n), and for a NEXUS setup its plan, grade
 * breakdown and lifecycle. Every value carries a stable key the model must
 * cite, a source and an age; anything we could not read goes in `missing`.
 *
 * Data access goes through `deps` so scripts/test-quantinum-ai.ts builds packs
 * with no database or network.
 */
import type { AskTarget, ContextPack, PackField } from '@shared/quantinum-ai';
import type { QuantinumDossier } from './quantinum-intelligence';
import type { LevelMap } from '@shared/levels/level-math';
import type { TapePayload } from './flow-tape';
import type { ModelRecord } from '@shared/model-record';
import type { LookupRequest } from './quantinum-ai-prompt';
import { gradeIdeaRow, pickFromIdeaRow, NEXUS_GRADE_CAVEAT } from '@shared/nexus-grade';
import { setupLifecycle } from '@shared/setup-lifecycle';

export interface IdeaRow {
  id: string; userId?: string | null; visibility?: string | null; symbol: string; assetType?: string | null; direction?: string | null;
  holdingPeriod?: string | null; entryPrice?: number | null; targetPrice?: number | null; stopLoss?: number | null; riskRewardRatio?: number | null;
  timestamp?: string | null; generationTimestamp?: string | null; exitBy?: string | null; expiryDate?: string | null; strikePrice?: number | null;
  optionType?: string | null; source?: string | null; outcomeStatus?: string | null; tradeType?: string | null;
  genConvictionScore?: number | null; genScoringLayers?: unknown; convergenceSignalsJson?: unknown; entryValidUntil?: string | null;
  [k: string]: unknown;
}

export interface ContextDeps {
  now: () => number;
  getIdea: (id: string) => Promise<IdeaRow | null>;
  getDossier: (symbol: string) => Promise<QuantinumDossier | null>;
  getLevels: (symbol: string) => Promise<LevelMap | null>;
  getFlow: (symbol: string) => Promise<TapePayload | null>;
  /** Canonical verified record (computeModelRecord) overall + for one symbol. */
  getRecord: (symbol: string | null) => Promise<{ overall: ModelRecord | null; symbol: ModelRecord | null }>;
  getQuote: (symbol: string) => Promise<{ price: number; changePercent: number | null; source: string | null; asOf: string | null; session: string | null; stale: boolean } | null>;
}

export interface Caller { userId: string | null; isSuper: boolean }

const r2 = (n: unknown, d = 2): number | null => (typeof n === 'number' && Number.isFinite(n) ? +n.toFixed(d) : null);
const ageSec = (asOf: string | null | undefined, now: number): number | null => {
  const t = Date.parse(String(asOf ?? ''));
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 1000)) : null;
};

class PackBuilder {
  fields: PackField[] = [];
  missing: string[] = [];
  add(key: string, label: string, value: unknown, source: string, asOf?: string | null) {
    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) return;
    if (this.fields.some((f) => f.key === key)) return;
    this.fields.push({ key, label, value, source, asOf: asOf ?? null });
  }
  miss(what: string) { if (!this.missing.includes(what)) this.missing.push(what); }
}

/** Is this idea something the caller may see? System ideas (no owner) and public ones: yes. */
export function ideaVisibleTo(idea: Pick<IdeaRow, 'userId' | 'visibility'>, caller: Caller): boolean {
  if (caller.isSuper) return true;
  if (!idea.userId) return true;
  if (idea.userId === caller.userId) return true;
  return idea.visibility === 'public' || idea.visibility === 'subscribers_only';
}

function addDossier(b: PackBuilder, d: QuantinumDossier | null, now: number) {
  if (!d) { b.miss('quantinum dossier (quote, dealer levels, engine layers)'); return; }
  const src = 'Quantinum dossier /api/quantinum/:symbol';
  if (d.price?.last != null) {
    b.add('quote.last', 'Last price', r2(d.price.last), `realtime quote (${d.price.source ?? 'source unknown'})`, d.price.asOf);
    b.add('quote.changePct', 'Change %', r2(d.price.changePercent), 'realtime quote', d.price.asOf);
    b.add('quote.age', 'Quote age', { ageSec: ageSec(d.price.asOf, now), stale: !!d.price.stale, session: d.price.session ?? null, source: d.price.source ?? null }, 'realtime quote', d.price.asOf);
  } else b.miss('live quote');
  if (d.gex) {
    b.add('gex.walls', 'GEX walls', {
      spot: r2(d.gex.spot), callWall: r2(d.gex.callWall), putWall: r2(d.gex.putWall), zeroGamma: r2(d.gex.zeroGamma),
      regime: d.gex.regime, netGexSign: d.gex.netGexSign, wallBasis: d.gex.wallBasis ?? null,
    }, 'GEX snapshot (options exposures)', d.gex.asOf);
  } else b.miss('GEX walls');
  b.add('engines.read', 'Engine read', { lean: d.lean, bullPoints: d.bullPoints, bearPoints: d.bearPoints, confidence: d.confidence }, src, d.asOf);
  const layers = (d.layers ?? []).filter((l: any) => !['gex', 'gex-adjusted'].includes(String(l.kind)));
  b.add('engines.layers', 'Engine layers', layers.slice(0, 12).map((l) => ({ kind: l.kind, label: l.label, points: l.points, why: String(l.why).slice(0, 160), source: l.source })), src, d.asOf);
  const sector = (d.layers ?? []).find((l) => l.kind === 'sector');
  if (sector) b.add('sector.rotation', 'Sector / rotation', { label: sector.label, points: sector.points, why: String(sector.why).slice(0, 200) }, sector.source || src, d.asOf);
  else b.miss('sector / rotation read');
  const flowLayer = (d.layers ?? []).find((l) => l.kind === 'flow');
  if (flowLayer) b.add('flow.engine', 'Options-tape engine', { points: flowLayer.points, why: String(flowLayer.why).slice(0, 200) }, flowLayer.source || src, d.asOf);
  b.add('shortGate', 'Short gate', d.shortGate, src, d.asOf);
  for (const u of d.unavailable ?? []) b.miss(String(u));
}

function addLevels(b: PackBuilder, m: LevelMap | null) {
  if (!m || !m.clusters?.length) { b.miss('price levels (level map)'); return; }
  const last = m.last ?? 0;
  const near = m.clusters
    .filter((c) => !last || Math.abs(c.price / last - 1) <= 0.08)
    .sort((a, c) => (last ? Math.abs(a.price - last) - Math.abs(c.price - last) : c.score - a.score))
    .slice(0, 8)
    .map((c) => ({ price: r2(c.price), label: c.label, score: r2(c.score, 1), side: last ? (c.price >= last ? 'above' : 'below') : null }));
  b.add('levels.nearest', 'Nearest levels', { last: r2(m.last), atrDaily: r2(m.atrDaily), clusters: near, status: 'measuring' }, 'level map /api/levels/:symbol', m.asOf);
}

function addFlow(b: PackBuilder, t: TapePayload | null) {
  if (!t) { b.miss('options flow tape'); return; }
  const rows = t.rows ?? [];
  if (!rows.length) { b.add('flow.summary', 'Flow today', { prints: 0, note: 'no prints on the tape for this symbol today' }, 'flow tape /api/flow/tape', t.generatedAt); return; }
  let callPrem = 0, putPrem = 0;
  for (const r of rows) { if (r.optionType === 'call') callPrem += r.premium || 0; else putPrem += r.premium || 0; }
  const top = [...rows].sort((a, c) => (c.premium || 0) - (a.premium || 0)).slice(0, 5)
    .map((r) => ({ at: r.at, type: r.optionType, strike: r.strike, expiry: r.expiry, premium: Math.round(r.premium || 0), kind: r.kind, source: r.source }));
  b.add('flow.summary', 'Flow today', {
    prints: rows.length, callPremium: Math.round(callPrem), putPremium: Math.round(putPrem),
    callShare: callPrem + putPrem > 0 ? r2(callPrem / (callPrem + putPrem), 2) : null,
    topByPremium: top, newestAt: t.sources?.bullflow?.newestAt ?? t.sources?.chainScan?.newestAt ?? null,
    note: 'sentiment (bought vs sold) is not inferred — premium is per side of the chain, not direction of the trade',
  }, 'flow tape /api/flow/tape', t.generatedAt);
}

function recordValue(r: ModelRecord) {
  return { n: r.decided, total: r.total, wins: r.wins, losses: r.losses, winRatePct: r.winRate, expectancyR: r2(r.expectancyR), sampleFloor: r.sampleFloor, since: r.since };
}
function addRecord(b: PackBuilder, rec: { overall: ModelRecord | null; symbol: ModelRecord | null } | null, symbol: string | null) {
  if (!rec?.overall) { b.miss('verified model record'); return; }
  b.add('record.overall', 'Verified record (all setups)', recordValue(rec.overall), 'canonical model record (outcome-v2)');
  if (symbol) {
    if (rec.symbol && rec.symbol.total > 0) b.add('record.symbol', `Verified record (${symbol})`, recordValue(rec.symbol), 'canonical model record (outcome-v2)');
    else b.miss(`verified record for ${symbol} (no resolved setups)`);
  }
}

function addIdea(b: PackBuilder, idea: IdeaRow, now: number) {
  const src = 'NEXUS setup (trade_ideas)';
  b.add('setup.plan', 'Setup plan', {
    symbol: idea.symbol, direction: idea.direction, assetType: idea.assetType, holdingPeriod: idea.holdingPeriod, tradeType: idea.tradeType ?? null,
    entry: r2(idea.entryPrice), stop: r2(idea.stopLoss), target: r2(idea.targetPrice), riskReward: r2(idea.riskRewardRatio),
    option: idea.assetType === 'option' ? { type: idea.optionType, strike: r2(idea.strikePrice), expiry: idea.expiryDate } : null,
    engine: idea.source, calledAt: idea.timestamp, exitBy: idea.exitBy ?? null, outcome: idea.outcomeStatus ?? 'open',
  }, src, idea.timestamp ?? null);
  try {
    const pick = pickFromIdeaRow(idea as any);
    const life = setupLifecycle(pick, now);
    b.add('setup.lifecycle', 'Lifecycle', {
      state: life.state, label: life.label, reason: life.reason, session: life.session, sessions: life.sessions,
      windowEnds: life.windowEndsMs ? new Date(life.windowEndsMs).toISOString() : null,
    }, 'setup lifecycle (shared/setup-lifecycle)');
    const g = gradeIdeaRow(idea as any, now);
    b.add('setup.grade', 'NEXUS grade', {
      score: g.score, letter: g.letter, version: g.version,
      factors: g.factors.map((f) => ({ label: f.label, points: f.points, max: f.max, basis: f.basis, validated: f.validated })),
      action: g.action ? { state: g.action.label, reasons: g.action.reasons.slice(0, 4) } : null,
      caveat: NEXUS_GRADE_CAVEAT,
    }, 'NEXUS grade (shared/nexus-grade)');
  } catch {
    b.miss('NEXUS grade / lifecycle');
  }
}

const settle = async <T>(p: Promise<T>): Promise<T | null> => { try { return await p; } catch { return null; } };

/**
 * Build the pack for one target. Never throws: a failed source becomes a
 * `missing` entry, so the model says "not in the data" instead of guessing.
 */
export async function buildContextPack(target: AskTarget, caller: Caller, deps: ContextDeps): Promise<ContextPack> {
  const now = deps.now();
  const b = new PackBuilder();
  let symbol = target.symbol ?? null;

  if (target.kind === 'setup') {
    const idea = target.id ? await settle(deps.getIdea(target.id)) : null;
    if (idea && ideaVisibleTo(idea, caller)) {
      symbol = String(idea.symbol || '').toUpperCase() || symbol;
      addIdea(b, idea, now);
    } else b.miss('the NEXUS setup (not found or not visible to you)');
  }

  if (target.page) b.add('page', 'Page', target.page, 'the page the question was asked from');

  if (target.row && ['flow', 'gex', 'zerodte', 'journal'].includes(target.kind)) {
    const label = { flow: 'Selected flow print', gex: 'Selected GEX level', zerodte: 'Selected 0DTE row', journal: 'Selected journal trade' }[target.kind as 'flow'];
    b.add('selected.row', `${label} (as displayed)`, target.row, `${target.kind} row as displayed on the page`);
  }

  if (symbol) {
    b.add('subject.symbol', 'Symbol', symbol, 'question target');
    const [dossier, levels, flow, record] = await Promise.all([
      settle(deps.getDossier(symbol)), settle(deps.getLevels(symbol)), settle(deps.getFlow(symbol)), settle(deps.getRecord(symbol)),
    ]);
    addDossier(b, dossier, now);
    addLevels(b, levels);
    addFlow(b, flow);
    addRecord(b, record, symbol);
  } else {
    addRecord(b, await settle(deps.getRecord(null)), null);
    if (target.kind !== 'page') b.miss('a ticker symbol for this object');
  }

  return { generatedAt: new Date(now).toISOString(), target, fields: b.fields, missing: b.missing };
}

/** Run a whitelisted lookup and fold its result into the pack (keys prefixed lookup.<tool>.<SYM>). */
export async function applyLookup(pack: ContextPack, req: LookupRequest, deps: ContextDeps): Promise<ContextPack> {
  const b = new PackBuilder();
  b.fields = [...pack.fields]; b.missing = [...pack.missing];
  const now = deps.now();
  const key = `lookup.${req.tool}.${req.symbol}`;
  if (req.tool === 'quote') {
    const q = await settle(deps.getQuote(req.symbol));
    if (q) b.add(key, `${req.symbol} quote`, { last: r2(q.price), changePct: r2(q.changePercent), source: q.source, ageSec: ageSec(q.asOf, now), stale: q.stale, session: q.session }, 'realtime quote', q.asOf);
    else b.miss(`${req.symbol} quote`);
  } else if (req.tool === 'levels') {
    const m = await settle(deps.getLevels(req.symbol));
    const tmp = new PackBuilder(); addLevels(tmp, m);
    const f = tmp.fields[0];
    if (f) b.add(key, `${req.symbol} levels`, f.value, f.source, f.asOf); else b.miss(`${req.symbol} levels`);
  } else if (req.tool === 'dossier') {
    const d = await settle(deps.getDossier(req.symbol));
    if (d) b.add(key, `${req.symbol} dossier`, {
      last: r2(d.price?.last), quoteAgeSec: ageSec(d.price?.asOf, now), quoteSource: d.price?.source ?? null,
      lean: d.lean, bullPoints: d.bullPoints, bearPoints: d.bearPoints,
      gex: d.gex ? { callWall: r2(d.gex.callWall), putWall: r2(d.gex.putWall), zeroGamma: r2(d.gex.zeroGamma), regime: d.gex.regime } : null,
      layers: (d.layers ?? []).slice(0, 8).map((l) => ({ label: l.label, points: l.points })),
    }, 'Quantinum dossier /api/quantinum/:symbol', d.asOf);
    else b.miss(`${req.symbol} dossier`);
  }
  return { ...pack, fields: b.fields, missing: b.missing };
}

// ─── production deps ─────────────────────────────────────────

let recordCache: { at: number; ideas: any[] } | null = null;
const RECORD_TTL_MS = 10 * 60_000;

export function defaultContextDeps(): ContextDeps {
  return {
    now: Date.now,
    getIdea: async (id) => {
      const { storage } = await import('./storage');
      return ((await storage.getTradeIdeaById(id)) as unknown as IdeaRow) ?? null;
    },
    getDossier: async (s) => (await import('./quantinum-intelligence')).getQuantinumDossier(s),
    getLevels: async (s) => (await import('./levels/level-map')).getLevelMap(s),
    getFlow: async (s) => (await import('./flow-tape')).buildFlowTape(1, s),
    getRecord: async (s) => {
      if (!recordCache || Date.now() - recordCache.at > RECORD_TTL_MS) {
        const { storage } = await import('./storage');
        recordCache = { at: Date.now(), ideas: (await storage.getAllTradeIdeas()) as any[] };
      }
      const { computeModelRecord } = await import('@shared/model-record');
      const ideas = recordCache.ideas;
      return {
        overall: computeModelRecord(ideas),
        symbol: s ? computeModelRecord(ideas.filter((i) => String(i.symbol).toUpperCase() === s)) : null,
      };
    },
    getQuote: async (s) => {
      const { getRealtimeQuote } = await import('./realtime-pricing-service');
      const q: any = await getRealtimeQuote(s, 'stock');
      if (!q || !Number.isFinite(q.price) || q.price <= 0) return null;
      return {
        price: q.price, changePercent: Number.isFinite(q.changePercent) ? q.changePercent : null, source: q.source ?? null,
        asOf: q.lastUpdate instanceof Date ? q.lastUpdate.toISOString() : null, session: q.session ?? null, stale: !!q.stale,
      };
    },
  };
}
