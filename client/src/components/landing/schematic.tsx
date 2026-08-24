/**
 * SCHEMATIC — line-art SVG diagrams that animate on hover.
 *
 * The thing the reference site does that this page did not. Every one of their
 * cards carries a hand-drawn diagram: nodes wired to a hub, a thesis box with
 * labelled spokes, a dashed flow into a document. Not icons, not stock
 * illustration — small technical drawings of the thing being described, in one
 * stroke weight, with mono labels.
 *
 * Their hover motion, read out of their stylesheet verbatim:
 *
 *   @keyframes meetVisDotScan { 0%,100% { opacity:.7; transform:scale(1) }
 *                                 50%   { opacity:1;  transform:scale(1.5) } }
 *   @keyframes meetVisSpoke   { from { stroke-dashoffset:60px } to { 0 } }
 *   @keyframes meetVisFlow    { to   { stroke-dashoffset:-12px } }
 *
 *   .card:hover svg          { transform: scale(1.04) }
 *   circle                   { transform-box: fill-box; transform-origin: 50% }
 *   nth-of-type(N)           { animation-delay: (N-1) × 120ms }   ← dots
 *   nth-of-type(N)           { animation-delay: (N-1) × 80ms  }   ← spokes
 *
 * `transform-box: fill-box` is the load-bearing line. Without it an SVG circle
 * scales about the viewBox origin and flies off the canvas instead of pulsing in
 * place — which is why hand-rolled versions of this effect usually look broken.
 *
 * WHAT THESE DRAW: the pipeline, not the numbers. A diagram of "scanner feeds
 * scorer feeds contract selection" describes how the system is wired, and stays
 * true whether or not the market is open. Anywhere a real MEASUREMENT belongs,
 * it is passed in and rendered as text from live data — never drawn into the
 * path. The counts in these captions come from /api/convictions.
 */
import { useReducedMotion } from 'framer-motion';

const STROKE = 1.2;
const MONO = 'ui-monospace, "JetBrains Mono", monospace';

/** Their exact keyframes, emitted once. Named so nothing else can collide. */
export function SchematicStyles() {
  return (
    <style>{`
      @keyframes qe-dot-scan { 0%,100% { opacity:.7; transform:scale(1) } 50% { opacity:1; transform:scale(1.5) } }
      @keyframes qe-spoke    { from { stroke-dashoffset:60px } to { stroke-dashoffset:0 } }
      @keyframes qe-flow     { to { stroke-dashoffset:-12px } }

      .qe-vis svg { transition: transform .4s cubic-bezier(.2,.8,.2,1); }
      .qe-vis-host:hover .qe-vis svg { transform: scale(1.04); }

      /* fill-box keeps the pulse centred on the dot instead of the viewBox origin */
      .qe-vis circle { transform-box: fill-box; transform-origin: 50%; }

      .qe-vis-host:hover .qe-vis .qe-dot { animation: 1.5s ease-in-out infinite qe-dot-scan; }
      .qe-vis-host:hover .qe-vis .qe-spoke { animation: .9s cubic-bezier(.2,.8,.2,1) forwards qe-spoke; }
      .qe-vis-host:hover .qe-vis .qe-stream { animation: .6s linear infinite qe-flow; }
      .qe-vis .qe-spoke { stroke-dasharray: 60; }

      /* TOUCH: there is no hover, so the second face would be unreachable — and it
         is the half carrying the live numbers. On a pointer-less device the
         preview stops being an overlay and simply joins the card flow beneath the
         schematic. Nothing is hidden behind an interaction the device cannot
         perform. */
      @media (hover: none) {
        .qe-preview {
          position: static;
          opacity: 1;
          visibility: visible;
          padding: 0;
          margin-top: 1.5rem;
          background: transparent;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .qe-vis-host:hover .qe-vis svg { transform: none; }
        .qe-vis-host:hover .qe-vis .qe-dot,
        .qe-vis-host:hover .qe-vis .qe-spoke,
        .qe-vis-host:hover .qe-vis .qe-stream { animation: none; }
      }
    `}</style>
  );
}

function Label({ x, y, children, anchor = 'middle', size = 7, opacity = 0.85 }: {
  x: number; y: number; children: string; anchor?: 'start' | 'middle' | 'end'; size?: number; opacity?: number;
}) {
  return (
    <text
      x={x} y={y} textAnchor={anchor} fontFamily={MONO} fontSize={size}
      fill="currentColor" stroke="none" letterSpacing="1" opacity={opacity}
    >
      {children}
    </text>
  );
}

const frame = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: STROKE,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/**
 * FUNNEL — the scan. A wide field of candidates narrowing to the ones that score.
 * Dot count is fixed at 6 for the drawing; the real numbers are captioned below
 * the card, not encoded in the geometry.
 */
export function ScanSchematic() {
  const dots = [16, 30, 44, 58, 72];
  return (
    <div className="qe-vis" aria-hidden>
      <svg viewBox="0 0 240 88" {...frame} className="w-full">
        {dots.map((y, i) => (
          <circle key={i} className="qe-dot" cx={22} cy={y} r={2.4} fill="currentColor"
            style={{ animationDelay: `${i * 120}ms` }} />
        ))}
        {dots.map((y, i) => (
          <line key={i} className="qe-spoke" x1={26} y1={y} x2={92} y2={44}
            style={{ animationDelay: `${i * 80}ms` }} opacity={0.45} />
        ))}
        <Label x={14} y={10} anchor="start" size={6} opacity={0.6}>UNIVERSE</Label>

        {/* the sieve */}
        <path d="M96 20 L128 40 L128 52 L96 72 Z" opacity={0.9} />
        <Label x={112} y={48} size={6}>SCORE</Label>

        <line className="qe-stream" x1={132} y1={44} x2={182} y2={44} strokeDasharray="3 3" />
        <path d="M178 40 L184 44 L178 48" />

        <rect x={188} y={30} width={40} height={28} rx={2} />
        <line x1={196} y1={40} x2={220} y2={40} opacity={0.55} />
        <line x1={196} y1={48} x2={212} y2={48} opacity={0.35} />
        <Label x={188} y={24} anchor="start" size={6} opacity={0.6}>RANKED</Label>
      </svg>
    </div>
  );
}

/**
 * HUB — the conviction stack. A thesis box with labelled layer families wired in
 * from both sides. This is their `meet-card:nth-child(2)` construction: spokes
 * that draw themselves in on hover, staggered 80ms apart.
 */
export function ConvergenceSchematic({ left, right }: { left: string[]; right: string[] }) {
  const rows = [13, 43, 73];
  return (
    <div className="qe-vis" aria-hidden>
      <svg viewBox="0 0 240 88" {...frame} className="w-full">
        <rect x={100} y={36} width={40} height={16} rx={2} />
        <Label x={120} y={47} size={7}>THESIS</Label>

        {rows.map((y, i) => (
          <line key={`l${i}`} className="qe-spoke" x1={100} y1={44} x2={54} y2={y}
            style={{ animationDelay: `${i * 80}ms` }} />
        ))}
        {rows.map((y, i) => (
          <line key={`r${i}`} className="qe-spoke" x1={140} y1={44} x2={186} y2={y}
            style={{ animationDelay: `${(i + 3) * 80}ms` }} />
        ))}

        {rows.map((y, i) => (
          <rect key={`lb${i}`} x={14} y={y - 7} width={40} height={14} rx={7} opacity={i === 1 ? 0.7 : 0.85} />
        ))}
        {rows.map((y, i) => (
          <rect key={`rb${i}`} x={186} y={y - 7} width={40} height={14} rx={7} opacity={i === 1 ? 0.7 : 0.85} />
        ))}

        <g fontFamily={MONO} fontSize={6} fill="currentColor" stroke="none" textAnchor="middle" letterSpacing="0.5">
          {left.slice(0, 3).map((t, i) => <text key={i} x={34} y={rows[i] + 2}>{t}</text>)}
          {right.slice(0, 3).map((t, i) => <text key={i} x={206} y={rows[i] + 2}>{t}</text>)}
        </g>
      </svg>
    </div>
  );
}

/**
 * CONTRACT — the last mile. Once a thesis exists, the engine still has to choose
 * a strike and an expiry, which is a separate decision with its own filters. The
 * chain is drawn as a ladder with one rung selected.
 */
export function ContractSchematic() {
  const rungs = [18, 30, 42, 54, 66];
  const chosen = 2;
  return (
    <div className="qe-vis" aria-hidden>
      <svg viewBox="0 0 240 88" {...frame} className="w-full">
        <Label x={14} y={10} anchor="start" size={6} opacity={0.6}>CHAIN</Label>
        {rungs.map((y, i) => (
          <g key={i} opacity={i === chosen ? 1 : 0.32}>
            <rect x={14} y={y - 5} width={74} height={10} rx={1} />
            <line x1={22} y1={y} x2={50} y2={y} opacity={0.5} />
          </g>
        ))}
        {/* the selected rung reads out */}
        <line className="qe-stream" x1={92} y1={rungs[chosen]} x2={150} y2={44} strokeDasharray="3 3" />
        <path d="M146 40 L152 44 L146 48" />

        <rect x={156} y={22} width={70} height={44} rx={2} />
        <Label x={191} y={38} size={7}>STRIKE</Label>
        <line x1={166} y1={46} x2={216} y2={46} opacity={0.4} />
        <Label x={191} y={58} size={6} opacity={0.6}>DTE · SPREAD · OI</Label>

        {[0, 1, 2].map((i) => (
          <circle key={i} className="qe-dot" cx={166 + i * 25} cy={72} r={2.2} fill="currentColor"
            style={{ animationDelay: `${i * 120}ms` }} opacity={0.7} />
        ))}
      </svg>
    </div>
  );
}

/**
 * ORBIT — the coverage ring, from their `meet-row` visual. Concentric ellipses
 * with a lit hub and satellites on dashed spokes.
 */
export function CoverageSchematic() {
  const reduce = useReducedMotion();
  const sats = [
    [15, 60], [225, 60], [51, 22], [189, 22], [51, 98], [189, 98],
  ] as const;
  return (
    <div className="qe-vis" aria-hidden>
      <svg viewBox="0 0 240 120" fill="none" stroke="currentColor" strokeWidth={0.9}
        strokeLinecap="round" strokeLinejoin="round" className="w-full">
        <ellipse cx={120} cy={60} rx={105} ry={42} opacity={0.18} />
        <ellipse cx={120} cy={60} rx={68} ry={26} opacity={0.32} />
        <circle cx={120} cy={60} r={14} fill="currentColor" opacity={0.1} stroke="none" />
        <circle cx={120} cy={60} r={5.5} fill="currentColor" stroke="none" />

        <g strokeDasharray="1.5 3" opacity={0.28}>
          {sats.map(([x, y], i) => <line key={i} x1={120} y1={60} x2={x} y2={y} />)}
        </g>
        {sats.map(([x, y], i) => (
          <circle key={i} className={reduce ? undefined : 'qe-dot'} cx={x} cy={y} r={3} fill="currentColor" stroke="none"
            style={{ animationDelay: `${i * 120}ms` }} />
        ))}
        {[[86, 40], [154, 40], [86, 80], [154, 80]].map(([x, y], i) => (
          <circle key={`m${i}`} cx={x} cy={y} r={2.2} fill="currentColor" stroke="none" opacity={0.7} />
        ))}
      </svg>
    </div>
  );
}
