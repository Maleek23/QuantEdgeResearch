# QuantEdge — pricing and unit economics

**Date:** 2026-09-30. **Status:** a recommendation for the operator to decide on. Nothing here is live until `client/src/lib/plans.ts` is switched to `shared/pricing.ts` and new Stripe prices exist.
**Plan table in code:** `shared/pricing.ts` (ids match `SubscriptionTier`, so no migration is needed).
**Research:** web research on 2026-09-30. Anything not confirmed on the vendor's own page is marked *unverified*. This is not legal or tax advice.

---

## 0. The answer on one page

| Plan | Monthly | Yearly (per month) | Founder (12-month lock) | Who it's for |
|---|---|---|---|---|
| **Free** | $0 | $0 | — | Trying the terminal: delayed data, 5 ideas a day, a GEX map for the index ETFs, a journal |
| **Advanced** (recommended) | **$49** | **$468** ($39) | **$29/mo or $288/yr** | The full research terminal: NEXUS, FLOW, GEX, 0DTE desk, Quantinum, journals |
| **Pro** (waitlist) | **$99** | **$948** ($79) | **$69/mo or $660/yr** | Advanced plus licensed real-time equities and options, sniper, API. Opens when the data licence is signed |

- **Trial:** 14 days of Advanced, no card required. It falls back to Free when it ends.
- **Annual discount:** 20%, the middle of the 15–25% range competitors use.
- **Founder pricing:** the first 200 paying accounts, or everyone who subscribes before general availability (whichever limit is hit first), keep the founder price for 12 months, stated in the Terms.

**Why these prices**
- **Advanced at $49** sits at the bottom of the options-flow band ($50–99; Unusual Whales Basic is $50, Quant Data $75). Today the equity and option chains are delayed, and the record is modest and still being measured, so the list price shouldn't be higher. $49 is still well above cost.
- **Pro at $99** sits in the GEX-specialist band (SpotGamma $89–129, MenthorQ $129). It is the tier that carries the per-user exchange fees, so those costs land on the plan that needs them.
- **Founder $29** is 25% below the current $39 Advanced price. Early users get a thank-you, and it is honest about a beta.

**What it costs to run (base case: licensed delayed data, §3)**

| Paying subscribers | Monthly cost | Cost per subscriber | Revenue (ARPU $56.50) | Margin |
|---|---|---|---|---|
| 10 (beta) | ~$220 on today's feeds; ~$1,590 licensed | $22 / $159 | $565 | positive / −181% |
| 50 | ~$1,970 | $39 | $2,825 | 30% |
| 1,000 | ~$8,380 (~$12,200 with real-time Pro) | $8.4 ($12.2) | $56,500 | 85% (78%) |

**Break-even:** about **34 paying subscribers** on licensed delayed data, and about **117** once real-time Pro data is licensed through a vendor business plan. At founder prices on delayed data it is about **77**.

**The biggest finding: data licensing, not servers, decides the business.** The platform runs on personal-use or free feeds: Alpaca free (IEX and indicative options), an operator Tradier token, scraped CBOE delayed chains, unofficial Yahoo, and a Bullflow API key. None of them is licensed for display to paying subscribers. Tradier's terms say its data cannot go to anyone without their own Tradier account. Licensing real-time SIP and OPRA directly costs about $10–13k/month at 1,000 users. Delayed (15-minute) data avoids almost all per-user exchange fees. §5 has the detail.

---

## 1. Competitors (retail options-flow, GEX and charting tools)

Prices are list prices billed monthly, from pages accessed 2026-09-30.

| Tool | Monthly tiers | Annual (effective per month) | Flow / GEX / AI | Free tier / trial | Source |
|---|---|---|---|---|---|
| Unusual Whales | Free · Basic $50 · Pro $75 · Max $120 | $42 / $63 / $102 (16% off) | Flow, GEX heatmap, AI scaled by tier | Free tier (2-day delay) | unusualwhales.com/pricing |
| Bullflow | Basic $33 · Premium $59 · API $99 | not verified | Real-time flow | none found | *unverified* (third-party; iOS listing $69.99) |
| Cheddar Flow | Standard $85 · Professional $99 | Pro $75 (25% off) | Flow, dark pool, GEX (reported) | 7-day trial | *unverified* (official page returned 403) |
| FlowAlgo | $149 | ~$99 (quarterly $129) | Flow, dark pool; no GEX | 2 weeks for $37 | flowalgo.com |
| BlackBoxStocks | $59 · $79 · $89 · $149 | toggle, amount not shown | Flow, net gamma on the $79 tier and up | none | blackboxstocks.com/pricing |
| SpotGamma | $89 · $99 · $129 · Alpha $299 | $67 / $74 / $97 / $224 (25% off) | GEX, HIRO, TRACE | first month $17–49 | spotgamma.com |
| MenthorQ | Premium $129 · Pro $349 | $97 / $259 | GEX levels, models | first month $39 | menthorq.com/pricing (annual *unverified*) |
| TrendSpider | $82 · $137 · $183 · $321 | $52–154 (looks like a promo) | Charts, bots, paid AI add-ons | 14 days for $19–49 | trendspider.com/pricing; **charges extra for data** (+$29 pro equities) |
| LuxAlgo | Free · $24.99 · $39.99 · $59.99 · $119.99 | first year discounted only | Indicators, AI credits | free tier; 30-day refund | luxalgo.com/pricing |
| TradingView | Free · $14.95 · $34.95 · $69.95 · $239.95 | $12.95–199.95 | Charts only | 30-day trial | tradingview.com/pricing (monthly *unverified*); **real-time exchange data is a paid add-on** |
| Benzinga Pro | $27 · $197 · $457 | ~20% off | News; unusual options activity from $197 | 14-day trial | *unverified* (official page returned 403) |
| Tradytics | Free · Pro $69 · Discord bots $199 | exists, amount not shown | Flow, AI ideas | free tier; 15 days for $15 | tradytics.com |
| Market Chameleon | $99 total access | on request | Options analytics, **15-minute delayed** | 7-day trial | marketchameleon.com |
| InsiderFinance | $75 | $55 (27% off) | Flow, dark pool | free delayed flow page | insiderfinance.io/pricing |
| Quant Data | $74.99 · API $149.99 | $62.50 (17% off) | Flow plus GEX/DEX/VEX/CHEX | 7-day trial | quantdata.us; **non-professional use only**, professional users priced separately |

**What the table shows**
- **Two price bands.** Flow tools cluster at $59–99. GEX specialists run $89–349.
- **GEX is now included at mid price.** Unusual Whales ($50), Quant Data ($75) and BlackBox ($79) bundle it, so QuantEdge can't charge a premium for GEX alone.
- **The differentiators are the bundle and the audit trail:** flow, GEX, NEXUS ideas with timestamps, a journal, and a public record with its *n*. None of that is a performance claim.
- **Market Chameleon charges $99 for delayed data.** Delayed data is sellable if it is labelled honestly.
- **Paid or discounted trials are the norm.** A free 14-day trial with no card is a competitive edge, and it costs us about $1 per trial user.
- **Almost nobody passes OPRA or SIP fees to retail users.** Vendors build them into the price. Quant Data and TradingView separate professional users, and QuantEdge should do the same (§5).

---

## 2. What the platform uses today (from the code)

Sources: `server/` greps; key *names* in `.env`, not values.

| Provider | How it's used | Plan today | Licensed to show to paying users? |
|---|---|---|---|
| Alpaca | quotes (`feed=iex`), option chains (`feed: 'indicative'`); one `sip` path | Free (IEX, indicative options) | **No.** The individual licence is for personal use |
| Tradier | chains, quotes, 0DTE (95 files) | free with a brokerage account, operator token | **No.** Its terms say the data can't go to anyone without their own Tradier account |
| CBOE delayed | chain fallback (56 files) | free, scraped | *Unclear.* Delayed data carries no OPRA fee, but the site's terms may bar scraping |
| Yahoo | candles, quotes (126 files) | unofficial, no key | **No.** No licence at all; fragile |
| Bullflow | FLOW tape, squeeze radar (`api.bullflow.io`) | API plan (~$99–129/mo, *unverified*) | **Unknown.** Needs written permission |
| Polygon/Massive | news, grouped daily, options (`massive-options.ts`) | key present; plan not known | Individual plans say "individual use only" |
| Finnhub, FRED, Alpha Vantage, Twelve Data, Coinbase, CoinGecko | fundamentals, macro, crypto | free tiers (Alpha Vantage's 25 calls a day is used up) | Crypto exchange data is generally fine; the rest are individual-use only |
| Databento | key present, 4 files | unused or unknown | — |
| LLMs | `gemini-2.5-flash` (18 references, the main model), `claude-sonnet-4-20250514` (9; default for `generateAIAnalysis`), `gpt-4o` / `gpt-5` / `gpt-4o-mini`, Groq/Mistral/Together/Cerebras/OpenRouter keys | pay-per-token | n/a |
| Resend (email), Stripe, Discord webhooks, Google OAuth | — | free tiers today | n/a |
| Hosting | DigitalOcean droplet, 1 vCPU / 2 GB, Postgres on the same box (`docs/MEMORY_BUDGET.md`) | ~$12–18/mo | n/a |

**LLM warning.** An aggregator reports that Gemini 2.5 models shut down on 2026-10-16 (*unverified*; Google's page confirms only that 2.5 Flash Image ends on 2026-10-02). The newer Flash models cost $0.75/$3.75 per million tokens, rising to $1.50/$7.50 on 2027-01-01. That is 2.5–3× the 2.5 Flash price ($0.30/$2.50). `generateAIAnalysis` defaults to Claude Sonnet 4 ($3/$15). A user who spends all 600 monthly credits on Sonnet costs about $13/month. On a Flash-class model the same user costs about $1.8–3.4. **Pin user-facing calls to a Flash-class or Haiku-class model.** Haiku 4.5 costs $1/$5, and the Claude Sonnet 5 line $2/$10.

---

## 3. Cost model by scale

### Assumptions (change these in the table; the script is reproducible)

- **N = paying subscribers.** Free users are a marketing cost: about $0.10–0.20 each per month (LLM credits, email, a share of the web server).
- **Plan mix:** 75% Advanced, 25% Pro. 40% pay yearly.
- **Blended ARPU at list prices:** **$56.50/month.**
- **Payments:** Stripe 2.9% + 30¢ plus Billing 0.7%, which averages **$2.22 per subscriber per month**. International cards add 1.5% (not modelled).
- **Mobile share:** 20% of subscribers buy in-app at 15% (Apple Small Business Program or Google). That is a conservative **$1.69 per subscriber**. Using a US link-out to web checkout makes it $0 today (§6).
- **LLM:** $0.75 per paid subscriber per month on a Flash-class model (about 100–150 calls averaging ~4k tokens in and 700 out). Background idea generation and forum vision are counted in the tooling line.
- **Support:** the operator handles it up to 50 subscribers. After that, a part-time contractor at roughly 1 hour per 20 subscribers a month.
- **Legal and insurance:** securities-counsel retainer and E&O cover, amortised. Both are assumptions.
- **Not modelled:** operator salary, marketing/acquisition cost, churn, sales tax (Stripe Tax is $90/mo if needed), refunds and chargebacks ($15 per dispute).

### Infrastructure (DigitalOcean list prices, 2026-09-30)

Droplets cost $12 (2 GB), $24 (4 GB), $48 (8 GB) and $96 (16 GB). Backups add 20% (weekly). Managed Postgres is $15.15 (1 GB), $30.45 (2 GB) or $60.90 (4 GB), about double with a standby. Valkey is $15, a load balancer $12, Spaces $5.

Most of the load is shared scanning (chains, GEX, flow, scanners), which costs about the same for 10 users or 10,000. The part that grows with users is web: WebSocket fan-out, page API reads and journal queries. Planning figure: about 500–1,000 concurrent sessions per 4–8 GB web node, with peak concurrency around 30% of subscribers in the first hour of the session. The 2026-09-30 incident (40 restarts; web and worker on one 2 GB box) means **the worker split (`docs/WORKER_SPLIT.md`) and a bigger box come before any paid launch**.

| N | Layout | $/mo |
|---|---|---|
| 10 | one 4 GB droplet (web + worker + Postgres), backups | ~$29 |
| 50 | 4 GB web + 4 GB worker, managed Postgres 1 GB, backups | ~$75 |
| 250 | 4 GB web, 8 GB worker, managed Postgres 2 GB, Valkey | ~$135 |
| 1,000 | 2 × 4 GB web + load balancer, 8 GB worker, Postgres 4 GB + standby, Valkey, Spaces | ~$270 |
| 5,000 | 4 × 8 GB web + load balancer, 2 × 16 GB workers, Postgres 8 GB + standby, Valkey 2 GB | ~$700 |
| 10,000 | 8 × 8 GB web + 2 load balancers, 2 × 16 GB workers, Postgres 16 GB + standby, Valkey 4 GB | ~$1,200 |

### Data: three paths (this is the decision; see §5)

| Path | What it is | Fixed $/mo | Per user |
|---|---|---|---|
| **P0 — today** | personal-use and free feeds (Alpaca free, Tradier token, CBOE scrape, Yahoo, Bullflow API ~$99–129, others free) | ~$130 | $0 — **not licensed for paying users** |
| **P1 — licensed delayed** (recommended until ~250–500 subscribers) | 15-minute delayed equities and options from a vendor that permits display (for example, a Massive business agreement with the "Full Market Delayed" add-on at $499 list, a 25%+ startup discount, or a Cboe/UTP delayed licence at ~$250/mo) **plus** a Bullflow redistribution agreement. Crypto stays live from Coinbase | **~$1,500** (assumption: ~$1,000 data + ~$500 Bullflow) | $0 (delayed OPRA/UTP data carries no per-user fee) |
| **P2 — licensed real-time via a vendor business plan** (Pro) | Massive Stocks Business $2,499 ("no exchange fees or approvals required") plus a real-time add-on at $1,999; options business pricing *unverified*; plus Bullflow | **~$5,000** (≈$4,500 data + $500) | +$1.25 OPRA non-professional fee per Pro user (conservative) |
| P3 — direct exchange licences | OPRA vendor fee $1,500 + $1.25/user; CTA $1,000/network + $1/user/network; UTP ~$3,000 + $1–3/user; plus audits and usage reporting | ~$5,500 plus per-user fees | about $10–13k/mo in total at 1,000 users |

### Monthly cost, cost per subscriber and margin (ARPU $56.50, 20% of subscribers on in-app purchase)

Variable cost per subscriber: $4.69 on P0/P1, $5.00 on P2 (payments $2.22, in-app commission $1.69, LLM $0.75, email $0.02, OPRA $0.31).

| N | Tooling* | Support | Legal | **P0** cost (margin) | **P1** cost ($/sub, margin) | **P2** cost ($/sub, margin) | Revenue |
|---|---|---|---|---|---|---|---|
| 10 | $12 | $0 | $0 | $218 (61%) | $1,588 ($159, −181%) | $5,091 ($509, −801%) | $565 |
| 50 | $12 | $0 | $150 | $601 (79%) | **$1,971** ($39.4, 30%) | $5,487 ($110, −94%) | $2,825 |
| 250 | $60 | $500 | $300 | $2,297 (84%) | $3,667 ($14.7, 74%) | $7,245 ($29.0, 49%) | $14,125 |
| 1,000 | $125 | $1,500 | $300 | $7,014 (88%) | **$8,384** ($8.4, 85%) | **$12,196** ($12.2, 78%) | $56,500 |
| 5,000 | $200 | $5,000 | $500 | $29,975 (89%) | $31,345 ($6.3, 89%) | $36,408 ($7.3, 87%) | $282,500 |
| 10,000 | $300 | $9,000 | $500 | $58,020 (90%) | $59,390 ($5.9, 90%) | $66,015 ($6.6, 88%) | $565,000 |

\* Tooling covers the domain (~$20/yr), Apple Developer ($99/yr), monitoring (Sentry Team $26, Better Stack ~$29, both *unverified*), Resend ($0 → $20 → $35 → $90), and background LLM jobs.

Beyond ~5,000 subscribers the variable costs lead: payments and in-app commission are about $3.9 of the ~$4.7 per subscriber. Web checkout plus the US link-out removes $1.69 of that.

### Break-even (smallest number of paying subscribers where revenue ≥ cost; plan mix as above)

| Advanced list price (Pro fixed at $99/$79) | ARPU | P1 licensed delayed | P2 real-time vendor plan |
|---|---|---|---|
| $29 | $42.70 | 45 | 156 |
| $39 (today's price) | $49.60 | 39 | 134 |
| **$49 (recommended)** | **$56.50** | **34** | **117** |
| $59 | $63.40 | 30 | 104 |
| Founder pricing for everyone ($29 / $69) | $36.10 | 77 | — |

**What this means for decisions.** Price barely moves break-even; the data path does. Licensed delayed data breaks even at ~35–45 subscribers at any sensible price. Real-time Pro should open when there are about 150 paying subscribers on delayed data, or a Pro waitlist of about 100. Opening it earlier runs a ~$3,500/month deficit.

**Reproduce:** the model is the Python script in the Appendix. Re-run it (`python3`) with new assumptions before changing a price.

---

## 4. Plans in detail (mirrors `shared/pricing.ts`)

**Free — $0**
- 5 NEXUS ideas a day (stocks and crypto).
- 15-minute delayed quotes; crypto live.
- GEX dealer map for SPY, QQQ and SPX.
- Public model record, always shown with its *n*.
- Journal: your own book and broker CSV import.
- 30 Quantinum credits a month; 3 watchlist symbols.
- Not included: options ideas, FLOW, the full GEX workspace, the 0DTE desk, alerts.

**Advanced — $49/mo or $468/yr (founder $29 / $288), recommended, 14-day trial with no card**
- Every NEXUS idea with entry, stop, targets, call and trigger times and evidence score.
- Options ideas, the 0DTE desk (watch mode), pre-market and crypto ideas.
- FLOW tape; the full GEX workspace (walls, zero-γ, raw vs delta-adjusted, VEX, squeeze radar); sector ignition and rotation.
- Quantinum read (600 credits a month); Quantinum Bot paper ledger.
- Journal with broker import, Discord trader journals and analytics.
- Charts with GEX levels and drawing tools.
- 50 alerts and 50 watchlist symbols.
- Data age shown on every tile.

**Pro — $99/mo or $948/yr (founder $69 / $660), waitlist until the P2 licence is signed**
- Everything in Advanced.
- Licensed real-time equities and options (Soon).
- 0DTE sniper; unlimited alerts and watchlist; 1,500 credits.
- Your own Quantinum Bot paper runs (Soon); webhooks and REST API (Soon); priority support.

**Work needed before these plans render** (follow-ups; not done in this change):
1. Point `client/src/lib/plans.ts` and `server/seo-metadata.ts` at `shared/pricing.ts`. Delete the old table. Render "Recommended", not "Most popular" (the compliance review flags that as a factual claim).
2. Create new Stripe Price objects for $49/$468, $99/$948 and founder $29/$288, $69/$660. Keep existing $39 subscribers on their price (grandfather them).
3. Align `server/tierConfig.ts` and `AI_CREDIT_ALLOCATIONS` with the plan text: Free gets 5 ideas, 3 watchlist symbols and 30 credits (already true). Free currently has no options or flow (true). Advanced's watchlist is `Infinity` in code but 50 on the page; the index-only GEX map for Free is not enforced yet.
4. Add founder-price and trial terms to the Terms of Service, as the compliance review requires for the "locked in" promise.
5. Remove "Real-time market data" from the live Advanced copy today. Under P0 it isn't licensed.

---

## 5. Risks

### 5.1 Data licensing (the largest risk, and the largest cost at scale)

**The problem**
- Every equity and options feed in use today is licensed to an individual, or not licensed at all. Showing it to paying subscribers breaches vendor terms:
  - Alpaca's individual plans are for personal use.
  - Tradier's data may not be redistributed to anyone without an account.
  - Massive's individual plans say "individual use only".
  - Yahoo has no licence.
- The likely consequences are key revocation, the outage risk seen on 2026-09-29, or claims for back fees. Regulatory action is unlikely.

**Exchange fees (verified 2026-09-30 unless marked)**
- **OPRA:** $1.25 per non-professional user per month, $31.50 per professional device, and a $1,500/month vendor fee. **No OPRA fees on data delayed more than 15 minutes.**
- **CTA:** $1 per non-professional user per network plus $1,000 per network (schedule may be stale).
- **UTP:** $1–3 per non-professional user (*unverified*), ~$3,000 for real-time redistribution, $250/month for delayed.
- **Change coming:** CTA and UTP merge into one CT Plan on 2027-04-01, and fees may change.

**The mitigation is path P1: license delayed data, and label it delayed.**
- It costs about $1,500/month, with no per-user fees.
- Real-time moves to Pro through a vendor business plan that already covers exchange fees (P2). Going direct to the exchanges (P3) is ~$10–13k/month at 1,000 users, plus audits.
- Collect a professional/non-professional attestation at signup. Professional users trigger $31.50 OPRA fees per device and must be priced separately, as Quant Data and TradingView do.

**Bullflow.** The FLOW tape is a core Advanced feature. Get written redistribution terms before charging for it. If Bullflow says no, the fallbacks are Unusual Whales' API, Quant Data's API ($150, *unverified*), or computing flow from licensed OPRA trades. Computing it ourselves needs a real-time OPRA licence, which is P2/P3 cost.

### 5.2 Regulatory and wording

- **Investment adviser status.** The compliance review (C1) flags that paid ideas naming specific contracts, sent on a schedule, may fall outside the Investment Advisers Act's "publisher's exclusion". Get a securities-counsel opinion before the paid launch. Budget ~$3–10k as a one-time cost (an estimate). A disclaimer alone doesn't settle the question.
- **Pricing copy must never imply performance.** No win rates, returns, "profitable" or "beat the market" in plan text, and no testimonials. `shared/pricing.ts` follows this, and so does the fine print ("Prices buy access to research tools and data, not results.").
- **Record claims.** Wherever the record appears near pricing, it follows the POSITIONING rule: the rate always shows with its *n*, and nothing appears below 30 closed trades. The honest record is modest: the v6 NEXUS unit book is −$4,070 on n=264 with 39% positive, and the evidence score does not yet rank outcomes. **Don't sell the record. Sell the tools and the transparency.**
- **Do not tailor ideas to a user's risk answers**; that would make the output personalised advice (compliance review, C6).
- **Auto-renewal law** (FTC click-to-cancel and California ARL): the renewal terms are already in the fine print. Online self-serve cancel should replace "email support" before scale.

### 5.3 Operations

- The 2 GB box restarted 40 times on 2026-09-30. Charging users with no worker split and no uptime record invites refunds. Resize and split before launch.
- Gemini 2.5 may be retired on 2026-10-16 (*unverified*). Pin a supported model and cap credits.

---

## 6. Mobile: App Store and Google Play

**Recommended path: a Capacitor wrapper of the existing React app.** Not React Native.
- It reuses 100% of the UI and ships in about 3–5 weeks.
- To avoid a guideline 4.2 ("minimum functionality") rejection, it must add native value: push notifications for alerts, biometric unlock, a home-screen widget (the week's dealer map or best idea), offline cache of the last book, and native navigation.
- A bare `server.url` wrapper is the classic 4.2 rejection. A PWA is the $0 interim (it installs from the browser, and web push works on iOS 16.4+) but gets no store listing.
- React Native would be a 3–6-month rewrite for no pricing benefit.

**Cost**
- Apple Developer $99/year, Google Play $25 once.
- Enrol as the company (QuantEdge Labs), not an individual. Guidelines 3.2.1(viii) and 5.1.1(ix) expect regulated-field financial apps to come from a legal entity. This is a research app that places no orders, which lowers the risk.
- Test devices and Xcode on the existing Mac: $0.

**Review risks**
- **Advice framing (5.x):** keep "not investment advice" in the app description, on the first-run screen and in Settings.
- **No order routing and no broker connection** in v1.
- **Screenshots** say "Sample data".
- **Paid features must be reachable** (see below).

**Fees and the purchase path (verified 2026-09-30)**
- **Apple:** 30%, or 15% under the Small Business Program (under $1M in proceeds) and for subscriptions after year one.
- **Apple US link-out.** Since May 2025, US apps may link to web checkout with no commission. The Ninth Circuit (2025-12-11) allowed a "reasonably necessary" fee. Apple proposed 15%/10%/5% on 2026-08-13, and no rate has been approved. **Today it is 0%. Plan for 5–15% later.**
- **Outside the US**, in-app purchase is still required under 3.1.1. The reader-app exemption (3.1.3(a)) does not cover trading research.
- **Google Play US (since 2026-06-30):** a 10% service fee plus 5% for Play Billing. External links are allowed at 10% for subscriptions **plus $2.85 per app install** (reporting starts 2026-10-01; *partly unverified*).

**Fee impact on unit economics**

| Mobile purchase route | Cost per mobile subscriber (ARPU $56.50) | At 20% mobile share |
|---|---|---|
| US web link-out (Apple, today) | $0 + Stripe | $0 |
| Apple link-out if 5–15% is approved | $2.8–8.5 | $0.6–1.7 per subscriber overall |
| In-app purchase at 15% (small business or year 2+) | $8.5 | **$1.69** (the model's base case) |
| In-app purchase at 30% | $17.0 | $3.39; margin at 1,000 subscribers falls from 85% to 82% |

At every scale above 250 subscribers the store fee costs less than two points of margin. It is not a pricing driver. **Keep the same price on every platform.** Don't raise in-app prices to recover the fee: it confuses users, and Apple's listing shows the price.

**Timeline**
- Week 0: resize and worker split.
- Weeks 1–2: Capacitor shell, push and biometrics.
- Week 3: widget and offline cache.
- Week 4: TestFlight and internal Play testing.
- Weeks 5–6: review (budget one rejection round). US link-out at launch; in-app purchase for other countries in a later release.

---

## 7. The three decisions the operator must make

1. **The data path, and when to charge.** Pick one:
   - **(a)** Keep today's feeds and stay a **free, invite-only beta** until a licence is signed.
   - **(b) Sign licensed delayed data (P1, ~$1.5k/month) plus Bullflow redistribution, then open Advanced.** Recommended. It breaks even at ~35 subscribers.
   - **(c)** Go straight to real-time (P2, ~$5k/month). Breaks even at ~117.

   Whatever you pick, remove "Real-time market data" from the live Advanced copy now.
2. **Prices: $49 / $99 list with $29 / $69 founder pricing, or keep $39 / $79.** Keeping $39 moves break-even by only about 5 subscribers, but it anchors the brand below the flow band and leaves no room for a founder discount. Also decide whether current $39 subscribers keep their price. Recommended: yes, for 12 months.
3. **Regulatory posture before the first paid dollar.** Commission a securities-counsel opinion on the publisher's exclusion (compliance review C1). Decide whether Discord idea posts and 0DTE ideas stay in paid plans (the highest-risk features), become delayed or model-only, or stay free and public. This changes what Advanced can promise.

---

## Sources (accessed 2026-09-30 unless dated)

- **Competitors:** unusualwhales.com/pricing; spotgamma.com/subscribe-to-spotgamma; menthorq.com/pricing; trendspider.com/pricing; luxalgo.com/pricing; tradingview.com/pricing; blackboxstocks.com/pricing; flowalgo.com; quantdata.us; insiderfinance.io/pricing; marketchameleon.com/Subscription/Browse; tradytics.com; apps.apple.com (Bullflow).
  - *Unverified, third-party:* optionstrading.org (Cheddar Flow), bullishbears.com (Benzinga, Quant Data), gex-levels.com (MenthorQ annual), chartinglens.com (TradingView monthly), tradingtoolshub.com (FlowAlgo).
- **Infrastructure:** digitalocean.com/pricing/droplets; digitalocean.com/pricing/managed-databases; docs.digitalocean.com (load balancer pricing).
- **Market data vendors:** alpaca.markets/data; massive.com/pricing and massive.com/business; docs.tradier.com/docs/market-data; bullflow.io/api and x.com/BullflowIO (API $99–129, *unverified*).
- **Exchange fees:** thetadata.net OPRA fee guide (2026-05-29); sec.gov OPRA fee filing 34-104267; ctaplan.com Schedule of Market Data Charges; datashop.cboe.com/sip-fees; utpplan.com.
- **LLMs and services:** ai.google.dev/gemini-api/docs/pricing; platform.claude.com pricing; OpenAI prices via benchlm.ai (*unverified*); resend.com/pricing; stripe.com/pricing.
- **Mobile:** developer.apple.com/app-store/small-business-program; developer.apple.com/app-store/review/guidelines; Ninth Circuit No. 25-2935 (2025-12-11); 9to5mac.com (2026-08-13); macobserver.com (Supreme Court No. 25-1311); strataigize.com (Google Play fee changes, 2026); mobiloud.com (webview wrappers and 4.2).
- **Internal:** docs/POSITIONING.md; docs/SR11-7_VALIDATION_v6.md; docs/COMPLIANCE_REVIEW_2026-09-30.md; docs/MEMORY_BUDGET.md; client/src/lib/plans.ts; server/tierConfig.ts; shared/schema.ts.

---

## Appendix — the model script

```python
import math
# ---- prices (list) and mix
ADV_M, ADV_A = 49, 468   # annual = $39/mo
PRO_M, PRO_A = 99, 948   # annual = $79/mo
MIX_PRO = 0.25; ANNUAL_SHARE = 0.40; MOBILE_SHARE = 0.20; IAP_RATE = 0.15
def arpu(adv_m=ADV_M, adv_a=ADV_A, pro_m=PRO_M, pro_a=PRO_A):
    a = (1-ANNUAL_SHARE)*adv_m + ANNUAL_SHARE*adv_a/12
    p = (1-ANNUAL_SHARE)*pro_m + ANNUAL_SHARE*pro_a/12
    return (1-MIX_PRO)*a + MIX_PRO*p
def pay_fee(adv_m=ADV_M, adv_a=ADV_A, pro_m=PRO_M, pro_a=PRO_A):
    f = lambda m: 0.036*m + 0.30          # 2.9% + 30c + 0.7% Billing
    fa = lambda a: (0.036*a + 0.30)/12
    a = (1-ANNUAL_SHARE)*f(adv_m) + ANNUAL_SHARE*fa(adv_a)
    p = (1-ANNUAL_SHARE)*f(pro_m) + ANNUAL_SHARE*fa(pro_a)
    return (1-MIX_PRO)*a + MIX_PRO*p
LLM = 0.75; EMAIL = 0.02
# ---- fixed by scale
TIERS = [10, 50, 250, 1000, 5000, 10000]
INFRA = {10:29, 50:75, 250:135, 1000:270, 5000:700, 10000:1200}
TOOLS = {10:12, 50:12, 250:60, 1000:125, 5000:200, 10000:300}  # domain+Apple+monitoring+email+bg LLM
SUPPORT = {10:0, 50:0, 250:500, 1000:1500, 5000:5000, 10000:9000}
LEGAL = {10:0, 50:150, 250:300, 1000:300, 5000:500, 10000:500}
DATA_FIXED = {  # per path
 'P0': 130,           # today's personal-use feeds (not licensed for paid redistribution)
 'P1': 1500,          # licensed delayed eq+opts (~$1,000) + Bullflow redistribution (~$500) -- assumptions
 'P2': 5000,          # vendor Business real-time (~$4,500) + Bullflow (~$500)
}
DATA_PER_USER = {'P0':0, 'P1':0, 'P2':1.25*MIX_PRO}  # OPRA non-pro fee for real-time (Pro) users
def tier_for(n):
    for t in TIERS:
        if n <= t: return t
    return TIERS[-1]
def cost(n, path, iap=True, **pr):
    t = tier_for(n)
    fixed = INFRA[t]+TOOLS[t]+SUPPORT[t]+LEGAL[t]+DATA_FIXED[path]
    var = pay_fee(**pr) + LLM + EMAIL + DATA_PER_USER[path] + (MOBILE_SHARE*IAP_RATE*arpu(**pr) if iap else 0)
    return fixed, var, fixed + var*n
def breakeven(path, iap=True, **pr):
    for n in range(1, 20001):
        f, v, c = cost(n, path, iap, **pr)
        if arpu(**pr)*n >= c: return n
print(f"ARPU {arpu():.2f}  payfee {pay_fee():.2f}  IAP/sub {MOBILE_SHARE*IAP_RATE*arpu():.2f}")
for path in ['P0','P1','P2']:
    print('PATH', path)
    for n in TIERS:
        f, v, c = cost(n, path)
        r = arpu()*n
        print(f"  n={n:>6} fixed={f:>7.0f} var/u={v:5.2f} cost={c:>9.0f} cost/u={c/n:7.2f} rev={r:>9.0f} margin={(r-c)/r*100:6.1f}%")
    print('  breakeven', breakeven(path), 'no-IAP', breakeven(path, iap=False))
print('candidate Advanced prices (Pro fixed 99/79):')
for am in [29, 39, 49, 59]:
    aa = round(am*0.8)*12
    print(am, aa, f"arpu={arpu(am,aa):.2f}", 'BE P1', breakeven('P1', adv_m=am, adv_a=aa), 'BE P2', breakeven('P2', adv_m=am, adv_a=aa))
# founder pricing: all subs at 29 / 69 monthly
print('founder', f"arpu={arpu(29,288,69,660):.2f}", 'BE P1', breakeven('P1', adv_m=29, adv_a=288, pro_m=69, pro_a=660))
```
