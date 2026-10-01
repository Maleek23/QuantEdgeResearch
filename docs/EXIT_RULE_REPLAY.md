# Exit-rule replay — every NEXUS idea, 2026-08-26 → 2026-09-30

Prepared 2026-09-30 (after the close). Read-only: one `SELECT` dump of `trade_ideas` from production, plus Alpaca bars. Nothing was written to any database.

- Script: `research/exit-rule-replay.ts` (`npm run research:exit-rules`). The rules themselves are in `shared/exit-policy.ts`, and their unit tests are in `scripts/test-exit-policy.ts` (`npm run test:exit-policy`).
- Results: `research/exit-rule-replay-results.json`. It holds every table below and every simulated idea with its fills.
- Question: **which exit captures the most of each move?** Every rule uses the same entries; only the exit changes.

## Verdict

**One rule wins: rule 7. Keep the published plan (stop / T1) and add a time stop at 50% of the horizon. At that point, exit unless the trade is at least +0.5R.**

- **It beats the published plan in both walk-forward halves:** H1 +$1,889 and H2 +$2,156.
- **It survives removing its three best trades:** +$2,543 is left. It improved 145 trades and hurt 71.
- **It holds under every sizing and fill variant:** 1 contract or $500 of premium, filled at the bar high or at the bar mid.

No other rule passes:

- **Rules 2–5 trail or scale the winners, and they lose to the plan in at least one half under every variant.** "Hold" and "thirds" lose by thousands. "½ at T1 + trail" loses by about $0.8–1k.
- **Rule 6 (option premium targets) only looks good with equal-premium sizing.** There it is +$2.7k, but all of it comes from H1. It loses in H2 and goes negative once its top 3 trades are removed.

**The bigger finding: no exit rule makes this book profitable.**

- Under the best rule the book still loses −$5,969 on 443 trades. The capture ratio is negative under every rule.
- Exits are not the leak; entry and selection are. This repeats the conclusion of `docs/LOSS_ATTRIBUTION_2026-09-30.md`.
- The time stop helps because it **cuts dead trades early**. 239 of 443 trades (54%) were time-stopped; that set is +$4,045 better than the plan.
- It does not capture more of the winners. The winners are left exactly as the plan has them.

**What this means for the "let winners run" idea from the 09-30 replay:**

- On 09-30 itself this replay reproduces that day: plan +$944, ½ at T1 + 20-EMA trail +$1,074, against the earlier single-day +$1,015 / +$1,444.
- Over five weeks, the same trail **loses to the plan** (−$996, worse in both halves).
- The 3–5× option runners exist, but they are outnumbered by T1 touches that reverse and stop the runner out at break-even, below what a full T1 exit would have banked.

**What one day showed versus what five weeks show:**

- The 09-30 reasoning was correct about that day, and the five-week sample does not support it.
- A 35% trail on the option price was already worse than a fixed 2× on 09-30. Here the option-premium rule (6) is also worse than the plan on 1-contract sizing in both halves.

## Method

**Ideas.** 720 non-archived ideas were published since 2026-08-26. 443 were simulated after these exclusions:

| Excluded | n |
|---|---|
| Duplicates (same symbol, side, engine and instrument in one ET session — first kept) | 39 |
| Recorded exit stamped before publish (the UTC-midnight expiry bug, LOSS_ATTRIBUTION §3) | 13 |
| Never traded at entry within the horizon (untriggered) | 39 |
| Stop traded before entry (void) | 33 |
| Horizon not yet started or no bars (published tonight, 2 symbols with no bars) | 18 |
| Option with no contract print in the entry session | 83 |
| Option contract with no Alpaca bars at all | 52 |

70 options kept a fill whose first contract print came more than 30 minutes after the underlying triggered.

**Entry (the same for every rule):**

- Market-entry engines (`flow`, `orb_scanner`, `zero_dte_desk`, `gex_scanner`) fill at the open of the first regular-session 1-minute bar after publish.
- Every other engine waits for price to **trade at** entry: a bar range containing it, or a gap across it, which fills at the open. If the stop trades first, the idea is void.
- Option entry premium:
  - default fill: the contract's 1-minute bar **high** in the entry minute (or its first print later that session);
  - variant fill: the bar mid, (h+l)/2.
- SPX levels are SPY bars × that day's ^GSPC/SPY close ratio, and the contract is the SPXW root.

**Horizon.** `shared/loss-rules.ts` `horizonTradingDays`, which is the live system's own definition:

- day = 1 session, swing = 5, position = 10;
- never past the contract's 16:00 ET expiry;
- 140 ideas whose horizon runs past today are marked at the last bar, the same way for every rule (flagged `open` in the JSON).

**Bars:**

- Alpaca SIP 1-minute regular-session bars of the underlying; crypto is 24/7, with a UTC day as the session;
- 5-minute 20-EMA / 14-ATR built from those bars;
- prior-session daily 20-EMA / 14-ATR from Alpaca 1-day bars;
- option 1-minute bars by OCC symbol.

1,381 API calls in total, cached under `.cache/exit-replay/`.

**Fill conventions (all rules):**

- In the entry bar only the stop is checked.
- If the stop and a target fall in the same bar, the stop is taken.
- A bar that opens through a level fills at the open.
- Option legs triggered by the underlying fill at the contract's last print at or before that minute.
- Legs triggered by a premium level (rule 6) fill at that premium.

**Sizing:**

- 1 contract per option idea, and an equal-premium variant at $500 of premium per option idea;
- $1,000 notional per stock or crypto idea.

**Capture ratio** = Σ realized $ ÷ Σ peak favourable $ (the best option high, or the best underlying excursion, inside the horizon after entry). The sum of peaks is $70,939 at 1 contract.

**Halves.** The window is split at the median publish date (2026-09-09): H1 = 198 trades, H2 = 245.

**Conviction terciles** use raw `gen_conviction_score` points: low < 11, mid 11–15, high ≥ 16.

**The rules:**

1. Published plan: first of stop or T1, else the horizon end.
2. Hold to the horizon end, stop only.
3. Half at T1, stop to break-even, and the rest trails the 20-EMA (a 5-minute close through it for day / 0DTE holds; a daily close through it for swings).
4. Same as 3, with a 2×ATR chandelier (5-minute ATR for day holds, daily ATR for swings), never below break-even.
5. Thirds at 1R / 2R / 3R, with the stop to break-even after 1R. This approximates the structural ladder, which cannot be rebuilt without historical TA state.
6. Options only:
   - sell half at +100% premium;
   - sell the rest at +200%, or on a break of the underlying's 20-EMA;
   - the underlying stop stays;
   - day trades go out at 15:30 ET if below +50%.
7. Plan, plus a time stop at 50% of the horizon (in trading minutes from entry) unless the trade is at least +0.5R on the underlying.

## Results — 1 contract, conservative (bar-high) fill

### All 443

| Rule | n | Total $ | Win % | $/trade | Capture | Max DD |
|---|---|---|---|---|---|---|
| 1 · Published plan (stop / T1) | 443 | −$10,014 | 31.8% | −$23 | −14% | −$12,197 |
| 2 · Hold to horizon (stop only) | 443 | −$17,624 | 30.0% | −$40 | −25% | −$19,556 |
| 3 · ½ at T1, BE, trail 20-EMA | 443 | −$11,011 | 31.4% | −$25 | −15% | −$12,766 |
| 4 · ½ at T1, BE, 2×ATR chandelier | 443 | −$10,813 | 31.4% | −$24 | −15% | −$12,569 |
| 5 · ⅓ at 1R/2R/3R, BE after 1R | 443 | −$17,036 | 36.6% | −$38 | −24% | −$18,707 |
| 6 · Options: ½ at +100%, rest +200% / EMA (options only) | 307 | −$14,985 | 32.2% | −$49 | −23% | −$17,443 |
| ↳ plan on the same 307 options | 307 | −$9,101 | 31.3% | −$30 | −14% | −$11,260 |
| **7 · Plan + time stop at ½ horizon unless ≥ +0.5R** | 443 | **−$5,969** | 33.0% | −$13 | **−8%** | **−$9,275** |

### H1 (2026-08-26 → 09-08, n=198)

| Rule | Total $ | Win % | $/trade | Capture | Max DD |
|---|---|---|---|---|---|
| 1 · Plan | −$3,195 | 35.9% | −$16 | −6% | −$10,526 |
| 2 · Hold | −$7,661 | 34.3% | −$39 | −16% | −$16,102 |
| 3 · ½T1 + EMA | −$3,452 | 35.4% | −$17 | −7% | −$11,214 |
| 4 · ½T1 + chandelier | −$3,259 | 35.4% | −$16 | −7% | −$11,022 |
| 5 · Thirds | −$9,727 | 43.9% | −$49 | −20% | −$13,436 |
| 6 · Option % (n=119; plan −$3,030) | −$7,044 | 41.2% | −$59 | −16% | −$13,062 |
| **7 · Time ½** | **−$1,307** | 37.9% | −$7 | −3% | −$9,275 |

### H2 (2026-09-09 → 09-30, n=245)

| Rule | Total $ | Win % | $/trade | Capture | Max DD |
|---|---|---|---|---|---|
| 1 · Plan | −$6,819 | 28.6% | −$28 | −31% | −$8,701 |
| 2 · Hold | −$9,963 | 26.5% | −$41 | −45% | −$11,721 |
| 3 · ½T1 + EMA | −$7,559 | 28.2% | −$31 | −34% | −$9,788 |
| 4 · ½T1 + chandelier | −$7,554 | 28.2% | −$31 | −34% | −$9,788 |
| 5 · Thirds | −$7,309 | 30.6% | −$30 | −33% | −$8,515 |
| 6 · Option % (n=188; plan −$6,071) | −$7,941 | 26.6% | −$42 | −38% | −$9,777 |
| **7 · Time ½** | **−$4,663** | 29.0% | −$19 | −21% | −$5,876 |

### The win test

A rule wins only if it beats the plan in both halves **and** is still ahead after its 3 best trades are removed. Rule 6 is compared with the plan on the same options.

Under 1-contract sizing, the deltas are the same at the bar-high and the bar-mid fill, because a 1-contract Δ does not depend on the entry premium. Rule 6 is the exception.

| Rule | Δ vs plan | Δ H1 | Δ H2 | Δ without top-3 | Better / worse | Wins |
|---|---|---|---|---|---|---|
| 2 · Hold | −$7,610 | −$4,466 | −$3,144 | −$11,005 | 19 / 31 | no |
| 3 · ½T1 + EMA | −$996 | −$256 | −$740 | −$2,694 | 11 / 27 | no |
| 4 · ½T1 + chandelier | −$799 | −$64 | −$735 | −$2,410 | 12 / 27 | no |
| 5 · Thirds | −$7,022 | −$6,532 | −$490 | −$9,234 | 64 / 56 | no |
| 6 · Option % (bar-high fill) | −$5,884 | −$4,014 | −$1,870 | −$8,490 | 47 / 43 | no |
| 6 · Option % (mid fill) | −$6,267 | −$4,103 | −$2,164 | −$8,873 | 47 / 43 | no |
| **7 · Time ½** | **+$4,045** | **+$1,889** | **+$2,156** | **+$2,543** | 145 / 71 | **yes** |

Rule 7's top 3 are GOOG put (09-23) +$559, INTU call (08-31) +$500 and TSLA put (08-27) +$443.

### Equal-premium ($500 per option idea) and mid fills

Totals under each variant:

| Rule | $500 premium, bar-high: all / H1 / H2 | 1 contract, mid: all / H1 / H2 | $500 premium, mid: all / H1 / H2 |
|---|---|---|---|
| 1 · Plan | −$12,139 / −$654 / −$11,486 | −$8,525 / −$2,484 / −$6,042 | −$10,220 / −$237 / −$9,983 |
| 2 · Hold | −$17,136 / −$2,105 / −$15,031 | −$16,135 / −$6,949 / −$9,186 | −$15,594 / −$1,703 / −$13,891 |
| 3 · ½T1 + EMA | −$12,834 / −$697 / −$12,137 | −$9,522 / −$2,740 / −$6,782 | −$11,071 / −$284 / −$10,786 |
| 4 · ½T1 + chandelier | −$12,374 / −$245 / −$12,129 | −$9,324 / −$2,548 / −$6,777 | −$10,610 / +$167 / −$10,778 |
| 5 · Thirds | −$13,634 / −$1,637 / −$11,997 | −$15,547 / −$9,016 / −$6,531 | −$11,626 / −$1,214 / −$10,412 |
| 6 · Option % | −$8,573 / +$3,191 / −$11,764 | −$13,879 / −$6,421 / −$7,458 | −$8,171 / +$3,474 / −$11,645 |
| **7 · Time ½** | **−$8,808 / +$405 / −$9,213** | **−$4,480 / −$595 / −$3,885** | **−$6,833 / +$830 / −$7,663** |

Rule 7's improvement over the plan in each variant:

| Variant | Δ all | Δ H1 | Δ H2 | Δ without top-3 |
|---|---|---|---|---|
| $500 premium, bar-high | +$3,331 | +$1,059 | +$2,272 | +$2,040 |
| $500 premium, mid | +$3,387 | +$1,067 | +$2,320 | +$2,085 |

Under equal premium, rule 6 is +$2,653 overall. It is not a winner: H2 is −$1,026, and it is −$417 without its top 3.

### By slice (1 contract, bar-high fill; total $ per rule)

**By engine** (engines with fewer than 3 trades omitted):

| Engine | n | Plan | Hold | ½T1+EMA | ½T1+chand. | Thirds | Opt % | Time ½ | Capture plan → time ½ |
|---|---|---|---|---|---|---|---|---|---|
| market_scanner | 246 | −$3,048 | −$1,277 | −$2,097 | −$1,984 | −$5,468 | −$3,182 | −$671 | −9% → −2% |
| gex_scanner | 93 | −$3,720 | −$8,739 | −$4,413 | −$4,412 | −$8,923 | −$8,606 | −$2,836 | −38% → −29% |
| quant | 59 | −$568 | −$2,538 | −$1,069 | −$990 | −$854 | +$717 | −$300 | −3% → −2% |
| flow | 25 | −$3,172 | −$4,970 | −$3,756 | −$3,756 | −$2,428 | −$4,093 | −$2,466 | −39% → −30% |
| crypto_engine | 8 | −$68 | −$68 | −$68 | −$68 | −$68 | — | −$117 | −148% → −253% |
| spx_session | 5 | −$93 | −$155 | −$109 | −$104 | −$25 | −$154 | −$84 | −20% → −18% |
| gex_magnet | 3 | +$96 | −$327 | −$21 | −$21 | +$19 | −$327 | +$96 | 34% → 34% |

**By asset and option side:**

| Asset | n | Plan | Hold | ½T1+EMA | ½T1+chand. | Thirds | Opt % | Time ½ | Capture plan → time ½ |
|---|---|---|---|---|---|---|---|---|---|
| Call | 252 | −$5,560 | −$14,339 | −$7,030 | −$6,676 | −$14,944 | −$11,705 | −$2,481 | −10% → −5% |
| Put | 55 | −$3,541 | −$2,502 | −$3,157 | −$3,043 | −$1,330 | −$3,280 | −$3,027 | −31% → −27% |
| Stock long | 121 | −$1,191 | −$1,321 | −$1,256 | −$1,256 | −$1,020 | — | −$677 | −25% → −14% |
| Stock short | 5 | +$46 | +$46 | +$46 | +$46 | +$46 | — | +$32 | 51% → 36% |
| Crypto long | 10 | +$232 | +$493 | +$387 | +$117 | +$213 | — | +$183 | 23% → 18% |

**By holding period:**

| Holding period | n | Plan | Hold | ½T1+EMA | ½T1+chand. | Thirds | Opt % | Time ½ | Capture plan → time ½ |
|---|---|---|---|---|---|---|---|---|---|
| Day | 73 | −$412 | −$906 | −$467 | −$462 | −$770 | −$688 | −$352 | −8% → −7% |
| Swing | 361 | −$10,179 | −$17,951 | −$11,449 | −$11,256 | −$16,953 | −$15,650 | −$6,096 | −16% → −10% |
| Position | 9 | +$578 | +$1,234 | +$906 | +$906 | +$687 | +$1,353 | +$479 | 17% → 14% |

**By conviction tercile** (raw gen_conviction_score):

| Conviction | n | Plan | Hold | ½T1+EMA | ½T1+chand. | Thirds | Opt % | Time ½ | Capture plan → time ½ |
|---|---|---|---|---|---|---|---|---|---|
| Low (< 11) | 127 | +$414 | −$3,239 | +$185 | +$97 | −$2,021 | −$549 | +$778 | 2% → 3% |
| Mid (11–15) | 129 | −$2,225 | −$1,115 | −$1,383 | −$1,383 | −$4,877 | −$3,503 | −$1,205 | −15% → −8% |
| High (≥ 16) | 156 | −$9,315 | −$11,601 | −$10,430 | −$10,430 | −$9,221 | −$10,222 | −$6,626 | −37% → −26% |
| No score | 31 | +$1,112 | −$1,669 | +$618 | +$903 | −$917 | −$710 | +$1,083 | 14% → 14% |

**By horizon status:**

| Horizon | n | Plan | Hold | ½T1+EMA | ½T1+chand. | Thirds | Opt % | Time ½ | Capture plan → time ½ |
|---|---|---|---|---|---|---|---|---|---|
| Complete | 303 | −$5,785 | −$13,293 | −$6,728 | −$6,530 | −$12,715 | −$10,970 | −$3,466 | −9% → −5% |
| Open (marked at the last bar) | 140 | −$4,230 | −$4,331 | −$4,283 | −$4,283 | −$4,321 | −$4,015 | −$2,503 | −63% → −37% |

**Reading the slices:**

- **Where rule 7's gain comes from.** Almost all of it is swing calls (`market_scanner` −$3,048 → −$671; calls −$5,560 → −$2,481). It also helps `gex_scanner`, `flow`, stocks and the high-conviction tercile. It is roughly neutral on day trades, puts and the few profitable slices (position holds, crypto, short stocks).
- **Rule 7 still wins on complete horizons only** (+$2,319). The open rows do not carry it.
- **Conviction is still inverted.** The high tercile loses the most under every rule; the low tercile is the only positive group. This matches LOSS_ATTRIBUTION §1.
- **Hold and the option-premium rule help only small slices:** position holds (n=9), puts (hold) and `quant` (option %). None of these is large enough to act on.

## Caveats

- **The live system already enforces rule 7 for new ideas.** Loss Rules v1 (`b04bc3bb`) stamps a time stop of 50% of the horizon, unless ≥ +0.5R, on every new idea, and `server/performance-validator.ts` enforces it (`LOSS_RULE_TIME_STOP`, on by default).
  - This replay is the first measurement of that rule on bars, with the same entries as the plan.
  - It supports keeping the rule.
  - The live anchor is max(publish, trigger observed); the replay anchors at the bar-confirmed entry.
- **The sample is small.** 443 trades over 25 sessions, H2 = 245. The Aug 31 after-close batch dominates H1.
- **Option fills are not real fills.** The bar high in the open minute overstates the entry on illiquid contracts, and the mid understates it. Both are reported, and the verdict holds under both.
  - 135 option ideas could not be priced at all.
  - 70 kept a fill whose first print came more than 30 minutes after the underlying triggered.
- **The ladder is approximated.** Rule 5 uses 1R / 2R / 3R rather than the structural ladder (`server/target-ladder.ts`), which cannot be rebuilt historically without TA state.
- **Peaks use the best print in the horizon.** For options this includes one-print spikes, which makes every capture ratio conservative (smaller).

## What is wired (behind a flag; the default is unchanged)

**`EXIT_POLICY=time_half`** turns on a "Manage" block at the top of the **Model exit plan** card in the NEXUS setup detail (`client/src/components/oracle/signal-detail.tsx` `ProfitPlan`).

- The block tells the user what to do, from the live underlying price:
  - before the deadline: "Time stop Thu 12:45 PM ET: exit unless ≥ +0.5R (≥ $101.00)", with the current R and the stop / T1;
  - after it: "Time stop reached (now −0.21R) → exit at market", or "Time stop passed at +0.80R → hold for the plan";
  - at any time: "Stop … traded → out" or "T1 … hit → take the plan exit".
- **Server side.** `/api/target-ladder/:symbol` (the ladder endpoint in `server/routes.ts`) returns `exitPolicy`: the deadline, fraction, minimum R and horizon, from `shared/exit-policy.ts` `exitPolicyPlan`. That uses the same `horizonTradingDays` / `planTimeStop` the tracker uses.
- **Client side.** `manageSignal` recomputes the instruction from the live price.
- **Default (`EXIT_POLICY` unset, or any other value):** `exitPolicy` is `null` and the card is unchanged. Only the replay winner can be selected; for example, `EXIT_POLICY=t1_ema` reads as `plan`.

**Capture column.** The journal **desk book** now shows a **Capture** column on closed rows (`client/src/pages/journal/trades-view.tsx`).

- Capture = realized underlying move ÷ the best favourable underlying move while open (`shared/exit-policy.ts` `captureRatio`).
- It uses the tracker's `highest_price_reached` / `lowest_price_reached` (`server/journal-row-maps.ts`, `server/journal-sources.ts`).
- It is a measurement, not a policy, so it is not flagged. It appears only when rows carry it.

**Tests.** `npm run test:exit-policy` runs 23 tests: every rule's fills, gap / same-bar conventions, the flag, the manage states, capture, and the desk row.

## Reproduce

```bash
# 1. Read-only dump (SELECT only) to .cache/exit-replay/ideas.json
ssh -i ~/.ssh/quantedge_deploy root@104.248.127.195 "cd /opt/quantedge && set -a && . ./.env && set +a && psql \"\$DATABASE_URL\" -At -c \"select json_agg(x) from (select id, symbol, direction, source, asset_type, option_type, strike_price, expiry_date, entry_price, entry_premium, stop_loss, target_price, timestamp as ts, gen_conviction_score as conv, holding_period, outcome_status, exit_price, exit_date from trade_ideas where timestamp >= '2026-08-26' and coalesce(archived,false)=false) x\"" > .cache/exit-replay/ideas.json
# 2. Replay (Alpaca keys from the main checkout's .env; bars cached under .cache/exit-replay/)
npm run research:exit-rules
```

`EXIT_REPLAY_FILL_WINDOW_MIN=30` restricts option fills to a contract print within 30 minutes of the trigger. The first run used that setting: 372 trades, and rule 7 still won (+$3,990; H1 +$1,903, H2 +$2,087; +$2,488 without the top 3).
