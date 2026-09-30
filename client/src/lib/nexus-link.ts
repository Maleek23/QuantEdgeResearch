/**
 * NEXUS deep links — open one idea selected on the NEXUS board.
 *
 *   /t?idea=<ideaId>&sym=<SYMBOL>
 *
 * NEXUS (components/dashboard/tools/nexus/nexus-tools.tsx) reads these once the
 * book has loaded: `idea` selects that setup into the detail tool; when the
 * idea is no longer in the live book, `sym` falls back to that symbol's current
 * setup; either way the focus ticker follows. Selecting a row on the board
 * writes the same params back (replaceState), so the URL is always shareable.
 */
export const NEXUS_IDEA_PARAM = 'idea';
export const NEXUS_SYM_PARAM = 'sym';

const SYM_RE = /^[A-Z0-9.^/-]{1,12}$/;

export function nexusIdeaHref(p: { ideaId?: string | null; symbol?: string | null }): string {
  const q = new URLSearchParams();
  if (p.ideaId) q.set(NEXUS_IDEA_PARAM, String(p.ideaId));
  const sym = p.symbol?.trim().toUpperCase();
  if (sym && SYM_RE.test(sym)) q.set(NEXUS_SYM_PARAM, sym);
  const qs = q.toString();
  return qs ? `/t?${qs}` : '/t';
}

/** What the current URL asks NEXUS to select (null when nothing). */
export function readNexusTarget(search: string): { ideaId: string | null; symbol: string | null } | null {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { return null; }
  const ideaId = q.get(NEXUS_IDEA_PARAM)?.trim().slice(0, 120) || null;
  const rawSym = q.get(NEXUS_SYM_PARAM)?.trim().toUpperCase() || null;
  const symbol = rawSym && SYM_RE.test(rawSym) ? rawSym : null;
  return ideaId || symbol ? { ideaId, symbol } : null;
}
