/**
 * TV CHART — QEChart's full variant (the CHART tab and every expanded chart),
 * laid out like a TradingView chart on lightweight-charts v5:
 *
 *   top bar     symbol · timeframe ▾ · chart type ▾ · Indicators ▾ · panel ·
 *               Replay · undo / redo  ……  settings · snapshot · fullscreen
 *   left bar    drawing tools, magnet, lock all, hide all, remove all, zoom
 *   pane        candles + volume + legend (O H L C chg, volume, active layers)
 *               + dealer levels + GEX / dark-pool / flow layers + drawings
 *   status bar  range presets · live stamp · ET clock · RTH/ETH · % · log · auto
 *
 * Phone: symbol · interval · Indicators · undo · draw · ⋯ More. The left bar
 * folds into the drawing sheet; Indicators and More (chart type, scale,
 * session, redo, replay, snapshot, full screen, layouts) open as bottom
 * sheets; 1-tap interval chips sit in the status bar. Two-point tools are
 * tap-tap (or drag); touch gets finger-sized hit targets.
 *
 * Keyboard (chart focused or hovered): Alt+H horizontal line at the cursor ·
 * Alt+T trend line · Alt+V vertical line · Alt+F Fibonacci · Alt+J horizontal
 * ray · Alt+R reset view · Esc cancel / deselect · Del delete selected ·
 * Ctrl/⌘+Z undo · Ctrl/⌘+Y or ⇧Z redo · ←/→ pan · +/− zoom · 1–5 interval.
 *
 * Data is the same as the compact embed (chart-layers.ts hooks, identical
 * query keys, one live-bus subscription per symbol). Drawings persist per
 * user per symbol via tv/drawing-store.ts.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCandles, chartPalette, TF_CONFIG, type Level } from '@/components/charting/chart-engine';
import { useChartPrefs, setChartPref, type ChartType, type RangeKey, type TfKey } from '@/components/charting/chart-prefs';
import {
  overlaysSupported, useInView, useLiveLast, useDealerMap, useChartOverlays, etClock, etInfo, fmtUsd, ageOf,
  useLevelMap, pickKeyLevels, dealerWallLines,
} from '@/components/charting/chart-layers';
import { canonicalChartSymbol, indexInfo } from '@shared/index-symbols';
import type { QEChartProps } from '@/components/charting/qe-chart';
import type { LiveTick } from '@/lib/live-price-bus';
import { TerminalTickerSearch } from '@/components/terminal/terminal-ticker-search';
import { useVisualMode } from '@/lib/visual-mode';
import { COLOR_ROLES, LINE_WIDTHS, newDrawingId, type ColorRole, type Drawing, type DrawTool, type ToolId } from './drawing-geometry';
import { cleanCompareSymbol } from './indicators';
import { deleteLayout, saveLayout, useChartLayouts, type ChartLayout } from './chart-layouts';
import { useDrawings } from './use-drawings';
import { TvPane, describeLayerHit, type TvPaneHandle } from './tv-pane';
import {
  IconArea, IconArrow, IconBars, IconBrush, IconCamera, IconCandles, IconChannel, IconChevron, IconClose, IconCursor,
  IconEye, IconEyeOff, IconFib, IconFlip, IconFullscreen, IconHLine, IconHRay, IconIndicators, IconLine, IconLock, IconMagnet,
  IconMeasure, IconMore, IconPanel, IconPencil, IconRay, IconRect, IconRedo, IconReplay, IconSettings, IconText, IconTrash,
  IconTrend, IconUndo, IconUnlock, IconVLine, IconZoomIn, IconZoomOut,
} from './tv-icons';
import '@/styles/nexus.css';

const LazyWatchlist = lazy(() => import('@/components/charting/chart-lab-nexus').then((m) => ({ default: m.ChartLabWatchlist })));

const TFS: TfKey[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W'];
/** One-tap interval chips (TradingView's favourites row). */
const TF_CHIPS: TfKey[] = ['1m', '5m', '15m', '1h', '1D'];
/** TradingView's interval shorthand: D / W, so a daily chip never reads like the "1D" range button. */
const CHIP_LABEL: Record<string, string> = { '1D': 'D', '1W': 'W', '4h': '4h', '30m': '30m' };
const INTRADAY = new Set(['1m', '5m', '15m', '30m', '1h', '4h']);
const TF_NAME: Record<string, string> = { '1m': '1 minute', '5m': '5 minutes', '15m': '15 minutes', '30m': '30 minutes', '1h': '1 hour', '4h': '4 hours', '1D': '1 day', '1W': '1 week' };
const NO_LEVELS: (Level & { dashed?: boolean })[] = [];
const NO_ZONES: never[] = [];
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

interface ToolDef { id: DrawTool; label: string; key?: string; Icon: (p: object) => JSX.Element }
const TOOL_GROUPS: ToolDef[][] = [
  [
    { id: 'trend', label: 'Trend line', key: 'Alt+T', Icon: IconTrend },
    { id: 'ray', label: 'Ray', Icon: IconRay },
    { id: 'hline', label: 'Horizontal line', key: 'Alt+H', Icon: IconHLine },
    { id: 'hray', label: 'Horizontal ray', key: 'Alt+J', Icon: IconHRay },
    { id: 'vline', label: 'Vertical line', key: 'Alt+V', Icon: IconVLine },
    { id: 'channel', label: 'Parallel channel', Icon: IconChannel },
  ],
  [
    { id: 'fib', label: 'Fib retracement', key: 'Alt+F', Icon: IconFib },
    { id: 'rect', label: 'Rectangle', Icon: IconRect },
    { id: 'brush', label: 'Brush', Icon: IconBrush },
    { id: 'text', label: 'Text', Icon: IconText },
    { id: 'arrow', label: 'Arrow marker', Icon: IconArrow },
    { id: 'measure', label: 'Price range (measure)', Icon: IconMeasure },
  ],
];
const ALL_TOOLS = TOOL_GROUPS.flat();
const TYPE_DEFS: { id: ChartType; label: string; Icon: (p: object) => JSX.Element }[] = [
  { id: 'candles', label: 'Candles', Icon: IconCandles },
  { id: 'bars', label: 'Bars', Icon: IconBars },
  { id: 'line', label: 'Line', Icon: IconLine },
  { id: 'area', label: 'Area', Icon: IconArea },
];

type Menu = null | 'tf' | 'type' | 'ind' | 'settings' | 'draw';
type Notice = { text: string; href?: string; file?: string } | null;

export function TvChart({
  symbol: rawSymbol,
  fill = false,
  initialTf,
  tf: controlledTf,
  onTfChange,
  levels = NO_LEVELS,
  zones = NO_ZONES,
  live = true,
  onSymbolChange,
  onOpenLab,
  onOpenChartPage,
}: QEChartProps) {
  // $SPX / ^GSPC / SPXW → SPX (shared/index-symbols.ts): one name for bars, layers and drawings.
  const symbol = canonicalChartSymbol(rawSymbol);
  const idx = indexInfo(symbol);
  const prefs = useChartPrefs();
  const set = setChartPref;
  const { user } = useAuth();
  const userId = (user as { id?: string } | null | undefined)?.id ?? 'anon';

  /* timeframe ownership: controlled prop › this chart (initialTf) › the CHART page's */
  const ownsTf = initialTf != null;
  const [localTf, setLocalTf] = useState<TfKey>(() => (initialTf && TF_CONFIG[initialTf] ? initialTf : prefs.tf));
  const tf: TfKey = controlledTf && TF_CONFIG[controlledTf] ? controlledTf : ownsTf ? localTf : prefs.tf;
  const setTf = useCallback((next: TfKey) => {
    if (controlledTf == null && ownsTf) setLocalTf(next);
    if (controlledTf == null && !ownsTf) setChartPref('tf', next);
    onTfChange?.(next);
  }, [controlledTf, ownsTf, onTfChange]);
  const tfLabel = TF_CONFIG[tf]?.label ?? tf;
  const intraday = INTRADAY.has(tf);
  const { range, extended } = prefs;

  const [rootRef, inView] = useInView<HTMLDivElement>();
  const paneRef = useRef<TvPaneHandle>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [tool, setTool] = useState<ToolId>('cursor');
  const [stayDrawing, setStayDrawing] = useState(false);
  const [allHidden, setAllHidden] = useState(false);
  const [allLocked, setAllLocked] = useState(false);
  const [editText, setEditText] = useState<string | null>(null);
  const [nativeFull, setNativeFull] = useState(false);
  // iPhone Safari (and embedded webviews) have no element fullscreen: the chart
  // then covers the viewport itself.
  const [pseudoFull, setPseudoFull] = useState(false);
  const isFull = nativeFull || pseudoFull;
  const [notice, setNotice] = useState<Notice>(null);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), notice.href ? 12_000 : 3_500);
    return () => clearTimeout(id);
  }, [notice]);
  const [visualMode] = useVisualMode();

  const { data: series, isError: candlesError, isLoading: candlesLoading } = useCandles(symbol, tf, inView);

  /* ── compare: a second symbol as a % line (the scale switches to percent) ── */
  const [cmpSym, setCmpSym] = useState<string | null>(null);
  const [cmpDraft, setCmpDraft] = useState('');
  const cmpOn = !!cmpSym && cmpSym !== symbol;
  const cmpQ = useCandles(cmpOn ? cmpSym! : symbol, tf, inView && cmpOn);
  const compare = useMemo(() => (cmpOn && cmpQ.data?.bars.length ? { symbol: cmpSym!, bars: cmpQ.data.bars } : null), [cmpOn, cmpSym, cmpQ.data]);
  const addCompare = () => { const c = cleanCompareSymbol(cmpDraft); if (c && c !== symbol) { setCmpSym(c); setCmpDraft(''); } };
  const scale = cmpOn ? 'pct' : prefs.scale;

  /* ── dealer walls + zero-γ ── */
  const dealerQ = useDealerMap(symbol, true, inView);
  const snap = dealerQ.data?.snapshot;
  const zeroGamma = snap ? (snap.zeroGammaLevel ?? snap.gammaFlipPrice ?? null) : null;
  const dealerAsOf = dealerQ.data ? (dealerQ.data.cached ? dealerQ.data.cachedAt : dealerQ.data.generatedAt) ?? null : null;
  const dealerSource = snap?.source ?? dealerQ.data?.optionsSource ?? 'chain';
  // 0–7d walls first (byDte.next7); all-expiry walls dashed + labelled "all"
  // where they differ — SPX's all-expiry walls sit on far round strikes.
  const walls = useMemo(() => dealerWallLines(snap as Parameters<typeof dealerWallLines>[0]), [snap]);
  const levelQ = useLevelMap(symbol, prefs.keyLevels, inView);
  const keyLevels = useMemo(() => (prefs.keyLevels ? pickKeyLevels(levelQ.data) : []), [prefs.keyLevels, levelQ.data]);
  const allLevels = useMemo(() => {
    const rows: (Level & { dashed?: boolean })[] = [...(prefs.walls ? walls.rows : []), ...keyLevels.map(({ source: _s, ...l }) => l)];
    if (!rows.length) return levels;
    // A caller may already pass the walls (research page): one line per price.
    const fresh = rows.filter((r) => !levels.some((l) => Math.abs(l.price - r.price) < 1e-6));
    return fresh.length ? [...levels, ...fresh] : levels;
  }, [prefs.walls, walls, keyLevels, levels]);

  /* ── expected move: 1σ one-session move from 20-day realized vol ── */
  const { data: daily } = useCandles(symbol, '1D', inView);
  const expectedMove = useMemo(() => {
    const closes = daily?.bars.slice(-21).map((b) => b.close) ?? [];
    if (closes.length < 21) return null;
    const rets = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
    const spot = closes[closes.length - 1];
    return { dollars: spot * sd, pct: sd * 100 };
  }, [daily]);

  /* ── replay (bars cut at a cursor that steps forward) ── */
  const histBars = series?.bars;
  const sessionBars = useMemo(() => {
    const b = histBars ?? [];
    return intraday && !extended ? b.filter((x) => { const m = etInfo(x.time).mins; return m >= 570 && m < 960; }) : b;
  }, [histBars, intraday, extended]);
  const [replay, setReplay] = useState<{ on: boolean; idx: number; playing: boolean; speed: number }>({ on: false, idx: 0, playing: false, speed: 1 });
  useEffect(() => { setReplay((r) => ({ ...r, on: false, playing: false })); }, [symbol, tf, extended]);
  useEffect(() => {
    if (!replay.on || !replay.playing) return;
    const id = setInterval(() => {
      setReplay((r) => {
        const next = Math.min(sessionBars.length - 1, r.idx + r.speed);
        return { ...r, idx: next, playing: next < sessionBars.length - 1 };
      });
    }, 300);
    return () => clearInterval(id);
  }, [replay.on, replay.playing, sessionBars.length]);
  const cutoff = replay.on && sessionBars.length ? sessionBars[Math.min(replay.idx, sessionBars.length - 1)].time : null;

  /* ── overlays ── */
  const lastClose = histBars?.length ? histBars[histBars.length - 1].close : null;
  const lastCloseRef = useRef<number | null>(lastClose);
  lastCloseRef.current = lastClose;
  const ovRange = range === '1D' && intraday ? '1D' : '5D';
  const layersOk = overlaysSupported(symbol);
  const wantLayers = layersOk && (prefs.gex !== 'off' || prefs.dp || prefs.flow);
  const { data: ov, isError: ovError, isLoading: ovLoading } = useChartOverlays(symbol, ovRange, wantLayers, inView, lastCloseRef);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!inView) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [inView]);
  const liveOn = live && inView && !replay.on;
  const liveTick = useLiveLast(symbol, liveOn);

  const gexRead = useMemo(() => {
    if (!ov) return null;
    if (cutoff == null) {
      if (!ov.gexNow) return null;
      return { net: ov.gexNow.net, top: ov.gexNow.topStrikes, asOf: ov.gexNow.asOf, source: ov.gexNow.source };
    }
    const sample = [...ov.gexTimeline.samples].reverse().find((s) => s.t <= cutoff);
    if (!sample) return null;
    const top = ov.gexTimeline.series
      .map((s) => ({ strike: s.strike, gex: s.points.find((p) => p[0] === sample.t)?.[1] }))
      .filter((x): x is { strike: number; gex: number } => x.gex != null)
      .sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex)).slice(0, 5);
    return { net: sample.net, top, asOf: new Date(sample.t).toISOString(), source: sample.source };
  }, [ov, cutoff]);

  /* Why no orbs are on screen, said plainly instead of an empty chart:
     nothing recorded yet, or the newest recording is an earlier session than
     the 1D view (pre-market / before the recorder's 09:00 ET start). */
  const orbStatus = useMemo((): { text: string; show?: [number, number] } | null => {
    if (prefs.gex !== 'bubbles' || !layersOk || !ov || cutoff != null) return null;
    const tl = ov.gexTimeline;
    const cadence = tl.sampleEveryMin || 5;
    const nowEt = etInfo(now);
    const dow = new Date(`${nowEt.date}T12:00:00Z`).getUTCDay();
    const inWindow = dow >= 1 && dow <= 5 && nowEt.mins >= 9 * 60 && nowEt.mins <= 16 * 60 + 30;
    if (!tl.samples.length) {
      const since = Date.parse(tl.recorderLastRun ?? ov.generatedAt);
      return inWindow
        ? { text: `GEX orbs: recording since ${etClock(since)} ET — first orbs in ~${cadence}m` }
        : { text: `GEX orbs: none recorded yet — samples every ${cadence}m, 09:00–16:30 ET weekdays` };
    }
    const bars = sessionBars;
    if (!intraday || range !== '1D' || bars.length < 2) return null;
    const last = tl.samples[tl.samples.length - 1];
    const lastDate = etInfo(last.t).date;
    if (lastDate === etInfo(bars[bars.length - 1].time).date) return null;
    if (last.t < bars[0].time) return null;
    const first = tl.samples.find((x) => etInfo(x.t).date === lastDate) ?? last;
    const day = new Date(last.t).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: '2-digit', day: '2-digit' });
    return {
      text: `GEX orbs: last recorded ${day} ${etClock(first.t)}–${etClock(last.t)} ET${inWindow ? ` — next in ~${cadence}m` : ' — today\'s start 09:00 ET'}`,
      show: [first.t, last.t],
    };
  }, [prefs.gex, layersOk, ov, cutoff, now, intraday, range, sessionBars]);

  const layers = useMemo(() => ({
    ov: ov ?? null, gex: prefs.gex, dp: prefs.dp, flow: prefs.flow,
    gexTop: gexRead?.top ?? null, gexTopAsOf: gexRead ? Date.parse(gexRead.asOf) : null,
  }), [ov, prefs.gex, prefs.dp, prefs.flow, gexRead]);

  const tk = useMemo(() => {
    const pal = chartPalette(rootRef.current);
    return { pos: pal.accent, neg: pal.loss, dp: pal.caution, call: pal.call, put: pal.put, mute: pal.dim };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, now, visualMode]);
  const describeLayer = useCallback((hit: Parameters<typeof describeLayerHit>[0]) => describeLayerHit(hit, tk), [tk]);

  /* ── drawings ── */
  const dr = useDrawings(userId, symbol);
  const selected = dr.selectedId ? dr.drawings.find((d) => d.id === dr.selectedId) ?? null : null;
  const updateSelected = useCallback((patch: Partial<Drawing>) => {
    if (!selected) return;
    dr.commit(dr.drawings.map((d) => (d.id === selected.id ? { ...d, ...patch } : d)));
  }, [selected, dr]);
  const deleteSelected = useCallback(() => {
    if (!selected || selected.locked) return false;
    dr.commit(dr.drawings.filter((d) => d.id !== selected.id));
    dr.setSelectedId(null);
    return true;
  }, [selected, dr]);
  const onCommit = useCallback((next: Drawing[], select?: string | null) => {
    dr.commit(next);
    if (select !== undefined) dr.setSelectedId(select);
  }, [dr]);
  const onToolDone = useCallback((placed: Drawing) => {
    if (placed.tool === 'text') setEditText(placed.id);
    if (!stayDrawing) setTool('cursor');
  }, [stayDrawing]);
  const pickTool = useCallback((t: ToolId) => {
    setTool((cur) => (cur === t && t !== 'cursor' ? 'cursor' : t));
    dr.setSelectedId(null);
    setMenu(null);
  }, [dr]);
  const placeHLineAtCursor = useCallback(() => {
    const a = paneRef.current?.pointerAnchor();
    if (!a) { pickTool('hline'); return; }
    const d: Drawing = { id: newDrawingId(), tool: 'hline', pts: [a], color: 'caution', width: 1 };
    dr.commit([...dr.drawings, d]);
    dr.setSelectedId(d.id);
  }, [dr, pickTool]);

  /* ── keyboard ── */
  const hoverRef = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'TEXTAREA' || target.isContentEditable
        || (target.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes((target as HTMLInputElement).type)));
      if (typing) return; // text fields keep their keys (Esc included)
      const focused = root.contains(document.activeElement);
      if (!focused && !hoverRef.current) return;
      const mod = e.metaKey || e.ctrlKey;
      let used = true;
      if (e.altKey && !mod) {
        switch (e.code) {
          case 'KeyH': placeHLineAtCursor(); break;
          case 'KeyT': pickTool('trend'); break;
          case 'KeyV': pickTool('vline'); break;
          case 'KeyF': pickTool('fib'); break;
          case 'KeyJ': pickTool('hray'); break;
          case 'KeyR': paneRef.current?.reset(); break;
          default: used = false;
        }
      } else if (mod && (e.key === 'z' || e.key === 'Z')) {
        if (e.shiftKey) dr.redo(); else dr.undo();
      } else if (mod && (e.key === 'y' || e.key === 'Y')) {
        dr.redo();
      } else if (!mod && e.key === 'Escape') {
        if (paneRef.current?.cancelDraft()) { /* draft dropped */ }
        else if (menu) setMenu(null);
        else if (tool !== 'cursor') setTool('cursor');
        else if (pseudoFull) setPseudoFull(false);
        else if (dr.selectedId) dr.setSelectedId(null);
        else used = false; // let the expanded modal close
      } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        used = deleteSelected();
      } else if (!mod && !e.altKey && e.key === 'ArrowLeft') {
        paneRef.current?.pan(-1);
      } else if (!mod && !e.altKey && e.key === 'ArrowRight') {
        paneRef.current?.pan(1);
      } else if (!mod && !e.altKey && !e.shiftKey && /^[1-5]$/.test(e.key)) {
        setTf(TF_CHIPS[Number(e.key) - 1]);
      } else if (!mod && (e.key === '+' || e.key === '=')) {
        paneRef.current?.zoom(1);
      } else if (!mod && (e.key === '-' || e.key === '_')) {
        paneRef.current?.zoom(-1);
      } else used = false;
      if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dr, menu, tool, deleteSelected, pickTool, placeHLineAtCursor, rootRef, pseudoFull, setTf]);

  /* ── snapshot / fullscreen ── */
  /* Snapshot: a data-URL <a download> does nothing in iOS home-screen apps and
     in-app browsers. Phones and tablets get the share sheet (Save Image /
     Files / Messages); elsewhere a blob download, and when even that cannot
     save, the image opens in a new tab to long-press / right-click save. */
  const snapshot = useCallback(async () => {
    const canvas = paneRef.current?.screenshot();
    if (!canvas) return;
    const name = `${symbol}-${tf}-${new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '')}.png`;
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
    if (!blob) { setNotice({ text: 'Snapshot failed — the chart could not be captured' }); return; }
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    if (coarse && typeof File !== 'undefined' && nav.share) {
      const file = new File([blob], name, { type: 'image/png' });
      if (nav.canShare?.({ files: [file] })) {
        try { await nav.share({ files: [file], title: `${symbol} ${tfLabel}` }); setNotice({ text: 'Snapshot ready to save or send' }); return; }
        catch (e) { if ((e as Error)?.name === 'AbortError') return; /* fall through to a download */ }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setNotice({ text: `Snapshot saved — ${name}`, href: url, file: name });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, [symbol, tf, tfLabel]);
  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const on = () => setNativeFull((doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null) === rootRef.current);
    document.addEventListener('fullscreenchange', on);
    document.addEventListener('webkitfullscreenchange', on);
    return () => { document.removeEventListener('fullscreenchange', on); document.removeEventListener('webkitfullscreenchange', on); };
  }, [rootRef]);
  const toggleFull = useCallback(() => {
    const el = rootRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
    if (!el) return;
    setMenu(null);
    if (pseudoFull) { setPseudoFull(false); return; }
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => {}); else doc.webkitExitFullscreen?.();
      return;
    }
    const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
    if (!req || document.fullscreenEnabled === false) { setPseudoFull(true); return; }
    try {
      const r = req();
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => setPseudoFull(true));
    } catch { setPseudoFull(true); }
  }, [rootRef, pseudoFull]);

  /* ── legend extras: active layers, like TV's indicator rows ── */
  const legendRow = (key: string, label: ReactNode, body: ReactNode, onHide?: () => void) => (
    <div className="tv-leg-row tv-leg-ind" key={key}>
      <span className="tv-leg-name">{label}</span>
      <span className="tv-leg-vals">{body}</span>
      {onHide && (
        <button type="button" className="tv-leg-x" onClick={onHide} aria-label={`Remove ${typeof label === 'string' ? label : 'layer'}`} title="Remove from chart">
          <IconClose width={12} height={12} />
        </button>
      )}
    </div>
  );
  const dealerPending = dealerQ.isFetching && !snap;
  const legendExtras = (
    <>
      {prefs.walls && layersOk && legendRow('walls', 'Walls · 0γ', snap ? (
        <>
          {walls.rows.filter((r) => !r.dashed).map((r) => (
            <span key={r.label} style={{ color: r.color === 'call' ? tk.call : r.color === 'put' ? tk.put : tk.dp }}>
              {r.label.startsWith('CALL') ? 'CW' : r.label.startsWith('PUT') ? 'PW' : '0γ'} {r.price.toFixed(2)}
            </span>
          ))}
          {zeroGamma == null && <span style={{ color: tk.dp }}>0γ —</span>}
          <span className="tv-dim">{walls.basis} · {dealerSource} · {ageOf(dealerAsOf, now)} old</span>
        </>
      ) : <span className="tv-dim">{dealerPending ? 'reading the chain…' : dealerQ.isError ? 'dealer map unavailable' : '—'}</span>, () => set('walls', false))}
      {prefs.gex !== 'off' && layersOk && legendRow('gex', prefs.gex === 'bubbles' ? 'GEX orbs' : 'GEX lines', gexRead ? (
        <>
          <span>Net <b style={{ color: gexRead.net >= 0 ? tk.pos : tk.neg }}>{fmtUsd(gexRead.net, true)}</b></span>
          {gexRead.top.slice(0, 3).map((s) => <span key={s.strike}>{s.strike.toFixed(2)} <b style={{ color: s.gex >= 0 ? tk.pos : tk.neg }}>{fmtUsd(s.gex, true)}</b></span>)}
          <span className="tv-dim" title={ov?.gexTimeline.expiryScope}>{cutoff != null ? 'at cursor' : `${ageOf(gexRead.asOf, now)} ago`} · {gexRead.source} · all expiries</span>
        </>
      ) : <span className="tv-dim">{ovLoading ? 'loading…' : ovError ? 'overlay feed unavailable' : 'no GEX snapshot for this symbol yet'}</span>, () => set('gex', 'off'))}
      {orbStatus && (
        <div className="tv-leg-row tv-leg-ind" key="orb-status">
          <span className="tv-orb-chip" role="status">
            {orbStatus.text}
            {orbStatus.show && <button type="button" onClick={() => paneRef.current?.showTime(orbStatus.show![0], orbStatus.show![1])} title="Scroll the chart to the recorded GEX orbs">Show</button>}
          </span>
        </div>
      )}
      {prefs.dp && layersOk && legendRow('dp', 'Dark pool', ov
        ? <span className="tv-dim">{ov.darkPool.levels.length ? `${ov.darkPool.levels.length} levels near price` : 'none near price'}{ov.darkPool.asOf ? ` · ${ageOf(ov.darkPool.asOf, now)} old` : ''}</span>
        : <span className="tv-dim">{ovError ? 'feed unavailable' : 'loading…'}</span>, () => set('dp', false))}
      {prefs.flow && layersOk && legendRow('flow', 'Options flow', ov
        ? <span className="tv-dim">{ov.flow.prints.length} prints · stream {ov.flow.streamState} · calls ● above, puts ◆ below</span>
        : <span className="tv-dim">{ovError ? 'feed unavailable' : 'loading…'}</span>, () => set('flow', false))}
      {prefs.ma && legendRow('ma', 'MA', <><span style={{ color: 'var(--tv-accent)' }}>20</span><span style={{ color: 'var(--tv-caution)' }}>50</span></>, () => set('ma', false))}
      {prefs.ema && legendRow('ema', 'EMA', <><span style={{ color: 'var(--tv-info)' }}>9</span><span style={{ color: 'var(--tv-marker)' }}>21</span></>, () => set('ema', false))}
      {prefs.vwap && legendRow('vwap', 'VWAP', intraday ? <span style={{ color: 'var(--tv-text)' }}>session · ET</span> : <span className="tv-dim">intraday timeframes only</span>, () => set('vwap', false))}
      {prefs.keyLevels && legendRow('keylv', 'Key levels', keyLevels.length
        ? <span className="tv-dim" title={keyLevels.map((l) => `${l.label} ${l.price.toFixed(2)} — ${l.source}`).join('\n')}>{keyLevels.map((l) => l.label).join(' · ')}{levelQ.data?.asOf ? ` · ${ageOf(levelQ.data.asOf, now)} old` : ''}</span>
        : <span className="tv-dim">{levelQ.isLoading ? 'loading…' : levelQ.isError ? 'level map unavailable' : 'none computed yet'}</span>, () => set('keyLevels', false))}
      {idx && series?.meta?.volume && prefs.fullVolume && legendRow('idxvol', 'Volume', <span className="tv-dim">{series.meta.volume.note}</span>)}
      {idx && intraday && extended && series?.meta?.extended && legendRow('idxeth', 'ETH proxy', (
        <span className="tv-dim" title={`${series.meta.extended.note}\n${series.meta.extended.basis}`}>
          {series.meta.extended.count ? `${series.meta.extended.source}${series.meta.extended.lastAt ? ` · last ${ageOf(series.meta.extended.lastAt, now)} ago` : ''}` : series.meta.extended.note}
        </span>
      ), () => set('extended', false))}
      {idx?.ownExtendedSession && intraday && series?.meta?.session?.note && legendRow('idxsess', 'Session', <span className="tv-dim">{series.meta.session.note}</span>)}
      {cmpOn && legendRow('cmp', `vs ${cmpSym}`, <span className="tv-dim">{cmpQ.isError ? `no history for ${cmpSym}` : cmpQ.isLoading ? 'loading…' : '% from the first visible bar'}</span>, () => setCmpSym(null))}
      {expectedMove && legendRow('em', 'EM 1σ', <span title="Expected move for one session from 20-day realized volatility of daily closes — measured, not option-implied">±{expectedMove.dollars.toFixed(2)} (±{expectedMove.pct.toFixed(2)}%) <span className="tv-dim">20d realized</span></span>)}
      {candlesError && <div className="tv-leg-row tv-warn">Price history unavailable for {symbol} {tfLabel}</div>}
      {candlesLoading && <div className="tv-leg-row tv-dim">loading {symbol} {tfLabel}…</div>}
    </>
  );

  /* ── menus ── */
  const toggleMenu = (m: Menu) => setMenu((cur) => (cur === m ? null : m));
  const menuRow = (checked: boolean, onChange: (v: boolean) => void, label: string, sub: string | null, swatch?: string) => (
    <label className="tv-mrow">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="tv-mlabel"><span>{swatch && <i style={{ background: swatch }} />}{label}</span>{sub && <small>{sub}</small>}</span>
    </label>
  );
  const gexSamples = ov?.gexTimeline.samples.length ?? 0;
  const orbSub = !layersOk ? 'no options layers for this symbol' : ov
    ? (gexSamples ? `${gexSamples} sample${gexSamples === 1 ? '' : 's'} since ${etClock(Date.parse(ov.gexTimeline.recordingSince!))} ET · every ${ov.gexTimeline.sampleEveryMin}m` : 'not recorded yet — starts now it is charted')
    : 'net gamma by strike through time';
  const wallsSub = !layersOk ? 'no options chain for this symbol' : dealerQ.data ? `${dealerSource} · ${ageOf(dealerAsOf, now)} old` : dealerQ.isError ? 'dealer map unavailable' : 'call wall · put wall · zero-γ';
  const applyLayout = (l: ChartLayout) => {
    for (const [k, v] of Object.entries(l.prefs) as [keyof typeof l.prefs, never][]) {
      if (k === 'tf') setTf(v); else set(k, v);
    }
    setNotice({ text: `Layout “${l.name}” applied` });
  };
  const startReplay = () => {
    setMenu(null);
    setReplay((r) => (r.on ? { ...r, on: false, playing: false } : { on: true, idx: Math.min(sessionBars.length - 1, Math.max(1, Math.floor(sessionBars.length * 0.75))), playing: false, speed: r.speed }));
  };

  const indicatorsMenu = (
    <div className="tv-menu tv-menu-ind" role="menu" aria-label="Indicators and layers">
      <div className="tv-mhead">Dealer positioning</div>
      {menuRow(prefs.walls, (v) => set('walls', v), 'Walls + zero-γ', wallsSub, tk.call)}
      {menuRow(prefs.gex === 'bubbles', (v) => set('gex', v ? 'bubbles' : 'off'), 'GEX orbs through time', orbSub, tk.pos)}
      {menuRow(prefs.gex === 'lines', (v) => set('gex', v ? 'lines' : 'off'), 'GEX top strikes (lines)', gexRead ? `snapshot ${ageOf(gexRead.asOf, now)} old` : null, tk.neg)}
      <div className="tv-mhead">Tape</div>
      {menuRow(prefs.dp, (v) => set('dp', v), 'Dark-pool levels', layersOk ? 'Bullflow dark-pool prints, multi-day' : 'no options layers for this symbol', tk.dp)}
      {menuRow(prefs.flow, (v) => set('flow', v), 'Options flow prints', layersOk ? 'calls ● above · puts ◆ below' : 'no options layers for this symbol', tk.call)}
      <div className="tv-mhead">Indicators</div>
      {menuRow(prefs.fullVolume, (v) => set('fullVolume', v), 'Volume', null)}
      {menuRow(prefs.vwap, (v) => set('vwap', v), 'VWAP (session)', intraday ? 'resets each ET session' : 'intraday timeframes only')}
      {menuRow(prefs.keyLevels, (v) => set('keyLevels', v), 'Key levels', idx?.extendedProxy ? 'PDH/PDL/PDC · ORB 15m · overnight H/L (ES-based)' : 'PDH/PDL/PDC · ORB 15m · pre-market H/L')}
      {menuRow(prefs.ema, (v) => set('ema', v), 'EMA 9 / 21', null)}
      {menuRow(prefs.ma, (v) => set('ma', v), 'MA 20 / 50', null)}
      <div className="tv-mhead">Compare</div>
      <form className="tv-cmp" onSubmit={(e) => { e.preventDefault(); addCompare(); }}>
        <input
          className="tv-text-in" value={cmpDraft} onChange={(e) => setCmpDraft(e.target.value.toUpperCase())}
          placeholder={cmpOn ? `vs ${cmpSym} — replace…` : 'Symbol, e.g. QQQ'} aria-label="Compare with symbol" maxLength={15}
          autoCapitalize="characters" autoCorrect="off" spellCheck={false} enterKeyHint="go"
        />
        <button type="submit" className="tv-btn" disabled={!cleanCompareSymbol(cmpDraft) || cleanCompareSymbol(cmpDraft) === symbol}>Add</button>
        {cmpOn && <button type="button" className="tv-btn" onClick={() => setCmpSym(null)} aria-label={`Remove ${cmpSym} comparison`}>Remove</button>}
      </form>
      <small className="tv-msub">Percent scale while a comparison shows</small>
      <div className="tv-mhead">Session</div>
      {menuRow(extended, (v) => set('extended', v), 'Extended hours (ETH)', intraday ? null : 'intraday timeframes only')}
      {onSymbolChange && (<><div className="tv-mhead">Panels</div>{menuRow(prefs.watchlist, (v) => set('watchlist', v), 'Watchlist panel', 'click a name to chart it')}</>)}
    </div>
  );

  const settingsMenu = (
    <div className="tv-menu tv-menu-right" role="menu" aria-label="Chart settings">
      <div className="tv-mactions tv-phone-only tv-mactions-top">
        <button type="button" className="tv-btn" disabled={!dr.canRedo} onClick={() => dr.redo()}>Redo</button>
        <button type="button" className={`tv-btn${replay.on ? ' on' : ''}`} disabled={sessionBars.length < 3} onClick={startReplay}>{replay.on ? 'Exit replay' : 'Replay'}</button>
        <button type="button" className="tv-btn" onClick={() => { setMenu(null); void snapshot(); }}>Snapshot</button>
        <button type="button" className={`tv-btn${isFull ? ' on' : ''}`} onClick={toggleFull}>{isFull ? 'Exit full screen' : 'Full screen'}</button>
      </div>
      <div className="tv-mhead tv-phone-only">Chart type</div>
      <div className="tv-seg tv-phone-only" role="group" aria-label="Chart type">
        {TYPE_DEFS.map((t) => (
          <button type="button" key={t.id} className={prefs.type === t.id ? 'on' : ''} aria-pressed={prefs.type === t.id} onClick={() => set('type', t.id)}>{t.label}</button>
        ))}
      </div>
      <div className="tv-mhead">Price scale</div>
      <div className="tv-seg" role="group" aria-label="Price scale mode">
        {([['normal', 'Linear'], ['log', 'Log'], ['pct', 'Percent']] as const).map(([k, l]) => (
          <button type="button" key={k} className={scale === k ? 'on' : ''} aria-pressed={scale === k} disabled={cmpOn && k !== 'pct'} title={cmpOn ? 'Percent while a comparison shows' : undefined} onClick={() => set('scale', k)}>{l}</button>
        ))}
      </div>
      <div className="tv-mhead tv-phone-only">Session</div>
      <div className={`tv-seg tv-phone-only${intraday ? '' : ' tv-na'}`} role="group" aria-label="Session hours">
        <button type="button" className={!extended ? 'on' : ''} aria-pressed={!extended} disabled={!intraday} onClick={() => set('extended', false)}>RTH</button>
        <button type="button" className={extended ? 'on' : ''} aria-pressed={extended} disabled={!intraday} onClick={() => set('extended', true)}>ETH</button>
      </div>
      {menuRow(prefs.magnet, (v) => set('magnet', v), 'Magnet', 'crosshair and drawing points snap to O/H/L/C')}
      {menuRow(stayDrawing, setStayDrawing, 'Stay in drawing mode', 'keep the tool after placing a drawing')}
      <LayoutsSection prefs={{ ...prefs, tf }} onApply={applyLayout} />
      <div className="tv-mactions">
        <button type="button" className="tv-btn" onClick={() => { setMenu(null); paneRef.current?.reset(); }} title="Reset chart view (Alt+R)">Reset view</button>
        {onOpenChartPage && <button type="button" className="tv-btn" onClick={onOpenChartPage} title="Open this symbol and timeframe on the CHART tab">Chart page ↗</button>}
        {onOpenLab && <button type="button" className="tv-btn" onClick={onOpenLab} title="Chart Lab: published levels, watchlist, ES translation">Chart Lab ↗</button>}
      </div>
      <div className="tv-mhead tv-desk">Shortcuts</div>
      <dl className="tv-keys tv-desk">
        <dt>Alt+H</dt><dd>Horizontal line at cursor</dd>
        <dt>Alt+T / V / F / J</dt><dd>Trend · vertical · Fib · h-ray</dd>
        <dt>Esc</dt><dd>Cancel / deselect</dd>
        <dt>Del</dt><dd>Delete selected drawing</dd>
        <dt>{MOD}+Z / {MOD}+Y</dt><dd>Undo / redo</dd>
        <dt>← → · + −</dt><dd>Pan · zoom</dd>
        <dt>Alt+R</dt><dd>Reset view</dd>
        <dt>1 … 5</dt><dd>Interval {TF_CHIPS.join(' · ')}</dd>
      </dl>
    </div>
  );

  const toolButton = (t: ToolDef, extra = '') => (
    <button
      type="button" key={t.id}
      className={`tv-tool${tool === t.id ? ' on' : ''}${extra}`}
      aria-pressed={tool === t.id}
      aria-label={`${t.label}${t.key ? ` (${t.key})` : ''}`}
      title={`${t.label}${t.key ? ` — ${t.key}` : ''}`}
      onClick={() => pickTool(t.id)}
    >
      <t.Icon /><span className="tv-tool-name">{t.label}</span>
    </button>
  );
  const utilButtons = (
    <>
      <button type="button" className={`tv-tool${prefs.magnet ? ' on' : ''}`} aria-pressed={prefs.magnet} aria-label="Magnet mode" title="Magnet — snap to O/H/L/C" onClick={() => set('magnet', !prefs.magnet)}><IconMagnet /><span className="tv-tool-name">Magnet</span></button>
      <button type="button" className={`tv-tool${allLocked ? ' on' : ''}`} aria-pressed={allLocked} aria-label="Lock all drawings" title="Lock all drawings" onClick={() => setAllLocked((v) => !v)}>{allLocked ? <IconLock /> : <IconUnlock />}<span className="tv-tool-name">Lock all</span></button>
      <button type="button" className={`tv-tool${allHidden ? ' on' : ''}`} aria-pressed={allHidden} aria-label="Hide all drawings" title="Hide all drawings" onClick={() => setAllHidden((v) => !v)}>{allHidden ? <IconEyeOff /> : <IconEye />}<span className="tv-tool-name">Hide all</span></button>
      <button type="button" className="tv-tool" aria-label="Remove all drawings" title="Remove all drawings (undo brings them back)" disabled={!dr.drawings.length} onClick={() => { dr.commit([]); dr.setSelectedId(null); }}><IconTrash /><span className="tv-tool-name">Remove all</span></button>
    </>
  );

  const tfChips = (where: string) => (
    <div className={`tv-seg tv-tfchips ${where}`} role="group" aria-label="Interval">
      {(TF_CHIPS.includes(tf) ? TF_CHIPS : [...TF_CHIPS, tf]).map((k) => (
        <button type="button" key={k} className={tf === k ? 'on' : ''} aria-pressed={tf === k} onClick={() => setTf(k)} aria-label={`Interval ${TF_NAME[k] ?? k}`} title={TF_NAME[k] ?? k}>{CHIP_LABEL[k] ?? k}</button>
      ))}
    </div>
  );

  /* ── status bar clock (own 1 s timer, isolated) ── */
  const layout = (
    <div
      ref={rootRef}
      className={`tv-root${fill ? ' tv-fill' : ''}${isFull ? ' tv-full' : ''}${pseudoFull ? ' tv-pseudo-full' : ''}${menu && menu !== 'draw' ? ' tv-menu-open' : ''}`}
      onPointerEnter={() => { hoverRef.current = true; }}
      onPointerLeave={() => { hoverRef.current = false; }}
    >
      <style>{TV_CSS}</style>

      {/* ── top toolbar ── */}
      <div className="tv-top" role="toolbar" aria-label="Chart toolbar">
        {onSymbolChange ? (
          <div className="tv-sym"><TerminalTickerSearch compact value={symbol} onSelect={(r) => onSymbolChange(r.symbol, r.name)} /></div>
        ) : <b className="tv-symlabel">{symbol}</b>}
        <span className="tv-sep" />
        <div className="tv-pop">
          <button type="button" className={`tv-tb tv-tf${menu === 'tf' ? ' on' : ''}`} onClick={() => toggleMenu('tf')} aria-haspopup="menu" aria-expanded={menu === 'tf'} aria-label={`Timeframe: ${TF_NAME[tf] ?? tf}`} title="Timeframe">
            <b>{tfLabel}</b><IconChevron />
          </button>
          {menu === 'tf' && (
            <div className="tv-menu tv-menu-tf" role="menu" aria-label="Timeframe">
              {TFS.map((k) => (
                <button type="button" role="menuitemradio" aria-checked={tf === k} key={k} className={`tv-mitem${tf === k ? ' on' : ''}`} onClick={() => { setTf(k); setMenu(null); }}>
                  <span>{TF_NAME[k]}</span><b>{TF_CONFIG[k].label}</b>
                </button>
              ))}
            </div>
          )}
        </div>
        {tfChips('tv-chips-top')}
        <div className="tv-pop tv-desk-flex">
          {(() => { const T = TYPE_DEFS.find((t) => t.id === prefs.type) ?? TYPE_DEFS[0]; return (
            <button type="button" className={`tv-tb${menu === 'type' ? ' on' : ''}`} onClick={() => toggleMenu('type')} aria-haspopup="menu" aria-expanded={menu === 'type'} aria-label={`Chart type: ${T.label}`} title="Chart type"><T.Icon /></button>
          ); })()}
          {menu === 'type' && (
            <div className="tv-menu" role="menu" aria-label="Chart type">
              {TYPE_DEFS.map((t) => (
                <button type="button" role="menuitemradio" aria-checked={prefs.type === t.id} key={t.id} className={`tv-mitem${prefs.type === t.id ? ' on' : ''}`} onClick={() => { set('type', t.id); setMenu(null); }}>
                  <t.Icon /><span>{t.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="tv-sep" />
        <div className="tv-pop">
          <button type="button" className={`tv-tb tv-labeled${menu === 'ind' ? ' on' : ''}`} onClick={() => toggleMenu('ind')} aria-haspopup="menu" aria-expanded={menu === 'ind'} aria-label="Indicators and layers" title="Indicators, GEX layers, session">
            <IconIndicators /><span className="tv-desk">Indicators</span><IconChevron className="tv-desk" />
          </button>
          {menu === 'ind' && indicatorsMenu}
        </div>
        {onSymbolChange && (
          <button type="button" className={`tv-tb tv-desk-flex${prefs.watchlist ? ' on' : ''}`} aria-pressed={prefs.watchlist} onClick={() => set('watchlist', !prefs.watchlist)} aria-label="Watchlist panel" title="Watchlist panel"><IconPanel /></button>
        )}
        <span className="tv-sep tv-desk" />
        <button type="button" className={`tv-tb tv-labeled tv-desk-flex${replay.on ? ' on' : ''}`} disabled={sessionBars.length < 3} onClick={startReplay} aria-pressed={replay.on} aria-label="Bar replay" title="Bar replay — step through history">
          <IconReplay /><span>Replay</span>
        </button>
        <span className="tv-sep tv-desk" />
        <button type="button" className="tv-tb" disabled={!dr.canUndo} onClick={() => dr.undo()} aria-label={`Undo (${MOD}+Z)`} title={`Undo — ${MOD}+Z`}><IconUndo /></button>
        <button type="button" className="tv-tb tv-desk-flex" disabled={!dr.canRedo} onClick={() => dr.redo()} aria-label={`Redo (${MOD}+Y)`} title={`Redo — ${MOD}+Y`}><IconRedo /></button>
        <button type="button" className={`tv-tb tv-phone-flex${menu === 'draw' || tool !== 'cursor' ? ' on' : ''}`} onClick={() => toggleMenu('draw')} aria-haspopup="dialog" aria-expanded={menu === 'draw'} aria-label="Drawing tools" title="Drawing tools"><IconPencil /></button>

        <span className="tv-grow" />
        <div className="tv-pop">
          <button type="button" className={`tv-tb${menu === 'settings' ? ' on' : ''}`} onClick={() => toggleMenu('settings')} aria-haspopup="menu" aria-expanded={menu === 'settings'} aria-label="Chart settings, layouts and more" title="Settings · layouts · shortcuts">
            <IconSettings className="tv-desk" /><IconMore className="tv-phone-flex" />
          </button>
          {menu === 'settings' && settingsMenu}
        </div>
        <button type="button" className="tv-tb tv-desk-flex" onClick={() => void snapshot()} aria-label="Take a snapshot (PNG)" title="Snapshot — save a PNG"><IconCamera /></button>
        <button type="button" className={`tv-tb tv-desk-flex${isFull ? ' on' : ''}`} onClick={toggleFull} aria-label={isFull ? 'Exit fullscreen' : 'Fullscreen'} title={isFull ? 'Exit fullscreen' : 'Fullscreen'}><IconFullscreen /></button>
      </div>
      {menu && menu !== 'draw' && <div className="tv-scrim" onClick={() => setMenu(null)} />}

      {replay.on && sessionBars.length > 2 && (
        <div className="tv-replay" role="group" aria-label="Replay controls">
          <button type="button" className="tv-btn" onClick={() => setReplay((r) => ({ ...r, idx: Math.max(0, r.idx - 1), playing: false }))} aria-label="Step back" title="Step back">◀</button>
          <button type="button" className="tv-btn on" onClick={() => setReplay((r) => ({ ...r, playing: !r.playing, idx: r.idx >= sessionBars.length - 1 ? 1 : r.idx }))}>{replay.playing ? '❚❚ Pause' : '▶ Play'}</button>
          <button type="button" className="tv-btn" onClick={() => setReplay((r) => ({ ...r, idx: Math.min(sessionBars.length - 1, r.idx + 1), playing: false }))} aria-label="Step forward" title="Step forward">▶|</button>
          <select className="tv-btn" value={replay.speed} onChange={(e) => setReplay((r) => ({ ...r, speed: Number(e.target.value) }))} aria-label="Replay speed">
            {[1, 2, 5, 10].map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
          <input type="range" min={1} max={sessionBars.length - 1} value={Math.min(replay.idx, sessionBars.length - 1)} onChange={(e) => setReplay((r) => ({ ...r, idx: Number(e.target.value), playing: false }))} aria-label="Replay position" />
          <span className="tv-dim">{cutoff != null ? `${new Date(cutoff).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET` : ''}</span>
          <button type="button" className="tv-btn" onClick={() => setReplay((r) => ({ ...r, on: false, playing: false }))} aria-label="Exit replay" title="Exit replay">✕</button>
        </div>
      )}

      <div className="tv-body">
        {/* ── left drawing toolbar (desktop) ── */}
        <div className="tv-left" role="toolbar" aria-orientation="vertical" aria-label="Drawing tools">
          <button type="button" className={`tv-tool${tool === 'cursor' ? ' on' : ''}`} aria-pressed={tool === 'cursor'} aria-label="Cursor (Esc)" title="Cursor — Esc" onClick={() => pickTool('cursor')}><IconCursor /></button>
          {TOOL_GROUPS.map((g, i) => <div className="tv-left-group" key={i}>{g.map((t) => toolButton(t))}</div>)}
          <div className="tv-left-group">{utilButtons}</div>
          <div className="tv-left-group">
            <button type="button" className="tv-tool" aria-label="Zoom in (+)" title="Zoom in — +" onClick={() => paneRef.current?.zoom(1)}><IconZoomIn /></button>
            <button type="button" className="tv-tool" aria-label="Zoom out (−)" title="Zoom out — −" onClick={() => paneRef.current?.zoom(-1)}><IconZoomOut /></button>
          </div>
        </div>

        <div className="tv-main">
          <TvPane
            ref={paneRef}
            symbol={symbol}
            tf={tf}
            tfLabel={tfLabel}
            intraday={intraday}
            history={histBars}
            extended={extended}
            extBars={series?.extBars}
            volumeLabel={series?.meta?.volume?.proxy ? `Vol · ${series.meta.volume.source}` : idx ? 'Vol · none (index)' : undefined}
            proxyLabel={idx?.extendedProxy ? `${idx.extendedProxy} proxy` : undefined}
            cutoff={cutoff}
            liveOn={liveOn}
            range={range}
            fitKey={`${symbol}:${tf}:${range}:${extended}:${replay.on}`}
            chartType={prefs.type}
            scale={scale}
            magnet={prefs.magnet}
            showVolume={prefs.fullVolume}
            showMA={prefs.ma}
            showEMA={prefs.ema}
            showVWAP={prefs.vwap}
            compare={compare}
            levels={allLevels}
            zones={zones}
            layers={layers}
            drawings={dr.drawings}
            selectedId={dr.selectedId}
            allHidden={allHidden}
            allLocked={allLocked}
            tool={tool}
            onSelect={dr.setSelectedId}
            onCommit={onCommit}
            onToolDone={onToolDone}
            legendExtras={legendExtras}
            describeLayer={describeLayer}
          />

          {/* ── floating toolbar for the selected drawing ── */}
          {selected && !allHidden && (
            <div className="tv-float" role="toolbar" aria-label="Selected drawing">
              <span className="tv-float-name">{ALL_TOOLS.find((t) => t.id === selected.tool)?.label}</span>
              <div className="tv-swatches" role="radiogroup" aria-label="Colour">
                {COLOR_ROLES.map((r) => (
                  <button type="button" key={r} role="radio" aria-checked={selected.color === r} aria-label={`Colour ${r}`} title={r}
                    className={`tv-sw${selected.color === r ? ' on' : ''}`} style={{ background: `var(--tv-${r})` }}
                    onClick={() => updateSelected({ color: r as ColorRole })} />
                ))}
              </div>
              <div className="tv-widths" role="radiogroup" aria-label="Line width">
                {LINE_WIDTHS.map((w) => (
                  <button type="button" key={w} role="radio" aria-checked={selected.width === w} aria-label={`Width ${w}px`} title={`${w}px`} className={`tv-w${selected.width === w ? ' on' : ''}`} onClick={() => updateSelected({ width: w })}>
                    <i style={{ height: w }} />
                  </button>
                ))}
              </div>
              {selected.tool === 'text' && (
                <input
                  className="tv-text-in" aria-label="Text" value={selected.text ?? ''} maxLength={200}
                  autoFocus={editText === selected.id}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => updateSelected({ text: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { (e.target as HTMLInputElement).blur(); setEditText(null); } }}
                />
              )}
              {selected.tool === 'arrow' && (
                <button type="button" className="tv-tb" aria-label="Flip arrow" title="Flip up / down" onClick={() => updateSelected({ dir: selected.dir === 'down' ? 'up' : 'down' })}><IconFlip /></button>
              )}
              <button type="button" className={`tv-tb${selected.locked ? ' on' : ''}`} aria-pressed={!!selected.locked} aria-label={selected.locked ? 'Unlock drawing' : 'Lock drawing'} title={selected.locked ? 'Unlock' : 'Lock'} onClick={() => updateSelected({ locked: !selected.locked || undefined })}>{selected.locked ? <IconLock /> : <IconUnlock />}</button>
              <button type="button" className="tv-tb" aria-label="Delete drawing (Del)" title="Delete — Del" disabled={!!selected.locked} onClick={deleteSelected}><IconTrash /></button>
            </div>
          )}
          {tool !== 'cursor' ? (
            <div className="tv-hint" role="status">
              {ALL_TOOLS.find((t) => t.id === tool)?.label}: {tool === 'brush' ? 'press and drag' : 'click / tap each point'} · Esc to cancel
            </div>
          ) : notice ? (
            <div className="tv-hint tv-notice" role="status">
              {notice.text}
              {notice.href && <> · <a href={notice.href} download={notice.file} target="_blank" rel="noopener noreferrer">open image</a></>}
            </div>
          ) : null}
          {pseudoFull && (
            <button type="button" className="tv-tb tv-exitfull" onClick={() => setPseudoFull(false)} aria-label="Exit full screen" title="Exit full screen (Esc)"><IconClose /></button>
          )}
        </div>

        {onSymbolChange && prefs.watchlist && (
          <aside className="tv-side" aria-label="Watchlist">
            <div className="tv-side-head"><span>Watchlist</span><button type="button" className="tv-tb" onClick={() => set('watchlist', false)} aria-label="Close watchlist panel" title="Close"><IconClose /></button></div>
            <div className="tv-side-body"><Suspense fallback={<div className="tv-dim" style={{ padding: 12 }}>loading…</div>}><LazyWatchlist /></Suspense></div>
          </aside>
        )}
      </div>

      {/* ── status bar ── */}
      <div className="tv-status" role="toolbar" aria-label="Chart status">
        {tfChips('tv-chips-status')}
        <div className={`tv-seg${intraday ? '' : ' tv-na'}`} role="group" aria-label="Visible range">
          {(['1D', '5D', 'ALL'] as RangeKey[]).map((r) => (
            <button type="button" key={r} className={range === r ? 'on' : ''} aria-pressed={range === r} disabled={!intraday} onClick={() => set('range', r)} title={intraday ? `Show ${r === 'ALL' ? 'all loaded bars' : r === '1D' ? 'the last session' : 'the last 5 sessions'}` : 'Intraday timeframes only'}>{r === 'ALL' ? 'All' : r}</button>
          ))}
        </div>
        <span className="tv-grow" />
        <LiveStamp tick={replay.on ? null : liveTick} live={live && !replay.on} />
        <Clock />
        <div className={`tv-seg tv-st-session${intraday ? '' : ' tv-na'}`} role="group" aria-label="Session">
          <button type="button" className={!extended ? 'on' : ''} aria-pressed={!extended} disabled={!intraday} onClick={() => set('extended', false)} title="Regular trading hours only (09:30–16:00 ET)">RTH</button>
          <button type="button" className={extended ? 'on' : ''} aria-pressed={extended} disabled={!intraday} onClick={() => set('extended', true)} title="Extended hours (pre- and post-market)">ETH</button>
        </div>
        <div className="tv-seg tv-st-scale" role="group" aria-label="Price scale">
          <button type="button" className={scale === 'pct' ? 'on' : ''} aria-pressed={scale === 'pct'} disabled={cmpOn} onClick={() => set('scale', prefs.scale === 'pct' ? 'normal' : 'pct')} title={cmpOn ? 'Percent while a comparison shows' : 'Percent scale'}>%</button>
          <button type="button" className={scale === 'log' ? 'on' : ''} aria-pressed={scale === 'log'} disabled={cmpOn} onClick={() => set('scale', prefs.scale === 'log' ? 'normal' : 'log')} title="Logarithmic scale">log</button>
          <button type="button" onClick={() => paneRef.current?.autoScale()} title="Auto-fit the price scale to the visible bars">auto</button>
        </div>
      </div>

      {/* ── phone: drawing sheet ── */}
      {menu === 'draw' && (
        <>
          <div className="tv-scrim tv-scrim-dark" onClick={() => setMenu(null)} />
          <div className="tv-sheet" role="dialog" aria-label="Drawing tools">
            <div className="tv-sheet-head"><b>Drawing tools</b><button type="button" className="tv-tb" onClick={() => setMenu(null)} aria-label="Close" title="Close"><IconClose /></button></div>
            <div className="tv-sheet-grid">
              <button type="button" className={`tv-tool tv-tool-lg${tool === 'cursor' ? ' on' : ''}`} aria-pressed={tool === 'cursor'} onClick={() => pickTool('cursor')}><IconCursor /><span className="tv-tool-name">Cursor</span></button>
              {ALL_TOOLS.map((t) => toolButton(t, ' tv-tool-lg'))}
            </div>
            <div className="tv-sheet-grid tv-sheet-util">{utilButtons}</div>
            <p className="tv-sheet-note">Two-point tools: tap the first point, then the second (or press and drag).</p>
          </div>
        </>
      )}
    </div>
  );
  return layout;
}

/** Settings menu: save the current settings under a name; apply or delete saved ones. */
function LayoutsSection({ prefs, onApply }: { prefs: Parameters<typeof saveLayout>[1]; onApply: (l: ChartLayout) => void }) {
  const layouts = useChartLayouts();
  const [name, setName] = useState('');
  const save = () => { if (name.trim()) { saveLayout(name, prefs); setName(''); } };
  return (
    <>
      <div className="tv-mhead">Layouts</div>
      <form className="tv-cmp" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <input className="tv-text-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this layout" aria-label="Layout name" maxLength={40} enterKeyHint="done" />
        <button type="submit" className="tv-btn" disabled={!name.trim()} aria-label="Save layout">Save</button>
      </form>
      {layouts.length ? (
        <div className="tv-layouts" role="list" aria-label="Saved layouts">
          {layouts.map((l) => (
            <div className="tv-layout" role="listitem" key={l.name}>
              <button type="button" className="tv-mitem" onClick={() => onApply(l)} aria-label={`Apply layout ${l.name}`} title={`${l.prefs.tf ?? ''} · ${l.prefs.type ?? ''} · ${l.prefs.scale ?? ''}`}>
                <span>{l.name}</span><b>{l.prefs.tf}</b>
              </button>
              <button type="button" className="tv-tb" onClick={() => deleteLayout(l.name)} aria-label={`Delete layout ${l.name}`} title="Delete layout"><IconTrash /></button>
            </div>
          ))}
        </div>
      ) : <small className="tv-msub">Saves interval, chart type, scale, session, layers and indicators.</small>}
    </>
  );
}

/** Live price stamp: source + age, its own 1 s clock. */
export function LiveStamp({ tick, live }: { tick: LiveTick | null; live: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!tick) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tick]);
  if (!live) return <span className="tv-stamp" title="Replay / history view — live ticks are off">HISTORY</span>;
  if (!tick) return <span className="tv-stamp" title="No live print or quote yet — the price shown is the history feed's last close">close · history</span>;
  const age = Math.max(0, Math.round((now - tick.ts) / 1000));
  const fresh = tick.live && age < 15;
  const src = tick.source === 'alpaca-iex' ? 'IEX' : tick.source === 'coinbase' ? 'Coinbase' : tick.source;
  return (
    <span className="tv-stamp" style={{ color: fresh ? 'var(--tv-gain)' : 'var(--tv-caution)' }}
      title={`Last price ${tick.price} from ${tick.source}, ${age}s old. ${tick.live ? 'Real print.' : 'Polled quote — not a trade.'}`}>
      {fresh ? '● LIVE' : '○ DELAYED'} {src} · {age < 60 ? `${age}s` : age < 5400 ? `${Math.round(age / 60)}m` : `${Math.round(age / 3600)}h`}
    </span>
  );
}

const CLOCK_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function Clock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tv-clock" title="Exchange time (New York)">{CLOCK_FMT.format(now)} <span className="tv-dim">ET</span></span>;
}


const TV_CSS = `
.tv-root{--tv-up:var(--lx-gain,#6ee7b7);--tv-down:var(--lx-loss,#ff6b3d);--tv-gain:var(--lx-gain,#6ee7b7);--tv-loss:var(--lx-loss,#ff6b3d);--tv-accent:var(--lx-accent,#3b8cff);--tv-info:var(--lx-info,var(--lx-accent,#3b8cff));--tv-caution:var(--lx-caution,#facc15);--tv-marker:var(--lx-marker,#a78bfa);--tv-text:var(--lx-text,#e8ecf3);--tv-dim:var(--lx-dim,var(--lx-mute,#8b93a3));
  --tv-bg:var(--lx-surface,var(--bg));--tv-panel:var(--lx-surface-2,var(--panel-2));--tv-hi:var(--lx-surface-hi,var(--panel-2));--tv-line:var(--lx-line,var(--nx-border));--tv-line-hi:var(--lx-line-hi,var(--nx-border-hi));--tv-fg:var(--lx-text,var(--text));--tv-mute:var(--lx-mute,var(--text-mute));
  display:flex;flex-direction:column;height:var(--qe-main-h, calc(100dvh - 98px));min-height:460px;background:var(--tv-bg);color:var(--tv-fg);font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;position:relative}
.tv-root.tv-fill{flex:1 1 0;height:auto;min-height:0}
.tv-root.tv-full{height:100vh;height:100dvh}
.tv-root.tv-pseudo-full{position:fixed;inset:0;z-index:1002;min-height:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
.tv-exitfull{position:absolute;top:8px;right:72px;z-index:9;background:var(--tv-panel)!important;border:1px solid var(--tv-line-hi)!important}
.tv-tfchips{flex:none}
.tv-status .tv-tfchips{margin-right:4px}
.tv-tfchips button{min-width:34px}
.tv-seg.tv-chips-status{display:none}
@media (max-width:1179px){.tv-seg.tv-chips-top{display:none}.tv-seg.tv-chips-status{display:inline-flex}}
.tv-cmp{display:flex;align-items:center;gap:4px;padding:2px 4px}
.tv-cmp .tv-text-in{flex:1;min-width:0;width:auto}
.tv-msub{display:block;padding:2px 6px 4px;font-size:11px;color:var(--tv-mute);line-height:1.35}
.tv-layouts{display:flex;flex-direction:column;gap:1px;padding:2px 0}
.tv-layout{display:flex;align-items:center;gap:2px}
.tv-layout .tv-mitem{flex:1;min-width:0}
.tv-layout .tv-mitem span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tv-mactions.tv-mactions-top{margin:0 0 6px;padding:0 0 8px;border-top:0;border-bottom:1px solid var(--tv-line)}
.tv-notice{color:var(--tv-fg);pointer-events:auto}
.tv-notice a{color:var(--tv-accent)}
.tv-top{display:flex;align-items:center;gap:2px;height:40px;padding:0 6px;border-bottom:1px solid var(--tv-line);flex:none;position:relative;z-index:21}
.tv-sym{width:150px;min-width:110px}
.tv-symlabel{padding:0 8px;font-size:13px;color:var(--tv-fg)}
.tv-sep{width:1px;height:20px;background:var(--tv-line);margin:0 4px;flex:none}
.tv-grow{flex:1}
.tv-tb{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:32px;height:32px;padding:0 6px;border:0;border-radius:4px;background:transparent;color:var(--tv-fg);font:600 12px 'JetBrains Mono',monospace;cursor:pointer;white-space:nowrap}
@media (hover:hover){.tv-tb:hover:not(:disabled){background:var(--tv-hi)}}
.tv-tb.on{color:var(--tv-accent)}
.tv-tb:disabled{opacity:.38;cursor:default}
.tv-tb:focus-visible,.tv-tool:focus-visible,.tv-seg button:focus-visible,.tv-btn:focus-visible,.tv-mitem:focus-visible,.tv-sw:focus-visible,.tv-w:focus-visible,.tv-leg-x:focus-visible{outline:2px solid var(--tv-accent);outline-offset:1px}
.tv-tf b{font-weight:700}
.tv-pop{position:relative;display:inline-flex}
.tv-phone-flex,.tv-phone-only,.tv-mactions.tv-phone-only{display:none}
.tv-desk-flex{display:inline-flex}
.tv-scrim{position:fixed;inset:0;z-index:20}
.tv-menu{position:absolute;top:36px;left:0;z-index:30;min-width:180px;max-height:min(72dvh,600px);overflow-y:auto;padding:6px;background:var(--tv-panel);border:1px solid var(--tv-line-hi);border-radius:6px;box-shadow:0 12px 32px rgba(0,0,0,.45);display:flex;flex-direction:column;gap:1px}
.tv-menu-right{left:auto;right:0;width:300px}
.tv-menu-ind{width:300px}
.tv-mitem{display:flex;align-items:center;gap:10px;justify-content:space-between;height:32px;padding:0 10px;border:0;border-radius:4px;background:transparent;color:var(--tv-fg);font:500 12px 'JetBrains Mono',monospace;cursor:pointer;text-align:left}
.tv-mitem:hover{background:var(--tv-hi)}
.tv-mitem.on{color:var(--tv-accent)}
.tv-mitem svg{flex:none}
.tv-mitem span{flex:1}
.tv-mhead{margin:8px 4px 2px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--tv-mute)}
.tv-mhead:first-child{margin-top:2px}
.tv-mrow{display:flex;align-items:flex-start;gap:8px;padding:6px 6px;border-radius:4px;cursor:pointer}
.tv-mrow:hover{background:var(--tv-hi)}
.tv-mrow input{margin-top:2px;accent-color:var(--tv-accent)}
.tv-mlabel{display:flex;flex-direction:column;gap:1px;font-size:12px;min-width:0}
.tv-mlabel i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px}
.tv-mlabel small{font-size:11px;color:var(--tv-mute);line-height:1.35}
.tv-mactions{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid var(--tv-line)}
.tv-btn{height:28px;padding:0 10px;border:1px solid var(--tv-line);border-radius:4px;background:var(--tv-hi);color:var(--tv-fg);font:600 11px 'JetBrains Mono',monospace;cursor:pointer}
.tv-btn:hover:not(:disabled){border-color:var(--tv-line-hi)}
.tv-btn.on{color:var(--tv-accent);border-color:var(--tv-line-hi)}
.tv-btn:disabled{opacity:.4;cursor:default}
.tv-keys{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:4px 6px;font-size:11px}
.tv-keys dt{color:var(--tv-fg);font-weight:700;white-space:nowrap}
.tv-keys dd{margin:0;color:var(--tv-mute)}
.tv-seg{display:inline-flex;gap:1px;padding:2px;border-radius:5px;background:var(--tv-panel)}
.tv-seg button{height:24px;min-width:30px;padding:0 7px;border:0;border-radius:3px;background:transparent;color:var(--tv-mute);font:600 11px 'JetBrains Mono',monospace;cursor:pointer}
.tv-seg button:hover:not(:disabled){color:var(--tv-fg)}
.tv-seg button.on{background:var(--tv-hi);color:var(--tv-fg)}
.tv-seg button:disabled{opacity:.35;cursor:default}
.tv-menu .tv-seg{margin:2px 4px 4px}
.tv-seg.tv-phone-only{display:none}
.tv-replay{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid var(--tv-line);font-size:11px;flex:none}
.tv-replay input[type=range]{flex:1;min-width:140px;accent-color:var(--tv-accent)}
.tv-body{display:flex;flex:1;min-height:0;position:relative}
.tv-left{display:flex;flex-direction:column;align-items:center;gap:2px;width:44px;flex:none;padding:6px 0;border-right:1px solid var(--tv-line);overflow-y:auto;scrollbar-width:none}
.tv-left::-webkit-scrollbar{display:none}
.tv-left-group{display:flex;flex-direction:column;gap:2px;padding-top:4px;margin-top:2px;border-top:1px solid var(--tv-line)}
.tv-tool{display:inline-flex;align-items:center;justify-content:center;gap:6px;width:34px;height:34px;border:0;border-radius:4px;background:transparent;color:var(--tv-fg);cursor:pointer;flex:none}
@media (hover:hover){.tv-tool:hover:not(:disabled){background:var(--tv-hi)}}
.tv-tool.on{color:var(--tv-accent);background:var(--tv-hi)}
.tv-tool:disabled{opacity:.35;cursor:default}
.tv-tool-name{display:none}
.tv-main{position:relative;flex:1;min-width:0;display:flex}
.tv-pane{position:relative;flex:1;min-width:0;display:flex}
.tv-wm{position:absolute;left:50%;top:50%;width:min(46%,420px);transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;opacity:.07;pointer-events:none;user-select:none;z-index:1;color:var(--tv-text)}
.tv-wm-sym{font:800 clamp(44px,7vw,104px)/.95 'JetBrains Mono',ui-monospace,monospace;letter-spacing:-.02em;white-space:nowrap}
.tv-wm-tf{font:700 clamp(12px,1.3vw,18px)/1.4 'JetBrains Mono',ui-monospace,monospace;letter-spacing:.2em;margin:2px 0 6px}
.tv-gamma-wm{display:block;width:100%;height:auto}
html[data-mode=light] .tv-wm{opacity:.09}
@media (max-width:767px){.tv-wm{width:60%}.tv-wm-sym{font-size:clamp(32px,11vw,56px)}.tv-wm-tf{font-size:11px;margin-bottom:4px}}
.tv-orb-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:1px 8px;border:1px solid color-mix(in srgb,var(--tv-accent) 45%,transparent);border-radius:999px;background:color-mix(in srgb,var(--tv-accent) 12%,transparent);color:var(--tv-text);font-size:11px}
.tv-orb-chip button{padding:0 6px;border:0;border-radius:999px;background:var(--tv-accent);color:var(--lx-accent-ink,#fff);font:700 10px/1.6 'JetBrains Mono',monospace;cursor:pointer}
.tv-canvas{position:absolute;inset:0;touch-action:none}
.tv-legend{position:absolute;top:6px;left:8px;right:80px;z-index:4;pointer-events:none;display:flex;flex-direction:column;gap:1px;font-size:12px;line-height:1.5;text-shadow:0 0 3px var(--tv-bg),0 0 6px var(--tv-bg)}
.tv-leg-row{display:flex;align-items:center;flex-wrap:wrap;gap:0 8px;min-width:0}
.tv-leg-main{gap:0 6px}
.tv-leg-sym{font-weight:700;color:var(--tv-fg)}
.tv-leg-dot,.tv-leg-tf{color:var(--tv-mute)}
.tv-leg-ohlc{display:inline-flex;flex-wrap:wrap;gap:0 8px;margin-left:6px}
.tv-leg-ohlc i{font-style:normal;color:var(--tv-mute);margin-right:2px}
.tv-leg-name{color:var(--tv-mute)}
.tv-leg-vals{display:inline-flex;flex-wrap:wrap;gap:0 8px}
.tv-leg-ind{width:max-content;max-width:100%;padding-right:2px;border-radius:3px}
/* The legend never takes the chart's clicks / taps (drawing, selecting, panning
   under it) — only its own small buttons do. */
.tv-leg-x,.tv-orb-chip button{pointer-events:auto}
.tv-leg-x{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:0;border-radius:3px;background:transparent;color:var(--tv-mute);cursor:pointer;opacity:.45}
.tv-leg-x:hover,.tv-leg-x:focus-visible{opacity:1}
.tv-armed~.tv-legend .tv-leg-x,.tv-armed~.tv-legend .tv-orb-chip button{pointer-events:none}
.tv-leg-x:hover{background:var(--tv-hi);color:var(--tv-fg)}
.tv-dim{color:var(--tv-mute)}
.tv-warn{color:var(--tv-caution)}
.tv-tip{position:absolute;display:none;z-index:6;pointer-events:none;max-width:260px;padding:6px 8px;border:1px solid var(--tv-line-hi);border-radius:5px;background:var(--tv-panel);font-size:11px;line-height:1.5;color:var(--tv-fg);box-shadow:0 8px 24px rgba(0,0,0,.45)}
.tv-float{position:absolute;top:8px;right:84px;z-index:8;display:flex;align-items:center;gap:4px;padding:3px 6px;background:var(--tv-panel);border:1px solid var(--tv-line-hi);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.4);max-width:calc(100% - 100px);flex-wrap:wrap;width:max-content}
.tv-float-name{font-size:11px;color:var(--tv-mute);padding:0 4px;white-space:nowrap}
.tv-swatches,.tv-widths{display:inline-flex;gap:2px;padding:0 4px;border-left:1px solid var(--tv-line)}
.tv-sw{width:18px;height:18px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}
.tv-sw.on{border-color:var(--tv-fg)}
.tv-w{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:0;border-radius:3px;background:transparent;cursor:pointer}
.tv-w i{display:block;width:14px;background:var(--tv-fg);border-radius:2px}
.tv-w.on{background:var(--tv-hi)}
.tv-text-in{height:26px;width:150px;padding:0 6px;border:1px solid var(--tv-line-hi);border-radius:4px;background:var(--tv-bg);color:var(--tv-fg);font:500 12px 'JetBrains Mono',monospace}
.tv-hint{position:absolute;bottom:34px;left:50%;transform:translateX(-50%);z-index:7;padding:4px 10px;border-radius:4px;background:var(--tv-panel);border:1px solid var(--tv-line);font-size:11px;color:var(--tv-mute);pointer-events:none;white-space:nowrap}
.tv-side{width:clamp(240px,22vw,320px);flex:none;display:flex;flex-direction:column;border-left:1px solid var(--tv-line);background:var(--tv-panel);min-height:0}
.tv-side-head{display:flex;align-items:center;justify-content:space-between;padding:3px 4px 3px 10px;border-bottom:1px solid var(--tv-line);font-size:12px;color:var(--tv-mute)}
.tv-side-body{flex:1;min-height:0;overflow:auto}
.tv-status{display:flex;align-items:center;gap:8px;height:32px;padding:0 8px;border-top:1px solid var(--tv-line);flex:none;font-size:11px;color:var(--tv-mute)}
.tv-stamp{white-space:nowrap}
.tv-clock{color:var(--tv-fg);white-space:nowrap;font-variant-numeric:tabular-nums}
.tv-sheet{position:fixed;left:0;right:0;bottom:0;z-index:1001;padding:10px 12px calc(12px + env(safe-area-inset-bottom));background:var(--tv-panel);border-top:1px solid var(--tv-line-hi);border-radius:12px 12px 0 0;box-shadow:0 -12px 30px rgba(0,0,0,.5);max-height:80dvh;overflow-y:auto}
.tv-scrim-dark{background:rgba(0,0,0,.45);z-index:1000}
.tv-sheet-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;font-size:14px}
.tv-sheet-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:4px}
.tv-sheet-util{margin-top:8px;padding-top:8px;border-top:1px solid var(--tv-line)}
.tv-tool.tv-tool-lg,.tv-sheet .tv-tool{width:auto;height:52px;flex-direction:column;gap:3px;font-size:11px}
.tv-sheet .tv-tool-name{display:block;font:500 11px 'JetBrains Mono',monospace;color:inherit}
.tv-sheet-note{margin:8px 2px 0;font-size:12px;color:var(--tv-mute);line-height:1.4}
/* CHART tab on a phone: the one chart fills the screen above the dock. */
@media (max-width:767px){
  .flowdash.dash-chart{display:flex;flex-direction:column;height:var(--qe-main-h,calc(100dvh - 140px));min-height:0}
  .flowdash.dash-chart .fd-simple{flex:1;min-height:0}
  .flowdash.dash-chart .fd-simple-main{height:auto;min-height:0}
}
@media (max-width:640px){
  .tv-root{height:auto;min-height:calc(100dvh - 140px)}
  .tv-root.tv-fill,.fd-fill>.tv-root{flex:1 1 0;height:auto;min-height:0}
  .tv-main{min-height:0}
  .tv-left{display:none}
  .tv-desk,.tv-desk-flex{display:none}
  .tv-phone-flex{display:inline-flex}
  .tv-phone-only,.tv-mactions.tv-phone-only{display:flex}
  .tv-top{height:48px;gap:0;padding:0 2px}
  /* an open menu is a bottom sheet: lift the bar that holds it over the scrim (and the app dock) */
  .tv-root.tv-menu-open .tv-top{z-index:1001}
  .tv-status .tv-clock,.tv-status .tv-st-session,.tv-status .tv-st-scale{display:none}
  .tv-tfchips button{min-width:40px}
  .tv-menu .tv-seg button{flex:1}
  .tv-menu .tv-seg{display:flex}
  .tv-menu .tv-seg.tv-phone-only{display:flex}
  .tv-cmp .tv-text-in{height:44px;font-size:16px}
  .tv-float .tv-text-in{height:40px;font-size:16px;width:140px;flex:none}
  .tv-exitfull{right:60px}
  .tv-top .tv-sep{display:none}
  .tv-sym{overflow:hidden}
  .tv-sym input{min-width:0}
  .tv-sym span.rounded-sm{display:none} /* the legend names the symbol; the input gets the room */
  .tv-tb{min-width:44px;height:44px}
  .tv-sym{width:auto;flex:1 1 100px;min-width:90px}
  .tv-menu,.tv-menu-ind,.tv-menu-right,.tv-menu-tf{position:fixed;left:8px;right:8px;top:auto;bottom:calc(8px + env(safe-area-inset-bottom));width:auto;max-height:72dvh;z-index:1001}
  .tv-mitem{height:44px}
  .tv-mrow{padding:10px 6px}
  .tv-btn{height:44px}
  .tv-scrim{background:rgba(0,0,0,.45);z-index:1000}
  .tv-status{height:44px;gap:6px;padding:0 4px;overflow-x:auto;scrollbar-width:none}
  .tv-status::-webkit-scrollbar{display:none}
  .tv-status .tv-stamp,.tv-status .tv-seg.tv-na{display:none}
  .tv-seg button{height:40px;min-width:40px}
  .tv-legend{right:64px;font-size:12px;flex-direction:row;flex-wrap:wrap;gap:0 10px;align-content:flex-start}
  .tv-leg-main,.tv-leg-row:not(.tv-leg-ind){flex-basis:100%}
  .tv-leg-ind .tv-leg-vals,.tv-leg-x{display:none}
  /* two rows on a phone: colours, then width · text · lock · delete — nothing scrolled out of reach */
  .tv-float{top:auto;bottom:6px;left:6px;right:6px;width:auto;max-width:none;flex-wrap:wrap;justify-content:space-between;row-gap:4px}
  .tv-float::-webkit-scrollbar{display:none}
  .tv-float-name{display:none}
  .tv-swatches,.tv-widths{flex:none}
  .tv-swatches{flex:1 1 100%;justify-content:space-between;border-left:0;padding:0}
  .tv-widths{border-left:0;padding:0}
  .tv-float .tv-tb{min-width:40px;height:40px}
  /* the app's phone rule makes every button ≥ 44px: eight swatches need 352px, so the row scrolls on the narrowest phones */
  .tv-float .tv-sw{flex:none}
  .tv-swatches{gap:2px;overflow-x:auto;scrollbar-width:none;scroll-snap-type:x proximity}
  .tv-swatches::-webkit-scrollbar{display:none}
  .tv-w{width:32px;height:32px}
  .tv-side{position:absolute;inset:0 0 0 auto;width:min(86vw,320px);z-index:8;box-shadow:-12px 0 30px rgba(0,0,0,.5)}
  .tv-hint{bottom:8px}
}
`;

export default TvChart;
