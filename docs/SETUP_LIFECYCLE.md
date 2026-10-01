# Setup lifecycle — carry-over policy for the NEXUS board

Code: `shared/setup-lifecycle.ts` (pure, tested by `npm run test:setup-lifecycle`),
`client/src/lib/setup-lifecycle.ts` (live mark + board order), NEXUS board
(`components/dashboard/tools/nexus/nexus-tools.tsx`), Today's book (`today-model.tsx useBook`).

Operator question (2026-10-01): *do these setups go into the next day, are they still
relevant into the next day, how would they be graded?*

## Answer in one paragraph

A published setup is not re-published each morning. It stays on the board while its
own plan is still valid, and every read gives it one computed state — **FRESH**,
**CARRIED**, **STALE** or **RESOLVED** — from the row's stored fields and the latest
price. Carried setups are re-graded on every board build with live inputs (the same
convictions engine layers, including freshness / drift / pre-market gap), and the row
shows **graded at publish X → now Y** next to the **live price vs entry, stamped with
its age**. Stale setups sink below fresh and carried ones and are hidden under TODAY
unless asked for. Nothing here decides an outcome — the outcome tracker is unchanged.

## States (precedence top to bottom)

| State | Rule |
|---|---|
| RESOLVED | lifecycle `closed`, or the live price is through the stop or at the target. The tracker records the result; this only labels the row. |
| STALE | holding window ended (below) · entry window (`entry_valid_until`) closed with no trigger · price ran **> 1 unit past entry in the trade's direction with no fill** (unit = daily ATR when the row carries one; today no row does, so the idea's own risk \|entry − stop\| = 1R is used) · **carried** option whose contract expires before the rest of the hold (option DTE < remaining hold). |
| FRESH | published today (ET calendar day of the publish time). |
| CARRIED | published on an earlier day, none of the above. Row shows `CARRIED sN/M` (session N of an M-session hold). |

The DTE rule applies only to carried ideas: a fresh idea was just accepted by the publish
gates (`server/lib/publish-gates.ts`) with that contract.

## Holding windows

US equity sessions; weekends and NYSE holidays (`shared/market-calendar.ts`) are skipped.
The publish session is the ET trading day of the publish, or the next trading day when
published after 16:00 ET or on a non-trading day. Session 1 = the publish session.

| Holding period | Window ends |
|---|---|
| 0DTE option (expiry ≤ publish session) | close of that day |
| day / intraday | close of the publish session |
| week-ending | close of the last trading day of the publish week |
| swing | close of session 5 (2–5 sessions) |
| position / long / leap | close of session 20 (the path replay's position horizon) |
| unknown | close of the publish session |
| any option | never past the contract's expiry close |
| crypto (24/7) | calendar clock: day 24h · swing 5d · week 7d · position 28d |
| `exit_by` on the row | overrides all of the above — it is the idea's own deadline |

These windows are a display/ordering policy. The server's existing age caps
(`maxAgeHoursForIdea`, weekday hours: day 6h, swing 120h, position 480h) still decide what
the engine scores at all; a row the engine drops never reaches the lifecycle.

## Grading a carried setup

* **graded at publish** = `publishedConvictionScore` (frozen `gen_conviction_score`, written
  the first time the plan was surfaced).
* **now** = `convictionScore`, the live re-grade from this board build: every layer is
  re-scored with live inputs (freshness/drift, pre-market gap, GEX, regime, breadth, sector,
  TA for the top names). No new scoring function was added.
* **live price vs entry**: the `/api/quotes/batch` mark when it answered (its own `asOf`),
  else the board's build-time price stamped with the board's age. Never a publish-time value.

## Board order and day filter

Order = the server's `BOARD_SORT` rank (prod: `recency`) or evidence score when unset, then
**stale and resolved sink** (stable). Today's Best idea / Ranked book use the same order —
before this change Today sorted by evidence score while NEXUS sorted by recency, which is
how a two-day-old idea could lead Today and sit near the bottom of NEXUS.

Day chips (ET publish day, persisted per tool): **TODAY · YESTERDAY · THIS WEEK · ALL**
with counts, plus a date picker for any day in the board's lookback. YESTERDAY is the
previous trading session (Monday → Friday). TODAY hides stale/resolved by default
(`+N stale` reveals them). List view groups rows under day headings
("Today", "Yesterday · Wed, Sep 30", "Tue, Sep 29").

## Why a name can score high on Today and be absent or low on NEXUS

Today shows several per-symbol numbers that are **not** the NEXUS evidence grade:

| Today surface | Number shown | Relation to NEXUS |
|---|---|---|
| Best idea / Ranked book | NEXUS evidence grade (`convictionScore`) | Same idea, same grade; order now matches NEXUS. |
| Pre-market strip (`/api/premarket/gappers`, `/api/premarket/ideas`) | gap %, WATCH plans | WATCH plans are **not** trade ideas until they trigger 09:30–10:30 ET (≤ 5/day, one per symbol, never on top of another engine's open idea). The chip now reads "watch … — not a NEXUS idea" and links to the ticker. |
| Index desk (`/api/index-scalps`) | scanner's raw `confidence_score` | Producer confidence, not the evidence grade — now labelled "scanner N". |
| Sector board leaders (`/sectors`) | member checklist score (trend/EMA/rel-strength/levels) | A stock read, not an idea grade; a name can lead a sector and have no idea, or the reverse. |
| Weekly path | SPY model projection | Not per-idea. |

Engine-side reasons an open idea is absent from NEXUS: watchlist gate (approved / liquid
universe / watchlist / leadership / measured detectors), holding-period age cap, live
revalidation (incoherent levels, catalyst contradiction, stop crossed, ran ≥ 50% to target,
no price for an entry older than 24h), short discipline, symbol+direction dedup (keeps the
higher point sum), one direction per symbol+horizon, minScore. A row's stored
`confidence_score` (e.g. 94) is the producer's legacy number and is not used to rank.
