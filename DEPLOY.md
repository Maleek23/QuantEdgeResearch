# Deploying QuantEdge

Two services, one image, one database.

| Service | Command | Instances | Purpose |
|---|---|---|---|
| `web` | `node dist/web.js` | scale freely | HTTP + the client bundle |
| `worker` | `node dist/worker.js` | **exactly 1** | all 35 background jobs |

The database is already on Supabase and does not move. `server/db.ts` pins
`DATABASE_URL` to `.env.supabase` with `override: true`, so **that file must
exist in the image or the override must be removed before deploying** — see
"Before the first deploy" below.

---

## Before the first deploy

**1. Rotate the exposed credentials.** These were pasted into a chat transcript
and must be considered public:

- `FINNHUB_API_KEY` — regenerate at finnhub.io
- the webhook secret that was pasted into a chat transcript (rotate it in the provider console; it is deliberately not reproduced here)

**2. Generate a fresh `SESSION_SECRET`.** Anyone holding it can forge sessions:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**3. Decide how `DATABASE_URL` reaches production.** `server/db.ts:10` does:

```ts
config({ path: ".env.supabase", override: true });
```

`.env.supabase` is gitignored, so it will **not** be in the image, and the
override silently no-ops — the app falls back to the platform's `DATABASE_URL`.
That is the behaviour you want in production, but it is accidental rather than
designed. Either set `DATABASE_URL` in Railway (recommended) and leave the
override to fail harmlessly, or delete that line.

---

## Railway

Create one project with **two services from the same repo**. Point each at its
own config file via the service's `RAILWAY_CONFIG_PATH` variable:

| Service | `RAILWAY_CONFIG_PATH` |
|---|---|
| web | `railway.web.json` |
| worker | `railway.worker.json` |

### Environment variables

Shared by both services:

```
DATABASE_URL, SESSION_SECRET, NODE_ENV=production, HOST=0.0.0.0
POLYGON_API_KEY, FINNHUB_API_KEY, TRADIER_API_KEY, TRADIER_ACCOUNT_ID
ALPACA_API_KEY, ALPACA_SECRET_KEY, ALPACA_PAPER=true
DB_POOL_MAX=6
```

Web only — these stop the web tier from duplicating the worker's jobs:

```
WORKER_ENABLED=true
DISABLE_WEB_FLOW_CRON=1
```

### Sizing `DB_POOL_MAX`

The limit is **across all instances at once**. Supabase's pooler caps at 15:

```
(15 - 2 for the scheduler lock and headroom) / instances = DB_POOL_MAX
```

2 web + 1 worker → `DB_POOL_MAX=4`. One web + one worker → `6`. Exceeding the
cap does not fail loudly; requests queue on `connectionTimeoutMillis` and the
site appears to hang.

---

## Why the worker must be a single instance

Every background job writes to one shared database. Two schedulers publish the
same signal twice, and because both processes check the ingestion dedup before
either inserts, both read "no existing row" and both write.

`server/scheduler-lock.ts` holds a Postgres session advisory lock to prevent
this. It is a safety net, not a licence to scale the worker: a second worker
takes the lock, loses, and idles doing nothing.

The lock is released automatically when a process dies, and explicitly on
SIGTERM so a rolling deploy hands over immediately.

### Verifying it works

Worker logs on a healthy deploy:

```
[SCHEDULER-LOCK] acquired — this instance runs the background schedulers
```

Web logs:

```
👥 WORKER_ENABLED=true — background jobs belong to the worker tier, web schedules nothing
```

If you ever see `[SCHEDULER-LOCK] another process holds the scheduler lock` on
the worker, a second worker or an orphaned process is alive.

---

## Health check

`GET /api/health` returns **200 whenever the process can serve**, with a body
that reports each dependency:

```json
{ "status": "degraded", "checks": { "postgres": { "ok": true } } }
```

`degraded` is deliberate — a vendor outage (Tradier, Yahoo) should not cause the
platform to be restarted. Alert on `checks.postgres.ok === false`, not on
`status`.

---

## Concurrent users

- Sessions are Postgres-backed (`connect-pg-simple`, `sessions` table), so they
  survive restarts and work across multiple web instances.
- Cookies are `httpOnly`, `sameSite: lax`, and `secure` when `NODE_ENV=production`
  — so **the site must be served over HTTPS** or nobody can log in.
- Signals in `trade_ideas` are global: every user sees the same board. That is
  by design for a signals product. Per-user data (watchlist, preferences,
  layouts, paper portfolios) is scoped by `user_id`.
