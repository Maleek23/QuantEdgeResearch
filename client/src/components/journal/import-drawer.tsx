/**
 * Import — every way a trade gets into the journal, in one place (LuxAlgo's
 * Import page: file upload · manual · accounts). Was a drawer off the journal
 * header; since the sidebar (2026-09-29) it renders as the Import page
 * (pages/journal/import-view.tsx). File name kept so ?jtab= types still import.
 *   1. Broker CSV     → POST /api/journal/import-csv (auto-detects the broker)
 *   2. Log manually   → the trade editor
 *   3. Bullflow flow  → FlowImport (grades pasted alerts into trade ideas)
 *   4. Reset journal  → DELETE /api/journal/trades/all, behind a typed confirmation
 *   5. Connect broker → Alpaca, read-only fill import (your journal)
 *   6. Discord        → a trader's Discord history, preview then confirm (trader journals)
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileUp, Link2, Loader2, MessageSquare, Plus, Trash2, Upload } from 'lucide-react';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { apiRequest } from '@/lib/queryClient';
import { BROKERS } from '@/lib/journal/types';
import { readApiError, useJournalMutations } from '@/lib/journal/use-journal';
import { useJournalPortalClass } from './parts';
import { useJournal } from './journal-context';
import { AlpacaConnect } from './alpaca-connect';
import { ImportHistory, ImportReconciliation, type ImportResult } from './import-reconciliation';

const FlowImport = lazy(() => import('@/components/trade-desk/flow-import').then((m) => ({ default: m.FlowImport })));

export type ImportSection = 'csv' | 'manual' | 'flow' | 'reset' | 'broker' | 'discord';

function CsvImport({ onDone, qs }: { onDone: () => void; qs: string }) {
  const [broker, setBroker] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const handle = useCallback(async (file?: File | null) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      setResult({ ok: false, errors: ['Only .csv files are supported — export a CSV from your broker first.'] });
      return;
    }
    if (file.size > 3_500_000) {
      setResult({ ok: false, errors: ['That CSV is over 3.5MB — split it by date range and import each part.'] });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const csv = await file.text();
      const res = await apiRequest('POST', `/api/journal/import-csv${qs ? `?${qs}` : ''}`, { csv, broker: broker || undefined });
      const data = await res.json();
      setResult({
        ok: true, broker: data.broker, saved: data.saved, duplicates: data.duplicates, open: data.open, closed: data.closed, errors: data.errors ?? [],
        totalRows: data.totalRows, fillRows: data.fillRows ?? null, roundTrips: data.roundTrips, duplicateRows: data.duplicateRows, batchId: data.batchId,
      });
      onDone();
    } catch (err) {
      setResult({ ok: false, errors: [await readApiError(err)] });
    } finally {
      setBusy(false);
    }
  }, [broker, onDone, qs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="jr-field">
        <label htmlFor="jr-broker">Broker</label>
        <select id="jr-broker" className="jr-select" value={broker} onChange={(e) => setBroker(e.target.value)}>
          {BROKERS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
      </div>
      <div
        className="jr-dropzone"
        role="button"
        tabIndex={0}
        data-drag={drag}
        aria-label="Choose or drop a broker CSV file"
        aria-busy={busy}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
      >
        {busy ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : <FileUp className="mx-auto h-6 w-6" />}
        <div style={{ marginTop: 6, fontWeight: 600, color: 'var(--text)' }}>{busy ? 'Parsing your trades…' : 'Drop a broker CSV or click to browse'}</div>
        <div style={{ fontSize: 11.5, marginTop: 2 }}>Webull · Robinhood · Schwab · IBKR · tastytrade · TD · Fidelity · E*TRADE. Duplicates are skipped.</div>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {result && <ImportReconciliation result={result} />}
      <details className="jr-details">
        <summary className="jr-dim" style={{ fontSize: 12 }}><Download className="h-3.5 w-3.5" /> How to export from your broker</summary>
        <ul style={{ margin: '6px 0 0 16px', fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          <li><b>Webull:</b> Account → History → Export Orders</li>
          <li><b>Robinhood:</b> Statements &amp; History → Download CSV</li>
          <li><b>Schwab:</b> Accounts → History → Export</li>
          <li><b>IBKR:</b> Reports → Flex Queries → Trade Confirm</li>
          <li><b>tastytrade:</b> History → Trade History → Export</li>
        </ul>
      </details>
    </div>
  );
}

export function ImportSections({ focus, tradeCount, onLogTrade }: {
  focus?: ImportSection;
  tradeCount: number;
  onLogTrade: () => void;
}) {
  const portal = useJournalPortalClass();
  const { data } = useJournal();
  const { refresh, resetAll, qs } = useJournalMutations(data.key);
  const trader = data.key.startsWith('trader:') ? data.key.slice(7) : null;
  const book = data.meta?.label ?? (trader ?? 'your');
  const whose = trader ? `${book}'s` : 'your';
  const [confirmReset, setConfirmReset] = useState(false);
  const [typed, setTyped] = useState('');
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Deep links (?jtab=flow …) land on the right section once the page has rendered.
  useEffect(() => {
    if (!focus || focus === 'csv') return;
    const t = window.setTimeout(() => document.getElementById(`jr-imp-sec-${focus}`)?.scrollIntoView({ block: 'start' }), 250);
    return () => window.clearTimeout(t);
  }, [focus]);

  return (
    <>
      <div className="jr-grid">
        {trader ? (
          <section className="jr-card jr-span-12 jr-anchor" id="jr-imp-sec-discord" aria-labelledby="jr-imp-discord">
            <h3 className="jr-section-h" id="jr-imp-discord"><MessageSquare className="h-4 w-4" /> From Discord</h3>
            <p className="jr-note" style={{ margin: 0 }}>
              Discord calls go to {book}'s <b>watchlist</b>, not this journal — open Chart › Watchlist › {book} › "Import from Discord".
              {' '}They show up here in the Notebook as read-only calls. {book} keeps this journal themselves once they have an account.
            </p>
          </section>
        ) : (
          <>
            <section className="jr-card jr-span-7 jr-anchor" id="jr-imp-sec-csv" aria-labelledby="jr-imp-csv">
              <h3 className="jr-section-h" id="jr-imp-csv"><Upload className="h-4 w-4" /> Broker CSV</h3>
              <CsvImport onDone={refresh} qs={qs} />
            </section>
            <section className="jr-card jr-span-5 jr-anchor" id="jr-imp-sec-broker" aria-labelledby="jr-imp-broker">
              <h3 className="jr-section-h" id="jr-imp-broker"><Link2 className="h-4 w-4" /> Connect broker · Alpaca</h3>
              <AlpacaConnect onSynced={refresh} />
            </section>
          </>
        )}

        <section className="jr-card jr-span-6 jr-anchor" id="jr-imp-sec-manual" aria-labelledby="jr-imp-man">
          <h3 className="jr-section-h" id="jr-imp-man"><Plus className="h-4 w-4" /> Log a trade by hand</h3>
          <p className="jr-note" style={{ marginTop: 0 }}>Symbol, side, entry and (optionally) exit. P&amp;L is calculated on save; add setup, mistake, emotion, notes and a screenshot while you're there.</p>
          <button type="button" className="jr-btn jr-btn-primary" onClick={onLogTrade}><Plus className="h-4 w-4" /> Log a trade</button>
        </section>

        <section className="jr-card jr-danger jr-span-6 jr-anchor" id="jr-imp-sec-reset" aria-labelledby="jr-imp-reset">
          <h3 className="jr-section-h jr-loss" id="jr-imp-reset"><Trash2 className="h-4 w-4" /> Reset {whose} journal</h3>
          <p className="jr-note" style={{ marginTop: 0 }}>Deletes all {tradeCount} trade{tradeCount === 1 ? '' : 's'} so you can re-import cleanly (for old imports with wrong P&amp;L or malformed symbols). Cannot be undone.</p>
          <button type="button" className="jr-btn jr-btn-danger" disabled={tradeCount === 0} onClick={() => { setTyped(''); setResetMsg(null); setConfirmReset(true); }}>
            Delete all trades
          </button>
          {resetMsg && <div className={resetMsg.ok ? 'jr-ok' : 'jr-err'} style={{ marginTop: 8 }} role={resetMsg.ok ? 'status' : 'alert'}>{resetMsg.text}</div>}
        </section>

        {!trader && <section className="jr-card jr-span-12 jr-anchor" id="jr-imp-sec-flow" aria-labelledby="jr-imp-flow">
          <h3 className="jr-section-h" id="jr-imp-flow">Bullflow alerts → trade ideas</h3>
          <p className="jr-note" style={{ marginTop: 0 }}>Paste alerts you saw in Bullflow. Each line is graded by the option engine; B-and-up contracts become trade ideas (not journal trades).</p>
          <Suspense fallback={<Loader2 className="h-4 w-4 animate-spin" />}>
            <FlowImport bare />
          </Suspense>
        </section>}
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent className={portal} style={{ background: 'var(--bg-2)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all {tradeCount} trades?</AlertDialogTitle>
            <AlertDialogDescription>
              Every trade, tag and screenshot in {whose} journal is removed. Type <b>DELETE</b> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input className="jr-input" aria-label="Type DELETE to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my trades</AlertDialogCancel>
            <button
              type="button"
              className="jr-btn jr-btn-danger"
              disabled={typed !== 'DELETE' || resetAll.isPending}
              onClick={async () => {
                try {
                  const r = await resetAll.mutateAsync();
                  setResetMsg({ ok: true, text: `Deleted ${r.deleted} trades. You can re-import now.` });
                } catch (err) {
                  setResetMsg({ ok: false, text: `Reset failed: ${await readApiError(err)}` });
                } finally {
                  setConfirmReset(false);
                }
              }}
            >
              {resetAll.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Delete everything
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
