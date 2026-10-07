/**
 * Ask Quantinum — client bus + status hook (docs/ASK_QUANTINUM.md).
 *
 *   openAskQuantinum({ kind: 'setup', id, symbol, label })   opens the sheet pre-filled
 *   useAskQuantinumStatus()                                  { enabled, quota, remaining }
 *
 * The bus is a window CustomEvent (same pattern as lib/workup-bus.ts), so any
 * row anywhere can open the sheet without threading context through its tree.
 * The status query is the only gate the UI uses; the server re-checks on every ask.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import type { AskTarget } from '@shared/quantinum-ai';

const EVENT = 'qe:ask-quantinum';

export interface AskOpenDetail { target: AskTarget; prompt?: string }

export function openAskQuantinum(target: AskTarget, prompt?: string) {
  window.dispatchEvent(new CustomEvent<AskOpenDetail>(EVENT, { detail: { target, prompt } }));
}

export function onAskQuantinum(handler: (d: AskOpenDetail) => void): () => void {
  const fn = (e: Event) => {
    const d = (e as CustomEvent<AskOpenDetail>).detail;
    if (d?.target) handler(d);
  };
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

export interface AskStatus { enabled: boolean; mode?: string; quota?: number; used?: number; remaining?: number; disclaimer?: string }

export const ASK_STATUS_KEY = ['/api/quantinum/ai/status'] as const;

export function useAskQuantinumStatus() {
  const { user } = useAuth();
  return useQuery<AskStatus>({
    queryKey: ASK_STATUS_KEY,
    enabled: !!user,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const r = await fetch('/api/quantinum/ai/status', { credentials: 'include' });
      if (!r.ok) return { enabled: false };
      return r.json();
    },
  });
}

/** Suggested opening question per object kind (editable in the sheet). */
export function defaultPrompt(t: AskTarget): string {
  const s = t.symbol ?? 'this';
  switch (t.kind) {
    case 'setup': return `Walk me through this ${s} setup: what supports it, the main risk, and what would invalidate it.`;
    case 'ticker': return `What does our data say about ${s} right now — levels, dealer walls, flow, and the risk?`;
    case 'flow': return `What does this ${s} flow print tell us in context of our levels and walls? What would invalidate the read?`;
    case 'gex': return `How does this ${s} GEX level matter with price where it is? What happens on a break?`;
    case 'zerodte': return `Break down this ${s} 0DTE row: the setup, the risk, and the invalidation.`;
    case 'journal': return `Review this ${s} trade against the setup data: what went right or wrong, and the risk that played out.`;
    default: return '';
  }
}

/** The double-submit CSRF header every non-GET needs (server/csrf.ts; same read as lib/queryClient). */
export function csrfHeader(): Record<string, string> {
  try {
    const m = document.cookie.match(/csrf_token=([^;]+)/);
    return m ? { 'x-csrf-token': m[1] } : {};
  } catch { return {}; }
}

export interface StreamHandlers {
  onMeta?: (m: { fields: { key: string; label: string; source: string; asOf: string | null }[]; missing: string[] }) => void;
  onDelta: (text: string) => void;
  onReset?: () => void;
  onLookup?: (l: { tool: string; symbol: string }) => void;
  onDone: (d: { citations: { key: string; label: string; source: string; asOf: string | null }[]; provider: string | null; model: string | null; remaining: number; quota: number; disclaimer: string }) => void;
  onError: (e: { code: string; error: string }) => void;
}

/** POST the question and read the SSE stream (fetch, so the session cookie rides along). */
export async function streamAsk(body: { question: string; target: AskTarget; mode: 'quick' | 'deep'; history: { role: 'user' | 'assistant'; content: string }[] }, h: StreamHandlers, signal: AbortSignal) {
  let r: Response;
  try {
    r = await fetch('/api/quantinum/ai/ask', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', ...csrfHeader() }, body: JSON.stringify(body), signal });
  } catch (e: any) {
    if (e?.name !== 'AbortError') h.onError({ code: 'network', error: 'Could not reach Quantinum. Check your connection.' });
    return;
  }
  if (!r.ok || !r.body || !r.headers.get('content-type')?.includes('event-stream')) {
    const j = await r.json().catch(() => ({}));
    h.onError({ code: j.code ?? `http_${r.status}`, error: j.error ?? 'Quantinum could not answer that.' });
    return;
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = /^event: (.*)$/m.exec(block)?.[1];
        const raw = /^data: (.*)$/m.exec(block)?.[1];
        if (!ev || raw == null) continue;
        let data: any; try { data = JSON.parse(raw); } catch { continue; }
        if (ev === 'meta') h.onMeta?.(data);
        else if (ev === 'delta') h.onDelta(String(data.text ?? ''));
        else if (ev === 'reset') h.onReset?.();
        else if (ev === 'lookup') h.onLookup?.(data);
        else if (ev === 'done') h.onDone(data);
        else if (ev === 'error') h.onError(data);
      }
    }
  } catch (e: any) {
    if (e?.name !== 'AbortError') h.onError({ code: 'stream', error: 'The answer stream was interrupted.' });
  }
}
