# Free LLM Setup Guide

Your platform now supports **6 FREE LLM providers** for AI validation through the multi-LLM consensus system!

## ✅ Already Configured

| Provider | Status | Free Limit | Speed |
|----------|--------|------------|-------|
| **Gemini** | ✅ Ready | 1,500 req/day | Fast |

## 🆓 Available Free LLMs (Add API Keys)

### 1. Groq - **FASTEST** ⚡
- **Free Limit**: 14,400 requests/day
- **Model**: Llama 3.3 70B
- **Get Key**: https://console.groq.com/
- **Add to .env**: `GROQ_API_KEY=gsk_your_key_here`

**NOTE**: Your current key starts with `xai-` which is for X.AI's Grok (paid), not Groq (free). You need to get the correct Groq key.

### 2. Together AI
- **Free Limit**: $25 credits (~50,000 requests)
- **Model**: Llama 3.3 70B Turbo
- **Get Key**: https://api.together.xyz/settings/api-keys
- **Add to .env**: `TOGETHER_API_KEY=your_key_here`

### 3. Mistral - **MOST GENEROUS** 🔥
- **Free Limit**: 1 BILLION tokens/month
- **Model**: Mistral Small
- **Get Key**: https://console.mistral.ai/api-keys/
- **Add to .env**: `MISTRAL_API_KEY=your_key_here`

### 4. Cerebras - **ULTRA FAST** ⚡
- **Free Limit**: Generous free tier
- **Model**: Llama 3.1 8B
- **Get Key**: https://cloud.cerebras.ai/
- **Add to .env**: `CEREBRAS_API_KEY=your_key_here`

### 5. OpenRouter
- **Free Limit**: 200 requests/day with free models
- **Model**: Llama 3.1 8B (free)
- **Get Key**: https://openrouter.ai/keys
- **Add to .env**: `OPENROUTER_API_KEY=your_key_here`

## 📊 How It Works

The multi-LLM validation system (in [server/multi-llm-validation.ts](server/multi-llm-validation.ts)) validates trade ideas using consensus from multiple AI providers:

- **Runs all providers in parallel** for speed
- **Requires majority approval** for consensus
- **100% FREE** - explicitly excludes paid providers (Claude/OpenAI)
- **Saves costs** - $0.00 per validation

### Quick Validation
For high-volume validations, the system uses the fastest available provider:
1. Groq (if configured) - fastest
2. Cerebras (if configured) - ultra-fast
3. Gemini (already configured) - fast
4. Together AI, Mistral, OpenRouter (fallbacks)

## 🚀 Setup Steps

1. **Get your free API keys** from the links above
2. **Add them to your `.env` file**:
```bash
# Free LLM Providers
GEMINI_API_KEY=your_key_here                           # Get from aistudio.google.com (a real key was committed here once — rotated? see docs/SECURITY_REVIEW_2026-09-30.md)
GROQ_API_KEY=gsk_your_key_here                         # Get from groq.com
TOGETHER_API_KEY=your_key_here                          # Get from together.ai
MISTRAL_API_KEY=your_key_here                           # Get from console.mistral.ai
CEREBRAS_API_KEY=your_key_here                          # Get from cerebras.ai
OPENROUTER_API_KEY=your_key_here                        # Get from openrouter.ai
```

3. **Restart your server**: `npm run dev`

## 💰 Cost Savings

- **Without multi-LLM**: ~$0.002 per validation with OpenAI
- **With free LLMs**: $0.00 per validation
- **Monthly savings** (10,000 validations): $20

## 📈 Features

All features work with 100% free providers:
- ✅ Trade idea validation
- ✅ Multi-LLM consensus
- ✅ Confidence adjustment
- ✅ Risk analysis
- ✅ Chart analysis (if integrated)

---

**Total Cost: $0.00/month** 🎉
