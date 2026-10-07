# Runner replay — 0DTE ideas, 2026-09-28 → 2026-10-06

**MEASURING — not a validated edge.** Generated 2026-10-07T15:55:35.005Z by `research/runner-replay.ts` (read-only).

Policies on the same entries (trigger pass when recorded, else publish; recorded entry premium): **all_out** = stop / T1 / 15:45, whole position; **runner** = ½ at T1 or +50% premium, rest breakeven → trail 25% from peak / back through VWAP / +100% / 15:45. R = 40% of the entry premium for both. Capture = (exit − entry) ÷ (peak to 16:00 − entry). Halves split the 6 sessions with ideas in time order at 2026-10-02.

Columns: A = all_out · B = runner (½ at T1 or +50%, the bot) · C = runner (½ at the underlying T1 only, the idea record).

| half | n | T1/+50% reached | E[R] A | E[R] B | E[R] C | prem % A | prem % B | prem % C | capture A | capture B | capture C | win A | win B | win C |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| first | 16 | 4 | -0.581 | -0.216 | -0.581 | -23.2% | -8.6% | -23.2% | -49% | -25% | -49% | 25% | 44% | 25% |
| second | 26 | 10 | -0.084 | -0.213 | -0.059 | -3.4% | -8.5% | -2.4% | -88% | -85% | -87% | 42% | 46% | 42% |
| all | 42 | 14 | -0.273 | -0.214 | -0.258 | -10.9% | -8.6% | -10.3% | -73% | -63% | -73% | 36% | 45% | 36% |

**Decision: RUNNER_POLICY default OFF** (rule: B and C each beat A on E[R] in both halves; B both halves: false, C both halves: false).

Sessions requested 20; sessions with replayable 0DTE ideas: 6 (2026-09-28, 2026-09-30, 2026-10-01, 2026-10-02, 2026-10-05, 2026-10-06). Skipped: {"entry_after_flatten":14,"session_not_complete":5}.
Contract bars: massive; underlying: alpaca:1Min(iex), yahoo:^GSPC:1m.

| day | symbol | contract | entry | A all_out | B runner legs | C runner (T1 only) | peak | recorded |
|---|---|---|---|---|---|---|---|---|
| 2026-09-28 | IWM | IWM260929C00282000 | 0.71 | 0.51 (15:45 flatten) | 15:45 flatten → blend 0.51 | 15:45 flatten → 0.51 | 0.67 | expired |
| 2026-09-28 | IWM | IWM260929C00280000 | 1.25 | 1.29 (15:45 flatten) | 15:45 flatten → blend 1.29 | 15:45 flatten → 1.29 | 1.5 | expired |
| 2026-09-30 | SPY | SPY261001C00770000 | 1.6 | 1.18 (stop) | stop → blend 1.18 | stop → 1.18 | 2.03 | hit_stop (auto_stop_hit) |
| 2026-09-30 | SPY | SPY260930C00768000 | 1.04 | 0.62 (stop) | stop → blend 0.62 | stop → 0.62 | 1.17 | expired (auto_expired) |
| 2026-09-30 | IWM | IWM260930P00279000 | 0.51 | 0.21 (15:45 flatten) | 15:45 flatten → blend 0.21 | 15:45 flatten → 0.21 | 1.12 | expired (auto_expired) |
| 2026-09-30 | TSLA | TSLA260930C00355000 | 0.46 | 0.12 (stop) | +50% half → +100% → blend 0.81 | stop → 0.12 | 0.95 | expired (auto_expired) |
| 2026-09-30 | IWM | IWM260930P00279000 | 0.32 | 0.21 (15:45 flatten) | 15:45 flatten → blend 0.21 | 15:45 flatten → 0.21 | 1.12 | expired (auto_expired) |
| 2026-09-30 | IWM | IWM260930P00279000 | 0.35 | 0.21 (15:45 flatten) | 15:45 flatten → blend 0.21 | 15:45 flatten → 0.21 | 1.12 | expired (auto_expired) |
| 2026-09-30 | IWM | IWM261001P00280000 | 1.65 | 1.65 (15:45 flatten) | 15:45 flatten → blend 1.65 | 15:45 flatten → 1.65 | 2.52 | expired (auto_expired) |
| 2026-09-30 | TSLA | TSLA260930C00352500 | 1.07 | 0.53 (stop) | stop → blend 0.53 | stop → 0.53 | 2.81 | expired (auto_expired) |
| 2026-09-30 | IWM | IWM260930P00280000 | 1.05 | 1.09 (15:45 flatten) | 15:45 flatten → blend 1.09 | 15:45 flatten → 1.09 | 2.08 | expired (auto_expired) |
| 2026-09-30 | META | META260930P00732500 | 1.94 | 2.43 (15:45 flatten) | 15:45 flatten → blend 2.43 | 15:45 flatten → 2.43 | 7.7 | expired (auto_expired) |
| 2026-10-01 | SPY | SPY261001P00761000 | 1.89 | 0.43 (stop) | +50% half → trail 25% from peak → blend 2.5 | stop → 0.43 | 2.88 | hit_stop (auto_stop_hit) |
| 2026-10-01 | IWM | IWM261001C00279000 | 0.38 | 1.09 (T1) | +50% half → trail 25% from peak → blend 0.51 | T1 half → +100% → 1.09 | 1.66 | hit_target (auto_target_hit) |
| 2026-10-01 | SPY | SPY261001P00760000 | 0.93 | 0.24 (stop) | stop → blend 0.24 | stop → 0.24 | 0.81 | hit_stop (auto_stop_hit) |
| 2026-10-01 | QQQ | QQQ261001P00741000 | 0.38 | 0.05 (15:45 flatten) | +50% half → trail 25% from peak → blend 0.53 | 15:45 flatten → 0.05 | 1.6 | expired (auto_expired) |
| 2026-10-02 | MSFT | MSFT261002P00515000 | 1.48 | 1.43 (T1) | T1 half → breakeven → blend 1.42 | T1 half → breakeven → 1.42 | 2.11 | expired (auto_expired) |
| 2026-10-02 | TSLA | TSLA261002C00370000 | 2.17 | 3.2 (T1) | T1 half → +100% → blend 3.9 | T1 half → +100% → 3.77 | 5 | hit_stop (auto_stop_hit) |
| 2026-10-02 | AMD | AMD261002C00640000 | 2.57 | 4.11 (T1) | T1 half → +100% → blend 4.5 | T1 half → +100% → 4.63 | 7.3 | expired (auto_expired) |
| 2026-10-02 | AAPL | AAPL261002C00332500 | 1.9 | 0.93 (stop) | stop → blend 0.93 | stop → 0.93 | 2.45 | expired (auto_expired) |
| 2026-10-05 | TSLA | TSLA261005C00370000 | 3.12 | 5 (T1) | +50% half → +100% → blend 5.46 | T1 half → +100% → 5.62 | 11.35 | hit_stop (auto_stop_hit) |
| 2026-10-05 | IWM | IWM261005P00281000 | 0.95 | 0.48 (stop) | stop → blend 0.48 | stop → 0.48 | 1.25 | hit_stop (auto_stop_hit) |
| 2026-10-05 | MSFT | MSFT261005C00535000 | 0.98 | 0.41 (stop) | stop → blend 0.41 | stop → 0.41 | 0.79 | expired |
| 2026-10-05 | GOOGL | GOOGL261005C00345000 | 1.04 | 1.38 (T1) | T1 half → trail 25% from peak → blend 1.25 | T1 half → trail 25% from peak → 1.25 | 3 | hit_target (auto_target_hit) |
| 2026-10-05 | IWM | IWM261006C00283000 | 0.98 | 0.66 (stop) | stop → blend 0.66 | stop → 0.66 | 1.82 | hit_stop (auto_stop_hit) |
| 2026-10-05 | TSLA | TSLA261005P00375000 | 1.19 | 0.11 (stop) | stop → blend 0.11 | stop → 0.11 | 1.64 | hit_stop (auto_stop_hit) |
| 2026-10-05 | META | META261005P00740000 | 1.83 | 0.85 (stop) | stop → blend 0.85 | stop → 0.85 | 2.59 | hit_stop (auto_stop_hit) |
| 2026-10-05 | META | META261005C00745000 | 2.02 | 3.19 (T1) | T1 half → trail 25% from peak → blend 3 | T1 half → trail 25% from peak → 3.08 | 3.95 | hit_target (auto_target_hit) |
| 2026-10-05 | IWM | IWM261005C00283000 | 0.26 | 0.64 (T1) | +50% half → trail 25% from peak → blend 0.35 | T1 half → +100% → 0.64 | 1.25 | hit_target (auto_target_hit) |
| 2026-10-05 | TSLA | TSLA261005P00377500 | 1.38 | 0.86 (stop) | stop → blend 0.86 | stop → 0.86 | 1.63 | hit_stop (auto_stop_hit) |
| 2026-10-05 | META | META261005P00745000 | 2.5 | 2.1 (15:45 flatten) | +50% half → back through VWAP → blend 3.6 | 15:45 flatten → 2.1 | 4 | expired (auto_time_stop) |
| 2026-10-05 | TSLA | TSLA261005P00380000 | 1.27 | 0.37 (stop) | stop → blend 0.37 | stop → 0.37 | 2 | hit_stop (auto_stop_hit) |
| 2026-10-05 | QQQ | QQQ261005P00756000 | 1.61 | 0.72 (stop) | stop → blend 0.72 | stop → 0.72 | 1.5 | hit_stop (auto_stop_hit) |
| 2026-10-05 | SPX | SPXW261005P07760000 | 1.73 | 0.25 (stop) | stop → blend 0.25 | stop → 0.25 | 1.3 | hit_stop (auto_stop_hit) |
| 2026-10-05 | SPX | SPXW261005P07775000 | 1.13 | 0.72 (15:45 flatten) | 15:45 flatten → blend 0.72 | 15:45 flatten → 0.72 | 7 | expired (auto_expired) |
| 2026-10-05 | IWM | IWM261006C00285000 | 0.57 | 0.46 (stop) | stop → blend 0.46 | stop → 0.46 | 0.58 | expired |
| 2026-10-05 | SPY | SPY261005P00777000 | 1.31 | 1.74 (15:45 flatten) | 15:45 flatten → blend 1.74 | 15:45 flatten → 1.74 | 2.91 | expired (auto_expired) |
| 2026-10-06 | IWM | IWM261006P00282000 | 0.15 | 0.25 (T1) | T1 half → trail 25% from peak → blend 0.21 | T1 half → trail 25% from peak → 0.22 | 1.25 | hit_stop (auto_stop_hit) |
| 2026-10-06 | IWM | IWM261006P00281000 | 0.21 | 0.04 (stop) | stop → blend 0.04 | stop → 0.04 | 0.31 | hit_stop (auto_stop_hit) |
| 2026-10-06 | IWM | IWM261006P00283000 | 0.48 | 1.14 (T1) | +50% half → trail 25% from peak → blend 0.69 | T1 half → +100% → 1.14 | 2.22 | hit_target (auto_target_hit) |
| 2026-10-06 | SPY | SPY261007P00779000 | 1.25 | 1.29 (15:45 flatten) | 15:45 flatten → blend 1.29 | 15:45 flatten → 1.29 | 1.82 | expired (auto_expired) |
| 2026-10-06 | IWM | IWM261007P00281000 | 0.99 | 1.08 (15:45 flatten) | 15:45 flatten → blend 1.08 | 15:45 flatten → 1.08 | 1.12 | expired (auto_expired) |

Caveats: small n; option bars are trade prints (Massive / Alpaca indicative / Yahoo), not NBBO — fills at prints are optimistic for both policies alike; a minute with no print carries the last print as close only (no premium-level exits on it); IEX volume makes VWAP approximate.
