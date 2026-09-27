export interface ExecutionBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ExecutionConfig {
  initialCapital: number;
  positionSizePercent: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  slippageBps?: number;
  commissionPerOrder?: number;
}

export interface ExecutedTrade {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  marketEntryPrice: number;
  marketExitPrice: number;
  direction: 'long';
  positionSize: number;
  grossPnl: number;
  costs: number;
  pnl: number;
  pnlPercent: number;
  exitReason: 'take_profit' | 'stop_loss' | 'signal_exit' | 'end_of_data';
}

function validPrice(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Execute close-generated long signals at the next bar open.
 * Stops win ties when one bar touches both stop and target.
 */
export function executeLongSignals(
  bars: readonly ExecutionBar[],
  entrySignals: readonly boolean[],
  exitSignals: readonly boolean[],
  config: ExecutionConfig,
): ExecutedTrade[] {
  const trades: ExecutedTrade[] = [];
  const slip = Math.max(0, config.slippageBps ?? 5) / 10_000;
  const commission = Math.max(0, config.commissionPerOrder ?? 1);
  let capital = config.initialCapital;
  let pendingEntry = false;
  let pendingExit = false;
  let position: null | {
    entryDate: string;
    fillEntry: number;
    marketEntry: number;
    quantity: number;
    stop: number;
    target: number;
  } = null;

  const closePosition = (bar: ExecutionBar, marketExit: number, reason: ExecutedTrade['exitReason']) => {
    if (!position || !validPrice(marketExit)) return;
    const fillExit = marketExit * (1 - slip);
    const grossPnl = (marketExit - position.marketEntry) * position.quantity;
    const fillPnlBeforeCommission = (fillExit - position.fillEntry) * position.quantity;
    const costs = (grossPnl - fillPnlBeforeCommission) + commission * 2;
    const pnl = grossPnl - costs;
    trades.push({
      entryDate: position.entryDate,
      entryPrice: position.fillEntry,
      exitDate: bar.date,
      exitPrice: fillExit,
      marketEntryPrice: position.marketEntry,
      marketExitPrice: marketExit,
      direction: 'long',
      positionSize: position.quantity,
      grossPnl,
      costs,
      pnl,
      pnlPercent: (pnl / (position.fillEntry * position.quantity)) * 100,
      exitReason: reason,
    });
    capital += pnl;
    position = null;
    pendingExit = false;
  };

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    let enteredThisBar = false;

    if (position && pendingExit && validPrice(bar.open)) {
      closePosition(bar, bar.open, 'signal_exit');
    }

    if (!position && pendingEntry && validPrice(bar.open)) {
      const fillEntry = bar.open * (1 + slip);
      const allocation = capital * (config.positionSizePercent / 100);
      const quantity = allocation / fillEntry;
      position = {
        entryDate: bar.date,
        fillEntry,
        marketEntry: bar.open,
        quantity,
        stop: fillEntry * (1 - config.stopLossPercent / 100),
        target: fillEntry * (1 + config.takeProfitPercent / 100),
      };
      pendingEntry = false;
      enteredThisBar = true;
    }

    // Do not let the signal bar or the entry bar's unknown intrabar ordering
    // create a same-bar win. Risk evaluation begins on the following bar.
    if (position && !enteredThisBar) {
      const hitStop = bar.low <= position.stop;
      const hitTarget = bar.high >= position.target;
      if (hitStop) closePosition(bar, position.stop, 'stop_loss');
      else if (hitTarget) closePosition(bar, position.target, 'take_profit');
    }

    if (!position && !pendingEntry && entrySignals[i] && i < bars.length - 1) pendingEntry = true;
    if (position && exitSignals[i] && i < bars.length - 1) pendingExit = true;

    if (position && i === bars.length - 1) closePosition(bar, bar.close, 'end_of_data');
  }

  return trades;
}
