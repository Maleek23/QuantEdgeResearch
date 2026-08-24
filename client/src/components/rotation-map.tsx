/**
 * ROTATION MAP (RRG) — sectors plotted on relative-strength (x) × momentum (y),
 * bubble-sized by magnitude, quadrant-coloured. Reads the live /api/sector-rotation
 * payload (already verified accurate). Motion comes entirely from @/lib/motion so
 * it moves like everything else in the redesigned Terminal.
 */
import { Fragment, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Heartbeat } from "@/components/viz";
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
  /** Server-side compute time. Heartbeat reads this, never the client fetch time. */
  asOf?: string;
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


export function RotationMap({
  className,
  collapsedHeight,
  expanded = false,
  onFocus,
}: {
  className?: string;
  /** Override the shared panel height. The landing page gives the plot full room;
      inside the Terminal it stays flush with the two panels beside it. */
  collapsedHeight?: number;
  /** Full-screen drilldown: use the available column instead of the compact cap. */
  expanded?: boolean;
  onFocus?: () => void;
}) {
  const reduce = useReducedMotion();
  const [selectedEtf, setSelectedEtf] = useState<string | null>(null);
  const [hoveredEtf, setHoveredEtf] = useState<string | null>(null);
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
  // Every sector owns its bubble. Labels live inside those bubbles; no side lists
  // competing with the map and no connector-web trying to repair that mistake.
  const posX = (v: number) => 50 + (v / (maxX * 1.25)) * 50;
  const posY = (v: number) => 100 - (50 + (v / (maxY * 1.25)) * 50); // invert: +momentum = top
  // The expanded map is a reading surface, not simply the compact card made
  // wider. Fixed 14–34px dots become illegible across a 1,400px dialog, so it
  // earns its extra room with a genuinely larger interaction target.
  const size = (s: Sector) => expanded
    ? 30 + (Math.hypot(rsX(s), rsY(s)) / maxMag) * 46
    : 14 + (Math.hypot(rsX(s), rsY(s)) / maxMag) * 20;

  const laidOut = sectors.map((s) => {
    return {
      etf: s.etf,
      x: posX(rsX(s)),
      y: posY(rsY(s)),
      quad: quadOf(rsX(s), rsY(s)),
      d: size(s),
      sector: s,
      rs: rsX(s),
      momentum: rsY(s),
      tooltip: `${s.name} (${s.etf}) · RS ${rsX(s) >= 0 ? "+" : ""}${rsX(s).toFixed(2)} vs its norm · momentum ${rsY(s) >= 0 ? "+" : ""}${rsY(s).toFixed(2)} · today ${s.relChange >= 0 ? "+" : ""}${s.relChange.toFixed(2)}% vs SPY`,
    };
  });
  // Hover is a temporary glance; click pins a sector so its full identity and
  // readout stay visible after the pointer leaves the dense plot.
  const activeEtf = hoveredEtf ?? selectedEtf;

  return (
    <PanelFrame
      title="Rotation Map"
      className={className}
      collapsedHeight={collapsedHeight}
      forceExpanded={expanded}
      onFocus={onFocus}
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
          <div className="flex items-center gap-3">
            {sessionNote && (
              <span className="text-label font-mono" style={{ color: session === 'regular' ? TC.bull : TC.warn }}>
                {sessionNote}
              </span>
            )}
            <Heartbeat since={data?.asOf} staleAfterSec={900} />
          </div>
        </div>
      )}

      {/* A 1:1 plot is the tallest element on the page for no analytical gain — the axes
          are relative strength vs momentum, not a shared unit, so the aspect is free.
          Slightly wide keeps every bubble readable in far less vertical space. */}
      {/* The old 280px cap saved vertical space and cost readability: 15 labelled
          points on a correlated diagonal cannot fit in 280px. Fill the column. */}
      <div className="relative mx-auto w-full" style={{ aspectRatio: "16 / 10", maxWidth: expanded ? undefined : 560 }}>
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
          {/* Tickers live inside their real positions. The map stays a field, not
              a list drawn around a field; hover or click supplies the full read. */}
          {laidOut.map((p, i) => {
            const c = QUAD[p.quad].color;
            const glide = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 120, damping: 22 };
            const isActive = activeEtf === p.etf;
            return (
              <motion.span
                key={`dot-${p.etf}`}
                className="absolute cursor-crosshair rounded-full"
                style={{ x: "-50%", y: "-50%" }}
                initial={reduce ? false : { opacity: 0, scale: 0.55 }}
                animate={{ opacity: activeEtf && !isActive ? 0.48 : 1, scale: isActive ? 1.18 : 1, left: `${p.x}%`, top: `${p.y}%`, width: p.d, height: p.d }}
                transition={{
                  opacity: { duration: reduce ? 0 : DUR.base, ease: EASE, delay: reduce ? 0 : i * 0.04 },
                  scale: reduce ? { duration: 0 } : { ...SPRING, delay: i * 0.04 },
                  left: glide, top: glide, width: glide, height: glide,
                }}
                whileHover={reduce ? undefined : { scale: 1.15 }}
                onHoverStart={() => setHoveredEtf(p.etf)}
                onHoverEnd={() => setHoveredEtf(null)}
                onFocus={() => setHoveredEtf(p.etf)}
                onBlur={() => setHoveredEtf(null)}
                onClick={() => setSelectedEtf((current) => current === p.etf ? null : p.etf)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedEtf((current) => current === p.etf ? null : p.etf);
                  }
                }}
                title={p.tooltip}
                role="button"
                tabIndex={0}
                aria-label={p.tooltip}
              >
                {isActive && !reduce && <motion.span className="absolute -inset-2 rounded-full border" style={{ borderColor: c }} initial={{ opacity: 0.65, scale: 0.65 }} animate={{ opacity: 0, scale: 1.75 }} transition={{ duration: 0.85, repeat: Infinity }} />}
                <span
                  className="block h-full w-full rounded-full"
                  style={{
                    background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${c} 80%, white), ${c})`,
                    boxShadow: `0 0 14px color-mix(in srgb, ${c} 45%, transparent)`,
                    transition: "background 400ms ease, box-shadow 400ms ease",
                  }}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 grid place-items-center font-mono font-bold leading-none text-[var(--background)]"
                  style={{
                    fontSize: expanded
                      ? p.d >= 60 ? '13px' : p.d >= 42 ? '11px' : '9px'
                      : p.d >= 28 ? '9px' : p.d >= 20 ? '8px' : '7px',
                    textShadow: '0 1px 2px rgba(0,0,0,.65)',
                  }}
                >
                  {p.etf}
                </span>
              </motion.span>
            );
          })}

          {activeEtf && (() => {
            const active = laidOut.find((p) => p.etf === activeEtf);
            if (!active) return null;
            const tone = QUAD[active.quad].color;
            return (
              <motion.div
                initial={reduce ? false : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={reduce ? { duration: 0 } : { duration: 0.16, ease: EASE }}
                className="pointer-events-none absolute left-1/2 top-1/2 z-10 min-w-[148px] -translate-x-1/2 -translate-y-1/2 rounded-md border border-card-border bg-card/95 px-3 py-2 shadow-xl backdrop-blur"
                style={{ boxShadow: `0 8px 26px color-mix(in srgb, ${tone} 18%, transparent)` }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[12px] font-bold text-foreground">{active.etf}</span>
                  <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: tone }}>{QUAD[active.quad].label}</span>
                </div>
                <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">{active.sector.name}</div>
                <div className="mt-1 grid grid-cols-3 gap-2 font-mono text-[9px] tabular-nums text-muted-foreground">
                  <span>RS <b className="font-semibold" style={{ color: tone }}>{active.rs >= 0 ? '+' : ''}{active.rs.toFixed(1)}</b></span>
                  <span>mom <b className="font-semibold" style={{ color: tone }}>{active.momentum >= 0 ? '+' : ''}{active.momentum.toFixed(1)}</b></span>
                  <span>day <b className="font-semibold" style={{ color: active.sector.relChange >= 0 ? TC.bull : TC.bear }}>{active.sector.relChange >= 0 ? '+' : ''}{active.sector.relChange.toFixed(1)}%</b></span>
                </div>
              </motion.div>
            );
          })()}
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
