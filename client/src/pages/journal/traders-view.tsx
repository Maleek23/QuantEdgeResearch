/**
 * Journal · Trader ranking — the traders whose Discord journals were imported,
 * analysed and ranked (GET /api/traders/leaderboard, /api/traders/:slug/analysis).
 *
 * Two kinds of evidence, labelled everywhere:
 *   STATED    their own P&L, only where a post stated both entry and exit
 *   MEASURED  calls with no stated exit, scored on the UNDERLYING's daily bars
 *             after the post ("measured on underlying" — not their P&L)
 * Every row carries its dates; samples under 20 are flagged. These are
 * external traders' histories, shown with their dates; the platform's own
 * pre-2026-08-26 outcome invalidation does not apply to them.
 * Traders above the threshold feed NEXUS's "Trader calls" as evidence only.
 */
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { QEEmpty, QEError, QELoading } from '@/components/ui/qe-states';
import { useJournal } from '@/components/journal/journal-context';
import { Card, Kpi, N } from '@/components/journal/parts';
import type { JournalKey } from '@shared/journal-sources';

interface GroupStat { key: string; n: number; winRate: number; avgPct: number }
interface Measured { closePct: number; mfePct: number; maePct: number; bars: number; complete: boolean; hit: 'target' | 'stop' | null; correct: boolean; refPrice: number }
interface Stats {
  stated: { n: number; wins: number; losses: number; winRate: number | null; avgPct: number | null; avgR: number | null; rN: number; profitFactor: number | null; avgHoldMinutes: number | null; smallSample: boolean };
  measured: { n: number; correct: number; hitRate: number | null; avgClosePct: number | null; pending: number; smallSample: boolean };
  open: number; bestSetups: GroupStat[]; bestTickers: GroupStat[]; firstAt: string | null; lastAt: string | null; score: number | null; sample: number;
}
interface Board { asOf: string; config: { minScore: number; minSample: number; maxAgeTradingDays: number; minConfidence: number }; rows: { slug: string; name: string; stats: Stats; passes: boolean; rank: number | null }[] }
interface Call {
  id: string; symbol: string; assetType: string; direction: string; optionType: string | null; strike: number | null; expiry: string | null;
  status: string; entryPrice: number; exitPrice: number | null; stop: number | null; target: number | null; entryTime: string; exitTime: string | null;
  statedPnlPct: number | null; confidence: number | null; link: string | null; measured: Measured | null; source: string;
  evidence?: 'text' | 'vision' | 'text+vision' | null;
}
interface Analysis { trader: { slug: string; name: string }; asOf: string; stats: Stats; calls: Call[]; notes: string[]; rank: number | null; passes: boolean; rankedOf: number; config: Board['config'] }

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`${url} failed (${r.status})`);
  return r.json();
}

const pct = (v: number | null | undefined, sign = true) => (v == null ? '—' : `${sign && v > 0 ? '+' : ''}${v.toFixed(1)}%`);
const tone = (v: number | null | undefined) => (v == null ? undefined : v > 0 ? 'jr-gain' : v < 0 ? 'jr-loss' : undefined);
const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const hold = (m: number | null) => (m == null ? '—' : m < 60 ? `${m}m` : m < 1440 ? `${(m / 60).toFixed(1)}h` : `${(m / 1440).toFixed(1)}d`);

export default function TradersView() {
  const { data, setJournal, bookLabel } = useJournal();
  const slug = data.key.startsWith('trader:') ? data.key.slice(7) : null;
  const boardQ = useQuery<Board>({ queryKey: ['/api/traders/leaderboard'], queryFn: () => getJson('/api/traders/leaderboard'), staleTime: 5 * 60_000 });
  const aQ = useQuery<Analysis>({ queryKey: ['/api/traders', slug, 'analysis'], queryFn: () => getJson(`/api/traders/${encodeURIComponent(slug!)}/analysis`), enabled: !!slug, staleTime: 5 * 60_000 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {slug && (
        aQ.isLoading ? <QELoading rows={4} label={`analysing ${bookLabel}'s calls (reading bars for open calls)…`} />
          : aQ.isError ? <QEError title={`${bookLabel}'s analysis didn't load`} onRetry={() => aQ.refetch()} retrying={aQ.isFetching} />
            : aQ.data && <TraderAnalysisCard a={aQ.data} />
      )}

      <Card num={slug ? '04' : '01'} title="Leaderboard · imported trader journals" meta={boardQ.data ? <span className="jr-n">as of {new Date(boardQ.data.asOf).toLocaleString()}</span> : null}>
        {boardQ.isLoading ? <QELoading rows={3} label="ranking traders…" />
          : boardQ.isError ? <QEError title="Leaderboard didn't load" onRetry={() => boardQ.refetch()} retrying={boardQ.isFetching} />
            : !boardQ.data?.rows.length ? <QEEmpty message="No trader has scored calls yet. Import their Discord journals in Import › Discord forum." />
              : (
                <div className="jr-table-wrap">
                  <table className="jr-table">
                    <thead><tr>
                      <th scope="col">#</th><th scope="col">Trader</th><th scope="col" className="num">Score</th>
                      <th scope="col" className="num" title="Trades with both entry and exit posted">Stated n</th><th scope="col" className="num">Win %</th><th scope="col" className="num">Avg %</th><th scope="col" className="num">PF</th>
                      <th scope="col" className="num" title="Calls with no stated exit, scored on the underlying's bars">Measured n</th><th scope="col" className="num">Right %</th>
                      <th scope="col">Dates</th><th scope="col">NEXUS</th>
                    </tr></thead>
                    <tbody>
                      {boardQ.data.rows.map((r) => (
                        <tr key={r.slug} aria-selected={r.slug === slug} onClick={() => setJournal(`trader:${r.slug}` as JournalKey)} style={{ cursor: 'pointer', background: r.slug === slug ? 'var(--jr-row-hi, rgba(255,255,255,.04))' : undefined }}>
                          <td className="jr-n">{r.rank ?? '—'}</td>
                          <td><b>{r.name}</b></td>
                          <td className="num"><b>{r.stats.score ?? '—'}</b></td>
                          <td className="num">{r.stats.stated.n}{r.stats.stated.smallSample && r.stats.stated.n > 0 && <span className="jr-lowsample" title="Under 20 — treat as anecdote"> LOW N</span>}</td>
                          <td className="num">{pct(r.stats.stated.winRate, false)}</td>
                          <td className={`num ${tone(r.stats.stated.avgPct) ?? ''}`}>{pct(r.stats.stated.avgPct)}</td>
                          <td className="num">{r.stats.stated.profitFactor ?? '—'}</td>
                          <td className="num">{r.stats.measured.n}{r.stats.measured.smallSample && r.stats.measured.n > 0 && <span className="jr-lowsample"> LOW N</span>}</td>
                          <td className="num">{pct(r.stats.measured.hitRate, false)}</td>
                          <td className="jr-n">{d(r.stats.firstAt)} → {d(r.stats.lastAt)}</td>
                          <td>{r.passes ? <span className="jr-chip win">FEEDS</span> : <span className="jr-n" title={`Needs score ≥ ${boardQ.data!.config.minScore} on ≥ ${boardQ.data!.config.minSample} scored calls`}>below</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
        <p className="jr-note">
          Score = mean of the stated win rate and the measured-on-underlying hit rate, each shrunk toward 50% by 5 phantom trades (3/3 scores 69, not 100).
          {boardQ.data && <> Traders at ≥ {boardQ.data.config.minScore} with ≥ {boardQ.data.config.minSample} scored calls feed NEXUS's <b>Trader calls</b> (open calls ≤ {boardQ.data.config.maxAgeTradingDays} trading days old) — as evidence, never as a bot signal.</>}
          {' '}These are external traders' own histories, shown with their dates.
        </p>
      </Card>
    </div>
  );
}

function TraderAnalysisCard({ a }: { a: Analysis }) {
  const s = a.stats;
  const recent = a.calls.slice(0, 60);
  return (
    <>
      <Card num="01" title={`${a.trader.name} · analysis`} meta={<span className="jr-n">{a.rank ? `rank ${a.rank} of ${a.rankedOf}` : 'unranked'} · {a.passes ? 'feeds NEXUS' : 'below the NEXUS threshold'}</span>}>
        <div className="jr-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          <Kpi label="Score" value={s.score ?? '—'} sub={`n=${s.sample} scored`} hint="Ranking score 0–100 (shrunk win rates)" />
          <Kpi label="Stated win rate" value={pct(s.stated.winRate, false)} sub={<>{s.stated.wins}W / {s.stated.losses}L · <N n={s.stated.n} />{s.stated.smallSample && s.stated.n > 0 ? ' · LOW N' : ''}</>} hint="Only trades whose posts state both entry and exit" />
          <Kpi label="Avg return / trade" value={pct(s.stated.avgPct)} tone={s.stated.avgPct == null ? null : s.stated.avgPct >= 0 ? 'gain' : 'loss'} sub="on the stated entry, equal-weighted" />
          <Kpi label="Profit factor" value={s.stated.profitFactor ?? '—'} sub="Σ win % ÷ |Σ loss %|" />
          <Kpi label="Avg R" value={s.stated.avgR ?? '—'} sub={s.stated.rN ? `n=${s.stated.rN} with a stated stop` : 'no stops stated'} />
          <Kpi label="Avg hold" value={hold(s.stated.avgHoldMinutes)} sub="entry post → exit post" />
          <Kpi label="Measured on underlying" value={pct(s.measured.hitRate, false)} sub={<>right {s.measured.correct}/{s.measured.n} · avg {pct(s.measured.avgClosePct)}{s.measured.pending ? ` · ${s.measured.pending} pending` : ''}</>} hint="Calls with no stated exit: underlying move over 5 trading bars after the post, signed for the call's side. Not the trader's P&L." />
          <Kpi label="Open calls" value={s.open} sub={`${d(s.firstAt)} → ${d(s.lastAt)}`} />
        </div>
        {a.notes.map((n) => <p key={n} className="jr-note" style={{ margin: '6px 0 0' }}>{n}</p>)}
      </Card>

      <div className="jr-grid">
        <Card num="02" title="Best setups & tickers" className="jr-span-5">
          {!s.bestSetups.length && !s.bestTickers.length ? <QEEmpty message="Needs at least 2 closed, stated trades per setup or ticker." /> : (
            <table className="jr-table">
              <thead><tr><th scope="col">Group</th><th scope="col" className="num">n</th><th scope="col" className="num">Win %</th><th scope="col" className="num">Avg %</th></tr></thead>
              <tbody>
                {s.bestSetups.map((g) => <tr key={`s:${g.key}`} style={{ cursor: 'default' }}><td>setup · {g.key}</td><td className="num">{g.n}</td><td className="num">{g.winRate}%</td><td className={`num ${tone(g.avgPct) ?? ''}`}>{pct(g.avgPct)}</td></tr>)}
                {s.bestTickers.map((g) => <tr key={`t:${g.key}`} style={{ cursor: 'default' }}><td><span className="jr-sym">{g.key}</span></td><td className="num">{g.n}</td><td className="num">{g.winRate}%</td><td className={`num ${tone(g.avgPct) ?? ''}`}>{pct(g.avgPct)}</td></tr>)}
              </tbody>
            </table>
          )}
          <p className="jr-note">Stated trades only; groups with n &lt; 2 hidden. Small groups are anecdotes.</p>
        </Card>

        <Card num="03" title="Calls, newest first" className="jr-span-7" meta={<N n={a.calls.length} unit="calls" />}>
          {!recent.length ? <QEEmpty message={`${a.trader.name} has no parsed calls yet.`} /> : (
            <div className="jr-table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}>
              <table className="jr-table">
                <thead><tr><th scope="col">Posted</th><th scope="col">Call</th><th scope="col" className="num">Entry → exit</th><th scope="col" className="num">Result</th><th scope="col" className="num">Parse</th><th scope="col" aria-label="Link" /></tr></thead>
                <tbody>
                  {recent.map((c) => (
                    <tr key={c.id} style={{ cursor: 'default' }}>
                      <td className="jr-n">{d(c.entryTime)}</td>
                      <td><span className="jr-sym">{c.symbol}</span> {c.assetType === 'option' ? `${c.strike ?? '?'}${c.optionType === 'put' ? 'P' : 'C'} ${c.expiry?.slice(5) ?? ''}` : c.direction}</td>
                      <td className="num">{c.entryPrice} → {c.exitPrice ?? 'open'}</td>
                      <td className="num">
                        {c.statedPnlPct != null ? <span className={tone(c.statedPnlPct)} title="Stated: both entry and exit were posted">{pct(c.statedPnlPct)} stated</span>
                          : c.measured ? <span className={tone(c.measured.closePct)} title={`Measured on underlying from ${c.measured.refPrice} over ${c.measured.bars} bars · MFE ${pct(c.measured.mfePct)} · MAE ${pct(c.measured.maePct)} — not the trader's P&L`}>
                            {pct(c.measured.closePct)} underlying{c.measured.hit ? ` · ${c.measured.hit} first` : ''}{c.measured.complete ? '' : ' · pending'}</span>
                            : <span className="jr-n">not measured</span>}
                      </td>
                      <td className="num jr-n" title={c.evidence === 'vision' ? 'Read from a screenshot' : c.evidence === 'text+vision' ? 'Post text + screenshot' : 'Post text'}>
                        {c.confidence != null ? `${Math.round(c.confidence * 100)}%` : '—'}{c.evidence && c.evidence !== 'text' ? ' · img' : ''}
                      </td>
                      <td>{c.link && <a href={c.link} target="_blank" rel="noreferrer noopener" aria-label="Open the post in Discord"><ExternalLink className="h-3.5 w-3.5" /></a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="jr-note">"stated" = the trader's own entry and exit. "underlying" = measured on the underlying's daily bars after the post (open of the first bar after it, 5 bars or to expiry) — not the trader's P&L.</p>
        </Card>
      </div>
    </>
  );
}
