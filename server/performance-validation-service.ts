import { storage } from "./storage";
import { PerformanceValidator, computeRealisedPnl } from "./performance-validator";
import { planExitTiming, appendNote, formatExitDate, isHitTimeUnknown, unresolvedExitLabel, type ExitTimeSource, type TimedBar } from "@shared/exit-hit-time";
import { barsSinceEntry, toExitTimingIdea } from "./lib/exit-time-bars";
import { premiumAtTouch, priceOptionBarrierExit } from "@shared/option-exit-pricing";
import { expiryDay, optionExpiryCloseMs } from "@shared/option-expiry";
import { intrinsicValue, settlementUnderlying } from "@shared/journal-expiry";
import { defaultExpiryBarFetcher, fetchExpiryPrints } from "./journal-expiry-settle";
import { readLossRulesStamp, progressR } from "@shared/loss-rules";
import { fetchStockPrice, fetchCryptoPrice } from "./market-api";
import { fetchCboeChain, findContractMid, type CboeChain } from "./contract-analyzer/cboe-chain";
import { analyzeLoss } from "./loss-analyzer";
import { backfillContractlessIdeas } from "./universal-idea-generator";
import { runHeavy } from "./lib/heavy-job-gate";
import type { TradeIdea, InsertTradePriceSnapshot, PriceSnapshotEventType } from "@shared/schema";

/** Max open ideas judged per slice (prices + chains fetched together). */
const OUTCOME_BATCH = Math.max(5, Number(process.env.OUTCOME_BATCH) || 25);
const yieldToLoop = () => new Promise<void>((r) => setImmediate(r));

/**
 * Automated Performance Validation Service
 * Runs periodically to validate open trade ideas and update outcomes
 */
class PerformanceValidationService {
  private intervalId: NodeJS.Timeout | null = null;
  private isValidating = false;
  private validationIntervalMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Start the automated validation service
   */
  start() {
    if (this.intervalId) {
      console.log('⚠️  Performance validation service already running');
      return;
    }

    console.log(`🎯 Starting Performance Validation Service (interval: ${this.validationIntervalMs / 1000 / 60} minutes)`);

    // Monday morning catchup: validate all open ideas even if market isn't
    // fully open yet. This closes out Friday ideas that hit target/stop
    // over the weekend (which were skipped because isMarketOpen() returns false
    // on Saturday/Sunday).
    // First sweep goes through the heavy gate like every later one. At boot
    // it grades whatever printed while the worker was down, fetching 5m bars
    // per symbol for the hit time (shared/exit-hit-time.ts); run ungated it
    // landed on top of the conviction build and GEX first passes, and a
    // failed/throttled bar fetch meant a cycle-time exit stamp.
    if (this.needsWeekendCatchup()) {
      console.log('📅 Monday morning catchup — validating open ideas from weekend gap');
      runHeavy('outcome-tracker', () => this.validateAllOpenTrades(true), { priority: 'low', maxWaitMs: 10 * 60_000 }).catch(err =>
        console.error('❌ Weekend catchup validation failed:', err)
      );
    } else {
      // Run on startup (the worker registry already delays this 2 min)
      runHeavy('outcome-tracker', () => this.validateAllOpenTrades(), { priority: 'low', maxWaitMs: 10 * 60_000 }).catch(err =>
        console.error('❌ Initial performance validation failed:', err)
      );
    }

    // Retry contract attachment for any option-intent ideas that saved as stock
    // (CBOE chain unavailable at creation). Runs on startup + each cycle so the
    // "save-as-stock, retry later" fallback actually self-heals into real contracts.
    runHeavy('contract-backfill', () => backfillContractlessIdeas(), { priority: 'low', maxWaitMs: 10 * 60_000 }).catch(err =>
      console.error('❌ Initial contract backfill failed:', err)
    );

    // Then run periodically
    // Both passes run under the heavy-job gate so they never coincide with a
    // scan or GEX parse on the 1 vCPU box (server/lib/heavy-job-gate.ts).
    this.intervalId = setInterval(() => {
      runHeavy('outcome-tracker', () => this.validateAllOpenTrades(), { priority: 'low' }).catch(err =>
        console.error('❌ Performance validation failed:', err)
      );
      runHeavy('contract-backfill', () => backfillContractlessIdeas(), { priority: 'low' }).catch(err =>
        console.error('❌ Contract backfill failed:', err)
      );
    }, this.validationIntervalMs);

    console.log('✅ Performance validation service started');
  }

  /**
   * Stop the validation service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Performance validation service stopped');
    }
  }

  /**
   * Check if stock market is open (weekday during market hours ET)
   * Returns false on weekends to prevent false validations with stale prices
   */
  private isMarketOpen(): boolean {
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dayOfWeek = etTime.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = etTime.getHours();
    const minute = etTime.getMinutes();

    // Weekend check - markets closed
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }

    // Extended validation window: 8:00 AM - 5:00 PM ET (includes pre/post market)
    const timeInMinutes = hour * 60 + minute;
    const marketOpen = 8 * 60; // 8:00 AM ET
    const marketClose = 17 * 60; // 5:00 PM ET

    return timeInMinutes >= marketOpen && timeInMinutes <= marketClose;
  }

  /**
   * Check if this is Monday before market open (catchup window for weekend gaps).
   * Runs once per boot to close out Friday ideas that hit target/stop over the weekend.
   */
  private needsWeekendCatchup(): boolean {
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dayOfWeek = etTime.getDay();
    const hour = etTime.getHours();
    // Monday before 10 AM ET — catchup window
    return dayOfWeek === 1 && hour < 10;
  }

  /**
   * Validate all open trade ideas
   * Fetches current prices and checks if any hit target/stop/expired
   */
  async validateAllOpenTrades(forceRun = false): Promise<{
    validated: number;
    winners: number;
    losers: number;
    expired: number;
  }> {
    // Prevent concurrent validations
    if (this.isValidating) {
      console.log('⏭️  Skipping validation - already in progress');
      return { validated: 0, winners: 0, losers: 0, expired: 0 };
    }

    // Outside market hours (and all weekend) only CRYPTO is validated — coins
    // trade 24/7, and skipping them left a weekend hole in their outcomes.
    // Stocks/options/futures still wait for the session (forceRun = Monday catchup).
    const cryptoOnly = !forceRun && !this.isMarketOpen();
    if (cryptoOnly) {
      const now = new Date();
      const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][etTime.getDay()];
      console.log(`📊 Market closed (${dayName} ${etTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} ET) — validating crypto only`);
    }

    this.isValidating = true;
    this.lastRunTime = new Date();
    let validated = 0;
    let winners = 0;
    let losers = 0;
    let expired = 0;

    try {
      // crypto_engine rows are resolved by their own 24/7 path tracker
      // (server/crypto-ideas-engine.ts trackCryptoIdeas) from Coinbase bars.
      const openIdeas = (await storage.getOpenTradeIdeas())
        .filter(i => String(i.source) !== 'crypto_engine')
        .filter(i => !cryptoOnly || i.assetType === 'crypto');
      
      if (openIdeas.length === 0) {
        console.log('📊 No open trade ideas to validate');
        this.lastRunSuccess = true; // Clean run with no work to do
        return { validated: 0, winners: 0, losers: 0, expired: 0 };
      }

      console.log(`📊 Validating ${openIdeas.length} open trade ideas...`);

      // Batched: at most OUTCOME_BATCH ideas per slice, yielding to the event
      // loop between slices. One pass over a 200-idea backlog used to fire every
      // price/chain fetch at once (Promise.all over the whole book) and hold the
      // single vCPU while HTTP requests queued behind it.
      for (let i = 0; i < openIdeas.length; i += OUTCOME_BATCH) {
        const slice = openIdeas.slice(i, i + OUTCOME_BATCH);
        const r = await this.validateSlice(slice);
        validated += r.validated; winners += r.winners; losers += r.losers; expired += r.expired;
        if (i + OUTCOME_BATCH < openIdeas.length) await yieldToLoop();
      }
      if (validated > 0) {
        console.log(`✅ Validated ${validated} trades: ${winners} winners, ${losers} losers, ${expired} expired`);
      } else {
        console.log('📊 All open trades still in progress');
      }

      this.lastRunSuccess = true;
      return { validated, winners, losers, expired };

    } catch (error) {
      console.error('❌ Performance validation error:', error);
      this.lastRunSuccess = false;
      throw error;
    } finally {
      this.isValidating = false;
    }
  }

  /** One slice of the open book: fetch its prices, judge it, write the resolutions. */
  private async validateSlice(openIdeas: TradeIdea[]): Promise<{ validated: number; winners: number; losers: number; expired: number }> {
    let validated = 0;
    let winners = 0;
    let losers = 0;
    let expired = 0;
    // Fetch current prices for all symbols
    const priceMap = await this.fetchCurrentPrices(openIdeas);
    
    // 🔧 BUG FIX: Fetch futures contracts to avoid circular dependency in validator
    // Collect unique contract codes from futures ideas
    const futuresContractCodes = new Set(
      openIdeas
        .filter(i => i.assetType === 'future' && i.futuresContractCode)
        .map(i => i.futuresContractCode!)
    );
    
    // Fetch all needed contracts in parallel
    const contractsMap = new Map();
    if (futuresContractCodes.size > 0) {
      console.log(`  📊 Fetching ${futuresContractCodes.size} futures contracts...`);
      const contractPromises = Array.from(futuresContractCodes).map(async code => {
        try {
          const contract = await storage.getFuturesContract(code);
          return { code, contract };
        } catch (error) {
          console.warn(`  ⚠️  Failed to fetch contract ${code}:`, error);
          return { code, contract: null };
        }
      });
      
      const contractResults = await Promise.all(contractPromises);
      for (const { code, contract } of contractResults) {
        if (contract) {
          contractsMap.set(code, contract);
        }
      }
      console.log(`  ✓ Fetched ${contractsMap.size}/${futuresContractCodes.size} contracts successfully`);
    }
    
    // Enrich extremes from REAL daily bars before judging barriers. The
    // tracked highest/lowestPriceReached only advanced at 5-minute polls, so
    // a spike that touched a barrier BETWEEN polls (or during a dev restart)
    // never existed as far as resolution was concerned — wins and losses
    // both undercounted, silently. Today's bar high/low from the candle
    // feed captures the full session regardless of poll timing.
    try {
      const { fetchCandlesBatch } = await import('./historical-candles');
      // Crypto is excluded: these candles are EQUITY bars, and BTC/LINK/… are
      // also equity tickers — a $40 ETF low would "stop" a $100k BTC long.
      const barIdeas = openIdeas.filter(i => i.assetType !== 'crypto');
      const symbols = Array.from(new Set(barIdeas.map(i => i.symbol.toUpperCase())));
      const candles = await fetchCandlesBatch(symbols, '5d', '1d', 8);
      const today = new Date().toISOString().slice(0, 10);
      let enriched = 0;
      // An idea published TODAY must not be judged by the part of the session
      // before it existed. The whole-day bar did exactly that: a 14:00 idea was
      // "stopped" by a 10:00 low. 5-minute replay of every resolved idea
      // (research/path-replay.ts, 2026-09-24) found 50 recorded stops that
      // price never touched after publication. Same-day ideas use 5m bars from
      // the publish minute; older ideas keep the full daily bar.
      const { fetchCandles } = await import('./historical-candles');
      for (const idea of barIdeas) {
        const createdSec = new Date(idea.timestamp).getTime() / 1000;
        if (new Date(idea.timestamp).toISOString().slice(0, 10) === today) {
          // Regular session only, matching the daily bar used on later days.
          const etMin = (t: number) => { const [h, m] = new Date(t * 1000).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' }).split(':').map(Number); return (h % 24) * 60 + m; };
          const intraday = (await fetchCandles(idea.symbol.toUpperCase(), '5d', '5m'))
            .filter((b) => b.time >= createdSec && etMin(b.time) >= 570 && etMin(b.time) < 960);
          if (intraday.length) {
            idea.highestPriceReached = Math.max(idea.highestPriceReached ?? -Infinity, ...intraday.map((b) => b.high));
            idea.lowestPriceReached = Math.min(idea.lowestPriceReached ?? Infinity, ...intraday.map((b) => b.low));
            enriched++;
          }
          continue;
        }
        const bars = candles.get(idea.symbol.toUpperCase()) ?? [];
        const todayBar = bars[bars.length - 1];
        if (!todayBar) continue;
        const barDay = new Date(todayBar.time * 1000).toISOString().slice(0, 10);
        if (barDay !== today) continue;
        if (Number.isFinite(todayBar.high) && todayBar.high > 0) {
          idea.highestPriceReached = Math.max(idea.highestPriceReached ?? -Infinity, todayBar.high);
          enriched++;
        }
        if (Number.isFinite(todayBar.low) && todayBar.low > 0) {
          idea.lowestPriceReached = Math.min(idea.lowestPriceReached ?? Infinity, todayBar.low);
        }
      }
      if (enriched > 0) console.log(`  📏 Extremes enriched from daily bars for ${enriched} idea(s)`);
    } catch (err: any) {
      console.warn('  ⚠️ Bar-extreme enrichment failed (continuing with poll extremes):', err?.message);
    }

    // Validate each idea with contract metadata
    const validationResults = PerformanceValidator.validateBatch(openIdeas, priceMap, contractsMap);

    // Update database for ideas that need updating
    for (const [ideaId, result] of Array.from(validationResults.entries())) {
      if (result.shouldUpdate) {
        const ideaForResult = openIdeas.find(i => i.id === ideaId);

        // ⏱️ EXIT TIME = HIT TIME. The validator stamps barrier hits with the
        // run time; find the first bar that actually crossed the level (and
        // reprice deadline exits at the deadline). See shared/exit-hit-time.ts.
        let outcomeNotes: string | undefined;
        if (ideaForResult && result.outcomeStatus && result.outcomeStatus !== 'open') {
          try {
            outcomeNotes = await this.refineExitTiming(ideaForResult, result);
          } catch (err: any) {
            console.warn(`  ⚠️  exit-time refinement failed for ${ideaForResult.symbol} (keeping validator stamp):`, err?.message);
            // The validator stamp is the cycle time. For a barrier hit that is
            // NOT the hit time — label it instead of letting it pass as one.
            if (isHitTimeUnknown(result.outcomeStatus, result.exitTimeSource)) {
              outcomeNotes = appendNote(
                ideaForResult.outcomeNotes,
                `[exit-time:live] ${unresolvedExitLabel(Date.parse(result.exitDate ?? '') || Date.now())} — bar lookup failed: ${err?.message ?? err}`,
              );
            }
          }
        }

        // An option that reaches its own expiry settles at intrinsic, not at
        // whatever quote happened to be available on the later tracker pass.
        // Use the exact expiry-day underlying print (including AM-settled index
        // rules). If the print is unavailable, leave contract P&L unmeasured.
        let expiryIntrinsic: number | null = null;
        let optionExpiryAttempted = false;
        if (
          ideaForResult?.assetType === 'option' && result.outcomeStatus === 'expired' &&
          result.resolutionReason === 'auto_expired' && ideaForResult.expiryDate
        ) {
          const expiryCloseMs = optionExpiryCloseMs(ideaForResult.expiryDate);
          const publishedMs = Date.parse(ideaForResult.timestamp);
          const exitMs = Date.parse(result.exitDate ?? '');
          // Only the option's own expiry deadline qualifies. A shorter planned
          // time stop is still priced from its exit quote, not expiry intrinsic.
          optionExpiryAttempted = Number.isFinite(expiryCloseMs) && Number.isFinite(publishedMs) && publishedMs < expiryCloseMs &&
            Number.isFinite(exitMs) && Math.abs(exitMs - expiryCloseMs) < 60_000;
          if (optionExpiryAttempted) {
            const source = settlementUnderlying(ideaForResult.symbol, String(ideaForResult.expiryDate).slice(0, 10));
            const prints = await fetchExpiryPrints([ideaForResult as any], defaultExpiryBarFetcher);
            const print = source ? prints.get(`${source.symbol}|${String(ideaForResult.expiryDate).slice(0, 10)}`) : null;
            const strike = Number((ideaForResult as any).strikePrice);
            if (source && print && Number.isFinite(strike) && strike > 0 && ideaForResult.optionType) {
              const settlementSpot = Math.round(Number(print[source.field]) * source.scale * 100) / 100;
              expiryIntrinsic = intrinsicValue(ideaForResult.optionType, strike, settlementSpot);
              result.exitPrice = settlementSpot;
              const direction = PerformanceValidator.getNormalizedDirection(ideaForResult);
              const move = (settlementSpot - Number(ideaForResult.entryPrice)) / Number(ideaForResult.entryPrice) * 100;
              result.percentGain = Math.round((direction === 'short' ? -move : move) * 100) / 100;
              result.resolutionReason = 'option_expiry_intrinsic';
              outcomeNotes = appendNote(outcomeNotes ?? ideaForResult.outcomeNotes,
                `[expiry-premium:intrinsic] ${source.symbol} ${source.field} ${settlementSpot} on ${String(ideaForResult.expiryDate).slice(0, 10)}${source.approximate ? ` (${source.approximate})` : ''}`);
            } else {
              result.exitPrice = null;
              result.percentGain = null;
              result.resolutionReason = 'option_expiry_unmeasured';
              outcomeNotes = appendNote(outcomeNotes ?? ideaForResult.outcomeNotes,
                `[expiry-premium:withheld] no exact expiry-day settlement print; option outcome excluded from P&L and win-rate metrics`);
            }
          }
        }

        // 💵 OPTION OUTCOME: an expiry uses intrinsic above; a barrier uses the
        // contract's own bar when available. A later tracker-pass mark is kept
        // only as provenance and excluded from realized option-return metrics.
        let exitPremium: number | null = null;
        let optionPercentGain: number | null = null;
        let optionPremiumBasis: 'touch_bar' | 'pass' | 'withheld' | 'intrinsic' | null = null;
        if (
          ideaForResult?.assetType === 'option' &&
          result.outcomeStatus && result.outcomeStatus !== 'open' &&
          typeof ideaForResult.entryPremium === 'number' && ideaForResult.entryPremium > 0
        ) {
          const quoted = priceMap.get(`option_${ideaId}`);
          const livePremium = typeof quoted === 'number' && quoted >= 0 ? quoted : null;
          if (result.outcomeStatus === 'hit_target' || result.outcomeStatus === 'hit_stop') {
            // 🎯 Barrier exit: price the contract at the TOUCH from its own bar
            // (shared/option-exit-pricing.ts); the pass quote is only a
            // labelled fallback, and a stop never books a gain it didn't earn.
            const touch = await this.optionPremiumAtTouch(ideaForResult, result).catch(() => null);
            const priced = priceOptionBarrierExit({
              outcome: result.outcomeStatus,
              direction: PerformanceValidator.getNormalizedDirection(ideaForResult),
              entryPrice: Number(ideaForResult.entryPrice),
              fillPrice: Number(result.exitPrice),
              entryPremium: ideaForResult.entryPremium,
              touchPremium: touch?.premium ?? null,
              touchDetail: touch?.detail,
              passPremium: livePremium,
              strike: Number((ideaForResult as any).strikePrice),
              optionType: (ideaForResult as any).optionType,
            });
            exitPremium = priced.exitPremium;
            optionPremiumBasis = priced.basis === 'none' ? 'withheld' : priced.basis;
            outcomeNotes = appendNote(outcomeNotes ?? ideaForResult.outcomeNotes, priced.note);
            if (priced.stopGain === 'withheld') {
              console.warn(`  🚩 [STOP-GAIN] ${ideaForResult.symbol} ${ideaId}: ${priced.note}`);
            } else if (priced.stopGain === 'allowed') {
              console.warn(`  🚩 [STOP-GAIN] ${ideaForResult.symbol} ${ideaId} (genuine fill in favour): ${priced.note}`);
            }
          } else if (optionExpiryAttempted) {
            exitPremium = expiryIntrinsic;
            optionPremiumBasis = expiryIntrinsic == null ? 'withheld' : 'intrinsic';
          } else if (livePremium != null) {
            /**
             * Floor the exit premium at intrinsic value.
             *
             * An option cannot be worth less than what it is worth if
             * exercised right now. When the quoted premium is below intrinsic,
             * the quote is stale — not a bargain. (AFRM 77C 09/04: a 162%
             * contract return was recorded as +14.95% off a pre-earnings quote.)
             */
            const strike = Number((ideaForResult as any).strikePrice);
            const isCall = String((ideaForResult as any).optionType ?? '').toLowerCase().startsWith('c');
            const underlyingExit = Number(result.exitPrice);

            let effective = livePremium;
            if (Number.isFinite(strike) && strike > 0 && Number.isFinite(underlyingExit) && underlyingExit > 0) {
              const intrinsic = isCall
                ? Math.max(0, underlyingExit - strike)
                : Math.max(0, strike - underlyingExit);
              if (intrinsic > livePremium) {
                console.log(
                  `  ⚠️  ${ideaForResult.symbol} quoted exit premium $${livePremium.toFixed(2)} is below ` +
                  `intrinsic $${intrinsic.toFixed(2)} (underlying ${underlyingExit}, strike ${strike}) — ` +
                  `stale chain, using intrinsic`,
                );
                effective = intrinsic;
              }
            }
            exitPremium = Math.round(effective * 100) / 100;
            optionPremiumBasis = 'pass';
            outcomeNotes = appendNote(outcomeNotes ?? ideaForResult.outcomeNotes,
              '[exit-premium:pass] current option mark does not match the recorded outcome timestamp; excluded from realized option P&L');
          } else {
            optionPremiumBasis = 'withheld';
            outcomeNotes = appendNote(outcomeNotes ?? ideaForResult.outcomeNotes,
              '[exit-premium:withheld] no option premium aligned with the recorded outcome timestamp');
          }
          if (exitPremium != null && optionPremiumBasis !== 'pass' && optionPremiumBasis !== 'withheld') {
            const rawPct = ((exitPremium - ideaForResult.entryPremium) / ideaForResult.entryPremium) * 100;
            // Calls and puts are bought. `direction` describes the underlying
            // thesis, not the side of the option contract.
            optionPercentGain = Math.round(rawPct * 100) / 100;
            console.log(`  💵 ${ideaForResult.symbol} option P&L: entry $${ideaForResult.entryPremium} → exit $${exitPremium} = ${optionPercentGain >= 0 ? '+' : ''}${optionPercentGain}%`);
          }
        }
        // Underlying stop that books a gain: only a stop placed on the
        // profitable side of entry does that — log every one for review.
        if (result.outcomeStatus === 'hit_stop' && ideaForResult?.assetType !== 'option' && Number(result.percentGain) > 0) {
          console.warn(`  🚩 [STOP-GAIN] ${ideaForResult?.symbol} ${ideaId}: stop exit at ${result.exitPrice} books +${Number(result.percentGain).toFixed(2)}% (stop on the profitable side of entry)`);
        }

        await storage.updateTradeIdeaPerformance(ideaId, {
          outcomeStatus: result.outcomeStatus,
          exitPrice: result.exitPrice,
          percentGain: result.percentGain,
          resolutionReason: result.resolutionReason,
          exitDate: result.exitDate,
          actualHoldingTimeMinutes: result.actualHoldingTimeMinutes,
          ...(outcomeNotes ? { outcomeNotes } : {}),
          predictionAccurate: result.predictionAccurate,
          predictionValidatedAt: result.predictionValidatedAt,
          highestPriceReached: result.highestPriceReached,
          lowestPriceReached: result.lowestPriceReached,
          // 🎓 EDUCATIONAL: Track what would have happened for missed entries
          missedEntryTheoreticalOutcome: result.missedEntryTheoreticalOutcome,
          missedEntryTheoreticalGain: result.missedEntryTheoreticalGain,
          // 💵 Real option contract P&L (option ideas only)
          exitPremium: ideaForResult?.assetType === 'option' && result.outcomeStatus !== 'open' ? exitPremium : undefined,
          optionPercentGain: ideaForResult?.assetType === 'option' && result.outcomeStatus !== 'open' ? optionPercentGain : undefined,
        });

        validated++;
        const idea = openIdeas.find(i => i.id === ideaId);
        
        if (result.outcomeStatus === 'hit_target') {
          winners++;
          // 🚫 DISABLED: Do NOT send theoretical gains to Discord
          // These are from trade_ideas (research signals), NOT actual bot trades
          // Real bot gains come from paper_positions exits via sendBotTradeExitToDiscord
          // Sending theoretical gains as "WINNERS" is misleading to users
          console.log(`  📊 ${idea?.symbol}: THEORETICAL target hit (not posted to Discord)`);
        }
        else if (result.outcomeStatus === 'hit_stop') {
          losers++;
          // 📉 Automatic loss analysis - understand why this trade failed
          if (idea) {
            try {
              const updatedIdea = { ...idea, outcomeStatus: result.outcomeStatus as any, percentGain: result.percentGain ?? null, exitPrice: result.exitPrice ?? null, actualHoldingTimeMinutes: result.actualHoldingTimeMinutes ?? null };
              const lossAnalysis = await analyzeLoss(updatedIdea);
              if (lossAnalysis) {
                await storage.createLossAnalysis(lossAnalysis);
                console.log(`  📉 Loss analyzed: ${idea.symbol} - ${lossAnalysis.lossReason}`);
              }
            } catch (err) {
              console.warn(`  ⚠️  Failed to analyze loss for ${idea?.symbol}:`, err);
            }
          }
        }
        else if (result.outcomeStatus === 'expired') expired++;
        if (idea) {
          console.log(`  ✓ ${idea.symbol}: ${result.outcomeStatus} at $${result.exitPrice?.toFixed(2)} (${result.percentGain?.toFixed(1)}%)`);
          
          // 📸 Save price snapshot for audit trail
          const currentPrice = priceMap.get(idea.symbol) || result.exitPrice;
          if (currentPrice) {
            const eventType: PriceSnapshotEventType = 
              result.outcomeStatus === 'hit_target' ? 'target_hit' :
              result.outcomeStatus === 'hit_stop' ? 'stop_hit' :
              result.outcomeStatus === 'expired' ? 'expired' : 'validation_check';
            
            const snapshot: InsertTradePriceSnapshot = {
              tradeIdeaId: ideaId,
              eventType,
              eventTimestamp: new Date().toISOString(),
              currentPrice: currentPrice,
              bidPrice: null, // Full bid/ask available from Tradier for options
              askPrice: null,
              lastPrice: currentPrice,
              distanceToTargetPercent: result.percentGain ? Math.abs(result.percentGain) : null,
              distanceToStopPercent: null,
              pnlAtSnapshot: result.percentGain ?? null,
              validatorVersion: 'v1.0',
              dataSource: 'validation',
            };
            
            try {
              await storage.savePriceSnapshot(snapshot);
            } catch (err) {
              console.warn(`  ⚠️  Failed to save price snapshot for ${idea.symbol}:`, err);
            }
          }
        }
      }
    }

    return { validated, winners, losers, expired };
  }

  /**
   * Replace the validator's run-time stamp with the time price actually did it.
   * Mutates `result` (exitDate, holding time, and — for deadline exits — the
   * exit price / % / P&L) and returns the outcome note to store.
   */
  private async refineExitTiming(idea: TradeIdea, result: any): Promise<string | undefined> {
    const now = Date.now();
    const tIdea = toExitTimingIdea(idea as any);
    const needsBars = result.outcomeStatus === 'hit_target' || result.outcomeStatus === 'hit_stop'
      || (result.exitTimeSource === 'deadline' && !String(result.resolutionReason ?? '').startsWith('missed_entry'));
    const { bars, interval, extendedBars } = needsBars
      ? await barsSinceEntry(idea.symbol, idea.assetType, tIdea.touchFromMs ?? tIdea.entryMs, now)
      : { bars: [] as TimedBar[], interval: null, extendedBars: undefined };
    let plan = planExitTiming(tIdea, result, bars, now, { barInterval: interval ?? undefined });
    let planIntraday = interval === '5m';
    // Not in the regular session — the polled extreme may have been a pre/post
    // market print. Look there before declaring the hit time unknown.
    if (plan.source === 'live' && extendedBars?.length && isHitTimeUnknown(result.outcomeStatus, 'live')) {
      const ext = planExitTiming(tIdea, result, extendedBars, now, { barInterval: '5m extended-hours' });
      if (ext.source === 'bar_hit') { plan = ext; planIntraday = true; }
    }
    if (plan.source === 'live' && isHitTimeUnknown(result.outcomeStatus, 'live')) {
      console.warn(`  ⏱️  ${idea.symbol}: ${plan.note}`);
    }

    // A time stop is decided on the LIVE price. Repricing it at the deadline is
    // only honest when the deadline price would also have triggered it.
    if (result.resolutionReason === 'auto_time_stop') {
      const minR = readLossRulesStamp(idea.convergenceSignalsJson)?.timeStop?.minR;
      const px = plan.exitPrice;
      const stillExit = px != null && minR != null && progressR(tIdea.direction, tIdea.entryPrice, tIdea.stopLoss, px) < minR;
      if (!stillExit) {
        result.exitTimeSource = 'live' as ExitTimeSource;
        result.exitDate = formatExitDate(now);
        result.actualHoldingTimeMinutes = Math.max(0, Math.floor((now - Date.parse(idea.timestamp)) / 60_000));
        return appendNote(idea.outcomeNotes, '[exit-time:live] time stop decided on the live quote (no deadline bar, or the deadline price would not have triggered it)');
      }
    }

    result.exitTimeSource = plan.source;
    result.exitDate = plan.exitDate;
    result.actualHoldingTimeMinutes = plan.holdingMinutes;
    if (plan.source === 'bar_hit') {
      // For pricing the contract at the touch (validateSlice).
      result.exitTouchMs = plan.exitMs;
      result.exitFill = plan.fill;
      result.exitTouchIntraday = planIntraday;
    }
    if (plan.exitPrice != null && plan.percentGain != null) {
      result.exitPrice = plan.exitPrice;
      result.percentGain = plan.percentGain;
      if ((result.resolutionReason === 'auto_time_stop' || plan.fill === 'gap_open') && idea.assetType !== 'future') {
        const r = computeRealisedPnl(idea, plan.exitPrice);
        if (r) result.realizedPnL = Math.round(r.pnl * 100) / 100;
      }
    }
    if (plan.source !== 'live') console.log(`  ⏱️  ${idea.symbol}: ${plan.note}`);
    return appendNote(idea.outcomeNotes, plan.note);
  }

  /**
   * The contract's premium at the underlying's touch bar, from Alpaca option
   * bars (5-minute trade prints). Only for intraday touches — a daily bar's
   * start is not a touch time. Null when unavailable (caller labels the pass
   * quote instead).
   */
  private async optionPremiumAtTouch(idea: TradeIdea, result: any): Promise<{ premium: number; detail: string } | null> {
    const touchMs = Number(result.exitTouchMs);
    if (result.exitTimeSource !== 'bar_hit' || !Number.isFinite(touchMs) || !result.exitTouchIntraday) return null;
    const type = String((idea as any).optionType ?? '').toLowerCase().startsWith('p') ? 'put' : 'call';
    const strike = Number((idea as any).strikePrice);
    const day = expiryDay((idea as any).expiryDate);
    if (!day || !(strike > 0)) return null;
    const { getAlpacaOptionBars } = await import('./alpaca-options');
    const { buildOccOptionSymbol } = await import('./option-minute-history');
    const sym = idea.symbol.toUpperCase();
    const roots = sym === 'SPX' ? ['SPXW', 'SPX'] : sym === 'NDX' ? ['NDXP', 'NDX'] : [sym];
    for (const root of roots) {
      let occ: string;
      try { occ = buildOccOptionSymbol(root, day, type, strike); } catch { return null; }
      const bars = await getAlpacaOptionBars(occ, touchMs - 10 * 60_000, touchMs + 45 * 60_000, '5Min');
      const hit = premiumAtTouch(bars, touchMs, { barMs: 5 * 60_000, gap: result.exitFill === 'gap_open' });
      if (hit) {
        return { premium: hit.premium, detail: `${occ} 5m bar ${new Date(hit.barStartMs).toISOString().slice(0, 16)}Z ${hit.basis}, Alpaca indicative trade prints` };
      }
    }
    return null;
  }

  /**
   * Fetch current prices for all symbols including OPTIONS
   * OPTIMIZED: Deduplicates symbols, batches requests, includes retry logic
   * 
   * ✅ FIXED: Now fetches option premiums from Tradier API for proper validation
   */
  private async fetchCurrentPrices(ideas: TradeIdea[]): Promise<Map<string, number>> {
    const priceMap = new Map<string, number>();
    
    // OPTIMIZATION: Deduplicate symbols first (avoid redundant API calls)
    const uniqueStockSymbols = new Set(
      ideas
        .filter(i => i.assetType === 'stock' || i.assetType === 'penny_stock')
        .map(i => i.symbol)
    );
    
    const uniqueCryptoSymbols = new Set(
      ideas
        .filter(i => i.assetType === 'crypto')
        .map(i => i.symbol)
    );
    
    // Collect unique options (need full option details, not just symbol)
    const optionIdeas = ideas.filter(i => 
      i.assetType === 'option' && i.strikePrice && i.expiryDate && i.optionType
    );

    const totalUnique = uniqueStockSymbols.size + uniqueCryptoSymbols.size + optionIdeas.length;
    console.log(`  📊 Fetching prices for ${totalUnique} unique symbols (${uniqueStockSymbols.size} stocks, ${uniqueCryptoSymbols.size} crypto, ${optionIdeas.length} options)`);

    // OPTIMIZATION: Fetch all prices in parallel using Promise.all
    const stockPromises = Array.from(uniqueStockSymbols).map(async (symbol) => ({
      symbol,
      type: 'stock' as const,
      price: await this.fetchWithRetry(symbol, 'stock'),
    }));

    const cryptoPromises = Array.from(uniqueCryptoSymbols).map(async (symbol) => ({
      symbol,
      type: 'crypto' as const,
      price: await this.fetchWithRetry(symbol, 'crypto'),
    }));
    
    // OPTIONS — single source of truth: fetch the CBOE chain ONCE per unique
    // underlying. One call gives us BOTH the underlying spot (for resolving the
    // stock-level target/stop) AND the contract mid premium (for real option
    // P&L). This replaces the dead Tradier path.
    const optionUnderlyings = Array.from(
      new Set(optionIdeas.map(i => i.symbol.toUpperCase()))
    );
    const chainPromises = optionUnderlyings.map(async (sym) => {
      const chain = await fetchCboeChain(sym).catch(() => null);
      return { sym, chain };
    });

    // Execute all price fetches concurrently
    const [stockResults, cryptoResults, chainResults] = await Promise.all([
      Promise.all(stockPromises),
      Promise.all(cryptoPromises),
      Promise.all(chainPromises),
    ]);

    // Index fetched chains by underlying so we can derive spot + premium per idea
    const chainBySymbol = new Map<string, CboeChain>();
    for (const { sym, chain } of chainResults) {
      if (chain) chainBySymbol.set(sym, chain);
    }

    // Derive per-idea results: spot keyed by symbol (for stock-level
    // target/stop resolution) + premium keyed by option_<id> (for P&L).
    const optionResults = optionIdeas.map((idea) => {
      const chain = chainBySymbol.get(idea.symbol.toUpperCase());
      if (!chain) {
        return { symbol: idea.symbol, ideaId: idea.id, spot: null, premium: null };
      }
      const premium = findContractMid(
        chain,
        idea.optionType as 'call' | 'put',
        idea.strikePrice!,
        idea.expiryDate!,
      );
      return { symbol: idea.symbol, ideaId: idea.id, spot: chain.spot, premium };
    });

    // Collect results and track success/failure
    let stockSuccess = 0;
    let stockFailed = 0;
    let cryptoSuccess = 0;
    let cryptoFailed = 0;
    let optionSuccess = 0;
    let optionFailed = 0;

    for (const result of stockResults) {
      if (result.price !== null) {
        priceMap.set(result.symbol, result.price);
        stockSuccess++;
      } else {
        stockFailed++;
      }
    }
    
    for (const result of cryptoResults) {
      if (result.price !== null) {
        priceMap.set(result.symbol, result.price);
        cryptoSuccess++;
      } else {
        cryptoFailed++;
      }
    }
    
    // Options: store the underlying SPOT under the symbol key (used to resolve
    // the stock-level target/stop), and the contract PREMIUM under option_<id>
    // (used to compute real option P&L). An idea counts as "fetched" only when
    // we got its premium — that's what the P&L tracker needs.
    for (const result of optionResults) {
      if (result.spot !== null && !priceMap.has(result.symbol)) {
        priceMap.set(result.symbol, result.spot);
      }
      if (result.premium !== null && result.ideaId) {
        priceMap.set(`option_${result.ideaId}`, result.premium);
        optionSuccess++;
      } else {
        optionFailed++;
      }
    }

    const totalSuccess = stockSuccess + cryptoSuccess + optionSuccess;
    const totalFailed = stockFailed + cryptoFailed + optionFailed;
    
    console.log(`  ✓ Fetched ${totalSuccess}/${totalUnique} prices successfully (${stockSuccess} stocks, ${cryptoSuccess} crypto, ${optionSuccess} options)`);
    if (totalFailed > 0) {
      console.warn(`  ⚠️  Failed to fetch ${totalFailed} prices total - those trades will be validated next cycle`);
    }
    
    return priceMap;
  }

  /**
   * Fetch price with exponential backoff retry logic
   */
  private async fetchWithRetry(
    symbol: string, 
    type: 'stock' | 'crypto', 
    maxRetries = 2
  ): Promise<number | null> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const data = type === 'stock' 
          ? await fetchStockPrice(symbol)
          : await fetchCryptoPrice(symbol);
          
        if (data && data.currentPrice) {
          return data.currentPrice;
        }
      } catch (error: any) {
        // Only retry on network/5xx errors, not 4xx
        const shouldRetry = attempt < maxRetries && 
          (error.statusCode >= 500 || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET');
        
        if (shouldRetry) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // 1s, 2s, max 5s
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
    }
    
    return null; // All retries failed
  }

  /**
   * Get validation service status
   */
  getStatus() {
    return {
      running: this.intervalId !== null,
      isValidating: this.isValidating,
      intervalMinutes: this.validationIntervalMs / 1000 / 60,
      lastRun: this.lastRunTime,
      lastRunSuccess: this.lastRunSuccess,
    };
  }

  private lastRunTime: Date | null = null;
  private lastRunSuccess: boolean = false;
}

// Singleton instance
export const performanceValidationService = new PerformanceValidationService();
