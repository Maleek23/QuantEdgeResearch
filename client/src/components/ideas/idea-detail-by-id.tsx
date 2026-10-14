/**
 * Setup detail BY ID — the NEXUS Setup Detail for ANY idea id.
 *
 * Live board first (the same pick NEXUS shows, live re-grade and all); when the
 * idea is not on the board — resolved, expired, a past day, deduped, or an index
 * scalp the desk files under "SPX" — the stored idea from GET /api/ideas/:id/detail
 * (server/idea-detail.ts), rendered by the same SetupDetail with a status chip
 * (Open / Hit T1 / Stopped / Expired), the premium outcome and "as of" stamps.
 * Never a dead end. Used by NEXUS (DetailSetup), the 0DTE desk sheet and /idea/:id.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { QEError, QELoading } from '@/components/ui/qe-states';
import { fmtExactET, type ConvictionPick } from '@/lib/convictions';
import { useSetupLifecycles } from '@/lib/setup-lifecycle';
import { SetupDetail, get, spySourceOf, useNexusConvictions, useSpxExpression, type DetailTab } from '@/components/dashboard/tools/nexus/nexus-parts';
import { spxThesisLabel } from '@shared/zero-dte-journal';
import { ideaDetailHref } from '@/lib/idea-link';
import './idea-detail-by-id.css';

export interface IdeaDetailPayload {
  ideaId: string;
  pick: ConvictionPick;
  status: { code: string; label: string; tone: 'live' | 'gain' | 'loss' | 'muted' };
  record: {
    outcomeStatus: string; resolutionReason: string | null; exitPrice: number | null; exitDate: string | null;
    entryPremium: number | null; exitPremium: number | null; optionPercentGain: number | null; percentGain: number | null;
    peak: { premium: number; at: string; basis: string } | null;
  };
  premium: {
    status: string; exitPremium: number | null; exitAtMs: number | null; optionPercentGain: number | null;
    t1HitAt: number | null; t2HitAt: number | null; stopHitAt: number | null;
    peak: { premium: number; atMs: number } | null; bars: number; basis: string;
    asOf: string | null; lastPremium: number | null; source: string | null;
    trough?: { premium: number; atMs: number } | null;
  } | null;
  /** Verify-ledger chip (shared/nexus-pnl.ts). */
  verification?: import("@shared/nexus-pnl").PnlVerification;
  premiumNote: string | null;
  thesisLabel: string | null;
  zeroDte: boolean;
  family: string | null;
  source: string;
  asOf: string;
}

export { ideaDetailHref };

export function useIdeaDetail(id: string | undefined, enabled = true) {
  return useQuery<IdeaDetailPayload>({
    queryKey: ['/api/ideas', id, 'detail'],
    queryFn: () => get(`/api/ideas/${encodeURIComponent(String(id))}/detail`),
    enabled: !!id && enabled && !id.startsWith('spx-linked-') && !id.startsWith('bot-'),
    staleTime: 30_000,
    refetchInterval: (q) => (q.state.data?.status.code === 'open' || q.state.data?.status.code === 'waiting' ? 60_000 : false),
    retry: 1,
  });
}

const money = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `$${v.toFixed(2)}`);
const at = (ms: number | string | null | undefined) => (ms == null ? null : fmtExactET(typeof ms === 'number' ? new Date(ms).toISOString() : ms));

/** "SPX thesis · traded on SPY 770P" for a pick (board or stored). */
export function thesisLabelOf(pick: Pick<ConvictionPick, 'symbol' | 'source' | 'optionType' | 'strikePrice'>, stored?: string | null): string | null {
  return stored ?? spxThesisLabel({ symbol: pick.symbol, source: pick.source, optionType: pick.optionType, strikePrice: pick.strikePrice });
}

/** Status chip + outcome strip above the detail of an off-board idea. */
export function IdeaOutcomeStrip({ d }: { d: IdeaDetailPayload }) {
  const p = d.premium;
  const r = d.record;
  const pct = p?.optionPercentGain ?? r.optionPercentGain ?? r.percentGain;
  const cells: [string, string, string | null][] = [
    ['Entry premium', money(r.entryPremium ?? d.pick.entryPremium), null],
    ['T1', p?.t1HitAt ? 'hit' : '—', at(p?.t1HitAt)],
    ['T2', p?.t2HitAt ? 'hit' : '—', at(p?.t2HitAt)],
    ['Stop', p?.stopHitAt ? 'hit' : '—', at(p?.stopHitAt)],
    ['Peak', money(p?.peak?.premium ?? r.peak?.premium), at(p?.peak?.atMs ?? r.peak?.at)],
    ['Exit', money(r.exitPremium ?? p?.exitPremium), at(r.exitDate ?? p?.exitAtMs)],
  ];
  return (
    <div className="idb-strip" role="note" aria-label="Recorded outcome">
      <div className="idb-strip-head">
        <span className={`idb-chip ${d.status.tone}`}>{d.status.label}</span>
        {d.thesisLabel && <span className="idb-chip idb-thesis">{d.thesisLabel}</span>}
        {d.zeroDte && <span className="idb-chip muted">0DTE / index</span>}
        {pct != null && <strong className={pct >= 0 ? 'idb-gain' : 'idb-loss'}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</strong>}
        <span className="idb-asof">not on the live board · plan as published · as of {at(d.asOf)}</span>
      </div>
      {d.pick.assetType === 'option' && (
        <div className="idb-cells">
          {cells.map(([k, v, t]) => <div key={k}><span>{k}</span><strong>{v}</strong>{t && <small>{t}</small>}</div>)}
        </div>
      )}
      <p className="idb-foot">
        {p ? <>Contract premium judged on its own 1-minute bars ({p.bars} bars{p.source ? ` · ${p.source}` : ''}){p.lastPremium != null ? <> · last {money(p.lastPremium)} as of {at(p.asOf)}</> : null}.</>
          : d.premiumNote ? <>Premium outcome: {d.premiumNote}.</> : null}
        {r.resolutionReason ? <> Resolution: {r.resolutionReason.replace(/_/g, ' ')}.</> : null}
      </p>
    </div>
  );
}

/**
 * The detail for one idea id. `boardFirst` (default) shows the live board pick
 * when it is there; otherwise the stored idea.
 */
export function IdeaDetailById({ ideaId, tab, onTab, chartHeight }: { ideaId: string; tab?: DetailTab; onTab?: (t: DetailTab) => void; chartHeight?: number }) {
  const convictions = useNexusConvictions();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  const all = useMemo(() => convictions.data?.picks ?? [], [convictions.data]);
  const { map: life } = useSetupLifecycles(all, convictions.data?.generatedAt, now);
  const spx = useSpxExpression(spySourceOf(all));
  const [ownTab, setOwnTab] = useState<DetailTab>('overview');
  const curTab = tab ?? ownTab;
  const setTab = onTab ?? setOwnTab;
  const id = ideaId.replace(/^desk:/, '');
  const onBoard = all.find((p) => p.ideaId === id);
  const stored = useIdeaDetail(id, !onBoard && !convictions.isLoading);
  if (onBoard) {
    // SetupDetail prints the "SPX thesis · traded on SPY" chip from pick.thesisLabel.
    return <SetupDetail selected={onBoard} life={life.get(onBoard.ideaId)} now={now} spxExpression={spx.data} spxLoading={spx.isLoading} tab={curTab} onTab={setTab} chartHeight={chartHeight} />;
  }
  if (convictions.isLoading || stored.isLoading) return <QELoading rows={5} label="loading the setup…" />;
  if (stored.isError || !stored.data) {
    return <QEError title="This setup didn't load" message={`Idea ${id.slice(0, 8)} could not be read — ${(stored.error as Error)?.message ?? 'not found'}.`} onRetry={() => { void stored.refetch(); }} retrying={stored.isFetching} />;
  }
  const d = stored.data;
  return (
    <>
      <IdeaOutcomeStrip d={d} />
      <SetupDetail selected={d.pick} now={now} spxExpression={undefined} spxLoading={false} tab={curTab} onTab={setTab} chartHeight={chartHeight} />
      <p className="idb-foot">Link: <Link href={ideaDetailHref(id)}>{ideaDetailHref(id)}</Link></p>
    </>
  );
}
