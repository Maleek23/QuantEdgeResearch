# QuantEdge Terminal — MomoEdge teardown & rebuild spec

Screen-by-screen analysis of the MomoEdge terminal (5 tabs) as a **systems engineer**
(cohesion/architecture) and a **UI/UX designer** (why it's pleasing), then the specific
gaps vs QuantEdge and what to rebuild. Companion to `BLUEPRINT.md` + `AUDIT.md`.

---

## Why it feels cohesive — the invariants (this is the whole trick)
MomoEdge repeats the **same skeleton on every tab**. Cohesion isn't 5 pretty pages; it's
one grammar applied 5 times:

1. **One persistent chrome** — top bar `MOMOEDGE // LIVE ORACLE TERMINAL` + `● STATUS ENGAGED`
   + the **5 tabs** (ORACLE · FLOW · HEATMAP · GEX · PRISM) + a per-tab **GUIDE** button +
   notifications/settings/profile. Footer: `● ORACLE ONLINE · UPTIME 00:37:46`. Always there.
2. **One layout grammar** — every tab = **working surface (left/center) + a right CONTEXT panel
   that _interprets_**. GEX: *"saturated positive γ — expect drift, not pinning."* PRISM:
   *"call-dominant, dealer hedging dampens moves — mean-reversion between levels."* **The
   interpretation is the product.** Data is table stakes; the sentence is the edge.
3. **One color language** — cyan accent; green/red = bull/bear; in GEX/PRISM **gold = focus
   cell (leads the board), cyan = largest single value**; regime tints (green/amber/red).
4. **One type system** — monospace for every number/label, clean sans for prose.
5. **One motion** — the Oracle orb pulses, the uptime ticks, transitions are uniform.
6. **A GUIDE on every tab** + a built-in tutor ("Momo") — learning is in-context, not a manual.

**QuantEdge is the inverse:** 6 shells, ~120 routes, 763 endpoints, inconsistent tokens, no
shared motion, and it shows *data without the interpreting sentence*. Same substance, no grammar.

---

## Tab teardown — the specific components (what to match)

### 1 · ORACLE  (≈ QuantEdge Home + Hunt)
- **Oracle Sphere** — central pulsing orb: regime (NEUTRAL / RISK-ON), `AVG CONFIDENCE 61.9%`,
  `SIGNALS ACTIVE 4`, `STATUS ENGAGED`, live `STREAM: MSFT`.
- **Macro regime popover** — EQUITIES · BONDS · DOLLAR INDEX · METALS · RISK APPETITE · CRYPTO,
  each NEUTRAL/BULLISH/BEARISH; `17% BULL · 17% BEAR` breadth.
- **3-column dashboard:**
  - *Alert Stream (left):* NEW / BEST / CONVICTION toggle; signal rows w/ P&L, T1, HOLD, mini-bar.
  - *Analysis (center):* the **price ladder** — `STOP $360 · ENTRY $393 · LIVE $383.96 · T1 $430 · T2 $475`
    each with **% and $ and "away"** distance; a chart; **WHAT TO DO NOW**; live signal brief.
  - *Confidence Index (right):* setup score gauge (`72`); **SIGNAL COMPONENTS bars** —
    VALIDITY / PROGRESS / PACE / OVERLAY; **TRADE GEOMETRY** — stop-loss & T1 distance "away".
- **Alert Preferences modal** — per-alert-type channel matrix (Push · Sound · In-app · SMS · Email),
  presets (Focused), **Quiet Hours**, alert types incl. New signal / Trigger confirmed / Target hit /
  Danger zone / Invalidation / Whale / Score 90+.

### 2 · FLOW  (≈ options-flow-scanner)
- **Flow Drift · 5D** line per ticker: `Bull $13.2M · Bear $33.9M · Net −$20.7M`.
- **Flow Breakdown** — Total premium · # contracts · Avg premium · Direction · Sweep % ·
  Order type (Cluster/Ladder) · OI · Volume · Size/OI · Size/Vol · IV · Pattern.
- **735 signals** list + search; **watchlist w/ live prices** (TSM +1.30%, MU +2.07%).

### 3 · HEATMAP  (≈ market-scanner / heatmap)
- **Sector treemap** — every sector block, ticker cells **sized by cap, colored by change**;
  PRICE / FLOW / **MAP** / TABLE views; CAP / EQUAL weighting; `1D 1W 1M YTD`; breadth bar +
  `SPY −0.42%`; per-sector % headers; `Showing Wed Jul 8 close`.
- **Table view** — Ticker · Name · Industry · Cap · Price · **Chg% · RS** · Vol.
- **Ticker detail bar** — Price · Change · Mkt Cap · Volume (x avg) · **RS** · Bear/Bull ·
  Flow Intensity · Sweeps · Whales · Unusual.

### 4 · GEX  (≈ gamma-exposure)
- **GEX Terminal** — Net GEX · Call Wall · HVL · Put Support · P/C ratio · Call OI · Put OI.
- **Strike bars** — positive/negative GEX, per-strike, labeled `TRIGGER · WALL · MAGNET · Γ FLIP`;
  hover tooltip: Net GEX, Call/Put OI, Call/Put Γ per strike.
- **Right regime panel** — market state (**DRIFT / TRANSITION**) + a *sentence*
  ("passive positioning — expect drift, not pinning"); **structural range** visual
  (PUT SUPP → FLIP → MAGNET → CALL WALL); **γ polarity** (SHORT γ DOMINANT); **gravity ↑77% / 23%↓**.

### 5 · PRISM  (≈ GEX Matrix + Spectrum)
- **Strike × expiration matrix** — strikes (rows) × expirations (2d / 9d / **Σ ALL**), cells
  **green = call-side, red = put-side, intensity = size**, **gold = focus (leads board),
  cyan = largest**; values in `$K / $M`.
- Controls: lenses **GEX · VEX · OI · VOL · UNUSUAL**; **SINGLE / CONFLUENCE**; DTE 4/8;
  range ±10/±20/±40; scope DEFAULT / ODTE / Σ ALL; unit `$ Γ / 1% MOVE`; `● LIVE`.
- **Context panel** — the interpreting sentence + Net GEX + legend.

---

## Gap analysis — QuantEdge already has the engine; it lacks the grammar
| Module | QuantEdge engine (exists) | The gap to close |
|---|---|---|
| Oracle sphere | `marketContext.regime`, sector-rotation | ✅ orb built — add macro sub-regimes (equities/bonds/dollar/metals/crypto) |
| Signal analysis | Hunt cockpit (list/subject/analytics) | **price-ladder geometry** (STOP/ENTRY/LIVE/T1/T2 + %/$/away), **WHAT TO DO NOW** line |
| Confidence index | convictionScore + 13 layers | present layers as **VALIDITY/PROGRESS/PACE/OVERLAY bars** + trade-geometry "away" |
| Flow | `options-flow-scanner` | **Flow Drift 5D** chart + the full breakdown field set + sweep/pattern |
| Heatmap | market-scanner | **cap-weighted treemap** + the per-ticker RS/whales/unusual detail bar |
| GEX | `gamma-exposure` | **structural-range gradient**, **γ-polarity**, **gravity %**, and the *interpreting sentence* |
| PRISM | GEX Matrix + Spectrum | **lens switching** (GEX/VEX/OI/VOL/Unusual), **gold-focus/cyan-largest**, confluence, `$Γ/1% move` unit |
| Everywhere | — | the **right-hand CONTEXT panel that interprets** (QuantEdge already computes the "why" in the engine — it just never renders it), a **per-tab GUIDE**, uniform **tokens + motion** |

**The single biggest gap is not a feature — it's the interpretation layer.** MomoEdge turns every
number into a sentence. QuantEdge's convictions engine already produces that reasoning (`layers[].why`,
regime, breadth interpretation) and throws it away in the UI.

---

## What to rebuild (the spec)
1. **ONE Terminal shell** — persistent chrome (title · STATUS · **5 tabs** ORACLE/FLOW/HEATMAP/GEX/PRISM ·
   per-tab GUIDE · uptime footer). Replaces 6 shells + ~120 routes (see AUDIT.md).
2. **The layout grammar, everywhere** — working surface + **right CONTEXT panel** that renders the
   engine's existing reasoning as a sentence. This is the highest-leverage change.
3. **Adopt the specific patterns** (cheap, high-impact): price-ladder geometry · confidence-component
   bars · PRISM lens matrix w/ gold-focus/cyan-largest · GEX structural-range + γ-polarity + gravity ·
   flow-drift chart + breakdown fields · per-tab GUIDE.
4. **All on the design + motion system** (`lib/motion.ts` + consolidated tokens) — the cohesion.

## Build order (ties to BLUEPRINT.md §5)
1. Shell + tab chrome + tokens/motion (the grammar).  →  2. Oracle tab (orb ✅ + ladder + confidence bars).
→  3. GEX + PRISM (structural + matrix, the "wow").  →  4. Flow + Heatmap.  →  5. CONTEXT panels wired to
the engine's reasoning across all tabs.  →  6. Guides + tutor.

### One-line version
QuantEdge has every engine MomoEdge has. The rebuild is **one shell, one grammar (surface + interpreting
context panel), one motion system** — and *rendering the reasoning the engine already computes.*
