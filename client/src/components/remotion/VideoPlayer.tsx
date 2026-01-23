import { Player } from "@remotion/player";
import { TradeRecapComposition } from "./TradeRecapVideo";

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

interface VideoPlayerProps {
  trades: TradeData[];
  width?: number;
  height?: number;
}

export const TradeRecapPlayer = ({ 
  trades, 
  width = 1280, 
  height = 720 
}: VideoPlayerProps) => {
  // Calculate duration based on number of trades
  // Intro (2s) + Each trade (3s) + Summary (4s) + buffer
  const fps = 30;
  const durationInFrames = fps * (2 + trades.length * 3 + 4);
  
  return (
    <div className="rounded-lg overflow-hidden shadow-2xl">
      <Player
        component={TradeRecapComposition}
        inputProps={{ trades }}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={width}
        compositionHeight={height}
        style={{
          width: "100%",
          aspectRatio: `${width}/${height}`,
        }}
        controls
        autoPlay={false}
        loop={false}
      />
    </div>
  );
};

// Preview component with sample data for testing
export const TradeRecapPreview = () => {
  const sampleTrades: TradeData[] = [
    {
      symbol: "NVDA",
      direction: "CALL",
      entry: 2.50,
      exit: 4.80,
      profit: 230,
      profitPercent: 92,
      date: "2026-01-22",
      holdingPeriod: "2 days"
    },
    {
      symbol: "AMD",
      direction: "PUT",
      entry: 1.99,
      exit: 3.25,
      profit: 126,
      profitPercent: 63,
      date: "2026-01-21",
      holdingPeriod: "1 day"
    },
    {
      symbol: "TSLA",
      direction: "CALL",
      entry: 5.00,
      exit: 4.20,
      profit: -80,
      profitPercent: -16,
      date: "2026-01-20",
      holdingPeriod: "3 days"
    }
  ];
  
  return <TradeRecapPlayer trades={sampleTrades} />;
};

export default TradeRecapPlayer;
