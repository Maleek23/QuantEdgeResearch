/**
 * useDismissable — the Escape / focus-return / optional focus-trap contract for
 * the hand-rolled popovers and sheets in the shell chrome (SR 11-7 F7.7, T7).
 *
 *   const panelRef = useRef<HTMLDivElement>(null);
 *   const triggerRef = useRef<HTMLButtonElement>(null);
 *   useDismissable(open, () => setOpen(false), { panelRef, triggerRef, trap: true });
 *
 * While `open`: Escape calls onClose; focus moves to the first focusable element
 * inside the panel; with `trap`, Tab / Shift+Tab cycle inside the panel. When it
 * closes, focus goes back to the trigger (so keyboard users aren't dumped at
 * the top of the document).
 */
import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDismissable(
  open: boolean,
  onClose: () => void,
  opts: {
    panelRef: RefObject<HTMLElement | null>;
    triggerRef?: RefObject<HTMLElement | null>;
    trap?: boolean;
  },
) {
  const { panelRef, triggerRef, trap = false } = opts;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) {
        wasOpen.current = false;
        const trigger = triggerRef?.current;
        // Only pull focus back if it would otherwise be lost (still inside the
        // closed panel or on <body>) — never steal it from a page we navigated to.
        const active = document.activeElement;
        if (trigger && (active === document.body || active == null || !document.contains(active))) trigger.focus();
      }
      return;
    }
    wasOpen.current = true;

    // Move focus into the panel once it has mounted (motion.div renders next frame).
    const raf = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        triggerRef?.current?.focus();
        return;
      }
      if (trap && e.key === 'Tab' && panelRef.current) {
        const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement as HTMLElement | null;
        const inside = active ? panelRef.current.contains(active) : false;
        if (e.shiftKey && (active === first || !inside)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (active === last || !inside)) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, panelRef, triggerRef, trap]);
}
