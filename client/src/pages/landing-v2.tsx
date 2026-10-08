/**
 * LANDING v2 (2026-10-07) — the signed-out `/`, rebuilt to a TerraTrade-grade
 * structure in QuantEdge's own brand (docs/TERRA_TRADE_STUDY_2026-10-07.md —
 * patterns only; no copy, assets or code of theirs).
 *
 *   announce   thin bar: the beta is open · Discord
 *   nav        logo · Product ▾ · Track record · Pricing · FAQ · ⌘K "Tour the terminal" · theme · Sign in · Join beta
 *   hero       status badge, one ≤6-word headline, 2-line subhead, 3 CTAs, a mono scope
 *              line, the ambient gamma-surface wireframe behind it
 *   stats      4 big mono numbers — verified / sourced / age-stamped counts only
 *   sources    "Data from" wordmark row (plain text — no third-party logos)
 *   desks      "Seven desks, one terminal." — one tab row + one large framed clip
 *              (client/public/videos/<desk>.mp4 when present, else an animated mockup)
 *   features   4 alternating sections; each visual is a live showcase panel —
 *              labelled SAMPLE data until the live read lands, never "—"
 *   record     "A record you can check" — 3 findings with n + dates, the live paper
 *              ledger and delayed ideas, where every number comes from
 *   pricing    Free during the beta; paid plans → waitlist while checkout is off
 *   FAQ · closing CTA · footer
 *
 * Paints without the boot splash (client/index.html + lib/boot.ts skip it on `/`
 * for visitors). Copy rules: docs/POSITIONING.md — no "AI-powered", no user counts,
 * no profit or win-rate claims beyond the verified record; educational, not advice.
 * Styles: styles/landing-v2.css (dark-first, light equally finished).
 */
import { SITE_DOMAIN, SUPPORT_EMAIL } from '@shared/site';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import '@/styles/nexus.css';
import '@/styles/landing-v2.css';
import { useShowcase } from '@/components/landing/live-showcase';
import { RealFrame, DESK_ROUTE, type RealDesk } from '@/components/landing/real-frame';
import DeskTour, { showDesk } from '@/components/landing/desk-tour';
import { StatStrip, Findings, DataSources, AmbientGrid, useScrollReveal } from '@/components/landing/landing-proof';
import { AnnouncementBar, LandingNav, CommandPalette, useCmdK } from '@/components/landing/landing-chrome';
import { CHECKOUT_LIVE, PLANS, PRICING_FINE_PRINT, annualSavingsPct, type PricingPlan } from '@shared/pricing';
import { LANDING_FAQ } from '@shared/landing-faq';
import { SEOHead } from '@/components/seo-head';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';
import { reasonOf } from '@/lib/optimistic';
import { DISCORD_INVITE_URL, DISCORD_SERVER_NAME } from '@/lib/public-config';
import { useTheme } from '@/components/theme-provider';
import { releaseLandingSkeleton } from '@/lib/boot';

const ARROW = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" /></svg>;
const CHECK = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>;
const DISCORD_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.6 9-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.8-3.6-13.7ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" /></svg>
);

/** Feeds that are actually wired (shared/landing-faq.ts "Where does the data come from") — plain-text wordmarks. */
const DATA_FROM = ['Alpaca', 'CBOE', 'Tradier', 'Yahoo Finance', 'Coinbase', 'Bullflow'];

const FEATURES: Array<{ id: string; eyebrow: string; title: string; body: string; checks: string[]; href: string; more: string; panel: RealDesk }> = [
  { id: 'feat-gex', eyebrow: 'See the positioning', title: 'Know where dealers are pinned.',
    body: 'Gamma and vanna by strike and expiry from the options chain, with the call wall, put wall and zero-γ marked — and how old the chain is.',
    checks: ['Walls and zero-γ, basis labelled (≤7d or all expiries)', 'Long- or short-gamma regime in one line', 'Raw and Δ-adjusted gamma side by side'],
    href: '/t?tab=gex', more: 'Explore GEX', panel: 'gex' },
  { id: 'feat-nexus', eyebrow: 'Rank the setup', title: 'Every setup, ranked by its evidence.',
    body: 'NEXUS publishes each idea with entry, stop and target stamped in ET before the move, then grades it on its own levels — and Today puts the market read and your ranked setups on one page.',
    checks: ['Evidence layers shown, not hidden', 'Graded automatically, whatever the outcome', 'Rule-set version stamped on every idea'],
    href: '/t', more: 'Explore NEXUS', panel: 'today' },
  { id: 'feat-age', eyebrow: 'Know the data’s age', title: 'Every number says how old it is.',
    body: 'Quotes, chains and flow carry their source and their age. Delayed data says delayed; nothing stale is shown as live — including on this page.',
    checks: ['Source and age on every tile', 'Delayed feeds labelled, never dressed as live', 'Crypto on a 24/7 live feed'],
    href: '/t?tab=flow', more: 'Explore Flow', panel: 'flow' },
  { id: 'feat-journal', eyebrow: 'Keep the record', title: 'Your book, measured honestly.',
    body: 'Import a broker CSV or log by hand. The journal scores your trades the way Quantinum Bot’s paper book is scored.',
    checks: ['Four numbers, one curve, then depth', 'Edge by setup and time of day', 'Ratios withheld until the sample can carry them'],
    href: '/t?tab=journal', more: 'Explore the Journal', panel: 'journal' },
];

// One copy of the FAQ text (shared/landing-faq.ts): the server emits the same
// answers as FAQPage JSON-LD on `/`, so the visible text and the schema match.
const FAQ: [string, React.ReactNode][] = LANDING_FAQ.map(({ id, q, a }) => [q,
  id === 'cost'
    ? <>QuantEdge is an invite-only beta. There is a Free plan with delayed data and limits; Advanced unlocks full access, still on delayed data with its age shown on every tile. Licensed real-time data is the Pro plan, coming soon — see <a href="#pricing">Pricing</a>. {CHECKOUT_LIVE ? <>Paid plans renew automatically each month or year until you cancel; cancel anytime by emailing <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</> : <>Paid plans are not on sale yet, so nothing is charged during the beta. Questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</>}</>
    : id === 'invite'
      ? <>{a.replace(/ Join the waitlist on the sign-up page\.$/, ' ')}<Link href="/signup">Join the waitlist on the sign-up page.</Link></>
      : a]);

const PRICE_WHISPER = [
  ...PLANS.map((p) => (p.monthly === 0 ? p.name : `${p.name} $${p.monthly}/mo${p.comingSoon ? ' (coming soon)' : ''}`)),
  ...(CHECKOUT_LIVE ? [] : ['paid plans not on sale during the beta']),
  'educational, not advice',
].join(' · ');

function fmtAgo(iso: string | null | undefined, now: number) {
  if (!iso) return 'waiting for the first read';
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function scrollTo(id: string) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/** The live paper ledger + the delayed ideas window, read from the same payload as the panels. */
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
    <div className="lv2-ledgers">
      <article>
        <p className="lv2-label">Quantinum Bot · paper ledger</p>
        {bot ? (
          <dl>
            <div><dt>Closed trades</dt><dd>{bot.closed}</dd></div>
            <div><dt>Win rate</dt><dd>{bot.winRate != null ? `${Math.round(bot.winRate * 100)}%` : `n<${bot.minSample}`}</dd></div>
            <div><dt>Open now</dt><dd>{bot.open}</dd></div>
          </dl>
        ) : <p className="lv2-wait">{loading ? 'Reading the ledger…' : 'The ledger didn’t load just now — it refreshes every 15 seconds.'}</p>}
        <p className="lv2-fine">{bot && bot.winRate == null ? `Win rate appears at n ≥ ${bot.minSample} closed trades (n = ${bot.closed}). ` : bot ? `n = ${bot.closed}. ` : ''}Paper only, before fees and slippage · ledger {fmtAgo(data?.bot.asOf, now)}</p>
        <button type="button" className="lv2-more" onClick={() => showDesk('bot')}>How the bot trades {ARROW}</button>
      </article>
      <article>
        <p className="lv2-label">NEXUS ideas · delayed 24h</p>
        {ideas.length ? (
          <dl>
            <div><dt>Shown</dt><dd>{ideas.length}</dd></div>
            <div><dt>Hit target</dt><dd>{hits}</dd></div>
            <div><dt>Hit stop</dt><dd className="loss">{stops}</dd></div>
          </dl>
        ) : <p className="lv2-wait">{loading ? 'Reading the ideas…' : data?.ideas.asOf ? 'No ideas old enough to show yet — they appear 24h after publishing.' : 'The delayed ideas didn’t load just now — they refresh every 15 seconds.'}</p>}
        <p className="lv2-fine">The three most recent ideas published at least 24h ago, whatever their outcome — a window, not a win rate · checked {fmtAgo(data?.ideas.asOf, now)}</p>
        <button type="button" className="lv2-more" onClick={() => scrollTo('feat-nexus')}>See each idea with its timestamp {ARROW}</button>
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
  const feats = plan.features.filter((f) => f.included);
  return (
    <article className={`lv2-plan${plan.highlighted ? ' pop' : ''}`} aria-labelledby={`plan-${plan.id}`}>
      <div className="lv2-plan-top">
        <h3 id={`plan-${plan.id}`}>{plan.name}</h3>
        {free ? <span className="lv2-chip">Beta members start here</span>
          : plan.comingSoon ? <span className="lv2-chip">Coming soon</span>
            : plan.highlighted ? <span className="lv2-chip accent">Recommended</span> : null}
      </div>
      <p className="lv2-plan-desc">{plan.blurb}</p>
      <p className="lv2-plan-price"><b>{price}</b><span>{period}</span></p>
      {/* No founder / lock-in promise while checkout is off and prices are proposed (platform audit #120). */}
      <p className="lv2-plan-note">{save ? `Save ${save}% vs monthly` : ''}{!free && !CHECKOUT_LIVE ? `${save ? ' · ' : ''}proposed price · not on sale yet` : free ? 'Delayed data, daily limits' : ''}</p>
      <ul>
        {feats.map((f) => <li key={f.label}>{CHECK}<span>{f.label}{f.soon ? ' · soon' : ''}</span></li>)}
      </ul>
      <div className="lv2-plan-cta">
        {current ? <button type="button" className="lv2-btn ghost lg" disabled>Current plan</button>
          : free ? <Link href="/signup" className="lv2-btn primary lg">Join the beta</Link>
            : plan.comingSoon || amount == null || !CHECKOUT_LIVE
              ? <Link href="/signup?waitlist=1" className="lv2-btn ghost lg">Join the waitlist</Link>
              : <button type="button" className="lv2-btn primary lg" onClick={onUpgrade} disabled={busy}>{busy ? 'Opening checkout…' : plan.cta.label}</button>}
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
    } catch (e) { setErr(`Couldn’t start checkout. ${reasonOf(e)}`); }
    setBusy(null);
  };
  return (
    <section id="pricing" className="lv2-sec" aria-labelledby="lv2-pricing-title">
      <div className="lv2-wrap">
        <header className="lv2-head center">
          <p className="lv2-eyebrow">Pricing</p>
          <h2 id="lv2-pricing-title">Free while it’s in beta.</h2>
          <p className="lv2-lede">{CHECKOUT_LIVE
            ? 'Upgrade when the data earns it. Features still in development say “soon”.'
            : 'Beta members start on Free. Paid plans aren’t on sale yet — the prices below are proposed, and the waitlist hears first when they open.'}</p>
        </header>
        <div className="lv2-bill" role="group" aria-label="Billing period">
          <button type="button" aria-pressed={!yearly} className={!yearly ? 'on' : ''} onClick={() => setYearly(false)}>Monthly</button>
          <button type="button" aria-pressed={yearly} className={yearly ? 'on' : ''} onClick={() => setYearly(true)}>Yearly</button>
        </div>
        <div className="lv2-plans">
          {PLANS.map((p) => <PlanCard key={p.id} plan={p} yearly={yearly} current={tier === p.id} busy={busy === p.id} onUpgrade={() => upgrade(p)} />)}
        </div>
        {err && <p className="lv2-err" role="alert">{err}</p>}
        <p className="lv2-fine center">{PRICING_FINE_PRINT}</p>
      </div>
    </section>
  );
}

export default function LandingV2() {
  const isLight = useTheme().theme === 'nexus-light';
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollReveal(rootRef);
  const cmdk = useCmdK();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  // This chunk resolves only after landing-v2.css has loaded (App.tsx importLanding),
  // so the first committed frame is styled: drop the index.html skeleton before paint.
  useLayoutEffect(() => { releaseLandingSkeleton(); }, []);

  // /pricing → /?section=pricing (legacy table + server 301) and /#pricing land on the section.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('section') === 'pricing' || window.location.hash === '#pricing') {
      requestAnimationFrame(() => document.getElementById('pricing')?.scrollIntoView());
    }
  }, []);

  return (
    <div className={`lv2 landing lp nexus-vars${isLight ? ' light' : ''}`} ref={rootRef}>
      <SEOHead pageKey="landing" />
      <a href="#main" className="lv2-skip">Skip to content</a>
      <AnnouncementBar />
      <LandingNav onTour={cmdk.show} />
      <CommandPalette open={cmdk.open} onClose={cmdk.close} />

      <main id="main">
        {/* HERO */}
        <section className="lv2-hero" aria-labelledby="lv2-h1">
          <AmbientGrid />
          <div className="lv2-wrap lv2-hero-in">
            <p className="lv2-badge"><span className="dot" aria-hidden="true" />Invite-only beta · now open</p>
            <h1 id="lv2-h1"><span className="lv2-lockup">QuantEdge —</span> More edge <span>to the traders.</span></h1>
            <p className="lv2-sub">Dealer positioning, options flow and evidence-ranked setups in one terminal — every number stamped with its source, its age and its record.</p>
            <div className="lv2-ctas">
              <Link href="/signup" className="lv2-btn primary xl">Join the beta {ARROW}</Link>
              {DISCORD_INVITE_URL && (
                <a href={DISCORD_INVITE_URL} className="lv2-btn ghost xl" target="_blank" rel="noopener noreferrer">
                  {DISCORD_ICON}Join Discord<span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
              <button type="button" className="lv2-btn text xl" onClick={cmdk.show}>Tour the terminal <kbd>⌘K</kbd></button>
            </div>
            <p className="lv2-scope">Stocks · Options · 0DTE · Crypto · Delayed data · Educational, not advice</p>
          </div>
          <div className="lv2-wrap">
            <figure className="lv2-device" aria-label="NEXUS, the QuantEdge trading desk — the real app on sample data">
              <div className="lp-frame-bar" aria-hidden="true"><span className="lp-dots"><i /><i /><i /></span><span className="lp-url">{SITE_DOMAIN}/t</span></div>
              <div className="lv2-device-stage"><RealFrame desk="nexus" eager /></div>
              <span className="dk-badge">Sample data</span>
            </figure>
          </div>
          <div className="lv2-wrap"><StatStrip /></div>
        </section>

        {/* DATA FROM */}
        <section className="lv2-from" aria-label="Where the data comes from">
          <div className="lv2-wrap">
            <p className="lv2-label">Market data from</p>
            <ul>{DATA_FROM.map((n) => <li key={n}>{n}</li>)}</ul>
            <p className="lv2-from-note">Plus a community on {DISCORD_SERVER_NAME}. Names are the feeds we read from — not endorsements.</p>
          </div>
        </section>

        {/* DESKS */}
        <section id="sec-desks" className="lv2-sec" aria-labelledby="lv2-desks-title">
          <div className="lv2-wrap">
            <header className="lv2-head center">
              <p className="lv2-eyebrow">Inside the terminal</p>
              <h2 id="lv2-desks-title">Seven desks, one terminal.</h2>
            </header>
            <DeskTour />
          </div>
        </section>

        {/* FEATURES — alternating; each visual is a live panel (sample until the live read lands) */}
        {FEATURES.map((f, i) => (
          <section key={f.id} id={f.id} className={`lv2-sec lv2-feat${i % 2 ? ' flip' : ''}`} aria-labelledby={`${f.id}-t`}>
            <div className="lv2-wrap lv2-feat-in">
              <div className="lv2-feat-copy">
                <p className="lv2-eyebrow">{f.eyebrow}</p>
                <h2 id={`${f.id}-t`}>{f.title}</h2>
                <p className="lv2-lede">{f.body}</p>
                <ul className="lv2-checks">{f.checks.map((c) => <li key={c}>{CHECK}<span>{c}</span></li>)}</ul>
                <Link href={f.href} className="lv2-more">{f.more} {ARROW}</Link>
              </div>
              <div className="lv2-feat-vis">
                <figure className="lv2-phone" aria-label={`${DESK_ROUTE[f.panel].label} on a phone — the real app on sample data`}>
                  <div className="lv2-phone-stage"><RealFrame desk={f.panel} viewport="phone" /></div>
                  <span className="dk-badge">Sample data</span>
                </figure>
              </div>
            </div>
          </section>
        ))}

        {/* TRACK RECORD */}
        <section id="sec-record" className="lv2-sec" aria-labelledby="lv2-record-title">
          <div className="lv2-wrap">
            <header className="lv2-head center">
              <p className="lv2-eyebrow">Track record</p>
              <h2 id="lv2-record-title">A record you can check.</h2>
              <p className="lv2-lede">We publish what we got wrong and what we changed because of it. Model results on paper, before fees and slippage — not trades anyone placed.</p>
            </header>
            <Findings />
            <RecordBand />
            <h3 className="lv2-subhead" id="sec-sources">Where every number comes from</h3>
            <DataSources />
          </div>
        </section>

        <Pricing />

        {/* FAQ */}
        <section id="sec-faq" className="lv2-sec" aria-labelledby="lv2-faq-title">
          <div className="lv2-wrap lv2-faq">
            <header className="lv2-head">
              <p className="lv2-eyebrow">FAQ</p>
              <h2 id="lv2-faq-title">Questions, answered plainly.</h2>
              <p className="lv2-lede">Still unsure? Ask in <a href={DISCORD_INVITE_URL ?? '/signup'} target={DISCORD_INVITE_URL ? '_blank' : undefined} rel="noopener noreferrer">the Discord</a> or email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
            </header>
            <div className="lv2-faq-list">
              {FAQ.map(([q, a], i) => (
                <div className={`lv2-faq-item${openFaq === i ? ' open' : ''}`} key={q}>
                  <h3>
                    <button type="button" id={`faq-q-${i}`} aria-controls={`faq-a-${i}`} aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                      <span>{q}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                    </button>
                  </h3>
                  <div className="lv2-faq-a" id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} hidden={openFaq !== i}>{a}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CLOSING CTA */}
        <section className="lv2-sec lv2-close" aria-labelledby="lv2-close-title">
          <div className="lv2-wrap">
            <div className="lv2-close-card">
              <h2 id="lv2-close-title">Trade the evidence, <span>not the headline.</span></h2>
              <p className="lv2-lede">One terminal for stocks, options and crypto. Invite-only while it’s in beta — have a code, or join the waitlist.</p>
              <div className="lv2-ctas">
                <Link href="/signup" className="lv2-btn primary xl">Join the beta {ARROW}</Link>
                {DISCORD_INVITE_URL && <a href={DISCORD_INVITE_URL} className="lv2-btn ghost xl" target="_blank" rel="noopener noreferrer">{DISCORD_ICON}Join Discord<span className="sr-only"> (opens in a new tab)</span></a>}
              </div>
              <p className="lv2-whisper">{PRICE_WHISPER}</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="lv2-foot">
        <div className="lv2-wrap">
          <div className="lv2-foot-top">
            <div>
              <Link href="/" className="lv2-brand" aria-label="QuantEdge home"><span className="brand-mark" aria-hidden="true" /><span className="lv2-brand-name">QuantEdge</span></Link>
              <p className="lv2-fine">A trading research terminal for stocks, options and crypto — every number carries its evidence and its record.</p>
            </div>
            <nav aria-label="Product"><p className="lv2-label">Product</p><a href="#sec-desks" onClick={(e) => { e.preventDefault(); scrollTo('sec-desks'); }}>Desks</a><a href="#sec-record" onClick={(e) => { e.preventDefault(); scrollTo('sec-record'); }}>Track record</a><a href="#pricing" onClick={(e) => { e.preventDefault(); scrollTo('pricing'); }}>Pricing</a><Link href="/w">Public watchlist</Link></nav>
            <nav aria-label="Learn"><p className="lv2-label">Learn</p><Link href="/how-to">How to use it</Link><Link href="/academy">Academy</Link><Link href="/blog">Blog</Link><Link href="/about">About</Link></nav>
            <nav aria-label="Legal"><p className="lv2-label">Legal</p><Link href="/terms">Terms of Service</Link><Link href="/privacy">Privacy Policy</Link><a href="#disclaimer">Risk disclaimer</a>{DISCORD_INVITE_URL && <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">Discord</a>}</nav>
          </div>
          <div className="lv2-foot-bot">
            <span>© QuantEdge Labs · Founded by <Link href="/about#founder">Abdulmalik Ajisegiri</Link></span>
            <p id="disclaimer">Educational and analytical tool only. Not investment advice. Trading involves risk of loss; options (including 0DTE) and crypto carry substantial risk and can lose their full value. Quantinum Bot results are paper (simulated) trades, and past performance does not guarantee future results. Some data is delayed (e.g. CBOE option chains ~15 min; free plan quotes 15 min). Anything marked Sample is illustrative; live panels show real market data with its source and age. Every performance figure carries its sample size.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
