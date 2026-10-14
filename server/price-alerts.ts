/**
 * Level-cross alerts — "tell me when X trades through P".
 *
 * File-backed like the discipline ledger (survives restarts, no DB quota).
 * A checker sweeps armed alerts against real quotes every few minutes during
 * market hours; a cross fires one Discord line through the existing alert
 * sender and the alert converts to triggered — it never fires twice.
 * Direction is inferred at creation from the live price ('above' when armed
 * below the level, 'below' otherwise) so the alert means "crossed", not
 * "is beyond" — an alert created already-beyond would fire instantly and
 * mean nothing.
 *
 * Chart drawings arm alerts here too (2026-10-13): a horizontal line / ray /
 * price label is a flat level; a trend line, ray or extended line carries its
 * two anchors and is priced on the chart's trading clock at each sweep
 * (shared/chart-drawings.ts linePriceAt), so the alert follows the sloped line
 * the user sees. A segment that has ended stops checking (it is not "crossed").
 */
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './logger';
import { crossDirection, linePriceAt, type AlertLine, type ClockBasis, type LineExtend } from '@shared/chart-drawings';

export interface PriceAlert {
  id: string;
  symbol: string;
  price: number;
  direction: 'above' | 'below';
  createdAt: string;
  triggeredAt?: string;
  triggeredPrice?: number;
  /** Sloped line (chart drawing): priced at each sweep instead of `price`. */
  line?: AlertLine;
  /** The chart drawing that armed it (client maps alerts back to drawings). */
  drawingId?: string;
  /** Short human label ("Trend line", "Apex node 585"). */
  label?: string;
  userId?: string;
}

const BASES: ClockBasis[] = ['rth', 'eth', 'days', 'clock'];
const EXTENDS: LineExtend[] = ['none', 'right', 'both'];
/** Validate a client-sent line; null when anything is off. */
export function parseAlertLine(raw: unknown): AlertLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const t1 = n(r.t1); const p1 = n(r.p1); const t2 = n(r.t2); const p2 = n(r.p2);
  if (t1 == null || p1 == null || t2 == null || p2 == null || p1 <= 0 || p2 <= 0 || t1 === t2) return null;
  const extend = EXTENDS.includes(r.extend as LineExtend) ? (r.extend as LineExtend) : 'none';
  const basis = BASES.includes(r.basis as ClockBasis) ? (r.basis as ClockBasis) : 'clock';
  return { t1, p1, t2, p2, extend, basis };
}

/** The level an alert waits on right now (a line is priced at `at`). */
export function alertLevelAt(a: Pick<PriceAlert, 'price' | 'line'>, at: number): number | null {
  if (!a.line) return a.price;
  return linePriceAt(a.line, at);
}

const DIR = path.join(process.cwd(), 'server', 'data');
const FILE = path.join(DIR, 'price-alerts.jsonl');
let loaded = false;
let alerts: PriceAlert[] = [];

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try { alerts.push(JSON.parse(line)); } catch { /* skip corrupt */ }
    }
  } catch { /* none yet */ }
}

async function persistAll() {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(FILE, alerts.map((a) => JSON.stringify(a)).join('\n') + (alerts.length ? '\n' : ''), 'utf8');
}

export async function addAlert(
  symbol: string, price: number, currentPrice: number | null,
  opts: { line?: AlertLine | null; drawingId?: string; label?: string; userId?: string | null } = {},
): Promise<PriceAlert> {
  await load();
  const line = opts.line ?? undefined;
  // A line's level is where it sits NOW; that is what the direction is read against.
  const levelNow = line ? (linePriceAt(line, Date.now()) ?? price) : price;
  const direction = crossDirection(levelNow, currentPrice);
  const alert: PriceAlert = {
    id: `${symbol}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    symbol: symbol.toUpperCase(),
    price: levelNow,
    direction,
    createdAt: new Date().toISOString(),
    ...(line ? { line } : {}),
    ...(opts.drawingId ? { drawingId: String(opts.drawingId).slice(0, 64) } : {}),
    ...(opts.label ? { label: String(opts.label).slice(0, 80) } : {}),
    ...(opts.userId ? { userId: opts.userId } : {}),
  };
  alerts.push(alert);
  await persistAll();
  logger.info(`[PRICE-ALERT] armed ${alert.symbol} ${direction} $${alert.price.toFixed(2)}${line ? ' (trend line)' : ''}`);
  try {
    const { pulse } = await import('./system-pulse');
    pulse('alert', `alert armed: ${alert.symbol} crossing ${direction} $${alert.price.toFixed(2)}${alert.label ? ` · ${alert.label}` : ''}`);
  } catch { /* pulse is decoration */ }
  return alert;
}

export async function listAlerts(): Promise<PriceAlert[]> {
  await load();
  return [...alerts];
}

export async function removeAlert(id: string): Promise<boolean> {
  await load();
  const n = alerts.length;
  alerts = alerts.filter((a) => a.id !== id);
  if (alerts.length !== n) await persistAll();
  return alerts.length !== n;
}

/** Sweep armed alerts against real quotes; fire + mark on cross. */
export async function checkAlerts(): Promise<number> {
  await load();
  const armed = alerts.filter((a) => !a.triggeredAt);
  if (!armed.length) return 0;
  let fired = 0;
  try {
    const { getRealtimeBatchQuotes } = await import('./realtime-pricing-service');
    const symbols = Array.from(new Set(armed.map((a) => a.symbol)));
    const quotes = await getRealtimeBatchQuotes(symbols.map((symbol) => ({ symbol, assetType: 'stock' as const })));
    const lines: string[] = [];
    const now = Date.now();
    for (const a of armed) {
      const q = quotes.get(a.symbol);
      const px = Number((q as any)?.price);
      if (!Number.isFinite(px) || px <= 0) continue;
      const level = alertLevelAt(a, now);
      if (level == null) continue; // a trend segment that has ended: nothing to cross
      const crossed = a.direction === 'above' ? px >= level : px <= level;
      if (!crossed) continue;
      a.triggeredAt = new Date().toISOString();
      a.triggeredPrice = px;
      fired++;
      const what = a.label ? ` ${a.label}` : a.line ? ' trend line' : '';
      const lvl = level.toFixed(2);
      lines.push(`🔔 **${a.symbol}** crossed ${a.direction}${what} $${lvl} — now $${px.toFixed(2)}`);
      logger.info(`[PRICE-ALERT] fired ${a.symbol} ${a.direction}${what} $${lvl} @ $${px.toFixed(2)}`);
      try {
        const { pulse } = await import('./system-pulse');
        pulse('alert', `🔔 ${a.symbol} crossed ${a.direction}${what} $${lvl} — now $${px.toFixed(2)}`);
      } catch { /* pulse is decoration */ }
    }
    if (fired) {
      await persistAll();
      try {
        const { sendDiscordAlert } = await import('./discord-service');
        await sendDiscordAlert(lines.join('\n'), 'info');
      } catch (err) {
        logger.warn('[PRICE-ALERT] discord relay failed (alert still recorded):', err);
      }
    }
  } catch (err) {
    logger.warn('[PRICE-ALERT] sweep failed:', err);
  }
  return fired;
}
