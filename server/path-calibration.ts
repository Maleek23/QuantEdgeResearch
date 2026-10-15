/**
 * PATH CALIBRATION — public band-coverage score for the Path model
 * (GET /api/public/path-calibration, the /proof page).
 *
 * Source: the frozen 09:40 "session" snapshots server/chart-path.ts writes
 * once per day (.cache/shared/path-snapshots/<SYM>/<date>.json). Each frozen
 * fan is scored against what price then did (5-min closes, Yahoo) with
 * shared/path-projection.ts scoreRealized: the share of realized closes inside
 * the 50 % and 80 % fans. A calibrated model lands near 50 % / 80 %.
 *
 * Rates are withheld until MIN_DAYS scored sessions; before any snapshot
 * exists the payload says "collecting" with no date. Nothing is estimated.
 * Cached 1 h. Yahoo's 5-min history reaches ~60 days, so older days that were
 * never scored are listed as unscored, not dropped silently.
 */
import fs from 'node:fs';
import path from 'node:path';
import { scoreRealized, type PathResult } from '@shared/path-projection';
import { logger } from './logger';

export const CALIBRATION_MIN_DAYS = 20;
const SYMBOLS = ['SPY', 'QQQ', 'SPX'];

export interface DayScore { symbol: string; date: string; n: number; in50: number | null; in80: number | null }
export interface PathCalibration {
  generatedAt: string;
  status: 'none' | 'collecting' | 'ready';
  since: string | null;
  snapshotDays: number;
  scoredDays: number;
  minDays: number;
  /** Mean coverage across scored days; null below minDays. */
  in50: number | null;
  in80: number | null;
  through: string | null;
  symbols: string[];
  note: string;
}

/** Pure aggregation. */
export function aggregateCalibration(days: DayScore[], snapshotDates: string[], nowIso: string, minDays = CALIBRATION_MIN_DAYS): PathCalibration {
  const scored = days.filter((d) => d.n > 0 && d.in50 != null && d.in80 != null);
  const sorted = [...snapshotDates].sort();
  const since = sorted[0] ?? null;
  const ready = scored.length >= minDays;
  const mean = (k: 'in50' | 'in80') => scored.reduce((a, d) => a + (d[k] as number), 0) / scored.length;
  return {
    generatedAt: nowIso,
    status: !since ? 'none' : ready ? 'ready' : 'collecting',
    since, snapshotDays: new Set(sorted).size, scoredDays: scored.length, minDays,
    in50: ready ? mean('in50') : null, in80: ready ? mean('in80') : null,
    through: scored.length ? scored.map((d) => d.date).sort().at(-1)! : null,
    symbols: [...new Set(scored.map((d) => d.symbol))],
    note: ready
      ? `Share of realized 5-min closes inside the frozen 09:40 session fans (target ≈ 50% / 80%), mean over ${scored.length} scored sessions.`
      : since ? `Collecting: ${scored.length} of ${minDays} scored sessions needed before coverage is published.` : 'No frozen Path snapshots yet.',
  };
}

export function snapshotRoot(): string {
  return path.join(process.env.SHARED_STATE_DIR || path.join(process.cwd(), '.cache', 'shared'), 'path-snapshots');
}

function listSnapshots(root: string): Array<{ symbol: string; date: string; result: PathResult }> {
  const out: Array<{ symbol: string; date: string; result: PathResult }> = [];
  for (const sym of SYMBOLS) {
    let files: string[] = [];
    try { files = fs.readdirSync(path.join(root, sym)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch { continue; }
    for (const f of files) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(root, sym, f), 'utf8'));
        const r = j?.['0940']?.session?.result as PathResult | undefined;
        if (r?.points?.length) out.push({ symbol: sym, date: f.slice(0, 10), result: r });
      } catch { /* skip corrupt */ }
    }
  }
  return out;
}

let cache: { at: number; v: PathCalibration } | null = null;
export async function buildPathCalibration(nowMs = Date.now(), root = snapshotRoot()): Promise<PathCalibration> {
  if (cache && nowMs - cache.at < 3_600_000) return cache.v;
  const snaps = listSnapshots(root);
  const days: DayScore[] = [];
  const today = new Date(nowMs).toISOString().slice(0, 10);
  for (const sym of [...new Set(snaps.map((s) => s.symbol))]) {
    const mine = snaps.filter((s) => s.symbol === sym && s.date < today);
    if (!mine.length) continue;
    let bars: { t: number; price: number }[] = [];
    try {
      const yf = await (await import('./yahoo-finance-service')).getYahooFinance();
      const chart: any = await (yf as any).chart(sym === 'SPX' ? '^SPX' : sym, { period1: new Date(nowMs - 59 * 86_400_000), interval: '5m' });
      bars = (chart?.quotes ?? []).filter((q: any) => q.close > 0).map((q: any) => ({ t: new Date(q.date).getTime() + 300_000, price: q.close }));
    } catch (e) { logger.debug?.(`[PATH-CAL] ${sym} bars: ${(e as Error).message}`); }
    for (const s of mine) {
      const end = s.result.endMs;
      const sc = scoreRealized(s.result, bars.filter((b) => b.t > s.result.startMs && b.t <= end));
      days.push({ symbol: sym, date: s.date, ...sc });
    }
  }
  const v = aggregateCalibration(days, snaps.map((s) => s.date), new Date(nowMs).toISOString());
  cache = { at: nowMs, v };
  return v;
}
