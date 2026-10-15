/**
 * PRODUCT PAGES — /product (index) and /product/:slug (one module).
 *
 * One template, one section order on every page (content: shared/product/catalog.ts):
 *   hero + real product shot in a window frame → the problem → how it works →
 *   capability cards → grouped feature list → how it has performed → pairs with →
 *   docs link → FAQ → CTA (beta + Discord) + disclaimer.
 *
 * The product shot is the REAL app (RealFrame: the actual route on the dev-harness
 * sample fixtures, or a real capture) — never a recreation. "How it has performed"
 * shows only verified figures from /api/public/showcase with n, source and age;
 * modules without a public record link to Ledger. No number is hardcoded here.
 *
 * Styles: styles/landing-v2.css + styles/product-pages.css.
 */
import { useEffect, useLayoutEffect, useState } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowRight, ArrowUpRight, BookOpen, Check } from 'lucide-react';
import '@/styles/nexus.css';
import '@/styles/landing-v2.css';
import '@/styles/product-pages.css';
import { SITE_DOMAIN } from '@shared/site';
import { PRODUCTS, PRODUCT_DISCORD_URL, PRODUCT_INDEX_META, productBySlug, productPath } from '@shared/product/catalog';
import type { Product } from '@shared/product/types';
import { DISCLAIMER_TEXT } from '@shared/docs/types';
import { LandingNav } from '@/components/landing/landing-chrome';
import { PublicFooter, ProductIcon } from '@/components/landing/public-nav';
import { RealFrame, DESK_ROUTE, type RealDesk } from '@/components/landing/real-frame';
import { useShowcase } from '@/components/landing/live-showcase';
import { useTheme } from '@/components/theme-provider';
import { releaseLandingSkeleton } from '@/lib/boot';
import { SEOHead } from '@/components/seo-head';
import NotFound from '@/pages/not-found';

const SHOT_DESK: Record<Product['shot'], RealDesk> = {
  nexus: 'nexus', zerodte: 'zerodte', flow: 'flow', gex: 'gex', chart: 'chart', leaps: 'leaps', ask: 'ask', bot: 'bot', journal: 'journal', alerts: 'alerts',
};

const DISCORD_ICON = <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18 18 0 0 0-5.6 0L8.6 3a19.6 19.6 0 0 0-4.9 1.4C.6 9 0 13.6.3 18.1a19.8 19.8 0 0 0 6 3l1.3-2a12.7 12.7 0 0 1-2-1l.5-.4a14 14 0 0 0 11.8 0l.5.4-2 1 1.3 2a19.7 19.7 0 0 0 6-3c.4-5.2-.8-9.7-3.4-13.7ZM8.7 15.3c-1.2 0-2.1-1-2.1-2.3s.9-2.3 2.1-2.3 2.2 1 2.1 2.3c0 1.3-.9 2.3-2.1 2.3Zm6.6 0c-1.2 0-2.1-1-2.1-2.3s.9-2.3 2.1-2.3 2.2 1 2.1 2.3c0 1.3-.9 2.3-2.1 2.3Z" /></svg>;

function usePublicShell() {
  const isLight = useTheme().theme === 'nexus-light';
  useLayoutEffect(() => { releaseLandingSkeleton(); }, []);
  return `lv2 landing lp nexus-vars pp${isLight ? ' light' : ''}`;
}

/** "3h ago" from an ISO stamp. */
function ago(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '—');
const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

const LEDGER_LINK = (
  <Link href={productPath('ledger')} className="lv2-btn ghost" data-testid="perf-ledger-link">Open Ledger <ArrowRight size={16} aria-hidden="true" /></Link>
);

/** "How it has performed" — verified figures only, each with n, source and age; else the Ledger link. */
function Performance({ product }: { product: Product }) {
  const live = product.proof !== 'ledger';
  const { data, failed } = useShowcase(live);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);

  let body: JSX.Element | null = null;
  if (product.proof === 'nexus-record') {
    const rec = data?.record?.data ?? null;
    const ca = rec?.callAccuracy ?? null;
    const age = ago(data?.record?.asOf ?? null, now);
    if (rec && (ca?.n || rec.verifiedClosed)) {
      body = (
        <>
          <dl className="pp-perf-grid">
            {ca && ca.n > 0 && (
              <div>
                <dd>{ca.rate != null ? pct(ca.rate) : 'Withheld'}</dd>
                <dt>Call accuracy</dt>
                <span>n={ca.n.toLocaleString('en-US')} · {day(ca.from)} → {day(ca.to)}{ca.rate == null ? ` · below n=${rec.minSample}` : ''}</span>
              </div>
            )}
            <div>
              <dd>{rec.verifiedClosed.toLocaleString('en-US')}</dd>
              <dt>Closed ideas verified against bars</dt>
              <span>{rec.unverified.toLocaleString('en-US')} unverified · {rec.checkedOnly.toLocaleString('en-US')} checked-only, excluded</span>
            </div>
          </dl>
          <p className="pp-perf-src">
            Source: NEXUS ideas since the 26 Aug 2026 baseline, managed-replay and bar-verification ledgers
            {ca ? ` (replay ${day(ca.ledgerAsOf)})` : ''}{age ? ` · updated ${age}` : ''}. Call accuracy = T1 or +1R reached before the stop on 5-minute bars; it is the call, not realized P&amp;L. Rates are withheld below n={rec.minSample}.
          </p>
        </>
      );
    }
  } else if (product.proof === 'bot-record') {
    const bot = data?.bot?.data ?? null;
    const age = ago(data?.bot?.asOf ?? null, now);
    if (bot && bot.closed > 0) {
      body = (
        <>
          <dl className="pp-perf-grid">
            <div>
              <dd>{bot.winRate != null ? pct(bot.winRate) : 'Withheld'}</dd>
              <dt>Win rate (paper)</dt>
              <span>n={bot.closed} closed{bot.winRate == null ? ` · below n=${bot.minSample}` : ''}</span>
            </div>
            <div>
              <dd>{bot.closed.toLocaleString('en-US')}</dd>
              <dt>Closed paper trades</dt>
              <span>{bot.open} open · since {day(bot.since)}</span>
            </div>
          </dl>
          <p className="pp-perf-src">
            Source: the Quantinum Bot paper ledger{bot.runLabel ? ` (${bot.runLabel})` : ''}{age ? ` · updated ${age}` : ''}. Simulated fills, not real money. Rates are withheld below n={bot.minSample}.
          </p>
        </>
      );
    }
  }

  return (
    <section className="lv2-sec pp-sec" aria-labelledby="pp-perf-title" id="performance">
      <div className="lv2-wrap">
        <header className="lv2-head">
          <p className="lv2-eyebrow">Proof</p>
          <h2 id="pp-perf-title">How it has performed</h2>
        </header>
        <div className="pp-perf" data-testid="perf-block" data-proof={product.proof}>
          {body ?? (
            <p className="pp-perf-empty" data-testid="perf-ledger-text">
              {live && !data && !failed ? 'Loading the verified record…' : 'Verified results live on Ledger'}
              {live && !data && !failed ? null : <span> — every outcome re-checked against price bars, always shown with its sample size.</span>}
            </p>
          )}
          <div className="pp-perf-act">{LEDGER_LINK}</div>
        </div>
      </div>
    </section>
  );
}

function ShotFrame({ product }: { product: Product }) {
  const desk = SHOT_DESK[product.shot];
  const route = DESK_ROUTE[desk];
  return (
    <figure className="lv2-device pp-device" aria-label={`${route.label} — the real QuantEdge app on sample data`}>
      <div className="lp-frame-bar" aria-hidden="true"><span className="lp-dots"><i /><i /><i /></span><span className="lp-url">{SITE_DOMAIN}{route.path.split('?')[0]}</span></div>
      <div className="lv2-device-stage"><RealFrame desk={desk} eager /></div>
      <span className="dk-badge">Sample data</span>
    </figure>
  );
}

function Cta({ name }: { name?: string }) {
  return (
    <section className="lv2-sec lv2-close" aria-labelledby="pp-cta-title">
      <div className="lv2-wrap">
        <div className="lv2-close-card">
          <h2 id="pp-cta-title">{name ? <>Try {name} <span>in the beta.</span></> : <>One terminal, <span>every desk.</span></>}</h2>
          <p className="lv2-lede">Invite-only while it&rsquo;s in beta — have a code, or join the waitlist. The Discord is open to everyone.</p>
          <div className="lv2-ctas">
            <Link href="/signup" className="lv2-btn primary xl">Join the beta <ArrowRight size={18} aria-hidden="true" /></Link>
            <a href={PRODUCT_DISCORD_URL} className="lv2-btn ghost xl" target="_blank" rel="noopener noreferrer">{DISCORD_ICON}Join Discord<span className="sr-only"> (opens in a new tab)</span></a>
          </div>
          <p className="pp-disclaimer" data-testid="product-disclaimer">{DISCLAIMER_TEXT}</p>
        </div>
      </div>
    </section>
  );
}

function ProductCard({ p }: { p: Product }) {
  return (
    <Link href={productPath(p.slug)} className="pp-card pp-card-link">
      <span className="pp-ico"><ProductIcon name={p.icon} size={20} /></span>
      <b>{p.name}</b>
      <span>{p.oneLiner}</span>
      <ArrowRight className="pp-card-go" size={16} aria-hidden="true" />
    </Link>
  );
}

function ProductPage({ product: p }: { product: Product }) {
  const cls = usePublicShell();
  const pairs = p.pairsWith.map(productBySlug).filter((x): x is Product => !!x);
  return (
    <div className={cls} data-testid={`product-page-${p.slug}`}>
      <SEOHead title={p.seoTitle} description={p.seoDescription} />
      <a href="#main" className="lv2-skip">Skip to content</a>
      <LandingNav />
      <main id="main">
        {/* 1 · HERO + real product shot */}
        <section className="pp-hero" aria-labelledby="pp-h1">
          <div className="lv2-wrap pp-hero-in">
            <nav className="pp-crumbs" aria-label="Breadcrumb"><Link href="/product">Products</Link><span aria-hidden="true">/</span><span aria-current="page">{p.name}</span></nav>
            <p className="pp-chip"><span className="pp-ico"><ProductIcon name={p.icon} size={16} /></span>{p.name} · {p.role}</p>
            <h1 id="pp-h1">{p.headline}</h1>
            <p className="lv2-sub">{p.lede}</p>
            <div className="lv2-ctas">
              <Link href="/signup" className="lv2-btn primary xl">Join the beta <ArrowRight size={18} aria-hidden="true" /></Link>
              <Link href={`/docs/${p.docsModule}`} className="lv2-btn ghost xl">Read the {p.name} guide <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </div>
          </div>
          <div className="lv2-wrap"><ShotFrame product={p} /></div>
        </section>

        {/* 2 · The problem */}
        <section className="lv2-sec pp-sec" aria-labelledby="pp-problem-title">
          <div className="lv2-wrap pp-split">
            <header className="lv2-head"><p className="lv2-eyebrow">The problem</p><h2 id="pp-problem-title">{p.problem.title}</h2></header>
            <div className="pp-prose">{p.problem.body.map((t) => <p key={t}>{t}</p>)}</div>
          </div>
        </section>

        {/* 3 · How it works */}
        <section className="lv2-sec pp-sec" aria-labelledby="pp-how-title">
          <div className="lv2-wrap">
            <header className="lv2-head"><p className="lv2-eyebrow">How it works</p><h2 id="pp-how-title">With {p.name}, step by step.</h2></header>
            <ol className="pp-steps">
              {p.steps.map((s, i) => (
                <li key={s.title}><span className="pp-step-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><b>{s.title}</b><p>{s.body}</p></li>
              ))}
            </ol>
          </div>
        </section>

        {/* 4 · Capabilities */}
        <section className="lv2-sec pp-sec" aria-labelledby="pp-cap-title">
          <div className="lv2-wrap">
            <header className="lv2-head"><p className="lv2-eyebrow">Capabilities</p><h2 id="pp-cap-title">What {p.name} gives you.</h2></header>
            <ul className="pp-cards">
              {p.capabilities.map((c) => <li key={c.title} className="pp-card"><b>{c.title}</b><p>{c.body}</p></li>)}
            </ul>
          </div>
        </section>

        {/* 5 · Grouped features */}
        <section className="lv2-sec pp-sec" aria-labelledby="pp-feat-title">
          <div className="lv2-wrap">
            <header className="lv2-head"><p className="lv2-eyebrow">Everything inside</p><h2 id="pp-feat-title">Feature list</h2></header>
            <div className="pp-feat">
              {p.features.map((g) => (
                <div key={g.group}>
                  <p className="lv2-label">{g.group}</p>
                  <ul>{g.items.map((it) => <li key={it}><Check size={15} aria-hidden="true" />{it}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6 · How it has performed */}
        <Performance product={p} />

        {/* 7 · Pairs with */}
        <section className="lv2-sec pp-sec" aria-labelledby="pp-pairs-title">
          <div className="lv2-wrap">
            <header className="lv2-head"><p className="lv2-eyebrow">Pairs with</p><h2 id="pp-pairs-title">Works best alongside</h2></header>
            <div className="pp-grid">{pairs.map((x) => <ProductCard key={x.slug} p={x} />)}</div>
          </div>
        </section>

        {/* 8 · Docs */}
        <section className="lv2-sec pp-sec" aria-label="Documentation">
          <div className="lv2-wrap">
            <Link href={`/docs/${p.docsModule}`} className="pp-docs" data-testid="product-docs-link">
              <span className="pp-ico"><BookOpen size={20} aria-hidden="true" /></span>
              <span><b>The {p.name} field guide</b><span>Every layer, where it comes from and how to read it — in the docs.</span></span>
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* 9 · FAQ */}
        <section className="lv2-sec pp-sec" aria-labelledby="pp-faq-title">
          <div className="lv2-wrap pp-split">
            <header className="lv2-head"><p className="lv2-eyebrow">FAQ</p><h2 id="pp-faq-title">Questions about {p.name}</h2></header>
            <div className="pp-faq">
              {p.faq.map((f) => (
                <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>
              ))}
            </div>
          </div>
        </section>

        {/* 10 · CTA + disclaimer */}
        <Cta name={p.name} />
      </main>
      <PublicFooter />
    </div>
  );
}

function ProductIndex() {
  const cls = usePublicShell();
  return (
    <div className={cls} data-testid="product-index">
      <SEOHead title={PRODUCT_INDEX_META.title} description={PRODUCT_INDEX_META.description} />
      <a href="#main" className="lv2-skip">Skip to content</a>
      <LandingNav />
      <main id="main">
        <section className="pp-hero" aria-labelledby="pp-h1">
          <div className="lv2-wrap pp-hero-in">
            <p className="lv2-eyebrow">Products</p>
            <h1 id="pp-h1">Eleven desks, one terminal.</h1>
            <p className="lv2-sub">Every QuantEdge module, what it does and how to read it — each one shown as the real app on sample data, each number stamped with its source and age.</p>
          </div>
          <div className="lv2-wrap"><ShotFrame product={PRODUCTS[0]} /></div>
        </section>
        <section className="lv2-sec pp-sec" aria-labelledby="pp-all-title">
          <div className="lv2-wrap">
            <header className="lv2-head"><h2 id="pp-all-title">All products</h2></header>
            <div className="pp-grid pp-grid-all">{PRODUCTS.map((x) => <ProductCard key={x.slug} p={x} />)}</div>
          </div>
        </section>
        <Cta />
      </main>
      <PublicFooter />
    </div>
  );
}

export default function ProductRoute() {
  const params = useParams<{ slug?: string }>();
  if (!params.slug) return <ProductIndex />;
  const product = productBySlug(params.slug);
  return product ? <ProductPage product={product} /> : <NotFound />;
}
