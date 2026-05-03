# Thesis Template

Fixed structure for every ticker writeup. Copy this file to `theses/YYYY-MM-TICKER.md`, fill it in, post the **Twitter Thread** section as your public thread, keep the rest as your audit trail.

---

## Header

- **Ticker:** `$XXXX`
- **Company:** Full name
- **Sector / Sub-theme:** e.g. Photonics → CPO substrates
- **Date opened:** YYYY-MM-DD
- **Spot price at open:** $X.XX
- **Conviction:** Low / Medium / High / Very High
- **Time horizon:** Swing (1–6w) / Position (1–6mo) / LEAPS (6–24mo)
- **Sizing:** % of book
- **Status:** OPEN / TRIMMED / CLOSED / INVALIDATED

---

## TL;DR (≤280 chars — tweet-ready)

> One sentence: what the stock is, what's mispriced, and the catalyst window.
> Example: `$BB is a software re-rating story masquerading as a meme. QNX is the de-facto OS in 235M+ vehicles, AI/SDV cycle is the catalyst, and the multiple still prices it like a hardware company.`

---

## 1. Setup — why now

Why is this trade live *this week*, not last quarter, not next year? Concrete trigger:
- A specific data point dropped (design win, customer guide, supplier check)
- A specific technical setup (level reclaim, breakout, IV crush, IV expansion)
- A specific narrative shift (sector rotation, peer print, regulatory change)

If you can't write a one-line trigger here, you don't have a trade yet — you have a watchlist add.

---

## 2. Thematic angle (the "why this exists" layer)

The picture that explains why the company benefits:
- What's the supply chain / sector tailwind?
- Where does this name sit in the value chain (substrate → device → module → system)?
- Who are its customers, and is *their* end demand inflecting?
- What's the analog from a prior cycle? (`$AXTI ↔ $SOI`, `$LITE ↔ $SIVE`, etc.)

This is the part that travels well on Twitter — diagrams, supply chain maps, peer comp tables.

---

## 3. Fundamentals (FA)

| Metric | Latest | YoY | 3y trend | Notes |
|---|---|---|---|---|
| Revenue | | | | |
| Gross margin | | | | |
| Operating margin | | | | |
| FCF | | | | |
| Net cash / debt | | | | |
| Customer concentration | | | | top-1, top-3 % |
| Backlog / RPO / design wins | | | | |
| Insider buying (90d) | | | | |

**Valuation:**
- EV/Sales (NTM): X.Xx vs peers (median Y.Yx)
- P/FCF, P/E if profitable
- Sum-of-the-parts if multi-segment
- One-line valuation thesis: *"trades at hardware multiple, deserves software multiple because…"*

**Quality flags:** stock-based comp %, dilution trend, customer mix risk, going-concern items.

---

## 4. Technicals (TA)

- **Trend:** weekly/daily structure, 50/200 SMA position
- **Key levels:** support / resistance / pivots — exact prices
- **Momentum:** RSI, MACD, ADX state
- **Volume:** accumulation/distribution, OBV, volume profile POC/VAH/VAL
- **Volatility:** IV rank, IV percentile, HV vs IV, term-structure shape
- **Pattern:** flag, base, cup, breakout retest, etc.
- **Trigger:** "long above $X on volume," "fade rip into $Y," etc.

Attach chart screenshot in `theses/charts/<ticker>-YYYY-MM-DD.png`.

---

## 5. Sentiment & flow (the soft layer)

- **Analyst consensus:** rating, PT, recent revisions (use `sentiment-scorer.ts` output)
- **Social pulse:** WSB rank, StockTwits bull/bear ratio, msg volume vs 30d avg
- **Options flow:** unusual activity, call/put ratio, large block trades, GEX/VEX positioning
- **Insider/13F:** recent buys, hedge fund moves
- **Short interest:** % float, days-to-cover, borrow rate
- **Crowding score:** is everyone already in? (anti-signal if yes)

**Read:** is sentiment leading price, lagging price, or contrarian to your thesis?

---

## 6. Catalysts (next 1–12 months)

| Date | Event | Expected impact | Position adjustment |
|---|---|---|---|
| | Earnings | | |
| | Conference / Analyst Day | | |
| | Customer/peer print | | |
| | Industry data (e.g. SEMI billings) | | |
| | Product launch / certification | | |

---

## 7. Risks & invalidation

Three buckets:
1. **Thesis-breaking:** what *fact* would make the thesis wrong (not just the price moving)?
2. **Execution risk:** management, capex, supply, geo
3. **Macro/sector:** what kills *every* name in the basket?

**Hard invalidation:**
- Price level: closes below $X on weekly → stop / cut
- Fundamental level: if metric Y prints below Z → exit regardless of price

If you hit invalidation, you exit. No "averaging down" past invalidation.

---

## 8. Execution plan

| Layer | Instrument | Entry | Target | Stop | Sizing |
|---|---|---|---|---|---|
| Core | Common | | | | |
| Leverage | LEAPS / spreads | strike, exp | | | |
| Hedge | Puts / collar | | | | |

**Scaling rules:** add at $X if Y, trim at $Z if W.

---

## 9. Twitter thread (publish-ready)

Numbered draft, one tweet per line, ≤280 chars each. First tweet = TL;DR. Last tweet = "DYOR / not advice / position disclosed."

```
1/ $XXXX —
2/ The setup:
3/ The thematic angle:
4/ Fundamentals:
5/ Technicals:
6/ Sentiment / flow:
7/ Catalysts:
8/ Risk:
9/ Disclosure:
```

---

## 10. Track log (append-only)

| Date | Spot | Action | Notes |
|---|---|---|---|
| YYYY-MM-DD | $X.XX | OPEN | initial entry |

This is the audit trail. Don't edit history, only append. A year from now, this is what proves you called the thing in real time.

---

## Notes

- All numbers should be sourced — paste link or filing reference next to anything quantitative.
- Anything you can't source yourself, mark `[VERIFY]`.
- A thesis with `[VERIFY]` markers left in it does not get posted.
