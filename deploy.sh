#!/bin/bash

# QuantEdge Deploy Script
# Usage: ./deploy.sh

# === CONFIGURE THESE ===
SERVER_IP="46.225.2.217"
SERVER_USER="root"
PROJECT_PATH="/var/www/quantedge"
BRANCH="main"
# ========================

set -e  # Exit on any error

echo "🚀 Deploying QuantEdge to Hetzner..."

# Get current commit for verification
LOCAL_COMMIT=$(git rev-parse --short HEAD)
echo "📍 Local commit: $LOCAL_COMMIT"

# Push to GitHub first
echo "📤 Pushing to GitHub..."
git push origin $BRANCH

# SSH and deploy
echo "🔗 Connecting to server..."
ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
cd ${PROJECT_PATH}

echo "📥 Syncing to origin/${BRANCH}..."
git fetch origin
git reset --hard origin/${BRANCH}

REMOTE_COMMIT=\$(git rev-parse --short HEAD)
echo "📍 Server commit: \$REMOTE_COMMIT"

echo "📦 Installing dependencies..."
npm install --production=false

echo "🔨 Building..."
npm run build

echo "🔄 Restarting server..."
# Delete old process and start fresh with proper memory (2GB heap + 2.5GB restart limit)
pm2 delete quantedge 2>/dev/null || true
NODE_ENV=production NODE_OPTIONS='--max-old-space-size=2048' pm2 start dist/index.js \
  --name quantedge \
  --max-memory-restart 2500M \
  --exp-backoff-restart-delay=100
pm2 save

echo ""
echo "✅ Deploy complete! Server now at commit: \$REMOTE_COMMIT"
ENDSSH

echo ""
echo "🎉 Done! Site is live at https://quantedgelabs.net"
echo "📍 Deployed commit: $LOCAL_COMMIT"
