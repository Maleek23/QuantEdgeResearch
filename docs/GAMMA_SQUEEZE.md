# Gamma squeezes — mechanics, case studies, the Squeeze Radar and what it can't yet prove

Status: v1, 2026-09-29, branch `feat/squeeze`. **The radar is unvalidated — measuring.**

- Engine: `shared/squeeze-radar.ts` (pure: chain extraction + scoring) and `server/squeeze-radar.ts` (job, forward log).
- Hook: `server/gex-rankings.ts` (same chain parse; universe + `SQUEEZE_WATCH`).
- API: `GET /api/gex-vex/squeeze-radar`.
- Tool: `squeeze-radar` (GEX category; offered on the FLOW workspace too).
- Replay: `research/squeeze-radar-backtest.ts`.
- Tests: `scripts/test-squeeze.ts` (`npm run test:squeeze`).
- Migration: `migrations/0004_squeeze_radar_log.sql` (not applied).

Companion to `docs/GEX_VEX_METHODOLOGY.md`. It uses the same units ($ per 1% move), the same zero-gamma method and the same regime definition. Quotes are kept under 15 words.

---

## 1. Mechanics

### 1.1 The loop

A single-stock gamma squeeze is a feedback loop between customer call buying and dealer delta hedging:

1. **Customers buy near-dated OTM calls.** These are cheap in dollars but carry a lot of gamma per dollar close to expiry.
2. **The dealer who sold them is short calls.**
   - It hedges by buying Δ·100 shares per contract.
   - Being **short gamma**, its Δ grows as spot rises, so it must **buy more stock into the rally**.
3. **Dealer buying pushes spot toward and through those strikes.**
   - Gamma is largest near the strike and near expiry.
   - So the required hedge accelerates exactly where the call stack sits.
4. **Customers roll or add higher strikes.**
   - The call wall migrates up. New short-gamma inventory appears above spot and the loop restarts.
5. **It ends when:**
   - there is no more short gamma above spot;
   - calls expire (charm: delta decays toward 0 or 1 into expiry, and hedges unwind);
   - IV collapses; or
   - customers stop buying.

**Evidence.**
- SpotGamma's GME account is the canonical practitioner description: <https://spotgamma.com/gme-gamma-squeeze/>.
- Baig, Strong & Zaynutdinova, *Seeking Gamma: Lessons from the Meme Frenzy* (AFA 2026; <https://afajof.org/management/viewp.php?n=183232>, <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5959235>):
  - They build "Net Delta Volume" and "Net Delta Open Interest" measures.
  - They date GME's squeeze to fall 2020.
  - They screen all US stocks from 2019 to 2023. The count is roughly 640–670 events depending on the paper version.
  - They find about 5% average abnormal return in the following month.
  - Their screen needs **signed** (buy/sell) option volume, which we do not have.
- Ni, Pearson, Poteshman & White, *Does Option Trading Have a Pervasive Impact on Underlying Stock Prices?* (RFS 2021, <https://academic.oup.com/rfs/article-abstract/34/4/1952/5873587>):
  - When the net option gamma of likely delta-hedgers is **negative**, absolute stock returns are larger.
  - This is a non-informational channel across the cross-section, not just meme names.
- Barbon & Buraschi, *Gamma Fragility* (<https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3725454>): negative aggregate dealer gamma goes with intraday momentum and fragility.
- Baltussen, Da, Lammers & Martens, *Hedging Demand and Market Intraday Momentum* (JFE 2021, <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3760365>): last-30-minute momentum is linked to gamma hedging demand (options market makers and levered ETFs).
- Amaya, Garcia-Ares, Pearson & Vasquez (Cboe-funded, <https://cdn.cboe.com/resources/education/research_publications/gammasqueezes.pdf>):
  - With trade-signed SPX data, market-maker gamma is **usually positive** and its volatility impact is bounded.
  - This is a reminder that index "gamma squeeze" stories are often overstated.
  - Single names with concentrated retail call buying are the cleaner case.

### 1.2 Why the naive OI sign is wrong exactly in a squeeze

**The assumption.** The SqueezeMetrics GEX paper (<https://squeezemetrics.com/monitor/download/pdf/white_paper.pdf>) signs calls **+** and puts **−**. That encodes one assumption: customers **sell** calls (overwriting) and buy puts, so dealers are long calls.
- For index options, and on average, that is a reasonable prior.
- In a squeeze the premise is the opposite: customers are **buying** calls.
- At the strikes being bought, the true dealer sign is negative. The naive map therefore shows **positive gamma (stabilising) exactly where dealers are short (amplifying)**.
- `GEX_VEX_METHODOLOGY.md` §8 already flags this. BE on 2026-09-29 read **+32%** net balance naively.

**What public data can't tell us.** Open interest does not say who is long. SqueezeMetrics later moved to trade-signed "DDOI" for this reason.

**Three fixes, in order of quality:**

1. **Trade-signed or origin-tagged volume.**
   - Sources: Cboe Open-Close volume summary (buy/sell × open/close × customer/firm/MM, per series), ISE/NOM equivalents, or a vendor's aggressor-inferred tape.
   - This is the right answer. We have **only** Bullflow's live prints and its ask/bid-inferred net premium, and only from today forward.
2. **OCC account-type volume.**
   - Public, free, 24 months deep: <https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/volume-query>.
   - It splits every day's option volume by customer / firm / market-maker **sides**, calls and puts, per underlying.
   - It is **unsigned** (a customer side can be a buy or a sell) and it is **not per strike**. But a surge in customer call sides is a real, historically available proxy for "customers are active in calls".
   - We use it (`occCustomerCalls`) and it is the backbone of the replay (§4).
3. **An explicit customer-long assumption for the OTM call build.**
   - The radar computes GEX twice:
     - **naive**, as the hub does;
     - **adjusted**: at each near-dated (0.75–21 d) OTM (2–25% above spot) call contract, a fraction **w = min(1, volume ÷ OI)** of its OI is re-signed dealer-short. Only as much as traded today, so a stale OI stack is not assumed customer-bought.
   - An upper bound (every near-dated OTM call customer-long) is also reported.
   - The adjusted zero-gamma comes from the same spot-grid re-pricing. BS gamma is sign-symmetric, so re-signing is exact.
   - **This is an assumption, stated as one.**

### 1.3 The other ingredients

- **Vanna / IV up with spot.**
  - In a squeeze, call demand bids up IV as spot rises: call skew flattens or inverts. Demand-based option pricing (Gârleanu, Pedersen & Poteshman, RFS 2009) predicts end-user demand raises IV.
  - For a dealer short OTM calls, rising IV **raises** the calls' delta, so it must buy more. Vanna adds to gamma.
  - Radar reads:
    - call skew now: IV at ~+10% strike minus ATM, on the first expiry ≥ 5 d;
    - ATM IV change with spot versus the previous logged session.
- **Call-wall migration.** The strike with the largest call gamma above spot steps higher over consecutive sessions as customers roll up. The radar needs ≥ 3 logged sessions.
- **OTM call OI and volume surge on near-dated strikes.**
  - vol/OI > 1 at a strike means positions were opened today.
  - `GEX_VEX_METHODOLOGY.md` §1 notes that vol > OI as a squeeze signal has **no peer-reviewed validation**. We treat it as a heuristic.
  - The OI build (today's near OTM call OI vs the median of prior logged sessions) is the slower, sturdier read. It needs history.
- **Short interest / float / borrow.**
  - Short sellers forced to cover add a second buyer (the "short squeeze"). It is a separate mechanism that can stack with gamma.
  - Exchange short interest is published twice monthly. We read Yahoo's key statistics (`server/short-interest.ts`, 12 h cache). **No borrow-rate / utilisation feed exists in the platform.**
- **Zero-gamma cross.**
  - Spot moving from below to above the zero-gamma level flips dealers from dampening to amplifying (naive map).
  - With the adjusted map, the relevant level is usually **higher**, because re-signed calls push the crossing up. AMD 2026-09-29: naive 586, turnover-weighted 598, upper bound 696.
- **Charm into expiry.** As near-dated OTM calls decay toward zero delta, dealers' long-stock hedge is released: selling pressure into expiry if spot stalls. The radar reports days to expiry of the key strikes but **does not score charm** (same stance as the methodology doc).

---

## 2. What the Squeeze Radar computes

Per ticker, the score (0–100) is the sum of the components whose inputs exist. **`coverage` is the sum of the weights that could be scored**, so "28 of a possible 62" reads as such. Missing inputs are shown as unavailable, never imputed. All weights and cut-offs are **judgment, set before any replay**, and are not fitted.

| Component | Weight | Input (source) | Full points at |
|---|---|---|---|
| OTM call turnover | 12 | near-dated OTM call volume ÷ OI today (chain) | 1.5× |
| OTM call OI build | 10 | OTM call OI ÷ median of ≥ 5 prior logged sessions (radar log) | 2× |
| Call-wall migration | 10 | call wall over ≥ 3 prior logged sessions (radar log) | +10% with net up-steps ≥ 2 |
| Customer call buying (tape) | 14 | Bullflow aggressive-print premium: call share, near OTM call $; provider ask/bid net premium for the top 3 per cycle | 90% calls, ≥ $1M near OTM, net call lead ≥ $5M |
| Dealer short gamma (adjusted) | 12 | net/gross GEX balance, turnover-weighted customer-long re-sign (chain) | balance ≤ −30% |
| Room to the squeeze strike | 6 | spot → largest near-dated OTM call gamma strike (chain) | 1.5–12% away |
| IV rising with spot | 10 | call skew (5) + ΔATM IV with Δspot vs last logged session (5) | skew ≥ 8 vol pts; +5 pts IV with +3% spot |
| Realised-vol expansion | 8 | RV5 ÷ RV20 (daily bars) | 2× |
| Price confirming | 6 | 5-session return | +15% |
| OCC customer call sides | 8 | latest published session ÷ 20-session median (OCC) | 3× |
| Short interest | 4 | % of float short (Yahoo key stats, twice-monthly exchange data) | 20% |

**Stages** (judgment):

| Stage | Rule |
|---|---|
| **igniting** | score ≥ 55, day ≥ +3%, dealer-short-gamma ≥ half its weight |
| **primed** | score ≥ 45 |
| **building** | score ≥ 25 |
| **exhausted** | 5-session return ≥ 30% and no squeeze strike within 20%, or IV not rising while price falls |
| **illiquid** | 20-day average $ volume < $20M or near-dated call OI < 2,000 (not staged) |
| **quiet** | otherwise |

**Key strikes.** Squeeze strike, call wall, naive and adjusted zero-gamma, and the top six near-dated OTM call strikes with volume, OI, vol/OI and IV.

**Cost to the providers.**
- **Zero extra chain fetches.** The radar reads `row.squeeze`, extracted in the same parse as the rankings row. It runs when each rankings cycle ends: every 10 min in cash hours through the existing Alpaca / CBOE queues.
- Added universe: `SQUEEZE_WATCH` (IONQ, RKLB, SPCE, ASTS, BE, AMD, TSLA, LUNR, OKLO, AAOI, CRCL, CRWV, NBIS, APP, RGTI, QBTS, HOOD). Most are already in the tiers; the dedupe keeps one read per ticker.
- Other reads:
  - Bars through `getBars` (Polygon grouped-daily first), at most 25 cold names per cycle.
  - Bullflow: the live print ring (no call), plus at most 3 net-premium reads per cycle through the shared 8/min budget.
  - OCC: one public request per session, at most 3 back-filled per cycle, 2 s apart, cached on disk.
  - Short interest: at most 5 new names per cycle, only for names already scoring ≥ 20.

**Forward log (append-only).**
- Each weekday, the first cycle at or after 10:30 ET (`open`) and at or after 15:30 ET (`close`) writes one line per symbol with a fresh chain (< 45 min).
- The line holds the score, stage, per-component points and the compact chain read (spot, near OTM call OI/vol, walls, squeeze strike, ATM IV, skew, balances, source, OI date).
- Destinations:
  - `.cache/squeeze-radar/log.jsonl`, always;
  - table `squeeze_radar_log` once migration 0004 is applied (`ON CONFLICT DO NOTHING`, never updated).
- The log is also the radar's own history for OI build, wall migration and IV-with-spot. **Those three components stay "n/a" for the first 1–5 logged sessions after deploy.**

---

## 3. Case studies — what was observable before each move

**Data actually available for these dates:**
- **Daily OHLCV:** Yahoo chart API.
- **OCC daily volume by account type:** 501 sessions, 2024-09-30 → 2026-09-28, fetched one request per session.

**Not available historically. Nothing below simulates any of these:**
- per-strike open interest or volume, call walls, zero-gamma, IV / skew / term structure (**no historical option chains**);
- aggressor-signed prints (Bullflow is live-only here);
- point-in-time short interest.

`gex_snapshots` in the production DB was **not queried** (the brief forbids prod DB access). It holds hourly call walls and top levels for AMD, TSLA, RKLB and ASTS (they are in `ARCHIVE_TICKERS`), but not for IONQ, SPCE or BE. It stores no volume or OI. Its call-wall definition changed at the v2 boundary on 2026-09-29. A read-only query by the operator could reconstruct **wall migration** for those four names; nothing else in the radar can be rebuilt from it.

**The one real chain read** for all seven names is today's CBOE delayed chain (≈ 23:00 UTC 2026-09-29). It is shown at the end as the radar's current read, not as a backtest.

"Sub" below is the history-capable sub-score (RV expansion + momentum + OCC customer calls, max 22). It fires at ≥ 13.2 (60%), a threshold declared in advance. "OCC ×" is customer call sides ÷ the prior 20-session median. Full tables: `npx tsx research/squeeze-radar-backtest.ts --offline`.

### AMD — the "440 → 660" move
- **Actual numbers:** low **$440.50** intraday on 2026-09-03 (close 456.16) to high **$639.00** on 2026-09-25 (close 630.63). That is +45% low-to-high in 15 sessions, +38% close-to-close.
- **AMD never traded at $660.** The 52-week high is $639.00.
- **Before the low (08-18 → 09-03):** OCC customer call sides 0.62–0.99× baseline; RV contracting (RV5/RV20 0.5–0.9); sub-score ≤ 1.2. **Nothing was observable in our historical data before the move.**
- **During the move:**
  - The first OCC surges came *with* the rally: 09-04 1.83×, 09-08 1.87×, **09-09 2.34×** (4 sessions after the low, close 521.10, 22.6% of the move to the high still ahead), 09-11 2.00×, 09-17 2.13×.
  - The sub-score fired only on **09-21** (OCC 3.08×, +24.7% in 5 sessions). That was 11 sessions after the low, with **3.8%** left to the high.
- **Chain today (09-29, after the move).** Score 16, coverage 62, quiet:
  - near OTM call turnover 1.05× with 17 strikes where volume ≥ OI;
  - squeeze strike 630 (+3.6%);
  - naive balance +19%, adjusted +5%, upper bound −8%; zero-gamma naive 586, adjusted 598;
  - RV contracting.

### TSLA — 2025-09-04 → 2025-10-02 (largest TSLA run in the last 12 months)
- **Move:** low $331.48 → high $470.75 (+42%).
- **Pre-low surges:** OCC 1.81× on 08-22 and **2.00× on 08-29**, 4 sessions before the low. Price then *fell* about 1% further (close 329.36 on 09-02) before the low. A pre-move surge existed, but it was not distinguishable from the many that lead nowhere (§4).
- **1 session after the low:** **2.30×** on 09-05 (close 350.84; 34% of the move to the high still ahead).
- **Sub-score fired 09-12:** OCC 3.91×, 6 sessions after the low, 18.9% left.

### IONQ — 2026-09-14 → 2026-09-28 (most recent ≥ 35% run)
- **Move:** low $35.00 → high $47.91 (+37%).
- **Pre-low surge:** **2.74× on 09-08**, 4 sessions before the low. Price then fell a further 9% before turning.
- **During the move:** the next surge was **4.72× on 09-23** (the sub-score fire), 7 sessions after the low, 12.6% left.
- Customer call share was high throughout (60–79%). That is typical for IONQ, not specific to the move.

### RKLB — 2026-04-29 → 2026-05-27
- **Move:** low $73.99 → high $151.00 (+104%).
- **Earlier surge:** a 3.98× surge and sub-score fire on **04-16** belonged to the prior leg (+24% in 5 sessions). RKLB then dropped 14.5% into the 04-29 low. **Counted honestly, that was a false start, not an early warning.**
- **Inside the move:** the fire was **05-08**, 7 sessions after the low, on OCC **6.71×** and a +34% day (close 105.47, 43% to the high still ahead).

### SPCE — 2026-05-01 → 2026-06-01
- **Move:** low $2.37 → high $8.90 (+275%).
- **Before the low:** OCC 1.77–1.81× on 04-16/17, then a collapse in call activity (0.23–0.68×) into the low.
- **During the move:**
  - First fire **05-08** (2.65×), 5 sessions after the low, close 2.94. **203% of the move was still ahead.**
  - It then fired almost continuously through the melt-up (OCC 7–19×).
- Illiquid by the radar's floor at today's read: the only near-dated OTM call strike traded 150 contracts.

### ASTS — 2026-05-05 → 2026-05-28
- **Move:** low $63.43 → high $133.86 (+111%).
- **Pre-low surges:** OCC 3.10× on 04-17 and 2.81× on 04-20. The stock then fell 25% into the low, another false start.
- **During the move:** fire **05-11** (2.65×), 4 sessions after the low, close 82.55. **62% was still ahead.**

### BE — two episodes
- **2026-08-24 → 09-17:**
  - Move: low $185.93 → high $288.00 (+55%).
  - OCC surge **2.66× on 09-03**, 8 sessions after the low (close 235.55, 22% still ahead). Sub-score fired 09-04.
- **The 300C week (2026-09-24 → 09-29):**
  - Move: low $251.30 (09-24) → high $302.35 (09-29).
  - OCC 2.18× on 09-25, the first up day (close 288.70).
  - **The reported $0.89 → $12.43 option path cannot be verified: no historical option prices.**
  - Today's chain (the only real chain read), score 28, *building*, coverage 62:
    - near OTM call turnover **1.89×** (maximum points);
    - **19** OTM strikes with volume ≥ OI;
    - 300C (exp 10-02) volume **15,279 vs OI 9,518**;
    - squeeze strike and call wall **300** (+2.3%);
    - RV5/RV20 1.45×.
  - Naive balance **+32%**, adjusted +9%, upper bound +4%. BE's book stays net long gamma even under the assumption, because its put OI is large.
  - This is consistent with the magnet detector's score of 61 on the same day.

### What the case studies show
- In **none** of the seven moves did the historically available data (OCC customer call sides, RV, momentum) give a distinguishable signal **before** the low.
- The OCC customer-call surge arrives **1–8 sessions after the low**, with the first up-days. At that point 13–203% of the move was still ahead: AMD 23%, TSLA 34%, RKLB 43%, ASTS 62%, SPCE 203%, BE 22%. IONQ was the exception, with its first in-move surge 7 sessions in and 13% left.
- Four of the seven names (TSLA, IONQ, RKLB, ASTS) had **pre-low surges that were followed by further declines**. The same signal marks false starts.
- The components that could plausibly lead (OTM call OI build, call-wall migration, adjusted dealer gamma, IV-with-spot, aggressor tape) **have no history**. Whether they would have flagged these moves earlier is **unknown**, not "probably yes".
- Seven hand-picked winners prove nothing about an edge (Signal Lab rule). §4 is the only evidence.

---

## 4. Validation (history-capable legs only)

**Setup.**
- **Universe:** the rankings job's static universe (tiers + high-beta + `SQUEEZE_WATCH`) minus ETFs, **128 single stocks**.
- **Sample:** 60,357 ticker-days; 59,999 with a 20-session OCC baseline.
- **Signal** (declared in advance): sub-score ≥ 13.2 / 22, evaluated after the close.
- **Outcome:** max high in the next 10 sessions ≥ +20% (also ≥ +35%) from that close.
- **Base rates:**
  - (a) all universe-days;
  - (b) **matched**: same-day cross-sectional RV20 quintile × 20-day $-volume tercile, from non-signal days. Signals come from high-vol names, and high-vol names hit +20% more often regardless.
- **Episodes:** a signal within 10 sessions of an earlier one on the same ticker is folded in.
- **Walk-forward split:** A = before 2025-10-01, B = after.

| Rule | Half | Signal-days (n, hit) | Episodes (n, hit, 95% CI) | Base: all days | Base: matched (episodes) | Lift vs matched |
|---|---|---|---|---|---|---|
| sub ≥ 13.2, +20% | A | 1,892 · 34.0% | 644 · 31.1% [27.6–34.7] | 21.0% | 25.2% | **1.23×** |
| sub ≥ 13.2, +20% | **B (out of sample)** | 1,420 · 25.7% | 579 · 24.4% [21.0–28.0] | 19.6% | 21.9% | **1.11×** |
| sub ≥ 13.2, +35% | A | 1,892 · 17.3% | 644 · 14.1% [11.7–17.0] | 8.0% | 10.1% | 1.40× |
| sub ≥ 13.2, +35% | **B** | 1,420 · 9.2% | 579 · 8.1% [6.2–10.6] | 6.1% | 7.4% | **1.09×** |
| OCC ≥ 2× alone, +20% | A | 5,401 · 24.5% | 1,490 · 23.6% [21.5–25.8] | 21.0% | 20.6% | 1.14× |
| OCC ≥ 2× alone, +20% | **B** | 4,507 · 22.1% | 1,431 · 22.1% [20.0–24.3] | 19.6% | 19.0% | **1.16×** |
| tuned on A (sub ≥ 14), +20% | **B** | 1,159 · 26.8% | 484 · 25.6% [21.9–29.7] | 19.6% | 22.5% | 1.14× |

**Event recall.**
- The universe had **1,059** non-overlapping ≥ 35% runs of 20 sessions or fewer.
- The sub-score fired in [low − 5, low + 3] for **28.7%** of them.
- A random 9-session window contains a fire **23.3%** of the time (n = 6,731).

**Reading.**
1. Against the naive all-days base, the signal looks strong: 31% vs 21%. **Most of that is volatility selection.** Against volatility- and liquidity-matched days, the out-of-sample lift is **1.09–1.16×**, and every B-half confidence interval **overlaps** the matched base.
2. The OCC customer-call surge alone is the most stable leg: about 1.15× in both halves. It is small, and its B CI (20.0–24.3%) only just clears the matched 19.0%. **That is a weak, possibly real tilt, not a tradeable edge on its own.**
3. Tuning the threshold on A (sub ≥ 14, A lift 1.66× raw) and applying it to B gives 1.14× matched. The in-sample advantage mostly disappears, which is the Signal Lab pattern.
4. Recall is barely above chance (28.7% vs 23.3%). **The history-capable legs do not find squeezes early.** They confirm moves already under way.
5. **Biases, all unfavourable to the signal's credibility:**
   - The universe is *today's* list of names (selection and survivorship bias toward names that did squeeze).
   - 128 names over 2 years is one regime-rich period.
   - Signal-days overlap heavily; the episode counts are the honest n.

**Verdict.**
- The chain-derived components (78 of the 100 points) are **unvalidated**: there is no history to replay them on.
- The 22 history-capable points show a small out-of-sample tilt that is not significant against matched base rates.
- **The radar ships as "unvalidated — measuring"**, with forward logging from the first deploy.

**What would count as validation.**
- n ≥ 100 logged episodes at stage primed or igniting, **scored forward** against the same matched base, out of sample.
- The first honest read is about 3–6 months after deploy at current universe size.
- Scoring script: re-use `evaluate()` in the replay over `squeeze_radar_log`.

---

## 5. What data is missing — and what it would cost

Prices are approximate as of the author's knowledge and **must be checked with the vendor**.

| Missing input | Why it matters | Source | Rough cost |
|---|---|---|---|
| Historical EOD option chains (per-strike OI, volume, IV) | Replay the 78 chain-derived points: OI build, wall migration, adjusted gamma, skew | Polygon/Massive options history; ThetaData; ORATS; Cboe DataShop EOD summary | Low tens to low hundreds of $/month for vendor plans; DataShop is priced per symbol-month and is dearer for a 150-name universe |
| Trade-signed, origin-tagged volume (buy/sell × open/close × customer/firm/MM) | Fixes the dealer sign properly (§1.2 fix 1), as SqueezeMetrics' DDOI does. It is the input Baig et al. use | Cboe Open-Close volume summary (plus ISE/NOM/NYSE equivalents) | Paid per exchange and month; typically hundreds of $/month or more per venue |
| Historical aggressor tape | Replay the 14-point tape component | Bullflow historical (not in our integration), or OPRA with NBBO (heavy) | Vendor-dependent |
| Real-time consolidated OPRA | The Alpaca feed is `indicative`, not OPRA | Alpaca Algo Trader Plus | About $99/month (check) |
| Point-in-time short interest, borrow fee and utilisation | Short-squeeze stacking; the current Yahoo read is a snapshot | FINRA equity short interest files (free; history; twice monthly); borrow/utilisation from S3 / Ortex / IBKR | FINRA free; borrow data paid (Ortex is a retail subscription; S3 is institutional) |
| `gex_snapshots` wall history | Wall migration for AMD / TSLA / RKLB / ASTS before today | our prod DB, read-only | free: an operator query |

The cheapest step with the biggest effect is a **vendor EOD chain history** (per-strike OI and volume). With it, §3 and §4 can be re-run on the components that might actually lead.

---

## 6. Operator notes

- Apply `migrations/0004_squeeze_radar_log.sql` (backup first, per RUNBOOK) to get the DB sink. Without it, the radar logs to `.cache/squeeze-radar/log.jsonl` and warns once.
- `.cache/` is not in git. Keep `.cache/squeeze-radar/` and `.cache/occ-volume/` across deploys (the manual scp deploy should not wipe them), or the radar's own history resets.
- Re-run the replay:
  - `npx tsx research/squeeze-radar-backtest.ts --fetch-occ 2024-09-30 <yesterday>`: about 500 requests, 1.5 s apart, a few MB each, stored compact. OCC keeps 24 months.
  - Then `npx tsx research/squeeze-radar-backtest.ts --offline`.
