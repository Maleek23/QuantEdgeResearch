/**
 * Pieces of the grouped chart Settings sheet (tv-chart.tsx indicatorsMenu):
 * templates bar, Appearance section, the quick-toggle chips row and the Path
 * level chips. Styles live in TV_CSS (tv-chart-panels.tsx) under .tv-qc / .tv-tpl / .tv-app.
 */
import { useState } from 'react';
import { PATH_STYLES, QUICK_LAYERS, STYLE_LAYERS, STYLE_LAYER_LABEL, type ChartStyle, type PathStyle } from '@shared/chart-templates';
import { fmtPathPct, PATH_HORIZONS, PATH_HORIZON_LABEL, type PathHorizon, type PathResult } from '@shared/path-projection';
import type { ChartPrefs } from '../chart-prefs';
import {
  allTemplates, applyChartTemplate, clearActiveTemplate, deleteTemplate, resetStyle, saveTemplateAs, setLayerColor, setLayerOpacity, setStyle,
  type ChartStyleState,
} from '../chart-style';

export function TemplatesBar({ st, prefs, onApplied }: { st: ChartStyleState; prefs: ChartPrefs; onApplied: (name: string) => void }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const list = allTemplates(st);
  return (
    <div className="tv-tpl" role="group" aria-label="Chart templates">
      <div className="tv-tpl-row">
        {list.map((t) => (
          <span key={t.id} className={`tv-tpl-chip${st.activeTemplate === t.id ? ' on' : ''}`}>
            <button type="button" aria-pressed={st.activeTemplate === t.id} onClick={() => { applyChartTemplate(t.id); onApplied(t.name); }} title={t.builtin ? `Built-in template: ${t.name}` : `Your template: ${t.name}`}>{t.name}</button>
            {!t.builtin && <button type="button" className="tv-tpl-x" aria-label={`Delete template ${t.name}`} title="Delete template" onClick={() => deleteTemplate(t.id)}>×</button>}
          </span>
        ))}
        {!naming && <button type="button" className="tv-tpl-chip tv-tpl-add" onClick={() => setNaming(true)}>+ Save as…</button>}
      </div>
      {naming && (
        <form className="tv-cmp" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; const t = saveTemplateAs(name, prefs); setNaming(false); setName(''); onApplied(t.name); }}>
          <input className="tv-text-in" autoFocus value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Template name, e.g. My 0DTE" aria-label="Template name" />
          <button type="submit" className="tv-btn" disabled={!name.trim()}>Save</button>
          <button type="button" className="tv-btn" onClick={() => setNaming(false)}>Cancel</button>
        </form>
      )}
      <small className="tv-msub">Templates set layers, indicators, candle style and scale — never the symbol or timeframe. Saved to your account.</small>
    </div>
  );
}

export function AppearanceSection({ style }: { style: ChartStyle }) {
  return (
    <div className="tv-app">
      {STYLE_LAYERS.map((k) => (
        <div className="tv-app-row" key={k}>
          <span className="tv-app-name">{STYLE_LAYER_LABEL[k]}</span>
          <input
            type="range" min={10} max={100} step={5} value={Math.round(style.opacity[k] * 100)}
            aria-label={`${STYLE_LAYER_LABEL[k]} opacity`} onChange={(e) => setLayerOpacity(k, Number(e.target.value) / 100)}
          />
          <span className="tv-app-val">{Math.round(style.opacity[k] * 100)}%</span>
          {(k === 'path' || k === 'em') ? (
            <span className="tv-app-col">
              <input type="color" value={style.color[k] ?? '#3b82f6'} aria-label={`${STYLE_LAYER_LABEL[k]} colour`} onChange={(e) => setLayerColor(k, e.target.value)} />
              {style.color[k] && <button type="button" className="tv-tpl-x" aria-label={`Reset ${STYLE_LAYER_LABEL[k]} colour`} title="Theme colour" onClick={() => setLayerColor(k, null)}>×</button>}
            </span>
          ) : <span className="tv-app-col" aria-hidden />}
        </div>
      ))}
      <div className="tv-mseg-row">
        <span className="tv-mseg-label">Line weight</span>
        <div className="tv-seg" role="radiogroup" aria-label="Line weight">
          {([1, 2, 3] as const).map((w) => <button type="button" role="radio" aria-checked={style.lineWidth === w} key={w} className={style.lineWidth === w ? 'on' : ''} onClick={() => setStyle({ lineWidth: w })}>{w}px</button>)}
        </div>
      </div>
      <div className="tv-mseg-row">
        <span className="tv-mseg-label">Labels</span>
        <div className="tv-seg" role="radiogroup" aria-label="Label density">
          {(['low', 'normal', 'high'] as const).map((d) => <button type="button" role="radio" aria-checked={style.labelDensity === d} key={d} className={style.labelDensity === d ? 'on' : ''} onClick={() => setStyle({ labelDensity: d })}>{d === 'low' ? 'Few' : d === 'normal' ? 'Normal' : 'All'}</button>)}
        </div>
      </div>
      <label className="tv-mseg-row tv-app-check">
        <span className="tv-mseg-label">Low-chroma candles</span>
        <input type="checkbox" checked={style.lowChroma} onChange={(e) => setStyle({ lowChroma: e.target.checked })} aria-describedby="tv-lowchroma-hint" />
      </label>
      <small className="tv-msub" id="tv-lowchroma-hint">Quieter candle colours so levels and the path read first.</small>
      <div className="tv-mactions"><button type="button" className="tv-btn" onClick={resetStyle}>Reset appearance</button></div>
      <small className="tv-msub">Theme (light / dark) follows the app's visual mode switch.</small>
    </div>
  );
}

/** The six most-used layers as one-tap chips, plus the active template name. */
export function QuickChips({ prefs, set, active }: { prefs: ChartPrefs; set: <K extends keyof ChartPrefs>(k: K, v: ChartPrefs[K]) => void; active: string | null }) {
  const on = (k: string) => (k === 'gex' ? prefs.gex !== 'off' : !!(prefs as unknown as Record<string, unknown>)[k]);
  const flip = (k: string) => {
    clearActiveTemplate();
    if (k === 'gex') set('gex', prefs.gex === 'off' ? 'bubbles' : 'off');
    else set(k as keyof ChartPrefs, !on(k) as never);
  };
  return (
    <div className="tv-qc" role="group" aria-label="Quick layers">
      {QUICK_LAYERS.map((l) => (
        <button type="button" key={l.key} className={`tv-qc-chip${on(l.key) ? ' on' : ''}`} aria-pressed={on(l.key)} onClick={() => flip(l.key)}>{l.label}</button>
      ))}
      {active && <span className="tv-qc-tpl" title="Active template">{active}</span>}
    </div>
  );
}

export function PathHorizonPill({ value, onChange, className = '' }: { value: PathHorizon; onChange: (h: PathHorizon) => void; className?: string }) {
  return (
    <div className={`tv-seg ${className}`} role="radiogroup" aria-label="Path horizon" title="Path fan horizon — modelled scenario, not a forecast">
      <span className="tv-seg-lab" aria-hidden>Path</span>
      {PATH_HORIZONS.map((h) => <button type="button" role="radio" aria-checked={value === h} key={h} className={value === h ? 'on' : ''} onClick={() => onChange(h)}>{PATH_HORIZON_LABEL[h]}</button>)}
    </div>
  );
}

/** Settings → Projections: Clean (default) vs Detailed look for the Trajectory Path. */
export function PathStyleRow({ value }: { value: PathStyle }) {
  return (
    <div className="tv-mseg-row">
      <span className="tv-mseg-label">Path style</span>
      <div className="tv-seg" role="radiogroup" aria-label="Path style">
        {PATH_STYLES.map((p) => <button type="button" role="radio" aria-checked={value === p.id} key={p.id} title={p.hint} className={value === p.id ? 'on' : ''} onClick={() => setStyle({ pathStyle: p.id })}>{p.label}</button>)}
      </div>
    </div>
  );
}

/** "Apex 585 · touch 62% · stop 31%" — nearest-first, Apex and the Gatekeeper always shown.
 *  Clean path style: hidden until the chart (or the row) is hovered / focused / tapped. */
export function PathLevelChips({ r, max = 6, clean = false }: { r: PathResult; max?: number; clean?: boolean }) {
  const f = (p: number) => (p >= 100 ? p.toFixed(0) : p.toFixed(2));
  const rows = [...r.levels].sort((a, b) => Math.abs(a.price - r.spot) - Math.abs(b.price - r.spot));
  const pick = rows.filter((l) => l.name === 'Apex' || l.price === r.gatekeeper?.price);
  for (const l of rows) { if (pick.length >= max) break; if (!pick.includes(l)) pick.push(l); }
  return (
    <div className={`tv-pchips${clean ? ' tv-pchips-clean' : ''}`} role="list" aria-label="Path level odds (modelled)" tabIndex={clean ? 0 : undefined}>
      {pick.map((l) => (
        <span role="listitem" key={`${l.name}${l.price}`} className={`tv-pchip${l.price === r.gatekeeper?.price ? ' gate' : ''}${l.name === 'Apex' ? ' apex' : ''}`}
          title={`${l.name} ${f(l.price)} (${l.side} price): ${fmtPathPct(l.touch)} of 2,000 modelled paths touch it; ${fmtPathPct(l.stop)} come within reach and turn back. Modelled, not a forecast.`}>
          <b>{l.name} {f(l.price)}</b> · touch {fmtPathPct(l.touch)} · stop {fmtPathPct(l.stop)}
        </span>
      ))}
      {r.badges.filter((b) => b.kind !== 'gatekeeper').map((b) => <span key={b.kind} role="listitem" className={`tv-pchip ${b.kind}`}>{b.text}</span>)}
    </div>
  );
}
