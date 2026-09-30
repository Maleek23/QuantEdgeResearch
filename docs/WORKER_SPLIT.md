# Web / worker split

**Why.** Prod runs one pm2 process, `quantedge-web` (dist/web.js). Every background job runs inside it: idea producers, the outcome tracker, the trigger observer, the quant bot, the chart GEX recorder, the conviction build, the GEX ranking cycle and the SPX scanners. Their native-memory spikes (chain parses, big JSON) push RSS past pm2's `max_memory_restart` (1100M), and the website goes down for about 20 s every few minutes.

**What.** One env switch, `ROLE=web|worker|all`, in `server/lib/process-role.ts`:

| ROLE | Entry | Runs |
|---|---|---|
| `web` | dist/web.js | HTTP, websockets and cheap reads. It serves worker-produced state from Postgres and `.cache/shared/*.json`. |
| `worker` | dist/worker.js (default role there) | Every scheduler, producer, tracker and recorder. No HTTP. |
| `all` | dist/web.js (**default**) | Both halves in one process. This is the pre-split behaviour, the dev default and the rollback. |

`WORKER_ENABLED=true` with no ROLE is still honoured and means `web`.

The single job list is `server/background-jobs.ts`. web.ts and worker.ts both call `startJobs()`, so no job is defined twice. `scripts/test-roles.ts` (`npm run test:roles`) asserts that every job ROLE=all starts belongs to exactly one of web and worker. It also checks that web.ts, worker.ts and routes.ts start no scheduler directly, and that `dist/worker.js --dry` lists exactly the worker jobs without a database.

**No double runs.** Worker jobs start only once the process holds the Postgres scheduler advisory lock (`server/scheduler-lock.ts`). A process that finds the lock taken starts nothing and retries every 30 s. Examples are an old ROLE=all web during a deploy overlap, a second worker, or a dev server on the prod DB. This guards the setInterval jobs too, not only guarded-cron. Under ROLE=web the web process never takes the lock.

Fixed along the way: when the lock could not be attempted (no DATABASE_URL, `SCHEDULER_LOCK=off`, a driver error), `acquireSchedulerLock()` returned true but left `isLeader` false. guarded-cron therefore silently scheduled nothing.

## W1 — inventory (everything web.ts started, plus self-starters)

| Job (registry name) | Was | Role | Route-visible in-memory state → how web reads it |
|---|---|---|---|
| realtime-prices | web.ts | **web** | websocket fan-out (serves clients) |
| bot-notification-ws | web.ts | **web** | `/ws/bot`. Worker `broadcastBotEvent` appends to `shared/bot-events.jsonl`, and web tails it every 2 s and relays to clients |
| weekly-tracker-ws | web.ts | **web** | websocket; refresh and gap-alert timers push to connected clients only (no DB writes) |
| memory-guard:web / :worker | web.ts | **both, one per process** | each guards its own heap. Trim line: web 550 MB, worker 700 MB (`MEMORY_TRIM_RSS_MB`). Worker publishes `shared/worker-health.json` every 60 s. `/api/admin/hub/status` shows it as `worker` (plus `role`) |
| watchlist-monitor | web.ts | worker | DB updates + Discord; no route state |
| spx-scanners (ORB 60s, session 30s, swing catcher 2m, index intelligence SPY 60s, 09:25/16:05 crons) | web.ts | worker | they publish ideas. Worker writes `shared/spx-orb`, `spx-session`, `spx-swing` and `spx-intel` every 30 s. Web getters (`getORBStatus`, `getActiveBreakouts`, `getRanges`, `getActiveSignals`, `getSignalsByStrategy`, `getLevels`, `getActiveSwingAlerts`, `getSwingCatcherStatus`, `getSPXIntelligence`) hydrate by mtime. The admin `…/orb/control` and `…/session/control` "start" actions return 409 under ROLE=web |
| flow-scan | web.ts | worker | DB |
| gex-archive | web.ts | worker | DB (`gex_snapshots`) |
| idea-producers (0DTE index/desk, flags, tape, GEX setups, quant, swings, crypto engine + tracker, pre-market plan/triggers, reversal slate) | web.ts | worker | ideas → DB, plus the four state files below |
| ↳ pre-market ideas | | | `shared/premarket-ideas.json` (day plan). `/api/premarket/ideas` adds `stateSource {asOf, ageSec, stale}`, and `/api/premarket/gappers` uses the same setup map |
| ↳ 0DTE desk | | | `shared/zero-dte-eval.json` (lastEval + ideaEval memos). `/api/zero-dte/desk` adds `engineState {asOf, ageSec}` and still builds rows (chains/bars) on request, as before |
| ↳ 0DTE sniper (only when `ZERO_DTE_SNIPER=true`) | | | `shared/zero-dte-sniper.json` (last cycle + today's rows). `/api/zero-dte/sniper` adds `engineState {asOf, ageSec}` |
| ↳ index 0DTE | | | `shared/index-0dte-last.json`. `getLastIndexScan()` feeds the desk. Under ROLE=web, `/api/scanner/index-lotto` serves the last pass with `lastPassAt`/`lastPassAgeSec` and the GEX hub no longer fires a scan on page view |
| ↳ crypto ideas | | | `shared/crypto-last-scan.json`; `/api/crypto…` desk adds `lastScanSource` |
| trigger-observer | web.ts | worker | DB |
| outcome-tracker | web.ts | worker | DB |
| chart-gex-recorder | web.ts + first chart view | worker | already on disk (`.cache/chart-gex/…`). Under ROLE=web the day cache re-reads a file when its mtime changes. Web publishes charted symbols to `shared/chart-watch.json` and the worker records them. A never-recorded symbol still gets one on-demand sample in web |
| quant-bot | web.ts | worker | DB (paper ledger) |
| convictions-warm (boot + 4 min) | web.ts | worker | worker writes each warmed board to `shared/convictions-<hash>.json`. `getCachedConvictions` / `peekConvictions` in web adopt a board younger than 30 min and **never build while one exists**. They build locally only if the worker published nothing, so the site still works with the worker down |
| gex-rankings (+ magnet actions + squeeze radar cycle) | routes.ts at registration | worker | rows were already persisted (`.cache/last-good/gex-rankings-ALL.json`); web reloads on mtime. `shared/gex-rankings-meta.json` carries cycle, universe and alerts. `shared/squeeze-radar.json` carries the radar's latest scores |
| self-learning (hourly, loads **all** trade ideas) | auto-start on first import (web, via routes) | worker | `shared/self-learning.json` (engine metrics + learned thresholds); web getters hydrate |

**Left in web (cheap, request-driven):** the one-shot Trade Desk cache pre-warm in `registerRoutes`, module cleanup timers (`cache-service`, `cache-middleware`, `audit-logger`, `scan-deduper`), explicit admin one-shot passes (manual flow scan, archive-now, `/api/quant-bot/run`, `/api/index-scalps/run`, `/api/gex-scanner/run`), and on-demand request builds (desk rows, SPX intelligence for non-SPY symbols).

**Retired:** the old `server/worker.ts` job set (auto idea generator, penny scanner, catalyst polling, about 40 crons, the 16:10 self-exit). It never ran in production. The new worker runs exactly what prod ran in web.

**Known gap (accepted):** a lifecycle write in the web process calls `invalidateConvictionsCache()`. Web then re-adopts the worker's last board, which can be up to one warm interval (4 min) old. Under ROLE=all nothing changes.

## Boot stagger (2026-09-30)

**Symptom.** After the jemalloc / `--max-old-space-size=768 --max-semi-space-size=8 --expose-gc` tuning, the worker was stable at 220–640 MB in steady state but went past 1.0–1.27 GB (pm2 cap 900 MB) within about 10 minutes of every boot.

**Cause (from code; not measured locally, since ROLE=worker needs the prod DB).** Every job's *first* pass landed in the same few minutes. Several of those passes also ran outside `runHeavy`, so the one-at-a-time gate never saw them:

| First pass at boot | Before | Gated before? |
|---|---|---|
| conviction boot build | t=0 | yes |
| self-learning (`getAllTradeIdeas()` — the whole table) | t=0, immediate | **no** |
| watchlist monitor | t=0 | no (light: quotes) |
| SPX scanners | t=5 s | no (own intervals) |
| GEX rankings universe loop (one full chain per symbol) | t=90 s | **no** |
| chart GEX recorder (full chain per watched symbol) | t=90 s | yes, per symbol |
| trigger-observer paper reconcile | t=90 s | **no** |
| outcome tracker first sweep + contract backfill (bars per symbol) | t=120 s | **no** |
| quant bot boot cycle / reconcile | t=120 s | cycle yes, reconcile no |
| index 0DTE / desk (producers, full chains) | first */5 minute | yes |
| GEX archive | first :08 | yes |

**Fix.** `JobDef.bootDelayMs` in `server/background-jobs.ts`. `startJobs('worker')` starts jobs in `bootPlan()` order, each on its own timer after the scheduler lock is taken. It logs `🪜 [JOBS] boot stagger: …`, and `node dist/worker.js --dry` prints each job's `+Ns`.

| t (s) | job | first heavy pass |
|---|---|---|
| 0 | memory-guard:worker, **convictions-warm** | conviction board, alone |
| 20 | trigger-observer | cron `*/2`; paper reconcile at +90 s, **now through runHeavy** |
| 40 | watchlist-monitor | light |
| 60 | idea-producers | crons only; index 0DTE ≥ next `*/5` minute (gated, high) |
| 80 | flow-scan | cron only (:03/:18/:33/:48) |
| 100 | spx-scanners | +5 s |
| 120 | outcome-tracker | first sweep + contract backfill **now through runHeavy** (internal 2-min timer removed; the registry delay replaces it) |
| 150 | quant-bot | boot cycle at +120 s (≈ 270 s), gated |
| 200 | chart-gex-recorder | first tick +90 s (≈ 290 s), gated per symbol |
| 240 | gex-archive | cron registration; first run at the next :08, gated low |
| 270 | gex-rankings | first cycle +90 s (≈ 360 s); **each symbol's chain parse now through runHeavy** (`gex-rank:<SYM>`) |
| 300 | self-learning | **each hourly pass now through runHeavy** |

So the conviction build runs first and alone. No two jobs start on the same second (gaps 20–60 s). The full-chain GEX first passes (index scans, chart recorder, rankings, archive) cannot share the first minute; each chain parse holds the gate for its own short slot, and `collectAfterHeavy()` runs after each one.

`WORKER_BOOT_STAGGER=0` restores the old all-at-once start (every delay ignored). Under ROLE=all (web.ts) the same stagger applies after listen. `npm run test:roles` (section 2b) asserts the order, the spacing and the gated first passes.

**Verify after deploy.** Run `pm2 monit` for the first 10 minutes after a worker restart; RSS should not step past about 700 MB. `[HEAVY-GATE] …: waited Ns` lines show the queue working. The worker health snapshot (`.cache/shared/worker-health.json`, memory snapshot `heavyJobs`) shows `droppedStale`; a few `gex-rank:*` drops at boot are expected and harmless (the next cycle retries them).

## Shared state helper

`server/lib/shared-state.ts`:
- `writeSharedSync` / `writeShared` write `<name>.json.<pid>.tmp` and then rename it, so the write is atomic.
- `readShared(name, maxAgeMs)` caches the parse by mtime and size, and returns `{data, writtenAt, ageMs, stale}`.
- `sharedStamp()` produces the `{source, asOf, ageSec, stale}` block stamped into payloads.

Files live in `SHARED_STATE_DIR`, default `<cwd>/.cache/shared`. **Writes happen only under ROLE=worker and reads only under ROLE=web**, so ROLE=all behaves byte-for-byte as before. The one exception is `chart-watch.json`, which web writes.

## Prod `/opt/quantedge/eco.config.cjs` (exact content)

```js
const JEMALLOC = {
  LD_PRELOAD: '/usr/lib/x86_64-linux-gnu/libjemalloc.so.2',
  MALLOC_CONF: 'background_thread:true,dirty_decay_ms:5000,muzzy_decay_ms:5000',
};

module.exports = {
  apps: [
    {
      name: 'quantedge-web',
      script: 'dist/web.js',
      cwd: '/opt/quantedge',
      env: { NODE_ENV: 'production', PORT: 3000, ROLE: 'web', MEMORY_TRIM_RSS_MB: 550, ...JEMALLOC },
      node_args: '--max-old-space-size=512',
      max_memory_restart: '700M',
      kill_timeout: 8000,
      autorestart: true,
      time: true,
    },
    {
      name: 'quantedge-worker',
      script: 'dist/worker.js',
      cwd: '/opt/quantedge',
      env: { NODE_ENV: 'production', ROLE: 'worker', MEMORY_TRIM_RSS_MB: 700, ...JEMALLOC },
      node_args: '--max-old-space-size=768',
      max_memory_restart: '900M',
      kill_timeout: 15000,
      autorestart: true,
      exp_backoff_restart_delay: 2000,
      time: true,
    },
  ],
};
```

Keep any env keys prod's current file already carries, such as `DATABASE_URL` if it is not in `.env`. Both apps read `.env` via `dotenv/config` from the shared cwd.

Budget on 2 GB: web ≤ 700M, worker ≤ 900M, and Postgres about 350–450 MB. Those caps are ceilings, not steady state. Expect about 300–450 MB for web and 500–750 MB for the worker in session. Keep the 2 GB swapfile (docs/MEMORY_BUDGET.md §8).

## Deploy runbook

Do not deploy 08:30–10:30 ET, because the pre-market plan and trigger windows run then. Deploy after the close or before 08:00.

1. `cd /opt/quantedge && git fetch && git merge --ff-only <release>`, then `npm ci --include=dev && npm run build`.
2. Check jemalloc: `ls /usr/lib/x86_64-linux-gnu/libjemalloc.so.2`. If it is missing, run `apt install libjemalloc2`.
3. Dry-run the worker: `ROLE=worker node dist/worker.js --dry`. It needs no DB and should list 13 worker jobs, each with its boot delay (`+0s` … `+300s`).
4. `cp /opt/quantedge/eco.config.cjs /opt/quantedge/eco.config.cjs.bak-$(date +%F)`, then write the content above.
5. Start the worker **first**: `pm2 start eco.config.cjs --only quantedge-worker`. The running web (ROLE=all) still holds the scheduler lock, so the worker logs `scheduler lock held elsewhere — worker jobs wait` and starts nothing. No double runs.
6. Flip the web: `pm2 reload eco.config.cjs --only quantedge-web --update-env`. The old web releases the lock on SIGTERM, and within 30 s the worker logs `scheduler lock acquired — starting worker jobs`.
7. `pm2 save`.
8. Verify:
   - `pm2 logs quantedge-web --lines 50`: expect `ROLE=web` and no `[IDEA-PRODUCERS]`, `[QUANT-BOT]` or `[CONVICTIONS] warm` lines.
   - `pm2 logs quantedge-worker`: expect the `▶️ [JOBS] worker:…` lines.
   - `ls -la .cache/shared/`: `worker-health.json` should be at most 60 s old, and convictions boards should appear after the first warm (about 2–3 min).
   - `curl -s localhost:3000/health`
   - Admin System-health panel: shows `role: web` and a `worker` block with its RSS.
   - `pm2 monit`: no web restarts over the next hour.

## Rollback (one process, as before the split)

1. `pm2 stop quantedge-worker && pm2 delete quantedge-worker`. Its SIGTERM releases the lock.
2. Set `ROLE: 'all'` in the quantedge-web env (or restore `eco.config.cjs.bak-*`), then `pm2 reload eco.config.cjs --only quantedge-web --update-env`.
3. `pm2 save`. The web takes the lock and starts every job itself, exactly as today.

Code-level rollback is not needed: ROLE unset = `all`.
