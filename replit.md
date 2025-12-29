# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a dual-engine quantitative trading research platform (AI Analysis + Quantitative Signals) for US equities, options, crypto, and futures markets. Its purpose is to provide educational, research-grade market analysis with robust risk parameters and real-time data, emphasizing strong risk controls, educational disclaimers, and a dark-themed UI for rapid data scanning. The platform is designed for research and educational purposes only and does not provide financial advice.

## User Preferences
- All timestamps displayed in **America/Chicago (CT)** timezone with market session context
- Dark/light theme toggle (dark mode is primary)
- Educational disclaimers must be emphasized on every screen
- Clear risk/reward calculations and position sizing tools
- Fresh research briefs highlighted immediately upon opening
- Platform functions fully without external AI dependencies (quantitative fallback)
- Helpful error messages for API billing, rate limits, and authentication issues
- Liquidity warnings for penny stocks and low-float securities

## System Architecture
The platform is built with a React 18, TypeScript, and Tailwind CSS frontend, utilizing Shadcn UI, TanStack Query, and Wouter. The backend is an Express.js, TypeScript application with a PostgreSQL database (Neon serverless) and Drizzle ORM. Authentication uses session-based methods with bcrypt, Replit Auth, and Google OAuth. The system features two core engines: an AI Engine (integrated with Anthropic Claude, OpenAI GPT, and Google Gemini) and a Quantitative Engine (utilizing RSI(2) Mean Reversion, VWAP Institutional Flow, Volume Spike Early Entry, and ADX Regime Filtering). Key UI/UX decisions include a dark-mode-first design with a specific color palette, glassmorphism-inspired components, and a clear typography hierarchy using Inter and JetBrains Mono. Core features include public informational pages, user authentication, a main application dashboard, trade desk with research briefs, live trading journal, market overview, performance analytics, and various research tools like chart analysis and a historical trade pattern library.

## External Dependencies

### Market Data
- **Yahoo Finance:** Real-time quotes, discovery, historical stock data.
- **CoinGecko:** Real-time and historical cryptocurrency data.
- **Tradier:** Options chains, delta targeting, and live options pricing.
- **Alpha Vantage:** Financial news feeds and earnings calendar.
- **Databento:** Real-time futures data (NQ, GC).

### AI Providers
- **Anthropic (Claude Sonnet 4):** Primary AI engine and research assistant.
- **OpenAI (GPT-4):** Backup for fundamental analysis.
- **Google (Gemini):** Alternative AI analysis.

### Other Integrations
- **Discord:** Webhook notifications.

## Data Intelligence System

### API Endpoint: `/api/data-intelligence`
Provides historical performance analytics from 411+ resolved trades:
- **Engine Performance**: Flow (81.9%), AI (57.1%), Quant (34.4%)
- **Symbol Performance**: 30+ symbols with 3+ trades tracked
- **Confidence Calibration**: Bands recalibrated based on actual outcomes

### Confidence Band Thresholds (Calibrated Dec 2025)
- A band: 90+ confidence score
- B+ band: 85-89 confidence score  
- B band: 78-84 confidence score
- C+ band: 72-77 confidence score
- C band: 65-71 confidence score
- D band: <65 confidence score

### Key Performance Insights
- **Top Symbols**: AAPL, AMD, SOFI, NFLX, QQQ, AMZN, GOOGL, ETH, HOOD (100% win rate, 3+ trades)
- **Avoid**: SOL, AAVE, SMCI, CLF, USAR (0% win rate)
- **Flow Engine Dominance**: Best performer at 81.9% win rate
- **Historical Badges**: Trade cards show engine/symbol performance via HistoricalPerformanceBadge component