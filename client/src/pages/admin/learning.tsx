/**
 * Admin hub › Learning loop (server/learning-loop-job.ts, shared/learning-loop.ts).
 *
 *   GET  /api/admin/learning           nightly scorecard, drift flags, weekly re-fit,
 *                                      challenger + shadow, promotion gate, calibration versions
 *   POST /api/admin/learning/approve   only when the gate is eligible (refit both halves + shadow n ≥ 50)
 *   POST /api/admin/learning/reject
 *   POST /api/admin/learning/rollback  previous calibration version (history kept)
 *
 * Never auto-promotes. The approved config only changes publishing when the
 * server runs with LEARNING_LOOP_APPLY=on (shown as a flag below).
 */
import { useState } from 'react';
import { AdminLayout } from '@/components/admin/admin-layout';
import { LuxButton, LuxKpi, LuxKpiGrid, LuxPanel, LuxTag } from '@/components/lux';
import { QEError } from '@/components/ui/qe-states';
import { adminWrite, fmtAgo, useAdminJson } from '@/components/admin/hub-data';
import type { Scorecard, SliceStats, RefitReport, ShadowReport, ChallengerState, CalibrationFile, CalibrationVersion, LearningConfig, ScoreDim, CandidateResult } from '@shared/learning-loop';
import { ADVISORY_FAMILIES, DIM_LABEL, SCORE_DIMS, type CandidateFamily } from '@shared/learning-loop';

interface LearningPayload {
  scorecard: Scorecard | null; scorecardAsOf: string | null;
  refit: RefitReport | null; refitAsOf: string | null;
  state: { challenger: ChallengerState | null; shadow: ShadowReport | null; rollback: { due: boolean; n: number; meanR: number | null; floor: number | null; reason: string } | null; history: Array<{ at: string; event: string; detail: string }> };
  gate: { eligible: boolean; reasons: string[] };
  calibration: CalibrationFile | null; active: CalibrationVersion | null; incumbent: LearningConfig;
  flags: { apply: boolean; scorecard: boolean; shadow: boolean; loop: boolean };
}

const pct = (x: number | null | undefined) => (x == null ? '—' : `${(x * 100).toFixed(0)}%`);
const rr = (x: number | null | undefined) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}R`);
const usd = (x: number | null | undefined) => (x == null ? '—' : `${x < 0 ? '−' : ''}$${Math.abs(Math.round(x)).toLocaleString()}`);
const ci = (s: SliceStats) => (s.ci ? `${(s.ci.lo * 100).toFixed(0)}–${(s.ci.hi * 100).toFixed(0)}%` : '—');

function describe(c: LearningConfig): string[] {
  const out: string[] = [];
  const w = Object.entries(c.gradeWeights).filter(([, v]) => v !== 1).map(([k, v]) => `${k}×${v}`);
  if (c.gradeFloor != null) out.push(`grade floor ${c.gradeFloor}${w.length ? ` (weights ${w.join(', ')})` : ''}`);
  if (c.stopAtr != null) out.push(`stop ${c.stopAtr}×ATR`);
  if (c.t1Atr != null) out.push(`T1 ${c.t1Atr}×ATR`);
  if (c.deltaBand) out.push(`|Δ| ${c.deltaBand[0]}–${c.deltaBand[1]}`);
  if (c.dteBand) out.push(`DTE ${c.dteBand[0]}–${c.dteBand[1]}`);
  if (c.exitPolicy !== 'plan') out.push(`exits: ${c.exitPolicy}`);
  if (c.muteEngines.length) out.push(`mute engines: ${c.muteEngines.join(', ')}`);
  if (c.muteTod.length) out.push(`mute times: ${c.muteTod.join(', ')}`);
  return out.length ? out : ['no change from the incumbent'];
}
/** Fields an approved config can carry that no module applies yet (honest label). */
const notApplied = (c: LearningConfig) => [
  c.gradeFloor != null && 'grade floor', c.stopAtr != null && 'stop ATR', c.t1Atr != null && 'T1 ATR', c.exitPolicy !== 'plan' && 'exit policy',
].filter(Boolean) as string[];

function SliceTable({ rows }: { rows: Array<{ value: string } & SliceStats> }) {
  return (
    <div className="ah-scroll">
      <table className="ah-table ah-rows">
        <thead><tr><th>Slice</th><th>n</th><th>Win</th><th>95% CI</th><th>Avg R</th><th>Expectancy</th><th>P&amp;L $500</th><th>P&amp;L $1k</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.value} style={s.reportable ? undefined : { opacity: 0.6 }}>
              <td data-label="Slice">{s.value}{!s.reportable && <span className="ah-sub2">n &lt; 30 — not reportable</span>}</td>
              <td data-label="n">{s.n}</td>
              <td data-label="Win">{pct(s.winRate)}</td>
              <td data-label="95% CI">{ci(s)}</td>
              <td data-label="Avg R">{rr(s.avgR)}</td>
              <td data-label="Expectancy">{rr(s.expectancyR)}</td>
              <td data-label="P&L $500">{usd(s.pnl500)}<span className="ah-sub2">{s.sized500} sized</span></td>
              <td data-label="P&L $1k">{usd(s.pnl1000)}<span className="ah-sub2">{s.sized1000} sized</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FamilyRow({ fam, f }: { fam: string; f: RefitReport['byFamily'][keyof RefitReport['byFamily']] }) {
  const b: CandidateResult | null = f.best;
  return (
    <tr>
      <td data-label="Family">{fam}<span className="ah-sub2">{f.tested} tested · universe {f.universe}</span></td>
      <td data-label="Best">{b?.label ?? '—'}</td>
      <td data-label="Half A">{b ? `${rr(b.candidate.A.expR)} vs ${rr(b.incumbent.A.expR)}` : '—'}<span className="ah-sub2">{b ? `n ${b.candidate.A.n}/${b.incumbent.A.n}` : ''}</span></td>
      <td data-label="Half B">{b ? `${rr(b.candidate.B.expR)} vs ${rr(b.incumbent.B.expR)}` : '—'}<span className="ah-sub2">{b ? `n ${b.candidate.B.n}/${b.incumbent.B.n}` : ''}</span></td>
      <td data-label="Folds">{b ? `${b.folds.beat}/${b.folds.evaluable}` : '—'}</td>
      <td data-label="Verdict">{ADVISORY_FAMILIES.has(fam as CandidateFamily) ? <LuxTag tone="caution">advisory — never promoted</LuxTag> : f.accepted ? <LuxTag tone="gain">accepted</LuxTag> : <LuxTag tone="mute">rejected</LuxTag>}<span className="ah-sub2">{b?.why ?? ''}</span></td>
    </tr>
  );
}

export default function AdminLearning() {
  const q = useAdminJson<LearningPayload>('/api/admin/learning', 120_000);
  const [dim, setDim] = useState<ScoreDim>('engine');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const d = q.data;
  const sc = d?.scorecard;
  const act = async (path: 'approve' | 'reject' | 'rollback', confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    setBusy(path); setMsg(null);
    try { await adminWrite('POST', `/api/admin/learning/${path}`); setMsg(`${path} done`); await q.refetch(); }
    catch (e) { setMsg((e as Error).message); }
    finally { setBusy(null); }
  };
  const ch = d?.state.challenger ?? null;
  const sh = d?.state.shadow ?? null;

  return (
    <AdminLayout>
      <div className="ah-stack">
        {q.isError && <QEError title="The learning loop didn't load" message={(q.error as Error)?.message ?? ''} onRetry={() => void q.refetch()} />}
        {q.isLoading && <p className="ah-note">Loading…</p>}
        {d && (
          <LuxPanel title="Self-calibration loop" meta={<>
            <LuxTag tone={d.flags.apply ? 'caution' : 'mute'}>LEARNING_LOOP_APPLY {d.flags.apply ? 'on' : 'off'}</LuxTag>{' '}
            <LuxTag tone={d.flags.shadow ? 'accent' : 'mute'}>shadow {d.flags.shadow ? 'on' : 'off'}</LuxTag>
          </>}
            sub="Nightly scorecard (19:00 ET), weekly walk-forward re-fit (Sat), 10-trading-day shadow, admin-only promotion. Nothing here changes publishing unless LEARNING_LOOP_APPLY is on and a version is approved.">
            <LuxKpiGrid>
              <LuxKpi label="Decided ideas" value={sc?.population.decided ?? '—'} sub={sc ? `of ${sc.population.eligible} eligible · since ${sc.since}` : 'no scorecard yet'} />
              <LuxKpi label="Win rate" value={sc ? pct(sc.overall.winRate) : '—'} sub={sc ? `95% CI ${ci(sc.overall)}` : ''} />
              <LuxKpi label="Expectancy" value={sc ? rr(sc.overall.expectancyR) : '—'} sub={sc?.overall.rCi ? `${rr(sc.overall.rCi.lo)} … ${rr(sc.overall.rCi.hi)}` : ''} />
              <LuxKpi label="P&L @ $1k" value={sc ? usd(sc.overall.pnl1000) : '—'} sub={sc ? `$500: ${usd(sc.overall.pnl500)}` : ''} />
              <LuxKpi label="Drift flags" value={sc?.drift.length ?? '—'} sub="last 20 vs slice baseline" />
              <LuxKpi label="Calibration" value={d.active ? `v${d.active.version}` : 'incumbent'} sub={d.active ? `${d.active.action} ${fmtAgo(d.active.at)}` : 'nothing approved'} />
            </LuxKpiGrid>
            {msg && <p className="ah-note">{msg}</p>}
          </LuxPanel>
        )}

        {d && (
          <LuxPanel title="Challenger" meta={ch ? <LuxTag tone={ch.status === 'shadow' ? 'accent' : ch.status === 'approved' ? 'gain' : 'mute'}>{ch.status}</LuxTag> : undefined}
            sub="Eligible only when it beat the incumbent in BOTH walk-forward halves AND in shadow with n ≥ 50 decided over ≥ 10 trading days.">
            {!ch && <p className="ah-note">No challenger — the last re-fit found no candidate that beat the incumbent in both halves.</p>}
            {ch && (
              <>
                <p><strong>{ch.config.id}</strong> · shadow since {new Date(ch.createdAt).toLocaleDateString()}</p>
                <ul className="ah-note">{describe(ch.config).map((x) => <li key={x}>{x}</li>)}</ul>
                {notApplied(ch.config).length > 0 && <p className="ah-note">Not applied by any module yet even when approved: {notApplied(ch.config).join(', ')} (recorded in the calibration; publish gate applies mutes and contract bands only).</p>}
                {sh && (
                  <p className="ah-note">Shadow: {sh.tradingDays} trading days · {sh.ideasSeen} ideas · {sh.decided} decided · challenger {rr(sh.challenger.expR)} (n {sh.challenger.n}) vs incumbent {rr(sh.incumbent.expR)} (n {sh.incumbent.n}){sh.band ? ` · band ${rr(sh.band.lo)} … ${rr(sh.band.hi)}` : ''}</p>
                )}
                <p className="ah-note">{d.gate.eligible ? 'Gate: ELIGIBLE for approval.' : `Gate: not eligible — ${d.gate.reasons.join('; ')}`}</p>
                <div className="ah-bar">
                  <LuxButton variant="primary" disabled={!d.gate.eligible || !!busy} onClick={() => void act('approve', `Approve ${ch.config.id}? It writes a new calibration version (rollback stays available).`)}>Approve</LuxButton>
                  <LuxButton disabled={ch.status !== 'shadow' || !!busy} onClick={() => void act('reject', `Reject ${ch.config.id}?`)}>Reject</LuxButton>
                </div>
              </>
            )}
          </LuxPanel>
        )}

        {d && (
          <LuxPanel title="Calibration versions" sub=".cache/shared/calibration.json — versioned; rollback restores the previous version. Auto-rollback when the first 30 decided ideas after promotion average below the expectation floor.">
            {d.state.rollback && <p className="ah-note">Auto-rollback check: {d.state.rollback.reason}{d.state.rollback.meanR != null ? ` (mean ${rr(d.state.rollback.meanR)}, floor ${rr(d.state.rollback.floor)})` : ''}</p>}
            {!d.calibration?.versions.length && <p className="ah-note">No versions — the incumbent is in force.</p>}
            {!!d.calibration?.versions.length && (
              <div className="ah-scroll">
                <table className="ah-table ah-rows">
                  <thead><tr><th>Version</th><th>Action</th><th>Config</th><th>Expectation</th><th>By</th></tr></thead>
                  <tbody>
                    {[...d.calibration.versions].reverse().map((v) => (
                      <tr key={v.version}>
                        <td data-label="Version">v{v.version}{v.version === d.calibration!.current && <> <LuxTag tone="gain">current</LuxTag></>}</td>
                        <td data-label="Action">{v.action}<span className="ah-sub2">{new Date(v.at).toLocaleString()}</span></td>
                        <td data-label="Config">{describe(v.config).join(' · ')}</td>
                        <td data-label="Expectation">{v.expectation ? `${rr(v.expectation.lo)} … ${rr(v.expectation.hi)}` : '—'}</td>
                        <td data-label="By">{v.by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="ah-bar" style={{ marginTop: 10 }}>
              <LuxButton disabled={!d.active || !!busy} onClick={() => void act('rollback', 'Roll back to the previous calibration version?')}>Rollback</LuxButton>
            </div>
          </LuxPanel>
        )}

        {sc && (
          <LuxPanel title="Scorecard" meta={<LuxTag tone="mute">{d?.scorecardAsOf ? `as of ${fmtAgo(d.scorecardAsOf)}` : ''}</LuxTag>}
            sub={sc.caveats.join(' · ')}>
            <div className="ah-bar" style={{ marginBottom: 10 }}>
              <select className="ah-select" value={dim} onChange={(e) => setDim(e.target.value as ScoreDim)} aria-label="Slice by">
                {SCORE_DIMS.map((k) => <option key={k} value={k}>{DIM_LABEL[k]}</option>)}
              </select>
              <span className="ah-note">premium basis {sc.byBasis.premium.n} · {rr(sc.byBasis.premium.expectancyR)} — underlying basis {sc.byBasis.underlying.n} · {rr(sc.byBasis.underlying.expectancyR)}</span>
            </div>
            <SliceTable rows={sc.slices[dim] ?? []} />
            <p className="ah-note">Excluded: {Object.entries(sc.population.excluded).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'} · unresolved {sc.population.unresolved}</p>
          </LuxPanel>
        )}

        {sc && (
          <LuxPanel title="Drift flags" sub="A slice's last 20 decided ideas vs its own earlier ideas: baseline win rate outside the recent Wilson CI, or recent avg R outside the baseline band.">
            {!sc.drift.length && <p className="ah-note">No drift flags.</p>}
            {!!sc.drift.length && (
              <ul>{sc.drift.map((f, i) => <li key={i}><strong>{DIM_LABEL[f.dim]} = {f.value}</strong>: {f.note} (baseline n {f.nBaseline})</li>)}</ul>
            )}
          </LuxPanel>
        )}

        {d?.refit && (
          <LuxPanel title="Weekly re-fit" meta={<LuxTag tone="mute">{d.refitAsOf ? fmtAgo(d.refitAsOf) : ''}</LuxTag>} sub={d.refit.notes.join(' · ')}>
            <p className="ah-note">{d.refit.universe.decided} decided ideas {d.refit.universe.firstDay} → {d.refit.universe.lastDay}; halves split at {d.refit.universe.medianDay}. {d.refit.tested} candidates tested, {d.refit.accepted.length} accepted.</p>
            <div className="ah-scroll">
              <table className="ah-table ah-rows">
                <thead><tr><th>Family</th><th>Best candidate</th><th>Half A (cand vs inc)</th><th>Half B</th><th>Rolling folds</th><th>Verdict</th></tr></thead>
                <tbody>{Object.entries(d.refit.byFamily).map(([k, f]) => <FamilyRow key={k} fam={k} f={f} />)}</tbody>
              </table>
            </div>
          </LuxPanel>
        )}

        {!!d?.state.history.length && (
          <LuxPanel title="Loop history">
            <ul className="ah-note">{d.state.history.map((h, i) => <li key={i}>{new Date(h.at).toLocaleString()} — {h.event}: {h.detail}</li>)}</ul>
          </LuxPanel>
        )}
      </div>
    </AdminLayout>
  );
}
