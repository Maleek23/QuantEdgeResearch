/**
 * ROTATION MAP (RRG) — sectors plotted on relative-strength (x) × momentum (y),
 * bubble-sized by magnitude, quadrant-coloured. Reads the live /api/sector-rotation
 * payload (already verified accurate). Motion comes entirely from @/lib/motion so
 * it moves like everything else in the redesigned Terminal.
 */
import { motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { EASE, SPRING, DUR } from "@/lib/motion";

interface Sector {
  etf: string; name: string; relChange: number; fiveDayChange: number; state: string; rank: number;
}
interface RotationData {
  sectors: Sector[]; spyChange: number; sessionLabel: string; isStale: boolean;
}

const QUAD = {
  leading:   { label: "LEADING",   sub: "Strong momentum",      color: "var(--trade-bullish, #22c55e)" },
  improving: { label: "IMPROVING", sub: "Momentum accelerating", color: "#2dd4bf" },
  weakening: { label: "WEAKENING", sub: "Momentum fading",       color: "#d4a72c" },
  lagging:   { label: "LAGGING",   sub: "Weak momentum",         color: "var(--trade-bearish, #ef4444)" },
} as const;

type QuadKey = keyof typeof QUAD;
function quadOf(x: number, y: number): QuadKey {
  if (x >= 0 && y >= 0) return "leading";
  if (x < 0 && y >= 0) return "improving";
  if (x >= 0 && y < 0) return "weakening";
  return "lagging";
}

export function RotationMap({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const { data, isLoading, isError } = useQuery<RotationData>({
    queryKey: ["/api/sector-rotation"],
    queryFn: async () => {
      const r = await fetch("/api/sector-rotation", { credentials: "include" });
      if (!r.ok) throw new Error("rotation failed");
      return r.json();
    },
    staleTime: 60_000, refetchInterval: 120_000, retry: 1,
  });

  const sectors = data?.sectors ?? [];
  const maxX = Math.max(0.5, ...sectors.map((s) => Math.abs(s.relChange)));
  const maxY = Math.max(0.5, ...sectors.map((s) => Math.abs(s.fiveDayChange)));
  const maxMag = Math.max(1, ...sectors.map((s) => Math.hypot(s.relChange, s.fiveDayChange)));
  // value → 0..100% within the plot, centre (0) = 50%, 1.25x padding off the edges.
  const posX = (v: number) => 50 + (v / (maxX * 1.25)) * 50;
  const posY = (v: number) => 100 - (50 + (v / (maxY * 1.25)) * 50); // invert: +momentum = top
  const size = (s: Sector) => 20 + (Math.hypot(s.relChange, s.fiveDayChange) / maxMag) * 26;

  return (
    <div className={cn("rounded-xl border border-card-border bg-card overflow-hidden", className)}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-foreground/80">Rotation Map</span>
        <span className="text-[10px] font-mono text-muted-foreground/60">
          x · relative strength&nbsp;&nbsp;y · momentum{data?.isStale ? ` · ${data.sessionLabel} · stale` : ""}
        </span>
      </div>

      <div className="relative w-full" style={{ aspectRatio: "1 / 1" }}>
        {isLoading && (
          <div className="absolute inset-0 grid place-items-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50">
            reading rotation…
          </div>
        )}
        {isError && (
          <div className="absolute inset-0 grid place-items-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50">
            rotation unavailable
          </div>
        )}

        {/* axes + faint field */}
        <div className="absolute inset-3 rounded-lg"
             style={{ background: "radial-gradient(ellipse at center, color-mix(in srgb, var(--foreground) 4%, transparent), transparent 72%)" }} />
        <div className="absolute left-1/2 top-3 bottom-3 w-px bg-border/50" />
        <div className="absolute top-1/2 left-3 right-3 h-px bg-border/50" />

        {/* quadrant labels */}
        <QLabel pos="tl" q={QUAD.improving} />
        <QLabel pos="tr" q={QUAD.leading} />
        <QLabel pos="bl" q={QUAD.lagging} />
        <QLabel pos="br" q={QUAD.weakening} />

        {/* bubbles — position AND size animate live as the rotation data refetches,
            so sectors glide to their new RS/momentum spot every update, not just on mount. */}
        <div className="absolute inset-3">
          {sectors.map((s, i) => {
            const q = quadOf(s.relChange, s.fiveDayChange);
            const c = QUAD[q].color;
            const d = size(s);
            const glide = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 120, damping: 22 };
            return (
              <motion.div
                key={s.etf}
                className="absolute flex items-center gap-1.5"
                style={{ x: "-50%", y: "-50%" }}
                initial={reduce ? false : { opacity: 0, scale: 0.55 }}
                animate={{ opacity: 1, scale: 1, left: `${posX(s.relChange)}%`, top: `${posY(s.fiveDayChange)}%` }}
                transition={{
                  opacity: { duration: reduce ? 0 : DUR.base, ease: EASE, delay: reduce ? 0 : i * 0.04 },
                  scale: reduce ? { duration: 0 } : { ...SPRING, delay: i * 0.04 },
                  left: glide, top: glide,
                }}
                whileHover={reduce ? undefined : { scale: 1.08 }}
                title={`${s.name} (${s.etf}) · RS ${s.relChange >= 0 ? "+" : ""}${s.relChange.toFixed(2)} vs SPY · 5d ${s.fiveDayChange >= 0 ? "+" : ""}${s.fiveDayChange.toFixed(1)}%`}
              >
                <motion.span
                  className="rounded-full shrink-0"
                  animate={{ width: d, height: d }}
                  transition={glide}
                  style={{
                    background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${c} 80%, white), ${c})`,
                    boxShadow: `0 0 14px color-mix(in srgb, ${c} 45%, transparent)`,
                    transition: "background 400ms ease, box-shadow 400ms ease",
                  }}
                />
                <span className="pointer-events-none whitespace-nowrap">
                  <span className="block text-[10px] font-mono font-bold text-foreground/90 leading-none">{s.etf}</span>
                  <span className="block text-[9px] font-mono leading-none mt-0.5" style={{ color: c, transition: "color 400ms ease" }}>
                    {s.fiveDayChange >= 0 ? "+" : ""}{s.fiveDayChange.toFixed(1)}%
                  </span>
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* legend */}
      <div className="flex items-center justify-center gap-4 py-2 border-t border-border/40 flex-wrap">
        {Object.values(QUAD).map((q) => (
          <span key={q.label} className="inline-flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
            <span className="h-2 w-2 rounded-full" style={{ background: q.color }} /> {q.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function QLabel({ pos, q }: { pos: "tl" | "tr" | "bl" | "br"; q: { label: string; sub: string; color: string } }) {
  const place = {
    tl: "top-3 left-3 text-left", tr: "top-3 right-3 text-right",
    bl: "bottom-3 left-3 text-left", br: "bottom-3 right-3 text-right",
  }[pos];
  return (
    <div className={cn("absolute pointer-events-none", place)}>
      <div className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color: q.color }}>{q.label}</div>
      <div className="text-[8px] font-mono uppercase tracking-wide text-muted-foreground/50">{q.sub}</div>
    </div>
  );
}
