/**
 * Attachments for trade reviews and day notes — images (downscaled in the
 * browser), PDFs, or https links — stored in journal_notes.attachments.
 *
 * Behaviour from LuxAlgo Trade Journal (apps/web/src/components/attachments.tsx
 * + lib/attachment-validation.ts), https://github.com/LuxAlgo/trade-journal —
 * MIT License, Copyright (c) 2026 LuxAlgo Global, LLC (notice:
 * client/src/lib/journal/LICENSE-luxalgo.txt). Rewritten: no upload service —
 * the file rides inline in the note (server validates type and size).
 */
import { useRef, useState } from 'react';
import { FileText, ImagePlus, Link2, Loader2, Trash2 } from 'lucide-react';
import { downscaleImage } from './trade-editor';

export interface NoteAttachment { url: string; name: string; isImage: boolean }

export const MAX_ATTACHMENTS = 6;
/** The notes route accepts a 4MB body; leave room for the note itself. */
export const MAX_ATTACHMENT_TOTAL_CHARS = 3_600_000;
const MAX_PDF_BYTES = 1_500_000;

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('That file could not be read.'));
  r.readAsDataURL(file);
});

export function AttachmentList({ items, onRemove }: { items: NoteAttachment[]; onRemove?: (i: number) => void }) {
  if (!items.length) return null;
  return (
    <div className="jr-atts">
      {items.map((a, i) => (
        <figure key={`${a.name}-${i}`} className="jr-att">
          {a.isImage ? (
            <a href={a.url} target="_blank" rel="noreferrer noopener"><img src={a.url} alt={a.name} loading="lazy" /></a>
          ) : (
            <a href={a.url} target="_blank" rel="noreferrer noopener" className="doc" download={a.url.startsWith('data:') ? a.name : undefined}>
              {a.url.startsWith('data:') ? <FileText className="h-4 w-4" /> : <Link2 className="h-4 w-4" />} {a.name}
            </a>
          )}
          <figcaption>
            <span title={a.name}>{a.name}</span>
            {onRemove && <button type="button" className="jr-icon-btn" onClick={() => onRemove(i)} aria-label={`Remove ${a.name}`}><Trash2 className="h-3.5 w-3.5" /></button>}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Editable attachment list: drop/paste/pick an image or PDF, or add an https link. */
export function AttachmentsField({ value, onChange, idPrefix }: { value: NoteAttachment[]; onChange: (v: NoteAttachment[]) => void; idPrefix: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [link, setLink] = useState('');
  const total = value.reduce((s, a) => s + a.url.length, 0);
  const full = value.length >= MAX_ATTACHMENTS;

  const add = (a: NoteAttachment) => {
    if (value.length >= MAX_ATTACHMENTS) { setErr(`Up to ${MAX_ATTACHMENTS} attachments.`); return; }
    if (total + a.url.length > MAX_ATTACHMENT_TOTAL_CHARS) { setErr('These attachments are too large together — remove one or use a link.'); return; }
    onChange([...value, a]);
  };
  const take = async (file?: File | null) => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      if (file.type === 'application/pdf') {
        if (file.size > MAX_PDF_BYTES) throw new Error('PDFs up to 1.5MB — link larger files instead.');
        add({ url: await readAsDataUrl(file), name: file.name.slice(0, 120), isImage: false });
      } else {
        add({ url: await downscaleImage(file, 1280, 0.8), name: file.name.slice(0, 120) || 'image', isImage: true });
      }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Attachment failed'); } finally { setBusy(false); }
  };

  return (
    <div className="jr-field">
      <span className="l">Attachments <span className="jr-n">{value.length}/{MAX_ATTACHMENTS}</span></span>
      <AttachmentList items={value} onRemove={(i) => onChange(value.filter((_, k) => k !== i))} />
      {!full && (
        <div className="jr-att-add">
          <button type="button" className="jr-btn jr-btn-sm" disabled={busy} onClick={() => input.current?.click()}
            onPaste={(e) => take(Array.from(e.clipboardData.files)[0])}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} Image or PDF
          </button>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
          <form style={{ display: 'flex', gap: 6, flex: 1, minWidth: 200 }} onSubmit={(e) => {
            e.preventDefault();
            const url = link.trim();
            if (!/^https:\/\/\S+$/i.test(url)) { setErr('Links must start with https://'); return; }
            let name = url;
            try { const u = new URL(url); name = `${u.hostname}${u.pathname}`.slice(0, 120); } catch { /* keep raw */ }
            add({ url, name, isImage: /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) });
            setLink('');
          }}>
            <label htmlFor={`${idPrefix}-link`} className="sr-only">Attachment link</label>
            <input id={`${idPrefix}-link`} className="jr-input" style={{ minHeight: 32 }} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… (chart, doc)" />
            <button type="submit" className="jr-btn jr-btn-sm" disabled={!link.trim()}>Add link</button>
          </form>
        </div>
      )}
      {err && <div className="jr-err" role="alert">{err}</div>}
    </div>
  );
}
