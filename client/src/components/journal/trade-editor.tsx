/**
 * Add / edit a trade. One form for both (LuxAlgo's "Add trade" dialog idea):
 * the server validates and derives P&L, outcome, status and holding time — the
 * preview here is only a preview. Screenshots are downscaled in the browser to a
 * ≤1600px JPEG before upload so a chart grab stays a few hundred KB.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { fmtMoney } from '@/lib/journal/metrics';
import { EMOTIONS, type JournalTradeRow } from '@/lib/journal/types';
import { readApiError, useJournalMutations, type JournalTradeInput } from '@/lib/journal/use-journal';
import { useJournal } from './journal-context';
import { failToast, undoToast } from '@/lib/undo-toast';
import { useJournalPortalClass } from './parts';

interface FormState {
  symbol: string;
  direction: 'long' | 'short';
  assetType: 'stock' | 'option' | 'future' | 'crypto';
  optionType: 'call' | 'put';
  strikePrice: string;
  expiryDate: string;
  quantity: string;
  entryPrice: string;
  exitPrice: string;
  entryTime: string;
  exitTime: string;
  fees: string;
  notes: string;
  emotion: string;
  setupType: string;
  mistakeTag: string;
  rating: number | null;
  screenshot: string | null;
}

/** ISO → value for <input type="datetime-local"> in the browser's zone. */
function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function fromRow(row?: JournalTradeRow | null): FormState {
  return {
    symbol: row?.symbol ?? '',
    direction: row?.direction === 'short' ? 'short' : 'long',
    assetType: (['stock', 'option', 'future', 'crypto'].includes(row?.assetType ?? '') ? row!.assetType : 'stock') as FormState['assetType'],
    optionType: row?.optionType === 'put' ? 'put' : 'call',
    strikePrice: row?.strikePrice != null ? String(row.strikePrice) : '',
    expiryDate: row?.expiryDate?.slice(0, 10) ?? '',
    quantity: row ? String(row.quantity) : '1',
    entryPrice: row ? String(row.entryPrice) : '',
    exitPrice: row?.exitPrice != null ? String(row.exitPrice) : '',
    entryTime: row ? toLocalInput(row.entryTime) : toLocalInput(new Date().toISOString()),
    exitTime: toLocalInput(row?.exitTime),
    fees: row?.fees != null ? String(row.fees) : '0',
    notes: row?.notes ?? '',
    emotion: row?.emotion ?? '',
    setupType: row?.setupType ?? '',
    mistakeTag: row?.mistakeTag ?? '',
    rating: row?.rating ?? null,
    screenshot: row?.screenshot ?? null,
  };
}

const num = (s: string) => (s.trim() === '' ? null : Number(s));

export async function downscaleImage(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Choose a PNG, JPEG or WebP image.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That image could not be read.'));
      i.src = url;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable in this browser.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', quality);
    if (data.length > 2_400_000) throw new Error('Image is still too large after compression — crop it first.');
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ScreenshotField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const take = async (file?: File | null) => {
    if (!file) return;
    setBusy(true); setErr('');
    try { onChange(await downscaleImage(file)); } catch (e) { setErr(e instanceof Error ? e.message : 'Upload failed'); } finally { setBusy(false); }
  };
  return (
    <div className="jr-field">
      <span className="l">Chart screenshot</span>
      {value ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <img src={value} alt="Trade chart screenshot" className="jr-shot" />
          <button type="button" className="jr-btn jr-btn-sm jr-btn-danger" style={{ alignSelf: 'flex-start' }} onClick={() => onChange(null)}>
            <Trash2 className="h-3.5 w-3.5" /> Remove screenshot
          </button>
        </div>
      ) : (
        <div
          className="jr-dropzone"
          role="button"
          tabIndex={0}
          data-drag={drag}
          aria-label="Add a chart screenshot: click, drop or paste an image"
          onClick={() => input.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files[0]); }}
          onPaste={(e) => take(Array.from(e.clipboardData.files)[0])}
        >
          {busy ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : <ImagePlus className="mx-auto h-5 w-5" />}
          <div style={{ marginTop: 6, fontSize: 12 }}>Click, drop, or paste an image</div>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      )}
      {err && <div className="jr-err">{err}</div>}
    </div>
  );
}

export function TradeEditor({ open, onOpenChange, trade, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit this trade; absent = add a new one. */
  trade?: JournalTradeRow | null;
  onSaved?: (row: JournalTradeRow) => void;
}) {
  const portal = useJournalPortalClass();
  const { data: journalData } = useJournal();
  const { save, remove, patchWithUndo } = useJournalMutations(journalData.key);
  const [form, setForm] = useState<FormState>(() => fromRow(trade));
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setForm(fromRow(trade)); setError(''); } }, [open, trade]);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));

  const preview = useMemo(() => {
    const entry = num(form.entryPrice), exit = num(form.exitPrice), qty = num(form.quantity) ?? 0, fees = num(form.fees) ?? 0;
    if (entry == null || exit == null || !Number.isFinite(entry) || !Number.isFinite(exit)) return null;
    const mult = form.assetType === 'option' ? 100 : 1;
    return ((form.direction === 'long' ? exit - entry : entry - exit) * qty * mult) - fees;
  }, [form]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const entryPrice = num(form.entryPrice), quantity = num(form.quantity), exitPrice = num(form.exitPrice), fees = num(form.fees) ?? 0;
    if (!form.symbol.trim()) return setError('Symbol is required.');
    if (entryPrice == null || !Number.isFinite(entryPrice) || entryPrice < 0) return setError('Entry price must be a number ≥ 0.');
    if (quantity == null || !(quantity > 0)) return setError('Quantity must be greater than 0.');
    if (exitPrice != null && (!Number.isFinite(exitPrice) || exitPrice < 0)) return setError('Exit price must be a number ≥ 0, or blank if the trade is still open.');
    if (!form.entryTime) return setError('Entry time is required.');
    if (form.exitTime && new Date(form.exitTime) < new Date(form.entryTime)) return setError('Exit time is before entry time.');

    const input: JournalTradeInput = {
      symbol: form.symbol.trim().toUpperCase(),
      direction: form.direction,
      assetType: form.assetType,
      quantity,
      entryPrice,
      exitPrice,
      fees,
      entryTime: new Date(form.entryTime).toISOString(),
      exitTime: form.exitTime ? new Date(form.exitTime).toISOString() : null,
      notes: form.notes.trim() || null,
      emotion: form.emotion || null,
      setupType: form.setupType.trim() || null,
      mistakeTag: form.mistakeTag.trim() || null,
      rating: form.rating,
      screenshot: form.screenshot,
      optionType: form.assetType === 'option' ? form.optionType : null,
      strikePrice: form.assetType === 'option' ? num(form.strikePrice) : null,
      expiryDate: form.assetType === 'option' ? (form.expiryDate || null) : null,
    };
    // Imported rows: only send pricing fields when they changed, so a broker-reported
    // P&L survives a notes/tag edit (the server re-derives only on pricing changes).
    let payload: Partial<JournalTradeInput> = input;
    if (trade) {
      const before = fromRow(trade);
      const pricing: (keyof FormState)[] = ['direction', 'assetType', 'quantity', 'entryPrice', 'exitPrice', 'fees', 'entryTime', 'exitTime'];
      if (!pricing.some((k) => before[k] !== form[k])) {
        payload = Object.fromEntries(
          Object.entries(input).filter(([k]) => !pricing.includes(k as keyof FormState)),
        ) as Partial<JournalTradeInput>;
      }
    }
    try {
      if (trade) {
        // optimistic in the book (useJournalMutations.save onMutate) + Undo writes the old values back
        await patchWithUndo(trade, payload, `Saved ${trade.symbol} trade`);
        onSaved?.({ ...trade, ...(payload as Partial<JournalTradeRow>) });
      } else {
        const res = await save.mutateAsync({ input: payload });
        onSaved?.(res.trade);
        const created = res.trade;
        if (created?.id) {
          undoToast({
            title: `Logged ${created.symbol} ${created.direction}`,
            onUndo: () => { remove.mutateAsync(created.id).catch((e) => failToast(`Couldn't remove the ${created.symbol} trade`, e)); },
          });
        }
      }
      onOpenChange(false);
    } catch (err) {
      setError(await readApiError(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(portal, 'max-h-[92dvh] w-[calc(100vw-16px)] max-w-2xl overflow-y-auto rounded-xl')} style={{ background: 'var(--bg-2)' }}>
        <DialogHeader>
          <DialogTitle className="jr-title" style={{ fontSize: 22 }}>{trade ? `Edit ${trade.symbol} trade` : 'Log a trade'}</DialogTitle>
          <DialogDescription className="jr-sub">
            {trade ? 'Changing prices, size or times recalculates P&L. Notes and tags never touch it.' : 'Leave exit blank for an open position. P&L is calculated on save.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="jr-drawer" noValidate>
          {error && <div className="jr-err" role="alert">{error}</div>}
          <div className="jr-form-grid four">
            <div className="jr-field">
              <label htmlFor="jr-sym">Symbol *</label>
              <input id="jr-sym" className="jr-input" value={form.symbol} onChange={(e) => set('symbol', e.target.value)} placeholder="AAPL" autoComplete="off" required />
            </div>
            <div className="jr-field">
              <span className="l" id="jr-dir-l">Side</span>
              <div className="jr-seg" role="group" aria-labelledby="jr-dir-l">
                <button type="button" aria-pressed={form.direction === 'long'} onClick={() => set('direction', 'long')}>▲ LONG</button>
                <button type="button" aria-pressed={form.direction === 'short'} onClick={() => set('direction', 'short')}>▼ SHORT</button>
              </div>
            </div>
            <div className="jr-field">
              <label htmlFor="jr-asset">Asset</label>
              <select id="jr-asset" className="jr-select" value={form.assetType} onChange={(e) => set('assetType', e.target.value as FormState['assetType'])}>
                <option value="stock">Stock / ETF</option>
                <option value="option">Option (×100)</option>
                <option value="future">Future</option>
                <option value="crypto">Crypto</option>
              </select>
            </div>
            <div className="jr-field">
              <label htmlFor="jr-qty">{form.assetType === 'option' ? 'Contracts' : 'Quantity'} *</label>
              <input id="jr-qty" className="jr-input" type="number" inputMode="decimal" min="0" step="any" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
            </div>
          </div>

          {form.assetType === 'option' && (
            <div className="jr-form-grid four">
              <div className="jr-field">
                <span className="l" id="jr-cp-l">Call / put</span>
                <div className="jr-seg" role="group" aria-labelledby="jr-cp-l">
                  <button type="button" aria-pressed={form.optionType === 'call'} onClick={() => set('optionType', 'call')}>CALL</button>
                  <button type="button" aria-pressed={form.optionType === 'put'} onClick={() => set('optionType', 'put')}>PUT</button>
                </div>
              </div>
              <div className="jr-field">
                <label htmlFor="jr-strike">Strike</label>
                <input id="jr-strike" className="jr-input" type="number" inputMode="decimal" step="any" value={form.strikePrice} onChange={(e) => set('strikePrice', e.target.value)} />
              </div>
              <div className="jr-field">
                <label htmlFor="jr-exp">Expiry</label>
                <input id="jr-exp" className="jr-input" type="date" value={form.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} />
              </div>
            </div>
          )}

          <div className="jr-form-grid four">
            <div className="jr-field">
              <label htmlFor="jr-entry">Entry price *</label>
              <input id="jr-entry" className="jr-input" type="number" inputMode="decimal" step="any" min="0" value={form.entryPrice} onChange={(e) => set('entryPrice', e.target.value)} />
            </div>
            <div className="jr-field">
              <label htmlFor="jr-exit">Exit price</label>
              <input id="jr-exit" className="jr-input" type="number" inputMode="decimal" step="any" min="0" value={form.exitPrice} onChange={(e) => set('exitPrice', e.target.value)} placeholder="blank = open" />
            </div>
            <div className="jr-field">
              <label htmlFor="jr-et">Entry time *</label>
              <input id="jr-et" className="jr-input" type="datetime-local" value={form.entryTime} onChange={(e) => set('entryTime', e.target.value)} />
            </div>
            <div className="jr-field">
              <label htmlFor="jr-xt">Exit time</label>
              <input id="jr-xt" className="jr-input" type="datetime-local" value={form.exitTime} onChange={(e) => set('exitTime', e.target.value)} />
            </div>
          </div>

          <div className="jr-form-grid four">
            <div className="jr-field">
              <label htmlFor="jr-setup">Setup</label>
              <input id="jr-setup" className="jr-input" value={form.setupType} onChange={(e) => set('setupType', e.target.value)} placeholder="e.g. GEX flip" />
            </div>
            <div className="jr-field">
              <label htmlFor="jr-mistake">Mistake</label>
              <input id="jr-mistake" className="jr-input" value={form.mistakeTag} onChange={(e) => set('mistakeTag', e.target.value)} placeholder="e.g. chased" />
            </div>
            <div className="jr-field">
              <label htmlFor="jr-emotion">Emotion</label>
              <select id="jr-emotion" className="jr-select" value={form.emotion} onChange={(e) => set('emotion', e.target.value)}>
                <option value="">—</option>
                {EMOTIONS.map((em) => <option key={em.value} value={em.value}>{em.label}</option>)}
              </select>
            </div>
            <div className="jr-field">
              <label htmlFor="jr-fees">Fees ($)</label>
              <input id="jr-fees" className="jr-input" type="number" inputMode="decimal" step="any" min="0" value={form.fees} onChange={(e) => set('fees', e.target.value)} />
            </div>
          </div>

          <div className="jr-field">
            <span className="l" id="jr-rate-l">Execution rating {form.rating ? `· ${form.rating}/5` : ''}</span>
            <div className="jr-rating" role="group" aria-labelledby="jr-rate-l">
              {[1, 2, 3, 4, 5].map((r) => (
                <button key={r} type="button" aria-pressed={form.rating === r} aria-label={`${r} of 5`} onClick={() => set('rating', form.rating === r ? null : r)}>{r}</button>
              ))}
            </div>
          </div>

          <div className="jr-field">
            <label htmlFor="jr-notes">Notes</label>
            <textarea id="jr-notes" className="jr-input" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Thesis, execution, what you'd repeat or change." />
          </div>

          <ScreenshotField value={form.screenshot} onChange={(v) => set('screenshot', v)} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {preview != null && Number.isFinite(preview) && (
              <span className="jr-dim" style={{ fontSize: 12 }}>
                P&amp;L on save ≈ <b className={preview > 0 ? 'jr-gain' : preview < 0 ? 'jr-loss' : ''} style={{ fontFamily: 'var(--jr-mono)' }}>{fmtMoney(preview)}</b>
              </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button type="button" className="jr-btn" onClick={() => onOpenChange(false)}>Cancel</button>
              <button type="submit" className="jr-btn jr-btn-primary" disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {trade ? 'Save changes' : 'Log trade'}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
