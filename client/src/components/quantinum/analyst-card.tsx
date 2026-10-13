/**
 * Quantinum Analyst — a slash-command answer as a structured card (never
 * prose). Every fact shows its source chip (label · age; full source + ET
 * timestamp on hover/focus). "Re-check" re-runs the same tool and lists what
 * changed. "Nothing qualifies" renders as a first-class answer.
 */
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { diffCards, type AnalystCard, type CardFact } from '@shared/quantinum-analyst';
import { HORIZON_WINDOWS } from '@shared/quantinum-horizon';
import { runCommand } from '@/lib/quantinum-analyst';

export function ago(iso: string | null): string | null {
  if (!iso) return null;
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s) || s < 0) return null;
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 172800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
const etStamp = (iso: string | null) => (iso ? `${new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET` : 'no timestamp');

function fmt(v: CardFact['value'], unit?: CardFact['unit']): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  const abs = Math.abs(v);
  if (unit === '$') return abs >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : abs >= 1e4 ? `$${Math.round(v).toLocaleString('en-US')}` : `$${v.toFixed(2)}`;
  if (unit === '%') return `${v > 0 ? '+' : ''}${v}%`;
  if (unit === 'x') return `${v}×`;
  if (unit === 'R') return `${v}R`;
  return String(v);
}

export function SourceChip({ label, source, asOf }: { label: string; source: string; asOf: string | null }) {
  const a = ago(asOf);
  return (
    <span className="aq-src" tabIndex={0} title={`${source} · as of ${etStamp(asOf)}`} aria-label={`Source: ${source}, as of ${etStamp(asOf)}`}>
      <b>{label}</b>{a ? ` · ${a}` : ' · no timestamp'}
    </span>
  );
}

export function AnalystCardView({ card: initial, onReplace }: { card: AnalystCard; onReplace?: (c: AnalystCard) => void }) {
  const [card, setCard] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState<string | null>(null);
  const srcOf = (k: string) => card.sources.find((s) => s.key === k);
  const recheck = async () => {
    setBusy(true);
    const r = await runCommand({ command: card.request.command, arg: card.request.arg, horizon: card.request.horizon, page: card.request.page });
    setBusy(false);
    if ('error' in r) { setDiff(`Re-check failed: ${r.error}`); return; }
    const d = diffCards(card, r.card);
    const parts = [
      ...d.changed.map((c) => `${c.label}: ${c.before ?? '—'} → ${c.after ?? '—'}`),
      ...d.added.map((l) => `+ ${l}`), ...d.removed.map((l) => `− ${l}`),
    ];
    setDiff(parts.length || d.statusChanged ? parts.join(' · ') || `status ${card.status} → ${r.card.status}` : 'No change since the last read.');
    setCard(r.card);
    onReplace?.(r.card);
  };
  const w = HORIZON_WINDOWS[card.horizon];
  return (
    <section className="aq-card" data-status={card.status} aria-label={card.title}>
      <header className="aq-card-h">
        <strong>{card.title}</strong>
        {['levels', 'flow'].includes(card.command) && <span className="aq-pill" title={w.bucketNote ?? w.expiries}>{w.label} · {w.expiries}</span>}
        <button type="button" className="lx-btn aq-recheck" onClick={recheck} disabled={busy} aria-label="Re-check: fetch again and show what changed">
          <RefreshCw aria-hidden size={13} className={busy ? 'aq-spin' : undefined} />Re-check
        </button>
      </header>
      {card.message && <p className="aq-card-msg" data-status={card.status}>{card.message}</p>}
      {card.facts.length > 0 && (
        <dl className="aq-facts">
          {card.facts.filter((f) => !f.key.startsWith('lvl.')).map((f) => {
            const s = srcOf(f.src);
            return (
              <div key={f.key} className="aq-fact">
                <dt>{f.label}</dt>
                <dd><span className="aq-num">{fmt(f.value, f.unit)}</span>{s && <SourceChip label={s.label} source={s.source} asOf={s.asOf} />}</dd>
              </div>
            );
          })}
        </dl>
      )}
      {card.table && card.table.rows.length > 0 && (
        <div className="aq-table-wrap">
          <table className="aq-table">
            <thead><tr>{card.table.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
            <tbody>
              {card.table.rows.map((r) => (
                <tr key={r.key}>{r.cells.map((c, i) => <td key={i}>{c == null ? '—' : typeof c === 'number' ? c.toLocaleString('en-US') : c}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {(() => { const s = srcOf(card.table!.rows[0]?.src ?? ''); return s ? <div className="aq-meta"><SourceChip label={s.label} source={s.source} asOf={s.asOf} /></div> : null; })()}
        </div>
      )}
      {card.record && (
        <div className="aq-record" data-verdict={card.record.verdict}>
          <span className="aq-record-k">Track record (verified)</span>
          <span>{card.record.text}</span>
          {(() => { const s = srcOf(card.record!.src); return s ? <SourceChip label={s.label} source={s.source} asOf={s.asOf} /> : null; })()}
          {card.record.ledger && card.record.ledger.mismatchesExcluded > 0 && <span className="aq-foot">{card.record.ledger.mismatchesExcluded} bar-ledger mismatches excluded</span>}
        </div>
      )}
      {card.notes.length > 0 && <ul className="aq-notes">{card.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {diff && <div className="aq-diff" role="status">{diff}</div>}
      <div className="aq-meta">
        <span className="aq-foot">read {ago(card.generatedAt) ?? 'just now'} · {card.disclaimer}</span>
      </div>
    </section>
  );
}
