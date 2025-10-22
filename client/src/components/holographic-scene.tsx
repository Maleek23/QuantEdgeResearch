import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Text, Sphere, Html } from '@react-three/drei';
import { Suspense, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';

// Types
interface PerformanceStats {
  winRate: number;
  totalTrades: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  evScore: number;
}

interface TradeIdea {
  id: number;
  symbol: string;
  entryPrice?: number | null;
  direction: 'LONG' | 'SHORT';
}

// Central QuantEdge Core Sphere
function QuantEdgeCore() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.005;
      // Pulsing effect
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
      meshRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <Sphere ref={meshRef} args={[1.5, 64, 64]} position={[0, 0, 0]}>
      <meshStandardMaterial
        color="#3b82f6"
        emissive="#3b82f6"
        emissiveIntensity={0.5}
        wireframe={true}
        transparent
        opacity={0.7}
      />
    </Sphere>
  );
}

// Orbiting Metric Display
function OrbitingMetric({ 
  label, 
  value, 
  angle, 
  radius = 4,
  color = "#10b981" 
}: { 
  label: string; 
  value: string; 
  angle: number; 
  radius?: number;
  color?: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (groupRef.current) {
      const orbitSpeed = 0.001;
      const currentAngle = angle + state.clock.elapsedTime * orbitSpeed;
      groupRef.current.position.x = Math.cos(currentAngle) * radius;
      groupRef.current.position.z = Math.sin(currentAngle) * radius;
      groupRef.current.rotation.y = -currentAngle;
    }
  });

  return (
    <group ref={groupRef}>
      <Html
        center
        distanceFactor={8}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div className="bg-black/80 backdrop-blur-sm border border-cyan-500/30 rounded-lg px-4 py-2 shadow-2xl">
          <div className="text-cyan-400 text-xs font-medium mb-1 whitespace-nowrap">{label}</div>
          <div className="text-2xl font-bold whitespace-nowrap" style={{ color }}>
            {value}
          </div>
        </div>
      </Html>
    </group>
  );
}

// Matrix-style Data Rain
function DataRain({ tradeIdeas }: { tradeIdeas: TradeIdea[] }) {
  const symbolsData = useMemo(() => {
    if (!tradeIdeas || tradeIdeas.length === 0) {
      return [
        { symbol: 'AAPL', price: '$175.43', direction: 'LONG' as const },
        { symbol: 'TSLA', price: '$242.84', direction: 'LONG' as const },
        { symbol: 'NVDA', price: '$495.22', direction: 'SHORT' as const },
      ];
    }
    
    return tradeIdeas.slice(0, 10).map(idea => ({
      symbol: idea.symbol,
      price: idea.entryPrice ? `$${idea.entryPrice.toFixed(2)}` : 'N/A',
      direction: idea.direction
    }));
  }, [tradeIdeas]);

  const columns = 12;
  const streams = useMemo(() => {
    return Array.from({ length: columns }, (_, i) => ({
      x: (i - columns / 2) * 2,
      delay: Math.random() * 5,
      speed: 0.5 + Math.random() * 0.5,
      symbols: [...symbolsData].sort(() => Math.random() - 0.5),
    }));
  }, [symbolsData]);

  return (
    <>
      {streams.map((stream, streamIdx) => (
        <DataStream key={streamIdx} {...stream} />
      ))}
    </>
  );
}

function DataStream({ 
  x, 
  delay, 
  speed, 
  symbols 
}: { 
  x: number; 
  delay: number; 
  speed: number; 
  symbols: { symbol: string; price: string; direction: 'LONG' | 'SHORT' }[];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const startTime = useRef<number | null>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    
    if (startTime.current === null) {
      startTime.current = state.clock.elapsedTime;
    }

    const elapsed = state.clock.elapsedTime - startTime.current;
    if (elapsed < delay) return;

    groupRef.current.position.y = 10 - ((elapsed - delay) * speed) % 20;
  });

  return (
    <group ref={groupRef} position={[x, 10, -8]}>
      {symbols.map((data, idx) => (
        <Text
          key={idx}
          position={[0, -idx * 1.5, 0]}
          fontSize={0.3}
          color={data.direction === 'LONG' ? '#10b981' : '#ef4444'}
          anchorX="center"
          anchorY="middle"
        >
          {`${data.symbol}\n${data.price}`}
        </Text>
      ))}
    </group>
  );
}

// Main Scene Component
export function HolographicScene({ 
  stats, 
  tradeIdeas 
}: { 
  stats: PerformanceStats | undefined; 
  tradeIdeas: TradeIdea[] | undefined;
}) {
  const metrics = useMemo(() => {
    if (!stats) {
      return [
        { label: 'Win Rate', value: '0.0%', angle: 0, color: '#10b981' },
        { label: 'Total Trades', value: '0', angle: Math.PI / 3, color: '#3b82f6' },
        { label: 'Profit Factor', value: '0.00', angle: (2 * Math.PI) / 3, color: '#f59e0b' },
        { label: 'Sharpe Ratio', value: '0.00', angle: Math.PI, color: '#8b5cf6' },
        { label: 'Max Drawdown', value: '0.0%', angle: (4 * Math.PI) / 3, color: '#ef4444' },
        { label: 'EV Score', value: '0.00', angle: (5 * Math.PI) / 3, color: '#06b6d4' },
      ];
    }

    return [
      { 
        label: 'Win Rate', 
        value: `${stats.winRate.toFixed(1)}%`, 
        angle: 0, 
        color: stats.winRate >= 50 ? '#10b981' : '#ef4444' 
      },
      { 
        label: 'Total Trades', 
        value: stats.totalTrades.toString(), 
        angle: Math.PI / 3, 
        color: '#3b82f6' 
      },
      { 
        label: 'Profit Factor', 
        value: stats.profitFactor.toFixed(2), 
        angle: (2 * Math.PI) / 3, 
        color: stats.profitFactor >= 1 ? '#10b981' : '#ef4444' 
      },
      { 
        label: 'Sharpe Ratio', 
        value: stats.sharpeRatio.toFixed(2), 
        angle: Math.PI, 
        color: stats.sharpeRatio >= 1 ? '#8b5cf6' : '#f59e0b' 
      },
      { 
        label: 'Max Drawdown', 
        value: `${Math.abs(stats.maxDrawdown).toFixed(1)}%`, 
        angle: (4 * Math.PI) / 3, 
        color: '#ef4444' 
      },
      { 
        label: 'EV Score', 
        value: stats.evScore.toFixed(2), 
        angle: (5 * Math.PI) / 3, 
        color: stats.evScore >= 1 ? '#06b6d4' : '#f59e0b' 
      },
    ];
  }, [stats]);

  return (
    <Canvas
      camera={{ position: [0, 2, 12], fov: 60 }}
      style={{ background: 'linear-gradient(to bottom, #000000, #0a0a1a)' }}
    >
      <Suspense fallback={null}>
        {/* Lighting */}
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#3b82f6" />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#8b5cf6" />

        {/* Stars background */}
        <Stars 
          radius={100} 
          depth={50} 
          count={5000} 
          factor={4} 
          saturation={0} 
          fade 
          speed={1} 
        />

        {/* Central Core */}
        <QuantEdgeCore />

        {/* Orbiting Metrics */}
        {metrics.map((metric, idx) => (
          <OrbitingMetric key={idx} {...metric} />
        ))}

        {/* Data Rain */}
        <DataRain tradeIdeas={tradeIdeas || []} />

        {/* Controls */}
        <OrbitControls 
          enableZoom={true}
          enablePan={true}
          maxDistance={20}
          minDistance={5}
        />
      </Suspense>
    </Canvas>
  );
}
