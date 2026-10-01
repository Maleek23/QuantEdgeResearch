# Grade audit — how NEXUS ranks and grades ideas (2026-10-01)

The operator asked whether NEXUS ranks and grades ideas well, wanted the board ordered highest first, and wanted sector rotation to count as a plus.

**Short answer: no.** Today an idea carries **four unvalidated numbers on four scales**, and the letters disagree between surfaces. Prod sorts newest first (`BOARD_SORT=recency`), which makes no claim about quality.

This change adds **one** grade, the **NEXUS grade**. It is available behind `BOARD_SORT=grade`, and `recency` stays available. The grade is built only from what the record supports. That turns out to be almost nothing about outcome, so the grade is honestly an *actionability* order. Sector rotation is a bounded +5 bonus, kept as an operator prior.

- Code: `shared/nexus-grade.ts`, `shared/board-sort.ts` (`grade` mode), `server/convictions-engine.ts` (stamps it), `client/src/lib/setup-lifecycle.ts` (`boardOrder`, shared by NEXUS and Today), `client/src/components/dashboard/tools/nexus/nexus-parts.tsx` (row chip, detail box).
- Measurement: `research/grade-audit.ts` (read-only).
- Tests: `npm run test:nexus-grade` (22 tests).

## 1. Every score an idea shows today

| # | Number | Computed | Scale | Inputs | Shown where | Validated? |
|---|---|---|---|---|---|---|
| 1 | **`confidence_score`** (legacy) | Each generator, e.g. `universal-idea-generator.ts:968–1024`, `gex-idea-scanner.ts:350`, `quant-ideas-generator.ts:1701…`, `crypto-ideas-engine.ts:243`. Several generators use constants: sector-ignition 55, holy-grail 50, spx-fast-moves 40, zero-dte 60/55. Capped at 94 on insert (`storage.ts:2788`). | Nominal 0–100 | Hand-set per engine | **Not on NEXUS or Today.** It feeds conviction through the measured-structure layer (6/9/12 pts, `convictions-engine.ts:396`). | No. The only calibration curve (`routes.ts:308`, Dec 2025, n = 411) is non-monotone and applies only to ai/hybrid. |
| 2 | **`probabilityBand`** | Per generator: quant has its own table (65 → A); gex and crypto never set it, so the column defaults to `'C'`. | Letters | confidence | Not on NEXUS or Today | No. Three confidence→letter tables disagree: 65 is A (quant), C+ (`shared/grading.ts`) and C/D (`routes.ts:406`). |
| 3 | **Evidence score `convictionScore`** | `convictions-engine.ts:2955`. The sum of layer points, clamped to 0–100; the realistic range is about 0–40. | Raw points | 14 layers. Changed by: cash-gate ×0.65 before high-impact macro; per-user weekly +3 (`:2090`); deep layers only for the top 16 pre-enrichment (`:2293`). | NEXUS row (as a %), ring "evidence (unvalidated)", grid "+N evidence" (raw), table; Today hero "Top evidence score", SigCards "N/100 evidence" | **No, and inverse.** Spearman vs realised R is −0.12 (H1) / −0.01 (H2). The top tercile (≥ 16) is the worst group. ([SCORE_V2_STUDY](SCORE_V2_STUDY.md)) |
| 4 | **Band S/A/B/C** | `shared/conviction-bands.ts`: S ≥ 25, A ≥ 19, B ≥ 13 | Letters on raw points | #3 | NEXUS detail "{band} evidence", ring, grid, table, the "CONVICTION" rank filter (S/A only); Today SigCard chip | No. Same data as #3. |
| 5 | **Letter A+…F** | `CONVICTION_GRADE_CUTOFFS` (`shared/conviction-bands.ts:30`) | Letters on raw points | #3 | Not on NEXUS or Today. Discord alerts (`signal-alerts.ts:103`), Quantinum dossier (`quantinum-intelligence.ts:269`), `CanonGrade` | No |
| 6 | **Display percent** | `convictionDisplayPercent` (`shared/conviction-display.ts`): piecewise S → 86–99, A → 72–86, B → 58–72 | 0–100 | #3 | Everything the UI calls "N/100"; Discord "🧠 Confidence N/100" | No. It is a display transform that *looks* like a probability. |
| 7 | **Published vs live re-grade** | `publishedConvictionScore` comes from `gen_conviction_score`, written at the first board surfacing after the cash-gate (`:3036`). `convictionScore` is re-scored on every board build. | As #3 / #6 | #3 at two times | NEXUS row lifecycle line "graded X → now Y"; Today SigCard mixes the **published band** with the **live %** (`live-widgets.tsx:201/215`) | No |
| 8 | **Lifecycle state** (setup-lifecycle) | `shared/setup-lifecycle.ts`: fresh / carried / stale / resolved from the live quote | State | Window, entry window, stop/target, run-past-entry | NEXUS row line, day filter, sinks stale + resolved on every surface | It is a rule, not a prediction. It says whether a plan can still be taken as published. |
| 9 | **Engine record** | `shared/board-sort.ts` `ENGINE_RECORD` | Shrunk mean R | Engine | Only as an order (`BOARD_SORT=engine_record`) | No. Out of sample ρ is +0.06 / −0.02. |
| 10 | **`rankingScore`** | `/api/trade-ideas/best-setups` (`routes.ts:8377`) | Ad hoc | confidence + source + R:R + grade + win rate + freshness | Not NEXUS | No |
| 11 | `grade-types.ts` S–F 0–100 | `scoreToGrade` | — | — | **Dead.** Nothing imports it; fundamental grading uses `shared/grading.ts`. | — |

### Current order

- **Prod:** `BOARD_SORT=recency`, newest first. Server: `orderBoard` in `buildConvictions`. Client: `boardOrder`, then stale and resolved sink.
- **Shared order:** NEXUS (`rankRows`) and Today (`useBook`: Best idea = `ideas[0]`, the ranked book is the rest) already share `boardOrder`.
- **What ignores `BOARD_SORT`:**
  - The quant bot (raw score ≥ 18, sorted by score, `quant-bot.ts:610`).
  - The weekly seeder (score ≥ 18, by score).
  - Discord alerts (raw ≥ 19).
  - The server `minScore` floor, the symbol/side dedupe and the horizon deconfliction (higher score wins).

### Where the surfaces disagree

1. **One idea, four scales.** NEXUS row shows 90 (percent). The grid shows "+28 evidence" (raw). Quantinum and Discord show "A-" (letter). Discord's body says "Confidence 90/100", but 90 on the `grading.ts` table is "A".
2. **Frozen band beside a live score.** The Today SigCard shows the published band next to the live percent. NEXUS shows the live band.
3. **Scores differ by viewer.** NEXUS and Today include the per-user weekly +3. Quantinum, Discord and the bot read the base board.
4. **Labels claimed a ranking that does not exist.** The NEXUS rank help said "highest conviction first" under `recency`. That text is fixed in this change. The bot and the seeder still rank by a score that is inverse to outcomes.
5. **Rows past the top 16** are scored on fewer layers, so their scores cannot be compared with the top 16.
6. **Three tables turn confidence into a letter.** Gex and crypto rows never set a band at all; it defaults to `'C'`.

## 2. What the record says about the inputs the brief proposed

`npx tsx research/grade-audit.ts --study` re-measures the brief's inputs on the 443 bar-verified ideas from the score-v2 study (2026-08-26 → 09-30, rule-7 underlying R, split at the median publish day).

The pass rule: same sign and |ρ| ≥ 0.05 in **both** halves, **and** again with each half's top 5 trades removed.

| Feature | ρ H1 | ρ H2 | ρ H1 − top 5 | ρ H2 − top 5 | Reading |
|---|---|---|---|---|---|
| Sector rotation with the idea (sector layer > 0, `rotWith`) | −0.04 | +0.02 | −0.05 | +0.03 | No signal. n = 37 with rotation. |
| Peer-group rotation aligned (`rotPeerAligned`) | −0.09 | +0.02 | −0.14 | +0.05 | **Flips** |
| Rotation against (`rotAgainst`) | +0.06 | −0.04 | +0.01 | −0.08 | Flips |
| Confluence-family count (`confFamilies`) | **−0.11** | **−0.13** | −0.10 | −0.15 | Stable, but **negative**: 2 families +0.07R, 3 families −0.20R, 5 families −0.22R |
| R:R (`rr`) | **−0.17** | **−0.21** | −0.25 | −0.27 | Stable and **negative**: far targets did worse. On $ the sign flips (score-v2), and R is measured in stop units, so part of this is mechanical. |
| R:R "sane band" 1.5–3.2 (`rrBand`) | +0.22 | −0.13 | +0.29 | −0.10 | **Flips** |
| Old evidence score (`old`) | −0.12 | −0.01 | −0.11 | −0.03 | Fails, and points the wrong way |
| GEX layer (`L_gex`) | −0.13 | −0.09 | −0.15 | −0.12 | Stable, negative |
| Opening-gap chase (`gapAtr`) | −0.14 | −0.11 | −0.18 | −0.09 | Stable, negative (not available live) |
| ADX (`adx`) | −0.18 | −0.08 | −0.20 | −0.09 | Stable, negative (not available live) |
| Short side (`isShort`) | +0.18 | +0.09 | +0.20 | +0.06 | Stable. Mostly H2 puts, n = 60. |
| Stop width in ATRs (`stopAtr`) | +0.23 | +0.11 | +0.30 | +0.16 | Stable but mechanical. It vanishes on $. |

**What this means.**

- Several features pass the univariate screen.
- But the score-v2 study's **pre-registered nested test failed**. A points model fit on one half, built from these same features, made its *top* tercile the *worst* tercile in the other half, in both directions.
- With n ≈ 200 per half, one standard error of ρ is about 0.07.
- Under the walk-forward law, these are hypotheses, not validated ranking inputs. **No feature is validated as a ranking.**

The brief's fallback was "live-valid > fresh > R:R and confluence count > recency". The record says to change it:

- **Do not reward confluence count.** More layers was *worse* in both halves. This is the same defect as the evidence score, which is mostly a confluence sum.
- **Do not reward R:R.** Raw R:R is negative in both halves, and the "sane band" flips.
- **So both are left out of the grade.** They are logged in `research/grade-audit.ts` so prod can re-check them.

## 3. The NEXUS grade

`shared/nexus-grade.ts` (version `g1-2026-10-01`) produces a score from 0 to 100 plus a letter. **It is unvalidated.** It measures *whether you can still take this plan as published, and how much of its window is left*. It does not predict which setup will win.

| Factor | Points | Basis |
|---|---|---|
| Live & valid: lifecycle fresh or carried (`shared/setup-lifecycle.ts`, on the live quote) | 60 (stale 10, resolved 0) | gate |
| Published today (ET) | 20 | gate |
| Window left: 15 × the fraction of the idea's own holding window still ahead | 0–15 | gate (recency, normalised by horizon) |
| **With sector rotation**: the sector / peers layer is net positive for the idea's side | **+5**; against or no read = **0, never negative** | **operator prior, not validated** |

**Letters:** A ≥ 90 · B ≥ 80 · C ≥ 60 · D ≥ 10 · F < 10.

| Letter | Typically |
|---|---|
| A | Fresh with most of its window ahead, or fresh with rotation |
| B | Fresh |
| C | Carried and still valid |
| D | Stale |
| F | Resolved |

**Ties** break newest first, then by idea id.

**What is deliberately not an input:**

- the evidence score, band and letter;
- the confluence count;
- R:R;
- `confidence_score`;
- the engine record.

The evidence layers remain visible as the list of reasons.

**Rotation bonus.**

- It is bounded at +5 of 100, so it can only reorder ideas *inside* a lifecycle and freshness tier. A carried idea with rotation (at most 80) never passes a fresh one (at least 80; a tie breaks newest first).
- It is logged as the feature `rotWith` (`gen_scoring_layers` sector points > 0), which is already persisted at the first surfacing. That makes it measurable on every resolved idea without a schema change.
- On the study record it shows nothing (ρ −0.04 / +0.02). The operator's prior is that it should help. The audit script will show whether it does.

### Where it is shown, and the order

- **Server.** With `BOARD_SORT=grade`, `buildConvictions` stamps `nexusGrade` on each pick from the board's build-time price. It orders with `orderBoard(…, 'grade')`, and the response carries `boardSort: 'grade'`.
  - The weekly-focus view re-sorts with the same comparator. The weekly +3 touches only the evidence score, not the grade.
- **Client.** `boardOrder` (`client/src/lib/setup-lifecycle.ts`) **re-grades every row on its live lifecycle read**, sorts by grade, highest first, with ties going to the server's rank, then sinks stale and resolved.
  - NEXUS `rankRows` and Today `useBook` both call it, so **the NEXUS board, Today's Best idea and the ranked book have one order**.
  - Today's label reads "NEXUS board order · by NEXUS grade (unvalidated)".
- **NEXUS row.** A letter + score chip replaces the bare evidence percent, with a "why here:" line listing the top 3 contributors and their points. The tooltip carries the full statement, including that rotation is an operator prior.
- **NEXUS detail.** A grade box (letter, score, top 3 contributors, with `*` on the operator prior) sits beside the evidence ring. The ring keeps its "evidence (unvalidated)" label.
- **Unchanged.**
  - The `minScore` floor, the dedupe and deconfliction (still by evidence score).
  - The quant bot, the weekly seeder, Discord and Quantinum (they do not use `BOARD_SORT`).
  - The CONVICTION rank filter (S/A evidence bands).
  - `recency`, `engine_record` and `score`.

## 4. How to validate it (prod, read-only)

Run either of these:

```bash
# (a) On the droplet. A single SELECT inside a READ ONLY transaction.
cd /opt/quantedge && npx tsx research/grade-audit.ts --out /tmp/grade-audit-results.json

# (b) A dump, then a local run (the SELECT is IDEAS_SQL in the script).
psql "$DATABASE_URL" -At -c "<IDEAS_SQL>" > .cache/grade-audit/ideas.json
npx tsx research/grade-audit.ts --ideas .cache/grade-audit/ideas.json
```

**What it does:**

- Takes ideas published on or after **2026-08-26** with a resolved `outcome_status` and a usable stored exit.
- Labels each with underlying R on the tracker's exit. Premium-level option rows use `exit_premium`.
- Grades each idea **as of its first board surfacing** (`generation_timestamp`): fresh if it surfaced on its publish day, the window left at that time, and rotation from the sector layer.
- Prints win % and mean R by **grade decile** and by every feature (`rotWith`, `rotAgainst`, `confFamilies`, `rr`, `rrBand`, the old score, `isShort`, every layer), per half and with the top 5 trades removed, plus the list of features that pass.

**Limits:**

- Stale-at-surfacing cannot be rebuilt without bars. At publish, every idea is "live & valid", so the decile table measures fresh, window and rotation only.
- The lifecycle part of the grade is a gate by construction (a stale plan cannot be taken as published). It is not an outcome claim.
- Tracker exits are not the bar-verified replay. For the stricter label, re-run `research/score-v2-study.ts` and then `research/grade-audit.ts --study`.

**Promotion rule (unchanged walk-forward law).**

- A factor earns more than its current weight only if:
  - it has the same sign with |ρ| ≥ 0.05 in both halves, with and without the top 5;
  - and a nested fit on one half beats "no ranking" on the other, in both directions.
- Rotation stays at +5 (operator prior) until that happens. If it is negative in both halves, drop it.
- Re-run when the honest record reaches about 900 resolved ideas.

**Recommendation.** Set `BOARD_SORT=grade` on the worker and the web process when the operator wants it. Do not deploy between 08:30 and 10:30 ET. It is strictly more informative than `recency`:

- it uses the same newest-first spirit, normalised by horizon;
- stale and resolved plans sink on the server too;
- each row says why it is where it is.

Do not describe it as "best setup first".
