# SEO plan — quantedgelabs.net

Status: 2026-09-30, branch `feat/seo`. Audit of the live site plus the fixes in this
branch. Copy rules: docs/POSITIONING.md (honest, measured, no "AI-powered").
Check: `npx tsx research/check-seo.ts` (titles/descriptions, route → status, sitemap,
robots, JSON-LD).

## 1. Audit — what the live site did (before this branch)

| Area | Finding | Severity | Fixed here |
|---|---|---|---|
| robots.txt | `User-agent: Googlebot` / `Bingbot` groups with `Allow: /` — a crawler obeys only its most specific group, so **every Disallow was ignored by Google and Bing** | Critical | Yes — one `*` group |
| robots.txt | `Disallow: /t` is a prefix match: it also blocked **/terms** (and /today, /trade-ideas) for other crawlers | High | Yes |
| robots.txt | App pages (/t, /r, /today, /login) disallowed while they also serve `noindex` — a blocked page's noindex is never seen, and linked URLs (landing links /t, /r/SPY) can index as bare URLs | Medium | Yes — only /api/, /admin and account paths blocked |
| Status codes | Unknown URLs returned **200** (soft 404; the noindex tag limited the damage) | High | Yes — real 404 |
| Status codes | Blog slugs that don't exist / drafts returned 200 | Medium | Yes — 404 unless published |
| Redirects | `www.quantedgelabs.net` served a full 200 duplicate of every page | High | Yes — 301 to apex (app-level) |
| Redirects | `/about/` (trailing slash) 200 duplicate | Low | Yes — 301 |
| Redirects | 88 retired URLs (/stock/:s, /home, /pricing …) redirected only in JS | Medium | Yes — server 301 to the final target, from the same table |
| Redirects | http → https: 308 via Caddy, HSTS on | OK | — |
| Sitemap | No `<lastmod>`; blog query had no status filter (**drafts would be listed**) | High | Yes — published only, real lastmod |
| Rendering | `/` was served by express.static as raw index.html, bypassing per-route meta | Medium | Yes — `index: false` |
| Structured data | index.html shipped Organization/Person/SoftwareApplication on **every** URL (404s, noindex app pages) and duplicated the server's on `/` | Medium | Yes — server is the one source, per route |
| Structured data | No WebSite, no FAQPage (landing has a 9-question FAQ), Offer said price 0 only | Medium | Yes — WebSite, FAQPage (from the same text the page renders), offers from PLANS |
| Structured data | Blog Article: `publisher.logo` → /logo.png (404); datePublished fell back to "now" | Low | Yes |
| Canonical | noindex pages carried a canonical (conflicting signals) | Low | Yes — removed on noindex |
| Titles | Home title 71 chars (truncated in SERP); client SEOHead titles differed from server titles (Google renders JS, so it saw the client one) | Medium | Yes — one copy in shared/public-seo.ts, all ≤ 60 |
| Headings | /about had two `<h1>` | Low | Yes |
| Brand | "Quant Edge Labs" (banned by POSITIONING) in og:site_name, about, blog, academy | Low | Yes — "QuantEdge Labs" everywhere; "Quant Edge Labs" kept only as schema `alternateName` |
| Content | /blog has **0 published posts** (`/api/blog` → `[]`) — an indexed empty page | High | Partly — dropped from the sitemap while empty; posts needed (§3) |
| Content | /academy lists 10 "articles" with read times that open nothing (cards, no bodies) | High | No — needs content or removal (operator call) |
| Ticker pages | `/r/:symbol` is sign-in only, so no public ticker pages exist to rank | Opportunity | No — see §3 idea 10 |
| Performance | TTFB 0.2–0.5 s, gzip, HTTP/2 + h3, hashed assets immutable 1y | OK | — |
| Security | HSTS, CSP, nosniff, frame-options present | OK | — |

## 2. Founder / brand entity

- One `Organization` (`/#organization`, "QuantEdge Labs", alternateName QuantEdge / Quant Edge
  Labs, logo, support email, Discord) and one `Person` (`/about#founder`, Abdulmalik Ajisegiri,
  photo at `/founder.jpg`, sameAs portfolio + LinkedIn + GitHub — the three already linked from
  /about). `WebSite` names the site so Google can show "QuantEdge Labs" as the site name.
- /about is indexable, has one H1, a founder section with `id="founder"`, an AboutPage node whose
  mainEntity is the founder, and the landing footer links to it ("Founded by Abdulmalik Ajisegiri").
- Naming: company **QuantEdge Labs**, product **QuantEdge**, never "Quant Edge".
- **TODO(operator)** — URLs only you can confirm (not invented here):
  - Your X/Twitter profile URL → Person.sameAs (server/seo-metadata.ts) and /about links.
  - QuantEdge Labs X/Twitter account, LinkedIn company page, YouTube (if any) → Organization.sameAs.
  - Confirm the LinkedIn slug `malikajisegiri` and GitHub `Maleek23` are the ones you want public.
  - Put a link back to https://quantedgelabs.net on abdulmalikajisegiri.com, LinkedIn and GitHub
    (two-way links are what connect the entity).

## 3. Content opportunities — 10 page briefs (match real features)

Each brief: a public, indexable page under `/learn/<slug>` (or published through the existing
blog CMS at /admin/blog → `/blog/<slug>`, which is live and in the sitemap). Rules for all:
explain the concept plainly, show one annotated example labelled **sample data** with its date,
state limits ("a level to plan around, not a guarantee"), link into the terminal feature, no
win-rate claims without *n*, and the investment-advice disclaimer.

1. **What is gamma exposure (GEX)?** — kw: *gamma exposure, GEX explained, dealer gamma*.
   How dealer hedging turns open interest into buying/selling pressure; positive vs negative
   gamma regimes; how QuantEdge computes GEX by strike and expiry (and its data source/delay).
   CTA: GEX tab. ~1,500 words, one strike-profile chart.
2. **How to read a call wall and a put wall** — kw: *call wall, put wall, options walls*.
   What a wall is, why price pins or rejects there, when walls fail (flows roll, expiry). Worked
   SPY example from a dated snapshot. CTA: GEX walls on the chart tab.
3. **Zero gamma (the gamma flip) explained** — kw: *zero gamma level, gamma flip*. Above vs below
   the flip, volatility implications, how often it moves intraday. CTA: zero-γ line on CHART.
4. **0DTE dealer positioning: what changes on expiry day** — kw: *0DTE options, 0DTE gamma,
   SPX 0DTE*. Same-day gamma concentration, pinning into the close, why data age matters; the
   0DTE desk and its stated delay. Heavy risk section (0DTE can lose 100% fast).
5. **Vanna exposure (VEX) in plain English** — kw: *vanna exposure, VEX, vanna flows*. How IV
   changes move dealer deltas; VEX vs GEX; vol-crush days. CTA: VEX view.
6. **How to read options flow: sweeps, blocks and prints** — kw: *options flow, unusual options
   activity, sweeps vs blocks*. What each print type is, why most flow is hedging, how FLOW
   filters it, where the feed comes from.
7. **Dark pool levels: what they can and can't tell you** — kw: *dark pool prints, dark pool
   levels*. Reporting delays, why big prints ≠ direction, using them as levels. CTA: FLOW dark pool.
8. **How we grade a trade idea (and why we hide win rates under n=30)** — kw: *trading track
   record, win rate sample size*. Entry/stop/target, auto-grading, the public record by conviction
   band, sample-size rule. Brand/trust page; links to Quantinum Bot's paper ledger.
9. **How to import your broker trades into a trading journal** — kw: *trading journal import,
   Webull/Robinhood/Schwab CSV journal*. Step-by-step per broker (the eight recognised CSVs),
   Alpaca read-only import, what metrics are computed. One section per broker = long-tail.
10. **Public ticker primers `/learn/ticker/<SYMBOL>`** (SPY, QQQ, SPX, NVDA, TSLA … ~20) —
    kw: *SPY gamma exposure, TSLA options levels*. A static, dated, indexable explainer per
    liquid ticker: what drives its options positioning, typical wall behaviour, link to the live
    (signed-in) ticker page. Do **not** publish live numbers as current (see "live, not carried");
    stamp every figure with its date, and check data-vendor redistribution terms first.

Also: either fill /academy's 10 cards with real articles (1–7 above map onto them) or remove the
cards and their read times. The sitemap already leaves /blog out until a post is published.

## 4. What only the operator can do

1. **Google Search Console**: add a *Domain* property for `quantedgelabs.net` (DNS TXT record at
   the registrar). Then submit `https://quantedgelabs.net/sitemap.xml`, and use URL Inspection →
   Request indexing on `/` and `/about`.
2. **Bing Webmaster Tools**: import from Search Console (one click) and submit the sitemap.
3. **Social profile URLs** for sameAs (§2 TODO list).
4. **Deploy** this branch (the www → apex 301, 404s and robots fix only take effect in prod). After
   deploy, verify: `curl -sI https://www.quantedgelabs.net/` → 301; `curl -so /dev/null -w
   '%{http_code}' https://quantedgelabs.net/nope` → 404; run the Rich Results Test on `/` and `/about`.
   Optional: also redirect www at Caddy (`www.quantedgelabs.net { redir https://quantedgelabs.net{uri} permanent }`).
5. **Content**: write/publish the §3 pages (blog CMS at /admin/blog works today).
6. **Backlinks**: link the site from your portfolio, LinkedIn, GitHub profile README and the
   Discord server description.
7. Bump `STATIC_LASTMOD` in server/sitemap-generator.ts when a public page's copy changes.
