import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { ArrowUpDown, ArrowUp, ArrowDown, TrendingUp, TrendingDown, ExternalLink, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { TradeIdea } from "@shared/schema";
import { cn } from "@/lib/utils";
import { getPerformanceGrade } from "@/lib/performance-grade";

type SortColumn = 'symbol' | 'assetType' | 'direction' | 'entry' | 'exit' | 'pnl' | 'status' | 'exitDate';
type SortDirection = 'asc' | 'desc';

interface ClosedTradesTableProps {
  rows: TradeIdea[];
  className?: string;
}

export function ClosedTradesTable({ rows, className }: ClosedTradesTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('exitDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedTrade, setSelectedTrade] = useState<TradeIdea | null>(null);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
    let aVal: any;
    let bVal: any;

    switch (sortColumn) {
      case 'symbol':
        aVal = a.symbol;
        bVal = b.symbol;
        break;
      case 'assetType':
        aVal = a.assetType;
        bVal = b.assetType;
        break;
      case 'direction':
        aVal = a.direction;
        bVal = b.direction;
        break;
      case 'entry':
        aVal = a.entryPrice;
        bVal = b.entryPrice;
        break;
      case 'exit':
        aVal = a.exitPrice || 0;
        bVal = b.exitPrice || 0;
        break;
      case 'pnl':
        aVal = a.percentGain || 0;
        bVal = b.percentGain || 0;
        break;
      case 'status':
        aVal = a.outcomeStatus || '';
        bVal = b.outcomeStatus || '';
        break;
      case 'exitDate':
        aVal = a.exitDate ? new Date(a.exitDate).getTime() : 0;
        bVal = b.exitDate ? new Date(b.exitDate).getTime() : 0;
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
  }, [rows, sortColumn, sortDirection]);

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1" />
    );
  };

  const getStatusBadge = (status: string | null | undefined) => {
    const normalizedStatus = (status || '').trim().toLowerCase();
    
    switch (normalizedStatus) {
      case 'hit_target':
        return <Badge variant="default" className="bg-green-500/20 dark:bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30 dark:border-green-500/20 font-mono text-xs">WIN</Badge>;
      case 'hit_stop':
        return <Badge variant="destructive" className="bg-red-500/20 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 dark:border-red-500/20 font-mono text-xs">LOSS</Badge>;
      case 'expired':
        return <Badge variant="outline" className="bg-amber-500/20 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 dark:border-amber-500/20 font-mono text-xs">EXP</Badge>;
      default:
        return <Badge variant="outline" className="font-mono text-xs">{status?.toUpperCase() || 'N/A'}</Badge>;
    }
  };

  const getAssetTypeLabel = (assetType: string) => {
    const labels: Record<string, string> = {
      'stock': 'Stock',
      'penny_stock': 'Penny',
      'option': 'Option',
      'crypto': 'Crypto',
      'future': 'Future',
    };
    return labels[assetType] || assetType;
  };

  if (rows.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground text-sm">No closed trades to display</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Dialog open={!!selectedTrade} onOpenChange={(open) => !open && setSelectedTrade(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedTrade && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <DialogTitle className="flex items-center gap-2">
                      <span className="font-bold text-xl">{selectedTrade.symbol}</span>
                      <Badge variant={selectedTrade.direction === "long" ? "default" : "destructive"}>
                        {selectedTrade.direction.toUpperCase()}
                      </Badge>
                      {getStatusBadge(selectedTrade.outcomeStatus)}
                    </DialogTitle>
                    <DialogDescription className="text-sm mt-2">
                      {selectedTrade.catalyst || 'No catalyst provided'}
                    </DialogDescription>
                  </div>
                  <DialogClose asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6" 
                      data-testid="button-close-dialog"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </DialogClose>
                </div>
              </DialogHeader>
              
              <div className="space-y-4">
                {/* Analysis / Thesis */}
                {selectedTrade.analysis && (
                  <Card>
                    <CardContent className="pt-4 space-y-2">
                      <h3 className="font-semibold text-sm mb-2">Analysis</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {selectedTrade.analysis}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Price Details */}
                <Card>
                  <CardContent className="pt-4 space-y-2">
                    <h3 className="font-semibold text-sm mb-2">Price Details</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Entry Price</p>
                        <p className="font-mono font-bold">${selectedTrade.entryPrice.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Target Price</p>
                        <p className="font-mono font-bold">${selectedTrade.targetPrice.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Stop Loss</p>
                        <p className="font-mono font-bold">${selectedTrade.stopLoss.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Exit Price</p>
                        <p className="font-mono font-bold">{selectedTrade.exitPrice ? `$${selectedTrade.exitPrice.toFixed(2)}` : 'N/A'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Performance */}
                {selectedTrade.percentGain !== null && (
                  <Card>
                    <CardContent className="pt-4 space-y-2">
                      <h3 className="font-semibold text-sm mb-2">Performance</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs">P&L %</p>
                          <p className={cn(
                            "font-mono font-bold text-lg",
                            selectedTrade.percentGain > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                          )}>
                            {selectedTrade.percentGain > 0 ? '+' : ''}{selectedTrade.percentGain.toFixed(2)}%
                          </p>
                        </div>
                        {selectedTrade.realizedPnL !== null && (
                          <div>
                            <p className="text-muted-foreground text-xs">Realized P&L</p>
                            <p className={cn(
                              "font-mono font-bold text-lg",
                              selectedTrade.realizedPnL > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                            )}>
                              ${selectedTrade.realizedPnL.toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Trade Details */}
                <Card>
                  <CardContent className="pt-4 space-y-2">
                    <h3 className="font-semibold text-sm mb-2">Trade Details</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Asset Type</p>
                        <p className="font-semibold">{getAssetTypeLabel(selectedTrade.assetType)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Holding Period</p>
                        <p className="font-semibold">{selectedTrade.holdingPeriod.toUpperCase()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Confidence Score</p>
                        <p className="font-mono font-bold">{selectedTrade.confidenceScore?.toFixed(0) || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Grade</p>
                        <div className="flex flex-col gap-1">
                          {selectedTrade.probabilityBand || (selectedTrade.confidenceScore != null) ? (
                            <>
                              <Badge variant="outline" className="w-fit">
                                {selectedTrade.probabilityBand || getPerformanceGrade(selectedTrade.confidenceScore!).grade}
                              </Badge>
                              {selectedTrade.confidenceScore != null && (() => {
                                const gradeInfo = getPerformanceGrade(selectedTrade.confidenceScore);
                                return (
                                  <div className="text-xs text-muted-foreground">
                                    {gradeInfo.description} ({gradeInfo.expectedWinRate}% expected WR)
                                  </div>
                                );
                              })()}
                            </>
                          ) : (
                            <Badge variant="outline" className="w-fit">N/A</Badge>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">R:R Ratio</p>
                        <p className="font-mono font-bold">{selectedTrade.riskRewardRatio?.toFixed(2) || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Source</p>
                        <p className="font-semibold">{selectedTrade.source.toUpperCase()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Exit Information */}
                {selectedTrade.exitDate && (
                  <Card>
                    <CardContent className="pt-4 space-y-2">
                      <h3 className="font-semibold text-sm mb-2">Exit Information</h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <p className="text-muted-foreground text-xs">Exit Date</p>
                          <p className="font-mono">{format(parseISO(selectedTrade.exitDate), 'MMM d, yyyy h:mm a')}</p>
                        </div>
                        {selectedTrade.resolutionReason && (
                          <div>
                            <p className="text-muted-foreground text-xs">Exit Reason</p>
                            <p>{selectedTrade.resolutionReason}</p>
                          </div>
                        )}
                        {selectedTrade.outcomeNotes && (
                          <div>
                            <p className="text-muted-foreground text-xs">Notes</p>
                            <p className="text-muted-foreground">{selectedTrade.outcomeNotes}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className={cn("border rounded-lg overflow-hidden", className)} data-testid="table-closed-trades">
        <Table>
        <TableHeader>
          <TableRow className="bg-card hover:bg-card">
            <TableHead 
              className="cursor-pointer hover-elevate h-8 font-semibold text-xs"
              onClick={() => handleSort('symbol')}
              data-testid="header-symbol"
            >
              <div className="flex items-center">
                Symbol
                <SortIcon column="symbol" />
              </div>
            </TableHead>
            <TableHead 
              className="cursor-pointer hover-elevate h-8 font-semibold text-xs"
              onClick={() => handleSort('assetType')}
              data-testid="header-asset-type"
            >
              <div className="flex items-center">
                Type
                <SortIcon column="assetType" />
              </div>
            </TableHead>
            <TableHead 
              className="cursor-pointer hover-elevate h-8 font-semibold text-xs"
              onClick={() => handleSort('direction')}
              data-testid="header-direction"
            >
              <div className="flex items-center">
                Dir
                <SortIcon column="direction" />
              </div>
            </TableHead>
            <TableHead 
              className="cursor-pointer hover-elevate h-8 font-semibold text-xs text-right"
              onClick={() => handleSort('entry')}
              data-testid="header-entry"
            >
              <div className="flex items-center justify-end">
                Entry
                <SortIcon column="entry" />
              </div>
            </TableHead>
            <TableHead 
              className="cursor-pointer hover-elevate h-8 font-semibold text-xs text-right"
              onClick={() => handleSort('exit')}
              data-testid="header-exit"
            >
              <div className="flex items-center justify-end">
                Exit
                <SortIcon column="exit" />
              </div>
            </TableHead>
            <TableHead 
              className="cursor-pointer hover-elevate h-8 font-semibold text-xs text-right"
              onClick={() => handleSort('pnl')}
              data-testid="header-pnl"
            >
              <div className="flex items-center justify-end">
                P&L %
                <SortIcon column="pnl" />
              </div>
            </TableHead>
            <TableHead 
              className="cursor-pointer hover-elevate h-8 font-semibold text-xs"
              onClick={() => handleSort('status')}
              data-testid="header-status"
            >
              <div className="flex items-center">
                Status
                <SortIcon column="status" />
              </div>
            </TableHead>
            <TableHead 
              className="cursor-pointer hover-elevate h-8 font-semibold text-xs"
              onClick={() => handleSort('exitDate')}
              data-testid="header-exit-date"
            >
              <div className="flex items-center">
                Exit Date
                <SortIcon column="exitDate" />
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row, index) => {
            const pnlPercent = row.percentGain || 0;
            const isWin = pnlPercent > 0;
            
            return (
              <TableRow 
                key={row.id}
                className={cn(
                  "h-10 hover-elevate transition-colors cursor-pointer",
                  index % 2 === 0 ? "bg-card" : "bg-card/50"
                )}
                onClick={() => setSelectedTrade(row)}
                data-testid={`row-closed-trade-${row.id}`}
              >
                <TableCell 
                  className="font-mono font-semibold text-xs py-2"
                  data-testid={`cell-symbol-${row.id}`}
                >
                  {row.symbol}
                </TableCell>
                <TableCell 
                  className="text-xs py-2"
                  data-testid={`cell-asset-type-${row.id}`}
                >
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {getAssetTypeLabel(row.assetType)}
                  </Badge>
                </TableCell>
                <TableCell 
                  className="text-xs py-2"
                  data-testid={`cell-direction-${row.id}`}
                >
                  <div className="flex items-center gap-1">
                    {row.direction === 'long' ? (
                      <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-400" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-red-600 dark:text-red-400" />
                    )}
                    <span className={cn(
                      "font-semibold uppercase text-[10px]",
                      row.direction === 'long' ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                    )}>
                      {row.direction}
                    </span>
                  </div>
                </TableCell>
                <TableCell 
                  className="font-mono text-xs text-right py-2"
                  data-testid={`cell-entry-${row.id}`}
                >
                  ${row.entryPrice.toFixed(2)}
                </TableCell>
                <TableCell 
                  className="font-mono text-xs text-right py-2"
                  data-testid={`cell-exit-${row.id}`}
                >
                  {row.exitPrice ? `$${row.exitPrice.toFixed(2)}` : '-'}
                </TableCell>
                <TableCell 
                  className={cn(
                    "font-mono font-bold text-xs text-right py-2",
                    isWin ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  )}
                  data-testid={`cell-pnl-${row.id}`}
                >
                  {isWin ? '+' : ''}{pnlPercent.toFixed(1)}%
                </TableCell>
                <TableCell 
                  className="py-2"
                  data-testid={`cell-status-${row.id}`}
                >
                  {getStatusBadge(row.outcomeStatus)}
                </TableCell>
                <TableCell 
                  className="text-xs text-muted-foreground py-2"
                  data-testid={`cell-exit-date-${row.id}`}
                >
                  {row.exitDate ? format(parseISO(row.exitDate), 'MMM d, yyyy') : '-'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="px-4 py-2 bg-muted/30 border-t text-xs text-muted-foreground flex items-center gap-1">
        <ExternalLink className="h-3 w-3" />
        Click any row to view full trade details
      </div>
    </div>
    </>
  );
}
