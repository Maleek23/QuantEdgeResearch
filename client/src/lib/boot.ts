/**
 * BOOT — the one branded boot screen (#app-loader in client/index.html) and
 * when it leaves.
 *
 * Before 2026-09-29 a cold load of /t showed four screens in a row: the HTML
 * spinner (removed the moment main.tsx ran, before React had painted), the
 * App-level <PageLoader/> spinner, ProtectedRoute's auth spinner, then the
 * terminal's own tab spinner — each a different size, colour and position.
 *
 * Now the boot screen stays up while ANY boot-phase fallback is mounted
 * (route chunk, auth check, first page chunk, first layout read). Those
 * fallbacks render <BootHold/> (components/ui/qe-loading.tsx) instead of a
 * spinner of their own; each hold registers here. When the last hold
 * unmounts — and no new one mounts within a frame — the boot screen fades
 * out (≤150 ms, instant under prefers-reduced-motion) and never returns:
 * every later load is a page skeleton inside the mounted shell.
 *
 * VISUAL MODE (2026-09-29): the boot screen is drawn in the saved mode. An
 * inline script in client/index.html sets html[data-mode] (+ the legacy
 * .dark/.light classes) before first paint, and the loader's colours are
 * per-mode CSS variables keyed on that attribute — so there is no flash of
 * the wrong ground at boot or when the loader fades. armBoot() re-asserts the
 * mode if that script did not run (lib/visual-mode.ts is the source of truth).
 */
import { applyMode, getMode } from './visual-mode';

const LOADER_ID = 'app-loader';
const SETTLE_MS = 60;      // a hold swapped for the next one in the same commit must not flash
const HARD_CAP_MS = 15_000; // never trap the user behind the boot screen
/** The branded boot screen (gamma wave) is shown for at least this long on the
 *  first load of a browser session, so it reads as an intro, not a flicker.
 *  Later loads in the same session release as soon as the page can paint. */
const MIN_SHOW_MS = 1400;
const firstOfSession = (() => {
  try {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    if (sessionStorage.getItem('qe-boot-seen')) return false;
    sessionStorage.setItem('qe-boot-seen', '1');
    return true;
  } catch { return false; }
})();

let holds = 0;
let released = false;
let timer: ReturnType<typeof setTimeout> | undefined;

const loaderEl = () => (typeof document === 'undefined' ? null : document.getElementById(LOADER_ID));

/** True while the boot screen is still covering the app. */
export function isBooting(): boolean {
  return !released && !!loaderEl();
}

function schedule() {
  if (released || holds > 0) return;
  clearTimeout(timer);
  const wait = firstOfSession ? Math.max(SETTLE_MS, MIN_SHOW_MS - performance.now()) : SETTLE_MS;
  timer = setTimeout(() => { if (holds === 0) releaseBoot(); }, wait);
}

/** Register a boot-phase fallback; returns its release (use in a layout effect). */
export function holdBoot(): () => void {
  if (released) return () => {};
  holds++;
  clearTimeout(timer);
  return () => { holds = Math.max(0, holds - 1); schedule(); };
}

/** Called once after the first React render: release as soon as nothing holds. */
export function armBoot() {
  if (typeof window === 'undefined') return;
  if (!document.documentElement.hasAttribute('data-mode')) applyMode(getMode());
  requestAnimationFrame(() => schedule());
  setTimeout(releaseBoot, HARD_CAP_MS);
}

/** Fade the boot screen out and remove it. Idempotent. */
export function releaseBoot() {
  if (released) return;
  released = true;
  clearTimeout(timer);
  const el = loaderEl();
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { el.remove(); return; }
  el.classList.add('out');
  setTimeout(() => el.remove(), 160);
}

/**
 * LANDING SKELETON — `/` for a visitor skips the boot screen (client/index.html);
 * instead an inline-styled, text-free skeleton of the landing's nav + hero
 * (#qe-landing-skel, dark/light per html[data-mode]) covers the page until the
 * landing has mounted WITH its stylesheet. pages/landing-v2.tsx calls this in a
 * layout effect (before its first paint); App.tsx calls it when `/` resolves to
 * another route; index.html removes it after 15 s regardless. Idempotent.
 */
export function releaseLandingSkeleton() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('qe-landing-skel');
  if (!el || el.classList.contains('out')) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { el.remove(); return; }
  el.classList.add('out');
  setTimeout(() => el.remove(), 160);
}
