# Memory budget — web process on the 2 GB droplet

**Box:** DigitalOcean, 1 vCPU / 2 GB RAM. It runs one Node process (pm2 `quantedge-web`, `dist/web.js`) and Postgres 16.
**Incident:** at the 2026-09-30 open the Node process reached ~1.4 GB RSS. The box swapped (58% iowait) and requests took 30–160 s.
**Target:** Node peaks at ≤ ~800 MB RSS, Postgres stays at ≤ ~450 MB, and the OS and page cache keep ≥ ~600 MB. Heavy CPU work runs one job at a time.

## 1. Budget per subsystem (web process)

| Subsystem | Budget (RSS share) | Enforced by |
|---|---|---|
| V8 baseline: bundle (6.2 MB source), Express, drizzle/pg pool, ws | ~180 MB | — (measured by the admin panel after boot) |
| Option chains: Alpaca (`alpaca.chains`, `alpaca.openInterest`) | ≤ 100 MB | BoundedCache 40 chains / 96 MB est., 20 min TTL |
| Option chains: CBOE fallback (`cboe.chains`) | ≤ 100 MB | BoundedCache 40 chains / 96 MB est., 5 min TTL, one shared row set |
| Option chains: contract analyzer + 0DTE desk | ≤ 80 MB | `cboe.contractChains` 40/48 MB, `0dte.deskChains` 30/32 MB |
| GEX snapshots, projections, predictions | ≤ 96 MB | `gex.snapshots` 80/32 MB, `gexvex.projections` 60/32 MB, `unified.predictions` 60/32 MB |
| Candles and bars (Yahoo provider cache, scanner daily/intraday caches) | ≤ 200 MB | `provider.yahooEtc` 400/64 MB. `bullFlag/bearFlag/swing.daily` 300/32 MB each. `intraday.ohlc` 300/32 MB. `quant.avgVolBars` 800/32 MB. `squeeze.bars` 400/32 MB |
| Whole-market grouped daily (Massive) | ~10 MB | own cap: 4 sessions (probe `massive.groupedDaily`) |
| Conviction boards | ≤ 48 MB | `convictions.boards` 8 boards / 48 MB |
| Flow: Bullflow reads, persisted prints by date, chart flow days | ≤ 60 MB | `bullflow.reads` 300/24 MB, `bullflow.persistedPrintsByDate` 6 dates, `chart.flowDays` 6/32 MB |
| Everything else (quotes, TA, fundamentals, small maps) | ≤ 60 MB | per-cache entry caps (see §3) |
| Transient job working set (one heavy job at a time) | ~100 MB | heavy-job gate, concurrency 1 |
| **Planned peak** | **~800 MB** | memory guard trims at 900 MB. pm2 restarts at 1100 MB |

Byte budgets are *estimates*: `sizeOf` per entry, calibrated against `research/memory-soak.ts`. An Alpaca contract retains ~530 B; a CBOE Tradier-shaped row retains ~800 B. Treat them as order-of-magnitude.

## 2. What was unbounded (M1 inventory, ranked by likely memory)

| # | Cache (file) | Held | Key cardinality | Entry size | Old eviction | Now |
|---|---|---|---|---|---|---|
| 1 | `_cboeCache` (cboe-options-fallback.ts) | full decoded chain, **near-money slice rebuilt as a 2nd copy**, a new ISO string per contract | every symbol any scanner priced (~160 in a burst) | 0.3–15 MB | only when > 300 entries; expired entries never dropped | 40 / 96 MB / 5 min, slice shares rows, one shared timestamp string |
| 2 | `chainCache` (alpaca-options.ts) | every contract ±40% / 180 d | symbol × expiry × band | 0.2–5 MB | only when > 400 entries | 40 / 96 MB / 20 min |
| 3 | `readPersistedPrints` (bullflow-service.ts) | **read the whole never-rotated JSONL** (every session since day one), then split and parsed it, once a minute per chart viewer, plus the squeeze radar and scorer | per call | whole file (tens of MB, growing) transient | n/a | streamed line by line with a date prefilter; one result per date shared by all callers for 30 s (today) / 10 min |
| 4 | `_cache` (provider-cache.ts) | Yahoo chart payloads (1m/5m intraday are 100–300 KB) | symbol × range × interval | 5–300 KB | only when > 800; stale entries kept forever | 400 / 64 MB; dropped 30 min past expiry |
| 5 | `oiCache` (alpaca-options.ts) | OI row Map per chain | same as chains | 0.1–1 MB | none | 40 / 30 min |
| 6 | `flowDayCache` (chart-overlays.ts) | all flow prints for a date | every date charted | 1–5 MB | none | 6 dates / 32 MB |
| 7 | `timeline` (chart-overlays.ts) | GEX samples sym → date → samples (disk-backed) | every symbol charted × ≤ 14 dates | ~80 KB / sym-day | none | 40 symbols (reloads from disk) |
| 8 | `_convictionsCache` | full conviction board | options JSON (includes a per-user weekly id) | 1–5 MB | > 16 | 8 / 48 MB / 30 min |
| 9 | `chainCache` (contract-analyzer/cboe-chain.ts), `chainCache` (zero-dte-desk.ts) | raw chains for contract selection / desk | symbols | 0.2–5 MB | none | 40 / 48 MB, 30 / 32 MB |
| 10 | scanner bar caches: `dailyCache` (bull/bear flag), `dailyDataCache` (swing), `_ohlcCache` (intraday), `intradayCache` (daytrade, SPX ORB), `barsCache` (squeeze), `avgVolCache` (quant), `historyCache` (breadth) | raw daily / intraday bars | scanner universes (100–600) | 10–100 KB | none | 20–800 entries, 16–32 MB each |
| 11 | `occMem` (squeeze-radar.ts) | whole-market OCC volume per date | dates | ~1 MB | none | 25 / 32 MB |
| 12 | `cache` (gex-snapshot-service.ts), `projectionCache`, `predictionCache` | GEX snapshots / projections | symbols | 20–300 KB | none | 60–80 entries / 32 MB |
| 13 | `groupedCache` (massive-market-data.ts) | whole-market daily bars | dates | ~2.5 MB | 4 days (already fixed) | probe only |
| 14 | small keyed maps: `quoteCache` (realtime-pricing), `yahooQuoteCache`, `fundamentalCache` (market-api), `_taCache`, `cache` (peer-confirmation, crypto engine, multi-source, bullflow reads), `_fundCache` (leap), `convergenceCache`, `spotBySymbol` | quotes / small reads | symbols | < 5 KB | none (grow with the universe) | 200–3000 entries, TTLs ≥ each caller's stale window |

Left as they are, because they are already bounded or tiny: `massive groupedCache` (4 days), the Bullflow print ring (600), `gexSetups` (100), `system-pulse` ring, `audit-logger` (MAX_AUDIT_LOGS), the flow-scanner alert queue, `crypto oiHistory` (12 h window per coin), `premarket-ideas` day state (reset daily), WebSocket client maps (removed on close), and cooldown/dedupe maps of `symbol → timestamp`. None of these was a meaningful share of RSS.

## 3. Mechanisms

* **`server/lib/bounded-cache.ts`**: `BoundedCache<K,V> extends Map`. It enforces LRU `maxEntries`, a hard-retention `ttlMs`, and an optional `maxBytes` over `sizeOf` estimates. A `new Map()` converts in place and its call sites don't change. Every instance registers by name. `registerCacheProbe` exposes structures that bound themselves (Massive grouped).
* **`server/lib/memory-guard.ts`**: checks RSS every minute. Above `MEMORY_TRIM_RSS_MB` (default 900) it LRU-trims every registered cache to 50%, calls `gc()` if exposed, and logs before/after RSS and what it evicted. It won't trim again for 2 min. Every 10 min it sweeps expired entries and logs RSS, heap, and the 8 largest caches. `MEMORY_GUARD=false` disables it.
* **`GET /api/admin/hub/status` → `memory`**: returns rss, peak rss, heapUsed/Total/limit, external, arrayBuffers, per-cache entries and approx MB, trim count and last trim, and the heavy-job gate's running/queued jobs and wait stats.
* **`server/lib/heavy-job-gate.ts`**: `runHeavy(name, fn, {priority})`. Concurrency is 1 (`HEAVY_JOB_CONCURRENCY`). The queue is FIFO within a priority, and `high` jumps ahead. A second copy of a job that is already queued is dropped. A queued job is dropped after `maxWaitMs` (default 4 min). A job that holds its slot for more than 5 min (`HEAVY_JOB_MAX_HOLD_MS`) gets its slot released. Each wait over 1 s is logged with the jobs that were running at the time.

## 4. Timers (M3)

Minute map, ET, market hours. The 5-minute cadences own minutes ≡0 mod 5 (index 0DTE) and ≡1 mod 5 (0DTE desk). The quant bot owns ≡4 mod 10. Every other heavy job starts on a ≡2 or ≡3 minute:

| Job | Old | New | Gate priority |
|---|---|---|---|
| Index 0DTE | */5 (*/2 at 15h) | unchanged | high |
| 0DTE desk | 1-59/5 (1-59/2 at 15h) | unchanged | high |
| Pre-market triggers | 9:30–10:30 /2 | unchanged | high |
| Quant bot cycle | 4-54/10 | unchanged | normal (flatten/settle: high) |
| Tape (Bullflow) | */10 | 2-59/10 | normal |
| Options-flow scan (web.ts) | */15 | 3-59/15 | normal |
| GEX archive (web.ts) | :00 hourly | :08 hourly | low |
| Bull flag / bear flag / base reclaim | :05 / :20 / :35 | :13 / :23 / :38 | normal |
| GEX setups | :00, :30 | :17, :47 | normal |
| Quant sweep | :12, :42 | :27, :57 | normal |
| Leader swing (10, 14) | :05 | :43 | normal |
| Crypto proxy / index swing / premium-discount (9, 13) | :45 / :55 / :58 | :49 / :53 / :58 | normal |
| Crypto ideas (UTC :07/:37) / crypto tracker (*/5) | unchanged | unchanged | normal / low |
| Conviction warm (4 min interval) | ungated | gated | low |
| Outcome tracker and contract backfill (5 min interval) | ungated, whole book in one `Promise.all` | gated; open book judged in slices of 25 (`OUTCOME_BATCH`) with `setImmediate` between slices | low |
| Chart GEX recorder (5 min, ≤ 20 symbols) | one sequential loop | each symbol takes its own gate slot | low |

Before the change, 10:00 ET started six heavy jobs in the same minute: flow scan, GEX archive, GEX setups, index 0DTE, tape, and pre-market triggers. After it, 10:00 starts only index 0DTE, and nothing else heavy can run at the same time.

Not gated: the SPX ORB/session/intelligence/swing-catcher intervals (30 s–2 min, small bar reads), the watchlist monitor, the weekly tracker, and the realtime price feeds. They are light and latency-bound.

## 5. Measured (M6 — `research/memory-soak.ts`, 200 symbols, synthetic, retained heap after full GC)

```
                 before    after   after (worst: the 40 biggest chains stay hot)
alpaca chains    124.9 MB   16.5 MB   61.4 MB
cboe chains      253.8 MB   24.0 MB   85.2 MB
yahoo candles     79.2 MB   52.9 MB   52.9 MB
total            458.0 MB   93.4 MB  199.6 MB
Bullflow prints read (31 MB file): peak +82.5 MB heap → +13.6 MB heap
```

A 200-symbol burst used to retain ~460 MB in these three caches alone, all of it before the scanners' own bar caches. That matches the observed climb to 1.4 GB. The caps now hold them to 95–200 MB in the worst case.

## 6. pm2 (prod `/opt/quantedge/eco.config.cjs`, not in git; the repo `ecosystem.config.cjs` mirrors it)

```js
node_args: '--max-old-space-size=1024',   // keep for now
max_memory_restart: '1100M',              // safety net behind the 900 MB trim
```

Only lower `--max-old-space-size` to **768** after the admin memory panel shows `heapUsed` peaking below ~550 MB across a week of opens. That leaves 30% headroom for GC. With the caps above the heap should fit, but it hasn't been measured on prod yet. A heap limit that is too tight turns a slow day into an OOM crash loop.

## 7. Postgres 16 on the same box: recommended, NOT applied

For 2 GB shared with a Node process budgeted at 800 MB:

```conf
shared_buffers = 256MB
effective_cache_size = 768MB        # planner hint only; no allocation
work_mem = 4MB                      # per sort/hash node per query — keep small
maintenance_work_mem = 64MB
max_connections = 30                # app pool + psql + pg_dump headroom
wal_buffers = 8MB
max_wal_size = 1GB
min_wal_size = 256MB
random_page_cost = 1.1              # SSD
effective_io_concurrency = 200
max_worker_processes = 2
max_parallel_workers = 1
max_parallel_workers_per_gather = 0 # 1 vCPU: parallel query only adds contention
autovacuum_max_workers = 2
```

Expected Postgres footprint is ~256 MB of shared buffers plus ~5–10 MB per active backend, about 350–450 MB at 30 connections. The app's `pg` pool defaults to 12 (`DB_POOL_MAX`, server/db.ts), which stays well inside `max_connections = 30`. Apply with `ALTER SYSTEM` plus a restart during a closed market, and confirm with `SHOW shared_buffers;`.

## 8. OS

Add a 2 GB swapfile if one isn't already there, with `vm.swappiness=10`. The swapfile keeps a spike from triggering the OOM killer, and the low swappiness stops the kernel from swapping pages out early, which is how normal load turned into 58% iowait.
