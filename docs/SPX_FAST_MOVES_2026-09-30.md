# SPX fast moves — 2026-09-30 miss, causes catalog, 12-month 0DTE replay

Status: **research + engine flagged off**. Generated sections below are written by
`research/spx-fast-moves-replay.ts` (12 months, walk-forward halves) and
`research/spx-fast-moves-today.ts` (2026-09-30 minute by minute). Detectors:
`server/spx-fast-moves-core.ts` (one definition shared by replay, live engine and tests).

## Plain verdict

1. **No fast-move cause survived both halves at the pre-registered bar** (≥ 20 trades per half, mean P&L > 0 in
   both halves with and without each half's best trade) on **real SPXW 0DTE bars** — the instrument the operator
   trades. Nothing is `publish: true`.
2. **Two afternoon PUT causes are candidates, not findings.** On SPXW first-OTM puts, sold at 2×:
   - *Session-low break after 14:00, below VWAP* — n 41 (24 / 17): **+0.06 / +0.33 per $1** (best trade removed
     +0.02 / +0.29); hold-to-close −0.09 / +0.57.
   - *Trend afternoon (≥ 90% of the last hour below VWAP, lower highs) → 30-min-low break on ≥ 1.5× volume* —
     n 34 (21 / 13): **+0.16 / +0.18 per $1** (best removed +0.12 / +0.11).
   Both are under the 20-per-half bar and **both lose on SPY 0DTE and on the SPY+QQQ+IWM pool** with the same
   trigger (SPY hold −0.19 / −0.25; pool −0.31 / −0.49). They are wired as `candidate: true` and publish only with
   `SPX_FAST_MOVES_CANDIDATES=true`, labelled "unvalidated candidate — measuring".
3. **Calendar close flows are real in the tape but too rare to trade on replay evidence.** Quarter-ends (n 4):
   mean |14:00→close| 0.47% vs 0.17% on ordinary days, 3 of 4 down; month-ends (n 12): last 30 min down 8 of 12,
   mean |15:30→close| 0.16% vs 0.11%. The close-flow put trigger itself fired on only 4 SPX sessions in 12 months
   (+1.53 per $1 held, driven by 2 H2 days incl. today; H1 −1.00). The SAME 15:30 break on ordinary days (control,
   n 73) loses −0.32 per $1 held. OPEX / quad witching days did **not** move more into the close (0.10% vs 0.11%).
   So the calendar is published as a **context line** from 15:30 on close-flow days, never as a signal.
4. **FOMC** afternoons move ~3.5× more (|14:00→close| 0.60% vs 0.17%); FOMC statement-range-break puts made
   +0.99 per $1 held on SPXW but n = 5 days — anecdote, not evidence. 08:30-release open drives LOSE both sides
   (−0.34 / −0.35). The 15:50 imbalance bar: puts +0.07 held / −0.25 at 2× (n 8), calls −1.00 (n 5). Volume thrust ≥ 3× with the trend is flat (−0.04 puts).
   VIX-ETF "short-gamma proxy" breaks do not help (−0.04 puts). Opening-range failure puts fade in H2.
5. **SPXW vs SPY is not a detail.** Alpaca's contract LISTING shows SPXW only from ~May 2026, but its 1-min
   bars exist for the whole window when the OCC symbol is requested directly (the earlier "SPXW is sparse" note in
   docs/ZERO_DTE_SETUPS_REPLAY.md was wrong for near-money strikes: 360–390 bars/session). On the same triggers,
   SPXW first-OTM paid +0.15 per $1 more than SPY first-OTM (paired n 772: −0.14 vs −0.29), mostly because the SPXW
   5-point grid sits closer to the money than SPY's $1 grid and its OTM wings priced cheaper. Replaying SPX on SPY
   understates SPX outcomes; the operator's instrument has to be replayed on its own bars.
6. **The only whole cell that passed anything** is a CONTROL: "open drive on non-release days, first-OTM calls"
   passes on the ETF pool (+0.04 / +0.05 half2x_trail) but not on SPXW (H1 −0.07). It is the 12-month up-drift, not
   a cause. Controls are never published.

With 12 causes × 2 sides × 3 contracts × 6 exits, one or two cells passing a lower bar is what chance alone
produces. The honest position: the platform can now SEE these moves live (below), but has no replay evidence that
buying them pays over a year; the candidates must earn it live.

## 2026-09-30 — what each engine would have done (no look-ahead)

| ET | engine | what | contract | entry | exit | P&L / contract |
|---|---|---|---|---|---|---|
| 13:00 | current index engine (operator's GEX read: −γ, zero-γ 768.6, put wall 765) | Policy A long (OR30-high break) | SPY 769C | $0.65 @ 13:00 | $0.33 @ 13:16 (underlying stop) | **−$32** |
| 14:30–15:44 | current index engine, every cadence pass | "A: no fresh held break" (two 5-min closes below 766.00 only at 15:40+15:45 → after its window) | — | — | — | — |
| 15:46+ | current index engine | "outside 09:45–15:45 ET entry window" | — | — | — | — |
| all day | current index engine (recorder GEX: net flips ±, mostly +) | B: no wall tag / neutral gamma — nothing | — | — | — | — |
| 15:30 | NEW (context) | "Close-flow risk: quarter-end — imbalance 15:50; volume expansion into 16:00" | — | — | — | — |
| 15:33 | NEW · close-flow put (quarter-end, broke 15:00–15:29 low 766.24 under VWAP) — **watch only** | SPXW 7690P · ≈ SPY 766P | $4.80 · $0.73 | 2×: $9.60 @ 15:50 · $1.46 @ 15:50; held: $38.46 · $3.54 | 2×: **+$480 · +$73**; held: **+$3,366 · +$281** |
| 15:38 | NEW · session-low break below VWAP (766.00) — **candidate** | SPXW 7685P · ≈ SPY 765P | $4.05 · $0.45 | 2×: $8.10 @ 15:50 · $0.90 @ 15:50; held: $33.46 · $2.54 | 2×: **+$405 · +$45**; held: **+$2,941 · +$209** |
| 15:51 | NEW · trend-afternoon 30-min-low break on 2.6× vol — **candidate** (also the 15:50 imbalance bar, watch) | SPXW 7670P · ≈ SPY 764P | $3.90 · $0.65 | 2×: $7.80 @ 15:58 · $1.30 @ 15:59; held: $18.46 · $1.54 | 2×: **+$390 · +$65**; held: **+$1,456 · +$89** |
| 15:55 | NEW · volume thrust (5-min 4.1×) — watch | SPXW 7665P · ≈ SPY 763P | $4.50 · $0.50 | held: $13.46 · $0.54 | **+$896 · +$4** |
| 10:01 | NEW · 08:30-release open drive calls — watch (replay: loses) | SPXW 7710C · SPY 769C | $16.00 · $1.21 | expired worthless | **−$1,600 · −$121** |

Entries are the next minute's option-bar HIGH; SPXW strikes = SPY × the prior close's ^GSPC/SPY ratio (10.0373);
SPXW settled on the ^GSPC close 7651.54, SPY on 762.46. The operator's "~1.00 → 17" matches the SPXW 7665P–7670P
(max prints 6.70–17.90). With `SPX_FAST_MOVES=true` alone the engine would have **published nothing** today and
shown the 15:30 context line + watch rows; with `SPX_FAST_MOVES_CANDIDATES=true` it would have published the 15:38
SPXW 7685P and the 15:51 SPXW 7670P (plan: sell at 2×).

Why the current engine missed it, measured: its trigger is two CLOSED 5-minute bars beyond a measured level; the
session low (766.00) broke on the 15:37 1-minute bar, the first two 5-minute closes below it were the 15:35 and
15:40 bars (known 15:45), and its window closes at 15:45 — every cadence pass from 14:30 to 15:44 read "no fresh
held break". The recorder's own GEX samples had net gamma flipping around zero (mostly positive), so on recorded
GEX it ran policy B (fade) and found no wall tag.

## Engine (flagged off)

- `server/spx-fast-moves.ts` — `SPX_FAST_MOVES=true` enables it. Every minute 09:31–10:31 and 14:30–15:58 ET via
  `server/idea-producer-schedule.ts`; also called by the index engine between 15:45 and 15:55 (the A/B window
  still ends 15:45 — only these causes run after it). One incremental SPY+VIXY 1-min request per pass, a
  once-a-day 20-session baseline, calendar in code; the SPXW last print + SPY chain are read only when an idea is
  about to publish. GEX is stamped as context (recorder sample, else the 60-s cached aggregate), never a gate.
- Publishes through `storage.createTradeIdea` as source `spx_fast_move` (added to `shared/idea-sources.ts`):
  exact trigger time, cause, SPXW strike + SPY equivalent, premium, exit plan, replay evidence, close-flow line,
  `validated:false`. What may publish is `FAST_MOVE_POLICIES` in the core — currently nothing without
  `SPX_FAST_MOVES_CANDIDATES=true`.
- Tests: `npm run test:spx-fast-moves` (15 checks: today's shape fires, a normal afternoon doesn't, every prefix of
  the day gives exactly the full-day triggers up to that bar, VIXY cannot leak the future, mirror symmetry,
  contract bands, exits, policy, and the live engine end-to-end on a stubbed feed that includes future bars).

## Caveats

- Signals come from SPY 1-min bars (Alpaca has no index bars); SPX strike = SPY × prior-close ratio. SPXW bars are
  real, but the entry is the next minute's HIGH and exits at 2×/3× assume a fill at the touched price
  (`take2x_close` is the stricter check). No quotes, no commissions, no slippage on exit.
- No historical GEX: nothing here is gated on gamma; "short gamma" was proxied by VIXY and range expansion
  (neither helped). The (a) simulation used the local chart recorder's samples (gaps 09:11–12:44) and the
  operator's levels — not a production snapshot series.
- 08:30 release days are detected from SPY pre-market volume (≥ 2.5× the 20-session median of 08:30–08:34),
  FOMC from the Fed calendar; OPEX / quad / VIX expiry / month-end computed with the NYSE holiday list.
- Pooled ETF trades are not independent (same market move, same day). Multiple comparisons: 432 cells.
- The SPXW cheap (0.5–0.8% OTM) rows in the timeline below $0.10 would be skipped in the replay.

<!-- REPLAY:BEGIN -->
## Causes catalog — does the flag itself make the move bigger?

_Window: trades 2025-10-01 → 2026-09-30 · H1 2025-10-01 → 2026-03-31 · H2 2026-04-01 → 2026-09-30 · SPXW real bars (signals from SPY 1-min bars) · generated 2026-09-30T23:15Z by `research/spx-fast-moves-replay.ts`_

Every session in the window (no trigger, no option): mean absolute SPY move and the share of sessions with a big move. A calendar/event cause matters only if its row is clearly larger than the ordinary row.

| sessions | n | mean abs 15:30→close % | mean abs 15:50→close % | share with abs 15:30→close ≥ 0.30% | share down 15:30→close | mean abs 14:00→close % | share ≥ 0.50% | mean abs open 30 min % | share ≥ 0.50% |
|---|---|---|---|---|---|---|---|---|---|
| all sessions | 251 | 0.12 | 0.09 | 8.00% | 55.0% | 0.20 | 9.00% | 0.21 | 5.00% |
| ordinary (no calendar/event flag) | 169 | 0.11 | 0.08 | 8.00% | 55.0% | 0.17 | 5.00% | 0.20 | 5.00% |
| close-flow day (any) | 25 | 0.14 | 0.14 | 12.0% | 56.0% | 0.25 | 20.0% | 0.27 | 8.00% |
| month-end (incl. quarter-end) | 12 | 0.16 | 0.14 | 17.0% | 67.0% | 0.26 | 25.0% | 0.24 | 8.00% |
| quarter-end | 4 | 0.23 | 0.17 | 25.0% | 75.0% | 0.47 | 75.0% | 0.33 | 25.0% |
| monthly OPEX (incl. quad witching) | 12 | 0.10 | 0.12 | 0.00% | 42.0% | 0.20 | 8.00% | 0.31 | 8.00% |
| quad witching / index rebalance | 4 | 0.10 | 0.14 | 0.00% | 0.00% | 0.20 | 0.00% | 0.40 | 25.0% |
| FOMC day | 8 | 0.25 | 0.12 | 25.0% | 63.0% | 0.60 | 63.0% | 0.13 | 0.00% |
| 08:30 release day (detected) | 47 | 0.13 | 0.10 | 9.00% | 53.0% | 0.24 | 13.0% | 0.21 | 0.00% |
| VIX expiry Wednesday | 12 | 0.14 | 0.06 | 8.00% | 67.0% | 0.42 | 33.0% | 0.21 | 8.00% |

08:30 release days are DETECTED (SPY 08:30–08:34 pre-market volume ≥ 2.5× its 20-session median — known before the open): 47 days. FOMC days from the Fed schedule: 2025-10-29, 2025-12-10, 2026-01-28, 2026-03-18, 2026-04-29, 2026-06-17, 2026-07-29, 2026-09-16.

## Replay — every cause × side × contract (real SPXW 0DTE option bars; SPY and the ETF pool alongside)

_Window: trades 2025-10-01 → 2026-09-30 · H1 2025-10-01 → 2026-03-31 · H2 2026-04-01 → 2026-09-30 · SPXW real bars (signals from SPY 1-min bars) · generated 2026-09-30T23:15Z by `research/spx-fast-moves-replay.ts`_

7451 option trades from 3089 triggers (SPY 251 sessions, SPX 251 sessions, QQQ 251 sessions, IWM 250 sessions). **Primary = SPX: real SPXW 0DTE 1-min bars** (signals from SPY bars; strike on the SPXW grid at SPY × the prior close's ^GSPC/SPY ratio; expiry value from the ^GSPC official close). SPY ETF 0DTE and the SPY+QQQ+IWM pool are shown as corroboration — pooled trades are NOT independent (the same index move hits all three on the same day). Expectancy = mean P&L per $1 of premium (−1.00 = total loss). Survives = SPXW ≥ 20 trades per half and positive in both halves with and without each half's best trade.

| cause | side | contract | SPXW n (H1/H2) | 2×% | 3×% | 5×% | worthless % | med entry | und. move % | hold | take2x | take2x_close | take3x | half2x_trail | stop50 | H1 hold / h2t | H2 hold / h2t | SPY 0DTE: n · hold · h2t | ETF pool: n · days · hold · h2t (H1/H2 h2t) | SPXW survives |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Session low/high break after 14:00 (VWAP side) | puts | otm1 | 41 (24/17) | 48.8 | 22.0 | 4.90 | 39.0 | 7.80 | 0.10 | 0.18 | 0.17 | 0.29 | 0.20 | 0.20 | 0.00 | -0.09 / 0.01 | 0.57 / 0.47 | 41 · -0.19 · -0.02 | 118 · 59 · -0.31 · -0.17 (-0.14/-0.20) | n too small; both halves > 0 on take2x, take2x_close |
| Session low/high break after 14:00 (VWAP side) | puts | near | 41 (24/17) | 48.8 | 24.4 | 9.80 | 85.4 | 2.17 | 0.10 | 0.12 | -0.02 | -0.20 | -0.23 | -0.14 | -0.30 | -0.72 / -0.21 | 1.31 / -0.03 | 38 · -0.42 · -0.09 | 89 · 49 · -0.55 · -0.23 (-0.35/-0.09) | no |
| Session low/high break after 14:00 (VWAP side) | puts | cheap | 38 (22/16) | 31.6 | 18.4 | 10.5 | 92.1 | 0.60 | 0.10 | -0.90 | -0.37 | -0.35 | -0.45 | -0.43 | -0.52 | -0.94 / -0.48 | -0.83 / -0.38 | 25 · -0.90 · -0.47 | 77 · 42 · -0.81 · -0.35 (-0.40/-0.28) | no |
| Session low/high break after 14:00 (VWAP side) | calls | otm1 | 43 (20/23) | 46.5 | 25.6 | 7.00 | 58.1 | 4.70 | -0.04 | -0.37 | -0.02 | 0.04 | -0.06 | -0.07 | -0.19 | -0.45 / 0.06 | -0.30 / -0.19 | 43 · -0.46 · -0.20 | 144 · 84 · -0.41 · -0.18 (0.02/-0.38) | no |
| Session low/high break after 14:00 (VWAP side) | calls | near | 40 (20/20) | 40.0 | 20.0 | 7.50 | 90.0 | 0.85 | -0.03 | -0.54 | -0.17 | -0.18 | -0.34 | -0.15 | -0.45 | -0.74 / -0.29 | -0.34 / -0.02 | 32 · -0.58 · -0.08 | 93 · 57 · -0.66 · -0.26 (-0.13/-0.37) | no |
| Session low/high break after 14:00 (VWAP side) | calls | cheap | 27 (13/14) | 22.2 | 18.5 | 7.40 | 96.3 | 0.30 | -0.00 | -0.99 | -0.56 | -0.39 | -0.44 | -0.62 | -0.51 | -0.98 / -0.64 | -1.00 / -0.60 | 14 · -0.95 · -0.36 | 51 · 32 · -0.71 · -0.32 (0.04/-0.72) | no |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | puts | otm1 | 34 (21/13) | 52.9 | 23.5 | 5.90 | 55.9 | 7.10 | 0.04 | 0.02 | 0.17 | 0.15 | 0.10 | 0.12 | -0.09 | 0.01 / 0.08 | 0.04 / 0.18 | 34 · -0.25 · -0.12 | 97 · 55 · -0.49 · -0.28 (-0.28/-0.27) | n too small; both halves > 0 on take2x, half2x_trail |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | puts | near | 34 (21/13) | 52.9 | 29.4 | 11.8 | 82.4 | 2.15 | 0.04 | -0.46 | 0.06 | -0.23 | -0.07 | -0.11 | -0.17 | -0.26 / 0.05 | -0.78 / -0.37 | 29 · -0.45 · -0.23 | 76 · 46 · -0.59 · -0.31 (-0.22/-0.45) | no |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | puts | cheap | 29 (18/11) | 34.5 | 24.1 | 13.8 | 96.6 | 0.57 | 0.06 | -0.64 | -0.31 | -0.34 | -0.28 | -0.37 | -0.18 | -0.42 / -0.16 | -1.00 / -0.71 | 22 · -0.71 · -0.39 | 64 · 38 · -0.86 · -0.38 (-0.40/-0.35) | no |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | calls | otm1 | 33 (17/16) | 39.4 | 21.2 | 9.10 | 63.6 | 5.20 | -0.01 | 0.00 | -0.16 | 0.01 | -0.17 | -0.09 | -0.16 | 0.26 / -0.12 | -0.28 / -0.05 | 33 · -0.16 · -0.26 | 88 · 55 · -0.15 · -0.17 (0.10/-0.43) | no |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | calls | near | 32 (17/15) | 37.5 | 21.9 | 15.6 | 87.5 | 0.65 | -0.00 | 0.40 | -0.22 | -0.09 | -0.31 | 0.16 | -0.37 | 0.80 / 0.04 | -0.05 / 0.29 | 25 · 0.26 · 0.07 | 60 · 38 · 0.05 · -0.06 (0.30/-0.33) | no |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | calls | cheap | 20 (9/11) | 20.0 | 15.0 | 15.0 | 95.0 | 0.25 | 0.01 | 2.71 | -0.60 | 0.10 | -0.55 | 0.29 | -0.51 | 7.25 / 1.40 | -1.00 / -0.62 | 11 · 3.30 · 1.07 | 31 · 20 · 2.02 · 0.61 (2.00/-0.40) | no |
| Prior-day low/high break after 14:00 | puts | otm1 | 29 (13/16) | 41.4 | 24.1 | 3.40 | 65.5 | 8.70 | -0.04 | -0.34 | -0.15 | -0.25 | -0.12 | -0.20 | -0.33 | -0.64 / -0.41 | -0.09 / -0.03 | 29 · -0.52 · -0.34 | 64 · 51 · -0.40 · -0.26 (-0.33/-0.19) | no |
| Prior-day low/high break after 14:00 | puts | near | 28 (13/15) | 32.1 | 21.4 | 7.10 | 89.3 | 3.20 | -0.04 | -0.57 | -0.36 | -0.32 | -0.33 | -0.42 | -0.23 | -0.94 / -0.58 | -0.25 / -0.28 | 28 · -0.69 · -0.34 | 49 · 41 · -0.47 · -0.31 (-0.52/-0.12) | no |
| Prior-day low/high break after 14:00 | puts | cheap | 28 (13/15) | 28.6 | 17.9 | 10.7 | 92.9 | 0.75 | -0.04 | -0.59 | -0.43 | -0.37 | -0.46 | -0.50 | -0.19 | -1.00 / -0.70 | -0.24 / -0.32 | 22 · -0.73 · -0.49 | 48 · 39 · -0.82 · -0.40 (-0.63/-0.16) | no |
| Prior-day low/high break after 14:00 | calls | otm1 | 20 (12/8) | 30.0 | 5.00 | 0.00 | 65.0 | 5.00 | -0.09 | -0.71 | -0.38 | -0.41 | -0.56 | -0.46 | -0.50 | -0.80 / -0.57 | -0.56 / -0.30 | 20 · -0.79 · -0.47 | 57 · 42 · -0.43 · -0.36 (-0.44/-0.24) | no |
| Prior-day low/high break after 14:00 | calls | near | 20 (12/8) | 20.0 | 5.00 | 0.00 | 95.0 | 0.70 | -0.09 | -0.99 | -0.60 | -0.69 | -0.84 | -0.67 | -0.50 | -0.98 / -0.44 | -1.00 / -1.00 | 15 · -0.98 · -0.54 | 40 · 29 · -0.47 · -0.36 (-0.33/-0.40) | no |
| Prior-day low/high break after 14:00 | calls | cheap | 14 (8/6) | 7.10 | 7.10 | 0.00 | 100.0 | 0.30 | -0.11 | -1.00 | -0.86 | -0.86 | -0.79 | -0.89 | -0.50 | -1.00 / -0.81 | -1.00 / -1.00 | 6 · -1.00 · -0.52 | 21 · 13 · -0.76 · -0.21 (0.16/-0.61) | no |
| Volume expansion ≥ 3× (5-min) with the trend | puts | otm1 | 33 (20/13) | 42.4 | 21.2 | 9.10 | 48.5 | 17.3 | 0.15 | -0.04 | -0.01 | 0.02 | -0.01 | 0.04 | 0.00 | -0.04 / 0.02 | -0.05 / 0.07 | 33 · -0.11 · -0.03 | 98 · 54 · -0.13 · -0.09 (-0.13/-0.04) | no |
| Volume expansion ≥ 3× (5-min) with the trend | puts | near | 33 (20/13) | 39.4 | 39.4 | 12.1 | 81.8 | 10.8 | 0.15 | -0.14 | -0.18 | -0.10 | 0.22 | -0.19 | -0.04 | -0.01 / -0.16 | -0.34 / -0.24 | 33 · -0.23 · -0.18 | 80 · 45 · -0.08 · -0.17 (-0.28/-0.01) | no |
| Volume expansion ≥ 3× (5-min) with the trend | puts | cheap | 32 (20/12) | 43.8 | 31.3 | 12.5 | 84.4 | 5.73 | 0.15 | -0.16 | -0.12 | -0.17 | -0.06 | -0.16 | 0.15 | 0.24 / -0.13 | -0.83 / -0.21 | 31 · -0.11 · -0.13 | 85 · 47 · -0.02 · -0.26 (-0.36/-0.12) | no |
| Volume expansion ≥ 3× (5-min) with the trend | calls | otm1 | 23 (9/14) | 34.8 | 8.70 | 0.00 | 52.2 | 15.3 | -0.01 | -0.44 | -0.17 | -0.15 | -0.26 | -0.24 | -0.33 | -0.27 / 0.18 | -0.54 / -0.51 | 23 · -0.47 · -0.26 | 76 · 39 · -0.38 · -0.20 (0.24/-0.50) | no |
| Volume expansion ≥ 3× (5-min) with the trend | calls | near | 23 (9/14) | 39.1 | 21.7 | 4.30 | 73.9 | 7.70 | -0.01 | -0.62 | -0.19 | -0.11 | -0.19 | -0.32 | -0.42 | -0.57 / 0.23 | -0.65 / -0.68 | 23 · -0.66 · -0.29 | 60 · 34 · -0.54 · -0.24 (0.08/-0.51) | no |
| Volume expansion ≥ 3× (5-min) with the trend | calls | cheap | 23 (9/14) | 34.8 | 26.1 | 8.70 | 95.7 | 2.70 | -0.01 | -0.87 | -0.30 | -0.13 | -0.22 | -0.43 | -0.41 | -1.00 / -0.08 | -0.78 / -0.66 | 22 · -0.89 · -0.38 | 70 · 36 · -0.79 · -0.21 (0.32/-0.58) | no |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | puts | otm1 | 4 (2/2) | 75.0 | 50.0 | 25.0 | 50.0 | 3.10 | 0.03 | 1.53 | 0.50 | 0.86 | 0.50 | 1.05 | 1.35 | -1.00 / -0.24 | 4.05 / 2.34 | 4 · 0.21 · 0.67 | 11 · 5 · -0.42 · 0.01 (-0.53/0.95) | no |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | puts | near | 4 (2/2) | 75.0 | 25.0 | 25.0 | 75.0 | 0.35 | 0.03 | 8.61 | 0.50 | -0.04 | -0.25 | 0.21 | -0.50 | -1.00 / -0.33 | 18.2 / 0.75 | 3 · 2.02 · 1.40 | 9 · 4 · 0.02 · 0.20 (-0.44/1.49) | no |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | puts | cheap | 2 (1/1) | 50.0 | 50.0 | 0.00 | 100.0 | 0.65 | 0.01 | -1.00 | 0.00 | -1.00 | -1.00 | -0.40 | -0.50 | -1.00 / -1.00 | -1.00 / 0.20 | 1 · -1.00 · 0.41 | 3 · 2 · -1.00 · 0.07 (0.60/-1.00) | no |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | calls | otm1 | 12 (3/9) | 16.7 | 0.00 | 0.00 | 75.0 | 5.00 | -0.02 | -0.75 | -0.46 | -0.57 | -0.75 | -0.55 | -0.38 | -0.85 / -0.03 | -0.72 / -0.72 | 12 · -1.00 · -0.57 | 32 · 14 · -0.72 · -0.41 (-0.51/-0.37) | no |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | calls | near | 12 (3/9) | 41.7 | 25.0 | 0.00 | 83.3 | 0.40 | -0.02 | -0.95 | -0.14 | -0.58 | -0.22 | -0.41 | -0.53 | -1.00 / -0.21 | -0.94 / -0.48 | 8 · -1.00 · -0.47 | 19 · 10 · -1.00 · -0.43 (-0.40/-0.44) | no |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | calls | cheap | 4 (2/2) | 25.0 | 0.00 | 0.00 | 100.0 | 0.10 | -0.02 | -1.00 | -0.50 | -0.50 | -1.00 | -0.56 | -0.55 | -1.00 / -1.00 | -1.00 / -0.13 | 1 · -1.00 · -1.00 | 2 · 2 · -1.00 · -1.00 (-1.00/-1.00) | no |
| Same 15:30+ break on ordinary days (control) | puts | otm1 | 73 (43/30) | 27.4 | 15.1 | 6.80 | 61.6 | 3.81 | 0.00 | -0.32 | -0.35 | -0.31 | -0.27 | -0.33 | -0.24 | -0.20 / -0.36 | -0.48 / -0.28 | 71 · -0.66 · -0.55 | 184 · 93 · -0.63 · -0.49 (-0.52/-0.44) | no |
| Same 15:30+ break on ordinary days (control) | puts | near | 63 (36/27) | 19.0 | 9.50 | 3.20 | 95.2 | 0.55 | 0.00 | -0.93 | -0.61 | -0.72 | -0.67 | -0.58 | -0.52 | -0.95 / -0.67 | -0.91 / -0.47 | 53 · -0.96 · -0.65 | 121 · 66 · -0.91 · -0.61 (-0.73/-0.41) | no |
| Same 15:30+ break on ordinary days (control) | puts | cheap | 33 (23/10) | 12.1 | 3.00 | 0.00 | 100.0 | 0.30 | -0.01 | -1.00 | -0.76 | -0.86 | -0.91 | -0.81 | -0.51 | -1.00 / -0.87 | -1.00 / -0.68 | 21 · -1.00 · -0.65 | 54 · 28 · -0.94 · -0.47 (-0.69/0.03) | no |
| Same 15:30+ break on ordinary days (control) | calls | otm1 | 60 (27/33) | 28.3 | 10.0 | 3.30 | 60.0 | 2.75 | -0.01 | -0.45 | -0.29 | -0.34 | -0.36 | -0.31 | -0.33 | -0.36 / -0.21 | -0.52 / -0.38 | 57 · -0.66 · -0.39 | 163 · 88 · -0.68 · -0.47 (-0.36/-0.55) | no |
| Same 15:30+ break on ordinary days (control) | calls | near | 43 (19/24) | 23.3 | 11.6 | 7.00 | 95.3 | 0.20 | 0.00 | -0.45 | -0.54 | -0.69 | -0.65 | -0.63 | -0.51 | 0.06 / -0.51 | -0.85 / -0.73 | 26 · -0.99 · -0.65 | 82 · 55 · -0.90 · -0.69 (-0.59/-0.75) | no |
| Same 15:30+ break on ordinary days (control) | calls | cheap | 7 (2/5) | 0.00 | 0.00 | 0.00 | 100.0 | 0.15 | -0.04 | -1.00 | -1.00 | -1.00 | -1.00 | -1.00 | -0.54 | -1.00 / -1.00 | -1.00 / -1.00 | 6 · -1.00 · -1.00 | 18 · 11 · -1.00 · -1.00 (-1.00/-1.00) | no |
| 15:50 imbalance bar | puts | otm1 | 8 (3/5) | 37.5 | 37.5 | 0.00 | 62.5 | 2.70 | 0.04 | 0.07 | -0.25 | 0.09 | 0.13 | -0.08 | -0.15 | 0.10 / -0.12 | 0.06 / -0.05 | 8 · -0.40 · -0.33 | 12 · 12 · -0.39 · -0.30 (-0.41/-0.19) | no |
| 15:50 imbalance bar | puts | near | 5 (2/3) | 20.0 | 0.00 | 0.00 | 100.0 | 0.10 | 0.04 | -1.00 | -0.60 | -1.00 | -1.00 | -0.74 | -0.59 | -1.00 / -1.00 | -1.00 / -0.57 | 5 · -1.00 · -0.80 | 6 · 6 · -0.91 · -0.62 (-1.00/-0.43) | no |
| 15:50 imbalance bar | puts | cheap | 1 (0/1) | 0.00 | 0.00 | 0.00 | 100.0 | 0.10 | 0.29 | -1.00 | -1.00 | -1.00 | -1.00 | -1.00 | -0.70 | — / — | -1.00 / -1.00 | 1 · -1.00 · -1.00 | 2 · 2 · -1.00 · -0.50 (—/-0.50) | no |
| 15:50 imbalance bar | calls | otm1 | 5 (1/4) | 0.00 | 0.00 | 0.00 | 100.0 | 3.23 | -0.16 | -1.00 | -1.00 | -1.00 | -1.00 | -1.00 | -0.52 | -1.00 / -1.00 | -1.00 / -1.00 | 5 · -0.97 · -0.97 | 13 · 10 · -0.99 · -0.78 (-0.73/-0.81) | no |
| 15:50 imbalance bar | calls | near | 4 (1/3) | 0.00 | 0.00 | 0.00 | 100.0 | 0.30 | -0.18 | -1.00 | -1.00 | -1.00 | -1.00 | -1.00 | -0.57 | -1.00 / -1.00 | -1.00 / -1.00 | 4 · -1.00 · -1.00 | 9 · 7 · -1.00 · -0.81 (-1.00/-0.71) | no |
| 15:50 imbalance bar | calls | cheap | 1 (0/1) | 0.00 | 0.00 | 0.00 | 100.0 | 0.10 | -0.34 | -1.00 | -1.00 | -1.00 | -1.00 | -1.00 | -0.50 | — / — | -1.00 / -1.00 | 1 · -1.00 · -1.00 | 2 · 2 · -1.00 · -1.00 (-1.00/-1.00) | no |
| FOMC post-statement range break | puts | otm1 | 5 (2/3) | 80.0 | 20.0 | 20.0 | 20.0 | 14.1 | 0.33 | 0.99 | 0.60 | 0.70 | 0.54 | 0.85 | 0.82 | 0.23 / 0.11 | 1.50 / 1.34 | 5 · 0.55 · 0.70 | 15 · 5 · 0.29 · 0.52 (0.06/0.84) | no |
| FOMC post-statement range break | puts | near | 5 (2/3) | 80.0 | 40.0 | 20.0 | 40.0 | 6.10 | 0.33 | 1.03 | 0.60 | 0.72 | 0.51 | 0.44 | 0.95 | -0.22 / -0.19 | 1.87 / 0.86 | 5 · 0.16 · 0.61 | 14 · 5 · 0.13 · 0.59 (-0.04/1.07) | no |
| FOMC post-statement range break | puts | cheap | 5 (2/3) | 60.0 | 60.0 | 20.0 | 80.0 | 1.60 | 0.33 | 0.85 | 0.20 | 0.57 | 0.80 | 0.10 | 1.17 | -1.00 / -1.00 | 2.08 / 0.84 | 5 · -0.31 · 0.15 | 15 · 5 · -0.43 · 0.11 (-1.00/0.85) | no |
| FOMC post-statement range break | calls | otm1 | 4 (2/2) | 0.00 | 0.00 | 0.00 | 50.0 | 14.5 | -0.31 | -0.84 | -0.84 | -0.84 | -0.84 | -0.84 | -0.50 | -0.77 / -0.77 | -0.91 / -0.91 | 4 · -0.83 · -0.83 | 12 · 5 · -0.85 · -0.85 (-0.87/-0.84) | no |
| FOMC post-statement range break | calls | near | 4 (2/2) | 25.0 | 0.00 | 0.00 | 100.0 | 7.50 | -0.31 | -1.00 | -0.50 | -0.48 | -1.00 | -0.60 | -0.51 | -1.00 / -1.00 | -1.00 / -0.19 | 4 · -1.00 · -0.61 | 12 · 5 · -1.00 · -0.87 (-1.00/-0.78) | no |
| FOMC post-statement range break | calls | cheap | 3 (1/2) | 33.3 | 0.00 | 0.00 | 100.0 | 1.75 | -0.39 | -1.00 | -0.33 | -0.29 | -1.00 | -0.45 | -0.53 | -1.00 / -1.00 | -1.00 / -0.18 | 3 · -1.00 · -1.00 | 11 · 5 · -1.00 · -0.86 (-1.00/-0.79) | no |
| 08:30-release open drive | puts | otm1 | 29 (17/12) | 34.5 | 13.8 | 3.40 | 62.1 | 16.8 | -0.08 | -0.34 | -0.28 | -0.32 | -0.37 | -0.23 | -0.13 | -0.42 / -0.29 | -0.22 / -0.15 | 29 · -0.33 · -0.32 | 79 · 38 · -0.25 · -0.22 (-0.30/-0.12) | no |
| 08:30-release open drive | puts | near | 28 (17/11) | 35.7 | 14.3 | 3.60 | 82.1 | 11.2 | -0.07 | -0.29 | -0.29 | -0.23 | -0.42 | -0.34 | -0.04 | -0.61 / -0.31 | 0.21 / -0.40 | 29 · -0.40 · -0.38 | 68 · 35 · -0.33 · -0.29 (-0.32/-0.25) | no |
| 08:30-release open drive | puts | cheap | 28 (17/11) | 21.4 | 14.3 | 7.10 | 89.3 | 5.20 | -0.07 | -0.00 | -0.52 | -0.49 | -0.52 | -0.56 | 0.41 | -0.88 / -0.47 | 1.35 / -0.69 | 29 · -0.15 · -0.51 | 74 · 37 · -0.29 · -0.45 (-0.48/-0.40) | no |
| 08:30-release open drive | calls | otm1 | 26 (17/9) | 26.9 | 11.5 | 0.00 | 57.7 | 18.7 | -0.17 | -0.35 | -0.34 | -0.32 | -0.29 | -0.38 | -0.38 | -0.55 / -0.51 | 0.04 / -0.13 | 26 · -0.39 · -0.40 | 78 · 35 · -0.38 · -0.37 (-0.46/-0.20) | no |
| 08:30-release open drive | calls | near | 26 (17/9) | 26.9 | 23.1 | 3.80 | 69.2 | 10.8 | -0.17 | -0.43 | -0.44 | -0.37 | -0.25 | -0.44 | -0.37 | -0.71 / -0.61 | 0.11 / -0.12 | 26 · -0.45 · -0.44 | 65 · 33 · -0.45 · -0.44 (-0.54/-0.27) | no |
| 08:30-release open drive | calls | cheap | 26 (17/9) | 34.6 | 23.1 | 11.5 | 84.6 | 3.60 | -0.17 | -0.72 | -0.31 | -0.26 | -0.31 | -0.38 | -0.42 | -0.83 / -0.53 | -0.52 / -0.08 | 26 · -0.70 · -0.38 | 73 · 34 · -0.63 · -0.41 (-0.54/-0.17) | no |
| Open drive on non-release days (control) | puts | otm1 | 91 (43/48) | 50.5 | 20.9 | 8.80 | 42.9 | 15.9 | 0.05 | -0.02 | 0.12 | 0.03 | -0.00 | 0.07 | -0.08 | 0.21 / 0.29 | -0.24 / -0.13 | 91 · -0.08 · 0.01 | 285 · 141 · -0.10 · -0.06 (0.13/-0.21) | no |
| Open drive on non-release days (control) | puts | near | 91 (43/48) | 50.5 | 28.6 | 11.0 | 67.0 | 9.40 | 0.05 | -0.21 | 0.04 | 0.04 | 0.04 | 0.01 | -0.23 | 0.11 / 0.27 | -0.49 / -0.22 | 91 · -0.30 · -0.03 | 234 · 128 · -0.17 · -0.07 (0.14/-0.25) | no |
| Open drive on non-release days (control) | puts | cheap | 91 (43/48) | 48.4 | 27.5 | 16.5 | 85.7 | 4.52 | 0.05 | -0.53 | -0.03 | 0.04 | -0.14 | -0.09 | -0.37 | -0.13 / 0.20 | -0.89 / -0.34 | 91 · -0.56 · -0.12 | 260 · 133 · -0.35 · -0.10 (0.11/-0.26) | no |
| Open drive on non-release days (control) | calls | otm1 | 92 (40/52) | 46.7 | 19.6 | 3.30 | 48.9 | 13.8 | 0.03 | 0.15 | 0.02 | 0.07 | 0.06 | 0.10 | 0.14 | -0.04 / -0.07 | 0.30 / 0.22 | 92 · 0.11 · 0.09 | 279 · 140 · 0.06 · 0.04 (0.04/0.05) · pool survives: half2x_trail | no |
| Open drive on non-release days (control) | calls | near | 92 (40/52) | 54.3 | 32.6 | 17.4 | 64.1 | 5.30 | 0.03 | 0.43 | 0.10 | 0.19 | 0.09 | 0.14 | 0.34 | -0.21 / -0.08 | 0.92 / 0.31 | 92 · 0.26 · 0.10 | 240 · 131 · 0.09 · 0.03 (-0.04/0.08) | no |
| Open drive on non-release days (control) | calls | cheap | 92 (40/52) | 44.6 | 31.5 | 18.5 | 87.0 | 1.17 | 0.03 | 0.21 | -0.11 | 0.10 | -0.05 | -0.18 | 0.31 | -0.70 / -0.36 | 0.92 / -0.04 | 82 · -0.16 · -0.14 | 253 · 135 · 0.07 · -0.00 (-0.16/0.12) | no |
| Opening-range failure | puts | otm1 | 30 (12/18) | 46.7 | 23.3 | 3.30 | 46.7 | 17.3 | 0.07 | 0.09 | 0.08 | 0.06 | -0.01 | 0.10 | 0.07 | 0.49 / 0.38 | -0.17 / -0.08 | 30 · -0.04 · 0.03 | 69 · 46 · 0.12 · -0.08 (0.04/-0.18) | no |
| Opening-range failure | puts | near | 30 (12/18) | 40.0 | 23.3 | 13.3 | 73.3 | 9.90 | 0.07 | 0.01 | -0.12 | -0.07 | -0.20 | -0.11 | 0.14 | 0.72 / 0.11 | -0.46 / -0.26 | 30 · -0.02 · -0.13 | 62 · 42 · 0.13 · -0.16 (0.04/-0.33) | no |
| Opening-range failure | puts | cheap | 30 (12/18) | 40.0 | 26.7 | 13.3 | 83.3 | 5.10 | 0.07 | 0.02 | -0.17 | -0.17 | -0.17 | -0.10 | 0.30 | 1.13 / 0.29 | -0.72 / -0.35 | 30 · 0.00 · -0.12 | 66 · 44 · 0.20 · -0.20 (0.01/-0.38) | no |
| Opening-range failure | calls | otm1 | 26 (13/13) | 42.3 | 11.5 | 3.80 | 73.1 | 11.8 | -0.17 | -0.27 | -0.15 | -0.12 | -0.37 | -0.22 | -0.04 | -0.33 / -0.33 | -0.20 / -0.11 | 27 · -0.31 · -0.28 | 63 · 46 · -0.40 · -0.32 (-0.13/-0.44) | no |
| Opening-range failure | calls | near | 26 (13/13) | 46.2 | 26.9 | 11.5 | 80.8 | 4.70 | -0.17 | -0.27 | -0.08 | -0.05 | -0.06 | -0.16 | -0.29 | -0.23 / -0.37 | -0.32 / 0.05 | 27 · -0.41 · -0.25 | 57 · 43 · -0.56 · -0.33 (-0.27/-0.36) | no |
| Opening-range failure | calls | cheap | 26 (13/13) | 38.5 | 30.8 | 19.2 | 96.2 | 0.85 | -0.17 | -0.51 | -0.23 | 0.00 | -0.08 | -0.31 | -0.51 | -0.02 / -0.60 | -1.00 / -0.02 | 21 · -0.47 · -0.14 | 51 · 38 · -0.77 · -0.25 (-0.08/-0.33) | no |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | puts | otm1 | 30 (21/9) | 40.0 | 20.0 | 10.0 | 56.7 | 9.61 | 0.00 | -0.04 | -0.07 | -0.08 | -0.05 | -0.09 | 0.04 | -0.05 / 0.03 | -0.02 / -0.36 | 30 · -0.19 · -0.18 | 92 · 33 · -0.31 · -0.30 (-0.18/-0.56) | no |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | puts | near | 30 (21/9) | 40.0 | 23.3 | 10.0 | 83.3 | 4.00 | 0.00 | -0.08 | -0.20 | -0.28 | -0.30 | -0.15 | 0.24 | -0.25 / -0.06 | 0.31 / -0.38 | 30 · -0.27 · -0.26 | 74 · 32 · -0.31 · -0.34 (-0.29/-0.46) | no |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | puts | cheap | 29 (21/8) | 31.0 | 20.7 | 13.8 | 93.1 | 1.05 | 0.00 | -0.15 | -0.38 | -0.45 | -0.38 | -0.32 | 0.30 | -0.50 / -0.27 | 0.77 / -0.43 | 28 · -0.46 · -0.43 | 78 · 32 · -0.50 · -0.49 (-0.44/-0.60) | no |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | calls | otm1 | 26 (19/7) | 42.3 | 30.8 | 11.5 | 57.7 | 6.20 | 0.03 | 0.10 | -0.10 | -0.06 | 0.13 | -0.12 | 0.30 | 0.02 / -0.14 | 0.32 / -0.08 | 26 · -0.15 · -0.04 | 79 · 32 · -0.06 · -0.12 (-0.13/-0.12) | no |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | calls | near | 23 (17/6) | 39.1 | 34.8 | 30.4 | 91.3 | 1.75 | 0.04 | 0.70 | -0.22 | -0.03 | 0.04 | 0.04 | 0.60 | 0.52 / -0.19 | 1.20 / 0.69 | 19 · 0.78 · 0.14 | 58 · 27 · 0.45 · 0.03 (-0.03/0.19) | no |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | calls | cheap | 18 (15/3) | 27.8 | 27.8 | 22.2 | 94.4 | 0.45 | 0.05 | 4.42 | -0.44 | 0.77 | -0.17 | -0.44 | -0.51 | 5.51 / -0.51 | -1.00 / -0.11 | 11 · 4.60 · 0.03 | 36 · 18 · 3.17 · 0.40 (0.58/-0.37) | no |

## Survivors on SPXW (whole cells, then sub-cell splits)

_Window: trades 2025-10-01 → 2026-09-30 · H1 2025-10-01 → 2026-03-31 · H2 2026-04-01 → 2026-09-30 · SPXW real bars (signals from SPY 1-min bars) · generated 2026-09-30T23:15Z by `research/spx-fast-moves-replay.ts`_

**No whole cell survived.**

Sub-cell survivors (calendar / VIXY / range / RVOL splits — extra comparisons, hypotheses only):

| cause · side · contract | subset | exit | n (H1/H2) | H1 | H2 | H1 ex-best | H2 ex-best |
|---|---|---|---|---|---|---|---|
| Open drive on non-release days (control) · puts · first OTM strike | ordinary day | take2x | 79 (38/41) | 0.27 | 0.06 | 0.25 | 0.03 |
| Open drive on non-release days (control) · calls · 0.2–0.4% OTM (~0.20–0.35Δ) | VIXY does not | take2x_close | 81 (33/48) | 0.05 | 0.34 | 0.00 | 0.23 |

## Calendar / short-gamma-proxy splits on SPXW (half2x_trail expectancy, n)

_Window: trades 2025-10-01 → 2026-09-30 · H1 2025-10-01 → 2026-03-31 · H2 2026-04-01 → 2026-09-30 · SPXW real bars (signals from SPY 1-min bars) · generated 2026-09-30T23:15Z by `research/spx-fast-moves-replay.ts`_

| cause | side | contract | close-flow day | ordinary day | VIXY confirms | VIXY does not | range ≥ 0.8 ATR | range < 0.8 ATR | trigger RVOL ≥ 3 |
|---|---|---|---|---|---|---|---|---|---|
| Session low/high break after 14:00 (VWAP side) | puts | otm1 | 2.01 (3; H1 0.95 / H2 4.13) | 0.06 (38; H1 -0.08 / H2 0.24) | -0.01 (25; H1 -0.07 / H2 0.10) | 0.52 (16; H1 0.16 / H2 0.88) | -0.10 (22; H1 -0.20 / H2 0.08) | 0.55 (19; H1 0.30 / H2 0.82) | -0.13 (10; H1 -0.12 / H2 -0.15) |
| Session low/high break after 14:00 (VWAP side) | puts | near | 0.19 (3; H1 -0.15 / H2 0.89) | -0.16 (38; H1 -0.22 / H2 -0.09) | -0.14 (25; H1 -0.11 / H2 -0.20) | -0.12 (16; H1 -0.41 / H2 0.16) | -0.23 (22; H1 -0.23 / H2 -0.24) | -0.03 (19; H1 -0.19 / H2 0.16) | -0.17 (10; H1 -0.20 / H2 -0.14) |
| Session low/high break after 14:00 (VWAP side) | puts | cheap | 0.10 (3; H1 0.03 / H2 0.25) | -0.48 (35; H1 -0.53 / H2 -0.42) | -0.36 (24; H1 -0.34 / H2 -0.39) | -0.56 (14; H1 -0.77 / H2 -0.36) | -0.28 (21; H1 -0.24 / H2 -0.36) | -0.62 (17; H1 -0.82 / H2 -0.39) | -0.56 (9; H1 -0.59 / H2 -0.52) |
| Session low/high break after 14:00 (VWAP side) | calls | otm1 | -0.47 (6; H1 -1.00 / H2 0.07) | -0.01 (37; H1 0.24 / H2 -0.23) | -0.04 (22; H1 0.01 / H2 -0.12) | -0.11 (21; H1 0.17 / H2 -0.22) | -0.08 (30; H1 0.02 / H2 -0.16) | -0.06 (13; H1 0.15 / H2 -0.24) | 0.35 (8; H1 0.45 / H2 0.19) |
| Session low/high break after 14:00 (VWAP side) | calls | near | -0.57 (6; H1 -0.65 / H2 -0.48) | -0.08 (34; H1 -0.22 / H2 0.06) | -0.07 (22; H1 -0.23 / H2 0.20) | -0.26 (18; H1 -0.43 / H2 -0.17) | -0.25 (28; H1 -0.23 / H2 -0.27) | 0.06 (12; H1 -0.43 / H2 0.56) | 0.31 (8; H1 0.39 / H2 0.18) |
| Session low/high break after 14:00 (VWAP side) | calls | cheap | -1.00 (5; H1 -1.00 / H2 -1.00) | -0.54 (22; H1 -0.54 / H2 -0.53) | -0.52 (15; H1 -0.58 / H2 -0.38) | -0.74 (12; H1 -1.00 / H2 -0.69) | -0.68 (22; H1 -0.70 / H2 -0.67) | -0.35 (5; H1 -0.45 / H2 -0.20) | -0.20 (7; H1 -0.22 / H2 -0.17) |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | puts | otm1 | 1.92 (2; H1 1.47 / H2 2.37) | 0.01 (32; H1 0.01 / H2 0.00) | 0.15 (21; H1 0.21 / H2 0.06) | 0.07 (13; H1 -0.13 / H2 0.39) | 0.08 (22; H1 0.14 / H2 0.01) | 0.19 (12; H1 0.00 / H2 0.76) | 0.20 (7; H1 0.12 / H2 0.31) |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | puts | near | 0.72 (2; H1 1.16 / H2 0.28) | -0.16 (32; H1 -0.00 / H2 -0.42) | 0.07 (21; H1 0.33 / H2 -0.34) | -0.41 (13; H1 -0.40 / H2 -0.42) | -0.07 (22; H1 0.29 / H2 -0.50) | -0.18 (12; H1 -0.27 / H2 0.08) | -0.08 (7; H1 -0.22 / H2 0.10) |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | puts | cheap | 0.07 (2; H1 1.14 / H2 -1.00) | -0.40 (27; H1 -0.24 / H2 -0.68) | -0.16 (18; H1 0.08 / H2 -0.54) | -0.71 (11; H1 -0.54 / H2 -1.00) | -0.20 (19; H1 0.19 / H2 -0.64) | -0.68 (10; H1 -0.60 / H2 -1.00) | -0.72 (6; H1 -1.00 / H2 -0.43) |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | calls | otm1 | -0.43 (5; H1 -1.00 / H2 -0.04) | -0.02 (28; H1 0.00 / H2 -0.06) | -0.05 (16; H1 -0.03 / H2 -0.08) | -0.12 (17; H1 -0.24 / H2 -0.04) | -0.07 (23; H1 0.07 / H2 -0.22) | -0.12 (10; H1 -0.56 / H2 0.32) | 0.19 (6; H1 -0.78 / H2 0.68) |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | calls | near | -0.28 (5; H1 -0.48 / H2 -0.14) | 0.24 (27; H1 0.11 / H2 0.40) | 0.54 (16; H1 0.34 / H2 0.88) | -0.22 (16; H1 -0.39 / H2 -0.09) | 0.07 (23; H1 0.47 / H2 -0.38) | 0.40 (9; H1 -1.00 / H2 2.15) | -0.14 (6; H1 -1.00 / H2 0.29) |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | calls | cheap | -1.00 (5; H1 -1.00 / H2 -1.00) | 0.72 (15; H1 2.09 / H2 -0.48) | 1.14 (10; H1 2.15 / H2 -0.38) | -0.56 (10; H1 -0.09 / H2 -0.76) | 0.72 (15; H1 2.09 / H2 -0.48) | -1.00 (5; H1 -1.00 / H2 -1.00) | -0.17 (5; H1 -1.00 / H2 0.04) |
| Prior-day low/high break after 14:00 | puts | otm1 | -1.00 (1; H1 -1.00 / H2 —) | -0.17 (28; H1 -0.36 / H2 -0.03) | -0.26 (14; H1 -0.35 / H2 -0.14) | -0.14 (15; H1 -0.49 / H2 0.03) | -0.23 (19; H1 -0.34 / H2 -0.12) | -0.15 (10; H1 -0.56 / H2 0.12) | -0.15 (4; H1 -1.00 / H2 0.13) |
| Prior-day low/high break after 14:00 | puts | near | -1.00 (1; H1 -1.00 / H2 —) | -0.40 (27; H1 -0.55 / H2 -0.28) | -0.33 (14; H1 -0.52 / H2 -0.08) | -0.51 (14; H1 -0.68 / H2 -0.42) | -0.49 (18; H1 -0.57 / H2 -0.40) | -0.30 (10; H1 -0.60 / H2 -0.11) | -0.14 (4; H1 -1.00 / H2 0.15) |
| Prior-day low/high break after 14:00 | puts | cheap | -1.00 (1; H1 -1.00 / H2 —) | -0.48 (27; H1 -0.68 / H2 -0.32) | -0.44 (14; H1 -0.52 / H2 -0.35) | -0.56 (14; H1 -1.00 / H2 -0.31) | -0.41 (18; H1 -0.57 / H2 -0.25) | -0.66 (10; H1 -1.00 / H2 -0.43) | -0.52 (4; H1 -1.00 / H2 -0.36) |
| Prior-day low/high break after 14:00 | calls | otm1 | — | -0.46 (20; H1 -0.57 / H2 -0.30) | -0.54 (12; H1 -0.43 / H2 -0.86) | -0.35 (8; H1 -1.00 / H2 0.04) | -0.64 (10; H1 -0.56 / H2 -0.94) | -0.29 (10; H1 -0.60 / H2 -0.08) | -0.12 (4; H1 0.17 / H2 -1.00) |
| Prior-day low/high break after 14:00 | calls | near | — | -0.67 (20; H1 -0.44 / H2 -1.00) | -0.44 (12; H1 -0.26 / H2 -1.00) | -1.00 (8; H1 -1.00 / H2 -1.00) | -0.50 (10; H1 -0.37 / H2 -1.00) | -0.83 (10; H1 -0.58 / H2 -1.00) | -0.13 (4; H1 0.15 / H2 -1.00) |
| Prior-day low/high break after 14:00 | calls | cheap | — | -0.89 (14; H1 -0.81 / H2 -1.00) | -0.86 (11; H1 -0.81 / H2 -1.00) | -1.00 (3; H1 — / H2 -1.00) | -0.79 (7; H1 -0.70 / H2 -1.00) | -1.00 (7; H1 -1.00 / H2 -1.00) | -0.63 (4; H1 -0.50 / H2 -1.00) |
| Volume expansion ≥ 3× (5-min) with the trend | puts | otm1 | 1.39 (2; H1 0.80 / H2 1.99) | -0.05 (31; H1 -0.02 / H2 -0.09) | 0.20 (20; H1 -0.08 / H2 0.55) | -0.21 (13; H1 0.14 / H2 -1.00) | 0.19 (22; H1 0.21 / H2 0.17) | -0.26 (11; H1 -0.26 / H2 -0.26) | 0.04 (33; H1 0.02 / H2 0.07) |
| Volume expansion ≥ 3× (5-min) with the trend | puts | near | -0.14 (2; H1 0.71 / H2 -1.00) | -0.19 (31; H1 -0.20 / H2 -0.18) | -0.01 (20; H1 -0.09 / H2 0.10) | -0.47 (13; H1 -0.24 / H2 -1.00) | -0.10 (22; H1 -0.05 / H2 -0.17) | -0.37 (11; H1 -0.33 / H2 -0.47) | -0.19 (33; H1 -0.16 / H2 -0.24) |
| Volume expansion ≥ 3× (5-min) with the trend | puts | cheap | 0.29 (1; H1 0.29 / H2 —) | -0.17 (31; H1 -0.15 / H2 -0.21) | 0.03 (19; H1 -0.09 / H2 0.19) | -0.43 (13; H1 -0.18 / H2 -1.00) | -0.14 (21; H1 -0.01 / H2 -0.31) | -0.20 (11; H1 -0.31 / H2 0.10) | -0.16 (32; H1 -0.13 / H2 -0.21) |
| Volume expansion ≥ 3× (5-min) with the trend | calls | otm1 | 0.19 (3; H1 0.19 / H2 —) | -0.31 (20; H1 0.17 / H2 -0.51) | 0.12 (10; H1 0.27 / H2 -0.22) | -0.52 (13; H1 -0.14 / H2 -0.59) | -0.20 (17; H1 0.48 / H2 -0.48) | -0.37 (6; H1 -0.20 / H2 -0.72) | -0.24 (23; H1 0.18 / H2 -0.51) |
| Volume expansion ≥ 3× (5-min) with the trend | calls | near | 0.41 (3; H1 0.41 / H2 —) | -0.43 (20; H1 0.14 / H2 -0.68) | 0.07 (10; H1 0.31 / H2 -0.51) | -0.62 (13; H1 -0.07 / H2 -0.72) | -0.27 (17; H1 0.56 / H2 -0.62) | -0.46 (6; H1 -0.19 / H2 -1.00) | -0.32 (23; H1 0.23 / H2 -0.68) |
| Volume expansion ≥ 3× (5-min) with the trend | calls | cheap | 0.09 (3; H1 0.09 / H2 —) | -0.51 (20; H1 -0.16 / H2 -0.66) | -0.18 (10; H1 -0.05 / H2 -0.51) | -0.62 (13; H1 -0.19 / H2 -0.70) | -0.33 (17; H1 0.33 / H2 -0.60) | -0.72 (6; H1 -0.58 / H2 -1.00) | -0.43 (23; H1 -0.08 / H2 -0.66) |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | puts | otm1 | 1.05 (4; H1 -0.24 / H2 2.34) | — | 0.53 (1; H1 0.53 / H2 —) | 1.23 (3; H1 -1.00 / H2 2.34) | 0.07 (3; H1 -0.24 / H2 0.67) | 4.01 (1; H1 — / H2 4.01) | — |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | puts | near | 0.21 (4; H1 -0.33 / H2 0.75) | — | 0.34 (1; H1 0.34 / H2 —) | 0.16 (3; H1 -1.00 / H2 0.75) | -0.10 (3; H1 -0.33 / H2 0.35) | 1.14 (1; H1 — / H2 1.14) | — |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | puts | cheap | -0.40 (2; H1 -1.00 / H2 0.20) | — | -1.00 (1; H1 -1.00 / H2 —) | 0.20 (1; H1 — / H2 0.20) | -1.00 (1; H1 -1.00 / H2 —) | 0.20 (1; H1 — / H2 0.20) | — |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | calls | otm1 | -0.55 (12; H1 -0.03 / H2 -0.72) | — | -0.68 (4; H1 0.29 / H2 -1.00) | -0.48 (8; H1 -0.19 / H2 -0.58) | -0.48 (8; H1 -0.03 / H2 -0.75) | -0.68 (4; H1 — / H2 -0.68) | — |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | calls | near | -0.41 (12; H1 -0.21 / H2 -0.48) | — | -0.10 (4; H1 0.07 / H2 -0.16) | -0.56 (8; H1 -0.34 / H2 -0.64) | -0.50 (8; H1 -0.21 / H2 -0.68) | -0.23 (4; H1 — / H2 -0.23) | — |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | calls | cheap | -0.56 (4; H1 -1.00 / H2 -0.13) | — | -1.00 (2; H1 -1.00 / H2 -1.00) | -0.13 (2; H1 -1.00 / H2 0.75) | -1.00 (3; H1 -1.00 / H2 -1.00) | 0.75 (1; H1 — / H2 0.75) | — |
| Same 15:30+ break on ordinary days (control) | puts | otm1 | — | -0.33 (73; H1 -0.36 / H2 -0.28) | -0.34 (31; H1 -0.46 / H2 -0.07) | -0.32 (42; H1 -0.26 / H2 -0.37) | -0.31 (46; H1 -0.33 / H2 -0.27) | -0.36 (27; H1 -0.45 / H2 -0.30) | -0.94 (4; H1 -1.00 / H2 -0.88) |
| Same 15:30+ break on ordinary days (control) | puts | near | — | -0.58 (63; H1 -0.67 / H2 -0.47) | -0.33 (31; H1 -0.58 / H2 0.28) | -0.83 (32; H1 -0.80 / H2 -0.85) | -0.42 (42; H1 -0.59 / H2 -0.03) | -0.92 (21; H1 -1.00 / H2 -0.89) | -0.73 (4; H1 -1.00 / H2 -0.46) |
| Same 15:30+ break on ordinary days (control) | puts | cheap | — | -0.81 (33; H1 -0.87 / H2 -0.68) | -0.72 (22; H1 -0.83 / H2 -0.35) | -1.00 (11; H1 -1.00 / H2 -1.00) | -0.74 (24; H1 -0.85 / H2 -0.19) | -1.00 (9; H1 -1.00 / H2 -1.00) | -1.00 (2; H1 -1.00 / H2 —) |
| Same 15:30+ break on ordinary days (control) | calls | otm1 | — | -0.31 (60; H1 -0.21 / H2 -0.38) | -0.20 (23; H1 -0.17 / H2 -0.23) | -0.37 (37; H1 -0.24 / H2 -0.47) | -0.22 (31; H1 -0.11 / H2 -0.31) | -0.40 (29; H1 -0.33 / H2 -0.45) | -1.00 (1; H1 — / H2 -1.00) |
| Same 15:30+ break on ordinary days (control) | calls | near | — | -0.63 (43; H1 -0.51 / H2 -0.73) | -0.54 (17; H1 -0.44 / H2 -0.63) | -0.69 (26; H1 -0.56 / H2 -0.79) | -0.52 (26; H1 -0.46 / H2 -0.57) | -0.80 (17; H1 -0.58 / H2 -1.00) | -1.00 (1; H1 — / H2 -1.00) |
| Same 15:30+ break on ordinary days (control) | calls | cheap | — | -1.00 (7; H1 -1.00 / H2 -1.00) | -1.00 (4; H1 -1.00 / H2 -1.00) | -1.00 (3; H1 — / H2 -1.00) | -1.00 (5; H1 -1.00 / H2 -1.00) | -1.00 (2; H1 -1.00 / H2 -1.00) | -1.00 (1; H1 — / H2 -1.00) |
| 15:50 imbalance bar | puts | otm1 | 0.68 (2; H1 — / H2 0.68) | -0.33 (6; H1 -0.12 / H2 -0.54) | -0.31 (2; H1 -1.00 / H2 0.38) | 0.00 (6; H1 0.32 / H2 -0.16) | 0.48 (5; H1 0.32 / H2 0.58) | -1.00 (3; H1 -1.00 / H2 -1.00) | -1.00 (1; H1 -1.00 / H2 —) |
| 15:50 imbalance bar | puts | near | 0.28 (1; H1 — / H2 0.28) | -1.00 (4; H1 -1.00 / H2 -1.00) | -1.00 (2; H1 -1.00 / H2 -1.00) | -0.57 (3; H1 -1.00 / H2 -0.36) | -0.57 (3; H1 -1.00 / H2 -0.36) | -1.00 (2; H1 -1.00 / H2 -1.00) | -1.00 (1; H1 -1.00 / H2 —) |
| 15:50 imbalance bar | puts | cheap | -1.00 (1; H1 — / H2 -1.00) | — | — | -1.00 (1; H1 — / H2 -1.00) | -1.00 (1; H1 — / H2 -1.00) | — | — |
| 15:50 imbalance bar | calls | otm1 | -1.00 (1; H1 — / H2 -1.00) | -1.00 (4; H1 -1.00 / H2 -1.00) | -1.00 (1; H1 — / H2 -1.00) | -1.00 (4; H1 -1.00 / H2 -1.00) | -1.00 (4; H1 -1.00 / H2 -1.00) | -1.00 (1; H1 — / H2 -1.00) | -1.00 (1; H1 — / H2 -1.00) |
| 15:50 imbalance bar | calls | near | — | -1.00 (4; H1 -1.00 / H2 -1.00) | — | -1.00 (4; H1 -1.00 / H2 -1.00) | -1.00 (4; H1 -1.00 / H2 -1.00) | — | — |
| 15:50 imbalance bar | calls | cheap | — | -1.00 (1; H1 — / H2 -1.00) | — | -1.00 (1; H1 — / H2 -1.00) | -1.00 (1; H1 — / H2 -1.00) | — | — |
| FOMC post-statement range break | puts | otm1 | — | 0.85 (5; H1 0.11 / H2 1.34) | 0.87 (3; H1 1.23 / H2 0.69) | 0.82 (2; H1 -1.00 / H2 2.63) | 1.34 (3; H1 — / H2 1.34) | 0.11 (2; H1 0.11 / H2 —) | 0.13 (3; H1 -1.00 / H2 0.69) |
| FOMC post-statement range break | puts | near | — | 0.44 (5; H1 -0.19 / H2 0.86) | 0.80 (3; H1 0.62 / H2 0.89) | -0.09 (2; H1 -1.00 / H2 0.82) | 0.86 (3; H1 — / H2 0.86) | -0.19 (2; H1 -0.19 / H2 —) | 0.26 (3; H1 -1.00 / H2 0.89) |
| FOMC post-statement range break | puts | cheap | — | 0.10 (5; H1 -1.00 / H2 0.84) | 0.32 (3; H1 -1.00 / H2 0.97) | -0.22 (2; H1 -1.00 / H2 0.57) | 0.84 (3; H1 — / H2 0.84) | -1.00 (2; H1 -1.00 / H2 —) | 0.32 (3; H1 -1.00 / H2 0.97) |
| FOMC post-statement range break | calls | otm1 | — | -0.84 (4; H1 -0.77 / H2 -0.91) | -0.54 (1; H1 -0.54 / H2 —) | -0.94 (3; H1 -1.00 / H2 -0.91) | -1.00 (1; H1 — / H2 -1.00) | -0.79 (3; H1 -0.77 / H2 -0.82) | -0.54 (1; H1 -0.54 / H2 —) |
| FOMC post-statement range break | calls | near | — | -0.60 (4; H1 -1.00 / H2 -0.19) | -1.00 (1; H1 -1.00 / H2 —) | -0.46 (3; H1 -1.00 / H2 -0.19) | 0.61 (1; H1 — / H2 0.61) | -1.00 (3; H1 -1.00 / H2 -1.00) | -1.00 (1; H1 -1.00 / H2 —) |
| FOMC post-statement range break | calls | cheap | — | -0.45 (3; H1 -1.00 / H2 -0.18) | -1.00 (1; H1 -1.00 / H2 —) | -0.18 (2; H1 — / H2 -0.18) | 0.65 (1; H1 — / H2 0.65) | -1.00 (2; H1 -1.00 / H2 -1.00) | -1.00 (1; H1 -1.00 / H2 —) |
| 08:30-release open drive | puts | otm1 | -1.00 (1; H1 -1.00 / H2 —) | -0.20 (28; H1 -0.24 / H2 -0.15) | 0.04 (4; H1 0.04 / H2 —) | -0.28 (25; H1 -0.39 / H2 -0.15) | — | -0.23 (29; H1 -0.29 / H2 -0.15) | -0.56 (4; H1 0.77 / H2 -1.00) |
| 08:30-release open drive | puts | near | -1.00 (1; H1 -1.00 / H2 —) | -0.32 (27; H1 -0.27 / H2 -0.40) | 0.07 (4; H1 0.07 / H2 —) | -0.41 (24; H1 -0.43 / H2 -0.40) | — | -0.34 (28; H1 -0.31 / H2 -0.40) | -0.35 (3; H1 0.93 / H2 -1.00) |
| 08:30-release open drive | puts | cheap | -1.00 (1; H1 -1.00 / H2 —) | -0.54 (27; H1 -0.44 / H2 -0.69) | -0.16 (4; H1 -0.16 / H2 —) | -0.62 (24; H1 -0.57 / H2 -0.69) | — | -0.56 (28; H1 -0.47 / H2 -0.69) | -0.45 (3; H1 0.64 / H2 -1.00) |
| 08:30-release open drive | calls | otm1 | -0.38 (5; H1 -0.22 / H2 -1.00) | -0.38 (21; H1 -0.59 / H2 -0.02) | -0.43 (4; H1 -0.43 / H2 —) | -0.37 (22; H1 -0.53 / H2 -0.13) | -1.00 (1; H1 — / H2 -1.00) | -0.35 (25; H1 -0.51 / H2 -0.02) | -1.00 (2; H1 -1.00 / H2 -1.00) |
| 08:30-release open drive | calls | near | -0.52 (5; H1 -0.40 / H2 -1.00) | -0.42 (21; H1 -0.67 / H2 -0.01) | -0.52 (4; H1 -0.52 / H2 —) | -0.42 (22; H1 -0.63 / H2 -0.12) | -1.00 (1; H1 — / H2 -1.00) | -0.41 (25; H1 -0.61 / H2 -0.01) | -1.00 (2; H1 -1.00 / H2 -1.00) |
| 08:30-release open drive | calls | cheap | -0.55 (5; H1 -0.43 / H2 -1.00) | -0.34 (21; H1 -0.56 / H2 0.03) | -0.58 (4; H1 -0.58 / H2 —) | -0.34 (22; H1 -0.52 / H2 -0.08) | -1.00 (1; H1 — / H2 -1.00) | -0.35 (25; H1 -0.53 / H2 0.03) | -0.20 (2; H1 0.61 / H2 -1.00) |
| Open drive on non-release days (control) | puts | otm1 | -0.22 (12; H1 0.48 / H2 -0.73) | 0.11 (79; H1 0.26 / H2 -0.03) | 0.16 (16; H1 0.42 / H2 -0.43) | 0.05 (75; H1 0.24 / H2 -0.10) | -0.77 (1; H1 -0.77 / H2 —) | 0.08 (90; H1 0.31 / H2 -0.13) | -0.21 (8; H1 0.67 / H2 -0.33) |
| Open drive on non-release days (control) | puts | near | -0.14 (12; H1 0.67 / H2 -0.71) | 0.04 (79; H1 0.22 / H2 -0.13) | 0.12 (16; H1 0.42 / H2 -0.55) | -0.01 (75; H1 0.22 / H2 -0.18) | -1.00 (1; H1 -1.00 / H2 —) | 0.02 (90; H1 0.30 / H2 -0.22) | -0.27 (8; H1 0.64 / H2 -0.40) |
| Open drive on non-release days (control) | puts | cheap | -0.42 (12; H1 -0.01 / H2 -0.71) | -0.04 (79; H1 0.22 / H2 -0.27) | -0.05 (16; H1 0.23 / H2 -0.67) | -0.09 (75; H1 0.18 / H2 -0.30) | -1.00 (1; H1 -1.00 / H2 —) | -0.07 (90; H1 0.22 / H2 -0.34) | -0.32 (8; H1 0.75 / H2 -0.47) |
| Open drive on non-release days (control) | calls | otm1 | 0.25 (8; H1 1.20 / H2 -0.06) | 0.08 (84; H1 -0.13 / H2 0.26) | 0.03 (11; H1 -0.17 / H2 0.37) | 0.11 (81; H1 -0.04 / H2 0.21) | -0.29 (3; H1 0.07 / H2 -1.00) | 0.11 (89; H1 -0.07 / H2 0.24) | -0.34 (8; H1 -1.00 / H2 -0.12) |
| Open drive on non-release days (control) | calls | near | 0.31 (8; H1 0.67 / H2 0.19) | 0.13 (84; H1 -0.12 / H2 0.33) | 0.10 (11; H1 -0.16 / H2 0.54) | 0.15 (81; H1 -0.06 / H2 0.29) | -0.23 (3; H1 0.15 / H2 -1.00) | 0.15 (89; H1 -0.09 / H2 0.34) | -0.37 (8; H1 -1.00 / H2 -0.16) |
| Open drive on non-release days (control) | calls | cheap | 0.04 (8; H1 -0.21 / H2 0.12) | -0.20 (84; H1 -0.37 / H2 -0.06) | 0.18 (11; H1 -0.11 / H2 0.69) | -0.23 (81; H1 -0.42 / H2 -0.10) | -0.45 (3; H1 -0.17 / H2 -1.00) | -0.17 (89; H1 -0.37 / H2 -0.02) | -0.77 (8; H1 -1.00 / H2 -0.69) |
| Opening-range failure | puts | otm1 | -0.45 (3; H1 -0.18 / H2 -1.00) | 0.16 (27; H1 0.49 / H2 -0.03) | 0.66 (8; H1 1.54 / H2 -0.22) | -0.10 (22; H1 -0.20 / H2 -0.04) | 0.93 (1; H1 — / H2 0.93) | 0.07 (29; H1 0.38 / H2 -0.14) | -0.04 (3; H1 — / H2 -0.04) |
| Opening-range failure | puts | near | -0.46 (3; H1 -0.19 / H2 -1.00) | -0.07 (27; H1 0.17 / H2 -0.22) | 0.36 (8; H1 1.12 / H2 -0.40) | -0.28 (22; H1 -0.40 / H2 -0.22) | 0.82 (1; H1 — / H2 0.82) | -0.14 (29; H1 0.11 / H2 -0.32) | -0.22 (3; H1 — / H2 -0.22) |
| Opening-range failure | puts | cheap | -0.45 (3; H1 -0.17 / H2 -1.00) | -0.06 (27; H1 0.38 / H2 -0.32) | 0.41 (8; H1 1.58 / H2 -0.77) | -0.28 (22; H1 -0.36 / H2 -0.24) | -0.09 (1; H1 — / H2 -0.09) | -0.10 (29; H1 0.29 / H2 -0.37) | -0.42 (3; H1 — / H2 -0.42) |
| Opening-range failure | calls | otm1 | -1.00 (1; H1 -1.00 / H2 —) | -0.19 (25; H1 -0.28 / H2 -0.11) | -0.32 (6; H1 -0.58 / H2 0.21) | -0.20 (20; H1 -0.22 / H2 -0.17) | -1.00 (1; H1 -1.00 / H2 —) | -0.19 (25; H1 -0.28 / H2 -0.11) | -1.00 (2; H1 — / H2 -1.00) |
| Opening-range failure | calls | near | -1.00 (1; H1 -1.00 / H2 —) | -0.13 (25; H1 -0.32 / H2 0.05) | -0.35 (6; H1 -0.59 / H2 0.14) | -0.10 (20; H1 -0.27 / H2 0.03) | -1.00 (1; H1 -1.00 / H2 —) | -0.13 (25; H1 -0.32 / H2 0.05) | -1.00 (2; H1 — / H2 -1.00) |
| Opening-range failure | calls | cheap | -1.00 (1; H1 -1.00 / H2 —) | -0.28 (25; H1 -0.57 / H2 -0.02) | -0.33 (6; H1 -0.56 / H2 0.15) | -0.31 (20; H1 -0.62 / H2 -0.05) | -1.00 (1; H1 -1.00 / H2 —) | -0.28 (25; H1 -0.57 / H2 -0.02) | -1.00 (2; H1 — / H2 -1.00) |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | puts | otm1 | 0.63 (1; H1 0.63 / H2 —) | -0.11 (29; H1 -0.00 / H2 -0.36) | -0.09 (30; H1 0.03 / H2 -0.36) | — | -0.14 (27; H1 -0.03 / H2 -0.36) | 0.37 (3; H1 0.37 / H2 —) | -0.19 (7; H1 -0.46 / H2 0.01) |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | puts | near | 0.69 (1; H1 0.69 / H2 —) | -0.18 (29; H1 -0.10 / H2 -0.38) | -0.15 (30; H1 -0.06 / H2 -0.38) | — | -0.21 (27; H1 -0.13 / H2 -0.38) | 0.36 (3; H1 0.36 / H2 —) | 0.04 (7; H1 -0.44 / H2 0.40) |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | puts | cheap | 1.06 (1; H1 1.06 / H2 —) | -0.37 (28; H1 -0.34 / H2 -0.43) | -0.32 (29; H1 -0.27 / H2 -0.43) | — | -0.24 (26; H1 -0.15 / H2 -0.43) | -1.00 (3; H1 -1.00 / H2 —) | -0.06 (7; H1 -0.31 / H2 0.13) |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | calls | otm1 | -0.65 (5; H1 -0.56 / H2 -1.00) | 0.01 (21; H1 -0.02 / H2 0.07) | -0.12 (26; H1 -0.14 / H2 -0.08) | — | -0.21 (21; H1 -0.21 / H2 -0.22) | 0.27 (5; H1 0.14 / H2 0.79) | -0.23 (3; H1 -0.23 / H2 —) |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | calls | near | -0.74 (5; H1 -0.67 / H2 -1.00) | 0.25 (18; H1 -0.04 / H2 1.02) | 0.04 (23; H1 -0.19 / H2 0.69) | — | -0.39 (18; H1 -0.34 / H2 -0.50) | 1.57 (5; H1 0.31 / H2 6.61) | -0.38 (3; H1 -0.38 / H2 —) |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | calls | cheap | -1.00 (4; H1 -1.00 / H2 —) | -0.28 (14; H1 -0.33 / H2 -0.11) | -0.44 (18; H1 -0.51 / H2 -0.11) | — | -0.56 (14; H1 -0.71 / H2 0.33) | -0.02 (4; H1 0.31 / H2 -1.00) | -1.00 (3; H1 -1.00 / H2 —) |

## Time of day on SPXW (hold-to-close expectancy · half2x_trail, n)

_Window: trades 2025-10-01 → 2026-09-30 · H1 2025-10-01 → 2026-03-31 · H2 2026-04-01 → 2026-09-30 · SPXW real bars (signals from SPY 1-min bars) · generated 2026-09-30T23:15Z by `research/spx-fast-moves-replay.ts`_

| cause | side | contract | 09:35–10:59 | 11:00–13:59 | 14:00–14:59 | 15:00–15:29 | 15:30–15:49 | 15:50–15:55 |
|---|---|---|---|---|---|---|---|---|
| Session low/high break after 14:00 (VWAP side) | puts | otm1 | — | — | 0.07 · 0.22 (22) | 0.08 · 0.10 (7) | 0.42 · 0.15 (10) | 0.57 · 0.58 (2) |
| Session low/high break after 14:00 (VWAP side) | puts | near | — | — | -0.27 · 0.09 (22) | -1.00 · -0.30 (7) | 1.99 · -0.62 (10) | -1.00 · 0.42 (2) |
| Session low/high break after 14:00 (VWAP side) | puts | cheap | — | — | -0.82 · -0.22 (22) | -1.00 · -0.77 (7) | -1.00 · -0.69 (9) | — |
| Session low/high break after 14:00 (VWAP side) | calls | otm1 | — | — | -0.30 · -0.12 (28) | -0.51 · 0.21 (8) | -0.56 · -0.23 (5) | -0.28 · -0.14 (2) |
| Session low/high break after 14:00 (VWAP side) | calls | near | — | — | -0.42 · -0.04 (27) | -0.65 · -0.13 (8) | -1.00 · -0.79 (5) | — |
| Session low/high break after 14:00 (VWAP side) | calls | cheap | — | — | -1.00 · -0.77 (20) | -0.93 · 0.41 (4) | -1.00 · -1.00 (3) | — |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | puts | otm1 | — | — | -0.05 · -0.14 (16) | -0.11 · 0.33 (11) | -0.24 · 0.03 (5) | 1.96 · 1.28 (2) |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | puts | near | — | — | -0.17 · -0.24 (16) | -0.68 · 0.12 (11) | -0.70 · -0.37 (5) | -1.00 · 0.32 (2) |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | puts | cheap | — | — | -0.35 · -0.39 (16) | -1.00 · -0.24 (9) | -1.00 · -0.44 (3) | -1.00 · -1.00 (1) |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | calls | otm1 | — | — | 0.68 · 0.19 (14) | -0.76 · -0.43 (9) | 0.04 · 0.19 (7) | -1.00 · -1.00 (3) |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | calls | near | — | — | 2.20 · 0.95 (14) | -1.00 · -0.42 (9) | -1.00 · -0.34 (7) | -1.00 · -1.00 (2) |
| Trend afternoon (VWAP side + lower highs) → 30-min break on volume | calls | cheap | — | — | 5.19 · 0.94 (12) | -1.00 · -0.64 (7) | -1.00 · -1.00 (1) | — |
| Prior-day low/high break after 14:00 | puts | otm1 | — | — | -0.48 · -0.24 (21) | 0.53 · 0.06 (5) | -0.61 · -0.61 (2) | -1.00 · 0.27 (1) |
| Prior-day low/high break after 14:00 | puts | near | — | — | -0.81 · -0.41 (21) | 0.61 · -0.26 (5) | -1.00 · -1.00 (2) | — |
| Prior-day low/high break after 14:00 | puts | cheap | — | — | -0.90 · -0.41 (21) | 0.85 · -0.69 (5) | -1.00 · -1.00 (2) | — |
| Prior-day low/high break after 14:00 | calls | otm1 | — | — | -0.81 · -0.47 (13) | -0.32 · -0.23 (5) | -1.00 · -1.00 (2) | — |
| Prior-day low/high break after 14:00 | calls | near | — | — | -0.98 · -0.61 (13) | -1.00 · -0.68 (5) | -1.00 · -1.00 (2) | — |
| Prior-day low/high break after 14:00 | calls | cheap | — | — | -1.00 · -1.00 (10) | -1.00 · -0.50 (3) | -1.00 · -1.00 (1) | — |
| Volume expansion ≥ 3× (5-min) with the trend | puts | otm1 | 0.30 · 0.91 (5) | -0.30 · -0.35 (19) | 0.08 · 0.20 (8) | — | — | 1.99 · 1.99 (1) |
| Volume expansion ≥ 3× (5-min) with the trend | puts | near | 0.62 · 0.54 (5) | -0.32 · -0.40 (19) | -0.07 · -0.05 (8) | — | — | -1.00 · -1.00 (1) |
| Volume expansion ≥ 3× (5-min) with the trend | puts | cheap | 1.25 · 0.46 (5) | -0.28 · -0.35 (19) | -0.78 · -0.10 (8) | — | — | — |
| Volume expansion ≥ 3× (5-min) with the trend | calls | otm1 | -0.86 · -0.86 (4) | -0.40 · -0.23 (12) | -0.35 · -0.09 (4) | -0.15 · 0.31 (3) | — | — |
| Volume expansion ≥ 3× (5-min) with the trend | calls | near | -1.00 · -1.00 (4) | -0.53 · -0.27 (12) | -0.62 · -0.20 (4) | -0.46 · 0.22 (3) | — | — |
| Volume expansion ≥ 3× (5-min) with the trend | calls | cheap | -1.00 · -1.00 (4) | -0.74 · -0.33 (12) | -1.00 · -0.59 (4) | -1.00 · 0.13 (3) | — | — |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | puts | otm1 | — | — | — | — | 1.67 · 1.18 (3) | 1.10 · 0.67 (1) |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | puts | near | — | — | — | — | 11.8 · 0.16 (3) | -1.00 · 0.35 (1) |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | puts | cheap | — | — | — | — | -1.00 · -0.40 (2) | — |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | calls | otm1 | — | — | — | — | -0.75 · -0.55 (12) | — |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | calls | near | — | — | — | — | -0.95 · -0.41 (12) | — |
| Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | calls | cheap | — | — | — | — | -1.00 · -0.56 (4) | — |
| Same 15:30+ break on ordinary days (control) | puts | otm1 | — | — | — | — | -0.46 · -0.40 (58) | 0.23 · -0.05 (15) |
| Same 15:30+ break on ordinary days (control) | puts | near | — | — | — | — | -0.92 · -0.56 (57) | -1.00 · -0.79 (6) |
| Same 15:30+ break on ordinary days (control) | puts | cheap | — | — | — | — | -1.00 · -0.81 (33) | — |
| Same 15:30+ break on ordinary days (control) | calls | otm1 | — | — | — | — | -0.41 · -0.28 (45) | -0.56 · -0.39 (15) |
| Same 15:30+ break on ordinary days (control) | calls | near | — | — | — | — | -0.40 · -0.66 (39) | -1.00 · -0.34 (4) |
| Same 15:30+ break on ordinary days (control) | calls | cheap | — | — | — | — | -1.00 · -1.00 (7) | — |
| 15:50 imbalance bar | puts | otm1 | — | — | — | — | — | 0.07 · -0.08 (8) |
| 15:50 imbalance bar | puts | near | — | — | — | — | — | -1.00 · -0.74 (5) |
| 15:50 imbalance bar | puts | cheap | — | — | — | — | — | -1.00 · -1.00 (1) |
| 15:50 imbalance bar | calls | otm1 | — | — | — | — | — | -1.00 · -1.00 (5) |
| 15:50 imbalance bar | calls | near | — | — | — | — | — | -1.00 · -1.00 (4) |
| 15:50 imbalance bar | calls | cheap | — | — | — | — | — | -1.00 · -1.00 (1) |
| FOMC post-statement range break | puts | otm1 | — | — | 0.21 · 0.36 (3) | 2.16 · 1.58 (2) | — | — |
| FOMC post-statement range break | puts | near | — | — | -0.30 · 0.20 (3) | 3.03 · 0.80 (2) | — | — |
| FOMC post-statement range break | puts | cheap | — | — | -1.00 · -0.34 (3) | 3.62 · 0.77 (2) | — | — |
| FOMC post-statement range break | calls | otm1 | — | — | -0.77 · -0.77 (2) | -0.91 · -0.91 (2) | — | — |
| FOMC post-statement range break | calls | near | — | — | -1.00 · -0.19 (2) | -1.00 · -1.00 (2) | — | — |
| FOMC post-statement range break | calls | cheap | — | — | -1.00 · -0.18 (2) | -1.00 · -1.00 (1) | — | — |
| 08:30-release open drive | puts | otm1 | -0.34 · -0.23 (29) | — | — | — | — | — |
| 08:30-release open drive | puts | near | -0.29 · -0.34 (28) | — | — | — | — | — |
| 08:30-release open drive | puts | cheap | -0.00 · -0.56 (28) | — | — | — | — | — |
| 08:30-release open drive | calls | otm1 | -0.35 · -0.38 (26) | — | — | — | — | — |
| 08:30-release open drive | calls | near | -0.43 · -0.44 (26) | — | — | — | — | — |
| 08:30-release open drive | calls | cheap | -0.72 · -0.38 (26) | — | — | — | — | — |
| Open drive on non-release days (control) | puts | otm1 | -0.02 · 0.07 (91) | — | — | — | — | — |
| Open drive on non-release days (control) | puts | near | -0.21 · 0.01 (91) | — | — | — | — | — |
| Open drive on non-release days (control) | puts | cheap | -0.53 · -0.09 (91) | — | — | — | — | — |
| Open drive on non-release days (control) | calls | otm1 | 0.15 · 0.10 (92) | — | — | — | — | — |
| Open drive on non-release days (control) | calls | near | 0.43 · 0.14 (92) | — | — | — | — | — |
| Open drive on non-release days (control) | calls | cheap | 0.21 · -0.18 (92) | — | — | — | — | — |
| Opening-range failure | puts | otm1 | -0.23 · -0.10 (21) | 0.86 · 0.56 (9) | — | — | — | — |
| Opening-range failure | puts | near | -0.43 · -0.31 (21) | 1.06 · 0.34 (9) | — | — | — | — |
| Opening-range failure | puts | cheap | -0.70 · -0.33 (21) | 1.70 · 0.44 (9) | — | — | — | — |
| Opening-range failure | calls | otm1 | -0.45 · -0.28 (19) | 0.24 · -0.08 (7) | — | — | — | — |
| Opening-range failure | calls | near | -0.40 · -0.23 (19) | 0.08 · 0.04 (7) | — | — | — | — |
| Opening-range failure | calls | cheap | -0.33 · -0.35 (19) | -1.00 · -0.20 (7) | — | — | — | — |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | puts | otm1 | — | — | 0.09 · 0.04 (18) | 0.13 · 0.04 (6) | -0.74 · -0.74 (5) | 0.07 · 0.07 (1) |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | puts | near | — | — | 0.40 · 0.20 (18) | -0.59 · -0.39 (6) | -1.00 · -1.00 (5) | -1.00 · -1.00 (1) |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | puts | cheap | — | — | 0.36 · -0.10 (18) | -1.00 · -0.41 (6) | -1.00 · -1.00 (5) | — |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | calls | otm1 | — | — | 0.51 · 0.03 (16) | -0.63 · -0.30 (6) | -1.00 · -1.00 (2) | 0.12 · 0.06 (2) |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | calls | near | — | — | 1.44 · 0.40 (16) | -1.00 · -0.76 (6) | -1.00 · -1.00 (1) | — |
| VIX ETF ±3% (short-gamma proxy) + afternoon 30-min break | calls | cheap | — | — | 5.10 · -0.37 (16) | -1.00 · -1.00 (2) | — | — |

## Exits

- `hold` — hold to the close (expiry value = intrinsic at the 15:59 close)
- `take2x` — sell all at 2× (a 1-min bar high touches 2×)
- `take2x_close` — sell all at 2× only on a 1-min CLOSE ≥ 2× (filled at that close)
- `take3x` — sell all at 3× (bar high), else hold
- `half2x_trail` — sell half at 2×, trail the rest: out on a 1-min close ≤ 60% of its peak, else expiry
- `stop50` — stop at −50% (bar low; gap fills at the open), else hold
<!-- REPLAY:END -->

<!-- TODAY:BEGIN -->
## 2026-09-30 replayed minute by minute (no look-ahead)

Calendar: **quarter-end** · 08:30 pre-market volume 10.7× median · SPY 15:59 close 762.46 · causal check (every trigger first visible exactly one minute after its bar opened, i.e. at its close): **pass**

Context line the new engine prints from 15:30: _Close-flow risk: quarter-end — closing-auction imbalance publishes 15:50 ET; expect volume expansion into 16:00. Context only; a direction is published only when a measured cause triggers._

### (a) Current index engine (policies A/B, 5-min bars, cron cadence)

**GEX variant `rec`** — the chart recorder's own SPY samples today (net sign flipped around zero all afternoon; top strikes → walls), zero-γ 768.6: 0 publishes in 93 passes.

| ET | GEX sign (net $B) | verdict | contract | entry | exit | P&L / contract |
|---|---|---|---|---|---|---|
| 14:30 | positive (0.43) | B: no wall tag + rejection |  |  |  |  |
| 14:35 | positive (1.07) | B: outside 10:00–14:30 / 15:00–15:40 ET |  |  |  |  |
| 14:40 | positive (1.07) | B: outside 10:00–14:30 / 15:00–15:40 ET |  |  |  |  |
| 14:45 | negative (-0.32) | A: no fresh held break of a measured level |  |  |  |  |
| 14:50 | negative (-0.32) | A: no fresh held break of a measured level |  |  |  |  |
| 14:55 | negative (-0.47) | A: no fresh held break of a measured level |  |  |  |  |
| 15:00 | positive (0.38) | B: no wall tag + rejection |  |  |  |  |
| 15:02 | positive (0.38) | B: no wall tag + rejection |  |  |  |  |
| 15:04 | positive (0.09) | B: no wall tag + rejection |  |  |  |  |
| 15:06 | positive (0.09) | B: no wall tag + rejection |  |  |  |  |
| 15:08 | positive (0.09) | B: no wall tag + rejection |  |  |  |  |
| 15:10 | negative (-1.1) | A: no fresh held break of a measured level |  |  |  |  |
| 15:12 | negative (-1.1) | A: no fresh held break of a measured level |  |  |  |  |
| 15:14 | negative (-0.76) | A: no fresh held break of a measured level |  |  |  |  |
| 15:16 | negative (-0.76) | A: no fresh held break of a measured level |  |  |  |  |
| 15:18 | negative (-0.76) | A: no fresh held break of a measured level |  |  |  |  |
| 15:20 | positive (0.39) | B: no wall tag + rejection |  |  |  |  |
| 15:22 | positive (0.39) | B: no wall tag + rejection |  |  |  |  |
| 15:24 | positive (0.35) | B: no wall tag + rejection |  |  |  |  |
| 15:26 | positive (0.35) | B: no wall tag + rejection |  |  |  |  |
| 15:28 | positive (0.35) | B: no wall tag + rejection |  |  |  |  |
| 15:30 | neutral (0.03) | neutral gamma — no dealer footprint (policy C) |  |  |  |  |
| 15:32 | neutral (0.03) | neutral gamma — no dealer footprint (policy C) |  |  |  |  |
| 15:34 | neutral (0.03) | neutral gamma — no dealer footprint (policy C) |  |  |  |  |
| 15:36 | neutral (0.02) | neutral gamma — no dealer footprint (policy C) |  |  |  |  |
| 15:38 | neutral (0.02) | neutral gamma — no dealer footprint (policy C) |  |  |  |  |
| 15:40 | neutral (0.02) | neutral gamma — no dealer footprint (policy C) |  |  |  |  |
| 15:42 | neutral (0.02) | neutral gamma — no dealer footprint (policy C) |  |  |  |  |
| 15:44 | negative (-0.48) | A: no fresh held break of a measured level |  |  |  |  |
| 15:46 | negative (-0.48) | outside 09:45–15:45 ET entry window |  |  |  |  |
| 15:48 | negative (-0.48) | outside 09:45–15:45 ET entry window |  |  |  |  |
| 15:50 | negative (-0.67) | outside 09:45–15:45 ET entry window |  |  |  |  |
| 15:52 | negative (-0.67) | outside 09:45–15:45 ET entry window |  |  |  |  |
| 15:54 | negative (-1.69) | outside 09:45–15:45 ET entry window |  |  |  |  |
| 15:56 | negative (-1.69) | outside 09:45–15:45 ET entry window |  |  |  |  |
| 15:58 | negative (-1.69) | outside 09:45–15:45 ET entry window |  |  |  |  |

**GEX variant `op`** — operator's read: negative gamma, zero-γ 768.6, put wall 765: 1 publish in 93 passes.

| ET | GEX sign (net $B) | verdict | contract | entry | exit | P&L / contract |
|---|---|---|---|---|---|---|
| 13:00 | negative (2.31) | A_neg_gamma_continuation long (trigger OR30 high, stop 767.21, target 785) | SPY260930C00769000 | $0.65 @ 13:00 | $0.33 @ 13:16 (underlying stop) | $-32 |
| 14:30 | negative (0.43) | A: no fresh held break of a measured level |  |  |  |  |
| 14:35 | negative (1.07) | A: no fresh held break of a measured level |  |  |  |  |
| 14:40 | negative (1.07) | A: no fresh held break of a measured level |  |  |  |  |
| 14:45 | negative (-0.32) | A: no fresh held break of a measured level |  |  |  |  |
| 14:50 | negative (-0.32) | A: no fresh held break of a measured level |  |  |  |  |
| 14:55 | negative (-0.47) | A: no fresh held break of a measured level |  |  |  |  |
| 15:00 | negative (0.38) | A: no fresh held break of a measured level |  |  |  |  |
| 15:02 | negative (0.38) | A: no fresh held break of a measured level |  |  |  |  |
| 15:04 | negative (0.09) | A: no fresh held break of a measured level |  |  |  |  |
| 15:06 | negative (0.09) | A: no fresh held break of a measured level |  |  |  |  |
| 15:08 | negative (0.09) | A: no fresh held break of a measured level |  |  |  |  |
| 15:10 | negative (-1.1) | A: no fresh held break of a measured level |  |  |  |  |
| 15:12 | negative (-1.1) | A: no fresh held break of a measured level |  |  |  |  |
| 15:14 | negative (-0.76) | A: no fresh held break of a measured level |  |  |  |  |
| 15:16 | negative (-0.76) | A: no fresh held break of a measured level |  |  |  |  |
| 15:18 | negative (-0.76) | A: no fresh held break of a measured level |  |  |  |  |
| 15:20 | negative (0.39) | A: no fresh held break of a measured level |  |  |  |  |
| 15:22 | negative (0.39) | A: no fresh held break of a measured level |  |  |  |  |
| 15:24 | negative (0.35) | A: no fresh held break of a measured level |  |  |  |  |
| 15:26 | negative (0.35) | A: no fresh held break of a measured level |  |  |  |  |
| 15:28 | negative (0.35) | A: no fresh held break of a measured level |  |  |  |  |
| 15:30 | negative (0.03) | A: no fresh held break of a measured level |  |  |  |  |
| 15:32 | negative (0.03) | A: no fresh held break of a measured level |  |  |  |  |
| 15:34 | negative (0.03) | A: no fresh held break of a measured level |  |  |  |  |
| 15:36 | negative (0.02) | A: no fresh held break of a measured level |  |  |  |  |
| 15:38 | negative (0.02) | A: no fresh held break of a measured level |  |  |  |  |
| 15:40 | negative (0.02) | A: no fresh held break of a measured level |  |  |  |  |
| 15:42 | negative (0.02) | A: no fresh held break of a measured level |  |  |  |  |
| 15:44 | negative (-0.48) | A: no fresh held break of a measured level |  |  |  |  |
| 15:46 | negative (-0.48) | outside 09:45–15:45 ET entry window |  |  |  |  |
| 15:48 | negative (-0.48) | outside 09:45–15:45 ET entry window |  |  |  |  |
| 15:50 | negative (-0.67) | outside 09:45–15:45 ET entry window |  |  |  |  |
| 15:52 | negative (-0.67) | outside 09:45–15:45 ET entry window |  |  |  |  |
| 15:54 | negative (-1.69) | outside 09:45–15:45 ET entry window |  |  |  |  |
| 15:56 | negative (-1.69) | outside 09:45–15:45 ET entry window |  |  |  |  |
| 15:58 | negative (-1.69) | outside 09:45–15:45 ET entry window |  |  |  |  |

### (b) New fast-move detector (1-min bars, evaluated every minute)

Entry = the next minute's option-bar HIGH (conservative). P&L per contract = (exit − entry) × 100. SPXW strike = SPY price × the prior close's ^GSPC/SPY ratio (10.0373) on the 5-pt grid; SPXW priced on its own real 1-min bars and settled on the ^GSPC close (7651.54); SPY settled on its 15:59 close (762.46).

| known at (ET) | cause | side | contract | entry | max after entry | hold (expiry) | take2x | take3x | half2x_trail | stop50 |
|---|---|---|---|---|---|---|---|---|---|---|
| 10:01 | 08:30-release open drive | calls | SPXW260930C07710000 (otm1) | $16.00 @ 10:01 | $19.50 (1.22×) | $0.00 @ 16:00 (expiry) · **$-1600** (-100%) | $0.00 @ 16:00 (expiry) · **$-1600** (-100%) | $0.00 @ 16:00 (expiry) · **$-1600** (-100%) | $0.00 @ 16:00 (expiry) · **$-1600** (-100%) | $8.00 @ 12:30 · **$-800** (-50%) |
| 10:01 | 08:30-release open drive | calls | SPY260930C00769000 (otm1) | $1.21 @ 10:01 | $1.48 (1.22×) | $0.00 @ 16:00 (expiry) · **$-121** (-100%) | $0.00 @ 16:00 (expiry) · **$-121** (-100%) | $0.00 @ 16:00 (expiry) · **$-121** (-100%) | $0.00 @ 16:00 (expiry) · **$-121** (-100%) | $0.60 @ 10:38 · **$-60** (-50%) |
| 10:01 | 08:30-release open drive | calls | SPXW260930C07735000 (near) | $5.30 @ 10:01 | $6.76 (1.28×) | $0.00 @ 16:00 (expiry) · **$-530** (-100%) | $0.00 @ 16:00 (expiry) · **$-530** (-100%) | $0.00 @ 16:00 (expiry) · **$-530** (-100%) | $0.00 @ 16:00 (expiry) · **$-530** (-100%) | $2.65 @ 10:28 · **$-265** (-50%) |
| 10:01 | 08:30-release open drive | calls | SPY260930C00770000 (near) | $0.79 @ 10:01 | $0.98 (1.24×) | $0.00 @ 16:00 (expiry) · **$-79** (-100%) | $0.00 @ 16:00 (expiry) · **$-79** (-100%) | $0.00 @ 16:00 (expiry) · **$-79** (-100%) | $0.00 @ 16:00 (expiry) · **$-79** (-100%) | $0.40 @ 10:34 · **$-39** (-50%) |
| 10:01 | 08:30-release open drive | calls | SPXW260930C07760000 (cheap) | $1.50 @ 10:01 | $2.00 (1.33×) | $0.00 @ 16:00 (expiry) · **$-150** (-100%) | $0.00 @ 16:00 (expiry) · **$-150** (-100%) | $0.00 @ 16:00 (expiry) · **$-150** (-100%) | $0.00 @ 16:00 (expiry) · **$-150** (-100%) | $0.75 @ 10:26 · **$-75** (-50%) |
| 10:01 | 08:30-release open drive | calls | SPY260930C00773000 (cheap) | $0.19 @ 10:01 | $0.25 (1.32×) | $0.00 @ 16:00 (expiry) · **$-19** (-100%) | $0.00 @ 16:00 (expiry) · **$-19** (-100%) | $0.00 @ 16:00 (expiry) · **$-19** (-100%) | $0.00 @ 16:00 (expiry) · **$-19** (-100%) | $0.10 @ 10:28 · **$-9** (-50%) |
| 15:33 | Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | puts | SPXW260930P07690000 (otm1) | $4.80 @ 15:33 | $36.68 (8.01×) | $38.46 @ 16:00 (expiry) · **+$3366** (+701%) | $9.60 @ 15:50 · **+$480** (+100%) | $14.40 @ 15:50 · **+$960** (+200%) | $24.03 @ 16:00 (expiry) · **+$1923** (+401%) | $38.46 @ 16:00 (expiry) · **+$3366** (+701%) |
| 15:33 | Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | puts | SPY260930P00766000 (otm1) | $0.73 @ 15:33 | $3.36 (4.85×) | $3.54 @ 16:00 (expiry) · **+$281** (+385%) | $1.46 @ 15:50 · **+$73** (+100%) | $2.19 @ 15:54 · **+$146** (+200%) | $2.50 @ 16:00 (expiry) · **+$177** (+242%) | $3.54 @ 16:00 (expiry) · **+$281** (+385%) |
| 15:33 | Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | puts | SPXW260930P07665000 (near) | $0.35 @ 15:33 | $6.70 (38.46×) | $13.46 @ 16:00 (expiry) · **+$1311** (+3746%) | $0.70 @ 15:50 · **+$35** (+100%) | $1.05 @ 15:50 · **+$70** (+200%) | $0.75 @ 15:52 · **+$40** (+114%) | $0.17 @ 15:35 · **$-17** (-50%) |
| 15:33 | Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | puts | SPY260930P00764000 (near) | $0.17 @ 15:33 | $1.65 (9.71×) | $1.54 @ 16:00 (expiry) · **+$137** (+806%) | $0.34 @ 15:50 · **+$17** (+100%) | $0.51 @ 15:50 · **+$34** (+200%) | $0.94 @ 16:00 (expiry) · **+$77** (+453%) | $1.54 @ 16:00 (expiry) · **+$137** (+806%) |
| 15:33 | Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | puts | SPXW260930P07640000 (cheap) | $0.10 @ 15:33 | $0.30 (3×) | $0.00 @ 16:00 (expiry) · **$-10** (-100%) | $0.20 @ 15:55 · **+$10** (+100%) | $0.00 @ 16:00 (expiry) · **$-10** (-100%) | $0.12 @ 15:56 · **+$2** (+20%) | $0.05 @ 15:34 · **$-5** (-50%) |
| 15:33 | Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break | puts | SPY260930P00761000 (cheap) | $0.03 @ 15:33 | $0.19 (6.33×) | $0.00 @ 16:00 (expiry) · **$-3** (-100%) | $0.06 @ 15:50 · **+$3** (+100%) | $0.09 @ 15:54 · **+$6** (+200%) | $0.03 @ 16:00 (expiry) · **+$0** (+0%) | $0.00 @ 16:00 (expiry) · **$-3** (-100%) |
| 15:38 | Session low/high break after 14:00 (VWAP side) | puts | SPXW260930P07685000 (otm1) | $4.05 @ 15:38 | $26.10 (8.26×) | $33.46 @ 16:00 (expiry) · **+$2941** (+726%) | $8.10 @ 15:50 · **+$405** (+100%) | $12.15 @ 15:51 · **+$810** (+200%) | $20.78 @ 16:00 (expiry) · **+$1673** (+413%) | $33.46 @ 16:00 (expiry) · **+$2941** (+726%) |
| 15:38 | Session low/high break after 14:00 (VWAP side) | puts | SPY260930P00765000 (otm1) | $0.45 @ 15:38 | $2.31 (5.64×) | $2.54 @ 16:00 (expiry) · **+$209** (+464%) | $0.90 @ 15:50 · **+$45** (+100%) | $1.35 @ 15:54 · **+$90** (+200%) | $1.72 @ 16:00 (expiry) · **+$127** (+282%) | $2.54 @ 16:00 (expiry) · **+$209** (+464%) |
| 15:38 | Session low/high break after 14:00 (VWAP side) | puts | SPXW260930P07665000 (near) | $0.45 @ 15:38 | $6.70 (29.91×) | $13.46 @ 16:00 (expiry) · **+$1301** (+2891%) | $0.90 @ 15:50 · **+$45** (+100%) | $1.35 @ 15:50 · **+$90** (+200%) | $0.85 @ 15:52 · **+$40** (+89%) | $0.23 @ 15:40 · **$-22** (-50%) |
| 15:38 | Session low/high break after 14:00 (VWAP side) | puts | SPY260930P00764000 (near) | $0.21 @ 15:38 | $1.65 (7.86×) | $1.54 @ 16:00 (expiry) · **+$133** (+633%) | $0.42 @ 15:50 · **+$21** (+100%) | $0.63 @ 15:51 · **+$42** (+200%) | $0.98 @ 16:00 (expiry) · **+$77** (+367%) | $1.54 @ 16:00 (expiry) · **+$133** (+633%) |
| 15:38 | Session low/high break after 14:00 (VWAP side) | puts | SPXW260930P07635000 (cheap) | $0.10 @ 15:38 | $0.20 (2×) | $0.00 @ 16:00 (expiry) · **$-10** (-100%) | $0.20 @ 15:55 · **+$10** (+100%) | $0.00 @ 16:00 (expiry) · **$-10** (-100%) | $0.13 @ 15:56 · **+$3** (+25%) | $0.05 @ 15:39 · **$-5** (-50%) |
| 15:38 | Session low/high break after 14:00 (VWAP side) | puts | SPY260930P00761000 (cheap) | $0.04 @ 15:38 | $0.19 (4.75×) | $0.00 @ 16:00 (expiry) · **$-4** (-100%) | $0.08 @ 15:51 · **+$4** (+100%) | $0.12 @ 15:58 · **+$8** (+200%) | $0.04 @ 16:00 (expiry) · **+$0** (+0%) | $0.02 @ 15:45 · **$-2** (-50%) |
| 15:51 | Trend afternoon (VWAP side + lower highs) → 30-min break on volume | puts | SPXW260930P07670000 (otm1) | $3.90 @ 15:51 | $17.90 (4.73×) | $18.46 @ 16:00 (expiry) · **+$1456** (+373%) | $7.80 @ 15:58 · **+$390** (+100%) | $11.70 @ 15:59 · **+$780** (+200%) | $13.13 @ 16:00 (expiry) · **+$923** (+237%) | $1.95 @ 15:52 · **$-195** (-50%) |
| 15:51 | Trend afternoon (VWAP side + lower highs) → 30-min break on volume | puts | SPY260930P00764000 (otm1) | $0.65 @ 15:51 | $1.65 (2.54×) | $1.54 @ 16:00 (expiry) · **+$89** (+137%) | $1.30 @ 15:59 · **+$65** (+100%) | $1.54 @ 16:00 (expiry) · **+$89** (+137%) | $1.42 @ 16:00 (expiry) · **+$77** (+118%) | $1.54 @ 16:00 (expiry) · **+$89** (+137%) |
| 15:51 | Trend afternoon (VWAP side + lower highs) → 30-min break on volume | puts | SPXW260930P07650000 (near) | $0.30 @ 15:51 | $0.80 (2.67×) | $0.00 @ 16:00 (expiry) · **$-30** (-100%) | $0.60 @ 15:55 · **+$30** (+100%) | $0.00 @ 16:00 (expiry) · **$-30** (-100%) | $0.39 @ 15:56 · **+$9** (+28%) | $0.15 @ 15:52 · **$-15** (-50%) |
| 15:51 | Trend afternoon (VWAP side + lower highs) → 30-min break on volume | puts | SPY260930P00762000 (near) | $0.15 @ 15:51 | $0.43 (2.87×) | $0.00 @ 16:00 (expiry) · **$-15** (-100%) | $0.30 @ 15:59 · **+$15** (+100%) | $0.00 @ 16:00 (expiry) · **$-15** (-100%) | $0.15 @ 16:00 (expiry) · **+$0** (+0%) | $0.00 @ 16:00 (expiry) · **$-15** (-100%) |
| 15:51 | Trend afternoon (VWAP side + lower highs) → 30-min break on volume | puts | SPXW260930P07625000 (cheap) | $0.10 @ 15:51 | $0.07 (0.7×) | $0.00 @ 16:00 (expiry) · **$-10** (-100%) | $0.00 @ 16:00 (expiry) · **$-10** (-100%) | $0.00 @ 16:00 (expiry) · **$-10** (-100%) | $0.00 @ 16:00 (expiry) · **$-10** (-100%) | $0.03 @ 15:52 · **$-7** (-70%) |
| 15:51 | Trend afternoon (VWAP side + lower highs) → 30-min break on volume | puts | SPY260930P00760000 (cheap) | $0.05 @ 15:51 | $0.07 (1.4×) | $0.00 @ 16:00 (expiry) · **$-5** (-100%) | $0.00 @ 16:00 (expiry) · **$-5** (-100%) | $0.00 @ 16:00 (expiry) · **$-5** (-100%) | $0.00 @ 16:00 (expiry) · **$-5** (-100%) | $0.01 @ 15:52 · **$-4** (-80%) |
| 15:51 | 15:50 imbalance bar | puts | SPXW260930P07670000 (otm1) | $3.90 @ 15:51 | $17.90 (4.73×) | $18.46 @ 16:00 (expiry) · **+$1456** (+373%) | $7.80 @ 15:58 · **+$390** (+100%) | $11.70 @ 15:59 · **+$780** (+200%) | $13.13 @ 16:00 (expiry) · **+$923** (+237%) | $1.95 @ 15:52 · **$-195** (-50%) |
| 15:51 | 15:50 imbalance bar | puts | SPY260930P00764000 (otm1) | $0.65 @ 15:51 | $1.65 (2.54×) | $1.54 @ 16:00 (expiry) · **+$89** (+137%) | $1.30 @ 15:59 · **+$65** (+100%) | $1.54 @ 16:00 (expiry) · **+$89** (+137%) | $1.42 @ 16:00 (expiry) · **+$77** (+118%) | $1.54 @ 16:00 (expiry) · **+$89** (+137%) |
| 15:51 | 15:50 imbalance bar | puts | SPXW260930P07650000 (near) | $0.30 @ 15:51 | $0.80 (2.67×) | $0.00 @ 16:00 (expiry) · **$-30** (-100%) | $0.60 @ 15:55 · **+$30** (+100%) | $0.00 @ 16:00 (expiry) · **$-30** (-100%) | $0.39 @ 15:56 · **+$9** (+28%) | $0.15 @ 15:52 · **$-15** (-50%) |
| 15:51 | 15:50 imbalance bar | puts | SPY260930P00762000 (near) | $0.15 @ 15:51 | $0.43 (2.87×) | $0.00 @ 16:00 (expiry) · **$-15** (-100%) | $0.30 @ 15:59 · **+$15** (+100%) | $0.00 @ 16:00 (expiry) · **$-15** (-100%) | $0.15 @ 16:00 (expiry) · **+$0** (+0%) | $0.00 @ 16:00 (expiry) · **$-15** (-100%) |
| 15:51 | 15:50 imbalance bar | puts | SPXW260930P07625000 (cheap) | $0.10 @ 15:51 | $0.07 (0.7×) | $0.00 @ 16:00 (expiry) · **$-10** (-100%) | $0.00 @ 16:00 (expiry) · **$-10** (-100%) | $0.00 @ 16:00 (expiry) · **$-10** (-100%) | $0.00 @ 16:00 (expiry) · **$-10** (-100%) | $0.03 @ 15:52 · **$-7** (-70%) |
| 15:51 | 15:50 imbalance bar | puts | SPY260930P00760000 (cheap) | $0.05 @ 15:51 | $0.07 (1.4×) | $0.00 @ 16:00 (expiry) · **$-5** (-100%) | $0.00 @ 16:00 (expiry) · **$-5** (-100%) | $0.00 @ 16:00 (expiry) · **$-5** (-100%) | $0.00 @ 16:00 (expiry) · **$-5** (-100%) | $0.01 @ 15:52 · **$-4** (-80%) |
| 15:55 | Volume expansion ≥ 3× (5-min) with the trend | puts | SPXW260930P07665000 (otm1) | $4.50 @ 15:55 | $6.70 (2.99×) | $13.46 @ 16:00 (expiry) · **+$896** (+199%) | $13.46 @ 16:00 (expiry) · **+$896** (+199%) | $13.46 @ 16:00 (expiry) · **+$896** (+199%) | $13.46 @ 16:00 (expiry) · **+$896** (+199%) | $2.20 @ 15:56 · **$-230** (-51%) |
| 15:55 | Volume expansion ≥ 3× (5-min) with the trend | puts | SPY260930P00763000 (otm1) | $0.50 @ 15:55 | $0.93 (1.86×) | $0.54 @ 16:00 (expiry) · **+$4** (+8%) | $0.54 @ 16:00 (expiry) · **+$4** (+8%) | $0.54 @ 16:00 (expiry) · **+$4** (+8%) | $0.54 @ 16:00 (expiry) · **+$4** (+8%) | $0.54 @ 16:00 (expiry) · **+$4** (+8%) |
| 15:55 | Volume expansion ≥ 3× (5-min) with the trend | puts | SPXW260930P07645000 (near) | $0.45 @ 15:55 | $0.30 (0.67×) | $0.00 @ 16:00 (expiry) · **$-45** (-100%) | $0.00 @ 16:00 (expiry) · **$-45** (-100%) | $0.00 @ 16:00 (expiry) · **$-45** (-100%) | $0.00 @ 16:00 (expiry) · **$-45** (-100%) | $0.12 @ 15:56 · **$-33** (-73%) |
| 15:55 | Volume expansion ≥ 3× (5-min) with the trend | puts | SPY260930P00762000 (near) | $0.24 @ 15:55 | $0.43 (1.79×) | $0.00 @ 16:00 (expiry) · **$-24** (-100%) | $0.00 @ 16:00 (expiry) · **$-24** (-100%) | $0.00 @ 16:00 (expiry) · **$-24** (-100%) | $0.00 @ 16:00 (expiry) · **$-24** (-100%) | $0.00 @ 16:00 (expiry) · **$-24** (-100%) |
| 15:55 | Volume expansion ≥ 3× (5-min) with the trend | puts | SPXW260930P07615000 (cheap) | $0.03 @ 15:55 | $0.05 (1.67×) | $0.00 @ 16:00 (expiry) · **$-3** (-100%) | $0.00 @ 16:00 (expiry) · **$-3** (-100%) | $0.00 @ 16:00 (expiry) · **$-3** (-100%) | $0.00 @ 16:00 (expiry) · **$-3** (-100%) | $0.00 @ 16:00 (expiry) · **$-3** (-100%) |
| 15:55 | Volume expansion ≥ 3× (5-min) with the trend | puts | SPY260930P00759000 (cheap) | $0.04 @ 15:55 | $0.04 (1×) | $0.00 @ 16:00 (expiry) · **$-4** (-100%) | $0.00 @ 16:00 (expiry) · **$-4** (-100%) | $0.00 @ 16:00 (expiry) · **$-4** (-100%) | $0.00 @ 16:00 (expiry) · **$-4** (-100%) | $0.02 @ 15:56 · **$-2** (-50%) |

Trigger notes:

- 10:00 bar (known 10:01) · 08:30-release open drive · calls — 08:30 release day: closed above the 09:30–09:34 high 767.29 on 1.6× volume · trigger-bar RVOL 1.6×
- 15:32 bar (known 15:33) · Calendar close-flow day (month/qtr-end, OPEX, rebalance) 15:30+ break · puts — quarter-end close flow: closed 766.15 below the 15:00–15:29 low 766.24, below VWAP 767.60 · trigger-bar RVOL 0.6×
- 15:37 bar (known 15:38) · Session low/high break after 14:00 (VWAP side) · puts — closed 765.86 below the session low 766.00, below VWAP 767.56 · trigger-bar RVOL 0.8×
- 15:50 bar (known 15:51) · Trend afternoon (VWAP side + lower highs) → 30-min break on volume · puts — 60/60 closes below VWAP, lower highs (766.66 < 766.88), closed below the 30-min low 765.29 on 2.6× volume · trigger-bar RVOL 2.6×
- 15:50 bar (known 15:51) · 15:50 imbalance bar · puts — 15:50 bar 2.6× volume closed below the 15:30–15:49 low 765.29 · trigger-bar RVOL 2.6×
- 15:54 bar (known 15:55) · Volume expansion ≥ 3× (5-min) with the trend · puts — 5-min volume 4.1× normal, −0.19% in 5 min, below VWAP, 30-min trend down · trigger-bar RVOL 5.0×

SPXW data check: 18 SPXW contracts requested from Alpaca v1beta1 bars; 18 returned 1-min bars (SPXW260930C07710000: 390 one-minute bars; SPXW260930C07735000: 390 one-minute bars; SPXW260930C07760000: 379 one-minute bars; SPXW260930P07690000: 390 one-minute bars; SPXW260930P07665000: 390 one-minute bars; SPXW260930P07640000: 386 one-minute bars).
<!-- TODAY:END -->
