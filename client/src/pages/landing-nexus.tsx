/**
 * LANDING — a product story told with the real UI on real data.
 *
 *   hero      one headline, one line, two CTAs, the terminal on desktop (GEX)
 *             and phone (NEXUS) — captures with sample data, labelled so
 *   live      the product, live: Today · NEXUS (delayed 24h) · GEX · Crypto ·
 *             Catalysts · Quantinum Bot · Journal, rendered as real React UI
 *             from GET /api/public/showcase + the live price bus
 *             (components/landing/live-showcase.tsx). Nothing is interpolated.
 *   more      a compact strip for the modules the live panels don't show
 *   pricing   the plans (client/src/lib/plans.ts — formerly /pricing, which
 *             now redirects here as /?section=pricing)
 *   FAQ · CTA · footer
 *
 * Copy: docs/POSITIONING.md. Hero images: explicit width/height (no layout
 * shift), WebP, eager + fetchpriority=high.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import '@/styles/nexus.css';
import LiveShowcase from '@/components/landing/live-showcase';
import { PLANS, yearlySavingsPct, type Plan } from '@/lib/plans';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';

const ARROW = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
);
const CHECK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
);
const CROSS = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
);

const MORE: [string, string, string][] = [
  ['FLOW', '/t?tab=flow', 'Options flow + dark pool'],
  ['0DTE desk', '/t?nx=0dte', 'Same-day index context'],
  ['Chart', '/t?tab=chart', 'Levels drawn on the bars'],
  ['Quantinum', '/r/SPY', 'The read on any ticker'],
  ['LEAPS', '/t?tab=leaps', 'Long-dated calls, graded'],
  ['Positions', '/t?tab=positions', 'What you hold, marked'],
];

const FAQ: [string, React.ReactNode][] = [
  ['What is QuantEdge?',
    'A trading research terminal for stocks, options and crypto. It shows dealer positioning (GEX), options flow and dark-pool prints, ranks setups on NEXUS — the trading desk — by the evidence behind them, and keeps the record: Quantinum Bot trades those ideas on paper, and your journal measures your own trades.'],
  ['Where does the data come from, and is it delayed?',
    'Equity quotes and trades come from brokerage and market-data APIs (Alpaca IEX trades, Tradier and Yahoo quotes), crypto from Coinbase’s live feed, options chains from Alpaca, Tradier or CBOE’s delayed feed, and flow from a third-party flow feed. Every tile shows its source and how old it is. When a feed is delayed (CBOE chains run about 15 minutes behind) or stale, the tile says so rather than showing it as live. The free plan uses 15-minute delayed quotes.'],
  ['Is this investment advice?',
    'No. QuantEdge is an educational and analytical tool. A setup is a hypothesis with its evidence and its record shown — not a recommendation to buy or sell. Your trades and your risk are yours.'],
  ['How are ideas measured?',
    'Every NEXUS idea is published with an entry, a stop and a target, then graded automatically when price reaches one of them or the idea expires. Outcomes go into a public record by conviction band. A win rate is only shown with its sample size, and not at all below 30 closed trades — small samples mislead.'],
  ['What is the 0DTE desk?',
    'A NEXUS view for the index session: SPX/SPY levels, the dealer map and same-day flow in one place, with the data’s age shown. It is context for same-day trading, not an exchange-speed execution feed.'],
  ['Does crypto run 24/7?',
    'Yes. BTC, ETH and the other majors stream from Coinbase around the clock, including weekends, and the crypto tab tracks the equity proxies that follow them.'],
  ['Can I import my trades into the journal?',
    'Yes. Upload a broker CSV — Webull, Robinhood, Schwab, Interactive Brokers, tastytrade, TD Ameritrade, Fidelity and E*TRADE are recognised, or it auto-detects — or connect Alpaca for a read-only fill import, or log trades by hand. Your journal is scored with the same metrics as Quantinum Bot’s book.'],
  ['Does it work on a phone?',
    'Yes. Every page is built for phone width — Today, NEXUS, FLOW and GEX sit in the bottom dock — and the live panels above swipe. There is no app to install; add the site to your home screen if you like.'],
  ['What does it cost, and how do I get access?',
    <>QuantEdge is in early-access beta. There is a free plan with delayed data and limits, and Advanced unlocks real-time data and full access — see <a href="#pricing">Pricing</a>. Monthly plans can be cancelled anytime.</>],
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

function PlanCard({ plan, yearly, current, onUpgrade, busy }: { plan: Plan; yearly: boolean; current: boolean; onUpgrade: () => void; busy: boolean }) {
  const free = plan.monthlyPrice === 0;
  const price = free ? '$0' : `$${yearly ? plan.yearlyPrice : plan.monthlyPrice}`;
  const period = free ? '/mo' : yearly ? '/year' : '/mo';
  const save = yearly ? yearlySavingsPct(plan) : null;
  return (
    <article className={`lp-plan${plan.popular ? ' pop' : ''}${plan.comingSoon ? ' soon' : ''}`} aria-labelledby={`plan-${plan.id}`}>
      {plan.popular && <span className="lp-plan-flag">Most popular · beta</span>}
      {plan.comingSoon && <span className="lp-plan-flag soon">Coming soon</span>}
      <h3 className="lp-plan-name" id={`plan-${plan.id}`}>{plan.name}</h3>
      <p className="lp-plan-desc">{plan.description}</p>
      <p className="lp-plan-price"><b>{price}</b><span>{period}</span></p>
      <p className="lp-plan-save">{save ? `Save ${save}% vs monthly` : ' '}</p>
      <ul className="lp-plan-feats">
        {plan.features.map((f) => (
          <li key={f.name} className={f.included ? '' : 'no'}>
            <span className="ic">{f.included ? CHECK : CROSS}</span>
            <span>{f.name}{f.comingSoon && <em className="soon">Soon</em>}</span>
          </li>
        ))}
      </ul>
      <div className="lp-plan-cta">
        {current ? (
          <button type="button" className="btn btn-ghost btn-lg" disabled>Current plan</button>
        ) : free ? (
          <Link href="/signup" className="btn btn-ghost btn-lg">Start free</Link>
        ) : plan.comingSoon ? (
          <Link href="/join-beta" className="btn btn-ghost btn-lg">Join the waitlist</Link>
        ) : (
          <button type="button" className="btn btn-primary btn-lg" onClick={onUpgrade} disabled={busy}>
            {busy ? 'Opening checkout…' : `Upgrade to ${plan.name}`}
          </button>
        )}
      </div>
    </article>
  );
}

function Pricing() {
  const [yearly, setYearly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { user } = useAuth() as { user?: { subscriptionTier?: string } | null };
  const tier = user?.subscriptionTier ?? null;

  const upgrade = async (plan: Plan) => {
    setErr(null);
    if (!user) { setLocation('/signup'); return; }
    const env = import.meta.env as Record<string, string | undefined>;
    const priceId = plan.id === 'advanced'
      ? (yearly ? env.VITE_STRIPE_PRICE_ADVANCED_YEARLY : env.VITE_STRIPE_PRICE_ADVANCED_MONTHLY)
      : (yearly ? env.VITE_STRIPE_PRICE_PRO_YEARLY : env.VITE_STRIPE_PRICE_PRO_MONTHLY);
    if (!priceId) { setErr('This plan is not yet available for purchase.'); return; }
    setBusy(plan.id);
    try {
      const r = await apiRequest('POST', '/api/billing/checkout', { priceId });
      const j = await r.json();
      if (j?.url) { window.location.href = j.url; return; }
      setErr('Unable to start checkout. Please try again.');
    } catch (e: any) {
      setErr(e?.message || 'Unable to start checkout. Please try again.');
    }
    setBusy(null);
  };

  return (
    <section id="pricing" className="lp-pricing" aria-labelledby="lp-pricing-title">
      <div className="container">
        <div className="lp-head">
          <p className="lp-eyebrow">Pricing · early-access beta</p>
          <h2 className="lp-h2" id="lp-pricing-title">Start free. Upgrade when the data earns it.</h2>
          <p className="lp-lede">Beta pricing — these rates are locked in for early members. Some features are still in development and are marked “Soon”.</p>
        </div>
        <div className="lp-bill" role="group" aria-label="Billing period">
          <button type="button" aria-pressed={!yearly} className={!yearly ? 'on' : ''} onClick={() => setYearly(false)}>Monthly</button>
          <button type="button" aria-pressed={yearly} className={yearly ? 'on' : ''} onClick={() => setYearly(true)}>Yearly <span>save ~25%</span></button>
        </div>
        <div className="lp-plans">
          {PLANS.map((p) => (
            <PlanCard key={p.id} plan={p} yearly={yearly} current={tier === p.id} busy={busy === p.id} onUpgrade={() => upgrade(p)} />
          ))}
        </div>
        {err && <p className="lp-plan-err" role="alert">{err}</p>}
        <p className="lp-plan-fine">Educational research only — not financial advice. Past performance does not guarantee future results. Upgrade or downgrade at any time.</p>
      </div>
    </section>
  );
}

export default function LandingNexus() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const go = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); };

  // /pricing → /?section=pricing (legacy table + server 301) and /#pricing land on the section.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('section') === 'pricing' || window.location.hash === '#pricing') {
      requestAnimationFrame(() => document.getElementById('pricing')?.scrollIntoView());
    }
  }, []);

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
            <a className="lnav-link" href="#pricing" onClick={go('pricing')}>Pricing</a>
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
              <a href="#sec-product" className="btn btn-ghost btn-lg" onClick={go('sec-product')}>See it live</a>
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

      {/* LIVE PRODUCT */}
      <section id="sec-product" className="lp-tour lp-live" aria-labelledby="lp-tour-title">
        <div className="container">
          <div className="lp-head">
            <p className="lp-eyebrow">The product, live</p>
            <h2 className="lp-h2" id="lp-tour-title">This is the terminal, running on today’s market.</h2>
            <p className="lp-lede">Real quotes, SPY’s dealer levels, NEXUS ideas (delayed a day), crypto movers, the earnings calendar and Quantinum Bot’s paper record — each with its source and age.</p>
          </div>
          <LiveShowcase />
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

      <Pricing />

      {/* FAQ */}
      <section id="sec-faq" className="lp-faq" aria-labelledby="lp-faq-title">
        <div className="container">
          <div className="lp-head">
            <h2 className="lp-h2" id="lp-faq-title">Questions, answered plainly.</h2>
          </div>
          <div className="faq-list">
            {FAQ.map(([q, a], i) => (
              <div className={`faq-item${openFaq === i ? ' open' : ''}`} key={q}>
                <h3 className="faq-h">
                  <button type="button" className="faq-q" id={`faq-q-${i}`} aria-controls={`faq-a-${i}`} aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    {q}
                    <span className="icon" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg></span>
                  </button>
                </h3>
                <div className="faq-a" id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} hidden={openFaq !== i}>
                  <div className="faq-a-inner">{a}</div>
                </div>
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
              <a href="#pricing" className="btn btn-ghost btn-lg" onClick={go('pricing')}>See pricing</a>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lfooter">
        <div className="container">
          {/* Footer links: /about, /w, /academy and the legal pages had no door
              anywhere in the product (nav-architecture test N4, 2026-09-24). */}
          <nav className="lfooter-links" aria-label="Site">
            {[['/about', 'About'], ['/academy', 'Academy'], ['/blog', 'Blog'], ['/w', 'Public watchlist'], ['/privacy', 'Privacy'], ['/terms', 'Terms']].map(([href, label]) => (
              <Link key={href} href={href}>{label}</Link>
            ))}
            <a href="#pricing" onClick={go('pricing')}>Pricing</a>
          </nav>
          <p className="lfooter-def">QuantEdge is a trading research terminal for stocks, options and crypto — every number carries its evidence and its record.</p>
          <div className="lfooter-bottom">
            <div>© QuantEdge Labs · Founded by <Link href="/about#founder">Abdulmalik Ajisegiri</Link></div>
            <div className="disclaimer">Educational and analytical tool only. Not investment advice. Trading involves risk of loss. Hero screenshots show sample data; the live panels show real market data with its source and age. Every performance figure carries its sample size.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
