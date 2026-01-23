import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

interface TradeData {
  symbol: string;
  direction: "CALL" | "PUT" | "LONG" | "SHORT";
  entry: number;
  exit: number;
  profit: number;
  profitPercent: number;
  date: string;
  holdingPeriod: string;
}

// Animated number counter
const AnimatedCounter = ({ value, suffix = "", prefix = "", decimals = 2 }: { 
  value: number; 
  suffix?: string;
  prefix?: string;
  decimals?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const animatedValue = interpolate(
    frame,
    [0, fps * 1.5],
    [0, value],
    { extrapolateRight: "clamp" }
  );
  
  return (
    <span>
      {prefix}{animatedValue.toFixed(decimals)}{suffix}
    </span>
  );
};

// Main trade recap video composition
export const TradeRecapComposition = ({ trades }: { trades: TradeData[] }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  
  // Calculate total P&L
  const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);
  const winCount = trades.filter(t => t.profit > 0).length;
  const winRate = (winCount / trades.length) * 100;
  
  return (
    <AbsoluteFill style={{ backgroundColor: "#0f172a" }}>
      {/* Intro sequence */}
      <Sequence from={0} durationInFrames={fps * 2}>
        <IntroSlide />
      </Sequence>
      
      {/* Individual trade cards */}
      {trades.map((trade, index) => (
        <Sequence 
          key={trade.symbol + index}
          from={fps * 2 + index * fps * 3} 
          durationInFrames={fps * 3}
        >
          <TradeCard trade={trade} index={index} />
        </Sequence>
      ))}
      
      {/* Summary sequence */}
      <Sequence from={fps * 2 + trades.length * fps * 3} durationInFrames={fps * 4}>
        <SummarySlide 
          totalProfit={totalProfit} 
          winRate={winRate} 
          tradeCount={trades.length}
        />
      </Sequence>
    </AbsoluteFill>
  );
};

// Intro slide
const IntroSlide = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const titleOpacity = interpolate(frame, [0, fps * 0.5], [0, 1]);
  const titleY = interpolate(frame, [0, fps * 0.5], [30, 0], { extrapolateRight: "clamp" });
  
  return (
    <AbsoluteFill style={{ 
      justifyContent: "center", 
      alignItems: "center",
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)"
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          fontSize: 72,
          fontWeight: 800,
          color: "#22d3ee",
          textShadow: "0 0 40px rgba(34, 211, 238, 0.5)"
        }}>
          TRADE RECAP
        </div>
        <div style={{
          opacity: interpolate(frame, [fps * 0.3, fps * 0.8], [0, 1]),
          fontSize: 28,
          color: "#94a3b8",
          marginTop: 16
        }}>
          Quant Edge Labs
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Individual trade card
const TradeCard = ({ trade, index }: { trade: TradeData; index: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const isProfit = trade.profit > 0;
  const accentColor = isProfit ? "#22c55e" : "#ef4444";
  
  const cardScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100 }
  });
  
  const contentOpacity = interpolate(frame, [fps * 0.3, fps * 0.6], [0, 1]);
  
  return (
    <AbsoluteFill style={{ 
      justifyContent: "center", 
      alignItems: "center",
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)"
    }}>
      <div style={{
        transform: `scale(${cardScale})`,
        background: "rgba(30, 41, 59, 0.9)",
        borderRadius: 24,
        padding: 48,
        border: `2px solid ${accentColor}40`,
        boxShadow: `0 0 60px ${accentColor}20`,
        width: 600,
        textAlign: "center"
      }}>
        {/* Symbol & Direction */}
        <div style={{ marginBottom: 24 }}>
          <span style={{
            fontSize: 56,
            fontWeight: 800,
            color: "white"
          }}>
            {trade.symbol}
          </span>
          <span style={{
            marginLeft: 16,
            fontSize: 28,
            fontWeight: 600,
            color: trade.direction.includes("CALL") || trade.direction === "LONG" ? "#22c55e" : "#ef4444",
            background: (trade.direction.includes("CALL") || trade.direction === "LONG") ? "#22c55e20" : "#ef444420",
            padding: "8px 16px",
            borderRadius: 8
          }}>
            {trade.direction}
          </span>
        </div>
        
        {/* Entry/Exit */}
        <div style={{ opacity: contentOpacity, marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ color: "#64748b", fontSize: 14 }}>ENTRY</div>
              <div style={{ color: "white", fontSize: 32, fontWeight: 600 }}>${trade.entry.toFixed(2)}</div>
            </div>
            <div style={{ color: "#64748b", fontSize: 32, alignSelf: "center" }}>→</div>
            <div>
              <div style={{ color: "#64748b", fontSize: 14 }}>EXIT</div>
              <div style={{ color: "white", fontSize: 32, fontWeight: 600 }}>${trade.exit.toFixed(2)}</div>
            </div>
          </div>
        </div>
        
        {/* P&L */}
        <div style={{
          opacity: contentOpacity,
          fontSize: 48,
          fontWeight: 800,
          color: accentColor
        }}>
          {isProfit ? "+" : ""}<AnimatedCounter value={trade.profitPercent} suffix="%" />
        </div>
        
        <div style={{
          opacity: contentOpacity,
          fontSize: 24,
          color: accentColor,
          marginTop: 8
        }}>
          {isProfit ? "+" : ""}<AnimatedCounter value={trade.profit} prefix="$" />
        </div>
        
        {/* Holding period */}
        <div style={{
          opacity: contentOpacity,
          marginTop: 24,
          fontSize: 16,
          color: "#64748b"
        }}>
          Held for {trade.holdingPeriod}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Summary slide
const SummarySlide = ({ totalProfit, winRate, tradeCount }: { 
  totalProfit: number; 
  winRate: number;
  tradeCount: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const isProfit = totalProfit > 0;
  
  return (
    <AbsoluteFill style={{ 
      justifyContent: "center", 
      alignItems: "center",
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)"
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontSize: 36,
          color: "#94a3b8",
          marginBottom: 16,
          opacity: interpolate(frame, [0, fps * 0.3], [0, 1])
        }}>
          TOTAL P&L
        </div>
        
        <div style={{
          fontSize: 96,
          fontWeight: 800,
          color: isProfit ? "#22c55e" : "#ef4444",
          textShadow: `0 0 60px ${isProfit ? "#22c55e" : "#ef4444"}40`,
          opacity: interpolate(frame, [fps * 0.2, fps * 0.6], [0, 1])
        }}>
          {isProfit ? "+" : ""}<AnimatedCounter value={totalProfit} prefix="$" />
        </div>
        
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: 48,
          marginTop: 48,
          opacity: interpolate(frame, [fps * 0.5, fps], [0, 1])
        }}>
          <div>
            <div style={{ color: "#64748b", fontSize: 16 }}>WIN RATE</div>
            <div style={{ color: "#22d3ee", fontSize: 36, fontWeight: 700 }}>
              <AnimatedCounter value={winRate} suffix="%" decimals={1} />
            </div>
          </div>
          <div>
            <div style={{ color: "#64748b", fontSize: 16 }}>TRADES</div>
            <div style={{ color: "#22d3ee", fontSize: 36, fontWeight: 700 }}>
              {tradeCount}
            </div>
          </div>
        </div>
        
        <div style={{
          marginTop: 48,
          fontSize: 20,
          color: "#475569",
          opacity: interpolate(frame, [fps * 1, fps * 1.5], [0, 1])
        }}>
          Powered by Quant Edge Labs
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default TradeRecapComposition;
