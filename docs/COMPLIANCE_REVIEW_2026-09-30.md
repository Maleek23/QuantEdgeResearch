# Trading-content compliance review — 2026-09-30

Branch `feat/compliance`. Reviewer: Claude (AI). **This is not legal advice.** It flags
risks and proposes wording; items marked **LAWYER** need a securities/consumer-protection
lawyer to confirm before relying on them. Cited rules are from model knowledge and
tagged `[settled]` or `[verify]`. None were checked against a primary source in this review.

Method: I applied the trading-content vetting method (claim ledger, implied claims, "a
disclaimer does not cure a misleading headline", paid signals mean a regulatory-status
review, options-risk rules) and the marketing-claims taxonomy (factual, comparative,
implied, absolute). The vetting skill's "offer intelligence" section describes a
different business (Luqman Branding / Stock Studio). I used only its method, not its
facts.

Legend: **Applied** = changed in this branch. **Rec** = recommendation, not changed.

---

## Headline risks (read first)

1. **CRITICAL: Regulatory status review required.** Paid plans (Advanced $39/mo) sell
   "Discord alerts" and real-time NEXUS/0DTE ideas. These name **specific contracts
   with entry, stop, targets, an entry window and a model size**. Charging for ongoing,
   security-specific buy/sell ideas can go beyond general education into compensated
   securities advice. Whether the Investment Advisers Act "publisher's exclusion"
   applies (impersonal, bona fide, general and regular circulation; *Lowe v. SEC*,
   1985 `[settled]`) or state adviser rules apply depends on the facts. **LAWYER.**
   A "not investment advice" disclaimer does not decide that question on its own.
   Things that help the publisher argument: the same ideas go to all subscribers,
   nothing is tailored to a user's account, and ideas are published on a regular
   schedule. Things that hurt it: time-sensitive "enter now" framing, per-user sizing,
   and 1-on-1 calls (Pro's "1-on-1 onboarding call"). This branch removes the "enter
   now" framing and makes clear that 0DTE sizing uses the desk's fixed caps, not the
   user's account.
2. **HIGH: Auto-renewal and cancellation.** Before this change, checkout said nothing
   about auto-renewal, and the FAQ said "Monthly plans can be cancelled anytime". There
   is **no in-app way to cancel**: `/api/billing/portal` exists (server/routes.ts:1726)
   but no client screen calls it. State auto-renewal laws (e.g. California's ARL
   `[verify]`) and FTC ROSCA `[settled]` expect clear terms before purchase and a simple
   way to cancel. **Applied:** renewal and cancellation wording near checkout.
   **Rec (engineering):** add a "Manage billing / cancel" button in Settings that calls
   `/api/billing/portal`. **LAWYER:** confirm the ARL/ROSCA requirements (consent
   capture, post-purchase acknowledgement email).
3. **HIGH: Terms of Service are stale** (client/src/pages/terms-of-service.tsx:20,
   "Last updated: October 21, 2025"). They have no subscription, renewal or refund
   terms, no options/0DTE/crypto risk section, and no paper/hypothetical-results
   section. **Rec / LAWYER:** redraft them. The signup acknowledgement added below
   points to these Terms.

---

## C1 — Inventory ✅

| Surface | File | Reviewed |
|---|---|---|
| Landing: hero, live panels, "also on", pricing, FAQ, CTA, footer | client/src/pages/landing-nexus.tsx, client/src/components/landing/live-showcase.tsx | ✅ |
| Plans / pricing | client/src/lib/plans.ts | ✅ |
| About + founder bio | client/src/pages/about.tsx | ✅ |
| Login / signup / join-beta / tier gate | login.tsx, signup.tsx, join-beta.tsx, components/tier-gate.tsx | ✅ (no claims on login or tier gate) |
| Meta / JSON-LD | client/index.html, server/seo-metadata.ts, client/src/lib/seo.ts | ✅ |
| What's new | shared/changelog.ts | ✅ (hype entries fixed) |
| Guide (web) | client/src/pages/how-to.tsx | ✅ |
| Guide (PDF) | docs/QuantEdge-How-To-Use.pdf (text extracted, not regenerated) | ✅ findings under C3 |
| Discord templates | server/discord-service.ts, plus 11 scanners that post through `postDiscordWebhook` | ✅ |
| Ideas: NEXUS detail, 0DTE desk, crypto, bot | nexus-parts.tsx, oracle/signal-detail.tsx, zerodte/zero-dte-ideas.tsx, server/zero-dte-desk.ts, crypto-nexus.tsx, bot-nexus.tsx | ✅ |
| Bot record displays | live-showcase BotPanel/JournalPanel, bot-nexus, performance.tsx (already has RiskDisclosure) | ✅ |

Meta tags (index.html, seo-metadata.ts) are clean: they describe features only, make no
performance claims, and assert no founder credentials. The JSON-LD Person entity has only
`jobTitle: Founder`, with no employer.

---

## C2 — Performance & returns claims ⚠️

What is already good: win rates are withheld below n=30 and always shown with n. The
bot panel says "on paper, no real money". The 0DTE header shows "measuring · n= (LOW N)"
instead of a hit-rate headline. The PDF says win rates are withheld until 30 outcomes.

| Risk | Location | Current → Proposed | Status |
|---|---|---|---|
| High | live-showcase.tsx JournalPanel | "Net realized P&L" (paper book, reads as real money) → "Paper net P&L" | Applied |
| High | live-showcase.tsx BotPanel | shows win rate with no hypothetical/past-performance caveat → adds "Simulated results have limits (fills are modelled) and past performance does not guarantee future results." | Applied |
| Medium | live-showcase.tsx NexusPanel | per-idea "Hit target +x%" with no basis → adds "Outcomes are measured from each idea's published entry — model results, not trades anyone placed, before fees and slippage." | Applied |
| Medium | landing footer | no paper / past-performance line → "Quantinum Bot results are paper (simulated) trades, and past performance does not guarantee future results." | Applied |
| Medium | bot-nexus.tsx disclaimer | adds paper / simulated / past-performance line | Applied |
| Medium | nexus-parts.tsx score tile | "position P&L" on bot-held ideas → "paper P&L" | Applied |
| High | shared/changelog.ts (earnings bridge entry) | "PINS just gapped +15.78% post-market — this prevents missing the next one." (cherry-picked mover + FOMO) → "Lottos are high-risk, low-probability options that often expire worthless." | Applied |
| Medium | client/src/lib/seo.ts successStories | "Trading Results \| Real Trades & Performance" (these are model ideas, not real trades) → "Track Record \| Published Ideas & Outcomes" | Applied |
| Medium | client/src/components/user-performance-summary.tsx:150 | "Positive means the engines make money on average" → "Positive means the published ideas were profitable on average, measured from their published levels (hypothetical, before costs)." | Rec |
| Medium | server/discord-service.ts:412–417 bot-entry title | "[A] 85%" (a confidence % reads as a win probability) → show band/grade only, or "score 85/100" | Rec |
| Low | about.tsx:54 | "Built by traders, for traders" is puffery; fine as is | — |

"Edge" wording: the journal's "Edge score" is a measurement of the user's own trades,
so it is fine. gex-rankings-panel already says "no validated edge yet".

## C3 — Advice language ⚠️

| Risk | Location | Current → Proposed | Status |
|---|---|---|---|
| High | zero-dte-ideas.tsx:154 chip tooltip | "TRIGGERED — enter now" → "TRIGGERED — trigger hit, setup active (a model idea, not a recommendation)" | Applied |
| Medium | zero-dte-ideas.tsx:94 | "enter by HH:MM" → "entry window to HH:MM" | Applied |
| Medium | zero-dte-ideas.tsx:95 | "Size 3× · risk ≈ $…" → "Model size …", plus the note "Model size uses the desk's fixed caps, not your account." | Applied |
| High | server/zero-dte-desk.ts:448 honesty line (shown on the desk) | adds "Research only — not a recommendation to buy or sell; 0DTE options can lose their full value within minutes." | Applied |
| High | **PDF guide** p.7 ("TRIGGERED means the trigger printed — enter now or skip"), p.11 stage table ("The trigger printed — enter now." / "Decide: take it at the live premium, or skip"), glossary p.32 ("enter now / running / resolved") | → "Trigger hit — setup active." / "Your call: review it at the live premium, or pass." / "trigger hit / running / resolved". Add to p.20/"What it isn't": "Options, and 0DTE options above all, can lose their full value within minutes." | **Rec: regenerate the PDF.** Its source is not in the repo (docs/field-guide.html is an older, different doc). |
| Medium | PDF p.8 "✓ big money is buying with the idea" | → "✓ large options flow leans with the idea" | Rec |
| Medium | nexus-parts.tsx detail | section "Execution" → "Trade structure"; score label "confidence / 100" → "evidence score / 100"; new footer: "Model idea for research and education — not a recommendation to buy or sell. Scores rank evidence; they are not probabilities. Options can lose their full value." | Applied |
| Low | oracle/signal-detail.tsx | "What to do now" → "Setup status"; "Stand down." → "the thesis is invalidated."; "Profit Taking Plan" → "Model exit plan" | Applied |
| Medium | how-to.tsx decision tree | "What should I trade today?" → "What setups are on the board today?"; "Where's QCOM going?" → "What's the read on QCOM?"; "A pattern setup I want to follow?" → "…track?"; "Dealer walls = your entry/exit levels" → "Dealer walls — levels to plan around, not guarantees"; "MARA/COIN/MSTR plays" → "…proxies that follow"; "Adjust stops on existing trades" → "Review stops on your open positions" | Applied |
| Low | server/discord-service.ts BOT ENTRY/EXIT | "**BOT ENTRY**" → "**BOT ENTRY (paper)**" (same for EXIT) | Applied |
| Low | discord-service.ts:1077 / 2331 | "GOOD MORNING! Here are today's top trade ideas" is fine with the new footer. Consider "today's top-ranked model ideas". | Rec |
| Low | landing CTA:291 "Trade the evidence, not the headline." | Slogan, not an instruction on a specific security. Acceptable. | — |
| Low | code comments "snipe SPX…" (server/zero-dte-desk-core.ts:34), `ENTRY_WINDOW_MIN` comment | Internal only, not user-facing | — |

**Disclaimer coverage**

| Surface | Before | After |
|---|---|---|
| Landing footer | ✓ basic | ✓ plus options/crypto/paper/delay |
| Pricing (near checkout) | ✓ | ✓ plus renewal/cancel |
| NEXUS idea detail | ✗ (only the desktop bottom bar) | ✓ Applied |
| 0DTE desk | partial (honesty line) | ✓ Applied |
| Discord posts | ✗ none | ✓ **Applied at the `postDiscordWebhook` boundary** (all 12 publishers). Adds "Research & education only — not investment advice. Model/paper output. Options & crypto carry substantial risk." to the last embed's footer, or as `-#` subtext on content-only posts. The multipart trade-card upload carries it in its own footer. |
| PDF | ✓ every page footer | same (risk line recommended) |
| Signup / join-beta | ✗ / Terms only | ✓ Applied: terms + risk acknowledgement (browsewrap). **Rec / LAWYER:** a required checkbox (clickwrap) is more enforceable. |
| About | ✗ footer | ✓ Applied |
| Guide (web) | partial | ✓ Applied: "Not advice" paragraph |
| **Phone shell** | ✗: terminal-shell.tsx:513 (`hidden sm:flex`) and nexus-frame.tsx:136 (`hidden lg:flex`) hide the only in-app disclaimer on phones | **Rec (Medium):** show a one-line disclaimer on phones, e.g. above the mobile dock or in the phone header menu. Left alone because it is a layout change. |

## C4 — Risk disclosures ⚠️

| Risk | Location | Change | Status |
|---|---|---|---|
| High | landing FAQ "Is this investment advice?" | adds "Options — especially same-day (0DTE) options — and crypto are high-risk: a position can lose its full value quickly, and they are not suitable for every investor." | Applied |
| High | 0DTE desk | 0DTE risk line in the honesty note (above) | Applied |
| Medium | crypto-nexus.tsx disclaimer | adds "Crypto trades 24/7 and is highly volatile — you can lose your full investment." | Applied |
| Medium | changelog lotto entry | lotto risk line (above) | Applied |
| Medium | landing footer | data-delay disclosure: "CBOE option chains ~15 min; free plan quotes 15 min" | Applied |
| Low | how-to.tsx:132 | delays already disclosed (Alpaca indicative → CBOE ~15 min → Yahoo) | ✓ |
| Medium | Terms | no options/crypto risk section | Rec / LAWYER |
| Low | FINRA Rule 2220 / Options Disclosure Document | apply only if a broker-dealer is involved. None is known, so not applied. `[verify]` | — |

The GEX pages already say walls are "modelled dealer positioning, not guaranteed support
or resistance" (ticker-page.tsx:367, zero-dte-ideas.tsx:123, PDF p.21). ✓

## C5 — Testimonials / social proof / founder ⚠️

- Earlier removals confirmed: no "2,500+ traders" and no testimonial anywhere in
  client/src or index.html. ✓
- **About stats** (about.tsx:59–67): "8 Market Data Feeds" and "2000 Liquid Names Ranked
  Daily" have a comment showing they were measured on 2026-09-24. Keep that evidence on
  file. "24/7 Market Monitoring" is true for crypto only. **Rec (Low):** change to "24/7
  crypto coverage".
- **Development timeline** (about.tsx:70–74, 2024 Q1–2025 Q1) are dated factual claims.
  **Rec (Low):** confirm them against git history or remove them.
- **"Hosted on SOC 2-Audited Cloud"** (about.tsx:79) is true only if the hosting
  provider's SOC 2 report covers the droplet region. It implies QuantEdge itself is
  audited. **Rec (Medium):** change to "Hosted with a SOC 2-audited cloud provider" and
  keep the provider's attestation on file.
- **Mission copy** (about.tsx): "We built QuantEdge to level the playing field" (implies
  parity with institutions) → "…to put that research in one place". "you only see
  opportunities where multiple independent layers agree … smart money is positioning …
  that's when you get a high-conviction signal" (the "only" is untrue because the board
  shows lower bands too; "smart money" is an unsupported inference) → a description of
  evidence scoring with "a ranking of evidence, not a forecast". **Applied.**
- **Values:** "Accuracy Over Volume" (an implied accuracy claim) → "Selectivity Over
  Volume"; "Every recommendation shows exactly why it was made" → "Every idea shows the
  evidence behind it…". **Applied.**
- **Founder bio** (about.tsx:309): "Model Risk Engineer @ DTCC". Not removed. **Rec
  (Medium):** check DTCC's outside-activity and social-media / use-of-name policy.
  Financial-infrastructure employers often need pre-approval for outside business
  activities and forbid using the employer's name in a way that implies endorsement.
  Options: get written clearance; change it to "Model risk engineer at a financial
  market infrastructure firm"; or keep it with "Views and products are his own and not
  affiliated with or endorsed by DTCC." **LAWYER / employer compliance.** Degrees
  (M.S. Oklahoma, B.S. UT Arlington) are fine if accurate; keep a transcript or diploma
  on file.
- **Imported trader journals** (Femi/Uzo/Ayo/Tommi books; about.tsx "imported trader
  journals"): if other members see these, their records work like testimonials or
  third-party results. **Rec (Medium):** get written consent, label them as individual
  historical results that are not typical, and disclose any compensation or free access.
- **Privacy (Low):** the beta-waitlist route posts each signup's email to a Discord
  webhook (server/routes.ts:1014–1030). Make sure that channel is private and staff-only.

## C6 — Pricing / marketing ⚠️

| Risk | Location | Current → Proposed | Status |
|---|---|---|---|
| High | landing pricing fine print | adds "Paid plans renew automatically at the listed price each month or year until cancelled; cancel anytime by emailing support@quantedgelabs.net." | Applied (**confirm support@ is monitored**, since it is only used as reply-to today) |
| High | landing FAQ | "Monthly plans can be cancelled anytime." → "Paid plans renew automatically each month or year until you cancel, and you can cancel anytime by emailing support@…" | Applied |
| High | Settings | no self-serve cancel or billing portal link | Rec (engineering), see headline risk 2 |
| Medium | plans.ts Free | "Explore the research platform risk-free" (loaded word next to trading) → "…at no cost" | Applied |
| Medium | plans.ts Pro | "Futures trading (NQ, ES, GC)" (implies execution) → "Futures research (NQ, ES, GC)" | Applied |
| Medium | landing.tsx:159 | "these rates are locked in for early members" is a price-lock promise with no terms. Honour it in writing (Terms) or change to "Beta pricing for early members." | Rec |
| Medium | plans.ts:48 Advanced | "Full stock & crypto access for serious traders". Options are the product's core but aren't named, and Free says "Stocks & crypto only". Confirm whether options are in Advanced and say so. | Rec |
| Medium | plans.ts:56, 58 | "Unlimited AI generations", "Discord alerts": confirm both exist and are gated to Advanced. Discord alerts are what trigger the regulatory item in headline risk 1. | Rec |
| Low | plans.ts Pro | 10 "Soon" features, plan shows "Coming soon" and "Join the waitlist", no checkout. Correctly labelled. ✓ | — |
| Low | "save ~25%" | Advanced $349 vs $468 (25.4%), Pro $699 vs $948 (26.2%). Accurate. ✓ | — |
| Low | "Most popular · beta" (landing:94) | "Most popular" is a factual claim. Keep subscriber counts on file or change to "Recommended". | Rec |
| Low | how-to.tsx:132 | "Polygon ($99/mo institutional real-time)" names a competitor with a price that may go stale. Drop the price. | Rec |
| Low | join-beta onboarding collects "Risk Tolerance" / "Investment Goal" | Stored only; not used to tailor ideas (the bot's riskTolerance is a separate paper-bot setting). Keep it that way. Tailoring ideas to these answers would make advice personalised. | Rec |

---

## Evidence to keep on file

- Data-feed list and liquid-universe count (about.tsx stats), dated.
- The hosting provider's SOC 2 attestation.
- Founder degrees, and employer clearance for the DTCC mention.
- Bot ledger exports that back every displayed win rate or P&L, plus the n≥30 gate logic.
- Written consent from any trader whose imported journal is shown to others.
- Stripe price IDs and plan features, matched to plans.ts. Proof that each non-"Soon" feature exists.
- A monitored support@ mailbox and a cancellation SLA.

## Checks

- `npx tsc --noEmit -p .` → 451 errors (baseline ≤ 451). No new errors in touched files.
- `npm run build` → exit 0.
- `npx tsx scripts/test-journal.ts` → passed.
- `npm run -s test:zero-dte` → 35 passed.
- `withDiscordDisclaimer` was spot-checked by hand: embed footer appended, content-only subtext, embed without footer.

*Citations: FTC Act §5 / ROSCA `[settled]`; Investment Advisers Act §202(a)(11) and the
publisher's exclusion, Lowe v. SEC, 472 U.S. 181 (1985) `[settled]`; California ARL, Bus. &
Prof. Code §17600 et seq. `[verify]`; FINRA 2210/2220 `[verify]`, applicable only if a
broker-dealer is involved. All were generated by an AI and none were checked against
primary sources. Verify them before relying on them.*
