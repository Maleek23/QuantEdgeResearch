/**
 * LAYERS panel — what is shown on the chart, grouped, searchable. A popover
 * under the toolbar button on desktop, a bottom sheet on phones (CSS). Each
 * group: a master switch + "n of m on"; each row: switch, one-line hint and a
 * quick opacity slider when the layer has one. Templates sit on top.
 * HOW layers look (style, horizons, bands, colours, density) stays in Settings.
 */
import { useId, useState, type ReactNode } from 'react';
import { LAYER_GROUPS, filterLayerGroups, groupSummary, type LayerId } from '@shared/chart-layer-groups';
import type { ChartStyle } from '@shared/chart-templates';
import { clearActiveTemplate, setLayerOpacity } from '../chart-style';

export interface LayerState { on: boolean; set: (v: boolean) => void; available: boolean; note?: string | null }
export type LayerStates = Record<LayerId, LayerState>;

function Switch({ on, onChange, label, disabled, mixed }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; mixed?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={mixed ? 'mixed' : on} aria-label={label} disabled={disabled}
      className={`tv-lysw${on ? ' on' : ''}${mixed ? ' mixed' : ''}`} onClick={() => onChange(!on)}>
      <i aria-hidden="true" />
    </button>
  );
}

export function LayersPanel({ states, style, templates, onOpenSettings, onClose }: {
  states: LayerStates; style: ChartStyle; templates: ReactNode; onOpenSettings: () => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const id = useId();
  const groups = filterLayerGroups(q);
  const flip = (lid: LayerId, v: boolean) => { clearActiveTemplate(); states[lid].set(v); };
  return (
    <div className="tv-menu tv-layers" role="dialog" aria-modal="false" aria-labelledby={`${id}-t`}>
      <div className="tv-ly-head">
        <span className="tv-ly-grab" aria-hidden="true" />
        <b id={`${id}-t`}>Layers</b>
        <small>what's on the chart</small>
        <button type="button" className="tv-ly-close" onClick={onClose} aria-label="Close layers">×</button>
      </div>
      <label className="tv-isearch">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input className="tv-text-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search layers, e.g. gatekeeper, vwap" aria-label="Search layers"
          autoCorrect="off" spellCheck={false} enterKeyHint="search" />
      </label>
      {!q && <div className="tv-ly-tpl"><span className="tv-ly-cap">Templates</span>{templates}</div>}
      {groups.map((g) => {
        const full = LAYER_GROUPS.find((x) => x.id === g.id) ?? g;
        const sum = groupSummary(full, (r) => states[r].on, (r) => states[r].available);
        return (
          <section className="tv-ly-group" key={g.id} aria-labelledby={`${id}-${g.id}`}>
            <div className="tv-ly-ghead">
              <span id={`${id}-${g.id}`} className="tv-ly-gname">{g.label}</span>
              <span className="tv-ly-count">{sum.text}</span>
              <Switch on={sum.master} mixed={sum.on > 0 && sum.on < sum.total} disabled={!sum.total}
                label={`${g.label}: ${sum.master ? 'turn all off' : 'turn all on'}`}
                onChange={(v) => full.rows.forEach((r) => { if (states[r.id].available && states[r.id].on !== v) flip(r.id, v); })} />
            </div>
            {g.rows.map((r) => {
              const st = states[r.id];
              const op = r.opacity ? Math.round(style.opacity[r.opacity] * 100) : null;
              return (
                <div className={`tv-ly-row${st.available ? '' : ' na'}`} key={r.id}>
                  <div className="tv-ly-text">
                    <span className="tv-ly-label">{r.label}</span>
                    <small>{st.available ? (st.note ?? r.hint) : (st.note ?? 'not available for this symbol')}</small>
                  </div>
                  {op != null && st.on && st.available && (
                    <input type="range" className="tv-ly-op" min={10} max={100} step={5} value={op}
                      aria-label={`${r.label} opacity`} title={`Opacity ${op}%`}
                      onChange={(e) => setLayerOpacity(r.opacity!, Number(e.target.value) / 100)} />
                  )}
                  <Switch on={st.on} disabled={!st.available} label={r.label} onChange={(v) => flip(r.id, v)} />
                </div>
              );
            })}
          </section>
        );
      })}
      {!groups.length && <p className="tv-ly-empty">No layer matches “{q}”.</p>}
      <button type="button" className="tv-ly-foot" onClick={onOpenSettings}>How layers look (style, horizons, colours) → Settings</button>
    </div>
  );
}

/** Legend chips: every layer that is on, tap to turn it off; the last chip opens Layers. */
export function ActiveLayerChips({ states, onOpen }: { states: LayerStates; onOpen: () => void }) {
  const on = LAYER_GROUPS.flatMap((g) => g.rows).filter((r) => states[r.id].on && states[r.id].available);
  return (
    <div className="tv-lychips" role="group" aria-label="Layers on the chart">
      {on.map((r) => (
        <button type="button" key={r.id} className="tv-lychip" onClick={() => { clearActiveTemplate(); states[r.id].set(false); }} aria-label={`Hide ${r.label}`} title={`Hide ${r.label}`}>
          {r.chip}<span aria-hidden="true">×</span>
        </button>
      ))}
      <button type="button" className="tv-lychip tv-lychip-add" onClick={onOpen} aria-label="Open layers">+ Layers</button>
    </div>
  );
}
