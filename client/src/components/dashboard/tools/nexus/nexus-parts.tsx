/**
 * NEXUS parts — the pieces of the NEXUS board (pages/nexus-prototype.tsx),
 * extracted so the classic page and the dashboard tools render the SAME
 * markup from the SAME queries.
 *
 * Every query here keeps the exact react-query key the page always used, so
 * a NEXUS dashboard with six tools on screen still costs one /api/convictions,
 * one /api/market-pulse, one /api/extended-hours and one /api/patterns/scan
 * request per refresh. Derivations (ranking, developing funnel, macro risk)
 * are pure functions of those responses — nothing is invented here.
 */
import { WatchStar } from '@/components/watch/watch-star';
import { TookItButton } from '@/components/journal/took-it-button';
import { ageLabel } from '../flow/tape';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, PanelRightOpen, Target } from 'lucide-react';
import { TickerLogo } from '@/components/hunt/cockpit/ticker-logo';
import { QEChart } from '@/components/charting/qe-chart';
import { useCandles } from '@/components/charting/chart-engine';
import { barTimeLabel, calledOutsideRegularSession, levelsAsOfLabel } from '@shared/bar-time';
import { PriceLadder, ProfitPlan, RiskPanel } from '@/components/oracle/signal-detail';
import { ContractEngine } from '@/components/contract-engine/contract-engine';
import { TASummary } from '@/components/hunt/cockpit/ta-summary';
import { SignalComponents } from '@/components/hunt/cockpit/signal-components';
import { openWorkup } from '@/lib/workup-bus';
import { useQuotes } from '@/components/ticker/ticker-data';
import { QuoteFreshChip } from '@/components/ui/qe-phone';
import type { RotationTag } from '@/components/sector-ignition/sector-ignition';
import { useTickFlash } from '@/lib/use-tick-flash';
import { convictionPercent, isLiveBookPick, CONVICTIONS_QUERY_KEY, fmtExactET, type ConvictionPick, type ConvictionsResponse } from '@/lib/convictions';
import { compareBoardRows } from '@shared/board-sort';
import { boardLivePrice, liveMark } from '@shared/live-mark';
import { boardOrder, type SetupLife } from '@/lib/setup-lifecycle';
import { etDay } from '@shared/setup-lifecycle';
import { stripConflictingTargetClaims } from '@shared/plan-narrative';
import type { ContractLiquiditySnapshot } from '@shared/option-liquidity';
import { gradeFromLife, gradePick, whyRankedHere, whyShort, whyThisGrade, nexusGradeCaveat, formatNexusGrade, type NexusGrade } from '@shared/nexus-grade';
import { nexusGradeTitle, LegacyScoreDiagnostics, NEXUS_GRADE_CAVEAT, NEXUS_GRADE_LABEL } from '@/components/canon/nexus-grade';
import { TraderCallBadge, TraderCallEvidence } from './trader-calls';
import { HolyGrailBadge } from './holy-grail-badge';
import { WallTouchBadge } from '@/components/walls/wall-touch-badge';
import { SetupTimeline } from './setup-timeline';
import { SetupReplay } from './setup-replay';
import { TestSetupButton } from './test-setup-button';
import { AnalyzeWithQuantinum } from '@/components/quantinum/analyze-with-quantinum';
import { SpxMirrorBlock, spxMirrorChipTitle } from '@/components/ideas/spx-mirror-block';
import '@/styles/nexus-prototype.css';

/* ── wire types ── */
export interface SpxExpression { symbol: 'SPX'; source: string; asOf: string; ratio: number; spot: number; entry: number; stop: number; target: number; chainStatus: string; chainNote?: string; chainAsOf?: string; chainContractsScored: number; contract: { optionType: 'call' | 'put'; strike: number; expiry: string; dte: number; entryPremium: number; optionSymbol: string } | null; }
export interface MarketPulseRead { asOf: string; macro: { yield10Y: number; yieldDirection: 'RISING' | 'FALLING'; vix: number | null; dxy: number }; }
export interface ExtendedHoursRead { asOf: string | null; session: string; isStale: boolean; assetClasses: Array<{ key: string; label: string; symbol: string; changePct: number | null; stance: string | null }>; }
export interface PatternHit { symbol: string; core?: boolean; pattern: string; bias: string; note: string; detectedAt?: string; levels: Record<string, number>; context?: { last?: number; above200d?: boolean | null; ema20AboveEma50?: boolean | null }; }
export interface PatternScanRead { asOf: string | null; scanned: number; failed: number; scanning: boolean; hits: PatternHit[]; }
export interface ExtendedSymbolQuote { symbol: string; lastPrice: number; previousClose: number; changePct: number; session: 'pre' | 'regular' | 'post' | 'closed'; asOf: string; isCurrent: boolean; volume: number; isExtended: boolean; }

export type Side = 'all' | 'long' | 'short';
export type Rank = 'all' | 'new' | 'best' | 'conviction';
export type Scope = 'setups' | 'developing' | 'positions';
export type DetailTab = 'overview' | 'timeline' | 'replay' | 'technical' | 'manage' | 'risk' | 'contract';
export const SIDES: readonly Side[] = ['all', 'long', 'short'];
export const RANKS: readonly Rank[] = ['all', 'new', 'best', 'conviction'];
export const DETAIL_TABS: readonly DetailTab[] = ['overview', 'timeline', 'replay', 'technical', 'manage', 'risk', 'contract'];

/* ── pure helpers ── */
export async function get<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

export const money = (value?: number | null) => value == null || !Number.isFinite(value) ? '—' : `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const stateLabel = (pick: ConvictionPick) => pick.isBotHeld ? 'Bot held' : pick.lifecycleState === 'pending_trigger' ? 'Waiting' : pick.lifecycleState === 'invalidated' ? 'Invalidated before trigger' : pick.lifecycleState === 'closed' ? 'Closed' : 'In play';

export function patternDecision(hit: PatternHit, current?: number) {
  const l = hit.levels ?? {};
  const high = Number(l.motherHigh ?? l.rangeHigh ?? l.flagHigh ?? l.trendline ?? l.trigger);
  const low = Number(l.motherLow ?? l.rangeLow ?? l.confirmation ?? l.flagLow);
  const invalidation = Number(l.invalidation ?? (hit.bias === 'short' ? high : l.poleLow ?? low));
  let status = 'WAITING';
  let detail = 'Structure is developing; no entry is published.';
  if (Number.isFinite(current)) {
    if (Number.isFinite(high) && current! > high) { status = 'ABOVE RANGE'; detail = `Price cleared ${money(high)}. It still needs a fresh scan and execution gate.`; }
    if (Number.isFinite(low) && current! < low) { status = 'BELOW RANGE'; detail = `Price broke below ${money(low)}. The stored structure is no longer intact.`; }
    if (Number.isFinite(invalidation) && ((hit.bias === 'short' && current! > invalidation) || (hit.bias !== 'short' && current! < invalidation))) { status = 'INVALIDATED'; detail = `Price crossed the detector's ${money(invalidation)} invalidation.`; }
  }
  return { high, low, invalidation, status, detail };
}

export function macroRisk(pulse?: MarketPulseRead, bondsPct?: number | null) {
  const y = pulse?.macro.yield10Y ?? 0;
  const vix = pulse?.macro.vix ?? 0;
  let score = 0;
  const drivers: string[] = [];
  if (y >= 5) { score += 35; drivers.push(`10Y ${y.toFixed(2)}% is above the 5% stress threshold`); }
  else if (y >= 4.5) { score += 24; drivers.push(`10Y ${y.toFixed(2)}% is restrictive`); }
  else if (y >= 4) { score += 12; drivers.push(`10Y ${y.toFixed(2)}% is elevated`); }
  if (pulse?.macro.yieldDirection === 'RISING') { score += 15; drivers.push('yields are still rising'); }
  if (bondsPct != null && bondsPct <= -0.7) { score += 18; drivers.push(`TLT ${bondsPct.toFixed(2)}% confirms bond selling`); }
  else if (bondsPct != null && bondsPct < -0.3) { score += 9; drivers.push(`TLT ${bondsPct.toFixed(2)}% shows rate pressure`); }
  if (vix >= 30) { score += 25; drivers.push(`VIX ${vix.toFixed(1)} is disorderly`); }
  else if (vix >= 22) { score += 15; drivers.push(`VIX ${vix.toFixed(1)} is elevated`); }
  else if (vix >= 18) { score += 7; drivers.push(`VIX ${vix.toFixed(1)} is firm`); }
  score = Math.min(100, score);
  const level = score >= 75 ? 'EXTREME' : score >= 50 ? 'HIGH' : score >= 25 ? 'ELEVATED' : 'LOW';
  const posture = score >= 50
    ? 'Reduce size, demand confirmed triggers, avoid chasing long-duration growth, and prefer defined-risk structures.'
    : score >= 25
      ? 'Use smaller size and require sector-relative strength; duration-sensitive longs need extra confirmation.'
      : 'Macro pressure is limited; normal setup and liquidity gates still apply.';
  return { score, level, drivers, posture };
}
export type MacroRisk = ReturnType<typeof macroRisk>;

export const spySourceOf = (picks?: ConvictionPick[]) => picks?.find((pick) => pick.symbol === 'SPY' && !pick.isBotHeld);

/** The book plus the SPX-linked expression of the SPY thesis (when the chain answered). */
export function withSpxRow(picks: ConvictionPick[] | undefined, spySource: ConvictionPick | undefined, expression: SpxExpression | undefined): ConvictionPick[] {
  const sourceRows = [...(picks ?? [])];
  if (spySource && expression) {
    sourceRows.push({
      ...spySource,
      ideaId: `spx-linked-${spySource.ideaId}`,
      symbol: 'SPX', sector: 'index', source: 'spx-linked-expression',
      assetType: expression.contract ? 'option' : 'index',
      entryPrice: expression.entry, stopLoss: expression.stop,
      targetPrice: expression.target, currentPrice: expression.spot,
      optionType: expression.contract?.optionType ?? null,
      strikePrice: expression.contract?.strike ?? null,
      expiryDate: expression.contract?.expiry ?? null,
      optionDte: expression.contract?.dte ?? null,
      entryPremium: expression.contract?.entryPremium ?? null,
      thesis: `SPX expression of the measured SPY thesis using the live ${expression.ratio.toFixed(3)}× cash ratio. ${expression.chainNote ?? ''}`.trim(),
    });
  }
  return sourceRows;
}

/**
 * Setups in the server's board order when it set one, else by evidence score (held
 * positions by live P&L), then side / search / rank filtered. With a lifecycle map
 * (lib/setup-lifecycle.ts) stale and resolved setups sink below fresh/carried ones —
 * the same order Today's book uses.
 */
export function rankRows(sourceRows: ConvictionPick[], f: { scope: Exclude<Scope, 'developing'>; side: Side; query: string; rank: Rank }, life?: Map<string, SetupLife>): ConvictionPick[] {
  const needle = f.query.trim().toUpperCase();
  const filtered = sourceRows
    .filter((pick) => f.scope === 'positions' ? pick.isBotHeld : isLiveBookPick(pick)) // same rule as Today's book
    .filter((pick) => f.side === 'all' || pick.direction === f.side)
    .filter((pick) => !needle || pick.symbol.includes(needle) || (pick.sector ?? '').toUpperCase().includes(needle));
  const ranked = f.scope === 'positions'
    ? filtered.sort((a, b) => (b.unrealizedPnlPercent ?? -Infinity) - (a.unrealizedPnlPercent ?? -Infinity))
    // BOARD_SORT (server): when the server stamped an order, keep it — the evidence
    // score did not rank outcomes on the honest record (docs/SCORE_V2_STUDY.md).
    : boardOrder(filtered, life);
  if (f.scope === 'positions' || f.rank === 'all') return ranked;
  if (f.rank === 'new') {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return ranked.filter((pick) => new Date(pick.generatedAt).getTime() >= cutoff);
  }
  if (f.rank === 'best') return ranked.slice(0, 10);
  // GRADE lens: NEXUS grade A or B on the live lifecycle read (the one grade).
  const now = Date.now();
  return ranked.filter((pick) => {
    const l = life?.get(pick.ideaId)?.life;
    const g = l ? gradeFromLife(l, pick, now) : gradePick(pick, now);
    return g.letter === 'A' || g.letter === 'B';
  });
}

/** Pattern-scan candidates not yet published as setups, within 20% of their trigger, one per symbol. */
export function rankDeveloping(hits: PatternHit[] | undefined, picks: ConvictionPick[] | undefined, f: { query: string; side: Side }): PatternHit[] {
  const published = new Set((picks ?? []).map((pick) => pick.symbol.toUpperCase()));
  const needle = f.query.trim().toUpperCase();
  const seen = new Set<string>();
  return (hits ?? [])
    .filter((hit) => !published.has(hit.symbol.toUpperCase()))
    .filter((hit) => f.side === 'all' || (f.side === 'long' ? hit.bias !== 'short' : hit.bias === 'short'))
    .filter((hit) => !needle || hit.symbol.includes(needle) || hit.pattern.toUpperCase().includes(needle))
    .filter((hit) => {
      const last = Number(hit.context?.last);
      const trigger = Number(hit.levels.trendline ?? hit.levels.trigger ?? hit.levels.entry ?? last);
      return Number.isFinite(last) && last > 0 && Number.isFinite(trigger) && trigger > 0 && Math.abs(last / trigger - 1) <= .2;
    })
    .sort((a, b) => Number(Boolean(b.core)) - Number(Boolean(a.core)) || Number(b.levels.strength ?? b.levels.relativeVolume ?? 0) - Number(a.levels.strength ?? a.levels.relativeVolume ?? 0))
    .filter((hit) => { const symbol = hit.symbol.toUpperCase(); if (seen.has(symbol)) return false; seen.add(symbol); return true; })
    .slice(0, 80);
}

/* ── shared queries (keys unchanged from the page) ── */
export const useNexusConvictions = () => useQuery<ConvictionsResponse>({
  queryKey: [...CONVICTIONS_QUERY_KEY],
  queryFn: () => get('/api/convictions'),
  staleTime: 30_000,
  refetchInterval: 60_000,
});
export const useNexusPulse = () => useQuery<MarketPulseRead>({
  // Same key as the terminal footer / rails / chart lab: one /api/market-pulse
  // request per interval for the whole terminal, not one per consumer.
  queryKey: ['market-pulse'],
  queryFn: () => get('/api/market-pulse'),
  staleTime: 30_000,
  refetchInterval: 60_000,
});
export const useNexusExtended = () => useQuery<ExtendedHoursRead>({
  queryKey: ['/api/extended-hours', 'nexus-macro'],
  queryFn: () => get('/api/extended-hours?limit=5'),
  staleTime: 30_000,
  refetchInterval: 60_000,
});
export const useNexusPatterns = () => useQuery<PatternScanRead>({
  queryKey: ['/api/patterns/scan', 'nexus-developing'],
  queryFn: () => get('/api/patterns/scan'),
  staleTime: 20_000,
  refetchInterval: 60_000,
  refetchOnWindowFocus: true,
});
export const useSpxExpression = (spySource: ConvictionPick | undefined) => useQuery<SpxExpression>({
  queryKey: ['/api/spx/expression', spySource?.entryPrice, spySource?.stopLoss, spySource?.targetPrice],
  queryFn: () => get(`/api/spx/expression?entry=${spySource!.entryPrice}&stop=${spySource!.stopLoss}&target=${spySource!.targetPrice}&holdingDays=${parseInt(spySource!.holdingPeriod) || 1}&conviction=${convictionPercent(spySource!.convictionScore)}`),
  enabled: Boolean(spySource),
  staleTime: 30_000,
  refetchInterval: 60_000,
});
export const useDevelopingQuote = (symbol: string | undefined, enabled: boolean) => useQuery<ExtendedSymbolQuote>({
  queryKey: ['/api/extended-hours/symbol', symbol],
  queryFn: () => get(`/api/extended-hours/${symbol!}`),
  enabled: enabled && Boolean(symbol),
  staleTime: 15_000,
  refetchInterval: 30_000,
});

/* ── rows ── */
/**
 * The lifecycle line under a setup row (docs/SETUP_LIFECYCLE.md):
 *   STATE · graded <publish> → now <live re-grade> · $live ±% vs entry · <age of that price>
 * The price is the live quote when the batch answered, else the board's build-time
 * read — each stamped with its own age, never shown as current without one.
 */
export function lifecycleLine(pick: ConvictionPick, sl: SetupLife, now: number): { text: string; title: string } {
  const { life, mark } = sl;
  const parts: string[] = [life.state === 'carried' && life.session != null && life.sessions != null ? `CARRIED s${life.session}/${life.sessions}` : life.label];
  if (mark && pick.entryPrice > 0) {
    const vs = (mark.price / pick.entryPrice - 1) * 100;
    parts.push(`$${mark.price.toFixed(2)} ${vs >= 0 ? '+' : ''}${vs.toFixed(1)}% vs entry · ${ageLabel(mark.asOf, now)}`);
  }
  const title = `${life.label}: ${life.reason}.${mark ? ` Price: ${mark.basis}${mark.asOf ? `, ${ageLabel(mark.asOf, now)}` : ''}.` : ' No price to check it against.'}`;
  return { text: parts.join(' · '), title };
}

/** Publish time on a row: "3:09 PM" today, "Tue 3:09 PM" on an earlier day (ET). */
export function publishStamp(iso: string, now: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
  return etDay(d.getTime()) === etDay(now) ? time : `${d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' })} ${time}`;
}

/** NEXUS actionability grade chip text; it is not an outcome probability. */
export function gradeTitle(g: NexusGrade): string {
  return nexusGradeTitle(g);
}

export function SetupRow({ pick, selected, onSelect, rotation, life, now }: { pick: ConvictionPick; selected: boolean; onSelect: () => void; rotation?: RotationTag | null; life?: SetupLife; now?: number }) {
  const t = now ?? Date.now();
  const line = life ? lifecycleLine(pick, life, t) : null;
  // Live re-grade on the same lifecycle read the board order uses (lib/setup-lifecycle.ts boardOrder).
  // Show one consistently defined actionability grade regardless of board sort.
  // The sort setting controls ordering only; it must not change what grade means.
  const grade = !pick.isBotHeld ? (life ? gradeFromLife(life.life, pick, t) : gradePick(pick, t)) : null;
  const title = [line?.title, grade ? gradeTitle(grade) : null].filter(Boolean).join('\n');
  return (
    <button type="button" className={`nxp-row ${selected ? 'selected' : ''}${life ? ` nxp-life-${life.life.state}` : ''}`} onClick={onSelect} title={title || undefined}>
      <TickerLogo symbol={pick.symbol} size="sm" className="nxp-logo" />
      <span className="nxp-row-main"><strong>{pick.symbol}<span className={`nxp-dir ${pick.direction === 'short' ? 'bear' : 'bull'}`} aria-label={pick.direction === 'short' ? 'Bearish' : 'Bullish'}>{pick.direction === 'short' ? '▼ Bearish' : '▲ Bullish'}</span><TraderCallBadge symbol={pick.symbol} />{pick.spxMirror && <span className={`nxp-spx-chip ${pick.spxMirror.status}`} title={spxMirrorChipTitle(pick.spxMirror)}>SPX</span>}{rotation && <span className={`nxp-rot ${rotation.tag}`} title={`${rotation.label} is ${rotation.stage} ${rotation.side} (sector ignition, measuring)`}>{rotation.tag === 'with' ? '↗ with rotation' : '↘ against rotation'}</span>}</strong><small>{!pick.sector || pick.sector === 'other' ? pick.tradeType ?? 'cross-sector' : pick.sector.replaceAll('_', ' ')}</small>{line && <small className={`nxp-life nxp-life-tag-${life!.life.state}`}>{line.text}</small>}{grade && whyShort(grade) && <small className="nxp-why" title={`Why this grade: ${whyRankedHere(grade)}`}>{whyShort(grade)}</small>}</span>
      <span className="nxp-row-status"><strong>{pick.isBotHeld ? `${(pick.unrealizedPnlPercent ?? 0) >= 0 ? '+' : ''}${(pick.unrealizedPnlPercent ?? 0).toFixed(1)}%` : grade ? <span className={`nxp-grade nxp-grade-${grade.letter}`} title={`${NEXUS_GRADE_LABEL} ${formatNexusGrade(grade)}/100 — ${nexusGradeCaveat(grade)}`} aria-label={`${NEXUS_GRADE_LABEL} ${formatNexusGrade(grade)} of 100, ${nexusGradeCaveat(grade)}`}>{grade.letter} <b>{grade.score}</b>{grade.action?.state === 'not_actionable' && <small className="nxp-grade-state"> · not now</small>}</span> : '—'}</strong><small>{stateLabel(pick)}{(pick.calledAt ?? pick.generatedAt) ? ` · ${publishStamp((pick.calledAt ?? pick.generatedAt)!, now ?? Date.now())}` : ''}</small></span>
      <ChevronRight size={14} />
    </button>
  );
}

export function DevelopingRow({ hit, selected, onSelect }: { hit: PatternHit; selected: boolean; onSelect: () => void }) {
  return <button type="button" className={`nxp-row nxp-developing-row ${selected ? 'selected' : ''}`} onClick={onSelect}><TickerLogo symbol={hit.symbol} size="sm" className="nxp-logo" /><span className="nxp-row-main"><strong>{hit.symbol}</strong><small>{hit.pattern.replaceAll('_',' ')}</small></span><span className="nxp-row-status"><strong>{hit.bias === 'short' ? '▼' : hit.bias === 'long' ? '▲' : '◆'}</strong><small>{hit.core ? 'core' : 'watch'}</small></span><ChevronRight size={14} /></button>;
}

/* ── developing candidate detail ── */
export function DevelopingDetail({ hit, quote, onOpen, chartHeight = 260 }: { hit: PatternHit; quote?: ExtendedSymbolQuote; onOpen: () => void; chartHeight?: number }) {
  const detected = Number(hit.context?.last);
  const current = quote?.lastPrice ?? detected;
  const currentFlash = useTickFlash(quote?.lastPrice, { resetKey: hit.symbol });
  const displacement = Number.isFinite(detected) && detected > 0 && Number.isFinite(current) ? ((current / detected) - 1) * 100 : null;
  const staleSnapshot = Boolean(quote?.isCurrent && displacement != null && Math.abs(displacement) >= 5);
  const decision = patternDecision(hit, current);
  const status = staleSnapshot ? 'REPRICE REQUIRED' : decision.status;
  const levelRows = Object.entries(hit.levels ?? {}).filter(([, value]) => Number.isFinite(Number(value)));
  const formatLevel = (key: string, value: number) => {
    const metric = key.toLowerCase();
    if (metric === 'triggered') return value ? 'Yes' : 'No';
    if (metric.includes('rsi') || metric.includes('pct') || metric.includes('strength') || metric.includes('volume')) return value.toFixed(1);
    if (metric.includes('days') || metric.includes('bars')) return value.toFixed(0);
    return money(value);
  };
  const chartLevels = [
    Number.isFinite(decision.high) ? { price: decision.high, label: 'UPPER DECISION', color: 'info' } : null,
    Number.isFinite(decision.low) ? { price: decision.low, label: 'LOWER DECISION', color: 'caution' } : null,
    Number.isFinite(decision.invalidation) ? { price: decision.invalidation, label: 'INVALIDATION', color: 'loss' } : null,
  ].filter(Boolean) as Array<{ price: number; label: string; color: string }>;
  return <motion.div key={`${hit.symbol}-${hit.pattern}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="nxp-detail nxp-developing-detail">
    <div className="nxp-detail-head">
      <div>
        <div className="nxp-symbol-line"><TickerLogo symbol={hit.symbol} size="lg" /><h2>{hit.symbol}</h2><WatchStar sym={hit.symbol} size={15} /><span className={hit.bias === 'short' ? 'bear' : 'bull'}>{hit.bias === 'short' ? 'Bearish' : hit.bias === 'long' ? 'Bullish' : 'Two-sided'}</span><span>{hit.core ? 'core universe' : 'watch universe'}</span></div>
        <p>{hit.note || `${hit.pattern.replaceAll('_', ' ')} detected; awaiting a measured break.`}</p>
      </div>
      <div className={`nxp-dev-status ${status.toLowerCase().replaceAll(' ', '-')}`}><strong>{status}</strong><span>{quote?.isCurrent ? `${quote.session} tape` : 'snapshot only'}</span></div>
    </div>
    <div className="nxp-dev-summary">
      <div><span>Current</span><strong className={currentFlash}>{money(current)}</strong><small>{quote ? `${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}% vs close · ${quote.session}` : 'quote unavailable'}</small></div>
      <div><span>Detected at</span><strong>{money(detected)}</strong><small>{hit.detectedAt ? new Date(hit.detectedAt).toLocaleString() : 'scanner snapshot'}</small></div>
      <div className={staleSnapshot ? 'risk' : ''}><span>Since detection</span><strong>{displacement == null ? '—' : `${displacement >= 0 ? '+' : ''}${displacement.toFixed(1)}%`}</strong><small>{staleSnapshot ? 'old levels cannot be traded as-is' : 'inside freshness tolerance'}</small></div>
      <div><span>Pattern</span><strong>{hit.pattern.replaceAll('_', ' ')}</strong><small>{hit.bias === 'neutral' ? 'break direction decides' : `${hit.bias} observation`}</small></div>
    </div>
    {staleSnapshot && <div className="nxp-dev-warning"><strong>Snapshot dislocated from live tape.</strong><span>The detector saw {money(detected)}, while the current {quote?.session} print is {money(current)}. Rescan levels and options before this can become a trade.</span></div>}
    <div className="nxp-chart-card"><div className="nxp-chart-meta"><span>Price structure · detector levels</span><strong>{quote?.isCurrent ? 'CURRENT TAPE' : 'HISTORICAL'}</strong></div><QEChart symbol={hit.symbol} initialTf="1D" height={Math.max(chartHeight, 380)} levels={chartLevels} /></div>
    <div className="nxp-dev-grid">
      <article><div className="nxp-section-title"><span>Measured evidence</span><small>{levelRows.length} fields</small></div><h3>{decision.detail}</h3><div className="nxp-dev-levels">{levelRows.map(([key, value]) => <div key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{formatLevel(key, Number(value))}</strong></div>)}</div></article>
      <aside><div className="nxp-section-title"><span>Promotion gate</span><small>candidate → setup</small></div><ol><li>Fresh quote agrees with the structure</li><li>Decision level triggers and holds</li><li>Risk level survives normal volatility</li><li>Liquid contract fits account risk</li></ol><p>Developing candidates are research observations—not entries, confidence grades, or bot orders.</p><button className="nxp-cockpit" type="button" onClick={onOpen}>Open full workup <ChevronRight size={16} /></button></aside>
    </div>
  </motion.div>;
}

/* ── run-up since trigger (shared/run-up.ts) — a measurement, never a win ── */
interface IdeaRunUpRead { triggered: boolean; bestPct: number | null; reached5BeforeStop: boolean; result: { stopHit: boolean; barsUsed: number } | null; computedAt: string; label: string; barInterval: string | null }
function RunUpLine({ ideaId }: { ideaId: string }) {
  const q = useQuery<IdeaRunUpRead>({
    queryKey: ['/api/ideas', ideaId, 'run-up'],
    queryFn: () => get<IdeaRunUpRead>(`/api/ideas/${encodeURIComponent(ideaId)}/run-up`),
    enabled: !!ideaId, staleTime: 300_000, refetchInterval: 600_000, retry: false,
  });
  const r = q.data;
  if (!r?.triggered || r.bestPct == null) return null;
  const at = new Date(r.computedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <p className="nxp-runup" title={`${r.label}. Underlying high since the trigger vs the plan entry, ${r.barInterval ?? ''} bars; a +5% touch in the same bar as the stop counts as stop first. Measured ${at}.`}
      style={{ margin: '8px 2px 0', fontSize: 12, color: 'var(--nx-muted, #8a93a6)' }}>
      Best since trigger <strong style={{ color: r.bestPct >= 0 ? 'var(--trade-bullish, #3b8cff)' : 'var(--trade-bearish, #e0674f)' }}>{r.bestPct >= 0 ? '+' : ''}{r.bestPct.toFixed(1)}%</strong>
      {' · '}reached +5% {r.reached5BeforeStop ? '✓' : '✗'}{r.result?.stopHit ? ' · stop hit' : ''}
      <span style={{ opacity: 0.7 }}> · run-up, not a win · as of {at}</span>
    </p>
  );
}

/* ── structural level map (server/levels/level-map.ts) — measuring, not validated ── */
interface LevelClusterWire { price: number; low: number; high: number; score: number; kinds: string[]; label: string; members: Array<{ price: number; kind: string; label: string; source: string; asOf: string }> }
interface LevelMapWire { symbol: string; asOf: string; last: number | null; tolerance?: number; clusters: LevelClusterWire[]; notes: string[]; snapEnabled: boolean }
function LevelsList({ symbol, live, entry, stop, target }: { symbol: string; live: number; entry: number; stop: number; target: number }) {
  const q = useQuery<LevelMapWire>({
    queryKey: ['/api/levels', symbol],
    queryFn: () => get<LevelMapWire>(`/api/levels/${encodeURIComponent(symbol)}`),
    staleTime: 55_000, refetchInterval: 60_000, refetchIntervalInBackground: false, retry: false,
  });
  const m = q.data;
  if (!m) return <p className="nxp-times" style={{ margin: '8px 2px 0' }}><span>Levels <strong>—</strong>{q.isLoading ? ' reading…' : ' unavailable'}</span></p>;
  const tol = m.tolerance ?? 0;
  const uses = (c: LevelClusterWire): string | null => {
    const hit = (p: number) => p >= c.low - tol && p <= c.high + tol;
    return hit(target) ? 'T1' : hit(stop) ? 'STOP' : hit(entry) ? 'ENTRY' : null;
  };
  const lo = Math.min(stop, target, entry);
  const hi = Math.max(stop, target, entry);
  const pad = (hi - lo) * 0.25;
  // Confluent clusters (≥2 independent kinds) around the plan, plus any level the plan sits on.
  const rows = m.clusters
    .filter((c) => (c.score >= 2 && c.price >= lo - pad && c.price <= hi + pad) || uses(c))
    .sort((a, b) => b.price - a.price)
    .slice(0, 12);
  const at = levelsAsOfLabel(m);
  return (
    <div className="nxp-levels-map" style={{ margin: '10px 2px 0', fontSize: 12 }}>
      <div className="nxp-section-title"><span>Levels</span><small>≥2 independent kinds{at ? ` · as of ${at}` : ''} · measuring</small></div>
      {rows.length === 0
        ? <p style={{ color: 'var(--nx-muted, #8a93a6)', margin: '4px 0' }}>No confluent level between the stop and T1 — the plan's numbers are formula levels, not structure.</p>
        : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {rows.map((c) => {
              const used = uses(c);
              const dist = live > 0 ? ((c.price - live) / live) * 100 : null;
              const tip = c.members.map((l) => `${l.label} $${l.price.toFixed(2)} — ${l.source}`).join(' | ');
              return (
                <tr key={`${c.price}-${c.label}`} title={tip}
                  style={{ borderTop: '1px solid var(--nx-line, rgba(138,147,166,0.18))', fontWeight: used ? 600 : 400, background: used ? 'var(--nx-highlight, rgba(59,140,255,0.08))' : undefined }}>
                  <td style={{ padding: '3px 6px', whiteSpace: 'nowrap' }}>{money(c.price)}</td>
                  <td style={{ padding: '3px 6px' }}>{c.label}{c.score >= 2 ? <span style={{ opacity: 0.7 }}> · {c.score} kinds</span> : null}</td>
                  <td style={{ padding: '3px 6px', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--nx-muted, #8a93a6)' }}>{dist == null ? '—' : `${dist >= 0 ? '+' : ''}${dist.toFixed(1)}%`}</td>
                  <td style={{ padding: '3px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>{used ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>}
      <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--nx-muted, #8a93a6)' }}>
        Yahoo 5-min + daily bars; volume profile is bar-approximated; GEX / dark-pool only when already cached. Hover a row for each level's source.
      </p>
    </div>
  );
}

/* ── selected setup detail: head, chart, levels, tabs ── */
/** NEXUS detail "contract liquidity": the publish-time liquidity-gate snapshot (shared/option-liquidity.ts). */
export function ContractLiquidityBlock({ snap }: { snap: ContractLiquiditySnapshot }) {
  const verdict = snap.action === 'underlying_only' ? 'No liquid contract — underlying-only'
    : snap.action === 'stepped' ? `Stepped to a liquid strike${snap.steppedFrom ? ` (from ${snap.steppedFrom})` : ''}`
    : snap.action === 'unverified' ? 'Liquidity unverified (no chain)'
    : snap.ok ? 'Passed the liquidity gate' : 'Failed the liquidity gate';
  const vol = snap.vol == null ? '—' : `${snap.vol.toLocaleString()}${snap.volBasis === 'prior_day' ? ' (prior day)' : snap.volBasis === 'today_prior_unavailable' ? ' (today; prior-day n/a)' : ''}`;
  const quote = snap.bid != null && snap.ask != null ? `${money(snap.bid)} / ${money(snap.ask)}` : '— / —';
  return (
    <div className={`nxp-spx-expression ${snap.ok ? 'live' : ''}`} title={`Rule ${snap.rule}: OI ≥ ${snap.minOi}, volume ≥ ${snap.minVol}, two-sided, spread ≤ 10% of mid (≤ $0.05 under $0.50), mid ≥ $0.10. Recorded at publish — not live.`}>
      <span>Contract liquidity</span>
      <strong>{verdict}</strong>
      {snap.contract && <small>{snap.contract}</small>}
      <small>OI {snap.oi != null ? snap.oi.toLocaleString() : '—'} · vol {vol}</small>
      <small>bid/ask {quote} · spread {snap.spreadPct != null ? `${(snap.spreadPct * 100).toFixed(1)}%` : '—'}</small>
      {snap.failures.length > 0 && <small>{snap.failures.join(' · ')}</small>}
      <small>{snap.source} · as of {fmtExactET(snap.asOf) ?? snap.asOf}</small>
    </div>
  );
}

export function SetupDetail({ selected, spxExpression, spxLoading, tab, onTab, life, now, chartHeight = 238 }: {
  selected: ConvictionPick;
  /** the SPX chain answer (only rendered when the selected setup is SPY) */
  spxExpression?: SpxExpression;
  spxLoading: boolean;
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  life?: SetupLife;
  now?: number;
  chartHeight?: number;
}) {
  const reduceMotion = useReducedMotion();
  const positive = selected.direction === 'long';
  const cleanThesis = stripConflictingTargetClaims(selected.thesis, selected.targetPrice);
  const quotesQ = useQuotes([selected.symbol]);
  // Live, not carried: a session-aware quote (pre/post included) beats the board's
  // currentPrice, which is only refreshed when the board rebuilds. When neither
  // exists the ladder says the quote is unavailable instead of showing entry as live.
  const lq = quotesQ.data?.[selected.symbol.toUpperCase()];
  // shared/live-mark.ts: a fresh quote, else the board price only when the server
  // flags it live — never the publish-time entry (audit 2026-10-01 P0 #7).
  const boardPx = boardLivePrice(selected);
  const live = liveMark(selected, lq?.price);
  const checkedAt = quotesQ.dataUpdatedAt || quotesQ.errorUpdatedAt;
  const checkedStamp = checkedAt ? `checked ${new Date(checkedAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET` : null;
  const liveStamp = lq?.price ? [lq.session, lq.source, lq.delayed ? 'delayed' : null, lq.stale ? 'stale' : null, lq.asOf ? ageOf(lq.asOf) : null].filter(Boolean).join(' · ')
    : boardPx ? 'board price'
    : quotesQ.isLoading ? 'reading live quote…'
    : ['quote unavailable', checkedStamp].filter(Boolean).join(' · ');
  // Two prices, both labelled: outside the regular session the live tile is an
  // extended-hours / overnight quote, so the regular-session close (the last
  // daily candle — same query the chart uses) is printed beside it.
  const dailyQ = useCandles(selected.symbol, '1D', true);
  const lastDaily = dailyQ.data?.bars?.length ? dailyQ.data.bars[dailyQ.data.bars.length - 1] : null;
  const extSession = lq?.price != null && lq.session != null && lq.session !== 'regular';
  const regularCloseLine = extSession && lastDaily ? `Regular close ${money(lastDaily.close)} · ${barTimeLabel(lastDaily.time, '1D')} 16:00 ET` : null;
  // An option contract on an idea called outside the regular session was not
  // priced at the call (after-close options are gated) — say so.
  const calledMs = Date.parse(selected.calledAt ?? selected.generatedAt ?? '');
  const offHoursContract = selected.optionType != null && calledOutsideRegularSession(calledMs);
  // Flash on the price actually shown.
  const liveFlash = useTickFlash(live, { resetKey: selected.ideaId });
  const progress = live != null && selected.targetPrice !== selected.entryPrice
    ? Math.max(0, Math.min(100, ((live - selected.entryPrice) / (selected.targetPrice - selected.entryPrice)) * 100))
    : null;
  const support = selected.layers.filter((layer) => layer.points > 0).sort((a, b) => b.points - a.points);
  const challenge = selected.layers.filter((layer) => layer.points < 0).sort((a, b) => a.points - b.points);
  const pendingEntry = selected.lifecycleState === 'pending_trigger' || selected.lifecycleState === 'coverage' || selected.lifecycleState === 'thesis';
  const spx = selected.symbol === 'SPY' ? spxExpression : undefined;
  // The same actionability grade shown on every NEXUS row, on the live mark
  // (never the entry as live — shared/live-mark.ts); sorting is configured separately.
  const gradeNow = now ?? Date.now();
  const grade = !selected.isBotHeld
    ? life ? gradeFromLife(life.life, selected, gradeNow) : gradePick({ ...selected, currentPrice: live ?? selected.currentPrice ?? null }, gradeNow)
    : null;
  return (
    <motion.div key={selected.ideaId} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="nxp-detail">
      <div className="nxp-detail-head">
        <div>
          <div className="nxp-symbol-line"><TickerLogo symbol={selected.symbol} size="lg" /><h2>{selected.symbol}</h2><WatchStar sym={selected.symbol} size={15} /><span className={positive ? 'bull' : 'bear'}>{positive ? 'Bullish' : 'Bearish'}</span>{!selected.isBotHeld && <TookItButton ideaId={selected.ideaId} symbol={selected.symbol} />}<AnalyzeWithQuantinum target={selected.ideaId.startsWith('spx-linked-')
            ? { kind: 'ticker', symbol: selected.symbol, label: `${selected.symbol} · SPX expression` }
            : { kind: 'setup', id: selected.ideaId, symbol: selected.symbol, label: `${selected.symbol} ${positive ? 'long' : 'short'} setup` }} /></div>
          <p className="nxp-times">
            <span>Called <strong>{fmtExactET(selected.calledAt ?? selected.generatedAt) ?? '—'}</strong></span>
            {selected.triggeredAt ? <span> · Triggered <strong>{fmtExactET(selected.triggeredAt)}</strong></span> : selected.lifecycleState === 'pending_trigger' ? <span> · not triggered yet</span> : null}
          </p>
          <VolumeLine symbol={selected.symbol} triggeredAt={selected.triggeredAt ?? null} />
          <HolyGrailBadge symbol={selected.symbol} />
          <WallTouchBadge symbol={selected.symbol} />
          <p>{selected.catalyst || selected.thesis || 'No written catalyst was returned.'}</p>
        </div>
        {selected.isBotHeld
          ? <div className="nxp-score"><strong>{`${(selected.unrealizedPnlPercent ?? 0).toFixed(1)}%`}</strong><span>paper P&amp;L</span></div>
          : <div><GradeBox grade={grade ?? gradePick(selected, gradeNow)} />
            <LegacyScoreDiagnostics rows={[
              ['evidence (conviction points)', `${selected.convictionScore} pts · band ${selected.convictionBand}`],
              ['evidence at publish', selected.publishedConvictionScore != null ? `${selected.publishedConvictionScore} pts${selected.publishedConvictionBand ? ` · band ${selected.publishedConvictionBand}` : ''}` : null],
              ['evidence display scale', `${convictionPercent(selected.convictionScore)}/100`],
            ]} /></div>}
      </div>

      <div className="nxp-chart-card">
        {/* Levels live in ONE place — the card below (price, context, R, progress).
            The chart draws the lines only, colour-keyed to the card's swatches; the
            live price is printed in the card, not again in this header. */}
        <div className="nxp-chart-meta"><span>1 month structure</span><small className="nxp-chart-key">lines: <i className="nxp-sw accent" />{pendingEntry ? 'trigger' : 'entry'} <i className="nxp-sw loss" />stop <i className="nxp-sw gain" />T1</small></div>
        <QEChart symbol={selected.symbol} initialTf="1D" height={Math.max(chartHeight, 380)} levels={[
          { price: selected.entryPrice, label: pendingEntry ? 'TRIGGER' : 'ENTRY', color: 'accent', hideLabel: true },
          { price: selected.stopLoss, label: 'STOP', color: 'loss', hideLabel: true },
          { price: selected.targetPrice, label: 'T1', color: 'gain', hideLabel: true },
        ]} />
      </div>

      <div className="nxp-levels">
        <div title={liveStamp ?? undefined}><span>{lq?.price ? <QuoteFreshChip q={lq} /> : boardPx ? 'Board price' : 'Live'}</span><strong className={liveFlash}>{live != null ? money(live) : '—'}</strong><small>{progress != null ? `${progress.toFixed(0)}% toward T1${liveStamp ? ` · ${liveStamp}` : ''}` : liveStamp}</small>{regularCloseLine && <small className="nxp-regular-close" style={{ display: 'block' }} title="Last regular-session (09:30–16:00 ET) daily close, from the chart's daily bars">{regularCloseLine}</small>}</div>
        <div><span><i className="nxp-sw accent" />{pendingEntry ? 'Trigger' : 'Recorded entry'}</span><strong>{money(selected.entryPrice)}</strong><small>{pendingEntry ? 'Waiting for confirmation' : stateLabel(selected)}</small></div>
        <div className="risk"><span><i className="nxp-sw loss" />Invalidation</span><strong>{money(selected.stopLoss)}</strong><small>Risk boundary</small></div>
        <div className="reward"><span><i className="nxp-sw gain" />First target</span><strong>{money(selected.targetPrice)}</strong><small>{selected.riskRewardRatio.toFixed(1)}R plan</small></div>
      </div>

      {!pendingEntry && selected.lifecycleState !== 'closed' && <RunUpLine ideaId={selected.ideaId} />}

      <LevelsList symbol={selected.symbol} live={live ?? 0} entry={selected.entryPrice} stop={selected.stopLoss} target={selected.targetPrice} />

      <div className="nxp-detail-tabs">
        {DETAIL_TABS.map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => onTab(t)}>{t}</button>)}
      </div>
      <div className="nxp-tab-panel">
        {tab === 'overview' && <div className="nxp-bottom-grid">
          <article className="nxp-thesis">
            <div className="nxp-section-title"><span>Decision brief</span><small>{selected.layerCount} measured layers · {layersStamp(selected.layersScoredAt)}</small></div>
            <h3>{cleanThesis || 'The scanner returned evidence without a written thesis.'}</h3>
            <div className="nxp-evidence">
              {support.slice(0, 4).map((layer) => <div key={`${layer.kind}-${layer.label}`}><span>+{layer.points}</span><p><strong>{layer.label}</strong>{layer.why}</p></div>)}
              {challenge.slice(0, 1).map((layer) => <div className="against" key={`${layer.kind}-${layer.label}`}><span>{layer.points}</span><p><strong>{layer.label}</strong>{layer.why}</p></div>)}
            </div>
            {selected.publishedLayers?.length ? (
              <details className="nxp-published-layers" style={{ marginTop: 8, fontSize: 12 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--nx-muted, #8a93a6)' }}>As first scored (frozen at the first board read after publish)</summary>
                <div className="nxp-evidence">
                  {[...selected.publishedLayers].sort((a, b) => b.points - a.points).slice(0, 6).map((layer) => <div className={layer.points < 0 ? 'against' : undefined} key={`pub-${layer.kind}-${layer.why}`}><span>{layer.points > 0 ? `+${layer.points}` : layer.points}</span><p><strong>{layer.kind}</strong>{layer.why}</p></div>)}
                </div>
              </details>
            ) : null}
          </article>
          <aside className="nxp-execution">
            <div className="nxp-section-title"><span>Trade structure</span><small>{selected.optionType ? (offHoursContract ? 'Underlying plan · suggested contract' : 'Option-backed') : selected.assetType}</small></div>
            <div className="nxp-contract"><Target size={17} /><div><strong>{selected.optionType ? `${money(selected.strikePrice)} ${selected.optionType.toUpperCase()}` : 'Underlying plan'}</strong><span>{selected.expiryDate ?? selected.holdingPeriod}</span>{offHoursContract && <span title="Called outside the regular session: option ideas are not published after the close, so the plan is on the underlying and this contract is a suggestion whose premium is read at the next open, not at the call.">Suggested contract — priced at next open</span>}</div></div>
            {selected.contractLiquidity && <ContractLiquidityBlock snap={selected.contractLiquidity} />}
            {selected.spxMirror && <SpxMirrorBlock mirror={selected.spxMirror} />}
            {selected.symbol === 'SPY' && !selected.spxMirror && <div className={`nxp-spx-expression ${spx ? 'live' : ''}`}><span>SPX linked expression</span>{spx ? <><strong>{positive ? 'BULLISH' : 'BEARISH'} · SPX {money(spx.spot)}</strong><small>Trigger {money(spx.entry)} · Stop {money(spx.stop)} · T1 {money(spx.target)}</small>{spx.contract ? <small>Actual chain · {spx.contract.optionSymbol} · {money(spx.contract.entryPremium)}</small> : <small>{spx.chainNote || 'No account-fit SPX/SPXW contract cleared the chain gates.'}</small>}</> : <small>{spxLoading ? 'Reading the SPX/SPXW chain…' : 'SPX quote pair unavailable — no levels guessed.'}</small>}</div>}
            <button className="nxp-cockpit" type="button" onClick={() => openWorkup(selected.symbol)}>Open full workup <ChevronRight size={16} /></button>
          </aside>
        </div>}
        {tab === 'overview' && <TraderCallEvidence symbol={selected.symbol} />}
        {/* Bot-held rows and the synthetic SPX-linked row have no trade_ideas id of their own. */}
        {tab === 'timeline' && (selected.isBotHeld || selected.ideaId.startsWith('spx-linked-')
          ? <p className="nxp-times">No idea timeline — {selected.isBotHeld ? 'this row is a bot position, not a published idea' : 'the SPX row mirrors the SPY idea; open the SPY setup'}.</p>
          : <div className="nxp-timeline-grid"><SetupTimeline ideaId={selected.ideaId} /><TestSetupButton ideaId={selected.ideaId} /></div>)}
        {tab === 'replay' && (selected.isBotHeld || selected.ideaId.startsWith('spx-linked-')
          ? <p className="nxp-times">Replay needs a published idea — {selected.isBotHeld ? 'this row is a bot position' : 'open the SPY setup the SPX row mirrors'}.</p>
          : <SetupReplay pick={selected} />)}
        {tab === 'technical' && <div className="nxp-technical-grid"><TASummary symbol={selected.symbol} /><div className="nxp-components"><div className="nxp-section-title"><span>Signal components</span><small>{selected.layers.length} layers</small></div><SignalComponents layers={selected.layers} max={99} /></div></div>}
        {tab === 'manage' && <div className="nxp-manage-grid"><PriceLadder pick={selected} live={live ?? 0} liveStamp={liveStamp} /><ProfitPlan pick={selected} live={live ?? 0} /></div>}
        {tab === 'risk' && <RiskPanel pick={selected} live={live ?? 0} />}
        {tab === 'contract' && <ContractEngine symbol={selected.symbol} direction={positive ? 'BULL' : 'BEAR'} entry={selected.entryPrice} stop={selected.stopLoss} t1={selected.targetPrice} holdPeriodLabel={selected.holdingPeriod} conviction={convictionPercent(selected.convictionScore)} />}
      </div>
      <p className="nxp-disclaimer text-muted-foreground" style={{ margin: '10px 2px 0', fontSize: 11, lineHeight: 1.45 }}>
        Model idea for research and education — not a recommendation to buy or sell. Scores rank evidence; they are not probabilities. Options can lose their full value.
      </p>
    </motion.div>
  );
}

/* ── market context ── */
type MarketContext = ConvictionsResponse['marketContext'] | undefined;
type Bonds = ExtendedHoursRead['assetClasses'][number] | undefined;

/** The one-line regime / rates strip from the page header. */
export function MarketSummary({ market, pulse, bonds, macro, onOpenContext }: { market: MarketContext; pulse?: MarketPulseRead; bonds: Bonds; macro: MacroRisk; onOpenContext?: () => void }) {
  return (
    <div className="nxp-market-summary">
      <span>{market?.regimeUnavailable ? 'regime unavailable' : market?.regime ?? 'Loading regime'}</span>
      <strong>{market?.regimeUnavailable ? '—' : market?.preferredDirection ?? '—'}</strong>
      <span className={pulse?.macro.yieldDirection === 'RISING' ? 'risk' : 'reward'}>10Y {pulse?.macro.yield10Y ? `${pulse.macro.yield10Y.toFixed(2)}%` : '—'} {pulse?.macro.yieldDirection === 'RISING' ? '↑' : '↓'}</span>
      <span className={(bonds?.changePct ?? 0) < 0 ? 'risk' : 'reward'}>TLT {bonds?.changePct == null ? '—' : `${bonds.changePct >= 0 ? '+' : ''}${bonds.changePct.toFixed(2)}%`}</span>
      <span className={`nxp-risk-state ${macro.level.toLowerCase()}`}>RISK {macro.level}</span>
      {onOpenContext && <button type="button" onClick={onOpenContext}><PanelRightOpen size={15} /> Context</button>}
    </div>
  );
}

/** The context drawer's body: regime score, Macro Risk Oracle, rates / VIX / TLT, reasons. */
export function ContextBody({ market, macro, pulse, bonds, extended, hideFreshness }: { market: MarketContext; macro: MacroRisk; pulse?: MarketPulseRead; bonds: Bonds; extended?: ExtendedHoursRead; /** the caller prints feed ages itself */ hideFreshness?: boolean }) {
  return <>
    <div className="nxp-context-score"><strong>{market?.regimeUnavailable ? '—' : market?.score ?? '—'}</strong><span>{market?.regimeUnavailable ? 'regime unavailable — no SPY read' : 'regime score'}</span></div>
    <div className={`nxp-macro-oracle ${macro.level.toLowerCase()}`}><div><span>Macro risk gauge</span><strong>{macro.level}</strong><b>{macro.score}/100</b></div><p>{macro.posture}</p><ul>{macro.drivers.map((driver) => <li key={driver}>{driver}</li>)}</ul><small>Rates stress is measured from 10Y, its direction, TLT and VIX. Inflation is not inferred from yields.</small></div>
    <dl><div><dt>Risk sentiment</dt><dd>{market?.regimeUnavailable ? '—' : market?.riskSentiment ?? '—'}</dd></div><div><dt>Preferred side</dt><dd>{market?.regimeUnavailable ? '—' : market?.preferredDirection ?? '—'}</dd></div><div><dt>VIX</dt><dd>{market?.vixLevel?.toFixed(1) ?? '—'}</dd></div><div><dt>10Y yield</dt><dd>{pulse?.macro.yield10Y ? `${pulse.macro.yield10Y.toFixed(2)}% · ${pulse.macro.yieldDirection.toLowerCase()}` : 'unavailable'}</dd></div><div><dt>Bonds · TLT</dt><dd>{bonds?.changePct == null ? 'unavailable' : `${bonds.changePct >= 0 ? '+' : ''}${bonds.changePct.toFixed(2)}%${bonds.stance ? ` · ${bonds.stance.toLowerCase()}` : ''}`}</dd></div>{!hideFreshness && <div><dt>Macro freshness</dt><dd>{extended?.isStale ? 'stale' : extended?.session ?? 'loading'}</dd></div>}</dl>
    <h3>Why it matters now</h3>
    <ul>{(market?.reasons ?? []).map((reason) => <li key={reason}>{reason}</li>)}</ul>
  </>;
}

/** Real-time volume, time-of-day matched (server/volume-read.ts). Always stamped with its bar time. */
type VolumeReadWire = {
  asOf: string | null; sessionRvol: number | null; recentRvol: number | null; sessionVolume: number | null;
  trigger: { at: string; barVolume: number; rvol: number | null } | null;
  label: 'heavy' | 'above normal' | 'normal' | 'light' | 'unknown'; baselineSessions: number; note: string | null;
  source?: string; sessionDate?: string | null; sessionClosed?: boolean;
};
const fmtX = (x: number | null) => (x == null ? '—' : `${x.toFixed(1)}×`);
const fmtVol = (v: number | null) => (v == null ? '—' : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(v));
function VolumeLine({ symbol, triggeredAt }: { symbol: string; triggeredAt: string | null }) {
  const q = useQuery<VolumeReadWire>({
    queryKey: ['/api/volume-read', symbol, triggeredAt],
    queryFn: async () => {
      const r = await fetch(`/api/volume-read/${encodeURIComponent(symbol)}${triggeredAt ? `?at=${encodeURIComponent(triggeredAt)}` : ''}`, { credentials: 'include' });
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        throw new Error(`volume read HTTP ${r.status}${body?.error ? ` — ${body.error}` : ''}`);
      }
      return r.json();
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 55_000,
  });
  const v = q.data;
  if (!v || v.label === 'unknown') {
    // Say WHY (the server's note names each source that failed) — not a bare "unavailable".
    const why = q.isLoading ? null : v?.note ?? (q.error ? (q.error as Error).message : null);
    return <p className="nxp-times" title={why ?? undefined}><span>Volume <strong>—</strong>{q.isLoading ? ' reading…' : ` unavailable${why ? ` — ${why}` : ''}`}</span></p>;
  }
  const tone = v.label === 'heavy' || v.label === 'above normal' ? 'bull' : v.label === 'light' ? 'bear' : undefined;
  const age = v.asOf ? new Date(v.asOf).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
  return (
    <p className="nxp-times" title={`Time-of-day matched vs the prior ${v.baselineSessions} sessions · ${v.source ?? 'yahoo 5m'} bars, regular session only${v.note ? ` · ${v.note}` : ''}`}>
      <span>Volume <strong className={tone}>{v.label}</strong>{v.sessionClosed ? ' (completed session)' : ''}</span>
      <span> · {v.sessionClosed ? 'closing 15m' : 'last 15m'} <strong>{fmtX(v.recentRvol)}</strong> normal</span>
      <span> · {v.sessionClosed ? 'full day' : 'day so far'} <strong>{fmtX(v.sessionRvol)}</strong> ({fmtVol(v.sessionVolume)} sh)</span>
      {v.trigger && <span> · trigger bar <strong>{fmtX(v.trigger.rvol)}</strong></span>}
      {age && <span> · {v.sessionClosed ? 'last bar' : 'as of'} {age} ET</span>}
    </p>
  );
}

/**
 * NEXUS composite grade: one score with its full breakdown. It is unvalidated
 * and ranks plan quality/actionability; it does not predict which setup wins.
 */
function GradeBox({ grade }: { grade: NexusGrade }) {
  const rows = whyThisGrade(grade);
  return (
    <div className={`nxp-score nxp-grade-box nxp-grade-${grade.letter}`} title={gradeTitle(grade)} aria-label={`NEXUS grade ${formatNexusGrade(grade)} out of 100, unvalidated. Why this grade: ${whyRankedHere(grade)}`}>
      <strong className="nxp-grade-letter">{grade.letter}</strong>
      <span>{NEXUS_GRADE_LABEL} · {grade.score}/100{grade.action ? ` · ${grade.action.label}` : ''}</span>
      <small className="nxp-grade-caveat">{grade.action ? nexusGradeCaveat(grade) : NEXUS_GRADE_CAVEAT}</small>
      <ul className="nxp-grade-why" aria-label="Why this grade">
        {rows.map((r) => (
          <li key={r.key} title={r.note}>
            <span>{r.label}{r.status !== 'unvalidated' && <em className={`nxp-grade-status nxp-grade-status-${r.status}`}> {r.status === 'state' ? 'gate' : r.status}</em>}</span>
            <b>{r.status === 'state' ? '—' : `${r.points}/${r.max}`}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "scored Oct 6, 7:41 PM ET (live board, not publish time)" — or say it is unstamped. */
export function layersStamp(iso: string | undefined | null): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return 'live board re-score (time not stamped)';
  return `scored ${new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET (live board, not publish time)`;
}

function ageOf(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s)) return '';
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
}
