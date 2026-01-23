# Railway Deployment Guide - QuantEdge Platform

**Total Time: 10-15 minutes**
**Monthly Cost: $5 (vs $26 on Render - save $252/year)**

---

## 🚀 Step 1: Sign Up for Railway (2 minutes)

1. Go to https://railway.app/
2. Click **"Start a New Project"**
3. Sign in with **GitHub** (recommended)
4. ✅ You get **$5 free credit/month** automatically!

---

## 📦 Step 2: Deploy from GitHub (3 minutes)

1. In Railway dashboard, click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose repository: **`Maleek23/QuantEdgeResearch`**
4. Railway will auto-detect your app and start deploying
5. Wait ~2-3 minutes for initial deployment

**Railway auto-detects:**
- ✅ Node.js 20
- ✅ Build command: `npm install && npm run build`
- ✅ Start command: `npm start`

---

## ⚙️ Step 3: Add Environment Variables (5 minutes)

Click on your project → **Variables** tab → Add all these:

### **Critical Variables (Required):**

```bash
NODE_ENV=production

# Database (Your existing Neon DB)
DATABASE_URL=postgresql://neondb_owner:npg_CsmNx5Si6IoR@ep-restless-mud-aesu2f62.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require
PGDATABASE=neondb
PGHOST=ep-restless-mud-aesu2f62.c-2.us-east-2.aws.neon.tech
PGPORT=5432
PGUSER=neondb_owner
PGPASSWORD=npg_CsmNx5Si6IoR

# Session Security
SESSION_SECRET=5reTFcsjRFytmivT8uaUBZeSvLXhSn6Bep551RSRKFQqMOyvScN0SWYSBWc3AKQ86hhkkkldQ3TSDUtT9/vDaA==

# Admin Access
ADMIN_EMAIL=abdulmalikajisegiri@gmail.com
ADMIN_PASSWORD=Bolaji11
ADMIN_ACCESS_CODE=0065
```

### **AI Services (OpenAI/Anthropic):**

```bash
OPENAI_API_KEY=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
ANTHROPIC_API_KEY=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
GEMINI_API_KEY=AIzaSyCK7eYuhHQ0skD-4TKQE1DLU2yAy_5D0gA
```

### **FREE LLM Providers (Important!):**

```bash
GROQ_API_KEY=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
MISTRAL_API_KEY=OYEhL2pFRE0JNJwdmhj50AfdlkcLNex2T
CEREBRAS_API_KEY=csk-vtrydk44ky3fy38h4yk8yjxf9mnxk3y458e468mtfxnhr9he
OPENROUTER_API_KEY=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
```

### **Trading APIs:**

```bash
TRADIER_API_KEY=KZSH0DcaGOarjC7VlQe7bt56OSpF
TRADIER_ACCOUNT_ID=VA15737297
TRADIER_USE_SANDBOX=false
ALPHA_VANTAGE_API_KEY=I5T4N6T54RS2112Z
DATABENTO_API_KEY=db-NUrtuEWLbyXqnSwCQTJL5eSfDuQqd
```

### **Discord Webhooks:**

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/1453937734313054374/rW8m1fWJJ0174tQhKXlqEIr_Tb9RjVgy2DfSPQRgIRyvtixFY0zsdUethVidxWEW3S8G
DISCORD_WEBHOOK_QUANTBOT=https://discord.com/api/webhooks/1456732646343446775/qQeYDu8drgZ0mDR1y17EwpfJ2Obwx3cFs2y8stA3_RGasTTPPRzYqQrrY-nSS5kYyoMq
DISCORD_WEBHOOK_LOTTO=https://discord.com/api/webhooks/1455276126233563339/2rXVG4MfYQZuI_ol4XuGubu1U01rwt14UPk2wnd6J_xDcqMsYZwqr52MW0aehAzeHWc7
DISCORD_WEBHOOK_FUTURE_TRADES=https://discord.com/api/webhooks/1456068266102620190/xmg3bl6sxwG2W-QoELl-tVL4ZJnWjjyT-14zJTjkNP6q5SkbRXUJFUvAv3DLXplB1WxT
DISCORD_WEBHOOK_WEEKLYWATCHLISTS=https://discord.com/api/webhooks/1455276294693720249/c9685KNlTyf6eZ6sB5BPLe_CCRNbzMEcnLe-qBBcazN8SoEb5giAV5kw7FHuCoYkfRi8
DISCORD_WEBHOOK_CHARTANALYSIS=https://discord.com/api/webhooks/1455276448842645565/ip-9uOFw_o8Xd8SRrn4hfS1mEsulY9c7OX_wLBQs4Ij4vVZFAmhDyluoPMkbkLsBslP2
DISCORD_WEBHOOK_GAINS=https://discord.com/api/webhooks/1455634541153751124/XzJ15A0P9n_96nv7_w8-F0Ut4pwmg0FsqDmO7LD-g6FLKY5DxhgrcUC-abpxnR74m7ZY
DISCORD_WEBHOOK_OPTIONSTRADES=https://discord.com/api/webhooks/1453937734313054374/rW8m1fWJJ0174tQhKXlqEIr_Tb9RjVgy2DfSPQRgIRyvtixFY0zsdUethVidxWEW3S8G
DISCORD_WEBHOOK_QUANTFLOOR=https://discord.com/api/webhooks/1459230550538850336/01aWlFVujBSb5jdulRJq61KkHViXFURFjKRMVdp8mRthCXyyi5nDC-bDqJb7P99tQrI1
```

### **Email Service:**

```bash
RESEND_API_KEY=re_fh1M364n_5zcdsmCoQywjr6ZzZkANmFAX
FROM_EMAIL=noreply@quantedge.com
```

### **Google OAuth:**

```bash
GOOGLE_CLIENT_ID=285876915101-0s86o0v84762i1j9cud8ladbcmmo0qv3.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
```

### **Feature Flags (Optimize for Railway):**

```bash
ENABLE_AUTO_LOTTO=false
ENABLE_CRYPTO_BOT=true
ENABLE_FUTURES_BOT=true
```

### **Railway-Specific (Auto-set, but confirm):**

```bash
PORT=3000
APP_URL=${{RAILWAY_PUBLIC_DOMAIN}}
```

---

## 🌐 Step 4: Get Your URL (1 minute)

1. Go to **Settings** tab in Railway
2. Under **Domains**, click **Generate Domain**
3. Railway gives you: `your-app.up.railway.app`
4. ✅ Your app is now live!

---

## 🔗 Step 5: Connect Custom Domain (Optional - 5 minutes)

To use `quantedgelabs.net`:

1. In Railway → **Settings** → **Domains**
2. Click **Custom Domain**
3. Enter: `quantedgelabs.net`
4. Railway shows DNS records to add
5. Go to your domain registrar (Namecheap, GoDaddy, etc.)
6. Add the CNAME record:
   ```
   Type: CNAME
   Name: @
   Value: [Railway provides this]
   ```
7. Wait 5-60 minutes for DNS propagation
8. ✅ `quantedgelabs.net` now points to Railway!

---

## ✅ Step 6: Verify Deployment

### **Check Health:**
```bash
curl https://your-app.up.railway.app/health
```

Should return:
```json
{
  "status": "OK" or "DEGRADED",
  "timestamp": "2026-01-23T..."
}
```

### **Test Login:**
1. Go to `https://your-app.up.railway.app/login`
2. Login with:
   - Email: `abdulmalikajisegiri@gmail.com`
   - Password: `Bolaji11`
3. ✅ Should work!

---

## 📊 Railway Features You Get

| Feature | Status |
|---------|--------|
| **Auto-deploy on git push** | ✅ Enabled |
| **Free $5 credit/month** | ✅ Active |
| **Up to 8GB RAM** | ✅ Available |
| **Build logs** | ✅ View in dashboard |
| **Metrics** | ✅ CPU, Memory, Network |
| **Custom domain** | ✅ Free SSL included |
| **Environment variables** | ✅ Encrypted |

---

## 💰 Cost Breakdown

**Railway Pricing:**
- **Free**: $5 credit/month (covers light usage)
- **Usage-based**: $0.000231/GB-hour for memory
- **Your app**: ~800MB RAM = ~$3-5/month
- **Total**: $5/month (covered by free credit or ~$5 if exceeds)

**vs Render:**
- Render: $26/month
- **You save: $21/month ($252/year)**

---

## 🔧 Troubleshooting

### **Build Failed:**
- Check build logs in Railway dashboard
- Ensure `package.json` has correct scripts
- Verify Node.js version (should be 20)

### **App Crashes:**
- Check **Deployments** → **Logs**
- Look for memory errors
- If memory issues, upgrade to larger instance

### **Environment Variables Missing:**
- Double-check all vars are added
- Redeploy after adding vars: **Deployments** → **Redeploy**

### **Custom Domain Not Working:**
- Wait 1 hour for DNS propagation
- Verify CNAME record in domain registrar
- Check Railway shows "Active" for domain

---

## 🎯 Next Steps After Deployment

1. **Push updates to GitHub** → Railway auto-deploys
2. **Monitor usage** in Railway dashboard
3. **Scale if needed** (increase RAM/CPU)
4. **Add team members** (Railway supports collaboration)

---

## 📞 Support

- **Railway Docs**: https://docs.railway.app/
- **Railway Discord**: https://discord.gg/railway
- **Your Dashboard**: https://railway.app/dashboard

---

## ✨ Summary

✅ **Deployed to Railway**
✅ **$5/month** (vs $26 on Render)
✅ **Auto-deploys** from GitHub
✅ **5 FREE LLMs** configured
✅ **Custom domain** ready
✅ **Save $252/year**

**Your app is live! 🚀**
