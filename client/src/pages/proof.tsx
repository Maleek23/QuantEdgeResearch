/**
 * PROOF — /proof (public). The verified record and the model's calibration,
 * nothing else. Every figure comes from a live endpoint with its n, date range
 * and age; a rate below its minimum sample is printed as "Withheld"; when a
 * section has no data it says so. No number is hardcoded here.
 *
 *   Ledger record   GET /api/public/showcase → record (bar-verified NEXUS book
 *                   since the 2026-08-26 baseline; earlier outcomes are invalid
 *                   and never counted) + bot (paper)
 *   Path            GET /api/public/path-calibration (server/path-calibration.ts):
 *                   band coverage of frozen 09:40 fans, or "collecting since …"
 * Flag PROOF_PAGE (default on). Styles: landing-v2.css + product-pages.css.
 */
import { useEffect, useLayoutEffect, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import '@/styles/nexus.css';
import '@/styles/landing-v2.css';
import '@/styles/product-pages.css';
import { DISCLAIMER_TEXT } from '@shared/docs/types';
import { PUBLIC_PAGE_META } from '@shared/public-seo';
import { LandingNav } from '@/components/landing/landing-chrome';
import { PublicFooter } from '@/components/landing/public-nav';
import { useShowcase } from '@/components/landing/live-showcase';
import { useTheme } from '@/components/theme-provider';
import { releaseLandingSkeleton } from '@/lib/boot';
import { SEOHead } from '@/components/seo-head';
import { clientFlag } from '@/lib/feature-flags';
import NotFound from '@/pages/not-found';

interface PathCalibration {
  generatedAt: string; status: 'none' | 'collecting' | 'ready'; since: string | null; snapshotDays: number; scoredDays: number;
  minDays: number; in50: number | null; in80: number | null; through: string | null; symbols: string[]; note: string;
}

function ago(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso); if (!Number.isFinite(t)) return null;
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '—');
const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

export default function ProofPage() {
  const isLight = useTheme().theme === 'nexus-light';
  useLayoutEffect(() => { releaseLandingSkeleton(); }, []);
  const on = clientFlag('PROOF_PAGE');
  const { data, failed } = useShowcase(on);
  const cal = useQuery<PathCalibration>({
    queryKey: ['/api/public/path-calibration'],
    queryFn: async () => { const r = await fetch('/api/public/path-calibration', { credentials: 'omit' }); if (!r.ok) throw new Error(String(r.status)); return r.json(); },
    enabled: on, staleTime: 300_000, retry: 1,
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);
  if (!on) return <NotFound />;

  const rec = data?.record?.data ?? null;
  const ca = rec?.callAccuracy ?? null;
  const bot = data?.bot?.data ?? null;
  const c = cal.data;
  const meta = PUBLIC_PAGE_META['/proof'];

  return (
    <div className={`lv2 landing lp nexus-vars pp${isLight ? ' light' : ''}`} data-testid="proof-page">
      <SEOHead title={meta.title} description={meta.description} />
      <a href="#main" className="lv2-skip">Skip to content</a>
      <LandingNav />
      <main id="main">
        <section className="pp-hero" aria-labelledby="pf-h1">
          <div className="lv2-wrap pp-hero-in">
            <p className="lv2-eyebrow">Proof</p>
            <h1 id="pf-h1">The record, verified. The model, scored.</h1>
            <p className="lv2-sub">Only outcomes re-computed against market bars are counted, from the 26 Aug 2026 baseline on. Every figure shows its sample size, date range and age. Rates stay hidden until the sample is large enough.</p>
          </div>
        </section>

        <section className="lv2-sec pp-sec" aria-labelledby="pf-ledger">
          <div className="lv2-wrap">
            <header className="lv2-head"><p className="lv2-eyebrow">Ledger</p><h2 id="pf-ledger">Verified NEXUS record</h2></header>
            <div className="pp-perf" data-testid="proof-ledger">
              {rec && (ca?.n || rec.verifiedClosed) ? (
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
                      <dd>{rec.winRate != null ? pct(rec.winRate) : 'Withheld'}</dd>
                      <dt>Closed green (bar-verified)</dt>
                      <span>n={rec.verifiedClosed.toLocaleString('en-US')} · {day(rec.from)} → {day(rec.to)}{rec.winRate == null ? ` · below n=${rec.minSample}` : ''}</span>
                    </div>
                    <div>
                      <dd>{rec.published.toLocaleString('en-US')}</dd>
                      <dt>Ideas published since the baseline</dt>
                      <span>{rec.unverified.toLocaleString('en-US')} unverified · {rec.checkedOnly.toLocaleString('en-US')} checked-only — not in these numbers</span>
                    </div>
                  </dl>
                  <p className="pp-perf-src">Source: NEXUS ideas book, bar-verification and managed-replay ledgers{rec.ledgerAsOf ? ` (ledger ${day(rec.ledgerAsOf)}, ${ago(rec.ledgerAsOf, now)})` : ''}. Outcomes before 26 Aug 2026 are invalid and excluded. Call accuracy = T1 or +1R before the stop on 5-minute bars — the call, not realized P&amp;L.</p>
                </>
              ) : (
                <p className="pp-perf-empty">{failed ? 'The record could not be loaded right now.' : data ? 'No verified closed ideas to show yet.' : 'Loading the verified record…'}</p>
              )}
              {bot && bot.closed > 0 && (
                <p className="pp-perf-src" data-testid="proof-bot">Quantinum Bot (paper, simulated fills): n={bot.closed} closed{bot.since ? ` since ${day(bot.since)}` : ''} · win rate {bot.winRate != null ? pct(bot.winRate) : `withheld below n=${bot.minSample}`}{data?.bot?.asOf ? ` · ${ago(data.bot.asOf, now)}` : ''}.</p>
              )}
              <div className="pp-perf-act"><Link href="/docs/ledger" className="lv2-btn ghost">How we verify <ArrowRight size={16} aria-hidden="true" /></Link></div>
            </div>
          </div>
        </section>

        <section className="lv2-sec pp-sec" aria-labelledby="pf-path">
          <div className="lv2-wrap">
            <header className="lv2-head"><p className="lv2-eyebrow">Trajectory</p><h2 id="pf-path">Path calibration</h2></header>
            <div className="pp-perf" data-testid="proof-path" data-status={c?.status ?? 'loading'}>
              {c?.status === 'ready' && c.in50 != null && c.in80 != null ? (
                <>
                  <dl className="pp-perf-grid">
                    <div><dd>{pct(c.in50)}</dd><dt>Inside the 50% fan</dt><span>target ≈ 50% · {c.scoredDays} sessions</span></div>
                    <div><dd>{pct(c.in80)}</dd><dt>Inside the 80% fan</dt><span>target ≈ 80% · {day(c.since)} → {day(c.through)}</span></div>
                  </dl>
                  <p className="pp-perf-src">{c.note} Symbols: {c.symbols.join(', ')}. Computed {ago(c.generatedAt, now)}.</p>
                </>
              ) : (
                <p className="pp-perf-empty">
                  {cal.isError ? 'Calibration could not be loaded right now.' : !c ? 'Loading calibration…'
                    : c.status === 'collecting' ? <>Collecting since {day(c.since)}. <span>{c.scoredDays} of {c.minDays} scored sessions needed before coverage is published.</span></>
                      : <>Collecting. <span>No frozen 09:40 Path snapshots yet.</span></>}
                </p>
              )}
              <div className="pp-perf-act"><Link href="/docs/trajectory" className="lv2-btn ghost">How the Path model works <ArrowRight size={16} aria-hidden="true" /></Link></div>
            </div>
          </div>
        </section>

        <section className="lv2-sec pp-sec" aria-label="Disclaimer"><div className="lv2-wrap"><p className="pp-perf-src">{DISCLAIMER_TEXT} Past performance does not guarantee future results.</p></div></section>
      </main>
      <PublicFooter />
    </div>
  );
}
