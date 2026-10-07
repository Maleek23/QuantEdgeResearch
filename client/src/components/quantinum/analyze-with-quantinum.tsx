/**
 * "Analyze with Quantinum" — the per-object action (NEXUS setup detail, ticker
 * page, flow print rows, GEX levels, 0DTE rows, journal trades). Opens the Ask
 * Quantinum sheet pre-filled with that object. Hidden when the account cannot
 * use Ask Quantinum, so it never shows a dead button.
 */
import type { MouseEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { openAskQuantinum, useAskQuantinumStatus } from '@/lib/ask-quantinum';
import type { AskTarget } from '@shared/quantinum-ai';
import './ask-quantinum.css';

export function AnalyzeWithQuantinum({ target, compact = false, className, onOpen }: {
  target: AskTarget;
  /** Runs first — e.g. close the drawer the action sits in, so two dialogs never stack. */
  onOpen?: () => void;
  /** Icon-only (rows); the accessible name still reads in full. */
  compact?: boolean;
  className?: string;
}) {
  const status = useAskQuantinumStatus();
  if (!status.data?.enabled) return null;
  const name = `Analyze ${target.label ?? target.symbol ?? 'this'} with Quantinum`;
  const onClick = (e: MouseEvent) => {
    // Rows are often clickable themselves — the action must not also select/expand them.
    e.stopPropagation();
    e.preventDefault();
    onOpen?.();
    openAskQuantinum(target);
  };
  return (
    <button
      type="button"
      className={['aq-analyze', className].filter(Boolean).join(' ')}
      data-compact={compact ? 'true' : undefined}
      onClick={onClick}
      // Row-level Enter/Space handlers must not swallow this button's own activation.
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label={name}
      title={name}
      data-testid="analyze-with-quantinum"
    >
      <Sparkles aria-hidden />
      {!compact && <span>Analyze with Quantinum</span>}
    </button>
  );
}
