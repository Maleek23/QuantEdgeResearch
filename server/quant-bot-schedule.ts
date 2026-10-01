/**
 * THE QUANT BOT IN THE WEB PROCESS — the schedule production never had.
 *
 * WHAT WAS WRONG (measured 2026-09-29)
 * Production runs one process, dist/web.js. The bot cycle was scheduled only in
 * server/worker.ts and server/index.ts, and neither runs there — so the prod
 * process never traded, managed or settled anything. Run 3's fills (Sep 24–25)
 * and its later exits came from a laptop dev server pointed at the prod DB; the
 * prod log has no [QUANT-BOT] cycle line at all. Since Sep 25 nothing entered,
 * and retired runs' contracts sat "open" weeks past expiry.
 *
 * WHAT THIS DOES
 *   • Every 10 minutes in session (09:34–15:54 ET, offset from the idea
 *     producers) + 15:56 for the 0DTE flatten + 16:20 to settle the day's
 *     expiries at the close: runBotCycle('web').
 *   • At boot: the full cycle during the session, otherwise only the expiry
 *     reconciliation (no entries off-hours).
 *
 * WHICH BOOK
 * The bot trades the MOST RECENT portfolio it owns named "Quant Bot · 100K"
 * (pickActiveBotPortfolio) — today that is Run 3, portfolio 3c6250b1…, created
 * 2026-09-23. Runs 1–2 are never traded again; their live contracts keep being
 * marked and their expiries settle, so their records close honestly.
 *
 * SAFEGUARDS (same as the worker, plus)
 *   • Paper only: the cycle calls paper-trading-service; there is no broker.
 *   • QUANT_BOT_IN_WEB=false turns the whole block off without a deploy.
 *   • Which process runs it: server/background-jobs.ts (role 'worker'; ROLE=all runs it in web).
 *   • guarded-cron: only the scheduler-lock leader registers the crons.
 *   • runBotCycle holds a Postgres advisory lock for the cycle, so a worker, a
 *     second instance or a dev server on the same DB is skipped, never doubled.
 *   • Discord alerts stay OFF from web unless QUANT_BOT_DISCORD=1.
 * CPU: the droplet is 1 vCPU. The cycle reuses the conviction board the web tier
 * already keeps warm, and an in-flight cycle is never stacked.
 */
import { logger } from './logger';

type LogFn = (msg: string) => void;

export function quantBotEnabledInWeb(): boolean {
  if (process.env.QUANT_BOT_IN_WEB === 'false') return false;
  return true;
}

function etMinutes(d = new Date()): { mins: number; weekday: boolean } {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { mins: (Number(v('hour')) % 24) * 60 + Number(v('minute')), weekday: !['Sat', 'Sun'].includes(v('weekday')) };
}

async function cycle(origin: string): Promise<void> {
  try {
    const { runBotCycle } = await import('./quant-bot');
    const { runHeavy } = await import('./lib/heavy-job-gate');
    // One heavy job at a time on the 1 vCPU box; the 15:56 flatten jumps the queue.
    const r = await runHeavy(`quant-bot:${origin}`, () => runBotCycle(undefined, origin), {
      priority: /flatten|settle/.test(origin) ? 'high' : 'normal',
    });
    if (!r) return; // dropped by the gate (duplicate queued / waited past its slot)
    if (r.error) logger.info(`🤖 [QUANT-BOT] ${origin}: ${r.error}`);
    else logger.info(`🤖 [QUANT-BOT] ${origin}: +${r.opened.length} opened, -${r.closed.length} closed, ${r.openCount} open`);
  } catch (err) {
    logger.error(`[QUANT-BOT] ${origin} cycle failed:`, err);
  }
  // Desk bots (docs/DESK_ADMINS.md, DESK_ADMINS=true): after the platform bot,
  // one job for all of them, capped at DESK_BOTS_MAX, lower priority except for
  // the 0DTE flatten / post-close settle, which must not be dropped.
  try {
    const { deskAdminsEnabled, runDeskBots } = await import('./desk-admin');
    if (!deskAdminsEnabled()) return;
    const { runHeavy } = await import('./lib/heavy-job-gate');
    await runHeavy(`desk-bots:${origin}`, () => runDeskBots(origin), {
      priority: /flatten|settle/.test(origin) ? 'high' : 'low',
    });
  } catch (err) {
    logger.error(`[DESK-BOTS] ${origin} failed:`, err);
  }
}

/** Back-compat name. */
export const scheduleQuantBotInWeb = (log: LogFn) => scheduleQuantBot(log);

export async function scheduleQuantBot(log: LogFn): Promise<void> {
  const { setBotDiscordAlerts } = await import('./quant-bot');
  setBotDiscordAlerts(process.env.QUANT_BOT_DISCORD === '1');
  const cron = (await import('./guarded-cron')).default;
  const { isSchedulerLeader } = await import('./scheduler-lock');
  const ET = { timezone: 'America/New_York' };

  cron.schedule('4-54/10 9-15 * * 1-5', () => {
    if (etMinutes().mins < 9 * 60 + 34) return; // let the open print settle
    void cycle('web');
  }, ET);
  cron.schedule('56 15 * * 1-5', () => { void cycle('web 0DTE flatten'); }, ET);
  cron.schedule('20 16 * * 1-5', () => { void cycle('web post-close settle'); }, ET);

  // Boot: a woken bot checks its book first (index.ts rationale). Off-hours it
  // only settles expiries — never enters on a closed market.
  if (isSchedulerLeader()) {
    setTimeout(() => {
      const { mins, weekday } = etMinutes();
      if (weekday && mins >= 9 * 60 + 34 && mins < 16 * 60) { void cycle('web boot'); return; }
      void (async () => {
        try {
          const { reconcileExpiredBotPositions } = await import('./bot-reconcile');
          const r = await reconcileExpiredBotPositions({ apply: true });
          logger.info(`🤖 [QUANT-BOT] boot reconcile: ${r.settlements.length} expired contract(s) settled (realized ${r.realizedDelta >= 0 ? '+' : ''}$${r.realizedDelta}), ${r.skipped.length} not settleable`);
        } catch (err) {
          logger.error('[QUANT-BOT] boot reconcile failed:', err);
        }
      })();
    }, 120_000);
  }

  log(`🤖 [WEB] Quant bot scheduled — paper cycle every 10m 09:34–15:54 ET, 15:56 0DTE flatten, 16:20 expiry settle; Discord ${process.env.QUANT_BOT_DISCORD === '1' ? 'on' : 'off'} (QUANT_BOT_IN_WEB=false disables)`);
}
