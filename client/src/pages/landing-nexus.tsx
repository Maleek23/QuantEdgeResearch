/**
 * LANDING — what a first-time visitor expects, in the order they expect it
 * (home-page pass 2026-09-30, docs/HOME_AUDIT_2026-09-30.md):
 *
 *   hero       what it is + who it's for, Join the beta / See it live / Discord,
 *              and the product itself: the live panels (components/landing/
 *              live-showcase.tsx — real data from GET /api/public/showcase and
 *              the live price bus, every number with its source and age)
 *   features   what you get: NEXUS, FLOW, GEX, 0DTE desk, Journal, Quantinum Bot
 *   different  transparency as the differentiator: timestamps, public record,
 *              loss rules, MEASURING labels
 *   record     the public record band — the same live payload (bot n, win rate
 *              only at n ≥ minSample, delayed idea outcomes), stamped with its age
 *   pricing    shared/pricing.ts (/pricing redirects here as /?section=pricing)
 *   community  Discord — only when VITE_DISCORD_INVITE_URL is a real invite
 *   FAQ · CTA · footer (legal, disclaimer, founder)
 *
 * Copy: docs/POSITIONING.md (no "AI-powered", no user counts or testimonials,
 * a win rate always with its n). Phone first: 16px gutters, ≥ 44px targets.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import '@/styles/nexus.css';
import LiveShowcase, { useShowcase, showShowcaseTab } from '@/components/landing/live-showcase';
import { PLANS, annualSavingsPct, type PricingPlan } from '@shared/pricing';
import { LANDING_FAQ } from '@shared/landing-faq';
import { SEOHead } from '@/components/seo-head';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';
import { reasonOf } from '@/lib/optimistic';
import { DISCORD_INVITE_URL, DISCORD_SERVER_NAME } from '@/lib/public-config';

const ARROW = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
);
const CHECK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
);
const DISCORD_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.6 9-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.8-3.6-13.7ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" /></svg>
);

/** What you get — one block per module (names: docs/POSITIONING.md). */
const FEATURES: Array<{ tag: string; title: string; line: string; points: string[]; href: string; open: string }> = [
  { tag: 'NEXUS', title: 'The trading desk', line: 'Every setup ranked by the evidence behind it, with entry, stop and target printed.',
    points: ['Quantinum’s read on any ticker, layer by layer', 'Each idea graded automatically after it’s published'], href: '/t', open: 'Open NEXUS' },
  { tag: 'FLOW', title: 'Options flow', line: 'Prints, sweeps and blocks, top tickers and dark-pool levels.',
    points: ['Flow by strike and expiry', 'Source and age on every tile'], href: '/t?tab=flow', open: 'Open FLOW' },
  { tag: 'GEX', title: 'Dealer positioning', line: 'Where dealers are pinned: GEX and VEX by strike and expiry.',
    points: ['Call wall, put wall, zero-γ and the regime', 'Squeeze radar (measuring)'], href: '/t?tab=gex', open: 'Open GEX' },
  { tag: '0DTE', title: 'The index session desk', line: 'SPX/SPY levels, the dealer map and same-day flow in one view.',
    points: ['Data age shown on every number', 'Context, not an exchange-speed feed'], href: '/t?nx=0dte', open: 'Open the 0DTE desk' },
  { tag: 'JOURNAL', title: 'Your trading journal', line: 'Import your broker CSV or log trades by hand, then see what works.',
    points: ['Insights, loss analysis and playbooks', 'Scored the same way as Quantinum Bot'], href: '/t?tab=journal', open: 'Open Journal' },
  { tag: 'QUANTINUM BOT', title: 'The paper-trading bot', line: 'Trades NEXUS’s published ideas on paper, with real contract marks.',
    points: ['A public ledger of every simulated fill', 'No real money — paper only'], href: '/t?tab=bot', open: 'Open Quantinum Bot' },
];

/** How it's different — transparency is the product (each item is real behaviour, not a promise). */
const DIFFERENT: Array<[string, string]> = [
  ['Calls carry their timestamp', 'Every NEXUS idea is stamped with its publish time (ET), entry, stop and target before the move — you can check it against the tape.'],
  ['A public record, honest baseline', 'Ideas are graded on their own levels, not cherry-picked. Win rates travel with their sample size and stay hidden below 30 closed trades.'],
  ['Loss rules, written down', 'Rules added after studying our own losses — two independent signals to enter, a morning entry window, a target cap and a time stop — with the rule-set version stamped on every new idea and paper fill, so before and after can be compared.'],
  ['MEASURING means unproven', 'A new model ships with a MEASURING label until its forward record earns it. Delayed data says delayed; nothing stale is shown as live.'],
];

// One copy of the FAQ text (shared/landing-faq.ts): the server emits the same
// answers as FAQPage JSON-LD on `/`, so the visible text and the schema match.
const FAQ: [string, React.ReactNode][] = LANDING_FAQ.map(({ id, q, a }) => [q,
  id === 'cost'
    ? <>QuantEdge is in early-access beta. There is a free plan with delayed data and limits, and Advanced unlocks real-time data and full access — see <a href="#pricing">Pricing</a>. Paid plans renew automatically each month or year until you cancel, and you can cancel anytime by emailing <a href="mailto:support@quantedgelabs.net">support@quantedgelabs.net</a>.</>
    : id === 'invite'
      ? <>{a.replace(/ Join the waitlist on the sign-up page\.$/, ' ')}<Link href="/signup">Join the waitlist on the sign-up page.</Link></>
      : a]);

function DiscordButton({ className = 'btn btn-ghost btn-lg', label = 'Join Discord' }: { className?: string; label?: string }) {
  if (!DISCORD_INVITE_URL) return null;
  return (
    <a href={DISCORD_INVITE_URL} className={className} target="_blank" rel="noopener noreferrer">
      {DISCORD_ICON}{label}<span className="sr-only"> (opens Discord in a new tab)</span>
    </a>
  );
}

function fmtAgo(iso: string | null | undefined, now: number) {
  if (!iso) return 'no data yet';
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/** The public record, read live from the same payload as the panels. Nothing typed in. */
function RecordBand() {
  const { data, failed } = useShowcase(true);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(id); }, []);
  const bot = data?.bot.data ?? null;
  const ideas = data?.ideas.data ?? [];
  const graded = useMemo(() => ideas.filter((i) => i.outcome), [ideas]);
  const hits = graded.filter((i) => i.outcome === 'hit_target').length;
  const stops = graded.filter((i) => i.outcome === 'hit_stop').length;
  const loading = !data && !failed;
  return (
    <div className="lp-record-grid">
      <article className="lp-record-card">
        <p className="lp-record-k">Quantinum Bot · paper</p>
        {bot ? (
          <dl className="lp-record-stats">
            <div><dt>Closed trades</dt><dd>{bot.closed}</dd></div>
            <div><dt>Win rate</dt><dd>{bot.winRate != null ? `${Math.round(bot.winRate * 100)}% · n=${bot.closed}` : '—'}</dd></div>
            <div><dt>Open now</dt><dd>{bot.open}</dd></div>
          </dl>
        ) : <p className="lp-record-empty">{loading ? 'Loading the ledger…' : 'The bot ledger is unavailable right now.'}</p>}
        {bot && bot.winRate == null && <p className="lp-record-fine">Win rate appears at n ≥ {bot.minSample} closed trades (n = {bot.closed}) — smaller samples mislead.</p>}
        <p className="lp-record-age">Ledger · {fmtAgo(data?.bot.asOf, now)}</p>
        <button type="button" className="lp-link" onClick={() => showShowcaseTab('bot')}>See the paper record {ARROW}</button>
      </article>
      <article className="lp-record-card">
        <p className="lp-record-k">NEXUS ideas · delayed 24h</p>
        {ideas.length ? (
          <dl className="lp-record-stats">
            <div><dt>Shown</dt><dd>{ideas.length}</dd></div>
            <div><dt>Hit target</dt><dd className="up">{hits}</dd></div>
            <div><dt>Hit stop</dt><dd className="down">{stops}</dd></div>
          </dl>
        ) : <p className="lp-record-empty">{loading ? 'Loading ideas…' : 'No delayed ideas to show yet.'}</p>}
        {ideas.length > 0 && <p className="lp-record-fine">The most recent delayed ideas only — a window, not a win rate. The rest are still open, expired or closed flat.</p>}
        <p className="lp-record-age">Checked · {fmtAgo(data?.ideas.asOf, now)}</p>
        <button type="button" className="lp-link" onClick={() => showShowcaseTab('nexus')}>See each idea with its timestamp {ARROW}</button>
      </article>
    </div>
  );
}

function PlanCard({ plan, yearly, current, onUpgrade, busy }: { plan: PricingPlan; yearly: boolean; current: boolean; onUpgrade: () => void; busy: boolean }) {
  const free = plan.monthly === 0;
  const amount = yearly ? plan.annual : plan.monthly;
  const price = amount == null ? 'Price TBA' : `$${amount}`;
  const period = amount == null ? '' : free ? '/mo' : yearly ? '/year' : '/mo';
  const save = yearly ? annualSavingsPct(plan) : null;
  return (
    <article className={`lp-plan${plan.highlighted ? ' pop' : ''}${plan.comingSoon ? ' soon' : ''}`} aria-labelledby={`plan-${plan.id}`}>
      {plan.highlighted && <span className="lp-plan-flag">Most popular · beta</span>}
      {plan.comingSoon && <span className="lp-plan-flag soon">Coming soon</span>}
      <h3 className="lp-plan-name" id={`plan-${plan.id}`}>{plan.name}</h3>
      <p className="lp-plan-desc">{plan.blurb}</p>
      <p className="lp-plan-price"><b>{price}</b><span>{period}</span></p>
      <p className="lp-plan-save">{save ? `Save ${save}% vs monthly` : ' '}</p>
      <ul className="lp-plan-feats">
        {plan.features.map((f) => (
          <li key={f}><span className="ic">{CHECK}</span><span>{f}</span></li>
        ))}
      </ul>
      <div className="lp-plan-cta">
        {current ? (
          <button type="button" className="btn btn-ghost btn-lg" disabled>Current plan</button>
        ) : free ? (
          <Link href="/signup" className="btn btn-ghost btn-lg">{plan.cta}</Link>
        ) : plan.comingSoon || amount == null ? (
          <Link href="/signup?waitlist=1" className="btn btn-ghost btn-lg">{plan.comingSoon ? plan.cta : 'Join the waitlist'}</Link>
        ) : (
          <button type="button" className="btn btn-primary btn-lg" onClick={onUpgrade} disabled={busy}>
            {busy ? 'Opening checkout…' : plan.cta}
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

  const upgrade = async (plan: PricingPlan) => {
    setErr(null);
    if (!user) { setLocation('/signup'); return; }
    const env = import.meta.env as Record<string, string | undefined>;
    const priceId = plan.id === 'advanced'
      ? (yearly ? env.VITE_STRIPE_PRICE_ADVANCED_YEARLY : env.VITE_STRIPE_PRICE_ADVANCED_MONTHLY)
      : (yearly ? env.VITE_STRIPE_PRICE_PRO_YEARLY : env.VITE_STRIPE_PRICE_PRO_MONTHLY);
    if (!priceId) { setErr('This plan isn’t available to buy yet. Join the waitlist and we’ll let you know.'); return; }
    setBusy(plan.id);
    try {
      const r = await apiRequest('POST', '/api/billing/checkout', { priceId });
      const j = await r.json();
      if (j?.url) { window.location.href = j.url; return; }
      setErr('Couldn’t start checkout. Try again in a minute.');
    } catch (e) {
      setErr(`Couldn’t start checkout. ${reasonOf(e)}`);
    }
    setBusy(null);
  };

  return (
    <section id="pricing" className="lp-pricing lp-sec" aria-labelledby="lp-pricing-title">
      <div className="container">
        <div className="lp-head">
          <p className="lp-eyebrow">Pricing · early-access beta</p>
          <h2 className="lp-h2" id="lp-pricing-title">Start free. Upgrade when the data earns it.</h2>
          <p className="lp-lede">Beta pricing is locked in for early members. Features still in development say “soon”.</p>
        </div>
        <div className="lp-bill" role="group" aria-label="Billing period">
          <button type="button" aria-pressed={!yearly} className={!yearly ? 'on' : ''} onClick={() => setYearly(false)}>Monthly</button>
          <button type="button" aria-pressed={yearly} className={yearly ? 'on' : ''} onClick={() => setYearly(true)}>Yearly</button>
        </div>
        <div className="lp-plans">
          {PLANS.map((p) => (
            <PlanCard key={p.id} plan={p} yearly={yearly} current={tier === p.id} busy={busy === p.id} onUpgrade={() => upgrade(p)} />
          ))}
        </div>
        {err && <p className="lp-plan-err" role="alert">{err}</p>}
        <p className="lp-plan-fine">Paid plans renew automatically at the listed price each month or year until cancelled; cancel anytime by emailing support@quantedgelabs.net. Educational research only — not investment advice. Past performance does not guarantee future results.</p>
      </div>
    </section>
  );
}

export default function LandingNexus() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  };

  // /pricing → /?section=pricing (legacy table + server 301) and /#pricing land on the section.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('section') === 'pricing' || window.location.hash === '#pricing') {
      requestAnimationFrame(() => document.getElementById('pricing')?.scrollIntoView());
    }
  }, []);

  return (
    <div className="landing nexus-vars lp">
      <SEOHead pageKey="landing" />
      <a href="#main" className="lp-skip">Skip to content</a>
      {/* NAV */}
      <nav className="lnav" aria-label="Main">
        <div className="lnav-inner">
          <Link href="/" className="brand" aria-label="QuantEdge home">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">QUANTEDGE</span>
          </Link>
          <div className="lnav-links">
            <a className="lnav-link" href="#sec-product" onClick={go('sec-product')}>Product</a>
            <a className="lnav-link" href="#sec-record" onClick={go('sec-record')}>Track record</a>
            <a className="lnav-link" href="#pricing" onClick={go('pricing')}>Pricing</a>
            <a className="lnav-link" href="#sec-faq" onClick={go('sec-faq')}>FAQ</a>
          </div>
          <div className="lnav-spacer" />
          <Link href="/login" className="btn btn-ghost">Sign in</Link>
          <Link href="/signup" className="btn btn-primary">Join beta</Link>
        </div>
      </nav>

      <main id="main">
        {/* HERO — what it is, who it's for, the two actions, then the product itself */}
        <header className="lp-hero" id="sec-product">
          <div className="container">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow">See the positioning · Rank the setup · Prove the record</p>
              <h1 className="lp-h1">The trading research terminal for <span className="grad">stocks, options and crypto</span></h1>
              <p className="lp-sub">For self-directed traders who want dealer positioning, options flow and ranked setups in one place — every number with its source, its age and its record.</p>
              <div className="lp-ctas">
                <Link href="/signup" className="btn btn-primary btn-lg">Join the beta {ARROW}</Link>
                <a href="#sec-live" className="btn btn-ghost btn-lg" onClick={go('sec-live')}>See it live</a>
                <DiscordButton />
              </div>
              <p className="lp-hero-note">Invite-only beta · free plan on delayed data · not investment advice</p>
            </div>
            <div className="lp-hero-live" id="sec-live">
              <p className="lp-live-cap"><span className="sc-live-dot" aria-hidden="true" /> Live from today’s market — real data, each number with its source and age</p>
              <LiveShowcase />
            </div>
          </div>
        </header>

        {/* WHAT YOU GET */}
        <section id="sec-features" className="lp-sec" aria-labelledby="lp-features-title">
          <div className="container">
            <div className="lp-head">
              <p className="lp-eyebrow">What you get</p>
              <h2 className="lp-h2" id="lp-features-title">One terminal, six desks.</h2>
            </div>
            <div className="lp-feats">
              {FEATURES.map((f) => (
                <article key={f.tag} className="lp-feat">
                  <p className="lp-feat-tag">{f.tag}</p>
                  <h3 className="lp-feat-title">{f.title}</h3>
                  <p className="lp-feat-line">{f.line}</p>
                  <ul className="lp-feat-points">{f.points.map((p) => <li key={p}>{p}</li>)}</ul>
                  <Link href={f.href} className="lp-link">{f.open} {ARROW}</Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT'S DIFFERENT */}
        <section id="sec-different" className="lp-sec" aria-labelledby="lp-diff-title">
          <div className="container">
            <div className="lp-head">
              <p className="lp-eyebrow">How it’s different</p>
              <h2 className="lp-h2" id="lp-diff-title">It shows its work — including the misses.</h2>
              <p className="lp-lede">Most trading tools promise certainty. QuantEdge measures itself in public and tells you what it doesn’t know yet.</p>
            </div>
            <div className="lp-diff">
              {DIFFERENT.map(([t, d]) => (
                <article key={t} className="lp-diff-item">
                  <h3>{t}</h3>
                  <p>{d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* TRACK RECORD */}
        <section id="sec-record" className="lp-sec" aria-labelledby="lp-record-title">
          <div className="container">
            <div className="lp-head">
              <p className="lp-eyebrow">Track record</p>
              <h2 className="lp-h2" id="lp-record-title">The record, as it stands right now.</h2>
              <p className="lp-lede">Read live from the same ledger members see. Model results on paper, before fees and slippage — not trades anyone placed.</p>
            </div>
            <RecordBand />
            <p className="lp-record-more">Members see the full record by conviction band in the <Link href="/t?tab=journal">Journal · Track record</Link>.</p>
          </div>
        </section>

        <Pricing />

        {/* COMMUNITY — only with a real invite link */}
        {DISCORD_INVITE_URL && (
          <section id="sec-community" className="lp-sec" aria-labelledby="lp-community-title">
            <div className="container">
              <div className="lp-community">
                <div>
                  <p className="lp-eyebrow">Community</p>
                  <h2 className="lp-h2" id="lp-community-title">Join {DISCORD_SERVER_NAME} on Discord</h2>
                  <p className="lp-lede">Talk through the day’s setups with other members, ask how a number is computed, and hear about changes first. Free to join.</p>
                </div>
                <DiscordButton className="btn btn-primary btn-lg" label="Join the community" />
              </div>
            </div>
          </section>
        )}

        {/* FAQ */}
        <section id="sec-faq" className="lp-faq lp-sec" aria-labelledby="lp-faq-title">
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
                <Link href="/signup" className="btn btn-primary btn-lg">Join the beta {ARROW}</Link>
                <DiscordButton label="Join the community" />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="lfooter">
        <div className="container">
          <nav className="lfooter-links" aria-label="Site">
            {[['/about', 'About'], ['/academy', 'Academy'], ['/blog', 'Blog'], ['/w', 'Public watchlist']].map(([href, label]) => (
              <Link key={href} href={href}>{label}</Link>
            ))}
            <a href="#pricing" onClick={go('pricing')}>Pricing</a>
            {DISCORD_INVITE_URL && <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">Discord</a>}
          </nav>
          <nav className="lfooter-links lfooter-legal" aria-label="Legal">
            <Link href="/terms">Terms of Service</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <a href="#disclaimer">Risk disclaimer</a>
          </nav>
          <p className="lfooter-def">QuantEdge is a trading research terminal for stocks, options and crypto — every number carries its evidence and its record.</p>
          <div className="lfooter-bottom">
            <div>© QuantEdge Labs · Founded by <Link href="/about#founder">Abdulmalik Ajisegiri</Link></div>
            <p className="disclaimer" id="disclaimer">Educational and analytical tool only. Not investment advice. Trading involves risk of loss; options (including 0DTE) and crypto carry substantial risk and can lose their full value. Quantinum Bot results are paper (simulated) trades, and past performance does not guarantee future results. Some data is delayed (e.g. CBOE option chains ~15 min; free plan quotes 15 min). The live panels show real market data with its source and age. Every performance figure carries its sample size.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
