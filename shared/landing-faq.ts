import { SUPPORT_EMAIL } from './site';
/**
 * LANDING FAQ — one copy of the landing page's questions and answers.
 *
 * The landing (client/src/pages/landing-nexus.tsx) renders these, and the server
 * (server/seo-metadata.ts) emits the same text as FAQPage JSON-LD on `/`. Google
 * requires FAQ structured data to match the visible answers, so the two read
 * from here and cannot drift. Plain text only — the landing adds links on render
 * for items that carry an `id` it knows about.
 */
export interface LandingFaqItem {
  id?: 'cost' | 'invite';
  q: string;
  a: string;
}

export const LANDING_FAQ: LandingFaqItem[] = [
  { q: 'What is QuantEdge?',
    a: 'A trading research terminal for stocks, options and crypto. It shows dealer positioning (GEX), options flow and dark-pool prints, ranks setups on NEXUS — the trading desk — by the evidence behind them, and keeps the record: Quantinum Bot trades those ideas on paper, and your journal measures your own trades.' },
  { q: 'Where does the data come from, and is it delayed?',
    a: 'Equity quotes and trades come from brokerage and market-data APIs (Alpaca IEX trades, Tradier and Yahoo quotes), crypto from Coinbase’s live feed, options chains from Alpaca, Tradier or CBOE’s delayed feed, and flow from a third-party flow feed. Every tile shows its source and how old it is. When a feed is delayed (CBOE chains run about 15 minutes behind) or stale, the tile says so rather than showing it as live. The free plan uses 15-minute delayed quotes.' },
  { q: 'Is this investment advice?',
    a: 'No. QuantEdge is an educational and analytical tool. A setup is a hypothesis with its evidence and its record shown — not a recommendation to buy or sell. Your trades and your risk are yours. Options — especially same-day (0DTE) options — and crypto are high-risk: a position can lose its full value quickly, and they are not suitable for every investor.' },
  { q: 'How are ideas measured?',
    a: 'Every NEXUS idea is published with an entry, a stop and a target, then graded automatically when price reaches one of them or the idea expires. Outcomes go into a public record by conviction band. A win rate is only shown with its sample size, and not at all below 30 closed trades — small samples mislead.' },
  { q: 'What is the 0DTE desk?',
    a: 'A NEXUS view for the index session: SPX/SPY levels, the dealer map and same-day flow in one place, with the data’s age shown. It is context for same-day trading, not an exchange-speed execution feed.' },
  { q: 'Does crypto run 24/7?',
    a: 'Yes. BTC, ETH and the other majors stream from Coinbase around the clock, including weekends, and the crypto tab tracks the equity proxies that follow them.' },
  { q: 'Can I import my trades into the journal?',
    a: 'Yes. Upload a broker CSV — Webull, Robinhood, Schwab, Interactive Brokers, tastytrade, TD Ameritrade, Fidelity and E*TRADE are recognised, or it auto-detects — or connect Alpaca for a read-only fill import, or log trades by hand. Your journal is scored with the same metrics as Quantinum Bot’s book.' },
  { q: 'Does it work on a phone?',
    a: 'Yes. Every page is built for phone width — Today, NEXUS, FLOW and GEX sit in the bottom dock — and the live panels above swipe. There is no app to install; add the site to your home screen if you like.' },
  { id: 'invite', q: 'How do I get into the beta?',
    a: 'QuantEdge is an invite-only beta. If you have an invite code (it is in your invite email), create your account on the sign-up page. If your invite came by email, you can also continue with Google using that address. No code yet? Join the waitlist on the sign-up page.' },
  { id: 'cost', q: 'What does it cost, and how do I get access?',
    a: 'QuantEdge is an invite-only beta. There is a Free plan with delayed data and limits; Advanced unlocks full access, still on delayed data with its age shown on every tile. Licensed real-time data is the Pro plan, coming soon — see Pricing. Paid plans are not on sale yet, so nothing is charged during the beta; questions go to ' + SUPPORT_EMAIL + '.' },
];
