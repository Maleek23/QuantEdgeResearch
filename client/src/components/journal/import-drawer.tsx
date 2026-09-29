/**
 * Import drawer — every way a trade gets into the journal, in one place
 * (LuxAlgo's Import page: file upload · manual · accounts), opened from the
 * journal header instead of taking a navigation slot:
 *   1. Broker CSV     → POST /api/journal/import-csv (auto-detects the broker)
 *   2. Log manually   → the trade editor
 *   3. Bullflow flow  → FlowImport (grades pasted alerts into trade ideas)
 *   4. Reset journal  → DELETE /api/journal/trades/all, behind a typed confirmation
 *   5. Connect broker → Alpaca, read-only fill import (your journal)
 *   6. Discord        → a trader's Discord history, preview then confirm (trader journals)
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Check, Download, FileUp, Link2, Loader2, MessageSquare, Plus, Trash2, Upload, X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { BROKERS } from '@/lib/journal/types';
import { readApiError, useJournalMutations } from '@/lib/journal/use-journal';
import { useJournalPortalClass } from './parts';
import { useJournal } from './journal-context';
import { AlpacaConnect } from './alpaca-connect';

const FlowImport = lazy(() => import('@/components/trade-desk/flow-import').then((m) => ({ default: m.FlowImport })));

export type ImportSection = 'csv' | 'manual' | 'flow' | 'reset' | 'broker' | 'discord';

interface ImportResult {
  ok: boolean;
  broker?: string;
  saved?: number;
  duplicates?: number;
  open?: number;
  closed?: number;
  errors: string[];
}

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
      setResult({ ok: true, broker: data.broker, saved: data.saved, duplicates: data.duplicates, open: data.open, closed: data.closed, errors: data.errors ?? [] });
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
      {result && (result.ok ? (
        <div className="jr-ok" role="status">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><Check className="h-4 w-4" /> Imported {result.saved} trade{result.saved === 1 ? '' : 's'} ({result.broker})</div>
          <div className="jr-dim" style={{ fontSize: 12, marginTop: 4 }}>
            {typeof result.closed === 'number' && <>Reconstructed {result.closed} closed and {result.open} open positions. </>}
            {!!result.duplicates && <>Skipped {result.duplicates} already in your journal.</>}
          </div>
          {result.errors.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--amber)' }}>{result.errors.length} row warning{result.errors.length === 1 ? '' : 's'}</summary>
              <ul style={{ margin: '4px 0 0 16px', fontSize: 11.5, color: 'var(--text-dim)', maxHeight: 120, overflowY: 'auto' }}>
                {result.errors.slice(0, 25).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      ) : (
        <div className="jr-err" role="alert">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><X className="h-4 w-4" /> Import failed — nothing was saved</div>
          <ul style={{ margin: '4px 0 0 16px' }}>{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      ))}
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

export function ImportDrawer({ open, onOpenChange, focus, tradeCount, onLogTrade, discordBot = false }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focus?: ImportSection;
  tradeCount: number;
  onLogTrade: () => void;
  /** The server has DISCORD_BOT_TOKEN (bot-token import path available). */
  discordBot?: boolean;
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

  // Deep links (?jtab=import / flow) land on the right section once the sheet has opened.
  useEffect(() => {
    if (!open || !focus || focus === 'csv') return;
    const t = window.setTimeout(() => document.getElementById(`jr-imp-sec-${focus}`)?.scrollIntoView({ block: 'start' }), 350);
    return () => window.clearTimeout(t);
  }, [open, focus]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className={cn(portal, 'w-full overflow-y-auto sm:max-w-xl')} style={{ background: 'var(--bg-2)' }}>
          <SheetHeader className="text-left">
            <SheetTitle className="jr-title" style={{ fontSize: 24 }}>Add to {whose} journal</SheetTitle>
            <SheetDescription className="jr-sub">
              {trader
                ? `${book}'s journal is theirs to keep once they have an account; their Discord calls land on their watchlist.`
                : 'Import a broker statement, connect Alpaca, log a trade by hand, or bring in flow alerts.'}
            </SheetDescription>
          </SheetHeader>
          <div className="jr-drawer" style={{ marginTop: 18, gap: 22 }}>
            {trader ? (
              <section id="jr-imp-sec-discord" aria-labelledby="jr-imp-discord">
                <h3 className="jr-section-h" id="jr-imp-discord"><MessageSquare className="h-4 w-4" /> From Discord</h3>
                <p className="jr-note" style={{ margin: 0 }}>
                  Discord calls go to {book}'s <b>watchlist</b>, not this journal — open Chart › Watchlist › {book} › "Import from Discord".
                  {' '}{book} keeps this journal themselves once they have an account.
                </p>
              </section>
            ) : (
              <>
                <section id="jr-imp-sec-csv" aria-labelledby="jr-imp-csv">
                  <h3 className="jr-section-h" id="jr-imp-csv"><Upload className="h-4 w-4" /> Broker CSV</h3>
                  <CsvImport onDone={refresh} qs={qs} />
                </section>
                <section id="jr-imp-sec-broker" aria-labelledby="jr-imp-broker">
                  <h3 className="jr-section-h" id="jr-imp-broker"><Link2 className="h-4 w-4" /> Connect broker · Alpaca</h3>
                  <AlpacaConnect onSynced={refresh} />
                </section>
              </>
            )}

            <section id="jr-imp-sec-manual" aria-labelledby="jr-imp-man">
              <h3 className="jr-section-h" id="jr-imp-man"><Plus className="h-4 w-4" /> Log a trade by hand</h3>
              <p className="jr-note" style={{ marginTop: 0 }}>Symbol, side, entry and (optionally) exit. P&amp;L is calculated on save; add setup, mistake, emotion, notes and a screenshot while you're there.</p>
              <button type="button" className="jr-btn jr-btn-primary" onClick={onLogTrade}><Plus className="h-4 w-4" /> Log a trade</button>
            </section>

            {!trader && <section id="jr-imp-sec-flow" aria-labelledby="jr-imp-flow">
              <h3 className="jr-section-h" id="jr-imp-flow">Bullflow alerts → trade ideas</h3>
              <p className="jr-note" style={{ marginTop: 0 }}>Paste alerts you saw in Bullflow. Each line is graded by the option engine; B-and-up contracts become trade ideas (not journal trades).</p>
              <Suspense fallback={<Loader2 className="h-4 w-4 animate-spin" />}>
                <FlowImport bare />
              </Suspense>
            </section>}

            <section id="jr-imp-sec-reset" aria-labelledby="jr-imp-reset" className="jr-danger">
              <h3 className="jr-section-h jr-loss" id="jr-imp-reset"><Trash2 className="h-4 w-4" /> Reset {whose} journal</h3>
              <p className="jr-note" style={{ marginTop: 0 }}>Deletes all {tradeCount} trade{tradeCount === 1 ? '' : 's'} so you can re-import cleanly (for old imports with wrong P&amp;L or malformed symbols). Cannot be undone.</p>
              <button type="button" className="jr-btn jr-btn-danger" disabled={tradeCount === 0} onClick={() => { setTyped(''); setResetMsg(null); setConfirmReset(true); }}>
                Delete all trades
              </button>
              {resetMsg && <div className={resetMsg.ok ? 'jr-ok' : 'jr-err'} style={{ marginTop: 8 }} role={resetMsg.ok ? 'status' : 'alert'}>{resetMsg.text}</div>}
            </section>
          </div>
        </SheetContent>
      </Sheet>

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
