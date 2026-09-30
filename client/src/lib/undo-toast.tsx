/**
 * The app's feedback toasts for mutations — one look everywhere:
 *
 *   undoToast({ title: 'Removed NVDA from watchlist', onUndo })   6 s, Undo button
 *   failToast('Couldn't watch NVDA', err, retry?)                 the server's reason
 *   doneToast('Link copied')                                      plain notice
 *
 * Undo toasts pause while hovered or focused (Radix), so the button never
 * vanishes under the pointer. The copy is sentence case, no exclamation marks.
 */
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { UNDO_WINDOW_MS, reasonOf } from './optimistic';

export function undoToast({ title, description, onUndo, duration = UNDO_WINDOW_MS }: {
  title: string;
  description?: string;
  onUndo: () => void;
  duration?: number;
}) {
  return toast({
    title,
    description,
    duration,
    action: (
      <ToastAction altText={`Undo: ${title}`} onClick={onUndo} data-testid="toast-undo">
        Undo
      </ToastAction>
    ),
  });
}

export function failToast(title: string, err?: unknown, retry?: () => void) {
  return toast({
    variant: 'destructive',
    title,
    description: err === undefined ? undefined : reasonOf(err),
    duration: retry ? UNDO_WINDOW_MS : 4_000,
    action: retry ? <ToastAction altText="Retry" onClick={retry}>Retry</ToastAction> : undefined,
  });
}

export function doneToast(title: string, description?: string) {
  return toast({ title, description });
}
