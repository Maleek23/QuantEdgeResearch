# QuantEdge Deployment Guide

## Quick Deploy to Render.com (FREE)

### Step 1: Deploy (2 minutes)
1. Go to [render.com](https://render.com) and sign up (free)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repo: `Maleek23/QuantEdgeResearch`
4. Render will auto-detect the `render.yaml` config
5. Click **"Create Web Service"**

Your app will be live at: `https://quantedge-research.onrender.com`

### Step 2: Add Environment Variables
In Render dashboard → Your service → **Environment**:

**Required:**
```
DATABASE_URL=postgresql://neondb_owner:npg_CsmNx5Si6IoR@ep-restless-mud-aesu2f62.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require
GEMINI_API_KEY=your_gemini_key
GROK_API_KEY=your_grok_key
TRADIER_API_KEY=your_tradier_key
ADMIN_EMAIL=abdulmalikajisegiri@gmail.com
ADMIN_ACCESS_CODE=0065
```

**Optional (for full features):**
```
DISCORD_WEBHOOK_URL=your_discord_webhook
RESEND_API_KEY=your_resend_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_secret
APP_URL=https://your-domain.com
```

### Step 3: Add Custom Domain (FREE on Render)
1. Go to **Settings** → **Custom Domains**
2. Click **"Add Custom Domain"**
3. Enter your domain: `quantedge.com` or `app.quantedge.com`
4. Add the DNS records to your domain provider:
   - **CNAME**: `quantedge-research.onrender.com`
   - Or **A Record**: (Render will provide the IP)
5. Render provides **FREE SSL** automatically!

### Step 4: Update Google OAuth (if using)
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Update **Authorized redirect URIs**:
   - Add: `https://your-domain.com/api/auth/google/callback`
3. Update `APP_URL` env var to your new domain

---

## Alternative: Railway.app ($5 free credits/month)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

Railway gives you a free subdomain and easy custom domain setup.

---

## Alternative: Vercel (Frontend) + Render (Backend)

For better frontend performance:
1. Deploy frontend to Vercel (free, fast CDN)
2. Deploy backend to Render
3. Update frontend API URL to point to Render backend

---

## Domain Providers (Cheap)
- **Namecheap**: ~$10/year for .com
- **Cloudflare Registrar**: At-cost pricing (~$9/year)
- **Google Domains**: $12/year (now Squarespace)

---

## Monitoring Your Deployment

Render provides:
- **Logs**: Real-time server logs in dashboard
- **Metrics**: CPU, memory, request count
- **Health Checks**: Auto-restart if `/api/health` fails
- **Auto-Deploy**: Push to GitHub → auto deploys

---

## Troubleshooting

**Build fails?**
- Check Node version (needs 20+)
- Run `npm install` locally first

**Can't connect to database?**
- Verify DATABASE_URL is correct
- Check Neon dashboard for connection pooling

**WebSockets not working?**
- Render free tier supports WebSockets
- Check if client is connecting to correct URL

**Rate limited?**
- Using FREE LLMs: Gemini (1500/day) + Grok ($25/month credits)
- Add FINNHUB_API_KEY for more market data calls
