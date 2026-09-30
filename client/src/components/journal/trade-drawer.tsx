/**
 * Trade detail drawer — LuxAlgo's trade page (executions, review, notes,
 * attachments, prev/next navigation) folded into a side sheet so reviewing a
 * trade never leaves the list. Notes and the screenshot save in place; price
 * edits go through the full editor; delete always confirms.
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, LineChart, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { fmtDuration, fmtPrice, toTrade } from '@/lib/journal/metrics';
import type { JournalTradeRow } from '@/lib/journal/types';
import { readApiError, useJournalMutations } from '@/lib/journal/use-journal';
import { OutcomeChip, Pnl, SideChip, useJournalPortalClass } from './parts';
import { useJournal } from './journal-context';
import { ScreenshotField } from './trade-editor';

const when = (iso?: string | null) => (iso
  ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'
  : '—');

export function TradeDrawer({ trade, open, onOpenChange, onEdit, onNavigate, neighbours, onSimulate, onOpenPage }: {
  trade: JournalTradeRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (row: JournalTradeRow) => void;
  onNavigate: (id: string) => void;
  /** Previous / next trade ids in the current list order. */
  neighbours: { prev?: string; next?: string };
  onSimulate?: (symbol: string) => void;
  /** Open the full trade page (chart, review, checklist). */
  onOpenPage?: (id: string) => void;
}) {
  const portal = useJournalPortalClass();
  const { data } = useJournal();
  const readOnly = !(data.meta?.canWrite ?? data.key === 'mine');
  const { save, patchWithUndo, removeWithUndo } = useJournalMutations(data.key);
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setNotes(trade?.notes ?? ''); setMsg(null); }, [trade?.id, trade?.notes]);

  // ← / → step through trades while the drawer is open (not while typing).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowLeft' && neighbours.prev) onNavigate(neighbours.prev);
      if (e.key === 'ArrowRight' && neighbours.next) onNavigate(neighbours.next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, neighbours.prev, neighbours.next, onNavigate]);

  if (!trade) return null;
  const t = toTrade(trade);
  const isOpt = trade.assetType === 'option';

  const patch = async (input: Record<string, unknown>, okText: string) => {
    setMsg(null);
    try {
      await patchWithUndo(trade, input, `${okText} · ${trade.symbol}`);
      setMsg({ ok: true, text: okText });
    } catch (err) {
      setMsg({ ok: false, text: await readApiError(err) });
    }
  };

  const facts: [string, React.ReactNode][] = [
    ['Quantity', `${trade.quantity}${isOpt ? ' contracts' : ''}`],
    ['Entry', fmtPrice(trade.entryPrice)],
    ['Exit', trade.exitPrice != null ? fmtPrice(trade.exitPrice) : 'open'],
    ['Fees', fmtPrice(trade.fees ?? 0)],
    ['Opened', when(trade.entryTime)],
    ['Closed', when(trade.exitTime)],
    ['Held', fmtDuration(t.durationMs)],
    ['Source', trade.broker || 'manual'],
  ];
  if (isOpt) {
    facts.push(['Contract', `${(trade.optionType ?? '').toUpperCase()} ${trade.strikePrice != null ? `$${trade.strikePrice}` : ''}`.trim() || '—']);
    facts.push(['Expiry', trade.expiryDate?.slice(0, 10) ?? '—']);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className={cn(portal, 'w-full overflow-y-auto sm:max-w-xl')} style={{ background: 'var(--bg-2)' }}>
          <SheetHeader className="text-left">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingRight: 28 }}>
              <SheetTitle className="jr-title" style={{ fontSize: 24 }}>{trade.symbol}</SheetTitle>
              <SideChip direction={trade.direction} />
              <OutcomeChip status={t.status} />
              {isOpt && <span className="jr-chip opt">OPTION</span>}
            </div>
            <SheetDescription className="jr-sub">
              {t.status === 'open'
                ? (readOnly ? 'Open position — no P&L until it closes in its source ledger.' : 'Open position — P&L is realised when you record an exit.')
                : <>Net <Pnl value={t.netPnl} className="font-bold" />{trade.realizedPnLPercent != null && <span className="jr-mute"> ({trade.realizedPnLPercent > 0 ? '+' : ''}{trade.realizedPnLPercent.toFixed(1)}% on cost)</span>}</>}
            </SheetDescription>
          </SheetHeader>

          <div className="jr-drawer" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {onOpenPage && <button type="button" className="jr-btn jr-btn-sm jr-btn-primary" onClick={() => onOpenPage(trade.id)}><Expand className="h-3.5 w-3.5" /> Full page</button>}
              {!readOnly && <button type="button" className="jr-btn jr-btn-sm" onClick={() => onEdit(trade)}><Pencil className="h-3.5 w-3.5" /> Edit trade</button>}
              {isOpt && onSimulate && (
                <button type="button" className="jr-btn jr-btn-sm" onClick={() => onSimulate(trade.symbol)}><LineChart className="h-3.5 w-3.5" /> Simulate P&amp;L</button>
              )}
              {!readOnly && <button type="button" className="jr-btn jr-btn-sm jr-btn-danger" onClick={() => { removeWithUndo(trade); onOpenChange(false); }}><Trash2 className="h-3.5 w-3.5" /> Delete trade</button>}
              {readOnly && <span className="jr-tag" title="This book is computed from its source ledger">read-only · {data.meta?.label ?? 'journal'}</span>}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button type="button" className="jr-icon-btn" disabled={!neighbours.prev} onClick={() => neighbours.prev && onNavigate(neighbours.prev)} aria-label="Previous trade (←)"><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" className="jr-icon-btn" disabled={!neighbours.next} onClick={() => neighbours.next && onNavigate(neighbours.next)} aria-label="Next trade (→)"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="jr-stats">
              {facts.map(([k, v]) => <div key={k}><span>{k}</span><b style={{ fontSize: 13 }}>{v}</b></div>)}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="jr-mute" style={{ fontSize: 11 }}>Tags</span>
              {trade.setupType ? <span className="jr-tag">setup · {trade.setupType}</span> : null}
              {trade.mistakeTag ? <span className="jr-tag">mistake · {trade.mistakeTag}</span> : null}
              {trade.emotion ? <span className="jr-tag">emotion · {trade.emotion}</span> : null}
              {trade.rating ? <span className="jr-tag">rating · {trade.rating}/5</span> : null}
              {!trade.setupType && !trade.mistakeTag && !trade.emotion && !trade.rating && <span className="jr-mute" style={{ fontSize: 12 }}>{readOnly ? 'none' : 'none yet — add them with Edit trade'}</span>}
            </div>

            {readOnly ? (
              <>
                <div className="jr-field">
                  <span className="l">Notes</span>
                  {trade.notes ? <div className="jr-notes">{trade.notes}</div> : <span className="jr-mute" style={{ fontSize: 12 }}>No notes on this trade.</span>}
                </div>
                {trade.screenshot && (
                  <div className="jr-field">
                    <span className="l">Chart screenshot</span>
                    <a href={trade.screenshot} target="_blank" rel="noreferrer noopener"><img src={trade.screenshot} alt={`${trade.symbol} chart`} className="jr-shot" loading="lazy" /></a>
                  </div>
                )}
              </>
            ) : (<>
            <div className="jr-field">
              <label htmlFor="jr-drawer-notes">Notes</label>
              <textarea id="jr-drawer-notes" className="jr-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was the plan? What happened? What would you repeat?" />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" className="jr-btn jr-btn-sm" disabled={save.isPending || notes === (trade.notes ?? '')}
                  onClick={() => patch({ notes: notes.trim() || null }, 'Notes saved')}>
                  {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save notes
                </button>
              </div>
            </div>

            <ScreenshotField value={trade.screenshot ?? null} onChange={(v) => patch({ screenshot: v }, v ? 'Screenshot saved' : 'Screenshot removed')} />
            </>)}
            {msg && <div className={msg.ok ? 'jr-ok' : 'jr-err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div>}
          </div>
        </SheetContent>
      </Sheet>

    </>
  );
}
