/**
 * HOW TO USE QUANTEDGE — single-page user guide
 *
 * Linked from the account menu (How to use) and ⌘K. Static page with no API calls.
 * Goal: replace "I don't know how to use this" with "I know exactly where to go."
 *
 * 2026-09-29: drawn in the page template (components/lux/lux-page.tsx).
 */
import { Link } from 'wouter';
import { Target, Bitcoin, Home, Wallet, Crosshair, Zap, BookOpen, Microscope, ArrowRight } from 'lucide-react';
import { LuxPage, LuxPageHeader, LuxPanel, LuxTag } from '@/components/lux';

export default function HowToPage() {
  return (
    <LuxPage width="narrow">
      <LuxPageHeader
        section="Guide"
        context="static · read once"
        title="How to use QuantEdge"
        purpose="One terminal, three windows of time, one workflow. Read this once."
      />

      {/* Daily Workflow */}
      <Section num="01" title="Your daily workflow" subtitle="3 windows of time, 3 things to check">
        <div className="space-y-3">
          <Step
            time="MORNING (8:00–9:30 AM ET)"
            actions={[
              { url: '/t',     label: 'Terminal — NEXUS',     why: 'Market briefing — regime, rotation, signals' },
              { url: '/radar', label: 'Thesis Radar → Picks', why: 'See what fired overnight (auto)' },
              { url: '/t?tab=crypto', label: 'Terminal — Crypto', why: 'BTC level breaks — MARA/COIN/MSTR plays' },
              { url: '/t?tab=positions', label: 'Positions',  why: 'Adjust stops on existing trades' },
            ]}
          />
          <Step
            time="DURING MARKET (9:30 AM – 4:00 PM)"
            actions={[
              { url: '/r/QCOM', label: 'Research → /r/[ticker]', why: 'Per-ticker chart, options, GEX, flow — all in one' },
              { url: '/t?tab=gex', label: 'GEX',               why: 'Dealer walls = your entry/exit levels' },
            ]}
          />
          <Step
            time="LUNCH + CLOSE (12:00 PM, 3:55 PM)"
            actions={[
              { url: '/radar', label: 'Re-check Radar', why: 'Cron fires fresh picks at these exact times' },
            ]}
          />
        </div>
      </Section>

      {/* What each page is for */}
      <Section num="02" title="What each page does" subtitle="Eight destinations — that's the whole product.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <PageCard icon={Home}       url="/t"      title="Terminal"        desc="NEXUS home — market briefing, rotation, signals, and every tab" />
          <PageCard icon={Target}     url="/radar"  title="Thesis Radar"    desc="6 patterns × 120 tickers, scanned 5×/day, A+ pushes to the Slate" />
          <PageCard icon={Bitcoin}    url="/t?tab=crypto" title="BTC Radar" desc="Live BTC + 14 crypto-equity beta tracker, fires on level breaks" />
          <PageCard icon={Crosshair}  url="/slate" title="Slate"  desc="Today's measured setups and the pre-market gappers" />
          <PageCard icon={Zap}        url="/t?tab=gex" title="GEX & Flow"   desc="Dealer gamma walls + options flow — your entry/exit lens" />
          <PageCard icon={Microscope} url="/r/SPY"  title="Research"        desc="Per-ticker dossier — chart, options, GEX surface, contract lab" />
          <PageCard icon={Wallet}     url="/t?tab=positions" title="Positions" desc="Your open book — alerts, stops, exits" />
          <PageCard icon={BookOpen}   url="/t?tab=journal" title="Journal"  desc="Dashboard · trades · analytics · track record" />
        </div>
      </Section>

      {/* What Thesis Radar does */}
      <Section num="03" title="How Thesis Radar works" subtitle="The autonomous discovery engine">
        <div>
          <div className="text-[12.5px] space-y-2">
            <p>
              <span className="lx-panel-num">1.</span>{' '}
              Cron runs at <strong>09:35, 12:00, 15:55, 20:00 ET</strong> on weekdays
            </p>
            <p>
              <span className="lx-panel-num">2.</span>{' '}
              Scans <strong>~120 tickers</strong> against <strong>6 pattern signatures</strong>:
            </p>
            <ul className="ml-6 space-y-1 text-muted-foreground text-[12px]">
              <li>• <strong>DGXX Setup</strong> — small-cap + AI-adjacent + call vol spike + hyperscaler news</li>
              <li>• <strong>Aschenbrenner 2nd Derivative</strong> — layer hasn't run yet vs first-order layer</li>
              <li>• <strong>Bottleneck Whisper</strong> — "constrained / shortage" mentions cluster</li>
              <li>• <strong>Institutional Accumulation</strong> — whale buys + insider purchases</li>
              <li>• <strong>Catalyst Whisper</strong> — unusual OI + scheduled event in 30 days</li>
              <li>• <strong>Gamma Squeeze</strong> — UNH-style penny call premium juice</li>
            </ul>
            <p>
              <span className="lx-panel-num">3.</span>{' '}
              Each match graded on <strong>7 signals</strong> (price action, options flow, news, IV, analysts, institutional, sector rotation) → composite letter grade A+ to F
            </p>
            <p>
              <span className="lx-panel-num">4.</span>{' '}
              Picks ≥ <strong>B+</strong> auto-push to the <Link href="/slate" className="lx-tone-accent underline underline-offset-2">Slate</Link> + Discord (when webhook configured)
            </p>
            <p>
              <span className="lx-panel-num">5.</span>{' '}
              You wake up to a ranked picks list at <Link href="/radar" className="lx-tone-accent underline underline-offset-2">/radar</Link>
            </p>
          </div>
        </div>
      </Section>

      {/* Quick decision tree */}
      <Section num="04" title="When stuck — quick decision tree" subtitle="Question → where to go">
        <div className="space-y-1.5 text-[12.5px]">
          {/* Canonical URLs only — the old aliases (/p, /g, /pos, /j, /h, /btc)
              are redirects, and /p?tab=earnings dropped its tab on the way. */}
          <DecisionRow q="What should I trade today?"               a={['/today', '/slate']} />
          <DecisionRow q="Is the market bullish or bearish?"        a={['/t']} />
          <DecisionRow q="Where's QCOM going?"                       a={['/r/QCOM', '/t?tab=gex']} />
          <DecisionRow q="What just got published today?"           a={['/slate']} />
          <DecisionRow q="What earnings are this week?"             a={['/t?tab=catalyst']} />
          <DecisionRow q="BTC moving — which equities follow?"      a={['/t?tab=crypto']} />
          <DecisionRow q="My open positions?"                        a={['/t?tab=positions']} />
          <DecisionRow q="My win rate / track record?"               a={['/t?tab=journal&jtab=record']} />
          <DecisionRow q="A pattern setup I want to follow?"        a={['/radar?tab=forming']} />
        </div>
      </Section>

      {/* Limits to know */}
      <Section num="05" title="What QuantEdge isn't" subtitle="Honest disclosure">
        <div className="text-[12.5px] text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">Real-time data:</strong> option chains come from Alpaca's indicative feed, then CBOE delayed (~15 min), then Yahoo Finance; options flow from Bullflow. Every dashboard tool shows its source and data age. We're <strong>not</strong> Unusual Whales (no curated dark pool prints) or Polygon ($99/mo institutional real-time).
          </p>
          <p>
            <strong className="text-foreground">Best for:</strong> swing trades + LEAPS where 15-min lag doesn't kill you. Thesis discovery. Pattern recognition. Auto-graded conviction.
          </p>
          <p>
            <strong className="text-foreground">Not best for:</strong> 0DTE scalping (you need a real-time exchange feed; ours is indicative or delayed). Pre-market options data (limited). Overnight stock alerts (closed market).
          </p>
        </div>
      </Section>
    </LuxPage>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function Section({ num, title, subtitle, children }: { num?: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <LuxPanel num={num} title={title} sub={subtitle || undefined}>
      {children}
    </LuxPanel>
  );
}

function Step({ time, actions }: { time: string; actions: { url: string; label: string; why: string }[] }) {
  return (
    <div className="lx-kpi" style={{ padding: '10px 8px 8px' }}>
      <div className="lx-card-title" style={{ padding: '0 10px 4px', color: 'var(--lx-accent-text)' }}>{time}</div>
      <div>
        {actions.map((a, i) => (
          <Link key={i} href={a.url} className="lx-rowlink text-[12.5px]">
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 self-center" aria-hidden />
            <span className="text-foreground font-semibold sm:min-w-[200px]">{a.label}</span>
            <span className="text-muted-foreground">{a.why}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function PageCard({ icon: Icon, url, title, desc }: { icon: any; url: string; title: string; desc: string }) {
  return (
    <Link href={url} className="lx-panel" style={{ padding: '12px 14px' }}>
      <div className="flex items-center gap-2 mb-1 min-w-0">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--lx-accent-text)' }} aria-hidden />
        <div className="lx-panel-t" style={{ fontSize: 14 }}>{title}</div>
        <LuxTag tone="mute" className="ml-auto">{url}</LuxTag>
      </div>
      <p className="text-[12px] text-muted-foreground" style={{ margin: 0 }}>{desc}</p>
    </Link>
  );
}

function DecisionRow({ q, a }: { q: string; a: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2" style={{ border: '1px solid var(--lx-line)', borderRadius: 'var(--lx-radius)' }}>
      <span className="flex-1 min-w-[180px] text-foreground">{q}</span>
      <div className="flex flex-wrap gap-1">
        {a.map((url, i) => (
          <Link key={i} href={url} className="lx-tag" data-tone="accent">
            {url}
          </Link>
        ))}
      </div>
    </div>
  );
}
