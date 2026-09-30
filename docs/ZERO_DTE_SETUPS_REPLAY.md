# 0DTE classic setups + lotto sniper — replay on real option bars

**Window: trades 2025-10-01 → 2026-09-30 (last 12 months only; bars from 2025-08-02 used as warm-up, never traded). Walk-forward halves: H1 2025-10-01 → 2026-03-31 · H2 2026-04-01 → 2026-09-30.**

Generated 2026-09-30T20:48:56.227Z by `research/zero-dte-setups-replay.ts` (`--from 2025-10-01 --to 2026-09-30 --split 2026-04-01`) · 226322 option trades from 80102 stock triggers on 2209 symbol-sessions with a same-day expiry.

Status: **measuring**. Nothing here is validated until it also holds live.

## Plain verdict (hand-written from this run)

- **1 of 66 whole cells survived both halves:** opening flush → reclaim, **short** (squeeze above pre-market high and prior close fails back below prior close), **nearest-OTM put, held to the close**: n 160, +0.23 (H1) / +0.20 (H2) per $1 of premium. It is **marginal**: H1 with its single best trade removed is +0.003, the median trade expires worthless (−100%), and the index ETFs lose (n 37, −0.37) — the edge is in single names (n 123, H1 +0.61 / H2 +0.22). This matches the earlier stock-price replay, where only the short side held in both halves. It is the only combination with `publish: true` in `SNIPER_POLICIES`; the engine itself is off (`ZERO_DTE_SNIPER` unset).
- **Everything else failed**, on real option prices: ORB 15/30, VWAP reclaim/loss, level hold → VWAP reclaim (the AMD pattern: long nearest-OTM −0.33/$1, negative in both halves), PDH/PDL break & hold, failed breakout, power hour, the long flush, **liquidity sweeps both ways** (−0.27 long / −0.16 short, nearest OTM), **double sweeps** (−0.22 / −0.10), and **reactive-zone repeat touches** (−0.35 long / −0.21 short, n ≈ 29k each side).
- **Reactive zones wear out:** later touches pay worse — long nearest-OTM hold −0.29 (touch 2) → −0.32 (3) → −0.35 (4) → −0.49 (5+); short −0.18 → −0.19 → −0.20 → −0.26. No zone source is positive (prior-day, pre-market, round, today's swings). GEX zones could not be replayed (no historical chains); live they are UNMEASURED.
- **Volume confirmation helps a little but rescues nothing:** RVOL ≥ 1.5 beats < 1.5 on most setups (e.g. ORB15 short +0.08 vs −0.18, level-reclaim long −0.07 vs −0.39) but no setup other than the short flush is positive in both halves on RVOL ≥ 1.5 alone.
- **Lottos:** the literal cheapest $0.05–$0.50 contract expires worthless 93–97% of the time and loses in every cell; its "2×" is mostly a one-tick bounce. The near-money lotto only shows up in sub-cell splits (below), which are extra comparisons, not findings.
- **The AMD 2026-09-30 day did fire** (level hold at round 600 → VWAP reclaim, 12:58 ET, trigger-bar RVOL 3.4×): the 607.5C (2.10) reached 3.4× and closed +102%; the 615C lotto (0.40) reached 5.25× but expired worthless unless sold at 2×. Over 12 months the same setup loses — the anecdote does not generalise.

## Verdict — what survived both halves (whole cells)

_Window: trades 2025-10-01 → 2026-09-30 · H1 2025-10-01 → 2026-03-31 · H2 2026-04-01 → 2026-09-30_

| setup | side | contract | exit | n | H1 exp | H2 exp | H1 ex-best | H2 ex-best | 2× hit % | worthless % |
|---|---|---|---|---|---|---|---|---|---|---|
| Opening flush → reclaim | short | nearest OTM | hold | 160 | 0.23 | 0.20 | 0.00 | 0.10 | 38.8 | 58.1 |

Expectancy = mean P&L per $1 of premium paid (−1.00 = total loss). "ex-best" = the half's mean with its single best trade removed.

## Sub-cell survivors (RVOL split, index vs singles, zone touch / source, sweep level)

These are MORE comparisons on top of the cells above — treat them as hypotheses for live measuring, not as findings.

_Window: trades 2025-10-01 → 2026-09-30 · H1 2025-10-01 → 2026-03-31 · H2 2026-04-01 → 2026-09-30_

| setup · side · contract · subset | exit | n (H1/H2) | H1 exp | H2 exp | H1 ex-best | H2 ex-best |
|---|---|---|---|---|---|---|
| Opening flush → reclaim · short · nearest OTM · RVOL ≥ 1.5 | half3x | 53 (29/24) | 0.26 | 0.10 | 0.08 | 0.00 |
| Opening flush → reclaim · short · nearest OTM · single names | hold | 123 (54/69) | 0.61 | 0.22 | 0.30 | 0.09 |
| Opening flush → reclaim · short · nearest OTM · single names | level_stop | 123 (54/69) | 0.16 | 0.17 | 0.01 | 0.04 |
| Opening flush → reclaim · short · nearest OTM · single names | half3x | 123 (54/69) | 0.21 | 0.12 | 0.03 | 0.04 |
| Opening flush → reclaim · short · near lotto ($0.05–$0.50, nearest the money) · single names | hold | 121 (53/68) | 1.44 | 0.59 | 0.78 | 0.03 |
| Double sweep (second side) · short · near lotto ($0.05–$0.50, nearest the money) · RVOL < 1.5 | level_stop | 480 (195/285) | 0.31 | 0.26 | 0.13 | 0.07 |
| Double sweep (second side) · short · near lotto ($0.05–$0.50, nearest the money) · single names | level_stop | 538 (215/323) | 0.28 | 0.17 | 0.12 | 0.00 |

## Every cell (hold-to-close and the main exits)

_Window: trades 2025-10-01 → 2026-09-30 · H1 2025-10-01 → 2026-03-31 · H2 2026-04-01 → 2026-09-30_

| setup | side | contract | n | 2×% | 3×% | 5×% | worthless % | med entry | hold | take2x | take2x_close | stop50 | level_stop | H1 hold | H2 hold | H1 take2x | H2 take2x | survives |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ORB 15-min break | long | nearest OTM | 1396 | 40.4 | 21.6 | 5.90 | 57.2 | 1.27 | -0.14 | -0.11 | -0.10 | -0.09 | -0.07 | -0.23 | -0.07 | -0.13 | -0.10 | no |
| ORB 15-min break | long | cheapest lotto ($0.05–$0.50) | 1324 | 37.0 | 22.6 | 13.8 | 95.5 | 0.07 | -0.50 | -0.26 | -0.23 | -0.24 | -0.17 | -0.74 | -0.31 | -0.33 | -0.20 | no |
| ORB 15-min break | long | near lotto ($0.05–$0.50, nearest the money) | 1365 | 42.0 | 25.8 | 13.9 | 84.8 | 0.41 | -0.28 | -0.16 | -0.14 | -0.14 | -0.11 | -0.48 | -0.12 | -0.21 | -0.11 | no |
| ORB 15-min break | short | nearest OTM | 1334 | 40.2 | 21.6 | 8.60 | 60.6 | 1.33 | -0.09 | -0.13 | -0.12 | -0.06 | -0.07 | 0.16 | -0.27 | -0.08 | -0.17 | no |
| ORB 15-min break | short | cheapest lotto ($0.05–$0.50) | 1227 | 32.9 | 20.1 | 11.3 | 97.1 | 0.07 | -0.46 | -0.34 | -0.32 | -0.19 | -0.28 | 0.00 | -0.82 | -0.25 | -0.41 | no |
| ORB 15-min break | short | near lotto ($0.05–$0.50, nearest the money) | 1311 | 39.4 | 24.8 | 14.6 | 86.7 | 0.43 | -0.20 | -0.20 | -0.20 | -0.13 | -0.16 | 0.17 | -0.48 | -0.17 | -0.23 | no |
| ORB 30-min break | long | nearest OTM | 1265 | 39.4 | 20.3 | 5.30 | 60.1 | 1.16 | -0.21 | -0.14 | -0.12 | -0.14 | -0.10 | -0.30 | -0.15 | -0.16 | -0.12 | no |
| ORB 30-min break | long | cheapest lotto ($0.05–$0.50) | 1199 | 36.0 | 22.0 | 13.0 | 95.7 | 0.08 | -0.57 | -0.28 | -0.25 | -0.35 | -0.27 | -0.74 | -0.45 | -0.31 | -0.25 | no |
| ORB 30-min break | long | near lotto ($0.05–$0.50, nearest the money) | 1241 | 40.5 | 25.5 | 12.7 | 84.8 | 0.39 | -0.34 | -0.18 | -0.15 | -0.19 | -0.14 | -0.50 | -0.23 | -0.20 | -0.17 | no |
| ORB 30-min break | short | nearest OTM | 1197 | 40.7 | 21.3 | 8.20 | 61.4 | 1.22 | -0.11 | -0.12 | -0.12 | -0.12 | -0.07 | 0.10 | -0.29 | -0.09 | -0.15 | no |
| ORB 30-min break | short | cheapest lotto ($0.05–$0.50) | 1091 | 34.8 | 21.5 | 11.5 | 96.7 | 0.07 | -0.32 | -0.30 | -0.26 | -0.01 | -0.09 | 0.11 | -0.66 | -0.28 | -0.32 | no |
| ORB 30-min break | short | near lotto ($0.05–$0.50, nearest the money) | 1172 | 39.8 | 25.3 | 14.0 | 86.3 | 0.42 | -0.17 | -0.20 | -0.18 | -0.12 | -0.13 | 0.17 | -0.45 | -0.21 | -0.18 | no |
| VWAP reclaim / loss | long | nearest OTM | 1676 | 38.7 | 20.0 | 6.10 | 65.3 | 1.00 | -0.26 | -0.17 | -0.16 | -0.14 | -0.12 | -0.30 | -0.22 | -0.22 | -0.14 | no |
| VWAP reclaim / loss | long | cheapest lotto ($0.05–$0.50) | 1563 | 35.0 | 20.5 | 9.90 | 94.8 | 0.08 | -0.55 | -0.30 | -0.29 | -0.33 | -0.26 | -0.77 | -0.40 | -0.36 | -0.26 | no |
| VWAP reclaim / loss | long | near lotto ($0.05–$0.50, nearest the money) | 1637 | 39.2 | 24.2 | 12.0 | 85.0 | 0.38 | -0.35 | -0.21 | -0.20 | -0.19 | -0.17 | -0.45 | -0.28 | -0.27 | -0.16 | no |
| VWAP reclaim / loss | short | nearest OTM | 1707 | 39.7 | 22.1 | 7.90 | 62.9 | 1.03 | -0.16 | -0.16 | -0.14 | -0.09 | -0.07 | -0.03 | -0.26 | -0.11 | -0.19 | no |
| VWAP reclaim / loss | short | cheapest lotto ($0.05–$0.50) | 1524 | 30.4 | 17.4 | 9.60 | 96.4 | 0.07 | -0.50 | -0.39 | -0.35 | -0.21 | -0.22 | -0.26 | -0.68 | -0.37 | -0.40 | no |
| VWAP reclaim / loss | short | near lotto ($0.05–$0.50, nearest the money) | 1652 | 38.6 | 23.1 | 12.4 | 84.9 | 0.41 | -0.25 | -0.22 | -0.22 | -0.12 | -0.08 | 0.02 | -0.45 | -0.18 | -0.25 | no |
| Level hold → VWAP reclaim | long | nearest OTM | 922 | 35.6 | 17.0 | 4.90 | 65.8 | 0.85 | -0.33 | -0.22 | -0.21 | -0.17 | -0.28 | -0.36 | -0.30 | -0.30 | -0.17 | no |
| Level hold → VWAP reclaim | long | cheapest lotto ($0.05–$0.50) | 877 | 33.3 | 19.4 | 8.90 | 94.9 | 0.08 | -0.63 | -0.33 | -0.33 | -0.26 | -0.49 | -0.65 | -0.62 | -0.40 | -0.28 | no |
| Level hold → VWAP reclaim | long | near lotto ($0.05–$0.50, nearest the money) | 906 | 36.4 | 22.1 | 9.80 | 84.0 | 0.37 | -0.37 | -0.26 | -0.27 | -0.12 | -0.30 | -0.38 | -0.35 | -0.34 | -0.19 | no |
| Level hold → VWAP reclaim | short | nearest OTM | 1015 | 36.5 | 20.7 | 7.30 | 65.5 | 0.88 | -0.19 | -0.22 | -0.19 | -0.07 | -0.14 | -0.04 | -0.30 | -0.18 | -0.24 | no |
| Level hold → VWAP reclaim | short | cheapest lotto ($0.05–$0.50) | 921 | 28.3 | 16.2 | 7.40 | 96.1 | 0.07 | -0.65 | -0.43 | -0.41 | -0.29 | -0.47 | -0.40 | -0.83 | -0.39 | -0.47 | no |
| Level hold → VWAP reclaim | short | near lotto ($0.05–$0.50, nearest the money) | 983 | 36.3 | 21.7 | 10.5 | 84.5 | 0.41 | -0.27 | -0.27 | -0.24 | -0.12 | -0.18 | 0.13 | -0.57 | -0.21 | -0.31 | no |
| Prior-day high/low break & hold | long | nearest OTM | 523 | 41.7 | 22.0 | 5.50 | 60.6 | 1.10 | -0.19 | -0.11 | -0.11 | -0.13 | -0.10 | -0.29 | -0.10 | -0.12 | -0.10 | no |
| Prior-day high/low break & hold | long | cheapest lotto ($0.05–$0.50) | 481 | 33.7 | 21.4 | 11.6 | 96.0 | 0.08 | -0.52 | -0.32 | -0.30 | -0.26 | -0.35 | -0.67 | -0.40 | -0.33 | -0.32 | no |
| Prior-day high/low break & hold | long | near lotto ($0.05–$0.50, nearest the money) | 515 | 39.0 | 26.4 | 12.0 | 84.3 | 0.39 | -0.30 | -0.21 | -0.17 | -0.15 | -0.21 | -0.42 | -0.20 | -0.22 | -0.20 | no |
| Prior-day high/low break & hold | short | nearest OTM | 547 | 40.8 | 20.3 | 6.40 | 60.9 | 1.32 | -0.23 | -0.12 | -0.12 | -0.16 | -0.12 | -0.14 | -0.31 | -0.04 | -0.18 | no |
| Prior-day high/low break & hold | short | cheapest lotto ($0.05–$0.50) | 489 | 32.3 | 16.8 | 9.60 | 98.2 | 0.07 | -0.78 | -0.35 | -0.35 | -0.43 | -0.44 | -0.79 | -0.78 | -0.29 | -0.40 | no |
| Prior-day high/low break & hold | short | near lotto ($0.05–$0.50, nearest the money) | 531 | 41.4 | 24.1 | 12.1 | 87.2 | 0.42 | -0.45 | -0.17 | -0.18 | -0.26 | -0.23 | -0.45 | -0.46 | -0.12 | -0.20 | no |
| Failed breakout fade | long | nearest OTM | 1172 | 34.6 | 16.6 | 4.80 | 64.7 | 1.14 | -0.33 | -0.24 | -0.23 | -0.19 | -0.10 | -0.30 | -0.35 | -0.26 | -0.22 | no |
| Failed breakout fade | long | cheapest lotto ($0.05–$0.50) | 1093 | 27.8 | 16.7 | 8.50 | 96.4 | 0.07 | -0.71 | -0.44 | -0.42 | -0.42 | -0.20 | -0.68 | -0.73 | -0.46 | -0.42 | no |
| Failed breakout fade | long | near lotto ($0.05–$0.50, nearest the money) | 1161 | 34.2 | 20.2 | 9.30 | 85.1 | 0.38 | -0.45 | -0.30 | -0.28 | -0.28 | -0.14 | -0.40 | -0.50 | -0.31 | -0.30 | no |
| Failed breakout fade | short | nearest OTM | 1228 | 36.6 | 20.5 | 7.50 | 63.1 | 1.11 | -0.14 | -0.20 | -0.18 | -0.05 | -0.04 | -0.11 | -0.16 | -0.23 | -0.18 | no |
| Failed breakout fade | short | cheapest lotto ($0.05–$0.50) | 1114 | 27.6 | 16.0 | 9.00 | 96.6 | 0.07 | -0.26 | -0.45 | -0.42 | 0.01 | -0.11 | 0.17 | -0.59 | -0.44 | -0.46 | no |
| Failed breakout fade | short | near lotto ($0.05–$0.50, nearest the money) | 1199 | 35.2 | 22.5 | 12.3 | 85.5 | 0.41 | -0.21 | -0.29 | -0.27 | -0.02 | -0.10 | -0.02 | -0.36 | -0.29 | -0.28 | no |
| Power-hour continuation | long | nearest OTM | 855 | 33.2 | 17.1 | 7.40 | 77.3 | 0.29 | -0.44 | -0.30 | -0.27 | -0.24 | -0.38 | -0.38 | -0.47 | -0.32 | -0.29 | no |
| Power-hour continuation | long | cheapest lotto ($0.05–$0.50) | 704 | 32.8 | 18.9 | 9.10 | 88.6 | 0.10 | -0.43 | -0.33 | -0.27 | -0.16 | -0.37 | -0.22 | -0.55 | -0.32 | -0.34 | no |
| Power-hour continuation | long | near lotto ($0.05–$0.50, nearest the money) | 719 | 33.0 | 17.8 | 8.20 | 82.2 | 0.27 | -0.33 | -0.33 | -0.26 | -0.12 | -0.28 | -0.15 | -0.43 | -0.33 | -0.32 | no |
| Power-hour continuation | short | nearest OTM | 910 | 37.3 | 19.5 | 6.90 | 73.3 | 0.33 | -0.39 | -0.21 | -0.20 | -0.23 | -0.35 | -0.39 | -0.40 | -0.17 | -0.24 | no |
| Power-hour continuation | short | cheapest lotto ($0.05–$0.50) | 747 | 35.1 | 19.4 | 9.10 | 90.9 | 0.10 | -0.72 | -0.29 | -0.33 | -0.39 | -0.64 | -0.74 | -0.70 | -0.25 | -0.33 | no |
| Power-hour continuation | short | near lotto ($0.05–$0.50, nearest the money) | 782 | 38.7 | 22.1 | 8.40 | 80.8 | 0.28 | -0.47 | -0.21 | -0.21 | -0.29 | -0.43 | -0.46 | -0.48 | -0.15 | -0.25 | no |
| Opening flush → reclaim | long | nearest OTM | 187 | 39.0 | 21.9 | 5.90 | 60.4 | 1.30 | -0.22 | -0.15 | -0.15 | -0.13 | -0.09 | -0.55 | -0.03 | -0.51 | 0.07 | no |
| Opening flush → reclaim | long | cheapest lotto ($0.05–$0.50) | 170 | 32.4 | 21.2 | 12.4 | 95.3 | 0.07 | -0.83 | -0.35 | -0.39 | -0.42 | -0.38 | -0.97 | -0.76 | -0.56 | -0.23 | no |
| Opening flush → reclaim | long | near lotto ($0.05–$0.50, nearest the money) | 185 | 37.8 | 25.4 | 13.5 | 84.9 | 0.40 | -0.45 | -0.24 | -0.24 | -0.16 | -0.15 | -0.69 | -0.31 | -0.54 | -0.06 | no |
| Opening flush → reclaim | short | nearest OTM | 160 | 38.8 | 25.0 | 11.9 | 58.1 | 1.73 | 0.22 | -0.14 | -0.13 | 0.17 | 0.06 | 0.23 | 0.20 | -0.31 | 0.00 | **yes** (hold) |
| Opening flush → reclaim | short | cheapest lotto ($0.05–$0.50) | 149 | 34.2 | 21.5 | 14.1 | 96.0 | 0.08 | -0.29 | -0.32 | -0.27 | -0.14 | -0.13 | 0.21 | -0.70 | -0.37 | -0.27 | no |
| Opening flush → reclaim | short | near lotto ($0.05–$0.50, nearest the money) | 158 | 38.6 | 25.9 | 18.4 | 80.4 | 0.43 | 0.55 | -0.22 | -0.21 | 0.38 | 0.44 | 0.81 | 0.32 | -0.34 | -0.12 | no |
| Liquidity sweep → reclaim | long | nearest OTM | 1599 | 36.6 | 19.6 | 5.50 | 64.4 | 1.20 | -0.27 | -0.20 | -0.18 | -0.16 | -0.09 | -0.28 | -0.26 | -0.22 | -0.18 | no |
| Liquidity sweep → reclaim | long | cheapest lotto ($0.05–$0.50) | 1472 | 29.4 | 17.9 | 8.80 | 96.4 | 0.08 | -0.63 | -0.41 | -0.42 | -0.36 | -0.25 | -0.76 | -0.54 | -0.45 | -0.38 | no |
| Liquidity sweep → reclaim | long | near lotto ($0.05–$0.50, nearest the money) | 1568 | 37.1 | 23.5 | 11.4 | 86.4 | 0.38 | -0.41 | -0.25 | -0.21 | -0.24 | -0.16 | -0.53 | -0.33 | -0.29 | -0.23 | no |
| Liquidity sweep → reclaim | short | nearest OTM | 1547 | 37.7 | 20.0 | 6.80 | 63.9 | 1.15 | -0.16 | -0.19 | -0.17 | -0.09 | -0.05 | 0.00 | -0.27 | -0.10 | -0.26 | no |
| Liquidity sweep → reclaim | short | cheapest lotto ($0.05–$0.50) | 1376 | 30.2 | 18.3 | 9.20 | 96.0 | 0.07 | -0.38 | -0.40 | -0.36 | -0.09 | -0.01 | -0.11 | -0.57 | -0.32 | -0.45 | no |
| Liquidity sweep → reclaim | short | near lotto ($0.05–$0.50, nearest the money) | 1500 | 37.3 | 22.3 | 11.2 | 87.1 | 0.39 | -0.13 | -0.25 | -0.24 | 0.03 | 0.01 | 0.26 | -0.40 | -0.15 | -0.32 | no |
| Double sweep (second side) | long | nearest OTM | 655 | 39.8 | 21.5 | 6.30 | 64.0 | 1.01 | -0.22 | -0.14 | -0.13 | -0.14 | -0.09 | -0.14 | -0.27 | -0.16 | -0.13 | no |
| Double sweep (second side) | long | cheapest lotto ($0.05–$0.50) | 595 | 32.8 | 20.3 | 9.70 | 95.5 | 0.08 | -0.48 | -0.34 | -0.35 | -0.30 | -0.22 | -0.56 | -0.43 | -0.41 | -0.30 | no |
| Double sweep (second side) | long | near lotto ($0.05–$0.50, nearest the money) | 633 | 40.3 | 25.6 | 11.7 | 85.3 | 0.36 | -0.24 | -0.19 | -0.16 | -0.17 | -0.11 | -0.31 | -0.19 | -0.22 | -0.16 | no |
| Double sweep (second side) | short | nearest OTM | 667 | 39.9 | 21.9 | 8.10 | 61.3 | 0.96 | -0.10 | -0.14 | -0.12 | -0.06 | -0.01 | -0.04 | -0.14 | -0.02 | -0.23 | no |
| Double sweep (second side) | short | cheapest lotto ($0.05–$0.50) | 579 | 33.2 | 20.9 | 9.70 | 94.8 | 0.08 | -0.38 | -0.34 | -0.27 | -0.04 | 0.14 | -0.35 | -0.40 | -0.23 | -0.42 | no |
| Double sweep (second side) | short | near lotto ($0.05–$0.50, nearest the money) | 636 | 39.0 | 24.1 | 11.9 | 85.5 | 0.36 | -0.11 | -0.22 | -0.19 | 0.09 | 0.14 | -0.06 | -0.14 | -0.11 | -0.29 | no |
| Reactive zone, repeat touch | long | nearest OTM | 29456 | 34.7 | 18.0 | 6.00 | 69.0 | 0.54 | -0.35 | -0.25 | -0.24 | -0.20 | -0.22 | -0.39 | -0.33 | -0.30 | -0.20 | no |
| Reactive zone, repeat touch | long | cheapest lotto ($0.05–$0.50) | 27124 | 31.2 | 18.3 | 9.70 | 93.2 | 0.08 | -0.51 | -0.37 | -0.35 | -0.29 | -0.31 | -0.58 | -0.45 | -0.40 | -0.35 | no |
| Reactive zone, repeat touch | long | near lotto ($0.05–$0.50, nearest the money) | 28123 | 35.6 | 20.9 | 9.40 | 82.1 | 0.33 | -0.38 | -0.27 | -0.26 | -0.21 | -0.25 | -0.42 | -0.34 | -0.31 | -0.24 | no |
| Reactive zone, repeat touch | short | nearest OTM | 28947 | 39.0 | 21.4 | 7.60 | 65.9 | 0.56 | -0.21 | -0.17 | -0.15 | -0.11 | -0.12 | -0.14 | -0.26 | -0.13 | -0.20 | no |
| Reactive zone, repeat touch | short | cheapest lotto ($0.05–$0.50) | 25956 | 28.6 | 16.8 | 8.40 | 94.6 | 0.07 | -0.60 | -0.42 | -0.40 | -0.30 | -0.31 | -0.50 | -0.68 | -0.41 | -0.44 | no |
| Reactive zone, repeat touch | short | near lotto ($0.05–$0.50, nearest the money) | 27605 | 38.2 | 22.7 | 10.9 | 79.9 | 0.36 | -0.32 | -0.22 | -0.19 | -0.16 | -0.16 | -0.24 | -0.38 | -0.18 | -0.25 | no |

## Volume confirmation — time-of-day RVOL of the trigger bar

RVOL = trigger-bar volume ÷ the average volume of the same minute over the prior 20 sessions (Alpaca 1-min SIP bars; needs ≥ 10 baseline sessions).

_Window: trades 2025-10-01 → 2026-09-30 · H1 2025-10-01 → 2026-03-31 · H2 2026-04-01 → 2026-09-30_

| setup | side | contract | RVOL ≥ 1.5: n · hold · take2x · H1/H2 take2x | RVOL < 1.5: n · hold · take2x · H1/H2 take2x |
|---|---|---|---|---|
| ORB 15-min break | long | nearest OTM | 496 · -0.06 · -0.05 · -0.09/-0.03 | 900 · -0.19 · -0.14 · -0.16/-0.13 |
| ORB 15-min break | long | cheapest lotto ($0.05–$0.50) | 466 · -0.46 · -0.19 · -0.28/-0.14 | 858 · -0.52 · -0.29 · -0.36/-0.24 |
| ORB 15-min break | long | near lotto ($0.05–$0.50, nearest the money) | 483 · -0.14 · -0.10 · -0.15/-0.06 | 882 · -0.35 · -0.19 · -0.24/-0.15 |
| ORB 15-min break | short | nearest OTM | 473 · 0.08 · -0.09 · -0.04/-0.12 | 861 · -0.18 · -0.15 · -0.10/-0.19 |
| ORB 15-min break | short | cheapest lotto ($0.05–$0.50) | 434 · 0.03 · -0.30 · -0.20/-0.39 | 793 · -0.74 · -0.36 · -0.28/-0.42 |
| ORB 15-min break | short | near lotto ($0.05–$0.50, nearest the money) | 463 · 0.12 · -0.19 · -0.13/-0.23 | 848 · -0.37 · -0.21 · -0.19/-0.23 |
| ORB 30-min break | long | nearest OTM | 534 · -0.14 · -0.06 · -0.06/-0.06 | 731 · -0.27 · -0.19 · -0.22/-0.17 |
| ORB 30-min break | long | cheapest lotto ($0.05–$0.50) | 504 · -0.38 · -0.24 · -0.28/-0.21 | 695 · -0.71 · -0.31 · -0.33/-0.29 |
| ORB 30-min break | long | near lotto ($0.05–$0.50, nearest the money) | 525 · -0.19 · -0.12 · -0.11/-0.12 | 716 · -0.46 · -0.23 · -0.26/-0.21 |
| ORB 30-min break | short | nearest OTM | 537 · 0.01 · -0.11 · -0.02/-0.19 | 660 · -0.22 · -0.13 · -0.14/-0.12 |
| ORB 30-min break | short | cheapest lotto ($0.05–$0.50) | 484 · 0.02 · -0.27 · -0.20/-0.33 | 607 · -0.59 · -0.33 · -0.35/-0.31 |
| ORB 30-min break | short | near lotto ($0.05–$0.50, nearest the money) | 522 · 0.09 · -0.16 · -0.16/-0.16 | 650 · -0.39 · -0.22 · -0.26/-0.20 |
| VWAP reclaim / loss | long | nearest OTM | 400 · -0.19 · -0.15 · -0.10/-0.19 | 1276 · -0.28 · -0.18 · -0.26/-0.12 |
| VWAP reclaim / loss | long | cheapest lotto ($0.05–$0.50) | 366 · -0.68 · -0.26 · -0.27/-0.24 | 1197 · -0.51 · -0.31 · -0.39/-0.26 |
| VWAP reclaim / loss | long | near lotto ($0.05–$0.50, nearest the money) | 388 · -0.25 · -0.18 · -0.11/-0.25 | 1249 · -0.39 · -0.21 · -0.33/-0.14 |
| VWAP reclaim / loss | short | nearest OTM | 369 · -0.17 · -0.16 · -0.14/-0.17 | 1338 · -0.16 · -0.15 · -0.10/-0.19 |
| VWAP reclaim / loss | short | cheapest lotto ($0.05–$0.50) | 333 · -0.48 · -0.47 · -0.46/-0.47 | 1191 · -0.51 · -0.37 · -0.35/-0.38 |
| VWAP reclaim / loss | short | near lotto ($0.05–$0.50, nearest the money) | 355 · -0.22 · -0.27 · -0.22/-0.31 | 1297 · -0.26 · -0.21 · -0.17/-0.24 |
| Level hold → VWAP reclaim | long | nearest OTM | 189 · -0.07 · -0.15 · -0.22/-0.08 | 733 · -0.39 · -0.24 · -0.33/-0.18 |
| Level hold → VWAP reclaim | long | cheapest lotto ($0.05–$0.50) | 176 · -0.20 · -0.25 · -0.31/-0.17 | 701 · -0.74 · -0.35 · -0.43/-0.30 |
| Level hold → VWAP reclaim | long | near lotto ($0.05–$0.50, nearest the money) | 185 · -0.00 · -0.20 · -0.23/-0.17 | 721 · -0.46 · -0.27 · -0.38/-0.20 |
| Level hold → VWAP reclaim | short | nearest OTM | 190 · -0.48 · -0.34 · -0.32/-0.35 | 825 · -0.12 · -0.19 · -0.15/-0.22 |
| Level hold → VWAP reclaim | short | cheapest lotto ($0.05–$0.50) | 178 · -0.85 · -0.56 · -0.49/-0.61 | 743 · -0.60 · -0.40 · -0.36/-0.43 |
| Level hold → VWAP reclaim | short | near lotto ($0.05–$0.50, nearest the money) | 188 · -0.67 · -0.39 · -0.30/-0.46 | 795 · -0.18 · -0.24 · -0.19/-0.27 |
| Prior-day high/low break & hold | long | nearest OTM | 144 · -0.14 · 0.05 · -0.02/0.11 | 379 · -0.21 · -0.17 · -0.16/-0.17 |
| Prior-day high/low break & hold | long | cheapest lotto ($0.05–$0.50) | 132 · -0.41 · -0.24 · -0.33/-0.17 | 349 · -0.56 · -0.35 · -0.33/-0.38 |
| Prior-day high/low break & hold | long | near lotto ($0.05–$0.50, nearest the money) | 145 · -0.05 · -0.10 · -0.13/-0.08 | 370 · -0.40 · -0.25 · -0.26/-0.25 |
| Prior-day high/low break & hold | short | nearest OTM | 182 · -0.14 · -0.11 · 0.01/-0.26 | 365 · -0.28 · -0.12 · -0.08/-0.15 |
| Prior-day high/low break & hold | short | cheapest lotto ($0.05–$0.50) | 156 · -0.92 · -0.36 · -0.30/-0.42 | 333 · -0.72 · -0.35 · -0.29/-0.39 |
| Prior-day high/low break & hold | short | near lotto ($0.05–$0.50, nearest the money) | 175 · -0.56 · -0.20 · -0.12/-0.30 | 356 · -0.40 · -0.15 · -0.12/-0.17 |
| Failed breakout fade | long | nearest OTM | 276 · -0.18 · -0.16 · -0.21/-0.10 | 896 · -0.37 · -0.26 · -0.28/-0.25 |
| Failed breakout fade | long | cheapest lotto ($0.05–$0.50) | 259 · -0.57 · -0.34 · -0.38/-0.30 | 834 · -0.75 · -0.47 · -0.49/-0.46 |
| Failed breakout fade | long | near lotto ($0.05–$0.50, nearest the money) | 274 · -0.26 · -0.20 · -0.28/-0.12 | 887 · -0.51 · -0.34 · -0.33/-0.34 |
| Failed breakout fade | short | nearest OTM | 288 · -0.01 · -0.20 · -0.21/-0.19 | 940 · -0.18 · -0.20 · -0.24/-0.17 |
| Failed breakout fade | short | cheapest lotto ($0.05–$0.50) | 268 · 1.28 · -0.37 · -0.29/-0.44 | 846 · -0.74 · -0.47 · -0.48/-0.46 |
| Failed breakout fade | short | near lotto ($0.05–$0.50, nearest the money) | 283 · 0.23 · -0.25 · -0.24/-0.25 | 916 · -0.34 · -0.30 · -0.31/-0.29 |
| Power-hour continuation | long | nearest OTM | 236 · -0.51 · -0.29 · -0.35/-0.24 | 619 · -0.41 · -0.30 · -0.30/-0.31 |
| Power-hour continuation | long | cheapest lotto ($0.05–$0.50) | 196 · -0.63 · -0.35 · -0.36/-0.35 | 508 · -0.35 · -0.33 · -0.30/-0.34 |
| Power-hour continuation | long | near lotto ($0.05–$0.50, nearest the money) | 201 · -0.54 · -0.33 · -0.36/-0.31 | 518 · -0.25 · -0.33 · -0.32/-0.33 |
| Power-hour continuation | short | nearest OTM | 246 · -0.37 · -0.15 · -0.06/-0.22 | 664 · -0.40 · -0.23 · -0.21/-0.25 |
| Power-hour continuation | short | cheapest lotto ($0.05–$0.50) | 205 · -0.80 · -0.23 · -0.11/-0.32 | 542 · -0.69 · -0.32 · -0.29/-0.33 |
| Power-hour continuation | short | near lotto ($0.05–$0.50, nearest the money) | 217 · -0.40 · -0.17 · -0.03/-0.26 | 565 · -0.50 · -0.22 · -0.20/-0.24 |
| Opening flush → reclaim | long | nearest OTM | 46 · -0.18 · -0.08 · -0.42/0.20 | 141 · -0.24 · -0.17 · -0.56/0.04 |
| Opening flush → reclaim | long | cheapest lotto ($0.05–$0.50) | 44 · -0.97 · -0.18 · -0.40/0.00 | 126 · -0.79 · -0.41 · -0.64/-0.29 |
| Opening flush → reclaim | long | near lotto ($0.05–$0.50, nearest the money) | 46 · -0.46 · -0.25 · -0.52/-0.01 | 139 · -0.45 · -0.24 · -0.55/-0.07 |
| Opening flush → reclaim | short | nearest OTM | 53 · 0.27 · -0.03 · -0.17/0.14 | 107 · 0.19 · -0.20 · -0.40/-0.05 |
| Opening flush → reclaim | short | cheapest lotto ($0.05–$0.50) | 50 · -0.02 · -0.12 · -0.11/-0.13 | 99 · -0.42 · -0.41 · -0.55/-0.32 |
| Opening flush → reclaim | short | near lotto ($0.05–$0.50, nearest the money) | 52 · 0.74 · -0.11 · -0.14/-0.08 | 106 · 0.45 · -0.28 · -0.47/-0.14 |
| Liquidity sweep → reclaim | long | nearest OTM | 420 · -0.26 · -0.23 · -0.24/-0.21 | 1179 · -0.27 · -0.19 · -0.22/-0.17 |
| Liquidity sweep → reclaim | long | cheapest lotto ($0.05–$0.50) | 381 · -0.52 · -0.46 · -0.50/-0.42 | 1091 · -0.67 · -0.39 · -0.43/-0.37 |
| Liquidity sweep → reclaim | long | near lotto ($0.05–$0.50, nearest the money) | 411 · -0.28 · -0.28 · -0.34/-0.23 | 1157 · -0.46 · -0.24 · -0.27/-0.23 |
| Liquidity sweep → reclaim | short | nearest OTM | 417 · -0.36 · -0.26 · -0.20/-0.31 | 1130 · -0.08 · -0.17 · -0.06/-0.24 |
| Liquidity sweep → reclaim | short | cheapest lotto ($0.05–$0.50) | 369 · -0.83 · -0.40 · -0.39/-0.42 | 1007 · -0.21 · -0.39 · -0.29/-0.46 |
| Liquidity sweep → reclaim | short | near lotto ($0.05–$0.50, nearest the money) | 410 · -0.30 · -0.33 · -0.28/-0.37 | 1090 · -0.06 · -0.22 · -0.10/-0.30 |
| Double sweep (second side) | long | nearest OTM | 177 · -0.14 · -0.15 · -0.22/-0.10 | 478 · -0.24 · -0.14 · -0.14/-0.14 |
| Double sweep (second side) | long | cheapest lotto ($0.05–$0.50) | 160 · -0.08 · -0.32 · -0.42/-0.23 | 435 · -0.63 · -0.35 · -0.40/-0.32 |
| Double sweep (second side) | long | near lotto ($0.05–$0.50, nearest the money) | 172 · 0.19 · -0.15 · -0.25/-0.08 | 461 · -0.40 · -0.20 · -0.21/-0.19 |
| Double sweep (second side) | short | nearest OTM | 162 · -0.44 · -0.23 · -0.20/-0.25 | 505 · 0.01 · -0.12 · 0.04/-0.23 |
| Double sweep (second side) | short | cheapest lotto ($0.05–$0.50) | 138 · -0.96 · -0.42 · -0.34/-0.50 | 441 · -0.20 · -0.31 · -0.18/-0.40 |
| Double sweep (second side) | short | near lotto ($0.05–$0.50, nearest the money) | 156 · -0.70 · -0.29 · -0.29/-0.30 | 480 · 0.08 · -0.19 · -0.04/-0.29 |
| Reactive zone, repeat touch | long | nearest OTM | 5996 · -0.29 · -0.23 · -0.28/-0.19 | 23460 · -0.37 · -0.25 · -0.31/-0.21 |
| Reactive zone, repeat touch | long | cheapest lotto ($0.05–$0.50) | 5554 · -0.54 · -0.38 · -0.41/-0.35 | 21570 · -0.50 · -0.37 · -0.39/-0.35 |
| Reactive zone, repeat touch | long | near lotto ($0.05–$0.50, nearest the money) | 5815 · -0.34 · -0.26 · -0.30/-0.23 | 22308 · -0.39 · -0.28 · -0.32/-0.24 |
| Reactive zone, repeat touch | short | nearest OTM | 6159 · -0.13 · -0.15 · -0.12/-0.18 | 22788 · -0.23 · -0.17 · -0.13/-0.20 |
| Reactive zone, repeat touch | short | cheapest lotto ($0.05–$0.50) | 5535 · -0.62 · -0.43 · -0.41/-0.45 | 20421 · -0.60 · -0.42 · -0.41/-0.43 |
| Reactive zone, repeat touch | short | near lotto ($0.05–$0.50, nearest the money) | 5945 · -0.26 · -0.23 · -0.20/-0.26 | 21660 · -0.33 · -0.21 · -0.17/-0.25 |

## Index ETFs vs single names

_Window: trades 2025-10-01 → 2026-09-30 · H1 2025-10-01 → 2026-03-31 · H2 2026-04-01 → 2026-09-30_

| setup | side | contract | index ETFs: n · hold · take2x · H1/H2 take2x | single names: n · hold · take2x · H1/H2 take2x |
|---|---|---|---|---|
| ORB 15-min break | long | nearest OTM | 539 · -0.16 · -0.14 · -0.14/-0.14 | 857 · -0.13 · -0.09 · -0.13/-0.07 |
| ORB 15-min break | long | cheapest lotto ($0.05–$0.50) | 536 · -0.58 · -0.30 · -0.32/-0.29 | 788 · -0.44 · -0.23 · -0.35/-0.15 |
| ORB 15-min break | long | near lotto ($0.05–$0.50, nearest the money) | 538 · -0.28 · -0.15 · -0.16/-0.13 | 827 · -0.28 · -0.16 · -0.26/-0.10 |
| ORB 15-min break | short | nearest OTM | 525 · -0.14 · -0.14 · -0.10/-0.19 | 809 · -0.05 · -0.12 · -0.06/-0.16 |
| ORB 15-min break | short | cheapest lotto ($0.05–$0.50) | 507 · -0.47 · -0.39 · -0.30/-0.48 | 720 · -0.46 · -0.30 · -0.21/-0.37 |
| ORB 15-min break | short | near lotto ($0.05–$0.50, nearest the money) | 525 · -0.32 · -0.26 · -0.22/-0.30 | 786 · -0.12 · -0.17 · -0.12/-0.20 |
| ORB 30-min break | long | nearest OTM | 490 · -0.20 · -0.15 · -0.13/-0.17 | 775 · -0.22 · -0.13 · -0.18/-0.10 |
| ORB 30-min break | long | cheapest lotto ($0.05–$0.50) | 479 · -0.65 · -0.30 · -0.25/-0.35 | 720 · -0.53 · -0.27 · -0.36/-0.20 |
| ORB 30-min break | long | near lotto ($0.05–$0.50, nearest the money) | 488 · -0.28 · -0.17 · -0.14/-0.20 | 753 · -0.38 · -0.19 · -0.25/-0.15 |
| ORB 30-min break | short | nearest OTM | 466 · -0.15 · -0.10 · -0.06/-0.15 | 731 · -0.09 · -0.13 · -0.10/-0.15 |
| ORB 30-min break | short | cheapest lotto ($0.05–$0.50) | 446 · -0.34 · -0.36 · -0.32/-0.40 | 645 · -0.30 · -0.27 · -0.25/-0.28 |
| ORB 30-min break | short | near lotto ($0.05–$0.50, nearest the money) | 467 · -0.26 · -0.22 · -0.25/-0.19 | 705 · -0.12 · -0.18 · -0.19/-0.18 |
| VWAP reclaim / loss | long | nearest OTM | 599 · -0.26 · -0.17 · -0.23/-0.11 | 1077 · -0.25 · -0.17 · -0.21/-0.15 |
| VWAP reclaim / loss | long | cheapest lotto ($0.05–$0.50) | 575 · -0.74 · -0.28 · -0.32/-0.25 | 988 · -0.45 · -0.31 · -0.39/-0.26 |
| VWAP reclaim / loss | long | near lotto ($0.05–$0.50, nearest the money) | 594 · -0.31 · -0.17 · -0.22/-0.13 | 1043 · -0.38 · -0.23 · -0.31/-0.18 |
| VWAP reclaim / loss | short | nearest OTM | 611 · -0.20 · -0.15 · -0.15/-0.15 | 1096 · -0.14 · -0.16 · -0.08/-0.21 |
| VWAP reclaim / loss | short | cheapest lotto ($0.05–$0.50) | 576 · -0.55 · -0.44 · -0.43/-0.46 | 948 · -0.47 · -0.36 · -0.33/-0.38 |
| VWAP reclaim / loss | short | near lotto ($0.05–$0.50, nearest the money) | 610 · -0.37 · -0.21 · -0.21/-0.21 | 1042 · -0.17 · -0.23 · -0.16/-0.27 |
| Level hold → VWAP reclaim | long | nearest OTM | 474 · -0.33 · -0.17 · -0.27/-0.09 | 448 · -0.33 · -0.28 · -0.35/-0.24 |
| Level hold → VWAP reclaim | long | cheapest lotto ($0.05–$0.50) | 458 · -0.77 · -0.27 · -0.33/-0.22 | 419 · -0.49 · -0.39 · -0.49/-0.34 |
| Level hold → VWAP reclaim | long | near lotto ($0.05–$0.50, nearest the money) | 471 · -0.41 · -0.19 · -0.29/-0.10 | 435 · -0.31 · -0.33 · -0.42/-0.28 |
| Level hold → VWAP reclaim | short | nearest OTM | 500 · -0.10 · -0.17 · -0.18/-0.16 | 515 · -0.27 · -0.26 · -0.19/-0.31 |
| Level hold → VWAP reclaim | short | cheapest lotto ($0.05–$0.50) | 474 · -0.63 · -0.46 · -0.44/-0.48 | 447 · -0.66 · -0.40 · -0.31/-0.46 |
| Level hold → VWAP reclaim | short | near lotto ($0.05–$0.50, nearest the money) | 500 · -0.18 · -0.24 · -0.23/-0.24 | 483 · -0.38 · -0.29 · -0.18/-0.36 |
| Prior-day high/low break & hold | long | nearest OTM | 187 · -0.20 · -0.16 · -0.13/-0.20 | 336 · -0.18 · -0.07 · -0.11/-0.05 |
| Prior-day high/low break & hold | long | cheapest lotto ($0.05–$0.50) | 181 · -0.81 · -0.33 · -0.31/-0.36 | 300 · -0.35 · -0.32 · -0.35/-0.30 |
| Prior-day high/low break & hold | long | near lotto ($0.05–$0.50, nearest the money) | 186 · -0.37 · -0.23 · -0.21/-0.25 | 329 · -0.26 · -0.20 · -0.23/-0.18 |
| Prior-day high/low break & hold | short | nearest OTM | 169 · -0.30 · 0.00 · 0.02/-0.02 | 378 · -0.20 · -0.17 · -0.08/-0.24 |
| Prior-day high/low break & hold | short | cheapest lotto ($0.05–$0.50) | 159 · -0.83 · -0.37 · -0.32/-0.43 | 330 · -0.76 · -0.34 · -0.28/-0.39 |
| Prior-day high/low break & hold | short | near lotto ($0.05–$0.50, nearest the money) | 170 · -0.58 · -0.14 · -0.17/-0.10 | 361 · -0.39 · -0.18 · -0.09/-0.24 |
| Failed breakout fade | long | nearest OTM | 450 · -0.26 · -0.19 · -0.25/-0.13 | 722 · -0.37 · -0.27 · -0.27/-0.27 |
| Failed breakout fade | long | cheapest lotto ($0.05–$0.50) | 434 · -0.59 · -0.33 · -0.39/-0.27 | 659 · -0.79 · -0.51 · -0.53/-0.51 |
| Failed breakout fade | long | near lotto ($0.05–$0.50, nearest the money) | 450 · -0.34 · -0.25 · -0.29/-0.21 | 711 · -0.53 · -0.34 · -0.33/-0.34 |
| Failed breakout fade | short | nearest OTM | 470 · -0.11 · -0.17 · -0.25/-0.10 | 758 · -0.15 · -0.22 · -0.22/-0.22 |
| Failed breakout fade | short | cheapest lotto ($0.05–$0.50) | 451 · -0.14 · -0.48 · -0.52/-0.45 | 663 · -0.34 · -0.42 · -0.37/-0.46 |
| Failed breakout fade | short | near lotto ($0.05–$0.50, nearest the money) | 470 · -0.17 · -0.24 · -0.32/-0.17 | 729 · -0.23 · -0.32 · -0.28/-0.34 |
| Power-hour continuation | long | nearest OTM | 319 · -0.58 · -0.40 · -0.36/-0.43 | 536 · -0.35 · -0.24 · -0.28/-0.23 |
| Power-hour continuation | long | cheapest lotto ($0.05–$0.50) | 287 · -0.77 · -0.44 · -0.34/-0.52 | 417 · -0.20 · -0.26 · -0.29/-0.25 |
| Power-hour continuation | long | near lotto ($0.05–$0.50, nearest the money) | 290 · -0.58 · -0.42 · -0.35/-0.49 | 429 · -0.16 · -0.26 · -0.31/-0.24 |
| Power-hour continuation | short | nearest OTM | 282 · -0.43 · -0.17 · -0.06/-0.29 | 628 · -0.38 · -0.23 · -0.23/-0.22 |
| Power-hour continuation | short | cheapest lotto ($0.05–$0.50) | 263 · -0.85 · -0.36 · -0.29/-0.43 | 484 · -0.65 · -0.25 · -0.22/-0.28 |
| Power-hour continuation | short | near lotto ($0.05–$0.50, nearest the money) | 269 · -0.47 · -0.20 · -0.12/-0.28 | 513 · -0.47 · -0.21 · -0.18/-0.24 |
| Opening flush → reclaim | long | nearest OTM | 51 · -0.25 · -0.05 · -0.55/0.43 | 136 · -0.21 · -0.19 · -0.49/-0.03 |
| Opening flush → reclaim | long | cheapest lotto ($0.05–$0.50) | 51 · -1.00 · -0.18 · -0.52/0.15 | 119 · -0.77 · -0.43 · -0.59/-0.35 |
| Opening flush → reclaim | long | near lotto ($0.05–$0.50, nearest the money) | 51 · -0.49 · -0.13 · -0.60/0.33 | 134 · -0.44 · -0.28 · -0.51/-0.17 |
| Opening flush → reclaim | short | nearest OTM | 37 · -0.37 · 0.00 · -0.50/0.58 | 123 · 0.39 · -0.18 · -0.24/-0.14 |
| Opening flush → reclaim | short | cheapest lotto ($0.05–$0.50) | 35 · -1.00 · -0.37 · -0.56/-0.18 | 114 · -0.07 · -0.30 · -0.31/-0.29 |
| Opening flush → reclaim | short | near lotto ($0.05–$0.50, nearest the money) | 37 · -0.82 · -0.24 · -0.50/0.06 | 121 · 0.96 · -0.22 · -0.28/-0.16 |
| Liquidity sweep → reclaim | long | nearest OTM | 322 · -0.27 · -0.21 · -0.26/-0.16 | 1277 · -0.27 · -0.20 · -0.21/-0.19 |
| Liquidity sweep → reclaim | long | cheapest lotto ($0.05–$0.50) | 312 · -0.32 · -0.37 · -0.43/-0.29 | 1160 · -0.71 · -0.42 · -0.46/-0.40 |
| Liquidity sweep → reclaim | long | near lotto ($0.05–$0.50, nearest the money) | 322 · -0.38 · -0.25 · -0.31/-0.18 | 1246 · -0.42 · -0.25 · -0.28/-0.23 |
| Liquidity sweep → reclaim | short | nearest OTM | 290 · -0.16 · -0.23 · -0.20/-0.25 | 1257 · -0.16 · -0.18 · -0.07/-0.26 |
| Liquidity sweep → reclaim | short | cheapest lotto ($0.05–$0.50) | 280 · -0.02 · -0.43 · -0.40/-0.46 | 1096 · -0.47 · -0.39 · -0.29/-0.45 |
| Liquidity sweep → reclaim | short | near lotto ($0.05–$0.50, nearest the money) | 290 · -0.17 · -0.28 · -0.22/-0.35 | 1210 · -0.12 · -0.24 · -0.13/-0.31 |
| Double sweep (second side) | long | nearest OTM | 82 · -0.23 · -0.26 · -0.28/-0.23 | 573 · -0.21 · -0.13 · -0.13/-0.12 |
| Double sweep (second side) | long | cheapest lotto ($0.05–$0.50) | 79 · 0.78 · -0.34 · -0.41/-0.26 | 516 · -0.67 · -0.34 · -0.41/-0.30 |
| Double sweep (second side) | long | near lotto ($0.05–$0.50, nearest the money) | 82 · -0.13 · -0.24 · -0.23/-0.24 | 551 · -0.26 · -0.18 · -0.22/-0.15 |
| Double sweep (second side) | short | nearest OTM | 98 · -0.35 · -0.27 · -0.24/-0.30 | 569 · -0.06 · -0.12 · 0.03/-0.22 |
| Double sweep (second side) | short | cheapest lotto ($0.05–$0.50) | 96 · -1.00 · -0.46 · -0.34/-0.61 | 483 · -0.25 · -0.31 · -0.19/-0.40 |
| Double sweep (second side) | short | near lotto ($0.05–$0.50, nearest the money) | 98 · -0.57 · -0.33 · -0.28/-0.40 | 538 · -0.02 · -0.20 · -0.07/-0.28 |
| Reactive zone, repeat touch | long | nearest OTM | 16604 · -0.38 · -0.28 · -0.32/-0.24 | 12852 · -0.32 · -0.21 · -0.29/-0.16 |
| Reactive zone, repeat touch | long | cheapest lotto ($0.05–$0.50) | 15923 · -0.64 · -0.39 · -0.41/-0.37 | 11201 · -0.32 · -0.35 · -0.38/-0.34 |
| Reactive zone, repeat touch | long | near lotto ($0.05–$0.50, nearest the money) | 16277 · -0.41 · -0.28 · -0.31/-0.25 | 11846 · -0.33 · -0.26 · -0.32/-0.23 |
| Reactive zone, repeat touch | short | nearest OTM | 16323 · -0.23 · -0.20 · -0.15/-0.24 | 12624 · -0.17 · -0.13 · -0.09/-0.15 |
| Reactive zone, repeat touch | short | cheapest lotto ($0.05–$0.50) | 15321 · -0.68 · -0.51 · -0.47/-0.54 | 10635 · -0.48 · -0.31 · -0.29/-0.32 |
| Reactive zone, repeat touch | short | near lotto ($0.05–$0.50, nearest the money) | 16138 · -0.35 · -0.24 · -0.19/-0.28 | 11467 · -0.27 · -0.19 · -0.16/-0.21 |

## Reactive zone — does the zone wear out? (by touch number)

Touch 2 is the first tradeable touch (touch 1 made the zone; a ≥ 1×ATR(5-min) reaction made it reactive). Price-derived zones only — no historical GEX chains exist, so GEX zones run live only.

_Window: trades 2025-10-01 → 2026-09-30 · H1 2025-10-01 → 2026-03-31 · H2 2026-04-01 → 2026-09-30_

| setup | side | contract | touch 2: n · hold · take2x · H1/H2 take2x | touch 3: n · hold · take2x · H1/H2 take2x | touch 4: n · hold · take2x · H1/H2 take2x | touch 5+: n · hold · take2x · H1/H2 take2x |
|---|---|---|---|---|---|---|
| Reactive zone, repeat touch | long | nearest OTM | 10143 · -0.29 · -0.21 · -0.26/-0.16 | 8693 · -0.32 · -0.23 · -0.28/-0.20 | 3798 · -0.35 · -0.25 · -0.32/-0.20 | 6822 · -0.48 · -0.33 · -0.40/-0.27 |
| Reactive zone, repeat touch | long | cheapest lotto ($0.05–$0.50) | 9378 · -0.49 · -0.38 · -0.41/-0.36 | 7908 · -0.33 · -0.36 · -0.38/-0.35 | 3483 · -0.58 · -0.37 · -0.38/-0.36 | 6355 · -0.71 · -0.38 · -0.42/-0.34 |
| Reactive zone, repeat touch | long | near lotto ($0.05–$0.50, nearest the money) | 9830 · -0.34 · -0.25 · -0.28/-0.23 | 8257 · -0.32 · -0.26 · -0.29/-0.24 | 3576 · -0.40 · -0.28 · -0.33/-0.24 | 6460 · -0.51 · -0.32 · -0.38/-0.27 |
| Reactive zone, repeat touch | short | nearest OTM | 10349 · -0.18 · -0.16 · -0.14/-0.18 | 8466 · -0.19 · -0.14 · -0.10/-0.16 | 3703 · -0.20 · -0.16 · -0.10/-0.20 | 6429 · -0.26 · -0.21 · -0.15/-0.27 |
| Reactive zone, repeat touch | short | cheapest lotto ($0.05–$0.50) | 9266 · -0.60 · -0.43 · -0.41/-0.44 | 7494 · -0.55 · -0.37 · -0.36/-0.38 | 3281 · -0.48 · -0.41 · -0.39/-0.42 | 5915 · -0.74 · -0.49 · -0.47/-0.51 |
| Reactive zone, repeat touch | short | near lotto ($0.05–$0.50, nearest the money) | 10003 · -0.32 · -0.23 · -0.21/-0.25 | 7996 · -0.31 · -0.20 · -0.16/-0.23 | 3467 · -0.30 · -0.20 · -0.15/-0.23 | 6139 · -0.33 · -0.23 · -0.16/-0.28 |

## Reactive zone — by zone source

_Window: trades 2025-10-01 → 2026-09-30 · H1 2025-10-01 → 2026-03-31 · H2 2026-04-01 → 2026-09-30_

| setup | side | contract | zone prior_day: n · hold · take2x · H1/H2 take2x | zone premarket: n · hold · take2x · H1/H2 take2x | zone round: n · hold · take2x · H1/H2 take2x | zone session_pivot: n · hold · take2x · H1/H2 take2x |
|---|---|---|---|---|---|---|
| Reactive zone, repeat touch | long | nearest OTM | 3288 · -0.27 · -0.19 · -0.25/-0.14 | 2753 · -0.32 · -0.28 · -0.27/-0.30 | 8114 · -0.37 · -0.26 · -0.29/-0.23 | 15301 · -0.36 · -0.25 · -0.34/-0.19 |
| Reactive zone, repeat touch | long | cheapest lotto ($0.05–$0.50) | 3075 · -0.34 · -0.35 · -0.35/-0.35 | 2554 · -0.25 · -0.40 · -0.37/-0.43 | 7556 · -0.60 · -0.38 · -0.39/-0.38 | 13939 · -0.54 · -0.37 · -0.42/-0.33 |
| Reactive zone, repeat touch | long | near lotto ($0.05–$0.50, nearest the money) | 3182 · -0.34 · -0.24 · -0.28/-0.22 | 2660 · -0.29 · -0.31 · -0.26/-0.35 | 7826 · -0.38 · -0.26 · -0.28/-0.25 | 14455 · -0.40 · -0.28 · -0.35/-0.22 |
| Reactive zone, repeat touch | short | nearest OTM | 3634 · -0.24 · -0.21 · -0.15/-0.26 | 2414 · -0.26 · -0.16 · -0.08/-0.21 | 8005 · -0.24 · -0.21 · -0.19/-0.22 | 14894 · -0.17 · -0.14 · -0.09/-0.17 |
| Reactive zone, repeat touch | short | cheapest lotto ($0.05–$0.50) | 3325 · -0.72 · -0.41 · -0.39/-0.42 | 2156 · -0.34 · -0.44 · -0.38/-0.48 | 7259 · -0.69 · -0.52 · -0.49/-0.54 | 13216 · -0.57 · -0.38 · -0.37/-0.38 |
| Reactive zone, repeat touch | short | near lotto ($0.05–$0.50, nearest the money) | 3533 · -0.35 · -0.24 · -0.19/-0.29 | 2307 · -0.36 · -0.21 · -0.14/-0.27 | 7774 · -0.38 · -0.26 · -0.24/-0.28 | 13991 · -0.27 · -0.19 · -0.15/-0.22 |

## Liquidity sweeps — by the level swept

Long = a LOW was swept (calls); short = a HIGH was swept (puts). double_sweep = the second side of a session in which both sides were swept.

_Window: trades 2025-10-01 → 2026-09-30 · H1 2025-10-01 → 2026-03-31 · H2 2026-04-01 → 2026-09-30_

| setup | side | contract | swept prior-day: n · hold · take2x · H1/H2 take2x | swept pre-market: n · hold · take2x · H1/H2 take2x | swept opening range: n · hold · take2x · H1/H2 take2x | swept equal highs/lows: n · hold · take2x · H1/H2 take2x |
|---|---|---|---|---|---|---|
| Liquidity sweep → reclaim | long | nearest OTM | 129 · -0.38 · -0.19 · -0.19/-0.19 | 155 · -0.36 · -0.25 · -0.31/-0.18 | 384 · -0.25 · -0.28 · -0.30/-0.27 | 931 · -0.24 · -0.16 · -0.18/-0.15 |
| Liquidity sweep → reclaim | long | cheapest lotto ($0.05–$0.50) | 121 · -0.94 · -0.54 · -0.53/-0.54 | 141 · -0.95 · -0.42 · -0.45/-0.39 | 360 · -0.69 · -0.52 · -0.53/-0.52 | 850 · -0.51 · -0.34 · -0.41/-0.30 |
| Liquidity sweep → reclaim | long | near lotto ($0.05–$0.50, nearest the money) | 126 · -0.71 · -0.31 · -0.32/-0.30 | 155 · -0.69 · -0.34 · -0.42/-0.26 | 383 · -0.42 · -0.35 · -0.39/-0.33 | 904 · -0.33 · -0.18 · -0.22/-0.16 |
| Liquidity sweep → reclaim | short | nearest OTM | 114 · -0.10 · -0.21 · -0.35/-0.14 | 172 · -0.05 · -0.29 · -0.23/-0.33 | 342 · -0.14 · -0.22 · -0.19/-0.24 | 919 · -0.19 · -0.16 · -0.01/-0.27 |
| Liquidity sweep → reclaim | short | cheapest lotto ($0.05–$0.50) | 105 · -0.60 · -0.45 · -0.47/-0.44 | 158 · -0.02 · -0.47 · -0.37/-0.55 | 306 · -0.60 · -0.46 · -0.41/-0.49 | 807 · -0.33 · -0.35 · -0.26/-0.41 |
| Liquidity sweep → reclaim | short | near lotto ($0.05–$0.50, nearest the money) | 112 · 0.18 · -0.25 · -0.39/-0.18 | 170 · 0.08 · -0.35 · -0.22/-0.46 | 335 · -0.06 · -0.25 · -0.21/-0.28 | 883 · -0.23 · -0.23 · -0.09/-0.33 |
| Double sweep (second side) | long | nearest OTM | 21 · -0.03 · -0.24 · -0.29/-0.14 | 23 · -0.93 · -0.79 · -0.75/-0.81 | 49 · -0.56 · -0.29 · -0.53/-0.17 | 562 · -0.16 · -0.10 · -0.10/-0.10 |
| Double sweep (second side) | long | cheapest lotto ($0.05–$0.50) | 20 · -0.82 · -0.40 · -0.43/-0.33 | 20 · -1.00 · -0.70 · -0.71/-0.69 | 47 · -1.00 · -0.53 · -0.53/-0.53 | 508 · -0.40 · -0.31 · -0.39/-0.26 |
| Double sweep (second side) | long | near lotto ($0.05–$0.50, nearest the money) | 21 · 0.01 · -0.24 · -0.29/-0.14 | 22 · -1.00 · -0.82 · -0.71/-0.87 | 49 · -0.68 · -0.35 · -0.41/-0.31 | 541 · -0.18 · -0.14 · -0.19/-0.12 |
| Double sweep (second side) | short | nearest OTM | 23 · -0.24 · -0.41 · 0.03/-0.51 | 25 · -0.19 · -0.24 · -0.12/-0.39 | 45 · -0.26 · -0.33 · -0.56/-0.17 | 574 · -0.08 · -0.11 · 0.02/-0.21 |
| Double sweep (second side) | short | cheapest lotto ($0.05–$0.50) | 20 · -0.73 · -0.40 · 0.50/-0.63 | 22 · -1.00 · -0.18 · -0.08/-0.33 | 40 · -1.00 · -0.65 · -0.77/-0.56 | 497 · -0.29 · -0.32 · -0.20/-0.40 |
| Double sweep (second side) | short | near lotto ($0.05–$0.50, nearest the money) | 22 · -0.52 · -0.46 · 0.00/-0.56 | 24 · -0.18 · -0.16 · 0.02/-0.40 | 44 · -0.49 · -0.38 · -0.44/-0.33 | 546 · -0.06 · -0.20 · -0.10/-0.27 |

## Time of day (hold-to-close expectancy, n)

_Window: trades 2025-10-01 → 2026-09-30 · H1 2025-10-01 → 2026-03-31 · H2 2026-04-01 → 2026-09-30_

| setup | side | contract | 09:35-10:59 | 11:00-12:59 | 13:00-14:29 | 14:30-15:30 |
|---|---|---|---|---|---|---|
| ORB 15-min break | long | nearest OTM | -0.09 (1169) | -0.35 (151) | -0.83 (50) | 0.04 (26) |
| ORB 15-min break | long | cheapest lotto ($0.05–$0.50) | -0.46 (1116) | -0.72 (142) | -0.99 (46) | 0.14 (20) |
| ORB 15-min break | long | near lotto ($0.05–$0.50, nearest the money) | -0.25 (1153) | -0.37 (146) | -0.99 (46) | 0.17 (20) |
| ORB 15-min break | short | nearest OTM | -0.04 (1109) | -0.18 (146) | -0.53 (43) | -0.64 (36) |
| ORB 15-min break | short | cheapest lotto ($0.05–$0.50) | -0.45 (1023) | -0.36 (137) | -1.00 (37) | -0.80 (30) |
| ORB 15-min break | short | near lotto ($0.05–$0.50, nearest the money) | -0.20 (1096) | 0.01 (144) | -0.62 (40) | -0.80 (31) |
| ORB 30-min break | long | nearest OTM | -0.15 (949) | -0.38 (218) | -0.65 (65) | -0.18 (33) |
| ORB 30-min break | long | cheapest lotto ($0.05–$0.50) | -0.52 (905) | -0.80 (209) | -0.80 (61) | -0.05 (24) |
| ORB 30-min break | long | near lotto ($0.05–$0.50, nearest the money) | -0.30 (941) | -0.43 (213) | -0.88 (62) | -0.07 (25) |
| ORB 30-min break | short | nearest OTM | -0.05 (891) | -0.14 (200) | -0.54 (58) | -0.66 (48) |
| ORB 30-min break | short | cheapest lotto ($0.05–$0.50) | -0.41 (816) | 0.37 (183) | -0.99 (52) | -0.85 (40) |
| ORB 30-min break | short | near lotto ($0.05–$0.50, nearest the money) | -0.18 (880) | 0.15 (195) | -0.68 (55) | -0.77 (42) |
| VWAP reclaim / loss | long | nearest OTM | -0.24 (999) | -0.21 (440) | -0.29 (158) | -0.63 (79) |
| VWAP reclaim / loss | long | cheapest lotto ($0.05–$0.50) | -0.69 (947) | -0.21 (403) | -0.50 (147) | -0.70 (66) |
| VWAP reclaim / loss | long | near lotto ($0.05–$0.50, nearest the money) | -0.34 (991) | -0.35 (425) | -0.33 (151) | -0.62 (70) |
| VWAP reclaim / loss | short | nearest OTM | -0.11 (999) | -0.22 (470) | -0.29 (154) | -0.26 (84) |
| VWAP reclaim / loss | short | cheapest lotto ($0.05–$0.50) | -0.39 (909) | -0.66 (414) | -0.66 (130) | -0.80 (71) |
| VWAP reclaim / loss | short | near lotto ($0.05–$0.50, nearest the money) | -0.15 (989) | -0.38 (453) | -0.57 (136) | -0.15 (74) |
| Level hold → VWAP reclaim | long | nearest OTM | -0.39 (386) | -0.24 (332) | -0.18 (129) | -0.63 (75) |
| Level hold → VWAP reclaim | long | cheapest lotto ($0.05–$0.50) | -0.82 (372) | -0.62 (316) | -0.10 (122) | -0.63 (67) |
| Level hold → VWAP reclaim | long | near lotto ($0.05–$0.50, nearest the money) | -0.51 (385) | -0.24 (326) | -0.15 (126) | -0.55 (69) |
| Level hold → VWAP reclaim | short | nearest OTM | -0.01 (417) | -0.26 (359) | -0.35 (149) | -0.43 (90) |
| Level hold → VWAP reclaim | short | cheapest lotto ($0.05–$0.50) | -0.50 (383) | -0.80 (328) | -0.61 (133) | -0.77 (77) |
| Level hold → VWAP reclaim | short | near lotto ($0.05–$0.50, nearest the money) | 0.05 (413) | -0.52 (352) | -0.51 (140) | -0.47 (78) |
| Prior-day high/low break & hold | long | nearest OTM | -0.17 (376) | 0.05 (94) | -0.76 (33) | -0.62 (20) |
| Prior-day high/low break & hold | long | cheapest lotto ($0.05–$0.50) | -0.52 (343) | -0.29 (89) | -1.00 (33) | -0.89 (16) |
| Prior-day high/low break & hold | long | near lotto ($0.05–$0.50, nearest the money) | -0.24 (371) | -0.23 (94) | -0.85 (33) | -0.83 (17) |
| Prior-day high/low break & hold | short | nearest OTM | -0.14 (362) | -0.30 (124) | -0.46 (32) | -0.75 (29) |
| Prior-day high/low break & hold | short | cheapest lotto ($0.05–$0.50) | -0.73 (333) | -0.87 (103) | -0.92 (28) | -1.00 (25) |
| Prior-day high/low break & hold | short | near lotto ($0.05–$0.50, nearest the money) | -0.33 (357) | -0.69 (117) | -0.71 (31) | -0.74 (26) |
| Failed breakout fade | long | nearest OTM | -0.38 (845) | -0.20 (223) | -0.26 (59) | 0.01 (45) |
| Failed breakout fade | long | cheapest lotto ($0.05–$0.50) | -0.84 (791) | -0.30 (209) | -0.78 (54) | -0.18 (39) |
| Failed breakout fade | long | near lotto ($0.05–$0.50, nearest the money) | -0.57 (838) | -0.15 (224) | -0.41 (58) | 0.27 (41) |
| Failed breakout fade | short | nearest OTM | -0.17 (870) | -0.12 (246) | -0.01 (72) | 0.35 (40) |
| Failed breakout fade | short | cheapest lotto ($0.05–$0.50) | -0.23 (796) | -0.93 (229) | -0.79 (57) | 4.85 (32) |
| Failed breakout fade | short | near lotto ($0.05–$0.50, nearest the money) | -0.20 (860) | -0.44 (239) | -0.10 (65) | 0.86 (35) |
| Power-hour continuation | long | nearest OTM | — | — | — | -0.44 (855) |
| Power-hour continuation | long | cheapest lotto ($0.05–$0.50) | — | — | — | -0.43 (704) |
| Power-hour continuation | long | near lotto ($0.05–$0.50, nearest the money) | — | — | — | -0.33 (719) |
| Power-hour continuation | short | nearest OTM | — | — | — | -0.39 (910) |
| Power-hour continuation | short | cheapest lotto ($0.05–$0.50) | — | — | — | -0.72 (747) |
| Power-hour continuation | short | near lotto ($0.05–$0.50, nearest the money) | — | — | — | -0.47 (782) |
| Opening flush → reclaim | long | nearest OTM | -0.18 (170) | -0.67 (17) | — | — |
| Opening flush → reclaim | long | cheapest lotto ($0.05–$0.50) | -0.82 (154) | -1.00 (16) | — | — |
| Opening flush → reclaim | long | near lotto ($0.05–$0.50, nearest the money) | -0.41 (168) | -0.88 (17) | — | — |
| Opening flush → reclaim | short | nearest OTM | 0.22 (145) | 0.22 (15) | — | — |
| Opening flush → reclaim | short | cheapest lotto ($0.05–$0.50) | -0.25 (135) | -0.69 (14) | — | — |
| Opening flush → reclaim | short | near lotto ($0.05–$0.50, nearest the money) | 0.59 (143) | 0.11 (15) | — | — |
| Liquidity sweep → reclaim | long | nearest OTM | -0.29 (979) | -0.26 (466) | -0.04 (104) | -0.47 (50) |
| Liquidity sweep → reclaim | long | cheapest lotto ($0.05–$0.50) | -0.74 (907) | -0.69 (429) | 0.86 (93) | -0.85 (43) |
| Liquidity sweep → reclaim | long | near lotto ($0.05–$0.50, nearest the money) | -0.46 (971) | -0.40 (455) | 0.11 (98) | -0.66 (44) |
| Liquidity sweep → reclaim | short | nearest OTM | -0.13 (951) | -0.18 (449) | -0.16 (105) | -0.53 (42) |
| Liquidity sweep → reclaim | short | cheapest lotto ($0.05–$0.50) | -0.22 (864) | -0.59 (386) | -0.82 (86) | -0.72 (40) |
| Liquidity sweep → reclaim | short | near lotto ($0.05–$0.50, nearest the money) | 0.02 (935) | -0.38 (425) | -0.21 (100) | -0.57 (40) |
| Double sweep (second side) | long | nearest OTM | -0.34 (216) | -0.16 (309) | 0.04 (87) | -0.52 (43) |
| Double sweep (second side) | long | cheapest lotto ($0.05–$0.50) | -0.69 (201) | -0.73 (280) | 1.19 (77) | -0.96 (37) |
| Double sweep (second side) | long | near lotto ($0.05–$0.50, nearest the money) | -0.21 (214) | -0.34 (299) | 0.27 (82) | -0.75 (38) |
| Double sweep (second side) | short | nearest OTM | -0.02 (224) | -0.12 (322) | -0.05 (89) | -0.60 (32) |
| Double sweep (second side) | short | cheapest lotto ($0.05–$0.50) | -0.00 (202) | -0.52 (274) | -0.79 (73) | -0.64 (30) |
| Double sweep (second side) | short | near lotto ($0.05–$0.50, nearest the money) | 0.25 (219) | -0.33 (302) | -0.07 (85) | -0.64 (30) |
| Reactive zone, repeat touch | long | nearest OTM | -0.24 (2957) | -0.28 (8673) | -0.36 (9716) | -0.45 (8100) |
| Reactive zone, repeat touch | long | cheapest lotto ($0.05–$0.50) | -0.72 (2795) | -0.51 (8206) | -0.44 (9069) | -0.51 (7046) |
| Reactive zone, repeat touch | long | near lotto ($0.05–$0.50, nearest the money) | -0.35 (2949) | -0.34 (8565) | -0.39 (9413) | -0.42 (7188) |
| Reactive zone, repeat touch | short | nearest OTM | -0.12 (3095) | -0.20 (8771) | -0.20 (9619) | -0.26 (7455) |
| Reactive zone, repeat touch | short | cheapest lotto ($0.05–$0.50) | 0.09 (2875) | -0.78 (7980) | -0.69 (8704) | -0.57 (6392) |
| Reactive zone, repeat touch | short | near lotto ($0.05–$0.50, nearest the money) | -0.20 (3086) | -0.40 (8641) | -0.34 (9253) | -0.25 (6620) |

## 0DTE sessions discovered per symbol

_Window: trades 2025-10-01 → 2026-09-30 · H1 2025-10-01 → 2026-03-31 · H2 2026-04-01 → 2026-09-30_

| symbol | sessions with a same-day expiry and ≥ 1 trigger | first | by weekday |
|---|---|---|---|
| SPY | 251 | 2025-10-01 | Wed 53, Thu 49, Fri 49, Mon 48, Tue 52 |
| QQQ | 251 | 2025-10-01 | Wed 53, Thu 49, Fri 49, Mon 48, Tue 52 |
| IWM | 250 | 2025-10-01 | Wed 52, Thu 49, Fri 49, Mon 48, Tue 52 |
| TSLA | 119 | 2025-10-03 | Fri 49, Mon 32, Wed 34, Thu 3, Tue 1 |
| NVDA | 118 | 2025-10-03 | Fri 49, Mon 32, Wed 33, Thu 3, Tue 1 |
| AMD | 75 | 2025-10-03 | Fri 49, Thu 3, Mon 11, Wed 12 |
| META | 118 | 2025-10-03 | Fri 49, Mon 32, Wed 33, Thu 3, Tue 1 |
| MSTR | 52 | 2025-10-03 | Fri 49, Thu 3 |
| AAPL | 120 | 2025-10-03 | Fri 49, Mon 32, Wed 35, Thu 3, Tue 1 |
| AMZN | 120 | 2025-10-03 | Fri 49, Mon 32, Wed 35, Thu 3, Tue 1 |
| GOOGL | 118 | 2025-10-03 | Fri 49, Mon 32, Wed 33, Thu 3, Tue 1 |
| MSFT | 118 | 2025-10-03 | Fri 49, Mon 32, Wed 33, Thu 3, Tue 1 |
| AVGO | 119 | 2025-10-03 | Fri 49, Mon 32, Wed 34, Thu 3, Tue 1 |
| PLTR | 52 | 2025-10-03 | Fri 49, Thu 3 |
| COIN | 52 | 2025-10-03 | Fri 49, Thu 3 |
| NFLX | 46 | 2025-11-14 | Fri 43, Thu 3 |
| SMCI | 52 | 2025-10-03 | Fri 49, Thu 3 |
| MU | 74 | 2025-10-03 | Fri 49, Thu 3, Mon 11, Wed 11 |
| HOOD | 52 | 2025-10-03 | Fri 49, Thu 3 |
| BE | 52 | 2025-10-03 | Fri 49, Thu 3 |

## Exits

- `hold` — hold to the close (expiry value)
- `take2x` — sell all at 2× (a 1-min bar high touches 2×)
- `take2x_close` — sell all at 2× only on a 1-min CLOSE ≥ 2× (filled at that close)
- `half3x` — sell half at 3×, hold the rest to the close
- `stop50` — stop at −50%, else hold to the close
- `stop50_take2x` — stop at −50% / sell all at 2×, whichever first
- `level_stop` — out when the underlying closes back through the trigger level by > 0.05% (sold at the next option print), else hold
- `level_stop_take2x` — level stop / sell all at 2×, whichever first

## Method and caveats

- Detectors are the live engine's own (`server/zero-dte-sniper-core.ts`), causal bar by bar (tested: every trigger reappears at the same bar on the day truncated there, and not a bar earlier); each setup fires once per side per session, except reactive_zone (every holding touch).
- 0DTE sessions discovered from Alpaca's expired-contract listings per symbol; half-days skipped. SPX: Alpaca lists SPXW only for recent months and its 1-min bars are sparse (2–5 prints per near-OTM contract per session in a spot check), so SPY stands in for SPX here.
- Contract chosen with trigger-minute data only. Entry = the high of the next minute's option bar (no historical quotes on this plan). Exits at 2×/3× assume a fill at the touched price — on thin lottos a 1-min high is often a single print, so `take2x_close` (needs a 1-min close ≥ 2×) is the honest check. Level stops sell at the next option bar's open.
- Expiry value = intrinsic at the 15:59 bar close; no commissions, no slippage on the way out.
- Survivorship: the universe is today's liquid 0DTE names. Multiple comparisons: 11 setups × 2 sides × 3 contracts × 8 exits = 528 cells, plus the sub-cell splits; a few pass both halves by chance, so live measuring is still required.
- Walk-forward halves are the two calendar halves of the 12-month window (split date above); a cell survives only if the same exit is positive in both halves, with and without each half's best trade, with ≥ 20 trades per half.
- Reactive zones here are price-derived only (prior-day H/L/C, pre-market H/L, round numbers — SPY $1, singles $5 under $200 else $10 — and today's swing lows/highs). GEX levels have no history; the live sniper adds them from the chart GEX recorder and they are UNMEASURED.

## The AMD 2026-09-30 example

- 09:43 ET · Failed breakout fade · long · prior-day low · RVOL 0.60
- 09:43 ET · Liquidity sweep → reclaim · long · prior-day low · RVOL 0.60
- 09:53 ET · ORB 15-min break · short · OR15L · RVOL 1.02
- 09:54 ET · Prior-day high/low break & hold · short · prior-day low · RVOL 0.42
- 10:50 ET · Double sweep (second side) · short · equal highs · RVOL 0.63
- 10:50 ET · Liquidity sweep → reclaim · short · equal highs · RVOL 0.63
- 11:02 ET · Reactive zone, repeat touch · long · touch 2 · session low · RVOL 0.58
- 11:14 ET · ORB 30-min break · short · OR30L · RVOL 1.81
- 12:06 ET · Reactive zone, repeat touch · short · touch 3 · intraday swing high · RVOL 0.86
- 12:20 ET · Reactive zone, repeat touch · long · touch 2 · session low · RVOL 0.37
- 12:30 ET · Reactive zone, repeat touch · long · touch 3 · intraday swing low · RVOL 0.50
- 12:33 ET · Reactive zone, repeat touch · long · touch 3 · intraday swing low · RVOL 1.52
- 12:36 ET · Reactive zone, repeat touch · long · touch 2 · pre-market low · RVOL 1.09
- 12:57 ET · Reactive zone, repeat touch · short · touch 3 · intraday swing high · RVOL 0.99
- 12:58 ET · Level hold → VWAP reclaim · long · round 600 · RVOL 3.36
- 12:58 ET · VWAP reclaim / loss · long · VWAP · RVOL 3.36
- 13:26 ET · VWAP reclaim / loss · short · VWAP · RVOL 0.37
- 13:39 ET · Reactive zone, repeat touch · short · touch 2 · prior-day low · RVOL 0.76
- 13:56 ET · Reactive zone, repeat touch · short · touch 2 · prior close · RVOL 1.13
- 14:04 ET · Reactive zone, repeat touch · short · touch 3 · prior close · RVOL 0.66
- 14:39 ET · Reactive zone, repeat touch · short · touch 2 · round 610 · RVOL 3.30
- 14:49 ET · Reactive zone, repeat touch · long · touch 2 · prior close · RVOL 3.21
- 14:57 ET · Reactive zone, repeat touch · short · touch 3 · round 610 · RVOL 1.11
- 15:04 ET · Power-hour continuation · long · VWAP · RVOL 1.49
- 15:04 ET · Reactive zone, repeat touch · short · touch 2 · pre-market high · RVOL 1.49
  - failed_breakout long otm1: AMD260930C00607500 entry 3.9 → max 1.821× · hold 0.09 · take2x 0.09 · level_stop -0.31
  - failed_breakout long lotto: AMD260930C00632500 entry 0.05 → max 1.2× · hold -1.00 · take2x -1.00 · level_stop 0.00
  - failed_breakout long lotto_near: AMD260930C00620000 entry 0.56 → max 1.339× · hold -1.00 · take2x -1.00 · level_stop -0.41
  - liquidity_sweep long otm1: AMD260930C00607500 entry 3.9 → max 1.821× · hold 0.09 · take2x 0.09 · level_stop -0.31
  - liquidity_sweep long lotto: AMD260930C00632500 entry 0.05 → max 1.2× · hold -1.00 · take2x -1.00 · level_stop 0.00
  - liquidity_sweep long lotto_near: AMD260930C00620000 entry 0.56 → max 1.339× · hold -1.00 · take2x -1.00 · level_stop -0.41
  - reactive_zone long otm1: AMD260930C00605000 entry 2.07 → max 4.396× · hold 2.26 · take2x 1.00 · level_stop -0.23
  - reactive_zone long lotto: AMD260930C00620000 entry 0.08 → max 9.375× · hold -1.00 · take2x 1.00 · level_stop -0.25
  - reactive_zone long lotto_near: AMD260930C00612500 entry 0.4 → max 8.4× · hold -1.00 · take2x 1.00 · level_stop -0.30
  - reactive_zone long otm1: AMD260930C00602500 entry 2.58 → max 4.527× · hold 2.59 · take2x 1.00 · level_stop -0.15
  - reactive_zone long lotto: AMD260930C00615000 entry 0.12 → max 17.5× · hold -1.00 · take2x 1.00 · level_stop -0.17
  - reactive_zone long lotto_near: AMD260930C00610000 entry 0.43 → max 11.628× · hold 3.07 · take2x 1.00 · level_stop -0.19
  - reactive_zone long otm1: AMD260930C00602500 entry 2.39 → max 4.887× · hold 2.87 · take2x 1.00 · level_stop -0.16
  - reactive_zone long lotto: AMD260930C00615000 entry 0.12 → max 17.5× · hold -1.00 · take2x 1.00 · level_stop -0.25
  - reactive_zone long lotto_near: AMD260930C00610000 entry 0.41 → max 12.195× · hold 3.27 · take2x 1.00 · level_stop -0.24
  - reactive_zone long otm1: AMD260930C00602500 entry 2.19 → max 5.333× · hold 3.22 · take2x 1.00 · level_stop -0.13
  - reactive_zone long lotto: AMD260930C00615000 entry 0.1 → max 21× · hold -1.00 · take2x 1.00 · level_stop -0.20
  - reactive_zone long lotto_near: AMD260930C00610000 entry 0.35 → max 14.286× · hold 4.00 · take2x 1.00 · level_stop -0.11
  - reactive_zone long otm1: AMD260930C00602500 entry 2.01 → max 5.811× · hold 3.60 · take2x 1.00 · level_stop 3.60
  - reactive_zone long lotto: AMD260930C00615000 entry 0.08 → max 26.25× · hold -1.00 · take2x 1.00 · level_stop -1.00
  - reactive_zone long lotto_near: AMD260930C00610000 entry 0.33 → max 15.152× · hold 4.30 · take2x 1.00 · level_stop 4.30
  - level_reclaim long otm1: AMD260930C00607500 entry 2.1 → max 3.381× · hold 1.02 · take2x 1.00 · level_stop 1.02
  - level_reclaim long lotto: AMD260930C00620000 entry 0.09 → max 8.333× · hold -1.00 · take2x 1.00 · level_stop -1.00
  - level_reclaim long lotto_near: AMD260930C00615000 entry 0.4 → max 5.25× · hold -1.00 · take2x 1.00 · level_stop -1.00
  - vwap_cross long otm1: AMD260930C00607500 entry 2.1 → max 3.381× · hold 1.02 · take2x 1.00 · level_stop -0.38
  - vwap_cross long lotto: AMD260930C00620000 entry 0.09 → max 8.333× · hold -1.00 · take2x 1.00 · level_stop -0.11
  - vwap_cross long lotto_near: AMD260930C00615000 entry 0.4 → max 5.25× · hold -1.00 · take2x 1.00 · level_stop -0.42
  - reactive_zone long otm1: AMD260930C00610000 entry 1.82 → max 2.747× · hold -0.04 · take2x 1.00 · level_stop -0.04
  - reactive_zone long lotto: AMD260930C00622500 entry 0.1 → max 4.2× · hold -1.00 · take2x 1.00 · level_stop -1.00
  - reactive_zone long lotto_near: AMD260930C00615000 entry 0.57 → max 3.684× · hold -1.00 · take2x 1.00 · level_stop -1.00
  - power_hour long otm1: AMD260930C00612500 entry 2.52 → max 1.333× · hold -1.00 · take2x -1.00 · level_stop -1.00
  - power_hour long lotto_near: AMD260930C00620000 entry 0.49 → max 1.531× · hold -1.00 · take2x -1.00 · level_stop -1.00
  - orb15 short otm1: AMD260930P00602500 entry 4 → max 1.113× · hold -1.00 · take2x -1.00 · level_stop -0.34
  - orb15 short lotto: AMD260930P00580000 entry 0.1 → max 1× · hold -1.00 · take2x -1.00 · level_stop -0.40
  - orb15 short lotto_near: AMD260930P00590000 entry 0.56 → max 1.071× · hold -1.00 · take2x -1.00 · level_stop -0.52
  - pd_break_hold short otm1: AMD260930P00602500 entry 3.79 → max 1.174× · hold -1.00 · take2x -1.00 · level_stop -0.65
  - pd_break_hold short lotto: AMD260930P00577500 entry 0.07 → max 0.857× · hold -1.00 · take2x -1.00 · level_stop -0.86
  - pd_break_hold short lotto_near: AMD260930P00590000 entry 0.57 → max 1.053× · hold -1.00 · take2x -1.00 · level_stop -0.89
  - double_sweep short otm1: AMD260930P00602500 entry 2.55 → max 1.745× · hold -1.00 · take2x -1.00 · level_stop -0.49
  - double_sweep short lotto: AMD260930P00587500 entry 0.11 → max 1.909× · hold -1.00 · take2x -1.00 · level_stop -0.64
  - double_sweep short lotto_near: AMD260930P00595000 entry 0.61 → max 1.852× · hold -1.00 · take2x -1.00 · level_stop -0.70
  - liquidity_sweep short otm1: AMD260930P00602500 entry 2.55 → max 1.745× · hold -1.00 · take2x -1.00 · level_stop -0.49
  - liquidity_sweep short lotto: AMD260930P00587500 entry 0.11 → max 1.909× · hold -1.00 · take2x -1.00 · level_stop -0.64
  - liquidity_sweep short lotto_near: AMD260930P00595000 entry 0.61 → max 1.852× · hold -1.00 · take2x -1.00 · level_stop -0.70
  - orb30 short otm1: AMD260930P00600000 entry 2.4 → max 1.229× · hold -1.00 · take2x -1.00 · level_stop -0.36
  - orb30 short lotto: AMD260930P00587500 entry 0.15 → max 1.4× · hold -1.00 · take2x -1.00 · level_stop -0.40
  - orb30 short lotto_near: AMD260930P00592500 entry 0.48 → max 1.354× · hold -1.00 · take2x -1.00 · level_stop -0.42
  - reactive_zone short otm1: AMD260930P00602500 entry 1.93 → max 1.865× · hold -1.00 · take2x -1.00 · level_stop -0.09
  - reactive_zone short lotto: AMD260930P00590000 entry 0.06 → max 3.333× · hold -1.00 · take2x 1.00 · level_stop 0.00
  - reactive_zone short lotto_near: AMD260930P00595000 entry 0.26 → max 2.808× · hold -1.00 · take2x 1.00 · level_stop -0.08
  - reactive_zone short otm1: AMD260930P00602500 entry 1.7 → max 1.082× · hold -1.00 · take2x -1.00 · level_stop -0.23
  - reactive_zone short lotto: AMD260930P00590000 entry 0.07 → max 1.857× · hold -1.00 · take2x -1.00 · level_stop -0.14
  - reactive_zone short lotto_near: AMD260930P00597500 entry 0.41 → max 1.439× · hold -1.00 · take2x -1.00 · level_stop -0.12
  - vwap_cross short otm1: AMD260930P00602500 entry 1.74 → max 1.052× · hold -1.00 · take2x -1.00 · level_stop -0.20
  - vwap_cross short lotto: AMD260930P00590000 entry 0.11 → max 1.182× · hold -1.00 · take2x -1.00 · level_stop -0.27
  - vwap_cross short lotto_near: AMD260930P00595000 entry 0.27 → max 1.185× · hold -1.00 · take2x -1.00 · level_stop -0.11
  - reactive_zone short otm1: AMD260930P00605000 entry 2.46 → max 1.183× · hold -1.00 · take2x -1.00 · level_stop -0.11
  - reactive_zone short otm1: AMD260930P00605000 entry 2.01 → max 1.045× · hold -1.00 · take2x -1.00 · level_stop -0.34
  - reactive_zone short lotto: AMD260930P00592500 entry 0.11 → max 1.091× · hold -1.00 · take2x -1.00 · level_stop -0.18
  - reactive_zone short lotto_near: AMD260930P00597500 entry 0.32 → max 1.25× · hold -1.00 · take2x -1.00 · level_stop -0.28
  - reactive_zone short otm1: AMD260930P00605000 entry 1.86 → max 1.032× · hold -1.00 · take2x -1.00 · level_stop -0.28
  - reactive_zone short lotto: AMD260930P00590000 entry 0.09 → max 0.889× · hold -1.00 · take2x -1.00 · level_stop -0.33
  - reactive_zone short lotto_near: AMD260930P00597500 entry 0.35 → max 0.857× · hold -1.00 · take2x -1.00 · level_stop -0.34
  - reactive_zone short otm1: AMD260930P00607500 entry 1.67 → max 1.539× · hold -1.00 · take2x -1.00 · level_stop -0.09
  - reactive_zone short lotto_near: AMD260930P00600000 entry 0.3 → max 1.6× · hold -1.00 · take2x -1.00 · level_stop -0.03
  - reactive_zone short otm1: AMD260930P00607500 entry 1.85 → max 0.978× · hold -1.00 · take2x -1.00 · level_stop -0.18
  - reactive_zone short lotto: AMD260930P00595000 entry 0.12 → max 1.333× · hold -1.00 · take2x -1.00 · level_stop 0.33
  - reactive_zone short lotto_near: AMD260930P00600000 entry 0.32 → max 1.125× · hold -1.00 · take2x -1.00 · level_stop -0.09
  - reactive_zone short otm1: AMD260930P00610000 entry 2.37 → max 1.076× · hold -1.00 · take2x -1.00 · level_stop -0.26
  - reactive_zone short lotto: AMD260930P00597500 entry 0.21 → max 1× · hold -1.00 · take2x -1.00 · level_stop -0.43
  - reactive_zone short lotto_near: AMD260930P00602500 entry 0.5 → max 1.12× · hold -1.00 · take2x -1.00 · level_stop -0.46
