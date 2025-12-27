# QuantEdge Research - Trading Platform

## Overview
QuantEdge Research is a professional quantitative trading research platform for day-trading US equities, options, and crypto markets. Its core purpose is to provide educational, research-grade trade ideas, robust risk management, and real-time market analysis. The platform emphasizes strong risk controls, educational disclaimers, and a dark-themed UI optimized for rapid data scanning. It integrates real historical data, features adaptive learning, and manages membership via Discord roles, with the web platform serving as a public dashboard. The ambition is to provide a comprehensive, data-driven solution for quantitative trading research. The core branding is "2 Engines. 1 Edge." representing AI Analysis + Quantitative Signals working together.

## User Preferences
- All timestamps should be displayed in America/Chicago timezone with market session context.
- The UI features both dark and light theme modes with a toggle button for user preference.
- Educational disclaimers must be emphasized (not financial advice).
- Clear and precise risk/reward calculations and position sizing tools are required.
- The platform should highlight fresh, actionable trade ideas immediately upon opening.
- The platform should function fully even without external AI dependencies, offering a quantitative idea generator alternative.
- Provide helpful error messages for API billing, rate limits, and authentication issues.
- Liquidity warnings should be displayed for penny stocks and low-float securities.
- No personalized financial advice should be offered; it is for research purposes only.

## System Architecture

### Design Philosophy
The platform adopts a "Bloomberg-Style Glassmorphism" aesthetic, prioritizing a professional trading terminal feel with frosted glass effects and a premium visual hierarchy. Key principles include "Data First" for optimized information hierarchy, "Status Clarity" for visual indicators, "Density Control" for efficient space usage, and "Action Accessibility" for critical trading actions.

### UI/UX Decisions
The primary dark mode background is `#0A0A0A`. Semantic colors are used for specific purposes: `text-cyan-400` for primary highlights, `text-green-400` for bullish, `text-red-400` for bearish, and `text-amber-400` for warnings. Glassmorphism is implemented with specific CSS classes like `.glass-card`, `.glass`, `.glass-secondary`, `.glass-success`, and `.glass-danger`, all featuring `backdrop-filter: blur(20px)` and subtle borders/shadows. Buttons come in various `glass` variants (primary, secondary, success, danger) and standard `default`, `destructive`, `outline`, `secondary`, `ghost`, and `success` variants, with defined sizes. A consistent "Hero Header Pattern" is used across pages, and various card patterns (basic glass, accent border, stat card) are employed. Typography uses `Inter` for sans-serif and `JetBrains Mono` for monospace, with a defined type scale. Spacing is based on Tailwind's 4px units. Icons are placed in standard rounded glass containers. Badges are replaced with styled `<span>` elements. Inputs and tab lists also adopt the glass style. Animation classes like `hover-elevate`, `price-update`, and `shimmer` enhance interactivity. Layouts include page containers, two-column, and three-column dashboard structures.

### Technical Implementations
**Frontend:** React 18, TypeScript, Tailwind CSS 4 (with custom glassmorphism), Shadcn UI, TanStack Query v5, Wouter, date-fns-tz, Lucide React, React Icons, Framer Motion, React Three Fiber/Three.js.
**Backend:** Express.js, TypeScript, PostgreSQL (Neon), Drizzle ORM, Zod validation, Winston logging.

### Feature Specifications
- **Navigation:** Simplified structure with Main (Home, Trade Desk, Live Trading, Trading Rules), More (Performance, Market, Chart Analysis), and System sections (Pricing, Settings, Admin). The Home page provides a daily "game plan" with key insights.
- **Hidden Features:** Includes a Paper Trading Simulator, Wallet Tracker (crypto whale monitoring), and CT Tracker (crypto influencer intelligence), each with dedicated API endpoints for managing their respective data.
- **Dual Engine Architecture:** Combines "AI Analysis" (Claude, GPT, Gemini for fundamental analysis) and "Quantitative Signals" (RSI(2), VWAP, volume spike, ADX, time-of-day filtering, chart pattern validation) for a hybrid approach to trade idea generation.
- **Quantitative Engine (v3.7.0):** Employs RSI(2) Mean Reversion with 200-Day MA Filter, VWAP Institutional Flow, Volume Spike Early Entry, ADX Regime Filtering, Signal Confidence Voting, and time-of-day filtering. Risk parameters include 3.5% stock stop-loss, 5% crypto stop-loss, 2:1 R:R, and 55-65% target win rate.
- **Authentication:** Replit Auth (OpenID Connect) with PostgreSQL session persistence (7-day TTL).
- **Subscription Tiers:** Differentiated Free and Advanced tiers with varying access to ideas, market data, performance history, AI generations, and alerts.
- **Performance Target:** <60s end-to-end latency for trading decisions.

## External Dependencies

### Data Sources
- **CoinGecko API:** Crypto data (real-time, historical, market cap, discovery).
- **Yahoo Finance:** Stock data (real-time quotes, discovery, historical).
- **Alpha Vantage API:** Breaking news, fallback for stock historical data, earnings calendar.
- **Tradier API:** Options data (chains, delta targeting, live pricing).
- **Databento API:** Futures data (NQ, GC - real-time, contract specs, CME).
- **Alchemy API:** (Optional) Ethereum/Solana whale wallet monitoring.

### AI Providers
- **OpenAI API:** For GPT integration.
- **Anthropic API:** For Claude Sonnet integration.
- **Google Gemini API:** For Gemini integration.