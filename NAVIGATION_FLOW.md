# QuantEdge Navigation & Information Flow
## Expert Quant Trader Perspective (40+ Years Experience)

### 🎯 Core Philosophy
**Direct Action → Immediate Results → Clear Visibility**

A professional trader wants:
1. **Fast idea generation** - Click button, get ideas
2. **Immediate visibility** - See results on same page or in feed
3. **Source transparency** - Know if idea is AI or Quant
4. **No redundancy** - Each feature serves ONE purpose

---

## 📊 Navigation Architecture

### **Dashboard (/)** - Command Center
**Purpose**: Quick overview + Fast actions

**What You See:**
- **Metrics Overview**
  - Active Ideas count (AI/Quant breakdown)
  - High Grade Ideas (confidence ≥80%)
  - Tracked Assets
  - Market Catalysts

- **Market Movers**
  - Top Gainers (live %)
  - Top Losers (live %)

- **Quick Actions**
  - Symbol Search
  - **Generate Quant Ideas** ✅ (direct generation)
  - **Generate AI Ideas** ✅ (direct generation)

- **Recent Ideas Preview**
  - 3 most recent ideas
  - "View All" → Trade Ideas page

**Logical Flow:**
```
Dashboard → Generate Ideas → Toast Confirmation → View in Recent Preview OR Navigate to Trade Ideas
```

---

### **Trade Ideas (/trade-ideas)** - Primary Workspace
**Purpose**: View, filter, and generate trade ideas

**Header Actions:**
- **Generate Quant** button ✅ (generates ideas on THIS page)
- **Generate AI** button ✅ (generates ideas on THIS page)
- NEW badge (ideas < 1 hour old)

**Filters:**
- **Direction**: All | Long | Short | Day Trade
- **Source**: All Sources | AI | Quant | Manual
- **Date**: Calendar picker
- **Search**: Symbol or catalyst text

**Tabs:**
- **NEW IDEAS**: outcomeStatus = 'open'
- **ARCHIVED**: outcomeStatus ≠ 'open' (hit_target, hit_stop, expired, manual_exit)

**Source Badges** (visual identification):
- ✨ AI (Sparkles icon)
- 📊 Quant (BarChart3 icon)
- 🧠 Manual (Brain icon)

**Logical Flow:**
```
Trade Ideas Page → Click Generate → Ideas appear in feed → Filter by source to analyze performance
```

---

### **Market Overview (/market)** - Market Intelligence
**Purpose**: Live prices, top movers, catalysts

**What You See:**
- Live market data with refresh
- Top gainers/losers
- Market catalysts feed
- Symbol search

**Logical Flow:**
```
Market → Find catalyst → Symbol Search → Quick Action Dialog → Generate Idea
```

---

### **Watchlist (/watchlist)** - Position Tracking
**Purpose**: Track symbols with target prices

**Features:**
- Symbol tracking with prices
- Target price management
- Asset type filtering
- Quantitative analysis (crypto)

---

### **Risk Calculator (/risk)** - Position Sizing
**Purpose**: Calculate position sizes and risk

**Educational focus, no idea generation**

---

## 🔄 Idea Generation Flow (SIMPLIFIED)

### **Method 1: Quant Ideas (AI-free)**
```
Click "Generate Quant Ideas" 
  ↓
POST /api/quant/generate-ideas
  ↓
Quantitative signals analyzed
  ↓
Ideas created with source='quant', outcomeStatus='open'
  ↓
Toast: "Generated X quant ideas"
  ↓
Ideas appear in NEW IDEAS tab
  ↓
Filter by "Quant" to view only these
```

### **Method 2: AI Ideas (LLM-powered)**
```
Click "Generate AI Ideas"
  ↓
POST /api/ai/generate-ideas
  ↓
AI analyzes market context
  ↓
Ideas created with source='ai', outcomeStatus='open'
  ↓
Toast: "Generated X AI ideas"
  ↓
Ideas appear in NEW IDEAS tab
  ↓
Filter by "AI" to view only these
```

### **Method 3: Manual Ideas**
```
Symbol Search → Select Symbol → Quick Action Dialog → Choose trade type → Create idea with source='manual'
```

---

## ✅ What Makes This Logical

### 1. **No Redundancy**
- **Dashboard**: Overview + Quick generation
- **Trade Ideas**: Full workspace + Generation
- **QuantAI Chatbot**: Conversational assistant (separate from generation)

### 2. **Direct Action**
- Buttons generate ideas DIRECTLY
- No chatbot required for idea generation
- Ideas appear IMMEDIATELY in feed

### 3. **Clear Source Tracking**
- Every idea tagged: 'ai' | 'quant' | 'manual'
- Visual badges for instant recognition
- Source filter to analyze performance

### 4. **Professional Workflow**
```
Morning:
1. Dashboard → Check metrics
2. Generate Quant Ideas → See what signals fired
3. Generate AI Ideas → Get LLM perspective
4. Trade Ideas → Filter by source, compare quality
5. Select high-grade ideas → Execute

Midday:
1. Market → Check movers
2. Trade Ideas → Generate more ideas if needed
3. Update performance when targets hit

Evening:
1. Trade Ideas → Archive completed trades
2. Dashboard → Review day's performance
```

---

## 🎯 Key Differences from Before

| Before | After |
|--------|-------|
| "Ask AI for Ideas" opens chatbot | "Generate AI Ideas" creates ideas directly |
| Chatbot needed for AI ideas | Direct generation like Quant |
| Ideas only on Dashboard | Ideas on Dashboard AND Trade Ideas page |
| Confusing flow | Clear: Click → Generate → View |

---

## 📈 Information Flow Summary

**All roads lead to Trade Ideas:**
- Dashboard generates → View in Trade Ideas
- Trade Ideas generates → View right there
- Market catalysts → Create idea → View in Trade Ideas
- Symbol search → Create idea → View in Trade Ideas

**Source transparency:**
- AI ideas: source='ai', badge with sparkles
- Quant ideas: source='quant', badge with chart
- Manual ideas: source='manual', badge with brain

**Lifecycle management:**
- New: outcomeStatus='open' → NEW IDEAS tab
- Completed: outcomeStatus≠'open' → ARCHIVED tab

This is a **professional, logical, zero-redundancy** trading platform architecture.
