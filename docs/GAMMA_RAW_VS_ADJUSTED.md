# Raw vs Δ-adjusted gamma — what each number means, and what QuantEdge shows

Status: v1, 2026-09-30, branch `feat/gammaadj`.

- Math: `shared/gex-math.ts` (`deltaAdjGexPer1Pct`, `deltaMoveSplit`, the `delta1pct` profile kernel) and `shared/gex-adjusted.ts` (definitions, flow re-sign rule, levels, the Quantinum summary).
- Engine: `server/options-exposures.ts` → `snapshot.gammaMetrics`, plus `netGEXAdj` / `netGEXFlow` on every strike row and matrix cell.
- Tests: `scripts/test-gamma-adjusted.ts` (`npm run -s test:gamma-adjusted`).
- Worked example: `research/gamma-raw-vs-adjusted.ts <saved CBOE chain>`.

Companion to `docs/GEX_VEX_METHODOLOGY.md` (units, zero-gamma method, regime) and `docs/GAMMA_SQUEEZE.md` (the flow re-sign). Quotes are kept under 15 words. Everything else is paraphrased, with the source linked.

---

## 1. Short answer

- **"Delta-adjusted gamma" is not a standard term.** No vendor we could read publishes a formula under that name. The standard "delta-adjusted" quantity is **delta-adjusted open interest (DAOI)** and its dollar form, **delta exposure (DEX)**. Those measure the hedge already on the books, not how it changes.
- **What actually estimates dealer hedging flow** for a real move is the change in delta across that move: Δ(S + move) − Δ(S), per contract, times OI and the multiplier. Raw GEX (Γ·OI·100·S²·0.01) is only the first term of that change.
- The two agree for weekly and monthly expiries. They part ways where gamma is peaked, which is **0DTE near spot**. On the SPY chain below, raw GEX overstates the at-the-money 0DTE strike by 2.7× and understates the strike 0.5% away.
- **QuantEdge now ships three columns** under the same unit ($ per 1% move) and the same dealer sign: **Raw | Δ-adjusted | Flow-signed estimate**. Raw stays the headline. The GEX workspace has a **Raw | Δ-adj | Side by side** toggle. Levels are computed under each definition and flagged when they differ.

---

## 2. Definitions

Notation, per option line:
- Γ = gamma per share (∂Δ/∂S), Δ = delta per share.
- OI = open interest in contracts; 100 = contract multiplier; S = spot.
- sign = +1 for a line the dealer is long, −1 for a line the dealer is short.

Dealer hedge. A dealer long *n* contracts holds −n·100·Δ shares to stay flat. When spot moves from S to S′, it must trade

> **hedge trade = −n·100·[Δ(S′) − Δ(S)]** shares

(sell when its options' delta rises, buy when it falls). Everything below is an approximation of, or a view of, this one quantity.

### (a) Raw gamma exposure (share gamma and notional)

- **Share gamma**: Γ·OI·100. The number of shares the hedge changes by for a **$1** move. SqueezeMetrics' 2016 paper sums this with calls + and puts − and reports it in shares, or dollars for SPX, **per 1 point**. Source: <https://squeezemetrics.com/monitor/download/pdf/white_paper.pdf>.
- **Gamma notional per $1**: Γ·OI·100·S. The same change in dollars.
- SpotGamma's help pages describe "gamma notional" as call gamma minus put gamma, and quote it as the notional dealers trade per index point. Source: <https://support.spotgamma.com/hc/en-us/articles/15413312933011-Gamma-Notional>.

### (b) Dollar gamma / GEX per 1%

- **GEX per 1%** = Γ·OI·100·S²·0.01 = share gamma × (1% of S) × S.
- This is our headline, Perfiliev's formula, and SpotGamma's "per 1% move" convention. Sources: <https://perfiliev.com/blog/how-to-calculate-gamma-exposure-and-zero-gamma-level/>, <https://spotgamma.com/gamma-exposure-gex/>.
- It is exact only for an **infinitesimal** move, scaled up to 1%. It is the first term of the Taylor expansion of Δ(S·1.01) − Δ(S).

### (c) "Delta-adjusted" variants as the industry uses the words

| Variant | Formula (per line) | What it measures | Where it is used |
|---|---|---|---|
| **Delta-adjusted OI (DAOI)**, "future-equivalent OI" | Δ·OI·100 shares | The **level** of the hedge already on (shares of underlying the options are equivalent to) | Exchanges and brokers. Indian F&O position limits now use a delta-based OI; Interactive Brokers shows delta-adjusted OI split into bullish and bearish buckets. Sources: <https://zerodha.com/z-connect/updates/understanding-the-new-delta-oi-based-mwpl-framework>, <https://www.interactivebrokers.com/campus/ibkr-quant-news/options-indicators/> |
| **DEX (delta exposure)** | sign·Δ·OI·100·S | DAOI in dollars, dealer-signed | MenthorQ, FlashAlpha, Unusual Whales, TradingFlow. FlashAlpha writes it as Σ Δ·OI·100·S·sign (their default sign assumes customers buy both calls and puts). Sources: <https://flashalpha.com/articles/delta-exposure-dex-explained-dealer-positioning>, <https://menthorq.com/guide/are-gex-and-dex-the-same-thing/> |
| **Gamma weighted by \|Δ\|** | Γ·\|Δ\|·OI·… | Down-weights OTM strikes | We found **no vendor publishing this**. It is in forum and indicator code. It has no hedging interpretation: Γ·Δ is not a sensitivity of anything dealers trade, and it counts deep ITM lines (Δ≈1) at full weight while their gamma is ≈0. **Rejected.** |
| **Gamma weighted by moneyness probability** | Γ·N(d₂)·OI·… | "Probability the strike matters" | Same problem: it mixes a risk-neutral probability into a hedge sensitivity. Nothing it produces is a trade size. **Rejected.** |
| **(d) Δ-adjusted GEX, finite move (ours)** | sign·OI·100·S·[Δ(S·1.01) − Δ(S·0.99)]/2 | The hedge actually traded for a ±1% move, averaged over the two directions | The gamma-flow number with delta re-priced. It is the exact form of what (b) approximates. |

**Vendors, what we could verify** (all accessed 2026-09-30):

- **SpotGamma.** Ships a **Key Gamma Strike** (largest combined gamma) and a separate **Key Delta Strike** (largest delta), and a "Delta Model" of expected hedging along a price path. Their help pages for these returned 403 to us; the definitions come from search-result snippets and <https://spotgamma.com/options-key-levels-explained/>. Positions are **modelled**, not raw OI. SpotGamma therefore treats gamma and delta as two different level families, not one "delta-adjusted gamma".
- **Unusual Whales.** Lists four GEX methods: OI-based (calls long / puts short), intraday volume, volume with **bid/ask side attribution** ("directionalized"), and Cboe market-maker data for SPX. It does not publish formulas. Source: <https://unusualwhales.substack.com/p/an-overview-of-gamma-exposure-and>. Their "adjusted" means **sign-adjusted by trade side**, not delta-adjusted.
- **Skylit (Heatseeker; the @Glitch_Trades benchmark).** Documents GEX and VEX as "dollar value" per strike × expiry, colour-scaled, with the largest node starred ("King node"). Its FAQ says its assistant will not explain how exposure is calculated. Sources: <https://www.skylit.ai/docs/faqs>, <https://www.skylit.ai/learn/support-resistance-gex>. Nothing public says it is delta-adjusted.
- **ITMatrix.** Offers the matrix in **shares or dollars** with walls and flip marks. No delta-adjustment is described. Source: <https://itmatrixhq.com/>.
- **MenthorQ.** Net GEX (call minus put gamma) and Net DEX, and "GEX levels" ranked by net GEX and DEX inside the 1-day expected move. No formula for a combined metric. Source: <https://menthorq.com/guide/key-levels-and-key-terms/>.
- **Tier1Alpha.** We found no public methodology document. We make no claim about what it computes.

**Conclusion.** When a vendor or a trader says "delta-adjusted", it means one of three things: DAOI/DEX (hedge level), a **trade-side** adjustment of the sign (Unusual Whales, SqueezeMetrics' DDOI), or loosely "gamma that accounts for how delta really moves". Only the third is a gamma number, and (d) is its exact form.

---

## 3. Which one estimates dealer hedging flow

### 3.1 The expansion

For one line the dealer is long, over a move dS, a time step dt and an IV change dσ:

> dΔ = Γ·dS + ½·(∂Γ/∂S)·dS² + (∂Δ/∂t)·dt + vanna·dσ + …

The hedge trade is −n·100·dΔ. Then:

- **Raw GEX** keeps only Γ·dS. It is exact as dS → 0.
- **Δ-adjusted (d)** keeps **every** spot term (Γ, speed and higher) by re-pricing Δ at S ± 1%, holding IV and time fixed.
- **Charm** is (∂Δ/∂t)·dt: delta drift with no price move. It is large for 0DTE into the close.
- **Vanna** is vanna·dσ: delta drift from an IV change. Spot and IV usually move together (IV up as spot falls for indices), so the realistic flow on a 1% drop is roughly *Δ-adjusted(down) + vanna × the IV rise that comes with it*.

We compute charm and VEX already (`GEX_VEX_METHODOLOGY.md` §2). They are **not** folded into the Δ-adjusted column, because doing so needs an assumed dσ/dS and an assumed horizon. Both would be judgment, not measurement.

### 3.2 Why (d) and not DEX

- DEX is the hedge **already held**. Deep ITM calls dominate it (Δ≈1), and they generate no new flow as spot moves.
- The operator's question is "where will dealer hedging push or hold price", which is **flow**, i.e. the change in hedge. That is gamma's job, and (d) is gamma's exact finite-move form.
- DEX stays available on the wire (`totalDEX`, per-strike `netDEX`). SpotGamma's separate "Key Delta Strike" shows it answers a different question.

### 3.3 Why (d) matters most at 0DTE

- A 0DTE option's delta goes from ≈0 to ≈1 across a band of about ±2–3 standard deviations. With four hours left and 13% IV that band is about ±0.5% of SPY.
- At the money, raw Γ times a 1% move implies delta moves by **more than 1**, which is impossible. The re-priced change caps at 1, so (d) is smaller.
- Just out of the money, gamma at today's spot is small, but a 1% move carries spot **through** the strike, so the real delta change is large. (d) is larger.
- For expiries beyond about a week, Γ is nearly constant over ±1%, and (d) ≈ raw within 1%.

### 3.4 Sign assumptions

All three columns use the **naive-OI** dealer sign unless stated: dealers long calls (+), short puts (−) (SqueezeMetrics 2016). This is an assumption, and it fails in known ways (`GEX_VEX_METHODOLOGY.md` §8).

- Δ-adjusted changes the **magnitude** model, not the sign.
- **Flow-signed** changes the **sign** for one slice. At near-dated (0.75–21 d) OTM (+2–25%) calls, a fraction w = min(1, volume ÷ OI) of OI is re-signed dealer-short. This is the Squeeze Radar rule (`GAMMA_SQUEEZE.md` §1.2).
- Proper signing needs trade-side data (Cboe Open-Close, a vendor's aggressor tape). We do not have it.

### 3.5 One-sided moves

Raw GEX implies the hedge for +1% and −1% is equal and opposite. With (d) they are not, and the difference is information:

- `moveUp` = Σ sign·[Δ(S·1.01) − Δ(S)]·OI·100·S. The dealer hedge on a 1% rally is **−moveUp**.
- `moveDown` = Σ sign·[Δ(S) − Δ(S·0.99)]·OI·100·S. The dealer hedge on a 1% drop is **+moveDown**.
- Positive means dealers buy; negative means they sell.

---

## 4. Worked example — SPY, CBOE delayed chain, 2026-09-30 11:46 ET

**Setup.**
- Spot 764.59; 10,019 contracts with OI.
- Re-run: save the chain, then `npx tsx research/gamma-raw-vs-adjusted.ts <chain.json> SPY`. The chain is archived locally under `.cache/gex-chains/SPY/` (gitignored).
- Black-Scholes on each line's own IV, r = 4.5%, 0DTE at 0.18 days (4.2 h) to the 16:00 ET expiry.

### 4.1 One strike, four contracts (calls)

| Line | Γ | Δ(S·0.99) → Δ → Δ(S·1.01) | Raw GEX $/1% | Δ-adj $/1% | ratio | Up 1% / Down 1% | DEX (Δ·OI·100·S) |
|---|---|---|---|---|---|---|---|
| **765 C 0DTE** (OI 15,653, IV 13.2%) | 0.1776 | 0.000 → 0.430 → 0.999 | **$1,625M** | **$598M** | **0.37** | $682M / $515M | $515M |
| 768 C 0DTE (+0.4%, OI 12,144, IV 12.8%) | 0.0537 | 0.000 → 0.058 → 0.975 | $382M | $453M | 1.19 | $852M / $54M | $54M |
| 776 C 0DTE (+1.5%, OI 3,046) | 2.2e-6 | 0.000 → 0.000 → 0.060 | $0.0M | $7.0M | — | $14M / $0M | $0M |
| 765 C 30 DTE (OI 1,978, IV 13.4%) | 0.0134 | 0.437 → 0.540 → 0.640 | $15.5M | $15.4M | 0.99 | $15.1M / $15.6M | $82M |

**Arithmetic for the 765 0DTE line.**
- Share gamma = Γ·OI·100 = 0.1776 × 15,653 × 100 ≈ 278,000 shares per $1.
- **Raw GEX** = 278,000 × (1% × 764.59 = $7.65) × $764.59 ≈ **$1.63B** per 1%. That says the hedge changes by about 2.13M shares, which implies delta moves by 2.13M ÷ 1.565M ≈ **1.36 per contract**. A call's delta cannot move by more than 1.
- **Δ-adjusted** = 15,653 × 100 × 764.59 × (0.999 − 0.000)/2 ≈ **$598M** per 1%. That is the whole 0 → 1 delta swing across ±1%, averaged over the two directions.
- **DAOI** = 0.430 × 1,565,300 ≈ 673,000 shares already hedged. **DEX** ≈ $515M. This is the level of the hedge, a different quantity.

**Arithmetic for the 768 0DTE line.**
- Raw GEX sees little gamma at today's spot ($382M).
- A 1% rally carries spot through 768: delta goes 0.058 → 0.975, so the up-move hedge is **$852M**, 2.2× raw.
- A 1% drop moves delta only 0.058 → 0.000, so the down-move hedge is **$54M**, 0.14× raw.
- Raw GEX's single number describes neither direction.

### 4.2 The whole book (all listed expiries, $ per 1%)

| | Raw | Δ-adjusted | Flow-signed (estimate) |
|---|---|---|---|
| Net | **−$5.40B** | **−$4.92B** | **−$8.43B** |
| Gross | $52.5B | $50.6B | $52.5B |
| Balance (net/gross) | −10.3% | −9.7% | −16.1% |
| Zero-γ (re-priced) | **766.21** | **767.17** | **768.12** |
| Call wall / put wall | 770 / 760 | 770 / 760 | 770 / 760 |
| Max-γ strike (all expiries) | 745 | 745 | 745 |
| King node (largest cell) | 761, 0DTE, −$0.94B | 761, 0DTE, −$1.06B | 761, 0DTE |
| Top-5 key strikes | 745, 785, 760, 755, 750 | 745, 760, 785, 755, **761** | 745, 760, 755, 750, 761 |

**One-sided dealer hedge (Δ-adjusted):**
- Rally 1% → dealers **sell $3.6B**.
- Drop 1% → dealers **sell $13.5B**.
- The raw −$5.4B "per 1%" hides a 3.7× asymmetry. Most of the downside comes from 0DTE puts at 761 / 760 / 755 that a 1% drop runs straight through.

**Flow-signed estimate.** 2.9% of gross gamma was re-signed dealer-short (opened near-dated OTM calls). That pushes zero-γ up by $1.91.

### 4.3 How the key-strike ranking changes — front expiry (0DTE)

| Rank | Raw | Δ-adjusted |
|---|---|---|
| 1 | 761 −$0.94B | 761 −$1.06B |
| 2 | 766 +$0.47B | **760 −$0.54B** |
| 3 | 760 −$0.45B | 766 +$0.42B |
| 4 | 768 +$0.36B | 768 +$0.37B |
| 5 | 755 −$0.30B | **770 +$0.33B** |
| 6 | 770 +$0.27B | 769 +$0.24B |
| 7 | 767 +$0.23B | 755 −$0.23B |
| 8 | 769 +$0.21B | 767 +$0.22B |

**Reading.**
- Δ-adjusted takes weight **from 766 and 767** (nearest spot, where linear Γ overstates) and **from 755** (beyond a 1% move). It adds weight **to 760, 769 and 770**, 0.6–0.7% from spot: the strikes a 1% move actually crosses.
- The king node is unchanged on this read, but its size grows by 13%.
- On a synthetic book in `scripts/test-gamma-adjusted.ts` (ATM 0DTE with heavier OI one half-strike away), the king node moves from the ATM strike to the neighbour. That is the case the side-by-side view exists to show.

---

## 5. Recommendation — what QuantEdge shows

**Ship all three, side by side, one unit, raw as the headline.**

| Column | Why it is there | What it is not |
|---|---|---|
| **Raw GEX** | Industry standard. Comparable to SqueezeMetrics, SpotGamma, Perfiliev, Bullflow and our own audit (`GEX_VEX_METHODOLOGY.md` §5). Keeps every existing level, regime and threshold stable. | A trade size for a real 1% move at 0DTE. |
| **Δ-adjusted** | The best available estimate of the hedge a 1% move triggers, with delta re-priced at both ends. It also gives the up/down asymmetry. | A different sign model. It uses the same naive-OI sign. |
| **Flow-signed estimate** | Shows how much the map changes if today's opened OTM calls were customer buys (the squeeze case). | An observation. OI has no side; this is an assumption, labelled as one. |

**Where each appears:**
- **GEX workspace (matrix tool).** Metric GEX adds a **Raw | Δ-adj | Side by side** toggle (URL `g.gamma=raw|adj|both`).
  - *Side by side* = two narrow columns per expiry, raw then Δ-adjusted. Each half has its own colour scale and its own ★ / ② ranks.
  - The Σ column shows both.
  - The hover card shows both values and their ratio.
- **Dealer-map ladder.** Same toggle. *Side by side* draws the Δ-adjusted bar under the raw bar on one scale, with both values.
- **Phone.** Raw | Δ-adj only (no side by side), on the matrix page and the matrix tool.
- **Level notes.** Whenever the view is not raw, a strip lists call wall, put wall, max-γ, king node and zero-γ under raw → Δ-adjusted. It marks each one that **moves** (amber text plus the word "moves"), gives key-strike overlap, the flow-signed zero-γ, and the one-sided hedge ("rally 1% → dealers sell $3.6B · drop 1% → dealers sell $13.5B").
- **Quantinum.** A 0-point context layer, "Dealer gamma · raw vs Δ-adjusted": regime under each definition, which levels differ, key-strike overlap and the one-sided hedge. `GET /api/quantinum/:symbol` also returns a structured `gexCompare`. The ticker page's Evidence section renders it as a table. Conviction scoring is unchanged: **no replay has shown either variant predicts better than raw.**

**Palette.** Sign stays the CVD-safe blue (+) / orange (−) pair. Δ-adjusted is marked by position (right half, lower bar), a dotted underline and a "Δ" tag, never by a third hue. The king node keeps its ★ and amber highlight.

---

## 6. Limitations (honest)

1. **Black-Scholes delta, IV held.** Δ-adjusted re-prices delta with each line's IV fixed (sticky-strike). Under sticky-delta or with skew dynamics, a 1% drop in an index raises IV, which raises put deltas further. Our number is then a **lower bound** on downside flow. Vanna is the correction, and we do not fold it in (§3.1).
2. **Feed Γ vs BS Δ.** Raw uses feed gamma where the feed supplies it; Δ-adjusted is BS throughout, because no feed gives delta at hypothetical spots. At 0DTE the feed and BS conventions differ; on the 2026-09-29 audit, feed and BS gamma differed by 17% on SPY (`GEX_VEX_METHODOLOGY.md` §5, finding 15). Part of any raw-vs-adjusted gap at 0DTE is this convention gap, not the finite-move effect. Lines with defaulted IV (30%) enter both, and are excluded from every zero-γ sweep (disclosed as `profileExcludedGrossShare`).
3. **±1% is a choice.** A 0.5% or 2% move gives a different Δ-adjusted number. We chose 1% to keep the same unit as raw GEX. The one-sided values are the honest way to show the move-size effect.
4. **OI is yesterday's.** Same-day 0DTE opens and closes are invisible to every column here. The 0DTE rows describe the overnight book.
5. **Flow-signed is a rule, not data.** w = vol ÷ OI treats all of today's volume at a near-dated OTM call as customer buying. Closing trades, dealer-to-dealer and customer selling all count as buying under this rule.
6. **No predictive claim.** Nothing here has been replayed against outcomes. Δ-adjusted is a better **estimate of hedge size**. Whether its levels hold price better than raw levels is an open, testable question. The hourly archiver (`server/gex-history-archiver.ts`) stores `strikeExpiryMatrix` as-is, so from this deploy its cells carry `netGEXAdj` / `netGEXFlow` beside `netGEX`. Adjusted **levels** are not archived as columns yet; they can be rebuilt from those cells, except zero-γ, which needs per-contract IV.
7. **Coverage.** The CBOE-fallback path of `/api/gex-vex/terminal` (used only when the aggregate cascade fails) does not carry the comparison. The UI then shows raw only and says why.

---

## 7. What shipped (API)

`GET /api/gex-vex/terminal/:symbol` (the canonical GEX endpoint every GEX tool shares):

- `strikeExpiryMatrix[]`: each cell adds `netGEXAdj` and `netGEXFlow` ($B per 1%). Same units as `netGEX`.
- `snapshot.gammaMetrics`:
  - `version`, `unit: '$B per 1% move'`, `defs` (label, formula, unit and meaning of each metric).
  - `raw`, `deltaAdjusted`, `flowSigned`, each with `{ net, gross, balance, levels }`.
    - `levels` = `{ callWall, putWall, maxGammaStrike, kingNode, zeroGamma, keyStrikes[5] }`.
    - `deltaAdjusted` also carries `moveUp` / `moveDown`.
    - `flowSigned` also carries `resignedGross` / `resignedShare`.
  - `differs.deltaAdjusted` / `differs.flowSigned`: which levels move.
  - `keyStrikeOverlap`, and `notes`.
- `raw.levels` reproduces the headline `callWall`, `putWall`, `maxGammaStrike` and `zeroGammaLevel` exactly (tested).
- Cost: same chain parse, **no extra provider call**. About +70 ms of CPU on an 8,000-contract chain: two extra 61-point re-priced sweeps plus three normal-CDF calls per contract.

`GET /api/quantinum/:symbol`: `gexCompare` (rows per metric with regime, balance, walls, zero-γ, king node, key strikes; `changes`; `regimeAgrees`; `hedgeOnRally1Pct` / `hedgeOnDrop1Pct`; `read`), and the 0-point layer `gex-adjusted`.

**Tests** (`scripts/test-gamma-adjusted.ts`, synthetic chains only):
- **Formula checks.**
  - Δ-adjusted ≈ raw for long-dated lines.
  - Δ-adjusted → raw as the move shrinks.
  - Call/put symmetry.
  - The 0DTE ATM overstatement and the near-OTM understatement.
  - The ≤ 0.5·OI·100·S bound.
- **Book checks.**
  - Up/down average.
  - The zero-γ kernel sign and agreement.
  - The flow re-sign window and weight.
  - Raw block = headline.
  - Strike and cell sums = book.
  - Per-cell value = formula (r = 4.5%).
  - King-node move on a 0DTE pair.
  - Flow-signed arithmetic, and no-volume ⇒ flow = raw.
- **Summary checks.**
  - Summary text and hedge-trade signs (dealers long calls sell rallies; short puts chase).
  - Zero-γ tolerance.
  - Cost bound.
