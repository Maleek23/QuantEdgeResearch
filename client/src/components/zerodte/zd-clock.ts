/**
 * The 0DTE desk's clock. Ticks so countdowns, ages and actionability move
 * between the minute refetches. The DEV harness (/dev/zerodte) pins it with
 * window.__ZD_NOW__ so a fixture renders as of its own ET time.
 */
import { useEffect, useState } from 'react';

const pinned = (): number | null => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const v = (window as unknown as { __ZD_NOW__?: number }).__ZD_NOW__;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

export const zdNow = () => pinned() ?? Date.now();

export function useZdNow(tickMs = 1000): number {
  const [now, setNow] = useState(zdNow);
  useEffect(() => {
    if (pinned() != null) return;
    const id = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);
  return now;
}
