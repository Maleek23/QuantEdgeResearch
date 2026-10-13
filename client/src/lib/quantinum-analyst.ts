/**
 * Quantinum Analyst — client side: page context, selected-setup bus, timeframe
 * preference, shared conversation (server + localStorage fallback) and the
 * slash-command call. See shared/quantinum-analyst.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useStockContext } from '@/contexts/stock-context';
import { NEXUS_IDEA_PARAM } from '@/lib/nexus-link';
import { csrfHeader } from '@/lib/ask-quantinum';
import { sanitizeConversation, type AnalystCard, type ConvMessage, type PageContext } from '@shared/quantinum-analyst';
import { DEFAULT_HORIZON, parseHorizon, type Horizon } from '@shared/quantinum-horizon';

// ─── selected NEXUS setup bus ───────────────────────────────
const FOCUS_EVENT = 'qe:ask-focus';
let focusedSetup: { id: string; symbol: string | null } | null = null;

/** Pages call this when the member selects a NEXUS setup (or null to clear). */
export function setAskFocusSetup(s: { id: string; symbol?: string | null } | null) {
  focusedSetup = s ? { id: s.id, symbol: s.symbol ?? null } : null;
  window.dispatchEvent(new CustomEvent(FOCUS_EVENT));
}

function useFocusedSetup() {
  const [v, setV] = useState(focusedSetup);
  useEffect(() => {
    const on = () => setV(focusedSetup);
    window.addEventListener(FOCUS_EVENT, on);
    return () => window.removeEventListener(FOCUS_EVENT, on);
  }, []);
  return v;
}

/** What the member is looking at right now — sent with every question and command. */
export function usePageContext(): PageContext {
  const [location] = useLocation();
  let currentSym: string | null = null;
  try { currentSym = useStockContext().currentStock?.symbol ?? null; } catch { currentSym = null; } // eslint-disable-line react-hooks/rules-of-hooks
  const setup = useFocusedSetup();
  const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const route = location.split('?')[0] || '/';
  const r = /^\/r\/([A-Za-z0-9.^-]{1,10})/.exec(route);
  const urlSym = r ? decodeURIComponent(r[1]).toUpperCase() : (q.get('sym') || '').toUpperCase() || null;
  const tab = q.get('tab');
  return {
    route,
    tab: tab && /^[a-z0-9_-]{1,32}$/i.test(tab) ? tab.toLowerCase() : null,
    symbol: urlSym || (currentSym ? currentSym.toUpperCase() : null) || setup?.symbol || null,
    setupId: q.get(NEXUS_IDEA_PARAM) || setup?.id || null,
    tool: (q.get('tool') || q.get('panel') || tab || null)?.toLowerCase() ?? null,
  };
}

// ─── timeframe preference (server per user, localStorage first paint) ──
const HZ_KEY = 'qe.quantinum.horizon';
export function useHorizonPref(serverHorizon: Horizon | null): [Horizon, (h: Horizon) => void] {
  const [h, setH] = useState<Horizon>(() => { try { return parseHorizon(localStorage.getItem(HZ_KEY) ?? DEFAULT_HORIZON); } catch { return DEFAULT_HORIZON; } });
  const seeded = useRef(false);
  useEffect(() => {
    if (serverHorizon && !seeded.current) { seeded.current = true; setH(serverHorizon); try { localStorage.setItem(HZ_KEY, serverHorizon); } catch { /* */ } }
  }, [serverHorizon]);
  const set = useCallback((next: Horizon) => {
    setH(next);
    try { localStorage.setItem(HZ_KEY, next); } catch { /* */ }
    void fetch('/api/quantinum/ai/prefs', { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json', ...csrfHeader() }, body: JSON.stringify({ horizon: next }) }).catch(() => {});
  }, []);
  return [h, set];
}

// ─── shared conversation ────────────────────────────────────
const CONV_KEY = 'qe.quantinum.conversation';
const CONV_EVENT = 'qe:ask-conv';
let convCache: ConvMessage[] | null = null;
let serverLoaded = false;
let serverHorizon: Horizon | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function readLocal(): ConvMessage[] {
  try { return sanitizeConversation(JSON.parse(localStorage.getItem(CONV_KEY) ?? '[]')); } catch { return []; }
}
function writeLocal(m: ConvMessage[]) { try { localStorage.setItem(CONV_KEY, JSON.stringify(m)); } catch { /* quota / private */ } }

function scheduleServerSave(m: ConvMessage[]) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void fetch('/api/quantinum/ai/history', { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json', ...csrfHeader() }, body: JSON.stringify({ messages: m }) }).catch(() => {});
  }, 600);
}

/** One thread for the whole app: every panel instance (sheet, /ask page) reads and writes the same list. */
export function useConversation(): { messages: ConvMessage[]; setMessages: (fn: (m: ConvMessage[]) => ConvMessage[], persist?: boolean) => void; clear: () => void; horizon: Horizon | null; source: 'server' | 'local' } {
  const [messages, setLocal] = useState<ConvMessage[]>(() => (convCache ??= readLocal()));
  const [src, setSrc] = useState<'server' | 'local'>(serverLoaded ? 'server' : 'local');
  const [hz, setHz] = useState<Horizon | null>(serverHorizon);
  useEffect(() => {
    const on = () => setLocal(convCache ?? []);
    window.addEventListener(CONV_EVENT, on);
    if (!serverLoaded) {
      fetch('/api/quantinum/ai/history', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((j) => {
          serverLoaded = true;
          serverHorizon = parseHorizon(j.horizon);
          setHz(serverHorizon);
          const srv = sanitizeConversation(j.messages);
          // Server wins when it has anything; else push the local thread up.
          if (srv.length) { convCache = srv; writeLocal(srv); window.dispatchEvent(new CustomEvent(CONV_EVENT)); }
          else if ((convCache ?? []).length) scheduleServerSave(convCache!);
          setSrc('server');
        })
        .catch(() => setSrc('local'));
    }
    return () => window.removeEventListener(CONV_EVENT, on);
  }, []);
  const setMessages = useCallback((fn: (m: ConvMessage[]) => ConvMessage[], persist = true) => {
    convCache = fn(convCache ?? []).slice(-120);
    window.dispatchEvent(new CustomEvent(CONV_EVENT));
    if (persist) { writeLocal(convCache); scheduleServerSave(convCache); }
  }, []);
  const clear = useCallback(() => {
    convCache = [];
    writeLocal([]);
    window.dispatchEvent(new CustomEvent(CONV_EVENT));
    void fetch('/api/quantinum/ai/history', { method: 'DELETE', credentials: 'include', headers: csrfHeader() }).catch(() => {});
  }, []);
  return { messages, setMessages, clear, horizon: hz, source: src };
}

export const newMsgId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ─── slash command call ─────────────────────────────────────
export async function runCommand(body: { text?: string; command?: string; arg?: string | null; horizon: Horizon; page: PageContext }): Promise<{ card: AnalystCard } | { error: string }> {
  try {
    const r = await fetch('/api/quantinum/ai/command', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', ...csrfHeader() }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.card) return { error: j.error ?? 'That command could not run.' };
    return { card: j.card };
  } catch { return { error: 'Could not reach Quantinum. Check your connection.' }; }
}

// ─── panel open/close bus (Cmd/Ctrl+\) ──────────────────────
export const TOGGLE_EVENT = 'qe:ask-toggle';
export function toggleAskPanel() { window.dispatchEvent(new CustomEvent(TOGGLE_EVENT)); }
