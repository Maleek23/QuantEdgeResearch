/**
 * Fit-to-viewport: the shells are exactly one viewport tall (header + main +
 * footer, never taller), and <main> scrolls inside itself. Full-height
 * workspaces (NEXUS, CHART, FLOW, GEX, LEAPS, CRYPTO) used to size themselves
 * with calc(100dvh − 98px) — a guess at the chrome that was off by the real
 * header/footer/banner heights, so the whole window scrolled ~30px.
 *
 * This measures <main>'s CONTENT box (minus its padding, e.g. the mobile dock
 * clearance) and publishes it as --qe-main-h on <html>; workspaces read
 * `height: var(--qe-main-h, calc(100dvh - 98px))` and fill it exactly.
 */
import { useLayoutEffect, type RefObject } from 'react';

export function useMainHeightVar(ref: RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const publish = () => {
      const cs = getComputedStyle(el);
      const h = el.clientHeight - parseFloat(cs.paddingTop || '0') - parseFloat(cs.paddingBottom || '0');
      if (h > 0) root.style.setProperty('--qe-main-h', `${Math.floor(h)}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener('resize', publish);
    return () => { ro.disconnect(); window.removeEventListener('resize', publish); };
  }, [ref]);
}
