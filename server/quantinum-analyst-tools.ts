/**
 * Quantinum Analyst — deterministic tools behind the slash commands
 * (shared/quantinum-analyst.ts). Each reads EXISTING services through `deps`
 * and returns an AnalystCard: every fact references a source with its own
 * timestamp; a failed source makes the card 'unavailable' (never a guess);
 * "nothing qualifies" is an 'empty' card, which is a valid answer.
 *
 * Read-only: nothing here writes, computes GEX itself, or touches the chart /
 * GEX computation / snapshot code — the horizon is applied by picking the GEX
 * DTE bucket the existing bucket endpoint already returns, and by filtering
 * flow prints by expiry here.
 */
import {
  ANALYST_DISCLAIMER, RECORD_MIN_N, parseRecordPattern, patternLabel, recordLine, resolveCommandArg,
  type AnalystCard, type AnalystCommand, type CardFact, type CardSource, type CardTable, type PageContext, type ParsedCommand, type RecordLine, type RecordPattern,
} from '@shared/quantinum-analyst';
import { HORIZON_WINDOWS, expiryInHorizon, type Horizon } from '@shared/quantinum-horizon';
import { OUTCOME_BASELINE_DATE } from '@shared/constants';
import { computeModelRecord } from '@shared/model-record';
import { gradeIdeaRow, gradeIdeaRowAtPublish, pickFromIdeaRow } from '@shared/nexus-grade';
import { setupLifecycle } from '@shared/setup-lifecycle';
import type { QuantinumDossier } from './quantinum-intelligence';
import type { LevelMap } from '@shared/levels/level-math';
import type { TapePayload } from './flow-tape';
import type { IdeaRow } from './quantinum-ai-context';
import { loadDeskVerifyLedger } from './desk-verify-ledger';

export interface GexBucketRead {
  callWall: number | null; putWall: number | null; gammaFlipPrice: number | null; maxGammaStrike: number | null; totalGEX: number; expirationsCount: number;
}
export interface GexBuckets {
  spot: number | null; asOf: string | null; source: string | null; regime: string | null;
  byDte: Partial<Record<string, GexBucketRead>>;
}
export interface SectorRead {
  id: string; label: string; etf: string | null; rank: number | null; rankDelta: number | null; composite: number | null;
  r1: number | null; r3: number | null; r10: number | null; breadth: number | null; regime: string | null; side: string | null;
  leaders: Array<{ symbol: string; r1: number | null; relSector: number | null }>;
}
export interface SectorBoardRead { asOf: string | null; liveAsOf: string | null; sectors: SectorRead[]; honesty: string | null }
export interface NewsItem { title: string; source: string; url: string | null; publishedAt: string | null; sentiment: string | null }
export interface VerifyLedger { asOf: string; byId: Map<string, { verdict: 'VERIFIED' | 'MISMATCH' | 'UNVERIFIABLE' }> }

export interface AnalystDeps {
  now: () => number;
  getDossier: (s: string) => Promise<QuantinumDossier | null>;
  getLevels: (s: string) => Promise<LevelMap | null>;
  getGexBuckets: (s: string) => Promise<GexBuckets | null>;
  getFlow: (s: string) => Promise<TapePayload | null>;
  getIdea: (id: string) => Promise<IdeaRow | null>;
  getIdeas: () => Promise<IdeaRow[]>;
  getSectorBoard: () => Promise<SectorBoardRead | null>;
  getNews: (s: string) => Promise<{ items: NewsItem[]; fetchedAt: string } | null>;
  getVerifyLedger: () => VerifyLedger | null;
}

const r2 = (n: unknown, d = 2): number | null => (typeof n === 'number' && Number.isFinite(n) ? +n.toFixed(d) : null);
const settle = async <T>(p: Promise<T>): Promise<T | null> => { try { return await p; } catch { return null; } };

class CardBuilder {
  facts: CardFact[] = [];
  sources: CardSource[] = [];
  notes: string[] = [];
  table: CardTable | null = null;
  record: RecordLine | null = null;
  src(key: string, label: string, source: string, asOf: string | null | undefined): string {
    if (!this.sources.some((s) => s.key === key)) this.sources.push({ key, label, source, asOf: asOf ?? null });
    return key;
  }
  fact(key: string, label: string, value: CardFact['value'], src: string, unit: CardFact['unit'] = '') {
    if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) return;
    this.facts.push({ key, label, value, unit, src });
  }
}

interface Ctx { cmd: ParsedCommand; horizon: Horizon; page: PageContext; deps: AnalystDeps; caller: { userId: string | null; isSuper: boolean } }

function card(ctx: Ctx, b: CardBuilder, title: string, subject: string | null, status: AnalystCard['status'], message: string | null): AnalystCard {
  return {
    command: ctx.cmd.command, title, subject, horizon: ctx.horizon, status, message,
    facts: b.facts, table: b.table, record: b.record, notes: b.notes, sources: b.sources,
    generatedAt: new Date(ctx.deps.now()).toISOString(),
    request: { command: ctx.cmd.command, arg: ctx.cmd.arg, horizon: ctx.horizon, page: ctx.page },
    disclaimer: ANALYST_DISCLAIMER,
  };
}

function quoteFacts(b: CardBuilder, d: QuantinumDossier | null, prefix = '') {
  if (d?.price?.last == null) return false;
  const s = b.src(`${prefix}quote`, `${prefix ? prefix.replace(/\.$/, '') + ' ' : ''}Quote`, `realtime quote (${d.price.source ?? 'source unknown'})${d.price.stale ? ' — STALE' : ''}`, d.price.asOf);
  b.fact(`${prefix}last`, 'Last', r2(d.price.last), s, '$');
  b.fact(`${prefix}chg`, 'Change', r2(d.price.changePercent), s, '%');
  return true;
}

// ─── /levels ────────────────────────────────────────────────
async function levelsTool(ctx: Ctx, sym: string): Promise<AnalystCard> {
  const b = new CardBuilder();
  const w = HORIZON_WINDOWS[ctx.horizon];
  const [dossier, map, buckets] = await Promise.all([settle(ctx.deps.getDossier(sym)), settle(ctx.deps.getLevels(sym)), settle(ctx.deps.getGexBuckets(sym))]);
  quoteFacts(b, dossier);
  const bucket = buckets?.byDte?.[w.gexBucket] ?? null;
  if (bucket) {
    const s = b.src('gex.bucket', `GEX ${w.label} (${w.gexBucket} bucket)`, `GEX DTE buckets /api/gex/buckets/:symbol (${buckets!.source ?? 'source unknown'}) · ${bucket.expirationsCount} expiries`, buckets!.asOf);
    b.fact('gex.callWall', `Call wall · ${w.gexBucketRange}`, r2(bucket.callWall), s, '$');
    b.fact('gex.putWall', `Put wall · ${w.gexBucketRange}`, r2(bucket.putWall), s, '$');
    b.fact('gex.flip', `Gamma flip · ${w.gexBucketRange}`, r2(bucket.gammaFlipPrice), s, '$');
    b.fact('gex.maxGamma', 'Max-gamma strike', r2(bucket.maxGammaStrike), s, '$');
    if (bucket.gammaFlipPrice == null) b.notes.push(`No gamma flip in the ${w.gexBucket} bucket (never changes sign within 0.8–1.2× spot) — not computed, not guessed.`);
    if (w.bucketNote) b.notes.push(w.bucketNote);
  } else if (dossier?.gex) {
    const s = b.src('gex.all', 'GEX walls (all expiries)', 'GEX snapshot via Quantinum dossier', dossier.gex.asOf);
    b.fact('gex.callWall', 'Call wall · all expiries', r2(dossier.gex.callWall), s, '$');
    b.fact('gex.putWall', 'Put wall · all expiries', r2(dossier.gex.putWall), s, '$');
    b.fact('gex.flip', 'Zero gamma · all expiries', r2(dossier.gex.zeroGamma), s, '$');
    b.notes.push(`No ${w.label.toLowerCase()} (${w.expiries}) GEX bucket for ${sym} — showing all-expiry walls instead.`);
  } else b.notes.push('GEX walls: not in the data.');
  if (map?.clusters?.length) {
    const s = b.src('levels', 'Level map', `level map /api/levels/:symbol${map.notes?.length ? '' : ''}`, map.asOf);
    const last = map.last ?? dossier?.price?.last ?? null;
    const near = [...map.clusters]
      .filter((c) => !last || Math.abs(c.price / last - 1) <= 0.08)
      .sort((a, c) => (last ? Math.abs(a.price - last) - Math.abs(c.price - last) : c.score - a.score))
      .slice(0, 6)
      .sort((a, c) => c.price - a.price);
    b.table = { columns: ['Level', 'Label', 'Side', 'Score'], rows: near.map((c, i) => ({ key: `lvl${i}`, cells: [r2(c.price), c.label, last ? (c.price >= last ? 'above' : 'below') : '—', r2(c.score, 1)], src: s })) };
    near.forEach((c, i) => b.fact(`lvl.${i}`, `${c.label}`, r2(c.price), s, '$'));
    b.fact('atrDaily', 'ATR (daily)', r2(map.atrDaily), s, '$');
  } else b.notes.push('Price level map: not in the data.');
  const any = b.facts.length > 0;
  return card(ctx, b, `Levels · ${sym}`, sym, any ? 'ok' : 'unavailable', any ? null : `No level, GEX or quote data for ${sym} right now.`);
}

// ─── /flow ──────────────────────────────────────────────────
async function flowTool(ctx: Ctx, sym: string): Promise<AnalystCard> {
  const b = new CardBuilder();
  const w = HORIZON_WINDOWS[ctx.horizon];
  const tape = await settle(ctx.deps.getFlow(sym));
  if (!tape) return card(ctx, b, `Flow · ${sym}`, sym, 'unavailable', 'The flow tape could not be read.');
  const now = ctx.deps.now();
  const all = tape.rows ?? [];
  const rows = all.filter((r) => expiryInHorizon(r.expiry, ctx.horizon, now));
  const s = b.src('flow', `Flow tape · ${w.label}`, `flow tape /api/flow/tape (${[tape.sources?.bullflow?.enabled ? 'bullflow' : null, tape.sources?.chainScan?.ok ? 'chain scan' : null].filter(Boolean).join(' + ') || 'no live source'})`, tape.generatedAt);
  b.notes.push(`Expiries ${w.expiries}: ${rows.length} of ${all.length} prints today.`);
  b.notes.push('Premium is per side of the chain — bought vs sold is not inferred.');
  if (!rows.length) return card(ctx, b, `Flow · ${sym}`, sym, 'empty', `No ${sym} prints in the ${w.label.toLowerCase()} window (${w.expiries}) today — nothing qualifies.`);
  let call = 0, put = 0;
  for (const r of rows) { if (r.optionType === 'call') call += r.premium || 0; else put += r.premium || 0; }
  b.fact('flow.prints', 'Prints', rows.length, s);
  b.fact('flow.call', 'Call premium', Math.round(call), s, '$');
  b.fact('flow.put', 'Put premium', Math.round(put), s, '$');
  if (call + put > 0) b.fact('flow.callShare', 'Call share', r2((call / (call + put)) * 100, 1), s, '%');
  const top = [...rows].sort((a, c) => (c.premium || 0) - (a.premium || 0)).slice(0, 5);
  b.table = { columns: ['Contract', 'Premium', 'Kind', 'At'], rows: top.map((r, i) => ({ key: `p${i}`, cells: [`${r.strike}${r.optionType === 'call' ? 'C' : 'P'} ${r.expiry.slice(5)}`, Math.round(r.premium || 0), r.kind, r.at ? r.at.slice(11, 16) + 'Z' : null], src: s })) };
  return card(ctx, b, `Flow · ${sym}`, sym, 'ok', null);
}

// ─── record ─────────────────────────────────────────────────
function ideaMatches(i: IdeaRow, p: RecordPattern): boolean {
  if (p.symbol && String(i.symbol).toUpperCase() !== p.symbol) return false;
  if (p.direction && String(i.direction ?? '').toLowerCase() !== p.direction) return false;
  if (p.kind) {
    const hay = [i.tradeType, i.source, i.holdingPeriod, i.assetType, (i as any).catalyst, (i as any).pattern, (i as any).setupType].map((x) => String(x ?? '').toLowerCase()).join(' ');
    if (!hay.includes(p.kind)) return false;
  }
  if (p.grade) {
    const g = (() => { try { return gradeIdeaRowAtPublish(i as any); } catch { return null; } })();
    if (!g || g.letter !== p.grade) return false;
  }
  return true;
}

/** Verified-only record for a pattern: canonical outcome-v2 since the baseline, bar-ledger MISMATCH rows removed. */
export async function verifiedRecord(deps: AnalystDeps, p: RecordPattern, b: CardBuilder): Promise<RecordLine | null> {
  const ideas = await settle(deps.getIdeas());
  if (!ideas) return null;
  const ledger = deps.getVerifyLedger();
  let mismatches = 0;
  const pop = ideas.filter((i) => {
    if (ledger?.byId.get(String(i.id))?.verdict === 'MISMATCH') { mismatches++; return false; }
    return ideaMatches(i, p);
  });
  const rec = computeModelRecord(pop as any, { since: OUTCOME_BASELINE_DATE, sampleFloor: RECORD_MIN_N });
  const s = b.src('record', 'Verified record', `canonical model record (outcome-v2, ideas since ${OUTCOME_BASELINE_DATE}; pre-baseline outcomes excluded${ledger ? '; bar-ledger MISMATCH rows removed' : '; bar-verification ledger not present'})`, ledger?.asOf ?? null);
  return recordLine(patternLabel(p), rec, s, ledger ? { asOf: ledger.asOf, mismatchesExcluded: mismatches } : null);
}

async function recordTool(ctx: Ctx, text: string | null, sym: string | null): Promise<AnalystCard> {
  const b = new CardBuilder();
  const p = parseRecordPattern(text, sym);
  const line = await verifiedRecord(ctx.deps, p, b);
  if (!line) return card(ctx, b, `Record · ${patternLabel(p)}`, p.symbol, 'unavailable', 'The verified record could not be read.');
  b.record = line;
  b.fact('rec.n', 'Decided (n)', line.n, line.src);
  if (line.t1HitPct != null) b.fact('rec.t1', 'T1 hit', line.t1HitPct, line.src, '%');
  b.fact('rec.wins', 'Hit T1', line.wins, line.src);
  b.fact('rec.losses', 'Stopped / expired', line.losses, line.src);
  if (p.grade) b.notes.push('Grade = the NEXUS grade at publish time (gradeIdeaRowAtPublish), not today\'s.');
  if (line.verdict === 'too_few') b.notes.push(`Needs n ≥ ${RECORD_MIN_N} decided outcomes before a rate means anything.`);
  if (line.n === 0) return card(ctx, b, `Record · ${line.label}`, p.symbol, 'empty', `No decided ${line.label.toLowerCase()} since ${line.since} — nothing to judge.`);
  return card(ctx, b, `Record · ${line.label}`, p.symbol, 'ok', null);
}

// ─── /setup ─────────────────────────────────────────────────
function visible(i: IdeaRow, c: Ctx['caller']): boolean {
  if (c.isSuper || !i.userId || i.userId === c.userId) return true;
  return i.visibility === 'public' || i.visibility === 'subscribers_only';
}

async function setupTool(ctx: Ctx, sym: string | null, id: string | null): Promise<AnalystCard> {
  const b = new CardBuilder();
  const now = ctx.deps.now();
  let idea: IdeaRow | null = null;
  if (id) idea = await settle(ctx.deps.getIdea(id));
  else if (sym) {
    const all = await settle(ctx.deps.getIdeas());
    if (!all) return card(ctx, b, `Setup · ${sym}`, sym, 'unavailable', 'NEXUS setups could not be read.');
    idea = all
      .filter((i) => String(i.symbol).toUpperCase() === sym && (!i.outcomeStatus || i.outcomeStatus === 'open') && visible(i, ctx.caller))
      .sort((a, c) => Date.parse(String(c.timestamp ?? '')) - Date.parse(String(a.timestamp ?? '')))[0] ?? null;
  }
  if (idea && !visible(idea, ctx.caller)) idea = null;
  const subject = idea ? String(idea.symbol).toUpperCase() : sym;
  if (!idea) return card(ctx, b, `Setup · ${subject ?? id}`, subject, 'empty', sym ? `No open NEXUS setup for ${sym} — nothing qualifies.` : 'That setup was not found (or is not visible to you).');
  const s = b.src('setup', 'NEXUS setup', `NEXUS setup (trade_ideas · ${idea.source ?? 'engine unknown'})`, idea.timestamp ?? null);
  b.fact('dir', 'Direction', idea.direction ?? null, s);
  b.fact('entry', 'Entry', r2(idea.entryPrice), s, '$');
  b.fact('stop', 'Stop', r2(idea.stopLoss), s, '$');
  b.fact('target', 'Target (T1)', r2(idea.targetPrice), s, '$');
  b.fact('rr', 'Reward : risk', r2(idea.riskRewardRatio), s, 'x');
  if (idea.assetType === 'option') b.fact('contract', 'Contract', `${idea.strikePrice ?? '?'}${String(idea.optionType ?? '').startsWith('p') ? 'P' : 'C'} ${idea.expiryDate ?? ''}`.trim(), s);
  let letter: string | null = null;
  try {
    const g = gradeIdeaRow(idea as any, now);
    letter = g.letter;
    const gs = b.src('grade', 'NEXUS grade', `NEXUS grade ${g.version} (shared/nexus-grade) — unvalidated weights`, new Date(now).toISOString());
    b.fact('grade', 'Grade', `${g.letter} ${g.score}`, gs);
    const life = setupLifecycle(pickFromIdeaRow(idea as any), now);
    const ls = b.src('life', 'Lifecycle', 'setup lifecycle (shared/setup-lifecycle)', new Date(now).toISOString());
    b.fact('life', 'Lifecycle', life.label, ls);
    if (life.reason) b.notes.push(life.reason);
  } catch { b.notes.push('Grade / lifecycle: not in the data.'); }
  const d = await settle(ctx.deps.getDossier(String(idea.symbol).toUpperCase()));
  quoteFacts(b, d);
  // Track record for this setup's own pattern, verified data only.
  const pat: RecordPattern = { symbol: null, grade: letter, direction: (idea.direction === 'short' ? 'short' : idea.direction === 'long' ? 'long' : null), kind: null };
  const line = await verifiedRecord(ctx.deps, pat, b);
  if (line) b.record = line; else b.notes.push('Verified record: not in the data.');
  return card(ctx, b, `Setup · ${subject}`, subject, 'ok', null);
}

// ─── /indices ───────────────────────────────────────────────
async function indicesTool(ctx: Ctx): Promise<AnalystCard> {
  const b = new CardBuilder();
  const syms = ['SPX', 'SPY', 'QQQ'];
  const ds = await Promise.all(syms.map((s) => settle(ctx.deps.getDossier(s))));
  const rows: CardTable['rows'] = [];
  const leans: string[] = [];
  ds.forEach((d, i) => {
    const sym = syms[i];
    if (!d) { rows.push({ key: sym, cells: [sym, null, null, 'not in the data', null], src: '' }); return; }
    const s = b.src(`idx.${sym}`, `${sym} dossier`, `Quantinum dossier /api/quantinum/:symbol · quote ${d.price?.source ?? 'unknown'}`, d.price?.asOf ?? d.asOf);
    b.fact(`${sym}.last`, `${sym} last`, r2(d.price?.last), s, '$');
    b.fact(`${sym}.chg`, `${sym} change`, r2(d.price?.changePercent), s, '%');
    b.fact(`${sym}.lean`, `${sym} engine lean`, d.lean ?? null, s);
    if (d.lean) leans.push(String(d.lean));
    rows.push({ key: sym, cells: [sym, r2(d.price?.last), r2(d.price?.changePercent), d.lean ?? '—', d.gex?.regime ?? '—'], src: s });
  });
  b.table = { columns: ['Index', 'Last', 'Chg %', 'Lean', 'GEX regime'], rows };
  if (leans.length < 2) return card(ctx, b, 'Indices · SPX SPY QQQ', null, 'unavailable', 'Fewer than two index reads available — agreement not in the data.');
  const agree = leans.every((l) => l === leans[0]);
  const chgs = ds.map((d) => d?.price?.changePercent).filter((x): x is number => typeof x === 'number');
  const sameSign = chgs.length >= 2 && (chgs.every((c) => c > 0) || chgs.every((c) => c < 0));
  b.fact('agree.lean', 'Engine leans agree', agree ? `yes — all ${leans[0]}` : `no — ${leans.join(' / ')}`, b.sources[0]?.key ?? '');
  b.fact('agree.tape', 'Session moves agree', chgs.length >= 2 ? (sameSign ? 'yes' : 'no') : null, b.sources[0]?.key ?? '');
  if (leans.length < 3) b.notes.push(`Only ${leans.length} of 3 indices read.`);
  return card(ctx, b, 'Indices · SPX SPY QQQ', null, 'ok', agree && sameSign ? 'SPX, SPY and QQQ agree.' : 'The indices do not agree.');
}

// ─── /sector ────────────────────────────────────────────────
function sectorMatch(s: SectorRead, q: string): number {
  const id = s.id.toLowerCase(), label = s.label.toLowerCase(), etf = (s.etf ?? '').toLowerCase();
  if (q === id || q === etf || q === label) return 3;
  if (label.startsWith(q) || id.startsWith(q.replace(/\s+/g, '_'))) return 2;
  if (label.includes(q) || id.includes(q.replace(/\s+/g, '_')) || (q.length >= 4 && q.includes(label.split(' ')[0]))) return 1;
  return 0;
}

async function sectorTool(ctx: Ctx, q: string): Promise<AnalystCard> {
  const b = new CardBuilder();
  const board = await settle(ctx.deps.getSectorBoard());
  if (!board || !board.sectors.length) return card(ctx, b, `Sector · ${q}`, null, 'unavailable', 'The sector board is not published yet.');
  const best = board.sectors.map((s) => ({ s, m: sectorMatch(s, q) })).filter((x) => x.m > 0).sort((a, c) => c.m - a.m)[0]?.s;
  if (!best) return card(ctx, b, `Sector · ${q}`, null, 'empty', `No sector matches "${q}". Board has: ${board.sectors.slice(0, 12).map((s) => s.label).join(', ')}.`);
  const src = b.src('board', 'Sector board', `sector board /api/sectors/board${board.liveAsOf ? ' + live quotes pass' : ''} — measuring, unvalidated composite`, board.liveAsOf ?? board.asOf);
  b.fact('rank', 'Rank', best.rank, src);
  b.fact('rankDelta', 'Rank change', best.rankDelta, src);
  b.fact('composite', 'Composite', r2(best.composite, 1), src);
  b.fact('r1', '1-day', r2(best.r1), src, '%');
  b.fact('r3', '3-day', r2(best.r3), src, '%');
  b.fact('r10', '10-day', r2(best.r10), src, '%');
  b.fact('breadth', 'Breadth', r2(best.breadth, 1), src, '%');
  b.fact('regime', 'Regime', best.regime, src);
  b.fact('side', 'Side', best.side, src);
  if (best.leaders.length) b.table = { columns: ['Leader', '1-day %', 'vs sector'], rows: best.leaders.slice(0, 5).map((l) => ({ key: l.symbol, cells: [l.symbol, r2(l.r1), r2(l.relSector)], src })) };
  else b.notes.push('No leaders pass the confluence read — nothing qualifies.');
  if (board.honesty) b.notes.push(board.honesty);
  return card(ctx, b, `Sector · ${best.label}${best.etf ? ` (${best.etf})` : ''}`, best.etf, 'ok', null);
}

// ─── /news ──────────────────────────────────────────────────
async function newsTool(ctx: Ctx, sym: string): Promise<AnalystCard> {
  const b = new CardBuilder();
  const n = await settle(ctx.deps.getNews(sym));
  if (!n) return card(ctx, b, `News · ${sym}`, sym, 'unavailable', 'The news feed could not be read.');
  const s = b.src('news', 'News feed', 'news service /api/news (Alpha Vantage, last 24h, breaking filter)', n.fetchedAt);
  if (!n.items.length) return card(ctx, b, `News · ${sym}`, sym, 'empty', `No ${sym} headlines in the last 24h passed the breaking filter.`);
  b.fact('news.count', 'Headlines (24h)', n.items.length, s);
  b.table = { columns: ['Headline', 'Source', 'At', 'Tone'], rows: n.items.slice(0, 8).map((it, i) => ({ key: `n${i}`, cells: [it.title.slice(0, 140), it.source, it.publishedAt, it.sentiment], src: s })) };
  b.notes.push('Tone is the feed\'s label, not our read.');
  return card(ctx, b, `News · ${sym}`, sym, 'ok', null);
}

export async function runAnalystCommand(
  cmd: ParsedCommand, opts: { horizon: Horizon; page: PageContext; caller: { userId: string | null; isSuper: boolean } }, deps: AnalystDeps,
): Promise<{ ok: true; card: AnalystCard } | { ok: false; error: string }> {
  const a = resolveCommandArg(cmd, opts.page);
  if (!a.ok) return a;
  const ctx: Ctx = { cmd, horizon: opts.horizon, page: opts.page, deps, caller: opts.caller };
  const c: AnalystCommand = cmd.command;
  switch (c) {
    case 'levels': return { ok: true, card: await levelsTool(ctx, a.symbol!) };
    case 'flow': return { ok: true, card: await flowTool(ctx, a.symbol!) };
    case 'setup': return { ok: true, card: await setupTool(ctx, a.symbol, a.id) };
    case 'indices': return { ok: true, card: await indicesTool(ctx) };
    case 'sector': return { ok: true, card: await sectorTool(ctx, a.text!) };
    case 'news': return { ok: true, card: await newsTool(ctx, a.symbol!) };
    case 'record': return { ok: true, card: await recordTool(ctx, a.text, a.symbol) };
  }
}

// ─── production deps ─────────────────────────────────────────

let ideasCache: { at: number; ideas: IdeaRow[] } | null = null;
const IDEAS_TTL_MS = 5 * 60_000;

export function defaultAnalystDeps(): AnalystDeps {
  return {
    now: Date.now,
    getDossier: async (s) => (await import('./quantinum-intelligence')).getQuantinumDossier(s),
    getLevels: async (s) => (await import('./levels/level-map')).getLevelMap(s),
    getGexBuckets: async (s) => {
      // Same read path as GET /api/gex/buckets/:symbol (read-only import; nothing modified).
      const { calculateAggregateGammaExposure } = await import('./gamma-exposure');
      const { toSnapshot } = await import('./gex-vex-scanner');
      const { computeGEXFromCBOE } = await import('./gex-cboe-fallback');
      const result = await calculateAggregateGammaExposure(s);
      let snap: any = result ? toSnapshot(result) : null;
      if (!snap) snap = await computeGEXFromCBOE(s);
      if (!snap) return null;
      return { spot: snap.spotPrice ?? null, asOf: new Date(snap.calculatedAt).toISOString(), source: snap.source ?? null, regime: snap.regime ?? null, byDte: snap.byDte ?? {} };
    },
    getFlow: async (s) => (await import('./flow-tape')).buildFlowTape(1, s),
    getIdea: async (id) => {
      const { storage } = await import('./storage');
      return ((await storage.getTradeIdeaById(id)) as unknown as IdeaRow) ?? null;
    },
    getIdeas: async () => {
      if (!ideasCache || Date.now() - ideasCache.at > IDEAS_TTL_MS) {
        const { storage } = await import('./storage');
        ideasCache = { at: Date.now(), ideas: (await storage.getAllTradeIdeas()) as unknown as IdeaRow[] };
      }
      return ideasCache.ideas;
    },
    getSectorBoard: async () => {
      const sb = await import('./sector-board');
      const { snap } = sb.readBoard();
      if (!snap) return null;
      const sum: any = sb.boardSummary(snap, sb.readLive());
      return {
        asOf: snap.asOf, liveAsOf: sum.live?.asOf ?? null, honesty: 'Measuring: the sector composite and regime rules are unvalidated. Research, not a recommendation.',
        sectors: (sum.sectors as any[]).map((x) => ({ id: x.id, label: x.label, etf: x.etf, rank: x.rank, rankDelta: x.rankDelta, composite: x.composite, r1: x.r1, r3: x.r3, r10: x.r10, breadth: x.breadth, regime: x.regime, side: x.side, leaders: x.leaders ?? [] })),
      };
    },
    getNews: async (s) => {
      const { fetchBreakingNews } = await import('./news-service');
      const items = await fetchBreakingNews(s, undefined, 10);
      return { fetchedAt: new Date().toISOString(), items: items.map((a: any) => ({ title: String(a.title ?? ''), source: String(a.source || a.sourceDomain || 'unknown'), url: a.url ?? null, publishedAt: a.timePublished ?? null, sentiment: a.overallSentimentLabel ?? null })) };
    },
    getVerifyLedger: () => {
      try {
        const l = loadDeskVerifyLedger();
        return l ? { asOf: l.asOf, byId: l.byId } : null;
      } catch { return null; }
    },
  };
}
