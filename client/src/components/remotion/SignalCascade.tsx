import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing
} from "remotion";
import { Brain, Cpu, TrendingUp, Activity, MessageSquare, BarChart3 } from "lucide-react";

interface Signal {
  engine: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  delay: number;
}

const SIGNALS: Signal[] = [
  { engine: "ML", icon: Brain, color: "#8b5cf6", delay: 0 },
  { engine: "AI", icon: Cpu, color: "#06b6d4", delay: 5 },
  { engine: "QUANT", icon: BarChart3, color: "#10b981", delay: 10 },
  { engine: "FLOW", icon: TrendingUp, color: "#f59e0b", delay: 15 },
  { engine: "SENT", icon: MessageSquare, color: "#ec4899", delay: 20 },
  { engine: "TECH", icon: Activity, color: "#3b82f6", delay: 25 }
];

export const SignalCascadeComposition = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animation phases
  const SIGNAL_DURATION = 30; // frames for each signal to appear
  const CONVERGE_START = 35;
  const CONVERGE_DURATION = 20;
  const RESULT_START = 60;

  return (
    <AbsoluteFill className="bg-slate-950">
      {/* Grid background */}
      <div className="absolute inset-0 opacity-10">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-cyan-500" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Signals appearing from left */}
      {SIGNALS.map((signal, idx) => {
        const startFrame = signal.delay;
        const endFrame = startFrame + SIGNAL_DURATION;

        // Entry animation
        const entryProgress = interpolate(
          frame,
          [startFrame, endFrame],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
        );

        // Convergence animation
        const convergeProgress = interpolate(
          frame,
          [CONVERGE_START, CONVERGE_START + CONVERGE_DURATION],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) }
        );

        const isVisible = frame >= startFrame;
        const Icon = signal.icon;

        // Starting position (left side, staggered vertically)
        const startY = 200 + idx * 80;
        const startX = 100;

        // Target position (center)
        const targetY = 400;
        const targetX = 960;

        // Current position
        const currentX = startX + (targetX - startX) * convergeProgress;
        const currentY = startY + (targetY - startY) * convergeProgress;

        const opacity = entryProgress * (1 - convergeProgress * 0.3);
        const scale = spring({
          frame: frame - startFrame,
          fps,
          config: { damping: 200 }
        });

        return (
          <div
            key={signal.engine}
            style={{
              position: "absolute",
              left: currentX,
              top: currentY,
              transform: `translate(-50%, -50%) scale(${isVisible ? scale * (1 - convergeProgress * 0.5) : 0})`,
              opacity: isVisible ? opacity : 0,
            }}
          >
            {/* Signal pulse */}
            <div
              style={{
                position: "absolute",
                inset: -20,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${signal.color}40, transparent)`,
                animation: isVisible ? "pulse 2s infinite" : "none",
              }}
            />

            {/* Icon */}
            <div
              className="relative z-10 p-4 rounded-full"
              style={{
                background: `${signal.color}20`,
                border: `2px solid ${signal.color}`,
              }}
            >
              <Icon className="w-8 h-8" style={{ color: signal.color }} />
            </div>

            {/* Label */}
            <div
              className="absolute -bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap font-bold text-sm"
              style={{ color: signal.color }}
            >
              {signal.engine}
            </div>

            {/* Signal line to center */}
            {convergeProgress > 0 && (
              <svg
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: targetX - currentX + 100,
                  height: Math.abs(targetY - currentY) + 100,
                  pointerEvents: "none",
                  opacity: convergeProgress,
                }}
              >
                <line
                  x1={0}
                  y1={0}
                  x2={targetX - currentX}
                  y2={targetY - currentY}
                  stroke={signal.color}
                  strokeWidth={2}
                  opacity={0.5}
                />
              </svg>
            )}
          </div>
        );
      })}

      {/* Center convergence point */}
      {frame >= CONVERGE_START && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          {/* Convergence glow */}
          <div
            style={{
              position: "absolute",
              inset: -60,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(34, 211, 238, 0.3), transparent)",
              transform: `scale(${interpolate(
                frame,
                [CONVERGE_START, CONVERGE_START + CONVERGE_DURATION],
                [0, 2],
                { extrapolateRight: "clamp" }
              )})`,
            }}
          />

          {/* Result box */}
          {frame >= RESULT_START && (
            <div
              className="bg-slate-900/90 border-2 border-cyan-500 rounded-lg p-6 backdrop-blur-sm"
              style={{
                opacity: interpolate(frame, [RESULT_START, RESULT_START + 10], [0, 1], { extrapolateRight: "clamp" }),
                transform: `scale(${spring({
                  frame: frame - RESULT_START,
                  fps,
                  config: { damping: 200 }
                })})`,
              }}
            >
              <div className="text-center space-y-2">
                <div className="text-cyan-400 font-mono text-sm">CONSENSUS SIGNAL</div>
                <div className="text-white text-3xl font-bold">NVDA</div>
                <div className="text-green-400 text-xl font-semibold">BULLISH</div>
                <div className="text-slate-400 text-sm mt-3">
                  Confidence:{" "}
                  <span className="text-cyan-400 font-bold">
                    {Math.min(
                      89,
                      Math.floor(
                        interpolate(frame, [RESULT_START, RESULT_START + 20], [0, 89], {
                          extrapolateRight: "clamp",
                        })
                      )
                    )}
                    %
                  </span>
                </div>
                <div className="flex gap-1 justify-center mt-2 flex-wrap">
                  {SIGNALS.map((signal) => (
                    <div
                      key={signal.engine}
                      className="px-2 py-1 rounded text-xs font-mono"
                      style={{
                        background: `${signal.color}20`,
                        color: signal.color,
                        border: `1px solid ${signal.color}40`,
                      }}
                    >
                      {signal.engine} ✓
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Title */}
      <div
        className="absolute top-12 left-1/2 -translate-x-1/2 text-center"
        style={{
          opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        <div className="text-cyan-400 text-sm font-mono mb-2">SIGNAL ANALYSIS IN PROGRESS</div>
        <div className="text-white text-2xl font-bold">Six Engines. One Edge.</div>
      </div>
    </AbsoluteFill>
  );
};
