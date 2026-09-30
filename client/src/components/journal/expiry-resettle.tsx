/**
 * Journal › Import — "Re-settle expired options at intrinsic".
 *
 * Broker exports have no closing fill for an option held to expiry. Those lots
 * used to be closed at $0; the server now settles them at intrinsic from the
 * underlying's expiry-day print (shared/journal-expiry.ts). This action runs
 * POST /api/journal/resettle-expired on the book in view and shows what moved.
 * Only rows the expiry rule wrote are touched; running it twice changes nothing.
 */
import { useMemo, useState } from 'react';
import { Hourglass, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { expiryCounts, expiryCountsText } from '@shared/journal-expiry';
import { fmtMoney } from '@/lib/journal/metrics';
import { readApiError, useJournalMutations } from '@/lib/journal/use-journal';
import { useJournal } from './journal-context';
import { Pnl } from './parts';

interface ResettleResponse {
  eligible: number;
  changed: number;
  unchanged: number;
  keptVerified: number;
  written: number;
  pnlDelta: number;
  counts: { itm: number; worthless: number; unverified: number; approximate: number };
  bySymbol: { symbol: string; rows: number; delta: number }[];
  errors: string[];
}

export function ExpiryResettle() {
  const { data } = useJournal();
  const { refresh, qs } = useJournalMutations(data.key);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ResettleResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const counts = useMemo(() => expiryCounts(data.allRows), [data.allRows]);

  const run = async () => {
    setBusy(true); setErr(null); setRes(null);
    try {
      const r = await apiRequest('POST', `/api/journal/resettle-expired${qs ? `?${qs}` : ''}`, {});
      setRes(await r.json());
      refresh();
    } catch (e) {
      setErr(await readApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="jr-card jr-span-12" aria-labelledby="jr-imp-expiry">
      <h3 className="jr-section-h" id="jr-imp-expiry"><Hourglass className="h-4 w-4" /> Expired options</h3>
      <p className="jr-note" style={{ marginTop: 0 }}>
        {counts.n > 0 ? <>{expiryCountsText(counts)}.</> : 'No expired option lots without a closing fill in this book.'}{' '}
        A broker export has no sell for a contract held to expiry; each is settled at its intrinsic value from the underlying's expiry-day close
        (SPXW/XSP on the S&amp;P 500 close, SPX monthlies on the open — approximate, AM-settled). Where no close is available it stays at $0, marked unverified.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="jr-btn" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Re-settle expired options at intrinsic
        </button>
        <span className="jr-note" style={{ margin: 0 }}>Touches only lots the expiry rule closed — never a real exit or one you edited. Safe to run again.</span>
      </div>
      {err && <div className="jr-err" role="alert" style={{ marginTop: 8 }}>{err}</div>}
      {res && (
        <div className="jr-recon" role="status" style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 700 }}>
            {res.changed === 0 ? `Nothing to change — ${res.eligible} expired lot${res.eligible === 1 ? '' : 's'} already settled.` : <>Re-settled {res.written} of {res.eligible} expired lot{res.eligible === 1 ? '' : 's'}: <Pnl value={res.pnlDelta} /> net change.</>}
          </div>
          <div className="jr-note" style={{ margin: '4px 0 0' }}>
            {res.counts.itm} in the money · {res.counts.worthless} worthless · {res.counts.unverified} unverified (no close available)
            {res.counts.approximate ? ` · ${res.counts.approximate} approximate (AM-settled)` : ''}
            {res.keptVerified ? ` · ${res.keptVerified} kept as settled (close unavailable now)` : ''}
          </div>
          {res.bySymbol.length > 0 && (
            <div className="jr-note" style={{ margin: '4px 0 0' }}>
              {res.bySymbol.slice(0, 20).map((s, i) => <span key={s.symbol}>{i ? ' · ' : ''}{s.symbol} ×{s.rows} {fmtMoney(s.delta)}</span>)}
            </div>
          )}
          {res.errors.length > 0 && <ul style={{ margin: '4px 0 0 16px' }}>{res.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}
