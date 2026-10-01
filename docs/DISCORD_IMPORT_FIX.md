# Discord forum import: author attribution fix + Femi/Ayo repair (2026-09-30)

Branch `fix/discord-import-attribution`. Diagnosis: `docs/FEMI_JOURNAL_ANALYSIS_2026-09-30.md` (branch `research/femi`).

## What was wrong

`primaryAuthor()` in `shared/discord-forum.ts` picked the thread CREATOR as the journal author. Uzo created Femi's and Ayo's threads. As a result:

- Uzo's 48 comments were stored as Femi's journal entries (`byTrader: true`), and Femi's 672 posts were stored as comments.
- Only Uzo's messages went to the trade parser.
- Only Uzo's 5 images were queued for screenshot reading. Femi's 796 were never counted.
- Femi and Ayo got the handle `uzo🃏`, and `ensureTrader` never overwrote a handle.
- Chart jargon (HH, HL, OI, HTF, RR, LTF) was parsed as tickers. Femi's watchlist got `CES HOLY LTF SHIT`.

## What changed

| area | file | change |
|---|---|---|
| attribution | `shared/discord-forum.ts` `resolvePrimaryAuthor()` | The author is picked in this order: the operator's override, then `traders.discord_author_id` (if that author posted in the thread), then an author whose name matches the mapped trader's slug, name or aliases and wrote ≥20% of the thread (or the most), then whoever wrote the most. The creator only breaks ties. The stored handle is never used, because the bug wrote it. `primaryAuthor()` keeps its signature (dominant author, creator breaks ties). |
| import | `server/discord-forum-import.ts` | The preview maps the book from the title first, then resolves the author for that book. Each author row carries its exact image count, already-read count and parse summary. Commit accepts a per-thread `authorId`. It resolves the author once per thread before anything is read, so vision, trades and `byTrader` all follow it. `ensureTrader` persists `discord_author_id` and updates the handle when the handle is empty or is any Discord name from that thread (`traderPatchFor`). A handle an admin typed is kept. |
| UI | `client/src/components/journal/discord-forum-import.tsx` | Each thread gets a **Journal author** dropdown showing messages and images per author. It also shows why that author was chosen ("name matches the trader", "wrote the most messages"…) and "thread created by X (not the journal author)". Screenshot counts, cost, trades, review and confidence follow the chosen author. The Import button shows `read N screenshots (~$X)` before anything is billed. The job result lists the author used and any handle change. |
| route | `server/journals-routes.ts` | The commit body gains an optional `threads[].authorId`. |
| tickers | `shared/ticker-stoplist.ts` (new) | `CHART_JARGON` covers TA, options, sessions, risk and macro-event shorthand. `ENGLISH_CAPS` covers common English words. A bare word on either list is never a ticker. Explicit forms (`$BE`, `BE 30c 10/2`, `BB:` leading a line, `100 shares of F`) skip the lists. When the universe is known, every symbol must be in it. |
| parser | `shared/discord-journal-parser.ts` | Applies the stop-lists. Adds `explicitTickers`. |
| universe | `server/known-tickers.ts` (new) | The universe is: liquid top-2000 (the same set `/api/search/symbols` answers from first), the curated sector universe, the approved and skip lists, crypto, and futures roots. If the liquid snapshot is missing, it returns `null` and only the stop-lists apply. |
| watchlist | `server/discord-journal-import.ts` | `watchCandidates` / `upsertTraderWatchlist` take the universe. |
| repair | `shared/discord-reimport-plan.ts` (new), `research/discord-reimport-{shared,preview,apply}.ts` (new) | Pure repair planner, plus the dry-run and apply scripts. |

Tests: `npx tsx scripts/test-discord-attribution.ts`. They are also chained from `scripts/test-discord-forum.ts` → `npm run test:journal`.

## Runbook (coordinator, after deploy)

Nothing below has been run against production.

### 0 · Deploy

Deploy outside 08:30–10:30 ET, from the integration worktree, the usual way:

```bash
npm run build
scp -i ~/.ssh/quantedge_deploy -r dist root@104.248.127.195:/opt/quantedge/
ssh -i ~/.ssh/quantedge_deploy root@104.248.127.195 'pm2 restart quantedge-web'
```

### 1 · Dry run (read-only)

The scripts need the source tree, `tsx`, a `DATABASE_URL` pointing at the production Postgres, and the liquid-universe snapshot. Without the snapshot, junk detection falls back to the stop-lists only, and the apply step refuses to run.

**On the laptop**, from a checkout of this branch (its `.env` `DATABASE_URL` is the droplet Postgres):

```bash
mkdir -p server/data
scp -i ~/.ssh/quantedge_deploy root@104.248.127.195:/opt/quantedge/server/data/liquid-universe.json server/data/
npx tsx research/discord-reimport-preview.ts            # femi + ayo
npx tsx research/discord-reimport-preview.ts femi --json > /tmp/femi-reimport-plan.json
```

**On the droplet**, if the source tree and `tsx` are present in `/opt/quantedge` (not verified; prod normally ships only `dist/`):

```bash
cd /opt/quantedge && npx tsx research/discord-reimport-preview.ts
```

What to check in the output:

- **femi:**
  - resolved author = Femi (`808178189972668426`), about 672 messages, via `name` or `dominant`.
  - "old import used: uzo🃏 (`791208721995923516`)  <- CHANGES"
  - screenshots ≈ 796, est **≈ $7.40**
  - handle `"uzo🃏" -> "<Femi's Discord name>"`
  - junk watchlist rows: `CES HOLY LTF SHIT`
  - about 672 notes become his posts and 48 become comments
- **ayo:**
  - resolved author = Ayotheone, about 32 messages.
  - handle `"uzo🃏" -> "Ayotheone"`
  - Uzo's 4 posts become comments.
- The `ticker universe:` line must show a symbol count, not `COLD`.

### 2 · Apply

Apply writes the trader handle and `discord_author_id`, deletes the junk watchlist rows, and re-links `journal_notes.meta.byTrader` and cleans the symbols on those notes. It runs one transaction per book, is idempotent, makes no model calls and sends nothing to Discord.

```bash
npx tsx research/discord-reimport-apply.ts              # prints the plan, writes nothing
npx tsx research/discord-reimport-apply.ts --apply      # femi + ayo
```

It does not delete `journal_trades`. Discord trades parsed from someone else's message are listed in the plan, and the re-import's stale-row pass removes them.

### 3 · Re-import with screenshot reading (operator, in the UI; this is the only billed step)

1. Open **Journal → Import → Discord forum**, choose **BOT · READ FORUM**, and enter forum id `1457570432000462929`. Click **Read forum**.
2. Check **femi's trading journals**:
   - book **Femi**
   - **Journal author** = Femi, with "name matches the trader" or "matches the trader's saved Discord id" and "thread created by uzo🃏 (not the journal author)"
   - about **796 screenshots**, **~$7.40**
3. Check Ayo's thread: book **Ayo**, journal author **Ayotheone**.
4. To bill only Femi and Ayo, set the other threads (Uzo's, "Leeks $300…") to **Skip this thread**. Those threads' screenshots would otherwise be read too. The preview prints their exact cost.
5. Confirm the Import button reads `Import 2 threads · read ~8xx screenshots (~$7.x)`, then click it. Wait for the job to finish. The result line shows `author Femi… · handle uzo🃏 → …`.
6. Work through Femi's review list (screenshot readings below 0.6 confidence).

### Cost

- The estimate is $0.0093 per image (`shared/forum-vision.ts`: ~2,400 input + ~450 output tokens, `claude-sonnet-5` at $2/$10 per M tokens).
- Femi's 796 images come to **≈ $7.40**. Ayo's images add to that; the dry run prints the figure.
- Already-read images are never billed twice.
- The cap is `FORUM_VISION_MAX_IMAGES` (default 1500).
