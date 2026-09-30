/**
 * LANDING — a product story told with the real UI.
 *
 *   hero      one headline, one line, two CTAs, the terminal on desktop (GEX)
 *             and phone (NEXUS)
 *   tour      one row per module, each a real capture of the built app
 *   more      a compact strip for the modules the tour doesn't show
 *   FAQ · CTA · footer
 *
 * Every image is a capture of the built app rendered by the device-audit
 * harness with illustrative sample data (research/device-audit.ts). Nothing in
 * them is market data and each frame says "Sample data". There is no live
 * widget on this page: an empty live number ("—/100", "0 in play") reads as
 * broken to a signed-out visitor, so none is shown.
 *
 * Copy: docs/POSITIONING.md. Images: explicit width/height (no layout shift),
 * WebP, hero eager + fetchpriority=high, everything else lazy.
 */
import { useState } from 'react';
import { Link } from 'wouter';
import '@/styles/nexus.css';

const ARROW = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
);

type TourRow = { id: string; eyebrow: string; title: string; body: string; href: string; cta: string; src: string; w: number; h: number; alt: string; url: string };

const TOUR: TourRow[] = [
  {
    id: 'gex', eyebrow: 'GEX · dealer positioning', title: 'See where dealers are pinned.',
    body: 'Gamma and vanna by strike and expiry — call and put walls, zero-γ and the king nodes — with every tile showing its source and its age.',
    href: '/t?tab=gex', cta: 'Open GEX', src: '/screenshots/qe-gex-matrix.webp', w: 1600, h: 999, url: 'quantedgelabs.net/t?tab=gex',
    alt: 'The GEX strike-by-expiry matrix: gamma exposure per strike and expiry with the call wall, max-gamma strike and spot marked, shown with sample data.',
  },
  {
    id: 'flow', eyebrow: 'FLOW · options + dark pool', title: 'Follow where the money is going.',
    body: 'Sweeps, blocks and unusual prints with premium, size and vol/OI, plus dark-pool levels — each print tagged with the feed it came from.',
    href: '/t?tab=flow', cta: 'Open Flow', src: '/screenshots/qe-flow.webp', w: 1600, h: 1000, url: 'quantedgelabs.net/t?tab=flow',
    alt: 'The options flow tape: premium tide of calls versus puts, sweep share, put/call ratio and a sortable list of prints, shown with sample data.',
  },
  {
    id: 'nexus', eyebrow: 'NEXUS · the trading desk', title: 'Every setup ranked by its evidence.',
    body: 'Ranked setups with entry, stop and target printed and an audit trail behind each one — plus the 0DTE desk for the index session.',
    href: '/t', cta: 'Open NEXUS', src: '/screenshots/qe-nexus.webp', w: 1600, h: 1000, url: 'quantedgelabs.net/t',
    alt: 'NEXUS, the trading desk: a ranked list of setups by confidence, the selected setup with its chart, invalidation and first target, and market context, shown with sample data.',
  },
  {
    id: 'quantinum', eyebrow: 'Quantinum · the read on any ticker', title: 'One page per ticker, every engine weighed.',
    body: 'Quantinum weighs every engine’s evidence for a ticker and shows each layer’s argument for or against — beside the week’s dealer map.',
    href: '/r/SPY', cta: 'Open a ticker', src: '/screenshots/qe-quantinum.webp', w: 1600, h: 1000, url: 'quantedgelabs.net/r/SPY',
    alt: 'The SPY ticker page: key stats, this week’s dealer map with call wall, put wall, zero-gamma and regime, and a chart with the levels drawn, shown with sample data.',
  },
  {
    id: 'chart', eyebrow: 'Chart · levels on the bars', title: 'A real chart, with the positioning drawn on it.',
    body: 'Multi-timeframe candles with walls, zero-γ and published levels on the price, drawing tools, indicators and bar replay.',
    href: '/t?tab=chart', cta: 'Open the chart', src: '/screenshots/qe-chart.webp', w: 1600, h: 1000, url: 'quantedgelabs.net/t?tab=chart',
    alt: 'The chart workspace: five-minute candles with the zero-gamma level drawn, a drawing-tools rail and the wall levels in the legend, shown with sample data.',
  },
  {
    id: 'record', eyebrow: 'Quantinum Bot + Journal · the record', title: 'Prove it — with the sample size attached.',
    body: 'Quantinum Bot trades NEXUS’s ideas on paper with a public ledger. Your journal measures your own trades the same way.',
    href: '/t?tab=journal', cta: 'Open the journal', src: '/screenshots/qe-journal.webp', w: 1600, h: 1000, url: 'quantedgelabs.net/t?tab=journal',
    alt: 'The journal dashboard: net P&L, win rate with its sample size, profit factor, expectancy, drawdown and a cumulative P&L curve, shown with sample data.',
  },
];

const MORE: [string, string, string][] = [
  ['Today', '/today', 'The morning page'],
  ['0DTE desk', '/t?nx=0dte', 'Same-day index context'],
  ['LEAPS', '/t?tab=leaps', 'Long-dated calls, graded'],
  ['Crypto', '/t?tab=crypto', 'BTC and ETH reads'],
  ['Catalysts', '/t?tab=catalyst', 'Earnings, macro, news'],
  ['Positions', '/t?tab=positions', 'What you hold, marked'],
];

const FAQ: [string, string][] = [
  ['What is QuantEdge?', 'A trading research terminal for stocks, options and crypto: dealer positioning, options flow, NEXUS — the trading desk of evidence-ranked setups — charts, Quantinum Bot on paper and your trading journal.'],
  ['Is this investment advice?', 'No. QuantEdge is an educational and analytical tool. Every setup is a hypothesis ranked by evidence, not a recommendation. Your trades and your risk are yours.'],
  ['Where does the data come from?', 'Live equity, futures and crypto quotes, real bars for every chart and options chains from several sources. Every tile shows its source and its age — delayed data says delayed, and anything unmeasured says so instead of showing a made-up number.'],
  ['Does Quantinum Bot trade my money?', 'No. Quantinum Bot trades NEXUS’s published ideas on paper, with real contract marks, so the record is earned in public. No broker custody, no client funds.'],
  ['Can I cancel anytime?', 'Yes. Monthly plans cancel anytime; annual plans are refundable pro-rata in the first 30 days.'],
];

function Frame({ src, w, h, alt, url, eager }: { src: string; w: number; h: number; alt: string; url: string; eager?: boolean }) {
  return (
    <figure className="lp-frame">
      <div className="lp-frame-bar" aria-hidden="true">
        <span className="lp-dots"><i /><i /><i /></span>
        <span className="lp-url">{url}</span>
      </div>
      <img
        src={src}
        width={w}
        height={h}
        alt={alt}
        decoding="async"
        loading={eager ? 'eager' : 'lazy'}
        {...(eager ? { fetchpriority: 'high' } : {})}
      />
      <span className="lp-tag">Sample data</span>
    </figure>
  );
}

export default function LandingNexus() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const go = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); };

  return (
    <div className="landing nexus-vars lp">
      {/* NAV */}
      <nav className="lnav">
        <div className="lnav-inner">
          <div className="brand">
            <div className="brand-mark" />
            <span className="brand-name">QUANTEDGE</span>
          </div>
          <div className="lnav-links">
            <a className="lnav-link" href="#sec-product" onClick={go('sec-product')}>Product</a>
            <Link className="lnav-link" href="/pricing">Pricing</Link>
            <a className="lnav-link" href="#sec-faq" onClick={go('sec-faq')}>FAQ</a>
          </div>
          <div className="lnav-spacer" />
          <Link href="/login" className="btn btn-ghost">Sign in</Link>
          <Link href="/t" className="btn btn-primary">Get access</Link>
        </div>
      </nav>

      {/* HERO */}
      <header className="lp-hero">
        <div className="container">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">Trading research terminal</p>
            <h1 className="lp-h1"><span>See the positioning.</span> <span className="grad">Rank the setup.</span> <span className="accent">Prove the record.</span></h1>
            <p className="lp-sub">Dealer positioning, options flow and evidence-ranked setups on one terminal — every number with its source, age and record.</p>
            <div className="lp-ctas">
              <Link href="/t" className="btn btn-primary btn-lg">Open the terminal {ARROW}</Link>
              <a href="#sec-product" className="btn btn-ghost btn-lg" onClick={go('sec-product')}>See the product</a>
            </div>
          </div>
          <div className="lp-hero-stage">
            <Frame
              eager
              src="/screenshots/qe-gex.webp" w={1600} h={1000} url="quantedgelabs.net/t?tab=gex"
              alt="The QuantEdge GEX workspace on a desktop: a strike-by-expiry gamma matrix, key levels with call wall, put wall and zero-gamma, and the dealer regime, shown with sample data."
            />
            <figure className="lp-phone">
              <img
                src="/screenshots/qe-nexus-phone.webp" width={600} height={1301} decoding="async" loading="eager"
                alt="NEXUS, the QuantEdge trading desk, on a phone: setups ranked by confidence, shown with sample data."
              />
            </figure>
          </div>
        </div>
      </header>

      {/* TOUR */}
      <section id="sec-product" className="lp-tour" aria-labelledby="lp-tour-title">
        <div className="container">
          <div className="lp-head">
            <p className="lp-eyebrow">The product</p>
            <h2 className="lp-h2" id="lp-tour-title">This is the terminal, not a render of one.</h2>
          </div>
          {TOUR.map((r, i) => (
            <article key={r.id} className={`lp-row${i % 2 ? ' flip' : ''}`} id={`tour-${r.id}`}>
              <div className="lp-row-copy">
                <p className="lp-kicker">{r.eyebrow}</p>
                <h3 className="lp-h3">{r.title}</h3>
                <p className="lp-body">{r.body}</p>
                <Link href={r.href} className="lp-link">{r.cta} {ARROW}</Link>
              </div>
              <div className="lp-row-media">
                <Frame src={r.src} w={r.w} h={r.h} alt={r.alt} url={r.url} />
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* MORE */}
      <section className="lp-more" aria-labelledby="lp-more-title">
        <div className="container">
          <h2 className="lp-more-title" id="lp-more-title">Also on the terminal</h2>
          <div className="lp-chips">
            {MORE.map(([name, href, line]) => (
              <Link key={name} href={href} className="lp-chip"><b>{name}</b><span>{line}</span></Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="sec-faq" className="lp-faq">
        <div className="container">
          <div className="lp-head">
            <h2 className="lp-h2">Questions, answered plainly.</h2>
          </div>
          <div className="faq-list">
            {FAQ.map(([q, a], i) => (
              <div className={`faq-item${openFaq === i ? ' open' : ''}`} key={q}>
                <button type="button" className="faq-q" aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  {q}
                  <span className="icon" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg></span>
                </button>
                <div className="faq-a"><div className="faq-a-inner">{a}</div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="lp-cta">
        <div className="container">
          <div className="cta-box">
            <h2 className="cta-title">Trade the evidence, <span className="grad">not the headline.</span></h2>
            <p className="cta-sub">Read the positioning, rank the setup on NEXUS and keep the record — on one terminal.</p>
            <div className="cta-actions">
              <Link href="/t" className="btn btn-primary btn-lg">Open the terminal {ARROW}</Link>
              <Link href="/pricing" className="btn btn-ghost btn-lg">See pricing</Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lfooter">
        <div className="container">
          {/* Footer links: /about, /w, /academy, /pricing and the legal pages had
              no door anywhere in the product (nav-architecture test N4, 2026-09-24). */}
          <nav className="lfooter-links" aria-label="Site">
            {[['/about', 'About'], ['/pricing', 'Pricing'], ['/academy', 'Academy'], ['/blog', 'Blog'], ['/w', 'Public watchlist'], ['/privacy', 'Privacy'], ['/terms', 'Terms']].map(([href, label]) => (
              <Link key={href} href={href}>{label}</Link>
            ))}
          </nav>
          <p className="lfooter-def">QuantEdge is a trading research terminal for stocks, options and crypto — every number carries its evidence and its record.</p>
          <div className="lfooter-bottom">
            <div>© 2026 QuantEdge Labs · All rights reserved.</div>
            <div className="disclaimer">Educational and analytical tool only. Not investment advice. Trading involves risk of loss. Screenshots show sample data. Every performance figure carries its sample size.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
