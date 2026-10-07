/**
 * Coach-mark tour: a spotlight cut-out around the step's target plus a step
 * card. Esc / "Skip tour" ends it (counted as done — it never nags), ←/→ move.
 * Phones: the card docks to the bottom above the safe area. Reduced motion:
 * no transitions (onboarding.css). Focus moves to the card on every step.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TourStep } from './tours';
import { Term } from './term';
import '@/styles/onboarding.css';

function findTarget(sels?: string[]): HTMLElement | null {
  for (const s of sels ?? []) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(s))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
    }
  }
  return null;
}

export function CoachTour({ title, steps, onDone }: { title: string; steps: TourStep[]; onDone(): void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[i];

  const measure = useCallback(() => {
    const el = findTarget(step?.target);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useLayoutEffect(() => {
    const el = findTarget(step?.target);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (el) el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    const t = window.setTimeout(measure, reduce ? 0 : 320);
    measure();
    return () => window.clearTimeout(t);
  }, [i, step, measure]);

  useEffect(() => {
    const on = () => measure();
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('scroll', on, true); };
  }, [measure]);

  useEffect(() => { cardRef.current?.focus(); }, [i]);

  const next = useCallback(() => (i >= steps.length - 1 ? onDone() : setI(i + 1)), [i, steps.length, onDone]);
  const prev = useCallback(() => setI((v) => Math.max(0, v - 1)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onDone(); }
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onDone]);

  if (!step) return null;
  const pad = 6;
  // Desktop card placement: below the target if it fits, else above; clamped to the viewport.
  let cardStyle: React.CSSProperties | undefined;
  if (rect) {
    const w = Math.min(340, window.innerWidth - 32);
    const below = rect.bottom + 14;
    const top = below + 220 < window.innerHeight ? below : Math.max(16, rect.top - 14 - 220);
    const left = Math.min(Math.max(16, rect.left), window.innerWidth - w - 16);
    cardStyle = { top, left };
  }

  return createPortal(
    <div className="ob" role="presentation">
      {rect ? (
        <div className="ob-tour-hole" aria-hidden
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      ) : <div className="ob-tour-dim" aria-hidden onClick={onDone} />}
      <div ref={cardRef} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="ob-tour-title"
        className={`ob-tour-card${rect ? '' : ' is-center'}`} style={cardStyle} data-testid="coach-tour">
        <div className="ob-tour-step">{title} tour · {i + 1} of {steps.length}</div>
        <h3 id="ob-tour-title">{step.title}</h3>
        <p>{step.body}</p>
        {step.terms?.length ? (
          <p style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
            <span style={{ color: 'var(--ob-mute)' }}>Key words:</span>
            {step.terms.map((k) => <Term key={k} k={k} force="chip" />)}
          </p>
        ) : null}
        <div className="ob-actions">
          <div className="ob-tour-dots" aria-hidden>{steps.map((_, j) => <span key={j} data-on={j === i} />)}</div>
          <span className="ob-spacer" />
          <button type="button" className="ob-btn ob-btn-ghost" onClick={onDone} data-testid="tour-skip">Skip tour</button>
          {i > 0 && <button type="button" className="ob-btn" onClick={prev}>Back</button>}
          <button type="button" className="ob-btn ob-btn-primary" onClick={next} data-testid="tour-next">{i >= steps.length - 1 ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
