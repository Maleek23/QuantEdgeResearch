/**
 * BOT tools — the BOT board (components/bot/bot-nexus.tsx) split into
 * dashboard tools, one board section per tile.
 *
 * Each tool renders <BotNexus only="…"> — the board's own markup and logic —
 * and reads the SAME queries through useBotFeeds() (identical react-query
 * keys), so ten BOT tools on screen still cost one request per feed. A lone
 * section only enables the feeds it shows. The wrapper here owns the frame's
 * provenance (useToolReport) and the loading / error gate, so a failed paper
 * ledger reads as an error — never as "flat, the bot holds nothing".
 */
import type { ReactNode } from 'react';
import { QEError, QELoading } from '@/components/ui/qe-states';
import { BotNexus, useBotFeeds, type BotFeeds, type BotSection } from '@/components/bot/bot-nexus';
import { useToolReport, type ToolReport } from '../../frame';
import './bot-tools.css';

const iso = (ms: number | undefined) => (ms ? new Date(ms).toISOString() : null);
/** newest valid ISO of the given candidates, or null */
function newest(...c: (string | null | undefined)[]): string | null {
  let best: string | null = null; let bt = -Infinity;
  for (const s of c) {
    const t = s ? Date.parse(s) : NaN;
    if (Number.isFinite(t) && t > bt) { bt = t; best = s!; }
  }
  return best;
}
type Q = BotFeeds[keyof BotFeeds];
const failed = (...qs: Q[]) => qs.filter((q) => q.isError).length;

/** Freshness per section — the ISO of the newest datum the section shows. */
function reportFor(only: BotSection, f: BotFeeds): ToolReport {
  const conv = f.conv.data; const cats = f.cats.data;
  const lastCat = cats?.catalysts?.[0]?.timestamp;
  const jobFeeds = [f.conv, f.flow, f.leaps, f.econ, f.cats, f.pulse, f.realtime];
  switch (only) {
    case 'stats': {
      const bad = failed(...jobFeeds, f.outcomes);
      return { asOf: newest(conv?.generatedAt, f.outcomes.data?.asOf), note: bad ? `${bad} feed${bad > 1 ? 's' : ''} failed` : undefined, tone: bad ? 'warn' : 'ok' };
    }
    case 'jobs': {
      const bad = failed(...jobFeeds);
      return { note: bad ? `${bad} feed${bad > 1 ? 's' : ''} failed` : 'status = output freshness', tone: bad ? 'warn' : 'ok' };
    }
    case 'book': {
      const b = f.book.data;
      const open = b?.openPositions ?? [];
      // Marks are re-priced on read; each open row carries lastPriceUpdate.
      const marks = newest(...open.map((p) => (p as { lastPriceUpdate?: string | null }).lastPriceUpdate));
      if (!b) return { asOf: f.book.isError ? null : undefined, note: f.book.isError ? 'ledger unavailable' : undefined, tone: f.book.isError ? 'warn' : 'ok' };
      return open.length
        ? { asOf: marks, note: `${open.length} open · marks`, tone: f.book.isError ? 'warn' : 'ok' }
        : { asOf: iso(f.book.dataUpdatedAt), note: 'flat · read time', tone: f.book.isError ? 'warn' : 'ok' };
    }
    case 'history': {
      const r = f.record.data;
      if (!r) return { asOf: f.record.isError ? null : undefined, note: f.record.isError ? 'record unavailable' : undefined, tone: f.record.isError ? 'warn' : 'ok' };
      const rows = r.trades ?? [];
      const closed = rows.filter((x) => x.status === 'closed');
      const runs = r.journal?.runs?.length ?? 0;
      return { asOf: newest(...closed.map((c) => c.exitTime)), note: `${closed.length} closed · ${runs} run${runs === 1 ? '' : 's'} · newest exit`, tone: f.record.isError ? 'warn' : 'ok' };
    }
    case 'ledger': {
      if (!f.ledger.data) return { asOf: f.ledger.isError ? null : undefined, note: f.ledger.isError ? 'refresh failed' : undefined, tone: f.ledger.isError ? 'warn' : 'ok' };
      // Outcomes are replayed on daily bars when the endpoint is read — the
      // honest stamp is that read, labelled as such.
      return { asOf: iso(f.ledger.dataUpdatedAt), note: 'replayed on daily bars at read', tone: f.ledger.isError ? 'warn' : 'ok' };
    }
    case 'rules':
      return { asOf: null, source: 'code (static list)', note: 'rules are code, not a feed' };
    case 'log': {
      const bad = failed(f.conv, f.cats);
      return { asOf: newest(conv?.generatedAt, lastCat), note: bad ? 'a feed failed' : undefined, tone: bad ? 'warn' : 'ok' };
    }
    case 'queue': {
      const e = f.econ.data;
      if (!e) return { asOf: f.econ.isError ? null : undefined, note: f.econ.isError ? 'refresh failed' : undefined, tone: f.econ.isError ? 'warn' : 'ok' };
      // A schedule has no "newest datum" — stamp the read, flag a stale calendar.
      return { asOf: iso(f.econ.dataUpdatedAt), note: e.coverage?.current ? 'calendar current · read time' : 'calendar STALE', tone: e.coverage?.current && !f.econ.isError ? 'ok' : 'warn' };
    }
    case 'outcomes': {
      const o = f.outcomes.data;
      return { asOf: f.outcomes.isError && !o ? null : o ? (o.asOf ?? null) : undefined, note: o?.coverage ? `${o.coverage.pctMeasured.toFixed(0)}% measured` : undefined, tone: f.outcomes.isError ? 'warn' : 'ok' };
    }
    case 'status': {
      const bad = failed(...jobFeeds, f.outcomes);
      return { asOf: newest(conv?.generatedAt, lastCat), note: bad ? `${bad} feed${bad > 1 ? 's' : ''} failed` : undefined, tone: bad ? 'warn' : 'ok' };
    }
  }
}

/** The feed a section cannot render honestly without. */
const PRIMARY: Partial<Record<BotSection, { feed: keyof BotFeeds; what: string }>> = {
  book: { feed: 'book', what: 'Paper book' },
  history: { feed: 'record', what: 'Track record' },
  ledger: { feed: 'ledger', what: 'Shadow ledger' },
  queue: { feed: 'econ', what: 'Macro calendar' },
  outcomes: { feed: 'outcomes', what: 'Outcome model' },
  log: { feed: 'conv', what: 'Activity log' },
};

function BotSectionTool({ only }: { only: BotSection }) {
  const f = useBotFeeds(only);
  useToolReport(reportFor(only, f));
  const p = PRIMARY[only];
  let gate: ReactNode = null;
  if (p) {
    const q = f[p.feed];
    if (q.isLoading) gate = <QELoading rows={4} className="fd-pad" label={`reading ${p.what.toLowerCase()}…`} />;
    else if (q.isError && !q.data) gate = <QEError className="fd-m" title={`${p.what} didn't load`} message={q.error instanceof Error ? q.error.message : undefined} onRetry={() => q.refetch()} retrying={q.isFetching} />;
  } else if (only !== 'rules' && f.conv.isLoading) {
    gate = <QELoading rows={3} className="fd-pad" />;
  }
  if (gate) return gate;
  return <div className="fd-fill fd-legacy"><BotNexus only={only} /></div>;
}

export const BotStatsTool = () => <BotSectionTool only="stats" />;
export const BotJobsTool = () => <BotSectionTool only="jobs" />;
export const BotBookTool = () => <BotSectionTool only="book" />;
export const BotHistoryTool = () => <BotSectionTool only="history" />;
export const BotLedgerTool = () => <BotSectionTool only="ledger" />;
export const BotRulesTool = () => <BotSectionTool only="rules" />;
export const BotLogTool = () => <BotSectionTool only="log" />;
export const BotQueueTool = () => <BotSectionTool only="queue" />;
export const BotOutcomesTool = () => <BotSectionTool only="outcomes" />;
export const BotStatusTool = () => <BotSectionTool only="status" />;

/** The whole board in one tile — every section, ⌘K search, resizable rail. */
export function BotClassicTool() {
  return <div className="fd-fill fd-legacy"><BotNexus /></div>;
}
