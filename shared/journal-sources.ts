/**
 * Journal sources — which ledger a journal screen is computed on.
 *
 * One journal UI, several books:
 *   mine            your own trades (manual, broker CSV, Alpaca import)
 *   bot             the Quant Bot's paper ledger (paper_positions), read-only
 *   desk            every published Nexus / trade-desk idea, scored as a trade, read-only
 *   trader:<slug>   a person's journal (Femi, Malik, Uzo, Bean…), filled by import
 *
 * The key travels in the URL (?journal=) and on every /api/journal read, so the
 * numbers on screen always name the book they were computed on.
 */

export type JournalKind = 'mine' | 'bot' | 'desk' | 'trader';
export type JournalKey = 'mine' | 'bot' | 'desk' | `trader:${string}`;

export const JOURNAL_PARAM = 'journal';

/** Trader slugs: lowercase, url-safe, short. */
export const TRADER_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function parseJournalKey(raw: string | null | undefined): JournalKey {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'bot' || v === 'desk' || v === 'mine') return v;
  if (v.startsWith('trader:')) {
    const slug = v.slice('trader:'.length);
    if (TRADER_SLUG_RE.test(slug)) return `trader:${slug}`;
  }
  return 'mine';
}

export function journalKindOf(key: JournalKey): JournalKind {
  return key.startsWith('trader:') ? 'trader' : (key as JournalKind);
}

export function traderSlugOf(key: JournalKey): string | null {
  return key.startsWith('trader:') ? key.slice('trader:'.length) : null;
}

/**
 * journal_trades.user_id / journal_notes.owner_id for a trader's book. Keyed by
 * the trader's immutable id (not the slug) so renaming a slug never orphans rows.
 */
export function traderOwnerId(traderId: string): string {
  return `trader:${traderId}`;
}

/** What the server says about the book behind a response — rendered as the basis line. */
export interface JournalSourceMeta {
  key: JournalKey;
  kind: JournalKind;
  /** Short name for the switcher: "Mine", "Bot", "Trade desk", "Femi". */
  label: string;
  /** One line naming exactly what the numbers are computed on. */
  basis: string;
  /** How dollar P&L is sized when the source has no position size of its own. */
  sizing?: string | null;
  /** Rows the source holds but the journal cannot score, with why. Never silently dropped. */
  excluded?: { count: number; reason: string }[];
  readOnly: boolean;
  /** The caller may add / edit / delete / import into this book. */
  canWrite: boolean;
  /** ISO time the rows were read. */
  asOf: string;
}

/** Entry in the switcher list (GET /api/journal/sources). */
export interface JournalSourceListItem {
  key: JournalKey;
  kind: JournalKind;
  label: string;
  hint: string;
  readOnly: boolean;
  canWrite: boolean;
}
