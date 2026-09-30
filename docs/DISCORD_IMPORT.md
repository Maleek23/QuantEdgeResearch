# Discord → trader journal import

> **2026-09-29 (feat/forum) — Discord FORUM import.** The operator's server has a
> forum channel of trading journals, one thread per trader. **Journal › Import ›
> Discord forum** (admin only, any book) imports all of them at once into each
> trader's book. This section is that flow; the older single-channel → watchlist
> importer further down is unchanged.

## Discord forum → every trader's book

What it does, per thread:

| From the thread | Lands in | Notes |
|---|---|---|
| Every message (the trader's and anyone replying) | the trader's **Notebook** — `journal_notes`, `source='discord'`, `reason='discord_post'` | Text as posted; author, time, a link back to the message, attachments/images kept as links (never downloaded). Keyed by message id: re-import updates edits, never duplicates. |
| The thread author's calls/fills the parser reads | the trader's **Trades** — `journal_trades`, `broker='discord'`, `broker_order_id='discord:<entry message id>'` | Ticker, side, contract (strike/expiry/call-put), entry, trims, exit, stated stop/target, size when stated. **P&L only when both entry and exit are stated** (exit price, or a % the price is derived from and flagged). Open calls stay open — no exit is ever invented. Each trade carries a parse confidence (0–100%) and its source link. |
| The author's messages that look like trades but did not parse | the **review list** — Notebook › REVIEW filter, and the preview | entry without a price · exit with no open entry · closed without a price · "reads like a trade" (a contract or ticker + trade words but no fill). |
| Tickers they called | their **watchlist** (one row per ticker, latest call as the note) | Same fold as the channel importer. |

Comments by other people in a thread are Notebook posts (labelled with their
author) but never become that trader's trades.

### Thread → trader mapping

The preview proposes a trader per thread and the operator confirms:

- **Existing trader** when a word of the thread name is a trader's slug or name
  ("femi's trading journals" → femi, "UZO's Road to a Milly" → uzo), or the
  thread's author matches a trader's handle.
- **New trader** otherwise, from the first word, possessive dropped:
  "Leeks $300 to 5 figgy challenge" → `leek`, "kasyah's futures journal" → `kasyah`,
  "ayo's trading journal" → `ayo`, "Teejay's journals" → `teejay`,
  "P4E's Journal" → `p4e`, "gushiesty's journal" → `gushiesty`. A new trader is
  created **only** when the operator ticks "create trader" and gives it a name.
  Slug and name are editable in the preview. Any thread can be skipped (threads
  with no posts are skipped by default).

On commit, an existing trader with no source/handle/channel gets `source='discord'`,
the thread author as handle, and the thread id as its Discord channel.

### Bot mode — exact operator steps

1. <https://discord.com/developers/applications> → **New Application** (name it e.g.
   "QuantEdge Journal Reader") → **Bot** → **Reset Token** → copy the token (shown once).
2. Same Bot page → **Privileged Gateway Intents** → turn on **MESSAGE CONTENT INTENT**
   → Save. Without it every message arrives with empty text; the preview warns
   "empty content — enable the Message Content intent for the bot".
3. **OAuth2 → URL Generator** → scopes: `bot` → bot permissions: **View Channels** and
   **Read Message History** only (no Send Messages, nothing else). Open the generated
   URL and add the bot to the server that holds the forum (needs *Manage Server* on
   that server — or send the URL to its owner).
4. If the forum has channel-level permission overrides, make sure the bot's role can
   **View Channel** + **Read Message History** on the forum itself.
5. On the droplet, add to the production `.env` (the web process):
   ```sh
   DISCORD_BOT_TOKEN=<the bot token>
   ```
   and restart the app. `GET /api/journal/sources` then reports
   `capabilities.discordBot: true` and the Import page shows **BOT · READ FORUM**.
6. In Discord: Settings → Advanced → **Developer Mode** on; right-click the forum
   channel → **Copy Channel ID**.
7. Journal › Import › Discord forum → **BOT · READ FORUM** → paste the id → **Read
   forum** → review the mapping/trades → **Import N threads**.

The reader (`server/discord-reader.ts`) only issues `GET`s:
`GET /channels/{forum}` (guild id, type check) → `GET /guilds/{guild}/threads/active`
filtered by `parent_id` → `GET /channels/{forum}/threads/archived/public?before=<archive_timestamp>`
until `has_more` is false → for each thread `GET /channels/{thread}/messages?limit=100&before=<id>`.
It honours `429 retry_after` (bounded retries) and sleeps out `X-RateLimit-Reset-After`
when `X-RateLimit-Remaining` hits 0. ~1,300 messages ≈ 15–20 requests. Caps: 5,000
messages per thread, 20,000 per preview.

### Export mode (no bot token)

1. [DiscordChatExporter](https://github.com/Tyrrrz/DiscordChatExporter) — export **each
   thread** as **JSON** (the GUI lists forum threads under the forum; the CLI takes the
   thread id as the channel):
   ```sh
   DiscordChatExporter.Cli export -t <your token> -c <thread id> -f Json -o "femi.json"
   ```
   (Recent DiscordChatExporter versions can also export a forum's threads in one go —
   check `DiscordChatExporter.Cli export --help` for a thread option. One JSON per
   thread is what the importer expects either way.)
   Don't use `--media` (local paths can't be served).
2. Journal › Import › Discord forum → **EXPORT FILES** → drop all the `.json` files,
   or one `.zip` of them (unzipped in the browser; ≤ 38 MB of JSON per import).
3. Same preview → confirm → import. Several parts of one thread (date ranges) merge
   by message id.

Only JSON: thread identity (id, name, forum, server) comes from the export's
`channel`/`guild` blocks; CSV exports don't carry it.

**Attachment links**: Discord CDN links are signed and expire (~24 h). Posts keep the
link as posted; re-running the bot import refreshes them. Images are never copied.

### Analysis, ranking, NEXUS

- **Journal › Trader ranking** (`GET /api/traders/leaderboard`, `/api/traders/:slug/analysis`):
  per trader — *stated* stats (only trades with entry AND exit posted: win rate,
  avg % on the stated entry equal-weighted, profit factor on % returns, avg R where a
  stop on the risk side was stated, hold time, best setups/tickers, LOW N under 20) and
  *measured on underlying* for calls with no stated exit (open of the first daily bar
  that starts after the post — no look-ahead — then 5 trading bars or to expiry;
  signed for the call's side; stated stop/target used only for stock calls; a bar
  printing both is scored as the stop). Measured results are **never** labelled as
  the trader's P&L. Score = mean of the two win rates, each shrunk toward 50% by 5
  phantom trades. External traders' histories are shown with their dates (the
  platform's pre-2026-08-26 outcome invalidation is about the platform's own records).
- **NEXUS › Trader calls** (`GET /api/trader-calls`): open calls ≤ 5 trading days
  old, parse confidence ≥ 60%, from traders whose score ≥ 55 on ≥ 10 scored calls.
  Shown as "Trader call · Femi · 2h ago" with the message link, the stated entry
  labelled as stated-at-post, and the underlying **repriced live** (quote source
  stamped; a bars-derived quote is marked "last close", never "now"). Also a `TC`
  badge on a matching setup row and an evidence block in the setup detail.
  Thresholds: `TRADER_FEED_MIN_SCORE`, `TRADER_FEED_MIN_SAMPLE`,
  `TRADER_FEED_MAX_AGE_DAYS`, `TRADER_FEED_MIN_CONFIDENCE` (env; defaults in
  `shared/trader-ranking.ts`).
- **Evidence, not an auto-trade.** Trader calls are NOT fed into bot confluence
  (`shared/loss-rules.ts`), conviction scoring, or any bot gate. They are read only
  by NEXUS's display and the journal.

### Schema

`migrations/0003_discord_forum.sql` adds `journal_notes.meta jsonb` (+ an
`(owner_id, reason)` index). **Apply it before deploying this code** — Drizzle
selects every column, so the Notebook errors until the column exists:
```sh
pg_dump "$DATABASE_URL" -Fc -f pre-0003.dump
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/0003_discord_forum.sql
```
Trades need no schema change (source metadata rides in `journal_trades.raw_csv_row`).

### Parser accuracy (fixtures, `scripts/test-discord-forum.ts`)

On 16 labelled fixture messages the grammar was extended against: 16/16 exact. On
12 held-out fixture messages in other styles: 7/12 exact, 36/42 fields (85.7%).
Known misses: `TP 5.00` mid-message (read as nothing, not a target), "bought 100
shares of F" (single-letter ticker without `$`), "Stop hit on RIVN" (no ticker
read), futures prices without decimals ("long ES 5850"), "sold half … for 2.5".
Those land on the review list or as open calls, never as invented P&L.

---

> **2026-09-29 — target changed.** Discord imports now fill a trader's **watchlist**
> (one row per ticker they posted: mention count, last mention, their latest call
> as the note), not their journal. Traders keep their own journal once they have
> accounts. The importer lives in Chart › Watchlist › *trader* › "Import from Discord".
> The parsing grammar below is unchanged.


Fills a trader's journal (Journal → Traders → *name* → **Import from Discord**) from
their Discord channel. Two paths; both end in the same **preview → confirm** step and
nothing is written until you confirm. **Nothing here sends anything to Discord** — the
server only ever issues `GET` requests to Discord's API, and the file path talks to
Discord not at all.

Who can import: an admin (into any trader's journal), or a platform user linked to
that trader (Trader settings → *Linked platform user id*) into their own.

## Path 2 — DiscordChatExporter file (works today, no setup)

1. Install [DiscordChatExporter](https://github.com/Tyrrrz/DiscordChatExporter) (GUI or CLI).
2. Export the channel as **JSON** (preferred — it keeps message ids, replies and
   attachments) or **CSV**:
   ```sh
   DiscordChatExporter.Cli export -t <your token> -c <channel id> -f Json -o femi.json
   # optionally a date range:  --after 2026-01-01 --before 2026-07-01
   ```
   Keep each file under 11 MB (split by date range if needed). Don't use `--media`
   (local file paths can't be served); Discord CDN links are kept as-is.
3. Journal → *Femi* → Import from Discord → **Export file** → drop the file.
4. Review the preview (see below), pick whose messages to import if the channel is
   shared, then **Import**.

CSV exports carry no message id, so each row is keyed by a hash of author + time +
text — re-importing the same CSV is still idempotent, but a CSV and a JSON export of
the same channel are *not* recognised as the same messages. Pick one format per trader.

## Path 1 — bot token (server reads the channel)

Not configured today (the platform only has Discord **webhooks**, which can post but
cannot read). To enable:

1. <https://discord.com/developers/applications> → *New Application* → **Bot** → *Reset Token*;
   copy the token.
2. On the Bot page enable **Message Content Intent** (privileged). Without it Discord
   returns every message with empty `content`; the preview will warn
   "empty content — enable the Message Content intent".
3. OAuth2 → URL Generator → scope `bot`, permissions **View Channels** + **Read Message
   History** only (no Send Messages). Open the URL and add the bot to the server that
   holds the trader's channel — you need *Manage Server* there, or ask its owner.
4. Set on the server (web process) and restart:
   ```sh
   DISCORD_BOT_TOKEN=<bot token>
   ```
5. Copy the channel id (Discord → Settings → Advanced → Developer Mode, then right-click
   the channel → *Copy Channel ID*). Save it on the trader (Journal → trader → ⚙ Trader
   settings → *Discord channel id*), optionally with *Discord author id* to import only
   their messages from a shared channel.
6. Import from Discord → **Bot token** → *Read channel*.

The reader pages newest → oldest with `GET /channels/{id}/messages?limit=100&before=…`,
honours `X-RateLimit-Remaining` / `X-RateLimit-Reset-After` and `429 retry_after`, and
stops at 5,000 messages per preview.

## What becomes what — the grammar

Messages are cleaned (markdown, emoji, mentions, links stripped) and read
case-insensitively (source: `shared/discord-journal-parser.ts`).

| Piece | Recognised as |
|---|---|
| Option contract | `TICKER [MM/DD] STRIKE c/p/call/put [MM/DD \| 0dte]` — `BE 300c 10/2`, `NVDA 10/17 190c`, `SPY 0dte 450p` |
| Stock | `$TICKER`, or a ticker right after a verb (`long AMD`, `short $SPY`) |
| Price | `@ 1.00`, `@.45`, `at 3.2`, `filled 2.1`, `avg 1.9`; `long AMD 145.20` |
| Result | `+300%`, `-8%` (negative if the message says stopped/loss/cut/down) |
| Size | `x3`, `3 contracts`, `5 shares`, `qty 2` |
| Setup tag | `0dte`, `lotto`, `scalp`, `swing`, `leaps`, `earnings play`, or a `#hashtag` |

| Kind | Words | Precedence |
|---|---|---|
| Trim | trim/trimmed, scaled out, sold half, took some, partials, paid myself | 1 |
| Exit | out / all out, sold, closed, exit(ed), stopped (out), cut, took profit, tp | 2 |
| Entry | in, entry, bought, bto, long, opened, grabbed, starter, added, loaded; `short`/`sto` = short side | 3 |

`in`, `out` and `long` count only at the start of a message or right before a
ticker, so "in the money" and "out of town" stay prose. A contract with a price and
no verb (`BE 300c 10/2 @1.00`) is an entry.

**Pairing** (per author, in time order): an entry opens a position; a second entry on
the same contract is an add. An exit/trim attaches to — in order — the message it
**replies to**, the open position on the **same contract**, the latest open position
on the **same ticker**, or, if it names no ticker, the **only** open position.

**Prices and P&L**
- Exit price = the stated price; otherwise entry × (1 + stated %), flagged
  "derived from +300%".
- An exit with neither price nor % → kept as a note (*closed without price*). The
  journal never books a P&L it cannot compute.
- Unstated size → journaled as **1 contract/share**, flagged in the trade's notes.
- Trims with a size (and a sized entry) are averaged into the exit; unsized trims are
  listed in the notes and **not** counted.
- An entry without a price → a note (*entry without price*).

**Notes**: everything else with substance (analysis, charts, commentary; ≥12
characters, a ticker or an attachment) becomes a journal note linked to the tickers it
mentions and its New York trading day. Exits with no open entry are notes too
(*exit with no open entry* — usually an entry before the export's date range). A
message that replies to an open trade joins that trade's timeline instead.

Sample results (these are the test fixtures in `scripts/test-journal.ts`):

| Message(s) | Result |
|---|---|
| `BE 300c 10/2 @1.00` → reply `trimmed` → reply `out +300%` | BE 300C 2026-10-02, 1 contract (size not stated), 1.00 → 4.00 derived, +$300; trim listed, not counted |
| `in NVDA 190c 10/17 @ 2.15 x2` … `out NVDA 190c @ 1.05` | NVDA 190C, 2 contracts, 2.15 → 1.05, −$220 |
| `NVDA holding the 50d, adding if it reclaims 192` | note · NVDA · that day |
| `out TSLA +50%` (no TSLA entry) | note · exit with no open entry |
| `in AMD 150c 11/20 @ 3` … `closed it` | note · closed without price (not scored) |
| `short $SPY @ 452.1` | open short stock position |
| `gm` | ignored |

## Re-imports and edits

Trades are keyed `discord:<entry message id>` and notes by message id (unique indexes
in `migrations/0002_journals_traders.sql`), so importing overlapping history updates
instead of duplicating: a trade that was open and has since closed gets its exit;
tags, emotion and rating an admin added are kept. The preview labels every row
**new / update / unchanged** before anything is written. Previews expire after 30
minutes and can only be committed by the person who made them.

## Screenshots, Mine, and the import job (feat/fvision, 2026-09-29)

Most forum posts are a short line plus a screenshot, so text-only parsing found
almost nothing (femi 742 posts → 0 trades, Leek 347 → 0, Uzo 80 → 1 open call).

**Thread → book** (`shared/discord-forum.ts` `mapThreadToBook`)
- "Leeks $300 to 5 figgy challenge" (any title/author word malik / leek / leeks)
  → **Mine** = the importing admin's own journal. No "Leek"/"Malik" trader is ever created.
- femi → Femi, uzo → Uzo, "ayo's trading journal" → Ayo (created on import, pre-confirmed),
  tommi / teejay → Tommi **pre-selected but not confirmed** — tick "confirm" in the preview.
- Every thread keeps a manual dropdown override (Mine, any trader, new trader, skip).

**Screenshots** (`shared/forum-vision.ts`, `server/forum-vision.ts`)
- The preview only counts images and shows an estimated cost; it never calls a model.
- Import starts a background job (`POST …/forum/commit` → 202 `{jobId}`, poll
  `GET /api/journal/discord/forum/jobs/:id`): images done / total, trades found, spend.
- Model `claude-sonnet-5` (ANTHROPIC_API_KEY), thinking off; fallback `gemini-2.5-flash`
  (GEMINI_API_KEY / GOOGLE_API_KEY). Strict JSON validated with zod; confidence < 0.6 →
  review list, not booked. Text wins over the screenshot on conflicts (flagged on the post).
- Bot-read threads are re-read at import for fresh signed CDN urls; bytes are sent as
  base64 and never stored — only the extracted JSON + attachment id + sha256 in
  `journal_notes.meta.vision` (the cache: re-imports never re-bill an image).
- Concurrency 3; 429/529 retried with backoff (Retry-After honoured, max 5);
  cap `FORUM_VISION_MAX_IMAGES` (default 1500) per import.
- Estimate: ~2,400 input + ~450 output tokens/image at $2/$10 per M ≈ $0.0093/image
  → ~1,170 images ≈ **$11**.

**Pairing** (`shared/forum-pairing.ts`): opens/trims/closes of the same contract across
posts → FIFO round trips; P&L only with both sides known (or a stated realized P&L with a
known size); partial closes split into a closed part + open remainder (`<key>:open`).

**Mine dedupe**: a Discord trade matching a broker row (same underlying/contract/side,
entry ±1 trading day, stated size ≤ broker size) annotates the broker row's notes and is
not inserted; unmatched ones are inserted as broker `discord`, flagged in their notes.

No migration: everything lives in the existing `journal_notes.meta` (0003) and
`journal_trades.raw_csv_row`.
