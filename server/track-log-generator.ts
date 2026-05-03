/**
 * Track-Log Thread Generator
 *
 * Reads `theses/*.md`, parses the lightweight header table + track log,
 * computes since-open performance against the current quote, and produces
 * a publish-ready Sunday scoreboard thread.
 *
 * Two outputs:
 *  - `generateScoreboardThread()` → `string[]` (one tweet per element)
 *  - `generateThesisOpenTweet(file)` → single tweet announcing a new thesis
 *
 * No data is invented: if a thesis is missing a numeric "Spot price at open"
 * (because it's a fresh draft with [VERIFY] placeholders), it's listed as
 * "draft" and excluded from the perf table.
 */
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { logger } from './logger';
import { getRealtimeQuote } from './realtime-pricing-service';

const THESES_DIR = path.resolve(process.cwd(), 'theses');

export interface ThesisHeader {
  file: string;
  ticker: string;
  theme: string;
  dateOpened: string;     // YYYY-MM-DD or empty
  spotAtOpen: number | null;
  conviction: string;
  horizon: string;
  status: string;
  tldr: string;
}

const HEADER_RX: Record<keyof Omit<ThesisHeader, 'file'>, RegExp> = {
  ticker: /\*\*Ticker:\*\*\s*`?\$?([A-Z.\-]{1,8})`?/i,
  theme: /\*\*Sector \/ Sub-theme:\*\*\s*([^\n]+)/i,
  dateOpened: /\*\*Date opened:\*\*\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/,
  spotAtOpen: /\*\*Spot price at open:\*\*\s*\$?([0-9.]+)/,
  conviction: /\*\*Conviction:\*\*\s*([^\n]+)/i,
  horizon: /\*\*Time horizon:\*\*\s*([^\n]+)/i,
  status: /\*\*Status:\*\*\s*([^\n]+)/i,
  tldr: /## TL;DR[^\n]*\n+>\s*([^\n]+)/,
};

function parseHeader(file: string, content: string): ThesisHeader | null {
  const get = (rx: RegExp): string => {
    const m = content.match(rx);
    return m ? m[1].trim() : '';
  };
  const ticker = get(HEADER_RX.ticker);
  if (!ticker) return null;

  const spotRaw = get(HEADER_RX.spotAtOpen);
  const spotAtOpen = spotRaw && !/verify|tbd|n\/a/i.test(spotRaw)
    ? Number(spotRaw)
    : null;

  return {
    file,
    ticker,
    theme: get(HEADER_RX.theme),
    dateOpened: get(HEADER_RX.dateOpened),
    spotAtOpen: Number.isFinite(spotAtOpen as number) ? (spotAtOpen as number) : null,
    conviction: get(HEADER_RX.conviction),
    horizon: get(HEADER_RX.horizon),
    status: get(HEADER_RX.status),
    tldr: get(HEADER_RX.tldr),
  };
}

export async function loadAllTheses(): Promise<ThesisHeader[]> {
  const out: ThesisHeader[] = [];
  let files: string[] = [];
  try {
    files = await readdir(THESES_DIR);
  } catch (err: any) {
    logger.warn(`[track-log] cannot read ${THESES_DIR}: ${err.message}`);
    return out;
  }

  for (const f of files) {
    if (!f.endsWith('.md') || f === 'README.md') continue;
    const full = path.join(THESES_DIR, f);
    const content = await readFile(full, 'utf-8');
    const header = parseHeader(f, content);
    if (header) out.push(header);
  }
  return out.sort((a, b) => a.dateOpened.localeCompare(b.dateOpened));
}

export interface ThesisPerf extends ThesisHeader {
  current: number | null;
  pctSinceOpen: number | null;
  daysOpen: number | null;
  status: string;
}

export async function computePerformance(headers: ThesisHeader[]): Promise<ThesisPerf[]> {
  const out: ThesisPerf[] = [];
  for (const h of headers) {
    let current: number | null = null;
    let pct: number | null = null;
    let days: number | null = null;

    if (h.spotAtOpen !== null) {
      try {
        const q = await getRealtimeQuote(h.ticker, 'stock');
        if (q && Number.isFinite(q.price)) {
          current = q.price;
          pct = ((q.price - h.spotAtOpen) / h.spotAtOpen) * 100;
        }
      } catch (err: any) {
        logger.warn(`[track-log] quote failed for ${h.ticker}: ${err?.message ?? err}`);
      }
    }

    if (h.dateOpened) {
      const ms = Date.now() - new Date(h.dateOpened).getTime();
      days = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
    }

    out.push({ ...h, current, pctSinceOpen: pct, daysOpen: days });
  }
  return out;
}

function fmtPct(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return '—';
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}

export interface ScoreboardOptions {
  /** Brand-only (no founder voice / no `I` ). For @QuantEdge. */
  brandTone?: boolean;
  /** Include a final "full breakdown → link" CTA. */
  ctaUrl?: string;
}

/**
 * Compose the Sunday scoreboard thread. One thesis per row in tweet 2+.
 * Returns one tweet per array element; caller passes to `publishThread`.
 */
export async function generateScoreboardThread(opts: ScoreboardOptions = {}): Promise<{
  tweets: string[];
  perf: ThesisPerf[];
}> {
  const headers = await loadAllTheses();
  const perf = await computePerformance(headers);

  const tracked = perf.filter(p => p.spotAtOpen !== null && p.pctSinceOpen !== null);
  const drafts = perf.filter(p => p.spotAtOpen === null);
  const winners = tracked.filter(p => (p.pctSinceOpen ?? 0) > 0).length;

  const dateLabel = new Date().toISOString().slice(0, 10);
  const lead = opts.brandTone
    ? `Open theses scoreboard — ${dateLabel}. Tracked: ${tracked.length}. Green: ${winners}/${tracked.length}. Drafts in flight: ${drafts.length}.`
    : `Open theses — ${dateLabel}. ${tracked.length} live, ${winners} green, ${drafts.length} draft. Receipts below 👇`;

  const tweets: string[] = [lead.slice(0, 280)];

  // Group rows compactly to stay under 280 chars per tweet.
  const rows = tracked.map(p =>
    `$${p.ticker.padEnd(5)} ${fmtPct(p.pctSinceOpen).padStart(7)}  ${p.daysOpen ?? '—'}d  · ${p.theme.slice(0, 36)}`
  );

  let buf: string[] = [];
  let bufLen = 0;
  const flush = () => {
    if (buf.length) {
      tweets.push(buf.join('\n'));
      buf = [];
      bufLen = 0;
    }
  };
  for (const row of rows) {
    const next = bufLen + row.length + (buf.length ? 1 : 0);
    if (next > 270) flush();
    buf.push(row);
    bufLen += row.length + 1;
  }
  flush();

  if (drafts.length) {
    tweets.push(
      `Drafts (awaiting fills): ${drafts.map(d => '$' + d.ticker).join(', ')}`.slice(0, 280)
    );
  }

  if (opts.ctaUrl) {
    tweets.push(
      `Full track log + each thesis's setup, levels, and invalidation → ${opts.ctaUrl}`.slice(0, 280)
    );
  }

  return { tweets, perf };
}

/**
 * One-tweet announcement for a new thesis. Used when a `theses/YYYY-MM-TICKER.md`
 * is freshly authored. Pulls TL;DR + ticker + horizon.
 */
export async function generateThesisOpenTweet(
  file: string,
  ctaUrl?: string
): Promise<string | null> {
  const full = path.join(THESES_DIR, file);
  let content: string;
  try {
    content = await readFile(full, 'utf-8');
  } catch {
    return null;
  }
  const h = parseHeader(file, content);
  if (!h) return null;

  // Use the TL;DR if present, else fall back to a header summary.
  const tldr = h.tldr || `${h.theme}, ${h.horizon} horizon, conviction ${h.conviction}`;
  const cta = ctaUrl ? `\n→ ${ctaUrl}` : '';
  // Reserve space for cashtag prefix and CTA.
  const head = `New thesis: $${h.ticker} — `;
  const room = 280 - head.length - cta.length - 1;
  const body = tldr.length > room ? tldr.slice(0, room - 1) + '…' : tldr;
  return `${head}${body}${cta}`;
}
