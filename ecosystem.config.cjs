module.exports = {
  apps: [{
    name: 'quantedge-server',
    script: 'npx',
    args: 'tsx server/index.ts',
    cwd: '/Users/abdulmalik/UnTitld/QuantEdgeee',
    env: {
      NODE_ENV: 'development',
      PORT: 8081,  // Using 8081 (8080 has zombie process)
      NODE_OPTIONS: '--max-old-space-size=4096 --expose-gc'  // 4GB heap + manual GC
    },
    watch: false,  // Don't restart on file changes (use manual restart)
    autorestart: true,  // Restart on crash
    max_restarts: 3,  // Lower restarts to prevent infinite crash loops
    min_uptime: 10000,  // Must stay up 10s to count as successful
    restart_delay: 5000,  // Wait 5s between restarts
    error_file: '/Users/abdulmalik/UnTitld/QuantEdgeee/logs/pm2-error.log',
    out_file: '/Users/abdulmalik/UnTitld/QuantEdgeee/logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
  }]
};
