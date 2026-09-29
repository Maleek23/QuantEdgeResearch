# Discord → trader journal import

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
