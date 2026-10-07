# NEXUS grade g2 — 2026-10-03

NEXUS now shows one grade in both the ranked row and setup detail. The old evidence score and actionability score appeared as separate 0–100 numbers, even though users reasonably read them as competing grades. The separate evidence ring is removed.

## Points

| Factor | Maximum | Calculation |
| --- | ---: | --- |
| Confluence | 25 | Existing conviction display scale (0–100), scaled to 25 points |
| Technical | 15 | Sum of positive `technical`, `ta`, and `structure` layer points, capped at 10 raw points, scaled to 15 |
| Live validity | 25 | Fresh or carried setup: 25; stale: 5; resolved: 0 |
| Plan window | 25 | Fraction of the setup's own published window remaining, scaled to 25; zero when invalid or unreadable |
| Session freshness | 10 | Published in the current ET calendar session: 10; otherwise 0 |

The factors sum to 100. The score is ONE integer (rounded total) and the letter is read off that integer: A ≥ 90 · B ≥ 80 · C ≥ 65 · D ≥ 45 · F < 45. The detail card lists all five contributions; the row tooltip does too. The row's short “why here” text names the three largest contributors. Rotation is no longer an extra bonus on top of confluence.

## Interpretation

The letter and score are a single, transparent setup-quality/actionability ranking. They are not calibrated probabilities and do not imply that a 60% win rate is achievable. The weight choices have not been validated out of sample. Historical audit findings still apply: raw evidence scores alone did not predict better outcomes. Recalibrate only against time-split outcomes with measured execution prices and keep the score version attached to any future audit.

## Bot status observed during the audit

The read-only `/api/quant-bot/status` response showed Run 3 active with 3 open positions, 11 closed positions, and a recent cycle stamp. The supplied screenshot was captured Friday night ET; this audit's current date is Saturday, October 3, 2026. The scheduler intentionally opens no new trades outside the regular session. The screenshot's `idle` label therefore describes no cycle running at that moment, not a stopped bot. The status response does not include per-gate skip counts, so it cannot establish why a particular in-session cycle opened zero positions.

## One grade everywhere (2026-10-06)

Every surface renders the grade through `formatNexusGrade()` ("B 84") from `shared/nexus-grade.ts`:
NEXUS rows / grid / table / detail and the GRADE A/B lens, Today (book list, top-grade stat, signal cards),
ticker Setups, Catalyst impact table (server attaches `nexusGrade`), Quantinum cockpit layer, Discord
(NEXUS signal gate = grade ≥ B, bot-entry embed, daily preview), bot page log and fills, journal desk note
("NEXUS grade at publish"), loss-analysis dimension, alerts ("NEXUS grade A" replaces "90+"; rating moves on a
letter change), trade audit, Flow setups, Chart Lab. Legacy scores (raw conviction points, confidence %,
S/A/B/C bands, probability band) appear only inside a collapsed "diagnostics (unvalidated)" section.
Label everywhere: *actionability score — unvalidated, not a win probability*.

Validation logging: each idea's components are written once at first board surfacing to
`convergence_signals_json.nexusGradeAtPublish` (`{v, letter, score, at, f:{evidence,technical,lifecycle,window,session}}`)
plus a `[NEXUS-GRADE]` log line; every bot fill carries `nexus-grade:<version>:<letter>:<score>|<factor>=<pts>…`
in its quality signals. `research/grade-audit.ts` prefers the logged stamp.

Audit on the 443 bar-verified ideas (`npx tsx research/grade-audit.ts --study`, grade at publish):
ρ vs realised R = −0.09 (H1) / +0.05 (H2) — g2 does not rank outcomes out of sample. Confluence-family count
is negative in both halves (−0.11 / −0.13); stop width in ATR (+0.23 / +0.11) and short side (+0.18 / +0.09)
are the inputs that held up. High grades mean "strong-looking and takeable now", not "more likely to win".
