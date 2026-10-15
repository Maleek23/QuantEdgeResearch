/**
 * QUANTINUM SIDE PANEL — page context + push-back (flag QUANTINUM_PANEL).
 * Pure: the ⌘\ host (client/src/components/quantinum/ask-quantinum-host.tsx)
 * builds its target from the URL with pageAskTarget, and the panel's
 * "Push back" button sends pushBackPrompt(...) as a new turn, which makes the
 * server rebuild its context pack from fresh data and cite each figure.
 */
import type { AskTarget } from './quantinum-ai';

const SYM = /^[A-Z][A-Z0-9.^-]{0,9}$/;
const TAB = /^[a-z0-9_-]{1,32}$/i;
const TAB_NAME: Record<string, string> = {
  gex: 'GEX', flow: 'Flow', chart: 'Chart', journal: 'Journal', leaps: 'LEAPS & Swings', bot: 'Bot', nexus: 'NEXUS',
};

/** Ask target for any app page: /r/:sym, ?sym=, ?tab=. Null on /ask or with nothing to say. Pure. */
export function pageAskTarget(route: string, search: string): AskTarget | null {
  const path = route.split('?')[0] || '/';
  if (path === '/ask') return null;
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const r = /^\/r\/([A-Za-z0-9.^-]{1,10})/.exec(path);
  const symRaw = (r ? decodeURIComponent(r[1]) : q.get('sym') || q.get('symbol') || '').toUpperCase();
  const symbol = SYM.test(symRaw) ? symRaw : null;
  const tabRaw = (q.get('tab') || '').toLowerCase();
  const tab = TAB.test(tabRaw) ? tabRaw : null;
  const page = `${path}${tab ? `?tab=${tab}` : ''}${symbol && !r ? `${tab ? '&' : '?'}sym=${symbol}` : ''}`.slice(0, 120);
  const where = tab ? TAB_NAME[tab] ?? `${tab} tab` : r ? 'ticker page' : path === '/' ? 'home' : path.replace(/^\//, '');
  return { kind: r ? 'ticker' : 'page', symbol, page, label: [symbol, where].filter(Boolean).join(' · ').slice(0, 60) };
}

export const PUSHBACK_PREFIX = 'Push back on your last answer';
/** The push-back turn. Pure. */
export function pushBackPrompt(lastQuestion: string | null): string {
  const about = lastQuestion ? ` to "${lastQuestion.slice(0, 160)}"` : '';
  return `${PUSHBACK_PREFIX}${about}: re-fetch the data now, cite the source and age of every figure you use, `
    + 'say plainly which claims the data does not support or has changed, and correct them.';
}
