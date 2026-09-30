/**
 * useTickFlash — the restrained live-tick cue (Batch A, interactivity review X4).
 *
 * When a live number changes, its cell gets a 600 ms background tint that fades
 * (up = gain tint, down = loss tint). Background only: no size, weight or
 * position change, so nothing shifts. At most one flash per `minIntervalMs`
 * (default 1 s) per cell, so a fast feed reads as a calm pulse, not strobing.
 * prefers-reduced-motion: the CSS drops the fade and holds a static tint for
 * the same 600 ms (a colour change, not motion). Styles: index.css `.qe-tick*`.
 *
 *   const flash = useTickFlash(quote?.price);
 *   <span className={cn('tk-price', flash)}>{fmt(quote?.price)}</span>
 *
 * The first value never flashes (a page load is not a tick), and neither does
 * a change of identity — pass `resetKey` (e.g. the symbol) so switching
 * NVDA → AAPL doesn't paint the new price as a move.
 */
import { useEffect, useRef, useState } from 'react';

export type TickDir = 'up' | 'down';

export function useTickFlash(
  value: number | null | undefined,
  { minIntervalMs = 1000, durationMs = 600, resetKey }: { minIntervalMs?: number; durationMs?: number; resetKey?: unknown } = {},
): string {
  const prev = useRef<number | null>(null);
  const key = useRef<unknown>(resetKey);
  const last = useRef(0);
  const [flash, setFlash] = useState<{ dir: TickDir; n: number } | null>(null);

  useEffect(() => {
    const v = typeof value === 'number' && Number.isFinite(value) ? value : null;
    if (key.current !== resetKey) { key.current = resetKey; prev.current = v; setFlash(null); return; }
    const p = prev.current;
    prev.current = v;
    if (v == null || p == null || v === p) return;
    const now = Date.now();
    if (now - last.current < minIntervalMs) return;
    last.current = now;
    setFlash((f) => ({ dir: v > p ? 'up' : 'down', n: (f?.n ?? 0) + 1 }));
  }, [value, resetKey, minIntervalMs]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), durationMs);
    return () => window.clearTimeout(t);
  }, [flash, durationMs]);

  // Alternating a/b keyframe names restarts the animation on back-to-back ticks in the same direction.
  return flash ? `qe-tick qe-tick-${flash.dir} qe-tick-${flash.n % 2 ? 'a' : 'b'}` : '';
}
