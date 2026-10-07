/**
 * SPX equivalent — the SPXW mirror of an SPY 0DTE/1DTE idea (shared/spx-mirror.ts).
 *
 * Display only: the idea is tracked (and graded) as the SPY idea. The premium
 * is an estimate from the CBOE delayed chain and is stamped "15m delayed" with
 * its fetch age; levels carry the live ratio's own age. Never shown as live.
 */
import type { SpxMirror } from '@shared/spx-mirror';

const money = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const ago = (iso: string | null | undefined, now = Date.now()) => {
  if (!iso) return 'age —';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : `${(s / 3600).toFixed(1)}h ago`;
};

export function spxMirrorChipTitle(m: SpxMirror): string {
  if (m.status === 'omitted' || !m.contract) return `SPX mirror unavailable: ${m.reason ?? 'no data'} — ${m.note}`;
  return `SPX equivalent: SPXW ${m.contract.strike}${m.contract.optionType === 'call' ? 'C' : 'P'} ${m.contract.expiry} — ${m.note}`;
}

export function SpxMirrorBlock({ mirror, className = 'nxp-spx-expression', nowMs }: { mirror: SpxMirror; className?: string; nowMs?: number }) {
  const now = nowMs ?? Date.now();
  const m = mirror;
  const c = m.contract;
  const p = m.premium;
  return (
    <div className={`${className} ${m.status === 'ok' ? 'live' : ''}`} data-testid="spx-mirror">
      <span>SPX equivalent</span>
      {c ? (
        <>
          <strong>SPXW {c.strike}{c.optionType === 'call' ? 'C' : 'P'} · {c.expiry}{c.dte != null ? ` · ${c.dte <= 0 ? '0DTE' : `${c.dte}DTE`}` : ''}</strong>
          <small>
            {p?.mid != null
              ? <>est {money(p.mid)} <span title={`bid ${money(p.bid)} / ask ${money(p.ask)} · ${p.source}`}>· {Math.round(p.delayedSec / 60)}m delayed · fetched {ago(p.asOf, now)}</span></>
              : <>premium — {m.reason ?? 'no delayed quote'}</>}
          </small>
          {m.levels && (m.levels.entry != null || m.levels.stop != null || m.levels.targets.length > 0) && (
            <small>SPX trigger {money(m.levels.entry)} · stop {money(m.levels.stop)}{m.levels.targets.map((t, i) => ` · T${i + 1} ${money(t)}`).join('')}</small>
          )}
          {m.ratio && <small>ratio {m.ratio.value.toFixed(4)}× ({m.ratio.source}) · {ago(m.ratio.asOf, now)}</small>}
        </>
      ) : <small>{m.reason ?? 'mirror unavailable'}</small>}
      <small><em>{m.note}</em></small>
    </div>
  );
}
