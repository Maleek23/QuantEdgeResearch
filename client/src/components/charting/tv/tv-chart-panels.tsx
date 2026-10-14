/**
 * TV CHART PANELS — the chart's secondary surfaces, kept out of tv-chart.tsx:
 *   IntervalMenu   built-ins + presets (2m 3m 10m 45m 2h 3h) + a custom box
 *   MiniToolbar    floating style bar for the selection (one or many)
 *   DrawingsPanel  every drawing on this symbol: select, hide, lock, alert, delete; sync state
 *   ShortcutsHelp  the ? overlay
 * Styles live in tv-chart.tsx's TV_CSS (tv-* classes, palette tokens only).
 */
import { Fragment, useEffect, useRef, useState } from 'react';
import { TF_CONFIG } from '@/components/charting/chart-engine';
import {
  ALERTABLE, COLOR_ROLES, DASH_STYLES, FILL_STEPS, LINE_WIDTHS, TOOL_LABEL, describeDrawing, fillOf, positionStats,
  type ColorRole, type DashStyle, type Drawing, type DrawTool,
} from './drawing-geometry';
import { RISK_PRESETS } from '@shared/position-sizing';
import type { SyncStatus } from './drawing-store';
import { INTERVAL_PRESETS, addCustomInterval, customIntervals, intervalName, parseInterval, removeCustomInterval } from './custom-intervals';
import {
  IconBell, IconClose, IconDuplicate, IconEye, IconEyeOff, IconFlip, IconLock, IconTrash, IconUnlock,
} from './tv-icons';

const BUILT_INS = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W'];
const AREA_TOOLS = new Set<DrawTool>(['rect', 'channel', 'fib', 'fibext', 'measure', 'long', 'short']);
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

/* ───────────────────────── interval menu ───────────────────────── */

export function IntervalMenu({ tf, onPick, onError }: { tf: string; onPick: (k: string) => void; onError: (t: string) => void }) {
  const [draft, setDraft] = useState('');
  const [, bump] = useState(0);
  const custom = customIntervals().filter((k) => !BUILT_INS.includes(k) && !(INTERVAL_PRESETS as readonly string[]).includes(k));
  const spec = parseInterval(draft);
  const row = (k: string, removable = false) => (
    <div className="tv-layout" key={k}>
      <button type="button" role="menuitemradio" aria-checked={tf === k} className={`tv-mitem${tf === k ? ' on' : ''}`} onClick={() => onPick(k)}>
        <span>{intervalName(k)}</span><b>{TF_CONFIG[k]?.label ?? k}</b>
      </button>
      {removable && <button type="button" className="tv-tb" aria-label={`Remove interval ${k}`} title="Remove" onClick={() => { removeCustomInterval(k); bump((n) => n + 1); }}><IconClose width={14} height={14} /></button>}
    </div>
  );
  return (
    <div className="tv-menu tv-menu-tf" role="menu" aria-label="Interval">
      {BUILT_INS.map((k) => row(k))}
      <div className="tv-mhead">More intervals</div>
      <div className="tv-tfgrid">
        {INTERVAL_PRESETS.map((k) => (
          <button type="button" key={k} role="menuitemradio" aria-checked={tf === k} className={`tv-btn${tf === k ? ' on' : ''}`} onClick={() => onPick(k)} title={`${intervalName(k)} — resampled from real ${parseInterval(k)?.base ?? ''} bars`}>{k}</button>
        ))}
      </div>
      {custom.map((k) => row(k, true))}
      <form className="tv-cmp" onSubmit={(e) => {
        e.preventDefault();
        const k = addCustomInterval(draft);
        if (!k) { onError('Custom interval: whole minutes or hours up to 8h, e.g. 3m, 90m, 2h'); return; }
        setDraft(''); onPick(k);
      }}>
        <input className="tv-text-in" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Custom: 3m · 90m · 2h" aria-label="Custom interval" maxLength={12} autoCorrect="off" spellCheck={false} enterKeyHint="go" />
        <button type="submit" className="tv-btn" disabled={!spec}>Add</button>
      </form>
      <small className="tv-msub">{spec ? `${spec.name} from real ${spec.base} bars (OHLC resampled, volume summed)` : 'Built from the feed’s real bars — never interpolated.'}</small>
    </div>
  );
}

/* ───────────────────────── mini toolbar ───────────────────────── */

export function MiniToolbar({ selection, primary, editText, setEditText, onPatch, onDelete, onDuplicate, onAlert, onClear }: {
  selection: Drawing[]; primary: Drawing; editText: string | null; setEditText: (v: string | null) => void;
  onPatch: (p: Partial<Drawing>) => void; onDelete: () => void; onDuplicate: () => void; onAlert: () => void; onClear: () => void;
}) {
  const many = selection.length > 1;
  const allLocked = selection.every((d) => d.locked);
  const anyArea = selection.some((d) => AREA_TOOLS.has(d.tool));
  const pos = !many && (primary.tool === 'long' || primary.tool === 'short') ? positionStats(primary) : null;
  return (
    <div className="tv-float" role="toolbar" aria-label={many ? `${selection.length} drawings selected` : `Selected: ${TOOL_LABEL[primary.tool]}`}>
      <span className="tv-float-name">{many ? `${selection.length} selected` : TOOL_LABEL[primary.tool]}</span>
      <div className="tv-swatches" role="radiogroup" aria-label="Colour">
        {COLOR_ROLES.map((r) => (
          <button type="button" key={r} role="radio" aria-checked={primary.color === r} aria-label={`Colour ${r}`} title={r}
            className={`tv-sw${primary.color === r ? ' on' : ''}`} style={{ background: `var(--tv-${r})` }}
            onClick={() => onPatch({ color: r as ColorRole })} />
        ))}
      </div>
      <div className="tv-widths" role="radiogroup" aria-label="Line width">
        {LINE_WIDTHS.map((w) => (
          <button type="button" key={w} role="radio" aria-checked={primary.width === w} aria-label={`Width ${w}px`} title={`${w}px`} className={`tv-w${primary.width === w ? ' on' : ''}`} onClick={() => onPatch({ width: w })}>
            <i style={{ height: w }} />
          </button>
        ))}
      </div>
      <div className="tv-widths" role="radiogroup" aria-label="Line style">
        {DASH_STYLES.map((ds) => {
          const on = (primary.dash ?? 'solid') === ds;
          return (
            <button type="button" key={ds} role="radio" aria-checked={on} aria-label={`${ds} line`} title={ds} className={`tv-w${on ? ' on' : ''}`} onClick={() => onPatch({ dash: ds === 'solid' ? undefined : (ds as DashStyle) })}>
              <svg width="16" height="6" aria-hidden="true"><line x1="1" y1="3" x2="15" y2="3" stroke="currentColor" strokeWidth="2" strokeDasharray={ds === 'dashed' ? '4 2' : ds === 'dotted' ? '1.5 2' : undefined} strokeLinecap="round" /></svg>
            </button>
          );
        })}
      </div>
      {anyArea && (
        <div className="tv-widths" role="radiogroup" aria-label="Fill opacity">
          {FILL_STEPS.map((f) => {
            const on = Math.abs(fillOf(primary) - f) < 0.01;
            return (
              <button type="button" key={f} role="radio" aria-checked={on} aria-label={`Fill ${Math.round(f * 100)}%`} title={`Fill ${Math.round(f * 100)}%`} className={`tv-w tv-fill${on ? ' on' : ''}`} onClick={() => onPatch({ fill: f })}>
                <i style={{ opacity: Math.max(0.12, f * 3), height: 12 }} />
              </button>
            );
          })}
        </div>
      )}
      {!many && (primary.tool === 'text' || primary.tool === 'pricelabel') && (
        <input
          className="tv-text-in" aria-label={primary.tool === 'text' ? 'Note text' : 'Label text'} value={primary.text ?? ''} maxLength={200}
          placeholder={primary.tool === 'pricelabel' ? 'Label (optional)' : 'Note'}
          autoFocus={editText === primary.id}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onPatch({ text: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { (e.target as HTMLInputElement).blur(); setEditText(null); } }}
        />
      )}
      {!many && primary.tool === 'arrow' && (
        <button type="button" className="tv-tb" aria-label="Flip arrow" title="Flip up / down" onClick={() => onPatch({ dir: primary.dir === 'down' ? 'up' : 'down' })}><IconFlip /></button>
      )}
      {pos && (
        <div className="tv-seg" role="radiogroup" aria-label="Position risk">
          {RISK_PRESETS.map((r) => <button type="button" role="radio" aria-checked={(primary.risk ?? RISK_PRESETS[0]) === r} key={r} className={(primary.risk ?? RISK_PRESETS[0]) === r ? 'on' : ''} title={`Size to $${r} risk`} onClick={() => onPatch({ risk: r })}>${r >= 1000 ? `${r / 1000}k` : r}</button>)}
        </div>
      )}
      {!many && ALERTABLE.has(primary.tool) && (
        <button type="button" className={`tv-tb${primary.alert ? ' on' : ''}`} aria-pressed={!!primary.alert} aria-label={primary.alert ? 'Remove alert' : 'Alert when price crosses (Alt+A)'} title={primary.alert ? 'Alert armed — click to remove' : 'Alert on cross — Alt+A'} onClick={onAlert}><IconBell /></button>
      )}
      <button type="button" className="tv-tb" aria-label={`Duplicate (${MOD}+D)`} title={`Duplicate — ${MOD}+D`} onClick={onDuplicate}><IconDuplicate /></button>
      <button type="button" className="tv-tb" aria-label="Hide" title="Hide (the drawings list shows it again)" onClick={() => { onPatch({ hidden: true }); onClear(); }}><IconEyeOff /></button>
      <button type="button" className={`tv-tb${allLocked ? ' on' : ''}`} aria-pressed={allLocked} aria-label={allLocked ? 'Unlock' : 'Lock'} title={allLocked ? 'Unlock' : 'Lock'} onClick={() => onPatch({ locked: allLocked ? undefined : true })}>{allLocked ? <IconLock /> : <IconUnlock />}</button>
      <button type="button" className="tv-tb" aria-label="Delete (Del)" title="Delete — Del" disabled={allLocked} onClick={onDelete}><IconTrash /></button>
    </div>
  );
}

/* ───────────────────────── drawings panel ───────────────────────── */

const SYNC_TEXT: Record<SyncStatus['state'], string> = { device: 'saved on this device', syncing: 'syncing…', synced: 'synced to your account', offline: 'offline — saved on this device' };

export function DrawingsPanel({ symbol, drawings, selectedIds, sync, signedIn, allHidden, allLocked, onSelect, onPatch, onRemove, onAlert, onToggleAllHidden, onToggleAllLocked, onClose }: {
  symbol: string; drawings: Drawing[]; selectedIds: string[]; sync: SyncStatus; signedIn: boolean; allHidden: boolean; allLocked: boolean;
  onSelect: (id: string, add: boolean) => void; onPatch: (ids: string[], p: Partial<Drawing>) => void; onRemove: (ids: string[]) => void;
  onAlert: (d: Drawing) => void; onToggleAllHidden: () => void; onToggleAllLocked: () => void; onClose: () => void;
}) {
  const ids = drawings.map((d) => d.id);
  const anyHidden = drawings.some((d) => d.hidden);
  return (
    <aside className="tv-side tv-dlist" aria-label={`Drawings on ${symbol}`}>
      <div className="tv-side-head">
        <span>Drawings · {symbol} <b className="tv-dim">{drawings.length}</b></span>
        <button type="button" className="tv-tb" onClick={onClose} aria-label="Close drawings list" title="Close"><IconClose /></button>
      </div>
      <div className="tv-dlist-actions">
        <button type="button" className={`tv-btn${allHidden ? ' on' : ''}`} onClick={onToggleAllHidden} aria-pressed={allHidden}>{allHidden ? 'Show all' : 'Hide all'}</button>
        {anyHidden && <button type="button" className="tv-btn" onClick={() => onPatch(ids, { hidden: undefined })}>Unhide</button>}
        <button type="button" className={`tv-btn${allLocked ? ' on' : ''}`} onClick={onToggleAllLocked} aria-pressed={allLocked}>{allLocked ? 'Unlock all' : 'Lock all'}</button>
        <button type="button" className="tv-btn" disabled={!drawings.length} onClick={() => onRemove(ids)} title="Locked drawings stay; undo brings the rest back">Remove all</button>
      </div>
      <div className="tv-side-body" role="list">
        {drawings.length ? [...drawings].reverse().map((d) => {
          const sel = selectedIds.includes(d.id);
          const st = d.tool === 'long' || d.tool === 'short' ? positionStats(d) : null;
          return (
            <div role="listitem" key={d.id} className={`tv-drow${sel ? ' on' : ''}${d.hidden ? ' tv-drow-hidden' : ''}`}>
              <button type="button" className="tv-drow-main" onClick={(e) => onSelect(d.id, e.shiftKey || e.metaKey || e.ctrlKey)} aria-pressed={sel} title="Select (shift-click to add)">
                <i style={{ background: `var(--tv-${d.color})` }} aria-hidden="true" />
                <span>{describeDrawing(d)}{st?.invalid ? ' · ⚠' : ''}</span>
              </button>
              {ALERTABLE.has(d.tool) && (
                <button type="button" className={`tv-tb${d.alert ? ' on' : ''}`} aria-pressed={!!d.alert} onClick={() => onAlert(d)} aria-label={d.alert ? 'Remove alert' : 'Alert on cross'} title={d.alert ? 'Alert armed — click to remove' : 'Alert on cross'}><IconBell width={15} height={15} /></button>
              )}
              <button type="button" className="tv-tb" onClick={() => onPatch([d.id], { hidden: d.hidden ? undefined : true })} aria-label={d.hidden ? 'Show' : 'Hide'} title={d.hidden ? 'Show' : 'Hide'}>{d.hidden ? <IconEyeOff width={15} height={15} /> : <IconEye width={15} height={15} />}</button>
              <button type="button" className={`tv-tb${d.locked ? ' on' : ''}`} onClick={() => onPatch([d.id], { locked: d.locked ? undefined : true })} aria-label={d.locked ? 'Unlock' : 'Lock'} title={d.locked ? 'Unlock' : 'Lock'}>{d.locked ? <IconLock width={15} height={15} /> : <IconUnlock width={15} height={15} />}</button>
              <button type="button" className="tv-tb" disabled={d.locked} onClick={() => onRemove([d.id])} aria-label="Delete" title="Delete"><IconTrash width={15} height={15} /></button>
            </div>
          );
        }) : <p className="tv-dlist-empty">No drawings on {symbol} yet. Pick a tool on the left (or the pencil on a phone) — drawings stay on this symbol across intervals{signedIn ? ' and devices' : ''}.</p>}
      </div>
      <div className="tv-dlist-foot" role="status">
        <span className={`tv-syncdot tv-sync-${sync.state}`} aria-hidden="true" />
        {signedIn ? SYNC_TEXT[sync.state] : 'saved on this device · sign in to sync'}
      </div>
    </aside>
  );
}

/* ───────────────────────── shortcuts ───────────────────────── */

export const SHORTCUTS: { group: string; rows: [string, string][] }[] = [
  { group: 'Drawing tools', rows: [
    ['Alt+T', 'Trend line'], ['Alt+Y', 'Ray'], ['Alt+E', 'Extended line'], ['Alt+H', 'Horizontal line at the cursor'], ['Alt+J', 'Horizontal ray'],
    ['Alt+V', 'Vertical line'], ['Alt+C', 'Parallel channel'], ['Alt+F', 'Fib retracement'], ['Alt+X', 'Fib extension'], ['Alt+G', 'Rectangle'],
    ['Alt+M', 'Price range (measure)'], ['Alt+L / Alt+K', 'Long / short position'], ['Alt+N', 'Note'], ['Alt+P', 'Price label'], ['Alt+W', 'Arrow'], ['Alt+B', 'Brush'],
  ] },
  { group: 'Selection', rows: [
    ['Click · tap', 'Select a drawing'], ['Shift+click', 'Add to / remove from the selection'], ['Long-press (touch)', 'Select, then drag'],
    [`${MOD}+A`, 'Select all'], [`${MOD}+D`, 'Duplicate'], ['Del / ⌫', 'Delete'], ['Esc', 'Cancel / deselect'], [`${MOD}+Z · ${MOD}+Y`, 'Undo · redo'],
  ] },
  { group: 'Alerts & snapshot', rows: [
    ['Alt+A', 'Alert on the selected line (or the nearest dealer node)'], ['Alt+S', 'Save snapshot'], ['Alt+⇧+S', 'Copy snapshot'],
  ] },
  { group: 'Chart', rows: [
    ['← →', 'Pan'], ['+ −', 'Zoom'], ['Alt+R', 'Reset view'], ['1 … 5', 'Interval 1m · 5m · 15m · 1h · D'], ['?', 'This help'],
  ] },
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <>
      <div className="tv-scrim tv-scrim-dark" onClick={onClose} />
      <div className="tv-help" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" tabIndex={-1} ref={ref} onKeyDown={(e) => { if (e.key === 'Escape' || e.key === '?') { e.stopPropagation(); onClose(); } }}>
        <div className="tv-sheet-head"><b>Keyboard shortcuts</b><button type="button" className="tv-tb" onClick={onClose} aria-label="Close" title="Close"><IconClose /></button></div>
        <div className="tv-help-grid">
          {SHORTCUTS.map((g) => (
            <section key={g.group}>
              <div className="tv-mhead">{g.group}</div>
              <dl className="tv-keys">{g.rows.map(([k, v]) => <Fragment key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></Fragment>)}</dl>
            </section>
          ))}
        </div>
        <p className="tv-sheet-note">Shortcuts work while the pointer is over the chart or the chart has focus.</p>
      </div>
    </>
  );
}
