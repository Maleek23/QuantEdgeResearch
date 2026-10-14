/**
 * NIGHTLY AUTO-VERIFY of the NEXUS ideas book (operator, 2026-10-14: "we need this
 * accurate henceforth"). Replaces the static Oct 7 ledger: every closed idea is
 * re-checked against real bars and the verify ledger the journal reads
 * (server/desk-verify-ledger.ts) stays current.
 *
 *   17:30 ET weekdays   research/verify-nexus-book.ts --incremental <ledger>
 *                       (new closes, rows whose recorded P&L changed, UNVERIFIABLE rows
 *                       exited ≤ 10 days ago — prior-day Massive aggs now exist —, and
 *                       tracker-pass-priced exits) → same ledger format, merged in place.
 *                       Same-day option bars: Alpaca 1-min (Massive same-day is not
 *                       entitled); prior days: Massive aggs; stocks: Yahoo / Alpaca.
 *   then                scripts/retro-options-convert.ts --write --skip-known (legacy
 *                       shares ideas → rule-picked options view; derived ledger FILE).
 *   09:20 ET weekdays   catch-up: the same incremental run (yesterday's late closes,
 *                       prior-day aggs that were not published at 17:30).
 *   boot (+15 min)      catch-up when the ledger is missing or older than 26 h.
 *
 * Child processes (tsx, low priority, heavy-job gate, 3 h timeout): the verifier is
 * read-only on the database (one READ ONLY transaction, rolled back) and writes only
 * the ledger files. Env: JOURNAL_VERIFY_JOB=off disables; NEXUS_BOOK_VERIFY_LEDGER /
 * NEXUS_RETRO_OPTIONS_LEDGER override paths; VERIFY_MASSIVE_THROTTLE_MS (default 12500).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { logger } from './logger';
import { deskVerifyLedgerPath, retroLedgerPath } from './desk-verify-ledger';

export const JOURNAL_VERIFY_VERSION = 'journal-verify-job-v1';
const STALE_MS = 26 * 3600_000;
const TIMEOUT_MS = 3 * 3600_000;

/** The verifier / converter command lines (pure — exported for tests). */
export function verifyCommand(ledger: string, env: Record<string, string | undefined> = process.env): string[] {
  return ['research/verify-nexus-book.ts', '--incremental', ledger, '--out', ledger, '--catchup-days', '10',
    '--massive-throttle', String(Number(env.VERIFY_MASSIVE_THROTTLE_MS) > 0 ? Number(env.VERIFY_MASSIVE_THROTTLE_MS) : 12_500),
    '--cache', path.join(path.dirname(ledger), '..', '..', 'nexus-verify-cache')];
}
export function retroCommand(ledger: string, env: Record<string, string | undefined> = process.env): string[] {
  return ['scripts/retro-options-convert.ts', '--write', '--skip-known', '--out', ledger,
    '--massive-throttle', String(Number(env.VERIFY_MASSIVE_THROTTLE_MS) > 0 ? Number(env.VERIFY_MASSIVE_THROTTLE_MS) : 12_500)];
}

/** True when the ledger is missing or older than 26 h. Pure (given an mtime). */
export function ledgerIsStale(mtimeMs: number | null, nowMs: number): boolean {
  return mtimeMs == null || nowMs - mtimeMs > STALE_MS;
}

function runTsx(args: string[], tag: string): Promise<number> {
  return new Promise((resolve) => {
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const child = spawn('nice', ['-n', '10', tsx, ...args], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const keep = (b: Buffer) => { tail = (tail + b.toString()).slice(-4000); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => { logger.warn(`[JOURNAL-VERIFY] ${tag} timed out after 3h — killed`); child.kill('SIGTERM'); }, TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      const summary = tail.split('\n').filter((l) => /VERIFIED total|MISMATCH \d|incremental:|VERIFIED \d|coverage|wrote /.test(l)).join(' | ');
      (code === 0 ? logger.info : logger.warn)(`[JOURNAL-VERIFY] ${tag} exit ${code}${summary ? ` — ${summary}` : ''}${code === 0 ? '' : `\n${tail.slice(-1500)}`}`);
      resolve(code ?? 1);
    });
    child.on('error', (e) => { clearTimeout(timer); logger.warn(`[JOURNAL-VERIFY] ${tag} failed to start: ${e.message}`); resolve(1); });
  });
}

let running = false;
export async function runJournalVerify(why: string, opts: { retro?: boolean } = {}): Promise<void> {
  if (running) { logger.info(`[JOURNAL-VERIFY] ${why}: previous run still going — skipped`); return; }
  running = true;
  try {
    const ledger = deskVerifyLedgerPath();
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    logger.info(`[JOURNAL-VERIFY] ${why}: incremental bar verify → ${ledger}`);
    await runTsx(verifyCommand(ledger), 'verify');
    if (opts.retro !== false) {
      const rl = retroLedgerPath();
      fs.mkdirSync(path.dirname(rl), { recursive: true });
      await runTsx(retroCommand(rl), 'retro-options');
    }
  } finally {
    running = false;
  }
}

/** Worker registration (server/background-jobs.ts). */
export async function scheduleJournalVerifyJob(log: (m: string) => void): Promise<void> {
  const cron = (await import('./guarded-cron')).default;
  const { runHeavy } = await import('./lib/heavy-job-gate');
  const go = (why: string, retro = true) => runHeavy('journal-verify', () => runJournalVerify(why, { retro }), { priority: 'low' }).catch((e) => logger.warn('[JOURNAL-VERIFY] run failed:', e));
  cron.schedule('30 17 * * 1-5', () => { void go('after close 17:30 ET'); }, { timezone: 'America/New_York' });
  cron.schedule('20 9 * * 1-5', () => { void go('morning catch-up (prior-day aggs)', false); }, { timezone: 'America/New_York' });
  setTimeout(() => {
    let mtime: number | null = null;
    try { mtime = fs.statSync(deskVerifyLedgerPath()).mtimeMs; } catch { mtime = null; }
    if (ledgerIsStale(mtime, Date.now())) void go('boot catch-up (ledger missing or > 26h old)');
  }, 15 * 60_000);
  log(`🧾 Journal auto-verify scheduled (${JOURNAL_VERIFY_VERSION}) — 17:30 ET incremental bar verify + retro options view, 09:20 ET catch-up, boot catch-up when stale`);
}
