#!/bin/bash

# QuantEdge Deploy Script
# Usage: ./deploy.sh

# === CONFIGURE THESE ===
SERVER_IP="46.225.2.217"
SERVER_USER="root"
PROJECT_PATH="/var/www/quantedge"
# ========================

echo "🚀 Deploying QuantEdge to Hetzner..."

# Push to GitHub first
echo "📤 Pushing to GitHub..."
git push origin main

# SSH and deploy
echo "🔗 Connecting to server..."
ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
cd /var/www/quantedge
echo "📥 Pulling latest code..."
git pull origin main
echo "📦 Installing dependencies..."
npm install --production=false
echo "🔨 Building..."
npm run build
echo "🔄 Restarting server..."
pm2 restart all 2>/dev/null || (npm run start &)
echo "✅ Deploy complete!"
ENDSSH

echo ""
echo "🎉 Done! Site is live."
