/**
 * "Start here" checklist on Today — shown to beginners (and anyone whose tips
 * are on and who has no profile yet) until every item is ticked or it's hidden.
 * Items tick themselves when the link is followed; progress is per user
 * (lib/onboarding.ts). The tutorial item only appears when a real tutorial
 * video exists (/videos/tutorials/manifest.json) — otherwise it is the Guide.
 */
import { Link } from 'wouter';
import { Check, X } from 'lucide-react';
import { DISCORD_INVITE, useOnboarding, useTutorialVideos, type TutorialVideo } from '@/lib/onboarding';
import type { ChecklistId } from '@shared/onboarding';
import { Term } from './term';
import '@/styles/onboarding.css';

interface Item { id: ChecklistId; label: string; href: string; external?: boolean }

export function StartHereCard() {
  const ob = useOnboarding();
  const videos = useTutorialVideos();
  const show = ob.signedIn && !ob.loading && ob.tipsOn && !ob.progress.checklistHidden && (ob.tier === 'beginner' || ob.tier === null);
  if (!show) return null;
  const hasTutorial = !!videos.data?.today;
  const items: Item[] = [
    hasTutorial
      ? { id: 'tutorial', label: 'Watch the 3-minute tutorial', href: '#tutorial-today' }
      : { id: 'tutorial', label: 'Read the quick guide', href: '/how-to' },
    { id: 'setup', label: 'Open a setup in NEXUS', href: '/t' },
    { id: 'gex', label: 'Read a GEX chart', href: '/t?tab=gex' },
    { id: 'discord', label: 'Join the Discord', href: DISCORD_INVITE, external: true },
    { id: 'risk', label: 'Set your risk per trade', href: '/settings#trading' },
  ];
  const done = items.filter((i) => ob.progress.checklist[i.id]).length;
  const tick = (id: ChecklistId) => { if (!ob.progress.checklist[id]) ob.patch({ checklist: { [id]: new Date().toISOString() } }); };

  return (
    <div className="container">
      <section className="ob ob-start" aria-labelledby="ob-start-title" data-tour="start-here" data-testid="start-here">
        <div className="ob-start-head">
          <div>
            <h2 id="ob-start-title">Start here</h2>
            <p>{done} of {items.length} done · go at your own pace.</p>
          </div>
          <button type="button" className="ob-x" aria-label="Hide the Start here card" onClick={() => ob.patch({ checklistHidden: true })}><X size={18} /></button>
        </div>
        <ol>
          {items.map((it) => {
            const isDone = !!ob.progress.checklist[it.id];
            const inner = (<><span className="ob-tick" data-done={isDone} aria-hidden>{isDone && <Check size={14} />}</span><span>{it.label}</span><span className="sr-only">{isDone ? ' (done)' : ''}</span></>);
            return (
              <li key={it.id}>
                {it.external
                  ? <a href={it.href} target="_blank" rel="noopener noreferrer" onClick={() => tick(it.id)}>{inner}<span className="sr-only"> (opens in a new tab)</span></a>
                  : it.href.startsWith('#')
                    ? <a href={it.href} onClick={() => tick(it.id)}>{inner}</a>
                    : <Link href={it.href} onClick={() => tick(it.id)}>{inner}</Link>}
              </li>
            );
          })}
        </ol>
        <div className="ob-start-terms">
          <span>Words you’ll see:</span>
          <Term k="gex">GEX</Term><Term k="call-wall">call wall</Term><Term k="gamma-flip">gamma flip</Term>
          <Term k="0dte">0DTE</Term><Term k="r">R</Term><Term k="targets">T1/T2</Term><Term k="vwap">VWAP</Term><Term k="orb">ORB</Term><Term k="delta">delta</Term>
        </div>
      </section>
    </div>
  );
}

/** Tutorial video for a page — renders only when the manifest lists one. */
export function TutorialVideoSlot({ page }: { page: string }) {
  const ob = useOnboarding();
  const videos = useTutorialVideos();
  const v: TutorialVideo | undefined = videos.data?.[page];
  if (!v || (ob.signedIn && !ob.tipsOn)) return null;
  return (
    <figure className="ob ob-video" id={`tutorial-${page}`}>
      <video controls preload="metadata" playsInline poster={v.poster} src={v.src}
        onPlay={() => { if (page === 'today') ob.patch({ checklist: { tutorial: new Date().toISOString() } }); }} />
      <figcaption>{v.title}</figcaption>
    </figure>
  );
}
