import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Activity, LayoutGrid, List, Search, Table2, X } from 'lucide-react';
import { SignalGrid } from '@/components/hunt/cockpit/signal-grid';
import { SignalTable } from '@/components/hunt/cockpit/signal-table';
import { openWorkup } from '@/lib/workup-bus';
import {
  ContextBody, DevelopingDetail, DevelopingRow, MarketSummary, SetupDetail, SetupRow,
  macroRisk, rankDeveloping, rankRows, spySourceOf, withSpxRow,
  useDevelopingQuote, useNexusConvictions, useNexusExtended, useNexusPatterns, useNexusPulse, useSpxExpression,
  SIDES, RANKS, type DetailTab,
} from '@/components/dashboard/tools/nexus/nexus-parts';
import { BoardTimeRangeFilter, EMPTY_CALLED_RANGE, filterByCalledRange, type CalledRange } from '@/components/dashboard/tools/nexus/board-time-filter';
import '@/styles/nexus-prototype.css';

/**
 * NEXUS (terminal tab `oracle`, classic route). The pieces live in
 * components/dashboard/tools/nexus/nexus-parts.tsx so the NEXUS dashboard
 * tools render the same markup from the same queries.
 */
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
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [calledRange, setCalledRange] = useState<CalledRange>(EMPTY_CALLED_RANGE);
  const stageRef = useRef<HTMLElement>(null);

  const convictions = useNexusConvictions();
  const pulse = useNexusPulse();
  const extended = useNexusExtended();
  const patterns = useNexusPatterns();
  const spySource = spySourceOf(convictions.data?.picks);
  const spxMap = useSpxExpression(spySource);
  const rows = useMemo(() => filterByCalledRange(rankRows(
    withSpxRow(convictions.data?.picks, spySource, spxMap.data),
    { scope: scope === 'positions' ? 'positions' : 'setups', side, query, rank },
  ), calledRange.from, calledRange.to), [convictions.data, query, scope, side, rank, spySource, spxMap.data, calledRange]);
  const developing = useMemo(() => rankDeveloping(patterns.data?.hits, convictions.data?.picks, { query, side }), [patterns.data, convictions.data, query, side]);
  const developingPick = developing.find((hit) => hit.symbol === developingSymbol) ?? developing[0];
  const developingQuote = useDevelopingQuote(developingPick?.symbol, scope === 'developing');

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
          <MarketSummary market={market} pulse={pulse.data} bonds={bonds} macro={macro} onOpenContext={() => setContextOpen(true)} />
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
            {SIDES.map((value) => <button key={value} className={side === value ? 'active' : ''} onClick={() => setSide(value)}>{value}</button>)}
          </div>
          {scope === 'setups' && <div className="nxp-rank-filter">
            {RANKS.map((value) => <button key={value} className={rank === value ? 'active' : ''} onClick={() => setRank(value)}>{value}</button>)}
          </div>}
          {scope !== 'developing' && <div className="nxp-trf-row"><BoardTimeRangeFilter value={calledRange} onChange={setCalledRange} count={rows.length} /></div>}
          <div className="nxp-rows">
            {scope === 'developing' && patterns.isLoading && <div className="nxp-state">Scanning the opportunity funnel…</div>}
            {scope === 'developing' && !patterns.isLoading && developing.length === 0 && <div className="nxp-state">No measured developing structures match this view.</div>}
            {scope === 'developing' && developing.map((hit) => <DevelopingRow key={`${hit.symbol}-${hit.pattern}`} hit={hit} selected={developingPick?.symbol === hit.symbol} onSelect={() => setDevelopingSymbol(hit.symbol)} />)}
            {scope !== 'developing' && <>
            {convictions.isLoading && <div className="nxp-state">Loading the live book…</div>}
            {!convictions.isLoading && rows.length === 0 && <div className="nxp-state">No setups match this view.</div>}
            {rows.map((pick) => <SetupRow key={pick.ideaId} pick={pick} selected={selected?.ideaId === pick.ideaId} onSelect={() => setSelectedId(pick.ideaId)} />)}
            </>}
          </div>
        </aside>

        <section className="nxp-stage" ref={stageRef}>
          {scope === 'developing' ? (developingPick ? <DevelopingDetail hit={developingPick} quote={developingQuote.data} onOpen={() => openWorkup(developingPick.symbol)} /> : <div className="nxp-empty"><Activity /><h2>No developing candidate selected</h2><p>Change the ticker, side, or pattern filter.</p></div>) : !selected ? <div className="nxp-empty"><Activity /><h2>Select a setup</h2><p>The trade plan will appear here without leaving Nexus.</p></div> : (
            <SetupDetail selected={selected} spxExpression={spxMap.data} spxLoading={spxMap.isLoading} tab={detailTab} onTab={setDetailTab} />
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
            <div className="nxp-context-head"><div><span>Market context</span><h2>{market?.regimeUnavailable ? 'Unavailable' : market?.regime ?? 'Unavailable'}</h2></div><button onClick={() => setContextOpen(false)}><X size={17} /></button></div>
            <ContextBody market={market} macro={macro} pulse={pulse.data} bonds={bonds} extended={extended.data} />
          </motion.aside>
        </>}
      </AnimatePresence>
    </main>
  );
}
