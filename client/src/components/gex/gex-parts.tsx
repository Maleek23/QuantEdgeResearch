/**
 * GEX view parts drawn by both the GEX hub and the GEX dashboard tools —
 * moved here verbatim from gex-hub-nexus.tsx so there is one drawing of each.
 *
 *   GammaProfileChart     net GEX re-priced across hypothetical spots (zero-γ)
 *   DealerStructureRail   put wall … zero-γ … call wall on a price axis + spot
 *   GexCellDrill          strike × expiry cell drill-down (modal)
 *   GammaViewSeg          Raw | Δ-adj | Side by side toggle (docs/GAMMA_RAW_VS_ADJUSTED.md)
 *   GammaLevelsCompare    the levels under raw vs Δ-adjusted (and flow-signed zero-γ), with what moves
 */
import { useEffect, useRef } from 'react';
import type { GEXSnapshot, StrikeExpiryCell } from '@shared/gex-types';
import { exposureText, fmtGexB, fmtVexM } from './gex-colors';
import { fmtCell, cellValue, GAMMA_VIEWS, type CellMetric, type GammaView } from './gex-model';
import { LEVEL_LABELS, type GammaMetricLevels } from '@shared/gex-adjusted';

const mono = "'JetBrains Mono',monospace";

export function GammaProfileChart({ snap, spot, zeroGamma, height = 86, idSuffix = 'hub' }: { snap: GEXSnapshot; spot: number; zeroGamma: number | null; height?: number; idSuffix?: string }) {
  const pts = snap.gammaProfile ?? [];
  if (pts.length <= 2) return null;
  const W = 280; const H = height; const pad = 4;
  const xs = pts.map((p) => p.spot); const ys = pts.map((p) => p.netGEX);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs);
  const yMax = Math.max(1e-12, ...ys.map((v) => Math.abs(v)));
  const X = (v: number) => pad + ((v - x0) / (x1 - x0)) * (W - 2 * pad);
  const Y = (v: number) => H / 2 - (v / yMax) * (H / 2 - pad);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.spot).toFixed(1)},${Y(p.netGEX).toFixed(1)}`).join(' ');
  const area = `${line} L${X(x1).toFixed(1)},${H / 2} L${X(x0).toFixed(1)},${H / 2} Z`;
  const above = `gp-above-${idSuffix}`; const below = `gp-below-${idSuffix}`;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Net GEX across hypothetical spot prices">
        <defs>
          <clipPath id={above}><rect x="0" y="0" width={W} height={H / 2} /></clipPath>
          <clipPath id={below}><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
        </defs>
        <path d={area} fill="color-mix(in srgb, var(--cyan) 22%, transparent)" clipPath={`url(#${above})`} />
        <path d={area} fill="color-mix(in srgb, var(--red) 22%, transparent)" clipPath={`url(#${below})`} />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--nx-border-hi)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={line} fill="none" stroke="var(--text-dim)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        {zeroGamma != null && zeroGamma >= x0 && zeroGamma <= x1 && <line x1={X(zeroGamma)} x2={X(zeroGamma)} y1={pad} y2={H - pad} stroke="var(--amber)" strokeDasharray="3 2" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />}
        {spot > 0 && spot >= x0 && spot <= x1 && <line x1={X(spot)} x2={X(spot)} y1={pad} y2={H - pad} stroke="var(--text)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: mono, fontSize: 'var(--fs-9, 9px)', color: 'var(--text-mute)' }}>
        <span>${x0.toFixed(0)}</span>
        <span><span style={{ color: 'var(--text)' }}>│</span> spot · <span style={{ color: 'var(--amber)' }}>┆</span> zero-γ{zeroGamma != null ? ` $${zeroGamma.toFixed(2)}` : ' none'}</span>
        <span>${x1.toFixed(0)}</span>
      </div>
      <div style={{ fontFamily: mono, fontSize: 'var(--fs-9, 9px)', color: 'var(--text-mute)', marginTop: 2 }}>
        <span style={{ color: 'var(--cyan-bright)' }}>blue</span> = dealers long gamma at that price · <span style={{ color: 'var(--red)' }}>vermilion</span> = short gamma
      </div>
    </>
  );
}

/** putWall … zeroGamma … callWall on a price axis with the live spot marker. */
export function DealerStructureRail({ snap, spot, zeroGamma, negGamma, names = false }: { snap: GEXSnapshot; spot: number; zeroGamma: number | null; negGamma: boolean;
  /** label the ticks by name only — the caller prints the prices in its own cards */
  names?: boolean }) {
  if (!(snap.putWall || snap.callWall || zeroGamma)) return null;
  const pts = [snap.putWall, zeroGamma, snap.callWall, spot].filter((v): v is number => Number.isFinite(v as number));
  const lo = Math.min(...pts) * 0.995; const hi = Math.max(...pts) * 1.005;
  const X = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const flip = zeroGamma;
  // Which side of zero-γ is negative depends on the book's profile: colour the
  // side spot is on by the regime, the other side by its opposite.
  const leftNeg = flip != null && spot < flip ? negGamma : !negGamma;
  return (
    <div style={{ margin: '10px 0 4px', padding: '14px 10px 4px', position: 'relative' }}>
      <div style={{ position: 'relative', height: 6, borderRadius: 3, background: flip != null ? `linear-gradient(90deg, color-mix(in srgb, ${leftNeg ? 'var(--red)' : 'var(--cyan)'} 32%, transparent) ${X(flip)}, color-mix(in srgb, ${leftNeg ? 'var(--cyan)' : 'var(--red)'} 32%, transparent) ${X(flip)})` : `color-mix(in srgb, ${negGamma ? 'var(--red)' : 'var(--cyan)'} 15%, transparent)` }} title="Bar colour: blue = positive-gamma side (dealers stabilise), vermilion = negative-gamma side (dealers amplify)">
        {snap.putWall != null && <div title={`Put wall $${snap.putWall}`} style={{ position: 'absolute', left: X(snap.putWall), top: -4, width: 2, height: 14, background: 'var(--red)', boxShadow: '0 0 6px var(--red)' }} />}
        {flip != null && <div title={`Zero-gamma level $${flip.toFixed(2)}`} style={{ position: 'absolute', left: X(flip), top: -6, width: 2, height: 18, background: 'var(--amber)', boxShadow: '0 0 8px var(--amber)' }} />}
        {snap.callWall != null && <div title={`Call wall $${snap.callWall}`} style={{ position: 'absolute', left: X(snap.callWall), top: -4, width: 2, height: 14, background: 'var(--cyan)', boxShadow: '0 0 6px var(--cyan)' }} />}
        {spot > 0 && <div title={`Spot $${spot.toFixed(2)}`} style={{ position: 'absolute', left: X(spot), top: -3, width: 8, height: 12, borderRadius: 2, background: 'var(--text)', boxShadow: '0 0 8px rgba(255,255,255,0.5)', transform: 'translateX(-4px)' }} />}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: mono, fontSize: 'var(--fs-9, 9px)', color: 'var(--text-mute)' }}>
        <span style={{ color: 'var(--red)' }}>{names ? 'put wall' : `P ${snap.putWall != null ? `$${Math.round(snap.putWall)}` : '—'}`}</span>
        <span style={{ color: 'var(--amber)' }}>{names ? 'zero-γ' : `zero-γ ${flip != null ? `$${flip.toFixed(1)}` : '—'}`}</span>
        <span style={{ color: 'var(--cyan-bright)' }}>{names ? 'call wall' : `C ${snap.callWall != null ? `$${Math.round(snap.callWall)}` : '—'}`}</span>
      </div>
    </div>
  );
}

/** Strike × expiry cell drill-down: the cell's share of its strike and its expiry. */
export function GexCellDrill({ drill, matrix, metric, spot, symbol, onClose }: {
  drill: StrikeExpiryCell; matrix: StrikeExpiryCell[]; metric: CellMetric; spot: number; symbol: string; onClose: () => void;
}) {
  const strikeCells = matrix.filter((m) => m.strike === drill.strike);
  const expiryCells = matrix.filter((m) => m.dte === drill.dte);
  const val = (c: StrikeExpiryCell) => cellValue(c, metric);
  const strikeTotal = strikeCells.reduce((a, c) => a + val(c), 0);
  const expiryTotal = expiryCells.reduce((a, c) => a + val(c), 0);
  const v = val(drill);
  const dist = spot ? ((drill.strike - spot) / spot) * 100 : null;
  // a real dialog: focus moves in, Escape closes from anywhere, focus returns to the cell
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); back?.focus?.(); };
  }, [onClose]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center' }} onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} role="dialog" aria-modal="true" aria-label={`${symbol} $${drill.strike} ${drill.expiryLabel} drill-down`}>
      <div style={{ width: 320, background: 'linear-gradient(135deg, var(--panel-solid), var(--panel-2))', border: '1px solid var(--nx-border-hi)', borderRadius: 10, padding: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 16 }}>{symbol} ${drill.strike}</div>
          <div style={{ fontFamily: mono, fontSize: 'var(--fs-10, 10px)', color: 'var(--text-dim)' }}>{drill.expiryLabel} · {drill.dte}d</div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close drill-down" title="Close (Esc)"
            style={{ marginLeft: 8, minWidth: 32, minHeight: 32, border: '1px solid var(--nx-border-hi)', borderRadius: 6, background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>✕</button>
        </div>
        {[
          ['net GEX', `${fmtGexB(drill.netGEX)}/1%`],
          ...(typeof drill.netGEXAdj === 'number' ? [['Δ-adj GEX', `${fmtGexB(drill.netGEXAdj)}/1%`]] : []),
          ['net VEX', `${fmtVexM(drill.netVEX ?? 0)}/IV pt`],
          ['vs spot', dist != null ? `${dist >= 0 ? '+' : ''}${dist.toFixed(1)}%` : '—'],
          [`share of $${drill.strike} strike`, strikeTotal !== 0 ? `${((v / strikeTotal) * 100).toFixed(0)}% of ${fmtCell(strikeTotal, metric)}` : '—'],
          [`share of ${drill.expiryLabel} expiry`, expiryTotal !== 0 ? `${((v / expiryTotal) * 100).toFixed(0)}% of ${fmtCell(expiryTotal, metric)}` : '—'],
        ].map(([k, val2]) => (
          <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px dashed color-mix(in srgb, var(--cyan) 8%, transparent)', fontFamily: mono, fontSize: 11 }}>
            <span style={{ color: 'var(--text-mute)', textTransform: 'uppercase', fontSize: 'var(--fs-9, 9px)', letterSpacing: 0.5 }}>{k}</span>
            <span style={{ fontWeight: 700, color: k === 'net GEX' ? exposureText('gex', drill.netGEX) : k === 'Δ-adj GEX' ? exposureText('gex', drill.netGEXAdj ?? 0) : k === 'net VEX' ? exposureText('vex', drill.netVEX ?? 0) : undefined }}>{val2}</span>
          </div>
        ))}
        <div style={{ marginTop: 10, fontSize: 'var(--fs-9, 9px)', color: 'var(--text-mute)', fontFamily: mono, fontStyle: 'italic' }}>listed-chain node · Esc, ✕ or click away to close</div>
      </div>
    </div>
  );
}

/**
 * Raw | Δ-adj | Side by side. `allowBoth` is false on a phone (no room for
 * two columns per expiry); `available` is false when the payload carries no
 * Δ-adjusted cells (CBOE-fallback path) — the buttons then say why.
 */
export function GammaViewSeg({ view, onChange, allowBoth = true, available = true, className = 'of-seg' }: {
  view: GammaView; onChange: (v: GammaView) => void; allowBoth?: boolean; available?: boolean; className?: string;
}) {
  const opts = GAMMA_VIEWS.filter((o) => allowBoth || o.id !== 'both');
  return (
    <div className={className} role="group" aria-label="Gamma definition">
      {opts.map((o) => (
        <button key={o.id} type="button" className={view === o.id ? 'on' : ''} aria-pressed={view === o.id}
          disabled={!available && o.id !== 'raw'}
          onClick={() => onChange(o.id)}
          title={!available && o.id !== 'raw' ? 'This chain source did not carry Δ-adjusted values (CBOE fallback or a cached payload) — raw only' : o.title}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** $B dealer trade → words: + = buy, − = sell. */
const tradeTxt = (b: number) => `${b < 0 ? 'sell' : 'buy'} ${fmtGexB(Math.abs(b)).replace(/^\+/, '')}`;

const lvFmt = (k: keyof Omit<GammaMetricLevels, 'keyStrikes'>, l: GammaMetricLevels | undefined) => {
  if (!l) return '—';
  if (k === 'kingNode') return l.kingNode ? `$${l.kingNode.strike} ${l.kingNode.dte}d` : '—';
  if (k === 'zeroGamma') return l.zeroGamma != null ? `$${l.zeroGamma.toFixed(2)}` : 'none ±20%';
  const v = l[k] as number | null;
  return v != null ? `$${v}` : '—';
};

/**
 * Levels under each gamma definition, one line: what stays, what moves.
 * Raw is the headline; Δ-adjusted re-prices delta at spot ±1%; flow-signed
 * only re-signs opened near-dated OTM calls (so only its zero-γ/king can move).
 */
export function GammaLevelsCompare({ snap, view }: { snap: GEXSnapshot | undefined | null; view: GammaView }) {
  const gm = snap?.gammaMetrics;
  if (!gm) return <div className="gx-view-note">Δ-adjusted levels: not carried by this chain source — raw only.</div>;
  const keys: Array<keyof Omit<GammaMetricLevels, 'keyStrikes'>> = ['callWall', 'putWall', 'maxGammaStrike', 'kingNode', 'zeroGamma'];
  const moved = new Set(gm.differs.deltaAdjusted);
  const flowZ = gm.flowSigned.levels.zeroGamma;
  const flowMoved = gm.differs.flowSigned.includes('zeroGamma');
  return (
    <div className="gx-view-note" role="note" aria-label="Levels under raw and Δ-adjusted gamma">
      <span title="Levels under raw GEX → Δ-adjusted GEX. Walls rank each leg's |gamma $| above/below spot; max-γ = largest |net| strike (all expiries); king = largest |cell|; zero-γ = re-priced crossing nearest spot.">
        <b>{view === 'adj' ? 'Marked: Δ-adjusted levels' : 'Marked: raw levels'}</b>
      </span>
      {keys.map((k) => (moved.has(k) ? (
        <span key={k} className="gx-diff" title={`${LEVEL_LABELS[k]} differs: raw ${lvFmt(k, gm.raw.levels)} vs Δ-adjusted ${lvFmt(k, gm.deltaAdjusted.levels)}`}>
          {LEVEL_LABELS[k]} {lvFmt(k, gm.raw.levels)} → <u>{lvFmt(k, gm.deltaAdjusted.levels)}</u> (moves)
        </span>
      ) : (
        <span key={k}>{LEVEL_LABELS[k]} {lvFmt(k, gm.raw.levels)} =</span>
      )))}
      <span title="Top-5 strikes by |net| under each definition — how many are shared">key strikes shared {gm.keyStrikeOverlap}/5</span>
      <span title="Δ-adjusted, one-sided: the dealer hedge trade if spot moves +1% / −1% from here (delta re-priced; naive-OI dealer sign). Raw GEX assumes the two are equal and opposite.">
        rally 1% → dealers {tradeTxt(-gm.deltaAdjusted.moveUp)} · drop 1% → dealers {tradeTxt(gm.deltaAdjusted.moveDown)}
      </span>
      <span title="Flow-signed estimate: raw GEX with today's opened near-dated OTM call OI re-signed dealer-short (an assumption, not observed trade sides)">
        flow-signed zero-γ {flowZ != null ? `$${flowZ.toFixed(2)}` : 'none ±20%'}{flowMoved ? ' (moves)' : ''} · re-signed {((gm.flowSigned.resignedShare ?? 0) * 100).toFixed(1)}% of gross
      </span>
    </div>
  );
}
