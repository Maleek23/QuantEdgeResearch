# GEX wall-touch — PROXY replay on real option bars

**This is a PROXY. Historical GEX walls cannot be replayed (no historical option chains / open interest). These levels are reconstructable stand-ins: nearest round strike beyond the open; round strike ≥ 0.5% from the open ("wall-like"); prior-day low / high; opening-range (30-min) low / high — session-low retest.** The real test is the forward log (`.cache/wall-touch/events-YYYY-MM.jsonl`, `GET /api/wall-touch/report`).

Window: 2025-10-01 → 2026-09-30; walk-forward halves H1 2025-10-01 → 2026-04-01 (excl.) · H2 2026-04-01 → 2026-09-30. Generated 2026-10-01T05:03:47.170Z by `research/wall-touch-proxy-replay.ts` · 21675 resolutions (rejection / break / stall) · 19235 option trades on 2198 symbol-sessions with a same-day expiry · 20 symbols. Status: **measuring**.

Detector = the live engine's (`server/wall-touch-core.ts`): touch = 1-min low ≤ level + max(0.05%, 0.1×ATR5); rejection = a close ≥ 0.25×ATR5 back off the level within 1–5 bars; break = a close through by > tolerance; stall = neither. Option = nearest-OTM same-day expiry at the confirm minute, entry = next 1-min bar HIGH, exits as in the 0DTE sniper replay. P&L = per $1 of premium.

## Verdict (computed)

- Whole cells surviving both halves: **none**. Sub-cell survivors: 0.
- Rejection rates by proxy: 0.60 / 0.59 / 0.59 / 0.58 / 0.57 / 0.62 / 0.63 / 0.62 (of rejection + break + stall), stable across halves — a level is rejected more often than broken, but the bounce is small: mean +30-min underlying move in the trade's direction ranges -0.06% to 0.17% across cells.
- Buying the nearest-OTM same-day option on the bounce (or on the break) is not positive in both halves for any proxy × side × trade × exit. 19 combinations are positive in ONE half only — regime artefacts by the walk-forward law, e.g. round put break hold (H1 0.03 / H2 -0.20); round put break stop50 (H1 0.04 / H2 -0.16); round put break level_stop (H1 0.00 / H2 -0.14); round call rejection hold (H1 0.16 / H2 -0.25).

## Rejection vs break vs stall, by proxy (all resolutions)

| proxy · side | resolutions | rejection rate (all · H1 · H2) | break rate | rejection rate by touch 1 / 2 / 3 / 4+ |
|---|---|---|---|---|
| nearest round strike beyond the open · put side | 3293 | 0.60 · 0.61 · 0.59 | 0.37 | 0.57 / 0.57 / 0.61 / 0.65 |
| nearest round strike beyond the open · call side | 3209 | 0.59 · 0.60 · 0.58 | 0.36 | 0.56 / 0.57 / 0.61 / 0.64 |
| round strike ≥ 0.5% from the open ("wall-like") · put side | 2123 | 0.59 · 0.62 · 0.57 | 0.37 | 0.57 / 0.56 / 0.60 / 0.64 |
| round strike ≥ 0.5% from the open ("wall-like") · call side | 2017 | 0.58 · 0.58 · 0.58 | 0.37 | 0.55 / 0.58 / 0.57 / 0.64 |
| prior-day low / high · put side | 2095 | 0.57 · 0.58 · 0.56 | 0.40 | 0.49 / 0.57 / 0.57 / 0.66 |
| prior-day low / high · call side | 2054 | 0.62 · 0.61 · 0.62 | 0.35 | 0.56 / 0.63 / 0.63 / 0.68 |
| opening-range (30-min) low / high — session-low retest · put side | 3409 | 0.63 · 0.64 · 0.62 | 0.33 | — / 0.58 / 0.64 / 0.66 |
| opening-range (30-min) low / high — session-low retest · call side | 3475 | 0.62 · 0.61 · 0.63 | 0.33 | — / 0.57 / 0.64 / 0.64 |

## Option trades — the bounce (rejection) and the opposite trade (break)

| proxy · side | trade | n (options) | +30m underlying % | MFE % | 2× hit % | worthless % | hold H1 / H2 | take2x H1 / H2 | take2x_close H1 / H2 | level_stop H1 / H2 | survives |
|---|---|---|---|---|---|---|---|---|---|---|---|
| nearest round strike beyond the open · put side | rejection | 1969 (1836) | 0.01 | 0.94 | 35.46 | 69.12 | -0.39 / -0.26 | -0.30 / -0.18 | -0.29 / -0.16 | -0.30 / -0.09 | no |
| nearest round strike beyond the open · put side | break | 1221 (1132) | 0.00 | 1.46 | 40.19 | 61.84 | 0.03 / -0.20 | -0.09 / -0.16 | -0.05 / -0.14 | 0.00 / -0.14 | no |
| nearest round strike beyond the open · call side | rejection | 1903 (1781) | -0.03 | 0.94 | 37.45 | 65.53 | 0.16 / -0.25 | -0.17 / -0.21 | -0.13 / -0.19 | 0.15 / -0.11 | no |
| nearest round strike beyond the open · call side | break | 1153 (1086) | 0.14 | 1.47 | 42.91 | 59.58 | -0.12 / -0.02 | -0.09 / -0.07 | -0.06 / -0.07 | -0.13 / -0.01 | no |
| round strike ≥ 0.5% from the open ("wall-like") · put side | rejection | 1259 (1142) | -0.00 | 1.00 | 35.73 | 69.61 | -0.33 / -0.27 | -0.33 / -0.14 | -0.28 / -0.15 | -0.27 / -0.09 | no |
| round strike ≥ 0.5% from the open ("wall-like") · put side | break | 784 (708) | 0.03 | 1.62 | 42.37 | 64.12 | 0.00 / -0.29 | -0.01 / -0.14 | 0.03 / -0.13 | -0.07 / -0.20 | no |
| round strike ≥ 0.5% from the open ("wall-like") · call side | rejection | 1170 (1062) | -0.06 | 1.07 | 37.38 | 68.46 | 0.42 / -0.16 | -0.19 / -0.22 | -0.14 / -0.19 | 0.33 / -0.05 | no |
| round strike ≥ 0.5% from the open ("wall-like") · call side | break | 749 (698) | 0.17 | 1.62 | 44.99 | 59.46 | -0.17 / -0.08 | -0.03 / -0.05 | -0.01 / -0.04 | -0.13 / -0.04 | no |
| prior-day low / high · put side | rejection | 1188 (1091) | -0.04 | 0.79 | 33.09 | 69.75 | -0.52 / -0.41 | -0.31 / -0.21 | -0.29 / -0.22 | -0.28 / -0.20 | no |
| prior-day low / high · put side | break | 832 (782) | 0.07 | 1.34 | 40.28 | 57.29 | -0.03 / -0.30 | -0.06 / -0.16 | -0.03 / -0.15 | -0.00 / -0.18 | no |
| prior-day low / high · call side | rejection | 1267 (1162) | -0.04 | 0.76 | 35.89 | 64.97 | -0.04 / -0.20 | -0.16 / -0.26 | -0.13 / -0.22 | 0.04 / -0.14 | no |
| prior-day low / high · call side | break | 721 (686) | 0.12 | 1.32 | 41.25 | 57.87 | -0.23 / -0.05 | -0.06 / -0.10 | -0.01 / -0.07 | -0.13 / -0.06 | no |
| opening-range (30-min) low / high — session-low retest · put side | rejection | 2147 (1989) | -0.01 | 0.66 | 35.14 | 68.02 | -0.30 / -0.37 | -0.29 / -0.20 | -0.30 / -0.19 | -0.11 / -0.21 | no |
| opening-range (30-min) low / high — session-low retest · put side | break | 1133 (1036) | 0.02 | 1.11 | 40.35 | 63.03 | 0.20 / -0.21 | -0.10 / -0.16 | -0.08 / -0.15 | 0.22 / -0.12 | no |
| opening-range (30-min) low / high — session-low retest · call side | rejection | 2151 (1977) | -0.02 | 0.73 | 38.85 | 64.80 | -0.23 / -0.20 | -0.14 / -0.19 | -0.14 / -0.15 | -0.11 / -0.19 | no |
| opening-range (30-min) low / high — session-low retest · call side | break | 1153 (1067) | -0.00 | 1.01 | 38.61 | 63.54 | -0.33 / -0.16 | -0.16 / -0.17 | -0.16 / -0.15 | -0.26 / -0.02 | no |

## Rejection trades by touch number (hold · take2x, all)

| proxy · side | touch 1 | touch 2 | touch 3 | touch 4+ |
|---|---|---|---|---|
| nearest round strike beyond the open · put side | 643 · -0.23 · -0.22 | 413 · -0.27 · -0.24 | 281 · -0.34 · -0.23 | 499 · -0.46 · -0.25 |
| nearest round strike beyond the open · call side | 623 · -0.09 · -0.21 | 405 · -0.04 · -0.25 | 280 · 0.11 · -0.20 | 473 · -0.18 · -0.11 |
| round strike ≥ 0.5% from the open ("wall-like") · put side | 404 · -0.26 · -0.25 | 258 · -0.22 · -0.25 | 183 · -0.28 · -0.21 | 297 · -0.41 · -0.18 |
| round strike ≥ 0.5% from the open ("wall-like") · call side | 366 · -0.05 · -0.27 | 256 · 0.23 · -0.19 | 158 · 0.47 · -0.19 | 282 · -0.05 · -0.17 |
| prior-day low / high · put side | 332 · -0.48 · -0.35 | 262 · -0.44 · -0.22 | 176 · -0.46 · -0.15 | 321 · -0.44 · -0.24 |
| prior-day low / high · call side | 403 · -0.03 · -0.22 | 281 · -0.09 · -0.21 | 189 · -0.12 · -0.17 | 289 · -0.30 · -0.23 |
| opening-range (30-min) low / high — session-low retest · put side | 0 · — · — | 543 · -0.27 · -0.18 | 530 · -0.28 · -0.23 | 916 · -0.41 · -0.28 |
| opening-range (30-min) low / high — session-low retest · call side | 0 · — · — | 548 · -0.14 · -0.17 | 548 · -0.30 · -0.21 | 881 · -0.20 · -0.15 |

## Rejection trades — RVOL and index vs singles (options n · hold · take2x · H1/H2 take2x)

| proxy · side | RVOL ≥ 1.5 | RVOL < 1.5 | index ETFs | single names |
|---|---|---|---|---|
| nearest round strike beyond the open · put side | 495 · -0.21 · -0.19 · -0.24/-0.14 | 1341 · -0.36 · -0.25 · -0.33/-0.19 | 712 · -0.36 · -0.24 · -0.30/-0.19 | 1124 · -0.29 · -0.23 · -0.30/-0.18 |
| nearest round strike beyond the open · call side | 479 · -0.11 · -0.23 · -0.24/-0.23 | 1302 · -0.06 · -0.17 · -0.14/-0.20 | 683 · -0.17 · -0.15 · -0.16/-0.14 | 1098 · -0.01 · -0.22 · -0.17/-0.25 |
| round strike ≥ 0.5% from the open ("wall-like") · put side | 418 · -0.10 · -0.20 · -0.28/-0.13 | 724 · -0.41 · -0.24 · -0.36/-0.15 | 327 · -0.20 · -0.16 · -0.33/0.03 | 815 · -0.33 · -0.25 · -0.32/-0.20 |
| round strike ≥ 0.5% from the open ("wall-like") · call side | 341 · -0.01 · -0.22 · -0.22/-0.21 | 721 · 0.14 · -0.20 · -0.18/-0.23 | 264 · -0.04 · -0.16 · -0.08/-0.25 | 798 · 0.14 · -0.23 · -0.24/-0.22 |
| prior-day low / high · put side | 275 · -0.46 · -0.28 · -0.28/-0.28 | 816 · -0.46 · -0.24 · -0.32/-0.19 | 344 · -0.41 · -0.30 · -0.30/-0.31 | 747 · -0.48 · -0.23 · -0.31/-0.18 |
| prior-day low / high · call side | 271 · -0.20 · -0.37 · -0.37/-0.37 | 891 · -0.10 · -0.16 · -0.09/-0.22 | 439 · -0.04 · -0.16 · -0.06/-0.25 | 723 · -0.18 · -0.25 · -0.23/-0.26 |
| opening-range (30-min) low / high — session-low retest · put side | 537 · -0.29 · -0.20 · -0.17/-0.22 | 1452 · -0.35 · -0.26 · -0.34/-0.19 | 770 · -0.30 · -0.25 · -0.29/-0.21 | 1219 · -0.36 · -0.23 · -0.30/-0.19 |
| opening-range (30-min) low / high — session-low retest · call side | 502 · -0.22 · -0.19 · -0.23/-0.17 | 1475 · -0.21 · -0.16 · -0.12/-0.20 | 741 · -0.15 · -0.18 · -0.23/-0.14 | 1236 · -0.24 · -0.16 · -0.08/-0.21 |

## Sub-cell survivors (extra comparisons — hypotheses only)

None.

## AMD 2026-09-30 (the example)

- round put 600 · rejection (touch #1) in the 11:19 ET bar · +30m 0.26% · AMD260930C00602500 entry 2.5 → max 4.672× · hold 2.70 · take2x 1.00
- round_far put 600 · rejection (touch #1) in the 11:19 ET bar · +30m 0.26% · AMD260930C00602500 entry 2.5 → max 4.672× · hold 2.70 · take2x 1.00
- pd put 605.25 · stall (touch #1) in the 09:45 ET bar · +30m -0.30% · no option (stall)
- pd put 605.25 · rejection (touch #2) in the 13:14 ET bar · +30m -0.22% · AMD260930C00607500 entry 2.07 → max 3.43× · hold 1.05 · take2x 1.00
- or30 put 602 · rejection (touch #2) in the 10:14 ET bar · +30m -0.02% · AMD260930C00605000 entry 2.91 → max 3.127× · hold 1.32 · take2x 1.00
- or30 put 602 · rejection (touch #3) in the 10:19 ET bar · +30m 0.12% · AMD260930C00605000 entry 3 → max 3.033× · hold 1.25 · take2x 1.00
- or30 put 602 · rejection (touch #4) in the 10:37 ET bar · +30m -0.04% · AMD260930C00605000 entry 2.45 → max 3.714× · hold 1.76 · take2x 1.00
- or30 put 602 · rejection (touch #5) in the 11:03 ET bar · +30m 0.02% · AMD260930C00605000 entry 1.99 → max 4.573× · hold 2.39 · take2x 1.00
- or30 put 602 · break (touch #6) in the 11:15 ET bar · +30m 0.01% · AMD260930P00600000 entry 2.49 → max 1.185× · hold -1.00 · take2x -1.00
- or30 put 602 · rejection (touch #7) in the 11:39 ET bar · +30m 0.24% · AMD260930C00605000 entry 1.82 → max 5× · hold 2.71 · take2x 1.00
- or30 put 602 · rejection (touch #8) in the 11:53 ET bar · +30m -0.03% · AMD260930C00605000 entry 1.8 → max 5.056× · hold 2.75 · take2x 1.00
- or30 put 602 · rejection (touch #9) in the 12:21 ET bar · +30m 0.19% · AMD260930C00602500 entry 2.64 → max 4.424× · hold 2.50 · take2x 1.00
- round call 610 · break (touch #1) in the 09:30 ET bar · +30m -1.01% · AMD260930C00612500 entry 6.45 → max 0.891× · hold -1.00 · take2x -1.00
- round call 610 · rejection (touch #2) in the 09:40 ET bar · +30m 0.31% · AMD260930P00605000 entry 4 → max 1.5× · hold -1.00 · take2x -1.00
- round call 610 · rejection (touch #3) in the 14:40 ET bar · +30m -0.69% · AMD260930P00607500 entry 1.75 → max 1.469× · hold -1.00 · take2x -1.00
- round call 610 · break (touch #4) in the 14:58 ET bar · +30m 0.32% · AMD260930C00612500 entry 1.9 → max 1.768× · hold -1.00 · take2x -1.00

## Caveats

- PROXY: none of these levels is a dealer wall. The live engine reads real next-7-day GEX walls; whether those behave better than round strikes / prior-day levels is exactly what the forward log will show.
- Same-day-expiry sessions only (expiries discovered from Alpaca's expired-contract listings); the live engine also uses weeklies (≤ 7 DTE) when no 0DTE is listed.
- Entry = the next 1-min bar high (no historical quotes); exits at 2× assume a fill at the touched price — `take2x_close` is the honest check on thin contracts. No commissions or exit slippage.
- Multiple comparisons: 4 proxies × 2 sides × 2 trades × 8 exits, plus subsets — some cells pass by chance. Survivorship: today's liquid names.
