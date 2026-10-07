/**
 * "Tracking · until Fri" — the operator's time-boxed NEXUS tracked symbols
 * (server/nexus-tracked.ts, GET/POST/DELETE /api/nexus/tracked) at the top of
 * the board. Per name: live quote + change with its age, nearest structural
 * support / resistance (/api/levels, measuring), today's options net premium
 * (Bullflow, 3-min cached), open ideas on the board (click filters the board),
 * and the expiry. Admin gets add / remove. Phone: one line, tap to expand.
 */
import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useQuotes } from '@/components/ticker/ticker-data';
import { usePhone } from '@/components/ui/qe-phone';
import { useTier } from '@/hooks/useTier';
import { apiRequest } from '@/lib/queryClient';
import { isLiveBookPick, type ConvictionPick } from '@/lib/convictions';
import { untilLabel, type TrackedSymbol } from '@shared/nexus-tracked';
import { ageLabel } from '../flow/tape';
import { get } from './nexus-parts';

const TRACKED_KEY = ['/api/nexus/tracked'] as const;
interface LevelsWire { last: number | null; clusters: Array<{ price: number }> }

const pct = (v: number | null | undefined) => v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const px = (v: number | null | undefined) => v == null || !Number.isFinite(v) ? '—' : v >= 100 ? v.toFixed(1) : v.toFixed(2);
const usd = (v: number) => { const a = Math.abs(v); const s = a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${Math.round(a / 1e3)}K` : `${Math.round(a)}`; return `${v < 0 ? '−' : '+'}$${s}`; };

function nearest(m: LevelsWire | undefined, last: number | null | undefined) {
  const ref = last ?? m?.last ?? null;
  if (!m || ref == null) return { s: null, r: null };
  let s: number | null = null; let r: number | null = null;
  for (const c of m.clusters) {
    if (c.price < ref && (s == null || c.price > s)) s = c.price;
    if (c.price > ref && (r == null || c.price < r)) r = c.price;
  }
  return { s, r };
}

export function TrackedRow({ picks, onFilter }: { picks: ConvictionPick[]; onFilter: (symbol: string) => void }) {
  const qc = useQueryClient();
  const phone = usePhone();
  const { isAdmin } = useTier();
  const [open, setOpen] = useState(false);
  const [sym, setSym] = useState('');
  const [days, setDays] = useState(2);
  const q = useQuery<{ tracked: TrackedSymbol[] }>({ queryKey: [...TRACKED_KEY], queryFn: () => get('/api/nexus/tracked'), staleTime: 30_000, refetchInterval: 60_000, retry: false });
  const tracked = q.data?.tracked ?? [];
  const syms = tracked.map((t) => t.symbol);
  const quotes = useQuotes(syms);
  const levels = useQueries({
    queries: syms.map((s) => ({ queryKey: ['/api/levels', s], queryFn: () => get<LevelsWire>(`/api/levels/${encodeURIComponent(s)}`), staleTime: 55_000, refetchInterval: 60_000, retry: false })),
  });
  const flow = useQuery<{ enabled: boolean; reads: Record<string, { lean: string; net: number }> }>({
    queryKey: ['/api/bullflow/net-premium-batch', syms.join(',')],
    queryFn: () => get(`/api/bullflow/net-premium-batch?symbols=${syms.join(',')}`),
    enabled: syms.length > 0, staleTime: 120_000, refetchInterval: 180_000, retry: false,
  });
  const mut = useMutation({
    mutationFn: async (a: { op: 'add'; symbol: string; days: number } | { op: 'del'; symbol: string }) => {
      const r = a.op === 'add'
        ? await apiRequest('POST', '/api/nexus/tracked', { symbol: a.symbol, days: a.days })
        : await apiRequest('DELETE', `/api/nexus/tracked/${encodeURIComponent(a.symbol)}`);
      return r.json();
    },
    onSuccess: (d) => { qc.setQueryData([...TRACKED_KEY], d); setSym(''); },
  });

  if (q.isError || (!tracked.length && !isAdmin)) return null;
  const now = Date.now();
  const labels = Array.from(new Set(tracked.map((t) => untilLabel(t.until, now))));
  const head = labels.length === 1 ? `until ${labels[0]}` : '';
  const openIdeas = (s: string) => picks.filter((p) => p.symbol === s && isLiveBookPick(p)).length;
  const collapsed = phone && !open;

  return (
    <div className={`nxd-track${collapsed ? ' is-collapsed' : ''}`} aria-label="Tracked symbols">
      <button type="button" className="nxd-track-head" onClick={() => phone && setOpen(!open)} aria-expanded={phone ? open : undefined}>
        <b>Tracking</b>{head && <span> · {head}</span>}
        {collapsed && <span className="nxd-track-syms">{tracked.map((t) => {
          const c = quotes.data?.[t.symbol]?.changePercent;
          return <span key={t.symbol}>{t.symbol} <em className={c == null ? '' : c >= 0 ? 'up' : 'dn'}>{pct(c)}</em></span>;
        })}</span>}
      </button>
      {!collapsed && <div className="nxd-track-list">
        {tracked.map((t, i) => {
          const qt = quotes.data?.[t.symbol];
          const lv = nearest(levels[i]?.data, qt?.price);
          const fl = flow.data?.enabled ? flow.data.reads?.[t.symbol] : undefined;
          const n = openIdeas(t.symbol);
          return (
            <div key={t.symbol} className="nxd-track-item">
              <button type="button" className="nxd-track-sym" onClick={() => onFilter(t.symbol)} title={`Filter the board to ${t.symbol}`}>{t.symbol}</button>
              <span className="nxd-track-px" title={qt ? `${qt.source ?? 'quote'}${qt.delayed ? ' · delayed' : ''}` : undefined}>
                {px(qt?.price)} <em className={qt?.changePercent == null ? '' : qt.changePercent >= 0 ? 'up' : 'dn'}>{pct(qt?.changePercent)}</em>
                <small>{qt ? ageLabel(qt.asOf, now) : quotes.isLoading ? '…' : 'no quote'}</small>
              </span>
              <span className="nxd-track-lv" title="Nearest structural support / resistance (level map — measuring)">S {px(lv.s)} · R {px(lv.r)}</span>
              {fl && <span className="nxd-track-fl" title="Today's options net premium (calls − puts, Bullflow)"><em className={fl.net >= 0 ? 'up' : 'dn'}>{usd(fl.net)}</em> flow</span>}
              <button type="button" className="nxd-track-n" onClick={() => onFilter(t.symbol)} disabled={!n}>{n} open</button>
              <span className="nxd-track-until" title={t.until}>{labels.length > 1 ? `until ${untilLabel(t.until, now)}` : ''}</span>
              {isAdmin && <button type="button" className="nxd-track-x" aria-label={`Stop tracking ${t.symbol}`} disabled={mut.isPending} onClick={() => mut.mutate({ op: 'del', symbol: t.symbol })}><X size={11} /></button>}
            </div>
          );
        })}
        {isAdmin && <form className="nxd-track-add" onSubmit={(e) => { e.preventDefault(); if (sym.trim()) mut.mutate({ op: 'add', symbol: sym.trim().toUpperCase(), days }); }}>
          <input value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} placeholder="SYM" maxLength={6} aria-label="Symbol to track" />
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Trading days to track">
            {[1, 2, 3, 5, 10].map((d) => <option key={d} value={d}>{d}d</option>)}
          </select>
          <button type="submit" disabled={mut.isPending || !sym.trim()}>Track</button>
          {mut.isError && <small className="dn">{(mut.error as Error)?.message ?? 'failed'}</small>}
        </form>}
      </div>}
    </div>
  );
}
