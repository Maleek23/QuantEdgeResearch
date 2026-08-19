# Deploy — QuantEdge

**One host. One DB. One command.** (The old Replit / Render / Hetzner / PM2 configs
were removed on purpose — this is the only path now.)

- **Host:** Railway
- **Database:** Neon Postgres — the `ep-dark-cherry` branch (the live one)
- **Deploy:** `git push origin main` → Railway auto-builds + redeploys

## Processes
The build (`npm run build`) emits two entrypoints:

| Process | Start command | What it is |
|---|---|---|
| **web** | `npm run start` → `node dist/web.js` | HTTP API + serves the client |
| **worker** | `npm run start:worker` → `node dist/worker.js` | scanners, crons, idea generation |

`railway.json` configures the **web** service. The **worker** is a second Railway
service in the same project pointing at the same repo. (`Procfile` documents both.)

## One-time Railway setup
1. **railway.app** → New Project → **Deploy from GitHub repo** → pick `QuantEdgeResearch`.
   Railway auto-detects Node, runs `npm run build`, then `npm run start` (the **web** service).
2. **Add the worker:** same project → **+ New** → **GitHub Repo** (same repo) →
   set its **Start Command** to `npm run start:worker`.
3. **Env vars** (both services → Variables) — copy from your local `.env`. The ones that matter:
   ```
   DATABASE_URL=<the ep-dark-cherry -pooler Neon string>
   NODE_ENV=production
   # + your API keys: ALPHA_VANTAGE_API_KEY, FINNHUB_API_KEY, TWELVE_DATA_API_KEY,
   #   ADMIN_ACCESS_CODE, ADMIN_PASSWORD, JWT_SECRET, etc.
   ```
   Railway can **reference variables across services**, so set them once and share.
4. Railway gives the web service a public URL. Done.

## From then on
```bash
git push origin main   # Railway rebuilds + redeploys web + worker automatically
```

## Guardrail (do this once, or it bites you again)
The last outage was the Neon `ep-dark-cherry` compute **auto-archiving on idle**,
which dropped the DB and looked like a code failure. In the Neon console → the
`ep-dark-cherry` branch → **Disable archiving** and **Protect** the branch.
