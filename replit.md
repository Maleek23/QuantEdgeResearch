# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a dual-engine quantitative trading research platform (AI Analysis + Quantitative Signals) for US equities, options, crypto, and futures markets. Its purpose is to provide educational, research-grade market analysis with robust risk parameters and real-time data, emphasizing strong risk controls and educational disclaimers. The platform focuses on a dark-themed UI for rapid data scanning and is designed for research and educational purposes only, not financial advice.
**Tagline**: "Multiple Engines, One Edge"

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
The platform features a React 18, TypeScript, and Tailwind CSS frontend (Shadcn UI, TanStack Query, Wouter) and an Express.js, TypeScript backend with PostgreSQL (Neon serverless) and Drizzle ORM. Authentication uses session-based methods with bcrypt, Replit Auth, and Google OAuth. The system integrates two core engines: an AI Engine (Anthropic Claude, OpenAI GPT, Google Gemini) and a Quantitative Engine (RSI(2) Mean Reversion, VWAP Institutional Flow, Volume Spike Early Entry, ADX Regime Filtering).

UI/UX is designed with a "Tech-Minimalist" philosophy, drawing inspiration from institutional trading interfaces. It features a dark-mode-first design, a specific color palette (slate, cyan, green, red, amber, purple, blue), glassmorphism-inspired components, and a clear typography hierarchy using Inter (primary) and JetBrains Mono (data/code).

Core features include public informational pages, user authentication, a main application dashboard, a trade desk with research briefs, a live trading journal, market overview, performance analytics, and various research tools like chart analysis and a historical trade pattern library. The platform includes a Data Intelligence System for historical performance analytics, a Loss Analysis System for automatic post-mortem of failed trades, and a Data Integrity System ensuring consistent statistics across the platform. An Auto-Lotto Bot provides an automated paper trading system with sample size gating for performance metrics. An Educational Blog System offers content on trading skills, while a Real-time Pricing Service consolidates market data from various providers. A Chart Analysis System provides comprehensive technical pattern recognition and support/resistance detection.

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

## Magic UI Components
Custom animated components located in `client/src/components/magicui/`:

- **NumberTicker:** Animated number counting for price displays (supports prefix/suffix, decimal places)
- **ShimmerButton:** Button with animated shimmer effect for premium CTAs
- **BorderBeam:** Glowing animated border beam effect for card highlights
- **SparklesText:** Text with animated sparkle particles (available for gain indicators)

Tailwind keyframes configured: `border-beam`, `shimmer-slide`, `spin-around`, `pulse-glow`

Usage:
- BorderBeam on Options (purple) and Futures (cyan) portfolio cards in watchlist-bot
- NumberTicker for animated balance/P&L displays
- ShimmerButton on landing page CTA sections