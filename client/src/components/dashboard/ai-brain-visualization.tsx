/**
 * AI BRAIN VISUALIZATION
 *
 * Stunning visualization showing the 6 engines learning in real-time.
 * Inspired by intellectia.ai's neural network visuals.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Zap, TrendingUp, Activity, Target, Shield, Sparkles } from 'lucide-react';

interface EngineNode {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  winRate: number;
  tradesProcessed: number;
  isLearning: boolean;
  confidence: number;
}

const ENGINE_DATA: EngineNode[] = [
  { id: 'trading', name: 'Trading Engine', icon: <Brain />, color: '#8B5CF6', winRate: 58, tradesProcessed: 1247, isLearning: true, confidence: 82 },
  { id: 'quant', name: 'Quantitative', icon: <Activity />, color: '#3B82F6', winRate: 52, tradesProcessed: 843, isLearning: false, confidence: 75 },
  { id: 'risk', name: 'Risk Engine', icon: <Shield />, color: '#10B981', winRate: 0, tradesProcessed: 2891, isLearning: true, confidence: 91 },
  { id: 'meanrev', name: 'Mean Reversion', icon: <TrendingUp />, color: '#F59E0B', winRate: 49, tradesProcessed: 562, isLearning: false, confidence: 68 },
  { id: 'confluence', name: 'Confluence', icon: <Target />, color: '#EC4899', winRate: 61, tradesProcessed: 421, isLearning: true, confidence: 85 },
  { id: 'lotto', name: 'Lotto Scanner', icon: <Zap />, color: '#EF4444', winRate: 23, tradesProcessed: 189, isLearning: false, confidence: 45 },
];

export function AIBrainVisualization() {
  const [engines, setEngines] = useState(ENGINE_DATA);
  const [centralPulse, setCentralPulse] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Simulate learning updates
  useEffect(() => {
    const interval = setInterval(() => {
      setEngines(prev => prev.map(engine => ({
        ...engine,
        isLearning: Math.random() > 0.6,
        confidence: Math.min(100, Math.max(40, engine.confidence + (Math.random() - 0.5) * 2)),
        tradesProcessed: engine.tradesProcessed + Math.floor(Math.random() * 3),
      })));
      setCentralPulse(prev => (prev + 1) % 100);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Draw neural connections on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) * 0.7;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connections from each engine to center
      engines.forEach((engine, index) => {
        const angle = (index / engines.length) * Math.PI * 2 - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        // Gradient line
        const gradient = ctx.createLinearGradient(centerX, centerY, x, y);
        gradient.addColorStop(0, engine.color + '40');
        gradient.addColorStop(1, engine.color);

        ctx.beginPath();
        ctx.strokeStyle = gradient;
        ctx.lineWidth = engine.isLearning ? 3 : 1.5;
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x, y);
        ctx.stroke();

        // Animated data pulses along connections
        if (engine.isLearning) {
          const pulsePos = (Date.now() / 1000 * 0.5) % 1;
          const pulseX = centerX + (x - centerX) * pulsePos;
          const pulseY = centerY + (y - centerY) * pulsePos;

          ctx.beginPath();
          ctx.arc(pulseX, pulseY, 4, 0, Math.PI * 2);
          ctx.fillStyle = engine.color;
          ctx.fill();
        }
      });

      // Central brain glow
      const centralGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 60);
      centralGradient.addColorStop(0, 'rgba(139, 92, 246, 0.6)');
      centralGradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.2)');
      centralGradient.addColorStop(1, 'rgba(139, 92, 246, 0)');

      ctx.beginPath();
      ctx.arc(centerX, centerY, 50 + Math.sin(Date.now() / 500) * 5, 0, Math.PI * 2);
      ctx.fillStyle = centralGradient;
      ctx.fill();

      requestAnimationFrame(draw);
    };

    draw();
  }, [engines]);

  return (
    <div className="relative w-full aspect-square max-w-[500px] mx-auto">
      {/* Canvas for neural connections */}
      <canvas
        ref={canvasRef}
        width={500}
        height={500}
        className="absolute inset-0 w-full h-full"
      />

      {/* Central brain node */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
        animate={{
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      >
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
          <Brain className="w-12 h-12 text-white" />
        </div>
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-sm font-semibold text-purple-400 whitespace-nowrap">
          Self-Learning AI
        </div>
      </motion.div>

      {/* Engine nodes */}
      {engines.map((engine, index) => {
        const angle = (index / engines.length) * Math.PI * 2 - Math.PI / 2;
        const x = 50 + Math.cos(angle) * 35;
        const y = 50 + Math.sin(angle) * 35;

        return (
          <motion.div
            key={engine.id}
            className="absolute"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: 'translate(-50%, -50%)',
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.1 }}
          >
            <motion.div
              className="relative group cursor-pointer"
              whileHover={{ scale: 1.15 }}
            >
              {/* Node circle */}
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all duration-300"
                style={{
                  background: `linear-gradient(135deg, ${engine.color}30, ${engine.color}10)`,
                  border: `2px solid ${engine.color}`,
                  boxShadow: engine.isLearning ? `0 0 20px ${engine.color}50` : 'none',
                }}
              >
                <div className="text-white" style={{ color: engine.color }}>
                  {engine.icon}
                </div>
              </div>

              {/* Learning indicator */}
              <AnimatePresence>
                {engine.isLearning && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute -top-1 -right-1"
                  >
                    <Sparkles className="w-4 h-4 text-yellow-400" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900/95 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 border border-gray-700">
                <div className="font-semibold text-sm" style={{ color: engine.color }}>
                  {engine.name}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Win Rate: {engine.winRate > 0 ? `${engine.winRate}%` : 'N/A'}
                </div>
                <div className="text-xs text-gray-400">
                  Confidence: {engine.confidence.toFixed(0)}%
                </div>
                <div className="text-xs text-gray-400">
                  {engine.tradesProcessed.toLocaleString()} trades analyzed
                </div>
              </div>

              {/* Confidence ring */}
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke={engine.color + '30'}
                  strokeWidth="3"
                />
                <motion.circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke={engine.color}
                  strokeWidth="3"
                  strokeDasharray={`${engine.confidence * 1.76} 176`}
                  strokeLinecap="round"
                  initial={{ strokeDasharray: "0 176" }}
                  animate={{ strokeDasharray: `${engine.confidence * 1.76} 176` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </svg>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}

export default AIBrainVisualization;
