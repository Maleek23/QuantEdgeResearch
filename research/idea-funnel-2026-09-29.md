# Idea funnel — why the board shows ~4 ideas (2026-09-29)

**Window:** 2026-09-24 00:00 UTC → 2026-09-29 18:29 UTC (four sessions: Sep 24, 25, 28, 29).
**Sources (read-only):** `/root/.pm2/logs/quantedge-web-out.log` + `-error.log` on the droplet, and `trade_ideas` in the prod database.

**Method.** A "candidate" is whatever the producer logged as a setup it tried to publish. A "rejection" is each logged reason the idea did not reach the table. "Ingested" is rows in `trade_ideas` with that source and a timestamp in the window. When rows exist but the prod process logged nothing that could have written them, the table says so. Those rows came from another process pointed at the prod database; see cause 7.

## Funnel by producer

| Producer (source) | Runs in prod? | Candidates | Rejected, by reason | Ingested (DB) |
|---|---|---|---|---|
| **Options flow** (`options_flow`, web cron every 15 min) | yes | 106 scans; about 151 prints flagged per scan (16,002 in total, not unique); **530 conversion attempts** (top 5 per scan) | **524 "coverage only — missing structural target or invalidation"**; 6 ended silently (dedup/debug-level) | **0** |
| **ORB** (`orb_scanner`, web, every 60 s) | yes | **134 breakouts** (125 short, 9 long) | **115** write gate: `short but catalyst is bullish: "ORB 15min SHORT breakout"`; **19** DB error: `invalid input syntax for type real: "1:2.0"` (R:R stored as a string) | **0** |
| **GEX-hub top plays** (`gex_scanner` / `GEX_top_play_*`, runs when someone opens the GEX hub) | on demand (26 full hub scans) | 45 persist attempts logged (36 contract-enriched, 9 flagged degenerate) | **9** degenerate target (walls within 0.8% of spot); **18** write gate `R:R < 0.5 (trap)`: MU 0.22–0.43, AMD 0.12–0.24, AVGO 0.12, SPY 0.19, DIA 0.32 | 32 rows; **13** traceable to prod log lines, 19 from another writer |
| **Swing catcher** (`swing_catcher`, web, every 2 min) | yes | 4,186 scans; 18 WATCH alerts (not publishable by design); 2 STRONG alerts | none | **2** |
| **Index scalp** (`gex_scanner` / `GEX_index_scalp_*`) | route only, not scheduled | 2 prod scans, 0 found | none | 15 rows, **none** traceable to prod (another writer) |
| **SPX session** (`spx_session`) | suspended (`SPX_SESSION_PUBLISH` unset, 2026-09-24 validation) | 0 prod log lines | none | 2 rows (another writer) |
| **Market scanner / swing scanner** (`market_scanner`) | **no** (worker/index only) | 0 in prod | none | 25 rows on 09-25 (another writer) |
| **Bullflow flow ingest** (`flow`) | ingest path only | Bullflow: **18,917 × HTTP 429** on `/netPremiumSeries` | rate limit | 7 rows on 09-24 03:19 (another writer) |
| **TradingView webhook** | yes | 1 | none | 1 |
| **Quant generator, bull flag, bear flag, base reclaim, GEX idea scanner, aggressor tape, index swing, leader swing, premium discount, crypto proxy, bottom reversal, earnings, convergence, news, lotto** | **no.** Scheduled only in `server/worker.ts` / `server/index.ts`; prod runs `dist/web.js` alone | **0** | not scheduled | **0** |

**Totals:** 87 rows were written in the window. Only 16 can be traced to the production process: 13 GEX top plays, 2 swing-catcher alerts and 1 TradingView signal.

### Board funnel (latest conviction build, 2026-09-29 18:28 UTC)

| Stage | Count |
|---|---|
| Open ideas in the 96 h lookback | 37 |
| Removed by age cap | 18 (kept 19) |
| Removed by live revalidation (stopped out, chased, incoherent) | 1–3 (kept 16–18) |
| Then dedupe, deconflict and minScore; Today/Nexus hide bot-held and executed ideas | **about 4 visible** |

Replaying the age cap against today's open book: the old caps keep **16** open ideas and the new caps keep **65**. Those 65 still have to pass live revalidation. By source they are 35 `market_scanner` swings, 26 `gex_scanner` swings, 3 `flow` swings and 1 quant position.

## Root causes, ranked

1. **Production never schedules the idea producers.** pm2 runs one app, `quantedge-web` (`dist/web.js`). `eco.config.cjs` never starts the worker declared in `ecosystem.config.cjs`. Every generator that publishes ideas, apart from ORB, swing catcher and flow, is scheduled only in `worker.ts` or `index.ts`. `web.ts` had already copied the flow scan and the GEX archiver across for this reason, but none of the idea producers.
2. **The flow path could never publish.** `generateIdeaFromFlow()` passes a contract but no target or stop. The universal generator correctly refused to invent levels, so 524 of 530 attempts ended "coverage only".
3. **ORB published nothing.** There were two separate bugs. The catalyst gate read "SHORT breakout" as bullish; that was fixed in a67cccc2 and deployed at 18:19 on 09-29. `riskRewardRatio` was the display string `"1:2.0"` written to a REAL column, so every breakout that passed the gate failed at the DB. The board's own `catalystContradictsDirection()` repeated the gate bug, so any ORB short that did get written would have been retired on read.
4. **The swing age cap was a day and a half, not five sessions.** `maxAgeHoursForIdea()` capped swings at 36 hours. `marketHoursBetween()` counts every weekday as 24 hours, so a Monday swing was gone by Tuesday evening. The comment beside it claimed "roughly five trading sessions". On every build this removed about half of the open book on age alone.
5. **GEX top plays: honest rejections.** When a GEX wall sits close to spot and the stop sits on the far wall, R:R comes out below 0.5, and 18 ideas failed for that reason. Separately, 9 plays had walls clustered on spot. The gate is doing its job here. The play publisher still filled any missing level with a fixed ±3% target / ∓2% stop.
6. **The data outage made everything noisier and slower.** The rejected Tradier key cost 20,140 doomed `expirations` calls from the flow scan, which bypassed the breaker (CBOE served every chain afterwards). There were 2,511 Yahoo 404s for bare `SPX`/`VIX` (Yahoo needs `^GSPC`/`^VIX`) and 1,006 Yahoo 429s. Bullflow returned 429 18,917 times; that was rate-limited in a67cccc2.
7. **Most of the book came from a writer that is not production.** 71 of the window's 87 rows (82%) have no matching prod log line: market_scanner, flow, index scalp, spx_session, 3 `yahoo-opr-trades` GEX rows, and the GEX top plays from 09-25, 09-26 and the morning of 09-27. That is consistent with a local `npm run dev` (`index.ts`) using the prod `DATABASE_URL`. When that machine sleeps, the book starves; this is the "laptop closed for 12 days" failure from September.

Also seen, not fixed here: the GEX hub persisted plays on Sunday 09-27 from Friday's chains. Open ideas are never closed by the tracker when prod has no quote; for example, 09-23 `spx_session` day ideas were still `open` on 09-29. Kellanova (`K`) is delisted and returned 184 × 404.

## What changed (branch `feat/ideas`)

| # | Fix | Where |
|---|---|---|
| 1 | Web now schedules the measured producers when no worker tier runs: flags and reclaim hourly plus a post-close pass, tape every 10 min, GEX setups every 30 min, publish-only quant every 30 min, index/leader swing and crypto proxy twice a day, and the reversal slate nightly. Each has an in-flight guard and uses guarded-cron with the scheduler lock. `IDEA_PRODUCERS_IN_WEB=false` turns it off. `market_scanner` and `spx_session` are deliberately excluded (worst measured records). | `server/idea-producer-schedule.ts`, `server/web.ts` |
| 2 | "Coverage only" now tries a **measured** plan before dropping. The stop sits beyond the nearest swing (ATR-padded) or is a 2×ATR stop. T1 is the nearest prior swing or GEX wall within 0.35–3.5 ATR, using 15-minute bars for day ideas and daily bars for swings. It needs at least 1R. If there is no measured target, the idea stays coverage-only; no ATR "take-profit" is accepted as a target. The rationale is written into the idea's analysis. | `server/structural-levels.ts`, `server/universal-idea-generator.ts` |
| 3 | GEX-hub plays and GEX idea-scanner flip crosses no longer fill missing levels with fixed percentages (±3%/∓2%, ×1.025). A missing side is read from structure, or the play is skipped. | `server/gex-vex-scanner.ts`, `server/gex-idea-scanner.ts` |
| 4 | ORB stores a numeric R:R. The board's catalyst check gets the same "names its own side" exception as the write gate. | `server/spx-orb-scanner.ts`, `server/convictions-engine.ts` |
| 5 | Yahoo symbol mapping at the provider boundary: SPX→^GSPC, VIX→^VIX, NDX, RUT, DJI, VIX9D/3M, VVIX. XSP and DJX are deliberately left unmapped because they are fractional indices. | `server/yahoo-client.ts`, `server/market-api.ts`, `server/historical-candles.ts` |
| 6 | Raw Tradier callers now respect the breaker. A 401 disables Tradier for the boot and the scan goes straight to CBOE/Yahoo. | `server/tradier-api.ts`, `server/options-flow-scanner.ts`, `server/multi-source-market-data.ts` |
| 7 | Age caps: swing 36→**120** weekday-hours (five sessions, matching the freshness layer's "very stale" point); position 96→480. Live builds look back at least 30 days and read open rows only. **Integrity guard:** an idea older than one session with no live price to confirm its entry is now retired. This applies only when at least half the candidates priced, so a provider outage cannot blank the board. The existing stopped/chased/incoherent checks still apply. | `server/convictions-engine.ts` |

**Operator actions (not code):** renew or replace the Tradier key. Decide whether the laptop should write to the prod DB at all. Deploy, then watch `[IDEA-PRODUCERS]` timings and memory on the 1 vCPU / 2 GB droplet; set `IDEA_PRODUCERS_IN_WEB=false` if it saturates.
