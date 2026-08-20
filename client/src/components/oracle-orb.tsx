/**
 * ORACLE ORB — the regime centerpiece. A living orb whose colour + label reflect
 * the market backdrop (risk-on / transition / risk-off), so you set bias before
 * you look at a single ticker. Continuous ambient pulse (the "alive" feel) +
 * colour-shifts as the regime changes, all reduced-motion aware.
 *
 * v1 derives regime from the SPY tape (honest + always-on); enrich later with
 * breadth / VIX / rotation leadership.
 */
import { motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { TC } from "@/lib/oracle/trading-colors";

/**
 * The regime is not one number. The desk reads each asset class separately —
 * "neutral on everything outside of crypto... bullish on the dollar" — because a
 * bid in bonds or gold while equities chop is the whole story. Each proxy is a
 * liquid ETF so the read is live and honest.
 */
const CLASSES = [
  { key: 'equities', label: 'EQUITIES', symbol: 'SPY',     invert: false },
  { key: 'bonds',    label: 'BONDS',    symbol: 'TLT',     invert: false },
  { key: 'dollar',   label: 'DOLLAR',   symbol: 'UUP',     invert: false },
  { key: 'metals',   label: 'METALS',   symbol: 'GLD',     invert: false },
  { key: 'crypto',   label: 'CRYPTO',   symbol: 'BTC-USD', invert: false },
] as const;

/** A move is only a stance once it clears the noise band. */
function stanceOf(changePct: number): { label: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; color: string } {
  if (changePct > 0.3) return { label: 'BULLISH', color: TC.bull };
  if (changePct < -0.3) return { label: 'BEARISH', color: TC.bear };
  return { label: 'NEUTRAL', color: TC.muted };
}

interface RotationData {
  spyChange: number; headline?: string; sessionLabel?: string; isStale?: boolean;
}

function regimeOf(spy: number) {
  if (spy > 0.3) return { label: "RISK-ON", color: "var(--trade-bullish, #22c55e)", sub: "Buyers in control" };
  if (spy < -0.3) return { label: "RISK-OFF", color: "var(--trade-bearish, #ef4444)", sub: "Defense on" };
  return { label: "TRANSITION", color: "#d4a72c", sub: "No clear edge" };
}

export function OracleOrb({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const { data } = useQuery<RotationData>({
    queryKey: ["/api/sector-rotation"],
    queryFn: async () => {
      const r = await fetch("/api/sector-rotation", { credentials: "include" });
      if (!r.ok) throw new Error("rotation failed");
      return r.json();
    },
    staleTime: 60_000, refetchInterval: 120_000, retry: 1,
  });

  // Which session are we actually in, and who's moving in it? Outside 9:30-16:00 the
  // regular tape is frozen, so the orb would otherwise show a stale "TRANSITION" all
  // night while pre-market names gap. This makes the regime honest about its own clock.
  const { data: ext } = useQuery<{
    session: 'pre' | 'regular' | 'post' | 'closed';
    gainers: { symbol: string; changePct: number }[];
    losers: { symbol: string; changePct: number }[];
    assetClasses: { key: string; label: string; changePct: number | null; stance: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null }[];
    interpretation: string;
  }>({
    queryKey: ["/api/extended-hours", "orb"],
    queryFn: async () => {
      const r = await fetch("/api/extended-hours?limit=5", { credentials: "include" });
      if (!r.ok) throw new Error("ext failed");
      return r.json();
    },
    staleTime: 120_000, refetchInterval: 180_000, retry: 1,
  });

  const { data: tape } = useQuery<Record<string, { price: number; changePercent: number }>>({
    queryKey: ["/api/quotes/batch", "regime-classes"],
    queryFn: async () => {
      const syms = CLASSES.map((c) => c.symbol).join(",");
      const res = await fetch(`/api/quotes/batch/${syms}`, { credentials: "include" });
      if (!res.ok) throw new Error("tape failed");
      const body = await res.json();
      return body?.quotes ?? body;
    },
    staleTime: 60_000, refetchInterval: 120_000, retry: 1,
  });

  // Prefer the extended-hours read (one reliable sweep); fall back to the batch tape.
  const classReads = (ext?.assetClasses?.length ? ext.assetClasses : CLASSES.map((c) => {
    const q = tape?.[c.symbol];
    const chg = typeof q?.changePercent === "number" ? q.changePercent : null;
    return { key: c.key, label: c.label, changePct: chg, stance: chg == null ? null : stanceOf(chg).label };
  })).map((c: any) => ({
    key: c.key,
    label: c.label,
    changePct: c.changePct as number | null,
    stance: c.stance ? (typeof c.stance === 'string'
      ? { label: c.stance, color: c.stance === 'BULLISH' ? TC.bull : c.stance === 'BEARISH' ? TC.bear : TC.muted }
      : c.stance) : null,
  }));
  const known = classReads.filter((c) => c.stance);
  const bullCount = known.filter((c) => c.stance!.label === "BULLISH").length;
  const bearCount = known.filter((c) => c.stance!.label === "BEARISH").length;

  const spy = data?.spyChange ?? 0;
  const r = regimeOf(spy);

  return (
    <div className={cn("rounded-xl border border-card-border bg-card overflow-hidden", className)}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">Oracle</span>
        <span className="text-[10px] font-mono text-muted-foreground/60">Market regime</span>
      </div>

      {/* Horizontal, not stacked. The orb was a tall column of mostly padding in a row
          that has to sit alongside two other panels — the sphere reads just as well at
          88px beside the text as it did at 160px above it. */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="relative grid shrink-0 place-items-center" style={{ width: 88, height: 88 }}>
          {/* pulsing halo rings */}
          {!reduce && [0, 1].map((i) => (
            <motion.span
              key={i}
              className="absolute rounded-full"
              style={{ width: 72, height: 72, background: `radial-gradient(circle, color-mix(in srgb, ${r.color} 42%, transparent), transparent 70%)` }}
              animate={{ scale: [1, 1.4, 1], opacity: [0.55, 0, 0.55] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: i * 1.7 }}
            />
          ))}
          {/* core */}
          <motion.span
            className="rounded-full grid place-items-center"
            style={{
              width: 56, height: 56,
              background: `radial-gradient(circle at 35% 28%, color-mix(in srgb, ${r.color} 72%, white), ${r.color})`,
              boxShadow: `0 0 44px color-mix(in srgb, ${r.color} 55%, transparent)`,
              transition: "background 600ms ease, box-shadow 600ms ease",
            }}
            animate={reduce ? {} : { scale: [1, 1.05, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="text-[12px] font-mono font-bold tracking-widest text-white" style={{ textShadow: "0 1px 6px rgba(0,0,0,.45)" }}>
              {r.label.split("-")[0]}
            </span>
          </motion.span>
        </div>

        {/* regime + the per-class read share ONE column beside the sphere. Previously the
            class grid was a flex SIBLING of this text, so the two overlapped. */}
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-mono font-bold tracking-widest" style={{ color: r.color, transition: "color 400ms ease" }}>
            {r.label}
          </div>
          <div className="mt-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
            {r.sub} · SPY {spy >= 0 ? "+" : ""}{spy.toFixed(2)}%{data?.isStale ? ` · ${data.sessionLabel} · stale` : ""}
          </div>

          {known.length > 0 && (
            <div className="mt-2 border-t border-border/30 pt-1.5">
              <div className="mb-1 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                <span>By asset class</span>
                <span>
                  <span style={{ color: TC.bull }}>{bullCount} bull</span>
                  {" · "}
                  <span style={{ color: TC.bear }}>{bearCount} bear</span>
                </span>
              </div>
              <div className="grid grid-cols-1 gap-x-3 gap-y-0.5">
              {classReads.map((c) => (
                <div key={c.key} className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/65">{c.label}</span>
                  {c.stance ? (
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-[10px] font-mono tabular-nums text-muted-foreground/70">
                        {c.changePct! >= 0 ? "+" : ""}{c.changePct!.toFixed(2)}%
                      </span>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color: c.stance.color }}>
                        {c.stance.label}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">—</span>
                  )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Everything below is full-width block content. It was previously sitting INSIDE the
          horizontal flex row as siblings of the sphere, which is what made the regime text,
          the asset classes and the movers pile on top of each other. */}
      <div className="space-y-2 px-3 pb-2.5">
        {/* live session + who's moving in it */}
        {ext && (
          <div className="border-t border-border/30 pt-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                {ext.session === 'pre' ? 'Pre-market' : ext.session === 'post' ? 'After-hours'
                  : ext.session === 'regular' ? 'Live session' : 'Overnight'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider"
                    style={{ color: ext.session === 'regular' ? TC.bull : ext.session === 'closed' ? TC.muted : TC.warn }}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {ext.session === 'closed' ? 'closed' : 'open'}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {(ext.gainers ?? []).slice(0, 3).map((g) => (
                <span key={g.symbol} className="text-[10px] font-mono tabular-nums" style={{ color: TC.bull }}>
                  {g.symbol} +{g.changePct.toFixed(1)}%
                </span>
              ))}
              {(ext.losers ?? []).slice(0, 2).map((l) => (
                <span key={l.symbol} className="text-[10px] font-mono tabular-nums" style={{ color: TC.bear }}>
                  {l.symbol} {l.changePct.toFixed(1)}%
                </span>
              ))}
            </div>
          </div>
        )}

        {data?.headline && (
          <p className="border-t border-border/30 pt-2 text-[10px] font-mono leading-snug text-muted-foreground/70">
            {data.headline}
          </p>
        )}
      </div>
    </div>
  );
}
