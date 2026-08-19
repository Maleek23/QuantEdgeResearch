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

  const spy = data?.spyChange ?? 0;
  const r = regimeOf(spy);

  return (
    <div className={cn("rounded-xl border border-card-border bg-card overflow-hidden", className)}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">Oracle</span>
        <span className="text-[10px] font-mono text-muted-foreground/60">Market regime</span>
      </div>

      <div className="relative flex flex-col items-center justify-center py-8 gap-4">
        <div className="relative grid place-items-center" style={{ width: 160, height: 160 }}>
          {/* pulsing halo rings */}
          {!reduce && [0, 1].map((i) => (
            <motion.span
              key={i}
              className="absolute rounded-full"
              style={{ width: 130, height: 130, background: `radial-gradient(circle, color-mix(in srgb, ${r.color} 42%, transparent), transparent 70%)` }}
              animate={{ scale: [1, 1.4, 1], opacity: [0.55, 0, 0.55] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: i * 1.7 }}
            />
          ))}
          {/* core */}
          <motion.span
            className="rounded-full grid place-items-center"
            style={{
              width: 100, height: 100,
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

        <div className="text-center">
          <div className="text-[15px] font-mono font-bold tracking-widest" style={{ color: r.color, transition: "color 400ms ease" }}>
            {r.label}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 mt-0.5">
            {r.sub} · SPY {spy >= 0 ? "+" : ""}{spy.toFixed(2)}%{data?.isStale ? ` · ${data.sessionLabel} · stale` : ""}
          </div>
        </div>

        {data?.headline && (
          <p className="text-[10px] font-mono text-muted-foreground/70 text-center max-w-[86%] leading-snug px-4">
            {data.headline}
          </p>
        )}
      </div>
    </div>
  );
}
