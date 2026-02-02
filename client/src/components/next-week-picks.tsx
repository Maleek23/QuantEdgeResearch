import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Calendar,
  TrendingUp,
  Target,
  Zap,
  Flame,
  Clock,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  AlertTriangle,
  BarChart3,
  Rocket,
  Crown,
} from "lucide-react";
import { cn, safeToFixed } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface WeeklyPick {
  symbol: string;
  optionType: "call" | "put";
  strike: number;
  expiration: string;
  expirationFormatted: string;
  suggestedExitDate: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  targetMultiplier: number;
  dteCategory: "0DTE" | "1-2DTE" | "3-7DTE" | "swing";
  playType: "lotto" | "day_trade" | "swing";
  confidence: number;
  catalyst: string;
  delta: number;
  volume: number;
  dte: number;
  optimalHoldDays: number;
  riskAnalysis: string;
}

interface WeeklyPicksResponse {
  success: boolean;
  weekRange: string;
  total: number;
  byType: {
    lottos: WeeklyPick[];
    dayTrades: WeeklyPick[];
    swings: WeeklyPick[];
  };
  picks: WeeklyPick[];
}

const playTypeConfig = {
  lotto: {
    icon: Flame,
    label: "LOTTO",
    color: "text-orange-400",
    bgColor: "bg-orange-500/20",
    borderColor: "border-orange-500/50",
    glowColor: "shadow-orange-500/30",
    description: "Far OTM, 4x-15x targets",
  },
  day_trade: {
    icon: Zap,
    label: "DAY TRADE",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/20",
    borderColor: "border-cyan-500/50",
    glowColor: "shadow-cyan-500/30",
    description: "Quick scalps, 2x targets",
  },
  swing: {
    icon: TrendingUp,
    label: "SWING",
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
    borderColor: "border-purple-500/50",
    glowColor: "shadow-purple-500/30",
    description: "Hold 3-14 days, 1.5x targets",
  },
};

function PickCard({ pick, index }: { pick: WeeklyPick; index: number }) {
  const config = playTypeConfig[pick.playType];
  const Icon = config.icon;
  const isCall = pick.optionType === "call";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <div
        className={cn(
          "relative p-4 rounded-lg border backdrop-blur-sm",
          "bg-slate-900/60 hover:bg-slate-800/60 transition-all duration-300",
          config.borderColor,
          "hover:shadow-lg",
          config.glowColor
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center",
                config.bgColor
              )}
            >
              <Icon className={cn("w-5 h-5", config.color)} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-lg font-mono">
                  {pick.symbol}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs font-bold",
                    isCall
                      ? "text-green-400 border-green-500/50"
                      : "text-red-400 border-red-500/50"
                  )}
                >
                  {isCall ? (
                    <ArrowUpRight className="w-3 h-3 mr-1" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3 mr-1" />
                  )}
                  {pick.optionType.toUpperCase()}
                </Badge>
              </div>
              <div className="text-sm text-slate-400 font-mono">
                ${pick.strike} | {pick.expirationFormatted} ({pick.dte}DTE)
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-500 mb-1">TARGET</div>
            <div className="text-lg font-bold text-green-400 font-mono">
              {safeToFixed(pick.targetMultiplier, 1)}x
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
          <div className="bg-slate-800/50 rounded-md p-2 text-center">
            <div className="text-xs text-slate-500 mb-1">ENTRY</div>
            <div className="font-mono text-white">
              ${safeToFixed(pick.entryPrice, 2)}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-md p-2 text-center">
            <div className="text-xs text-slate-500 mb-1">TARGET</div>
            <div className="font-mono text-green-400">
              ${safeToFixed(pick.targetPrice, 2)}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-md p-2 text-center">
            <div className="text-xs text-slate-500 mb-1">STOP</div>
            <div className="font-mono text-red-400">
              ${safeToFixed(pick.stopLoss, 2)}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              <Target className="w-3 h-3 mr-1" />
              {pick.confidence}%
            </Badge>
            <Badge variant="secondary" className="text-xs">
              <Clock className="w-3 h-3 mr-1" />
              Exit: {pick.suggestedExitDate}
            </Badge>
          </div>
          <span
            className={cn(
              "text-xs font-mono px-2 py-1 rounded",
              config.bgColor,
              config.color
            )}
          >
            {config.label}
          </span>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-700/50">
          <p className="text-xs text-slate-400 italic">{pick.catalyst}</p>
        </div>
      </div>
    </motion.div>
  );
}

function PicksGrid({ picks }: { picks: WeeklyPick[] }) {
  if (picks.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No picks available for this category</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <AnimatePresence mode="popLayout">
        {picks.map((pick, index) => (
          <PickCard
            key={`${pick.symbol}-${pick.strike}-${pick.optionType}`}
            pick={pick}
            index={index}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

export function NextWeekPicks() {
  const {
    data,
    isLoading,
    refetch,
    isFetching,
  } = useQuery<WeeklyPicksResponse>({
    queryKey: ["/api/next-week-picks"],
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) {
    return (
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <Skeleton className="h-8 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const byType = data?.byType || { lottos: [], dayTrades: [], swings: [] };
  const allPicks = data?.picks || [];

  return (
    <Card className="bg-slate-900/50 border-slate-700/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
            <Crown className="w-6 h-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <span className="font-mono">NEXT WEEK PICKS</span>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                {data?.total || 0} plays
              </Badge>
            </CardTitle>
            <p className="text-sm text-slate-400 font-mono mt-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              {data?.weekRange || "Loading..."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-slate-600"
            data-testid="button-refresh-picks"
          >
            <RefreshCw
              className={cn("w-4 h-4 mr-2", isFetching && "animate-spin")}
            />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-200/80">
            <span className="font-semibold">Educational Research Only</span> -
            These picks are generated by our 6-engine analysis system for
            research purposes. Always do your own due diligence and manage risk.
          </div>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="w-full grid grid-cols-4 mb-6 bg-slate-800/50">
            <TabsTrigger
              value="all"
              className="data-[state=active]:bg-slate-700"
              data-testid="tab-all-picks"
            >
              <Rocket className="w-4 h-4 mr-2" />
              All ({allPicks.length})
            </TabsTrigger>
            <TabsTrigger
              value="lottos"
              className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400"
              data-testid="tab-lottos"
            >
              <Flame className="w-4 h-4 mr-2" />
              Lottos ({byType.lottos.length})
            </TabsTrigger>
            <TabsTrigger
              value="day"
              className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400"
              data-testid="tab-day-trades"
            >
              <Zap className="w-4 h-4 mr-2" />
              Day ({byType.dayTrades.length})
            </TabsTrigger>
            <TabsTrigger
              value="swing"
              className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-400"
              data-testid="tab-swings"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Swing ({byType.swings.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <PicksGrid picks={allPicks} />
          </TabsContent>
          <TabsContent value="lottos">
            <PicksGrid picks={byType.lottos} />
          </TabsContent>
          <TabsContent value="day">
            <PicksGrid picks={byType.dayTrades} />
          </TabsContent>
          <TabsContent value="swing">
            <PicksGrid picks={byType.swings} />
          </TabsContent>
        </Tabs>

        <div className="mt-6 pt-4 border-t border-slate-700/50 grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-slate-800/30 rounded-lg">
            <div className="text-2xl font-bold font-mono text-orange-400">
              {byType.lottos.length}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              <Flame className="w-3 h-3 inline mr-1" />
              Lotto Plays
            </div>
          </div>
          <div className="p-3 bg-slate-800/30 rounded-lg">
            <div className="text-2xl font-bold font-mono text-cyan-400">
              {byType.dayTrades.length}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              <Zap className="w-3 h-3 inline mr-1" />
              Day Trades
            </div>
          </div>
          <div className="p-3 bg-slate-800/30 rounded-lg">
            <div className="text-2xl font-bold font-mono text-purple-400">
              {byType.swings.length}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              <TrendingUp className="w-3 h-3 inline mr-1" />
              Swing Trades
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default NextWeekPicks;
