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
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, PanelRightOpen, Target } from 'lucide-react';
import { TickerLogo } from '@/components/hunt/cockpit/ticker-logo';
import { QEChart } from '@/components/charting/qe-chart';
import { PriceLadder, ProfitPlan, RiskPanel } from '@/components/oracle/signal-detail';
import { ContractEngine } from '@/components/contract-engine/contract-engine';
import { TASummary } from '@/components/hunt/cockpit/ta-summary';
import { SignalComponents } from '@/components/hunt/cockpit/signal-components';
import { openWorkup } from '@/lib/workup-bus';
import { convictionPercent, isLiveBookPick, CONVICTIONS_QUERY_KEY, type ConvictionPick, type ConvictionsResponse } from '@/lib/convictions';
import { TraderCallBadge, TraderCallEvidence } from './trader-calls';
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
export type DetailTab = 'overview' | 'technical' | 'manage' | 'risk' | 'contract';
export const SIDES: readonly Side[] = ['all', 'long', 'short'];
export const RANKS: readonly Rank[] = ['all', 'new', 'best', 'conviction'];
export const DETAIL_TABS: readonly DetailTab[] = ['overview', 'technical', 'manage', 'risk', 'contract'];

/* ── pure helpers ── */
export async function get<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

export const money = (value?: number | null) => value == null || !Number.isFinite(value) ? '—' : `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const stateLabel = (pick: ConvictionPick) => pick.isBotHeld ? 'Bot held' : pick.lifecycleState === 'pending_trigger' ? 'Waiting' : pick.lifecycleState === 'closed' ? 'Closed' : 'In play';

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

/** Setups ranked by conviction (or held positions by live P&L), then side / search / rank filtered. */
export function rankRows(sourceRows: ConvictionPick[], f: { scope: Exclude<Scope, 'developing'>; side: Side; query: string; rank: Rank }): ConvictionPick[] {
  const needle = f.query.trim().toUpperCase();
  const ranked = sourceRows
    .filter((pick) => f.scope === 'positions' ? pick.isBotHeld : isLiveBookPick(pick)) // same rule as Today's book
    .filter((pick) => f.side === 'all' || pick.direction === f.side)
    .filter((pick) => !needle || pick.symbol.includes(needle) || (pick.sector ?? '').toUpperCase().includes(needle))
    .sort((a, b) => f.scope === 'positions'
      ? (b.unrealizedPnlPercent ?? -Infinity) - (a.unrealizedPnlPercent ?? -Infinity)
      : b.convictionScore - a.convictionScore);
  if (f.scope === 'positions' || f.rank === 'all') return ranked;
  if (f.rank === 'new') {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return ranked.filter((pick) => new Date(pick.generatedAt).getTime() >= cutoff);
  }
  if (f.rank === 'best') return ranked.slice(0, 10);
  return ranked.filter((pick) => pick.convictionBand === 'S' || pick.convictionBand === 'A');
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
  queryKey: ['/api/market-pulse', 'nexus-macro'],
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
export function SetupRow({ pick, selected, onSelect }: { pick: ConvictionPick; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`nxp-row ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <TickerLogo symbol={pick.symbol} size="sm" className="nxp-logo" />
      <span className="nxp-row-main"><strong>{pick.symbol}<TraderCallBadge symbol={pick.symbol} /></strong><small>{!pick.sector || pick.sector === 'other' ? pick.tradeType ?? 'cross-sector' : pick.sector.replaceAll('_', ' ')}</small></span>
      <span className="nxp-row-status"><strong>{pick.isBotHeld ? `${(pick.unrealizedPnlPercent ?? 0) >= 0 ? '+' : ''}${(pick.unrealizedPnlPercent ?? 0).toFixed(1)}%` : convictionPercent(pick.convictionScore)}</strong><small>{stateLabel(pick)}</small></span>
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
    Number.isFinite(decision.high) ? { price: decision.high, label: 'UPPER DECISION', color: '#42d5b1' } : null,
    Number.isFinite(decision.low) ? { price: decision.low, label: 'LOWER DECISION', color: '#ffb84d' } : null,
    Number.isFinite(decision.invalidation) ? { price: decision.invalidation, label: 'INVALIDATION', color: '#ff746d' } : null,
  ].filter(Boolean) as Array<{ price: number; label: string; color: string }>;
  return <motion.div key={`${hit.symbol}-${hit.pattern}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="nxp-detail nxp-developing-detail">
    <div className="nxp-detail-head">
      <div>
        <div className="nxp-symbol-line"><TickerLogo symbol={hit.symbol} size="lg" /><h2>{hit.symbol}</h2><span className={hit.bias === 'short' ? 'bear' : 'bull'}>{hit.bias === 'short' ? 'Bearish' : hit.bias === 'long' ? 'Bullish' : 'Two-sided'}</span><span>{hit.core ? 'core universe' : 'watch universe'}</span></div>
        <p>{hit.note || `${hit.pattern.replaceAll('_', ' ')} detected; awaiting a measured break.`}</p>
      </div>
      <div className={`nxp-dev-status ${status.toLowerCase().replaceAll(' ', '-')}`}><strong>{status}</strong><span>{quote?.isCurrent ? `${quote.session} tape` : 'snapshot only'}</span></div>
    </div>
    <div className="nxp-dev-summary">
      <div><span>Current</span><strong>{money(current)}</strong><small>{quote ? `${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}% vs close · ${quote.session}` : 'quote unavailable'}</small></div>
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

/* ── selected setup detail: head, chart, levels, tabs ── */
export function SetupDetail({ selected, spxExpression, spxLoading, tab, onTab, chartHeight = 238 }: {
  selected: ConvictionPick;
  /** the SPX chain answer (only rendered when the selected setup is SPY) */
  spxExpression?: SpxExpression;
  spxLoading: boolean;
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  chartHeight?: number;
}) {
  const reduceMotion = useReducedMotion();
  const positive = selected.direction === 'long';
  const live = selected.currentPrice ?? selected.entryPrice;
  const progress = selected.targetPrice !== selected.entryPrice
    ? Math.max(0, Math.min(100, ((live - selected.entryPrice) / (selected.targetPrice - selected.entryPrice)) * 100))
    : 0;
  const support = selected.layers.filter((layer) => layer.points > 0).sort((a, b) => b.points - a.points);
  const challenge = selected.layers.filter((layer) => layer.points < 0).sort((a, b) => a.points - b.points);
  const pendingEntry = selected.lifecycleState === 'pending_trigger' || selected.lifecycleState === 'coverage' || selected.lifecycleState === 'thesis';
  const spx = selected.symbol === 'SPY' ? spxExpression : undefined;
  return (
    <motion.div key={selected.ideaId} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="nxp-detail">
      <div className="nxp-detail-head">
        <div>
          <div className="nxp-symbol-line"><TickerLogo symbol={selected.symbol} size="lg" /><h2>{selected.symbol}</h2><span className={positive ? 'bull' : 'bear'}>{positive ? 'Bullish' : 'Bearish'}</span><span>{selected.convictionBand} evidence</span></div>
          <p>{selected.catalyst || selected.thesis || 'No written catalyst was returned.'}</p>
        </div>
        <div className="nxp-score"><strong>{selected.isBotHeld ? `${(selected.unrealizedPnlPercent ?? 0).toFixed(1)}%` : convictionPercent(selected.convictionScore)}</strong><span>{selected.isBotHeld ? 'position P&L' : 'confidence / 100'}</span></div>
      </div>

      <div className="nxp-chart-card">
        <div className="nxp-chart-meta"><span>1 month structure</span><strong>{money(live)}</strong></div>
        <QEChart symbol={selected.symbol} initialTf="1D" height={Math.max(chartHeight, 380)} levels={[
          { price: selected.entryPrice, label: pendingEntry ? 'TRIGGER' : 'ENTRY', color: '#3b8cff' },
          { price: selected.stopLoss, label: 'STOP', color: '#ff746d' },
          { price: selected.targetPrice, label: 'T1', color: '#42d5b1' },
        ]} />
      </div>

      <div className="nxp-levels">
        <div><span>Live</span><strong>{money(live)}</strong><small>{progress.toFixed(0)}% toward T1</small></div>
        <div><span>{pendingEntry ? 'Trigger' : 'Recorded entry'}</span><strong>{money(selected.entryPrice)}</strong><small>{pendingEntry ? 'Waiting for confirmation' : stateLabel(selected)}</small></div>
        <div className="risk"><span>Invalidation</span><strong>{money(selected.stopLoss)}</strong><small>Risk boundary</small></div>
        <div className="reward"><span>First target</span><strong>{money(selected.targetPrice)}</strong><small>{selected.riskRewardRatio.toFixed(1)}R plan</small></div>
      </div>

      <div className="nxp-detail-tabs">
        {DETAIL_TABS.map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => onTab(t)}>{t}</button>)}
      </div>
      <div className="nxp-tab-panel">
        {tab === 'overview' && <div className="nxp-bottom-grid">
          <article className="nxp-thesis">
            <div className="nxp-section-title"><span>Decision brief</span><small>{selected.layerCount} measured layers</small></div>
            <h3>{selected.thesis || 'The scanner returned evidence without a written thesis.'}</h3>
            <div className="nxp-evidence">
              {support.slice(0, 4).map((layer) => <div key={`${layer.kind}-${layer.label}`}><span>+{layer.points}</span><p><strong>{layer.label}</strong>{layer.why}</p></div>)}
              {challenge.slice(0, 1).map((layer) => <div className="against" key={`${layer.kind}-${layer.label}`}><span>{layer.points}</span><p><strong>{layer.label}</strong>{layer.why}</p></div>)}
            </div>
          </article>
          <aside className="nxp-execution">
            <div className="nxp-section-title"><span>Execution</span><small>{selected.optionType ? 'Option-backed' : selected.assetType}</small></div>
            <div className="nxp-contract"><Target size={17} /><div><strong>{selected.optionType ? `${money(selected.strikePrice)} ${selected.optionType.toUpperCase()}` : 'Underlying plan'}</strong><span>{selected.expiryDate ?? selected.holdingPeriod}</span></div></div>
            {selected.symbol === 'SPY' && <div className={`nxp-spx-expression ${spx ? 'live' : ''}`}><span>SPX linked expression</span>{spx ? <><strong>{positive ? 'BULLISH' : 'BEARISH'} · SPX {money(spx.spot)}</strong><small>Trigger {money(spx.entry)} · Stop {money(spx.stop)} · T1 {money(spx.target)}</small>{spx.contract ? <small>Actual chain · {spx.contract.optionSymbol} · {money(spx.contract.entryPremium)}</small> : <small>{spx.chainNote || 'No account-fit SPX/SPXW contract cleared the chain gates.'}</small>}</> : <small>{spxLoading ? 'Reading the SPX/SPXW chain…' : 'SPX quote pair unavailable — no levels guessed.'}</small>}</div>}
            <button className="nxp-cockpit" type="button" onClick={() => openWorkup(selected.symbol)}>Open full workup <ChevronRight size={16} /></button>
          </aside>
        </div>}
        {tab === 'overview' && <TraderCallEvidence symbol={selected.symbol} />}
        {tab === 'technical' && <div className="nxp-technical-grid"><TASummary symbol={selected.symbol} /><div className="nxp-components"><div className="nxp-section-title"><span>Signal components</span><small>{selected.layers.length} layers</small></div><SignalComponents layers={selected.layers} max={99} /></div></div>}
        {tab === 'manage' && <div className="nxp-manage-grid"><PriceLadder pick={selected} live={live} /><ProfitPlan pick={selected} live={live} /></div>}
        {tab === 'risk' && <RiskPanel pick={selected} live={live} />}
        {tab === 'contract' && <ContractEngine symbol={selected.symbol} direction={positive ? 'BULL' : 'BEAR'} entry={selected.entryPrice} stop={selected.stopLoss} t1={selected.targetPrice} holdPeriodLabel={selected.holdingPeriod} conviction={convictionPercent(selected.convictionScore)} />}
      </div>
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
      <span>{market?.regime ?? 'Loading regime'}</span>
      <strong>{market?.preferredDirection ?? '—'}</strong>
      <span className={pulse?.macro.yieldDirection === 'RISING' ? 'risk' : 'reward'}>10Y {pulse?.macro.yield10Y ? `${pulse.macro.yield10Y.toFixed(2)}%` : '—'} {pulse?.macro.yieldDirection === 'RISING' ? '↑' : '↓'}</span>
      <span className={(bonds?.changePct ?? 0) < 0 ? 'risk' : 'reward'}>TLT {bonds?.changePct == null ? '—' : `${bonds.changePct >= 0 ? '+' : ''}${bonds.changePct.toFixed(2)}%`}</span>
      <span className={`nxp-risk-state ${macro.level.toLowerCase()}`}>RISK {macro.level}</span>
      {onOpenContext && <button type="button" onClick={onOpenContext}><PanelRightOpen size={15} /> Context</button>}
    </div>
  );
}

/** The context drawer's body: regime score, Macro Risk Oracle, rates / VIX / TLT, reasons. */
export function ContextBody({ market, macro, pulse, bonds, extended }: { market: MarketContext; macro: MacroRisk; pulse?: MarketPulseRead; bonds: Bonds; extended?: ExtendedHoursRead }) {
  return <>
    <div className="nxp-context-score"><strong>{market?.score ?? '—'}</strong><span>regime score</span></div>
    <div className={`nxp-macro-oracle ${macro.level.toLowerCase()}`}><div><span>Macro Risk Oracle</span><strong>{macro.level}</strong><b>{macro.score}/100</b></div><p>{macro.posture}</p><ul>{macro.drivers.map((driver) => <li key={driver}>{driver}</li>)}</ul><small>Rates stress is measured from 10Y, its direction, TLT and VIX. Inflation is not inferred from yields.</small></div>
    <dl><div><dt>Risk sentiment</dt><dd>{market?.riskSentiment ?? '—'}</dd></div><div><dt>Preferred side</dt><dd>{market?.preferredDirection ?? '—'}</dd></div><div><dt>VIX</dt><dd>{market?.vixLevel?.toFixed(1) ?? '—'}</dd></div><div><dt>10Y yield</dt><dd>{pulse?.macro.yield10Y ? `${pulse.macro.yield10Y.toFixed(2)}% · ${pulse.macro.yieldDirection.toLowerCase()}` : 'unavailable'}</dd></div><div><dt>Bonds · TLT</dt><dd>{bonds?.changePct == null ? 'unavailable' : `${bonds.changePct >= 0 ? '+' : ''}${bonds.changePct.toFixed(2)}% · ${bonds.stance?.toLowerCase()}`}</dd></div><div><dt>Macro freshness</dt><dd>{extended?.isStale ? 'stale' : extended?.session ?? 'loading'}</dd></div></dl>
    <h3>Why it matters now</h3>
    <ul>{(market?.reasons ?? []).map((reason) => <li key={reason}>{reason}</li>)}</ul>
  </>;
}
