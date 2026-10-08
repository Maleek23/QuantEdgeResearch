/**
 * Replay one NEXUS idea bar by bar — REAL bars from publish → resolution (or
 * now, while open), drawn with the canvas engine (chart-engine.ts drawChart).
 *
 *   bars     /api/historical-prices/:symbol at the finest interval the feed
 *            holds back to publish (shared/idea-timeline.ts replayBarPlan) —
 *            the interval, range and why are printed above the chart.
 *   events   RECORDED events from /api/ideas/:id/timeline (trigger, T1, stop,
 *            exit) are marked at their bar once the cursor reaches them.
 *            Crossings the replay can see in the bars are drawn dashed and
 *            labelled "replay-detected" — they never replace a recorded event.
 *   premium  option ideas: reported 1-minute OPTION trades per session via
 *            /api/options/history/:occ?date= (server/option-minute-history.ts,
 *            Yahoo OPR, delayed, not NBBO), first 5 sessions. Otherwise the
 *            reason it is unavailable is stated.
 *
 * Nothing plays on its own: playback starts only on the Play button, and the
 * component never autoplays under prefers-reduced-motion (or otherwise).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReducedMotion } from 'framer-motion';
import { drawChart, type Candle, type ChartGeometry, type DrawOpts, type Level } from '@/components/charting/chart-engine';
import type { ConvictionPick } from '@/lib/convictions';
import { canonicalChartSymbol, optionRootsFor } from '@shared/index-symbols';
import { detectReplayCrossings, fmtEt, replayBarPlan, type ReplayCrossing } from '@shared/idea-timeline';
import { etDay, isTradingDay, nextTradingDay } from '@shared/setup-lifecycle';
import { useIdeaTimeline } from './setup-timeline';
import './setup-tools.css';

const SPEEDS = [1, 2, 5, 10] as const;
const BASE_STEP_MS = 400; // one bar per 400 ms at 1×
const VISIBLE = 160;      // bars on screen (sliding window ending at the cursor)
const CONTEXT = 40;       // bars before publish kept for context
const PREMIUM_SESSIONS = 5;

const parseMs = (s?: string | null) => { const t = s ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : null; };

interface Marker { key: string; label: string; t: number; kind: 'recorded' | 'detected'; role: string }

/** Price-axis transform so the whole replay window + plan levels stay on one fixed scale. */
function fixedScale(visible: Candle[], all: Candle[], levels: number[]): Pick<DrawOpts, 'priceScale' | 'priceShift'> {
  if (!visible.length || !all.length) return {};
  let vMin = Infinity; let vMax = -Infinity;
  for (const c of visible) { vMin = Math.min(vMin, c.low); vMax = Math.max(vMax, c.high); }
  const vSpan = vMax - vMin || 1;
  const nMin = vMin - vSpan * 0.05; const nMax = vMax + vSpan * 0.05;
  const nat = nMax - nMin || 1;
  let dMin = Infinity; let dMax = -Infinity;
  for (const c of all) { dMin = Math.min(dMin, c.low); dMax = Math.max(dMax, c.high); }
  for (const l of levels) if (Number.isFinite(l) && l > 0) { dMin = Math.min(dMin, l); dMax = Math.max(dMax, l); }
  const dSpan = dMax - dMin || 1;
  dMin -= dSpan * 0.05; dMax += dSpan * 0.05;
  return { priceScale: Math.max(0.2, Math.min(5, (dMax - dMin) / nat)), priceShift: ((dMin + dMax) / 2 - (nMin + nMax) / 2) / nat };
}

function useReplayBars(symbol: string, range: string, interval: string, enabled: boolean) {
  return useQuery<{ bars: Candle[]; source: string }>({
    queryKey: ['/api/historical-prices', symbol, range, interval, 'replay'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch(`/api/historical-prices/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`, { credentials: 'include' });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error ?? `history ${r.status}`);
      const bars: Candle[] = (body.data ?? [])
        .filter((c: Candle) => [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0))
        .map((c: Candle) => ({ ...c, time: c.time < 10_000_000_000 ? c.time * 1000 : c.time, volume: c.volume ?? 0 }))
        .sort((a: Candle, b: Candle) => a.time - b.time);
      return { bars, source: body?.volume?.source ?? 'yahoo' };
    },
  });
}

interface PremiumPath { occ: string; bars: Candle[]; sessions: string[]; missing: string[]; truncated: boolean }

function usePremiumPath(occ: string | null, startMs: number | null, endMs: number | null) {
  return useQuery<PremiumPath>({
    queryKey: ['/api/options/history', occ, startMs, endMs ? Math.floor(endMs / 600_000) : null, 'replay'],
    enabled: !!occ && startMs != null && endMs != null,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const days: string[] = [];
      let d = etDay(startMs!);
      if (!isTradingDay(d)) d = nextTradingDay(d);
      const last = etDay(endMs!);
      while (d <= last && days.length < PREMIUM_SESSIONS + 1) { days.push(d); d = nextTradingDay(d); }
      const truncated = days.length > PREMIUM_SESSIONS;
      const sessions = days.slice(0, PREMIUM_SESSIONS);
      const bars: Candle[] = []; const missing: string[] = [];
      for (const day of sessions) {
        const r = await fetch(`/api/options/history/${encodeURIComponent(occ!)}?date=${day}`, { credentials: 'include' });
        if (!r.ok) { missing.push(day); continue; }
        const body = await r.json();
        for (const b of body?.bars ?? []) {
          const t = Date.parse(b.timestamp);
          if (Number.isFinite(t) && b.close > 0) bars.push({ time: t, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 });
        }
      }
      return { occ: occ!, bars: bars.sort((a, b) => a.time - b.time), sessions, missing, truncated };
    },
  });
}

function buildOcc(pick: ConvictionPick): { occ: string | null; root: string | null; reason: string | null } {
  const isOpt = /option/i.test(String(pick.assetType)) || pick.optionType === 'call' || pick.optionType === 'put';
  if (!isOpt) return { occ: null, root: null, reason: 'not an option idea' };
  if (!pick.optionType || !(Number(pick.strikePrice) > 0) || !/^\d{4}-\d{2}-\d{2}/.test(String(pick.expiryDate ?? ''))) {
    return { occ: null, root: null, reason: 'contract strike / expiry / type not recorded on this idea' };
  }
  const root = optionRootsFor(pick.symbol)[0];
  if (!/^[A-Z.]{1,6}$/.test(root)) return { occ: null, root, reason: `no OCC root for ${pick.symbol}` };
  const [y, m, d] = String(pick.expiryDate).slice(0, 10).split('-');
  const strike = String(Math.round(Number(pick.strikePrice) * 1000)).padStart(8, '0');
  if (strike.length !== 8) return { occ: null, root, reason: 'strike out of OCC range' };
  return { occ: `${root}${y.slice(2)}${m}${d}${pick.optionType === 'call' ? 'C' : 'P'}${strike}`, root, reason: null };
}

function ReplayCanvas({ candles, opts, className, label }: { candles: Candle[]; opts: Omit<DrawOpts, 'mouseX' | 'mouseY' | 'onHover' | 'showCrosshair'>; className: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const draw = useCallback(() => {
    const el = ref.current;
    if (!el || candles.length < 1) return;
    drawChart(el, candles, { ...opts, showCrosshair: false, mouseX: -1, mouseY: -1, onHover: () => {} });
  }, [candles, opts]);
  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);
  return <canvas ref={ref} className={className} role="img" aria-label={label} />;
}

export function SetupReplay({ pick }: { pick: ConvictionPick }) {
  const reduceMotion = useReducedMotion();
  const timeline = useIdeaTimeline(pick.ideaId);
  const tl = timeline.data;
  const published = tl?.events.find((e) => e.kind === 'published' && e.status === 'recorded');
  const startMs = parseMs(published?.at) ?? parseMs(pick.calledAt) ?? parseMs(pick.generatedAt);
  const exitEv = tl?.events.find((e) => e.kind === 'exit' && e.status === 'recorded');
  const resolvedMs = parseMs(exitEv?.at);
  const [nowMs] = useState(() => Date.now());
  const endMs = resolvedMs ?? nowMs;
  const plan = useMemo(() => (startMs != null ? replayBarPlan(startMs, nowMs) : null), [startMs, nowMs]);
  const symbol = canonicalChartSymbol(pick.symbol);
  const barsQ = useReplayBars(symbol, plan?.range ?? '5d', plan?.interval ?? '1m', !!plan && !timeline.isLoading);

  // Window: CONTEXT bars before publish → first bar after the end.
  const { bars, startIdx, endIdx, barMs } = useMemo(() => {
    const all = barsQ.data?.bars ?? [];
    if (!all.length || startMs == null) return { bars: [] as Candle[], startIdx: 0, endIdx: 0, barMs: 60_000 };
    const gaps = all.slice(1, 200).map((b, i) => b.time - all[i].time).sort((a, b) => a - b);
    const bm = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 60_000;
    let first = all.findIndex((b) => b.time + bm > startMs);
    if (first < 0) return { bars: [] as Candle[], startIdx: 0, endIdx: 0, barMs: bm };
    let last = all.length - 1;
    for (let i = first; i < all.length; i++) { if (all[i].time > endMs) { last = Math.max(first, i - 1); break; } }
    const lo = Math.max(0, first - CONTEXT);
    const slice = all.slice(lo, last + 1);
    first -= lo;
    return { bars: slice, startIdx: first, endIdx: slice.length - 1, barMs: bm };
  }, [barsQ.data, startMs, endMs]);

  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<typeof SPEEDS[number]>(1);
  useEffect(() => { setCursor(startIdx); setPlaying(false); }, [startIdx, endIdx, pick.ideaId]);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setCursor((c) => {
        if (c >= endIdx) { setPlaying(false); return c; }
        return c + 1;
      });
    }, BASE_STEP_MS / speed);
    return () => window.clearInterval(id);
  }, [playing, speed, endIdx]);

  const cursorT = bars[cursor]?.time ?? null;
  const dir: 'long' | 'short' = pick.direction === 'short' ? 'short' : 'long';
  const recordedTrigMs = parseMs(tl?.events.find((e) => e.kind === 'trigger' && e.status === 'recorded')?.at);

  const markers = useMemo<Marker[]>(() => {
    const out: Marker[] = [];
    const role: Record<string, string> = { trigger: 'accent', execution: 'accent', t1: 'gain', stop: 'loss', exit: 'marker' };
    for (const e of tl?.events ?? []) {
      if (e.status !== 'recorded' || e.kind === 'published' || e.kind === 't2') continue;
      const t = parseMs(e.at);
      if (t != null) out.push({ key: `rec-${e.kind}`, label: e.label, t, kind: 'recorded', role: role[e.kind] ?? 'marker' });
    }
    if (startMs != null && bars.length) {
      const rb = bars.map((b) => ({ t: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
      const det: ReplayCrossing[] = detectReplayCrossings(rb, { direction: dir, entry: pick.entryPrice, target: pick.targetPrice, stop: pick.stopLoss }, bars[startIdx]?.time ?? startMs, endMs + barMs, recordedTrigMs);
      const name = { trigger: 'trigger', t1: 'T1', stop: 'stop' } as const;
      for (const c of det) out.push({ key: `det-${c.kind}`, label: `${name[c.kind]} (replay-detected)`, t: c.t, kind: 'detected', role: role[c.kind] });
    }
    return out.sort((a, b) => a.t - b.t);
  }, [tl, bars, startIdx, startMs, endMs, barMs, dir, pick.entryPrice, pick.targetPrice, pick.stopLoss, recordedTrigMs]);

  const reached = (m: Marker) => cursorT != null && m.t < cursorT + barMs;
  const visible = useMemo(() => bars.slice(Math.max(0, cursor - VISIBLE + 1), cursor + 1), [bars, cursor]);
  const levels = useMemo<Level[]>(() => [
    { price: pick.entryPrice, color: 'accent', label: 'TRIGGER', kind: 'execution' },
    { price: pick.targetPrice, color: 'gain', label: 'T1', kind: 'execution' },
    { price: pick.stopLoss, color: 'loss', label: 'STOP', kind: 'execution' },
  ].filter((l) => Number.isFinite(l.price) && l.price > 0) as Level[], [pick.entryPrice, pick.targetPrice, pick.stopLoss]);

  const reachedMarkers = markers.filter(reached);
  const overlay = useCallback((ctx: CanvasRenderingContext2D, geo: ChartGeometry) => {
    const pubX = startMs != null ? geo.timeToX(startMs) : null;
    const lines: Array<{ x: number; label: string; dashed: boolean; color: string }> = [];
    const css = getComputedStyle(ctx.canvas);
    const col = (role: string) => css.getPropertyValue(`--lx-${role}`).trim() || (role === 'gain' ? '#6ee7b7' : role === 'loss' ? '#ff6b3d' : role === 'marker' ? '#a78bfa' : '#3b8cff');
    if (pubX != null) lines.push({ x: pubX, label: 'PUBLISHED', dashed: false, color: col('dim') || '#8b93a3' });
    for (const m of reachedMarkers) {
      const x = geo.timeToX(m.t);
      if (x != null) lines.push({ x, label: m.kind === 'detected' ? `${m.label}` : m.label.toUpperCase(), dashed: m.kind === 'detected', color: col(m.role) });
    }
    ctx.save();
    ctx.font = "600 9px 'JetBrains Mono', monospace";
    lines.forEach((l, i) => {
      ctx.strokeStyle = l.color; ctx.globalAlpha = 0.85; ctx.lineWidth = 1;
      ctx.setLineDash(l.dashed ? [4, 3] : []);
      ctx.beginPath(); ctx.moveTo(l.x, geo.top); ctx.lineTo(l.x, geo.top + geo.priceH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = l.color; ctx.globalAlpha = 1;
      ctx.fillText(l.label, Math.min(l.x + 3, geo.right - ctx.measureText(l.label).width - 2), geo.top + 10 + (i % 4) * 11);
    });
    ctx.restore();
  }, [reachedMarkers, startMs]);

  const drawOpts = useMemo(() => ({
    type: 'candles' as const, tf: plan?.tf ?? '1m', showLevels: true, levels, showMA: false, showVolume: true, overlay,
    ...fixedScale(visible, bars, levels.map((l) => l.price)),
  }), [plan?.tf, levels, overlay, visible, bars]);

  // option premium path
  const occ = useMemo(() => buildOcc(pick), [pick]);
  const prem = usePremiumPath(occ.occ, startMs, endMs);
  const premVisible = useMemo(() => {
    const pb = prem.data?.bars ?? [];
    if (cursorT == null) return [];
    return pb.filter((b) => b.time <= cursorT + barMs);
  }, [prem.data, cursorT, barMs]);
  const premLevels = useMemo<Level[]>(() => (pick.entryPremium && pick.entryPremium > 0 ? [{ price: pick.entryPremium, color: 'accent', label: 'ENTRY PREM', kind: 'execution' }] : []), [pick.entryPremium]);
  const premOpts = useMemo(() => ({
    type: 'line' as const, tf: '1m', showLevels: true, levels: premLevels, showMA: false, showVolume: false,
    ...fixedScale(premVisible, prem.data?.bars ?? [], premLevels.map((l) => l.price)),
  }), [premLevels, premVisible, prem.data]);

  // ── render ──
  if (startMs == null) return <div className="nxp-rp"><p className="nxp-rp-note">Replay unavailable — this idea has no publish time.</p></div>;
  if (timeline.isLoading || barsQ.isLoading) return <div className="nxp-rp" role="status"><p className="nxp-rp-note">Loading {plan?.interval ?? ''} bars for the replay…</p></div>;
  if (barsQ.isError) return <div className="nxp-rp"><p className="nxp-rp-note">Replay unavailable — {symbol} {plan?.interval} bars did not load.</p></div>;
  if (bars.length < 2) {
    return <div className="nxp-rp"><p className="nxp-rp-note">Replay unavailable — the {plan?.interval} feed ({plan?.range}) holds no {symbol} bars after the publish time ({fmtEt(startMs)}).</p></div>;
  }

  const atEnd = cursor >= endIdx;
  const total = Math.max(0, endIdx - startIdx);
  const step = (d: number) => { setPlaying(false); setCursor((c) => Math.max(startIdx, Math.min(endIdx, c + d))); };
  const lastPrem = premVisible[premVisible.length - 1];

  return (
    <section className="nxp-rp" aria-label={`${pick.symbol} replay`}>
      <div className="nxp-rp-head">
        <strong>Replay</strong>
        <span>{symbol} · {plan?.interval} bars ({plan?.range}) · source {barsQ.data?.source ?? 'yahoo'}{plan?.interval !== '1d' ? ' · includes extended hours' : ''}</span>
        <span>{fmtEt(startMs)} → {resolvedMs ? `${fmtEt(resolvedMs)} (exit)` : `now (open, ${fmtEt(nowMs)})`}</span>
      </div>
      <p className="nxp-rp-note">Interval: {plan?.why}.</p>
      <ReplayCanvas candles={visible} opts={drawOpts} className="nxp-rp-canvas" label={`${pick.symbol} ${plan?.interval} bars up to ${cursorT ? fmtEt(cursorT) : '—'}; trigger ${pick.entryPrice}, T1 ${pick.targetPrice}, stop ${pick.stopLoss}`} />

      <div className="nxp-rp-controls">
        <button type="button" aria-label="Back to publish" onClick={() => { setPlaying(false); setCursor(startIdx); }} disabled={cursor <= startIdx}>⏮</button>
        <button type="button" aria-label="Step back one bar" onClick={() => step(-1)} disabled={cursor <= startIdx}>◀</button>
        <button type="button" aria-label={playing ? 'Pause replay' : 'Play replay'} aria-pressed={playing}
          onClick={() => { if (atEnd) setCursor(startIdx); setPlaying(!playing); }}>{playing ? '❚❚' : '▶'}</button>
        <button type="button" aria-label="Step forward one bar" onClick={() => step(1)} disabled={atEnd}>▶|</button>
        <div role="group" aria-label="Playback speed" style={{ display: 'flex', gap: 4 }}>
          {SPEEDS.map((s) => <button key={s} type="button" aria-label={`Speed ${s}×`} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}
        </div>
        <input type="range" className="nxp-rp-scrub" aria-label="Replay position" min={startIdx} max={endIdx} step={1} value={cursor}
          aria-valuetext={cursorT ? fmtEt(cursorT) : undefined}
          onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }} />
        <span className="nxp-rp-clock" aria-live="off">{cursorT ? fmtEt(cursorT) : '—'} · bar {cursor - startIdx}/{total}</span>
      </div>
      {reduceMotion && <p className="nxp-rp-note">Reduced motion is on — use the step buttons or the scrubber; Play still works when you choose it.</p>}

      <ul className="nxp-rp-events" aria-label="Events">
        {markers.length === 0 && <li>No recorded or replay-detected crossings in this window yet.</li>}
        {markers.map((m) => (
          <li key={m.key} className={`${reached(m) ? 'reached' : ''}${m.kind === 'detected' ? ' detected' : ''}`}>
            {m.label} · {fmtEt(m.t)}{m.kind === 'recorded' ? ' · recorded' : ''}{reached(m) ? '' : ' (ahead)'}
          </li>
        ))}
      </ul>
      <p className="nxp-rp-note">Solid markers are recorded events (trade timeline). Dashed = replay-detected from these bars (same bar touching T1 and stop counts as stop) — not the recorded outcome.</p>

      {occ.occ ? (
        prem.isLoading ? <p className="nxp-rp-note">Loading option premium path ({occ.occ})…</p>
          : prem.isError ? <p className="nxp-rp-note">Premium path unavailable — option history request failed for {occ.occ}.</p>
          : (prem.data?.bars.length ?? 0) === 0 ? <p className="nxp-rp-note">Premium path unavailable — no reported {occ.occ} option trades for {prem.data?.sessions.join(', ') || 'these sessions'} (Yahoo OPR minute trades; older sessions may be past its retention).</p>
          : <>
              <div className="nxp-rp-head">
                <strong>Premium path</strong>
                <span>{occ.occ} · reported 1m option trades (Yahoo OPR, delayed, not NBBO){prem.data!.missing.length ? ` · no trades for ${prem.data!.missing.join(', ')}` : ''}{prem.data!.truncated ? ` · first ${PREMIUM_SESSIONS} sessions only` : ''}</span>
                <span>{lastPrem ? `last print $${lastPrem.close.toFixed(2)} at ${fmtEt(lastPrem.time)}` : 'no print yet at this point'}</span>
              </div>
              {premVisible.length >= 2
                ? <ReplayCanvas candles={premVisible} opts={premOpts} className="nxp-rp-prem" label={`${occ.occ} premium up to ${cursorT ? fmtEt(cursorT) : '—'}`} />
                : <p className="nxp-rp-note">No option prints yet at this point in the replay.</p>}
            </>
      ) : (
        <p className="nxp-rp-note">Premium path unavailable — {occ.reason}.</p>
      )}
    </section>
  );
}
