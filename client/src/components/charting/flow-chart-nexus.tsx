/**
 * FLOW CHART — the CHART tab's board (also the Flow / GEX / LEAPS workspaces'
 * 'stock-chart' tool). It is QEChart in its full variant, following the
 * app-wide selected ticker. Every embedded price chart is the same component
 * in its compact variant — see components/charting/qe-chart.tsx.
 */
import { useStockContext } from '@/contexts/stock-context';
import { QEChart } from '@/components/charting/qe-chart';

export function FlowChartBoard({ onOpenLab }: { onOpenLab?: () => void }) {
  const { currentStock, setCurrentStock } = useStockContext();
  const symbol = currentStock?.symbol?.toUpperCase() || 'SPY';
  return (
    <QEChart
      symbol={symbol}
      variant="full"
      onSymbolChange={(s, name) => setCurrentStock({ symbol: s, name })}
      onOpenLab={onOpenLab}
    />
  );
}

export default FlowChartBoard;
