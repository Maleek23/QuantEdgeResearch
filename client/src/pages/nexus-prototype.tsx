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
import '@/styles/nexus-prototype.css';

interface IndexScalp {
  id: string; symbol: string; bias: 'calls' | 'puts'; direction?: 'long' | 'short';
  setup?: string; strike?: number | null; expiry?: string | null; spot?: number | null;
  target?: number | null; stop?: number | null; riskRewardRatio?: number | null;
  confidence?: number | null; thesis?: string | null; timestamp?: string;
}
interface IndexScalpResponse { session?: { isMarketOpen?: boolean; sessionLabel?: string }; scalps?: IndexScalp[]; }
interface SpxExpression { symbol: 'SPX'; source: string; asOf: string; ratio: number; spot: number; entry: number; stop: number; target: number; chainStatus: string; chainNote?: string; chainAsOf?: string; chainContractsScored: number; contract: { optionType: 'call' | 'put'; strike: number; expiry: string; dte: number; entryPremium: number; optionSymbol: string } | null; }

async function get<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

const money = (value?: number | null) => value == null || !Number.isFinite(value) ? '—' : `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const stateLabel = (pick: ConvictionPick) => pick.isBotHeld ? 'Bot held' : pick.lifecycleState === 'pending_trigger' ? 'Waiting' : pick.lifecycleState === 'closed' ? 'Closed' : 'In play';

export default function NexusPrototype() {
  const reduceMotion = useReducedMotion();
  const [scope, setScope] = useState<'setups' | 'positions'>('setups');
  const [side, setSide] = useState<'all' | 'long' | 'short'>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
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
  const spySource = convictions.data?.picks.find((pick) => pick.symbol === 'SPY' && !pick.isBotHeld);
  const spxMap = useQuery<SpxExpression>({
    queryKey: ['/api/spx/expression', spySource?.entryPrice, spySource?.stopLoss, spySource?.targetPrice],
    queryFn: () => get(`/api/spx/expression?entry=${spySource!.entryPrice}&stop=${spySource!.stopLoss}&target=${spySource!.targetPrice}&holdingDays=${parseInt(spySource!.holdingPeriod) || 1}&conviction=${convictionPercent(spySource!.convictionScore)}`),
    enabled: Boolean(spySource),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const rows = useMemo(() => {
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

  useEffect(() => {
    if (!rows.some((row) => row.ideaId === selectedId)) setSelectedId(rows[0]?.ideaId);
  }, [rows, selectedId]);
  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setDetailTab('overview');
  }, [selectedId]);

  const selected = rows.find((row) => row.ideaId === selectedId) ?? rows[0];
  const market = convictions.data?.marketContext;
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
            <button type="button" onClick={() => setContextOpen(true)}><PanelRightOpen size={15} /> Context</button>
          </div>
        </div>
      </header>

      {view === 'focus' && <section className="nxp-workspace">
        <aside className="nxp-queue" aria-label="Signal queue">
          <div className="nxp-queue-head">
            <div className="nxp-segmented">
              <button className={scope === 'setups' ? 'active' : ''} onClick={() => setScope('setups')}>Setups</button>
              <button className={scope === 'positions' ? 'active' : ''} onClick={() => setScope('positions')}>Positions</button>
            </div>
            <span>{rows.length}</span>
          </div>
          <label className="nxp-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ticker or sector" /></label>
          <div className="nxp-side-filter">
            {(['all', 'long', 'short'] as const).map((value) => <button key={value} className={side === value ? 'active' : ''} onClick={() => setSide(value)}>{value}</button>)}
          </div>
          {scope === 'setups' && <div className="nxp-rank-filter">
            {(['all', 'new', 'best', 'conviction'] as const).map((value) => <button key={value} className={rank === value ? 'active' : ''} onClick={() => setRank(value)}>{value}</button>)}
          </div>}
          <div className="nxp-rows">
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
          </div>
        </aside>

        <section className="nxp-stage" ref={stageRef}>
          {!selected ? <div className="nxp-empty"><Activity /><h2>Select a setup</h2><p>The trade plan will appear here without leaving Nexus.</p></div> : (
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

      {view === 'table' && <section className="nxp-alt-view nxp-table-view"><SignalTable picks={rows} selectedId={selected?.ideaId ?? null} onSelect={(id) => { setSelectedId(id); setView('focus'); }} /></section>}

      <AnimatePresence>
        {contextOpen && <>
          <motion.button aria-label="Close context" className="nxp-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setContextOpen(false)} />
          <motion.aside className="nxp-context" initial={reduceMotion ? false : { x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
            <div className="nxp-context-head"><div><span>Market context</span><h2>{market?.regime ?? 'Unavailable'}</h2></div><button onClick={() => setContextOpen(false)}><X size={17} /></button></div>
            <div className="nxp-context-score"><strong>{market?.score ?? '—'}</strong><span>regime score</span></div>
            <dl><div><dt>Risk sentiment</dt><dd>{market?.riskSentiment ?? '—'}</dd></div><div><dt>Preferred side</dt><dd>{market?.preferredDirection ?? '—'}</dd></div><div><dt>VIX</dt><dd>{market?.vixLevel?.toFixed(1) ?? '—'}</dd></div></dl>
            <h3>Why it matters now</h3>
            <ul>{(market?.reasons ?? []).map((reason) => <li key={reason}>{reason}</li>)}</ul>
          </motion.aside>
        </>}
      </AnimatePresence>
    </main>
  );
}
