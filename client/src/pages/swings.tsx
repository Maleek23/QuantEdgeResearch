/**
 * MONTHLY SWINGS & LEAPS (/swings) — research screen for beaten-down quality
 * names. RESEARCH SCREEN — NOT FINANCIAL ADVICE.
 *
 * Reads GET /api/swings (the worker's nightly cache, server/swings-screener.ts)
 * and GET /api/swings/:symbol. Ranked table on desktop, stacked cards on phones;
 * filters (drawdown band, sector, min score, earnings within N days); a row
 * opens the detail drawer: per-factor breakdown (n/a factors shown, not 0),
 * the shared price chart, the monthly-swing and LEAPS contract cards (whole
 * contracts sized to $500 / $1,000), and "why it fell" headlines. Every block
 * carries its data age. Admins get a "Refresh now" button.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTier } from '@/hooks/useTier';
import { FreshStamp, usePhone } from '@/components/ui/qe-phone';
import { nexusGradeColor } from '@/components/canon/nexus-grade';
import { NexusPriceChart } from '@/components/charting/nexus-price-chart';
import {
  DRAWDOWN_MAX, DRAWDOWN_MIN, SWINGS_CAVEAT, SWINGS_DISCLAIMER,
  type ContractSlot, type Factor, type ScreenRow,
} from '@shared/swings-screener';
import '@/styles/nexus.css';
import '@/styles/swings.css';

interface ListPayload {
  asOf: string | null; ageSec: number | null; stale: boolean; running: boolean;
  rows: ScreenRow[]; total?: number; sectors: string[];
  universe: { total: number; equities: number; pass1: number; screened: number; sources: string[] } | null;
  notes: string[]; caveat?: string;
}

const money = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? '—' : `$${x.toFixed(d)}`);
const signed = (x: number, d = 0) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}`;

function Grade({ row, size = 13 }: { row: Pick<ScreenRow, 'letter' | 'score' | 'coverage' | 'thinData'>; size?: number }) {
  return (
    <span className="sw-grade" style={{ color: nexusGradeColor(row.letter), fontSize: size }}
      title={`Research score ${row.letter} ${row.score}/100 — ${SWINGS_CAVEAT}. Data coverage ${Math.round(row.coverage * 100)}% of factor points.`}>
      {row.letter} {row.score}{row.thinData && <span className="sw-warn" style={{ fontSize: 10, marginLeft: 4 }}>thin</span>}
    </span>
  );
}

function slotShort(s: ContractSlot | null | undefined): string {
  if (!s) return '—';
  if (s.pick) return `${s.pick.label.replace(/^[A-Z.]+ /, '')} ${money(s.pick.debitOne, 0)}${s.status === 'fit_fallback' ? '*' : ''}`;
  return s.status === 'over_budget' ? 'over budget' : s.status === 'no_liquid' ? 'no liquid' : 'no chain';
}

export default function SwingsPage() {
  const phone = usePhone();
  const { isAdmin } = useTier() as any;
  const [ddMin, setDdMin] = useState(DRAWDOWN_MIN);
  const [ddMax, setDdMax] = useState(DRAWDOWN_MAX);
  const [sector, setSector] = useState('');
  const [minScore, setMinScore] = useState(0);
  const [earnWithin, setEarnWithin] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  const qs = new URLSearchParams({ ddMin: String(ddMin), ddMax: String(ddMax), minScore: String(minScore) });
  if (sector) qs.set('sector', sector);
  if (earnWithin) qs.set('earningsWithin', earnWithin);
  const list = useQuery<ListPayload>({
    queryKey: [`/api/swings?${qs}`],
    queryFn: async () => (await apiRequest('GET', `/api/swings?${qs}`)).json(),
    staleTime: 60_000,
    refetchInterval: (q) => ((q.state.data as ListPayload | undefined)?.running ? 20_000 : 5 * 60_000),
  });
  const data = list.data;
  const rows = data?.rows ?? [];

  const refresh = async () => {
    setRefreshNote('starting…');
    try {
      const r = await apiRequest('POST', '/api/admin/swings/refresh');
      const j = await r.json();
      setRefreshNote(j.note ?? 'started');
      setTimeout(() => list.refetch(), 3000);
    } catch (e: any) { setRefreshNote(`refresh failed: ${e?.message ?? e}`); }
  };

  return (
    <div className="sw-page landing">
      <section aria-labelledby="sw-title">
        <div className="container">
          <div className="sw-disclaimer" role="note">{SWINGS_DISCLAIMER}</div>
          <h1 id="sw-title" className="sw-title"><span className="grad">Monthly Swings &amp; LEAPS</span></h1>
          <p className="sw-purpose">
            Quality names {DRAWDOWN_MIN}–{DRAWDOWN_MAX}% below their all-time high, scored on fundamentals, structure, catalyst window and flow/GEX.
            Each name carries two worked contract examples — a 30–60 DTE monthly and a 270–760 DTE LEAPS — sized as whole contracts to a $500–1,000 budget.
            The score is an unvalidated composite: a factor with no data is shown as n/a and left out, never scored 0.
          </p>
          <div className="sw-meta">
            <span>screen <FreshStamp asOf={data?.asOf ?? null} warn={data?.stale} /></span>
            {data?.universe && <span>universe {data.universe.total} → {data.universe.equities} equities → {data.universe.pass1} in band (monthly) → {data.universe.screened} screened</span>}
            {data?.running && <span className="sw-warn">refresh running…</span>}
            <span>nightly 18:40 ET</span>
            {isAdmin && <button type="button" className="sw-btn" onClick={refresh} disabled={data?.running}>Refresh now (admin)</button>}
            {refreshNote && <span>{refreshNote}</span>}
          </div>
        </div>
      </section>

      <section aria-label="Filters" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="sw-filters">
            <label>Drawdown min %<input type="number" min={0} max={100} value={ddMin} onChange={(e) => setDdMin(Number(e.target.value) || 0)} /></label>
            <label>Drawdown max %<input type="number" min={0} max={100} value={ddMax} onChange={(e) => setDdMax(Number(e.target.value) || 100)} /></label>
            <label>Sector<select value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">All</option>
              {(data?.sectors ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select></label>
            <label>Min score<input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value) || 0)} /></label>
            <label>Earnings within (days)<input type="number" min={0} max={365} placeholder="any" value={earnWithin} onChange={(e) => setEarnWithin(e.target.value)} /></label>
            <span className="sw-mute" style={{ font: "500 11px 'JetBrains Mono',monospace" }}>{rows.length}{data?.total != null ? ` of ${data.total}` : ''} names</span>
          </div>
        </div>
      </section>

      <section aria-label="Ranked names" style={{ paddingTop: 0 }}>
        <div className="container">
          {list.isError ? <div className="sw-empty">The screen didn&rsquo;t load. <button type="button" className="sw-btn" onClick={() => list.refetch()}>Retry</button></div>
            : list.isLoading ? <div className="sw-empty" role="status">Reading the screen…</div>
              : !rows.length ? <div className="sw-empty">{data?.notes?.[0] ?? 'No names match these filters.'}</div>
                : (
                  <>
                    <div className="sw-table-wrap" style={{ overflowX: 'auto' }}>
                      <table className="sw-table">
                        <thead><tr>
                          <th>#</th><th>Symbol</th><th>Score</th><th className="sw-num">Price</th><th className="sw-num">Off ATH</th>
                          <th>Fund · Struct · Cat · Flow</th><th>Earnings</th><th>Monthly</th><th>LEAPS</th><th>Sector</th>
                        </tr></thead>
                        <tbody>
                          {rows.map((r, i) => (
                            <tr key={r.symbol} tabIndex={0} onClick={() => setOpen(r.symbol)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(r.symbol); }}>
                              <td className="sw-mute">{i + 1}</td>
                              <td><span className="sw-sym">{r.symbol}</span><span className="sw-name">{r.name ?? ''}</span></td>
                              <td><Grade row={r} /></td>
                              <td className="sw-num">{money(r.price)}</td>
                              <td className="sw-num sw-dn">−{r.drawdownPct.toFixed(0)}%</td>
                              <td>{r.groups.map((g) => (
                                <span key={g.group} title={`${g.label}: ${g.points}/${g.available} available of ${g.max}`} style={{ marginRight: 6 }}>
                                  {g.available ? `${Math.round((g.points / g.available) * 100)}` : <span className="sw-na">n/a</span>}
                                </span>
                              ))}</td>
                              <td>{r.daysToEarnings != null && r.daysToEarnings >= 0 ? `${r.daysToEarnings}d` : <span className="sw-na">n/a</span>}</td>
                              <td>{slotShort(r.swing)}</td>
                              <td>{slotShort(r.leaps)}</td>
                              <td className="sw-mute">{r.sector ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="sw-cards">
                      {rows.map((r, i) => (
                        <button type="button" key={r.symbol} className="sw-card" onClick={() => setOpen(r.symbol)}>
                          <div className="sw-card-top">
                            <span><span className="sw-mute">{i + 1}. </span><span className="sw-sym">{r.symbol}</span></span>
                            <Grade row={r} />
                          </div>
                          <div className="sw-card-row">
                            <span>{money(r.price)}</span><span className="sw-dn">−{r.drawdownPct.toFixed(0)}% off ATH</span>
                            <span>earn {r.daysToEarnings != null && r.daysToEarnings >= 0 ? `${r.daysToEarnings}d` : 'n/a'}</span>
                          </div>
                          <div className="sw-card-row"><span>M: {slotShort(r.swing)}</span><span>L: {slotShort(r.leaps)}</span></div>
                        </button>
                      ))}
                    </div>
                    <p className="sw-mute" style={{ fontSize: 11, marginTop: 8 }}>* LEAPS marked * is the cheapest-fit fallback — the Δ0.60–0.80 stock-replacement contract is over $1,000. Group columns: % of available points.</p>
                  </>
                )}
        </div>
      </section>

      {open && <Drawer symbol={open} cached={rows.find((r) => r.symbol === open) ?? null} onClose={() => setOpen(null)} phone={phone} />}
    </div>
  );
}

function FactorTable({ row }: { row: ScreenRow }) {
  const groups = row.groups;
  return (
    <table className="sw-factors">
      <tbody>
        {groups.map((g) => (
          <FactorGroupRows key={g.group} label={g.label} points={g.points} available={g.available} max={g.max} factors={row.factors.filter((f) => f.group === g.group)} />
        ))}
      </tbody>
    </table>
  );
}
function FactorGroupRows({ label, points, available, max, factors }: { label: string; points: number; available: number; max: number; factors: Factor[] }) {
  return (
    <>
      <tr className="sw-group"><td colSpan={3}>{label} · {points}/{available}{available < max ? ` (of ${max}; ${max - available} n/a)` : ''}</td></tr>
      {factors.map((f) => (
        <tr key={f.key}>
          <td style={{ width: '32%' }}>{f.label}</td>
          <td style={{ width: 70 }} className="sw-num">{f.points == null ? <span className="sw-na">n/a</span> : `${f.points}/${f.max}`}</td>
          <td><div>{f.value}</div><div className="sw-mute" style={{ fontSize: 11 }}>{f.note}{f.asOf ? ` · as of ${String(f.asOf).slice(0, 10)}` : ''}</div></td>
        </tr>
      ))}
    </>
  );
}

function ContractCard({ title, slot }: { title: string; slot: ContractSlot | null }) {
  if (!slot) return <div className="sw-contract"><h4>{title}</h4><span className="sw-na">not computed</span></div>;
  const p = slot.pick;
  return (
    <div className="sw-contract">
      <h4>{title}</h4>
      {slot.overBudget && <div className="sw-warn" style={{ marginBottom: 6 }}>{slot.overBudget.label} (Δ{slot.overBudget.delta.toFixed(2)}) = {money(slot.overBudget.debitOne, 0)} for 1 contract — over the $1,000 budget.</div>}
      {!p ? <div className="sw-warn">{slot.status === 'over_budget' ? 'Over budget' : slot.status === 'no_liquid' ? 'No liquid contract' : 'No chain'} — {slot.reason}</div> : (
        <>
          <div className="sw-lbl">{p.label}</div>
          <div className="sw-mute">{p.note}</div>
          <dl>
            <dt>DTE · Δ</dt><dd>{p.dte} · {p.delta.toFixed(2)}</dd>
            <dt>Bid / ask / mid</dt><dd>{money(p.bid)} / {money(p.ask)} / {money(p.mid)}</dd>
            <dt>Debit, 1 contract</dt><dd>{money(p.debitOne, 0)}</dd>
            <dt>Whole contracts</dt><dd>{Object.entries(p.qtyAt).map(([b, q]) => `$${b}: ${q}`).join(' · ')}</dd>
            <dt>Breakeven at expiry</dt><dd>{money(p.breakeven)}</dd>
            <dt>Premium stop (−50%)</dt><dd>{money(p.premiumStop)}</dd>
            {p.scenario && <><dt>{p.scenario.label}</dt><dd>~{money(p.scenario.premium)} ({signed(p.scenario.pnlOne)} / contract)</dd></>}
            {p.expiryPnlOne != null && <><dt>Same level at expiry</dt><dd>{signed(p.expiryPnlOne)} / contract</dd></>}
            <dt>Liquidity</dt><dd>OI {p.liquidity.oi ?? '—'} · vol {p.liquidity.vol ?? '—'} · spread {p.liquidity.spreadPct != null ? `${(p.liquidity.spreadPct * 100).toFixed(1)}%` : '—'}</dd>
          </dl>
          {p.scenario && <div className="sw-mute" style={{ fontSize: 10.5, marginTop: 6 }}>{p.scenario.method}; a projection, not a forecast.</div>}
        </>
      )}
      <div className="sw-mute" style={{ fontSize: 10.5, marginTop: 6 }}>chain {slot.chainSource ?? '—'} <FreshStamp asOf={slot.chainAsOf} /></div>
    </div>
  );
}

function Drawer({ symbol, cached, onClose, phone }: { symbol: string; cached: ScreenRow | null; onClose: () => void; phone: boolean }) {
  const q = useQuery<{ row: ScreenRow; asOf: string; ageSec: number; cached: boolean }>({
    queryKey: [`/api/swings/${symbol}`],
    queryFn: async () => (await apiRequest('GET', `/api/swings/${encodeURIComponent(symbol)}`)).json(),
    enabled: !cached,
  });
  const row = cached ?? q.data?.row ?? null;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const levels = useMemo(() => {
    if (!row) return [];
    const L: Array<{ price: number; color: string; label: string }> = [{ price: row.ath, color: 'dim', label: `${row.athBasis} ${row.ath}` }];
    if (row.low52) L.push({ price: row.low52, color: 'loss', label: `52w low ${row.low52}` });
    if (row.swing?.pick) L.push({ price: row.swing.pick.breakeven, color: 'accent', label: `monthly B/E ${row.swing.pick.breakeven}` });
    if (row.leaps?.pick) L.push({ price: row.leaps.pick.breakeven, color: 'info', label: `LEAPS B/E ${row.leaps.pick.breakeven}` });
    return L.filter((l) => l.price > 0 && l.price < row.price * 4);
  }, [row]);
  return (
    <>
      <div className="sw-drawer-back" onClick={onClose} aria-hidden />
      <aside className="sw-drawer" role="dialog" aria-modal="true" aria-label={`${symbol} research detail`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <h2>{symbol} {row && <Grade row={row} size={20} />}</h2>
          <button type="button" className="sw-btn" onClick={onClose}>Close</button>
        </div>
        <div className="sw-disclaimer" style={{ marginTop: 8 }}>{SWINGS_DISCLAIMER}</div>
        {!row ? <div className="sw-empty">{q.isLoading ? 'Loading…' : 'Not in the cached screen.'}</div> : (
          <>
            <div className="sw-meta" style={{ marginTop: 4 }}>
              <span>{row.name ?? ''}</span><span>{row.sector ?? ''}</span>
              <span>{money(row.price)} close <FreshStamp asOf={row.priceAsOf} /></span>
              <span className="sw-dn">−{row.drawdownPct}% from {row.athBasis} {money(row.ath)}</span>
              <span>coverage {Math.round(row.coverage * 100)}%</span>
              <span>computed <FreshStamp asOf={row.computedAt} /></span>
            </div>
            <div className="sw-h3">Chart (weekly)</div>
            <NexusPriceChart symbol={symbol} initialTf="1W" height={phone ? 240 : 300} levels={levels} expandable={!phone} />
            <div className="sw-h3">Score breakdown — {SWINGS_CAVEAT}</div>
            <FactorTable row={row} />
            <div className="sw-h3">Contract research (whole contracts, $500–1,000 budget — not orders)</div>
            <div className="sw-contracts">
              <ContractCard title="Monthly swing · 30–60 DTE · Δ0.30–0.55" slot={row.swing} />
              <ContractCard title="LEAPS · 270–760 DTE · Δ0.60–0.80" slot={row.leaps} />
            </div>
            <div className="sw-h3">Why it fell — recent headlines <FreshStamp asOf={row.newsAsOf} /></div>
            {row.news.length ? (
              <ul className="sw-news">
                {row.news.map((n, i) => (
                  <li key={i}>
                    {n.link ? <a href={n.link} target="_blank" rel="noopener noreferrer">{n.title}</a> : n.title}
                    <div className="sw-mute" style={{ fontSize: 11 }}>{n.publisher ?? ''}{n.at ? ` · ${n.at.slice(0, 10)}` : ''}</div>
                  </li>
                ))}
              </ul>
            ) : <div className="sw-na">No recent headlines from the news source.</div>}
            <div className="sw-h3">Sources</div>
            <div className="sw-mute" style={{ font: "500 11px 'JetBrains Mono',monospace" }}>
              {Object.entries(row.sources).map(([k, v]) => `${k}: ${v ?? 'n/a'}`).join(' · ')}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
