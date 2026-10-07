/**
 * LANDING PROOF BLOCKS — the operator-approved patterns from
 * docs/TERRA_TRADE_STUDY_2026-10-07.md, in QuantEdge's own system:
 *
 *   RecordStrip   #4  four mono cells under the hero — BAR-VERIFIED NEXUS record only
 *                     (server/public-showcase.ts `record`, shared/landing-record.ts),
 *                     each cell with its source + age; win rate withheld below n = 30;
 *                     the strip hides itself when the record isn't available (no sample).
 *   Findings      #5  three numbered findings from our own research, each with a mini
 *                     bar pair, n and the study date — losses included.
 *   DataSources   #7  where every number comes from, one feed per row, with an honest
 *                     LIVE / DELAYED / EOD / MEASURING chip (only feeds that are wired).
 *   Toolbox       #8  the secondary desks as a /01–/06 hairline index.
 *   AmbientGrid   #10 a faint animated gamma-surface wireframe behind the hero (one
 *                     canvas, paused off-screen, a single still frame under reduced motion).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useShowcase } from './live-showcase';

const ARROW = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" /></svg>;

function ago(iso: string | null | undefined, now: number) {
  if (!iso) return null;
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  const h = Math.floor(s / 3600);
  return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }) : '');

// ── #4 record strip ──────────────────────────────────────────────────────
export function RecordStrip({ onMore }: { onMore: (e: React.MouseEvent) => void }) {
  const { data, failed } = useShowcase(true);
  const rec = data?.record?.data ?? null;
  const asOf = data?.record?.asOf ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  // First read pending: hold the strip's space (no layout shift). Nothing verified to show
  // (unavailable, or no bar-verification ledger): show nothing — never a sample, never "—".
  if (!data && !failed) return <div className="lp-strip-ph" aria-hidden="true" />;
  if (!rec || rec.verifiedClosed === 0) return null;
  const age = ago(asOf, now);
  const src = `NEXUS ideas book · bar-verified${rec.ledgerAsOf ? ` · ledger ${rec.ledgerAsOf.slice(0, 10)}` : ''}`;
  const left = rec.checkedOnly + rec.unverified;
  return (
    <div className="lp-strip" role="group" aria-label="Verified record">
      <dl>
        <div title={src}><dt>Bar-verified ideas</dt><dd>{rec.verifiedClosed}</dd><span>closed · {day(rec.from)}–{day(rec.to)}</span></div>
        <div title={`${src} · win = re-computed P&L above zero · shown at n ≥ ${rec.minSample}`}>
          <dt>Win rate</dt>
          {rec.winRate != null
            ? <><dd>{Math.round(rec.winRate * 100)}%</dd><span>n = {rec.verifiedClosed} · before fees</span></>
            : <><dd className="dim">n&lt;{rec.minSample}</dd><span>shown at n ≥ {rec.minSample}</span></>}
        </div>
        <div title="Closed ideas whose P&L is not bar-verified are left out of these numbers, never added in"><dt>Left out</dt><dd>{left}</dd><span>not verified · not counted</span></div>
        <div title={src}><dt>Verified</dt><dd>{age ?? '—'}</dd><span>against market bars</span></div>
      </dl>
      <a href="#sec-record" className="lp-strip-more" onClick={onMore}>How the record is kept {ARROW}</a>
    </div>
  );
}

// ── #5 findings ──────────────────────────────────────────────────────────
type Bar = { label: string; value: number; good: boolean };
const FINDINGS: Array<{ title: string; line: string; unit: (v: number) => string; bars: [Bar, Bar]; meta: string; src: string }> = [
  { title: 'Tight stops were our #1 loss driver.',
    line: 'Held-out ideas replayed with the stop as published, then with a 1.25× ATR floor. Still negative — the floor shipped, and the record keeps measuring it.',
    unit: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}R`,
    bars: [{ label: 'Stop as published', value: -0.23, good: false }, { label: '1.25× ATR floor', value: -0.11, good: true }],
    meta: 'n = 332 held-out ideas · study 24 Sep 2026', src: 'research/stop-floor-results.json' },
  { title: 'A time stop beat holding and trailing.',
    line: 'Seven exit rules replayed on the same ideas at one contract or $1,000 each. Only a time stop at half the horizon improved on the published plan; holding to the horizon nearly doubled the loss.',
    unit: (v) => `${v < 0 ? '−' : '+'}$${Math.abs(v)}/idea`,
    bars: [{ label: 'Published plan', value: -19, good: false }, { label: 'Plan + time stop', value: -10, good: true }],
    meta: 'n = 443 ideas from 26 Aug 2026 · replay 1 Oct 2026', src: 'research/exit-rule-replay-results.json' },
  { title: 'Over a third of our stop-outs were shakeouts.',
    line: 'Stopped-out ideas that later traded back to green or to target, against all losing ideas. It is why stops are now floored by volatility.',
    unit: (v) => `${Math.round(v)}%`,
    bars: [{ label: 'Stop-outs (n = 46)', value: 37, good: false }, { label: 'All losses (n = 151)', value: 20, good: true }],
    meta: 'n = 151 losing ideas · 26 Aug – 30 Sep 2026', src: 'research/shakeout-review-results.json' },
];

export function Findings() {
  return (
    <ol className="lp-findings">
      {FINDINGS.map((f, i) => {
        const max = Math.max(...f.bars.map((b) => Math.abs(b.value))) || 1;
        return (
          <li key={f.title}>
            <span className="n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <div className="txt">
              <h3>{f.title}</h3>
              <p>{f.line}</p>
              <p className="meta" title={`Source: ${f.src}`}>{f.meta}</p>
            </div>
            <dl className="bars" aria-label={`${f.bars[0].label} ${f.unit(f.bars[0].value)}; ${f.bars[1].label} ${f.unit(f.bars[1].value)}`}>
              {f.bars.map((b) => (
                <div key={b.label}>
                  <dt>{b.label}</dt>
                  <dd><i className={b.good ? 'good' : 'bad'} style={{ width: `${Math.max(6, (Math.abs(b.value) / max) * 100)}%` }} /><b>{f.unit(b.value)}</b></dd>
                </div>
              ))}
            </dl>
          </li>
        );
      })}
    </ol>
  );
}

// ── #7 data sources ──────────────────────────────────────────────────────
type Chip = 'LIVE' | 'DELAYED' | 'EOD' | 'MEASURING';
const SOURCES: Array<[string, string, Chip, string]> = [
  ['Crypto prices', 'Coinbase live feed', 'LIVE', 'Streams 24/7; each price shows its age.'],
  ['Stock quotes', 'Alpaca IEX trades, Tradier and Yahoo quotes', 'DELAYED', 'Free plan: 15 min. Otherwise the age is on every tile; not licensed real-time.'],
  ['Option chains · GEX', 'Alpaca, Tradier or CBOE’s delayed feed', 'DELAYED', 'CBOE chains run about 15 min behind; the chain age is shown with the walls.'],
  ['Options flow prints', 'Third-party flow feed', 'DELAYED', 'Each print carries its time; the tape says when the feed is stale.'],
  ['Flow buy / sell side', 'Classifier in development', 'MEASURING', 'Whether a print was bought or sold isn’t classified yet — treat flow direction as unknown.'],
  ['Earnings calendar', 'Earnings calendar feed', 'EOD', 'Dates and estimates refresh daily.'],
  ['NEXUS outcomes', 'Outcome tracker, re-checked against market bars', 'EOD', 'Only bar-verified P&L is counted in the public record; the ledger date is shown.'],
  ['New models (e.g. squeeze radar)', 'Forward record', 'MEASURING', 'Shipped with a MEASURING label until the forward record earns it.'],
];

export function DataSources() {
  return (
    <ul className="lp-sources">
      {SOURCES.map(([what, from, chip, note]) => (
        <li key={what}>
          <div><b>{what}</b><span>{from}</span></div>
          <p>{note}</p>
          <span className={`lp-chip ${chip.toLowerCase()}`}>{chip}</span>
        </li>
      ))}
    </ul>
  );
}

// ── #8 toolbox ───────────────────────────────────────────────────────────
const TOOLS: Array<[string, string, string]> = [
  ['Chart', 'Price with the dealer levels drawn on it, plus drawing tools.', '/t?tab=chart'],
  ['Quantinum read', 'Every engine’s read on one ticker, layer by layer.', '/r/SPY'],
  ['Catalysts', 'Earnings and scheduled events for the names you watch.', '/t?tab=catalyst'],
  ['Crypto', '24/7 movers and crypto ideas, on a live feed.', '/t?tab=crypto'],
  ['LEAPS', 'Longer-dated option candidates, with the scan’s age.', '/t?tab=leaps'],
  ['Alerts', 'Price and level alerts on your watchlist.', '/alerts'],
];

export function Toolbox() {
  return (
    <ol className="lp-tools">
      {TOOLS.map(([t, d, href], i) => (
        <li key={t}>
          <Link href={href}>
            <span className="n" aria-hidden="true">/{String(i + 1).padStart(2, '0')}</span>
            <b>{t}</b><span className="d">{d}</span><span className="a" aria-hidden="true">→</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

// ── scroll-in reveals (from a visible resting state) ────────────────────
const REVEAL = '.lp-sec .lp-head, .dk, .lp-tools li, .lp-findings > li, .lp-index li, .lp-record-card, .lp-sources li, .lp-plan, .faq-item, .cta-box';
/**
 * Everything is fully visible by default (no JS, no IO, reduced motion, print: nothing
 * is ever hidden). Elements that START below the fold get a one-time settle animation
 * (opacity .35 → 1, 14px rise) the first time they scroll in. Never under reduced motion.
 */
export function useScrollReveal(rootRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>(REVEAL)).filter((el) => el.getBoundingClientRect().top > window.innerHeight);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        const sibs = el.parentElement ? Array.from(el.parentElement.children).indexOf(el) : 0;
        el.style.setProperty('--rv-d', `${Math.min(sibs, 6) * 60}ms`);
        el.classList.add('rv-in');
        io.unobserve(el);
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rootRef]);
}

// ── #10 ambient gamma-surface wireframe ──────────────────────────────────
export function AmbientGrid() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    let raf = 0; let visible = true; let last = 0;
    const color = getComputedStyle(cv).getPropertyValue('--cyan').trim() || '#3b8cff';
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    // A strike × expiry surface: a ridge of positive gamma above spot, a trough below, breathing slowly.
    const z = (x: number, y: number, t: number) =>
      1.1 * Math.exp(-((x - 0.62) ** 2) / 0.02 - ((y - 0.3) ** 2) / 0.2) * (0.85 + 0.15 * Math.sin(t * 0.6))
      - 0.7 * Math.exp(-((x - 0.35) ** 2) / 0.015 - ((y - 0.35) ** 2) / 0.25) * (0.85 + 0.15 * Math.cos(t * 0.5))
      + 0.05 * Math.sin(x * 12 + t * 0.8);
    const draw = (t: number) => {
      const w = cv.clientWidth, h = cv.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = color; ctx.globalAlpha = 0.09; ctx.lineWidth = 1;
      const N = 34, M = 16;
      const P = (u: number, v: number) => {
        const depth = 0.35 + v * 0.65; // perspective: far rows (v→0) are narrower and higher
        const px = w / 2 + (u - 0.5) * w * 1.2 * depth;
        const py = h * 0.18 + v * h * 0.72 - z(u, v, t) * h * 0.16 * depth;
        return [px, py] as const;
      };
      for (let j = 0; j <= M; j++) { ctx.beginPath(); for (let i = 0; i <= N; i++) { const [x, y] = P(i / N, j / M); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); }
      for (let i = 0; i <= N; i++) { ctx.beginPath(); for (let j = 0; j <= M; j++) { const [x, y] = P(i / N, j / M); if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); }
    };
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || ms - last < 66) return; // ~15 fps is plenty for a slow breath
      last = ms; draw(ms / 1000);
    };
    resize(); draw(0);
    const onResize = () => { resize(); draw(last / 1000); };
    window.addEventListener('resize', onResize);
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; }) : null;
    io?.observe(cv);
    if (!reduce) raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); io?.disconnect(); };
  }, [reduce]);
  return <canvas ref={ref} className="lp-ambient" aria-hidden="true" />;
}
