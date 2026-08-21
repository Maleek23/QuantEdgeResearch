/**
 * ROTATION MAP (RRG) — sectors plotted on relative-strength (x) × momentum (y),
 * bubble-sized by magnitude, quadrant-coloured. Reads the live /api/sector-rotation
 * payload (already verified accurate). Motion comes entirely from @/lib/motion so
 * it moves like everything else in the redesigned Terminal.
 */
import { Fragment } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { EASE, SPRING, DUR } from "@/lib/motion";
import { TC } from "@/lib/oracle/trading-colors";
import { PanelFrame } from "@/components/oracle/panel-frame";

interface Sector {
  etf: string; name: string; relChange: number; fiveDayChange: number; state: string; rank: number;
  /** True RRG axes — see SectorFlow in server/sector-rotation.ts. */
  rsRatio: number | null; rsMomentum: number | null;
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


/**
 * LABEL DE-COLLISION.
 *
 * Relative strength and 5-day momentum are usually highly correlated, so on most
 * days the 15 sectors collapse onto a near-diagonal line rather than spreading
 * across four quadrants. When five ETFs land within a few percent of each other
 * their labels stack into an unreadable smear — which is exactly what the plot
 * was doing at its old 280px cap.
 *
 * Fix in two parts: give the plot real width, and lay the labels out properly.
 * Each label is assigned to the side its bubble leans toward (so the cluster fans
 * outward instead of inward), then a 1-D greedy pass pushes same-side labels apart
 * until they clear a minimum gap. A label pushed off its bubble gets a connector
 * line, so displacement never costs you the ability to tell which dot it names.
 */
const LABEL_GAP = 10; // % of plot height — one label row plus breathing room

function layoutLabels(points: { etf: string; x: number; y: number }[]) {
  // Labels go in two fixed GUTTERS at the edges of the plot, not floating beside
  // their dots. Two earlier attempts failed for the same underlying reason: when
  // the sectors lie on a diagonal, any label placed adjacent to its dot lands on
  // the next dot up the line — offsetting sideways or alternating sides just moves
  // the collision around. Parking labels at the edges takes them out of the bubble
  // band entirely, and a leader line preserves which dot each one names.
  // Side is chosen by which edge the dot is already nearer, so leaders never cross
  // the plot.
  const sides = points.map((p) => ({ ...p, side: p.x >= 50 ? ('right' as const) : ('left' as const) }));

  // The corners carry the quadrant captions (LEADING / LAGGING / …), so the label
  // band stops short of the top and bottom rather than stacking on top of them.
  const TOP = 14;
  const BOTTOM = 90;

  const placed: Record<string, number> = {};
  for (const side of ['left', 'right'] as const) {
    const group = sides.filter((p) => p.side === side).sort((a, b) => a.y - b.y);
    let lastY = -Infinity;
    for (const p of group) {
      // Never place a label above the previous one plus a full gap.
      const y = Math.max(p.y, lastY + LABEL_GAP, TOP);
      placed[p.etf] = y;
      lastY = y;
    }
    // If the greedy pass ran past the bottom, slide the whole group back up so
    // nothing escapes the plot rather than clipping the last few. Compressing the
    // gap is the fallback when even a flush stack cannot fit the available band.
    const overflow = lastY - BOTTOM;
    if (overflow > 0) {
      const span = BOTTOM - TOP;
      const gap = Math.min(LABEL_GAP, span / Math.max(1, group.length - 1));
      group.forEach((p, i) => { placed[p.etf] = TOP + i * gap; });
    }
  }

  return sides.map((p) => ({ ...p, labelY: placed[p.etf] ?? p.y }));
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

  // Rotation is computed on regular-session closes, so overnight it correctly reports
  // the last close. Rather than just labelling itself "stale", say WHICH session we're in
  // and when it refreshes — stale data with a clock is information; without one it looks broken.
  const { data: ext } = useQuery<{ session: 'pre' | 'regular' | 'post' | 'closed' }>({
    queryKey: ["/api/extended-hours", "rotation-session"],
    queryFn: async () => {
      const r = await fetch("/api/extended-hours?limit=1", { credentials: "include" });
      if (!r.ok) throw new Error("session failed");
      return r.json();
    },
    staleTime: 180_000, refetchInterval: 300_000, retry: 1,
  });
  const session = ext?.session;
  const sessionNote =
    session === 'regular' ? 'updating live'
    : session === 'pre' ? 'refreshes at the open · pre-market is live in Oracle'
    : session === 'post' ? 'settled for the day'
    : session === 'closed' ? 'refreshes at the next open'
    : null;

  // Plot only sectors we could compute true RRG coordinates for. The axes are
  // rsRatio (strength vs SPY relative to its own norm) and rsMomentum (whether that
  // strength is building). Plotting relChange vs fiveDayChange correlated at 0.998 —
  // the same number twice — which is why every sector used to sit on one diagonal.
  const sectors = (data?.sectors ?? []).filter(
    (s) => s.rsRatio != null && s.rsMomentum != null,
  );
  const rsX = (s: Sector) => s.rsRatio ?? 0;
  const rsY = (s: Sector) => s.rsMomentum ?? 0;
  const maxX = Math.max(0.5, ...sectors.map((s) => Math.abs(rsX(s))));
  const maxY = Math.max(0.5, ...sectors.map((s) => Math.abs(rsY(s))));
  const maxMag = Math.max(1, ...sectors.map((s) => Math.hypot(rsX(s), rsY(s))));
  // value → 0..100% within the plot, centre (0) = 50%, 1.25x padding off the edges.
  const posX = (v: number) => 50 + (v / (maxX * 1.25)) * 50;
  const posY = (v: number) => 100 - (50 + (v / (maxY * 1.25)) * 50); // invert: +momentum = top
  const size = (s: Sector) => 14 + (Math.hypot(rsX(s), rsY(s)) / maxMag) * 20;

  // Positions first, then the label layout pass over them.
  const laidOut = layoutLabels(
    sectors.map((s) => ({ etf: s.etf, x: posX(rsX(s)), y: posY(rsY(s)) })),
  ).map((p) => {
    const s = sectors.find((x) => x.etf === p.etf)!;
    return {
      ...p,
      quad: quadOf(rsX(s), rsY(s)),
      d: size(s),
      mom: rsX(s),
      tooltip: `${s.name} (${s.etf}) · RS ${rsX(s) >= 0 ? "+" : ""}${rsX(s).toFixed(2)} vs its norm · momentum ${rsY(s) >= 0 ? "+" : ""}${rsY(s).toFixed(2)} · today ${s.relChange >= 0 ? "+" : ""}${s.relChange.toFixed(2)}% vs SPY`,
    };
  });

  return (
    <PanelFrame
      title="Rotation Map"
      className={className}
      right={
        <span className="text-label font-mono text-muted-foreground">
          x · rel strength&nbsp;&nbsp;y · building{data?.isStale ? " · stale" : ""}
        </span>
      }
    >

      {(data?.isStale || sessionNote) && (
        <div className="flex items-center justify-between border-b border-border/30 px-4 py-1.5">
          <span className="text-label font-mono uppercase tracking-wider text-muted-foreground/70">
            {data?.sessionLabel ?? 'last close'}
          </span>
          {sessionNote && (
            <span className="text-label font-mono" style={{ color: session === 'regular' ? TC.bull : TC.warn }}>
              {sessionNote}
            </span>
          )}
        </div>
      )}

      {/* A 1:1 plot is the tallest element on the page for no analytical gain — the axes
          are relative strength vs momentum, not a shared unit, so the aspect is free.
          Slightly wide keeps every bubble readable in far less vertical space. */}
      {/* The old 280px cap saved vertical space and cost readability: 15 labelled
          points on a correlated diagonal cannot fit in 280px. Fill the column. */}
      <div className="relative mx-auto w-full" style={{ aspectRatio: "16 / 10", maxWidth: 560 }}>
        {isLoading && (
          <div className="absolute inset-0 grid place-items-center text-label font-mono uppercase tracking-widest text-muted-foreground/70">
            reading rotation…
          </div>
        )}
        {isError && (
          <div className="absolute inset-0 grid place-items-center text-label font-mono uppercase tracking-widest text-muted-foreground">
            rotation unavailable
          </div>
        )}
        {/* The plot needs ~50 daily closes per ETF to compute RS. If that history is
            missing the map would otherwise render as an empty grid, which looks like a
            calm market rather than absent data. */}
        {!isLoading && !isError && sectors.length === 0 && (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <span className="text-label font-mono text-muted-foreground">
              Not enough daily history to compute relative strength yet — the map fills in
              once the ETF price history loads.
            </span>
          </div>
        )}

        {/* axes + faint field */}
        <div className="absolute inset-3 rounded-lg"
             style={{ background: "radial-gradient(ellipse at center, color-mix(in srgb, var(--foreground) 4%, transparent), transparent 72%)" }} />
        <div className="absolute left-1/2 top-3 bottom-3 w-px bg-border/50" />
        <div className="absolute top-1/2 left-3 right-3 h-px bg-border/50" />

        {/* AXIS SCALE. Without ticks the plot shows only relative arrangement — you
            can see that XLE is further right than SMH but not by how much, and a dot
            hugging the edge looks extreme whether it's 1% or 15% off the benchmark.
            Ticks are drawn at the data's own quartiles so they stay meaningful as the
            spread changes, instead of at fixed values that go off-scale on a wide day. */}
        {sectors.length > 0 && (
          <>
            {[-0.66, -0.33, 0.33, 0.66].map((f) => {
              const vx = f * maxX * 1.25;
              const vy = f * maxY * 1.25;
              return (
                <Fragment key={f}>
                  <span
                    className="absolute text-label font-mono tabular-nums text-muted-foreground/60 pointer-events-none"
                    style={{ left: `${posX(vx)}%`, top: "calc(50% + 3px)", transform: "translateX(-50%)" }}
                  >
                    {vx > 0 ? "+" : ""}{vx.toFixed(1)}
                  </span>
                  <span
                    className="absolute text-label font-mono tabular-nums text-muted-foreground/60 pointer-events-none"
                    style={{ top: `${posY(vy)}%`, left: "calc(50% + 4px)", transform: "translateY(-50%)" }}
                  >
                    {vy > 0 ? "+" : ""}{vy.toFixed(1)}
                  </span>
                </Fragment>
              );
            })}
          </>
        )}

        {/* quadrant labels */}
        <QLabel pos="tl" q={QUAD.improving} />
        <QLabel pos="tr" q={QUAD.leading} />
        <QLabel pos="bl" q={QUAD.lagging} />
        <QLabel pos="br" q={QUAD.weakening} />

        {/* bubbles — position AND size animate live as the rotation data refetches,
            so sectors glide to their new RS/momentum spot every update, not just on mount. */}
        <div className="absolute inset-x-12 inset-y-6">
          {/* Bubbles and labels are laid out SEPARATELY: the dot marks the true
              RS/momentum coordinate and never moves, while the label is allowed to
              slide along its side to escape a neighbour. A connector line ties a
              displaced label back to its dot. */}
          <svg className="absolute inset-0 h-full w-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
            {laidOut.map((p) => {
              return (
                <line
                  key={`ldr-${p.etf}`}
                  x1={p.x} y1={p.y}
                  x2={p.side === "right" ? 100 : 0} y2={p.labelY}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  strokeWidth={0.25}
                  opacity={0.5}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>

          {/* the dots — true position, always */}
          {laidOut.map((p, i) => {
            const c = QUAD[p.quad].color;
            const glide = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 120, damping: 22 };
            return (
              <motion.span
                key={`dot-${p.etf}`}
                className="absolute rounded-full"
                style={{ x: "-50%", y: "-50%" }}
                initial={reduce ? false : { opacity: 0, scale: 0.55 }}
                animate={{ opacity: 1, scale: 1, left: `${p.x}%`, top: `${p.y}%`, width: p.d, height: p.d }}
                transition={{
                  opacity: { duration: reduce ? 0 : DUR.base, ease: EASE, delay: reduce ? 0 : i * 0.04 },
                  scale: reduce ? { duration: 0 } : { ...SPRING, delay: i * 0.04 },
                  left: glide, top: glide, width: glide, height: glide,
                }}
                whileHover={reduce ? undefined : { scale: 1.15 }}
                title={p.tooltip}
              >
                <span
                  className="block h-full w-full rounded-full"
                  style={{
                    background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${c} 80%, white), ${c})`,
                    boxShadow: `0 0 14px color-mix(in srgb, ${c} 45%, transparent)`,
                    transition: "background 400ms ease, box-shadow 400ms ease",
                  }}
                />
              </motion.span>
            );
          })}

          {/* the labels — nudged to stay legible */}
          {laidOut.map((p, i) => {
            const c = QUAD[p.quad].color;
            const glide = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 120, damping: 22 };
            return (
              <motion.div
                key={`lbl-${p.etf}`}
                className="absolute pointer-events-none whitespace-nowrap"
                style={{
                  y: "-50%",
                  x: p.side === "right" ? 0 : "-100%",
                  textAlign: p.side === "right" ? "left" : "right",
                }}
                initial={reduce ? false : { opacity: 0 }}
                animate={{
                  opacity: 1,
                  left: p.side === "right" ? "100%" : "0%",
                  top: `${p.labelY}%`,
                }}
                transition={{
                  opacity: { duration: reduce ? 0 : DUR.base, ease: EASE, delay: reduce ? 0 : i * 0.04 },
                  left: glide, top: glide,
                }}
              >
                <span className="block text-label font-mono font-bold text-foreground leading-none">{p.etf}</span>
                <span className="block text-label font-mono leading-none mt-0.5" style={{ color: c, transition: "color 400ms ease" }}>
                  {p.mom >= 0 ? "+" : ""}{p.mom.toFixed(1)}%
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* legend */}
      <div className="flex items-center justify-center gap-4 py-2 border-t border-border/40 flex-wrap">
        {Object.values(QUAD).map((q) => (
          <span key={q.label} className="inline-flex items-center gap-1.5 text-label font-mono uppercase tracking-wider text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: q.color }} /> {q.label}
          </span>
        ))}
      </div>
    </PanelFrame>
  );
}

function QLabel({ pos, q }: { pos: "tl" | "tr" | "bl" | "br"; q: { label: string; sub: string; color: string } }) {
  const place = {
    tl: "top-3 left-3 text-left", tr: "top-3 right-3 text-right",
    bl: "bottom-3 left-3 text-left", br: "bottom-3 right-3 text-right",
  }[pos];
  return (
    <div className={cn("absolute pointer-events-none", place)}>
      <div className="text-label font-mono font-bold uppercase tracking-widest" style={{ color: q.color }}>{q.label}</div>
      <div className="text-label font-mono uppercase tracking-wide text-muted-foreground/70">{q.sub}</div>
    </div>
  );
}
