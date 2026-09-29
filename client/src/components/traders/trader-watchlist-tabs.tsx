/**
 * Watchlist tabs — "Mine" plus one tab per trader (Femi, Malik, Uzo, Bean…),
 * rendered where the watchlist lives (Chart Lab's right rail). A trader's tab
 * shows their list, links to their journal, and lets an admin (or the trader,
 * when linked to a platform user) add and remove names. Trader lists live in
 * their own table so they never fire the operator's watchlist alerts.
 */
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Loader2, X } from 'lucide-react';
import { QETabs, type QETabItem } from '@/components/ui/qe-tabs';
import { apiRequest } from '@/lib/queryClient';
import { readApiError } from '@/lib/journal/use-journal';

interface TraderLite { id: string; slug: string; name: string; handle: string | null; watchlistCount: number; canWrite: boolean }
interface TraderWatchlist { canWrite: boolean; items: { id: string; symbol: string; note: string | null; addedAt: string }[] }

const mono = "'JetBrains Mono',monospace";

export function TraderWatchlistTabs({ mine, mineCount, renderSymbol }: {
  /** The existing "Mine" list, rendered as-is. */
  mine: ReactNode;
  mineCount: number;
  /** One row per symbol, in the host's own row style. */
  renderSymbol: (symbol: string, note?: string | null) => ReactNode;
}) {
  const [tab, setTab] = useState<string>('mine');
  const tradersQ = useQuery<{ traders: TraderLite[] }>({
    queryKey: ['/api/traders'],
    queryFn: async () => {
      const r = await fetch('/api/traders', { credentials: 'include' });
      if (!r.ok) throw new Error(`Traders request failed (${r.status})`);
      return r.json();
    },
    staleTime: 60_000,
    retry: 1,
  });
  const traders = tradersQ.data?.traders ?? [];
  const items: QETabItem<string>[] = [
    { id: 'mine', label: 'Mine', count: mineCount },
    ...traders.map((t) => ({ id: t.slug, label: t.name, count: t.watchlistCount, group: 'Traders', hint: `${t.name}'s watchlist` })),
  ];
  // Group "Mine" separately so the strip reads  Mine | TRADERS Femi Malik Uzo Bean.
  items[0].group = ' ';
  const active = items.some((i) => i.id === tab) ? tab : 'mine';
  const prefix = 'watch-people';

  return (
    <div>
      <QETabs items={items} active={active} onChange={setTab} size="sm" variant="subtle" ariaLabel="Whose watchlist" panelIdPrefix={prefix} className="mb-2" />
      {tradersQ.isError && active === 'mine' && (
        <div style={{ fontSize: 10, color: 'var(--amber, #facc15)', fontFamily: mono, marginBottom: 4 }}>traders list didn't load — Mine is unaffected</div>
      )}
      <div role="tabpanel" id={`${prefix}-panel-${active}`} aria-labelledby={`${prefix}-tab-${active}`} tabIndex={-1}>
        {active === 'mine' ? mine : <TraderPanel trader={traders.find((t) => t.slug === active)!} renderSymbol={renderSymbol} />}
      </div>
    </div>
  );
}

function TraderPanel({ trader, renderSymbol }: { trader: TraderLite; renderSymbol: (s: string, note?: string | null) => ReactNode }) {
  const qc = useQueryClient();
  const key = ['/api/traders', trader.slug, 'watchlist'];
  const q = useQuery<TraderWatchlist>({
    queryKey: key,
    queryFn: async () => {
      const r = await fetch(`/api/traders/${encodeURIComponent(trader.slug)}/watchlist`, { credentials: 'include' });
      if (!r.ok) throw new Error(`Watchlist request failed (${r.status})`);
      return r.json();
    },
    staleTime: 30_000,
  });
  const [sym, setSym] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['/api/traders'] }); };
  const add = async () => {
    const s = sym.trim().toUpperCase().replace(/^\$/, '');
    if (!s) return;
    setBusy(true); setErr('');
    try { await apiRequest('POST', `/api/traders/${encodeURIComponent(trader.slug)}/watchlist`, { symbol: s }); setSym(''); refresh(); }
    catch (e) { setErr(await readApiError(e)); }
    finally { setBusy(false); }
  };
  const remove = async (id: string, symbol: string) => {
    setErr('');
    try { await apiRequest('DELETE', `/api/traders/${encodeURIComponent(trader.slug)}/watchlist/${encodeURIComponent(id)}`); refresh(); }
    catch (e) { setErr(`${symbol}: ${await readApiError(e)}`); }
  };

  const journalHref = `/t?tab=journal&journal=${encodeURIComponent(`trader:${trader.slug}`)}`;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontFamily: mono, fontSize: 10, color: 'var(--text-mute)' }}>
        <span>{trader.handle ?? trader.name}</span>
        <a href={journalHref} style={{ marginLeft: 'auto', color: 'var(--cyan-bright)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
          <BookOpen className="h-3 w-3" aria-hidden /> {trader.name}'s journal →
        </a>
      </div>
      {q.isError ? (
        <div role="alert" style={{ fontSize: 11, color: 'var(--amber, #facc15)', padding: '4px 0', fontFamily: mono }}>
          {trader.name}'s watchlist didn't load. <button type="button" onClick={() => q.refetch()} style={{ color: 'var(--cyan-bright)', background: 'none', border: 0, cursor: 'pointer', padding: 0, font: 'inherit', textDecoration: 'underline' }}>Retry</button>
        </div>
      ) : q.isLoading ? (
        <div role="status" style={{ fontSize: 11, color: 'var(--text-mute)', padding: '4px 0' }}><Loader2 className="inline h-3 w-3 animate-spin" /> loading…</div>
      ) : (
        <>
          {(q.data?.items ?? []).map((it) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ flex: 1, minWidth: 0 }}>{renderSymbol(it.symbol, it.note)}</div>
              {q.data?.canWrite && (
                <button type="button" aria-label={`Remove ${it.symbol} from ${trader.name}'s watchlist`} onClick={() => remove(it.id, it.symbol)}
                  style={{ width: 22, height: 22, display: 'grid', placeItems: 'center', background: 'transparent', border: '1px solid var(--nx-border)', borderRadius: 3, color: 'var(--text-mute)', cursor: 'pointer' }}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {!q.data?.items.length && (
            <div style={{ fontSize: 11, color: 'var(--text-mute)', padding: '4px 0' }}>
              No names on {trader.name}'s watchlist yet.{q.data?.canWrite ? '' : ' An admin can add them.'}
            </div>
          )}
          {q.data?.canWrite && (
            <form onSubmit={(e) => { e.preventDefault(); add(); }} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <label htmlFor={`watch-add-${trader.slug}`} className="sr-only">Add a ticker to {trader.name}'s watchlist</label>
              <input id={`watch-add-${trader.slug}`} value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} placeholder="Add ticker"
                style={{ flex: 1, minWidth: 0, minHeight: 28, background: 'var(--panel-2)', border: '1px solid var(--nx-border-hi)', borderRadius: 3, color: 'var(--text)', fontFamily: mono, fontSize: 11, padding: '2px 8px' }} />
              <button type="submit" disabled={busy || !sym.trim()}
                style={{ minHeight: 28, padding: '0 10px', borderRadius: 3, background: 'rgba(59,140,255,0.08)', border: '1px solid var(--nx-border-hi)', color: 'var(--cyan-bright)', cursor: 'pointer', fontFamily: mono, fontSize: 10, fontWeight: 700 }}>
                {busy ? '…' : 'ADD'}
              </button>
            </form>
          )}
          {err && <div role="alert" style={{ fontSize: 10.5, color: 'var(--red, #ff6b3d)', marginTop: 4, fontFamily: mono }}>{err}</div>}
        </>
      )}
    </div>
  );
}
