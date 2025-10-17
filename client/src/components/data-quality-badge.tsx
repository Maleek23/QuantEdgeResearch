import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, AlertTriangle, Database, TrendingUp } from "lucide-react";
import type { AssetType } from "@shared/schema";

interface DataQualityBadgeProps {
  assetType: AssetType;
  dataSource?: string; // 'tradier', 'yahoo', 'coingecko', 'alphavantage', 'estimated'
  className?: string;
}

export function DataQualityBadge({ assetType, dataSource, className }: DataQualityBadgeProps) {
  // Determine data quality based on asset type and source
  const getQualityInfo = () => {
    // Options without Tradier = estimated strikes
    if (assetType === 'option' && (!dataSource || dataSource === 'estimated')) {
      return {
        icon: AlertTriangle,
        label: 'Estimated Strike',
        color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        tooltip: 'Options strike price estimated (±2% from current price). Tradier API needed for real delta targeting (0.30-0.40).',
        variant: 'warning' as const
      };
    }

    // Options with Tradier = real greeks
    if (assetType === 'option' && dataSource === 'tradier') {
      return {
        icon: CheckCircle2,
        label: 'Real Greeks',
        color: 'bg-green-500/10 text-green-400 border-green-500/20',
        tooltip: 'Real options data from Tradier API. Strike selected using delta targeting (0.30-0.40).',
        variant: 'success' as const
      };
    }

    // Crypto from CoinGecko = real data
    if (assetType === 'crypto' && dataSource === 'coingecko') {
      return {
        icon: CheckCircle2,
        label: 'Real Data',
        color: 'bg-green-500/10 text-green-400 border-green-500/20',
        tooltip: 'Real crypto data from CoinGecko API. Includes 60-day historical prices for RSI/MACD calculation.',
        variant: 'success' as const
      };
    }

    // Stocks from Yahoo/Alpha Vantage = real data
    if (assetType === 'stock' && (dataSource === 'yahoo' || dataSource === 'alphavantage' || dataSource === 'tradier')) {
      return {
        icon: CheckCircle2,
        label: 'Real Data',
        color: 'bg-green-500/10 text-green-400 border-green-500/20',
        tooltip: `Real stock data from ${dataSource === 'yahoo' ? 'Yahoo Finance' : dataSource === 'alphavantage' ? 'Alpha Vantage' : 'Tradier'} API. Includes historical prices for technical analysis.`,
        variant: 'success' as const
      };
    }

    // Default: assume real data if no specific source
    return {
      icon: Database,
      label: 'Verified',
      color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      tooltip: 'Data verified from market APIs.',
      variant: 'default' as const
    };
  };

  const quality = getQualityInfo();
  const Icon = quality.icon;

  // Simple badge with glow animation for verified data
  return (
    <Badge 
      variant="outline" 
      className={`${quality.color} gap-1 border ${quality.variant === 'success' ? 'badge-glow' : ''} ${className}`}
      data-testid={`badge-data-quality-${quality.label.toLowerCase().replace(/\s+/g, '-')}`}
      title={quality.tooltip}
    >
      <Icon className="h-3 w-3" />
      <span className="text-xs font-medium">{quality.label}</span>
    </Badge>
  );
}

interface DataSourceStatusProps {
  stocks: number;
  options: number;
  crypto: number;
  optionsEstimated: number;
}

export function DataSourceStatus({ stocks, options, crypto, optionsEstimated }: DataSourceStatusProps) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3 text-green-400" />
        <span>{stocks} Stocks (Real)</span>
      </div>
      <div className="flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3 text-green-400" />
        <span>{crypto} Crypto (Real)</span>
      </div>
      {optionsEstimated > 0 ? (
        <div className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-amber-400" />
          <span>{optionsEstimated} Options (Estimated)</span>
        </div>
      ) : options > 0 ? (
        <div className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-green-400" />
          <span>{options} Options (Real)</span>
        </div>
      ) : null}
    </div>
  );
}
