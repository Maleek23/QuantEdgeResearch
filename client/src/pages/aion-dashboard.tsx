/**
 * AION Dashboard
 * ==============
 * Single-screen market intelligence: AI Forecast, Crash Detection,
 * Statistical Models, and Model Consensus.
 *
 * Sub-tabs: AION INDEX | RISK MONITOR | MONTE CARLO
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Infinity,
  Zap,
  ShieldAlert,
  Dice5,
  TrendingUp,
  TrendingDown,
  Brain,
  BarChart3,
  Activity,
  Gauge,
  RefreshCw,
} from "lucide-react";
import { QEPageShell, QEPageHeader } from "@/components/ui/qe-page-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AionData {
  symbol: string;
  tradeTicker: string;
  lastUpdated: string;
  currentPrice: number;
  aiForecast: { day3: number; day10: number; day20: number };
  crashDetection: {
    probability: number;
    action: string;
    exposure: number;
    vixLevel: number;
    regime: string;
  };
  statisticalModels: Array<{
    name: string;
    regime: string;
    expected: number;
    probUp: number;
  }>;
  modelConsensus: {
    bullish: number;
    bearish: number;
    total: number;
    verdict: string;
    signals: Array<{ label: string; bullish: boolean }>;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SYMBOLS = [
  { value: "SPX", label: "SPX (S&P 500)" },
  { value: "NDX", label: "NDX (Nasdaq 100)" },
  { value: "DJI", label: "DJI (Dow Jones)" },
  { value: "IWM", label: "IWM (Russell 2000)" },
  { value: "SPY", label: "SPY" },
  { value: "QQQ", label: "QQQ" },
  { value: "AAPL", label: "AAPL" },
  { value: "NVDA", label: "NVDA" },
  { value: "TSLA", label: "TSLA" },
  { value: "MSFT", label: "MSFT" },
];

const cardVariant = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" },
  }),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function probColor(p: number) {
  if (p >= 65) return "text-emerald-400";
  if (p >= 50) return "text-amber-400";
  return "text-red-400";
}

function probBarBg(p: number) {
  if (p >= 65) return "bg-gradient-to-r from-emerald-600 to-emerald-400";
  if (p >= 50) return "bg-gradient-to-r from-amber-600 to-amber-400";
  if (p >= 35) return "bg-gradient-to-r from-orange-600 to-orange-400";
  return "bg-gradient-to-r from-red-600 to-red-400";
}

function crashBorderColor(prob: number) {
  if (prob < 10) return "border-emerald-500/60";
  if (prob < 20) return "border-emerald-500/40";
  if (prob < 30) return "border-amber-500/50";
  if (prob < 45) return "border-orange-500/50";
  return "border-red-500/60";
}

function crashTextColor(prob: number) {
  if (prob < 10) return "text-emerald-400";
  if (prob < 20) return "text-emerald-300";
  if (prob < 30) return "text-amber-400";
  if (prob < 45) return "text-orange-400";
  return "text-red-400";
}

function regimeBadgeClass(regime: string) {
  const r = regime.toUpperCase();
  if (r.includes("CONSTRUCTIVE") || r.includes("RISK-ON"))
    return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (r.includes("BALANCED") || r.includes("NORMAL"))
    return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  if (r.includes("MAX DEFENSIVE"))
    return "bg-red-500/15 text-red-400 border-red-500/30";
  if (r.includes("DEFENSIVE"))
    return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-slate-500/15 text-slate-400 border-slate-500/30";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function AIForecastCard({ data }: { data: AionData["aiForecast"] }) {
  const rows = [
    { label: "3-Day", value: data.day3 },
    { label: "10-Day", value: data.day10 },
    { label: "20-Day", value: data.day20 },
  ];
  return (
    <DashCard index={0} icon={<Brain className="w-4 h-4" />} title="AI FORECAST" subtitle="Probability of upward move">
      <div className="space-y-4 mt-4">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-slate-400">{r.label}</span>
              <span className={cn("font-bold tabular-nums", probColor(r.value))}>{r.value}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                className={cn("h-full rounded-full", probBarBg(r.value))}
                initial={{ width: 0 }}
                animate={{ width: `${r.value}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mt-4 cursor-pointer hover:text-slate-400 transition-colors">
        Click for history
      </p>
    </DashCard>
  );
}

function CrashDetectionCard({ data }: { data: AionData["crashDetection"] }) {
  return (
    <DashCard index={1} icon={<ShieldAlert className="w-4 h-4" />} title="CRASH DETECTION" subtitle="20-day market downturn probability">
      <div className="flex flex-col items-center my-4">
        <div
          className={cn(
            "w-40 h-28 rounded-xl border-2 flex flex-col items-center justify-center",
            crashBorderColor(data.probability),
            "bg-gradient-to-b from-white/[0.02] to-transparent"
          )}
        >
          <span className={cn("text-4xl font-bold tabular-nums", crashTextColor(data.probability))}>
            {data.probability}%
          </span>
          <span className="text-[11px] text-slate-500 mt-1">20-Day Crash Prob</span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-400">Action</span>
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                data.exposure >= 75 ? "bg-emerald-500" : data.exposure >= 50 ? "bg-amber-500" : "bg-red-500"
              )}
            />
            <span className="text-white font-medium">{data.action}</span>
          </span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-400">Exposure</span>
          <span className="text-white font-bold tabular-nums">{data.exposure}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div
            className={cn(
              "h-full rounded-full",
              data.exposure >= 75
                ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                : data.exposure >= 50
                ? "bg-gradient-to-r from-amber-600 to-amber-400"
                : "bg-gradient-to-r from-red-600 to-red-400"
            )}
            initial={{ width: 0 }}
            animate={{ width: `${data.exposure}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </div>
      <p className="text-[11px] text-slate-500 mt-4 cursor-pointer hover:text-slate-400 transition-colors">
        Click for history
      </p>
    </DashCard>
  );
}

function StatisticalModelsCard({
  data,
}: {
  data: AionData["statisticalModels"];
}) {
  return (
    <DashCard index={2} icon={<BarChart3 className="w-4 h-4" />} title="STATISTICAL MODELS" subtitle="Non-ML baseline signals (10-30 day averages)">
      <div className="space-y-3 mt-4">
        {data.map((m) => (
          <div key={m.name} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">{m.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-bold px-2 py-0.5 border rounded-md whitespace-nowrap",
                  regimeBadgeClass(m.regime)
                )}
              >
                {m.regime}
              </Badge>
            </div>
            <div className="flex gap-4 text-xs text-slate-400">
              <span>
                Expected:{" "}
                <span className={m.expected >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {m.expected >= 0 ? "+" : ""}
                  {m.expected}%
                </span>
              </span>
              <span>
                Prob Up:{" "}
                <span className={probColor(m.probUp)}>
                  {m.probUp}%
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500 mt-4 cursor-pointer hover:text-slate-400 transition-colors">
        Click for history
      </p>
    </DashCard>
  );
}

function ModelConsensusCard({ data }: { data: AionData["modelConsensus"] }) {
  const bullishPct = data.total > 0 ? (data.bullish / data.total) * 100 : 50;
  return (
    <DashCard
      index={3}
      icon={<Gauge className="w-4 h-4" />}
      title="MODEL CONSENSUS"
      subtitle={`${data.total} models: bullish if prob > 50% (crash ≤ 15%)`}
    >
      <div className="flex items-center justify-center gap-8 my-6">
        <div className="text-center">
          <span className="text-5xl font-black tabular-nums text-cyan-400">{data.bullish}</span>
          <p className="text-xs font-bold text-cyan-400 mt-1 tracking-wider">BULLISH</p>
        </div>
        <div className="text-center">
          <span className="text-5xl font-black tabular-nums text-red-400">{data.bearish}</span>
          <p className="text-xs font-bold text-red-400 mt-1 tracking-wider">BEARISH</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-3 rounded-full bg-red-500/30 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400"
          initial={{ width: 0 }}
          animate={{ width: `${bullishPct}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>

      <div className="mt-4 text-center">
        <span
          className={cn(
            "text-lg font-black tracking-wider",
            data.verdict === "BULLISH"
              ? "text-cyan-400"
              : data.verdict === "BEARISH"
              ? "text-red-400"
              : "text-amber-400"
          )}
        >
          {data.verdict}
        </span>
      </div>
      <p className="text-[11px] text-slate-500 mt-2 cursor-pointer hover:text-slate-400 transition-colors text-center">
        Click for history
      </p>
    </DashCard>
  );
}

/** Reusable card wrapper */
function DashCard({
  children,
  index,
  icon,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  index: number;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <motion.div
      custom={index}
      variants={cardVariant}
      initial="hidden"
      animate="visible"
      className="rounded-xl border border-[#1a1a1a] bg-[#111]/80 backdrop-blur-sm p-5 flex flex-col hover:border-[#2a2a2a] transition-colors"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-cyan-400">{icon}</span>
        <h3 className="text-sm font-black tracking-wider text-white">{title}</h3>
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">{subtitle}</p>
      {children}
    </motion.div>
  );
}

// ─── Risk Monitor Tab (placeholder with VIX data) ───────────────────────────

function RiskMonitorTab({ data }: { data: AionData | null }) {
  if (!data) return null;
  const { crashDetection: cd, statisticalModels: models } = data;
  const riskItems = [
    { label: "VIX Level", value: cd.vixLevel.toFixed(1), color: cd.vixLevel > 25 ? "text-red-400" : cd.vixLevel > 18 ? "text-amber-400" : "text-emerald-400" },
    { label: "VIX Regime", value: cd.regime.replace(/_/g, " ").toUpperCase(), color: "text-slate-300" },
    { label: "Crash Probability", value: `${cd.probability}%`, color: crashTextColor(cd.probability) },
    { label: "Recommended Exposure", value: `${cd.exposure}%`, color: cd.exposure >= 75 ? "text-emerald-400" : cd.exposure >= 50 ? "text-amber-400" : "text-red-400" },
    { label: "Action", value: cd.action, color: "text-white" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
      {/* Risk Metrics Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-[#1a1a1a] bg-[#111]/80 p-5 col-span-1 md:col-span-2 lg:col-span-1"
      >
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white">Risk Metrics</h3>
        </div>
        <div className="space-y-3">
          {riskItems.map((item) => (
            <div key={item.label} className="flex justify-between items-center text-sm">
              <span className="text-slate-400">{item.label}</span>
              <span className={cn("font-bold", item.color)}>{item.value}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Signal Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-[#1a1a1a] bg-[#111]/80 p-5 col-span-1 md:col-span-2"
      >
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">All Signals Breakdown</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data.modelConsensus.signals.map((s) => (
            <div
              key={s.label}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]"
            >
              <span className="text-sm text-slate-300">{s.label}</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-bold border",
                  s.bullish
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-red-500/10 text-red-400 border-red-500/30"
                )}
              >
                {s.bullish ? "BULLISH" : "BEARISH"}
              </Badge>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Monte Carlo Tab (placeholder) ──────────────────────────────────────────

function MonteCarloTab() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 rounded-xl border border-[#1a1a1a] bg-[#111]/80 p-8 text-center"
    >
      <Dice5 className="w-12 h-12 text-purple-400 mx-auto mb-4 opacity-60" />
      <h3 className="text-lg font-bold text-white mb-2">Monte Carlo Simulation</h3>
      <p className="text-sm text-slate-400 max-w-md mx-auto">
        Run probabilistic simulations across thousands of market scenarios.
        Configure parameters and visualize outcome distributions.
      </p>
      <p className="text-xs text-slate-500 mt-4">Coming soon to AION Dashboard</p>
    </motion.div>
  );
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function AionSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-xl border border-[#1a1a1a] bg-[#111]/80 p-5 animate-pulse"
        >
          <div className="h-4 w-32 bg-white/[0.06] rounded mb-2" />
          <div className="h-3 w-48 bg-white/[0.04] rounded mb-6" />
          <div className="space-y-3">
            <div className="h-8 bg-white/[0.04] rounded" />
            <div className="h-8 bg-white/[0.04] rounded" />
            <div className="h-8 bg-white/[0.04] rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AionDashboard() {
  const [symbol, setSymbol] = useState("SPX");

  const { data, isLoading, isError, refetch, isFetching } = useQuery<AionData>({
    queryKey: ["/api/aion", symbol],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/aion/${encodeURIComponent(symbol)}`);
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const priceStr = data?.currentPrice
    ? `$${data.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "";

  return (
    <QEPageShell width="wide" padding="md">
      {/* ── Header ── */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Infinity className="w-10 h-10 text-cyan-400" strokeWidth={2.5} />
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            AION DASHBOARD
          </h1>
        </div>

        {/* Symbol Selector Pill */}
        <div className="flex items-center justify-center gap-3 mb-2">
          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger
              className="w-auto min-w-[180px] h-10 rounded-full bg-emerald-600 hover:bg-emerald-500 border-0 text-white font-bold text-base px-5 transition-colors focus:ring-emerald-400/40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1a1a1a] border-[#333]">
              {SYMBOLS.map((s) => (
                <SelectItem
                  key={s.value}
                  value={s.value}
                  className="text-white hover:bg-white/10 focus:bg-white/10"
                >
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-slate-400 hover:text-white"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          </Button>
        </div>

        {/* Last Updated + Price */}
        {data && (
          <p className="text-xs text-slate-500">
            Last updated: {formatTime(data.lastUpdated)}
            {priceStr && <span className="ml-2 text-slate-400">{priceStr}</span>}
          </p>
        )}
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="index" className="w-full">
        <div className="flex justify-center mb-4">
          <TabsList className="bg-[#111] border border-[#1a1a1a] rounded-full px-1 py-1">
            <TabsTrigger
              value="index"
              className="rounded-full px-5 py-1.5 text-xs font-bold tracking-wider data-[state=active]:bg-cyan-600/20 data-[state=active]:text-cyan-400"
            >
              <Zap className="w-3.5 h-3.5 mr-1.5" />
              AION INDEX
            </TabsTrigger>
            <TabsTrigger
              value="risk"
              className="rounded-full px-5 py-1.5 text-xs font-bold tracking-wider data-[state=active]:bg-amber-600/20 data-[state=active]:text-amber-400"
            >
              <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
              RISK MONITOR
            </TabsTrigger>
            <TabsTrigger
              value="montecarlo"
              className="rounded-full px-5 py-1.5 text-xs font-bold tracking-wider data-[state=active]:bg-purple-600/20 data-[state=active]:text-purple-400"
            >
              <Dice5 className="w-3.5 h-3.5 mr-1.5" />
              MONTE CARLO
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── AION INDEX TAB ── */}
        <TabsContent value="index">
          {isLoading ? (
            <AionSkeleton />
          ) : isError ? (
            <div className="text-center py-16">
              <p className="text-red-400 mb-2">Failed to load AION data</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : data ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <AIForecastCard data={data.aiForecast} />
              <CrashDetectionCard data={data.crashDetection} />
              <StatisticalModelsCard data={data.statisticalModels} />
              <ModelConsensusCard data={data.modelConsensus} />
            </div>
          ) : null}
        </TabsContent>

        {/* ── RISK MONITOR TAB ── */}
        <TabsContent value="risk">
          {isLoading ? (
            <AionSkeleton />
          ) : (
            <RiskMonitorTab data={data ?? null} />
          )}
        </TabsContent>

        {/* ── MONTE CARLO TAB ── */}
        <TabsContent value="montecarlo">
          <MonteCarloTab />
        </TabsContent>
      </Tabs>
    </QEPageShell>
  );
}
