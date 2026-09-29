/**
 * Desktop rail collapse state — one value for every shell (terminal + NexusFrame).
 *
 * The width lives in a CSS custom property on <html> (--qe-rail-w) so every
 * layout that pads for the rail (`lg:pl-[var(--qe-rail-w)]`) follows it with no
 * prop threading, and the choice survives reloads via localStorage (wrapped:
 * private mode / blocked storage just means "not remembered").
 */
import { useCallback, useEffect, useState } from 'react';

const KEY = 'qe-rail-collapsed';
const EVT = 'qe:rail-collapsed';
export const RAIL_W_OPEN = 196;
export const RAIL_W_COLLAPSED = 56;

function read(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

function apply(collapsed: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--qe-rail-w', `${collapsed ? RAIL_W_COLLAPSED : RAIL_W_OPEN}px`);
  document.documentElement.dataset.railCollapsed = collapsed ? 'true' : 'false';
}

// Apply before first paint of any shell so the layout never jumps.
if (typeof document !== 'undefined') apply(read());

export function useRailCollapsed(): [boolean, (next?: boolean) => void] {
  const [collapsed, setCollapsed] = useState(read);
  useEffect(() => {
    const sync = () => setCollapsed(read());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener('storage', sync); };
  }, []);
  useEffect(() => { apply(collapsed); }, [collapsed]);
  const toggle = useCallback((next?: boolean) => {
    setCollapsed((cur) => {
      const value = typeof next === 'boolean' ? next : !cur;
      try { localStorage.setItem(KEY, value ? '1' : '0'); } catch { /* not remembered — still works */ }
      apply(value);
      queueMicrotask(() => window.dispatchEvent(new Event(EVT)));
      return value;
    });
  }, []);
  return [collapsed, toggle];
}
