/**
 * Motion helpers: a bounded chart surface whose plotted data reveals once, and
 * a route-change reveal that never delays navigation or freezes the old page.
 * Both honour prefers-reduced-motion.
 *
 * Portions adapted from the Trade Journal web app (apps/web/src/components/
 * charts/chart-frame.tsx and page-transition.tsx), MIT License, Copyright (c)
 * 2026 LuxAlgo Global, LLC — see ./LICENSE-luxalgo.txt.
 */
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/utils';

/** Plotting surface; animation never changes layout or hit testing. */
export function LuxChartFrame({ children, height, className }: { children: ReactNode; height: number | string; className?: string }) {
  return <div className={cn('lx-chart-frame', className)} style={{ height }}>{children}</div>;
}

/**
 * Fade the element in (0.7 → 1, 160ms) whenever `key` changes after mount.
 * Attach to a page's scroll container with the route path as the key.
 */
export function usePageReveal(ref: RefObject<HTMLElement>, key: string) {
  const previous = useRef(key);
  useLayoutEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = ref.current?.animate?.([{ opacity: 0.7 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
    return () => animation?.cancel();
  }, [key, ref]);
}
