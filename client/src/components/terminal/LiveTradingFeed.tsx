import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useRef, useState, useEffect, memo } from "react";
import { TrendingUp, TrendingDown, Zap, Target, Activity } from "lucide-react";
import type { TradeIdea } from "@shared/schema";

interface LiveTradingFeedProps {
  maxItems?: number;
  updateInterval?: number;
  className?: string;
}

interface FeedItem {
  id: string;
  timestamp: string;
  type: "SCAN" | "SIGNAL" | "ENTRY" | "EXIT" | "ALERT";
  symbol: string;
  message: string;
  data?: {
    price?: number;
    confidence?: number;
    direction?: "bullish" | "bearish";
    engine?: string;
  };
}

// Memoized feed item component to prevent unnecessary re-renders
const FeedItemRow = memo(({ item, index, maxItems }: { 
  item: FeedItem; 
  index: number; 
  maxItems: number;
}) => {
  const configs = {
    SCAN: { color: "text-cyan-400", icon: Activity, badge: "SCAN" },
    SIGNAL: { color: "text-purple-400", icon: Zap, badge: "SIG" },
    ENTRY: { color: "text-green-400", icon: TrendingUp, badge: "ENTRY" },
    EXIT: { color: "text-amber-400", icon: Target, badge: "EXIT" },
    ALERT: { color: "text-red-400", icon: TrendingDown, badge: "ALERT" }
  };
  
  const config = configs[item.type];
  const Icon = config.icon;

  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, x: -15, height: 0 }}
      animate={{ opacity: 1, x: 0, height: "auto" }}
      exit={{ opacity: 0, x: 15, height: 0 }}
      transition={{ duration: 0.25 }}
      className="flex items-start gap-2 text-slate-400 hover:text-slate-300 transition-colors group will-change-transform"
      style={{
        opacity: Math.max(0.3, 1 - (index / maxItems) * 0.5), // Fade older items
        transform: "translate3d(0, 0, 0)"
      }}
    >
      {/* Timestamp */}
      <span className="text-slate-600 min-w-[70px] text-[10px] flex-shrink-0">
        {item.timestamp}
      </span>

      {/* Type badge */}
      <span
        className={`${config.color} min-w-[45px] font-bold text-[10px] flex items-center gap-1 flex-shrink-0`}
      >
        <Icon className="w-3 h-3" />
        {config.badge}
      </span>

      {/* Symbol */}
      <span className="text-cyan-400 min-w-[50px] font-bold flex-shrink-0">
        {item.symbol}
      </span>

      {/* Message */}
      <span className="flex-1 truncate group-hover:text-clip text-[11px]">
        {item.message}
      </span>

      {/* Data */}
      {item.data && (
        <div className="flex items-center gap-2 text-[10px] flex-shrink-0">
          {item.data.price && (
            <span className="text-slate-500">
              ${item.data.price.toFixed(2)}
            </span>
          )}
          {item.data.confidence && (
            <span
              className={
                item.data.confidence >= 80
                  ? "text-green-400"
                  : item.data.confidence >= 60
                  ? "text-amber-400"
                  : "text-slate-500"
              }
            >
              {item.data.confidence.toFixed(0)}%
            </span>
          )}
          {item.data.direction && (
            <span
              className={
                item.data.direction === "bullish"
                  ? "text-green-400"
                  : "text-red-400"
              }
            >
              {item.data.direction === "bullish" ? "↑" : "↓"}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
});

FeedItemRow.displayName = "FeedItemRow";

// Demo data for landing page (when not authenticated) - defined outside component
const DEMO_FEED_ITEMS: FeedItem[] = [
  { id: "demo-1", timestamp: "13:45:23", type: "SIGNAL", symbol: "NVDA", message: "QUANT detected bullish setup", data: { price: 142.50, confidence: 87, direction: "bullish", engine: "QUANT" } },
  { id: "demo-2", timestamp: "13:45:18", type: "SCAN", symbol: "TSLA", message: "FLOW detected unusual options activity", data: { price: 385.20, confidence: 92, direction: "bullish", engine: "FLOW" } },
  { id: "demo-3", timestamp: "13:45:12", type: "ENTRY", symbol: "AMD", message: "ML predicted breakout pattern", data: { price: 118.75, confidence: 79, direction: "bullish", engine: "ML" } },
  { id: "demo-4", timestamp: "13:45:05", type: "ALERT", symbol: "SPY", message: "AI analyzing market conditions", data: { confidence: 85, engine: "AI" } },
  { id: "demo-5", timestamp: "13:44:58", type: "SIGNAL", symbol: "AAPL", message: "SENT detected positive sentiment shift", data: { price: 225.30, confidence: 74, direction: "bullish", engine: "SENT" } },
];

export const LiveTradingFeed = ({
  maxItems = 8,
  updateInterval = 3000,
  className = ""
}: LiveTradingFeedProps) => {
  const [feedItems, setFeedItems] = useState<FeedItem[]>(DEMO_FEED_ITEMS);
  const updateCounterRef = useRef(0);

  // Fetch recent trade ideas
  const { data: tradeIdeas, error } = useQuery({
    queryKey: ["/api/trade-ideas"],
    refetchInterval: updateInterval,
    retry: false // Don't retry on 401
  });

  useEffect(() => {
    // If API fails (401 unauthorized), use demo data for landing page
    if (error && !tradeIdeas) {
      setFeedItems(DEMO_FEED_ITEMS);
      return;
    }

    if (!tradeIdeas) return;

    // Convert trade ideas to feed items
    const recentIdeas = (tradeIdeas as TradeIdea[])
      .filter((idea) => idea.outcomeStatus === "open")
      .slice(0, 5)
      .map((idea): FeedItem => {
        const isBullish =
          idea.assetType === "option"
            ? idea.optionType === "call"
            : idea.entryPrice && idea.targetPrice
            ? idea.targetPrice > idea.entryPrice
            : true;

        const engines = {
          ml: "ML",
          ai: "AI",
          quant: "QUANT",
          flow: "FLOW",
          lotto: "LOTTO",
          sentiment: "SENT"
        };

        const engine = engines[idea.source as keyof typeof engines] || idea.source.toUpperCase();

        return {
          id: idea.id,
          timestamp: new Date(idea.timestamp).toLocaleTimeString(),
          type: "SIGNAL",
          symbol: idea.symbol,
          message: `${engine} detected ${isBullish ? "bullish" : "bearish"} setup`,
          data: {
            price: idea.entryPrice || undefined,
            confidence: idea.confidenceScore || undefined,
            direction: isBullish ? "bullish" : "bearish",
            engine
          }
        };
      });

    setFeedItems((prev) => {
      const combined = [...recentIdeas, ...prev];
      const unique = Array.from(
        new Map(combined.map((item) => [item.id, item])).values()
      );
      return unique.slice(0, maxItems);
    });
  }, [tradeIdeas, error, maxItems]);

  // Add synthetic scan events for demonstration using RAF
  useEffect(() => {
    let animationId: ReturnType<typeof requestAnimationFrame>;
    
    const addScanEvents = () => {
      updateCounterRef.current++;
      
      // Add new scan events every 3 seconds (~180 frames at 60fps)
      if (updateCounterRef.current % 180 === 0) {
        const symbols = ["NVDA", "AMD", "TSLA", "AAPL", "META", "SPY", "QQQ"];
        const types: FeedItem["type"][] = ["SCAN", "ALERT"];
        const engines = ["ML", "QUANT", "FLOW", "AI"];

        const newItem: FeedItem = {
          id: `scan-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          type: types[Math.floor(Math.random() * types.length)],
          symbol: symbols[Math.floor(Math.random() * symbols.length)],
          message: `${engines[Math.floor(Math.random() * engines.length)]} scanner active`,
          data: {
            confidence: 60 + Math.random() * 35
          }
        };

        setFeedItems((prev) => [newItem, ...prev].slice(0, maxItems));
      }
      
      animationId = requestAnimationFrame(addScanEvents);
    };

    animationId = requestAnimationFrame(addScanEvents);
    return () => cancelAnimationFrame(animationId);
  }, [maxItems]);

  return (
    <div className={`font-mono text-xs space-y-1 ${className}`}>
      <AnimatePresence mode="popLayout">
        {feedItems.map((item, index) => (
          <FeedItemRow 
            key={item.id} 
            item={item} 
            index={index} 
            maxItems={maxItems}
          />
        ))}
      </AnimatePresence>

      {/* Activity indicator */}
      <motion.div
        className="flex items-center gap-2 text-[10px] text-slate-600 mt-3 pt-2 border-t border-slate-800/50"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
        <span>Live feed • {feedItems.length} events</span>
      </motion.div>
    </div>
  );
};

export default LiveTradingFeed;
