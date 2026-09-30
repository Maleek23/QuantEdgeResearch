/**
 * PM2 process file — the web/worker split (docs/WORKER_SPLIT.md).
 *
 *   quantedge-web     dist/web.js    ROLE=web     HTTP + websockets + cheap reads
 *   quantedge-worker  dist/worker.js ROLE=worker  every scheduler/producer/tracker/recorder
 *
 * Both apps MUST share one cwd: the worker publishes route state to
 * <cwd>/.cache/shared and the web reads it (server/lib/shared-state.ts).
 * Prod's /opt/quantedge/eco.config.cjs carries the same content (see the doc).
 *
 * Rollback = one process again: stop quantedge-worker, run quantedge-web with
 * ROLE=all (the pre-split shape; also the default when ROLE is unset).
 */
const JEMALLOC = {
  // jemalloc returns freed native memory (chain parses, JSON buffers) to the OS
  // instead of letting glibc arenas fragment — what made RSS ratchet into the
  // pm2 restart line. Ubuntu: apt install libjemalloc2.
  LD_PRELOAD: '/usr/lib/x86_64-linux-gnu/libjemalloc.so.2',
  MALLOC_CONF: 'background_thread:true,dirty_decay_ms:5000,muzzy_decay_ms:5000',
};

module.exports = {
  apps: [
    {
      name: 'quantedge-web',
      script: 'dist/web.js',
      cwd: __dirname,
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
      cwd: __dirname,
      env: { NODE_ENV: 'production', ROLE: 'worker', MEMORY_TRIM_RSS_MB: 700, ...JEMALLOC },
      node_args: '--max-old-space-size=768',
      max_memory_restart: '900M',
      // Lets SIGTERM release the scheduler lock before pm2 kills the process.
      kill_timeout: 15000,
      autorestart: true,
      // A crash loop must not hammer providers: back off between restarts.
      exp_backoff_restart_delay: 2000,
      time: true,
    },
  ],
};
