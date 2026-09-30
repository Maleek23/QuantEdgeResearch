/**
 * Journal · Trade — the full trade page (?jtrade=<id>), LuxAlgo's trade page
 * (apps/web/src/app/trades/[key]/page.tsx): the chart of the trade with entry /
 * exit markers and stop / target lines, market data around the trade, the
 * facts, a star rating, the playbook rule checklist, chart annotations,
 * Markdown notes, attachments, and prev / next through the list it was opened
 * from. The drawer stays as the quick view.
 *
 * Ported from LuxAlgo Trade Journal (MIT, Copyright (c) 2026 LuxAlgo Global,
 * LLC — notice in client/src/lib/journal/LICENSE-luxalgo.txt): page layout,
 * components/{trade-rating,rule-checklist,trade-navigation,trade-market-data}.
 * Rewritten on our data: the chart is NexusPriceChart; market data is measured
 * from the same OHLCV bars; the review is one journal_notes row per trade
 * (reason 'trade_review') and the rating is journal_trades.rating.
 * Writable only on writable books; Bot / Trade desk trades are read-only.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { journalDayKey } from '@shared/journal-filters';
import { QEEmpty, QEError } from '@/components/ui/qe-states';
import { useCandles, TF_CONFIG } from '@/components/charting/chart-engine';
import { useJournal } from '@/components/journal/journal-context';
import { Card, N, OutcomeChip, Pnl, SideChip } from '@/components/journal/parts';
import { TradeChart } from '@/components/journal/trade-chart';
import { Markdown, MarkdownEditor } from '@/components/journal/rich-notes';
import { AttachmentList, AttachmentsField, type NoteAttachment } from '@/components/journal/attachments';
import { fmtDuration, fmtPrice, toTrade } from '@/lib/journal/metrics';
import {
  EMPTY_REVIEW, encodeTradeReview, marketWindow, planLevels, tradeTimeframe,
  type RuleVerdict, type TradeAnnotation, type TradeReview,
} from '@/lib/journal/metrics-extra';
import { readApiError, useJournalMutations, useJournalNoteMutations } from '@/lib/journal/use-journal';
import { usePlaybookRules, useTradeReviews } from '@/lib/journal/use-journal-extra';

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-/]{0,11}$/;
const when = (iso?: string | null) => (iso
  ? `${new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET`
  : '—');
const signedPct = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(2)}%`);

export default function TradeView({ id, order, onNavigate, onClose }: {
  id: string;
  order: string[];
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const { data, canWrite, openEditor, bookLabel } = useJournal();
  const row = data.allRows.find((r) => r.id === id) ?? null;

  // Prev/next through the list it came from; else the book in time order.
  const seq = useMemo(() => (order.length > 1 ? order : [...data.rows].sort((a, b) => Date.parse(a.entryTime) - Date.parse(b.entryTime)).map((r) => r.id)), [order, data.rows]);
  const idx = seq.indexOf(id);
  const prev = idx > 0 ? seq[idx - 1] : undefined;
  const next = idx >= 0 && idx < seq.length - 1 ? seq[idx + 1] : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowLeft' && prev) onNavigate(prev);
      if (e.key === 'ArrowRight' && next) onNavigate(next);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onNavigate, onClose]);

  if (!row) {
    return (
      <QEEmpty message={`That trade isn't in the ${bookLabel} journal (it may have been deleted, or belongs to another book).`}
        action={<button type="button" className="jr-btn" onClick={onClose}><ArrowLeft className="h-4 w-4" /> Back</button>} />
    );
  }
  const t = toTrade(row);
  const isOpt = row.assetType === 'option';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="jr-trade-head">
        <button type="button" className="jr-btn jr-btn-sm" onClick={onClose}><ArrowLeft className="h-3.5 w-3.5" /> Back</button>
        <h2 className="jr-title" style={{ fontSize: 26 }}>{row.symbol}</h2>
        <SideChip direction={row.direction} assetType={row.assetType} optionType={row.optionType} />
        <OutcomeChip status={t.status} />
        {isOpt && <span className="jr-chip opt">{(row.optionType ?? 'option').toUpperCase()} {row.strikePrice ?? ''} {row.expiryDate?.slice(0, 10) ?? ''}</span>}
        <span style={{ fontSize: 18, fontWeight: 700 }}>{t.status === 'open' ? <span className="jr-dim">open</span> : <Pnl value={t.netPnl} />}</span>
        {row.realizedPnLPercent != null && <span className="jr-n">{row.realizedPnLPercent > 0 ? '+' : ''}{row.realizedPnLPercent.toFixed(1)}% on cost</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {canWrite && <button type="button" className="jr-btn jr-btn-sm" onClick={() => openEditor(row)}><Pencil className="h-3.5 w-3.5" /> Edit trade</button>}
          {!canWrite && <span className="jr-tag">read-only · {bookLabel}</span>}
          <span className="jr-n">{idx >= 0 ? `${idx + 1} of ${seq.length}` : ''}</span>
          <button type="button" className="jr-icon-btn" disabled={!prev} onClick={() => prev && onNavigate(prev)} aria-label="Previous trade (←)"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" className="jr-icon-btn" disabled={!next} onClick={() => next && onNavigate(next)} aria-label="Next trade (→)"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <TradeBody key={row.id} rowId={row.id} />
    </div>
  );
}

function TradeBody({ rowId }: { rowId: string }) {
  const { data, canWrite } = useJournal();
  const row = data.allRows.find((r) => r.id === rowId)!;
  const t = toTrade(row);
  const isOpt = row.assetType === 'option';
  const { reviews, rows: reviewRows } = useTradeReviews(data.notesQ.data?.notes);
  const playbooks = usePlaybookRules(data.notesQ.data?.notes);
  const saved = reviews.get(row.id) ?? EMPTY_REVIEW;
  const savedAtt = (reviewRows.get(row.id)?.attachments ?? []) as NoteAttachment[];
  const plan = planLevels(row.notes);

  const [draft, setDraft] = useState<TradeReview>(saved);
  const [att, setAtt] = useState<NoteAttachment[]>(savedAtt);
  const savedKey = `${encodeTradeReview(saved)}|${JSON.stringify(savedAtt)}`;
  useEffect(() => { setDraft(saved); setAtt(savedAtt); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [savedKey]);
  const dirty = `${encodeTradeReview(draft)}|${JSON.stringify(att)}` !== savedKey;

  const stop = draft.stop ?? plan.stop;
  const target = draft.target ?? plan.target;
  const entryMs = Date.parse(row.entryTime);
  const exitMs = row.exitTime ? Date.parse(row.exitTime) : null;
  const tf = tradeTimeframe(entryMs, exitMs);
  const candles = useCandles(row.symbol, tf);
  const mw = useMemo(() => (candles.data?.bars?.length
    ? marketWindow(candles.data.bars, tf, entryMs, exitMs, t.direction, isOpt ? null : row.entryPrice)
    : null), [candles.data, tf, entryMs, exitMs, t.direction, isOpt, row.entryPrice]);

  const setup = row.setupType?.trim() ?? '';
  const pb = setup ? playbooks.get(setup.toLowerCase()) : undefined;

  const facts: [string, React.ReactNode][] = [
    ['Quantity', `${row.quantity}${isOpt ? ' contracts' : ''}`],
    ['Entry', fmtPrice(row.entryPrice)],
    ['Exit', row.exitPrice != null ? fmtPrice(row.exitPrice) : 'open'],
    ['Fees', fmtPrice(row.fees ?? 0)],
    ['Opened', when(row.entryTime)],
    ['Closed', row.exitTimeNote ?? when(row.exitTime)],
    ['Held', fmtDuration(t.durationMs)],
    ['Source', row.broker || 'manual'],
    ['Setup', row.setupType || '—'],
    ['Mistake', row.mistakeTag || '—'],
    ['Emotion', row.emotion || '—'],
    ['R at plan', (() => {
      if (isOpt || stop == null || row.exitPrice == null) return '—';
      const risk = Math.abs(row.entryPrice - stop);
      if (!(risk > 0)) return '—';
      const r = ((row.exitPrice - row.entryPrice) * (t.direction === 'short' ? -1 : 1)) / risk;
      return `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}R`;
    })()],
  ];

  return (
    <div className="jr-grid">
      <Card className="jr-span-8" num="01" title="Chart"
        meta={<><span className="jr-n">{row.symbol} · {TF_CONFIG[tf]?.label ?? tf} bars{isOpt ? ' · underlying' : ''}</span></>}>
        <TradeChart symbol={row.symbol} tf={tf} entryMs={entryMs} exitMs={exitMs} entryPrice={row.entryPrice} exitPrice={row.exitPrice ?? null}
          priceMarkers={!isOpt} direction={t.direction} stop={stop} target={target} annotations={draft.annotations} />
        <p className="jr-note">
          {isOpt ? 'Option trade: the chart is the underlying, so entry and exit are time markers — a premium is not a price on this chart. ' : 'Triangles mark the fills at their prices. '}
          {stop != null || target != null
            ? `Stop/target: ${draft.stop != null || draft.target != null ? "this trade's review" : "the trade's recorded plan"}. `
            : canWrite ? 'Add a stop and target in the review to draw them. ' : 'No stop or target recorded for this trade. '}
          Timeframe picked so the feed's history still reaches the entry.
        </p>
      </Card>

      <Card className="jr-span-4" num="02" title="Market Around the Trade" meta={mw ? <N n={mw.barsInTrade} unit={`${TF_CONFIG[tf]?.label ?? tf} bars held`} /> : undefined}>
        {candles.isLoading ? <p className="jr-note">Loading bars…</p> : candles.isError || !mw ? (
          <QEError title="No price history for this trade" message={`The price feed had no ${TF_CONFIG[tf]?.label ?? tf} bars for ${row.symbol} covering this trade — market context is unavailable, not zero.`} />
        ) : mw.barsInTrade === 0 ? (
          <p className="jr-note">The feed's bars don't cover this trade's entry time.</p>
        ) : (
          <div className="jr-stats">
            <div><span>{isOpt ? 'Underlying at entry' : 'Bar close at entry'}</span><b>{fmtPrice(mw.underlyingAtEntry)}</b></div>
            <div><span>{isOpt ? 'Underlying at exit' : 'Bar close at exit'}</span><b>{mw.underlyingAtExit != null ? fmtPrice(mw.underlyingAtExit) : t.status === 'open' ? 'open' : '—'}</b></div>
            <div><span>Move while held</span><b>{signedPct(mw.movePct)}</b><small>underlying, price terms</small></div>
            <div><span>Range while held</span><b style={{ fontSize: 13 }}>{fmtPrice(mw.lowInTrade)} – {fmtPrice(mw.highInTrade)}</b></div>
            {!isOpt && <div><span>Best excursion (MFE)</span><b className="jr-gain">{signedPct(mw.mfePct)}</b><small>in the trade's direction</small></div>}
            {!isOpt && <div><span>Worst excursion (MAE)</span><b className="jr-loss">{signedPct(mw.maePct)}</b><small>against the trade</small></div>}
            <div><span>After the exit</span><b>{signedPct(mw.afterExitPct)}</b><small>{mw.afterExitBars ? `next ${mw.afterExitBars} bars` : 'no bars after exit yet'}</small></div>
          </div>
        )}
        <div className="jr-stats" style={{ marginTop: 10 }}>
          {facts.map(([k, v]) => <div key={k}><span>{k}</span><b style={{ fontSize: 13 }}>{v}</b></div>)}
        </div>
      </Card>

      <ReviewCard row={row} draft={draft} setDraft={setDraft} att={att} setAtt={setAtt} dirty={dirty} pbRules={pb?.rules ?? null} setup={setup} hasPlan={plan.stop != null || plan.target != null} />
    </div>
  );
}

function StarRating({ value, onChange, disabled }: { value: number | null; onChange?: (v: number | null) => void; disabled?: boolean }) {
  return (
    <div className="jr-stars" role="radiogroup" aria-label="Execution rating, 1 to 5">
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} type="button" role="radio" aria-checked={value === s} aria-label={`${s} of 5`} disabled={disabled || !onChange}
          onClick={() => onChange?.(value === s ? null : s)} className={value != null && s <= value ? 'on' : ''}>
          <Star className="h-4 w-4" />
        </button>
      ))}
      <span className="jr-n">{value ? `${value}/5` : 'not rated'}</span>
    </div>
  );
}

function ReviewCard({ row, draft, setDraft, att, setAtt, dirty, pbRules, setup, hasPlan }: {
  row: ReturnType<typeof useJournal>['data']['allRows'][number];
  draft: TradeReview;
  setDraft: (fn: (d: TradeReview) => TradeReview) => void;
  att: NoteAttachment[];
  setAtt: (a: NoteAttachment[]) => void;
  dirty: boolean;
  pbRules: string[] | null;
  setup: string;
  hasPlan: boolean;
}) {
  const { data, canWrite, goTo } = useJournal();
  const { save: saveTrade } = useJournalMutations(data.key);
  const { save } = useJournalNoteMutations(data.key);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [ann, setAnn] = useState<{ text: string; at: 'entry' | 'exit' | 'none'; price: string }>({ text: '', at: 'entry', price: '' });
  const ledger = data.key === 'bot' || data.key === 'desk';

  const rules = pbRules ?? [];
  const assessed = rules.filter((r) => draft.checklist[r]);
  const followed = assessed.filter((r) => draft.checklist[r] === 'followed').length;
  // Verdicts on rules that were later removed from the playbook stay visible.
  const orphan = Object.keys(draft.checklist).filter((r) => !rules.includes(r));

  const setVerdict = (rule: string, v: RuleVerdict | '') => setDraft((d) => {
    const c = { ...d.checklist };
    if (v) c[rule] = v; else delete c[rule];
    return { ...d, checklist: c };
  });
  const num = (s: string) => { const v = Number(s); return s.trim() && Number.isFinite(v) && v > 0 ? v : null; };

  const submit = async () => {
    setMsg(null);
    try {
      const body = encodeTradeReview(draft);
      const sym = row.symbol.toUpperCase();
      const r = await save.mutateAsync({
        kind: 'trade_review', ref: row.id, day: journalDayKey(row.entryTime), body,
        symbols: SYMBOL_RE.test(sym) ? [sym] : undefined, attachments: att.length ? att : undefined,
      });
      setMsg({ ok: true, text: r.note ? 'Review saved.' : 'Review cleared.' });
    } catch (e) { setMsg({ ok: false, text: await readApiError(e) }); }
  };

  if (ledger) {
    return (
      <Card className="jr-span-12" num="03" title="Review">
        <StarRating value={row.rating ?? null} disabled />
        {row.notes && <div className="jr-notes" style={{ marginTop: 10 }}>{row.notes}</div>}
        <p className="jr-note">The {data.meta?.label ?? 'ledger'} book is computed from its source ledger — it carries no reviews, checklist or attachments.</p>
      </Card>
    );
  }

  return (
    <>
      <Card className="jr-span-6" num="03" title="Rating & Rule Checklist"
        meta={pbRules ? <span className="jr-n">{assessed.length}/{rules.length} assessed{assessed.length ? ` · ${Math.round((followed / assessed.length) * 100)}% followed` : ''}</span> : undefined}>
        <StarRating value={row.rating ?? null} disabled={!canWrite || saveTrade.isPending}
          onChange={async (v) => {
            setMsg(null);
            try { await saveTrade.mutateAsync({ id: row.id, input: { rating: v } }); setMsg({ ok: true, text: v ? `Rated ${v}/5.` : 'Rating cleared.' }); } catch (e) { setMsg({ ok: false, text: await readApiError(e) }); }
          }} />
        <div style={{ marginTop: 12 }}>
          {!setup ? (
            <p className="jr-note" style={{ margin: 0 }}>This trade has no setup. Tag it with a playbook's setup (Edit trade → Setup) to check that playbook's rules here.</p>
          ) : !pbRules ? (
            <p className="jr-note" style={{ margin: 0 }}>No written playbook for “{setup}”. <button type="button" className="jr-cell-btn jr-accent-link" onClick={() => goTo('playbooks')}>Write one on Playbooks</button> — one rule per line — and its rules appear here.</p>
          ) : !rules.length ? (
            <p className="jr-note" style={{ margin: 0 }}>The “{setup}” playbook has no rules yet (one per line after the description).</p>
          ) : (
            <ul className="jr-checklist">
              {rules.map((r) => (
                <li key={r}>
                  <span>{r}</span>
                  <select className="jr-select" aria-label={`Rule: ${r}`} disabled={!canWrite} value={draft.checklist[r] ?? ''} onChange={(e) => setVerdict(r, e.target.value as RuleVerdict | '')}
                    data-v={draft.checklist[r] ?? 'none'}>
                    <option value="">Not assessed</option>
                    <option value="followed">Followed</option>
                    <option value="broken">Broken</option>
                  </select>
                </li>
              ))}
            </ul>
          )}
          {orphan.length > 0 && <p className="jr-note">{orphan.length} earlier verdict{orphan.length === 1 ? '' : 's'} on rules no longer in the playbook ({orphan.join('; ')}) — kept, not counted in adherence.</p>}
        </div>
        <div className="jr-form-grid" style={{ marginTop: 12 }}>
          <div className="jr-field">
            <label htmlFor="jr-tr-stop">Stop {row.assetType === 'option' ? '(underlying)' : ''}</label>
            <input id="jr-tr-stop" className="jr-input" inputMode="decimal" disabled={!canWrite} value={draft.stop ?? ''} placeholder={hasPlan ? 'from the plan' : 'e.g. 412.50'}
              onChange={(e) => setDraft((d) => ({ ...d, stop: num(e.target.value) }))} />
          </div>
          <div className="jr-field">
            <label htmlFor="jr-tr-target">Target {row.assetType === 'option' ? '(underlying)' : ''}</label>
            <input id="jr-tr-target" className="jr-input" inputMode="decimal" disabled={!canWrite} value={draft.target ?? ''} placeholder={hasPlan ? 'from the plan' : 'e.g. 430'}
              onChange={(e) => setDraft((d) => ({ ...d, target: num(e.target.value) }))} />
          </div>
        </div>
      </Card>

      <Card className="jr-span-6" num="04" title="Annotations" meta={<N n={draft.annotations.length} unit="notes" />}>
        {draft.annotations.length ? (
          <ol className="jr-annots">
            {draft.annotations.map((a, i) => (
              <li key={a.id}>
                <span className="dot">{i + 1}</span>
                <span style={{ flex: 1 }}>{a.text}<span className="jr-n"> · {a.at ? when(a.at) : 'no time'}{a.price != null ? ` · @ ${fmtPrice(a.price)}` : ''}</span></span>
                {canWrite && <button type="button" className="jr-icon-btn" aria-label={`Remove annotation ${i + 1}`} onClick={() => setDraft((d) => ({ ...d, annotations: d.annotations.filter((x) => x.id !== a.id) }))}><Trash2 className="h-3.5 w-3.5" /></button>}
              </li>
            ))}
          </ol>
        ) : <p className="jr-note" style={{ marginTop: 0 }}>{canWrite ? 'Pin a remark to the entry or exit bar (and a price) — it draws on the chart as a numbered dot.' : 'No annotations.'}</p>}
        {canWrite && (
          <form className="jr-annot-form" onSubmit={(e) => {
            e.preventDefault();
            if (!ann.text.trim()) return;
            const at = ann.at === 'entry' ? row.entryTime : ann.at === 'exit' ? row.exitTime ?? null : null;
            const a: TradeAnnotation = { id: Math.random().toString(36).slice(2, 10), text: ann.text.trim().slice(0, 500), at, price: num(ann.price) };
            setDraft((d) => ({ ...d, annotations: [...d.annotations, a].slice(0, 50) }));
            setAnn({ text: '', at: ann.at, price: '' });
          }}>
            <label htmlFor="jr-ann-text" className="sr-only">Annotation</label>
            <input id="jr-ann-text" className="jr-input" value={ann.text} maxLength={500} placeholder="e.g. entered on the reclaim of VWAP" onChange={(e) => setAnn({ ...ann, text: e.target.value })} />
            <select className="jr-select" aria-label="Pin to" value={ann.at} onChange={(e) => setAnn({ ...ann, at: e.target.value as never })}>
              <option value="entry">at entry bar</option>
              <option value="exit" disabled={!row.exitTime}>at exit bar</option>
              <option value="none">not on chart</option>
            </select>
            <input className="jr-input" style={{ maxWidth: 110 }} inputMode="decimal" aria-label="Price (optional)" placeholder="price" value={ann.price} onChange={(e) => setAnn({ ...ann, price: e.target.value })} />
            <button type="submit" className="jr-btn jr-btn-sm" disabled={!ann.text.trim()}><Plus className="h-3.5 w-3.5" /> Add note</button>
          </form>
        )}
      </Card>

      <Card className="jr-span-12" num="05" title="Notes & Attachments">
        {row.notes && (
          <div className="jr-field" style={{ marginBottom: 10 }}>
            <span className="l">Trade notes {row.broker !== 'manual' ? `(from ${row.broker})` : ''}</span>
            <div className="jr-notes">{row.notes}</div>
          </div>
        )}
        {canWrite ? (
          <>
            <MarkdownEditor id={`jr-tr-notes-${row.id}`} label="Trade review notes" value={draft.notes} onChange={(v) => setDraft((d) => ({ ...d, notes: v }))}
              placeholder="Setup and thesis · execution · what worked · what you'll change" />
            <div style={{ marginTop: 10 }}><AttachmentsField idPrefix={`jr-tr-${row.id}`} value={att} onChange={setAtt} /></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              <button type="button" className="jr-btn jr-btn-primary jr-btn-sm" disabled={!dirty || save.isPending} onClick={submit}>
                {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save review
              </button>
              {dirty && <span className="jr-n">unsaved changes (checklist, stop/target, annotations, notes, attachments)</span>}
              {msg && <span className={msg.ok ? 'jr-gain' : 'jr-loss'} role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 12 }}>{msg.text}</span>}
            </div>
          </>
        ) : (
          <>
            {draft.notes.trim() ? <Markdown source={draft.notes} /> : <p className="jr-note" style={{ margin: 0 }}>No review notes.</p>}
            <AttachmentList items={att} />
          </>
        )}
        {!canWrite && msg && <span className={msg.ok ? 'jr-gain' : 'jr-loss'} role="status">{msg.text}</span>}
      </Card>
    </>
  );
}

