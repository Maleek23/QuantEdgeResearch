# Skylit teardown — 2026-10-13

Public pages only (no login, no app.skylit.ai). Screenshots: `shots/` (16 pages × 1440/390 + phone menu). Paraphrased, not copied.

## 1. Their features and navigation

**Desktop nav:** Products ▾ (7 modules, icon + one-liner) · Features · Learn ▾ · Build ▾ (Agent Kits, Agent Lab, API) · Pricing · FAQ · Partners · Wall of Success · theme · Login · Sign Up. Floating chat button.
**Phone:** full-screen sheet, Products/Learn accordions, Build group, links, Login + full-width Sign Up.
**Footer:** Products · Platform · What's next (Arc, Aethos — Q4) · Resources (guide per module) · Company · Legal · Social.

**Module page template (all 7):** hero + Mac-window screenshot → problem → "With X" → 4 steps → 5–6 capability cards → 40–50 features in groups → value → pairs-with → per-module changelog → FAQ ("no signals") → CTA + disclaimer.

**Visual language:** light-first, dot grid, big sentence-case sans, mono uppercase labels, black pill CTAs, sparse pages / dense screenshots. Yellow = positive node, purple = negative; Monochrome/Viridis option.

### Mechanics they publish
- **Heatseeker:** King (largest node), Gatekeeper (large node between price and King), Pika (standout +), Barney (standout −, wicky overshoots), sign ≠ direction, floor/ceiling (largest below/above), Rug (+ over − above price) / reverse rug "trampoline", delivered vs fresh (not labelled — users replay), velocity (1m–1D), Halo (velocity agrees on ≥2 timeframes), expiry presets 1W/1M/3M/6M/All, Trinity (SPXW/SPY/QQQ up to 6 panels), replay (Shift+R, jump to noon/open), alerts (approach, touch, size, Smart).
- **Atlas:** orbs bar by bar (GEX/VEX/both, count or P-value floor, King opacity), projection Shift+S past last candle (horizon pill, pins, reference path; "scenario, not forecast"), derived futures (SPX→ES, NDX→NQ, GLD/SLV/DIA/IWM→GC/SI/YM/RTY, "wiggle"), dark-pool lines, premium per candle, Flow VWAP, Initial Balance, Killzones, Trade Deck, replay.
- **Tempest:** SVX yearly implied move percentile; cones (Today/Next day/Week/Monthly/30d, 68% & 95%) shaped by time of day, skew, earnings steps; anchored 1σ lines; frozen cone + 09:40 reference + "move vs priced"; replay scoring; Radar (rich/cheap vol).
- **Flowseeker:** fill side, Vol/OI, Flow Score −100..+100 (untested), sweep/multi-leg/cross, next-day OI check, Scanner, Compass, Dark Feed, 25 alerts, EOD Discord summary.
- **Nexus (paper):** $100k wallet, quarterly seasons, bid/ask fills, Apex Return / Missed Upside / Giveback, coach, ranks, leaderboards.
- **Talon:** Aegis side panel ⌘\, slash commands (/levels /talon /watchlist /trinity /breadth /flow /darkpool /metrics /earnings /market /news …), timeframe Scalp/Day/Swing/Position, effort Fast/Balanced/Deep, push-back re-fetch with source, canvas chart, Bull vs Bear nearest-first.
- **Platform:** Live Stages (rooms, transcripts, replays; free 60 min/day), Academy linear track, Aegis overlay, Mac app + mobile web app, Wall of Success (4.9/5, 554+ on Whop).
- **Coming:** Arc (price paths, Q4, no details), Aethos (futures execution).
- **Pricing:** $149 / $349 / $699; −14% 3mo, −25% 6mo, −40% annual; no trial.

## 2. Gap table (by value)

| Area | They have | We have | Gap | Effort | Value |
|---|---|---|---|---|---|
| Price-path projection | Arc (Q4, unshipped) | Weekly Path model | Ship first (§3) | M | Very high |
| Node taxonomy | King/Gatekeeper/Pika/Barney/Rug | walls, flip, max-γ, Apex | Gatekeeper, Rug/Trampoline, auto delivered-vs-fresh | S | High |
| Velocity + Halo | yes | 5-min GEX rows | add | M | High |
| Expected-move cone | 2σ, intraday shape, skew, events, replay-scored | spot cone + EM lines | upgrade | M | High |
| Flow | score, next-day OI, compass, alerts | FLOW (side unknown) | fix side, OI check | M | High |
| AI analyst | Talon panel, push-back, canvas | /ask + slash commands | global panel, citations, canvas | M | High |
| Node alerts | approach/touch/size | /alerts, Discord | node alerts | M | High |
| Education | Academy + guide per module | glossary, tours | guides + track | M | High |
| Module marketing pages | 7 templated pages | landing, /updates | /product/* | M | High |
| Honest framing | "teaching, untested" | verified book | publish hit-rates per level type | S | High |
| Trinity | yes | GEX tiles | 3-index view | S | Medium |
| Replay | presets, pinned cone | chart replay | presets + scoring | S | Medium |
| Vol radar | SVX | — | radar | M | Medium |
| Derived futures | ES/NQ/GC/SI/YM/RTY | — | add | M | Medium |
| Paper trading | wallet + leaderboard | verified journal | optional | L | Medium |
| Community | Stages, Wall | Discord | verified wins wall | S | Medium |
| Apps | Mac + PWA | responsive web | PWA | S | Medium |

## 3. Spec — QuantEdge "Path" overlay (beats Arc)

**Inputs:** Weekly Path model (σ_week, gamma pull only in long gamma, capped); GEX/VEX per strike per horizon (`/api/gex-vex/terminal?horizon=`); ATM-straddle daily/weekly EM; intraday variance curve from our 5-min bars; event priced moves; 25Δ skew; pre-market gap as starting drift.

**Math:** σ(t) = S·σ_IV·√(Σ variance weights to t), plus realized band (gap = variance premium); event adds σ_event²; skew → asymmetric. Positive nodes attract (|GEX|, decayed by DTE); negative nodes raise local vol, no pull; delivered nodes half weight. 2,000 paths at 5-min: dx = −∇U·λ(regime)·dt + σ(t)·mult(x)·dW, λ = 0 in short gamma. Outputs: median path, 50/80% fans, terminal distribution, P(touch)/P(stop) per level, Gatekeeper = highest P(stop) between price and Apex.

**UI:** fan past last candle; Apex orb with touch %; horizon pill Session/Tomorrow/Week/OpEx; hover = range + probabilities; right-edge terminal distribution; level chips ("Apex 585 · touch 62% · stop 31%"); pinned 09:40 + close paths scored vs realized; public calibration page (band coverage, Brier); age stamps; replay shows path as computed then; phone: fan + 3 chips + segmented horizon.

## 4. Navigation

**Public desktop:** Product ▾ mega menu (NEXUS, 0DTE, GEX, FLOW, Chart+Path, Sectors, LEAPS & Swings, Ask Quantinum, Bot/Discord) · Proof (verified book, calibration, wins wall) · Learn ▾ · Pricing · What's new · Login · Start. Six-column footer with Proof.
**Public phone:** full-screen accordion sheet, sticky Start.
**Module pages:** `/product/<slug>`, Skylit-style template + "How it has performed" verified block.
**App desktop:** keep workspace tabs; global ⌘K palette; ⌘\ Quantinum panel everywhere with page context.
**App phone:** bottom bar Today → NEXUS → FLOW → GEX → More; Ask Quantinum floating button.

## Top 15 build list
1. Path overlay v1 (fan, touch/stop %, horizon pill) — M
2. Pinned paths + public calibration scorecard — M
3. Cone upgrade (2σ, intraday shape, skew, events, move vs priced) — M
4. Node labels: Gatekeeper, Rug/Trampoline, delivered vs fresh — S
5. Node velocity + Halo — M
6. Node alerts (approach/touch/size → push + Discord) — M
7. ⌘\ Quantinum side panel everywhere (context, push-back, canvas) — M
8. /product/* pages + mega menu + phone sheet — M
9. Flow side/sentiment fix + next-day OI check — M
10. Trinity tile + /trinity — S
11. Field guide per module + linear Academy track — M
12. Replay presets + replay-time scoring — S
13. IV-percentile radar — M
14. Derived futures levels (ES, NQ) — M
15. Installable web app + Proof page / verified wins wall — S

**Where we already beat them:** verified, replayed outcome record; Discord trade lifecycle; 0DTE desk; LEAPS & swing screener.
