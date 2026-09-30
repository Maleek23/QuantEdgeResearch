/**
 * UNDO / REDO for chart drawings — snapshot stack, pure.
 *
 * Drawings per symbol are a handful of small objects, so each step stores the
 * whole list (immutable arrays, shared structure) rather than diff commands:
 * nothing to invert, nothing to get wrong. `commit(next)` records the state
 * BEFORE the change; undo walks back, redo forward; a fresh commit after an
 * undo drops the redo branch. Capped so a long session cannot grow unbounded.
 */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(private readonly cap = 100) {}

  /** Record `prev` (the state being replaced) as an undo step. */
  commit(prev: T): void {
    this.past.push(prev);
    if (this.past.length > this.cap) this.past.shift();
    this.future = [];
  }

  /** Step back from `current`; null when there is nothing to undo. */
  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    return prev;
  }

  /** Step forward from `current`; null when there is nothing to redo. */
  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    return next;
  }

  clear(): void { this.past = []; this.future = []; }
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get depth(): { undo: number; redo: number } { return { undo: this.past.length, redo: this.future.length }; }
}
