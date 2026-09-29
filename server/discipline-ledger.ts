/**
 * The discipline shadow ledger — what the short gate costs and saves.
 *
 * The gate blocks pattern-shorts without an event catalyst. That is process,
 * and process is a claim: "these trades lose money on average." META's
 * gap-and-fade (2026-08-26) is the counterexample that demands the claim be
 * measured — the blocked short would have printed. So every block is recorded
 * here as a SHADOW trade (never published, never in the book, never in the
 * win rate) and replayed against real bars, so /api/discipline/ledger can
 * answer: is the gate saving money or costing money?
 *
 * File-backed JSONL (survives restarts; the DB free tier is quota-bound and
 * these are not trade ideas). One entry per symbol per day — the engine
 * re-drops the same candidate every warm cycle and a ledger that counts one
 * decision fifty times measures nothing.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './logger';

export interface BlockedShort {
  symbol: string;
  blockedAt: string;      // ISO
  entryPrice: number;     // candidate's entry at block time
  stopLoss: number;
  targetPrice: number;
  reason: string;
  source: string;         // which scanner fed the candidate
  /**
   * What refused it. Absent on the original short-gate rows (read as
   * 'short_gate'); 'bot_skip' rows are the Quant Bot's own refusals under the
   * loss rules (confluence, entry window, stale-close trigger, …).
   */
  kind?: 'short_gate' | 'bot_skip';
  /** Thesis side on the UNDERLYING. Absent on short-gate rows (always short). */
  direction?: 'long' | 'short';
  /** Machine-readable refusal code for bot skips (e.g. 'confluence', 'entry_window'). */
  code?: string;
  /** Rule-set version that produced the refusal (loss-rules-v1). */
  rulesVersion?: string;
}

const LEDGER_DIR = path.join(process.cwd(), 'server', 'data');
const LEDGER_PATH = path.join(LEDGER_DIR, 'discipline-ledger.jsonl');

let loaded = false;
const seen = new Set<string>();          // `${symbol}:${YYYY-MM-DD}`
let entries: BlockedShort[] = [];

/** One entry per symbol per day for the short gate; per symbol+day+code for bot skips. */
function ledgerKey(symbol: string, day: string, kind?: string, code?: string): string {
  return kind === 'bot_skip' ? `bot:${symbol}:${day}:${code ?? ''}` : `${symbol}:${day}`;
}

async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await fs.readFile(LEDGER_PATH, 'utf8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as BlockedShort;
        entries.push(e);
        seen.add(ledgerKey(e.symbol, e.blockedAt.slice(0, 10), e.kind, e.code));
      } catch { /* skip corrupt line, keep the rest */ }
    }
  } catch { /* no ledger yet */ }
}

export async function recordBlockedShort(e: Omit<BlockedShort, 'blockedAt'>): Promise<void> {
  await load();
  const blockedAt = new Date().toISOString();
  const key = ledgerKey(e.symbol, blockedAt.slice(0, 10), e.kind, e.code);
  if (seen.has(key)) return;
  if (!(e.entryPrice > 0) || !(e.stopLoss > 0) || !(e.targetPrice > 0)) return; // unreplayable
  seen.add(key);
  const entry: BlockedShort = { ...e, blockedAt };
  entries.push(entry);
  try {
    await fs.mkdir(LEDGER_DIR, { recursive: true });
    await fs.appendFile(LEDGER_PATH, JSON.stringify(entry) + '\n', 'utf8');
    logger.info(`[DISCIPLINE-LEDGER] recorded blocked short ${e.symbol} @ ${e.entryPrice} (${e.reason})`);
    try {
      const { pulse } = await import('./system-pulse');
      pulse('gate', `gate blocked ${e.symbol} short — ${e.reason} (shadow ledger will score it)`);
    } catch { /* pulse is decoration */ }
  } catch (err) {
    logger.warn('[DISCIPLINE-LEDGER] append failed:', err);
  }
}

/**
 * The Quant Bot's refusals, same shadow ledger (the journal's Missed · Bot view
 * reads /api/discipline/ledger). Deduped per symbol + day + refusal code so a
 * 10-minute cycle re-seeing the same pick records ONE decision, not forty.
 */
export async function recordBotSkip(e: {
  symbol: string; direction: 'long' | 'short'; entryPrice: number; stopLoss: number; targetPrice: number;
  reason: string; source: string; code: string; rulesVersion?: string;
}): Promise<void> {
  await load();
  const blockedAt = new Date().toISOString();
  const key = ledgerKey(e.symbol, blockedAt.slice(0, 10), 'bot_skip', e.code);
  if (seen.has(key)) return;
  if (!(e.entryPrice > 0) || !(e.stopLoss > 0) || !(e.targetPrice > 0)) return; // unreplayable
  seen.add(key);
  const entry: BlockedShort = { ...e, kind: 'bot_skip', blockedAt };
  entries.push(entry);
  try {
    await fs.mkdir(LEDGER_DIR, { recursive: true });
    await fs.appendFile(LEDGER_PATH, JSON.stringify(entry) + '\n', 'utf8');
    logger.info(`[DISCIPLINE-LEDGER] bot skipped ${e.symbol} ${e.direction} [${e.code}] — ${e.reason}`);
  } catch (err) {
    logger.warn('[DISCIPLINE-LEDGER] append failed:', err);
  }
}

export async function getLedger(): Promise<BlockedShort[]> {
  await load();
  return [...entries];
}
