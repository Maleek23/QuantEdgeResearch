#!/usr/bin/env bash
# Safe deploy: upload the new build to a staging dir, carry over the previous
# build's hashed assets (so open tabs and in-flight index.html never 404),
# then swap directories in one rename and restart. Run from the repo root
# after `npm run build`.
set -euo pipefail
HOST=root@104.248.127.195
KEY=~/.ssh/quantedge_deploy
APP=/opt/quantedge
ssh -i "$KEY" "$HOST" "rm -rf $APP/dist.new && mkdir -p $APP/dist.new"
scp -q -i "$KEY" -r dist/. "$HOST:$APP/dist.new/"
ssh -i "$KEY" "$HOST" "set -e; cd $APP
  if [ -d dist/public/assets ]; then cp -n dist/public/assets/* dist.new/public/assets/ 2>/dev/null || true; fi
  rm -rf dist.old; [ -d dist ] && mv dist dist.old; mv dist.new dist
  git pull -q || true
  pm2 restart quantedge-web --update-env >/dev/null
  # The worker runs every scheduler/producer (docs/WORKER_SPLIT.md) — it must load the new
  # build too. Never inside the weekday 08:30–10:30 ET window (pre-market plans live in its
  # memory) unless FORCE_WORKER=1.
  if pm2 describe quantedge-worker >/dev/null 2>&1; then
    hm=\$(TZ=America/New_York date +%H%M); dow=\$(TZ=America/New_York date +%u)
    if [ \"\$dow\" -le 5 ] && [ \"\$hm\" -ge 0830 ] && [ \"\$hm\" -lt 1030 ] && [ \"${FORCE_WORKER:-0}\" != 1 ]; then
      echo 'worker NOT restarted (08:30–10:30 ET window) — rerun after 10:30 or FORCE_WORKER=1'
    else
      pm2 restart quantedge-worker --update-env >/dev/null && echo 'worker restarted'
    fi
  fi
  for i in \$(seq 1 40); do c=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health || true); [ \"\$c\" = 200 ] && break; sleep 3; done
  echo health \$c"
