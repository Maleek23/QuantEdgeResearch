import { 
  AbsoluteFill, 
  useCurrentFrame, 
  useVideoConfig, 
  interpolate, 
  spring,
  Easing
} from "remotion";
import { 
  Brain, 
  Cpu, 
  Calculator, 
  Activity, 
  MessageSquare, 
  TrendingUp,
  Zap,
  Target,
  Flame,
  Rocket
} from "lucide-react";

const engines = [
  { id: "ml", name: "ML", fullName: "Machine Learning", color: "#a855f7", glowColor: "168, 85, 247", angle: -90 },
  { id: "ai", name: "AI", fullName: "Multi-LLM", color: "#06b6d4", glowColor: "6, 182, 212", angle: -30 },
  { id: "quant", name: "QUANT", fullName: "Quantitative", color: "#10b981", glowColor: "16, 185, 129", angle: 30 },
  { id: "flow", name: "FLOW", fullName: "Options Flow", color: "#f59e0b", glowColor: "245, 158, 11", angle: 90 },
  { id: "sentiment", name: "SENT", fullName: "Sentiment", color: "#ec4899", glowColor: "236, 72, 153", angle: 150 },
  { id: "technical", name: "TECH", fullName: "Technical", color: "#3b82f6", glowColor: "59, 130, 246", angle: 210 },
];

const getIcon = (id: string) => {
  switch (id) {
    case "ml": return Cpu;
    case "ai": return Brain;
    case "quant": return Calculator;
    case "flow": return Activity;
    case "sentiment": return MessageSquare;
    case "technical": return TrendingUp;
    default: return Zap;
  }
};

function EnergyWave({ delay, color }: { delay: number; color: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const cycleLength = fps * 4;
  const adjustedFrame = (frame - delay * fps + cycleLength * 10) % cycleLength;
  
  const scale = interpolate(adjustedFrame, [0, cycleLength], [0.3, 2.5]);
  const opacity = interpolate(adjustedFrame, [0, cycleLength * 0.3, cycleLength], [0.6, 0.3, 0]);
  
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 100,
        height: 100,
        transform: `translate(-50%, -50%) scale(${scale})`,
        borderRadius: "50%",
        border: `2px solid ${color}`,
        opacity,
        boxShadow: `0 0 20px ${color}, inset 0 0 20px ${color}40`
      }}
    />
  );
}

function DataStream({ 
  engineIndex, 
  streamIndex,
  radius,
  centerX,
  centerY
}: { 
  engineIndex: number;
  streamIndex: number;
  radius: number;
  centerX: number;
  centerY: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const engine = engines[engineIndex];
  
  const cycleLength = fps * 2.5;
  const delay = (engineIndex * 0.2 + streamIndex * 0.4) * fps;
  const adjustedFrame = (frame - delay + cycleLength * 20) % cycleLength;
  
  const progress = interpolate(
    adjustedFrame,
    [0, cycleLength],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  
  const opacity = interpolate(
    adjustedFrame,
    [0, cycleLength * 0.1, cycleLength * 0.7, cycleLength],
    [0, 1, 0.8, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  
  const angleRad = (engine.angle * Math.PI) / 180;
  const startX = centerX + Math.cos(angleRad) * (radius - 20);
  const startY = centerY + Math.sin(angleRad) * (radius - 20);
  
  const currentX = interpolate(progress, [0, 1], [startX, centerX]);
  const currentY = interpolate(progress, [0, 1], [startY, centerY]);
  
  const size = interpolate(progress, [0, 0.5, 1], [4, 10, 6]);
  const trailLength = 40;
  
  return (
    <>
      {/* Trail effect */}
      <div
        style={{
          position: "absolute",
          left: currentX,
          top: currentY,
          width: trailLength,
          height: 3,
          background: `linear-gradient(90deg, transparent, ${engine.color})`,
          opacity: opacity * 0.5,
          transform: `translate(-100%, -50%) rotate(${engine.angle + 180}deg)`,
          transformOrigin: "right center",
          filter: `blur(2px)`
        }}
      />
      {/* Main particle */}
      <div
        style={{
          position: "absolute",
          left: currentX - size / 2,
          top: currentY - size / 2,
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: engine.color,
          opacity,
          boxShadow: `0 0 ${size * 3}px ${engine.color}, 0 0 ${size * 6}px ${engine.color}80`,
          transform: "translate(-50%, -50%)"
        }}
      />
    </>
  );
}

function EngineNode({ 
  engine, 
  index,
  radius,
  centerX,
  centerY,
  isActive,
  confidence
}: { 
  engine: typeof engines[0];
  index: number;
  radius: number;
  centerX: number;
  centerY: number;
  isActive: boolean;
  confidence: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const Icon = getIcon(engine.id);
  
  const introDelay = index * 3;
  const scale = spring({
    frame: frame - introDelay,
    fps,
    config: { damping: 10, stiffness: 100 }
  });
  
  const pulsePhase = (frame + index * 15) / fps;
  const pulse = isActive ? 1 + Math.sin(pulsePhase * 3) * 0.08 : 1;
  const glowPulse = isActive ? 0.6 + Math.sin(pulsePhase * 3) * 0.4 : 0.2;
  
  const angleRad = (engine.angle * Math.PI) / 180;
  const x = centerX + Math.cos(angleRad) * radius;
  const y = centerY + Math.sin(angleRad) * radius;
  
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${scale * pulse})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6
      }}
    >
      {/* Outer glow ring */}
      {isActive && (
        <div
          style={{
            position: "absolute",
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(${engine.glowColor}, ${glowPulse * 0.3}) 0%, transparent 70%)`,
            animation: "pulse 2s infinite"
          }}
        />
      )}
      
      {/* Main node */}
      <div
        style={{
          position: "relative",
          width: 56,
          height: 56,
          borderRadius: 14,
          background: isActive 
            ? `linear-gradient(135deg, ${engine.color}, ${engine.color}cc)`
            : `linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(51, 65, 85, 0.9))`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: isActive 
            ? `0 0 30px rgba(${engine.glowColor}, ${glowPulse}), 0 0 60px rgba(${engine.glowColor}, ${glowPulse * 0.5}), inset 0 1px 0 rgba(255,255,255,0.2)`
            : `0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)`,
          border: isActive ? `2px solid ${engine.color}` : `1px solid rgba(100, 116, 139, 0.3)`,
          transition: "all 0.3s ease"
        }}
      >
        <Icon style={{ 
          width: 26, 
          height: 26, 
          color: isActive ? "white" : "rgba(148, 163, 184, 0.7)",
          filter: isActive ? `drop-shadow(0 0 8px ${engine.color})` : "none"
        }} />
        
        {/* Active indicator */}
        {isActive && (
          <div
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #22c55e, #16a34a)",
              border: "2px solid #0f172a",
              boxShadow: "0 0 10px #22c55e"
            }}
          />
        )}
      </div>
      
      {/* Label */}
      <span style={{
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        color: isActive ? engine.color : "rgba(148, 163, 184, 0.6)",
        letterSpacing: "0.1em",
        fontWeight: 700,
        textShadow: isActive ? `0 0 10px ${engine.color}` : "none"
      }}>
        {engine.name}
      </span>
      
      {/* Confidence */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        opacity: isActive ? 1 : 0.4
      }}>
        <div style={{
          width: 40,
          height: 4,
          borderRadius: 2,
          background: "rgba(30, 41, 59, 0.8)",
          overflow: "hidden"
        }}>
          <div style={{
            width: `${confidence}%`,
            height: "100%",
            background: isActive ? engine.color : "rgba(100, 116, 139, 0.5)",
            boxShadow: isActive ? `0 0 8px ${engine.color}` : "none",
            transition: "width 0.5s ease"
          }} />
        </div>
        <span style={{
          fontSize: 9,
          fontFamily: "'JetBrains Mono', monospace",
          color: isActive ? engine.color : "rgba(100, 116, 139, 0.6)",
          fontWeight: 600
        }}>
          {confidence}%
        </span>
      </div>
    </div>
  );
}

function ConvictionCore({ centerX, centerY, activeCount, isHighConviction }: { 
  centerX: number; 
  centerY: number;
  activeCount: number;
  isHighConviction: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const introScale = spring({
    frame: frame - 10,
    fps,
    config: { damping: 8, stiffness: 50 }
  });
  
  const convergenceLevel = activeCount / 6;
  const pulseIntensity = interpolate(Math.sin(frame / 10), [-1, 1], [0.5, 1]);
  const rotationSpeed = isHighConviction ? 1.5 : 0.5;
  
  return (
    <div
      style={{
        position: "absolute",
        left: centerX,
        top: centerY,
        transform: `translate(-50%, -50%) scale(${introScale})`
      }}
    >
      {/* Energy waves */}
      {isHighConviction && (
        <>
          <EnergyWave delay={0} color="rgba(6, 182, 212, 0.4)" />
          <EnergyWave delay={1.3} color="rgba(168, 85, 247, 0.3)" />
          <EnergyWave delay={2.6} color="rgba(6, 182, 212, 0.2)" />
        </>
      )}
      
      {/* Outer orbital ring */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 160,
          height: 160,
          transform: `translate(-50%, -50%) rotate(${frame * rotationSpeed}deg)`,
          borderRadius: "50%",
          border: `1px dashed rgba(6, 182, 212, ${0.2 + convergenceLevel * 0.4})`,
        }}
      >
        {/* Orbital dots */}
        {[0, 60, 120, 180, 240, 300].map((angle, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${50 + 50 * Math.cos((angle * Math.PI) / 180)}%`,
              top: `${50 + 50 * Math.sin((angle * Math.PI) / 180)}%`,
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: engines[i]?.color || "#06b6d4",
              transform: "translate(-50%, -50%)",
              boxShadow: `0 0 6px ${engines[i]?.color || "#06b6d4"}`
            }}
          />
        ))}
      </div>
      
      {/* Middle ring */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 120,
          height: 120,
          transform: `translate(-50%, -50%) rotate(${-frame * rotationSpeed * 0.7}deg)`,
          borderRadius: "50%",
          border: `2px solid rgba(168, 85, 247, ${0.3 + convergenceLevel * 0.5})`,
          boxShadow: isHighConviction ? `0 0 30px rgba(168, 85, 247, ${pulseIntensity * 0.4})` : "none"
        }}
      />
      
      {/* Inner glow */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 100,
          height: 100,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: `radial-gradient(circle, 
            rgba(6, 182, 212, ${0.2 + convergenceLevel * 0.3}) 0%, 
            rgba(168, 85, 247, ${0.1 + convergenceLevel * 0.2}) 50%, 
            transparent 70%
          )`,
          filter: isHighConviction ? "blur(10px)" : "blur(5px)"
        }}
      />
      
      {/* Main core */}
      <div
        style={{
          position: "relative",
          width: 88,
          height: 88,
          borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))",
          border: `3px solid rgba(6, 182, 212, ${0.5 + convergenceLevel * 0.5})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: isHighConviction
            ? `0 0 40px rgba(6, 182, 212, ${pulseIntensity * 0.8}), 
               0 0 80px rgba(168, 85, 247, ${pulseIntensity * 0.4}),
               inset 0 0 30px rgba(6, 182, 212, 0.3),
               0 0 0 4px rgba(6, 182, 212, 0.1)`
            : `0 0 30px rgba(6, 182, 212, 0.3), inset 0 0 20px rgba(6, 182, 212, 0.1)`
        }}
      >
        {/* Icon */}
        {isHighConviction ? (
          <Flame style={{ 
            width: 28, 
            height: 28, 
            color: "#22d3ee",
            filter: "drop-shadow(0 0 12px #22d3ee)"
          }} />
        ) : (
          <Target style={{ 
            width: 24, 
            height: 24, 
            color: "#64748b"
          }} />
        )}
        
        {/* Count */}
        <span style={{
          fontSize: 18,
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 800,
          color: isHighConviction ? "#22d3ee" : "#94a3b8",
          marginTop: 2,
          textShadow: isHighConviction ? "0 0 15px #22d3ee" : "none"
        }}>
          {activeCount}/6
        </span>
      </div>
      
      {/* High conviction badge */}
      {isHighConviction && (
        <div
          style={{
            position: "absolute",
            top: 100,
            left: "50%",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: "#22d3ee",
            background: "linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(168, 85, 247, 0.15))",
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid rgba(6, 182, 212, 0.5)",
            boxShadow: `0 0 20px rgba(6, 182, 212, ${pulseIntensity * 0.4})`,
            backdropFilter: "blur(4px)"
          }}
        >
          <Rocket style={{ width: 12, height: 12, display: "inline", marginRight: 6, verticalAlign: "middle" }} />
          HIGH CONVICTION
        </div>
      )}
    </div>
  );
}

function ConnectionBeam({ 
  engine,
  radius,
  centerX,
  centerY,
  isActive
}: { 
  engine: typeof engines[0];
  radius: number;
  centerX: number;
  centerY: number;
  isActive: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const angleRad = (engine.angle * Math.PI) / 180;
  const startX = centerX + Math.cos(angleRad) * (radius - 30);
  const startY = centerY + Math.sin(angleRad) * (radius - 30);
  
  const beamOpacity = interpolate(
    frame,
    [fps * 0.3, fps * 1],
    [0, isActive ? 0.6 : 0.15],
    { extrapolateRight: "clamp" }
  );
  
  const beamPulse = isActive ? interpolate(Math.sin(frame / 15), [-1, 1], [0.4, 1]) : 0.3;
  
  return (
    <svg
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none"
      }}
    >
      <defs>
        <linearGradient id={`beam-${engine.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={engine.color} stopOpacity={beamPulse} />
          <stop offset="50%" stopColor={engine.color} stopOpacity={beamPulse * 0.7} />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity={beamPulse * 0.5} />
        </linearGradient>
        <filter id={`glow-${engine.id}`}>
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor={engine.color} floodOpacity="0.5" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      
      {/* Main beam */}
      <line
        x1={startX}
        y1={startY}
        x2={centerX}
        y2={centerY}
        stroke={`url(#beam-${engine.id})`}
        strokeWidth={isActive ? 3 : 1}
        opacity={beamOpacity}
        filter={isActive ? `url(#glow-${engine.id})` : undefined}
      />
      
      {/* Dotted overlay */}
      <line
        x1={startX}
        y1={startY}
        x2={centerX}
        y2={centerY}
        stroke={engine.color}
        strokeWidth="1"
        strokeDasharray="4 8"
        opacity={beamOpacity * 0.5}
        style={{
          strokeDashoffset: -frame * 2
        }}
      />
    </svg>
  );
}

function HexGrid() {
  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: 0.06
      }}
    >
      <defs>
        <pattern id="hexGrid" width="50" height="43.3" patternUnits="userSpaceOnUse">
          <path 
            d="M25,0 L50,14.43 L50,43.3 L25,43.3 L0,43.3 L0,14.43 Z" 
            fill="none" 
            stroke="#06b6d4" 
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hexGrid)" />
    </svg>
  );
}

function LiveIndicator() {
  const frame = useCurrentFrame();
  const pulse = interpolate(Math.sin(frame / 12), [-1, 1], [0.3, 1]);
  
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "rgba(15, 23, 42, 0.8)",
        padding: "6px 12px",
        borderRadius: 6,
        border: "1px solid rgba(34, 197, 94, 0.3)",
        backdropFilter: "blur(4px)"
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: "#22c55e",
          opacity: pulse,
          boxShadow: `0 0 ${6 + pulse * 6}px #22c55e`
        }}
      />
      <span style={{
        fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
        color: "#22c55e",
        letterSpacing: "0.15em",
        fontWeight: 600
      }}>
        LIVE
      </span>
    </div>
  );
}

function ScanLine() {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  
  const y = (frame * 3) % (height + 40) - 20;
  
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: y,
        width: "100%",
        height: 2,
        background: "linear-gradient(90deg, transparent, rgba(6, 182, 212, 0.3), transparent)",
        boxShadow: "0 0 20px rgba(6, 182, 212, 0.2)"
      }}
    />
  );
}

export const EngineConvergenceComposition = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.38;
  
  // Calculate which engines are "active" with varying confidence
  const engineStates = engines.map((engine, i) => {
    const phase = frame / 30 + i * 1.2;
    const confidence = Math.floor(55 + Math.sin(phase) * 25 + Math.cos(phase * 0.7) * 15);
    const isActive = confidence > 70;
    return { ...engine, confidence: Math.min(99, Math.max(45, confidence)), isActive };
  });
  
  const activeCount = engineStates.filter(e => e.isActive).length;
  const isHighConviction = activeCount >= 4;
  
  return (
    <AbsoluteFill style={{ backgroundColor: "transparent", overflow: "hidden" }}>
      {/* Background effects */}
      <HexGrid />
      <ScanLine />
      
      {/* Connection beams */}
      {engineStates.map((engine) => (
        <ConnectionBeam
          key={`beam-${engine.id}`}
          engine={engine}
          radius={radius}
          centerX={centerX}
          centerY={centerY}
          isActive={engine.isActive}
        />
      ))}
      
      {/* Data streams */}
      {engineStates.map((engine, index) => (
        engine.isActive && [0, 1, 2, 3].map((streamIndex) => (
          <DataStream
            key={`stream-${engine.id}-${streamIndex}`}
            engineIndex={index}
            streamIndex={streamIndex}
            radius={radius}
            centerX={centerX}
            centerY={centerY}
          />
        ))
      ))}
      
      {/* Engine nodes */}
      {engineStates.map((engine, index) => (
        <EngineNode
          key={engine.id}
          engine={engine}
          index={index}
          radius={radius}
          centerX={centerX}
          centerY={centerY}
          isActive={engine.isActive}
          confidence={engine.confidence}
        />
      ))}
      
      {/* Central conviction core */}
      <ConvictionCore 
        centerX={centerX} 
        centerY={centerY} 
        activeCount={activeCount}
        isHighConviction={isHighConviction}
      />
      
      {/* Live indicator */}
      <LiveIndicator />
    </AbsoluteFill>
  );
};

export default EngineConvergenceComposition;
