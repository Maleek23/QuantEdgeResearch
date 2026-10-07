/**
 * <Term k="gex">GEX</Term> — "What is this?" explainer on a jargon word.
 * Copy: shared/glossary.ts (the single source).
 *
 *   beginner      word + a visible "?" chip; tap/click opens the explainer
 *   intermediate  dotted underline only; hover / focus / tap opens it
 *   pro, or tips off (Settings › Tips & tours)   plain text
 *   signed out    dotted underline (public pages explain themselves too)
 */
import { useRef, useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { GLOSSARY, type GlossaryKey } from '@shared/glossary';
import { useOnboarding } from '@/lib/onboarding';
import '@/styles/onboarding.css';

export function Term({ k, children, force }: { k: GlossaryKey; children?: ReactNode; force?: 'chip' | 'hover' }) {
  const ob = useOnboarding();
  const [open, setOpen] = useState(false);
  const closeT = useRef<number | undefined>(undefined);
  const g = GLOSSARY[k];
  const label = children ?? g.term;
  const style: 'chip' | 'hover' | 'plain' = force
    ?? (!ob.signedIn ? 'hover' : !ob.tipsOn ? 'plain' : ob.tier === 'beginner' || ob.tier === null ? 'chip' : ob.tier === 'intermediate' ? 'hover' : 'plain');
  if (style === 'plain') return <>{label}</>;

  const hoverProps = style === 'hover' ? {
    onMouseEnter: () => { window.clearTimeout(closeT.current); setOpen(true); },
    onMouseLeave: () => { closeT.current = window.setTimeout(() => setOpen(false), 120); },
    onFocus: () => setOpen(true),
    onBlur: () => setOpen(false),
  } : {};

  return (
    <span className="ob-term">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button type="button" className="ob-term-btn" aria-label={`${typeof label === 'string' ? label : g.term} — what is this?`} {...hoverProps} data-testid={`term-${k}`}>
            {label}
            {style === 'chip' && <span className="ob-term-q" aria-hidden>?</span>}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="ob-term-pop" side="top" align="start" sideOffset={6} collisionPadding={16}
            onMouseEnter={() => window.clearTimeout(closeT.current)} onMouseLeave={style === 'hover' ? () => setOpen(false) : undefined}
            onOpenAutoFocus={(e) => { if (style === 'hover') e.preventDefault(); }}>
            <b>{g.term}</b>
            {g.short}
            {'more' in g && g.more && <div className="ob-more">{g.more}</div>}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </span>
  );
}
