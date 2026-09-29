/**
 * SkipLink — "Skip to content" for keyboard and screen-reader users (SR 11-7
 * F7.7). Visually hidden until focused; the first Tab stop on every shell.
 * Moves focus to the element with `targetId` (the shell's <main>, which carries
 * tabIndex={-1}) without writing a #hash into the wouter URL.
 */
export const MAIN_CONTENT_ID = 'main-content';

export function SkipLink({ targetId = MAIN_CONTENT_ID }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      onClick={(e) => {
        const target = document.getElementById(targetId);
        if (!target) return;
        e.preventDefault();
        target.focus();
        target.scrollIntoView({ block: 'start' });
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-md focus:border focus:border-[var(--brand-cyan)] focus:bg-card focus:px-3 focus:py-2 focus:font-mono focus:text-[11px] focus:font-bold focus:uppercase focus:tracking-wider focus:text-foreground focus:shadow-xl focus:outline-none"
    >
      Skip to content
    </a>
  );
}
