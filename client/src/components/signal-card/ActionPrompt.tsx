/**
 * ActionPrompt — "What To Do Now" panel for any open trade
 * Inspired by MomoEdge Oracle's action layer:
 *   ✓ T2 reached. Take second round of profit.
 *   ② Trail stop to T1. Close remaining.
 *   ◆ Oracle Option Pick: ...
 */

import { useQuery } from '@tanstack/react-query';

interface TradeAction {
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  emoji: string;
  label: string;
  detail: string;
  cta?: { text: string; action: string };
}

interface Props {
  tradeIdeaId: string;
  compact?: boolean;
}

export function ActionPrompt({ tradeIdeaId, compact = false }: Props) {
  const { data, isLoading } = useQuery<{ tradeId: string; actions: TradeAction[] }>({
    queryKey: ['trade-actions', tradeIdeaId],
    queryFn: async () => {
      const res = await fetch(`/api/trade-ideas/${tradeIdeaId}/actions`);
      return res.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  if (isLoading) {
    return <div className="text-xs text-zinc-500 italic">Computing actions...</div>;
  }

  if (!data?.actions?.length) return null;

  const priorityClass = {
    critical: 'bg-red-500/10 border-red-500/30 text-red-300',
    high: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    medium: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300',
    low: 'bg-zinc-500/10 border-zinc-500/30 text-zinc-300'
  };

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
        ◆ What To Do Now
      </div>
      {data.actions.slice(0, compact ? 2 : 5).map((action, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 p-2 rounded border ${priorityClass[action.priority]}`}
        >
          <span className="text-base flex-shrink-0">{action.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold">{action.label}</div>
            {!compact && <div className="text-xs text-zinc-400 mt-0.5">{action.detail}</div>}
            {action.cta && !compact && (
              <button
                className="mt-2 text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-200"
              >
                {action.cta.text} →
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
