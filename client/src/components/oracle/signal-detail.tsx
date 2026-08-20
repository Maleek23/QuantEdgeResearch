/**
 * ORACLE signal detail — every panel is driven by lib/oracle/signal-geometry, so the
 * numbers on screen are derived once and stay consistent across panels.
 *
 *   PriceLadder    — STOP / ENTRY / LIVE / T1 / T2, each with $, signed %, and R away.
 *   ConfidenceBars — VALIDITY / PROGRESS / PACE / OVERLAY.
 *   TradeGeometry  — distance to each level in R + how much of the horizon is spent.
 *   RiskReward     — R:R at entry with the actual dollar risk and reward per share.
 *   ProfitPlan     — the scale-out rungs (40% at T1 + trail to entry, 60% at T2).
 *   ContextPanel   — the interpreting sentence + what to do now.
 */
import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { convictionPercent, bandStrength, type ConvictionPick } from '@/lib/convictions';
import { computeGeometry, type SignalGeometry, type Level } from '@/lib/oracle/signal-geometry';
import { trackScore } from '@/lib/oracle/score-tracker';
import { useUserPrefs } from '@/components/terminal/terminal-settings';
import { TC, healthColor, statusColor } from '@/lib/oracle/trading-colors';
import { EASE, DUR } from '@/lib/motion';
import { cn } from '@/lib/utils';

const BULL = 'var(--trade-bullish,#22c55e)';
const BEAR = 'var(--trade-bearish,#ef4444)';
const CYAN = 'var(--brand-cyan,#22d3ee)';
const GOLD = '#e0a458';

const money = (n: number) => (n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toFixed(2));

/** Build geometry from a pick + live price. Shared by every panel below. */
export function geometryFor(pick: ConvictionPick, live: number): SignalGeometry {
  return computeGeometry({
    direction: pick.direction,
    entryPrice: pick.entryPrice,
    targetPrice: pick.targetPrice,
    stopLoss: pick.stopLoss,
    live: live || pick.currentPrice || pick.entryPrice,
    riskRewardRatio: pick.riskRewardRatio,
    holdingPeriod: pick.holdingPeriod,
    generatedAt: pick.generatedAt,
    convictionScore: pick.convictionScore,
  });
}

const ROLE: Record<Level['key'], { color: string }> = {
  t2:    { color: BULL },
  t1:    { color: BULL },
  live:  { color: CYAN },
  entry: { color: 'var(--foreground,#e6edf3)' },
  stop:  { color: BEAR },
};

function Card({ title, meta, children, className }: { title: string; meta?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-card-border bg-card overflow-hidden', className)}>
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
        <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">{title}</span>
        {meta && <span className="text-[10px] font-mono text-muted-foreground/60">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── PriceLadder ──

export function PriceLadder({ pick, live, className }: { pick: ConvictionPick; live: number; className?: string }) {
  const reduce = useReducedMotion();
  const g = geometryFor(pick, live);
  const prices = g.levels.map((l) => l.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const span = max - min || 1;
  const y = (p: number) => 6 + (1 - (p - min) / span) * 88;

  return (
    <Card title="Price Ladder" meta={<span style={{ color: statusColor(g.status) }}>{g.statusLabel}</span>} className={className}>
      <div className="relative px-4" style={{ height: 236 }}>
        <div className="absolute left-[42%] top-3 bottom-3 w-px bg-border/60" />
        {g.levels.map((l) => {
          const c = ROLE[l.key].color;
          const isLive = l.key === 'live';
          return (
            <motion.div
              key={l.key}
              className="absolute left-4 right-4 flex items-center"
              style={{ top: `${y(l.price)}%`, transform: 'translateY(-50%)' }}
              initial={reduce ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: DUR.base, ease: EASE }}
            >
              <div className="w-[38%] pr-3 text-right">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: c }}>{l.label}</span>
              </div>
              <span className="relative grid place-items-center" style={{ width: 16 }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 10px color-mix(in srgb, ${c} 60%, transparent)` }} />
                {isLive && !reduce && (
                  <motion.span className="absolute h-2.5 w-2.5 rounded-full" style={{ background: c }}
                    animate={{ scale: [1, 2.4, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} />
                )}
              </span>
              <div className="flex-1 pl-3 flex items-baseline gap-2 flex-wrap">
                <span className="text-[13px] font-mono font-bold tabular-nums text-foreground">${money(l.price)}</span>
                {isLive ? (
                  <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: g.pnlPct >= 0 ? BULL : BEAR }}>
                    {g.pnlPct >= 0 ? '+' : ''}{g.pnlPct.toFixed(2)}% P&L
                  </span>
                ) : (
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground/70">
                    <span style={{ color: l.pctFromLive >= 0 ? BULL : BEAR }}>
                      {l.pctFromLive >= 0 ? '+' : ''}{l.pctFromLive.toFixed(2)}%
                    </span>
                    {' · '}{l.rAway.toFixed(1)}R away
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────── ConfidenceBars ──

export function ConfidenceBars({ pick, live, className }: { pick: ConvictionPick; live: number; className?: string }) {
  const reduce = useReducedMotion();
  const g = geometryFor(pick, live);
  const setup = convictionPercent(pick.convictionScore);

  const rating = trackScore(pick.ideaId, setup);
  const arrow = rating.direction === 'up' ? '▲' : rating.direction === 'down' ? '▼' : null;
  const [showMath, setShowMath] = useState(false);

  // The confluence layers ARE the score — this is the arithmetic behind the number.
  // Sorted by absolute impact so the layers that actually decided it read first, and
  // split into what helped vs what hurt, because a 34 built on +41/−7 is a different
  // trade from a 34 built on +34/0.
  const layers = [...(pick.layers ?? [])].sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const helped = layers.filter((l) => l.points > 0);
  const hurt = layers.filter((l) => l.points < 0);
  const plus = helped.reduce((s, l) => s + l.points, 0);
  const minus = hurt.reduce((s, l) => s + l.points, 0);

  return (
    <Card
      title="Confidence Index"
      meta={
        <span className="flex items-baseline gap-1">
          <span className="text-[13px] font-bold tabular-nums" style={{ color: TC.info }}>{setup}</span>
          {arrow && (
            <span
              className="text-[10px] font-mono font-bold tabular-nums"
              style={{ color: rating.direction === 'up' ? TC.bull : TC.bear }}
              title={`Rating ${rating.direction} ${Math.abs(rating.delta)} pts since first seen ${rating.hoursTracked < 1 ? 'under an hour' : `${Math.round(rating.hoursTracked)}h`} ago`}
            >
              {arrow}{Math.abs(rating.delta)}
            </span>
          )}
        </span>
      }
      className={className}
    >
      <div className="px-4 py-3 space-y-2.5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">
          {pick.convictionBand}-band · {bandStrength(pick.convictionBand)} · {pick.layerCount ?? pick.layers?.length ?? 0} layers
        </div>
        {/* how the score was built */}
        <button
          onClick={() => setShowMath((v) => !v)}
          className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-border/40 bg-foreground/[0.03] px-3 py-2 transition-colors hover:bg-foreground/[0.06]"
          aria-expanded={showMath}
        >
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
            How this score was built
          </span>
          <span className="flex items-baseline gap-1.5 font-mono tabular-nums">
            <span className="text-[11px]" style={{ color: TC.bull }}>+{plus}</span>
            {minus < 0 && <span className="text-[11px]" style={{ color: TC.bear }}>{minus}</span>}
            <span className="text-[10px] text-muted-foreground/70">= {pick.convictionScore}</span>
            <span className="text-[10px] text-muted-foreground/70">{showMath ? '▲' : '▼'}</span>
          </span>
        </button>

        {showMath && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            transition={{ duration: DUR.base, ease: EASE }}
            className="space-y-2 overflow-hidden"
          >
            {helped.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-mono uppercase tracking-widest" style={{ color: TC.bull }}>
                  Supporting · +{plus}
                </div>
                <div className="space-y-1">
                  {helped.map((l, i) => <LayerRow key={`h${i}`} layer={l} />)}
                </div>
              </div>
            )}
            {hurt.length > 0 && (
              <div>
                <div className="mb-1 text-[10px] font-mono uppercase tracking-widest" style={{ color: TC.bear }}>
                  Working against · {minus}
                </div>
                <div className="space-y-1">
                  {hurt.map((l, i) => <LayerRow key={`x${i}`} layer={l} />)}
                </div>
              </div>
            )}
            <p className="text-[10px] leading-relaxed text-muted-foreground/70">
              {hurt.length === 0
                ? 'Nothing is currently arguing against this setup.'
                : `${hurt.length} layer${hurt.length > 1 ? 's are' : ' is'} arguing against it — read those before sizing up.`}
            </p>
          </motion.div>
        )}

        {g.components.map((c) => (
          <div key={c.key}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">{c.label}</span>
              <span className="text-[10px] font-mono tabular-nums" style={{ color: healthColor(c.value) }}>{c.value}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-foreground/8">
              <motion.div className="h-full rounded-full"
                style={{ background: healthColor(c.value) }}
                initial={reduce ? false : { width: 0 }} animate={{ width: `${c.value}%` }}
                transition={{ duration: DUR.slow, ease: EASE }} />
            </div>
            <div className="mt-0.5 text-[10px] font-mono text-muted-foreground/70">{c.why}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ──────────────────────────────────────────────── TradeGeometry + RiskReward ──

export function TradeGeometry({ pick, live, className }: { pick: ConvictionPick; live: number; className?: string }) {
  const g = geometryFor(pick, live);
  const row = (label: string, value: string, color?: string) => (
    <div key={label} className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">{label}</span>
      <span className="text-[11px] font-mono tabular-nums" style={{ color: color ?? 'var(--foreground)' }}>{value}</span>
    </div>
  );
  const byKey = (k: Level['key']) => g.levels.find((l) => l.key === k);
  return (
    <Card title="Trade Geometry" className={className}>
      <div className="space-y-1.5 px-4 py-3">
        {row('Stop loss', `${byKey('stop')?.rAway.toFixed(1)}R away`, BEAR)}
        {row('T1 target', `${byKey('t1')?.rAway.toFixed(1)}R away`, BULL)}
        {row('T2 target', `${byKey('t2')?.rAway.toFixed(1)}R away`, BULL)}
        {row('Horizon', `${g.horizonUsedPct.toFixed(0)}% used · ${g.daysHeld.toFixed(1)}/${g.horizonDays}d`)}
      </div>
    </Card>
  );
}

export function RiskReward({ pick, live, className }: { pick: ConvictionPick; live: number; className?: string }) {
  const g = geometryFor(pick, live);
  const riskShare = (g.risk / (g.risk + g.reward)) * 100;
  return (
    <Card title="Risk / Reward" meta="at entry" className={className}>
      <div className="px-4 py-3">
        <div className="mb-2 flex items-baseline gap-1">
          <span className="text-[26px] font-mono font-bold leading-none tabular-nums" style={{ color: CYAN }}>{g.rr.toFixed(2)}</span>
          <span className="text-[12px] font-mono text-muted-foreground/60">: 1</span>
        </div>
        <div className="flex h-1.5 overflow-hidden rounded-full">
          <div style={{ width: `${riskShare}%`, background: BEAR }} />
          <div style={{ width: `${100 - riskShare}%`, background: CYAN }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
          <span>◀ risk</span><span>reward ▶</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">Risk to stop</div>
            <div className="text-[12px] font-mono font-bold tabular-nums" style={{ color: BEAR }}>−${g.risk.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">Reward to T1</div>
            <div className="text-[12px] font-mono font-bold tabular-nums" style={{ color: BULL }}>+${g.reward.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────── PositionSize ──

/**
 * What this trade means for YOUR account. A signal that says "risk $3.37 per share" is
 * abstract; "38 shares, $128 at risk, 1.0% of the account" is a decision. Sized from the
 * user's own account size and max-risk setting — the reason those settings exist.
 */
export function PositionSize({ pick, live, className }: { pick: ConvictionPick; live: number; className?: string }) {
  const g = geometryFor(pick, live);
  const { data: prefs } = useUserPrefs();

  const account = prefs?.accountSize ?? 0;
  const riskPct = prefs?.maxRiskPerTrade ?? 1;
  const riskBudget = (account * riskPct) / 100;

  if (!account || g.risk <= 0) {
    return (
      <Card title="Position Size" meta="your account" className={className}>
        <div className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground/60">
          Set your account size and max risk in Settings and every signal will size itself.
        </div>
      </Card>
    );
  }

  const shares = Math.floor(riskBudget / g.risk);
  const cost = shares * (live || pick.entryPrice);
  const pctOfAccount = account > 0 ? (cost / account) * 100 : 0;
  const rewardAtT1 = shares * g.reward;
  const overAllocated = pctOfAccount > 100;

  return (
    <Card title="Position Size" meta="your account" className={className}>
      <div className="space-y-2 px-4 py-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[24px] font-mono font-bold leading-none tabular-nums" style={{ color: TC.info }}>{shares}</span>
          <span className="text-[11px] font-mono text-muted-foreground/60">shares</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Mini label="Risking" value={`$${Math.min(riskBudget, shares * g.risk).toFixed(0)}`} color={TC.bear} />
          <Mini label="Reward at T1" value={`+$${rewardAtT1.toFixed(0)}`} color={TC.bull} />
          <Mini label="Position cost" value={`$${cost.toFixed(0)}`} />
          <Mini label="Of account" value={`${pctOfAccount.toFixed(1)}%`} color={overAllocated ? TC.bear : undefined} />
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground/70">
          {overAllocated
            ? `This size costs more than your whole account — the stop is tight relative to price, so scale down or use options.`
            : `Sized so a stop-out costs ${riskPct}% of your $${account.toLocaleString()} account.`}
        </p>
      </div>
    </Card>
  );
}

function LayerRow({ layer }: { layer: { label?: string; kind?: string; points: number; why?: string } }) {
  const pos = layer.points >= 0;
  return (
    <div className="flex items-start gap-2">
      <span className="w-7 shrink-0 text-right text-[11px] font-mono font-bold tabular-nums"
            style={{ color: pos ? TC.bull : TC.bear }}>
        {pos ? '+' : ''}{layer.points}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-mono uppercase tracking-wider text-foreground/80">
          {layer.label ?? layer.kind}
        </span>
        {layer.why && (
          <span className="block text-[10px] leading-relaxed text-muted-foreground/70">{layer.why}</span>
        )}
      </span>
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded border border-border/40 px-2 py-1">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">{label}</div>
      <div className="mt-0.5 text-[12px] font-mono font-bold tabular-nums" style={{ color: color ?? 'var(--foreground)' }}>{value}</div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────── ProfitPlan ──

export function ProfitPlan({ pick, live, className }: { pick: ConvictionPick; live: number; className?: string }) {
  const g = geometryFor(pick, live);
  return (
    <Card title="Profit Taking Plan" className={className}>
      <div className="divide-y divide-border/30">
        {g.plan.map((p) => (
          <div key={p.rung} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-6 shrink-0 text-[10px] font-mono font-bold tracking-wider" style={{ color: CYAN }}>{p.rung}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-mono font-bold tabular-nums text-foreground">${money(p.price)}</div>
              <div className="text-[10px] font-mono text-muted-foreground/65">{p.action}</div>
            </div>
            <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider',
              p.active ? 'border-[var(--brand-cyan,#22d3ee)]/40 text-[var(--brand-cyan,#22d3ee)]' : 'border-border/50 text-muted-foreground/70')}>
              {p.active ? 'Active' : 'Pending'}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────── ContextPanel ──

export function ContextPanel({
  pick, live, regime, preferredDirection, className,
}: { pick: ConvictionPick; live: number; regime?: string; preferredDirection?: string; className?: string }) {
  const g = geometryFor(pick, live);
  const dir = pick.direction === 'long' ? 'Long' : 'Short';
  const aligns = preferredDirection ? preferredDirection.toLowerCase().includes(pick.direction) : undefined;

  const todo = (() => {
    switch (g.status) {
      case 'invalidated': return 'Stop is hit — the thesis is broken. Stand down.';
      case 'near_stop':   return `Near invalidation — only ${g.levels.find(l => l.key === 'stop')?.rAway.toFixed(1)}R from the stop.`;
      case 'pending_trigger': {
        const e = g.levels.find(l => l.key === 'entry');
        return `Waiting for entry — ${Math.abs(e?.pctFromLive ?? 0).toFixed(1)}% away at $${money(pick.entryPrice)}.`;
      }
      case 'at_target':   return 'At T1 — scale out 40% and trail the stop to entry.';
      default:            return `In play — ${g.progressPct.toFixed(0)}% of the way to T1, ${g.horizonUsedPct.toFixed(0)}% of the horizon spent.`;
    }
  })();

  return (
    <Card title="Context" meta="what it means" className={className}>
      <div className="space-y-2.5 px-4 py-3">
        <p className="text-[12px] leading-relaxed text-foreground/85">
          <span className="font-mono font-bold" style={{ color: pick.direction === 'long' ? BULL : BEAR }}>{dir} {pick.symbol}</span>
          {' '}— {pick.convictionBand}-band ({bandStrength(pick.convictionBand)}), {pick.layerCount ?? pick.layers?.length ?? 0} layers.
          {' '}R:R 1:{g.rr.toFixed(1)}, risking ${g.risk.toFixed(2)} to make ${g.reward.toFixed(2)} per share.
          {aligns !== undefined && regime && <> {regime} regime {aligns ? 'favors' : 'works against'} {pick.direction}s.</>}
        </p>
        {pick.thesis && <p className="text-[11px] leading-relaxed text-muted-foreground/75">{pick.thesis}</p>}
        <div className="rounded-lg border border-border/40 bg-foreground/[0.03] px-3 py-2">
          <div className="mb-0.5 text-[10px] font-mono uppercase tracking-widest" style={{ color: CYAN }}>What to do now</div>
          <div className="text-[11px] font-mono text-foreground/85">{todo}</div>
        </div>
      </div>
    </Card>
  );
}
