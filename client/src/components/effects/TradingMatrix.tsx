import { motion } from "framer-motion";
import { useEffect, useState, useRef, useCallback } from "react";
import { safeToFixed } from "@/lib/utils";

// Trading-specific characters for the matrix effect
const TRADING_CHARS = [
  // Stock symbols
  "NVDA", "AMD", "TSLA", "AAPL", "META", "MSFT", "GOOG", "AMZN",
  "SPY", "QQQ", "IWM", "DIA",
  // Price indicators
  "$", "↑", "↓", "△", "▽", "⚡", "●", "○",
  // Numbers
  ..."0123456789".split(""),
  // Greek letters (for options)
  ..."ΔΘΓΦΨΩαβγδεζηθ".split(""),
  // Technical indicators
  "█", "▓", "▒", "░", "▀", "▄"
];

interface Column {
  id: number;
  x: number;
  speed: number;
  chars: string[];
  offset: number;
  isPriceColumn: boolean;
}

const generateColumn = (id: number, totalColumns: number): Column => {
  const charCount = 15 + Math.floor(Math.random() * 10);
  const isPriceColumn = Math.random() > 0.7; // 30% chance of being a price column

  return {
    id,
    x: (id / totalColumns) * 100,
    speed: 0.5 + Math.random() * 1.5,
    offset: Math.random() * 100,
    isPriceColumn,
    chars: Array.from({ length: charCount }, () =>
      isPriceColumn && Math.random() > 0.6
        ? ["$", safeToFixed(100 + Math.random() * 500, 2)][Math.floor(Math.random() * 2)]
        : TRADING_CHARS[Math.floor(Math.random() * TRADING_CHARS.length)]
    )
  };
};

interface TradingMatrixProps {
  density?: "low" | "medium" | "high";
  opacity?: number;
  className?: string;
  speed?: number;
}

export const TradingMatrix = ({
  density = "medium",
  opacity = 0.15,
  className = "",
  speed = 1
}: TradingMatrixProps) => {
  const columnCounts = {
    low: 20,
    medium: 40,
    high: 60
  };

  const columnCount = columnCounts[density];
  const [columns, setColumns] = useState<Column[]>(() =>
    Array.from({ length: columnCount }, (_, i) => generateColumn(i, columnCount))
  );
  
  const updateCounterRef = useRef(0);

  useEffect(() => {
    // Use RAF for smooth updates instead of interval
    let animationId: ReturnType<typeof requestAnimationFrame>;
    
    const updateColumns = () => {
      updateCounterRef.current++;
      
      // Only regenerate columns occasionally (every ~100 frames at 60fps = ~1.67s)
      if (updateCounterRef.current % 100 === 0) {
        setColumns((prev) =>
          prev.map((col) => {
            // Randomly regenerate column to create dynamic effect (lower probability)
            if (Math.random() > 0.95) {
              return generateColumn(col.id, columnCount);
            }
            return col;
          })
        );
      }
      
      animationId = requestAnimationFrame(updateColumns);
    };

    animationId = requestAnimationFrame(updateColumns);
    return () => cancelAnimationFrame(animationId);
  }, [columnCount]);

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}
      style={{ opacity }}
    >
      {columns.map((column) => (
        <motion.div
          key={column.id}
          className="absolute top-0 flex flex-col font-mono text-xs leading-tight whitespace-nowrap will-change-transform"
          style={{
            left: `${column.x}%`,
            color: column.isPriceColumn
              ? "rgba(34, 197, 94, 0.6)" // Green for price columns
              : "rgba(6, 182, 212, 0.6)", // Cyan for general columns
            transform: "translate3d(0, 0, 0)" // Enable GPU acceleration
          }}
          initial={{ y: `-${column.offset}%` }}
          animate={{ y: "100%" }}
          transition={{
            duration: 15 / (column.speed * speed),
            repeat: Infinity,
            ease: "linear",
            delay: column.offset / 100
          }}
        >
          {column.chars.map((char, i) => {
            const isHead = i === column.chars.length - 1;
            const isTail = i === 0;
            const fadeOpacity = isTail
              ? 0.1
              : isHead
              ? 1
              : 0.3 + (i / column.chars.length) * 0.5;

            return (
              <span
                key={i}
                style={{
                  opacity: fadeOpacity,
                  textShadow: isHead
                    ? `0 0 8px currentColor`
                    : "none",
                  fontWeight: isHead ? 700 : 400,
                  transform: isHead ? "scale(1.1)" : "scale(1)",
                  willChange: isHead ? "transform" : "auto"
                }}
              >
                {char}
              </span>
            );
          })}
        </motion.div>
      ))}

      {/* Horizontal scan lines for additional effect */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(6, 182, 212, 0.03) 2px, rgba(6, 182, 212, 0.03) 4px)"
        }}
      />
    </div>
  );
};

// Price ticker component that scrolls horizontally
export const PriceTicker = ({
  symbols = ["NVDA", "AMD", "TSLA", "AAPL", "META", "MSFT", "SPY", "QQQ"],
  className = ""
}: {
  symbols?: string[];
  className?: string;
}) => {
  const [prices, setPrices] = useState<Record<string, { price: number; change: number }>>(() =>
    symbols.reduce((acc, symbol) => ({
      ...acc,
      [symbol]: {
        price: 100 + Math.random() * 400,
        change: -5 + Math.random() * 10
      }
    }), {})
  );
  
  const updateCounterRef = useRef(0);

  useEffect(() => {
    // Use RAF instead of interval for smooth price updates
    let animationId: ReturnType<typeof requestAnimationFrame>;
    
    const updatePrices = () => {
      updateCounterRef.current++;
      
      // Update prices less frequently (every 60 frames at 60fps = 1 second)
      if (updateCounterRef.current % 60 === 0) {
        setPrices((prev) => {
          const newPrices = { ...prev };
          const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
          if (newPrices[randomSymbol]) {
            const changePercent = -1 + Math.random() * 2;
            newPrices[randomSymbol] = {
              price: newPrices[randomSymbol].price * (1 + changePercent / 100),
              change: newPrices[randomSymbol].change + changePercent
            };
          }
          return newPrices;
        });
      }
      
      animationId = requestAnimationFrame(updatePrices);
    };

    animationId = requestAnimationFrame(updatePrices);
    return () => cancelAnimationFrame(animationId);
  }, [symbols]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <motion.div
        className="flex gap-8 font-mono text-sm whitespace-nowrap will-change-transform"
        style={{ transform: "translate3d(0, 0, 0)" }} // GPU acceleration
        animate={{ x: [0, -1000] }}
        transition={{
          duration: 35,
          repeat: Infinity,
          ease: "linear"
        }}
      >
        {[...symbols, ...symbols, ...symbols].map((symbol, index) => {
          const data = prices[symbol];
          const isPositive = data.change >= 0;

          return (
            <div key={`${symbol}-${index}`} className="flex items-center gap-3 flex-shrink-0">
              <span className="text-slate-400">{symbol}</span>
              <span className="text-slate-200">${safeToFixed(data.price, 2)}</span>
              <span className={isPositive ? "text-green-400" : "text-red-400"}>
                {isPositive ? "↑" : "↓"} {safeToFixed(Math.abs(data.change), 2)}%
              </span>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
};

export default TradingMatrix;
