/**
 * CHART LEVELS — pure helpers (no React, no fetch) for the price lines the
 * full chart draws from /api/levels and the dealer map. Unit-tested in
 * scripts/test-spx-chart.ts.
 */

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
 * Dealer walls for the chart: the near-dated book (expiries ≤ 7 days,
 * byDte.next7) first, because the all-expiry walls on SPX sit on far round
 * strikes that say nothing about this week; all-expiry walls are added, dashed
 * and labelled "all", only where they differ. Without a near book the
 * all-expiry walls are drawn and labelled as such.
 */
export function dealerWallLines(snap: {
  callWall?: number | null; putWall?: number | null; zeroGammaLevel?: number | null; gammaFlipPrice?: number | null;
  byDte?: Record<string, { callWall: number | null; putWall: number | null; gammaFlipPrice: number | null; expirationsCount?: number } | undefined>;
} | null | undefined): { rows: Array<{ price: number; color: string; label: string; kind: 'gex-anchor'; dashed?: boolean }>; basis: string } {
  if (!snap) return { rows: [], basis: '' };
  const near = snap.byDte?.next7;
  const allZero = snap.zeroGammaLevel ?? snap.gammaFlipPrice ?? null;
  const rows: Array<{ price: number; color: string; label: string; kind: 'gex-anchor'; dashed?: boolean }> = [];
  const push = (price: number | null | undefined, color: string, label: string, dashed?: boolean) => {
    if (price == null || !Number.isFinite(price)) return;
    if (rows.some((r) => Math.abs(r.price - price) < 1e-6)) return;
    rows.push({ price, color, label, kind: 'gex-anchor', ...(dashed ? { dashed } : {}) });
  };
  if (near) {
    push(near.callWall, 'call', 'CALL WALL 0–7d');
    push(near.putWall, 'put', 'PUT WALL 0–7d');
    push(near.gammaFlipPrice, 'caution', 'ZERO-γ 0–7d');
    push(snap.callWall, 'call', 'CALL WALL all', true);
    push(snap.putWall, 'put', 'PUT WALL all', true);
    push(allZero, 'caution', 'ZERO-γ all', true);
    return { rows, basis: `0–7d book (${near.expirationsCount ?? '?'} expiries) · all-expiry dashed` };
  }
  push(snap.callWall, 'call', 'CALL WALL all');
  push(snap.putWall, 'put', 'PUT WALL all');
  push(allZero, 'caution', 'ZERO-γ all');
  return { rows, basis: 'all expiries (no 0–7d book in this read)' };
}

