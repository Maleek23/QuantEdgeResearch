/**
 * Ask Quantinum — the ONE conversation panel. The side sheet and the /ask page
 * both render this, over the same shared thread (server-persisted per member,
 * localStorage fallback), so a question asked on GEX is still there on NEXUS.
 *
 *   free text  → the model (SSE), answering from the context pack, with page
 *                context (route/tab/ticker/setup/tool) + timeframe attached
 *   /command   → a deterministic server tool → a structured card (no model)
 *
 * Timeframe picker (Scalp/Day/Swing/Position) sits under the input, persisted
 * per member, and decides which expiries the GEX/flow reads use.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Send, Sparkles, Square, Trash2, X } from 'lucide-react';
import { LuxSegmented } from '@/components/lux/lux-segmented';
import { ASK_STATUS_KEY, streamAsk, type AskStatus } from '@/lib/ask-quantinum';
import { newMsgId, runCommand, useConversation, useHorizonPref, usePageContext } from '@/lib/quantinum-analyst';
import { stripCitationMarkers, type AskTarget } from '@shared/quantinum-ai';
import { ANALYST_DISCLAIMER, parseSlash, suggestCommands, type ConvChip, type ConvMessage } from '@shared/quantinum-analyst';
import { HORIZONS, HORIZON_WINDOWS, type Horizon } from '@shared/quantinum-horizon';
import { AnalystCardView, SourceChip } from './analyst-card';
import './ask-quantinum.css';

type Chip = ConvChip & { value?: string };

function targetLine(t: AskTarget | null): string | null {
  if (!t) return null;
  if (t.label) return t.label;
  const kind = { page: 'This page', ticker: 'Ticker', setup: 'NEXUS setup', flow: 'Flow print', gex: 'GEX level', zerodte: '0DTE row', journal: 'Journal trade' }[t.kind];
  return [kind, t.symbol].filter(Boolean).join(' · ');
}

/** The symbol the conversation is about now (for the /ask page chart). */
export function discussedSymbol(msgs: ConvMessage[], fallback: string | null): string | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.card?.subject && /^[A-Z][A-Z0-9.^-]{0,9}$/.test(m.card.subject)) return m.card.subject;
    if (m.role === 'user' && m.page?.symbol) return m.page.symbol;
  }
  return fallback;
}

export function AskQuantinumPanel({ target, seedPrompt, status, onClearTarget, variant = 'sheet' }: {
  target: AskTarget | null;
  seedPrompt?: { text: string; nonce: number } | null;
  status: AskStatus | undefined;
  onClearTarget?: () => void;
  variant?: 'sheet' | 'page';
}) {
  const qc = useQueryClient();
  const page = usePageContext();
  const conv = useConversation();
  const [horizon, setHorizon] = useHorizonPref(conv.horizon);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<'quick' | 'deep'>('quick');
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [remaining, setRemaining] = useState<number | null>(status?.remaining ?? null);
  const [sel, setSel] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const msgs = conv.messages;

  useEffect(() => { if (status?.remaining != null) setRemaining(status.remaining); }, [status?.remaining]);
  useEffect(() => {
    if (!seedPrompt) return;
    setDraft(seedPrompt.text);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [seedPrompt?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [msgs.length, msgs[msgs.length - 1]?.content]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const suggestions = useMemo(() => suggestCommands(draft), [draft]);
  useEffect(() => setSel(0), [suggestions.length]);

  const patch = (id: string, fn: (m: ConvMessage) => ConvMessage, persist = true) => conv.setMessages((xs) => xs.map((m) => (m.id === id ? fn(m) : m)), persist);
  const pageStamp = { route: page.route, symbol: page.symbol ?? target?.symbol ?? null };

  const sendCommand = async (q: string) => {
    const user: ConvMessage = { id: newMsgId(), role: 'user', content: q, at: new Date().toISOString(), page: pageStamp };
    const parsed = parseSlash(q);
    if (parsed && !parsed.ok) {
      conv.setMessages((xs) => [...xs, user, { id: newMsgId(), role: 'assistant', content: '', at: new Date().toISOString(), error: parsed.error }]);
      return;
    }
    const aid = newMsgId();
    conv.setMessages((xs) => [...xs, user, { id: aid, role: 'assistant', content: '', at: new Date().toISOString() }], false);
    setBusy(true); setAnnounce('Reading the data…');
    const pageForCmd = { ...page, symbol: page.symbol ?? target?.symbol ?? null, setupId: page.setupId ?? (target?.kind === 'setup' ? target.id ?? null : null) };
    const r = await runCommand({ text: q, horizon, page: pageForCmd });
    setBusy(false);
    if ('error' in r) { patch(aid, (m) => ({ ...m, error: r.error })); setAnnounce(r.error); return; }
    patch(aid, (m) => ({ ...m, card: r.card, content: r.card.title }));
    setAnnounce(`${r.card.title} ready.`);
  };

  const sendQuestion = async (q: string, replaceId?: string) => {
    const history = msgs.filter((m) => !m.error && m.content && !m.card).map((m) => ({ role: m.role, content: m.content })).slice(-6);
    const aid = replaceId ?? newMsgId();
    if (!replaceId) conv.setMessages((xs) => [...xs, { id: newMsgId(), role: 'user', content: q, at: new Date().toISOString(), page: pageStamp }, { id: aid, role: 'assistant', content: '', at: new Date().toISOString() }], false);
    setBusy(true); setAnnounce('Quantinum is answering…');
    const ac = new AbortController();
    abortRef.current = ac;
    const before = replaceId ? (msgs.find((m) => m.id === replaceId)?.chips as Chip[] | undefined) : undefined;
    if (replaceId) patch(replaceId, (m) => ({ ...m, content: '', error: undefined }), false);
    let doneOk = false;
    await streamAsk({ question: q, target: target ?? { kind: 'page', page: (page.route ?? '/') + window.location.search.slice(0, 80) }, mode, history, page, horizon }, {
      onDelta: (t) => patch(aid, (m) => ({ ...m, content: m.content + t }), false),
      onReset: () => patch(aid, (m) => ({ ...m, content: '' }), false),
      onLookup: (l) => setAnnounce(`Looked up ${l.tool} for ${l.symbol}`),
      onDone: (d) => {
        doneOk = true;
        const chips = d.citations as Chip[];
        let diffNote: string | undefined;
        if (before) {
          const prev = new Map(before.map((c) => [c.key, c.value]));
          const changed = chips.filter((c) => prev.has(c.key) && prev.get(c.key) !== c.value).map((c) => c.label);
          diffNote = changed.length ? `Re-checked: changed — ${changed.join(', ')}` : 'Re-checked: the cited data has not changed.';
        }
        patch(aid, (m) => ({ ...m, chips, error: diffNote ? undefined : m.error, ...(diffNote ? { content: `${m.content}\n\n> ${diffNote}` } : {}) }));
        setRemaining(d.remaining);
        setAnnounce('Answer ready.');
        qc.setQueryData<AskStatus>(ASK_STATUS_KEY, (s) => (s ? { ...s, remaining: d.remaining } : s));
      },
      onError: (e) => {
        patch(aid, (m) => ({ ...m, error: e.error }));
        if (e.code === 'quota') setRemaining(0);
        setAnnounce(e.error);
      },
    }, ac.signal);
    if (!doneOk) patch(aid, (m) => m, true);
    setBusy(false);
    abortRef.current = null;
  };

  const send = async () => {
    const q = draft.trim();
    if (!q || busy) return;
    setDraft('');
    if (q.startsWith('/')) await sendCommand(q); else await sendQuestion(q);
  };

  const recheckProse = (assistantId: string) => {
    const i = msgs.findIndex((m) => m.id === assistantId);
    const q = [...msgs.slice(0, i)].reverse().find((m) => m.role === 'user')?.content;
    if (q && !busy) void sendQuestion(q, assistantId);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        const s = suggestions[sel];
        if (s && draft.trim() !== `/${s.name}`) { e.preventDefault(); setDraft(`/${s.name}${s.arg === 'none' ? '' : ' '}`); return; }
      }
      if (e.key === 'Escape') { e.preventDefault(); setDraft(''); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
  };

  const tl = targetLine(target) ?? (page.setupId ? `NEXUS setup · ${page.symbol ?? page.setupId}` : page.symbol ? `${page.symbol} · focused` : null);

  return (
    <div className="aq-panel" data-variant={variant}>
      <div className="aq-target">
        {tl ? <><span>About</span><strong>{tl}</strong></> : <span>No ticker focused — name one, or use /indices.</span>}
        <span className="aq-ctx" title="Sent with every question">{[page.route, page.tab && `tab ${page.tab}`].filter(Boolean).join(' · ')}</span>
        {target && onClearTarget && <button type="button" className="lx-icon-btn lx-focus" aria-label="Ask about this page instead" title="Clear the object" onClick={onClearTarget}><X aria-hidden size={14} /></button>}
      </div>
      <div ref={logRef} className="aq-log" aria-label="Conversation">
        {msgs.length === 0 && (
          <div className="aq-empty">
            <p>Quantinum answers from this platform's own data and shows where every number came from and how old it is.</p>
            <ul>
              <li>Type <code>/</code> for commands: <code>/levels</code> <code>/flow</code> <code>/setup</code> <code>/indices</code> <code>/sector</code> <code>/news</code> <code>/record</code>.</li>
              <li>It says <em>not in the data</em> or <em>nothing qualifies</em> when that's the truth.</li>
              <li>Track records use verified outcomes only, and say <em>too few to judge</em> under n=20.</li>
            </ul>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className="aq-msg" data-role={m.role} data-card={m.card ? 'true' : undefined}>
            {m.role === 'user' ? m.content : m.card ? (
              <AnalystCardView card={m.card} onReplace={(c) => patch(m.id, (x) => ({ ...x, card: c }))} />
            ) : (
              <>
                {m.content
                  ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" /> }}>{stripCitationMarkers(m.content)}</ReactMarkdown>
                  : !m.error ? <span className="aq-typing">reading the data…</span> : null}
                {m.error && <div className="aq-error" role="alert">{m.error}</div>}
                {m.content && !m.error && (
                  <div className="aq-meta" aria-label="Sources">
                    {(m.chips ?? []).map((c) => <SourceChip key={c.key} label={c.label} source={c.source} asOf={c.asOf} />)}
                    {(m.chips ?? []).length === 0 && <span className="aq-foot">no sourced figures cited — treat any number above as unverified</span>}
                    <button type="button" className="lx-btn aq-recheck" disabled={busy} onClick={() => recheckProse(m.id)} aria-label="Re-check: ask again on fresh data and show what changed"><RefreshCw aria-hidden size={12} />Re-check</button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="lx-sr-only" aria-live="polite" role="status">{announce}</div>
      <form className="aq-compose" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <label htmlFor={`aq-input-${variant}`} className="lx-sr-only">Your question or /command</label>
        <div className="aq-input-wrap">
          {suggestions.length > 0 && (
            <ul className="aq-suggest" role="listbox" id={`aq-suggest-${variant}`} aria-label="Commands">
              {suggestions.map((s, i) => (
                <li key={s.name} role="option" aria-selected={i === sel} data-active={i === sel}
                  onMouseDown={(e) => { e.preventDefault(); setDraft(`/${s.name}${s.arg === 'none' ? '' : ' '}`); inputRef.current?.focus(); }}>
                  <code>{s.usage}</code><span>{s.hint}</span>
                </li>
              ))}
            </ul>
          )}
          <textarea
            id={`aq-input-${variant}`}
            ref={inputRef}
            value={draft}
            maxLength={2000}
            placeholder={page.symbol ? `Ask about ${page.symbol}, or type / for commands` : 'Ask, or type / for commands'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls={`aq-suggest-${variant}`}
            aria-autocomplete="list"
          />
        </div>
        <div className="aq-row aq-hz">
          <LuxSegmented<Horizon>
            label="Timeframe (which expiries the GEX and flow reads use)"
            size="sm"
            value={horizon}
            onChange={setHorizon}
            options={HORIZONS.map((h) => ({ value: h, label: HORIZON_WINDOWS[h].label, hint: HORIZON_WINDOWS[h].expiries }))}
          />
          <span className="aq-foot">{HORIZON_WINDOWS[horizon].expiries}</span>
        </div>
        <div className="aq-row">
          <LuxSegmented
            label="Answer depth"
            size="sm"
            value={mode}
            onChange={setMode}
            options={[{ value: 'quick', label: 'Quick', hint: 'Fast answer' }, { value: 'deep', label: 'Deep', hint: 'Slower, more thorough (Claude)' }]}
          />
          <span className="aq-spacer" />
          {remaining != null && <span className="aq-foot" aria-label={`${remaining} questions left today`}>{remaining} left</span>}
          {msgs.length > 0 && !busy && <button type="button" className="lx-icon-btn lx-focus" aria-label="Clear the conversation" title="Clear the conversation" onClick={() => { if (window.confirm('Clear the whole Quantinum conversation?')) conv.clear(); }}><Trash2 aria-hidden size={14} /></button>}
          {busy
            ? <button type="button" className="lx-btn" onClick={() => abortRef.current?.abort()}><Square aria-hidden />Stop</button>
            : <button type="submit" className="lx-btn" data-variant="primary" disabled={!draft.trim() || (remaining === 0 && !draft.trim().startsWith('/'))}><Send aria-hidden />Ask</button>}
        </div>
        <div className="aq-disclaimer"><Sparkles aria-hidden size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />{ANALYST_DISCLAIMER}{conv.source === 'local' ? ' · history saved on this device only' : ''}</div>
      </form>
    </div>
  );
}
