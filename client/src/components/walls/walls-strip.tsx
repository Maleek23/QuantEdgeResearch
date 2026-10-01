/**
 * "Walls" strip on the 0DTE desk — GET /api/wall-touch (server/wall-touch.ts).
 * Every tracked name's next-7-day put/call wall with where price is, touches so
 * far, the last event (exact ET), the contract read at a confirmed rejection /
 * break, today's alerts, and the forward-log tally (GET /api/wall-touch/report).
 * Watch + alerts + log only — nothing here is a published idea. Measuring.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { BrickWall } from 'lucide-react';
import { tickerHref } from '@/lib/workup-bus';
import { wallLine, type WallRowWire } from './wall-touch-badge';
import './walls.css';

interface WallStateWire {
  enabled: boolean;
  lastCycle: { at: string; skipped: string | null; symbols: number; newEvents: number; chains: { used: number; cap: number }; cycleMs: number; memory: { rssBeforeMb: number; rssAfterMb: number }; feed: string | null; errors: string[] } | null;
  rows: WallRowWire[];
  alerts: Array<{ key: string; atEt: string; symbol: string; kind: string; text: string }>;
  map: { dateKey: string; passes: Array<{ phase: string; finishedAt: string; computed: number; failed: number; deferred: string[]; peakRssMb: number; maxDeltaMb: number }>; entries: Array<{ symbol: string; ok: boolean }> } | null;
  honesty: string;
}
interface ReportCell { n: number; rejectionRate: number | null; avgMfePct: number | null; avgOptMaxMult: number | null; options: number }
interface ReportWire { sessions: number; all: ReportCell; awaitingOutcome: number; byWall: Record<string, ReportCell> }

const etHm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }) : '—');
const num = (x: number | null | undefined, d = 2, suf = '') => (x == null || !Number.isFinite(x) ? '—' : `${x.toFixed(d)}${suf}`);
const STATE: Record<string, number> = { touched: 0, approaching: 1, rejected: 2, broken: 3, stalled: 4, beyond: 5, away: 6 };
const KIND: Record<string, string> = { approach: 'approached', touch: 'touched', rejection: 'rejection', break: 'break', stall: 'stall' };

export function WallsStrip() {
  const q = useQuery<WallStateWire>({
    queryKey: ['/api/wall-touch'],
    queryFn: async () => {
      const r = await fetch('/api/wall-touch', { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const rep = useQuery<ReportWire>({
    queryKey: ['/api/wall-touch/report'],
    queryFn: async () => {
      const r = await fetch('/api/wall-touch/report', { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 5 * 60_000,
  });
  const s = q.data; const c = s?.lastCycle ?? null;
  const rows = [...(s?.rows ?? [])].filter((r) => !r.superseded || r.touches > 0)
    .sort((a, b) => (STATE[a.state] ?? 9) - (STATE[b.state] ?? 9) || Math.abs(a.distPct ?? 1) - Math.abs(b.distPct ?? 1));
  // Near or active walls first; the rest are counted, not listed.
  const shown = rows.filter((r) => r.state !== 'away' || (r.distPct != null && Math.abs(r.distPct) <= 0.01)).slice(0, 24);
  const lastPass = s?.map?.passes.slice(-1)[0] ?? null;
  const r = rep.data;
  return (
    <section className="zd-section" aria-label="GEX walls — approach, touch, rejection">
      <h4><BrickWall size={13} aria-hidden /> Walls — put / call wall touches <span className="zd-lown" title="Live detection + forward log; historical GEX walls cannot be replayed">MEASURING</span></h4>
      <p className="zd-note">
        Next-7-day GEX put and call walls for the indexes, the top board names and the 0DTE watch list (computed once ~09:00 and ~12:30 ET). Every minute on 1-minute bars: approaching (within max(0.15%, ½ ATR5)), touched, rejection (a close ≥ ¼ ATR5 back off within 1–5 bars) or break (a close through). A contract is read only on a confirmed rejection / break. Watch and alerts only — no ideas are published.
        {s && !s.enabled && ' Engine is OFF (WALL_TOUCH not set) — rows appear only when it runs.'}
      </p>
      {q.isError && !s && <p className="zd-err">Wall state unavailable.</p>}
      {c && (
        <p className="zd-note zd-mono">
          Last cycle {etHm(c.at)} ET{c.skipped ? ` · skipped: ${c.skipped}` : ` · ${c.symbols} names · ${c.newEvents} new events · chains ${c.chains.used}/${c.chains.cap} · ${c.cycleMs} ms · RSS ${c.memory.rssBeforeMb}→${c.memory.rssAfterMb} MB${c.feed ? ` · ${c.feed} bars` : ''}`}
          {lastPass && ` · walls ${lastPass.phase} ${etHm(lastPass.finishedAt)} ET: ${lastPass.computed} ok, ${lastPass.failed} failed${lastPass.deferred.length ? `, ${lastPass.deferred.length} deferred` : ''}, peak RSS ${lastPass.peakRssMb} MB`}
        </p>
      )}
      {shown.length === 0
        ? <p className="zd-note">{s ? (rows.length ? `No name within 1% of a wall (${rows.length} walls tracked).` : 'No wall rows yet today.') : 'Loading walls…'}</p>
        : (
          <div className="wt-strip-list">
            {shown.map((w) => (
              <div key={`${w.symbol}|${w.wall}|${w.wallPrice}`} className={`wt-chip wt-${w.state}`}>
                <span><Link href={tickerHref(w.symbol)} className="zd-sym-link"><b>{w.symbol}</b></Link> {wallLine(w)}</span>
                <small>
                  {w.wallBasis}
                  {w.lastEvent && ` · ${KIND[w.lastEvent.kind] ?? w.lastEvent.kind} ${w.lastEvent.atEt} ET @ ${w.lastEvent.price.toFixed(2)}`}
                </small>
                {w.contract && <small className="zd-mono">{w.contract.label} {w.contract.strike}{w.contract.type === 'call' ? 'C' : 'P'} @ {num(w.contract.ask)}{w.contract.vehicle !== w.symbol ? ` (${w.contract.vehicle})` : ''}</small>}
                {w.live && (w.live.h15 || w.live.h30) && <small>since confirm: +15m {num(w.live.h15?.tradePct, 2, '%')} · +30m {num(w.live.h30?.tradePct, 2, '%')} · MFE {num(w.live.mfePct, 2, '%')}</small>}
              </div>
            ))}
          </div>
        )}
      {rows.length > shown.length && <p className="zd-note">{rows.length - shown.length} more walls more than 1% away — not listed.</p>}
      {(s?.alerts.length ?? 0) > 0 && (
        <ul className="wt-alerts" aria-label="Wall alerts today">
          {[...s!.alerts].reverse().slice(0, 8).map((a) => <li key={a.key}><span className="wt-t">{a.atEt}</span>{a.text}</li>)}
        </ul>
      )}
      <p className="zd-note">
        Forward log: {r ? (r.all.n ? `${r.all.n} touches over ${r.sessions} sessions · rejection rate ${num(r.all.rejectionRate != null ? r.all.rejectionRate * 100 : null, 0, '%')} · avg MFE ${num(r.all.avgMfePct, 2, '%')} · option max ${num(r.all.avgOptMaxMult, 2, '×')} (n ${r.all.options})${r.awaitingOutcome ? ` · ${r.awaitingOutcome} awaiting outcome` : ''}` : `no outcomes yet${r.awaitingOutcome ? ` (${r.awaitingOutcome} touches awaiting the after-close pass)` : ''}`) : '—'}. {s?.honesty}
      </p>
    </section>
  );
}
