/**
 * "Test this setup" — POST /api/ideas/:id/test-setup (server/idea-timeline.ts).
 * Replays this idea's own plan rules (T1 / stop / holding-window close) on
 * similar PAST setups from the same engine, on public bars. Always labelled
 * "measuring, unvalidated, n=…" — a small recent cohort, not the model record.
 */
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { SetupTestResult } from '@shared/idea-timeline';
import './setup-tools.css';

const pctText = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`);
const rText = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }) : '—');

export function TestSetupButton({ ideaId }: { ideaId: string }) {
  const m = useMutation<SetupTestResult, Error>({
    mutationFn: async () => {
      const r = await apiRequest('POST', `/api/ideas/${encodeURIComponent(ideaId)}/test-setup`);
      return r.json();
    },
  });
  const d = m.data;
  return (
    <section className="nxp-ts" aria-label="Test this setup on similar past setups">
      <button type="button" className="nxp-ts-btn" onClick={() => m.mutate()} disabled={m.isPending} aria-busy={m.isPending}>
        {m.isPending ? 'Replaying similar setups…' : d ? 'Re-run test' : 'Test this setup'}
      </button>
      {!d && !m.isError && !m.isPending && <p>Replays this plan's rules (T1, stop, holding-window close) on up to 25 earlier setups from the same engine, on real bars. Nothing is saved.</p>}
      {m.isError && <p role="alert">Test unavailable — {m.error.message.startsWith('404') ? 'no stored idea row for this id' : m.error.message}.</p>}
      {d && (
        <>
          <span className="nxp-ts-label">{d.label}</span>
          {d.n === 0
            ? <p>No similar past setup closed under these rules ({d.considered} eligible, {d.neverTriggered} never triggered, {d.noData} without bars, {d.open} still open) — nothing to report.</p>
            : <div className="nxp-ts-grid">
                <div><span>Hit T1</span><strong>{pctText(d.hitT1Rate)}</strong></div>
                <div><span>Stopped</span><strong>{pctText(d.stopRate)}</strong></div>
                <div><span>Avg R</span><strong>{rText(d.avgR)}</strong></div>
                <div><span>n closed</span><strong>{d.n}</strong></div>
              </div>}
          <p>
            Cohort: {d.cohort.rule} · published {day(d.window.from)}–{day(d.window.to)} (before this call, since {d.cohort.since}) ·
            {' '}{d.replayed} replayed: {d.hitT1} T1, {d.stopped} stop, {d.horizon} window close, {d.open} open, {d.neverTriggered} never triggered, {d.noData} no bars ·
            bars {Object.entries(d.intervals).map(([k, v]) => `${k}×${v}`).join(', ') || 'none'} · as of {new Date(d.asOf).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET
          </p>
          <ul>{[...d.rules, ...d.notes].map((t) => <li key={t}>{t}</li>)}</ul>
        </>
      )}
    </section>
  );
}
