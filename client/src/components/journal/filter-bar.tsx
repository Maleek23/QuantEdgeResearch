/**
 * One filter bar for Dashboard, Trades and Analytics (LuxAlgo's FilterBar idea:
 * filters are global to the journal, not per page). Range presets are a
 * segmented control; the rest are native selects so they work with a keyboard
 * and on phones without a custom popover. On narrow screens the secondary
 * filters collapse behind a "Filters" toggle.
 */
import { useEffect, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { RANGE_PRESETS, type useJournalFilterState } from '@/lib/journal/use-journal';
import type { JournalData } from '@/lib/journal/use-journal';

type FilterApi = ReturnType<typeof useJournalFilterState>;

export function JournalFilterBar({ api, options, shown, total }: {
  api: FilterApi;
  options: JournalData['options'];
  shown: number;
  total: number;
}) {
  const { state, setRange, setFilter, clear, clearDrill, activeCount } = api;
  const f = state.filters;
  const [open, setOpen] = useState(false);
  const symKey = (f.symbols ?? []).join(', ');
  const [symDraft, setSymDraft] = useState(symKey);
  // Keep the text box in step when symbols change elsewhere (a bucket click, Clear).
  useEffect(() => setSymDraft(symKey), [symKey]);

  const commitSymbols = () => {
    const list = symDraft.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    setFilter('symbols', list.length ? list : undefined);
  };

  return (
    <div className="jr-filters" role="search" aria-label="Journal filters">
      {f.ids?.length ? (
        // A drill-down from Insights / Loss analysis / the time heatmap: exactly these trades.
        <span className="jr-drill-chip" title={`Showing exactly the ${f.ids.length} trades behind: ${f.drill ?? 'a summary row'}`}>
          <span>{f.drill ?? 'Selected trades'} · {f.ids.length} trade{f.ids.length === 1 ? '' : 's'}</span>
          <button type="button" onClick={clearDrill} aria-label="Remove this drill-down filter"><X className="h-3 w-3" /></button>
        </span>
      ) : null}
      <div className="jr-seg" role="group" aria-label="Date range">
        {RANGE_PRESETS.map((r) => (
          <button key={r.id} type="button" aria-pressed={state.range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
        ))}
      </div>
      {state.range === 'custom' && (
        <>
          <input type="date" className="jr-input" aria-label="From date" value={f.from ?? ''} onChange={(e) => setFilter('from', e.target.value || undefined)} />
          <input type="date" className="jr-input" aria-label="To date" value={f.to ?? ''} onChange={(e) => setFilter('to', e.target.value || undefined)} />
        </>
      )}
      {options.runs.length > 0 && (
        // Bot book: which run(s) every number on the page covers. Default = all runs, combined.
        <select className="jr-select" aria-label="Bot run" value={f.run ?? ''} onChange={(e) => setFilter('run', e.target.value || undefined)}>
          <option value="">All {options.runs.length} runs · combined</option>
          {options.runs.map((r) => <option key={r.id} value={r.id} title={r.displayName}>{r.label}</option>)}
        </select>
      )}
      <input
        className="jr-input"
        style={{ width: 150 }}
        placeholder="Symbols e.g. SPY, NVDA"
        aria-label="Filter by symbols (comma separated)"
        list="jr-symbols"
        value={symDraft}
        onChange={(e) => setSymDraft(e.target.value)}
        onBlur={commitSymbols}
        onKeyDown={(e) => { if (e.key === 'Enter') commitSymbols(); }}
      />
      <datalist id="jr-symbols">{options.symbols.map((s) => <option key={s} value={s} />)}</datalist>
      <button type="button" className="jr-btn jr-btn-sm jr-filter-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
      </button>
      <div className="jr-filter-more" data-open={open}>
        <select className="jr-select" aria-label="Side" value={f.side ?? ''} onChange={(e) => setFilter('side', (e.target.value || undefined) as 'long' | 'short' | undefined)}>
          <option value="">Long + short</option>
          <option value="long">Long only</option>
          <option value="short">Short only</option>
        </select>
        <select className="jr-select" aria-label="Outcome" value={f.outcome ?? ''} onChange={(e) => setFilter('outcome', (e.target.value || undefined) as never)}>
          <option value="">Any outcome</option>
          <option value="win">Wins</option>
          <option value="loss">Losses</option>
          <option value="breakeven">Breakeven</option>
          <option value="open">Open</option>
        </select>
        <Select label="Setup" value={f.setup} values={options.setups} onChange={(v) => setFilter('setup', v)} />
        <Select label="Mistake" value={f.mistake} values={options.mistakes} onChange={(v) => setFilter('mistake', v)} />
        <Select label="Emotion" value={f.emotion} values={options.emotions} onChange={(v) => setFilter('emotion', v)} />
        <Select label="Asset" value={f.asset} values={options.assets} onChange={(v) => setFilter('asset', v)} />
        <Select label="Source" value={f.broker} values={options.brokers} onChange={(v) => setFilter('broker', v)} />
      </div>
      <span className="jr-filter-count" aria-live="polite">
        {/* announced, not drawn: the page header right above already prints
            "N trades" / "x of N in view" (UI redundancy pass 2026-10-01) */}
        <span className="sr-only">{shown} of {total} trades</span>
        {activeCount > 0 && (
          <button type="button" className="jr-btn jr-btn-sm" style={{ marginLeft: 8 }} onClick={clear}>
            <X className="h-3 w-3" /> Clear {activeCount}
          </button>
        )}
      </span>
    </div>
  );
}

function Select({ label, value, values, onChange }: { label: string; value?: string; values: string[]; onChange: (v: string | undefined) => void }) {
  if (!values.length && !value) return null;
  return (
    <select className="jr-select" aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">Any {label.toLowerCase()}</option>
      {value && !values.some((v) => v.toLowerCase() === value.toLowerCase()) && <option value={value}>{value}</option>}
      {values.map((v) => <option key={v} value={v}>{v}</option>)}
    </select>
  );
}
