/**
 * GRAVITY NODE LABELS + VELOCITY — structural names for the dealer-gamma
 * nodes, and how fast each node is changing. Pure; used by
 * GET /api/gex/gravity/:symbol (server/gravity-route.ts), the Gravity
 * workspace "Node labels" tool and the chart's node tags.
 *
 *   Apex         the largest positive node in the book read
 *   Gatekeeper   the largest |GEX| node strictly between price and the Apex
 *                (a node price must get through before the Apex)
 *   Rug          below price: a positive node sitting directly over a larger
 *                negative one (a floor that can give way into acceleration)
 *   Trampoline   below price: a negative node directly over a larger positive
 *                one (a fast drop into a strong floor)
 *                (Rug/Trampoline = shared/path-projection.ts structureBadges)
 *   delivered    this session's range already traded through the strike
 *   fresh        not yet traded through today
 *
 *   velocity     change in a node's GEX over 5m / 15m / 1h, as a share of the
 *                largest |GEX| in the current book (so names of different
 *                size compare). From the 5-min intraday snapshots
 *                (GEX_INTRADAY_SNAPSHOTS). A timeframe "moves" when
 *                |Δ| ≥ VELOCITY_MIN of that scale.
 *   Halo         ≥ 2 timeframes move in the SAME direction — the node is
 *                building (or bleeding) consistently, not flickering.
 *
 * Our definitions — structural descriptions, not trade signals.
 */
import { structureBadges } from './path-projection';

export interface GravityNode { strike: number; gex: number }
export type NodeRole = 'apex' | 'gatekeeper' | 'rug' | 'trampoline';
export type VelocityTf = '5m' | '15m' | '1h';
export const VELOCITY_TFS: Array<{ tf: VelocityTf; ms: number }> = [
  { tf: '5m', ms: 5 * 60_000 }, { tf: '15m', ms: 15 * 60_000 }, { tf: '1h', ms: 60 * 60_000 },
];
/** A timeframe counts as moving at ≥ 5 % of the book's largest |GEX|. */
export const VELOCITY_MIN = 0.05;
/** A sample older than the target by more than this is not used (missing ticks are not interpolated). */
const SAMPLE_SLACK_MS = 3 * 60_000;

export interface NodeVelocity {
  /** Δ GEX / max |GEX| per timeframe; null = no sample that far back. */
  v: Record<VelocityTf, number | null>;
  halo: 'building' | 'bleeding' | null;
}
export interface LabelledNode extends GravityNode {
  roles: NodeRole[];
  delivered: boolean | null;
  velocity: NodeVelocity | null;
}
export interface GravityRead {
  spot: number;
  apex: number | null;
  gatekeeper: number | null;
  rug: number | null;
  rugInto: number | null;
  trampoline: number | null;
  nodes: LabelledNode[];
  halos: number;
}

/** Largest |GEX| node strictly between spot and the Apex. Pure. */
export function gatekeeperOf(spot: number, nodes: GravityNode[], apex: number | null): GravityNode | null {
  if (apex == null || apex === spot) return null;
  const lo = Math.min(spot, apex); const hi = Math.max(spot, apex);
  let best: GravityNode | null = null;
  for (const n of nodes) {
    if (n.strike <= lo || n.strike >= hi || n.gex === 0) continue;
    if (!best || Math.abs(n.gex) > Math.abs(best.gex)) best = n;
  }
  return best;
}

export function apexOf(nodes: GravityNode[]): number | null {
  let best: GravityNode | null = null;
  for (const n of nodes) if (n.gex > 0 && (!best || n.gex > best.gex)) best = n;
  return best?.strike ?? null;
}

/** Value of a strike's series at (or just before) `at`, within the slack. Pure. */
function valueAt(points: Array<[number, number]>, at: number): number | null {
  let v: number | null = null; let tv = -Infinity;
  for (const [t, g] of points) if (t <= at && t > tv) { tv = t; v = g; }
  return v != null && at - tv <= SAMPLE_SLACK_MS ? v : null;
}

/**
 * Velocity per strike from a per-strike time series ([t ms, gex] points).
 * `asOf` = the newest sample time. A strike absent from a past sample is
 * treated as 0 there only when that sample exists for OTHER strikes
 * (the snapshot keeps the top nodes; a node entering the top list is new).
 */
export function nodeVelocity(
  series: Array<{ strike: number; points: Array<[number, number]> }>,
  sampleTimes: number[],
  asOf: number,
  scale: number,
): Map<number, NodeVelocity> {
  const out = new Map<number, NodeVelocity>();
  if (!(scale > 0)) return out;
  const hasSample = (at: number) => sampleTimes.some((t) => t <= at && at - t <= SAMPLE_SLACK_MS);
  for (const s of series) {
    const now = valueAt(s.points, asOf + 1) ?? (hasSample(asOf) ? 0 : null);
    if (now == null) continue;
    const v = {} as Record<VelocityTf, number | null>;
    for (const { tf, ms } of VELOCITY_TFS) {
      const past = valueAt(s.points, asOf - ms) ?? (hasSample(asOf - ms) ? 0 : null);
      v[tf] = past == null ? null : (now - past) / scale;
    }
    out.set(s.strike, { v, halo: haloOf(v) });
  }
  return out;
}

/** Halo: ≥ 2 timeframes moving the same way at ≥ VELOCITY_MIN. Building = |GEX| growing. Pure. */
export function haloOf(v: Record<VelocityTf, number | null>, sign = 1): NodeVelocity['halo'] {
  const xs = Object.values(v).filter((x): x is number => x != null && Math.abs(x) >= VELOCITY_MIN);
  const up = xs.filter((x) => x * sign > 0).length; const dn = xs.filter((x) => x * sign < 0).length;
  if (up >= 2 && up > dn) return 'building';
  if (dn >= 2 && dn > up) return 'bleeding';
  return null;
}

/** Labels + velocity for one book read. Pure. */
export function readGravity(inp: {
  spot: number;
  nodes: GravityNode[];
  sessionHigh?: number | null;
  sessionLow?: number | null;
  series?: Array<{ strike: number; points: Array<[number, number]> }>;
  sampleTimes?: number[];
  asOf?: number | null;
}): GravityRead {
  const nodes = inp.nodes.filter((n) => Number.isFinite(n.strike) && Number.isFinite(n.gex) && n.gex !== 0);
  const apex = apexOf(nodes);
  const gk = gatekeeperOf(inp.spot, nodes, apex);
  const badges = structureBadges(inp.spot, nodes);
  const rug = badges.find((b) => b.kind === 'rug') ?? null;
  const tramp = badges.find((b) => b.kind === 'trampoline') ?? null;
  const below = nodes.filter((n) => n.strike < inp.spot).sort((a, b) => b.strike - a.strike);
  const rugInto = rug ? below[below.findIndex((n) => n.strike === rug.price) + 1]?.strike ?? null : null;
  const scale = Math.max(0, ...nodes.map((n) => Math.abs(n.gex)));
  const vel = inp.series && inp.asOf != null ? nodeVelocity(inp.series, inp.sampleTimes ?? [], inp.asOf, scale) : new Map<number, NodeVelocity>();
  const hi = inp.sessionHigh ?? null; const lo = inp.sessionLow ?? null;
  const out: LabelledNode[] = nodes.map((n) => {
    const roles: NodeRole[] = [];
    if (n.strike === apex) roles.push('apex');
    if (gk && n.strike === gk.strike) roles.push('gatekeeper');
    if (rug && n.strike === rug.price) roles.push('rug');
    if (tramp && n.strike === tramp.price) roles.push('trampoline');
    const v0 = vel.get(n.strike) ?? null;
    // halo direction relative to the node's sign: building = |GEX| growing
    const velocity = v0 ? { v: v0.v, halo: haloOf(v0.v, Math.sign(n.gex) || 1) } : null;
    return { ...n, roles, delivered: hi != null && lo != null ? n.strike >= lo && n.strike <= hi : null, velocity };
  }).sort((a, b) => b.strike - a.strike);
  return {
    spot: inp.spot, apex, gatekeeper: gk?.strike ?? null, rug: rug?.price ?? null, rugInto, trampoline: tramp?.price ?? null,
    nodes: out, halos: out.filter((n) => n.velocity?.halo).length,
  };
}

export const ROLE_LABEL: Record<NodeRole, string> = { apex: 'Apex', gatekeeper: 'Gatekeeper', rug: 'Rug', trampoline: 'Trampoline' };
export const fmtVelocity = (x: number | null) => (x == null ? '—' : `${x >= 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)}%`);
