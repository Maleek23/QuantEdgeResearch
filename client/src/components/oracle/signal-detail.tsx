/**
 * ORACLE signal-detail widgets — the MomoEdge grammar over QuantEdge's real pick data.
 *
 *   PriceLadder     — vertical STOP / ENTRY / LIVE / T1 rungs, each with $, signed %,
 *                     and distance "away" from the live price. Placement is by price,
 *                     so it's direction-agnostic (a short's target simply sits lower).
 *   ConfidenceBars  — four honest, derived sub-scores (Conviction / Progress / R:R /
 *                     Structure) as animated bars + a band-anchored setup number.
 *   ContextPanel    — the interpreting sentence(s): what the numbers mean + WHAT TO DO NOW.
 *
 * Nothing here invents intelligence; every value is derived from the ConvictionPick the
 * engine already produced. Motion comes from the shared system.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { convictionPercent, bandStrength, type ConvictionPick } from '@/lib/convictions';
import { EASE, DUR } from '@/lib/motion';
import { cn } from '@/lib/utils';

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const money = (n: number) => (n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toFixed(2));

/** How far live has travelled entry → target (direction-aware), 0–100. */
function progressPct(p: ConvictionPick, live: number) {
  if (!live || !p.entryPrice || !p.targetPrice) return 0;
  const span = p.direction === 'long' ? p.targetPrice - p.entryPrice : p.entryPrice - p.targetPrice;
  const done = p.direction === 'long' ? live - p.entryPrice : p.entryPrice - live;
  if (span <= 0) return 0;
  return clamp((done / span) * 100);
}

// ─────────────────────────────────────────────────────────────── PriceLadder ──

type Role = 'target' | 'live' | 'entry' | 'stop';
const ROLE: Record<Role, { color: string; label: string }> = {
  target: { color: 'var(--trade-bullish, #22c55e)', label: 'TARGET · T1' },
  live:   { color: 'var(--brand-cyan, #22d3ee)',    label: 'LIVE' },
  entry:  { color: 'var(--foreground, #e6edf3)',    label: 'ENTRY' },
  stop:   { color: 'var(--trade-bearish, #ef4444)', label: 'STOP' },
};

export function PriceLadder({ pick, live, className }: { pick: ConvictionPick; live: number; className?: string }) {
  const reduce = useReducedMotion();
  const rungs = ([
    { role: 'target' as Role, price: pick.targetPrice },
    { role: 'live' as Role,   price: live },
    { role: 'entry' as Role,  price: pick.entryPrice },
    { role: 'stop' as Role,   price: pick.stopLoss },
  ]).filter((r) => Number.isFinite(r.price) && r.price > 0);

  const prices = rungs.map((r) => r.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const span = max - min || 1;
  const y = (p: number) => 8 + (1 - (p - min) / span) * 84; // % from top; padded 8/8
  const rel = (p: number) => (live > 0 ? ((p - live) / live) * 100 : 0);

  const ordered = [...rungs].sort((a, b) => b.price - a.price);

  return (
    <div className={cn('rounded-xl border border-card-border bg-card overflow-hidden', className)}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">Price Ladder</span>
        <span className="text-[10px] font-mono text-muted-foreground/60">stop · entry · live · target</span>
      </div>
      <div className="relative px-4" style={{ height: 200 }}>
        {/* spine */}
        <div className="absolute left-[46%] top-3 bottom-3 w-px bg-border/60" />
        {ordered.map((r) => {
          const meta = ROLE[r.role];
          const pct = rel(r.price);
          const isLive = r.role === 'live';
          return (
            <motion.div
              key={r.role}
              className="absolute left-4 right-4 flex items-center"
              style={{ top: `${y(r.price)}%`, transform: 'translateY(-50%)' }}
              initial={reduce ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: DUR.base, ease: EASE }}
            >
              {/* label (left of spine) */}
              <div className="w-[42%] pr-3 text-right">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: meta.color }}>
                  {meta.label}
                </span>
              </div>
              {/* dot on spine */}
              <span className="relative grid place-items-center" style={{ width: 16 }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px color-mix(in srgb, ${meta.color} 60%, transparent)` }} />
                {isLive && !reduce && (
                  <motion.span
                    className="absolute h-2.5 w-2.5 rounded-full"
                    style={{ background: meta.color }}
                    animate={{ scale: [1, 2.4, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </span>
              {/* price + distance (right of spine) */}
              <div className="flex-1 pl-3 flex items-baseline gap-2">
                <span className="text-[13px] font-mono font-bold tabular-nums text-foreground">${money(r.price)}</span>
                {!isLive && (
                  <span className="text-[10px] font-mono tabular-nums" style={{ color: pct >= 0 ? 'var(--trade-bullish,#22c55e)' : 'var(--trade-bearish,#ef4444)' }}>
                    {pct >= 0 ? '+' : ''}{pct.toFixed(1)}% · {Math.abs(pct).toFixed(1)}% away
                  </span>
                )}
                {isLive && <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">current</span>}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── ConfidenceBars ──

export function ConfidenceBars({ pick, live, className }: { pick: ConvictionPick; live: number; className?: string }) {
  const reduce = useReducedMotion();
  const conviction = convictionPercent(pick.convictionScore);
  const progress = progressPct(pick, live);
  const rr = clamp(((pick.riskRewardRatio ?? 0) / 3) * 100); // 3:1 reads as full
  const structure = clamp(((pick.layerCount ?? pick.layers?.length ?? 0) / 13) * 100);

  const bars = [
    { label: 'CONVICTION', v: conviction, hint: `${pick.convictionBand}-band · ${bandStrength(pick.convictionBand)}` },
    { label: 'PROGRESS',   v: progress,   hint: 'entry → target' },
    { label: 'RISK / REWARD', v: rr,      hint: `1 : ${(pick.riskRewardRatio ?? 0).toFixed(1)}` },
    { label: 'STRUCTURE',  v: structure,  hint: `${pick.layerCount ?? pick.layers?.length ?? 0} layers` },
  ];

  return (
    <div className={cn('rounded-xl border border-card-border bg-card overflow-hidden', className)}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">Confidence Index</span>
        <span className="text-[13px] font-mono font-bold tabular-nums" style={{ color: 'var(--brand-cyan,#22d3ee)' }}>{conviction}</span>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">{b.label}</span>
              <span className="text-[10px] font-mono tabular-nums text-muted-foreground/50">{b.hint}</span>
            </div>
            <div className="h-1.5 rounded-full bg-foreground/8 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--brand-cyan,#22d3ee) 55%, transparent), var(--brand-cyan,#22d3ee))' }}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${b.v}%` }}
                transition={{ duration: DUR.slow, ease: EASE }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── ContextPanel ──

export function ContextPanel({
  pick, live, regime, preferredDirection, className,
}: {
  pick: ConvictionPick; live: number; regime?: string; preferredDirection?: string; className?: string;
}) {
  const dir = pick.direction === 'long' ? 'Long' : 'Short';
  const awayEntry = pick.entryPrice > 0 && live > 0 ? ((live - pick.entryPrice) / pick.entryPrice) * 100 : 0;
  const belowAbove = live < pick.entryPrice ? 'below' : 'above';
  const prog = progressPct(pick, live);

  // regime alignment (honest — only if we know the regime)
  const aligns = preferredDirection ? preferredDirection.toLowerCase().includes(pick.direction) : undefined;

  // what-to-do-now, derived from where live sits
  const todo = (() => {
    const past = pick.direction === 'long' ? live >= pick.entryPrice : live <= pick.entryPrice;
    const nearStop = pick.direction === 'long' ? live <= pick.stopLoss * 1.01 : live >= pick.stopLoss * 0.99;
    if (nearStop) return 'Near invalidation — live is at the stop. Bias is broken here.';
    if (!past) return `Waiting for entry — live is ${Math.abs(awayEntry).toFixed(1)}% ${belowAbove} the ${pick.entryPrice ? '$' + money(pick.entryPrice) : 'trigger'}.`;
    if (prog >= 90) return 'At target — manage the runner or trim into T1.';
    return `In play — ${prog.toFixed(0)}% of the way to T1.`;
  })();

  return (
    <div className={cn('rounded-xl border border-card-border bg-card overflow-hidden', className)}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">Context</span>
        <span className="text-[10px] font-mono text-muted-foreground/60">what it means</span>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        <p className="text-[12px] leading-relaxed text-foreground/85">
          <span className="font-mono font-bold" style={{ color: pick.direction === 'long' ? 'var(--trade-bullish,#22c55e)' : 'var(--trade-bearish,#ef4444)' }}>{dir} {pick.symbol}</span>
          {' '}— {pick.convictionBand}-band ({bandStrength(pick.convictionBand)}), {pick.layerCount ?? pick.layers?.length ?? 0} layers aligned.
          {' '}Risk:reward 1:{(pick.riskRewardRatio ?? 0).toFixed(1)}.
          {aligns !== undefined && regime && (
            <> {regime} regime {aligns ? 'favors' : 'works against'} {pick.direction}s.</>
          )}
        </p>
        {pick.thesis && (
          <p className="text-[11px] leading-relaxed text-muted-foreground/75">{pick.thesis}</p>
        )}
        <div className="rounded-lg border border-border/40 bg-foreground/[0.03] px-3 py-2">
          <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--brand-cyan,#22d3ee)] mb-0.5">What to do now</div>
          <div className="text-[11px] font-mono text-foreground/85">{todo}</div>
        </div>
      </div>
    </div>
  );
}
