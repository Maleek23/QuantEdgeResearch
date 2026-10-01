/**
 * GxPop — the small anchored popover the GEX workspace uses to keep tool
 * headers to ONE row (operator 2026-10-01: the matrix header carried 3–4
 * lines of source / units / help). The (i) holds the explanation and units,
 * the ⋯ holds rarely used toggles.
 *
 * Portalled to <body> (fixed, positioned from the trigger) so a short tile's
 * overflow never clips it; re-roots .flowdash/.nexus-vars (+ .light when the
 * trigger sits in a light frame) so theme tokens still apply. Closes on
 * Escape (focus returns to the trigger), outside press, scroll and resize.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info, MoreHorizontal } from 'lucide-react';

export function GxPop({ kind = 'info', label, children, width = 320, className }: {
  /** 'info' = (i) explanation/units · 'menu' = ⋯ rarely used settings */
  kind?: 'info' | 'menu';
  /** accessible name + tooltip of the trigger */
  label: string;
  children: ReactNode;
  width?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number; light: boolean } | null>(null);
  const close = useCallback((refocus = false) => { setOpen(false); if (refocus) btn.current?.focus(); }, []);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = Math.min(width, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    const below = window.innerHeight - r.bottom - 12;
    const top = below >= 160 ? r.bottom + 4 : Math.max(8, r.top - Math.min(420, r.top - 12) - 4);
    const light = !!btn.current.closest('.nexus-vars.light') || document.documentElement.dataset.mode === 'light';
    setPos({ top, left, maxH: below >= 160 ? below : Math.min(420, r.top - 12), light });
  }, [open, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || btn.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } };
    const onScroll = (e: Event) => { if (panel.current && e.target instanceof Node && panel.current.contains(e.target)) return; close(); };
    const onResize = () => close();
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close]);

  const Icon = kind === 'menu' ? MoreHorizontal : Info;
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`gx-pop-btn${open ? ' on' : ''}${className ? ` ${className}` : ''}`}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon size={14} aria-hidden />
      </button>
      {open && pos && createPortal(
        <div className={`flowdash nexus-vars gx-pop-layer${pos.light ? ' light' : ''}`}>
          <div
            ref={panel}
            role="dialog"
            aria-label={label}
            className={`gx-pop gx-pop-${kind}`}
            style={{ top: pos.top, left: pos.left, width: Math.min(width, window.innerWidth - 16), maxHeight: pos.maxH }}
          >
            {children}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
