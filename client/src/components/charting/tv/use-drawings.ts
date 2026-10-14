/**
 * useDrawings — one symbol's drawings for one user: load from the active
 * DrawingStore (device copy at once, server copy when it lands), commit
 * (persist + undo step), undo / redo, selection (one or many).
 * Drag previews never come through here — the pane moves the primitive
 * directly and commits once on release, so one drag = one undo step.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Drawing } from './drawing-geometry';
import { History } from './drawing-history';
import { getDrawingStore, type SyncStatus } from './drawing-store';

export interface DrawingsApi {
  drawings: Drawing[];
  commit: (next: Drawing[]) => void;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** The primary selection (the last one picked) — the mini-toolbar edits all of `selectedIds`. */
  selectedId: string | null;
  selectedIds: string[];
  setSelectedId: (id: string | null) => void;
  setSelectedIds: (ids: string[]) => void;
  sync: SyncStatus;
}

export function useDrawings(userId: string, symbol: string): DrawingsApi {
  const store = getDrawingStore();
  const scope = useMemo(() => ({ userId, symbol: symbol.toUpperCase() }), [userId, symbol]);
  const [drawings, setDrawings] = useState<Drawing[]>(() => store.load(scope));
  const [selectedIds, setSel] = useState<string[]>([]);
  const [, bump] = useState(0);
  const ref = useRef(drawings);
  const hist = useRef(new History<Drawing[]>());

  useEffect(() => {
    const load = () => { const d = store.load(scope); ref.current = d; setDrawings(d); };
    load();
    hist.current.clear();
    setSel([]);
    return store.subscribe(scope, () => {
      // A server copy landing replaces the set: undo steps refer to the old one.
      const d = store.load(scope); ref.current = d; setDrawings(d); hist.current.clear(); bump((n) => n + 1);
    });
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

  // A selection that no longer exists (undo removed it) drops out.
  const live = useMemo(() => selectedIds.filter((id) => drawings.some((d) => d.id === id)), [selectedIds, drawings]);
  const setSelectedId = useCallback((id: string | null) => setSel(id ? [id] : []), []);
  const setSelectedIds = useCallback((ids: string[]) => setSel(ids), []);

  return {
    drawings, commit, undo, redo,
    canUndo: hist.current.canUndo, canRedo: hist.current.canRedo,
    selectedId: live.length ? live[live.length - 1] : null,
    selectedIds: live,
    setSelectedId, setSelectedIds,
    sync: store.status?.(scope) ?? { state: 'device', at: null },
  };
}
