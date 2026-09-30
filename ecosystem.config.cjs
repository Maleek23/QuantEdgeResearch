/**
 * PM2 process file — the production shape the code already expects:
 * web.js (HTTP + WS + light scanners) and worker.js (all generators,
 * scanners, bots, crons; exits at 4:10 PM ET and PM2 restarts it).
 *
 *   npm ci --include=dev && npm run build
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup     # survive reboots
 */
module.exports = {
  apps: [
    {
      name: 'quantedge-web',
      script: 'dist/web.js',
      env: { NODE_ENV: 'production', PORT: 3000 },
      // Memory budget (docs/MEMORY_BUDGET.md): caches are bounded and the
      // in-process guard trims them above 900 MB RSS; pm2 restarts at 1100M as
      // the last-resort safety net. Keep the heap cap at 1024 until the admin
      // System-health memory panel shows heapUsed peaking < ~550 MB for a week,
      // then 768 is safe. Prod's /opt/quantedge/eco.config.cjs must carry the
      // same two lines.
      node_args: '--max-old-space-size=1024',
      max_memory_restart: '1100M',
      autorestart: true,
      time: true,
    },
    {
      name: 'quantedge-worker',
      script: 'dist/worker.js',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '1800M',
      autorestart: true,   // the 4:10 PM ET self-exit relies on this restart
      time: true,
    },
  ],
};
