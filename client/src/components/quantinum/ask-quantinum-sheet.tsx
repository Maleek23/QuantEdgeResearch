/**
 * Ask Quantinum — the side sheet (docs/ASK_QUANTINUM.md).
 *
 * QEDrawer (Radix Dialog: focus trap, Esc, focus return, labelled) on the right
 * on desktop, from the bottom on phones. The body is the one shared panel
 * (ask-quantinum-panel.tsx) — same thread as the /ask page. Lazy-loaded by the
 * host so react-markdown never lands on first paint.
 */
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Maximize2 } from 'lucide-react';
import { QEDrawer } from '@/components/ui/qe-drawer';
import type { AskStatus } from '@/lib/ask-quantinum';
import type { AskTarget } from '@shared/quantinum-ai';
import { AskQuantinumPanel } from './ask-quantinum-panel';
import './ask-quantinum.css';

function usePhone(): boolean {
  const q = '(max-width: 767px)';
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(q).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const on = () => setM(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return !!m;
}

export default function AskQuantinumSheet({ open, onClose, target, seedPrompt, status, onClearTarget }: {
  open: boolean;
  onClose: () => void;
  target: AskTarget | null;
  /** Bumps whenever an Analyze action opens the sheet. */
  seedPrompt: { text: string; nonce: number } | null;
  status: AskStatus | undefined;
  onClearTarget: () => void;
}) {
  const phone = usePhone();
  return (
    <QEDrawer
      open={open}
      onClose={onClose}
      title="Ask Quantinum"
      subtitle="Answers from QuantEdge data only · ⌘\ / Ctrl+\ toggles"
      side={phone ? 'bottom' : 'right'}
      size="sm"
      className="aq-sheet"
    >
      <Link href={`/ask${target?.symbol ? `?sym=${encodeURIComponent(target.symbol)}` : ''}`} className="aq-fullpage lx-focus" onClick={onClose}>
        <Maximize2 aria-hidden size={12} />Full page with chart
      </Link>
      <AskQuantinumPanel target={target} seedPrompt={seedPrompt} status={status} onClearTarget={onClearTarget} variant="sheet" />
    </QEDrawer>
  );
}
