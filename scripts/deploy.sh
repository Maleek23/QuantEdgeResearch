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
  for i in \$(seq 1 40); do c=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health); [ \"\$c\" = 200 ] && break; sleep 3; done
  echo health \$c"
