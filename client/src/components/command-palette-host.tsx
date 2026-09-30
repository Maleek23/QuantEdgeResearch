/**
 * CommandPaletteHost — keeps the global ⌘K palette (cmdk + Radix dialog +
 * the destination catalogue) out of the entry chunk. Perf 2026-09-30.
 *
 * The palette mounts on first use (⌘K / the `qe:open-command-palette` event,
 * opened immediately) or once the browser is idle (closed, so its own ⌘K and
 * ⌘1–6 listeners take over). Until then this host owns ⌘K so an early press is
 * never lost — it just waits for the chunk.
 */
import { lazy, Suspense, useEffect, useState } from 'react';

const CommandPalette = lazy(() => import('./command-palette').then((m) => ({ default: m.CommandPalette })));

export function CommandPaletteHost() {
  const [mounted, setMounted] = useState(false);
  const [openOnMount, setOpenOnMount] = useState(false);

  useEffect(() => {
    if (mounted) return;
    const mount = (open: boolean) => { if (open) setOpenOnMount(true); setMounted(true); };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); mount(true); }
    };
    const onOpen = () => mount(true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('qe:open-command-palette', onOpen);
    const hasIdle = typeof window.requestIdleCallback === 'function';
    const idle = hasIdle ? window.requestIdleCallback(() => mount(false), { timeout: 5000 }) : window.setTimeout(() => mount(false), 3000);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('qe:open-command-palette', onOpen);
      if (hasIdle) window.cancelIdleCallback(idle); else window.clearTimeout(idle);
    };
  }, [mounted]);

  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <CommandPalette defaultOpen={openOnMount} />
    </Suspense>
  );
}
