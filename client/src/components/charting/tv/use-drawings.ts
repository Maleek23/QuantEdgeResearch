/**
 * useDrawings — one symbol's drawings for one user: load from the active
 * DrawingStore, commit (persist + undo step), undo / redo, selection.
 * Drag previews never come through here — the pane moves the primitive
 * directly and commits once on release, so one drag = one undo step.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Drawing } from './drawing-geometry';
import { History } from './drawing-history';
import { getDrawingStore } from './drawing-store';

export interface DrawingsApi {
  drawings: Drawing[];
  commit: (next: Drawing[]) => void;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: boolean;
  canRedo: boolean;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

export function useDrawings(userId: string, symbol: string): DrawingsApi {
  const store = getDrawingStore();
  const scope = useMemo(() => ({ userId, symbol: symbol.toUpperCase() }), [userId, symbol]);
  const [drawings, setDrawings] = useState<Drawing[]>(() => store.load(scope));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, bump] = useState(0);
  const ref = useRef(drawings);
  const hist = useRef(new History<Drawing[]>());

  useEffect(() => {
    const load = () => { const d = store.load(scope); ref.current = d; setDrawings(d); };
    load();
    hist.current.clear();
    setSelectedId(null);
    return store.subscribe(scope, load);
  }, [store, scope]);

  const apply = useCallback((next: Drawing[]) => {
    ref.current = next;
    setDrawings(next);
    store.save(scope, next);
  }, [store, scope]);

  const commit = useCallback((next: Drawing[]) => {
    if (next === ref.current) return;
    hist.current.commit(ref.current);
    apply(next);
  }, [apply]);

  const undo = useCallback(() => {
    const prev = hist.current.undo(ref.current);
    if (!prev) return false;
    apply(prev); bump((n) => n + 1);
    return true;
  }, [apply]);

  const redo = useCallback(() => {
    const next = hist.current.redo(ref.current);
    if (!next) return false;
    apply(next); bump((n) => n + 1);
    return true;
  }, [apply]);

  // A selection that no longer exists (undo removed it) clears itself.
  const sel = selectedId && drawings.some((d) => d.id === selectedId) ? selectedId : null;

  return {
    drawings, commit, undo, redo,
    canUndo: hist.current.canUndo, canRedo: hist.current.canRedo,
    selectedId: sel, setSelectedId,
  };
}
