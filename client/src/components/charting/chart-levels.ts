/**
 * CHART LEVELS — pure helpers (no React, no fetch) for the price lines the
 * full chart draws from /api/levels and the dealer map. Unit-tested in
 * scripts/test-spx-chart.ts.
 */
import { pickWalls } from '../../../../shared/gex-wall-basis';

export interface LevelMember { price: number; kind: string; label: string; source: string; asOf: string }
export interface LevelMapPayload {
  symbol: string; asOf: string; last: number | null; session: string | null; priorSession: string | null;
  notes: string[]; clusters: Array<{ price: number; members: LevelMember[] }>;
}

/** The session levels the chart draws, in draw order: [kind, short label, palette role]. */
const KEY_LEVEL_KINDS: Array<[string, string, string]> = [
  ['pdh', 'PDH', 'info'], ['pdl', 'PDL', 'info'], ['pdc', 'PDC', 'dim'],
  ['or15_high', 'ORH 15m', 'marker'], ['or15_low', 'ORL 15m', 'marker'],
  ['premkt_high', 'PMH', 'caution'], ['premkt_low', 'PML', 'caution'],
];

/**
 * Prior-day H/L/C, the 15-minute opening range and the pre-market H/L from a
 * level-map payload, as dashed price lines. A cash index has no pre-market of
 * its own: the server supplies an ES-based overnight H/L under the same kinds
 * with an "overnight" label, and the short label says ONH/ONL instead.
 */
export function pickKeyLevels(map: LevelMapPayload | undefined | null): Array<{ price: number; color: string; label: string; dashed: true; source: string }> {
  if (!map) return [];
  const members = map.clusters.flatMap((c) => c.members);
  const out: Array<{ price: number; color: string; label: string; dashed: true; source: string }> = [];
  for (const [kind, short, color] of KEY_LEVEL_KINDS) {
    const m = members.find((x) => x.kind === kind);
    if (!m || !Number.isFinite(m.price)) continue;
    const overnight = /overnight/i.test(m.label);
    const label = overnight ? short.replace('PM', 'ON') : short;
    out.push({ price: m.price, color, label, dashed: true, source: `${m.label} · ${m.source}` });
  }
  return out;
}

/**
 * Dealer walls for the chart, on the platform's one wall basis
 * (shared/gex-wall-basis.ts pickWalls): the next-7-day book when it has a wall,
 * else the all-expiry walls labelled as the fallback. When the near book is
 * used, the all-expiry walls are added dashed and labelled "all" where they
 * differ — SPX's all-expiry walls sit on far round strikes (8,000 / 7,000).
 */
export function dealerWallLines(snap: {
  callWall?: number | null; putWall?: number | null; zeroGammaLevel?: number | null; gammaFlipPrice?: number | null;
  byDte?: unknown;
} | null | undefined): { rows: Array<{ price: number; color: string; label: string; kind: 'gex-anchor'; dashed?: boolean }>; basis: string } {
  if (!snap) return { rows: [], basis: '' };
  const allFlip = snap.zeroGammaLevel ?? snap.gammaFlipPrice ?? null;
  const w = pickWalls({ callWall: snap.callWall, putWall: snap.putWall, flip: allFlip, byDte: snap.byDte });
  const rows: Array<{ price: number; color: string; label: string; kind: 'gex-anchor'; dashed?: boolean }> = [];
  const push = (price: number | null | undefined, color: string, label: string, dashed?: boolean) => {
    if (price == null || !Number.isFinite(price)) return;
    if (rows.some((r) => Math.abs(r.price - price) < 1e-6)) return;
    rows.push({ price, color, label, kind: 'gex-anchor', ...(dashed ? { dashed } : {}) });
  };
  push(w.callWall, 'call', `CALL WALL ${w.basisShort}`);
  push(w.putWall, 'put', `PUT WALL ${w.basisShort}`);
  push(w.flip, 'caution', `ZERO-γ ${w.basisShort}`);
  if (w.basis === 'next7') {
    push(snap.callWall, 'call', 'CALL WALL all', true);
    push(snap.putWall, 'put', 'PUT WALL all', true);
    push(allFlip, 'caution', 'ZERO-γ all', true);
    return { rows, basis: `${w.basisLabel} · all-expiry dashed` };
  }
  return { rows, basis: w.basisLabel };
}
