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
  Zap
} from "lucide-react";

const engines = [
  { id: "ml", name: "ML", fullName: "Machine Learning", color: "#a855f7", angle: -90 },
  { id: "ai", name: "AI", fullName: "Multi-LLM", color: "#06b6d4", angle: -30 },
  { id: "quant", name: "QUANT", fullName: "Quantitative", color: "#22c55e", angle: 30 },
  { id: "flow", name: "FLOW", fullName: "Options Flow", color: "#f97316", angle: 90 },
  { id: "sentiment", name: "SENT", fullName: "Sentiment", color: "#ec4899", angle: 150 },
  { id: "technical", name: "TECH", fullName: "Technical", color: "#3b82f6", angle: 210 },
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

function DataParticle({ 
  engineIndex, 
  particleIndex,
  radius,
  centerX,
  centerY
}: { 
  engineIndex: number;
  particleIndex: number;
  radius: number;
  centerX: number;
  centerY: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const engine = engines[engineIndex];
  
  const cycleLength = fps * 3;
  const delay = (engineIndex * 0.3 + particleIndex * 0.5) * fps;
  const adjustedFrame = (frame - delay + cycleLength * 10) % cycleLength;
  
  const progress = interpolate(
    adjustedFrame,
    [0, cycleLength * 0.7, cycleLength],
    [0, 1, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  
  const opacity = interpolate(
    adjustedFrame,
    [0, cycleLength * 0.1, cycleLength * 0.6, cycleLength * 0.8],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  
  const angleRad = (engine.angle * Math.PI) / 180;
  const startX = centerX + Math.cos(angleRad) * radius;
  const startY = centerY + Math.sin(angleRad) * radius;
  const endX = centerX;
  const endY = centerY;
  
  const currentX = interpolate(progress, [0, 1], [startX, endX]);
  const currentY = interpolate(progress, [0, 1], [startY, endY]);
  
  const size = interpolate(progress, [0, 0.5, 1], [6, 8, 4]);
  
  return (
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
        boxShadow: `0 0 ${size * 2}px ${engine.color}`,
        transform: "translate(-50%, -50%)"
      }}
    />
  );
}

function EngineNode({ 
  engine, 
  index,
  radius,
  centerX,
  centerY
}: { 
  engine: typeof engines[0];
  index: number;
  radius: number;
  centerX: number;
  centerY: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const Icon = getIcon(engine.id);
  
  const introDelay = index * 4;
  const scale = spring({
    frame: frame - introDelay,
    fps,
    config: { damping: 12, stiffness: 80 }
  });
  
  const pulsePhase = (frame + index * 10) / fps;
  const pulse = 1 + Math.sin(pulsePhase * 2) * 0.05;
  
  const angleRad = (engine.angle * Math.PI) / 180;
  const x = centerX + Math.cos(angleRad) * radius;
  const y = centerY + Math.sin(angleRad) * radius;
  
  const confidence = 65 + Math.floor(Math.sin(frame / 30 + index) * 15 + 15);
  const isActive = confidence > 75;
  
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
        gap: 4
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 12,
          background: `linear-gradient(135deg, ${engine.color}dd, ${engine.color}88)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: isActive 
            ? `0 0 20px ${engine.color}80, 0 0 40px ${engine.color}40`
            : `0 4px 12px rgba(0,0,0,0.3)`,
          border: `2px solid ${engine.color}`,
          transition: "box-shadow 0.3s"
        }}
      >
        <Icon style={{ width: 24, height: 24, color: "white" }} />
      </div>
      
      <span style={{
        fontSize: 10,
        fontFamily: "monospace",
        color: "rgba(148, 163, 184, 0.9)",
        letterSpacing: "0.05em",
        fontWeight: 600
      }}>
        {engine.name}
      </span>
      
      <span style={{
        fontSize: 9,
        fontFamily: "monospace",
        color: isActive ? engine.color : "rgba(100, 116, 139, 0.7)",
        fontWeight: 500
      }}>
        {confidence}%
      </span>
    </div>
  );
}

function ConvictionCore({ centerX, centerY }: { centerX: number; centerY: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const introScale = spring({
    frame: frame - 15,
    fps,
    config: { damping: 10, stiffness: 60 }
  });
  
  const activeCount = engines.filter((_, i) => {
    const confidence = 65 + Math.floor(Math.sin(frame / 30 + i) * 15 + 15);
    return confidence > 75;
  }).length;
  
  const convergenceLevel = activeCount / 6;
  const isHighConviction = activeCount >= 4;
  
  const coreGlow = interpolate(
    Math.sin(frame / 15),
    [-1, 1],
    [0.4, 0.8]
  );
  
  const ringRotation = frame * 0.5;
  const ring2Rotation = -frame * 0.3;
  
  return (
    <div
      style={{
        position: "absolute",
        left: centerX,
        top: centerY,
        transform: `translate(-50%, -50%) scale(${introScale})`
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 140,
          height: 140,
          transform: `translate(-50%, -50%) rotate(${ringRotation}deg)`,
          borderRadius: "50%",
          border: `1px dashed rgba(6, 182, 212, ${0.2 + convergenceLevel * 0.3})`,
        }}
      />
      
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 100,
          height: 100,
          transform: `translate(-50%, -50%) rotate(${ring2Rotation}deg)`,
          borderRadius: "50%",
          border: `1px solid rgba(168, 85, 247, ${0.3 + convergenceLevel * 0.4})`,
        }}
      />
      
      <div
        style={{
          position: "relative",
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))",
          border: `2px solid rgba(6, 182, 212, ${0.5 + convergenceLevel * 0.5})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: isHighConviction
            ? `0 0 ${30 + coreGlow * 20}px rgba(6, 182, 212, ${coreGlow}), 
               0 0 ${60 + coreGlow * 30}px rgba(168, 85, 247, ${coreGlow * 0.5}),
               inset 0 0 20px rgba(6, 182, 212, 0.2)`
            : `0 0 20px rgba(6, 182, 212, 0.3)`
        }}
      >
        <Zap style={{ 
          width: 20, 
          height: 20, 
          color: isHighConviction ? "#22d3ee" : "#64748b",
          filter: isHighConviction ? "drop-shadow(0 0 8px #22d3ee)" : "none"
        }} />
        <span style={{
          fontSize: 12,
          fontFamily: "monospace",
          fontWeight: 700,
          color: isHighConviction ? "#22d3ee" : "#94a3b8",
          marginTop: 2
        }}>
          {activeCount}/6
        </span>
      </div>
      
      {isHighConviction && (
        <div
          style={{
            position: "absolute",
            top: 85,
            left: "50%",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            fontSize: 10,
            fontFamily: "monospace",
            fontWeight: 600,
            color: "#22d3ee",
            background: "rgba(6, 182, 212, 0.15)",
            padding: "4px 10px",
            borderRadius: 4,
            border: "1px solid rgba(6, 182, 212, 0.4)",
            opacity: interpolate(Math.sin(frame / 20), [-1, 1], [0.7, 1])
          }}
        >
          HIGH CONVICTION
        </div>
      )}
    </div>
  );
}

function ConnectionLine({ 
  engine,
  radius,
  centerX,
  centerY 
}: { 
  engine: typeof engines[0];
  radius: number;
  centerX: number;
  centerY: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const angleRad = (engine.angle * Math.PI) / 180;
  const startX = centerX + Math.cos(angleRad) * radius;
  const startY = centerY + Math.sin(angleRad) * radius;
  
  const lineOpacity = interpolate(
    frame,
    [fps * 0.5, fps * 1.5],
    [0, 0.3],
    { extrapolateRight: "clamp" }
  );
  
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
        <linearGradient id={`grad-${engine.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={engine.color} stopOpacity="0.1" />
          <stop offset="50%" stopColor={engine.color} stopOpacity="0.4" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <line
        x1={startX}
        y1={startY}
        x2={centerX}
        y2={centerY}
        stroke={`url(#grad-${engine.id})`}
        strokeWidth="1"
        strokeDasharray="6 4"
        opacity={lineOpacity}
      />
    </svg>
  );
}

function GridBackground() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0.08,
        backgroundImage: `
          linear-gradient(rgba(6, 182, 212, 0.5) 1px, transparent 1px),
          linear-gradient(90deg, rgba(6, 182, 212, 0.5) 1px, transparent 1px)
        `,
        backgroundSize: "32px 32px"
      }}
    />
  );
}

function LiveIndicator() {
  const frame = useCurrentFrame();
  const pulse = interpolate(Math.sin(frame / 15), [-1, 1], [0.4, 1]);
  
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        display: "flex",
        alignItems: "center",
        gap: 8
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: "#22c55e",
          opacity: pulse,
          boxShadow: `0 0 ${8 + pulse * 4}px #22c55e`
        }}
      />
      <span style={{
        fontSize: 10,
        fontFamily: "monospace",
        color: "rgba(100, 116, 139, 0.8)",
        letterSpacing: "0.1em"
      }}>
        LIVE ANALYSIS
      </span>
    </div>
  );
}

export const EngineConvergenceComposition = () => {
  const { width, height } = useVideoConfig();
  
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.35;
  
  return (
    <AbsoluteFill style={{ backgroundColor: "transparent" }}>
      <GridBackground />
      
      {engines.map((engine) => (
        <ConnectionLine
          key={`line-${engine.id}`}
          engine={engine}
          radius={radius}
          centerX={centerX}
          centerY={centerY}
        />
      ))}
      
      {engines.map((engine, index) => (
        [0, 1, 2].map((particleIndex) => (
          <DataParticle
            key={`particle-${engine.id}-${particleIndex}`}
            engineIndex={index}
            particleIndex={particleIndex}
            radius={radius}
            centerX={centerX}
            centerY={centerY}
          />
        ))
      ))}
      
      {engines.map((engine, index) => (
        <EngineNode
          key={engine.id}
          engine={engine}
          index={index}
          radius={radius}
          centerX={centerX}
          centerY={centerY}
        />
      ))}
      
      <ConvictionCore centerX={centerX} centerY={centerY} />
      
      <LiveIndicator />
    </AbsoluteFill>
  );
};

export default EngineConvergenceComposition;
