/**
 * Bot runs — every paper portfolio the Quant Bot has traded, as one labelled list.
 *
 * WHY THIS EXISTS (2026-09-29)
 * The bot has owned three portfolios: the 10K pilot, and TWO rows both named
 * "Quant Bot · 100K" (Aug 26–Sep 9, then a fresh one from Sep 24). The journal's
 * Bot book looked its portfolio up by name with LIMIT 1, so it showed only the
 * first 100K run (+$429) and the second (−$3,500) was invisible — a record that
 * was incomplete and flattering. Every bot surface now reads every run, each
 * labelled, and a stat always says which runs it covers.
 *
 * Pure: no DB, no clock except what the caller passes — the journal tests run it.
 * DB rows are never renamed; duplicate names are disambiguated for display only.
 */

export interface BotPortfolioLike {
  id: string;
  name: string;
  startingCapital: number;
  createdAt: string | Date | null;
}

export interface BotPositionSpanRow {
  portfolioId: string;
  status: string;
  entryTime: string | null;
  exitTime: string | null;
}

export interface BotRunInfo {
  id: string;
  /** The DB name, untouched. */
  name: string;
  /** DB name, suffixed with a short id when another bot portfolio has the same name. */
  displayName: string;
  /** 1-based, chronological by portfolio creation. */
  runNo: number;
  /** "Run 3 · 100K · Sep 24–" — the label every surface uses. */
  label: string;
  /** "Run 3" */
  short: string;
  startingCapital: number;
  /** YYYY-MM-DD (New York) of the first fill, else of creation. */
  start: string | null;
  /** YYYY-MM-DD of the last fill/exit for a retired run; null while the run is the one trading. */
  end: string | null;
  /** The portfolio the bot trades now (the most recent one carrying the bot's portfolio name). */
  active: boolean;
  closed: number;
  open: number;
}

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
export function nyDay(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  const d = typeof v === 'string' ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? null : dayFmt.format(d);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function shortDay(day: string | null): string {
  if (!day) return '?';
  const [, m, d] = day.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} ${Number(d)}`;
}

function capLabel(c: number): string {
  if (!Number.isFinite(c) || c <= 0) return '';
  return c >= 1000 ? `${Math.round(c / 1000)}K` : `$${c}`;
}

const ts = (v: string | Date | null | undefined) => (v ? new Date(v).getTime() : 0) || 0;

/**
 * The portfolio the bot trades: the MOST RECENT one named `name` owned by the bot.
 * (Before this the bot took whichever row the DB returned first among duplicates.)
 */
export function pickActiveBotPortfolio<T extends BotPortfolioLike>(portfolios: T[], name: string): T | null {
  const same = portfolios.filter((p) => p.name === name);
  if (!same.length) return null;
  return same.reduce((a, b) => (ts(b.createdAt) > ts(a.createdAt) ? b : a));
}

export function labelBotRuns(
  portfolios: BotPortfolioLike[],
  positions: BotPositionSpanRow[],
  activeName: string,
): BotRunInfo[] {
  const ordered = [...portfolios].sort((a, b) => ts(a.createdAt) - ts(b.createdAt) || a.id.localeCompare(b.id));
  const active = pickActiveBotPortfolio(ordered, activeName);
  const nameCount = new Map<string, number>();
  for (const p of ordered) nameCount.set(p.name, (nameCount.get(p.name) ?? 0) + 1);

  return ordered.map((p, i) => {
    const mine = positions.filter((x) => x.portfolioId === p.id);
    const days: string[] = [];
    for (const x of mine) {
      const a = nyDay(x.entryTime); if (a) days.push(a);
      const b = x.status === 'closed' ? nyDay(x.exitTime) : null; if (b) days.push(b);
    }
    days.sort();
    const isActive = active?.id === p.id;
    const start = days[0] ?? nyDay(p.createdAt);
    const end = isActive ? null : days[days.length - 1] ?? start;
    const runNo = i + 1;
    const span = isActive ? `${shortDay(start)}–` : start === end ? shortDay(start) : `${shortDay(start)}–${shortDay(end)}`;
    const cap = capLabel(p.startingCapital);
    return {
      id: p.id,
      name: p.name,
      displayName: (nameCount.get(p.name) ?? 0) > 1 ? `${p.name} #${p.id.slice(0, 6)}` : p.name,
      runNo,
      short: `Run ${runNo}`,
      label: [`Run ${runNo}`, cap, span].filter(Boolean).join(' · '),
      startingCapital: p.startingCapital,
      start,
      end,
      active: isActive,
      closed: mine.filter((x) => x.status === 'closed').length,
      open: mine.filter((x) => x.status !== 'closed').length,
    };
  });
}

/** "Run 2 + Run 3" / "all 3 runs" / "no run" — which runs a set of rows covers. */
export function runsCovered(runIds: Iterable<string | null | undefined>, runs: BotRunInfo[]): string {
  const ids = new Set([...runIds].filter((x): x is string => !!x));
  const hit = runs.filter((r) => ids.has(r.id));
  if (!hit.length) return 'no run';
  if (hit.length === runs.length && runs.length > 1) return `all ${runs.length} runs`;
  return hit.map((r) => r.short).join(' + ');
}
