/**
 * "I took this" — on every NEXUS idea, for signed-in members (docs/DESK_ADMINS.md).
 * Records the idea into the member's own book (their desk book if they run one)
 * as origin 'quantedge_idea', kept apart from their own ideas. The entry is the
 * fill they type, or the published level stamped as such — never shown as their fill.
 *
 *   POST /api/journal/took-idea  { ideaId, entryPrice?, quantity? }
 *   GET  /api/journal/took-ideas → { journal, ideaIds }   (button state)
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { adminWrite } from '@/components/admin/hub-data';

const KEY = ['/api/journal/took-ideas'];

export function TookItButton({ ideaId, symbol }: { ideaId: string; symbol: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fill, setFill] = useState('');
  const [qty, setQty] = useState('1');
  const [busy, setBusy] = useState(false);
  const taken = useQuery<{ journal: string; ideaIds: string[] }>({
    queryKey: KEY,
    enabled: !!user,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const r = await fetch('/api/journal/took-ideas', { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });
  if (!user || !ideaId || ideaId.startsWith('spx-linked-')) return null;
  const done = !!taken.data?.ideaIds.includes(ideaId);
  const book = taken.data?.journal?.startsWith('trader:') ? 'your desk book' : 'your journal';

  const submit = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ideaId };
      const f = Number(fill);
      if (fill.trim()) body.entryPrice = f;
      const q = Number(qty);
      if (qty.trim()) body.quantity = q;
      await adminWrite('POST', '/api/journal/took-idea', body);
      toast({ title: `${symbol} added to ${book}`, description: fill.trim() ? 'Logged at your fill.' : 'Logged at the published entry — edit it to your fill in the journal.' });
      setOpen(false); setFill('');
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      toast({ title: 'Not added', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  if (done) {
    return <span className="nxp-took done" data-testid="took-it-done" title={`In ${book} as a QuantEdge idea`}><Check size={13} aria-hidden /> In {book}</span>;
  }
  return (
    <span className="nxp-took">
      <button type="button" className="nxp-took-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="button-took-it"
        title="Log this idea in your journal as a trade you took (labelled QuantEdge idea)">
        <Plus size={13} aria-hidden /> I took this
      </button>
      {open && (
        <span className="nxp-took-form" role="group" aria-label={`Log ${symbol} as taken`}>
          <input type="number" inputMode="decimal" min={0} step="0.01" placeholder="your fill (optional)" value={fill} onChange={(e) => setFill(e.target.value)} aria-label="Your fill price" />
          <input type="number" inputMode="numeric" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity" style={{ width: 64 }} />
          <button type="button" className="nxp-took-btn primary" disabled={busy} onClick={() => void submit()} data-testid="button-took-it-save">Log it</button>
        </span>
      )}
    </span>
  );
}
