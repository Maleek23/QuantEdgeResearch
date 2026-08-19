# QuantEdge — Platform Audit (foundation reset)

**Goal:** strip to a solid core, delete the dead/duplicate/experimental sprawl, then build.

## The problem, in numbers
| | Count | Reality |
|---|---|---|
| Client routes | **~120** | ~15 are real; the rest are legacy/dupe/experimental |
| Page files | 60 | many unrouted or superseded |
| Components | 394 | large unused fraction (deeper sweep needed) |
| Server service files | 240 | many one-off / abandoned experiments |
| `routes.ts` endpoints | **763** | one 28k-line file; most endpoints have no frontend caller |

You have a **6-page app** wearing a 120-page costume.

## ✅ THE CORE — keep (this is the real product)
**Shells (the nav):**
- `/` landing · `/login` `/signup` `/forgot-password` auth
- `/p` Home · `/h` Hunt · `/g` GEX · `/r/:symbol` Research · `/pos` Positions · `/j` Journal
- `/radar` Thesis Radar · `/btc` BTC Radar

**Utility:** `/watchlist` · `/alerts` · `/how-to` · `/settings` · `/account` · `/terms` · `/privacy`

**Admin:** `/admin` + the sub-pages you actually open (users, trade-ideas, win-loss). Audit the rest.

Everything below is **CUT** unless a line says REVIEW.

## ✂️ CUT — redundant variants (pick one, delete the rest)
- **Command center ×5:** `/command` `/command-center` `/command-center-v2` `/command-legacy` `/command/:symbol` → superseded by the shells. Delete all.
- **GEX ×4:** `/gex` `/gex-dashboard` `/gex-legacy` `/gex-scanner` → keep only what `/g` renders.
- **Home/landing ×5:** `/home` `/home-glass` `/glass-dashboard` `/landing` → dupes of `/` and `/p`.
- **Trade Desk ×3:** `/trade-desk` `/trade-desk-v2` `/trade-desk/best-setups` → superseded by `/h` Hunt.
- **Per-symbol page ×7:** `/stock/:symbol` `/stock-legacy/:symbol` `/t/:symbol` `/terminal/:symbol` `/analysis/:symbol` `/command/:symbol` `/gex/:symbol` → keep **`/r/:symbol`** (Research) as the one ticker page.
- **Terminal ×3:** `/terminal` `/terminal/heatmap` `/terminal/trinity`.
- **Watchlist ×5:** `/watchlist-bot` `/watchlist/weekly` `/weekly-watchlist` `/w` → keep `/watchlist`.
- **Backtest/convictions ×5:** `/convictions` `/convictions/backtest` `/conviction-backtest` `/backtest` `/trading-engine`.

## ✂️ CUT — experimental / vanity / dev-only
`/holographic` `/aion` `/style-lab` `/style-glass` `/design-system` `/design-system-test`
`/glass-dashboard` `/simulator` `/strategy-simulator` · `server/index.ts.bak`

## ✂️ CUT — marketing/content bloat (unless you run a real marketing site)
`/academy` `/learning` `/learn-more` `/features` `/insights` `/success-stories`
`/strategy-playbooks` `/ai-stock-picker` `/smart-advisor` `/smart-money` `/smart-signals`
`/social-trends` `/wsb-trending` `/whale-flow` `/wallet-tracker` `/technical-guide`
`/trading-guide` `/trading-rules`

## 🔎 REVIEW — real features, confirm you use them
`/flow` `/flow-heatmap` `/heatmap` · `/crypto` `/futures` `/futures-research` `/spx`
`/geopolitical` `/historical-intelligence` `/data-audit` `/chart-database` `/ct-tracker`
`/discover` `/discovery` `/generate-ideas` · `/simulator`

## The lean foundation to build on
```
Landing (/) → auth → App shell
  ├─ Home       /p     — dashboard / today
  ├─ Hunt       /h     — ranked ideas (the core)
  ├─ GEX        /g     — gamma
  ├─ Research   /r/:s  — the ONE ticker page (chart, options, catalysts, levels)
  ├─ Positions  /pos   — open trades
  ├─ Journal    /j     — log
  └─ Radars     /radar /btc
Utility: watchlist · alerts · settings · how-to · admin
```
Everything the platform does should hang off those. If a feature can't find a home
in one of them, it's probably not core.

---

## The audit METHOD (run this to go deeper — pages → components → endpoints)
The route cuts above are safe by inspection. The deeper dead-code sweep (which of the
394 components and 763 endpoints are actually reachable) is mechanical — do it in this order:

1. **Pages:** for each `client/src/pages/*.tsx`, check if it's referenced in `App.tsx`.
   Not routed → delete.
2. **Components:** for each `client/src/components/**/*.tsx`, grep the codebase for its
   import. Zero imports (outside its own file) → delete.
3. **Endpoints:** for each `app.(get|post|...)("/api/...")` in `server/routes.ts`, grep
   `client/` for a `fetch("/api/...")` / queryKey hitting it. No client caller AND not an
   internal cron/webhook → delete (or move behind `/api/admin`).
4. **Services:** for each `server/*.ts`, grep for an import. Unimported → delete.
5. **Re-run the build (`npm run build`) after each batch** — the compiler catches anything
   you cut that was still wired.

Do it in batches, commit per batch, so every deletion is reversible.
