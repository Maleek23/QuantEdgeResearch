/**
 * Ask Quantinum — the side sheet chat (docs/ASK_QUANTINUM.md).
 *
 * QEDrawer (Radix Dialog: focus trap, Esc, focus return, labelled) on the right
 * on desktop, from the bottom on phones. Answers stream in as markdown; the
 * pack fields the model cited render as source chips under each answer, with
 * their age. A polite live region announces when an answer completes (not every
 * token). Quick = fast free-tier model; Deep = Claude. Lazy-loaded by the host
 * so react-markdown never lands on first paint.
 */
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, Square, Send, X } from 'lucide-react';
import { QEDrawer } from '@/components/ui/qe-drawer';
import { LuxSegmented } from '@/components/lux/lux-segmented';
import { ASK_STATUS_KEY, defaultPrompt, streamAsk, type AskStatus } from '@/lib/ask-quantinum';
import { ASK_QUANTINUM_DISCLAIMER, stripCitationMarkers, type AskTarget } from '@shared/quantinum-ai';
import './ask-quantinum.css';

interface Chip { key: string; label: string; source: string; asOf: string | null }
interface Msg { id: number; role: 'user' | 'assistant'; content: string; chips?: Chip[]; note?: string; error?: string; pending?: boolean; model?: string | null }

function ago(iso: string | null): string | null {
  if (!iso) return null;
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s) || s < 0) return null;
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 172800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function targetLine(t: AskTarget | null): string | null {
  if (!t) return null;
  if (t.label) return t.label;
  const kind = { page: 'This page', ticker: 'Ticker', setup: 'NEXUS setup', flow: 'Flow print', gex: 'GEX level', zerodte: '0DTE row', journal: 'Journal trade' }[t.kind];
  return [kind, t.symbol].filter(Boolean).join(' · ');
}

function usePhone(): boolean {
  const q = '(max-width: 767px)';
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(q).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const on = () => setM(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return !!m;
}

export default function AskQuantinumSheet({ open, onClose, target, seedPrompt, status, onClearTarget }: {
  open: boolean;
  onClose: () => void;
  target: AskTarget | null;
  /** Bumps whenever an Analyze action opens the sheet. */
  seedPrompt: { text: string; nonce: number } | null;
  status: AskStatus | undefined;
  onClearTarget: () => void;
}) {
  const qc = useQueryClient();
  const phone = usePhone();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<'quick' | 'deep'>('quick');
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [remaining, setRemaining] = useState<number | null>(status?.remaining ?? null);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const idRef = useRef(1);

  useEffect(() => { if (status?.remaining != null) setRemaining(status.remaining); }, [status?.remaining]);
  // A new object → a fresh thread pre-filled with that object's question.
  useEffect(() => {
    if (!seedPrompt) return;
    setDraft(seedPrompt.text || (target ? defaultPrompt(target) : ''));
    setMsgs([]);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [seedPrompt?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [msgs]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const patchLast = (fn: (m: Msg) => Msg) => setMsgs((xs) => xs.map((m, i) => (i === xs.length - 1 ? fn(m) : m)));

  const send = async () => {
    const q = draft.trim();
    if (!q || busy) return;
    const history = msgs.filter((m) => !m.error && !m.pending).map((m) => ({ role: m.role, content: m.content })).slice(-6);
    setMsgs((xs) => [...xs, { id: idRef.current++, role: 'user', content: q }, { id: idRef.current++, role: 'assistant', content: '', pending: true }]);
    setDraft('');
    setBusy(true);
    setAnnounce('Quantinum is answering…');
    const ac = new AbortController();
    abortRef.current = ac;
    await streamAsk({ question: q, target: target ?? { kind: 'page', page: window.location.pathname + window.location.search }, mode, history }, {
      onDelta: (t) => patchLast((m) => ({ ...m, content: m.content + t })),
      onReset: () => patchLast((m) => ({ ...m, content: '' })),
      onLookup: (l) => patchLast((m) => ({ ...m, note: `Looked up ${l.tool} for ${l.symbol}` })),
      onDone: (d) => {
        patchLast((m) => ({ ...m, pending: false, chips: d.citations, model: d.model }));
        setRemaining(d.remaining);
        setAnnounce('Answer ready.');
        qc.setQueryData<AskStatus>(ASK_STATUS_KEY, (s) => (s ? { ...s, remaining: d.remaining } : s));
      },
      onError: (e) => {
        patchLast((m) => ({ ...m, pending: false, error: e.error }));
        if (e.code === 'quota') setRemaining(0);
        setAnnounce(e.error);
      },
    }, ac.signal);
    patchLast((m) => (m.pending ? { ...m, pending: false, note: m.note ?? 'Stopped.' } : m));
    setBusy(false);
    abortRef.current = null;
  };

  const stop = () => abortRef.current?.abort();
  const tl = targetLine(target);

  return (
    <QEDrawer
      open={open}
      onClose={onClose}
      title="Ask Quantinum"
      subtitle="Answers from QuantEdge data only"
      side={phone ? 'bottom' : 'right'}
      size="sm"
      className="aq-sheet"
    >
      {tl && (
        <div className="aq-target">
          <span>About</span><strong>{tl}</strong>
          <button type="button" className="lx-icon-btn lx-focus" aria-label="Ask about this page instead" title="Clear the object" onClick={onClearTarget}><X aria-hidden size={14} /></button>
        </div>
      )}
      <div ref={logRef} className="aq-log" aria-label="Conversation">
        {msgs.length === 0 && (
          <div className="aq-empty">
            <p>Quantinum answers from this platform's own data — the setup plan and NEXUS grade, live quote with its age, levels, GEX walls, flow and the verified record — and cites what it used.</p>
            <ul>
              <li>It says <em>not in the data</em> when we don't have it.</li>
              <li>It frames setup, risk and invalidation — never buy/sell calls.</li>
            </ul>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className="aq-msg" data-role={m.role}>
            {m.role === 'user' ? m.content : (
              <>
                {m.content
                  ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" /> }}>{stripCitationMarkers(m.content)}</ReactMarkdown>
                  : m.pending && !m.error ? <span className="aq-typing">reading the data…</span> : null}
                {m.note && <div className="aq-note">{m.note}</div>}
                {m.error && <div className="aq-error" role="alert">{m.error}</div>}
                {!m.pending && !m.error && (
                  <div className="aq-meta" aria-label="Sources">
                    {(m.chips ?? []).map((c) => (
                      <span key={c.key} className="aq-src" title={`${c.source}${c.asOf ? ` · as of ${new Date(c.asOf).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET` : ''}`}>
                        <b>{c.label}</b>{ago(c.asOf) ? ` · ${ago(c.asOf)}` : ''}
                      </span>
                    ))}
                    {(m.chips ?? []).length === 0 && m.content && <span className="aq-foot">no pack fields cited</span>}
                    <span className="aq-foot">· {ASK_QUANTINUM_DISCLAIMER}</span>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="lx-sr-only" aria-live="polite" role="status">{announce}</div>
      <form className="aq-compose" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <label htmlFor="aq-input" className="lx-sr-only">Your question</label>
        <textarea
          id="aq-input"
          ref={inputRef}
          value={draft}
          maxLength={2000}
          placeholder="Ask about a setup, ticker, level or print…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
        />
        <div className="aq-row">
          <LuxSegmented
            label="Answer depth"
            size="sm"
            value={mode}
            onChange={setMode}
            options={[{ value: 'quick', label: 'Quick', hint: 'Fast answer' }, { value: 'deep', label: 'Deep analyze', hint: 'Slower, more thorough (Claude)' }]}
          />
          <span className="aq-spacer" />
          {remaining != null && <span className="aq-foot" aria-label={`${remaining} questions left today`}>{remaining} left today</span>}
          {busy
            ? <button type="button" className="lx-btn" onClick={stop}><Square aria-hidden />Stop</button>
            : <button type="submit" className="lx-btn" data-variant="primary" disabled={!draft.trim() || remaining === 0}><Send aria-hidden />Ask</button>}
        </div>
        <div className="aq-disclaimer"><Sparkles aria-hidden size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />{ASK_QUANTINUM_DISCLAIMER} AI can be wrong — check the cited fields.</div>
      </form>
    </QEDrawer>
  );
}
