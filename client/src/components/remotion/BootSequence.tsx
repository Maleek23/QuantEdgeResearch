import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Sequence,
  spring,
  Easing
} from "remotion";
import { Cpu, Database, Activity, Zap, CheckCircle2, Terminal } from "lucide-react";

// ASCII Art Logo
const ASCII_LOGO = [
  "  ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗",
  " ██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝",
  " ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ",
  " ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ",
  " ╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ",
  "  ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ",
  " ███████╗██████╗  ██████╗ ███████╗",
  " ██╔════╝██╔══██╗██╔════╝ ██╔════╝",
  " █████╗  ██║  ██║██║  ███╗█████╗  ",
  " ██╔══╝  ██║  ██║██║   ██║██╔══╝  ",
  " ███████╗██████╔╝╚██████╔╝███████╗",
  " ╚══════╝╚═════╝  ╚═════╝ ╚══════╝"
];

interface BootLineProps {
  text: string;
  icon?: React.ComponentType<{ className?: string }>;
  delay: number;
  status?: "loading" | "success" | "error";
  duration?: number;
}

const BootLine = ({ text, icon: Icon, delay, status = "loading", duration = 30 }: BootLineProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = delay * fps;
  const endFrame = startFrame + (duration / 1000) * fps;

  const opacity = interpolate(
    frame,
    [startFrame - 5, startFrame],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const isVisible = frame >= startFrame;
  const isComplete = frame >= endFrame;

  const spinnerChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const spinnerIndex = Math.floor((frame - startFrame) / 3) % spinnerChars.length;

  const statusIcon = isComplete ? (
    status === "success" ? (
      <CheckCircle2 className="w-4 h-4 text-green-400" />
    ) : (
      <span className="text-red-400">✗</span>
    )
  ) : (
    <span className="text-cyan-400 animate-spin-slow">{spinnerChars[spinnerIndex]}</span>
  );

  if (!isVisible) return null;

  return (
    <div
      className="flex items-center gap-3 font-mono text-sm will-change-opacity"
      style={{ 
        opacity,
        transform: "translate3d(0, 0, 0)"
      }}
    >
      {statusIcon}
      {Icon && <Icon className="w-4 h-4 text-cyan-400" />}
      <span className={isComplete ? "text-slate-300" : "text-slate-400"}>
        {text}
      </span>
      {isComplete && status === "success" && (
        <span className="text-green-400 ml-2">OK</span>
      )}
    </div>
  );
};

const ASCIILogo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div className="font-mono text-cyan-400 text-xs leading-tight mb-8 will-change-opacity">
      {ASCII_LOGO.map((line, index) => {
        const delay = index * 2;
        const opacity = interpolate(
          frame,
          [delay, delay + 5],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );

        const glowIntensity = interpolate(
          Math.sin(frame / 10),
          [-1, 1],
          [0.3, 0.8]
        );

        return (
          <div
            key={index}
            style={{
              opacity,
              textShadow: frame > delay + 10
                ? `0 0 ${10 * glowIntensity}px rgba(6, 182, 212, ${glowIntensity})`
                : "none",
              transform: "translate3d(0, 0, 0)",
              willChange: frame > delay && frame < delay + 10 ? "opacity, text-shadow" : "auto"
            }}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
};

const SystemInitialization = () => {
  const bootSteps = [
    { text: "Initializing Quantum Trading OS v4.5...", icon: Terminal, delay: 0.5, duration: 800 },
    { text: "Loading neural network modules...", icon: Cpu, delay: 1.3, duration: 600 },
    { text: "Connecting to market data streams...", icon: Database, delay: 1.9, duration: 700 },
    { text: "Starting ML Intelligence Engine...", delay: 2.6, duration: 500 },
    { text: "Starting AI Multi-LLM Engine...", delay: 3.1, duration: 500 },
    { text: "Starting Quant Scanner Engine...", delay: 3.6, duration: 500 },
    { text: "Starting Options Flow Engine...", icon: Activity, delay: 4.1, duration: 500 },
    { text: "Starting Sentiment Analyzer...", delay: 4.6, duration: 500 },
    { text: "Starting Technical Scanner...", delay: 5.1, duration: 500 },
    { text: "Calibrating convergence algorithms...", icon: Zap, delay: 5.8, duration: 600 },
    { text: "All systems operational. Ready for trading.", delay: 6.6, duration: 400 }
  ];

  return (
    <div className="space-y-2 max-w-2xl">
      {bootSteps.map((step, index) => (
        <BootLine
          key={index}
          text={step.text}
          icon={step.icon}
          delay={step.delay}
          duration={step.duration}
          status="success"
        />
      ))}
    </div>
  );
};

const ScanLines = () => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();

  const y1 = (frame * 4) % (height + 100) - 50;
  const y2 = ((frame * 2.5 + 150) % (height + 100)) - 50;

  return (
    <>
      <div
        className="absolute left-0 right-0 h-px will-change-transform"
        style={{
          top: y1,
          background: "linear-gradient(90deg, transparent, rgba(6, 182, 212, 0.4), transparent)",
          boxShadow: "0 0 20px rgba(6, 182, 212, 0.3)",
          transform: "translate3d(0, 0, 0)"
        }}
      />
      <div
        className="absolute left-0 right-0 h-px will-change-transform"
        style={{
          top: y2,
          background: "linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.3), transparent)",
          boxShadow: "0 0 15px rgba(168, 85, 247, 0.2)",
          transform: "translate3d(0, 0, 0)"
        }}
      />
    </>
  );
};

const GridBackground = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [0, 30],
    [0, 0.03],
    { extrapolateRight: "clamp" }
  );

  return (
    <svg
      className="absolute inset-0 w-full h-full will-change-opacity"
      style={{ 
        opacity,
        transform: "translate3d(0, 0, 0)"
      }}
    >
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="rgba(6, 182, 212, 0.5)"
            strokeWidth="0.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  );
};

const VignetteOverlay = () => (
  <div
    className="absolute inset-0 pointer-events-none"
    style={{
      background: "radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.8) 100%)"
    }}
  />
);

const TerminalCursor = ({ delay = 0 }: { delay?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = delay * fps;
  const isVisible = frame >= startFrame;

  const blink = Math.floor((frame - startFrame) / 15) % 2 === 0;

  if (!isVisible || !blink) return null;

  return (
    <span className="inline-block w-2 h-4 bg-cyan-400 ml-1" />
  );
};

export const BootSequenceComposition = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Fade out everything near the end
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 30, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      className="bg-slate-950"
      style={{ opacity: fadeOut }}
    >
      <GridBackground />
      <ScanLines />
      <VignetteOverlay />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-8">
        {/* ASCII Logo appears first */}
        <Sequence from={0} durationInFrames={durationInFrames}>
          <ASCIILogo />
        </Sequence>

        {/* Boot sequence starts after logo */}
        <Sequence from={20} durationInFrames={durationInFrames - 20}>
          <SystemInitialization />
        </Sequence>

        {/* Final message with blinking cursor */}
        <Sequence from={fps * 7.5} durationInFrames={durationInFrames - fps * 7.5}>
          <div className="mt-8 font-mono text-green-400 flex items-center">
            <span>System ready. Press any key to continue</span>
            <TerminalCursor delay={0.2} />
          </div>
        </Sequence>
      </div>

      {/* Ambient glow effects */}
      <div
        className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, transparent 70%)",
          filter: "blur(60px)"
        }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(168, 85, 247, 0.1) 0%, transparent 70%)",
          filter: "blur(60px)"
        }}
      />
    </AbsoluteFill>
  );
};

export default BootSequenceComposition;
