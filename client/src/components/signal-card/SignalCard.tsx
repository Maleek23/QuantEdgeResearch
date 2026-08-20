/**
 * SignalCard — canonical signal display component
 *
 * 3 size variants:
 *   - mini:     Dashboard tile (6-element grid, ~150px tall)
 *   - standard: Trade Desk row with progress bar (Screen 2 style)
 *   - full:     Oracle Terminal-style with all sub-components (Screen 1 style)
 *
 * All variants render from the same SignalData shape — single source of truth.
 */

import { Link } from 'wouter';
import type { SignalCardProps } from './types';
import { ConfidenceGauge } from './ConfidenceGauge';
import { TradeTimeline } from './TradeTimeline';
import { SignalComponents } from './SignalComponents';
import { TradeGeometry } from './TradeGeometry';
import { OracleOptionTracker } from './OracleOptionTracker';
import { ContractEngine } from './ContractEngine';

export function SignalCard({ signal, size = 'standard', onClick, onPushTrade }: SignalCardProps) {
  if (size === 'mini') return <SignalCardMini signal={signal} onClick={onClick} />;
  if (size === 'full') return <SignalCardFull signal={signal} onClick={onClick} onPushTrade={onPushTrade} />;
  return <SignalCardStandard signal={signal} onClick={onClick} onPushTrade={onPushTrade} />;
}

// ═══════════════════════════════════════════════════════════════
// MINI — dashboard tile (Screen 3 style)
// ═══════════════════════════════════════════════════════════════
function SignalCardMini({ signal, onClick }: SignalCardProps) {
  const directionClass =
    signal.direction === 'BULL' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
    signal.direction === 'BEAR' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
    'bg-zinc-500/10 border-zinc-500/30 text-zinc-400';

  return (
    <button
      onClick={() => onClick?.(signal.id)}
      className="w-full bg-zinc-900/40 border border-zinc-800 rounded-lg p-4 hover:border-cyan-500/30 transition-colors text-left"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold">{signal.symbol}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${directionClass}`}>
            {signal.direction}
          </span>
        </div>
        <span className={`text-lg font-bold ${signal.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          ${signal.spot.toFixed(2)}
        </span>
      </div>

      {/* Confidence row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase text-zinc-500">Confidence</span>
        <span className="text-cyan-400 font-bold">
          {signal.confidence.toFixed(1)}%
          {signal.confidenceDelta !== 0 && (
            <span className={`text-xs ml-1 ${signal.confidenceDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {signal.confidenceDelta > 0 ? '▲' : '▼'} {Math.abs(signal.confidenceDelta).toFixed(1)}%
            </span>
          )}
        </span>
      </div>

      {/* Target row + progress */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase text-zinc-500">T1 Target</span>
        <span className="font-mono">${signal.t1.toFixed(2)}</span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-3">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500"
          style={{ width: signal.status === 'T1_HIT' || signal.status === 'T2_HIT' ? '100%' : `${Math.min(100, (signal.spot - signal.entry) / (signal.t1 - signal.entry) * 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase text-zinc-500">T1 Progress</span>
        {signal.status === 'T1_HIT' || signal.status === 'T2_HIT' ? (
          <span className="text-emerald-400 text-xs font-bold">● T1 HIT</span>
        ) : (
          <span className="text-zinc-500 text-xs">in progress</span>
        )}
      </div>

      {/* 3-column footer */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-zinc-800">
        <div>
          <div className="text-[10px] uppercase text-zinc-500">Entry</div>
          <div className="font-bold">${signal.entry.toFixed(2)}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] uppercase text-zinc-500">P&L</div>
          <div className={`font-bold ${signal.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {signal.pnlPct >= 0 ? '+' : ''}{signal.pnlPct.toFixed(1)}%
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-zinc-500">Hold</div>
          <div className="font-bold">{signal.daysActive}d</div>
        </div>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// STANDARD — Trade Desk row (Screen 2 style)
// ═══════════════════════════════════════════════════════════════
function SignalCardStandard({ signal, onClick, onPushTrade }: SignalCardProps) {
  const directionClass =
    signal.direction === 'BULL' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
    signal.direction === 'BEAR' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
    'bg-zinc-500/10 border-zinc-500/30 text-zinc-400';

  const t1Hit = signal.status === 'T1_HIT' || signal.status === 'T2_HIT';
  const progressPct = t1Hit ? 100 : Math.max(0, Math.min(100, (signal.spot - signal.entry) / (signal.t1 - signal.entry) * 100));

  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4 hover:border-cyan-500/30 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold">{signal.symbol}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${directionClass}`}>
            {signal.direction}
          </span>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">${signal.spot.toFixed(2)}</div>
          <div className={`text-sm font-mono ${signal.spotChangeToday >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {signal.spotChangeToday >= 0 ? '+' : ''}{signal.spotChangeToday.toFixed(2)}% today
          </div>
        </div>
      </div>

      {/* Confidence + Hold pills */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs px-2 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded text-cyan-400 font-bold">
          CONF {signal.confidence.toFixed(1)}%
          {signal.confidenceDelta !== 0 && (
            <span className={`ml-1 ${signal.confidenceDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {signal.confidenceDelta > 0 ? '▲' : '▼'} {Math.abs(signal.confidenceDelta).toFixed(1)}%
            </span>
          )}
        </span>
        <span className="text-xs px-2 py-1 bg-zinc-800 rounded text-zinc-300">
          {signal.holdPeriodLabel}
        </span>
      </div>

      {/* T1 Target + progress */}
      <div className="bg-zinc-950/40 rounded-lg p-3 mb-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs uppercase text-zinc-500">T1 Target</span>
          <span className="text-cyan-400 font-bold">${signal.t1.toFixed(2)}</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-1.5">
          <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs uppercase text-zinc-500">T1 Progress</span>
          {t1Hit ? (
            <span className="text-emerald-400 text-xs font-bold">🎯 T1 HIT</span>
          ) : (
            <span className="text-zinc-500 text-xs">{progressPct.toFixed(0)}%</span>
          )}
        </div>
      </div>

      {/* Entry / P&L / Time-in-trade */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-zinc-950/40 rounded p-2">
          <div className="text-[10px] uppercase text-zinc-500">Entry</div>
          <div className="font-bold text-cyan-400">${signal.entry.toFixed(2)}</div>
        </div>
        <div className="bg-zinc-950/40 rounded p-2">
          <div className="text-[10px] uppercase text-zinc-500">P&L</div>
          <div className={`font-bold ${signal.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ▲ {signal.pnlPct >= 0 ? '+' : ''}{signal.pnlPct.toFixed(1)}% (${signal.pnlAbs.toFixed(2)})
          </div>
        </div>
        <div className="bg-zinc-950/40 rounded p-2">
          <div className="text-[10px] uppercase text-zinc-500">⏱ Time</div>
          <div className="font-bold">{signal.daysActive} days</div>
        </div>
      </div>

      {/* Trigger badge + issued */}
      <div className="flex items-center gap-3 mb-3">
        {signal.trigger.confirmed && (
          <span className="text-xs px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded text-emerald-400 font-bold">
            ⚡ TRIGGER CONFIRMED {signal.trigger.price && `@ $${signal.trigger.price.toFixed(2)}`}
          </span>
        )}
        <span className="text-xs text-zinc-500">
          📡 ISSUED {new Date(signal.issuedAt).toLocaleDateString()}
        </span>
      </div>

      {/* Oracle Option Pick — tracked contract (when one is persisted) */}
      {signal.oracleOption && (
        <OracleOptionTracker
          symbol={signal.symbol}
          optionType={signal.oracleOption.optionType}
          strike={signal.oracleOption.strike}
          expiry={signal.oracleOption.expiry}
          premiumAtIssue={signal.oracleOption.premiumAtIssue}
          premiumNow={signal.oracleOption.premiumNow}
          pctChange={signal.oracleOption.pctChange}
        />
      )}

      {/* 3-tier contract selector — on-demand, live engine pick */}
      <div className="mt-2">
        <ContractEngine
          symbol={signal.symbol}
          direction={signal.direction}
          entry={signal.entry}
          stop={signal.stop}
          t1={signal.t1}
          t2={signal.t2}
          holdPeriodLabel={signal.holdPeriodLabel}
          conviction={signal.confidence}
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-800">
        {onPushTrade && (
          <button
            onClick={() => onPushTrade(signal.id)}
            className="text-xs px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded text-emerald-400 hover:bg-emerald-500/20"
          >
            🎯 Push to Trade Desk
          </button>
        )}
        <button
          onClick={async () => {
            const entered = prompt('Actual entry price you got? (or leave blank for signal entry)');
            const size = prompt('Position size? (# of contracts/shares)');
            const res = await fetch(`/api/trade-ideas/${signal.id}/mark-traded`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                actualEntryPrice: entered ? Number(entered) : undefined,
                positionSize: size ? Number(size) : undefined
              })
            });
            if (res.ok) alert(`✅ ${signal.symbol} marked as traded — will appear in /positions Heat Map`);
            else alert('Failed to mark as traded');
          }}
          className="text-xs px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded text-cyan-400 hover:bg-cyan-500/20"
        >
          ✓ Mark Traded
        </button>
        <Link href={`/t/${signal.symbol}`}>
          <button className="text-xs px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-700">
            View Chart →
          </button>
        </Link>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// FULL — Oracle Terminal-style (Screen 1 style)
// ═══════════════════════════════════════════════════════════════
function SignalCardFull({ signal, onClick, onPushTrade }: SignalCardProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* LEFT: Standard card */}
      <div className="lg:col-span-2">
        <SignalCardStandard signal={signal} onClick={onClick} onPushTrade={onPushTrade} />
      </div>

      {/* RIGHT: Sub-components rail */}
      <div className="space-y-4">
        {/* Confidence Index */}
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Confidence Index</div>
          <div className="flex items-center justify-center">
            <ConfidenceGauge
              value={signal.confidence}
              delta={signal.confidenceDelta}
              size="md"
              label={signal.status === 'T2_HIT' ? 'T2 HIT' : signal.status === 'T1_HIT' ? 'T1 HIT' : 'SETUP'}
            />
          </div>
        </div>

        {/* Signal Components */}
        {signal.signalComponents && (
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4">
            <SignalComponents components={signal.signalComponents} />
          </div>
        )}

        {/* Trade Geometry */}
        {signal.geometry && (
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4">
            <TradeGeometry stopRMultiple={signal.geometry.stopRMultiple} horizonUsedPct={signal.geometry.horizonUsedPct} />
          </div>
        )}

        {/* Direction Bias indicator */}
        <div className={`rounded-lg p-3 text-center font-bold border ${
          signal.direction === 'BULL' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
          signal.direction === 'BEAR' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
          'bg-zinc-500/10 border-zinc-500/30 text-zinc-400'
        }`}>
          ◆ {signal.direction} BIAS
        </div>

        {/* Trade Timeline */}
        {signal.targetDate && (
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-4">
            <TradeTimeline issuedAt={signal.issuedAt} targetDate={signal.targetDate} daysActive={signal.daysActive} />
          </div>
        )}
      </div>
    </div>
  );
}
