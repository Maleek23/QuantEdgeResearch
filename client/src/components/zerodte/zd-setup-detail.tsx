/**
 * 0DTE desk "Details" — the NEXUS Setup Detail (nexus-parts.tsx SetupDetail),
 * reused as-is in a sheet: chart, price ladder with the live quote, timeline,
 * manage / risk / contract tabs. Nothing is re-implemented here; the desk only
 * finds the logged idea in the live NEXUS book by its id.
 * Lazy-loaded by zero-dte-desk.tsx so the desk does not pull the chart bundle
 * until a Details button is pressed.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { QEDrawer } from '@/components/ui/qe-drawer';
import { usePhone } from '@/components/ui/qe-phone';
import { QELoading } from '@/components/ui/qe-states';
import { nexusIdeaHref } from '@/lib/nexus-link';
import { useSetupLifecycles } from '@/lib/setup-lifecycle';
import { SetupDetail, spySourceOf, useNexusConvictions, useSpxExpression, type DetailTab } from '@/components/dashboard/tools/nexus/nexus-parts';
import '@/styles/nexus-prototype.css';
import '@/components/dashboard/dashboard.css';
import '@/components/dashboard/tools/nexus/nexus-tools.css';

export default function ZdSetupDetail({ ideaId, symbol, title, onClose }: { ideaId: string; symbol: string; title: string; onClose: () => void }) {
  const phone = usePhone();
  const convictions = useNexusConvictions();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(id); }, []);
  const all = useMemo(() => convictions.data?.picks ?? [], [convictions.data]);
  const { map: life } = useSetupLifecycles(all, convictions.data?.generatedAt, now);
  const spx = useSpxExpression(spySourceOf(all));
  const [tab, setTab] = useState<DetailTab>('overview');
  const pick = all.find((p) => p.ideaId === ideaId);
  return (
    <QEDrawer open onClose={onClose} title={title} subtitle="Setup detail — same view as NEXUS" side={phone ? 'bottom' : 'right'} size="lg" className="zd-detail-sheet">
      <div className="flowdash zd-detail-host">
        <div className="nxd nxd-detail">
          {convictions.isLoading
            ? <QELoading rows={5} label="loading the setup…" />
            : pick
              ? <SetupDetail selected={pick} life={life.get(pick.ideaId)} now={now} spxExpression={spx.data} spxLoading={spx.isLoading} tab={tab} onTab={setTab} />
              : (
                <div className="zd-detail-miss">
                  <p>{symbol} is not on the live NEXUS board any more — it resolved or left the book.</p>
                  <Link href={nexusIdeaHref({ ideaId, symbol })} className="zd-btn" onClick={onClose}>Open on NEXUS</Link>
                </div>
              )}
        </div>
      </div>
    </QEDrawer>
  );
}
