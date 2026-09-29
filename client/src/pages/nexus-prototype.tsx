import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Activity, ChevronRight, LayoutGrid, List, PanelRightOpen, Search, Table2, Target, X } from 'lucide-react';
import { SignalGrid } from '@/components/hunt/cockpit/signal-grid';
import { SignalTable } from '@/components/hunt/cockpit/signal-table';
import { TickerLogo } from '@/components/hunt/cockpit/ticker-logo';
import { NexusPriceChart } from '@/components/charting/nexus-price-chart';
import { PriceLadder, ProfitPlan, RiskPanel } from '@/components/oracle/signal-detail';
import { ContractEngine } from '@/components/contract-engine/contract-engine';
import { TASummary } from '@/components/hunt/cockpit/ta-summary';
import { SignalComponents } from '@/components/hunt/cockpit/signal-components';
import { openWorkup } from '@/lib/workup-bus';
import { convictionPercent, type ConvictionPick, type ConvictionsResponse } from '@/lib/convictions';
import { HorizonFilter, useHorizonFilter } from '@/components/ideas/horizon-filter';
import { IdeasTable } from '@/components/ideas/ideas-table';
import '@/styles/nexus-prototype.css';

interface IndexScalp {
  id: string; symbol: string; bias: 'calls' | 'puts'; direction?: 'long' | 'short';
  setup?: string; strike?: number | null; expiry?: string | null; spot?: number | null;
  target?: number | null; stop?: number | null; riskRewardRatio?: number | null;
  confidence?: number | null; thesis?: string | null; timestamp?: string;
}
interface IndexScalpResponse { session?: { isMarketOpen?: boolean; sessionLabel?: string }; scalps?: IndexScalp[]; }
interface SpxExpression { symbol: 'SPX'; source: string; asOf: string; ratio: number; spot: number; entry: number; stop: number; target: number; chainStatus: string; chainNote?: string; chainAsOf?: string; chainContractsScored: number; contract: { optionType: 'call' | 'put'; strike: number; expiry: string; dte: number; entryPremium: number; optionSymbol: string } | null; }
interface MarketPulseRead { asOf: string; macro: { yield10Y: number; yieldDirection: 'RISING' | 'FALLING'; vix: number; dxy: number }; }
interface ExtendedHoursRead { asOf: string | null; session: string; isStale: boolean; assetClasses: Array<{ key: string; label: string; symbol: string; changePct: number | null; stance: string | null }>; }
interface PatternHit { symbol: string; core?: boolean; pattern: string; bias: string; note: string; detectedAt?: string; levels: Record<string, number>; context?: { last?: number; above200d?: boolean | null; ema20AboveEma50?: boolean | null }; }
interface PatternScanRead { asOf: string | null; scanned: number; failed: number; scanning: boolean; hits: PatternHit[]; }
interface ExtendedSymbolQuote { symbol: string; lastPrice: number; previousClose: number; changePct: number; session: 'pre' | 'regular' | 'post' | 'closed'; asOf: string; isCurrent: boolean; volume: number; isExtended: boolean; }

function patternDecision(hit: PatternHit, current?: number) {
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

function DevelopingDetail({ hit, quote, onOpen }: { hit: PatternHit; quote?: ExtendedSymbolQuote; onOpen: () => void }) {
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
    <div className="nxp-chart-card"><div className="nxp-chart-meta"><span>Price structure · detector levels</span><strong>{quote?.isCurrent ? 'CURRENT TAPE' : 'HISTORICAL'}</strong></div><NexusPriceChart symbol={hit.symbol} initialTf="1D" height={260} levels={chartLevels} /></div>
    <div className="nxp-dev-grid">
      <article><div className="nxp-section-title"><span>Measured evidence</span><small>{levelRows.length} fields</small></div><h3>{decision.detail}</h3><div className="nxp-dev-levels">{levelRows.map(([key, value]) => <div key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{formatLevel(key, Number(value))}</strong></div>)}</div></article>
      <aside><div className="nxp-section-title"><span>Promotion gate</span><small>candidate → setup</small></div><ol><li>Fresh quote agrees with the structure</li><li>Decision level triggers and holds</li><li>Risk level survives normal volatility</li><li>Liquid contract fits account risk</li></ol><p>Developing candidates are research observations—not entries, confidence grades, or bot orders.</p><button className="nxp-cockpit" type="button" onClick={onOpen}>Open full workup <ChevronRight size={16} /></button></aside>
    </div>
  </motion.div>;
}

function macroRisk(pulse?: MarketPulseRead, bondsPct?: number | null) {
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

async function get<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

const money = (value?: number | null) => value == null || !Number.isFinite(value) ? '—' : `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stateLabel = (pick: ConvictionPick) => pick.isBotHeld ? 'Bot held' : pick.lifecycleState === 'pending_trigger' ? 'Waiting' : pick.lifecycleState === 'closed' ? 'Closed' : 'In play';

export default function NexusPrototype() {
  const reduceMotion = useReducedMotion();
  const [scope, setScope] = useState<'setups' | 'developing' | 'positions'>('setups');
  const [side, setSide] = useState<'all' | 'long' | 'short'>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [developingSymbol, setDevelopingSymbol] = useState<string>();
  const [contextOpen, setContextOpen] = useState(false);
  const [view, setView] = useState<'focus' | 'grid' | 'table'>('focus');
  const [rank, setRank] = useState<'all' | 'new' | 'best' | 'conviction'>('all');
  const [detailTab, setDetailTab] = useState<'overview' | 'technical' | 'manage' | 'risk' | 'contract'>('overview');
  const stageRef = useRef<HTMLElement>(null);

  const convictions = useQuery<ConvictionsResponse>({
    queryKey: ['/api/convictions', 'nexus-prototype'],
    queryFn: () => get('/api/convictions'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const pulse = useQuery<MarketPulseRead>({
    queryKey: ['/api/market-pulse', 'nexus-macro'],
    queryFn: () => get('/api/market-pulse'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const extended = useQuery<ExtendedHoursRead>({
    queryKey: ['/api/extended-hours', 'nexus-macro'],
    queryFn: () => get('/api/extended-hours?limit=5'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const patterns = useQuery<PatternScanRead>({
    queryKey: ['/api/patterns/scan', 'nexus-developing'],
    queryFn: () => get('/api/patterns/scan'),
    staleTime: 20_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const spySource = convictions.data?.picks.find((pick) => pick.symbol === 'SPY' && !pick.isBotHeld);
  const spxMap = useQuery<SpxExpression>({
    queryKey: ['/api/spx/expression', spySource?.entryPrice, spySource?.stopLoss, spySource?.targetPrice],
    queryFn: () => get(`/api/spx/expression?entry=${spySource!.entryPrice}&stop=${spySource!.stopLoss}&target=${spySource!.targetPrice}&holdingDays=${parseInt(spySource!.holdingPeriod) || 1}&conviction=${convictionPercent(spySource!.convictionScore)}`),
    enabled: Boolean(spySource),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const allRows = useMemo(() => {
    const needle = query.trim().toUpperCase();
    const sourceRows = [...(convictions.data?.picks ?? [])];
    if (spySource && spxMap.data) {
      const expression = spxMap.data;
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
    const ranked = sourceRows
      .filter((pick) => scope === 'positions' ? pick.isBotHeld : !pick.isBotHeld)
      .filter((pick) => side === 'all' || pick.direction === side)
      .filter((pick) => !needle || pick.symbol.includes(needle) || pick.sector.toUpperCase().includes(needle))
      .sort((a, b) => scope === 'positions'
        ? (b.unrealizedPnlPercent ?? -Infinity) - (a.unrealizedPnlPercent ?? -Infinity)
        : b.convictionScore - a.convictionScore);
    if (scope === 'positions' || rank === 'all') return ranked;
    if (rank === 'new') {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      return ranked.filter((pick) => new Date(pick.generatedAt).getTime() >= cutoff);
    }
    if (rank === 'best') return ranked.slice(0, 10);
    return ranked.filter((pick) => pick.convictionBand === 'S' || pick.convictionBand === 'A');
  }, [convictions.data, query, scope, side, rank, spySource, spxMap.data]);
  // Horizon cut (0DTE / weekly / swing / monthly / position / LEAPS) — applies to queue, grid and table alike.
  const horizonCut = useHorizonFilter(allRows, 'qe.nexus.horizon');
  const rows = horizonCut.filtered;
  const developing = useMemo(() => {
    const published = new Set((convictions.data?.picks ?? []).map((pick) => pick.symbol.toUpperCase()));
    const needle = query.trim().toUpperCase();
    const seen = new Set<string>();
    return (patterns.data?.hits ?? [])
      .filter((hit) => !published.has(hit.symbol.toUpperCase()))
      .filter((hit) => side === 'all' || (side === 'long' ? hit.bias !== 'short' : hit.bias === 'short'))
      .filter((hit) => !needle || hit.symbol.includes(needle) || hit.pattern.toUpperCase().includes(needle))
      .filter((hit) => {
        const last = Number(hit.context?.last);
        const trigger = Number(hit.levels.trendline ?? hit.levels.trigger ?? hit.levels.entry ?? last);
        return Number.isFinite(last) && last > 0 && Number.isFinite(trigger) && trigger > 0 && Math.abs(last / trigger - 1) <= .2;
      })
      .sort((a, b) => Number(Boolean(b.core)) - Number(Boolean(a.core)) || Number(b.levels.strength ?? b.levels.relativeVolume ?? 0) - Number(a.levels.strength ?? a.levels.relativeVolume ?? 0))
      .filter((hit) => { const symbol = hit.symbol.toUpperCase(); if (seen.has(symbol)) return false; seen.add(symbol); return true; })
      .slice(0, 80);
  }, [patterns.data, convictions.data, query, side]);
  const developingPick = developing.find((hit) => hit.symbol === developingSymbol) ?? developing[0];
  const developingQuote = useQuery<ExtendedSymbolQuote>({
    queryKey: ['/api/extended-hours/symbol', developingPick?.symbol],
    queryFn: () => get(`/api/extended-hours/${developingPick!.symbol}`),
    enabled: scope === 'developing' && Boolean(developingPick),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (scope === 'developing' && developingPick && developingPick.symbol !== developingSymbol) setDevelopingSymbol(developingPick.symbol);
  }, [scope, developingPick, developingSymbol]);

  useEffect(() => {
    if (!rows.some((row) => row.ideaId === selectedId)) setSelectedId(rows[0]?.ideaId);
  }, [rows, selectedId]);
  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setDetailTab('overview');
  }, [selectedId]);

  const selected = rows.find((row) => row.ideaId === selectedId) ?? rows[0];
  const market = convictions.data?.marketContext;
  const bonds = extended.data?.assetClasses?.find((asset) => asset.key === 'bonds');
  const macro = useMemo(() => macroRisk(pulse.data, bonds?.changePct), [pulse.data, bonds?.changePct]);
  const positive = selected?.direction === 'long';
  const live = selected?.currentPrice ?? selected?.entryPrice;
  const progress = selected && selected.targetPrice !== selected.entryPrice
    ? Math.max(0, Math.min(100, ((live - selected.entryPrice) / (selected.targetPrice - selected.entryPrice)) * 100))
    : 0;
  const support = selected?.layers.filter((layer) => layer.points > 0).sort((a, b) => b.points - a.points) ?? [];
  const challenge = selected?.layers.filter((layer) => layer.points < 0).sort((a, b) => a.points - b.points) ?? [];
  const pendingEntry = selected?.lifecycleState === 'pending_trigger' || selected?.lifecycleState === 'coverage' || selected?.lifecycleState === 'thesis';
  const spxExpression = selected?.symbol === 'SPY' ? spxMap.data : undefined;

  return (
    <main className="nxp-shell">
      <header className="nxp-header">
        <div>
          <div className="nxp-eyebrow"><span className="nxp-live" /> Live decision workspace</div>
          <h1>Nexus</h1>
          <p>Rank the opportunity. Inspect the setup. Open Cockpit when it deserves depth.</p>
        </div>
        <div className="nxp-header-actions">
          <div className="nxp-view-switch" aria-label="Signal view">
            <button className={view === 'focus' ? 'active' : ''} onClick={() => setView('focus')}><List size={14} /> Focus</button>
            <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')}><LayoutGrid size={14} /> Grid</button>
            <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}><Table2 size={14} /> Table</button>
          </div>
          <div className="nxp-market-summary">
            <span>{market?.regime ?? 'Loading regime'}</span>
            <strong>{market?.preferredDirection ?? '—'}</strong>
            <span className={pulse.data?.macro.yieldDirection === 'RISING' ? 'risk' : 'reward'}>10Y {pulse.data?.macro.yield10Y ? `${pulse.data.macro.yield10Y.toFixed(2)}%` : '—'} {pulse.data?.macro.yieldDirection === 'RISING' ? '↑' : '↓'}</span>
            <span className={(bonds?.changePct ?? 0) < 0 ? 'risk' : 'reward'}>TLT {bonds?.changePct == null ? '—' : `${bonds.changePct >= 0 ? '+' : ''}${bonds.changePct.toFixed(2)}%`}</span>
            <span className={`nxp-risk-state ${macro.level.toLowerCase()}`}>RISK {macro.level}</span>
            <button type="button" onClick={() => setContextOpen(true)}><PanelRightOpen size={15} /> Context</button>
          </div>
        </div>
      </header>

      {view === 'focus' && <section className="nxp-workspace">
        <aside className="nxp-queue" aria-label="Signal queue">
          <div className="nxp-queue-head">
            <div className="nxp-segmented">
              <button className={scope === 'setups' ? 'active' : ''} onClick={() => setScope('setups')}>Setups</button>
              <button className={scope === 'developing' ? 'active' : ''} onClick={() => setScope('developing')}>Developing</button>
              <button className={scope === 'positions' ? 'active' : ''} onClick={() => setScope('positions')}>Positions</button>
            </div>
            <span>{scope === 'developing' ? developing.length : rows.length}</span>
          </div>
          <label className="nxp-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ticker or sector" /></label>
          <div className="nxp-side-filter">
            {(['all', 'long', 'short'] as const).map((value) => <button key={value} className={side === value ? 'active' : ''} onClick={() => setSide(value)}>{value}</button>)}
          </div>
          {scope !== 'developing' && <HorizonFilter className="nxp-horizon-filter px-3 py-2" value={horizonCut.value} onChange={horizonCut.setValue} counts={horizonCut.counts} total={allRows.length} />}
          {scope === 'setups' && <div className="nxp-rank-filter">
            {(['all', 'new', 'best', 'conviction'] as const).map((value) => <button key={value} className={rank === value ? 'active' : ''} onClick={() => setRank(value)}>{value}</button>)}
          </div>}
          <div className="nxp-rows">
            {scope === 'developing' && patterns.isLoading && <div className="nxp-state">Scanning the opportunity funnel…</div>}
            {scope === 'developing' && !patterns.isLoading && developing.length === 0 && <div className="nxp-state">No measured developing structures match this view.</div>}
            {scope === 'developing' && developing.map((hit) => <button type="button" key={`${hit.symbol}-${hit.pattern}`} className={`nxp-row nxp-developing-row ${developingPick?.symbol === hit.symbol ? 'selected' : ''}`} onClick={() => setDevelopingSymbol(hit.symbol)}><TickerLogo symbol={hit.symbol} size="sm" className="nxp-logo" /><span className="nxp-row-main"><strong>{hit.symbol}</strong><small>{hit.pattern.replaceAll('_',' ')}</small></span><span className="nxp-row-status"><strong>{hit.bias === 'short' ? '▼' : hit.bias === 'long' ? '▲' : '◆'}</strong><small>{hit.core ? 'core' : 'watch'}</small></span><ChevronRight size={14} /></button>)}
            {scope !== 'developing' && <>
            {convictions.isLoading && <div className="nxp-state">Loading the live book…</div>}
            {!convictions.isLoading && rows.length === 0 && <div className="nxp-state">No setups match this view.</div>}
            {rows.map((pick) => {
              const up = pick.direction === 'long';
              const selectedRow = selected?.ideaId === pick.ideaId;
              return (
                <button type="button" key={pick.ideaId} className={`nxp-row ${selectedRow ? 'selected' : ''}`} onClick={() => setSelectedId(pick.ideaId)}>
                  <TickerLogo symbol={pick.symbol} size="sm" className="nxp-logo" />
                  <span className="nxp-row-main"><strong>{pick.symbol}</strong><small>{pick.sector === 'other' ? pick.tradeType ?? 'cross-sector' : pick.sector.replaceAll('_', ' ')}</small></span>
                  <span className="nxp-row-status"><strong>{pick.isBotHeld ? `${(pick.unrealizedPnlPercent ?? 0) >= 0 ? '+' : ''}${(pick.unrealizedPnlPercent ?? 0).toFixed(1)}%` : convictionPercent(pick.convictionScore)}</strong><small>{stateLabel(pick)}</small></span>
                  <ChevronRight size={14} />
                </button>
              );
            })}
            </>}
          </div>
        </aside>

        <section className="nxp-stage" ref={stageRef}>
          {scope === 'developing' ? (developingPick ? <DevelopingDetail hit={developingPick} quote={developingQuote.data} onOpen={() => openWorkup(developingPick.symbol)} /> : <div className="nxp-empty"><Activity /><h2>No developing candidate selected</h2><p>Change the ticker, side, or pattern filter.</p></div>) : !selected ? <div className="nxp-empty"><Activity /><h2>Select a setup</h2><p>The trade plan will appear here without leaving Nexus.</p></div> : (
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
                <NexusPriceChart symbol={selected.symbol} initialTf="1D" height={238} levels={[
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
                {(['overview','technical','manage','risk','contract'] as const).map((tab) => <button key={tab} className={detailTab === tab ? 'active' : ''} onClick={() => setDetailTab(tab)}>{tab}</button>)}
              </div>
              <div className="nxp-tab-panel">
                {detailTab === 'overview' && <div className="nxp-bottom-grid">
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
                    {selected.symbol === 'SPY' && <div className={`nxp-spx-expression ${spxExpression ? 'live' : ''}`}><span>SPX linked expression</span>{spxExpression ? <><strong>{positive ? 'BULLISH' : 'BEARISH'} · SPX {money(spxExpression.spot)}</strong><small>Trigger {money(spxExpression.entry)} · Stop {money(spxExpression.stop)} · T1 {money(spxExpression.target)}</small>{spxExpression.contract ? <small>Actual chain · {spxExpression.contract.optionSymbol} · {money(spxExpression.contract.entryPremium)}</small> : <small>{spxExpression.chainNote || 'No account-fit SPX/SPXW contract cleared the chain gates.'}</small>}</> : <small>{spxMap.isLoading ? 'Reading the SPX/SPXW chain…' : 'SPX quote pair unavailable — no levels guessed.'}</small>}</div>}
                    <button className="nxp-cockpit" type="button" onClick={() => openWorkup(selected.symbol)}>Open full workup <ChevronRight size={16} /></button>
                  </aside>
                </div>}
                {detailTab === 'technical' && <div className="nxp-technical-grid"><TASummary symbol={selected.symbol} /><div className="nxp-components"><div className="nxp-section-title"><span>Signal components</span><small>{selected.layers.length} layers</small></div><SignalComponents layers={selected.layers} max={99} /></div></div>}
                {detailTab === 'manage' && <div className="nxp-manage-grid"><PriceLadder pick={selected} live={live} /><ProfitPlan pick={selected} live={live} /></div>}
                {detailTab === 'risk' && <RiskPanel pick={selected} live={live} />}
                {detailTab === 'contract' && <ContractEngine symbol={selected.symbol} direction={positive ? 'BULL' : 'BEAR'} entry={selected.entryPrice} stop={selected.stopLoss} t1={selected.targetPrice} holdPeriodLabel={selected.holdingPeriod} conviction={convictionPercent(selected.convictionScore)} />}
              </div>
            </motion.div>
          )}
        </section>
      </section>}

      {view === 'grid' && <section className="nxp-alt-view nxp-grid-view">
        <SignalGrid picks={rows} selectedId={selected?.ideaId ?? null} onSelect={(id) => { setSelectedId(id); setView('focus'); }} />
      </section>}

      {view === 'table' && <section className="nxp-alt-view nxp-table-view">
        <HorizonFilter className="mb-3" value={horizonCut.value} onChange={horizonCut.setValue} counts={horizonCut.counts} total={allRows.length} />
        <IdeasTable picks={rows} selectedId={selected?.ideaId ?? null} onSelect={(id) => { setSelectedId(id); setView('focus'); }} />
        <details className="mt-4"><summary className="cursor-pointer font-mono text-[11px] text-muted-foreground">Live geometry table</summary>
          <SignalTable picks={rows} selectedId={selected?.ideaId ?? null} onSelect={(id) => { setSelectedId(id); setView('focus'); }} />
        </details>
      </section>}

      <AnimatePresence>
        {contextOpen && <>
          <motion.button aria-label="Close context" className="nxp-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setContextOpen(false)} />
          <motion.aside className="nxp-context" initial={reduceMotion ? false : { x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
            <div className="nxp-context-head"><div><span>Market context</span><h2>{market?.regime ?? 'Unavailable'}</h2></div><button onClick={() => setContextOpen(false)}><X size={17} /></button></div>
            <div className="nxp-context-score"><strong>{market?.score ?? '—'}</strong><span>regime score</span></div>
            <div className={`nxp-macro-oracle ${macro.level.toLowerCase()}`}><div><span>Macro Risk Oracle</span><strong>{macro.level}</strong><b>{macro.score}/100</b></div><p>{macro.posture}</p><ul>{macro.drivers.map((driver) => <li key={driver}>{driver}</li>)}</ul><small>Rates stress is measured from 10Y, its direction, TLT and VIX. Inflation is not inferred from yields.</small></div>
            <dl><div><dt>Risk sentiment</dt><dd>{market?.riskSentiment ?? '—'}</dd></div><div><dt>Preferred side</dt><dd>{market?.preferredDirection ?? '—'}</dd></div><div><dt>VIX</dt><dd>{market?.vixLevel?.toFixed(1) ?? '—'}</dd></div><div><dt>10Y yield</dt><dd>{pulse.data?.macro.yield10Y ? `${pulse.data.macro.yield10Y.toFixed(2)}% · ${pulse.data.macro.yieldDirection.toLowerCase()}` : 'unavailable'}</dd></div><div><dt>Bonds · TLT</dt><dd>{bonds?.changePct == null ? 'unavailable' : `${bonds.changePct >= 0 ? '+' : ''}${bonds.changePct.toFixed(2)}% · ${bonds.stance?.toLowerCase()}`}</dd></div><div><dt>Macro freshness</dt><dd>{extended.data?.isStale ? 'stale' : extended.data?.session ?? 'loading'}</dd></div></dl>
            <h3>Why it matters now</h3>
            <ul>{(market?.reasons ?? []).map((reason) => <li key={reason}>{reason}</li>)}</ul>
          </motion.aside>
        </>}
      </AnimatePresence>
    </main>
  );
}
