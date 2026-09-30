/**
 * PHONE TYPE FLOOR — no visible text under 12px on phones (< 600px).
 *
 * Operator 2026-09-29 ("readability and size"). Hundreds of tool styles set
 * 9–11px literally; CSS has no min-font-size, and a blanket override would
 * flatten the type scale. So on phones only, text leaves under #main-content
 * whose COMPUTED size is below 12px get an inline 12px (their other styles
 * stay). New content is picked up by a throttled MutationObserver; leaving the
 * phone width restores the authored sizes. research/device-audit.ts checks it.
 */
const FLOOR = 12;
const MQ = '(max-width: 599px)';
const MARK = 'data-type-floor';

function raise(root: ParentNode) {
  const els = root.querySelectorAll<HTMLElement>('*');
  for (const el of Array.from(els)) {
    if (el.closest('svg,[aria-hidden="true"],.sr-only')) continue;
    // only elements that carry their own text
    let own = false;
    for (const n of Array.from(el.childNodes)) if (n.nodeType === 3 && n.textContent?.trim()) { own = true; break; }
    if (!own) continue;
    const f = parseFloat(getComputedStyle(el).fontSize);
    if (f > 0 && f < FLOOR - 0.01) { el.style.fontSize = `${FLOOR}px`; el.setAttribute(MARK, ''); }
  }
}

function restore() {
  document.querySelectorAll<HTMLElement>(`[${MARK}]`).forEach((el) => { el.style.fontSize = ''; el.removeAttribute(MARK); });
}

export function installPhoneTypeFloor() {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  const mq = window.matchMedia(MQ);
  let pending = false;
  const run = () => {
    pending = false;
    const main = document.getElementById('main-content');
    if (mq.matches && main) raise(main);
  };
  const schedule = () => { if (!pending) { pending = true; setTimeout(run, 400); } };
  new MutationObserver(() => { if (mq.matches) schedule(); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  mq.addEventListener?.('change', () => (mq.matches ? schedule() : restore()));
  schedule();
}
