/**
 * REAL FRAME — the actual QuantEdge app, inside a landing frame.
 *
 * Operator rule (2026-10-07): the landing shows OUR ACTUAL PLATFORM UI, never a
 * hand-drawn recreation. Two sources, both the real UI:
 *
 *   1. A screen capture of the real app, when present:
 *      client/public/videos/<file>.mp4 (+ .webm) with a poster at
 *      client/public/posters/<file>.jpg (or videos/posters/, videos/<file>.jpg|png).
 *      Detected with a HEAD probe (content-type must be video/ — the SPA fallback
 *      answers missing files with HTML). Muted, looped, inline; play/pause button.
 *   2. Otherwise the live app itself: the real terminal route in a same-origin
 *      <iframe> with ?qe-demo=1 (demo/demo-embed.ts feeds it the dev harness's sample
 *      fixtures; nothing reaches the server or the visitor's storage). It renders at a
 *      real viewport (1280 wide on desktop, 430 wide on phones) and is CSS-scaled to the
 *      frame. It is mounted only once the frame is near the screen, is inert (no pointer
 *      or keyboard focus — a picture, not a second app), and is labelled for screen readers.
 *
 * Every frame carries a "Sample data" badge (rendered by the caller).
 */
import { useEffect, useRef, useState } from 'react';

export type RealDesk = 'nexus' | 'zerodte' | 'flow' | 'gex' | 'sectors' | 'bot' | 'journal' | 'today';

/** The app route each desk shows, and the file stem of its capture. */
export const DESK_ROUTE: Record<RealDesk, { path: string; file: string; label: string }> = {
  nexus: { path: '/t', file: 'nexus', label: 'NEXUS, the trading desk' },
  zerodte: { path: '/t?nx=0dte', file: '0dte', label: 'the 0DTE index session desk' },
  flow: { path: '/t?tab=flow', file: 'flow', label: 'FLOW, the options-flow tape' },
  gex: { path: '/t?tab=gex', file: 'gex', label: 'the GEX dealer-positioning workspace' },
  sectors: { path: '/t?tab=sectors', file: 'sectors', label: 'the Sectors rotation board' },
  bot: { path: '/t?tab=bot', file: 'bot', label: 'the Quantinum Bot paper ledger' },
  journal: { path: '/t?tab=journal', file: 'journal', label: 'the Journal dashboard' },
  today: { path: '/today', file: 'today', label: 'Today, the market read' },
};

type Clip = { mp4: string; webm: string | null; poster: string | null };
const probed = new Map<string, Clip | null | Promise<Clip | null>>();
const isA = (url: string, kind: 'video/' | 'image/') => fetch(url, { method: 'HEAD', credentials: 'omit' })
  .then((r) => r.ok && (r.headers.get('content-type') ?? '').startsWith(kind)).catch(() => false);
function probeClip(f: string): Promise<Clip | null> {
  const hit = probed.get(f);
  if (hit !== undefined) return Promise.resolve(hit);
  const mp4 = `/videos/${f}.mp4`;
  const posters = [`/posters/${f}.jpg`, `/videos/posters/${f}.jpg`, `/videos/${f}.jpg`, `/videos/${f}.png`];
  const p = isA(mp4, 'video/').then(async (ok) => {
    if (!ok) return null;
    const [webmOk, ...pOk] = await Promise.all([isA(`/videos/${f}.webm`, 'video/'), ...posters.map((u) => isA(u, 'image/'))]);
    return { mp4, webm: webmOk ? `/videos/${f}.webm` : null, poster: posters[pOk.findIndex(Boolean)] ?? null } as Clip;
  }).then((c) => { probed.set(f, c); return c; });
  probed.set(f, p);
  return p;
}

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!m) return;
    setR(m.matches);
    const on = () => setR(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return r;
}

const currentMode = () => (document.documentElement.getAttribute('data-mode') === 'light' ? 'light' : 'dark');
function useDocMode() {
  const [mode, setMode] = useState<'light' | 'dark'>(() => (typeof document === 'undefined' ? 'dark' : currentMode()));
  useEffect(() => {
    const mo = new MutationObserver(() => setMode(currentMode()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
    return () => mo.disconnect();
  }, []);
  return mode;
}

/**
 * True once the landing itself has loaded and the main thread has an idle moment.
 * Frames (even the eager hero device) start only then, so the embedded app — a
 * second run of the whole bundle — never competes with the landing's first paint
 * or holds up its load event. Until then the .rf-wait sheen shows, and an iframe
 * stays at opacity 0 until it has loaded (.rf-app.on), so nothing flashes.
 */
let pageSettled = false;
type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
function usePageSettled() {
  const [ok, setOk] = useState(pageSettled);
  useEffect(() => {
    if (ok) return;
    const w = window as IdleWindow;
    let idle = 0; let t: ReturnType<typeof setTimeout> | undefined;
    const done = () => { pageSettled = true; setOk(true); };
    const go = () => { if (w.requestIdleCallback) idle = w.requestIdleCallback(done, { timeout: 1200 }); else t = setTimeout(done, 200); };
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
    return () => { window.removeEventListener('load', go); if (idle) w.cancelIdleCallback?.(idle); clearTimeout(t); };
  }, [ok]);
  return ok;
}

const PLAY = <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>;
const PAUSE = <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg>;
const fmtRuntime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * The real app for one desk, filling its (aspect-ratio'd) parent.
 * `onMeta` reports what is showing: a capture (with its runtime) or the live app.
 */
export function RealFrame({ desk, onMeta, eager = false, viewport = 'auto' }: {
  desk: RealDesk; eager?: boolean; viewport?: 'auto' | 'phone'; onMeta?: (m: { kind: 'video' | 'live'; runtime: string | null }) => void;
}) {
  const route = DESK_ROUTE[desk];
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(eager);
  const pageReady = usePageSettled();
  const [onScreen, setOnScreen] = useState(false);
  const [clip, setClip] = useState<Clip | null | undefined>(undefined);
  const [videoFailed, setVideoFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const reduce = useReducedMotion();
  const mode = useDocMode();

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    if (typeof IntersectionObserver === 'undefined') { setNear(true); setOnScreen(true); return () => ro.disconnect(); }
    const near1 = new IntersectionObserver(([e]) => { if (e.isIntersecting) setNear(true); }, { rootMargin: '600px 0px' });
    const vis = new IntersectionObserver(([e]) => setOnScreen(e.intersectionRatio >= 0.4), { threshold: [0, 0.4, 1] });
    near1.observe(el); vis.observe(el);
    return () => { ro.disconnect(); near1.disconnect(); vis.disconnect(); };
  }, []);

  useEffect(() => {
    if (!near || !pageReady) return;
    let live = true;
    setClip(undefined); setVideoFailed(false); setLoaded(false);
    // Phone frames only play a portrait capture (<file>-phone.mp4); a 16:9 loop never goes in a phone.
    const clipFile = viewport === 'phone' ? `${route.file}-phone` : route.file;
    probeClip(clipFile).then((c) => { if (live) setClip(c); });
    return () => { live = false; };
  }, [near, pageReady, route.file, viewport]);

  const useVideo = !!clip && !videoFailed;
  const useLive = (near && pageReady && clip === null) || (!!clip && videoFailed);
  useEffect(() => { if (useLive) onMeta?.({ kind: 'live', runtime: null }); }, [useLive, onMeta]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (onScreen && !reduce && !userPaused) v.play().catch(() => undefined);
    else v.pause();
  }, [onScreen, reduce, userPaused, useVideo]);

  // The app renders at a real viewport and is scaled to the frame.
  const phone = viewport === 'phone' || (size.w > 0 && size.w < 480);
  const vw = viewport === 'phone' ? 390 : phone ? 430 : 1280;
  const scale = size.w ? size.w / vw : 0;
  const vh = scale ? Math.round(size.h / scale) : 810;
  const src = `${route.path}${route.path.includes('?') ? '&' : '?'}qe-demo=1&mode=${mode}`;

  return (
    <div className="rf" ref={boxRef}>
      {useVideo && clip && (
        <>
          <video ref={videoRef} muted loop playsInline preload="metadata" poster={clip.poster ?? undefined}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setVideoFailed(true)}
            onLoadedMetadata={(e) => onMeta?.({ kind: 'video', runtime: Number.isFinite(e.currentTarget.duration) ? fmtRuntime(e.currentTarget.duration) : null })}
            aria-label={`Screen recording of ${route.label}, on sample data`}>
            {clip.webm && <source src={clip.webm} type="video/webm" />}
            <source src={clip.mp4} type="video/mp4" onError={() => setVideoFailed(true)} />
          </video>
          <button type="button" className={`rf-play${playing ? ' is-playing' : ''}`}
            onClick={() => { const v = videoRef.current; if (!v) return; if (v.paused) { setUserPaused(false); v.play().catch(() => undefined); } else { setUserPaused(true); v.pause(); } }}
            aria-label={playing ? 'Pause the video' : 'Play the video'}>{playing ? PAUSE : PLAY}</button>
        </>
      )}
      {useLive && scale > 0 && (
        <iframe key={`${desk}-${mode}-${phone ? 'p' : 'd'}`} className={`rf-app${loaded ? ' on' : ''}`} src={src}
          title={`${route.label} — the real QuantEdge app on sample data`} loading={eager ? 'eager' : 'lazy'} tabIndex={-1}
          {...{ inert: '' }} onLoad={() => setTimeout(() => setLoaded(true), 900)}
          style={{ width: vw, height: vh, transform: `scale(${scale})` }} />
      )}
      {!(useVideo || loaded) && <div className="rf-wait" aria-hidden="true"><span /></div>}
    </div>
  );
}
