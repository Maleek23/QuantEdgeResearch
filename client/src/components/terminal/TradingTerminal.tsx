import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  TerminalWindow, 
  CommandPrompt, 
  FileTree, 
  TerminalProgress, 
  TerminalStats,
  DataStream,
  SystemStatus,
  TypewriterText
} from "./TerminalWindow";
import { Activity, Cpu, Zap, TrendingUp, Shield } from "lucide-react";

// Pre-built trading terminal dashboard
export const TradingTerminalDashboard = () => {
  const [bootSequence, setBootSequence] = useState(0);
  
  useEffect(() => {
    const timer = setInterval(() => {
      setBootSequence(prev => prev < 5 ? prev + 1 : prev);
    }, 800);
    return () => clearInterval(timer);
  }, []);
  
  const tradingFiles = [
    {
      name: "strategies/",
      type: "folder" as const,
      children: [
        { name: "rsi2_mean_reversion.ts", type: "file" as const, status: "success" as const, size: "4.2kb" },
        { name: "vwap_institutional.ts", type: "file" as const, status: "success" as const, size: "3.8kb" },
        { name: "volume_spike.ts", type: "file" as const, status: "pending" as const, size: "2.1kb" },
        { name: "momentum_breakout.ts", type: "file" as const, status: "success" as const, size: "5.6kb" },
      ]
    },
    {
      name: "engines/",
      type: "folder" as const,
      children: [
        { name: "ml_intelligence.ts", type: "file" as const, status: "success" as const, size: "12kb" },
        { name: "quant_signals.ts", type: "file" as const, status: "success" as const, size: "8.4kb" },
        { name: "sentiment_scanner.ts", type: "file" as const, status: "success" as const, size: "6.2kb" },
        { name: "flow_detector.ts", type: "file" as const, status: "warning" as const, size: "7.1kb" },
      ]
    },
    {
      name: "config.json",
      type: "file" as const,
      status: "success" as const,
      size: "1.2kb"
    }
  ];
  
  const systemStats = [
    { label: "Win Rate", value: "67.4%", trend: "up" as const },
    { label: "Total P&L", value: "$2,847", trend: "up" as const },
    { label: "Active Positions", value: "3", trend: "neutral" as const },
    { label: "Pending Signals", value: "12", trend: "up" as const },
    { label: "Risk Exposure", value: "24%", trend: "down" as const },
  ];
  
  const systems = [
    { name: "ML Engine", status: "online" as const },
    { name: "Quant Scanner", status: "online" as const },
    { name: "Flow Detector", status: "online" as const },
    { name: "Sentiment AI", status: "online" as const },
    { name: "Risk Manager", status: "online" as const },
  ];
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Boot sequence terminal */}
      <TerminalWindow title="quant-edge-init.sh" variant="success">
        <div className="space-y-2 text-green-400">
          {bootSequence >= 1 && (
            <CommandPrompt 
              command="./init --engines=all"
              output="Initializing 6-engine analysis system..."
              status="success"
            />
          )}
          {bootSequence >= 2 && (
            <CommandPrompt 
              command="load strategies/*"
              output="Loaded 4 trading strategies"
              status="success"
            />
          )}
          {bootSequence >= 3 && (
            <CommandPrompt 
              command="connect --market-data"
              output="Connected to real-time feeds"
              status="success"
            />
          )}
          {bootSequence >= 4 && (
            <CommandPrompt 
              command="scan --mode=aggressive"
              output="Scanning 500+ symbols..."
              status="pending"
            />
          )}
          {bootSequence >= 5 && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <TypewriterText 
                text="SYSTEM READY - Awaiting trade signals..." 
                className="text-cyan-400"
              />
            </div>
          )}
        </div>
      </TerminalWindow>
      
      {/* Strategy files */}
      <TerminalWindow title="strategies" variant="default">
        <div className="text-slate-400 mb-3">Trading Strategy Files:</div>
        <FileTree nodes={tradingFiles} />
      </TerminalWindow>
      
      {/* Performance stats */}
      <TerminalWindow title="performance-metrics" variant="success">
        <div className="flex items-center gap-2 mb-4 text-cyan-400">
          <Activity className="w-4 h-4" />
          <span>LIVE PERFORMANCE</span>
        </div>
        <TerminalStats stats={systemStats} />
        <div className="mt-4 pt-4 border-t border-slate-800">
          <TerminalProgress 
            value={67} 
            label="Portfolio Health" 
            variant="green"
          />
        </div>
      </TerminalWindow>
      
      {/* System status */}
      <TerminalWindow title="system-status" variant="default">
        <div className="flex items-center gap-2 mb-4 text-cyan-400">
          <Cpu className="w-4 h-4" />
          <span>ENGINE STATUS</span>
        </div>
        <SystemStatus systems={systems} />
      </TerminalWindow>
      
      {/* Live data stream */}
      <TerminalWindow title="market-feed" className="lg:col-span-2" variant="default">
        <div className="flex items-center gap-2 mb-3 text-cyan-400">
          <Zap className="w-4 h-4" />
          <span>LIVE MARKET FEED</span>
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-green-500 ml-auto"
          />
        </div>
        <DataStream lines={8} speed={150} />
      </TerminalWindow>
    </div>
  );
};

// Compact trade signal terminal
export const TradeSignalTerminal = ({ 
  symbol,
  direction,
  confidence,
  entry,
  target,
  stopLoss,
  source
}: {
  symbol: string;
  direction: "CALL" | "PUT" | "LONG" | "SHORT";
  confidence: number;
  entry: number;
  target: number;
  stopLoss: number;
  source: string;
}) => {
  const isLong = direction === "CALL" || direction === "LONG";
  
  return (
    <TerminalWindow 
      title={`signal-${symbol.toLowerCase()}`} 
      variant={isLong ? "success" : "danger"}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold text-white">{symbol}</span>
          <span className={`px-2 py-1 rounded text-sm font-mono ${
            isLong ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
          }`}>
            {direction}
          </span>
        </div>
        
        <TerminalProgress 
          value={confidence} 
          label="Confidence" 
          variant={confidence >= 70 ? "green" : confidence >= 50 ? "amber" : "red"}
        />
        
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-slate-500">ENTRY</div>
            <div className="text-cyan-400 font-mono">${entry.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-slate-500">TARGET</div>
            <div className="text-green-400 font-mono">${target.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-slate-500">STOP</div>
            <div className="text-red-400 font-mono">${stopLoss.toFixed(2)}</div>
          </div>
        </div>
        
        <div className="text-xs text-slate-600 pt-2 border-t border-slate-800">
          Source: {source}
        </div>
      </div>
    </TerminalWindow>
  );
};

// Mini terminal badge for status
export const TerminalBadge = ({ 
  label, 
  value, 
  status = "default" 
}: { 
  label: string; 
  value: string | number; 
  status?: "success" | "warning" | "danger" | "default";
}) => {
  const colors = {
    success: "border-green-500/30 text-green-400",
    warning: "border-amber-500/30 text-amber-400",
    danger: "border-red-500/30 text-red-400",
    default: "border-cyan-500/30 text-cyan-400"
  };
  
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded bg-slate-950 border ${colors[status]} font-mono text-sm`}>
      <span className="text-slate-500">{label}:</span>
      <span>{value}</span>
    </div>
  );
};

export default TradingTerminalDashboard;
