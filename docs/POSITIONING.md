# QuantEdge — positioning

Status: v1, 2026-09-30 (branch `feat/brand`). This is the source for every sentence that
says what QuantEdge *is*: `<title>`, meta/OG/Twitter tags (`client/index.html` and the
server-injected `server/seo-metadata.ts`, which is what link previews actually read),
`client/src/lib/seo.ts`, the manifest, the landing page, the auth pages, About, the Guide
and the What's new drawer. Change it here first, then everywhere.

## One line

**QuantEdge is a trading research terminal for stocks, options and crypto — every number
carries its evidence and its record.**

Short form (titles, ≤ 60 chars): *QuantEdge Labs | Trading Research Terminal*.

## 25 words

One terminal for stocks, options and crypto: dealer positioning, options flow,
evidence-ranked setups, charts, a paper-trading bot and trading journals — every model
measured, never promised.

## Meta description (≤ 160 chars)

A trading research terminal for stocks, options and crypto: dealer positioning, options
flow, evidence-ranked setups, a paper-trading bot and trading journals.

## Product names (operator "branding 101", 2026-09-30)

Route URLs never change — these are labels.

| Name | What it is | Where it appears | One line | Do | Don't |
|---|---|---|---|---|---|
| **QuantEdge** | The platform — the terminal as a whole (company: QuantEdge Labs) | Titles, link previews, landing, auth pages, About, footer, Discord footers | A trading research terminal for stocks, options and crypto — every number carries its evidence and its record. | "QuantEdge", "the QuantEdge terminal", "QuantEdge Labs" for the company | "Quant Edge", "AI-powered platform", "multi-engine" |
| **NEXUS** | The trading desk — where ideas/setups live: ranked setups, setup detail, BOARD · 0DTE desk, horizon book | Nav (rail/dock/⌘K) "NEXUS", top bar "NEXUS · Trading desk", NEXUS tools, journal "NEXUS ideas" book, Discord idea headers | NEXUS is the trading desk: every setup ranked by its evidence, with entry, stop and target printed. | "on NEXUS", "the NEXUS desk", "NEXUS · 0DTE desk", always upper-case | "Oracle", "Trade Desk", "Nexus"/"nexus" in UI, "signals" as a product name |
| **Quantinum** | QuantEdge's intelligence — the every-engine read of a ticker: verdict + evidence layers, conviction scoring explanations, /api/quantinum/:symbol, Run engine | Ticker page verdict "Quantinum read", Evidence section, "Run Quantinum" button, conviction explanations | Quantinum weighs every engine's evidence for a ticker and shows each layer's argument — measured against its record, never promised. | "Quantinum read", "Quantinum layers", "Quantinum weighs the evidence" | "AI predicts", "6 ML engines", "Quantinum knows", accuracy claims without n |
| **Quantinum Bot** | The paper-trading bot — takes NEXUS's published ideas into a simulated book with real contract marks | Nav "Quantinum Bot", Bot page title, bot tools, journal "Quantinum Bot" book, bot positions/alerts, Discord bot entries | Quantinum Bot trades NEXUS's published ideas on paper and keeps a public record of every fill. | "Quantinum Bot", "the Quantinum Bot record", "paper" every time money is implied | "the bot" alone in headings, "Quant Bot", "auto-trader", implying real money |


## Three pillars

1. **See the positioning.** Where dealers are pinned and where the money is going: GEX and
   VEX by strike and expiry, call/put walls, zero-γ, the squeeze radar, options flow and
   dark-pool levels — each tile with its source and its age.
2. **Rank the setup.** NEXUS is the trading desk: every setup ranked, with entry, stop and
   target printed, plus the 0DTE desk for the index session. Quantinum — QuantEdge's
   intelligence — weighs every engine's evidence for a ticker and shows each layer's
   argument for or against. One ticker page per symbol; charts with the levels on the bars.
3. **Prove the record.** Quantinum Bot trades NEXUS's published ideas on paper and keeps a
   public ledger; the track record reports win rates only with their sample size.
   Your own trades go into a journal — broker import, insights, loss analysis — and
   imported trader journals are measured the same way.

## Modules (one line each)

| Module | Where | What it is |
|---|---|---|
| Today | `/today` | The morning page: the week's dealer map, the best idea, the ranked book, index desk, the model's record. |
| NEXUS | `/t` | The trading desk — ranked setups, setup detail, horizon book; every idea with its evidence, levels and audit trail. |
| NEXUS · 0DTE desk | `/t?nx=0dte` | Same-day index context: SPX/SPY levels, dealer map and flow for the session (data age shown; not an exchange-speed feed). |
| GEX | `/t?tab=gex` | Dealer positioning workspace: strike × expiry matrix, gamma profile, walls, zero-γ, regime, VEX, squeeze radar. |
| FLOW | `/t?tab=flow` | Options flow workspace: prints, sweeps and blocks, top tickers, market tide, flow by strike and expiry, dark-pool levels. |
| CHART | `/t?tab=chart` | Multi-timeframe charts with published walls, zero-γ and idea levels drawn on the bars. |
| Ticker page | `/r/:symbol` | Search a ticker, get one page: live price, the Quantinum read, dealer map, chart, options, setups and this name's record. |
| Quantinum | ticker page, `/api/quantinum/:symbol` | QuantEdge's intelligence: the every-engine read of a ticker — verdict and evidence layers, each with its reason and source. |
| LEAPS | `/t?tab=leaps` | Long-dated calls graded on trend, value and momentum, filtered by budget and grade. |
| CRYPTO | `/t?tab=crypto` | BTC/ETH reads and the measured equity proxies that follow them. |
| CATALYST | `/t?tab=catalyst` | Earnings, macro releases and graded news joined to the live book. |
| Quantinum Bot | `/t?tab=bot` | The paper-trading bot: jobs, gates and a public ledger of every simulated fill. |
| POSITIONS | `/t?tab=positions` | Your open book: stops, targets, alerts. |
| JOURNAL | `/t?tab=journal` | Trading journal: broker/CSV/Discord import, calendar, insights, loss analysis, playbooks, track record, trader journals; books: Mine, Quantinum Bot, NEXUS ideas, traders. |
| Alerts | `/alerts` | Level and idea alerts that fire once. |

## Voice rules

- Say what the product **does**, with the noun a trader would use (walls, zero-γ, flow,
  journal). No "AI-powered", no "N ML engines", no "institutional-grade", no user counts or
  testimonials we cannot show.
- Numbers that change (layer counts, universe sizes) are read from code
  (`CONVICTION_LAYER_COUNT` in `shared/conviction-layers.ts`), never typed into prose.
- Models are **measured, not promised**: a win rate always travels with its *n*; delayed
  data says delayed; nothing is labelled live that is not.
- Product screenshots in marketing use illustrative sample data and say so on the image.

## Where this copy lives (2026-09-30)

- Link previews / SEO: `client/index.html` (title, meta, OG, Twitter, JSON-LD), `server/seo-metadata.ts` (server-injected — what crawlers read), `client/src/lib/seo.ts`, `client/public/manifest.webmanifest`.
- Marketing and auth: `client/src/pages/landing-nexus.tsx` (hero, product mockup, modules, FAQ, CTA, footer), `login.tsx`, `signup.tsx`, `invite-welcome.tsx`, `about.tsx`, `components/waitlist-prompt-modal.tsx` (sign-up gate), `blog-post.tsx`.
- In-product names: `components/shell/nav-groups.ts` (rail/dock/More labels, hints, top-bar titles), both command palettes, `terminal-shell.tsx` (top bar, footer), `components/footer.tsx`, `ticker/ticker-page.tsx` (Quantinum read / Run Quantinum / Quantinum evidence), dashboard defs (`bot.ts`, `nexus.ts`, `today.ts`), `bot/bot-nexus.tsx`, journal books (`server/journals-routes.ts`, `server/journal-sources.ts`, `journal-switcher.tsx`, settings), `terminal-guide.tsx`, `how-to.tsx`, `whats-new.tsx` + `shared/changelog.ts`, Discord embeds (`server/discord-service.ts`).

## Images (2026-09-30)

| File | What | How it was made |
|---|---|---|
| `client/public/og-image.png` (1200×630, ~120 KB) | Link preview: wordmark, one-line definition, module chips, GEX desktop + NEXUS phone captures, "Sample data · illustrative" in the corner | Built client served by `research/device-audit.ts` (`AUDIT_SERVE_ONLY=1`, synthetic fixtures); harness banner removed for the capture only; NEXUS fixture scores spread for the capture; composed as HTML and rendered by Playwright, quantised to 256 colours |
| `client/public/screenshots/qe-gex.webp` (1600×1000) | Landing hero — GEX workspace, desktop | same harness at 1600×1000 DPR 2; banner hidden, "fixture"/"test harness" labels rewritten to "sample" in the DOM for the capture only; canvas → WebP q0.82 |
| `client/public/screenshots/qe-nexus-phone.webp` (600×1301) | Landing hero — NEXUS on a phone | 393×852 DPR 2, NEXUS scores spread (86 → 52) via a route override for the capture |
| `client/public/screenshots/qe-gex-matrix.webp`, `qe-flow.webp` (crops), `qe-nexus.webp`, `qe-quantinum.webp` (/r/SPY), `qe-chart.webp`, `qe-journal.webp` (1600×1000) | Landing product tour, one per module | same method; FLOW and GEX are tile crops (the harness has no feed for the neighbouring tiles); the ticker page's NaN change and "read unavailable" line are hidden |

Nothing in these images is market data; every placement says "Sample data". Re-shoot them
when the UI changes materially.
