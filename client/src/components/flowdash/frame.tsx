/**
 * Tool frame — the chrome every dashboard tool wears, so no tool can ship
 * without its title, a one-line "what this shows", units, data source and age.
 *
 * Tools report their own freshness through useToolReport(); wrapped legacy
 * components that already stamp ages per row declare `ageInside` in the
 * registry and the frame says so instead of inventing a single age.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { GripVertical, X } from 'lucide-react';
import { useStockContext } from '@/contexts/stock-context';
import { ageLabel } from './tape';
import type { ToolDef, ToolType } from './registry';

export interface ToolReport {
  /** ISO of the newest datum shown (not the fetch time). */
  asOf?: string | null;
  /** Overrides the registry source line when the tool knows better. */
  source?: string;
  /** Short state note, e.g. "stream off", "throttled". */
  note?: string;
  tone?: 'ok' | 'warn';
}

const ReportCtx = createContext<(r: ToolReport) => void>(() => {});

/** Tools call this with their freshness; re-reports on every change. */
export function useToolReport(r: ToolReport) {
  const set = useContext(ReportCtx);
  const key = `${r.asOf ?? ''}|${r.source ?? ''}|${r.note ?? ''}|${r.tone ?? ''}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { set(r); }, [key, set]);
}

/* ── dashboard context: focus symbol + tool presence ── */
interface DashCtx {
  hasTool: (t: ToolType) => boolean;
  addTool: (t: ToolType) => void;
}
export const DashboardCtx = createContext<DashCtx>({ hasTool: () => false, addTool: () => {} });
export const useDashboard = () => useContext(DashboardCtx);

/** The dashboard's focus ticker IS the terminal's shared symbol, so a row
 *  clicked here also re-points the CHART and GEX tabs. */
export function useFocusSymbol(fallback = 'SPY'): [string, (s: string) => void] {
  const { currentStock, setCurrentStock } = useStockContext();
  return [(currentStock?.symbol || fallback).toUpperCase(), (s: string) => setCurrentStock({ symbol: s.toUpperCase() })];
}

export function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), everyMs); return () => clearInterval(id); }, [everyMs]);
  return now;
}

export function ToolFrame({
  def, onRemove, dragHandle, resizeHandle, children, compact,
}: {
  def: ToolDef;
  onRemove?: () => void;
  dragHandle?: ReactNode;
  resizeHandle?: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  const [report, setReport] = useState<ToolReport>({});
  const now = useNow();
  const age = def.ageInside
    ? 'age shown per row'
    : report.asOf !== undefined
      ? (report.asOf ? ageLabel(report.asOf, now) : 'no data yet')
      : 'loading…';
  const src = report.source ?? def.source;
  return (
    <section className="fd-tool" aria-label={def.title} data-tool={def.type}>
      <header className="fd-tool-head">
        {dragHandle ?? <span className="fd-grip-ph" aria-hidden><GripVertical size={12} /></span>}
        <div className="fd-tool-titles">
          <div className="fd-tool-title">
            <span>{def.title}</span>
            <span className={`fd-age${report.tone === 'warn' ? ' warn' : ''}`} title={`Data source: ${src}\nAge = time since the newest datum shown, not since the last fetch.`}>
              {src} · {age}{report.note ? ` · ${report.note}` : ''}
            </span>
          </div>
          {!compact && (
            <div className="fd-tool-blurb" title={`${def.blurb}\nUnits: ${def.units}`}>
              {def.blurb} <span className="fd-units">Units: {def.units}</span>
            </div>
          )}
        </div>
        {onRemove && (
          <button type="button" className="fd-icon-btn" onClick={onRemove} aria-label={`Remove ${def.title}`} title="Remove tool">
            <X size={13} />
          </button>
        )}
      </header>
      <div className="fd-tool-body">
        <ReportCtx.Provider value={setReport}>{children}</ReportCtx.Provider>
      </div>
      {resizeHandle}
    </section>
  );
}
