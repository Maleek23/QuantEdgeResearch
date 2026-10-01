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
import { runHeavy, type HeavyOptions } from './lib/heavy-job-gate';

type HeavyPriority = NonNullable<HeavyOptions['priority']>;

type LogFn = (msg: string) => void;

/**
 * Every producer runs through the process-wide heavy-job gate
 * (server/lib/heavy-job-gate.ts): one heavy job at a time on the 1 vCPU box,
 * minute-sensitive ones ('high') ahead of the queue.
 */
function guarded(name: string, fn: () => Promise<unknown>, priority: HeavyPriority = 'normal'): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) {
      logger.info(`[IDEA-PRODUCERS] ${name}: previous pass still running — skipped`);
      return;
    }
    running = true;
    const t0 = Date.now();
    try {
      const out = await runHeavy(`producer:${name}`, fn, { priority });
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
  return true;
}

export async function scheduleIdeaProducers(log: LogFn): Promise<void> {
  const cron = (await import('./guarded-cron')).default;
  const ET = { timezone: 'America/New_York' };

  // ── Daily-bar structure sweeps (hourly in session + one post-close pass) ──
  // Hourly, offset, instead of the worker's every-30-minutes: the setups are
  // read from daily bars, so a second intraday pass mostly re-finds the same
  // shapes, and the CPU is better spent elsewhere.
  // MINUTE MAP (2026-09-30 memory/CPU diet). The 5-minute cadences own
  // minutes ≡0 (index 0DTE) and ≡1 (0DTE desk) mod 5, the quant bot ≡4 mod 10;
  // every other heavy job is placed on a ≡2/≡3 minute so none shares a start:
  //   :02/:12/…  tape      :03/:18/:33/:48  flow scan (web.ts)
  //   :08        GEX archive (web.ts)       :13 bull-flag  :23 bear-flag  :38 base-reclaim
  //   :17/:47    GEX setups                 :27/:57 quant sweep
  //   :43 leader-swing (10,14)  :49 crypto-proxy  :53 index-swing  :58 premium-discount (9,13)
  cron.schedule('13 10-15 * * 1-5', guarded('bull-flag', async () => {
    const { ingestBullFlagIdeas } = await import('./bull-flag-scanner');
    return ingestBullFlagIdeas();
  }), ET);
  cron.schedule('23 10-15 * * 1-5', guarded('bear-flag', async () => {
    const { ingestBearFlagIdeas } = await import('./bear-flag-scanner');
    return ingestBearFlagIdeas();
  }), ET);
  cron.schedule('38 10-15 * * 1-5', guarded('base-reclaim', async () => {
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
  cron.schedule('2-59/10 9-15 * * 1-5', guarded('tape', async () => {
    const { runBullflowTapeScan } = await import('./bullflow-tape-scanner');
    return runBullflowTapeScan();
  }), ET);

  // ── Twice-daily measured scanners (same slots index.ts uses, in ET) ──
  cron.schedule('49 9,13 * * 1-5', guarded('crypto-proxy', async () => {
    const { runCryptoProxyPromotion } = await import('./crypto-proxy-promoter');
    return runCryptoProxyPromotion();
  }), ET);
  cron.schedule('53 9,13 * * 1-5', guarded('index-swing', async () => {
    const { runIndexSwingScan } = await import('./index-swing-scanner');
    return runIndexSwingScan();
  }), ET);
  cron.schedule('58 9,13 * * 1-5', guarded('premium-discount', async () => {
    const { runPremiumDiscountScan } = await import('./index-swing-scanner');
    return runPremiumDiscountScan();
  }), ET);
  cron.schedule('43 10,14 * * 1-5', guarded('leader-swing', async () => {
    const { runLeaderSwingScan } = await import('./index-swing-scanner');
    return runLeaderSwingScan();
  }), ET);

  // ── Native crypto ideas — 24/7, weekends included (no weekday field, UTC
  // clock). Scan + publish at :07/:37; the crypto path tracker every 5 min
  // resolves crypto_engine ideas from Coinbase bars. CRYPTO_IDEAS=false turns
  // both off. See server/crypto-ideas-engine.ts. ──
  if (process.env.CRYPTO_IDEAS !== 'false') {
    const { CRYPTO_ENGINE_CRON, CRYPTO_TRACKER_CRON } = await import('@shared/crypto-ideas-core');
    cron.schedule(CRYPTO_ENGINE_CRON, guarded('crypto-ideas', async () => {
      const { runCryptoIdeasEngine } = await import('./crypto-ideas-engine');
      return runCryptoIdeasEngine();
    }), { timezone: 'UTC' });
    cron.schedule(CRYPTO_TRACKER_CRON, guarded('crypto-tracker', async () => {
      const { trackCryptoIdeas } = await import('./crypto-ideas-engine');
      return (await trackCryptoIdeas()).resolved;
    }, 'low'), { timezone: 'UTC' });
  }

  // ── Evening reversal slate off completed daily bars ──
  cron.schedule('40 21 * * 1-5', guarded('bottom-reversal', async () => {
    const { runBottomReversalSweep } = await import('./bottom-reversal-scanner');
    return runBottomReversalSweep({ publish: true });
  }), ET);

  // ── GEX setups (flip cross / wall fade / squeeze) — every 30 min, 10:00–15:30.
  // Shares the 5-minute GEX snapshot cache with the conviction build. ──
  cron.schedule('17,47 10-15 * * 1-5', guarded('gex-setups', async () => {
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
  }, 'high');
  cron.schedule('*/5 9-14 * * 1-5', index0dte, ET);
  cron.schedule('*/2 15 * * 1-5', index0dte, ET);

  // ── 0DTE desk (server/zero-dte-desk.ts): the watched single names
  // (every ZERO_DTE_WATCH name, default SPX/MSTR/META/BE/TSLA; SPX logged by the index engine) through the
  // same policies on their own levels, one minute after the index pass so the
  // two never contend for the chain queue; 2–4 day swings at 10:30 / 14:30. ──
  const desk0dte = guarded('0dte-desk', async () => {
    const { runZeroDteDeskScan } = await import('./zero-dte-desk');
    return (await runZeroDteDeskScan()).published;
  }, 'high');
  cron.schedule('1-59/5 9-14 * * 1-5', desk0dte, ET);
  cron.schedule('1-59/2 15 * * 1-5', desk0dte, ET);
  cron.schedule('30 10,14 * * 1-5', guarded('short-swings', async () => {
    const { runShortSwingPublish } = await import('./zero-dte-desk');
    return runShortSwingPublish();
  }), ET);

  // ── Board-wide 0DTE sniper (server/zero-dte-sniper.ts) — OFF unless
  // ZERO_DTE_SNIPER=true. Every 2 min; the engine itself no-ops outside
  // 09:45–15:50 ET. Stage 1 (batched price bars for the whole board) is light
  // and runs OUTSIDE the heavy gate; stage 2 sends each option-chain fetch
  // through runHeavy itself (≤ ZERO_DTE_SNIPER_MAX_CHAINS per cycle), so this
  // tick must not be wrapped in guarded() — nesting runHeavy at concurrency 1
  // would deadlock. Its own in-flight guard skips a tick while one runs. ──
  if (process.env.ZERO_DTE_SNIPER === 'true') {
    let sniperRunning = false;
    const sniper = async () => {
      if (sniperRunning) { logger.info('[IDEA-PRODUCERS] 0dte-sniper: previous pass still running — skipped'); return; }
      sniperRunning = true;
      try {
        const { runZeroDteSniper } = await import('./zero-dte-sniper');
        await runZeroDteSniper();
      } catch (err) {
        logger.error('[IDEA-PRODUCERS] 0dte-sniper failed:', err);
      } finally {
        sniperRunning = false;
      }
    };
    cron.schedule('45-59/2 9 * * 1-5', sniper, ET);
    cron.schedule('1-59/2 10-15 * * 1-5', sniper, ET);
  }

  // ── Holy Grail (server/holy-grail.ts) — OFF unless HOLY_GRAIL=true. Every
  // 5 min one minute after each 5-min bar closes (09:41–15:56 ET). Light: it
  // reuses the 0DTE sniper's stage-1 1-min bar store (one incremental batched
  // request for the board) plus a once-a-day warm-up read; no option chains,
  // so it runs outside the heavy gate with its own in-flight guard. WATCH rows
  // only, except timeframe × side cells that survived the replay (HG_POLICIES). ──
  if (process.env.HOLY_GRAIL === 'true') {
    let hgRunning = false;
    const holyGrail = async () => {
      if (hgRunning) { logger.info('[IDEA-PRODUCERS] holy-grail: previous pass still running — skipped'); return; }
      hgRunning = true;
      try {
        const { runHolyGrail } = await import('./holy-grail');
        await runHolyGrail();
      } catch (err) {
        logger.error('[IDEA-PRODUCERS] holy-grail failed:', err);
      } finally {
        hgRunning = false;
      }
    };
    cron.schedule('41-59/5 9 * * 1-5', holyGrail, ET);
    cron.schedule('1-59/5 10-15 * * 1-5', holyGrail, ET);
  }

  // ── GEX wall-touch (server/wall-touch.ts) — OFF unless WALL_TOUCH=true, worker
  // role only. Watch rows + in-app alerts + forward log; never publishes ideas.
  //   walls   09:00 and 12:30 ET — one aggregate GEX pass per name (OI only
  //           changes overnight), sequential, each symbol its own runHeavy slot,
  //           so this tick must NOT be wrapped in guarded() (nesting deadlocks).
  //   detect  every minute 09:31–16:00 on the sniper's shared stage-1 1-min bars
  //           (light); a chain only on a confirmed rejection/break (runHeavy
  //           'high', ≤ WALL_TOUCH_MAX_CHAINS per cycle) — own in-flight guard.
  //   outcomes 16:20 + 16:50 ET — one batched stock-bar + option-bar read per day
  //           for that day's logged touches (and any missed day). ──
  if (process.env.WALL_TOUCH === 'true' && (await import('./lib/process-role')).runsWorkerJobs()) {
    let mapRunning = false; let wtRunning = false;
    const wallMap = (phase: 'premarket' | 'midday') => async () => {
      if (mapRunning) { logger.info('[IDEA-PRODUCERS] wall-touch map: previous pass still running — skipped'); return; }
      mapRunning = true;
      try {
        const { computeWallMap } = await import('./wall-touch');
        await computeWallMap(phase);
      } catch (err) {
        logger.error('[IDEA-PRODUCERS] wall-touch map failed:', err);
      } finally {
        mapRunning = false;
      }
    };
    const wallTouch = async () => {
      if (wtRunning) { logger.info('[IDEA-PRODUCERS] wall-touch: previous pass still running — skipped'); return; }
      wtRunning = true;
      try {
        const { runWallTouch } = await import('./wall-touch');
        await runWallTouch();
      } catch (err) {
        logger.error('[IDEA-PRODUCERS] wall-touch failed:', err);
      } finally {
        wtRunning = false;
      }
    };
    cron.schedule('0 9 * * 1-5', wallMap('premarket'), ET);
    cron.schedule('30 12 * * 1-5', wallMap('midday'), ET);
    cron.schedule('31-59 9 * * 1-5', wallTouch, ET);
    cron.schedule('* 10-15 * * 1-5', wallTouch, ET);
    cron.schedule('0 16 * * 1-5', wallTouch, ET);
    cron.schedule('20,50 16 * * 1-5', guarded('wall-touch-outcomes', async () => {
      const { runWallTouchOutcomes } = await import('./wall-touch');
      return (await runWallTouchOutcomes()).written;
    }, 'low'), ET);
  }

  // ── SPX fast moves (server/spx-fast-moves.ts) — OFF unless SPX_FAST_MOVES=true.
  // Every minute 09:31–10:31 (open-drive causes) and 14:30–15:58 (afternoon /
  // close-flow causes). Light: one incremental SPY+VIXY 1-min bar request per
  // pass, a once-a-day baseline, a chain lookup only when something publishes.
  // Publishes only what FAST_MOVE_POLICIES allows (replay: nothing cleared the
  // bar; two unvalidated candidates need SPX_FAST_MOVES_CANDIDATES=true). The
  // index engine also calls it 15:45–15:55 (its own entry window ends 15:45). ──
  if (process.env.SPX_FAST_MOVES === 'true') {
    const fast = guarded('spx-fast-moves', async () => {
      const { runSpxFastMoves } = await import('./spx-fast-moves');
      const r = await runSpxFastMoves();
      return r.fresh.filter((x) => x.status === 'published').length;
    }, 'high');
    cron.schedule('31-59 9 * * 1-5', fast, ET);
    cron.schedule('0-31 10 * * 1-5', fast, ET);
    cron.schedule('30-59 14 * * 1-5', fast, ET);
    cron.schedule('0-58 15 * * 1-5', fast, ET);
  }

  // ── Pre-market ideas (server/premarket-ideas.ts): plan the WATCH list from
  // pre-market movers 08:30–09:25 ET every 10 min, then evaluate the planned
  // setups on live 1m bars 09:30–10:30 ET every 2 min and publish triggered
  // ones (source premarket_gap, ≤5/day, one per symbol, measuring).
  // PREMARKET_IDEAS=false turns both off. ──
  if (process.env.PREMARKET_IDEAS !== 'false') {
    const pmPlan = guarded('premarket-plan', async () => {
      const { runPremarketPlan } = await import('./premarket-ideas');
      return runPremarketPlan();
    });
    cron.schedule('30-59/10 8 * * 1-5', pmPlan, ET);
    cron.schedule('0-25/10 9 * * 1-5', pmPlan, ET);
    const pmTrig = guarded('premarket-triggers', async () => {
      const { runPremarketTriggers } = await import('./premarket-ideas');
      return runPremarketTriggers();
    }, 'high');
    cron.schedule('30-59/2 9 * * 1-5', pmTrig, ET);
    cron.schedule('0-30/2 10 * * 1-5', pmTrig, ET);
  }

  // ── Sector ignition (server/sector-ignition.ts, shared/sector-ignition.ts):
  // one model, four horizons, measuring. Intraday every 5 min 09:34–11:29 on
  // the ≡4 mod 5 minutes (the quant bot shares ≡4 mod 10 — the heavy gate
  // serialises them); the first-hour daily read rides the intraday pass.
  // Pre-market daily read 09:05/09:20, end-of-day 16:10; swing 10:36 + 16:45;
  // weekly Mon 09:12 + Fri 16:50 (watchlist only). SECTOR_IGNITION=false
  // turns the block off; SECTOR_IGNITION_IDEAS=false keeps the reads, no ideas. ──
  if (process.env.SECTOR_IGNITION !== 'false') {
    const ign = (h: 'intraday' | 'daily' | 'swing' | 'weekly', phase?: 'premarket' | 'first_hour' | 'close') => guarded(`sector-ignition:${h}${phase ? `:${phase}` : ''}`, async () => {
      const { runSectorIgnition } = await import('./sector-ignition');
      return runSectorIgnition(h, phase ? { phase } : {});
    });
    cron.schedule('34-59/5 9 * * 1-5', ign('intraday'), ET);
    cron.schedule('4-59/5 10 * * 1-5', ign('intraday'), ET);
    cron.schedule('4-29/5 11 * * 1-5', ign('intraday'), ET);
    cron.schedule('5,20 9 * * 1-5', ign('daily', 'premarket'), ET);
    cron.schedule('10 16 * * 1-5', ign('daily', 'close'), ET);
    cron.schedule('36 10 * * 1-5', ign('swing'), ET);
    cron.schedule('45 16 * * 1-5', ign('swing'), ET);
    cron.schedule('12 9 * * 1', ign('weekly'), ET);
    cron.schedule('50 16 * * 5', ign('weekly'), ET);
  }

  // ── Sector board (server/sector-board.ts, shared/sector-board.ts): rank flow,
  // rankings, overnight movers and confluence leaders, published to shared state
  // for the web route (which never computes). Pre-market 08:45 + 09:20 (the 09:20
  // quote read shares the 60 s pre-market cache with sector ignition's), every
  // 15 min 09:37–15:52 on :07/:22/:37/:52 (≡2 mod 5; the heavy gate serialises it
  // with the tape at :22/:52), close 16:15 (forward log), after-hours 17:45.
  // 'low' priority: minute-sensitive jobs go first. SECTOR_BOARD=false turns it off. ──
  if (process.env.SECTOR_BOARD !== 'false') {
    const board = guarded('sector-board', async () => {
      const { runSectorBoard } = await import('./sector-board');
      return runSectorBoard();
    }, 'low');
    cron.schedule('45 8 * * 1-5', board, ET);
    cron.schedule('20 9 * * 1-5', board, ET);
    cron.schedule('37,52 9 * * 1-5', board, ET);
    cron.schedule('7,22,37,52 10-15 * * 1-5', board, ET);
    cron.schedule('15 16 * * 1-5', board, ET);
    cron.schedule('45 17 * * 1-5', board, ET);
    (await import('./sector-board')).scheduleSectorBoardBootstrap();
  }

  // ── Quant sweep — publish only (no paper execution, no Discord). ──
  cron.schedule('27,57 9-15 * * 1-5', guarded('quant', async () => {
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

  log(`🧭 [WEB] Idea producers scheduled — index 0DTE 5m (2m power hour), 0DTE desk names 5m/2m, short swings 2×/day, flags/reclaim hourly, tape 10m, GEX setups 30m, quant 30m (staggered minutes, one heavy job at a time), index/leader swing + crypto proxy 2×/day, native crypto ideas 30m 24/7 + crypto tracker 5m, reversal slate nightly, pre-market ideas plan 08:30–09:25 10m + triggers 09:30–10:30 2m, sector ignition intraday 5m 09:34–11:29 + daily/swing/weekly reads${process.env.ZERO_DTE_SNIPER === 'true' ? ', 0DTE sniper 2m 09:45–15:50 (ZERO_DTE_SNIPER=true)' : ''}${process.env.SPX_FAST_MOVES === 'true' ? ', SPX fast moves 1m 09:31–10:31 + 14:30–15:58 (SPX_FAST_MOVES=true)' : ''}${process.env.HOLY_GRAIL === 'true' ? ', Holy Grail 5m 09:41–15:56 (HOLY_GRAIL=true)' : ''}${process.env.WALL_TOUCH === 'true' ? ', GEX wall-touch walls 09:00/12:30 + detection 1m 09:31–16:00 + outcomes 16:20/16:50 (WALL_TOUCH=true, watch/alerts/log only)' : ''} (IDEA_PRODUCERS_IN_WEB=false disables)`);
}
