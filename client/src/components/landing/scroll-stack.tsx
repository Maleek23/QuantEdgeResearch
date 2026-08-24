/**
 * SCROLL STACK — one section that carries three surfaces.
 *
 * This replaces three FeatureSection blocks that differed from each other mainly
 * by a `reverse` boolean. Repeating one layout five times teaches a reader that
 * every section is the same section, and they stop looking; the fix is a
 * different shape, not different copy.
 *
 * The copy column pins while the boards advance beside it, so the page spends
 * its scroll on the product rather than on more prose. Each board is the real
 * component against its live endpoint — nothing here depicts a surface the app
 * does not have.
 *
 * All three boards stay mounted. Unmounting on switch would refetch on every
 * scroll reversal, and these endpoints are not cheap; opacity is the cheaper lie
 * to tell the compositor. Net mount count is unchanged from the three separate
 * sections this replaces.
 *
 * Falls back to a plain stacked list under `prefers-reduced-motion` and below
 * lg, where pinning a column against a small viewport is hostile rather than
 * cinematic.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface StackItem {
  id: string;
  label: string;
  labelClass: string;
  headline: string;
  description: string;
  bullets: string[];
  board: ReactNode;
}

function Copy({ item }: { item: StackItem }) {
  return (
    <div>
      <span
        className={cn(
          'text-[10px] font-mono font-bold uppercase tracking-widest',
          item.labelClass,
        )}
      >
        {item.label}
      </span>
      <h2 className="text-2xl sm:text-3xl font-bold text-foreground mt-3 mb-4 leading-tight">
        {item.headline}
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed max-w-lg mb-5">
        {item.description}
      </p>
      <ul className="space-y-2">
        {item.bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-sm text-foreground/80">
            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--trade-bullish)] flex-shrink-0" />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The board in its browser frame, capped so a tall surface reads as a preview. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-xl border border-border/60 overflow-hidden bg-card shadow-2xl shadow-black/30">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border/50">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]/50" />
        </div>
        <span className="ui-data text-[9px] text-muted-foreground ml-2">quantedgelab.net</span>
      </div>
      <div
        className="relative max-h-[520px] overflow-y-auto [&_.rounded-xl]:rounded-none [&_.rounded-xl]:border-0"
        style={{
          maskImage: 'linear-gradient(to bottom, black 84%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 84%, transparent 100%)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ScrollStack({ items }: { items: StackItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);

  // Progress is measured from the live bounding rect on every frame rather than
  // from framer's useScroll. useScroll caches the target's range at mount, and
  // these boards change height as their data arrives — which left the cached
  // range stale and the stack showing the wrong item for a given scroll offset.
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const range = el.offsetHeight - window.innerHeight;
      if (range <= 0) return;
      const progress = Math.max(0, Math.min(1, -el.getBoundingClientRect().top / range));
      const next = Math.max(0, Math.min(items.length - 1, Math.floor(progress * items.length)));
      setActive((cur) => (cur === next ? cur : next));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [items.length]);

  // Pinning is opt-in: only on a large viewport, and never against a stated
  // preference for reduced motion.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1024px)');
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPinned(wide.matches && !calm.matches);
    sync();
    wide.addEventListener('change', sync);
    calm.addEventListener('change', sync);
    return () => {
      wide.removeEventListener('change', sync);
      calm.removeEventListener('change', sync);
    };
  }, []);

  if (!pinned) {
    return (
      <div className="px-6 py-16 max-w-7xl mx-auto space-y-20">
        {items.map((item) => (
          <div key={item.id} className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <Copy item={item} />
            <Frame>{item.board}</Frame>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ height: `${items.length * 100}vh` }} className="relative">
      <div className="sticky top-24 h-[calc(100vh-7rem)] flex items-center">
        <div className="px-6 max-w-7xl mx-auto w-full grid grid-cols-[auto_1fr_1fr] gap-8 items-center">
          {/* Position rail. Encodes where you are in the section — three surfaces,
              this one — rather than decorating the margin. */}
          <div className="flex flex-col gap-2" aria-hidden>
            {items.map((item, i) => (
              <div
                key={item.id}
                className={cn(
                  'w-px transition-all duration-500',
                  i === active
                    ? 'h-10 bg-[var(--brand-cyan)]'
                    : 'h-5 bg-border',
                )}
              />
            ))}
          </div>

          {/* Copy — crossfades in place while the column stays put. */}
          <div className="relative">
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={false}
                animate={{ opacity: i === active ? 1 : 0, y: i === active ? 0 : 8 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className={cn(i === active ? 'relative' : 'absolute inset-0 pointer-events-none')}
                aria-hidden={i !== active}
              >
                <Copy item={item} />
              </motion.div>
            ))}
          </div>

          {/* Boards — all mounted, only the active one visible. */}
          <div className="relative">
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={false}
                animate={{ opacity: i === active ? 1 : 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className={cn(
                  i === active
                    ? 'relative'
                    : 'absolute inset-0 pointer-events-none overflow-hidden',
                )}
                aria-hidden={i !== active}
              >
                <Frame>{item.board}</Frame>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
