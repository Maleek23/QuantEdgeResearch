/**
 * CRYPTO IDEAS · 24/7 — the native crypto engine's compact list
 * (server/crypto-ideas-engine.ts via GET /api/crypto/ideas), 0DTE-desk style:
 * open ideas first (side, setup, entry zone, stop, T1/T2, clocks, why,
 * evidence), then the engine's record since first publish with n and LOW N,
 * then what the last scan read per coin (source + age).
 *
 * Grades shown here are the CRYPTO STRUCTURE grade (CS-A/B/C, 0–10) — its own
 * scale. The NEXUS board shows the same idea with its conviction band.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { History, Radar } from 'lucide-react';
import { nexusIdeaHref } from '@/lib/nexus-link';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import './crypto-ideas.css';

interface CryptoIdea {
  id: string; symbol: string; direction: string; timestamp: string;
  setup: string | null; horizon: string | null; grade: string | null; points: number | null;
  entry: number; entryZone: [number, number] | null; stop: number; t1: number; t2: number | null; rr: number;
  timeStopAt: string | null; exitBy: string | null; why: string; evidence: string[]; proxies: string[];
  outcomeStatus: string; exitPrice: number | null; percentGain: number | null; resolutionReason: string | null;
}
interface CoinRead {
  symbol: string; price: number | null; daily: string; h4: string; fundingAprPct: number | null; oiChangePct: number | null;
  plans: Array<{ direction: string; setup: string; grade: string }>; notes: string[];
  sources: { spot: string; spotAsOf: string | null; perp: string | null; perpAsOf: string | null }; error?: string;
}
export interface CryptoIdeasPayload {
  asOf: string; universe: string[]; schedule: string; maxPerDay: number; maxPerRun?: number;
  lastScan: { at: string; coins: CoinRead[]; published: string[]; skipped: string[] } | null;
  ideas: CryptoIdea[];
  record: { n: number; total: number; open: number; unresolvedClosed: number; wins: number; losses: number; winRate: number | null; avgR: number | null; rCount: number; firstAt: string | null; lastAt: string | null; lowN: boolean };
  gradeScale: string; provenance: string;
}

export function useCryptoIdeas() {
  return useQuery<CryptoIdeasPayload>({
    queryKey: ['/api/crypto/ideas'],
    queryFn: async () => {
      const r = await fetch('/api/crypto/ideas', { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

const px = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v); const d = a >= 1000 ? 0 : a >= 10 ? 2 : a >= 1 ? 3 : 5;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
const ago = (iso: string | null | undefined) => {
  if (!iso) return 'age —';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  return s < 90 ? `${Math.max(0, s)}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : s < 172_800 ? `${(s / 3600).toFixed(1)}h ago` : `${Math.round(s / 86_400)}d ago`;
};
const until = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const m = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  return m <= 0 ? 'passed' : m < 90 ? `in ${m}m` : `in ${(m / 60).toFixed(1)}h`;
};
const side = (d: string) => (d === 'short' ? 'cx-dn' : 'cx-up');
const STATUS: Record<string, string> = { open: 'OPEN', hit_target: 'TARGET', hit_stop: 'STOP', expired: 'CLOSED' };

function IdeaRow({ i }: { i: CryptoIdea }) {
  const open = i.outcomeStatus === 'open';
  return (
    <li className={`cxi-row ${open ? 'is-open' : 'is-done'}`}>
      <Link href={nexusIdeaHref({ ideaId: i.id, symbol: i.symbol })} className="cxi-main" title="Open this idea on NEXUS">
        <b className="cxi-sym">{i.symbol}</b>
        <span className={`cxi-side ${side(i.direction)}`}>{i.direction.toUpperCase()}</span>
        <span className="cxi-setup">{(i.setup ?? '').replace(/_/g, ' ')}{i.horizon ? ` · ${i.horizon === 'intraday' ? '12h' : '1–3d'}` : ''}</span>
        {i.grade && <span className="cxi-grade" title="Crypto structure grade (0–10) — not the conviction band">{i.grade}{i.points != null ? ` ${i.points}/10` : ''}</span>}
        <span className={`cxi-status s-${i.outcomeStatus}`}>{STATUS[i.outcomeStatus] ?? i.outcomeStatus}{!open && i.percentGain != null ? ` ${i.percentGain >= 0 ? '+' : ''}${i.percentGain.toFixed(2)}%` : ''}</span>
      </Link>
      <div className="cxi-levels">
        <span>entry {px(i.entry)}{i.entryZone ? <small> zone {px(i.entryZone[0])}–{px(i.entryZone[1])}</small> : null}</span>
        <span>stop {px(i.stop)}</span>
        <span>T1 {px(i.t1)}</span>
        {i.t2 != null && <span>T2 {px(i.t2)}</span>}
        <span>R:R {Number.isFinite(i.rr) ? i.rr.toFixed(2) : '—'}</span>
        {open
          ? <span>time stop {until(i.timeStopAt)} · out {until(i.exitBy)}</span>
          : <span>{(i.resolutionReason ?? '').replace(/^auto_/, '').replace(/_/g, ' ')}</span>}
        <span className="cxi-age">{ago(i.timestamp)}</span>
      </div>
      <p className="cxi-why">{i.why}</p>
      {open && i.evidence.length > 0 && (
        <details className="cxi-ev"><summary>Evidence ({i.evidence.length})</summary><ul>{i.evidence.map((e, k) => <li key={k}>{e}</li>)}</ul></details>
      )}
    </li>
  );
}

export function CryptoIdeasList({ dense = false }: { dense?: boolean }) {
  const q = useCryptoIdeas();
  if (q.isLoading) return <QELoading rows={4} className="fd-pad" label="reading the crypto engine…" />;
  if (q.isError && !q.data) return <QEError className="fd-m" title="Crypto ideas didn't load" message="The crypto engine did not answer — no idea is implied." onRetry={() => q.refetch()} retrying={q.isFetching} />;
  const d = q.data!;
  const open = d.ideas.filter((i) => i.outcomeStatus === 'open');
  const done = d.ideas.filter((i) => i.outcomeStatus !== 'open').slice(0, dense ? 5 : 12);
  const rec = d.record;
  return (
    <div className={`cxi ${dense ? 'cxi-dense' : ''}`}>
      <header className="cxi-head">
        <strong><Radar size={13} aria-hidden /> Crypto ideas · 24/7</strong>
        <span className="cxi-mono">{d.universe.join(' · ')}</span>
        <span className="cxi-mono cxi-mute">last scan {ago(d.lastScan?.at)} · {d.schedule}</span>
      </header>

      {open.length === 0
        ? <QEEmpty className="fd-m" message={`No open crypto idea. The engine scans every 30 minutes and publishes only CS-A/CS-B plans inside their entry zone (≤ ${d.maxPerDay}/day${d.maxPerRun ? `, ≤ ${d.maxPerRun}/scan` : ''}).`} />
        : <ul className="cxi-list">{open.map((i) => <IdeaRow key={i.id} i={i} />)}</ul>}

      <section className="cxi-rec" aria-label="Crypto engine record">
        <h4><History size={12} aria-hidden /> Record — since first publish {rec.firstAt ? rec.firstAt.slice(0, 10) : '(none yet)'} {rec.lowN && <span className="cxi-lown" title="fewer than 20 decided outcomes: no rate here is evidence of an edge">LOW N</span>}</h4>
        <div className="cxi-kv">
          <span>Decided (n) <b>{rec.n}</b></span>
          <span>W – L <b>{rec.wins} – {rec.losses}</b></span>
          <span>Win rate <b>{rec.winRate != null ? `${Math.round(rec.winRate * 100)}%` : '—'}</b></span>
          <span>Avg R <b>{rec.avgR != null ? `${rec.avgR >= 0 ? '+' : ''}${rec.avgR.toFixed(2)}R · n ${rec.rCount}` : '—'}</b></span>
          <span>Open <b>{rec.open}</b></span>
          <span>Time-stopped / expired <b>{rec.unresolvedClosed}</b></span>
        </div>
      </section>

      {done.length > 0 && (
        <details className="cxi-done"><summary>Recent closed ({done.length})</summary><ul className="cxi-list">{done.map((i) => <IdeaRow key={i.id} i={i} />)}</ul></details>
      )}

      {d.lastScan && (
        <details className="cxi-scan" open={!dense && open.length === 0}>
          <summary>Last scan — what each coin shows ({ago(d.lastScan.at)})</summary>
          <table className="cxi-table">
            <thead><tr><th>Coin</th><th>Spot</th><th>1d / 4h</th><th>Funding APR</th><th>OI Δ</th><th>Read</th><th>Sources</th></tr></thead>
            <tbody>
              {d.lastScan.coins.map((c) => (
                <tr key={c.symbol}>
                  <td><b>{c.symbol}</b></td>
                  <td>{px(c.price)}</td>
                  <td>{c.daily} / {c.h4}</td>
                  <td>{c.fundingAprPct != null ? `${c.fundingAprPct.toFixed(1)}%` : '—'}</td>
                  <td>{c.oiChangePct != null ? `${c.oiChangePct >= 0 ? '+' : ''}${(c.oiChangePct * 100).toFixed(1)}%` : 'not measured'}</td>
                  <td className="cxi-why">{c.plans.length ? c.plans.map((p) => `${p.direction} ${p.setup.replace(/_/g, ' ')} ${p.grade}`).join(' · ') : (c.notes[0] ?? '—')}</td>
                  <td className="cxi-mute">Coinbase {ago(c.sources.spotAsOf)}{c.sources.perp ? ` · Hyperliquid ${ago(c.sources.perpAsOf)}` : ' · no perp'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <p className="cxi-note">{d.gradeScale} {d.provenance}</p>
    </div>
  );
}
