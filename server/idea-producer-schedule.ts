/**
 * IDEA PRODUCERS IN THE WEB PROCESS — the schedule production never had.
 *
 * WHAT WAS WRONG (measured 2026-09-29)
 * Production runs ONE process: dist/web.js (pm2 app `quantedge-web`). Every
 * producer that turns evidence into a published idea — the flag and base-reclaim
 * sweeps, the aggressor-tape scanner, the index/leader swing scanners, the
 * reversal sweep, the GEX idea scanner, the quant generator — is scheduled only
 * in server/worker.ts or server/index.ts, and neither runs in production
 * (ecosystem.config.cjs declares a worker; the live eco.config.cjs does not
 * start it). web.ts already carried two of the worker's jobs across for exactly
 * this reason (the options-flow scan and the GEX archiver). Nothing carried the
 * idea producers. Over the five sessions to 2026-09-29 the prod process itself
 * published only GEX-hub top plays, index scalps and two swing-catcher alerts;
 * the rest of the book arrived from a laptop dev server pointed at the prod DB.
 *
 * WHAT THIS DOES
 * Registers the measured, structural producers on the web process when no
 * worker tier owns the jobs. It uses guarded-cron, so only the scheduler-lock
 * leader registers anything, and web.ts calls it only when WORKER_ENABLED is
 * not "true" — the same either/or rule the flow scan already follows.
 *
 * WHAT IT DELIBERATELY LEAVES OUT
 *   • market_scanner / swing-trade-scanner — its resolved record is the worst
 *     of the large producers (replay hit rate 10%, research/rating-accuracy).
 *   • spx_session — suspended by the 2026-09-24 validation (SPX_SESSION_PUBLISH);
 *     index 0DTE setups come from server/zero-dte-policies.ts instead.
 *   • anything with side effects beyond publishing: paper auto-execution,
 *     Discord broadcasts, bots. The quant sweep here publishes only.
 *
 * CPU: the droplet is 1 vCPU. Every job has an in-flight guard (a slow pass is
 * skipped, never stacked), the daily-bar sweeps run hourly rather than every 30
 * minutes, and each window is offset so no two sweeps start together.
 * IDEA_PRODUCERS_IN_WEB=false turns the whole block off without a deploy.
 */
import { logger } from './logger';

type LogFn = (msg: string) => void;

function guarded(name: string, fn: () => Promise<unknown>): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) {
      logger.info(`[IDEA-PRODUCERS] ${name}: previous pass still running — skipped`);
      return;
    }
    running = true;
    const t0 = Date.now();
    try {
      const out = await fn();
      const n = typeof out === 'number' ? out : (out as any)?.persisted ?? (out as any)?.published;
      logger.info(`[IDEA-PRODUCERS] ${name}: done in ${((Date.now() - t0) / 1000).toFixed(1)}s${n != null ? ` — ${n} published` : ''}`);
    } catch (err) {
      logger.error(`[IDEA-PRODUCERS] ${name} failed:`, err);
    } finally {
      running = false;
    }
  };
}

export function ideaProducersEnabledInWeb(): boolean {
  if (process.env.IDEA_PRODUCERS_IN_WEB === 'false') return false;
  if (process.env.WORKER_ENABLED === 'true') return false;
  return true;
}

export async function scheduleIdeaProducers(log: LogFn): Promise<void> {
  const cron = (await import('./guarded-cron')).default;
  const ET = { timezone: 'America/New_York' };

  // ── Daily-bar structure sweeps (hourly in session + one post-close pass) ──
  // Hourly, offset, instead of the worker's every-30-minutes: the setups are
  // read from daily bars, so a second intraday pass mostly re-finds the same
  // shapes, and the CPU is better spent elsewhere.
  cron.schedule('5 10-15 * * 1-5', guarded('bull-flag', async () => {
    const { ingestBullFlagIdeas } = await import('./bull-flag-scanner');
    return ingestBullFlagIdeas();
  }), ET);
  cron.schedule('20 10-15 * * 1-5', guarded('bear-flag', async () => {
    const { ingestBearFlagIdeas } = await import('./bear-flag-scanner');
    return ingestBearFlagIdeas();
  }), ET);
  cron.schedule('35 10-15 * * 1-5', guarded('base-reclaim', async () => {
    const { ingestBaseReclaimIdeas } = await import('./base-reclaim-scanner');
    return ingestBaseReclaimIdeas();
  }), ET);
  // After the close the daily bar is final — prepare the next session's board.
  cron.schedule('40 16 * * 1-5', guarded('flag+reclaim (post-close)', async () => {
    const [{ ingestBullFlagIdeas }, { ingestBearFlagIdeas }, { ingestBaseReclaimIdeas }] = await Promise.all([
      import('./bull-flag-scanner'), import('./bear-flag-scanner'), import('./base-reclaim-scanner'),
    ]);
    const a = await ingestBullFlagIdeas();
    const b = await ingestBearFlagIdeas();
    const c = await ingestBaseReclaimIdeas();
    return a + b + c;
  }), ET);

  // ── Aggressor tape (Bullflow) — every 10 min in session. Bullflow calls are
  // held to the process-wide budget in bullflow-service.ts. ──
  cron.schedule('*/10 9-15 * * 1-5', guarded('tape', async () => {
    const { runBullflowTapeScan } = await import('./bullflow-tape-scanner');
    return runBullflowTapeScan();
  }), ET);

  // ── Twice-daily measured scanners (same slots index.ts uses, in ET) ──
  cron.schedule('45 9,13 * * 1-5', guarded('crypto-proxy', async () => {
    const { runCryptoProxyPromotion } = await import('./crypto-proxy-promoter');
    return runCryptoProxyPromotion();
  }), ET);
  cron.schedule('55 9,13 * * 1-5', guarded('index-swing', async () => {
    const { runIndexSwingScan } = await import('./index-swing-scanner');
    return runIndexSwingScan();
  }), ET);
  cron.schedule('58 9,13 * * 1-5', guarded('premium-discount', async () => {
    const { runPremiumDiscountScan } = await import('./index-swing-scanner');
    return runPremiumDiscountScan();
  }), ET);
  cron.schedule('5 10,14 * * 1-5', guarded('leader-swing', async () => {
    const { runLeaderSwingScan } = await import('./index-swing-scanner');
    return runLeaderSwingScan();
  }), ET);

  // ── Evening reversal slate off completed daily bars ──
  cron.schedule('40 21 * * 1-5', guarded('bottom-reversal', async () => {
    const { runBottomReversalSweep } = await import('./bottom-reversal-scanner');
    return runBottomReversalSweep({ publish: true });
  }), ET);

  // ── GEX setups (flip cross / wall fade / squeeze) — every 30 min, 10:00–15:30.
  // Shares the 5-minute GEX snapshot cache with the conviction build. ──
  cron.schedule('0,30 10-15 * * 1-5', guarded('gex-setups', async () => {
    const { runGexIdeaScanner } = await import('./gex-idea-scanner');
    return runGexIdeaScanner();
  }), ET);

  // ── Index 0DTE (SPY→SPX / QQQ / IWM) — structure-gated policies A/B/C in
  // server/zero-dte-policies.ts, unvalidated and labelled so. Before this the
  // web process ran the index scanner only when someone loaded the GEX hub
  // (3 passes on 2026-09-29, all "0 ideas"). Every 5 min 09:45–14:55, every
  // 2 min in power hour; the scanner itself no-ops outside 09:45–15:45 ET,
  // shares one in-flight pass, and reuses a pass younger than 60 s. Chains come
  // from the 5-minute GEX snapshot cache; bars from a 60-second cache.
  // Publish only: Discord stays off unless INDEX_0DTE_DISCORD=1. ──
  const index0dte = guarded('index-0dte', async () => {
    const { runIndexScalpScanner } = await import('./index-scalp-engine');
    return runIndexScalpScanner({ discord: process.env.INDEX_0DTE_DISCORD === '1' });
  });
  cron.schedule('*/5 9-14 * * 1-5', index0dte, ET);
  cron.schedule('*/2 15 * * 1-5', index0dte, ET);

  // ── 0DTE desk (server/zero-dte-desk.ts): the watched single names
  // (ZERO_DTE_WATCH minus the index names, default TSLA/MSTR/KWEB) through the
  // same policies on their own levels, one minute after the index pass so the
  // two never contend for the chain queue; 2–4 day swings at 10:30 / 14:30. ──
  const desk0dte = guarded('0dte-desk', async () => {
    const { runZeroDteDeskScan } = await import('./zero-dte-desk');
    return (await runZeroDteDeskScan()).published;
  });
  cron.schedule('1-59/5 9-14 * * 1-5', desk0dte, ET);
  cron.schedule('1-59/2 15 * * 1-5', desk0dte, ET);
  cron.schedule('30 10,14 * * 1-5', guarded('short-swings', async () => {
    const { runShortSwingPublish } = await import('./zero-dte-desk');
    return runShortSwingPublish();
  }), ET);

  // ── Quant sweep — publish only (no paper execution, no Discord). ──
  cron.schedule('12,42 9-15 * * 1-5', guarded('quant', async () => {
    const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const mins = et.getHours() * 60 + et.getMinutes();
    if (mins < 9 * 60 + 40 || mins > 15 * 60 + 45) return 0; // after the open settles, before the close
    const { storage } = await import('./storage');
    const { generateQuantIdeas } = await import('./quant-ideas-generator');
    const marketData = await storage.getAllMarketData();
    const catalysts = await storage.getActiveCatalysts();
    const ideas = await generateQuantIdeas(marketData, catalysts, 10, storage, true);
    let saved = 0;
    for (const idea of ideas) {
      try {
        await storage.createTradeIdea({ ...idea, source: 'quant', status: 'published' } as any);
        saved++;
      } catch (err) {
        logger.info(`[IDEA-PRODUCERS] quant ${idea.symbol}: not saved — ${(err as Error).message}`);
      }
    }
    return saved;
  }), ET);

  log('🧭 [WEB] Idea producers scheduled — index 0DTE 5m (2m power hour), 0DTE desk names 5m/2m, short swings 2×/day, flags/reclaim hourly, tape 10m, GEX setups 30m, quant 30m, index/leader swing + crypto proxy 2×/day, reversal slate nightly (IDEA_PRODUCERS_IN_WEB=false disables)');
}
