# GEX / VEX methodology

Status: v2, 2026-09-29. This is the reference for every gamma (GEX) and vanna (VEX) number QuantEdge shows: the GEX hub (terminal GEX tab), the screener/rankings, the research chart pills, scanner rows and narratives.

- Code: `shared/gex-math.ts` (formulas, zero-gamma, walls) and `shared/gex-regime.ts` (the regime definition and its words).
- Audit script: `research/gex-audit.ts`.
- Magnet detector: `server/gex-magnet.ts`. Its replay script is `research/gex-magnet-backtest.ts`.

Quotes are kept under 15 words. Everything else is paraphrased, with the source linked.

---

## 1. What the research says

### SqueezeMetrics, *Gamma Exposure* white paper (2016, rev. 2017)
Source: <https://squeezemetrics.com/monitor/download/pdf/white_paper.pdf>

- **Formula.** Per strike, GEX = Γ·OI·100 for calls and Γ·OI·(−100) for puts, summed over every strike and expiry. The unit is shares, or dollars for SPX, **per 1 point** of underlying.
- **Assumptions.** A delta-hedging dealer takes the other side of every option. Investors sell calls (overwriting) and buy puts (protection). So dealers are long calls and short puts, which gives calls **+** and puts **−**.
- **Finding.** SPX next-day volatility falls as GEX rises. In the highest GEX quartile the next-day standard deviation was 0.55%. Volatility rises sharply once GEX goes negative.

### SqueezeMetrics, *The Implied Order Book* (2020) and the monitor guide
Sources: <https://squeezemetrics.com/download/The_Implied_Order_Book.pdf>, <https://squeezemetrics.com/monitor/static/guide.pdf>

- **Definitions.** GEX is dealer delta sensitivity to price. VEX is dealer delta sensitivity to implied vol.
- **GEX+.** GEX+ = GEX + VEX. They can be added only because both are put into dollars per SPX point, using an assumed 10× spot/vol ratio.
- **Liquidity.** Positive GEX means dealer hedging **provides** liquidity (buys dips, sells rips). Negative GEX means it **takes** liquidity.
- **Negative VEX.** Dealers sell into rising IV. The paper calls it "GEX's evil twin". It reached about −$400mm per point in 2008 and March 2020.
- **Moneyness.** Vanna's sign depends on moneyness, so the same customer trade can leave dealers buying or selling as IV rises.
- **DDOI (dealer directional OI).** SqueezeMetrics later built dealer-signed open interest by signing every trade and reconciling against next-day OI. That admits the 2017 calls+/puts− signs were an assumption. In the paper's words, public OI "only tells us the number of contracts in existence".
- **Charm.** The paper sets charm aside for SPX as too small to matter.

### SqueezeMetrics DIX (Dark Index)
Sources: <https://squeezemetrics.com/monitor/download/pdf/short_is_long.pdf>, <https://squeezemetrics.com/monitor/dix>

- DIX is the dollar-weighted share of off-exchange volume reported as short, across S&P 500 members (FINRA Reg SHO files).
- Market makers fill customer buys by selling short, so a high DIX reads as investor buying.
- It is a separate sentiment series with no formula linking it to GEX. **We do not compute DIX.**

### SpotGamma level definitions
Sources:
- <https://spotgamma.com/options-key-levels-explained/>
- <https://spotgamma.com/gamma-exposure-gex/>
- <https://spotgamma.com/volatility-trigger-zero-gamma-trading/>
- <https://trendspider.com/blog/spotgamma-levels-indicator-added-to-trendspider/>

SpotGamma's own support pages returned 403. The definitions below come from its public pages and from TrendSpider's integration notes.

- **GEX.** Γ × modeled dealer position × multiplier × S² × 0.01, per 1% move. The position is **modeled**, not raw OI.
- **Call Wall.** "The strike with the largest net call gamma." Usually resistance.
- **Put Wall.** The strike with the largest net put gamma. Usually support.
- **Zero Gamma / Gamma Flip.** The spot where aggregate GEX crosses zero. It is found by **recomputing option gamma across hypothetical spot prices**, not by summing strikes.
- **Volatility Trigger.** Proprietary and derived from the gamma distribution. It often sits above Zero Gamma. **We do not compute it.**
- **Absolute Gamma strike.** The strike with the largest total (call + put) gamma. Our equivalent is `maxGammaStrike`, the largest |net| strike.
- **Hedge Wall.** Proprietary single-stock level. **Not computed.**

### Perfiliev, "How to calculate gamma exposure and zero gamma level"
Source: <https://perfiliev.com/blog/how-to-calculate-gamma-exposure-and-zero-gamma-level/>

- **Formula.** GEX = Γ · 100 · OI · S² · 0.01, with puts × −1, giving **$ per 1% move**. Γ·S turns share gamma into dollar delta per point; × 0.01·S rescales a 1-point move to a 1% move.
- **Zero gamma.**
  1. Build a spot grid from 0.8·S to 1.2·S.
  2. At each grid level, re-price every option's Black-Scholes gamma with **its own IV and tenor held fixed**.
  3. Sum the signed GEX at each level.
  4. Interpolate where the sign changes.
- **Other details.**
  - No expiry-window filter: all listed expiries are used.
  - "Ex-next-expiry" variants are shown only to expose how much comes from the nearest expiries.
  - OI is almost always yesterday's.

### Vanna and charm flows
- **Definitions.** Vanna = ∂Δ/∂σ = ∂Vega/∂S. Under Black-Scholes it is −e^(−qτ)·φ(d₁)·d₂/σ, the same for calls and puts, **per 1.00 of vol**. Multiply by 0.01 to get it per vol point. Charm = −∂Δ/∂τ, delta decay. Sources: <https://en.wikipedia.org/wiki/Greeks_(finance)>; practitioner write-ups at <https://systematicindividualinvestor.com/2020/11/05/how-to-vanna/>.
- **Flows into OPEX (a practitioner framework, secondary sources).** In quiet weeks, falling IV plus time decay shrink the delta of customer-held OTM puts. Dealers then buy back their hedges, which is the "vanna rally". After expiry the support rolls off. **We compute charm but do not score it.**

### 0DTE
- As τ→0, ATM gamma grows without bound while OTM gamma goes to 0. 0DTE gamma sits in a narrow band around spot and moves within the day.
- SPX 0DTE averaged 59% of SPX volume in 2025 (Cboe, <https://ir.cboe.com/news/news-details/2026/Cboe-Global-Markets-Reports-Trading-Volume-for-December-and-Full-Year-2025/default.aspx>).
- OI is published once a day after clearing, so **same-day opened-and-closed 0DTE never appears in OI-based GEX**.
- Evidence on direction is mixed. Amaya, Garcia-Ares, Pearson & Vasquez (2025, trade-signed SPX positions) find market-maker gamma is usually positive, with limited volatility impact: <https://cdn.cboe.com/resources/education/research_publications/gammasqueezes.pdf>. Dim, Eraker & Vilkov: <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4692190>.

### The dealer-positioning assumption
- Naive signs (calls +, puts −) fail in known ways:
  - Systematic put sellers leave dealers **long** puts.
  - Retail call-buying waves leave dealers **short** calls.
  - The HMA Quant critique is at <https://hmaquant.substack.com/p/gamma-exposure-how-dealer-hedging>.
- Fixing this needs trade-signed or origin-tagged volume, such as Cboe Open-Close (<https://datashop.cboe.com/cboe-options-open-close-volume-summary>). We do not have it.
- **Related literature:**
  - Ni, Pearson & Poteshman (2005): prices cluster at strikes on expiration (pinning). <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=519044>
  - Barbon & Buraschi, *Gamma Fragility*: negative dealer gamma goes with intraday momentum. <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3725454>
  - Baltussen et al. (2021): intraday momentum linked to short-gamma hedging. <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3760365>

### Single-stock gamma squeezes
- **Mechanics.** Customers buy calls, so dealers are short calls and buy stock as it rises. SpotGamma's GME account: <https://spotgamma.com/gme-gamma-squeeze/>.
- **SEC staff (2021).** Found GME call writing did not fit a squeeze. Baig, Strong & Zaynutdinova (2025, <https://afajof.org/management/viewp.php?n=183232>) argue a squeeze began in fall 2020.
- **Their screen.** Net delta OI above 7.5% of shares outstanding, sustained for 22 days. It produced 641 events from 2019 to 2023, with a +5.13% average next-month abnormal return.
- **Volume greater than OI.** Widely used as a sign of opening trades, but **we found no peer-reviewed validation of it as a squeeze signal**. We treat it as a heuristic.

---

## 2. Our formulas, units and signs

All per contract line, then summed.

| Quantity | Formula | Unit | Sign |
|---|---|---|---|
| GEX | Γ · OI · 100 · S² · 0.01 | $ of underlying dealers trade per **1% spot move** | +1 call, −1 put (naive-OI) |
| VEX | vanna · OI · 100 · S · 0.01 | $ per **1 IV point** (0.01 abs vol) | −(dealer vanna): **+ = dealers BUY as IV rises** (provides liquidity) |
| GEX+ | GEX + VEX | $ | additive only under our stated equivalence "1% spot move ≡ 1 IV point" (SqueezeMetrics uses a 10× point ratio instead; ours is per-1% on both axes) |
| DEX | sign · Δ · OI · 100 · S | $ dealer delta notional | dealers long calls / short puts |
| Charm | sign · ∂Δ/∂t · OI · 100 · S | $ per year of decay | same |

**Raw vs Δ-adjusted vs flow-signed.** Beside raw GEX, the exposures engine also ships a Δ-adjusted GEX (delta re-priced at spot ±1%: the hedge a real 1% move needs) and a flow-signed estimate (the Squeeze Radar re-sign), in the same unit, with levels under each (`snapshot.gammaMetrics`, cell `netGEXAdj` / `netGEXFlow`). Raw stays the headline. Definitions, vendor survey and a worked SPY example: `docs/GAMMA_RAW_VS_ADJUSTED.md`.

**Wire scaling.**
- Hub, scanner and CBOE-fallback snapshots carry `totalGEX` in **$B per 1%** and `totalVEX` in **$M per IV point**.
- Snapshot field `unitsVersion: 2` marks this.
- The rankings carry whole dollars.
- Every UI surface formats through `gex-colors.ts` (`fmtGexB`, `fmtVexM`, `fmtSignedUsd`) and prints the unit ("/1%", "/IV pt").

**Black-Scholes inputs.**
- The feed's gamma is used when present. Otherwise gamma is BS on the contract's own IV.
- Vanna and charm are always BS, because no feed supplies them.
- Rates: r = 4.5% in the hub path, r = 0 in the rankings and reference. The difference is below 5% on VEX (see §5).
- Expiry instant = 16:00 America/New_York. Contracts already past expiry are dropped, not floored to T≈0.
- **Missing IV.**
  - Totals use a flat 30% (`DEFAULT_IV`) and disclose the share as `ivFallbackShare`.
  - The zero-gamma sweep **excludes** those contracts and discloses the share of gross GEX left out as `profileExcludedGrossShare`.
  - On 2026-09-29, CBOE left 6.5% of SPY contracts with OI and 4.8% of BE's without IV.

**Expiry scope.**
- The **headline is every listed expiry, unweighted** (SqueezeMetrics / Perfiliev).
- Snapshots also carry `gexByScope`: `frontExpiry` (the nearest listed expiry, which is 0DTE in session) and `le7d`, in the same unit.
- Strike rows and the matrix show strikes within ±40% of spot. **Totals use the full ladder.**

---

## 3. Levels

| Level | Definition (ours) | Notes |
|---|---|---|
| **Zero-gamma** (`zeroGammaLevel`, wire alias `gammaFlipPrice`) | The spot S* where Σ sign·Γ_BS(S*)·OI·100·S*²·0.01 = 0. Every contract is re-priced on a 0.8–1.2·S grid (hub and fallback: 121 points; rankings: 81), then **bisected** 30× on each bracket. Reported is the crossing nearest spot. `null` means no crossing within ±20%. | Perfiliev / SpotGamma method. `gammaProfile` (41 points, $B per 1%) ships so the UI can draw it. |
| **Call wall** | Strike **above** spot with the largest call GEX $, summed over all expiries | SpotGamma's definition ("largest net call gamma"). We use gross call gamma because we have no netting. |
| **Put wall** | Strike **below** spot with the largest put GEX $, all expiries | |
| Call / put wall by OI (`callWallOI`, `putWallOI`) | Same, ranked by open interest | Shown as a secondary label. OI walls can sit on far collar strikes (SPY 2026-09-29: put wall by OI $500, 35% below spot). |
| Max-gamma strike | Largest \|net GEX\| strike | The pin candidate in positive gamma. `zeroGammaProjection` is a legacy wire field: max-gamma strike when net GEX > 0, else zero-gamma. The UI labels which one it is. |
| Vanna flip (`vannaFlipPrice`) | First sign change of cumulative per-strike VEX | **Estimate only.** Not re-priced. Not used in any score. |
| Vol Trigger, Hedge Wall, DIX | — | Not computed (proprietary / different data). |

---

## 4. Regime: positive vs negative gamma

One definition, `shared/gex-regime.ts#classifyGammaRegime`, used by the hub, the rankings, the scanner, the CBOE and Bullflow fallbacks, the snapshot service and the research chart.

- **balance** = net GEX / gross GEX ∈ [−1, 1]. It is dimensionless, so SPY and BE are judged on one scale.
- **Neutral** when |balance| < 5%.
- **Positive** when net GEX > 0: *"Dealers long gamma — they buy dips / sell rips (stabilising)"*.
- **Negative** when net GEX < 0: *"Dealers short gamma — they chase moves (amplifying)"*.
- **Near the flip** when spot is within 1% of the zero-gamma level.
  - Legacy enum value `transitioning`.
  - The sign still shows, with the words "near the flip".
- **Colour** (from `gex-colors.ts#regimeColor`): positive = accent blue #3b8cff, negative = vermilion #ff6b3d, neutral or near the flip = amber. Colour is never the only carrier: glyph (+γ / −γ / ±γ), words and sign are always printed.
- Spot's side of zero-gamma is reported, but it is never used to overrule the sign. Single-name profiles are not always "negative below, positive above".

**What changed from v1.** v1 had several competing definitions:
- the hub used |net| > $0.5B *or* concentration > 0.25;
- the CBOE fallback used |net| > $1B, so every single name read "neutral" (BE on 2026-09-29);
- Bullflow used ±$0.05B;
- the map panel used the sign of the 0–7 DTE sum while the hero used the snapshot;
- the ranked badge printed +γ for anything not negative, including neutral.

---

## 5. Audit (research/gex-audit.ts)

**Method.** One CBOE delayed chain per ticker, 2026-09-29 18:33 UTC, archived under `.cache/gex-chains/`.

- The **reference** is self-contained: its own BS, all contracts with OI, all live expiries, feed gamma.
- Each production path is fed the **identical payload** (fetch stubbed):
  - hub = `options-exposures` via the CBOE leg;
  - `gex-cboe-fallback`;
  - `gex-rankings`.
- Re-run with `npx tsx research/gex-audit.ts --offline SPY BE`.

### Reference values

| | SPY (spot 763.76) | BE (spot 293.96) |
|---|---|---|
| Net GEX $/1% (feed Γ) | −$10.122B | +$58.81M |
| Net GEX $/1% (BS Γ) | −$11.797B | +$57.90M |
| Gross GEX | $52.05B | $173.32M |
| Net VEX $/IV pt | −$6.388B | −$24.48M |
| Zero-gamma (spot grid) | **767.78** | **257.60** |
| Cumulative-strike "flip" (v1 method) | none found | 290.00 |
| Call wall (γ, above) / by OI | 785 / 800 | 300 / 300 |
| Put wall (γ, below) / by OI | 760 / 500 | 260 / 200 |

### Findings

1. **GEX formula Γ·OI·100·S²·0.01 per 1%.** Correct in all three paths: the 100 multiplier and 0.01 cancel, and every path writes Γ·OI·S². Correct.
2. **Expiry weighting (hub).** v1 multiplied each expiry by 1.0 / 0.7 / 0.45 / 0.2 by DTE. It also used only the first 30 expiries of the ±15% strike slice, and truncated totals at ±40%.
   - Results: SPY −$8.00B (−21% vs reference); BE +$33.1M (−44%); BE VEX −94%.
   - After those, a figure labelled "$ per 1%" was not $ per 1%.
   - **Wrong → fixed.** Weights removed, CBOE read in one full-chain call, totals over the full ladder.
   - v2: SPY −$10.154B (−0.3%), BE +$58.60M (−0.4%).
3. **VEX units (hub).** v1 was vanna·OI·100·S/1e6, labelled "$M per 1% vol". Since vanna is per 1.00 of vol, that is **per 100 vol points**, and it was also DTE-weighted.
   - **Wrong → fixed**: now $M per IV point.
   - Every downstream VEX threshold was divided by 100 so behaviour is preserved:
     - `vexRegime` ±150 → ±1.5;
     - scanner play-score and VEX-signal cut-offs 10 / 50 / 100 / 500 / 1000 → 0.1 / 0.5 / 1 / 5 / 10;
     - `scoreConfluence` VEX magnitude 500 → 5;
     - narrative 150 → 1.5.
   - v2 vs reference: SPY −4.3%, BE +2.5%. The residual comes from r = 4.5% in hub vanna and from contracts without IV getting the 30% default.
4. **VEX sign.** The v1 comment claimed GEX and VEX assumed opposite dealer books. In fact −sign·vanna **is** the dealer-long-calls/short-puts book in liquidity sign (+ = buys as IV rises), matching SqueezeMetrics. **Correct.** The comment is fixed.
5. **VEX in the CBOE fallback.** v1 used OI·vega·S·100, which is vega, not vanna, and is positive for every contract. It produced meaningless values: raw −74,694 for SPY, and +2,409 for BE, whose true VEX is negative.
   - **Wrong → fixed** with real BS vanna.
   - v2: SPY −$6.37B (+0.3%), BE −$24.47M (0.0%).
6. **Zero-gamma.**
   - v1 hub took the first, later the nearest, sign change of a **cumulative per-strike sum at today's spot**. It found **no level** for SPY and 270 for BE.
   - v1 fallback took the midpoint of the nearest strike-to-strike sign change: 765.50 for SPY.
   - v1 rankings computed none.
   - **Wrong → fixed** with spot-grid re-pricing in all three paths.
   - v2: SPY 766.96 hub / 767.70 fallback / 767.77 rankings vs 767.78 reference. BE 256.92 / 257.63 / 257.60 vs 257.60.
   - The hub's residual comes from r = 4.5% and its T convention.
7. **Walls.**
   - v1 hub ranked by OI (SPY 800 / 700).
   - v1 fallback took the largest *net* GEX, with an OI > 100 filter (SPY 785 / 761).
   - v1 rankings used gamma on the **nearest expiry without a side-of-spot rule**. SPY call wall came out **763** and put wall **764** around a 763.76 spot, both on the wrong side.
   - **Wrong → fixed**: one definition (§3) everywhere. v2: SPY 785 / 760 and BE 300 / 260 in all paths.
8. **Dealer flow per 1%.** `dealerFlowFromTotalGEX` treated $B-per-1% as "$B per full move" and multiplied by 0.01 again, so the main path was **100× low**. The cached SPY terminal payload read −$96.9M against totalGEX −$9.69B. The CBOE path was right. **Wrong → fixed.**
9. **Hub matrix display.** Cells are $B, but the hub formatted them as $M. SPY's 761 node (−$1.40B) printed "−$1.4M". **Wrong → fixed**; each metric is now formatted from its own unit.
10. **Weekly path.** `gexStrength = |totalGEX| / 5e9` divided a $B figure by 5e9, so the term was ≈ 0. **Wrong → fixed** (÷ 5, i.e. $5B per 1% = full strength).
11. **Expiry instant / expired contracts.** v1 used 16:00 *server* time: noon ET on a UTC droplet. Contracts that had already expired were floored to T = 0.001, so an expired ATM 0DTE contract got near-infinite gamma after the close. **Wrong → fixed** (16:00 ET; expired contracts dropped).
12. **Volume as an OI proxy.** v1 used volume where OI was 0. GEX is inventory; intraday round trips are not. **Changed**: OI only. Volume is still carried for vol/OI reads.
13. **Fabricated fields.**
    - `volatilityRegime` was hard-coded `'normal'` and shown as "Vol regime". **Removed**; that slot now shows net VEX.
    - The terminal's "chain source" printed the **spot-quote** provider. **Fixed** to the chain's source.
    - The research chart's "conf 100%" magnet line is **removed**.
14. **IV fallback share.** Hub v2 on SPY: 2.6% of contracts used the 30% default, and 13.5% had some greek computed by BS. It is disclosed per snapshot (`ivFallbackShare`, `bsComputedShare`, `profileExcludedGrossShare`). **Assumption, disclosed.**
15. **Feed Γ vs BS Γ.** SPY −$10.12B (feed) vs −$11.80B (BS at the same IV), a 17% gap concentrated in 0DTE, where CBOE's T/rate conventions differ. The headline uses feed Γ; the zero-gamma sweep uses BS Γ, as it must. **Assumption, disclosed.**

### The Bullflow gap (−$6.47B vs −$1.3B, SPY ~2:45 PM ET)

The same archived chain decomposes by scope and unit:

| scope | $ per 1% | $ per $1 |
|---|---|---|
| all listed expiries | −$10.12B | −$1.33B |
| front expiry (0DTE) | **−$1.32B** | −$0.17B |
| nearest 2 | −$3.78B | −$0.49B |
| ≤ 7 DTE | −$5.15B | −$0.67B |
| ≤ 30 DTE | −$9.03B | −$1.18B |

Top 0DTE strikes in $ per 1%: 764 **−$588.1M**, 762 **−$447.8M**, 763 **−$288.9M**.

Bullflow's chart showed −$1.3B net with 764 −$594.8M, 762 −$466.2M and 763 −$286.7M. That is a strike-by-strike match with **0DTE only, $ per 1%**. All expiries in $ per $1 also happens to total −$1.33B, but the per-strike figures rule that reading out.

Our −$6.47B was v1: DTE-weighted, first 30 expiries of a ±15% slice. So the gap was **expiry scope plus v1's weighting**. It was not the unit, the S² scaling, a double-counted multiplier, the sign convention or 0DTE handling.

**Adopted.**
- The headline stays **every listed expiry, $ per 1%**. Regime is a property of the whole book.
- The UI states the unit and scope next to it.
- The hub also prints `front expiry (0DTE)` and `≤7d` in the same unit, so it can be read against vendors that chart 0DTE only.

---

## 6. Magnet detector ("find more BE plays")

**Code:** `server/gex-magnet.ts`. It runs inside the rankings job and uses the same chain read.

**Criteria — all must hold:**
1. **Near expiry.** Contracts expiring in 0.75–10.5 calendar days. Same-day 0DTE is excluded: its OI is yesterday's and its ATM gamma is noise. If no expiry falls in that window, use the nearest one within 21 days.
2. **Location.** The call strike is 0.5–5% **above** spot; for the mirrored put, 0.5–5% **below**.
3. **Concentration.** That strike's call (put) gamma $ is ≥ 5% of gross near-expiry gamma **and** is a top-3 call (put) gamma strike.
4. **Fresh buying.**
   - Call (put) volume ÷ OI ≥ 1.5 at the strike.
   - Volume ≥ 500 contracts, OI ≥ 100.
   - Volume above OI means contracts were opened today. If customers bought them, dealers are **short** those options, so the naive + sign is wrong at that strike, which is the squeeze mechanism.
5. **Momentum.** Day change > 0 (put: < 0), meaning price is moving toward the strike.

**IV context** is scored but not required. It compares front ATM IV with the ATM IV of the expiry nearest 30 days (only when that expiry is within ±15 days of 30).

**Score (0–100):**
- concentration 30 × min(share / 20%, 1)
- vol/OI 25 × min(vol/OI ÷ 5, 1)
- proximity 15 × (1 − (dist − 0.5) / 4.5)
- momentum 15 × min(|chg| / 3%, 1)
- IV term 10 × min((front/30d − 1) / 0.3, 1)
- top strike 5

The weights are judgment, not fitted. **The score orders setups; it is not a probability.**

**BE on 2026-09-29 (archived chain).**
- Setup: call **300**, exp 2026-10-02 (3.1 days), score **61**.
- 11.5% of near-expiry gamma; the #1 call strike.
- Volume 11,060 vs OI 4,709 = 2.3×.
- Strike +2.1% above spot; stock +11.8% on the day.
- Front ATM IV 92% vs ~30-day 87% (1.06×).
- SPY on the same read: **no setup**. The v1 "magnet" 765 (+0.16%, 0DTE) now fails the 0.5% and 0DTE rules.

**Actions** (`server/gex-magnet-actions.ts`), all in cash hours only:
- Every setup is archived to `.cache/gex-magnet/setups-YYYY-MM-DD.jsonl`.
- Setups scoring ≥ 60 and fresh:
  - **Discord**: `DISCORD_WEBHOOK_ORACLE_SIGNALS` via `postDiscordWebhook`. Deduped per ticker/side/strike/ET day (persisted), at most 5 per cycle.
  - **Trade idea**: written through `storage.createTradeIdea`, the entry point `gex_scanner` uses, so the shared validation gate and spine dedup apply unchanged. Fields:
    - `source='gex_magnet'`, option leg = the magnet contract;
    - levels in underlying space: entry = spot, target = strike, stop = half the distance (R:R 2);
    - `confidenceScore = min(70, score)` with the quality signal `score_uncalibrated`.

**Backtest** (`research/gex-magnet-backtest.ts`).
- **What it replays:**
  - archived raw chains (full detector replay);
  - live-archive detections (outcome only).
- **Outcome:** trade-through of the strike on sessions **after** the detection day, up to expiry, from Yahoo daily bars. The detection day is excluded because a daily bar cannot order the high against the detection time.
- **What it cannot use:** `gex_snapshots` stores per-cell GEX/VEX but no volume or OI, so the detector cannot be replayed from it. Rows before 2026-09-29 are also in v1 units.
- **Sample on 2026-09-29:** 2 archived chains, 1 detection (BE 300C). BE traded through 300 on the detection day itself, which is not counted; the setup is open until 10-02. **n = 0 resolved.**
- **No edge is claimed.** It needs n ≥ 30 resolved detections **and** a base rate: how often any strike 0.5–5% away trades through within the same tenor.

---

## 7. Data sources

| Source | Use | Caveats |
|---|---|---|
| **Alpaca options** (primary; `server/alpaca-options.ts`) | Snapshots: greeks, IV, quote, daily volume. Contracts endpoint: OI. Stock snapshot (IEX): spot. | **`feed=indicative` is not the consolidated OPRA tape.** Real-time OPRA needs Alpaca's paid options data plan. OI lags 1–2 sessions and its date is stamped on every payload (`openInterestDate`). Equity/ETF options only (SPX goes to CBOE). Coverage: expiries ≤ 180 days, strikes ±40%. A process-wide serial queue at ≥ 330 ms spacing (≤ ~180 of the free tier's 200 req/min), a 60 s park on a 429, and 90 s / 15 min chain caches. |
| **CBOE delayed quotes** | Second leg; SPX; the audit | About 15 min delayed. It 429s bursts, so all callers share one `cboe` queue (≥ 1.5 s spacing for rankings, ≥ 0.5 s for the fallback). OI is prior-day and undated. |
| Yahoo, Tradier, Schwab, Massive | Later legs | Yahoo 429s. The Tradier token is rejected (kept last). Schwab and Massive only when configured or entitled. |
| Bullflow | Screener universe (options-volume leaders), a GEX fallback leg | Vendor GEX with an undocumented unit: only its sign and balance are used. |

**Freshness.** Every snapshot carries its chain fetch time, age and feed. Rankings rows carry `fetchedAt`, `ageSec`, `stale`, source and OI date. Rows restored from disk keep their real age. Nothing is presented as live when it is not.

---

## 8. Assumptions and limits

- **Dealer sign is assumed**, not observed (naive-OI). Where volume exceeds OI, the sign at that strike is likely inverted. The detector leans on exactly that.
- **OI is yesterday's.** Intraday 0DTE inventory is invisible.
- **IV is held fixed** in the zero-gamma sweep; there is no sticky-delta or skew dynamics.
- **GEX+ adds unlike shocks** (1% spot vs 1 vol point) by assumption.
- **Charm is computed but unscored.** The vanna flip is a cumulative estimate.
- **Downstream behaviour changed.** The regime, the walls, the VEX units (with thresholds rescaled) and dealer flow all feed the scanner and conviction GEX layer. v2 changes their inputs:
  - more single names now classify positive or negative instead of neutral;
  - put walls sit closer to spot.
  - The conviction engine itself is unchanged; its owner should re-baseline.

## 9. Open items

- Replace naive signs with flow-inferred dealer positioning (Bullflow prints or Open-Close data) at least at the magnet strike.
  - Partial step shipped: the Squeeze Radar (`docs/GAMMA_SQUEEZE.md`) reports a turnover-weighted customer-long re-sign of near-dated OTM calls beside the naive book, and uses OCC customer-account call volume as a history-capable proxy.
- Accumulate the live setup archive and add a base-rate comparison before any score threshold is tuned.
- `gex-vex-projector.ts`: uses absolute $0.5B thresholds. Move it onto `shared/gex-regime.ts`.
- Resolved 2026-09-30: `market-pulse.ts` no longer computes its wall-midpoint "flip" (the `gexLevels` field had no reader and was removed), and `gex-dte-buckets` no longer returns per-bucket flips (`gammaFlipPrice: null`). Remaining side implementations are ranked in `docs/SIMPLIFY_TODO.md`.
- `gex_snapshots` has no units column, so rows need a v1/v2 boundary (2026-09-29) before any history study.
